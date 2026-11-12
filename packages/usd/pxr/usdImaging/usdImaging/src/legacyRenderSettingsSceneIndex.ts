// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/legacyRenderSettingsSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/legacyRenderSettingsSceneIndex.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/legacyRenderSettingsSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// VtValue settings are plain values here, as in hd/src/renderDelegate.ts
// SetRenderSetting: values compare with ===, or with an `equals` method when
// the value has one (VtValue::operator==). The _Visitor
// (legacyRenderSettingsSceneIndex.cpp:38-55) wraps every value in an
// HdRetainedTypedSampledDataSource, which is also what
// HdRetainedSampledDataSource is in this port. The std::unordered_map
// iterates in insertion order (a Map).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSentinelTokens as HdDataSourceLocatorSentinelTokens,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry,
  type ContainerDataSource as HdContainerDataSource,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry,
  type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** legacyRenderSettingsSceneIndex.cpp:34-36 */
const _tokens = TfMakeTokens({
  legacyRenderSettings: 'legacyRenderSettings',
})

/** VtValue::operator== */
function _ValuesEqual(a: unknown, b: unknown): boolean {
  const current = a as { equals?: (o: unknown) => boolean } | undefined
  return typeof current?.equals === 'function' ? current.equals(b) : a === b
}

/** legacyRenderSettingsSceneIndex.cpp:40-53 */
function _Visitor(value: unknown): HdDataSourceBase {
  return HdRetainedTypedSampledDataSource.new(value)
}

/** UsdImagingLegacyRenderSettingsSceneIndex
 *
 *  A scene index to expose options set with SetRendererSetting()
 *  into Hydra where downstream scene indices may query them or
 *  respond to changes. Only sends dirty notices when an option's
 *  value actually changes (checked using VtValue::operator ==).
 *
 *  (legacyRenderSettingsSceneIndex.h:31-87) */
export class UsdImagingLegacyRenderSettingsSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _map = new Map<string, unknown>()
  private _dataSource: HdContainerDataSource | undefined

  /** legacyRenderSettingsSceneIndex.cpp:57-63 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImagingLegacyRenderSettingsSceneIndex {
    return new UsdImagingLegacyRenderSettingsSceneIndex(inputSceneIndex)
  }

  /** legacyRenderSettingsSceneIndex.cpp:99-103 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** legacyRenderSettingsSceneIndex.cpp:65-75 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (primPath === '/') {
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.new(
          prim.dataSource, this._dataSource),
      }
    }
    return prim
  }

  /** legacyRenderSettingsSceneIndex.cpp:105-110 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** legacyRenderSettingsSceneIndex.cpp:77-97 */
  setRenderSetting(id: string, value: unknown): void {
    const legacyRenderSettingsLocator =
      HdSceneGlobalsSchema.getDefaultLocator()
        .append(_tokens.legacyRenderSettings)
    if (this._map.has(id) && _ValuesEqual(this._map.get(id), value)) {
      // Do not update or notify if the value did not change
      return
    }
    this._map.set(id, value)
    this._compose()
    this._sendPrimsDirtied([{
      primPath: '/',
      dirtyLocators: new HdDataSourceLocatorSet([
        legacyRenderSettingsLocator.append(id),
        new HdDataSourceLocator(
          HdDataSourceLocatorSentinelTokens.container),
      ]),
    }])
  }

  /** legacyRenderSettingsSceneIndex.cpp:112-118 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** legacyRenderSettingsSceneIndex.cpp:120-126 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  /** legacyRenderSettingsSceneIndex.cpp:128-134 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** legacyRenderSettingsSceneIndex.cpp:136-154 */
  private _compose(): void {
    // Upstream sizes names/sources to _map.size() and then push_back()s,
    // so the leading _map.size() entries are empty tokens with null data
    // sources. Ported as is; the retained container keeps one '' name.
    const names: string[] = new Array<string>(this._map.size).fill('')
    const sources: (HdDataSourceBase | undefined)[] =
      new Array<HdDataSourceBase | undefined>(this._map.size).fill(undefined)

    for (const [key, value] of this._map) {
      names.push(key)
      sources.push(_Visitor(value))
    }
    this._dataSource = HdRetainedContainerDataSource.new(
      [HdSceneGlobalsSchema.getSchemaToken()],
      [HdRetainedContainerDataSource.new(
        [_tokens.legacyRenderSettings],
        [HdRetainedContainerDataSource.new(
          names, sources as HdDataSourceBase[])])])
  }
}
