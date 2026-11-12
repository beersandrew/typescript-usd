// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSkel/testenv/testUsdSkelBakeSkinning.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelBakeSkinning.py
// (registered as testUsdSkelBakeSkinning, which diffs the exported
// blendshapes.baked, blendshapesWithNormals.baked, lbs.baked and
// lbs.bakedInterval layers against testenv/testUsdSkelBakeSkinning/baseline).
//
// Fixtures: the testenv inputs (dqs.usda, lbs.usda, blendshapes.usda,
// blendshapesWithNormals.usda) and all six files of its baseline/ directory
// are copied unmodified into fixtures/testUsdSkelBakeSkinning (Copyright 2017
// Pixar, TOST 1.0, https://openusd.org/license). The upstream
// test registration only diffs four of them; the dqs.baked and
// dqs.bakedInterval baselines are upstream files too, and running
// testUsdSkelBakeSkinning.py with the 26.11.1 build reproduces all six
// baselines byte-for-byte, so the DQS cases compare against them as well.
//
// Comparison: upstream diffs the exported text of the baked root layer.
// USDA text formatting is not under test here, so the baked root layer is
// compared with the baseline layer spec by spec: the same spec paths, the
// same field names per spec, and equal field values, including every time
// sample. `properties` is compared as a set (the usda writer orders
// properties itself); every other list keeps its order.
//
// Numeric tolerance: the baked values are float32 (point3f/normal3f/float3
// arrays) or doubles assembled from float32 intermediates (the matrix4d of
// UsdSkelSkinTransform's GfVec3f frame points). The same float/double
// operations are performed in the same order as upstream, but the C++ build
// may contract or reorder float expressions, so results can differ in the
// last few float32 ulps (observed: 1-2 ulps). Numbers therefore match when
// |a - b| <= 1e-6 * max(1, |b|): about 8 float32 ulps at magnitude 1, and an
// absolute floor of 1e-6 for values near zero (the baselines contain values
// such as -8.881784e-16 that are rounding noise around 0). Non-numeric
// values must be equal.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import { Layer } from 'typescript-usd/sdf'
import { PrimRange, Stage } from 'typescript-usd/usd'
import { Array as VtArray } from 'typescript-usd/vt'
import { BakeSkinning } from '../../src/index.ts'

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/testUsdSkelBakeSkinning/${name}`, import.meta.url))

// Opens a testenv input on its own (anonymous) layer, so that each case
// starts from the file on disk as the upstream test's fresh Usd.Stage.Open
// does.
async function openStage(testFile: string): Promise<Stage> {
  const layer = (await Layer.openAsAnonymous(fixture(testFile)))!
  return Stage.open(layer)
}

const RELATIVE_TOLERANCE = 1e-6

// A plain, comparable form of a field value.
function plain(value: unknown): unknown {
  if (value instanceof VtArray) return (value.toArray() as unknown[]).map(plain)
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>)
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj['GetArray'] === 'function') return [...(obj['GetArray'] as () => number[])()]
    if (typeof obj['GetReal'] === 'function' && typeof obj['GetImaginary'] === 'function') {
      const imaginary = (obj['GetImaginary'] as () => { data: number[] })()
      return [(obj['GetReal'] as () => number)(), ...imaginary.data]
    }
    if ('data' in obj && ArrayBuffer.isView(obj['data']) || Array.isArray(obj['data'])) {
      return Array.from(obj['data'] as ArrayLike<number>)
    }
    if (typeof obj['pathString'] === 'string') return obj['pathString']
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      if (typeof obj[key] !== 'function') out[key] = plain(obj[key])
    }
    return out
  }
  return value
}

function compareValues(actual: unknown, expected: unknown, where: string, diffs: string[]): void {
  if (diffs.length > 20) return
  if (typeof actual === 'number' && typeof expected === 'number') {
    const ok = Number.isNaN(actual) ? Number.isNaN(expected)
      : Math.abs(actual - expected) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(expected))
    if (!ok) diffs.push(`${where}: ${actual} != ${expected}`)
    return
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      diffs.push(`${where}: length ${actual.length} != ${expected.length}`)
      return
    }
    actual.forEach((a, i) => compareValues(a, expected[i], `${where}[${i}]`, diffs))
    return
  }
  if (actual !== null && expected !== null && typeof actual === 'object' && typeof expected === 'object') {
    const a = actual as Record<string, unknown>, e = expected as Record<string, unknown>
    const keys = [...new Set([...Object.keys(a), ...Object.keys(e)])].sort()
    for (const key of keys) compareValues(a[key], e[key], `${where}.${key}`, diffs)
    return
  }
  if (actual !== expected) diffs.push(`${where}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
}

// The differences between the baked root layer and a baseline layer.
async function diffAgainstBaseline(baked: Layer, baselineFile: string): Promise<string[]> {
  const baseline = (await Layer.openAsAnonymous(fixture(`baseline/${baselineFile}`)))!
  const diffs: string[] = []
  compareValues(baked.getField('/', 'startTimeCode'), baseline.getField('/', 'startTimeCode'), '/', diffs)
  const bakedPaths = baked.getSpecPaths().map(String).sort()
  const baselinePaths = baseline.getSpecPaths().map(String).sort()
  compareValues(bakedPaths, baselinePaths, 'spec paths', diffs)
  for (const path of baselinePaths) {
    if (!bakedPaths.includes(path)) continue
    const fields = baseline.listFields(path).map(String).sort()
    compareValues(baked.listFields(path).map(String).sort(), fields, `<${path}> fields`, diffs)
    for (const field of fields) {
      if (field === 'timeSamples') {
        const times = baseline.listTimeSamplesForPath(path)
        compareValues(baked.listTimeSamplesForPath(path), times, `<${path}> sample times`, diffs)
        for (const time of times) {
          compareValues(plain(baked.queryTimeSample(path, time)), plain(baseline.queryTimeSample(path, time)),
            `<${path}> @${time}`, diffs)
        }
        continue
      }
      let actual = plain(baked.getField(path, field))
      let expected = plain(baseline.getField(path, field))
      if (field === 'properties' && Array.isArray(actual) && Array.isArray(expected)) {
        actual = [...actual].sort()
        expected = [...expected].sort()
      }
      compareValues(actual, expected, `<${path}>.${field}`, diffs)
    }
  }
  return diffs
}

describe('TestUsdSkelBakeSkinning', () => {
  it('test_DQSkinning', async () => {
    const stage = await openStage('dqs.usda')

    expect(BakeSkinning(PrimRange.stage(stage))).toBe(true)

    // Upstream exports dqs.baked.usda (baseline/dqs.baked.usda).
    expect(await diffAgainstBaseline(stage.getRootLayer(), 'dqs.baked.usda')).toEqual([])
  })

  it('test_DQSkinningWithInterval', async () => {
    const stage = await openStage('dqs.usda')

    expect(BakeSkinning(PrimRange.stage(stage), new GfInterval(1, 10))).toBe(true)

    // Upstream exports dqs.bakedInterval.usda
    // (baseline/dqs.bakedInterval.usda).
    expect(await diffAgainstBaseline(stage.getRootLayer(), 'dqs.bakedInterval.usda')).toEqual([])
  })

  it('test_LinearBlendSkinning', async () => {
    const stage = await openStage('lbs.usda')

    expect(BakeSkinning(PrimRange.stage(stage))).toBe(true)

    expect(await diffAgainstBaseline(stage.getRootLayer(), 'lbs.baked.usda')).toEqual([])
  })

  it('test_LinearBlendSkinningWithInterval', async () => {
    const stage = await openStage('lbs.usda')

    expect(BakeSkinning(PrimRange.stage(stage), new GfInterval(1, 10))).toBe(true)

    expect(await diffAgainstBaseline(stage.getRootLayer(), 'lbs.bakedInterval.usda')).toEqual([])
  })

  it('test_BlendShapes', async () => {
    const stage = await openStage('blendshapes.usda')

    expect(BakeSkinning(PrimRange.stage(stage))).toBe(true)

    expect(await diffAgainstBaseline(stage.getRootLayer(), 'blendshapes.baked.usda')).toEqual([])
  })

  it('test_BlendShapesWithNormals', async () => {
    const stage = await openStage('blendshapesWithNormals.usda')

    expect(BakeSkinning(PrimRange.stage(stage))).toBe(true)

    expect(await diffAgainstBaseline(stage.getRootLayer(), 'blendshapesWithNormals.baked.usda')).toEqual([])
  })
})
