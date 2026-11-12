// Ported from OpenUSD 26.11.1: pxr/exec/exec/taskCycleDetector.cpp,
//  pxr/exec/exec/taskCycleDetector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/taskCycleDetector.h and
// taskCycleDetector.cpp.
//
// JavaScript runs one thread, so tbb::enumerable_thread_specific<_ThreadData>
// is a single _ThreadData, and the 64-bit packed atomic counter of busy
// threads and unblocked tasks (taskCycleDetector.h:146-180) is a pair of plain
// fields that are always updated together. The counts and the detection rule
// are upstream's: a cycle exists when the last busy scope ends with no busy
// threads, no unblocked tasks and at least one blocked task.

import {
  Error as TfError, TF_VERIFY, TfDiagnosticMgr, TfDiagnosticType,
} from 'typescript-usd/tf'

import type { Exec_CompilationState } from './compilationState.ts'
import { ExecValidationErrorType } from './validationError.ts'

// Each thread maintains counters which are flushed to the shared counters
// after executing a block of tasks (taskCycleDetector.h:126-137).
interface _ThreadData {
  blockedTasks: number
  unblockedTasks: number
  // Number of nested BeginThreadBusy/EndThreadBusy sections for the thread.
  nestedBusy: number
}

/**
 * TF_ERROR(ExecValidationErrorType::DataDependencyCycle, ...)
 * (taskCycleDetector.cpp:113-116). TfError's constructor in base/tf takes no
 * diagnostic code, so the code is set on the error before it is posted; the
 * error is a runtime error as TF_ERROR's are (diagnostic.h:283-290).
 */
function _PostValidationError(
  code: ExecValidationErrorType, codeString: string, message: string): void {
  const error = new TfError(message, TfDiagnosticType.RuntimeError)
  Object.defineProperty(error, 'code', { value: code })
  Object.defineProperty(error, 'codeString', { value: codeString })
  TfDiagnosticMgr.GetInstance().postError(error)
}

/**
 * Detects when Exec_CompilationTasks are blocked by a task cycle
 * (taskCycleDetector.h:22-46).
 *
 * The detector maintains counters for the number of tasks that are blocked
 * and unblocked. If there remain any blocked tasks after all unblocked tasks
 * have executed, then at least one task cycle must exist among the blocked
 * tasks.
 */
export class Exec_TaskCycleDetector {
  // The cycle detector needs a back-pointer to the compilation state, so that
  // it can interrupt compilation when a cycle is detected.
  private readonly _compilationState: Exec_CompilationState

  // Set to true once a cycle has been detected.
  private _isCycleDetected = false

  // Thread-local counters (one thread).
  private readonly _threadData: _ThreadData = {
    blockedTasks: 0, unblockedTasks: 0, nestedBusy: 0,
  }

  // Shared counters (taskCycleDetector.h:146-180, 193-195).
  private _busyThreads = 0
  private _unblockedTasks = 0
  private _blockedTasks = 0

  /** taskCycleDetector.cpp:30-34 */
  constructor(compilationState: Exec_CompilationState) {
    this._compilationState = compilationState
  }

  /**
   * ~Exec_TaskCycleDetector (taskCycleDetector.cpp:36-47): once all tasks
   * have completed, all counters should be 0. Called by
   * Exec_CompilationState.Destroy at the end of a round of compilation.
   */
  destroy(): void {
    const busyThreads = this._busyThreads
    const unblockedTasks = this._unblockedTasks
    const blockedTasks = this._blockedTasks
    TF_VERIFY(
      busyThreads === 0 && blockedTasks === 0 && unblockedTasks === 0,
      'busyThreads == 0 && blockedTasks == 0 && unblockedTasks == 0',
      `Counts are not all 0: Busy threads=${busyThreads}, ` +
      `Blocked Tasks=${blockedTasks}, Unblocked Tasks=${unblockedTasks}`)
  }

  /**
   * Declares that the calling thread is now busy executing tasks
   * (taskCycleDetector.cpp:49-63).
   */
  beginThreadBusy(): void {
    const threadData = this._threadData

    // If this is a nested call to BeginThreadBusy, then the thread is already
    // busy.
    if (++threadData.nestedBusy > 1) {
      return
    }

    // This thread is now busy.
    this._busyThreads += 1
    threadData.blockedTasks = 0
    threadData.unblockedTasks = 0
  }

  /**
   * Declares that the calling thread has completed executing tasks, and
   * performs cycle detection if the caller is the last busy thread
   * (taskCycleDetector.cpp:65-124).
   */
  endThreadBusy(): void {
    const threadData = this._threadData

    // If this is a nested call to EndThreadBusy, then the thread is still
    // busy.
    if (--threadData.nestedBusy > 0) {
      return
    }

    // This thread is no longer busy. First, flush the number of blocked tasks
    // accumulated by this thread.
    this._blockedTasks += threadData.blockedTasks

    // Next, decrement the number of busy threads, while also flushing the
    // number of unblocked tasks accumulated by this thread.
    const prevBusyThreads = this._busyThreads
    const prevUnblockedTasks = this._unblockedTasks
    this._busyThreads += -1
    this._unblockedTasks += threadData.unblockedTasks

    // Get the current numbers of busy threads and unblocked tasks.
    const busyThreads = prevBusyThreads - 1
    const unblockedTasks = prevUnblockedTasks + threadData.unblockedTasks

    // If there remain any busy threads or unblocked tasks, then the task graph
    // is capable of making further progress, and it's too early to check for
    // task cycles.
    if (busyThreads !== 0 || unblockedTasks !== 0) {
      return
    }

    // The task graph is incapable of making further progress. If no tasks are
    // blocked, then all work has completed.
    const blockedTasks = this._blockedTasks
    if (blockedTasks === 0) {
      return
    }

    // There remains at least one blocked task, so there must be a task cycle.
    const wasCycleAlreadyDetected = this._isCycleDetected
    this._isCycleDetected = true
    TF_VERIFY(!wasCycleAlreadyDetected, '!wasCycleAlreadyDetected')

    _PostValidationError(ExecValidationErrorType.DataDependencyCycle,
      'ExecValidationErrorType::DataDependencyCycle',
      'Interrupting exec compilation due to one or more data dependency ' +
      'cycles. Computed values may not be accurate until the cycles are ' +
      'resolved.')

    this._compilationState.getInterruptState().interrupt()
  }

  /**
   * Returns an object that marks the thread busy until it is disposed
   * (taskCycleDetector.h:76-103). JavaScript has no destructors: callers end
   * the scope with Exec_TaskCycleDetector.BusyScope.Dispose, or use
   * `using`.
   */
  newBusyScope(): Exec_TaskCycleDetector.BusyScope {
    return new Exec_TaskCycleDetector.BusyScope(this)
  }

  /** Declares that a new task has been created (taskCycleDetector.cpp:126-131). */
  createTask(): void {
    ++this._threadData.unblockedTasks
  }

  /** Declares that a task has completed (taskCycleDetector.cpp:133-138). */
  destroyTask(): void {
    --this._threadData.unblockedTasks
  }

  /** taskCycleDetector.cpp:140-146 */
  blockTask(): void {
    ++this._threadData.blockedTasks
    --this._threadData.unblockedTasks
  }

  /** taskCycleDetector.cpp:148-154 */
  unblockTask(): void {
    ++this._threadData.unblockedTasks
    --this._threadData.blockedTasks
  }
}

export namespace Exec_TaskCycleDetector {
  /**
   * Calls BeginThreadBusy on construction and EndThreadBusy on disposal
   * (taskCycleDetector.h:76-96).
   */
  export class BusyScope {
    private _taskCycleDetector: Exec_TaskCycleDetector | null

    constructor(taskCycleDetector: Exec_TaskCycleDetector) {
      this._taskCycleDetector = taskCycleDetector
      taskCycleDetector.beginThreadBusy()
    }

    /** ~BusyScope: calls EndThreadBusy once. */
    dispose(): void {
      const detector = this._taskCycleDetector
      this._taskCycleDetector = null
      detector?.endThreadBusy()
    }

    [Symbol.dispose](): void {
      this.dispose()
    }
  }
}
