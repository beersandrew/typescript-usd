// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/nurbsApproximatingSceneIndex.cpp,
//  pxr/imaging/hdsi/tetMeshConversionSceneIndex.cpp
// Copyright 2023, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdsiNurbsApproximatingSceneIndex and HdsiTetMeshConversionSceneIndex
// (pxr/imaging/hdsi/nurbsApproximatingSceneIndex.cpp,
// tetMeshConversionSceneIndex.cpp, OpenUSD 26.11.1) over a
// UsdImagingStageSceneIndex of the upstream testenv scenes copied to
// pxr/usdImaging/usdImaging/tests/fixtures/gprims, checked against the
// reference build's output for the same chain
// (fixtures/nurbsTetMeshConversion): converted prim types and
// data sources at several times, the added notices, and the dirtied
// notices after attribute edits. OpenUSD has no testenv test for these
// scene indices.
//
// The dirtied notices are compared as the union of dirty locators per prim:
// how UsdImagingStageSceneIndex batches the property changes of one
// ApplyPendingUpdates into notices is not what is under test here.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  SampledDataSource as HdSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import {
  NurbsApproximatingSceneIndex as HdsiNurbsApproximatingSceneIndex,
  TetMeshConversionSceneIndex as HdsiTetMeshConversionSceneIndex,
} from 'typescript-usd/hdsi'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'

const scenes = new URL('../../../usdImaging/usdImaging/tests/fixtures/gprims/', import.meta.url)
const expected = JSON.parse(readFileSync(
  new URL('./fixtures/nurbsTetMeshConversion/expected.json', import.meta.url), 'utf8')).payload as
  Record<string, {
    added: [string, string][]
    prims: Record<string, Record<string, unknown>>
    dirtiedAfterEdit: [string, string[]][]
  }>

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** The capture's _Value */
function value(v: unknown): Json {
  if (v instanceof VtValue) return v.IsEmpty() ? '<empty>' : value(v.UncheckedGet())
  if (v instanceof VtArray) return v.toArray().map(value)
  if (Array.isArray(v)) return v.map(value)
  if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') return v
  if (v && typeof v === 'object' && 'GetString' in v) return (v as { GetString(): string }).GetString()
  return `<${String(v)}>`
}

/** The capture's _Dump */
function dump(ds: HdDataSourceBase | undefined): Json {
  if (ds instanceof HdContainerDataSource) {
    const o: { [k: string]: Json } = {}
    for (const name of ds.getNames()) {
      const child = ds.Get(name)
      if (child) o[name] = dump(child)
    }
    return o
  }
  if (ds instanceof HdSampledDataSource) return value(ds.GetValue(0))
  return '<other>'
}

/** The capture's _Prim */
function prim(si: HdSceneIndexBase, path: string): Json {
  const p = si.getPrim(path)
  const ds: { [k: string]: Json } = {}
  for (const n of ['mesh', 'basisCurves', '__dependencies', 'nurbsPatch', 'nurbsCurves']) {
    const child = p.dataSource?.Get(n)
    ds[n] = child ? dump(child) : null
  }
  return { primType: p.primType, dataSource: ds }
}

class Recorder implements HdSceneIndexObserver {
  added: [string, string][] = []
  dirtied: [string, HdDataSourceLocatorSet][] = []
  primsAdded(_s: HdSceneIndexBase, entries: { primPath: string, primType: string }[]): void {
    for (const e of entries) this.added.push([e.primPath, e.primType])
  }
  primsRemoved(): void {}
  primsDirtied(_s: HdSceneIndexBase, entries: { primPath: string, dirtyLocators: HdDataSourceLocatorSet }[]): void {
    for (const e of entries) this.dirtied.push([e.primPath, e.dirtyLocators])
  }
  primsRenamed(): void {}
}

function collect(si: HdSceneIndexBase, path: string, out: string[]): string[] {
  out.push(path)
  for (const c of si.getChildPrimPaths(path)) collect(si, c, out)
  return out
}

/** The capture's _Edit */
function edit(stage: UsdStage, scene: string): void {
  if (scene === 'tetMesh.usda') {
    const p = stage.getPrim('/RightHanded/tetMesh2')!
    p.attr('doubleSided').set(true)
    p.attr('surfaceFaceVertexIndices').set([[0, 1, 3], [1, 2, 3]])
    stage.getPrim('/LeftHanded/tetMesh')!.attr('primvars:displayColor').set([[1, 0, 0]])
  } else if (scene === 'nurbsPatch.usda') {
    const p = stage.getPrim('/USDNurbsBend/BendyNurbs')!
    p.attr('doubleSided').set(false)
    p.attr('uOrder').set(3)
  } else if (scene === 'nurbsCurves.usda') {
    const p = stage.getPrim('/world/DifferentOrders/nurbs_order2')!
    p.attr('curveVertexCounts').set([4])
    p.attr('order').set([3])
  }
}

const converted = new Set<string>([
  HdPrimTypeTokens.mesh, HdPrimTypeTokens.basisCurves, HdPrimTypeTokens.nurbsPatch,
  HdPrimTypeTokens.nurbsCurves, HdPrimTypeTokens.tetMesh])

const byPrim = (entries: [string, Iterable<{ toString(): string } | string>][]): Record<string, string[]> => {
  const r: Record<string, Set<string>> = {}
  for (const [path, locs] of entries) {
    const s = r[path] ??= new Set()
    for (const l of locs) s.add(String(l))
  }
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]))
}

describe('HdsiNurbsApproximatingSceneIndex and HdsiTetMeshConversionSceneIndex over the stage scene index', () => {
  for (const [scene, exp] of Object.entries(expected)) {
    describe(scene, async () => {
      const stage = (await UsdStage.open(new URL(scene, scenes).pathname))!
      const stageSi = UsdImagingStageSceneIndex.new()
      const si = HdsiTetMeshConversionSceneIndex.new(HdsiNurbsApproximatingSceneIndex.new(stageSi))
      const recorder = new Recorder()
      si.addObserver(recorder)
      stageSi.SetStage(stage)

      it('added notices carry the converted prim types', () => {
        const added = recorder.added.filter(([, t]) => converted.has(t)).sort((a, b) => a[0] < b[0] ? -1 : 1)
        expect(added).toEqual(exp.added)
      })

      const paths = collect(si, '/', [])
      for (const [time, prims] of Object.entries(exp.prims)) {
        it(`converted prims at time ${time}`, () => {
          stageSi.SetTime(new UsdTimeCode(Number(time)))
          const actual: Record<string, Json> = {}
          for (const p of paths) {
            const inType = stageSi.getPrim(p).primType
            if (inType !== HdPrimTypeTokens.nurbsPatch && inType !== HdPrimTypeTokens.nurbsCurves &&
                inType !== HdPrimTypeTokens.tetMesh) continue
            actual[p] = prim(si, p)
          }
          expect(actual).toEqual(prims)
        })
      }

      it('dirtied notices after attribute edits', () => {
        recorder.dirtied = []
        edit(stage, scene)
        stageSi.ApplyPendingUpdates()
        expect(byPrim(recorder.dirtied)).toEqual(byPrim(exp.dirtiedAfterEdit))
      })
    })
  }
})
