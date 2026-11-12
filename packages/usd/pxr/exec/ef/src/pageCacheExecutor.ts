// Ported from OpenUSD 26.11.1: pxr/exec/ef/pageCacheExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/pageCacheExecutor.h.
//
// EfPageCacheExecutor<EngineType, DataManagerType> takes its template
// arguments as constructor arguments that are types (see the header of
// pxr/exec/vdf/src/dataManagerBasedExecutor.ts):
//
//   new EfPageCacheExecutor(VdfPullBasedExecutorEngine,
//       VdfDataManagerVector.Of(VdfDataManagerDeallocationMode.Background),
//       cacheStorage)

import type {
  VdfDataManagerConcept,
  VdfDataManagerType,
} from 'typescript-usd/vdf'
import { VdfExecutorFactory } from 'typescript-usd/vdf'
import type { VdfExecutorFactoryBase } from 'typescript-usd/vdf'
import { VdfSubExecutor } from 'typescript-usd/vdf'
import {
  EfPageCacheBasedExecutor,
  type EfPageCacheBasedExecutorEngineType,
} from './pageCacheBasedExecutor.ts'
import type { EfPageCacheStorage } from './pageCacheStorage.ts'

// The factory shared amongst executors of one template instantiation
// (pageCacheExecutor.h:79-87), keyed by EngineType, then DataManagerType.
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
 * EfPageCacheExecutor (pageCacheExecutor.h:33-83): executes a VdfNetwork to
 * compute a requested set of values, caching the computed data in an
 * EfPageCacheStorage container. This executor stores its data in the
 * output-member data manager.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EfPageCacheExecutor<DM extends VdfDataManagerConcept<any>>
  extends EfPageCacheBasedExecutor<DM> {
  /** Constructor (pageCacheExecutor.h:59-61). */
  constructor(
    engineType: EfPageCacheBasedExecutorEngineType<DM>,
    dataManagerType: VdfDataManagerType<DM>,
    cacheStorage: EfPageCacheStorage,
  ) {
    super(engineType, dataManagerType, cacheStorage)
  }

  /**
   * Factory construction (pageCacheExecutor.h:69-71): a
   * VdfExecutorFactory<VdfSubExecutor<EngineType, DataManagerType>,
   * VdfSpeculationExecutor<SpeculationEngineType, DataManagerType>>
   * (pageCacheExecutor.h:42-53).
   */
  getFactory(): VdfExecutorFactoryBase {
    const engineType = this._engineType
    const dataManagerType = this._dataManagerType
    return _GetFactory(engineType, dataManagerType, () =>
      // FAITHFULNESS-DEBT(openexec-speculation): pageCacheExecutor.h:44-52
      // binds VdfSpeculationExecutor<EngineType<T>::SpeculationExecutorEngine,
      // DataManagerType> -> port speculationExecutor.h and pass its
      // constructor as the factory's speculation function. Until then
      // ManufactureSpeculationExecutor posts a coding error and throws.
      new VdfExecutorFactory((parentExecutor) =>
        new VdfSubExecutor(engineType, dataManagerType, parentExecutor)))
  }

  /** Clears all data in the local data manager (pageCacheExecutor.h:89-96). */
  protected override _clearData(): void {
    super._clearData()
    this._dataManager.clear()
  }
}
