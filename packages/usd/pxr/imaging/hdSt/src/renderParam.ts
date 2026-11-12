// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderParam.cpp,
//  pxr/imaging/hdSt/renderParam.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderParam.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: JavaScript runs one thread here, so the atomics and the
// shared mutexes (renderParam.h:118-133) are plain fields.

import type { Token as TfToken } from 'typescript-usd/tf'
import type { RenderParam as HdRenderParam } from 'typescript-usd/hd'

/** renderParam.h:24-136. Storm's render param: state shared by prims during
 *  sync and the render passes. */
export class HdStRenderParam implements HdRenderParam {
  private _drawBatchesVersion = 1
  private _materialTagsVersion = 1
  private _geomSubsetDrawItemsVersion = 1
  private _activeDrawTargetSetVersion = 1
  private _needsGarbageCollection = false
  private _materialTagToCount = new Map<string, number>()
  private _renderTagToCount = new Map<string, number>()

  /** PLATFORM-DIVERGENCE(hdst-compile-ahead): what remains this frame of
   *  the time the render passes may spend compiling programs ahead
   *  (HdStCommandBuffer.compileDrawingProgramsAhead); CommitResources sets
   *  it once per frame. */
  compileAheadBudgetMs = 0

  /** renderParam.cpp:22-26 */
  markDrawBatchesDirty(): void {
    ++this._drawBatchesVersion
  }

  /** renderParam.cpp:28-34 */
  getDrawBatchesVersion(): number {
    return this._drawBatchesVersion
  }

  /** renderParam.cpp:36-40 */
  markMaterialTagsDirty(): void {
    ++this._materialTagsVersion
  }

  /** renderParam.cpp:42-48 */
  getMaterialTagsVersion(): number {
    return this._materialTagsVersion
  }

  /** renderParam.cpp:50-54 */
  markGeomSubsetDrawItemsDirty(): void {
    ++this._geomSubsetDrawItemsVersion
  }

  /** renderParam.cpp:56-62 */
  getGeomSubsetDrawItemsVersion(): number {
    return this._geomSubsetDrawItemsVersion
  }

  /** renderParam.cpp:64-68 */
  hasMaterialTag(materialTag: TfToken): boolean {
    return this._hasTag(this._materialTagToCount, materialTag)
  }

  /** renderParam.cpp:70-75 */
  increaseMaterialTagCount(materialTag: TfToken): void {
    this._adjustTagCount(this._materialTagToCount, materialTag, +1)
  }

  /** renderParam.cpp:77-82 */
  decreaseMaterialTagCount(materialTag: TfToken): void {
    this._adjustTagCount(this._materialTagToCount, materialTag, -1)
  }

  /** renderParam.cpp:84-93 */
  hasAnyRenderTag(renderTags: readonly TfToken[]): boolean {
    for (const tag of renderTags) {
      if (this._hasTag(this._renderTagToCount, tag)) {
        return true
      }
    }
    return false
  }

  /** renderParam.cpp:95-100 */
  increaseRenderTagCount(renderTag: TfToken): void {
    this._adjustTagCount(this._renderTagToCount, renderTag, +1)
  }

  /** renderParam.cpp:102-107 */
  decreaseRenderTagCount(renderTag: TfToken): void {
    this._adjustTagCount(this._renderTagToCount, renderTag, -1)
  }

  /** renderParam.cpp:165-169 */
  markActiveDrawTargetSetDirty(): void {
    ++this._activeDrawTargetSetVersion
  }

  /** renderParam.cpp:171-175 */
  getActiveDrawTargetSetVersion(): number {
    return this._activeDrawTargetSetVersion
  }

  /** renderParam.h:96-106 */
  setGarbageCollectionNeeded(): void { this._needsGarbageCollection = true }
  clearGarbageCollectionNeeded(): void { this._needsGarbageCollection = false }
  isGarbageCollectionNeeded(): boolean { return this._needsGarbageCollection }

  /** renderParam.cpp:109-140 */
  private _adjustTagCount(tagToCountMap: Map<string, number>, tag: TfToken, increment: number): void {
    if (tag.length === 0) {
      return
    }
    tagToCountMap.set(tag, (tagToCountMap.get(tag) ?? 0) + increment)
    // Note that it is difficult to remove zero entries from the map here during
    // multi-threaded access.
  }

  /** renderParam.cpp:142-163 */
  private _hasTag(tagToCountMap: Map<string, number>, tag: TfToken): boolean {
    if (tag.length === 0) {
      return true
    }
    const count = tagToCountMap.get(tag)
    if (count === undefined) {
      return false
    }
    return count > 0
  }
}
