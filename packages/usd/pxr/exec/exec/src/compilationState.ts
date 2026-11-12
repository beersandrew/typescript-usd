// Ported from OpenUSD 26.11.1: pxr/exec/exec/compilationState.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compilationState.h.
//
// Exec_CompilationState::TaskSyncAccess (compilationState.h:77-96) extends
// access to the task syncs to its friends Exec_CompilationTask and
// Exec_InterruptState. TypeScript has no friends, so its three accessors are
// @internal methods of the state with the same names.

import { TF_VERIFY } from 'typescript-usd/tf'
import type { WorkDispatcher } from 'typescript-usd/work'

import type { EsfStage } from 'typescript-usd/esf'

import type { Exec_CompilationTaskType } from './compilationTask.ts'
import {
  Exec_CycleDetectingTaskSync, Exec_InputRecompilationTaskSync,
  Exec_OutputProvidingTaskSync,
} from './compilerTaskSync.ts'
import { Exec_InterruptState } from './interruptState.ts'
import type { Exec_Program } from './program.ts'
import { Exec_TaskCycleDetector } from './taskCycleDetector.ts'

/**
 * Data shared between all compilation tasks (compilationState.h:27-111).
 *
 * We construct an instance of this class at the beginning of a round of
 * compilation and then pass along a reference to this instance to all
 * compilation tasks.
 */
export class Exec_CompilationState {
  private readonly _dispatcher: WorkDispatcher
  private readonly _stage: EsfStage
  private readonly _taskCycleDetector: Exec_TaskCycleDetector
  private readonly _interruptState: Exec_InterruptState
  private readonly _outputTasks: Exec_OutputProvidingTaskSync
  private readonly _inputRecompilationTasks: Exec_InputRecompilationTaskSync
  private readonly _cycleDetectingTasks: Exec_CycleDetectingTaskSync
  private readonly _program: Exec_Program

  /** compilationState.h:37-50 */
  constructor(dispatcher: WorkDispatcher, stage: EsfStage, program: Exec_Program) {
    this._dispatcher = dispatcher
    this._stage = stage
    this._taskCycleDetector = new Exec_TaskCycleDetector(this)
    this._interruptState = new Exec_InterruptState(this)
    this._outputTasks = new Exec_OutputProvidingTaskSync(dispatcher)
    this._inputRecompilationTasks = new Exec_InputRecompilationTaskSync(dispatcher)
    this._cycleDetectingTasks = new Exec_CycleDetectingTaskSync(dispatcher)
    this._program = program
    TF_VERIFY(this._program, '_program')
  }

  /**
   * The implicit destructor: destroys the members in reverse order, of which
   * only ~Exec_TaskCycleDetector is observable (taskCycleDetector.cpp:36-47).
   */
  destroy(): void {
    this._taskCycleDetector.destroy()
  }

  /** The dispatcher for running tasks. */
  getDispatcher(): WorkDispatcher {
    return this._dispatcher
  }

  /** The scene adapter stage. */
  getStage(): EsfStage {
    return this._stage
  }

  /** The program being compiled. */
  getProgram(): Exec_Program {
    return this._program
  }

  /** Gets object for tracking potential task cycles. */
  getTaskCycleDetector(): Exec_TaskCycleDetector {
    return this._taskCycleDetector
  }

  /** Gets the object for interrupting compilation. */
  getInterruptState(): Exec_InterruptState {
    return this._interruptState
  }

  /** @internal TaskSyncAccess::_GetOutputProvidingTaskSync (compilationState.h:82-85). */
  _getOutputProvidingTaskSync(): Exec_OutputProvidingTaskSync {
    return this._outputTasks
  }

  /** @internal TaskSyncAccess::_GetInputRecompilationTaskSync (compilationState.h:87-90). */
  _getInputRecompilationTaskSync(): Exec_InputRecompilationTaskSync {
    return this._inputRecompilationTasks
  }

  /** @internal TaskSyncAccess::_GetCycleDetectingTaskSync (compilationState.h:92-95). */
  _getCycleDetectingTaskSync(): Exec_CycleDetectingTaskSync {
    return this._cycleDetectingTasks
  }

  /**
   * Constructs and runs a new top-level compilation task
   * (compilationState.h:113-121). The task class is the second argument.
   */
  static newTask<Args extends unknown[]>(
    state: Exec_CompilationState,
    TaskType: Exec_CompilationTaskType<Args>,
    ...args: Args
  ): void {
    // Tasks manage their own lifetime, and destroy themselves after
    // completion.
    const task = new TaskType(state, ...args)
    state._dispatcher.run(() => task.call())
  }
}
