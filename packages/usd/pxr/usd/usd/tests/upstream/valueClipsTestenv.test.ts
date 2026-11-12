// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdValueClips.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usd/testenv/testUsdValueClips.py over
// the upstream testenv fixture directories, vendored verbatim into
// ./fixtures/testUsdValueClips/ (arrayEdits, manifest, template,
// assetPathValues, precision, singleclip, sparseOverrides, timingSpline).
// The fixtures are served from an in-memory resolver at /fx so relative
// asset paths anchor exactly as they do on disk. Each test cites the
// upstream method it ports; expected values are the upstream test's.
//
// Upstream assertions that clip layers stay unopened (Sdf.Layer.Find after
// open) are not ported: Stage.open acquires clip layers asynchronously up
// front (clipSet.ts), a documented adaptation.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  AttributeQuery as UsdAttributeQuery, InterpolationTypeHeld, Stage, TimeCode as UsdTimeCode,
} from 'typescript-usd/usd'
import { ArInMemoryResolver, _setResolverForTest } from 'typescript-usd/usd/_internal'
import { Type as TfType } from 'typescript-usd/tf'
import {
  Extrapolation as TsExtrapolation, ExtrapLoopReset as TsExtrapLoopReset,
  ExtrapSloped as TsExtrapSloped, InterpLinear as TsInterpLinear,
  Knot as TsKnot, Spline as TsSpline,
} from 'typescript-usd/ts'
import { Array as VtArray } from 'typescript-usd/vt'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdValueClips')

function fixtureAssets(): Record<string, Uint8Array> {
  const assets: Record<string, Uint8Array> = {}
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const rel = path.relative(TESTENV, full).split(path.sep).join('/')
        assets[`/fx/${rel}`] = new Uint8Array(readFileSync(full))
      }
    }
  }
  walk(TESTENV)
  return assets
}

beforeEach(() => {
  _setResolverForTest(new ArInMemoryResolver(fixtureAssets()))
})

const open = async (rel: string): Promise<Stage> => (await Stage.open(`/fx/${rel}`))!

type Attr = NonNullable<ReturnType<Stage['get']>>

// Values as plain data: VtArrays and Gf vectors compare by their elements.
function plain(value: unknown): unknown {
  if (value instanceof VtArray) return value.toArray().map(plain)
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object' && 'data' in value) {
    return Array.from((value as { data: ArrayLike<number> }).data)
  }
  return value
}

// testUsdValueClips.py:122-131 (CheckValue): Attribute.Get and
// UsdAttributeQuery.Get agree. None is undefined here.
function checkValue(attr: Attr, time: number | UsdTimeCode, expected: unknown): void {
  expect(plain(attr.getValueAtTime(time))).toEqual(plain(expected))
  expect(plain(new UsdAttributeQuery(attr).get(time))).toEqual(plain(expected))
}

const vec3fArray = (n: number, v: number): number[][] => Array.from({ length: n }, () => [v, v, v])

// testUsdValueClips.py:39-120 (CheckTimeSamples).
async function checkTimeSamples(stage: Stage, attr: Attr): Promise<void> {
  const all = attr.getTimeSampleKeys()
  expect(new UsdAttributeQuery(attr).getNumTimeSamples()).toBe(all.length)
  for (let i = 0; i < all.length - 1; i++) {
    const lower = all[i]!
    const upper = all[i + 1]!
    expect(attr.getBracketingTimeSamples(lower)).toEqual([lower, lower])
    expect(attr.getBracketingTimeSamples(upper)).toEqual([upper, upper])
    for (let t = Math.trunc(lower) + 1; t < Math.trunc(upper); t++) {
      expect(attr.getBracketingTimeSamples(t)).toEqual([lower, upper])
    }
    if (lower !== upper) {
      expect(attr.getBracketingTimeSamples(lower + (upper - lower) / 2)).toEqual([lower, upper])
    }
  }
  const previous = stage.getInterpolationType()
  stage.setInterpolationType(InterpolationTypeHeld)
  await stage.flushChanges()
  for (let i = 0; i < all.length - 1; i++) {
    const lower = all[i]!
    for (let t = Math.trunc(lower) + 1; t < Math.trunc(all[i + 1]!); t++) {
      expect(plain(attr.getValueAtTime(t))).toEqual(plain(attr.getValueAtTime(lower)))
    }
  }
  stage.setInterpolationType(previous)
  await stage.flushChanges()
  if (all.length > 0) {
    const first = all[0]!
    const last = all[all.length - 1]!
    expect(attr.getBracketingTimeSamples(first - 1)).toEqual([first, first])
    expect(plain(attr.getValueAtTime(first - 1))).toEqual(plain(attr.getValueAtTime(first)))
    expect(attr.getBracketingTimeSamples(last + 1)).toEqual([last, last])
    expect(plain(attr.getValueAtTime(last + 1))).toEqual(plain(attr.getValueAtTime(last)))
  }
  if (all.length > 2) {
    const start = all[0]!
    let end = start
    expect(attr.getTimeSamplesInInterval(new GfInterval(start - 1, end, true, false))).toEqual([])
    while (end < all[all.length - 1]!) {
      expect(attr.getTimeSamplesInInterval(new GfInterval(start, end)))
        .toEqual(all.filter(t => t <= end))
      end += 1
    }
  }
}

// testUsdValueClips.py:126-178 (CheckSpline): the attribute has a spline,
// might vary, has no time samples, and Get(t) (and pre-time) matches the
// spline's own evaluation from just before its first knot to just after its
// last.
function checkSpline(attr: Attr, extrap = true): void {
  expect(attr.hasSpline()).toBe(true)
  const spline = attr.getSpline()!
  expect(new UsdAttributeQuery(attr).valueMightBeTimeVarying()).toBe(true)
  expect(attr.getTimeSampleKeys()).toEqual([])
  expect(new UsdAttributeQuery(attr).getNumTimeSamples()).toBe(0)
  expect(attr.getBracketingTimeSamples(0)).toEqual([])
  // TsKnotMap::GetTimeSpan: first to last knot time.
  const knots = spline.getKnotsWithInnerLoopsBaked()
  const spanMin = knots[0]!.getTime(), spanMax = knots[knots.length - 1]!.getTime()
  const begin = extrap ? Math.trunc(spanMin - 1) : Math.floor(spanMin + 1)
  const end = extrap ? Math.trunc(spanMax + 2) : Math.ceil(spanMax)
  for (let t = begin; t < end; t++) {
    const evalResult = spline.eval(t)
    const getResult = attr.getValueAtTime(t) as number | undefined
    if (evalResult === undefined || getResult === undefined) {
      expect(getResult, `t=${t}`).toBe(evalResult)
    } else {
      expect(getResult, `t=${t}`).toBeCloseTo(evalResult, 7)
    }
    const evalPreResult = spline.evalPreValue(t)
    const getPreResult = attr.getValueAtTime(UsdTimeCode.PreTime(t)) as number | undefined
    if (evalPreResult === undefined || getPreResult === undefined) {
      expect(getPreResult, `pre t=${t}`).toBe(evalPreResult)
    } else {
      expect(getPreResult, `pre t=${t}`).toBeCloseTo(evalPreResult, 7)
    }
  }
}

describe('testUsdValueClips over the upstream testenv fixtures', () => {
  it('test_ArrayEdits', async () => {
    // testUsdValueClips.py:202-222
    const stage = await open('arrayEdits/root.usda')
    const attr = stage.getPrim('/Root')!.getAttr('attr')!
    expect(new UsdAttributeQuery(attr).valueMightBeTimeVarying()).toBe(true)
    checkValue(attr, UsdTimeCode.Default(), [3, 3, 3, -999])
    checkValue(attr, 1, [8, -1, -1, 555, -999])
    checkValue(attr, 2, [-1, 9, -1, 555, -999])
    checkValue(attr, 3, [10, -7, 11, 555, -999])
    checkValue(attr, 4, [10, -7, 11, 666, -999])
    await checkTimeSamples(stage, attr)
  })

  it('test_ClipManifest', async () => {
    // testUsdValueClips.py:2472-2572
    const stage = await open('manifest/root.usda')
    const prim = stage.getPrim('/WithManifestClip')!

    const notInManifestAndInClip = prim.getAttr('notInManifestAndInClip')!
    expect(new UsdAttributeQuery(notInManifestAndInClip).valueMightBeTimeVarying()).toBe(false)
    checkValue(notInManifestAndInClip, 0, 3.0)
    expect(notInManifestAndInClip.getTimeSampleKeys()).toEqual([])
    expect(notInManifestAndInClip.getTimeSamplesInInterval(GfInterval.getFullInterval())).toEqual([])
    await checkTimeSamples(stage, notInManifestAndInClip)

    const notInManifestNotInClip = prim.getAttr('notInManifestNotInClip')!
    expect(new UsdAttributeQuery(notInManifestNotInClip).valueMightBeTimeVarying()).toBe(false)
    checkValue(notInManifestNotInClip, 0, 4.0)
    expect(notInManifestNotInClip.getTimeSamplesInInterval(GfInterval.getFullInterval())).toEqual([])
    await checkTimeSamples(stage, notInManifestNotInClip)

    // In the manifest but declared uniform: clips are not consulted.
    const uniformInManifestAndInClip = prim.getAttr('uniformInManifestAndInClip')!
    expect(new UsdAttributeQuery(uniformInManifestAndInClip).valueMightBeTimeVarying()).toBe(false)
    checkValue(uniformInManifestAndInClip, 0, 5.0)
    expect(uniformInManifestAndInClip.getTimeSampleKeys()).toEqual([])
    expect(uniformInManifestAndInClip.getTimeSamplesInInterval(GfInterval.getFullInterval())).toEqual([])
    await checkTimeSamples(stage, uniformInManifestAndInClip)

    const inManifestAndInClip = prim.getAttr('inManifestAndInClip')!
    expect(new UsdAttributeQuery(inManifestAndInClip).valueMightBeTimeVarying()).toBe(true)
    checkValue(inManifestAndInClip, 0, 0.0)
    checkValue(inManifestAndInClip, 1, -1.0)
    checkValue(inManifestAndInClip, UsdTimeCode.PreTime(2), -1.0)
    checkValue(inManifestAndInClip, 2, undefined)
    expect(inManifestAndInClip.getTimeSampleKeys()).toEqual([0.0, 1.0, 2.0, 3.0])
    expect(inManifestAndInClip.getTimeSamplesInInterval(new GfInterval(0, 2.1))).toEqual([0.0, 1.0, 2.0])
    await checkTimeSamples(stage, inManifestAndInClip)

    const inManifestNotInClip = prim.getAttr('inManifestNotInClip')!
    expect(new UsdAttributeQuery(inManifestNotInClip).valueMightBeTimeVarying()).toBe(true)
    checkValue(inManifestNotInClip, 0, undefined)
    expect(inManifestNotInClip.getTimeSampleKeys()).toEqual([0.0, 1.0, 2.0, 3.0])
    expect(inManifestNotInClip.getTimeSamplesInInterval(GfInterval.getFullInterval()))
      .toEqual([0.0, 1.0, 2.0, 3.0])
    await checkTimeSamples(stage, inManifestNotInClip)
  })

  it('test_ClipTemplateBehavior', async () => {
    // testUsdValueClips.py:2955-3049
    const attrOf = async (rel: string): Promise<Attr> =>
      (await open(rel)).getPrim('/World/fx/Particles_Splash/points')!.getAttr('extent')!

    let attr = await attrOf('template/int1/result_int_1.usda')
    for (const t of [1, 1.5, 2, 2.5, 3, 3.5, 4]) checkValue(attr, t, vec3fArray(2, t))

    attr = await attrOf('template/int2/result_int_2.usda')
    for (const t of [1, 10, 17, 26, 33, 43, 49]) checkValue(attr, t, vec3fArray(2, t))

    // Template offsets applied.
    attr = await attrOf('template/int3/result_int_3.usda')
    checkValue(attr, 2.5, vec3fArray(2, 1))
    checkValue(attr, 3.0, vec3fArray(2, 1))
    checkValue(attr, 3.25, vec3fArray(2, 2))
    checkValue(attr, 3.5, vec3fArray(2, 3))
    checkValue(attr, 4.0, vec3fArray(2, 3))
    checkValue(attr, 4.5, vec3fArray(2, 3))

    attr = await attrOf('template/subint1/result_subint_1.usda')
    for (const t of [101, 101.5, 102, 102.5, 103, 103.5, 104]) checkValue(attr, t, vec3fArray(2, t))

    // Expected values are Vt.Vec3fArray, so each component is a float.
    const f = (v: number): number => Math.fround(v)
    attr = await attrOf('template/subint2/result_subint_2.usda')
    for (const t of [10.00, 10.025, 10.05, 10.08, 10.10, 10.125, 10.15]) {
      checkValue(attr, t, vec3fArray(2, f(t)))
    }

    attr = await attrOf('template/subint3/result_subint_3.usda')
    checkValue(attr, 9.95, vec3fArray(2, 10))
    checkValue(attr, 10.00, vec3fArray(2, 10))
    checkValue(attr, 10.025, vec3fArray(2, f(10.05)))
    for (const t of [10.05, 10.10, 10.15, 10.20, 10.25]) checkValue(attr, t, vec3fArray(2, f(10.1)))
  })

  it('test_ClipTemplateWithOffsets', async () => {
    // testUsdValueClips.py:3051-3065
    const attr = (await open('template/layerOffsets/root.usda')).getPrim('/Model')!.getAttr('a')!
    checkValue(attr, 3.0, 1.0)
    checkValue(attr, 4.0, 2.0)
    checkValue(attr, 5.0, 3.0)
    checkValue(attr, 6.0, 3.0)
  })

  it('test_ClipsWithSparseOverrides', async () => {
    // testUsdValueClips.py:3067-3100
    const attrOf = async (rel: string): Promise<Attr> =>
      (await open(rel)).getPrim('/main')!.getAttr('foo')!
    let attr = await attrOf('sparseOverrides/over_root.usda')
    checkValue(attr, 101.0, 3.0)
    checkValue(attr, 103.0, 1.0)
    attr = await attrOf('sparseOverrides/root.usda')
    checkValue(attr, 101.0, 1.0)
    checkValue(attr, 103.0, 3.0)
    attr = await attrOf('sparseOverrides/template_over_root.usda')
    checkValue(attr, 101.0, 3.0)
    checkValue(attr, 103.0, 3.0)
    attr = await attrOf('sparseOverrides/template_root.usda')
    checkValue(attr, 101.0, 1.0)
    checkValue(attr, 103.0, 3.0)
  })

  it('test_ClipTimesBracketingTimeSamplePrecision', async () => {
    // testUsdValueClips.py:2460-2470
    const attr = (await open('precision/root.usda'))
      .getPrim('/World/fx/Particles_Splash/points')!.getAttr('points')!
    expect(attr.getTimeSampleKeys()).toEqual([101.0, 101.99, 102.0, 103.0])
    expect(attr.getBracketingTimeSamples(101)).toEqual([101.00, 101.00])
    expect(attr.getBracketingTimeSamples(101.99)).toEqual([101.99, 101.99])
    expect(attr.getBracketingTimeSamples(101.90)).toEqual([101.00, 101.99])
    expect(attr.getTimeSamplesInInterval(new GfInterval(101.0, 102.0))).toEqual([101.00, 101.99, 102.00])
  })

  it('test_AssetPathValuesInClips', async () => {
    // testUsdValueClips.py:3206-3291: relative asset paths from clips are
    // anchored to the clip layer; at time 1 the active clip has no samples,
    // so the manifest default is anchored to the manifest layer.
    const stage = await open('assetPathValues/root.usda')
    const resolvedOf = (value: unknown): string => (value as SdfAssetPath).getResolvedPath()
    const expectations: Array<[number | UsdTimeCode, string]> = [
      [UsdTimeCode.PreTime(0), 'clip1/clip1.usda'],
      [0, 'clip1/clip1.usda'],
      [UsdTimeCode.PreTime(1), 'clip1/clip1.usda'],
      [1, 'manifest/manifest.usda'],
      [UsdTimeCode.PreTime(2), 'manifest/manifest.usda'],
      [2, 'clip2/clip2.usda'],
      [UsdTimeCode.PreTime(3), 'clip2/clip2.usda'],
      [3, 'clip3/clip3.usda'],
      [UsdTimeCode.PreTime(4), 'clip3/clip3.usda'],
    ]
    const attr = stage.getAttributeAtPath('/Model.assetPath')!
    for (const [time, expected] of expectations) {
      expect(resolvedOf(attr.getValueAtTime(time))).toBe(`/fx/assetPathValues/${expected}`)
      expect(resolvedOf(new UsdAttributeQuery(attr).get(time))).toBe(`/fx/assetPathValues/${expected}`)
    }
    const arrayAttr = stage.getAttributeAtPath('/Model.assetPathArray')!
    for (const [time, expected] of expectations) {
      const array = (arrayAttr.getValueAtTime(time) as VtArray<SdfAssetPath>).toArray()
      expect(array.map(resolvedOf)).toEqual([`/fx/assetPathValues/${expected}`])
    }
  })

  it('test_SingleClip', async () => {
    // testUsdValueClips.py:1341-1374
    const stage = await open('singleclip/root.usda')
    const model = stage.getPrim('/SingleClip')!

    // A single clip contributing one time sample: that value is used over
    // all time.
    const attr1 = model.getAttr('attr_1')!
    expect(new UsdAttributeQuery(attr1).valueMightBeTimeVarying()).toBe(false)
    checkValue(attr1, 0, 10.0)
    expect(attr1.getBracketingTimeSamples(0.0)).toEqual([0.0, 0.0])
    expect(attr1.getTimeSampleKeys()).toEqual([0.0])
    expect(attr1.getTimeSamplesInInterval(GfInterval.getFullInterval())).toEqual([0.0])
    await checkTimeSamples(stage, attr1)

    // No time samples in the clip or elsewhere: the default is used.
    const attr2 = model.getAttr('attr_2')!
    expect(new UsdAttributeQuery(attr2).valueMightBeTimeVarying()).toBe(false)
    checkValue(attr2, 0, 2.0)
    expect(attr2.getBracketingTimeSamples(0.0)).toEqual([])
    expect(attr2.getTimeSampleKeys()).toEqual([])
    expect(attr2.getTimeSamplesInInterval(GfInterval.getFullInterval())).toEqual([])
    await checkTimeSamples(stage, attr2)
  })

  it('test_SingleClip: a spline in the only clip applies with all its knots and extrapolations', async () => {
    // testUsdValueClips.py:1376-1390
    const stage = await open('singleclip/root.usda')
    const attr3 = stage.getPrim('/SingleClip')!.getAttr('attr_3')!
    expect(attr3.hasSpline()).toBe(true)
    const floatType = TfType.declare('float')
    const spline = new TsSpline(floatType)
    const k1 = new TsKnot(floatType)
    k1.SetTime(-1)
    k1.setValue(1)
    k1.setNextInterpolation(TsInterpLinear)
    const k2 = new TsKnot(floatType)
    k2.SetTime(2)
    k2.setValue(2)
    k2.setNextInterpolation(TsInterpLinear)
    spline.setKnot(k1)
    spline.setKnot(k2)
    spline.setPreExtrapolation(new TsExtrapolation(TsExtrapLoopReset))
    spline.setPostExtrapolation(new TsExtrapolation(TsExtrapSloped, 1.0))
    expect(attr3.getSpline()?.equals(spline)).toBe(true)
  })

  it('test_ClipSplineTiming', async () => {
    // testUsdValueClips.py:3544-3596
    const stage = await open('timingSpline/root.usda')
    const attr1 = stage.getPrim('/Model')!.getAttr('a')!
    checkSpline(attr1)
    const close = (time: number | UsdTimeCode, expected: number): void => {
      expect(attr1.getValueAtTime(time) as number).toBeCloseTo(expected, 7)
      expect(new UsdAttributeQuery(attr1).get(time) as number).toBeCloseTo(expected, 7)
    }
    // Held outside the clip times.
    checkValue(attr1, -5, 10)
    checkValue(attr1, 0, 10)
    close(29.5, 15)
    close(100, 15)
    // Jump discontinuity.
    close(UsdTimeCode.PreTime(10), 18)
    // Stretched over [10, 20).
    checkValue(attr1, 10, 10)
    checkValue(attr1, 12, 11)
    checkValue(attr1, 14, 12)
    // Shrunk over [20, 25).
    close(20.5, 15)
    close(UsdTimeCode.PreTime(22.5), 18)
    close(22.5, 20)
    close(25, 30)
    // Reversed section.
    close(25, 30)
    close(UsdTimeCode.PreTime(27.5), 20)
    close(27.5, 18)
    close(29.5, 15)

    const attr2 = stage.getPrim('/Model2')!.getAttr('attr2')!
    checkSpline(attr2)
    checkValue(attr2, 10, 9)
  })
})
