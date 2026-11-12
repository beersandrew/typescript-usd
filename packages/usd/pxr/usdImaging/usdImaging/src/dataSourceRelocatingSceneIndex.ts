// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceRelocatingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/dataSourceRelocatingSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceRelocatingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import {
  BlockDataSource as HdBlockDataSource,
  ContainerDataSource as HdContainerDataSource,
  ContainerDataSourceEditor as HdContainerDataSourceEditor,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  SampledDataSource as HdSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry, type DataSourceLocator as HdDataSourceLocator,
  type DirtiedPrimEntry, type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

/** dataSourceRelocatingSceneIndex.cpp:15-26 */
function _IsNativeInstance(prim: HdSceneIndexPrim): boolean {
  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(prim.dataSource)
  const pathDs = schema.getNiPrototypePath()
  if (pathDs) {
    return !!pathDs.getTypedValue(0)
  }
  return false
}

/** dataSourceRelocatingSceneIndex.cpp:28-59 */
function _RelocateDataSource(
  prim: HdSceneIndexPrim,
  srcLocator: HdDataSourceLocator,
  dstLocator: HdDataSourceLocator,
): void {
  let src = HdContainerDataSource.Get(prim.dataSource, srcLocator)
  if (!src) {
    return
  }

  if (dstLocator.hasPrefix(HdPrimvarsSchema.getDefaultLocator()) &&
      !srcLocator.hasPrefix(HdPrimvarsSchema.getDefaultLocator())) {
    // InstanceProxyPathTranslation will later translate the
    // instance proxy path in the primvar.
    src = HdPrimvarSchema.buildRetained(
      /* primvarValue */ src instanceof HdSampledDataSource ? src : undefined,
      /* indexedPrimvarValue */ undefined,
      /* indices */ undefined,
      /* interpolation */
      HdPrimvarSchema.buildInterpolationDataSource(HdPrimvarSchemaTokens.constant),
      /* role */ HdPrimvarSchema.buildRoleDataSource(''),
      /* colorSpace */ undefined,
      /* elementSize */ undefined)
  }

  const editor = new HdContainerDataSourceEditor(prim.dataSource)
  editor.Set(dstLocator, src)
  editor.Set(srcLocator, HdBlockDataSource.new())
  prim.dataSource = editor.finish()
}

/**
 * dataSourceRelocatingSceneIndex.h:19-68.
 *
 * Moves the data source at srcLocator to dstLocator for prims that are
 * (forNativeInstance = true) or are not (forNativeInstance = false) native
 * instances.
 */
export class UsdImaging_DataSourceRelocatingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _dirtyDstLocators: HdDataSourceLocatorSet

  /** dataSourceRelocatingSceneIndex.h:23-32 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    srcLocator: HdDataSourceLocator,
    dstLocator: HdDataSourceLocator,
    forNativeInstance: boolean,
  ): UsdImaging_DataSourceRelocatingSceneIndex {
    return new UsdImaging_DataSourceRelocatingSceneIndex(inputSceneIndex, srcLocator, dstLocator, forNativeInstance)
  }

  /** dataSourceRelocatingSceneIndex.h:35-45 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    private readonly _srcLocator: HdDataSourceLocator,
    private readonly _dstLocator: HdDataSourceLocator,
    private readonly _forNativeInstance: boolean,
  ) {
    super(inputSceneIndex)
    this._dirtyDstLocators = HdContainerDataSourceEditor.computeDirtyLocators(
      new HdDataSourceLocatorSet([this._dstLocator]))
  }

  /** dataSourceRelocatingSceneIndex.cpp:61-75 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = { ...this._getInputSceneIndex().getPrim(primPath) }
    if (!prim.dataSource) {
      return prim
    }

    if (this._forNativeInstance === _IsNativeInstance(prim)) {
      _RelocateDataSource(prim, this._srcLocator, this._dstLocator)
    }

    return prim
  }

  /** dataSourceRelocatingSceneIndex.h:49-51 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** dataSourceRelocatingSceneIndex.h:53-56 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** dataSourceRelocatingSceneIndex.h:58-61 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** dataSourceRelocatingSceneIndex.cpp:77-106 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // Fast path: if no entry dirties the source locator, there is nothing to
    // remap, so forward the batch unchanged and avoid copying it. Transform /
    // visibility invalidations (the common case, e.g. from an interactive
    // activate) never touch the source locator, so they hit this path.
    let anyMatch = false
    for (const entry of entries) {
      if (entry.dirtyLocators.contains(this._srcLocator)) {
        anyMatch = true
        break
      }
    }
    if (!anyMatch) {
      this._sendPrimsDirtied(entries)
      return
    }

    const newDirtiedEntries: DirtiedPrimEntry[] = []
    for (const entry of entries) {
      if (entry.dirtyLocators.contains(this._srcLocator)) {
        newDirtiedEntries.push({ primPath: entry.primPath, dirtyLocators: this._dirtyDstLocators })
      } else {
        newDirtiedEntries.push(entry)
      }
    }
    this._sendPrimsDirtied(newDirtiedEntries)
  }
}
