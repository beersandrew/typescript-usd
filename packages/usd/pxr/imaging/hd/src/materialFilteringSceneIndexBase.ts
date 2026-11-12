// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/materialFilteringSceneIndexBase.cpp,
//  pxr/imaging/hd/materialFilteringSceneIndexBase.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hd/materialFilteringSceneIndexBase.{h,cpp}.

import { HdContainerDataSource, type HdDataSourceBase } from './dataSource.ts'
import { HdDataSourceMaterialNetworkInterface } from './dataSourceMaterialNetworkInterface.ts'
import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import type { HdMaterialNetworkInterface } from './materialNetworkInterface.ts'
import { HdMaterialSchemaTokens } from './materialSchema.ts'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexPrim,
  RemovedPrimEntry,
} from './sceneIndex.ts'
import { HdPrimTypeTokens } from './tokens.ts'

/** materialFilteringSceneIndexBase.h:38-39 */
export type HdMaterialFilteringSceneIndexBaseFilteringFnc =
  (networkInterface: HdMaterialNetworkInterface) => void

/** materialFilteringSceneIndexBase.cpp:18-70 */
class _MaterialDataSource extends HdContainerDataSource {
  constructor(
    private readonly _materialInput: HdContainerDataSource | undefined,
    private readonly _primInput: HdContainerDataSource | undefined,
    private readonly _config: HdContainerDataSource | undefined,
    private readonly _primPath: string,
    private readonly _fnc: HdMaterialFilteringSceneIndexBaseFilteringFnc,
  ) {
    super()
    void this._config
  }

  static new(
    materialInput: HdContainerDataSource | undefined,
    primInput: HdContainerDataSource | undefined,
    config: HdContainerDataSource | undefined,
    primPath: string,
    fnc: HdMaterialFilteringSceneIndexBaseFilteringFnc,
  ): _MaterialDataSource {
    return new _MaterialDataSource(materialInput, primInput, config, primPath, fnc)
  }

  getNames(): string[] {
    if (this._materialInput) {
      return this._materialInput.getNames()
    }
    return []
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (this._materialInput) {
      const result = this._materialInput.Get(name)
      if (result instanceof HdContainerDataSource) {
        const networkContainer = result
        const networkInterface = new HdDataSourceMaterialNetworkInterface(
          this._primPath, networkContainer, this._primInput)
        this._fnc(networkInterface)
        return networkInterface.finish()
      }
    }

    return undefined
  }
}

/** materialFilteringSceneIndexBase.cpp:73-122 */
class _PrimDataSource extends HdContainerDataSource {
  private readonly _config: HdContainerDataSource | undefined = undefined

  constructor(
    // pointer to HdMaterialFilteringSceneIndexBase so that we can query for the
    // filtering function.
    private readonly _base: HdMaterialFilteringSceneIndexBase,
    private readonly _primInput: HdContainerDataSource | undefined,
    private readonly _primPath: string,
  ) {
    super()
  }

  static new(
    base: HdMaterialFilteringSceneIndexBase,
    primInput: HdContainerDataSource | undefined,
    primPath: string,
  ): _PrimDataSource {
    return new _PrimDataSource(base, primInput, primPath)
  }

  getNames(): string[] {
    if (this._primInput) {
      return this._primInput.getNames()
    }
    return []
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (this._primInput) {
      const result = this._primInput.Get(name)
      if (result && name === HdMaterialSchemaTokens.material) {
        if (result instanceof HdContainerDataSource) {
          const materialContainer = result
          return _MaterialDataSource.new(
            materialContainer, this._primInput, this._config, this._primPath,
            this._base.getFilteringFunction())
        }
      }
      return result
    }

    return undefined
  }
}

/**
 * Base class for implementing scene indices which read from and write to
 * only material network data sources. Subclasses implement only
 * _GetFilteringFunction to provide a callback to run when a material network
 * is first queried.
 *
 * (materialFilteringSceneIndexBase.h:20-64)
 */
export abstract class HdMaterialFilteringSceneIndexBase extends HdSingleInputFilteringSceneIndexBase {
  /** materialFilteringSceneIndexBase.cpp:127-132 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** materialFilteringSceneIndexBase.cpp:134-143 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.primType === HdPrimTypeTokens.material && prim.dataSource) {
      return { primType: prim.primType, dataSource: _PrimDataSource.new(this, prim.dataSource, primPath) }
    }

    return prim
  }

  /** materialFilteringSceneIndexBase.cpp:145-150 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** materialFilteringSceneIndexBase.cpp:152-156 */
  getFilteringFunction(): HdMaterialFilteringSceneIndexBaseFilteringFnc {
    return this._getFilteringFunction()
  }

  /** materialFilteringSceneIndexBase.h:44 */
  protected abstract _getFilteringFunction(): HdMaterialFilteringSceneIndexBaseFilteringFnc

  /** materialFilteringSceneIndexBase.cpp:158-164 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** materialFilteringSceneIndexBase.cpp:166-172 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** materialFilteringSceneIndexBase.cpp:174-180 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }
}
