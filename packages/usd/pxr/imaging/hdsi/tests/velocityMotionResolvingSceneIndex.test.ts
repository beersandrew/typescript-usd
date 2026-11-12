// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/velocityMotionResolvingSceneIndex.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdsiVelocityMotionResolvingSceneIndex
// (pxr/imaging/hdsi/velocityMotionResolvingSceneIndex.cpp, OpenUSD 26.11.1)
// checked against the reference build's output for the same chains
// (fixtures/velocityMotion):
// - over a UsdImagingStageSceneIndex of the upstream testenv scenes
//   (testUsdImagingGLVelocityMotion/scene.usda, scene48.usda) and of
//   edgeCases.usda: resolved points / instance translations, rotations and
//   scales at shutter offsets -0.5, 0, 0.5 and fractional stage times, the
//   contributing sample times for [-0.5, 0.5], and the dirtied notices after
//   attribute edits;
// - over an HdRetainedSceneIndex: every __velocityMotionMode, with and
//   without a sceneGlobals timeCodesPerSecond, and the dirtied notices.
// OpenUSD has no testenv test of this scene index's values; its image tests
// run in the usdimaging-gl-velocity-motion imaging-status suite.
//
// Values are float (GfVec3f, GfQuath, GfQuatf) in both builds and compared
// exactly, except rotations: they go through GfRotation's double
// trigonometry (sin, cos, acos), whose last bits may differ between the
// platform libm and JavaScript's Math, before rounding to float or half.
//
// The dirtied notices are compared as the union of dirty locators per prim:
// how UsdImagingStageSceneIndex batches the property changes of one
// ApplyPendingUpdates into notices is not what is under test here.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  InstancerTokens as HdInstancerTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSampledDataSource as HdRetainedSampledDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  Tokens as HdTokens,
  type ContainerDataSource as HdContainerDataSource,
  type DirtiedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import {
  VelocityMotionResolvingSceneIndex as HdsiVelocityMotionResolvingSceneIndex,
  VelocityMotionResolvingSceneIndexTokens as HdsiVelocityMotionResolvingSceneIndexTokens,
} from 'typescript-usd/hdsi'
import { Quatf as GfQuatf, Quath as GfQuath, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'

const fixtures = new URL('./fixtures/velocityMotion/', import.meta.url)
type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
type PrimDump = { primType: string, primvars: Record<string, { values: Record<string, Json>, varying: boolean, times: number[] }> }
const expected = JSON.parse(readFileSync(new URL('expected.json', fixtures), 'utf8')).payload as
  Record<string, {
    prims: Record<string, Record<string, PrimDump>> | Record<string, PrimDump>
    dirtiedAfterEdit?: [string, string[]][]
    dirtied?: [string, string[]][][]
  }>

/** The capture's _Value */
function value(v: unknown): Json {
  const vt = v instanceof VtValue ? v : v instanceof VtArray ? VtValue.createArray(v as VtArray<unknown>) : undefined
  if (!vt || vt.IsEmpty()) return '<empty>'
  if (vt.isArrayValued() && vt.getElementType() === VtValueTypes.GfVec3f) {
    return vt.UncheckedGet<VtArray<GfVec3f>>().toArray().map((p) => [...p.data])
  }
  for (const [key, type] of [['quath', VtValueTypes.GfQuath], ['quatf', VtValueTypes.GfQuatf]] as const) {
    if (vt.isArrayValued() && vt.getElementType() === type) {
      return { [key]: vt.UncheckedGet<VtArray<GfQuath | GfQuatf>>().toArray()
        .map((q) => [q.GetReal(), ...q.GetImaginary().data]) }
    }
  }
  return `<${vt.getTypeName()}>`
}

const affected = [
  HdPrimvarsSchemaTokens.points,
  HdInstancerTokens.instanceTranslations,
  HdInstancerTokens.instanceRotations,
  HdInstancerTokens.instanceScales]

/** The capture's _Prim */
function prim(si: HdSceneIndexBase, path: string): PrimDump {
  const p = si.getPrim(path)
  const primvars = HdPrimvarsSchema.getFromParent(p.dataSource)
  const pvs: PrimDump['primvars'] = {}
  for (const name of affected) {
    const ds = primvars.getPrimvar(name).getPrimvarValue()
    if (!ds) continue
    const values: Record<string, Json> = {}
    for (const offset of [-0.5, 0, 0.5]) values[String(offset)] = value(ds.GetValue(offset))
    const times: number[] = []
    const varying = ds.GetContributingSampleTimesForInterval(-0.5, 0.5, times)
    pvs[name] = { values, varying, times: varying ? times : [] }
  }
  return { primType: p.primType, primvars: pvs }
}

/** Exact for float values; rotations within float/half rounding of a libm
 *  last-bit difference (see the header). */
function expectPrim(actual: PrimDump, exp: PrimDump, where: string): void {
  expect(actual.primType, where).toBe(exp.primType)
  expect(Object.keys(actual.primvars).sort(), where).toEqual(Object.keys(exp.primvars).sort())
  for (const [name, e] of Object.entries(exp.primvars)) {
    const a = actual.primvars[name]!
    expect(a.varying, `${where} ${name} varying`).toBe(e.varying)
    expect(a.times, `${where} ${name} times`).toEqual(e.times)
    if (name !== HdInstancerTokens.instanceRotations) {
      expect(a.values, `${where} ${name}`).toEqual(e.values)
      continue
    }
    for (const [offset, ev] of Object.entries(e.values)) {
      const av = a.values[offset] as Record<string, number[][]>
      const evq = ev as Record<string, number[][]>
      const kind = Object.keys(evq)[0]!
      expect(Object.keys(av), `${where} ${name} ${offset}`).toEqual([kind])
      const tolerance = kind === 'quath' ? 2 ** -10 : 2 ** -22
      expect(av[kind]!.length).toBe(evq[kind]!.length)
      evq[kind]!.forEach((q, i) => q.forEach((c, j) =>
        expect(Math.abs(av[kind]![i]![j]! - c), `${where} ${name} ${offset} [${i}][${j}]`)
          .toBeLessThanOrEqual(tolerance)))
    }
  }
}

class Recorder implements HdSceneIndexObserver {
  dirtied: [string, HdDataSourceLocatorSet][] = []
  primsAdded(): void {}
  primsRemoved(): void {}
  primsDirtied(_s: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    for (const e of entries) this.dirtied.push([e.primPath, e.dirtyLocators])
  }
  primsRenamed(): void {}
}

function collect(si: HdSceneIndexBase, path: string, out: string[]): string[] {
  out.push(path)
  for (const c of si.getChildPrimPaths(path)) collect(si, c, out)
  return out
}

const byPrim = (entries: [string, Iterable<{ toString(): string } | string>][]): Record<string, string[]> => {
  const r: Record<string, Set<string>> = {}
  for (const [path, locs] of entries) {
    const s = r[path] ??= new Set()
    for (const l of locs) s.add(String(l))
  }
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]))
}

/** The capture's _Edit */
function edit(stage: UsdStage, scene: string): void {
  if (scene === 'edgeCases.usda') {
    stage.getPrim('/World/Tri')!.attr('velocities').set([[1, 0, 0], [1, 0, 0], [1, 0, 0]])
    stage.getPrim('/World/Snow')!.attr('motion:nonlinearSampleCount').set(7)
    stage.getPrim('/World/Instancer')!.attr('angularVelocities')
      .setTimeSample(5, [[0, 0, 10], [0, 0, 10], [0, 0, 10]])
  } else if (scene === 'scene.usda') {
    stage.getPrim('/World/PointsAcceleration/Pointer')!.attr('accelerations')
      .setTimeSample(0, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
  }
}

describe('HdsiVelocityMotionResolvingSceneIndex over the stage scene index', () => {
  for (const scene of ['scene.usda', 'scene48.usda', 'edgeCases.usda']) {
    const exp = expected[scene]!
    describe(scene, async () => {
      const stage = (await UsdStage.open(new URL(scene, fixtures).pathname))!
      const stageSi = UsdImagingStageSceneIndex.new()
      const si = HdsiVelocityMotionResolvingSceneIndex.new(stageSi)
      const recorder = new Recorder()
      si.addObserver(recorder)
      stageSi.SetStage(stage)

      const paths = collect(si, '/', [])
      for (const [time, prims] of Object.entries(exp.prims as Record<string, Record<string, PrimDump>>)) {
        it(`resolved primvars at time ${time}`, () => {
          stageSi.SetTime(new UsdTimeCode(Number(time)))
          const actual: Record<string, PrimDump> = {}
          for (const p of paths) {
            const type = si.getPrim(p).primType
            if (!HdsiVelocityMotionResolvingSceneIndex.primTypeSupportsVelocityMotion(type)) continue
            const d = prim(si, p)
            if (Object.keys(d.primvars).length === 0) continue
            actual[p] = d
          }
          expect(Object.keys(actual).sort()).toEqual(Object.keys(prims).sort())
          for (const [p, e] of Object.entries(prims)) expectPrim(actual[p]!, e, `${p} @${time}`)
        })
      }

      it('dirtied notices after attribute edits', () => {
        recorder.dirtied = []
        edit(stage, scene)
        stageSi.ApplyPendingUpdates()
        expect(byPrim(recorder.dirtied)).toEqual(byPrim(exp.dirtiedAfterEdit!))
      })
    })
  }
})

// The capture's _Primvar, _PointsPrim, _InstancerPrim, _Retained
function primvar(v: VtValue): HdContainerDataSource {
  return new HdPrimvarSchema.Builder()
    .setPrimvarValue(HdRetainedSampledDataSource.new(v))
    .setInterpolation(HdPrimvarSchema.buildInterpolationDataSource(HdPrimvarSchemaTokens.vertex))
    .build()
}
const vec3f = (...vs: [number, number, number][]): VtValue =>
  VtValue.createArray(new VtArray(vs.map((v) => new GfVec3f(...v)), VtValueTypes.GfVec3f))

function withMode(primvars: HdContainerDataSource, mode: string): HdContainerDataSource {
  return mode === ''
    ? HdRetainedContainerDataSource.new([HdPrimvarsSchema.getSchemaToken()], [primvars])
    : HdRetainedContainerDataSource.new(
      [HdPrimvarsSchema.getSchemaToken(), HdsiVelocityMotionResolvingSceneIndexTokens.velocityMotionMode],
      [primvars, HdRetainedTypedSampledDataSource.new<string>(mode)])
}

function pointsPrim(mode: string): HdContainerDataSource {
  return withMode(HdRetainedContainerDataSource.new(
    [HdPrimvarsSchemaTokens.points, HdTokens.velocities, HdTokens.accelerations, HdTokens.nonlinearSampleCount],
    [primvar(vec3f([0, 0, 0], [1, 2, 3])),
      primvar(vec3f([1, 0, 0], [0, -2, 0.5])),
      primvar(vec3f([0, -9.8, 0], [2, 0, 0])),
      primvar(VtValue.create(5, VtValueTypes.int))]), mode)
}

function instancerPrim(mode: string): HdContainerDataSource {
  return withMode(HdRetainedContainerDataSource.new(
    [HdInstancerTokens.instanceTranslations, HdInstancerTokens.instanceRotations,
      HdInstancerTokens.instanceScales, HdTokens.velocities, HdTokens.angularVelocities],
    [primvar(vec3f([0, 0, 0], [4, 0, 0])),
      primvar(VtValue.createArray(new VtArray(
        [new GfQuath(1, 0, 0, 0), new GfQuath(0.70703125, 0, 0.70703125, 0)], VtValueTypes.GfQuath))),
      primvar(vec3f([1, 1, 1], [2, 2, 2])),
      primvar(vec3f([0, 1, 0], [0, 0, 1])),
      primvar(vec3f([0, 0, 180], [90, 0, 0]))]), mode)
}

describe('HdsiVelocityMotionResolvingSceneIndex over a retained scene index', () => {
  for (const [key, withGlobals] of [['retained', false], ['retainedWithGlobals', true]] as const) {
    describe(key, () => {
      const exp = expected[key]!
      const input = HdRetainedSceneIndex.new()
      if (withGlobals) {
        input.addPrims([{ primPath: '/', primType: '', dataSource: HdRetainedContainerDataSource.new(
          [HdSceneGlobalsSchema.getSchemaToken()],
          [new HdSceneGlobalsSchema.Builder()
            .setTimeCodesPerSecond(HdRetainedTypedSampledDataSource.new<number>(12.0))
            .build()]) }])
      }
      for (const m of ['', 'enable', 'disable', 'ignore', 'noAcceleration', 'bogus']) {
        const suffix = m === '' ? 'default' : m
        input.addPrims([
          { primPath: `/Points_${suffix}`, primType: HdPrimTypeTokens.points, dataSource: pointsPrim(m) },
          { primPath: `/Instancer_${suffix}`, primType: HdPrimTypeTokens.instancer, dataSource: instancerPrim(m) },
        ])
      }
      input.addPrims([{ primPath: '/Volume', primType: HdPrimTypeTokens.volume, dataSource: pointsPrim('') }])
      const si = HdsiVelocityMotionResolvingSceneIndex.new(input)

      it('resolved primvars per __velocityMotionMode', () => {
        const prims = exp.prims as Record<string, PrimDump>
        const paths = collect(si, '/', []).filter((p) => p !== '/')
        expect(paths.sort()).toEqual(Object.keys(prims).sort())
        for (const [p, e] of Object.entries(prims)) expectPrim(prim(si, p), e, p)
      })

      it('dirtied notices', () => {
        const recorder = new Recorder()
        si.addObserver(recorder)
        const primvars = HdPrimvarsSchema.getDefaultLocator()
        const loc = (...l: HdDataSourceLocator[]): HdDataSourceLocatorSet => new HdDataSourceLocatorSet(l)
        const batches: DirtiedPrimEntry[][] = [
          [{ primPath: '/Points_default', dirtyLocators: loc(primvars.append(HdTokens.velocities)) }],
          [{ primPath: '/Instancer_default', dirtyLocators: loc(primvars.append(HdTokens.angularVelocities)) }],
          [{ primPath: '/Points_enable', dirtyLocators: loc(new HdDataSourceLocator(
            HdsiVelocityMotionResolvingSceneIndexTokens.velocityMotionMode)) }],
          [{ primPath: '/Points_default', dirtyLocators: loc(primvars.append(HdTokens.widths)) }],
          [{ primPath: '/Points_disable', dirtyLocators: loc(primvars.append(HdTokens.widths)) },
            { primPath: '/Points_ignore', dirtyLocators: loc(primvars.append(HdTokens.accelerations)) }],
          [{ primPath: '/', dirtyLocators: loc(HdSceneGlobalsSchema.getTimeCodesPerSecondLocator()) }],
        ]
        batches.forEach((batch, i) => {
          recorder.dirtied = []
          input.dirtyPrims(batch)
          expect(byPrim(recorder.dirtied), `batch ${i}`).toEqual(byPrim(exp.dirtied![i]!))
        })
        si.removeObserver(recorder)
      })
    })
  }
})
