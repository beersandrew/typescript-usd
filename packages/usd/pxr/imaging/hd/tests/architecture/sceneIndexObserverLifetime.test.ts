// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hd/sceneIndex.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  MergingSceneIndex as HdMergingSceneIndex,
  RetainedSceneIndex as HdRetainedSceneIndex,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexObserver as HdSceneIndexObserver,
  SceneIndexPrim as HdSceneIndexPrim,
  type RemovedPrimEntry,
} from '../../src/index.ts'

function observer(onAdded: () => void): HdSceneIndexObserver {
  return { primsAdded: onAdded, primsRemoved() {}, primsDirtied() {}, primsRenamed() {} }
}

describe('HdSceneIndexBase observer lifetime rails', () => {
  // pxr/imaging/hd/sceneIndex.cpp:89-109 captures the initial observer count.
  it('does not notify an observer added during the current notice', () => {
    const scene = HdRetainedSceneIndex.new()
    let lateCalls = 0
    const late = observer(() => lateCalls++)
    scene.addObserver(observer(() => scene.addObserver(late)))
    scene.addPrims([{ primPath: '/A', primType: 'test', dataSource: undefined }])
    expect(lateCalls).toBe(0)
  })

  // pxr/imaging/hd/sceneIndex.cpp:57-71 defers physical removal while a notice
  // is active but immediately prevents the removed observer being called.
  it('allows an observer to remove a later observer during notification', () => {
    const scene = HdRetainedSceneIndex.new()
    let removedCalls = 0
    const removed = observer(() => removedCalls++)
    scene.addObserver(observer(() => scene.removeObserver(removed)))
    scene.addObserver(removed)
    scene.addPrims([{ primPath: '/A', primType: 'test', dataSource: undefined }])
    expect(removedCalls).toBe(0)
  })

  it('never forwards empty notice batches', () => {
    const scene = HdRetainedSceneIndex.new()
    let calls = 0
    scene.addObserver(observer(() => calls++))
    scene.addPrims([])
    expect(calls).toBe(0)
  })

  it('single-input and merging owners revoke strong input observers exactly once', () => {
    class ForwardingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
      constructor(input: HdSceneIndexBase) { super(input) }
      getPrim(path: string): HdSceneIndexPrim { return this._getInputSceneIndex().getPrim(path) }
      getChildPrimPaths(path: string): string[] {
        return this._getInputSceneIndex().getChildPrimPaths(path)
      }
      protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
        this._sendPrimsAdded(entries)
      }
      protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
        this._sendPrimsRemoved(entries)
      }
      protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
        this._sendPrimsDirtied(entries)
      }
    }

    const input = HdRetainedSceneIndex.new()
    const filter = new ForwardingSceneIndex(input)
    const merge = HdMergingSceneIndex.new()
    merge.addInputScene(input)
    let filterCalls = 0
    let mergeCalls = 0
    filter.addObserver(observer(() => filterCalls++))
    merge.addObserver(observer(() => mergeCalls++))

    filter.destroy()
    filter.destroy()
    merge.destroy()
    merge.destroy()
    input.addPrims([{ primPath: '/A', primType: 'test', dataSource: undefined }])

    expect(filterCalls).toBe(0)
    expect(mergeCalls).toBe(0)
  })
})
