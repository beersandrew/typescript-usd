// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdSceneIndex.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful subset port of pxr/imaging/hd/testenv/testHdSceneIndex.cpp.
//
// Ported sub-cases:
//   - TestMergingSceneIndex                — data-source overlay across inputs
//   - TestMergingSceneIndexPrimAddedNotices — primType resolution in PrimsAdded
//   - a retained add/remove/dirty + prim-view walk case built from the same
//     RecordingSceneIndexObserver and HdRetainedSceneIndex building blocks
//
// Omitted sub-cases (each needs scene-index infra outside this foundation):
//   - TestFlatteningSceneIndex  — needs HdFlatteningSceneIndex + HdXformSchema
//   - TestPrefixingSceneIndex   — needs HdPrefixingSceneIndex
//   - TestDependencyForwardingSceneIndex / *Eviction / *DependentDependencies
//                               — need HdDependencyForwardingSceneIndex
// These are left out (rather than skipped) so the file stays all-green and a
// faithful subset.

import { describe, expect, it } from 'vitest'
import {
  HdSceneIndexBase,
  HdSceneIndexPrimView,
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
import {
  HdContainerDataSource,
  HdSampledDataSource,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
} from '../../src/dataSource.ts'
import {
  HdDataSourceLocator,
  HdDataSourceLocatorSet,
} from '../../src/dataSourceLocator.ts'

// ----------------------------------------------------------------------------
// RecordingSceneIndexObserver (mirrors the test's recording observer)

enum EventType {
  PrimAdded = 0,
  PrimRemoved,
  PrimDirtied,
}

interface RecordedEvent {
  eventType: EventType
  primPath: string
  primType: string
  locator: string
}

class RecordingSceneIndexObserver implements HdSceneIndexObserver {
  private _events: RecordedEvent[] = []

  getEvents(): RecordedEvent[] {
    return this._events
  }

  clear(): void {
    this._events = []
  }

  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    for (const entry of entries) {
      this._events.push({
        eventType: EventType.PrimAdded,
        primPath: entry.primPath,
        primType: entry.primType,
        locator: '',
      })
    }
  }

  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    for (const entry of entries) {
      this._events.push({
        eventType: EventType.PrimRemoved,
        primPath: entry.primPath,
        primType: '',
        locator: '',
      })
    }
  }

  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    for (const entry of entries) {
      for (const locator of entry.dirtyLocators) {
        this._events.push({
          eventType: EventType.PrimDirtied,
          primPath: entry.primPath,
          primType: '',
          locator: locator.GetString(),
        })
      }
    }
  }

  primsRenamed(_sender: HdSceneIndexBase, _entries: RenamedPrimEntry[]): void {
    // not exercised by this subset
  }
}

// ----------------------------------------------------------------------------
// helpers

function intDS(value: number): HdRetainedTypedSampledDataSource<number> {
  return HdRetainedTypedSampledDataSource.new(value)
}

function getSceneValue(
  scene: HdSceneIndexBase,
  primPath: string,
  locator: HdDataSourceLocator,
): unknown {
  const prim = scene.getPrim(primPath)
  const ds = HdContainerDataSource.Get(prim.dataSource, locator)
  if (ds instanceof HdSampledDataSource) {
    return ds.GetValue(0)
  }
  return undefined
}

// ----------------------------------------------------------------------------
// _RepopulatingSceneIndex (utility for testing PrimAdded messages)

class _RepopulatingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  static new(inputScene: HdSceneIndexBase): _RepopulatingSceneIndex {
    return new _RepopulatingSceneIndex(inputScene)
  }

  protected constructor(inputScene: HdSceneIndexBase) {
    super(inputScene)
  }

  getPrim(path: string): HdSceneIndexPrim {
    return this._getInputSceneIndex().getPrim(path)
  }

  getChildPrimPaths(path: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(path)
  }

  repopulate(fromRoot = '/'): void {
    const input = this._getInputSceneIndex()
    const entries: AddedPrimEntry[] = []
    const queue: string[] = [fromRoot]

    while (queue.length > 0) {
      const path = queue.pop()!
      const prim = input.getPrim(path)
      entries.push({ primPath: path, primType: prim.primType })
      const childPaths = input.getChildPrimPaths(path)
      for (const c of childPaths) queue.push(c)
    }

    this._sendPrimsAdded(entries)
  }

  protected _primsAdded(
    _sender: HdSceneIndexBase,
    entries: AddedPrimEntry[],
  ): void {
    this._sendPrimsAdded(entries)
  }

  protected _primsRemoved(
    _sender: HdSceneIndexBase,
    entries: RemovedPrimEntry[],
  ): void {
    this._sendPrimsRemoved(entries)
  }

  protected _primsDirtied(
    _sender: HdSceneIndexBase,
    entries: DirtiedPrimEntry[],
  ): void {
    this._sendPrimsDirtied(entries)
  }
}

// ----------------------------------------------------------------------------

describe('TestMergingSceneIndex', () => {
  it('overlays data sources across inputs with earlier inputs stronger', () => {
    const retainedSceneA = HdRetainedSceneIndex.new()
    retainedSceneA.addPrims([
      {
        primPath: '/A',
        primType: 'group',
        dataSource: HdRetainedContainerDataSource.new(
          ['uniqueToA', 'common'],
          [intDS(0), intDS(0)],
        ),
      },
      {
        primPath: '/A/AA',
        primType: 'group',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(1)]),
      },
    ])

    const retainedSceneB = HdRetainedSceneIndex.new()
    retainedSceneB.addPrims([
      {
        primPath: '/A',
        primType: 'group',
        dataSource: HdRetainedContainerDataSource.new(
          ['uniqueToB', 'common'],
          [intDS(1), intDS(1)],
        ),
      },
      {
        primPath: '/A/BB',
        primType: 'group',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(1)]),
      },
      {
        primPath: '/B',
        primType: 'group',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(1)]),
      },
    ])

    const mergingSceneIndex = HdMergingSceneIndex.new()
    mergingSceneIndex.addInputScene(retainedSceneA, '/')
    mergingSceneIndex.addInputScene(retainedSceneB, '/')

    // common: A is stronger -> 0
    expect(
      getSceneValue(mergingSceneIndex, '/A', new HdDataSourceLocator('common')),
    ).toBe(0)
    // uniqueToA -> 0
    expect(
      getSceneValue(
        mergingSceneIndex,
        '/A',
        new HdDataSourceLocator('uniqueToA'),
      ),
    ).toBe(0)
    // uniqueToB -> 1
    expect(
      getSceneValue(
        mergingSceneIndex,
        '/A',
        new HdDataSourceLocator('uniqueToB'),
      ),
    ).toBe(1)
    // /A/AA value -> 1
    expect(
      getSceneValue(
        mergingSceneIndex,
        '/A/AA',
        new HdDataSourceLocator('value'),
      ),
    ).toBe(1)
  })
})

describe('TestMergingSceneIndexPrimAddedNotices', () => {
  it('resolves prim types in PrimsAdded to match GetPrim', () => {
    const retainedSceneA = HdRetainedSceneIndex.new()
    retainedSceneA.addPrims([
      { primPath: '/A', primType: 'chicken', dataSource: undefined },
      {
        primPath: '/A/B',
        primType: 'group',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(1)]),
      },
      {
        // provides a data source but no type
        primPath: '/A/C',
        primType: '',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(1)]),
      },
    ])

    const retainedSceneB = HdRetainedSceneIndex.new()
    retainedSceneB.addPrims([
      { primPath: '/A/B', primType: '', dataSource: undefined }, // no type
      {
        primPath: '/A/C',
        primType: 'taco',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(2)]),
      },
      { primPath: '/A/D', primType: 'salsa', dataSource: undefined },
    ])

    const rpA = _RepopulatingSceneIndex.new(retainedSceneA)
    const rpB = _RepopulatingSceneIndex.new(retainedSceneB)

    const mergingSceneIndex = HdMergingSceneIndex.new()
    mergingSceneIndex.addInputScene(rpA, '/')
    mergingSceneIndex.addInputScene(rpB, '/A')

    const observer = new RecordingSceneIndexObserver()
    mergingSceneIndex.addObserver(observer)

    const expectedTypes = new Map<string, string>([
      ['/', ''],
      ['/A', 'chicken'],
      ['/A/B', 'group'],
      ['/A/C', 'taco'],
      ['/A/D', 'salsa'],
    ])

    const compare = (): void => {
      for (const event of observer.getEvents()) {
        expect(event.eventType).toBe(EventType.PrimAdded)
        expect(expectedTypes.has(event.primPath)).toBe(true)
        const expectedType = expectedTypes.get(event.primPath)!
        expect(event.primType).toBe(expectedType)
        expect(mergingSceneIndex.getPrim(event.primPath).primType).toBe(
          expectedType,
        )
      }
    }

    // repopulation from input b
    rpB.repopulate()
    compare()

    observer.clear()
    // repopulation from input a
    rpA.repopulate()
    compare()
  })
})

describe('HdRetainedSceneIndex notifications and prim-view walk', () => {
  it('emits add/dirty/remove notices and walks descendants depth-first', () => {
    const si = HdRetainedSceneIndex.new()
    const observer = new RecordingSceneIndexObserver()
    si.addObserver(observer)

    si.addPrims([
      { primPath: '/A', primType: 'group', dataSource: undefined },
      {
        primPath: '/A/B',
        primType: 'mesh',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(1)]),
      },
      {
        primPath: '/A/C',
        primType: 'mesh',
        dataSource: HdRetainedContainerDataSource.new(['value'], [intDS(2)]),
      },
    ])

    expect(observer.getEvents().map((e) => [e.eventType, e.primPath])).toEqual([
      [EventType.PrimAdded, '/A'],
      [EventType.PrimAdded, '/A/B'],
      [EventType.PrimAdded, '/A/C'],
    ])

    // Dirty filtering: only paths present in the table are forwarded.
    observer.clear()
    si.dirtyPrims([
      {
        primPath: '/A/B',
        dirtyLocators: new HdDataSourceLocatorSet([
          new HdDataSourceLocator('value'),
        ]),
      },
      {
        primPath: '/Absent',
        dirtyLocators: new HdDataSourceLocatorSet([
          new HdDataSourceLocator('value'),
        ]),
      },
    ])
    expect(
      observer.getEvents().map((e) => [e.eventType, e.primPath, e.locator]),
    ).toEqual([[EventType.PrimDirtied, '/A/B', 'value']])

    // Prim-view walk (depth-first). Retained children are returned in
    // reverse-insertion order (SdfPathTable prepends), so C precedes B.
    const walked: string[] = []
    for (const path of new HdSceneIndexPrimView(si, '/A')) {
      walked.push(path)
    }
    expect(walked).toEqual(['/A', '/A/C', '/A/B'])

    // Remove a subtree.
    observer.clear()
    si.removePrims([{ primPath: '/A/B' }])
    expect(observer.getEvents().map((e) => [e.eventType, e.primPath])).toEqual([
      [EventType.PrimRemoved, '/A/B'],
    ])
    expect(si.getChildPrimPaths('/A')).toEqual(['/A/C'])
  })
})
