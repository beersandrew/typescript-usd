// Ported from OpenUSD 26.11.1: pxr/exec/exec/compilationTask.cpp,
//  pxr/exec/exec/compilationTask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compilationTask.h and
// compilationTask.cpp.
//
// The continuation-passing structure is upstream's: tasks run in phases,
// sleep while they have unfulfilled dependencies, and are re-run by the last
// fulfilled dependency. Tasks run on the round's WorkDispatcher
// (typescript-usd/work, docs/openexec-x1.md section 5). The atomic dependency
// count is a plain field.
//
// Mapping choices:
// - `operator()(int depth)` is `Call(depth)`. WorkDispatcher.Run receives a
//   closure that calls it (upstream passes std::ref(*task)).
// - `NewSubtask<TaskType>(state, args...)` takes the task class as its second
//   argument: `deps.NewSubtask(state, Exec_CycleDetectingTask, node)`.
// - `delete thisTask` becomes the task's _Destroy(), which keeps the
//   destructor's observable effect (Exec_TaskCycleDetector::DestroyTask).

import { TF_VERIFY } from 'typescript-usd/tf'
import type { WorkDispatcher } from 'typescript-usd/work'

import type { VdfInput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompilerTaskSyncBase } from './compilerTaskSyncBase.ts'
import type { Exec_OutputKey } from './outputKey.ts'

/** The constructor of a compilation task class, with its trailing arguments. */
export type Exec_CompilationTaskType<Args extends unknown[]> =
  new (compilationState: Exec_CompilationState, ...args: Args) => Exec_CompilationTask

// compilationTask.cpp:17-34
function _RunOrInvoke(
  dispatcher: WorkDispatcher,
  task: Exec_CompilationTask,
  depth: number,
): void {
  // We empirically determined a stack depth limit of 50 to preserve the
  // performance optimization gained from recursively invoking tasks, while
  // limiting growth of the stack space.
  if (depth < 50) {
    task.call(depth + 1)
  } else {
    dispatcher.run(() => task.call())
  }
}

/** Base class for parallel compilation tasks (compilationTask.h:27-102). */
export abstract class Exec_CompilationTask {
  /**
   * The parent task, if this is a sub-task. null for top-level tasks.
   * @internal Set by TaskDependencies.NewSubtask (compilationTask.h:209).
   */
  _parent: Exec_CompilationTask | null = null

  // Reference count denoting the number of unfulfilled dependencies.
  private _numDependents = 0

  /**
   * Current task phase.
   * @internal Advanced by TaskPhases (compilationTask.h:292).
   */
  _taskPhase = 0

  // State persistent to one round of compilation.
  private readonly _compilationState: Exec_CompilationState

  /**
   * All compilation tasks are heap allocated and must be constructed through
   * NewTask() and NewSubtask() (compilationTask.cpp:36-44).
   */
  protected constructor(compilationState: Exec_CompilationState) {
    this._compilationState = compilationState
    this._compilationState.getTaskCycleDetector().createTask()
  }

  // ~Exec_CompilationTask (compilationTask.cpp:46-49).
  private _destroy(): void {
    this._compilationState.getTaskCycleDetector().destroyTask()
  }

  /** Registers an additional dependency (compilationTask.cpp:51-57). */
  addDependency(): void {
    if (this._numDependents++ === 0) {
      this._compilationState.getTaskCycleDetector().blockTask()
    }
  }

  /**
   * Removes a dependency after it has been fulfilled, and returns the new
   * number of unfulfilled dependencies (compilationTask.cpp:59-68). The caller
   * is responsible for re-running the task when this returns 0.
   */
  removeDependency(): number {
    const numDependents = --this._numDependents
    if (numDependents === 0) {
      this._compilationState.getTaskCycleDetector().unblockTask()
    }
    return numDependents
  }

  /**
   * Executes the task (operator(), compilationTask.cpp:70-165). The caller
   * adds 1 to `depth` to track the depth of recursive invocations.
   */
  call(depth = 0): void {
    const thisTask = this

    // The thread is busy while it's executing this function.
    const detector = thisTask._compilationState.getTaskCycleDetector()
    detector.beginThreadBusy()
    try {
      // Register an additional dependency while this task is running. This
      // ensures that if sub-tasks complete while this task is still running,
      // the last completed sub-task will not re-run this task and cause it to
      // be re-entrant before we get to the end of this method.
      thisTask.addDependency()

      // Execute the task, either by invoking its _Compile method, or its
      // _Interrupt method, and record the task we are told to run next.
      const nextTask = ((): Exec_CompilationTask | null => {
        // If compilation was interrupted, run the _Interrupt callback for the
        // task. There is no next task.
        if (thisTask._compilationState.getInterruptState().wasInterrupted()) {
          thisTask._interrupt(thisTask._compilationState)
          return null
        }

        // Otherwise, compilation is not interrupted. Run the _Compile
        // callback, which may spawn a subtask to be run as the next task.
        const taskPhases = new Exec_CompilationTask.TaskPhases(
          thisTask, thisTask._compilationState)
        thisTask._compile(thisTask._compilationState, taskPhases)
        return taskPhases._getNextTask()
      })()

      // Get the dispatcher for running subsequent tasks.
      const dispatcher = thisTask._compilationState.getDispatcher()

      // If a next task was returned, thisTask *did not* complete. In this case
      // there are additional phases to run, and one or more sub-tasks
      // constituting unfulfilled dependencies aren't done yet.
      if (nextTask) {
        // If the next task isn't thisTask, we are instructed to invoke a
        // specific sub-task (c.f., TBB scheduler bypass).
        if (nextTask !== thisTask) {
          _RunOrInvoke(dispatcher, nextTask, depth)
        }

        // Remove the dependency we added above to prevent re-entry. If we
        // happen to remove the last remaining dependency here, we are on the
        // hook to re-run this task.
        if (thisTask.removeDependency() === 0) {
          _RunOrInvoke(dispatcher, thisTask, depth)
        }
        return
      }

      // If the task *did* complete, and it is a sub-task, we need to remove
      // one dependency from the parent task.
      const parent = thisTask._parent
      if (parent) {
        // If we remove the last unfulfilled dependency from the parent task,
        // the parent is ready to re-run. We're responsible for making that
        // happen here.
        if (parent.removeDependency() === 0) {
          _RunOrInvoke(dispatcher, parent, depth)
        }
      }

      // The task is complete. The task cycle detector expects all tasks to be
      // unblocked before they are destroyed, so here we remove the dependency
      // added to prevent re-entry. It should be the only dependency.
      TF_VERIFY(thisTask.removeDependency() === 0,
        'thisTask->RemoveDependency() == 0')

      // The task just completed, and tasks manage their own lifetime.
      thisTask._destroy()
    } finally {
      detector.endThreadBusy()
    }
  }

  /**
   * Main entry point of a compilation task to be implemented in the derived
   * class (compilationTask.h:64-76).
   */
  protected abstract _compile(
    compilationState: Exec_CompilationState,
    taskPhases: Exec_CompilationTask.TaskPhases): void

  /**
   * Compilation tasks implement this method to define their behavior when the
   * compilation process is interrupted (compilationTask.h:78-88).
   */
  protected abstract _interrupt(compilationState: Exec_CompilationState): void

  /** @internal Lets TaskDependencies read the task's compilation state. */
  _getCompilationState(): Exec_CompilationState {
    return this._compilationState
  }
}

export namespace Exec_CompilationTask {
  /**
   * Manages the task dependencies established during task phases
   * (compilationTask.h:104-197).
   */
  export class TaskDependencies {
    private readonly _task: Exec_CompilationTask
    private readonly _compilationState: Exec_CompilationState
    private _nextSubtask: Exec_CompilationTask | null = null
    private _hasDependencies = false

    /** @internal Constructed by TaskPhases (compilationTask.h:175-182). */
    constructor(task: Exec_CompilationTask, compilationState: Exec_CompilationState) {
      this._task = task
      this._compilationState = compilationState
    }

    /**
     * Constructs and runs a new subtask and establishes the subtask as a
     * dependency of the calling task (compilationTask.h:199-219). The calling
     * task's _Compile method will automatically be re-executed once all
     * dependencies have been fulfilled.
     */
    newSubtask<Args extends unknown[]>(
      state: Exec_CompilationState,
      TaskType: Exec_CompilationTaskType<Args>,
      ...args: Args
    ): void {
      this._hasDependencies = true

      // Tasks manage their own lifetime, and destroy themselves after
      // completion.
      const subTask = new TaskType(state, ...args)
      subTask._parent = this._task
      subTask._parent.addDependency()

      // If there is already a next sub-task recorded, run it now! Then record
      // this new subtask as the one to run next. This will ensure that the
      // last sub-task is the one eventually returned by _GetNextSubtask().
      const nextSubtask = this._nextSubtask
      if (nextSubtask) {
        state.getDispatcher().run(() => nextSubtask.call())
      }
      this._nextSubtask = subTask
    }

    /**
     * Claims the Exec_OutputProvidingCompilationTask that populates the
     * output for `key` in the Exec_CompiledOutputCache
     * (compilationTask.cpp:167-178). Returns true if the caller must spawn
     * the task.
     */
    claimOutputProvidingTask(key: Exec_OutputKey.Identity): boolean {
      const result = this._compilationState._getOutputProvidingTaskSync()
        .claim(key, this._task)
      if (result === Exec_CompilerTaskSyncBase.ClaimResult.Wait) {
        this._hasDependencies = true
      }
      return result === Exec_CompilerTaskSyncBase.ClaimResult.Claimed
    }

    /**
     * Claims the Exec_CycleDetectingTask that traverses upwards from `node`
     * (compilationTask.cpp:180-191).
     */
    claimCycleDetectingTask(node: VdfNode): boolean {
      const result = this._compilationState._getCycleDetectingTaskSync()
        .claim(node, this._task)
      if (result === Exec_CompilerTaskSyncBase.ClaimResult.Wait) {
        this._hasDependencies = true
      }
      return result === Exec_CompilerTaskSyncBase.ClaimResult.Claimed
    }

    /**
     * Establishes a dependency on the recompilation of `input`
     * (compilationTask.cpp:193-203).
     */
    waitOnInputRecompilationTask(input: VdfInput): void {
      const result = this._compilationState._getInputRecompilationTaskSync()
        .waitOn(input, this._task)
      if (result === Exec_CompilerTaskSyncBase.WaitResult.Wait) {
        this._hasDependencies = true
      }
    }

    /** compilationTask.cpp:205-211 */
    markDoneOutputProvidingTask(key: Exec_OutputKey.Identity): void {
      this._compilationState._getOutputProvidingTaskSync().markDone(key)
    }

    /** compilationTask.cpp:213-219 */
    markDoneInputRecompilationTask(input: VdfInput): void {
      this._compilationState._getInputRecompilationTaskSync().markDone(input)
    }

    /** compilationTask.cpp:221-227 */
    markDoneCycleDetectingTask(node: VdfNode): void {
      this._compilationState._getCycleDetectingTaskSync().markDone(node)
    }

    /** @internal compilationTask.h:184-186 */
    _HasDependencies(): boolean {
      return this._hasDependencies
    }

    /** @internal compilationTask.h:188-190 */
    _getNextSubtask(): Exec_CompilationTask | null {
      return this._nextSubtask
    }
  }

  /**
   * Manages the callables associated with task phases
   * (compilationTask.h:221-310).
   *
   * Sequentially advances through phases, putting the task to "sleep" between
   * phases while there are unfulfilled dependencies, and then automatically
   * re-executing the _Compile method with the next phase once all
   * dependencies have been fulfilled.
   */
  export class TaskPhases {
    private readonly _task: Exec_CompilationTask
    private readonly _compilationState: Exec_CompilationState
    private _nextTask: Exec_CompilationTask | null = null

    /**
     * @internal Constructed by Exec_CompilationTask.Call
     * (compilationTask.h:240-248). The phase counter is the task's
     * `_taskPhase` field (upstream holds a reference to it).
     */
    constructor(task: Exec_CompilationTask, compilationState: Exec_CompilationState) {
      this._task = task
      this._compilationState = compilationState
    }

    /** Invokes the callables in order, each denoting a task phase. */
    invoke(...callables: Array<(deps: TaskDependencies) => void>): void {
      this._nextTask = this._invokeOnePhase(0, callables)
    }

    // compilationTask.h:269-310: the variadic recursion over callables is a
    // loop over the array.
    private _invokeOnePhase(
      start: number,
      callables: ReadonlyArray<(deps: TaskDependencies) => void>,
    ): Exec_CompilationTask | null {
      for (let i = start; i < callables.length; ++i) {
        // If this is the active stage, invoke the callable.
        if (i >= this._task._taskPhase) {
          // Construct the TaskDependencies instance and invoke the callable.
          const taskDependencies =
            new TaskDependencies(this._task, this._compilationState)
          callables[i]!(taskDependencies)

          // Advance to the next stage.
          ++this._task._taskPhase

          // If dependencies were established, return here and put the task to
          // "sleep" until the last fulfilled dependency re-runs it, starting
          // at the next phase. Return the next sub-task to invoke
          // immediately; if there are no recorded sub-tasks, but this task is
          // incomplete and must continue, return this task instead.
          if (taskDependencies._HasDependencies()) {
            const nextSubtask = taskDependencies._getNextSubtask()
            return nextSubtask ? nextSubtask : this._task
          }
        }
      }

      // Returning null here indicates the task is complete, and there is no
      // next task to run (compilationTask.h:269-276).
      return null
    }

    /** @internal compilationTask.h:258-260 */
    _getNextTask(): Exec_CompilationTask | null {
      return this._nextTask
    }
  }
}
