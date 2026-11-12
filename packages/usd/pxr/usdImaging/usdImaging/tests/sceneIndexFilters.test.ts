// UsdImagingExtentResolvingSceneIndex, UsdImagingSelectionSceneIndex and
// UsdImagingRootOverridesSceneIndex against the reference build.
//
// OpenUSD has no testenv test for these filters. The native capture of
// fixtures/sceneIndexFilters feeds each filter an HdRetainedSceneIndex and
// records what it outputs and which notices it sends; expected.json is that
// capture (FIXTURES.md). The input scenes below mirror the capture's
// PopulateExtentScene and PopulateSelectionScene.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Matrix4d as GfMatrix4d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ExtentSchema as HdExtentSchema,
  InstanceIndicesSchema as HdInstanceIndicesSchema,
  RenderTagTokens as HdRenderTagTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SelectionsSchema as HdSelectionsSchema,
  VisibilitySchema as HdVisibilitySchema,
  XformSchema as HdXformSchema,
  type ContainerDataSource as HdContainerDataSource,
  type DataSourceBase as HdDataSourceBase,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  UsdImagingExtentResolvingSceneIndex,
  UsdImagingExtentResolvingSceneIndexTokens,
} from '../src/extentResolvingSceneIndex.ts'
import { UsdImagingRootOverridesSceneIndex } from '../src/rootOverridesSceneIndex.ts'
import { UsdImagingSelectionSceneIndex } from '../src/selectionSceneIndex.ts'

const expected = JSON.parse(readFileSync(
  path.resolve(__dirname, 'fixtures/sceneIndexFilters/expected.json'), 'utf8')).payload

// --- Input scene helpers (the capture's C/V/Val/Extent) ---

const C = (entries: [string, HdDataSourceBase][]): HdContainerDataSource =>
  HdRetainedContainerDataSource.new(entries.map(e => e[0]), entries.map(e => e[1]))
const V = (elements: HdDataSourceBase[]) => HdRetainedSmallVectorDataSource.new(elements)
const Val = <T>(v: T) => HdRetainedTypedSampledDataSource.new(v)
const Int = (v: number) => new HdRetainedTypedSampledDataSource(v, VtValueTypes.int)
const Extent = (a: number, b: number) => C([
  ['min', Val(new GfVec3d(a, a, a))],
  ['max', Val(new GfVec3d(b, b, b))],
])

function PopulateExtentScene(si: HdRetainedSceneIndex): void {
  si.addPrims([
    { primPath: '/World', primType: '', dataSource: C([]) },
    { primPath: '/World/A', primType: 'mesh', dataSource: C([
      ['extentsHint', C([['geometry', Extent(-1, 1)], ['render', Extent(-3, 2)]])]]) },
    { primPath: '/World/B', primType: 'mesh', dataSource: C([
      ['extent', Extent(-5, 5)],
      ['extentsHint', C([['geometry', Extent(-1, 1)]])]]) },
    { primPath: '/World/C', primType: 'mesh', dataSource: C([]) },
    { primPath: '/World/D', primType: '', dataSource: C([
      ['extentsHint', C([['proxy', Extent(0, 4)], ['guide', Extent(-9, 9)]])]]) },
  ])
}

function PopulateSelectionScene(si: HdRetainedSceneIndex): void {
  const niInstancer = '/UsdNiPropagatedPrototypes/P/__Prototype_1/UsdNiInstancer'
  const niPrototype = `${niInstancer}/UsdNiPrototype`
  const instancedBy = C([
    ['paths', Val(['/MyInstancer'])],
    ['prototypeRoots', Val(['/MyPrototype/ForInstancer'])]])
  const instance = (index: number) => C([['instance', C([
    ['instancer', Val(niInstancer)],
    ['prototypeIndex', Int(0)],
    ['instanceIndex', Int(index)]])]])
  si.addPrims([
    { primPath: '/World', primType: '', dataSource: C([]) },
    { primPath: '/World/Mesh', primType: 'mesh', dataSource: C([]) },
    { primPath: '/World/Curves', primType: 'basisCurves', dataSource: C([]) },
    { primPath: '/World/Light', primType: 'sphereLight', dataSource: C([]) },
    { primPath: '/World/Proc', primType: 'hydraGenerativeProcedural', dataSource: C([]) },
    { primPath: '/World/Pre', primType: 'mesh', dataSource: C([
      ['selections', V([C([['fullySelected', Val(false)]])])]]) },
    { primPath: '/World/Sub', primType: '', dataSource: C([]) },
    { primPath: '/World/Sub/Points', primType: 'points', dataSource: C([]) },

    { primPath: '/MyInstancer', primType: 'instancer', dataSource: C([
      ['instancerTopology', C([
        ['prototypes', Val(['/MyPrototype/ForInstancer'])],
        ['instanceIndices', V([Val([0, 1])])]])]]) },
    { primPath: '/MyPrototype', primType: '', dataSource: C([
      ['__usdPrimInfo', C([
        ['piPropagatedPrototypes', C([
          ['ForInstancer', Val('/MyPrototype/ForInstancer')]])]])]]) },
    { primPath: '/MyPrototype/Cube', primType: 'cube', dataSource: C([]) },
    { primPath: '/MyPrototype/ForInstancer', primType: '', dataSource: C([['instancedBy', instancedBy]]) },
    { primPath: '/MyPrototype/ForInstancer/Cube', primType: 'cube', dataSource: C([['instancedBy', instancedBy]]) },

    { primPath: '/Instance1', primType: '', dataSource: instance(0) },
    { primPath: '/Instance2', primType: '', dataSource: instance(1) },
    { primPath: '/Group', primType: '', dataSource: C([]) },
    { primPath: '/Group/Instance3', primType: '', dataSource: instance(2) },
    { primPath: '/UsdNiPropagatedPrototypes', primType: '', dataSource: C([]) },
    { primPath: '/UsdNiPropagatedPrototypes/P', primType: '', dataSource: C([]) },
    { primPath: '/UsdNiPropagatedPrototypes/P/__Prototype_1', primType: '', dataSource: C([]) },
    { primPath: niInstancer, primType: 'instancer', dataSource: C([
      ['instancerTopology', C([
        ['prototypes', Val([niPrototype])],
        ['instanceIndices', V([Val([0, 1, 2])])],
        ['instanceLocations', Val(['/Instance1', '/Instance2', '/Group/Instance3'])]])]]) },
    { primPath: niPrototype, primType: '', dataSource: C([]) },
    { primPath: `${niPrototype}/cube`, primType: 'cube', dataSource: C([]) },
  ])
}

// --- Output helpers (the capture's Recorder/Dump) ---

class Recorder implements HdSceneIndexObserver {
  notices: unknown[] = []
  primsAdded(_s: HdSceneIndexBase, entries: { primPath: string, primType: string }[]): void {
    for (const e of entries) this.notices.push({ added: e.primPath, type: e.primType })
  }
  primsRemoved(_s: HdSceneIndexBase, entries: { primPath: string }[]): void {
    for (const e of entries) this.notices.push({ removed: e.primPath })
  }
  primsDirtied(_s: HdSceneIndexBase, entries: { primPath: string, dirtyLocators: HdDataSourceLocatorSet }[]): void {
    for (const e of entries) {
      this.notices.push({ dirtied: e.primPath, locators: [...e.dirtyLocators].map(l => l.GetString()) })
    }
  }
  primsRenamed(): void {}
  take(): unknown[] {
    const r = this.notices
    this.notices = []
    return r
  }
}

const vec3 = (v: GfVec3d) => [...v.data]
const toArray = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : (v as { toArray(): unknown[] }).toArray()

function ExtentJson(primDs: HdContainerDataSource) {
  const s = HdExtentSchema.getFromParent(primDs)
  if (!s.isDefined()) return null
  const r: Record<string, unknown> = {}
  const min = s.getMin()
  if (min) r.min = vec3(min.getTypedValue(0))
  const max = s.getMax()
  if (max) r.max = vec3(max.getTypedValue(0))
  return r
}

function SelectionsJson(primDs: HdContainerDataSource) {
  const sels = HdSelectionsSchema.getFromParent(primDs)
  if (!sels.isDefined()) return null
  const r: unknown[] = []
  for (let i = 0; i < sels.getNumElements(); ++i) {
    const sel = sels.getElement(i)
    // HdSelectionSchema.GetFullySelected (hd/src/selectionSchema.ts) only
    // accepts HdBoolDataSource subclasses; read the child as
    // HdSchema::_GetTypedDataSource does.
    const fs = sel.getContainer()?.Get('fullySelected') as { getTypedValue(t: number): boolean } | undefined
    const entry: Record<string, unknown> = { fullySelected: fs ? fs.getTypedValue(0) : null }
    const nested = sel.getNestedInstanceIndices()
    if (nested) {
      const list: unknown[] = []
      for (let j = 0; j < nested.getNumElements(); ++j) {
        const ii = new HdInstanceIndicesSchema(nested.getElement(j) as HdContainerDataSource)
        list.push({
          instancer: ii.getInstancer()!.getTypedValue(0),
          prototypeIndex: ii.getPrototypeIndex()!.getTypedValue(0),
          instanceIndices: toArray(ii.getInstanceIndices()!.getTypedValue(0)),
        })
      }
      entry.nestedInstanceIndices = list
    }
    r.push(entry)
  }
  return r
}

function Dump(si: HdSceneIndexBase) {
  const r: unknown[] = []
  for (const p of new HdSceneIndexPrimView(si)) {
    const prim = si.getPrim(p)
    const entry: Record<string, unknown> = { path: p, type: prim.primType }
    if (prim.dataSource) {
      entry.names = prim.dataSource.getNames()
      entry.extent = ExtentJson(prim.dataSource)
      entry.selections = SelectionsJson(prim.dataSource)
    }
    r.push(entry)
  }
  return r
}

describe('UsdImagingExtentResolvingSceneIndex (reference capture)', () => {
  const input = HdRetainedSceneIndex.new()
  PopulateExtentScene(input)
  const purposesArgs = (purposes: string[]) => C([[
    UsdImagingExtentResolvingSceneIndexTokens.purposes,
    V(purposes.map(p => Val(p)))]])

  it('uses the geometry extentsHint by default', () => {
    expect(Dump(UsdImagingExtentResolvingSceneIndex.new(input, undefined)))
      .toEqual(expected.extentDefaultArgs)
  })

  it('uses the render extentsHint for purposes [render]', () => {
    expect(Dump(UsdImagingExtentResolvingSceneIndex.new(input, purposesArgs([HdRenderTagTokens.render]))))
      .toEqual(expected.extentRenderArgs)
  })

  it('unions the extentsHints of purposes geometry, render, proxy', () => {
    const si = UsdImagingExtentResolvingSceneIndex.new(input, purposesArgs([
      HdRenderTagTokens.geometry, HdRenderTagTokens.render, HdRenderTagTokens.proxy]))
    expect(Dump(si)).toEqual(expected.extentUsdImagingArgs)

    const rec = new Recorder()
    si.addObserver(rec)
    input.dirtyPrims([
      { primPath: '/World/A', dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('extentsHint')]) },
      { primPath: '/World/B', dirtyLocators: new HdDataSourceLocatorSet([
        new HdDataSourceLocator('extentsHint'), new HdDataSourceLocator('extent')]) },
      { primPath: '/World/C', dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('xform')]) },
      { primPath: '/World/D', dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('extentsHint', 'proxy')]) },
    ])
    expect(rec.take()).toEqual(expected.extentDirtied)
    input.dirtyPrims([
      { primPath: '/World/C', dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('xform')]) },
    ])
    expect(rec.take()).toEqual(expected.extentDirtiedUntouched)
    si.removeObserver(rec)
  })
})

describe('UsdImagingSelectionSceneIndex (reference capture)', () => {
  it('adds, clears and prunes selections as the reference does', () => {
    const input = HdRetainedSceneIndex.new()
    PopulateSelectionScene(input)
    const si = UsdImagingSelectionSceneIndex.new(input)
    const rec = new Recorder()
    si.addObserver(rec)

    expect(Dump(si)).toEqual(expected.selectionInitial)

    const steps = expected.selectionSteps as Record<string, unknown>[]
    let step = 0
    for (const usdPath of ['/World', '/Instance1', '/Instance2/cube', '/MyPrototype/Cube',
      '/World/Mesh', '/Group', '/']) {
      si.addSelection(usdPath)
      expect({ addSelection: usdPath, notices: rec.take(), prims: Dump(si) }).toEqual(steps[step++])
    }
    si.clearSelection()
    expect({ clearSelection: true, notices: rec.take(), prims: Dump(si) }).toEqual(steps[step++])
    si.clearSelection()
    expect({ clearSelection: true, notices: rec.take() }).toEqual(steps[step++])

    // Removing a prim drops the selections of its subtree.
    si.addSelection('/World')
    rec.take()
    input.removePrims([{ primPath: '/World/Sub' }])
    const removed = rec.take()
    input.addPrims([
      { primPath: '/World/Sub', primType: '', dataSource: C([]) },
      { primPath: '/World/Sub/Points', primType: 'points', dataSource: C([]) },
    ])
    expect({ removeAndReAdd: '/World/Sub', notices: removed, readded: rec.take(), prims: Dump(si) })
      .toEqual(steps[step++])
    expect(step).toBe(steps.length)
  })
})

describe('UsdImagingRootOverridesSceneIndex (reference capture)', () => {
  it('overrides the root transform and visibility', () => {
    const input = HdRetainedSceneIndex.new()
    input.addPrims([{ primPath: '/World', primType: '', dataSource: C([]) }])
    const si = UsdImagingRootOverridesSceneIndex.new(input)
    const rec = new Recorder()
    si.addObserver(rec)

    const root = () => {
      const prim = si.getPrim('/')
      const m = HdXformSchema.getFromParent(prim.dataSource).getMatrix()!.getTypedValue(0) as GfMatrix4d
      const matrix: number[] = []
      matrix.push(...m.GetArray())
      return {
        type: prim.primType,
        names: prim.dataSource!.getNames(),
        matrix,
        visibility: HdVisibilitySchema.getFromParent(prim.dataSource).getVisibility()!.getTypedValue(0),
        worldNames: si.getPrim('/World').dataSource!.getNames(),
      }
    }

    expect(root()).toEqual(expected.rootInitial)
    const m = new GfMatrix4d(1.0)
    m.setTranslate(new GfVec3d(1, 2, 3))
    si.setRootTransform(m)
    expect({ notices: rec.take(), root: root() }).toEqual(expected.rootSetTransform)
    si.setRootTransform(m)
    expect({ notices: rec.take() }).toEqual(expected.rootSetSameTransform)
    si.setRootVisibility(false)
    expect({ notices: rec.take(), root: root() }).toEqual(expected.rootSetVisibility)
    si.setRootVisibility(false)
    expect({ notices: rec.take() }).toEqual(expected.rootSetSameVisibility)
  })
})
