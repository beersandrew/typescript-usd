// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/testenv/testHdsiPrimIdSceneIndex.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/imaging/hdsi/testenv/testHdsiPrimIdSceneIndex.cpp (registered as
// testHdsiPrimIdSceneIndex in pxr/imaging/hdsi/CMakeLists.txt:105-113,
// 127-129). Expected values are the ones written in the upstream test.

import { expect, it } from 'vitest'
import {
  PrimIdSchema as HdPrimIdSchema,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SceneIndexPrimView as HdSceneIndexPrimView,
} from 'typescript-usd/hd'
import type {
  DirtiedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import { HdsiPrimIdSceneIndex } from '../../src/primIdSceneIndex.ts'

/** testHdsiPrimIdSceneIndex.cpp:27-58: records whether the prim id to path
 *  table has been dirtied. */
class _DirtyRecordingObserver implements HdSceneIndexObserver {
  private _primIdDirtied = false
  primsAdded(): void {}
  primsRemoved(): void {}
  primsRenamed(): void {}
  primsDirtied(_s: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    for (const entry of entries) {
      if (entry.primPath === HdSceneGlobalsSchema.getDefaultPrimPath() &&
          entry.dirtyLocators.intersects(
            HdSceneGlobalsSchema.getPrimIdToPathLocator())) {
        this._primIdDirtied = true
      }
    }
  }
  getAndClearPrimIdDirtied(): boolean {
    const result = this._primIdDirtied
    this._primIdDirtied = false
    return result
  }
}

/** testHdsiPrimIdSceneIndex.cpp:60-120: every prim has a unique prim id if
 *  and only if it is imageable (the only imageable prim used in the test is
 *  mesh) and the correct inverse map is stored in the scene globals schema. */
function _CheckInvariants(si: HdSceneIndexBase): boolean {
  const primIds = HdSceneGlobalsSchema.getFromSceneIndex(si).getPrimIdToPath()

  let numPrimsWithId = 0

  // Traverse all prims.
  for (const primPath of new HdSceneIndexPrimView(si)) {
    const prim = si.getPrim(primPath)
    const primIdDs = HdPrimIdSchema.getFromParent(prim.dataSource).getPrimId()
    if (primIdDs) {
      // prim has a prim Id.
      ++numPrimsWithId

      // Check that the prim id maps back to the prim.
      const ds = primIds.getElement(primIdDs.getTypedValue(0.0))
      if (!ds || ds.getTypedValue(0.0) !== primPath) {
        return false
      }

      // Check that the prim is actually imageable.
      if (prim.primType !== HdPrimTypeTokens.mesh) {
        return false
      }
    } else {
      // prim has no prim Id. Check that it is not imageable.
      if (prim.primType === HdPrimTypeTokens.mesh) {
        return false
      }
    }
  }

  // Check that the number of assigned prim ids is equal to
  // the number of prims with assigned ids.
  let numPrimIds = 0
  for (let i = 0; i < primIds.getNumElements(); ++i) {
    if (primIds.getElement(i)) {
      ++numPrimIds
    }
  }

  return numPrimsWithId === numPrimIds
}

/** testHdsiPrimIdSceneIndex.cpp:129-189 */
it('testHdsiPrimIdSceneIndex', () => {
  // Build an populate an input scene.
  const retained = HdRetainedSceneIndex.new()
  const emptyContainer = HdRetainedContainerDataSource.new([], [])
  retained.addPrims([
    { primPath: '/A', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
    { primPath: '/A/child', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
    { primPath: '/B', primType: HdPrimTypeTokens.material, dataSource: emptyContainer },
    { primPath: '/C', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
    { primPath: '/D', primType: HdPrimTypeTokens.material, dataSource: emptyContainer },
    { primPath: '/E', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
  ])

  const primIdSi = HdsiPrimIdSceneIndex.new(retained)

  const observer = new _DirtyRecordingObserver()
  primIdSi.addObserver(observer)

  // 1) Check correct population.
  expect(_CheckInvariants(primIdSi)).toBe(true)

  // 2) Adding prims/resyncing prim type.
  retained.addPrims([
    // Imageable -> not imageable
    { primPath: '/A', primType: HdPrimTypeTokens.material, dataSource: emptyContainer },
    { primPath: '/E', primType: HdPrimTypeTokens.material, dataSource: emptyContainer },
    // Nonimageable -> imagable
    { primPath: '/D', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
    // New
    { primPath: '/F', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
    // New with child.
    { primPath: '/G', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
    { primPath: '/G/child', primType: HdPrimTypeTokens.mesh, dataSource: emptyContainer },
  ])
  expect(observer.getAndClearPrimIdDirtied()).toBe(true)
  expect(_CheckInvariants(primIdSi)).toBe(true)

  // 3) Removing imagable prim.
  retained.removePrims([{ primPath: '/C' }])
  expect(observer.getAndClearPrimIdDirtied()).toBe(true)
  expect(_CheckInvariants(primIdSi)).toBe(true)

  // 4) Removing imageable prim with child.
  retained.removePrims([{ primPath: '/G' }])
  expect(observer.getAndClearPrimIdDirtied()).toBe(true)
  expect(_CheckInvariants(primIdSi)).toBe(true)

  retained.removePrims([{ primPath: '/' }])
  expect(observer.getAndClearPrimIdDirtied()).toBe(true)
  expect(_CheckInvariants(primIdSi)).toBe(true)

  primIdSi.removeObserver(observer)
})
