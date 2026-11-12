// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hd/sceneIndexAdapterSceneDelegate.cpp,
//  pxr/imaging/hd/primTypeIndex.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Tests HdRenderIndex lifecycle and observer wiring using a mock delegate.
// No GPU code involved.

import { describe, it, expect, vi } from 'vitest'
import {
  RenderIndex as HdRenderIndex,
  RenderDelegate as HdRenderDelegate,
  Rprim as HdRprim,
  Sprim as HdSprim,
  Bprim as HdBprim,
  ChangeTracker as HdChangeTracker,
  SceneIndexBase as HdSceneIndexBase,
  Tokens as HdTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  SceneIndexPrim as HdSceneIndexPrim,
  DirtyBits as HdDirtyBits,
  SceneIndexObserver as HdSceneIndexObserver,
  type AddedPrimEntry,
  type RemovedPrimEntry,
  type DirtiedPrimEntry,
  type RenamedPrimEntry,
} from '../../src/index.ts'

// ---- Mock Rprim ----

class MockRprim extends HdRprim {
  syncCalls: Array<{ dirtyBits: HdDirtyBits; reprToken: string }> = []

  getInitialDirtyBitsMask(): HdDirtyBits { return HdChangeTracker.AllDirty }

  sync(_prim: HdSceneIndexPrim, dirtyBits: HdDirtyBits, reprToken: string): void {
    this.syncCalls.push({ dirtyBits, reprToken })
  }
}

// ---- Mock Delegate ----

class MockDelegate extends HdRenderDelegate {
  created: string[] = []
  destroyed: string[] = []
  committed = 0
  private _rprims = new Map<string, MockRprim>()

  getSupportedRprimTypes() { return [HdTokens.mesh] }
  getSupportedSprimTypes() { return [] }
  getSupportedBprimTypes() { return [] }

  createRprim(_typeId: string, rprimId: string): HdRprim {
    this.created.push(rprimId)
    const rprim = new MockRprim(rprimId)
    this._rprims.set(rprimId, rprim)
    return rprim
  }
  destroyRprim(rprim: HdRprim): void { this.destroyed.push(rprim.getId()) }
  createSprim(): HdSprim { throw new Error('not supported') }
  destroySprim(): void {}
  createBprim(): HdBprim { throw new Error('not supported') }
  destroyBprim(): void {}
  CommitResources(): void { this.committed++ }

  getMockRprim(id: string): MockRprim | undefined { return this._rprims.get(id) }
}

// ---- Minimal in-memory scene index ----

class StaticSceneIndex extends HdSceneIndexBase {
  private _prims = new Map<string, HdSceneIndexPrim>()
  private _children = new Map<string, string[]>()

  addPrim(path: string, primType: string, parentPath = '/') {
    this._prims.set(path, {
      primType,
      dataSource: HdRetainedContainerDataSource.new([], []),
    })
    const siblings = this._children.get(parentPath) ?? []
    siblings.push(path)
    this._children.set(parentPath, siblings)
  }

  notifyAdded(entries: AddedPrimEntry[]) { this._sendPrimsAdded(entries) }
  notifyRemoved(entries: RemovedPrimEntry[]) { this._sendPrimsRemoved(entries) }
  notifyDirtied(entries: DirtiedPrimEntry[]) { this._sendPrimsDirtied(entries) }

  getPrim(path: string): HdSceneIndexPrim {
    return this._prims.get(path) ?? { primType: '', dataSource: undefined }
  }

  getChildPrimPaths(path: string): string[] {
    return this._children.get(path) ?? []
  }
}

// ---- Tests ----

describe('HdRenderIndex.New', () => {
  it('creates an index with no rprims', () => {
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    expect(index.getRprimIds()).toHaveLength(0)
  })
})

describe('HdRenderIndex.SetSceneIndex', () => {
  it('populates rprims from existing scene', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)

    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    expect(delegate.created).toContain('/Cube')
    expect(index.hasRprim('/Cube')).toBe(true)
  })

  it('ignores prims with unsupported types', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Light', 'light')

    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    expect(delegate.created).toHaveLength(0)
    expect(index.hasRprim('/Light')).toBe(false)
  })

  it('populates nested prims', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/World', 'xform')
    si.addPrim('/World/Cube', HdTokens.mesh, '/World')

    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    expect(index.hasRprim('/World/Cube')).toBe(true)
  })
})

describe('HdRenderIndex observer: PrimsAdded', () => {
  it('inserts rprim when scene index sends PrimsAdded', () => {
    const si = new StaticSceneIndex()
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    si.addPrim('/Sphere', HdTokens.mesh)
    si.notifyAdded([{ primPath: '/Sphere', primType: HdTokens.mesh }])

    expect(index.hasRprim('/Sphere')).toBe(true)
    expect(delegate.created).toContain('/Sphere')
  })

  it('does not double-insert on duplicate PrimsAdded', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    // Send added again — should be ignored
    si.notifyAdded([{ primPath: '/Cube', primType: HdTokens.mesh }])

    expect(delegate.created.filter(id => id === '/Cube')).toHaveLength(1)
  })
})

// sceneIndexAdapterSceneDelegate.cpp:232-337: an added entry for an existing
// prim of the same type is a resync that invalidates all of its properties;
// another type replaces the prim.
describe('HdRenderIndex observer: PrimsAdded resync', () => {
  it('re-added prim of the same type keeps the rprim and syncs it AllDirty', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)
    index.SyncAll()
    si.notifyAdded([{ primPath: '/Cube', primType: HdTokens.mesh }])
    index.SyncAll()
    const calls = delegate.getMockRprim('/Cube')!.syncCalls
    expect(calls).toHaveLength(2)
    const bits = HdChangeTracker.DirtyTopology | HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyTransform
    expect(calls[1]!.dirtyBits & bits).toBe(bits)
    expect(delegate.destroyed).toEqual([])
  })

  it('re-added prim of another type replaces the prim only, not its descendants', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/World', HdTokens.mesh)
    si.addPrim('/World/Cube', HdTokens.mesh, '/World')
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)
    si.notifyAdded([{ primPath: '/World', primType: '' }])
    expect(index.hasRprim('/World')).toBe(false)
    expect(index.hasRprim('/World/Cube')).toBe(true)
    expect(delegate.destroyed).toEqual(['/World'])
  })
})

describe('HdRenderIndex observer: PrimsRemoved', () => {
  it('destroys rprim when scene index sends PrimsRemoved', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    si.notifyRemoved([{ primPath: '/Cube' }])

    expect(index.hasRprim('/Cube')).toBe(false)
    expect(delegate.destroyed).toContain('/Cube')
  })
})

describe('HdRenderIndex observer: PrimsDirtied', () => {
  function makeSyncedIndex() {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)
    index.SyncAll()  // clear initial AllDirty
    return { si, delegate, index }
  }

  function lastDirtyBits(delegate: MockDelegate): HdDirtyBits | undefined {
    const calls = delegate.getMockRprim('/Cube')?.syncCalls ?? []
    return calls[calls.length - 1]?.dirtyBits
  }

  it('marks rprim dirty and calls Sync on next SyncAll', () => {
    const { si, delegate, index } = makeSyncedIndex()
    expect(delegate.getMockRprim('/Cube')?.syncCalls).toHaveLength(1)

    const locators = new HdDataSourceLocatorSet()
    locators.add(new HdDataSourceLocator(HdTokens.xform))
    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: locators }])

    index.SyncAll()
    expect(delegate.getMockRprim('/Cube')?.syncCalls).toHaveLength(2)
  })

  it('empty locator set leaves the rprim clean', () => {
    const { si, delegate, index } = makeSyncedIndex()

    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: new HdDataSourceLocatorSet() }])

    index.SyncAll()
    expect(delegate.getMockRprim('/Cube')?.syncCalls).toHaveLength(1)
  })

  it('xform locator translates to DirtyTransform only', () => {
    const { si, delegate, index } = makeSyncedIndex()

    const locators = new HdDataSourceLocatorSet()
    locators.add(new HdDataSourceLocator(HdTokens.xform))
    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: locators }])
    index.SyncAll()

    expect(lastDirtyBits(delegate)).toBe(HdChangeTracker.DirtyTransform)
  })

  it('primvars locator translates to DirtyPrimvar|DirtyPoints|DirtyNormals', () => {
    const { si, delegate, index } = makeSyncedIndex()

    const locators = new HdDataSourceLocatorSet()
    locators.add(new HdDataSourceLocator(HdTokens.primvars))
    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: locators }])
    index.SyncAll()

    expect(lastDirtyBits(delegate)).toBe(
      HdChangeTracker.DirtyPrimvar | HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyNormals | HdChangeTracker.DirtyWidths,
    )
  })

  it('mesh/topology locator translates to DirtyTopology', () => {
    const { si, delegate, index } = makeSyncedIndex()

    const locators = new HdDataSourceLocatorSet()
    locators.add(new HdDataSourceLocator(HdTokens.mesh, HdTokens.topology))
    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: locators }])
    index.SyncAll()

    expect(lastDirtyBits(delegate)).toBe(HdChangeTracker.DirtyTopology)
  })

  it('combined locators OR their dirty bits together', () => {
    const { si, delegate, index } = makeSyncedIndex()

    const locators = new HdDataSourceLocatorSet()
    locators.add(new HdDataSourceLocator(HdTokens.xform))
    locators.add(new HdDataSourceLocator(HdTokens.primvars))
    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: locators }])
    index.SyncAll()

    expect(lastDirtyBits(delegate)).toBe(
      HdChangeTracker.DirtyTransform |
      HdChangeTracker.DirtyPrimvar | HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyNormals | HdChangeTracker.DirtyWidths,
    )
  })

  it('universal set (empty locator) translates to AllDirty', () => {
    const { si, delegate, index } = makeSyncedIndex()

    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: HdDataSourceLocatorSet.UniversalSet }])
    index.SyncAll()

    // |= coerces to signed 32-bit; compare unsigned
    expect(lastDirtyBits(delegate)! >>> 0).toBe(HdChangeTracker.AllDirty)
  })

  it('unrecognized locator falls back to AllDirty', () => {
    const { si, delegate, index } = makeSyncedIndex()

    const locators = new HdDataSourceLocatorSet()
    locators.add(new HdDataSourceLocator('material'))
    si.notifyDirtied([{ primPath: '/Cube', dirtyLocators: locators }])
    index.SyncAll()

    expect(lastDirtyBits(delegate)! >>> 0).toBe(HdChangeTracker.AllDirty)
  })
})

describe('HdRenderIndex.SyncAll', () => {
  it('calls CommitResources after syncing all prims', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/A', HdTokens.mesh)
    si.addPrim('/B', HdTokens.mesh, '/')
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    index.SyncAll()

    expect(delegate.committed).toBe(1)
  })

  it('does not sync clean rprims', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    index.SyncAll()  // syncs once (AllDirty from creation)
    index.SyncAll()  // second call — should not sync again

    expect(delegate.getMockRprim('/Cube')?.syncCalls).toHaveLength(1)
  })

  it('passes reprToken through to rprim.Sync', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/Cube', HdTokens.mesh)
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    index.SyncAll('wireframe')

    expect(delegate.getMockRprim('/Cube')?.syncCalls[0]?.reprToken).toBe('wireframe')
  })
})

describe('HdRenderIndex.GetRprimIds', () => {
  it('returns all registered rprim paths', () => {
    const si = new StaticSceneIndex()
    si.addPrim('/A', HdTokens.mesh)
    si.addPrim('/B', HdTokens.mesh, '/')

    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)

    const ids = index.getRprimIds()
    expect(ids).toContain('/A')
    expect(ids).toContain('/B')
  })
})

describe('HdRenderIndex subtree queries: path order', () => {
  // primTypeIndex.cpp:286-303: GetPrimSubtree gathers over Hd_SortedIds, so
  // ids come back in SdfPath order whatever order the prims arrived in.
  // HdxSimpleLightTask keeps the first 16 lights of that order: with load
  // order instead, a viewer streaming payloads lit different lamps than
  // usdview.
  it('returns rprims in SdfPath order, not insertion order', () => {
    const si = new StaticSceneIndex()
    const delegate = new MockDelegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(si)
    const arrival = ['/scene/stage/Lamp_1', '/scene/animation/Lamp_10', '/scene/animation/Lamp_2',
      '/scene/animation', '/scene/a/b', '/scene/animation/Lamp_1']
    for (const p of arrival) {
      si.addPrim(p, HdTokens.mesh)
      si.notifyAdded([{ primPath: p, primType: HdTokens.mesh }])
    }
    expect(index.getRprimSubtree('/')).toEqual(['/scene/a/b', '/scene/animation', '/scene/animation/Lamp_1',
      '/scene/animation/Lamp_10', '/scene/animation/Lamp_2', '/scene/stage/Lamp_1'])
    expect(index.getRprimSubtree('/scene/animation')).toEqual(['/scene/animation', '/scene/animation/Lamp_1',
      '/scene/animation/Lamp_10', '/scene/animation/Lamp_2'])
  })
})
