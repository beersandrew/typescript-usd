// Ported from OpenUSD 26.11.1: pxr/exec/ef/pageCacheSubExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/pageCacheSubExecutor.h.
//
// EfPageCacheSubExecutor<EngineType, DataManagerType> takes its template
// arguments as constructor arguments that are types (see the header of
// pxr/exec/vdf/src/dataManagerBasedExecutor.ts).

import type { VdfConnection } from 'typescript-usd/vdf'
import type {
  VdfDataManagerConcept,
  VdfDataManagerType,
} from 'typescript-usd/vdf'
import { VdfExecutorFactory } from 'typescript-usd/vdf'
import type { VdfExecutorFactoryBase } from 'typescript-usd/vdf'
import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import type { VdfMask } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfSubExecutor } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'
import {
  EfPageCacheBasedExecutor,
  type EfPageCacheBasedExecutorEngineType,
} from './pageCacheBasedExecutor.ts'
import type { EfPageCacheStorage } from './pageCacheStorage.ts'

// The factory shared amongst executors of one template instantiation
// (pageCacheSubExecutor.h:104-114), keyed by EngineType, then
// DataManagerType.
const _factories = new Map<Function, Map<Function, VdfExecutorFactoryBase>>()

// The static _factory of an executor template instantiation.
function _GetFactory(
  engineType: Function,
  dataManagerType: Function,
  newFactory: () => VdfExecutorFactoryBase,
): VdfExecutorFactoryBase {
  let byDataManager = _factories.get(engineType)
  if (byDataManager === undefined) {
    byDataManager = new Map()
    _factories.set(engineType, byDataManager)
  }
  let factory = byDataManager.get(dataManagerType)
  if (factory === undefined) {
    factory = newFactory()
    byDataManager.set(dataManagerType, factory)
  }
  return factory
}

/**
 * EfPageCacheSubExecutor (pageCacheSubExecutor.h:35-108): like
 * EfPageCacheExecutor, but stores its data in the given data manager
 * (hash-table upstream) and supports looking up output values on a parent
 * executor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EfPageCacheSubExecutor<DM extends VdfDataManagerConcept<any>>
  extends EfPageCacheBasedExecutor<DM> {
  /**
   * Constructor (pageCacheSubExecutor.h:60-62), and constructor with a
   * parent executor (pageCacheSubExecutor.h:116-124).
   */
  constructor(
    engineType: EfPageCacheBasedExecutorEngineType<DM>,
    dataManagerType: VdfDataManagerType<DM>,
    cacheStorage: EfPageCacheStorage,
    parentExecutor?: VdfExecutorInterface | null,
  ) {
    super(engineType, dataManagerType, cacheStorage)

    // Set the parent executor.
    if (parentExecutor !== undefined) {
      this.setParentExecutor(parentExecutor)
    }
  }

  /**
   * Factory construction (pageCacheSubExecutor.h:76-78): a
   * VdfExecutorFactory<VdfSubExecutor<EngineType, DataManagerType>,
   * VdfSpeculationExecutor<SpeculationEngineType, DataManagerType>>
   * (pageCacheSubExecutor.h:44-55).
   */
  getFactory(): VdfExecutorFactoryBase {
    const engineType = this._engineType
    const dataManagerType = this._dataManagerType
    return _GetFactory(engineType, dataManagerType, () =>
      // FAITHFULNESS-DEBT(openexec-speculation): pageCacheSubExecutor.h:46-54
      // binds VdfSpeculationExecutor<EngineType<T>::SpeculationExecutorEngine,
      // DataManagerType> -> port speculationExecutor.h and pass its
      // constructor as the factory's speculation function. Until then
      // ManufactureSpeculationExecutor posts a coding error and throws.
      new VdfExecutorFactory((parentExecutor) =>
        new VdfSubExecutor(engineType, dataManagerType, parentExecutor)))
  }

  /**
   * Returns a value for the cache that flows across `connection`
   * (pageCacheSubExecutor.h:126-141).
   */
  override _getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null {
    // Lookup the output value in the local data manager and page cache.
    const value = super._getInputValue(connection, mask)
    if (value) {
      return value
    }

    // If available, also check for the value in the parent executor.
    return this._getParentExecutorValue(connection.getSourceOutput(), mask)
  }

  /** Returns an output value for reading (pageCacheSubExecutor.h:143-158). */
  override _getOutputValueForReading(output: VdfOutput, mask: VdfMask): VdfVector | null {
    // Lookup the output value in the local data manager and page cache.
    const value = super._getOutputValueForReading(output, mask)
    if (value) {
      return value
    }

    // If available, also check for the value in the parent executor.
    return this._getParentExecutorValue(output, mask)
  }

  // pageCacheSubExecutor.h:160-170.
  private _getParentExecutorValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    const parentExecutor = this.getParentExecutor()
    return parentExecutor
      ? parentExecutor.getOutputValue(output, mask)
      : null
  }

  /** Clears all data in the local data manager (pageCacheSubExecutor.h:172-184). */
  protected override _clearData(): void {
    // Clear all the relevant data from the parent class.
    super._clearData()

    // If the data manager remains empty we can bail out.
    if (!this._dataManager.IsEmpty()) {
      this._dataManager.clear()
    }
  }
}
