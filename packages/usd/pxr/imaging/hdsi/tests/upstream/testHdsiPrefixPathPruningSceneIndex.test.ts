// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/testenv/testHdsiPrefixPathPruningSceneIndex.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/imaging/hdsi/testenv/testHdsiPrefixPathPruningSceneIndex.cpp
// (registered as testHdsiPrefixPathPruningSceneIndex in
// pxr/imaging/hdsi/CMakeLists.txt:96-103,124-126). Expected values are the
// ones written in the upstream test.

import { expect, it } from 'vitest'
import {
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexObserver as HdSceneIndexObserver,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import {
  HdsiPrefixPathPruningSceneIndex,
  HdsiPrefixPathPruningSceneIndexTokens,
} from '../../src/prefixPathPruningSceneIndex.ts'

/** RecordingSceneIndexObserver, testHdsiPrefixPathPruningSceneIndex.cpp:
 *  26-127 (events as a set of their printed form, operator<< at :135-153). */
class RecordingSceneIndexObserver implements HdSceneIndexObserver {
  private _events: string[] = []
  primsAdded(_s: HdSceneIndexBase, entries: { primPath: string; primType: string }[]): void {
    for (const e of entries) this._events.push(`PrimAdded: ${e.primPath}, ${e.primType}`)
  }
  primsRemoved(_s: HdSceneIndexBase, entries: { primPath: string }[]): void {
    for (const e of entries) this._events.push(`PrimRemoved: ${e.primPath}`)
  }
  primsDirtied(_s: HdSceneIndexBase,
    entries: { primPath: string; dirtyLocators: Iterable<{ GetString(): string }> }[]): void {
    for (const e of entries) {
      for (const l of e.dirtyLocators) this._events.push(`PrimDirtied: ${e.primPath}, ${l.GetString()}`)
    }
  }
  primsRenamed(): void {}
  getEventsAsSet(): Set<string> { return new Set(this._events) }
}

/** testHdsiPrefixPathPruningSceneIndex.cpp:203-207 */
function _PrimEq(lhs: HdSceneIndexPrim, rhs: HdSceneIndexPrim): boolean {
  return lhs.primType === rhs.primType && lhs.dataSource === rhs.dataSource
}

/** _Compare, testHdsiPrefixPathPruningSceneIndex.cpp:209-223 (as SdfPathSets). */
function _Compare(computedVec: string[], expectedVec: string[]): void {
  expect(new Set(computedVec)).toEqual(new Set(expectedVec))
}

/** testHdsiPrefixPathPruningSceneIndex.cpp:225-257 */
function _PopulateTestScene(): HdRetainedSceneIndex {
  const primType = 'test'
  const primDs: HdContainerDataSource =
    HdRetainedContainerDataSource.new(
      ['loc0', 'loc1'],
      [HdRetainedTypedSampledDataSource.new(23),
        HdRetainedTypedSampledDataSource.new(false)])

  const scene = HdRetainedSceneIndex.new()
  scene.addPrims(
    [
      '/A', '/A/B', '/A/B/C0', '/A/B/C1', '/A/C', '/A/C/D0', '/A/C/D0/E0',
      '/A/C/D1', '/A/D', '/B', '/B/A', '/B/C', '/B/C/D', '/B/C/D/E', '/B/D',
    ].map((primPath) => ({ primPath, primType, dataSource: primDs })),
  )
  return scene
}

/** TestPrefixPathPruning, testHdsiPrefixPathPruningSceneIndex.cpp:259-349 */
it('TestPrefixPathPruning', () => {
  const testSi = _PopulateTestScene()

  // Chain a scene index that prunes some prefix paths and verify that
  // these paths are pruned.
  const pruningSi =
    HdsiPrefixPathPruningSceneIndex.new(
      testSi,
      HdRetainedContainerDataSource.new(
        [HdsiPrefixPathPruningSceneIndexTokens.excludePathPrefixes],
        [HdRetainedTypedSampledDataSource.new(
          [
            '/A/B',
            '/A/B/C1', // Redundant since we prune the parent.
            '/A/C/D0',
            '/B/C/D',
          ])]))

  // "/A/B" should be pruned.
  _Compare(pruningSi.getChildPrimPaths('/A'), ['/A/C', '/A/D'])
  _Compare(pruningSi.getChildPrimPaths('/A/B'), [])

  // "/A/C/D0" should be pruned.
  _Compare(pruningSi.getChildPrimPaths('/A/C'), ['/A/C/D1'])

  // No children of "/B" should be pruned.
  _Compare(pruningSi.getChildPrimPaths('/B'), ['/B/A', '/B/C', '/B/D'])

  // "/B/C/D" should be pruned leaving "/B/C" with no children.
  _Compare(pruningSi.getChildPrimPaths('/B/C'), [])

  // Edit the exclude paths to prune "/A/C" and "/B".
  {
    const observer = new RecordingSceneIndexObserver()
    pruningSi.addObserver(observer)

    pruningSi.setExcludePathPrefixes(['/A/B', '/B'])

    const baseline = new Set([
      'PrimAdded: /A/C/D0, test',
      'PrimAdded: /A/C/D0/E0, test',
      'PrimRemoved: /B',
    ])

    expect(observer.getEventsAsSet()).toEqual(baseline)
  }

  // Verify that querying pruned prims gives us an empty prim.
  const emptyPrim: HdSceneIndexPrim = { primType: '', dataSource: undefined }
  expect(_PrimEq(pruningSi.getPrim('/B/C'), emptyPrim)).toBe(true)
  expect(_PrimEq(pruningSi.getPrim('/B/C/D'), emptyPrim)).toBe(true)
  expect(_PrimEq(pruningSi.getPrim('/A/B'), emptyPrim)).toBe(true)
  expect(_PrimEq(pruningSi.getPrim('/A/B/C1'), emptyPrim)).toBe(true)
})
