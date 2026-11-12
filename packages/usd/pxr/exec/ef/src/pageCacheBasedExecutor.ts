// Ported from OpenUSD 26.11.1: pxr/exec/ef/pageCacheBasedExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/pageCacheBasedExecutor.h.
//
// EfPageCacheBasedExecutor<EngineType, DataManagerType> follows the TS shape
// of the executor templates documented at the top of
// pxr/exec/vdf/src/dataManagerBasedExecutor.ts: the template arguments are
// constructor arguments that are types, given first:
//
//   new EfPageCacheExecutor(VdfPullBasedExecutorEngine,
//       VdfDataManagerVector.Of(VdfDataManagerDeallocationMode.Background),
//       cacheStorage)
//
// Upstream befriends this class from EfPageCacheStorage; the storage members
// it uses are public there and marked @internal.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfConnection } from 'typescript-usd/vdf'
import {
  VdfDataManagerBasedExecutor,
  type VdfDataManagerConcept,
  type VdfDataManagerType,
  type VdfExecutorEngine,
} from 'typescript-usd/vdf'
import type { VdfExecutorErrorLogger } from 'typescript-usd/vdf'
import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfRequest } from 'typescript-usd/vdf'
import type { VdfSchedule } from 'typescript-usd/vdf'
import type { VdfId } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'
import { Ef_LoftedOutputSet } from './loftedOutputSet.ts'
import {
  type Ef_OutputValueCache,
  Ef_OutputValueCache_ExclusiveAccess,
  Ef_OutputValueCache_SharedAccess,
} from './outputValueCache.ts'
import { EfPageCacheStorage } from './pageCacheStorage.ts'

/**
 * The engine API this executor uses: VdfPullBasedExecutorEngine::RunSchedule,
 * including the overload that invokes `callback` after evaluation of each
 * uncached output in the request, and right after hitting the cache for
 * cached outputs in the request (vdf/pullBasedExecutorEngine.h:91-110).
 */
export interface EfPageCacheBasedExecutorEngine extends VdfExecutorEngine {
  runSchedule(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null,
    callback?: (maskedOutput: VdfMaskedOutput, requestedIndex: number) => void): void
}

/**
 * The EngineType template template argument, bound to the data manager type
 * (`EngineType<DataManagerType> _engine(*this, &this->_dataManager)`).
 */
export type EfPageCacheBasedExecutorEngineType<DM> =
  new (executor: VdfExecutorInterface, dataManager: DM) => EfPageCacheBasedExecutorEngine

/**
 * EfPageCacheBasedExecutor (pageCacheBasedExecutor.h:40-141): executes a
 * VdfNetwork to compute a requested set of values. Caches the computed data
 * in an EfPageCacheStorage container and recalls existing data using a page
 * specified via the currently set value on the key output.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class EfPageCacheBasedExecutor<DM extends VdfDataManagerConcept<any>>
  extends VdfDataManagerBasedExecutor<DM> {
  /** The EngineType template argument. */
  protected readonly _engineType: EfPageCacheBasedExecutorEngineType<DM>

  // The executor engine.
  private readonly _engine: EfPageCacheBasedExecutorEngine

  // The page cache storage container.
  private readonly _cacheStorage: EfPageCacheStorage

  // The output value cache for the currently selected page.
  private _currentCache: Ef_OutputValueCache | null = null

  // The outputs which had their values sourced from the page cache during
  // evaluation (or getting of output values), kept in order to properly
  // invalidate them later.
  private readonly _loftedOutputs = new Ef_LoftedOutputSet()

  /** Constructor (pageCacheBasedExecutor.h:53-61). */
  protected constructor(
    engineType: EfPageCacheBasedExecutorEngineType<DM>,
    dataManagerType: VdfDataManagerType<DM>,
    cacheStorage: EfPageCacheStorage,
  ) {
    super(dataManagerType)
    this._engineType = engineType
    this._engine = new engineType(this, this._dataManager)
    this._cacheStorage = cacheStorage

    // The page cache storage container must always be valid.
    TF_VERIFY(this._cacheStorage, '_cacheStorage')
  }

  /**
   * Sets an output value (pageCacheBasedExecutor.h:145-162). Changes the
   * currently selected page in the page cache, if `output` is the key
   * output of the EfPageCacheStorage container.
   */
  override setOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): void {
    // Set the output value in the local data manager.
    super.setOutputValue(output, value, mask)

    // If the output is the key output, also set the currently selected page
    // in the page cache storage container.
    if (this._cacheStorage._isKeyOutput(output, mask)) {
      this._currentCache = this._cacheStorage._getOrCreateCache(value)
    }
  }

  /**
   * Removes any internal references to `node` upon deleting the node from
   * the VdfNetwork (pageCacheBasedExecutor.h:164-170).
   */
  willDeleteNode(node: VdfNode): void {
    this._loftedOutputs.removeAllOutputsForNode(node)
  }

  /**
   * Returns a value for the cache that flows across `connection`
   * (pageCacheBasedExecutor.h:172-190).
   */
  override _getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null {
    // First, look for the value in the local data manager.
    const value = this._dataManager.getInputValue(connection, mask)
    if (value) {
      return value
    }

    // Then, query the page cache storage.
    return this._getPageCacheValue(connection.getSourceOutput(), mask)
  }

  /** Returns an output value for reading (pageCacheBasedExecutor.h:192-212). */
  override _getOutputValueForReading(output: VdfOutput, mask: VdfMask): VdfVector | null {
    // First, look for the value in the local data manager.
    const value = this._dataManager.getOutputValueForReading(
      this._dataManager.getDataHandle(output.getId()), mask)
    if (value) {
      return value
    }

    // Then, query the page cache storage.
    return this._getPageCacheValue(output, mask)
  }

  /** Clears all data in the local data manager (pageCacheBasedExecutor.h:406-412). */
  protected override _clearData(): void {
    this._loftedOutputs.clear()
  }

  /** Runs the specified schedule (pageCacheBasedExecutor.h:214-274). */
  protected _run(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null,
  ): void {
    // If nothing has been requested, bail out early.
    if (computeRequest.IsEmpty()) {
      return
    }

    // Make sure the lofted node references array is sufficiently large.
    this._loftedOutputs.resize(schedule.getNetwork()!)

    // If caching is enabled, run the schedule with a callback that writes
    // each computed output value to the page cache.
    if (TF_VERIFY(this._currentCache, '_currentCache') && this._isCaching()) {
      const dataManager = this._dataManager
      const cacheableRequest = this._cacheStorage.getCacheableRequest(computeRequest)
      const cacheableView = new VdfRequest.IndexedView(cacheableRequest)
      const cache = this._currentCache!
      const storage = this._cacheStorage

      this._engine.runSchedule(
        schedule, computeRequest, errorLogger,
        (mo: VdfMaskedOutput, requestedIndex: number) => {
          // Lookup the value in the local data manager. This is the value to
          // store away in the page cache. Bail out if no such value exists,
          // or if the output is not cacheable.
          const value = dataManager.getOutputValueForReading(
            dataManager.getDataHandle(mo.GetOutput()!.getId()),
            mo.GetMask())
          if (!value || !cacheableView.Get(requestedIndex)) {
            return
          }

          // If the output has already been cached, bail out.
          {
            const access = new Ef_OutputValueCache_SharedAccess(cache)
            if (access.GetValue(mo.GetOutput()!, mo.GetMask())) {
              return
            }
          }

          // Attempt to cache the value in the page cache.
          const access = new Ef_OutputValueCache_ExclusiveAccess(cache)
          storage._commit(mo, value, access)
        })
    }

    // If caching is not enabled, run the schedule without a callback.
    else {
      this._engine.runSchedule(schedule, computeRequest, errorLogger)
    }
  }

  /**
   * Returns true if the values resulting from evaluation should be stored in
   * the page cache (pageCacheBasedExecutor.h:276-283).
   */
  private _isCaching(): boolean {
    return this._cacheStorage.isEnabled() &&
      !EfPageCacheStorage.hasReachedMemoryLimit()
  }

  /** Queries the page cache for a value (pageCacheBasedExecutor.h:285-320). */
  private _getPageCacheValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    // Only while a page is selected: external clients must never receive
    // values in the page cache.
    if (!this._currentCache) {
      return null
    }

    // Obtain shared read access to the current cache.
    const cacheAccess = new Ef_OutputValueCache_SharedAccess(this._currentCache)

    // Lookup the value in the current cache.
    const cachedValue = cacheAccess.GetValue(output, mask)
    if (cachedValue) {
      // Mark this output as having been lofted into the data manager. We
      // cannot return a cache hit if this fails.
      if (this._loftedOutputs.add(output, mask)) {
        // Touch the output, so that invalidation will be able to propagate
        // down in the network.
        this._touchOutput(output)

        // Return the cached value.
        return cachedValue
      }
    }

    // No value found.
    return null
  }

  /** Executor data invalidation (pageCacheBasedExecutor.h:322-342). */
  override _invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean {
    // Call into the base class for output invalidation.
    if (super._invalidateOutput(output, invalidationMask)) {
      // If some data has been invalidated, also remove the bits from the
      // lofted output.
      this._loftedOutputs.remove(
        output.getId(), output.getNode().getId(), invalidationMask)

      // Some data has been invalidated.
      return true
    }

    // Nothing has been invalidated.
    return false
  }

  /**
   * Pre-processes executor invalidation by augmenting the invalidation
   * request to also invalidate any lofted outputs
   * (pageCacheBasedExecutor.h:344-394).
   */
  protected override _preProcessInvalidation(
    invalidationRequest: readonly VdfMaskedOutput[],
    processedRequest: VdfMaskedOutput[],
  ): boolean {
    // Bail out, if there are no lofted outputs. Return false to indicate
    // that the originally supplied invalidationRequest shall be used.
    const numLoftedOutputs = this._loftedOutputs.getSize()
    if (numLoftedOutputs === 0) {
      return false
    }

    // Find all outputs depending on the originally supplied request.
    const deps = this._cacheStorage._findDependencies([...invalidationRequest])

    // If there are no dependent outputs, bail out.
    if (deps.size === 0) {
      return false
    }

    // If the invalidation request has not been augmented with lofted
    // outputs, use the originally supplied invalidationRequest instead.
    this._loftedOutputs.collectLoftedDependencies(deps, processedRequest)
    if (processedRequest.length === 0) {
      return false
    }

    // Otherwise, add all the outputs from the original invalidationRequest
    // to the new invalidation request, which now also contains all the
    // dependent lofted outputs.
    processedRequest.push(...invalidationRequest)

    // The invalidation request has been modified.
    return true
  }

  /** Clears data at a specified output (pageCacheBasedExecutor.h:396-404). */
  protected override _clearDataForOutput(outputId: VdfId, nodeId: VdfId): void {
    super._clearDataForOutput(outputId, nodeId)
    this._loftedOutputs.remove(outputId, nodeId, new VdfMask())
  }
}
