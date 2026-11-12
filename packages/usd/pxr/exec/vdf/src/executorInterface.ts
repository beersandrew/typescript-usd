// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorInterface.cpp,
//  pxr/exec/vdf/executorInterface.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorInterface.h and
// pxr/exec/vdf/executorInterface.cpp.
//
// Mapping notes:
// - The protected virtuals that upstream's friends call (VdfContext,
//   VdfIterator, VdfSpeculationNode, VdfPullBasedExecutorEngine,
//   VdfExecutorInvalidator; executorInterface.h:406-423) are public in TS
//   and keep their leading underscore: _GetInputValue,
//   _GetOutputValueForReading, _GetOutputValueForWriting,
//   _SetReferenceOutputValue, _TouchOutput, _IsOutputInvalid and
//   _InvalidateOutput.
// - The destructor (executorInterface.cpp:32-43) notifies observers; it is
//   kept as Destroy(), which owners call where C++ deletes the executor.
// - The interruption flag `const std::atomic_bool *` is an object with a
//   load() method, or null.
// - VdfExecutionStats is not ported (openexec-stats). Executors keep the
//   stats pointer; code that would log to non-null stats fails loudly.
// - _observersLock (a recursive mutex) is dropped (doc section 4, rule 7).

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import type { VdfExecutorFactoryBase } from './executorFactoryBase.ts'
import { VdfExecutorInvalidator } from './executorInvalidator.ts'
import type { VdfExecutorObserver } from './executorObserver.ts'
import type { VdfMask } from './mask.ts'
import type { VdfMaskedOutput } from './maskedOutput.ts'
import type { VdfNetwork } from './network.ts'
import type { VdfOutput } from './output.ts'
import type { VdfRequest } from './request.ts'
import type { VdfSchedule } from './schedule.ts'
import type { VdfVector } from './vector.ts'

/**
 * The `const std::atomic_bool *` interruption flag
 * (executorInterface.h:236-251): the executor only ever loads it.
 */
export interface VdfInterruptionFlag {
  load(): boolean
}

/**
 * VdfExecutionStats (executionStats.h) is not ported.
 * FAITHFULNESS-DEBT(openexec-stats): VdfExecutionStats and its processors
 * -> port executionStats.{h,cpp} and replace this opaque type with the class.
 */
export interface VdfExecutionStats {
  readonly __vdfExecutionStats: never
}

/**
 * VdfExecutorInterface (executorInterface.h:38-462): abstract base class for
 * classes that execute a VdfNetwork to compute a requested set of values.
 */
export abstract class VdfExecutorInterface {
  // executorInterface.h:427-429: the optional invalidator.
  private _invalidator: VdfExecutorInvalidator | null = null

  // executorInterface.h:433: externally provided execution stats.
  private _stats: VdfExecutionStats | null = null

  // executorInterface.h:436-437: the registered VdfExecutorObservers.
  private readonly _observers = new Set<VdfExecutorObserver>()

  // executorInterface.h:451: this executor's invalidation timestamp.
  private _executorInvalidationTimestamp = 0

  // executorInterface.h:454: the optional parent executor.
  private _parentExecutor: VdfExecutorInterface | null = null

  // executorInterface.h:457: the interruption flag.
  private _interruptionFlag: VdfInterruptionFlag | null = null

  /**
   * executorInterface.cpp:17-30: protected constructors, with or without a
   * parent executor.
   */
  protected constructor(parentExecutor: VdfExecutorInterface | null = null) {
    if (parentExecutor) {
      this.setParentExecutor(parentExecutor)
    }
  }

  /**
   * The destructor (executorInterface.cpp:32-43): notifies every registered
   * observer that this executor is being deleted.
   */
  destroy(): void {
    for (const observer of [...this._observers]) {
      observer._onExecutorDelete(this)
    }
  }

  /// \name Evaluation

  /**
   * Run (executorInterface.cpp:45-60). Executes the schedule, computing
   * `computeRequest` (a subset of the scheduled request) when given, and
   * schedule.GetRequest() otherwise.
   */
  run(schedule: VdfSchedule, errorLogger?: VdfExecutorErrorLogger | null): void
  run(schedule: VdfSchedule, computeRequest: VdfRequest,
    errorLogger?: VdfExecutorErrorLogger | null): void
  run(
    schedule: VdfSchedule,
    requestOrLogger?: VdfRequest | VdfExecutorErrorLogger | null,
    errorLogger: VdfExecutorErrorLogger | null = null): void {
    if (requestOrLogger === undefined || requestOrLogger === null ||
        !_IsRequest(requestOrLogger)) {
      this._run(schedule, schedule.getRequest(),
        (requestOrLogger as VdfExecutorErrorLogger | null | undefined) ?? null)
      return
    }
    this._run(schedule, requestOrLogger, errorLogger)
  }

  /// \name Factory Construction

  /** GetFactory (executorInterface.h:83). */
  abstract getFactory(): VdfExecutorFactoryBase

  /// \name Executor Observer Notification

  /** RegisterObserver (executorInterface.cpp:62-74). */
  registerObserver(observer: VdfExecutorObserver): void {
    // Only register the observer if it has not been registered before
    if (TF_VERIFY(!this._observers.has(observer), '_observers.count(observer) <= 0')) {
      this._observers.add(observer)
    }
  }

  /** UnregisterObserver (executorInterface.cpp:76-89). */
  unregisterObserver(observer: VdfExecutorObserver): void {
    // Only unregister the observer if has not already been unregistered
    if (TF_VERIFY(this._observers.has(observer), '_observers.count(observer) > 0')) {
      this._observers.delete(observer)
    }
  }

  /// \name Cache Management

  /** Resize the executor to accomodate data for the network (executorInterface.h:110). */
  resize(_network: VdfNetwork): void {}

  /** SetOutputValue (executorInterface.h:114-117). */
  abstract setOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): void

  /**
   * TakeOutputValue (executorInterface.h:125-128): transfers ownership of
   * `value` to `output`, returning true on success.
   */
  abstract takeOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): boolean

  /** GetOutputValue (executorInterface.h:134-138). */
  getOutputValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    return this._getOutputValueForReading(output, mask)
  }

  /** DuplicateOutputData (executorInterface.h:143-145). */
  abstract duplicateOutputData(sourceOutput: VdfOutput, destOutput: VdfOutput): void

  /// \name Executor Hierarchy Management

  /** GetParentExecutor (executorInterface.h:154-156). */
  getParentExecutor(): VdfExecutorInterface | null {
    return this._parentExecutor
  }

  /** SetParentExecutor (executorInterface.cpp:91-103). */
  setParentExecutor(parentExecutor: VdfExecutorInterface | null): void {
    this._parentExecutor = parentExecutor

    // Inherit the execution stats from the parent executor, if this executor
    // does not already have execution stats.
    if (parentExecutor && !this.getExecutionStats()) {
      this.setExecutionStats(parentExecutor.getExecutionStats())
    }
  }

  /// \name Invalidation

  /** InvalidateValues (executorInterface.cpp:105-155). */
  invalidateValues(invalidationRequest: readonly VdfMaskedOutput[]): void {
    // Bail out if the executor is still empty.
    if (this.IsEmpty()) {
      return
    }

    // Run invalidation pre-processing, which returns true if a new
    // invalidation request has been created.
    const processedInvalidationRequest: VdfMaskedOutput[] = []
    const didPreProcess = this._preProcessInvalidation(
      invalidationRequest, processedInvalidationRequest)

    // If pre-processing overrode the invalidation request, but the processed
    // request is empty, we can bail out without doing any invalidation.
    if (didPreProcess && processedInvalidationRequest.length === 0) {
      return
    }

    // Right before doing any invalidation traversal, update the current
    // invalidation timestamp.
    this._updateInvalidationTimestamp()

    // Construct a new invalidator if there isn't already one.
    if (!this._invalidator) {
      this._invalidator = new VdfExecutorInvalidator(this)
    }

    // Push through the actual invalidation.
    this._invalidator.invalidate(didPreProcess
      ? processedInvalidationRequest
      : invalidationRequest)
  }

  /** InvalidateTopologicalState (executorInterface.cpp:157-166). */
  invalidateTopologicalState(): void {
    // Reset the invalidator, if there is one.
    if (this._invalidator) {
      this._invalidator.Reset()
    }
  }

  /** ClearData (executorInterface.cpp:168-186). */
  clearData(): void {
    for (const observer of [...this._observers]) {
      observer._onExecutorClearData(this)
    }

    this._clearData()
  }

  /** ClearDataForOutput (executorInterface.cpp:193-199). */
  clearDataForOutput(outputId: number, nodeId: number): void {
    this._clearDataForOutput(outputId, nodeId)
  }

  /** IsEmpty (executorInterface.h:214). */
  abstract IsEmpty(): boolean

  /// \name Mung Buffer Locking Invalidation Timestamps

  /** IncrementExecutorInvalidationTimestamp (executorInterface.h:224-226). */
  incrementExecutorInvalidationTimestamp(): void {
    // VdfInvalidationTimestamp is an unsigned int (types.h:74).
    this._executorInvalidationTimestamp = (this._executorInvalidationTimestamp + 1) >>> 0
  }

  /** InheritExecutorInvalidationTimestamp (executorInterface.h:230-233). */
  inheritExecutorInvalidationTimestamp(executor: VdfExecutorInterface): void {
    this._executorInvalidationTimestamp = executor.getExecutorInvalidationTimestamp()
  }

  /** GetExecutorInvalidationTimestamp (executorInterface.h:237-239). */
  getExecutorInvalidationTimestamp(): number {
    return this._executorInvalidationTimestamp
  }

  /** HasInvalidationTimestampMismatch (executorInterface.h:245-247). */
  abstract hasInvalidationTimestampMismatch(source: VdfOutput, dest: VdfOutput): boolean

  /// \name Executor Interruption

  /** SetInterruptionFlag (executorInterface.h:256-258). */
  setInterruptionFlag(interruptionFlag: VdfInterruptionFlag | null): void {
    this._interruptionFlag = interruptionFlag
  }

  /** GetInterruptionFlag (executorInterface.h:262-264). */
  getInterruptionFlag(): VdfInterruptionFlag | null {
    return this._interruptionFlag
  }

  /** HasBeenInterrupted (executorInterface.h:270-272). */
  hasBeenInterrupted(): boolean {
    return this._interruptionFlag !== null && this._interruptionFlag.load()
  }

  /// \name Diagnostic Support

  /** SetExecutionStats (executorInterface.h:284-286). */
  setExecutionStats(stats: VdfExecutionStats | null): void {
    this._stats = stats
  }

  /** GetExecutionStats (executorInterface.h:290-292). */
  getExecutionStats(): VdfExecutionStats | null {
    return this._stats
  }

  /// Protected and friend-accessed API.

  /** _Run (executorInterface.h:309-312). */
  protected abstract _run(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null): void

  /** _GetInputValue (executorInterface.h:316-318). */
  abstract _getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null

  /** _GetOutputValueForReading (executorInterface.h:322-324). */
  abstract _getOutputValueForReading(output: VdfOutput, mask: VdfMask): VdfVector | null

  /** _GetOutputValueForWriting (executorInterface.h:328-329). */
  abstract _getOutputValueForWriting(output: VdfOutput): VdfVector | null

  /** _IsOutputInvalid (executorInterface.h:334-336). */
  abstract _isOutputInvalid(outputId: number, invalidationMask: VdfMask): boolean

  /**
   * _InvalidateOutput (executorInterface.h:345-347): returns true if there
   * was anything to invalidate and false if output was already invalid.
   */
  abstract _invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean

  /**
   * _PreProcessInvalidation (executorInterface.h:354-359): returns true if
   * `processedRequest` (filled by the callee) is to override
   * `invalidationRequest`.
   */
  protected _preProcessInvalidation(
    _invalidationRequest: readonly VdfMaskedOutput[],
    _processedRequest: VdfMaskedOutput[]): boolean {
    return false
  }

  /** _UpdateInvalidationTimestamp (executorInterface.h:365). */
  protected abstract _updateInvalidationTimestamp(): void

  /** _ClearData (executorInterface.cpp:188-191): a no-op by default. */
  protected _clearData(): void {}

  /** _ClearDataForOutput (executorInterface.cpp:201-206): a no-op by default. */
  protected _clearDataForOutput(_outputId: number, _nodeId: number): void {}

  /** _SetReferenceOutputValue (executorInterface.h:386-389). */
  abstract _setReferenceOutputValue(
    destOutput: VdfOutput, sourceOutput: VdfOutput, sourceMask: VdfMask): void

  /** _TouchOutput (executorInterface.h:395). */
  abstract _touchOutput(output: VdfOutput): void
}

// Distinguishes the two Run() overloads: a VdfExecutorErrorLogger has
// LogWarning, a VdfRequest does not.
function _IsRequest(value: VdfRequest | VdfExecutorErrorLogger): value is VdfRequest {
  return typeof (value as { LogWarning?: unknown }).LogWarning !== 'function'
}
