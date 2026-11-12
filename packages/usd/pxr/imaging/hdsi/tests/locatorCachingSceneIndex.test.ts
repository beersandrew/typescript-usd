// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/locatorCachingSceneIndex.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdsiLocatorCachingSceneIndex (locatorCachingSceneIndex.cpp:209-227,
// _PrimsAdded): re-adding a prim drops its cached data sources. Upstream's
// _primDsCache is an SdfPathTable, which also holds (empty) entries for the
// ancestors of every cached prim; re-adding such an ancestor, as a payload
// load's resync does for the carrier above newly composed prims, must clear
// nothing and pass the notice on.
import { describe, expect, it } from 'vitest'
import {
  DataSourceLocator as HdDataSourceLocator,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import { LocatorCachingSceneIndex as HdsiLocatorCachingSceneIndex } from 'typescript-usd/hdsi'

const prim = (value: number) => HdRetainedContainerDataSource.new(['material'],
  [HdRetainedContainerDataSource.new(['value'], [HdRetainedTypedSampledDataSource.new<number>(value)])])
const material = (si: HdsiLocatorCachingSceneIndex, path: string) =>
  si.getPrim(path).dataSource!.Get('material') as HdContainerDataSource

describe('HdsiLocatorCachingSceneIndex', () => {
  it('re-adding a prim or an ancestor of a cached prim drops only that prim\'s cache', () => {
    const input = HdRetainedSceneIndex.new()
    input.addPrims([{ primPath: '/A', primType: 'scope', dataSource: prim(0) }, { primPath: '/A/B', primType: 'mesh', dataSource: prim(1) }])
    const si = HdsiLocatorCachingSceneIndex.new(input, new HdDataSourceLocator('material'), '')!
    const added: string[] = []
    si.addObserver({ primsAdded: (_s, entries) => { for (const e of entries) added.push(e.primPath) }, primsRemoved() {}, primsDirtied() {}, primsRenamed() {} })
    const cached = material(si, '/A/B')
    expect(material(si, '/A/B')).toBe(cached)
    expect(() => input.addPrims([{ primPath: '/A', primType: 'scope', dataSource: prim(0) }])).not.toThrow()
    expect(material(si, '/A/B')).toBe(cached)
    input.addPrims([{ primPath: '/A/B', primType: 'mesh', dataSource: prim(2) }])
    expect(material(si, '/A/B')).not.toBe(cached)
    expect(added).toEqual(['/A', '/A/B'])
  })
})
