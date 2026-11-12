// Ported from OpenUSD 26.11.1: pxr/exec/vdf/evaluationState.cpp,
//  pxr/exec/vdf/evaluationState.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/evaluationState.h and
// evaluationState.cpp.

import { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfNode } from './node.ts'
import type { VdfSchedule } from './schedule.ts'

/**
 * The evaluation state of one executor run: the executor, the schedule and
 * the error logger (evaluationState.h:24).
 */
export class VdfEvaluationState {
  // The executor that created this object.
  private readonly _executor: VdfExecutorInterface

  // The current schedule.
  private readonly _schedule: VdfSchedule

  // The error logger.
  private readonly _errorLogger: VdfExecutorErrorLogger | null

  /** Constructor (evaluationState.h:30-37). */
  constructor(
    executor: VdfExecutorInterface,
    schedule: VdfSchedule,
    errorLogger: VdfExecutorErrorLogger | null,
  ) {
    this._executor = executor
    this._schedule = schedule
    this._errorLogger = errorLogger
  }

  /** The executor used for evaluation (evaluationState.h:41-43). */
  getExecutor(): VdfExecutorInterface {
    return this._executor
  }

  /** The schedule used for evaluation (evaluationState.h:47-49). */
  getSchedule(): VdfSchedule {
    return this._schedule
  }

  /** The executor error logger (evaluationState.h:53-55). */
  getErrorLogger(): VdfExecutorErrorLogger | null {
    return this._errorLogger
  }

  /**
   * Logs an execution warning to the executor error logger
   * (evaluationState.cpp:15-27).
   */
  LogWarning(node: VdfNode, warning: string): void {
    if (this._errorLogger) {
      this._errorLogger.LogWarning(node, warning)
    } else {
      VdfExecutorErrorLogger.issueDefaultWarning(node, warning)
    }
  }
}
