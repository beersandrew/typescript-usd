// Ported from OpenUSD 26.11.1: pxr/exec/exec/runtime.cpp,
//  pxr/exec/exec/runtime.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/runtime.h and runtime.cpp.
//
// The executor templates are constructed with their template arguments as
// constructor arguments (header of pxr/exec/vdf/src/dataManagerBasedExecutor.ts).
// The main executor is the single-threaded configuration of runtime.cpp:61-70;
// the parallel configuration fails loudly. The destructor (runtime.cpp:73) is
// Destroy(), which destroys the owned executors in reverse member order.

import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'

import { EfMaskedSubExecutor } from 'typescript-usd/ef'
import { EfPageCacheExecutor } from 'typescript-usd/ef'
import { EfPageCacheStorage } from 'typescript-usd/ef'
import { EfTime, EfTimeType } from 'typescript-usd/ef'
import type { EfTimeInputNode } from 'typescript-usd/ef'
import type { EfLeafNodeCache } from 'typescript-usd/ef'
import type { EfTimeInterval } from 'typescript-usd/ef'
import { VdfDataManagerFacade } from 'typescript-usd/vdf'
import { VdfDataManagerHashTable } from 'typescript-usd/vdf'
import {
  VdfDataManagerDeallocationMode, VdfDataManagerVector,
} from 'typescript-usd/vdf'
import { VdfExecutorErrorLogger } from 'typescript-usd/vdf'
import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfPullBasedExecutorEngine } from 'typescript-usd/vdf'
import type { VdfRequest } from 'typescript-usd/vdf'
import type { VdfSchedule } from 'typescript-usd/vdf'
import { VdfSubExecutor } from 'typescript-usd/vdf'
import { VdfTypedVector } from 'typescript-usd/vdf'
import { VdfIsParallelEvaluationEnabled } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'

import { ExecTypeRegistry } from './typeRegistry.ts'

/**
 * Owns the main executor and related data structures for managing computed
 * and cached values (runtime.h:32-132).
 */
export class Exec_Runtime {
  private _executor: VdfExecutorInterface
  private _executorTopologicalStateVersion: number
  private readonly _cacheStorage: EfPageCacheStorage
  private _overridesExecutor: EfMaskedSubExecutor | null = null
  private _overridesExecutorNetworkVersion = 0

  /** runtime.cpp:40-71 */
  constructor(timeNode: EfTimeInputNode, leafNodeCache: EfLeafNodeCache) {
    this._executorTopologicalStateVersion = 0

    // Create a cache for time-varying computed values, indexed by time.
    this._cacheStorage = EfPageCacheStorage.new<EfTime>(
      EfTimeType,
      new VdfMaskedOutput(timeNode.GetOutput(), VdfMask.allOnes(1)),
      leafNodeCache)

    // Create a multi-threaded main executor, if parallel evaluation is
    // enabled.
    if (VdfIsParallelEvaluationEnabled()) {
      // PLATFORM-DIVERGENCE(openexec-parallel): EfPageCacheExecutor<
      // VdfParallelExecutorEngine, VdfParallelDataManagerVector>
      // (runtime.cpp:53-59) -> port the parallel executor engine and data
      // manager.
      TF_CODING_ERROR(
        'Exec_Runtime (pxr/exec/exec/runtime.cpp:53-59): the parallel ' +
        'executor engine is not ported; disable ' +
        'VDF_ENABLE_PARALLEL_EVALUATION_ENGINE')
      throw new Error(
        'Exec_Runtime: VdfParallelExecutorEngine is not ported (openexec-parallel)')
    }

    // Create a single-threaded main executor, if parallel evaluation is
    // disabled.
    this._executor = new EfPageCacheExecutor(
      VdfPullBasedExecutorEngine,
      VdfDataManagerVector.of(VdfDataManagerDeallocationMode.Background),
      this._cacheStorage)
  }

  /**
   * ~Exec_Runtime (runtime.cpp:73): destroys _overridesExecutor, then
   * _executor (reverse member order; _cacheStorage has no observable
   * destructor).
   */
  destroy(): void {
    this._overridesExecutor?.destroy()
    this._overridesExecutor = null
    this._executor.destroy()
  }

  /**
   * Returns a facade of the main executor's data manager, providing read
   * access to previously computed and cached values (runtime.cpp:75-79).
   */
  getDataManager(): VdfDataManagerFacade {
    return new VdfDataManagerFacade(this._executor)
  }

  /**
   * Sets the time on the executor data manager (runtime.cpp:81-111). Returns
   * whether the time has changed relative to the previously set time, along
   * with the previous time value. This does not perform time invalidation on
   * the executor.
   */
  SetTime(timeNode: EfTimeInputNode, time: EfTime): [boolean, EfTime] {
    const timeOutput = timeNode.GetOutput()!
    const timeMask = VdfMask.allOnes(1)

    // Retrieve the old time vector from the executor data manager. If there
    // isn't already a time value stored in the executor data manager, perform
    // first time initialization and return. In this case, we don't consider
    // time as having changed.
    const oldTimeVector = this._executor.getOutputValue(timeOutput, timeMask)
    if (!oldTimeVector) {
      this._executor.setOutputValue(
        timeOutput, new VdfTypedVector<EfTime>(EfTimeType, time), timeMask)
      return [false, new EfTime()]
    }

    // Get the old time value from the vector. If there is no change in time,
    // we can return without setting the new time value.
    const oldTime = new EfTime(
      oldTimeVector.getReadAccessor<EfTime>(EfTimeType).Get(0))
    if (oldTime.Equals(time)) {
      return [false, oldTime]
    }

    // Set the new time value and return.
    this._executor.setOutputValue(
      timeOutput, new VdfTypedVector<EfTime>(EfTimeType, time), timeMask)
    return [true, oldTime]
  }

  /**
   * Explicitly invalidates all executor state that depends on the topology
   * of the data-flow network (runtime.cpp:113-117).
   */
  invalidateTopologicalState(): void {
    this._executor.invalidateTopologicalState()
  }

  /**
   * Invalidates the computed output values in the `invalidationRequest`,
   * along with all values that depend on these outputs
   * (runtime.cpp:119-142).
   */
  invalidateExecutor(invalidationRequest: readonly VdfMaskedOutput[]): void {
    if (invalidationRequest.length === 0) {
      return
    }

    // Get the current network version.
    const network = invalidationRequest[0]!.GetOutput()!.getNode().getNetwork()
    const networkVersion = network.getVersion()

    // If the last recorded network version is different from the current
    // network version, we need to make sure to invalidate the main executor's
    // topological state before invalidating values.
    if (networkVersion !== this._executorTopologicalStateVersion) {
      this._executor.invalidateTopologicalState()
      this._executorTopologicalStateVersion = networkVersion
    }

    // Invalidate values on the main executor.
    this._executor.invalidateValues(invalidationRequest)
  }

  /**
   * Invalidates the time-varying computed values in the
   * `invalidationRequest` over the provided `timeInterval`, along with all
   * dependent values (runtime.cpp:144-155).
   */
  invalidatePageCache(
    invalidationRequest: readonly VdfMaskedOutput[],
    timeInterval: EfTimeInterval,
  ): void {
    this._cacheStorage.invalidate(
      (cacheKey: VdfVector) => {
        const time = cacheKey.getReadAccessor<EfTime>(EfTimeType).Get(0)
        return timeInterval.contains(time)
      },
      [...invalidationRequest])
  }

  /** Deletes all of `node`'s computed and cached values (runtime.cpp:157-165). */
  deleteData(node: VdfNode): void {
    for (const [, output] of node.getOutputsIterator()) {
      this._executor.clearDataForOutput(output.getId(), node.getId())
    }

    this._cacheStorage.willDeleteNode(node)
  }

  /**
   * Performs evaluation with the provided `schedule` and `computeRequest` and
   * caches all computed values (runtime.cpp:167-198).
   */
  computeValues(schedule: VdfSchedule, computeRequest: VdfRequest): void {
    // If the schedule does not have a network, then we cannot compute
    // anything. This happens when we compute an ExecRequest that only contains
    // empty leaf outputs.
    const network = schedule.getNetwork()
    if (!network) {
      return
    }

    // Make sure that the cache storage is large enough to hold all possible
    // computed values in the network.
    this._cacheStorage.resize(network)

    // Run the executor to compute the values.
    const errorLogger = new VdfExecutorErrorLogger()
    this._executor.run(schedule, computeRequest, errorLogger)

    // Increment the executor's invalidation timestamp after each run. All
    // executor invalidation after this call will pick up the new timestamp,
    // ensuring that mung-buffer locking will take hold at invalidation edges.
    this._executor.incrementExecutorInvalidationTimestamp()

    // Report any errors or warnings surfaced during this executor run.
    this._reportExecutorErrors(errorLogger)
  }

  /**
   * Performs evaluation with the provided `schedule` and `computeRequest`
   * using a temporary subexecutor that is initialized with the provided
   * overrides (runtime.cpp:200-303). The output at index i in
   * `overriddenOutputs` assumes the value at index i in `overriddenValues`.
   * Returns the subexecutor used for evaluation, which stores the results of
   * the computation, or null on error.
   */
  computeWithOverrides(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    overriddenOutputs: readonly VdfMaskedOutput[],
    overriddenValues: readonly VtValue[],
  ): VdfExecutorInterface | null {
    // This function requires that each overridden output has a corresponding
    // override value.
    if (!TF_VERIFY(overriddenOutputs.length === overriddenValues.length,
      'overriddenOutputs.size() == overriddenValues.size()')) {
      return null
    }

    const network = schedule.getNetwork()
    if (!TF_VERIFY(network, 'network')) {
      return null
    }

    // Create a masked sub-executor that will be used for every call to
    // ComputeWithOverrides. This dataless executor maintains a mask of
    // outputs that are invalid (due to the overrides) without affecting the
    // main executor. It is the parent of the temporary executor created for
    // only this call, and since that executor is returned to the caller, we
    // persist the parent executor so that its lifetime extends beyond this
    // function call.
    if (!this._overridesExecutor) {
      this._overridesExecutor = new EfMaskedSubExecutor(this._executor)
      this._overridesExecutorNetworkVersion = network!.getVersion()
    } else {
      // Clear the cached invalidation state in the masked sub-executor. This
      // effectively marks every output as valid, setting us up for the call
      // to InvalidateValues on the sub-executor below.
      this._overridesExecutor.clearData()

      // If the network has changed since the masked sub-executor was last
      // used, clear its topological state so that it won't use stale caches
      // (e.g., the replay cache) when we call InvalidateValues below.
      const newNetworkVersion = network!.getVersion()
      if (newNetworkVersion !== this._overridesExecutorNetworkVersion) {
        this._overridesExecutor.invalidateTopologicalState()
        this._overridesExecutorNetworkVersion = newNetworkVersion
      }
    }

    // Create a temporary executor only used for this call. Overridden values,
    // and computation results that depend on overridden values are stored in
    // this sub-executor, as to avoid overwriting values in the main executor.
    let subExecutor: VdfExecutorInterface
    if (VdfIsParallelEvaluationEnabled() && !schedule.isSmallSchedule()) {
      // PLATFORM-DIVERGENCE(openexec-parallel): VdfSubExecutor<
      // VdfParallelExecutorEngine, VdfParallelDataManagerVector>
      // (runtime.cpp:259-263) -> port the parallel executor engine and data
      // manager.
      TF_CODING_ERROR(
        'Exec_Runtime::ComputeWithOverrides (pxr/exec/exec/runtime.cpp:' +
        '259-263): the parallel executor engine is not ported')
      throw new Error(
        'Exec_Runtime::ComputeWithOverrides: VdfParallelExecutorEngine is ' +
        'not ported (openexec-parallel)')
    } else {
      subExecutor = new VdfSubExecutor(
        VdfPullBasedExecutorEngine, VdfDataManagerHashTable, this._overridesExecutor)
    }

    // Apply the overridden values.
    for (let i = 0; i < overriddenOutputs.length; ++i) {
      const maskedOutput = overriddenOutputs[i]!
      if (!TF_VERIFY(maskedOutput.asBool(), 'maskedOutput')) {
        continue
      }

      // Set the override value in the sub-executor.
      subExecutor.setOutputValue(
        maskedOutput.GetOutput()!,
        ExecTypeRegistry.GetInstance().createVector(overriddenValues[i]!),
        maskedOutput.GetMask())
    }

    // Invalidate all overridden outputs, and outputs dependent on overridden
    // outputs. Note that invalidation is handled by the masked overrides
    // executor, not the subexecutor.
    this._overridesExecutor.invalidateValues(overriddenOutputs)

    // Compute the requested values on the subexecutor.
    const errorLogger = new VdfExecutorErrorLogger()
    subExecutor.run(schedule, computeRequest, errorLogger)
    this._reportExecutorErrors(errorLogger)

    return subExecutor
  }

  // Reports any executor errors raised during evaluation
  // (runtime.cpp:305-326).
  private _reportExecutorErrors(errorLogger: VdfExecutorErrorLogger): void {
    const warnings = errorLogger.getWarnings()
    if (warnings.size === 0) {
      return
    }

    for (const [node, error] of warnings) {
      if (!TF_VERIFY(node, 'node')) {
        continue
      }

      TF_WARN(`Node: '${node.getDebugName()}'. Exec Warning: ${error}`)
    }
  }
}
