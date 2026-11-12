// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdMergingSceneIndex.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful 1:1 port of pxr/imaging/hd/testenv/testHdMergingSceneIndex.cpp
//
// Builds retained scene indices, wraps them with a custom single-input
// filtering scene index (_MySceneIndex, with a Disable() that sends
// PrimsRemoved("/")), feeds them into a merging scene index, and asserts the
// notification log observed downstream after operations.

import { describe, expect, it } from 'vitest'
import {
  HdSceneIndexBase,
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  type HdSceneIndexObserver,
  type HdSceneIndexPrim,
  type RemovedPrimEntry,
  type RenamedPrimEntry,
} from '../../src/sceneIndex.ts'
import { HdRetainedSceneIndex } from '../../src/retainedSceneIndex.ts'
import { HdSingleInputFilteringSceneIndexBase } from '../../src/filteringSceneIndex.ts'
import { HdMergingSceneIndex } from '../../src/mergingSceneIndex.ts'
import { HdRetainedContainerDataSource } from '../../src/dataSource.ts'

type _LogEntry = [string, string]

// A single-input filtering scene index that simply forwards its input while
// enabled, and on Disable() emits a PrimsRemoved("/") and stops forwarding.
class _MySceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private _enabled = true

  static new(inputScene: HdSceneIndexBase): _MySceneIndex {
    return new _MySceneIndex(inputScene)
  }

  protected constructor(inputScene: HdSceneIndexBase) {
    super(inputScene)
  }

  disable(): void {
    this._enabled = false
    this._sendPrimsRemoved([{ primPath: '/' }])
  }

  getPrim(primPath: string): HdSceneIndexPrim {
    if (this._enabled) {
      return this._getInputSceneIndex().getPrim(primPath)
    }
    return { primType: '', dataSource: undefined }
  }

  getChildPrimPaths(primPath: string): string[] {
    if (this._enabled) {
      return this._getInputSceneIndex().getChildPrimPaths(primPath)
    }
    return []
  }

  protected _primsAdded(
    _sender: HdSceneIndexBase,
    entries: AddedPrimEntry[],
  ): void {
    if (this._enabled) this._sendPrimsAdded(entries)
  }

  protected _primsRemoved(
    _sender: HdSceneIndexBase,
    entries: RemovedPrimEntry[],
  ): void {
    if (this._enabled) this._sendPrimsRemoved(entries)
  }

  protected _primsDirtied(
    _sender: HdSceneIndexBase,
    entries: DirtiedPrimEntry[],
  ): void {
    if (this._enabled) this._sendPrimsDirtied(entries)
  }
}

class _Logger implements HdSceneIndexObserver {
  private _log: _LogEntry[] = []

  Reset(): void {
    this._log = []
  }

  getLog(): _LogEntry[] {
    return this._log
  }

  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    for (const entry of entries) this._log.push(['add', entry.primPath])
  }

  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    for (const entry of entries) this._log.push(['remove', entry.primPath])
  }

  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    for (const entry of entries) this._log.push(['dirty', entry.primPath])
  }

  primsRenamed(_sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void {
    for (const entry of entries) this._log.push(['rename', entry.oldPrimPath])
  }
}

describe('HdMergingSceneIndex', () => {
  // Mirrors _TestNoticesAfterRemove.
  it('resyncs weaker input prims when the stronger input is disabled', () => {
    const siA = HdRetainedSceneIndex.new()
    siA.addPrims([
      { primPath: '/Parent', primType: 'A', dataSource: undefined },
      { primPath: '/Parent/Child', primType: 'A', dataSource: undefined },
    ])

    const siB = HdRetainedSceneIndex.new()
    siB.addPrims([
      { primPath: '/Parent', primType: 'B', dataSource: undefined },
      { primPath: '/Parent/Child', primType: 'B', dataSource: undefined },
    ])

    const dA = _MySceneIndex.new(siA)
    const dB = _MySceneIndex.new(siB)

    // mergingSceneIndex merges 2 scene indices with the same prim hierarchy,
    // but the "A" branch has type "A" and the "B" branch has type "B".
    const mergingSceneIndex = HdMergingSceneIndex.new()
    mergingSceneIndex.addInputScene(dA, '/')
    mergingSceneIndex.addInputScene(dB, '/')

    // We attach a logger so we can see what entries get emitted when we disable
    // "A" (the stronger input). Downstream observers should now see all of
    // those prims, but now with type "B".
    const logger = new _Logger()
    mergingSceneIndex.addObserver(logger)
    dA.disable()

    expect(logger.getLog()).toEqual([
      ['remove', '/'],
      ['add', '/'],
      ['add', '/Parent'],
      ['add', '/Parent/Child'],
    ])
  })

  // Mirrors _TestRemoveInputScenes.
  it('emits removes/resyncs when input scenes are removed', () => {
    const primType = 'PrimType'
    const dataSource = HdRetainedContainerDataSource.new([], [])

    const siA = HdRetainedSceneIndex.new()
    siA.addPrims([
      { primPath: '/A/B/C/D/E/F', primType, dataSource },
      { primPath: '/A/B/C/D2', primType, dataSource },
    ])

    const siB = HdRetainedSceneIndex.new()
    siB.addPrims([{ primPath: '/A/B/C/D', primType, dataSource }])

    const siC = HdRetainedSceneIndex.new()
    siC.addPrims([{ primPath: '/A/B/C', primType, dataSource }])

    const mergingSceneIndex = HdMergingSceneIndex.new()
    mergingSceneIndex.addInputScene(siA, '/A/B')
    mergingSceneIndex.addInputScene(siB, '/A/B/C')
    mergingSceneIndex.addInputScene(siC, '/')

    const logger = new _Logger()
    mergingSceneIndex.addObserver(logger)

    mergingSceneIndex.removeInputScenes([siA, siB])

    expect(logger.getLog()).toEqual([
      ['remove', '/A/B/C/D'],
      ['remove', '/A/B/C/D2'],
      ['add', '/A/B'],
      ['add', '/A/B/C'],
    ])
  })
})
