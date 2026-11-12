// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/legacyDisplayStyleOverrideSceneIndex.cpp,
//  pxr/imaging/hdsi/legacyDisplayStyleOverrideSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/legacyDisplayStyleOverrideSceneIndex.cpp:20-223.
import {
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  ContainerDataSource as HdContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type {
  DataSourceBase as HdDataSourceBase,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
  AddedPrimEntry, RemovedPrimEntry, DirtiedPrimEntry,
} from 'typescript-usd/hd'

class StyleDataSource extends HdContainerDataSource {
  refineLevel: number | undefined
  cullStyle = ''
  refineSource: HdDataSourceBase | undefined
  cullSource: HdDataSourceBase | undefined
  getNames(): string[] { return ['refineLevel', 'cullStyle'] }
  Get(name: string): HdDataSourceBase | undefined {
    return name === 'refineLevel' ? this.refineSource : name === 'cullStyle' ? this.cullSource : undefined
  }
}
export class HdsiLegacyDisplayStyleOverrideSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _style = new StyleDataSource()
  private readonly _underlay = HdRetainedContainerDataSource.new(['displayStyle'], [this._style])
  static new(input: HdSceneIndexBase): HdsiLegacyDisplayStyleOverrideSceneIndex { return new this(input) }
  getPrim(path: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(path)
    return prim.dataSource ? { ...prim, dataSource: HdOverlayContainerDataSource.new(prim.dataSource, this._underlay) } : prim
  }
  getChildPrimPaths(path: string): string[] { return this._getInputSceneIndex().getChildPrimPaths(path) }
  setRefineLevelFallback(level: number | undefined): void {
    if (level === this._style.refineLevel) return
    this._style.refineLevel = level
    this._style.refineSource = level === undefined ? undefined : HdRetainedTypedSampledDataSource.new(level)
    this._dirtyAll(new HdDataSourceLocator('displayStyle', 'refineLevel'))
  }
  setCullStyleFallback(style: string): void {
    if (style === this._style.cullStyle) return
    this._style.cullStyle = style
    this._style.cullSource = style ? HdRetainedTypedSampledDataSource.new(style) : undefined
    // Upstream invalidates the parent locator: leaf-only cull invalidation is insufficient.
    this._dirtyAll(new HdDataSourceLocator('displayStyle'))
  }
  private _dirtyAll(locator: HdDataSourceLocator): void {
    if (!this._isObserved()) return
    const entries: DirtiedPrimEntry[] = []
    const visit = (path: string) => {
      entries.push({ primPath: path, dirtyLocators: new HdDataSourceLocatorSet([locator]) })
      for (const child of this.getChildPrimPaths(path)) visit(child)
    }
    visit('/')
    this._sendPrimsDirtied(entries)
  }
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void { if (this._isObserved()) this._sendPrimsAdded(entries) }
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void { if (this._isObserved()) this._sendPrimsRemoved(entries) }
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void { if (this._isObserved()) this._sendPrimsDirtied(entries) }
}
