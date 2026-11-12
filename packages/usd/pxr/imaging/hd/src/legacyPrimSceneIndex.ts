// Ported from OpenUSD 26.11.1: pxr/imaging/hd/legacyPrimSceneIndex.cpp,
//  pxr/imaging/hd/legacyPrimSceneIndex.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/legacyPrimSceneIndex.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences: SdfPath ids are path strings; the scene delegate and task
// factory are object references (HdSceneDelegate* / shared_ptr).

import type { Token as TfToken } from 'typescript-usd/tf'
import { HdRetainedContainerDataSource, type HdContainerDataSource } from './dataSource.ts'
import type { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdDataSourceLegacyPrim } from './dataSourceLegacyPrim.ts'
import { HdDataSourceLegacyTaskPrim } from './dataSourceLegacyTaskPrim.ts'
import type { HdLegacyTaskFactory } from './legacyTaskFactory.ts'
import { HdRetainedSceneIndex, type HdRetainedDirtiedPrimEntry } from './retainedSceneIndex.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdPrimTypeTokens } from './tokens.ts'

// HdDataSourceLocatorSet::Intersects(const HdDataSourceLocatorSet &)
// (dataSourceLocator.h); dataSourceLocator.ts only has the single-locator
// form.
function _Intersects(a: HdDataSourceLocatorSet, b: HdDataSourceLocatorSet): boolean {
  for (const locator of b) {
    if (a.intersects(locator)) return true
  }
  return false
}

let _empty: HdContainerDataSource | undefined

/**
 * legacyPrimSceneIndex.h:19-62. extends HdRetainedSceneIndex to instantiate
 * and dirty HdDataSourceLegacyPrim data sources.
 */
export class HdLegacyPrimSceneIndex extends HdRetainedSceneIndex {
  static override new(): HdLegacyPrimSceneIndex {
    return new HdLegacyPrimSceneIndex()
  }

  /** legacyPrimSceneIndex.cpp:18-24: custom insertion wrapper called by
   *  HdRenderIndex during population of legacy HdSceneDelegates. */
  addLegacyPrim(id: string, type: TfToken | string, sceneDelegate: HdSceneDelegate): void {
    this.addPrims([{ primPath: id, primType: type,
      dataSource: HdDataSourceLegacyPrim.new(id, type, sceneDelegate) }])
  }

  /** legacyPrimSceneIndex.cpp:26-34: custom insertion wrapper called by
   *  HdRenderIndex::InsertTask<T>. */
  addLegacyTask(id: string, sceneDelegate: HdSceneDelegate,
    factory: HdLegacyTaskFactory | undefined): void {
    this.addPrims([{ primPath: id, primType: HdPrimTypeTokens.task,
      dataSource: HdDataSourceLegacyTaskPrim.new(id, sceneDelegate, factory) }])
  }

  /** legacyPrimSceneIndex.cpp:36-47: remove only the prim at the path; if it
   *  has descendants, the prim becomes an empty, typeless prim so the
   *  descendants stay reachable. */
  removePrim(id: string): void {
    if (this.getChildPrimPaths(id).length > 0) {
      _empty ??= HdRetainedContainerDataSource.new([], [])
      this.addPrims([{ primPath: id, primType: '', dataSource: _empty }])
    } else {
      this.removePrims([{ primPath: id }])
    }
  }

  /** legacyPrimSceneIndex.cpp:49-69: sends PrimDirtied to the
   *  HdDataSourceLegacyPrim for each entry, then notifies observers. */
  override dirtyPrims(entries: HdRetainedDirtiedPrimEntry[]): void {
    for (const entry of entries) {
      if (!_Intersects(entry.dirtyLocators, HdDataSourceLegacyPrim.getCachedLocators())) {
        // If none of the locators are cached by the datasource,
        // PrimDirtied will be a no-op so we can skip the map lookup...
        continue
      }
      const legacyDs = HdDataSourceLegacyPrim.cast(this.getPrim(entry.primPath).dataSource)
      if (legacyDs) {
        legacyDs.primDirtied(entry.dirtyLocators)
      }
    }
    super.dirtyPrims(entries)
  }
}
