// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instancer.cpp,
//  pxr/imaging/hd/instancer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instancer.{h,cpp} (OpenUSD 26.11.1): HdInstancer.
//
// Deliberate divergences:
// - SdfPath ids are path strings; the empty path is ''.
// - HdDirtyBits* is an HdDirtyBitsRef box.
// - The _instanceLock mutex (instancer.h:160-162) is not needed: JavaScript
//   runs one thread here.

import type { Token as TfToken } from 'typescript-usd/tf'
import { HdChangeTracker, type HdDirtyBits } from './changeTracker.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdRenderIndex } from './renderIndex.ts'
import type { HdRprim } from './rprim.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdInstancerTokens } from './tokens.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** instancer.h:105-163 */
export class HdInstancer {
  private _delegate: HdSceneDelegate
  private _id: string
  private _parentId = ''

  /** instancer.cpp:17-23 */
  constructor(delegate: HdSceneDelegate, id: string) {
    this._delegate = delegate
    this._id = id
  }

  /** instancer.h:118 */
  getId(): string { return this._id }

  /** instancer.h:121 */
  getParentId(): string { return this._parentId }

  /** instancer.h:123 */
  getDelegate(): HdSceneDelegate { return this._delegate }

  /** instancer.cpp:27-44 */
  static getInstancerNumLevels(index: HdRenderIndex, rprim: HdRprim): number {
    // Walk up the instancing hierarchy to figure out how many levels of
    // instancing the passed-in rprim has.

    let instancerLevels = 0
    let parent = rprim.getInstancerId()
    let instancer: HdInstancer | null = null
    while (parent !== '') {
      instancerLevels++
      instancer = index.getInstancer(parent) as HdInstancer | null
      TF_VERIFY(instancer, `Expected instancer for path: ${parent}.`)
      parent = instancer ? instancer.getParentId() : ''
    }
    return instancerLevels
  }

  /** instancer.cpp:46-57 */
  static getBuiltinPrimvarNames(): readonly TfToken[] {
    return HdInstancer._primvarNames
  }
  private static readonly _primvarNames: readonly TfToken[] = [
    HdInstancerTokens.instanceTransforms as TfToken,
    HdInstancerTokens.instanceRotations as TfToken,
    HdInstancerTokens.instanceScales as TfToken,
    HdInstancerTokens.instanceTranslations as TfToken,
  ]

  /** instancer.cpp:59-64 */
  sync(_sceneDelegate: HdSceneDelegate, _renderParam: HdRenderParam | null | undefined,
    _dirtyBits: HdDirtyBitsRef): void {}

  /** instancer.cpp:66-69 */
  finalize(_renderParam: HdRenderParam | null | undefined): void {}

  /** instancer.cpp:71-95 */
  static _syncInstancerAndParents(renderIndex: HdRenderIndex, instancerId: string): void {
    const renderParam = renderIndex.getRenderDelegate().getRenderParam()
    const tracker = renderIndex.getChangeTracker()
    let id = instancerId
    while (id !== '') {
      const instancer = renderIndex.getInstancer(id) as HdInstancer | null
      if (!TF_VERIFY(instancer, `Expected instancer for path: ${id}.`)) {
        return
      }

      const dirtyBits = { value: tracker.getInstancerDirtyBits(id) }
      if (dirtyBits.value !== HdChangeTracker.Clean) {
        instancer!.sync(instancer!.getDelegate(), renderParam, dirtyBits)
        tracker.markInstancerClean(id)
      }

      id = instancer!.getParentId()
    }
  }

  /** instancer.cpp:97-118 */
  protected _updateInstancer(delegate: HdSceneDelegate, dirtyBits: HdDirtyBitsRef): void {
    if (HdChangeTracker.isInstancerDirty(dirtyBits.value, this.getId())) {
      const parentId = delegate.getInstancerId(this.getId())
      if (parentId === this._parentId) {
        return
      }

      // If we have a new instancer ID, we need to update the dependency
      // map and also update the stored instancer ID.
      const tracker = delegate.getRenderIndex().getChangeTracker()
      if (this._parentId !== '') {
        tracker.removeInstancerInstancerDependency(this._parentId, this.getId())
      }
      if (parentId !== '') {
        tracker.addInstancerInstancerDependency(parentId, this.getId())
      }
      this._parentId = parentId
    }
  }

  /** instancer.cpp:120-128 */
  getInitialDirtyBitsMask(): HdDirtyBits {
    return HdChangeTracker.DirtyTransform |
      HdChangeTracker.DirtyPrimvar |
      HdChangeTracker.DirtyInstanceIndex |
      HdChangeTracker.DirtyInstancer |
      HdChangeTracker.DirtyVisibility
  }
}
