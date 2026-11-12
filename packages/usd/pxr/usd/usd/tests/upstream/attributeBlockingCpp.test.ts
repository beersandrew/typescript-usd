// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdAttributeBlocking.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdAttributeBlocking.cpp
// (registered as testUsdAttributeBlockingCpp). attributeBlocking.test.ts
// covers the Python script; this file follows the C++ program, whose main()
// runs every check once per format.
//
// Mapping:
//  - UsdStage::CreateInMemory("test" + fmt) is Stage.open on an anonymous
//    layer with that tag, so the layer data is the format's own.
//  - Typed Get<T>(&value[, time]) and untyped Get(&VtValue[, time]) are the
//    same JavaScript call (getValue / getValueAtTime, and
//    UsdAttributeQuery.get); a false return is an undefined result.
//  - Set<SdfValueBlock>(block[, time]) and Set(VtValue(block)[, time]) are
//    set / setTimeSample with an SdfValueBlock.
//  - GetBracketingTimeSamples' hasTimeSamples out-parameter is whether the
//    returned bracket is non-empty.

import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  Stage, AttributeQuery as UsdAttributeQuery, ResolveInfoSource as UsdResolveInfoSource,
  type Attribute,
} from 'typescript-usd/usd'
import { SdfValueBlock } from 'typescript-usd/usd/_internal'
import {
  Extrapolation as TsExtrapolation, ExtrapMode as TsExtrapMode, InterpMode as TsInterpMode,
  Knot as TsKnot, Spline as TsSpline,
} from 'typescript-usd/ts'

const TIME_SAMPLE_BEGIN = 101
const TIME_SAMPLE_END = 120
const DEFAULT_VALUE = 4.0

async function createInMemory(tag: string): Promise<Stage> {
  return Stage.open(Layer.createAnonymous(tag))
}

// _GenerateStage (testUsdAttributeBlocking.cpp:36-63).
async function generateStage(fmt: string) {
  const primPath = '/Sphere'
  const stage = await createInMemory('test' + fmt)
  const prim = stage.definePrim(primPath)

  const defAttr = prim.createAttribute('size', 'double')
  defAttr.set(1.0)

  const sampleAttr = prim.createAttribute('points', 'double')
  for (let i = TIME_SAMPLE_BEGIN; i < TIME_SAMPLE_END; ++i) sampleAttr.setTimeSample(i, i)

  const localRefPrim = stage.overridePrim('/SphereOver')
  await localRefPrim.getReferences().addReference('', primPath)
  const localRefAttr = localRefPrim.createAttribute('size', 'double')
  localRefAttr.block()

  return { stage, defAttr, sampleAttr, localRefAttr }
}

// _GenerateStageForSpline (testUsdAttributeBlocking.cpp:65-88).
async function generateStageForSpline(fmt: string) {
  const stage = await createInMemory('testSpline' + fmt)
  const prim = stage.definePrim('/Sphere')
  const splineAttr = prim.createAttribute('points', 'double')
  const spline = new TsSpline()
  for (let i = TIME_SAMPLE_BEGIN; i < TIME_SAMPLE_END; ++i) {
    const knot = new TsKnot()
    knot.SetTime(i)
    knot.setValue(i)
    knot.setNextInterpolation(TsInterpMode.Held)
    spline.setKnot(knot)
  }
  splineAttr.setSpline(spline)
  return { stage, splineAttr }
}

// _GenerateStageForAnimationBlock (testUsdAttributeBlocking.cpp:90-160).
async function generateStageForAnimationBlock(fmt: string): Promise<Stage> {
  const weakerLayer = Layer.createAnonymous('animationBlocks_weaker')
  weakerLayer.importFromString(`#usda 1.0
over "Human"
{
    int c = 1
    double d = 2.0
}
`)
  const weakLayer = Layer.createAnonymous('animationBlocks_weak')
  weakLayer.importFromString(`#usda 1.0
over "Human"
{
    int a = AnimationBlock
    int a.timeSamples = {
        1: 5,
        2: 18,
    }

    double b.spline = {
        1: 5; post held,
        2: 18; post held,
    }

    int c.timeSamples = {
        0: 456,
        1: 789
    }

    double d.spline = {
        1: 5; post held,
        2: 18; post held,
    }
}
`)
  const strongerLayer = Layer.createAnonymous('animationBlocks_strong')
  strongerLayer.importFromString(`#usda 1.0
def Xform "Human"
{
    double b = AnimationBlock
    double b.spline = {
        1: 10; post held,
        2: 20; post held,
    }

    double d = AnimationBlock

    double e = AnimationBlock
}
`)
  const rootLayer = Layer.createAnonymous('test' + fmt)
  rootLayer.setSubLayerPaths([
    strongerLayer.identifier, weakLayer.identifier, weakerLayer.identifier])
  const stage = await Stage.open(rootLayer)
  const attrC = stage.getAttributeAtPath('/Human.c')
  expect(attrC?.isValid()).toBe(true)
  attrC!.blockAnimation()
  return stage
}

const get = (attr: Attribute, time?: number) =>
  time === undefined ? attr.getValue() : attr.getValueAtTime(time)
const queryGet = (attr: Attribute, time?: number) =>
  new UsdAttributeQuery(attr).get(time ?? 'default')

// _CheckDefaultNotBlocked (testUsdAttributeBlocking.cpp:162-178).
function checkDefaultNotBlocked(attr: Attribute, expectedValue: number): void {
  expect(get(attr)).toBe(expectedValue)
  expect(queryGet(attr)).toBe(expectedValue)
  expect(attr.hasValue()).toBe(true)
  expect(attr.hasAuthoredValue()).toBe(true)
}

// _CheckDefaultBlocked (testUsdAttributeBlocking.cpp:180-196).
function checkDefaultBlocked(attr: Attribute): void {
  const info = attr.getResolveInfo()
  expect(get(attr)).toBeUndefined()
  expect(queryGet(attr)).toBeUndefined()
  expect(attr.hasValue()).toBe(false)
  expect(attr.hasAuthoredValue()).toBe(false)
  expect(info.hasAuthoredValueOpinion()).toBe(true)
}

// _CheckSampleNotBlocked (testUsdAttributeBlocking.cpp:198-213).
function checkSampleNotBlocked(attr: Attribute, time: number, expectedValue: number): void {
  expect(get(attr, time)).toBe(expectedValue)
  expect(queryGet(attr, time)).toBe(expectedValue)
}

// _CheckSampleBlocked (testUsdAttributeBlocking.cpp:215-226).
function checkSampleBlocked(attr: Attribute, time: number): void {
  expect(get(attr, time)).toBeUndefined()
  expect(queryGet(attr, time)).toBeUndefined()
}

// _CheckSplineBlocking (testUsdAttributeBlocking.cpp:228-290).
function checkSplineBlocking(splineAttr: Attribute): void {
  // Initially nothing should be blocked.
  const t0 = TIME_SAMPLE_BEGIN
  const t1 = TIME_SAMPLE_END
  for (let t = t0; t < t1; t += 0.5) expect(get(splineAttr, t)).toBeDefined()

  // Test extrapolation blocking
  let spline = splineAttr.getSpline()!
  const extrap = new TsExtrapolation(TsExtrapMode.ValueBlock)
  spline.setPreExtrapolation(extrap)
  spline.setPostExtrapolation(extrap)

  expect(get(splineAttr, t0 - 1)).toBeDefined()
  expect(get(splineAttr, t1 + 1)).toBeDefined()

  splineAttr.setSpline(spline)

  expect(get(splineAttr, t0 - 1)).toBeUndefined()
  expect(get(splineAttr, t1 + 1)).toBeUndefined()

  // Test interpolation blocking. Every other knot is a block
  for (let t = t0; t < t1; t += 2) {
    const knot = spline.getKnot(t)
    expect(knot).toBeDefined()
    knot!.setNextInterpolation(TsInterpMode.ValueBlock)
    spline.setKnot(knot!)
  }

  splineAttr.setSpline(spline)

  // Test the value-blocked knots
  for (let t = t0; t < t1; t += 2) {
    expect(get(splineAttr, t)).toBeUndefined()
    expect(get(splineAttr, t + 0.5)).toBeUndefined()
  }

  // Test the non-value-blocked knots
  for (let t = t0 + 1; t < t1; t += 2) {
    expect(get(splineAttr, t)).toBeDefined()
    expect(get(splineAttr, t + 0.5)).toBeDefined()
  }

  // An empty spline is effectively a value block, it has no value at all
  // times.
  spline = new TsSpline('double')
  splineAttr.setSpline(spline)

  // ValueIsBlocked() only returns true if there is a default whose value is
  // blocked; a time-dependent value is not examined.
  expect(splineAttr.getResolveInfo().valueIsBlocked()).toBe(false)

  for (let t = t0 - 1; t < t1 + 1; t += 0.5) expect(get(splineAttr, t)).toBeUndefined()
}

// _CheckAnimationBlock (testUsdAttributeBlocking.cpp:292-419).
function checkAnimationBlock(stage: Stage): void {
  const prim = stage.getPrim('/Human')!
  {
    const attr = prim.getAttr('a')!
    // source is time samples
    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.TimeSamples)
    expect(get(attr)).toBeUndefined()
    // time samples shine through
    expect(get(attr, 1.0)).toBe(5)
  }
  {
    const attr = prim.getAttr('b')!
    // source is spline
    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Spline)
    // default is animation block
    expect(get(attr)).toBeUndefined()
    // stronger spline value shines through
    expect(get(attr, 1.0)).toBe(10.0)
  }
  {
    const attr = prim.getAttr('c')!
    // source is default
    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Default)
    expect(get(attr)).toBe(1)
    // time samples are animation blocked and the default shines through
    expect(get(attr, 1.0)).toBe(1)
  }
  {
    const attr = prim.getAttr('d')!
    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Default)
    expect(get(attr)).toBe(2.0)
    // spline is animation blocked and the default shines through
    expect(get(attr, 1.0)).toBe(2.0)
  }
  {
    // Attr with just animation block: an empty default value with resolve
    // info source None.
    const attr = prim.getAttr('e')!
    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.None)
    expect(get(attr)).toBeUndefined()
  }
}

describe('testUsdAttributeBlockingCpp', () => {
  for (const fmt of ['.usda', '.usdc']) {
    describe(`format ${fmt}`, () => {
      it('blocks through local references and on default values and time samples', async () => {
        const block = new SdfValueBlock()
        const { defAttr, sampleAttr, localRefAttr } = await generateStage(fmt)

        // Testing blocks through local references
        checkDefaultBlocked(localRefAttr)
        checkDefaultNotBlocked(defAttr, 1.0)

        // Testing blocks on default values
        defAttr.set(block)
        checkDefaultBlocked(defAttr)

        defAttr.set(DEFAULT_VALUE)
        checkDefaultNotBlocked(defAttr, DEFAULT_VALUE)

        defAttr.set(block)
        checkDefaultBlocked(defAttr)

        // Reset our value
        defAttr.set(DEFAULT_VALUE)
        checkDefaultNotBlocked(defAttr, DEFAULT_VALUE)

        defAttr.block()
        checkDefaultBlocked(defAttr)

        // Testing typed time sample operations
        for (let sample = TIME_SAMPLE_BEGIN; sample < TIME_SAMPLE_END; ++sample) {
          const pre = sampleAttr.getBracketingTimeSamples(sample)

          checkSampleNotBlocked(sampleAttr, sample, sample)

          sampleAttr.setTimeSample(sample, block)
          checkSampleBlocked(sampleAttr, sample)

          // Bracketing time samples continue to report properly even in the
          // presence of blocks.
          const post = sampleAttr.getBracketingTimeSamples(sample)
          expect(post).toEqual(pre)
        }

        // Reset our value
        for (let s = TIME_SAMPLE_BEGIN; s < TIME_SAMPLE_END; ++s) sampleAttr.setTimeSample(s, s)

        // Testing untyped time sample operations
        for (let sample = TIME_SAMPLE_BEGIN; sample < TIME_SAMPLE_END; ++sample) {
          checkSampleNotBlocked(sampleAttr, sample, sample)
          sampleAttr.setTimeSample(sample, block)
          checkSampleBlocked(sampleAttr, sample)
        }

        // Reset our value
        for (let s = TIME_SAMPLE_BEGIN; s < TIME_SAMPLE_END; ++s) sampleAttr.setTimeSample(s, s)

        // Both default values and time samples are blown away.
        sampleAttr.block()
        checkDefaultBlocked(sampleAttr)
        expect(sampleAttr.getTimeSampleKeys().length).toBe(0)
        expect(new UsdAttributeQuery(sampleAttr).getNumTimeSamples()).toBe(0)
        for (let s = TIME_SAMPLE_BEGIN; s < TIME_SAMPLE_END; ++s) checkSampleBlocked(sampleAttr, s)

        // Reset our value
        for (let s = TIME_SAMPLE_BEGIN; s < TIME_SAMPLE_END; ++s) sampleAttr.setTimeSample(s, s)

        // Attribute blocking behavior in between blocked/unblocked times
        for (let sample = TIME_SAMPLE_BEGIN; sample < TIME_SAMPLE_END; sample += 2) {
          sampleAttr.setTimeSample(sample, block)
          checkSampleBlocked(sampleAttr, sample)
          if (sample + 1 < TIME_SAMPLE_END) {
            checkSampleBlocked(sampleAttr, sample + 0.5)
            checkSampleNotBlocked(sampleAttr, sample + 1.0, sample + 1.0)
          }
        }
      })

      it('spline blocking', async () => {
        const { splineAttr } = await generateStageForSpline(fmt)
        checkSplineBlocking(splineAttr)
      })

      it('animation block', async () => {
        checkAnimationBlock(await generateStageForAnimationBlock(fmt))
      })
    })
  }
})
