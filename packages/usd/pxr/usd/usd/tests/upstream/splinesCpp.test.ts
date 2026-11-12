// Ported from OpenUSD 26.11.1: pxr/usd/usd/attribute.cpp,
//  pxr/usd/usd/testenv/testUsdSplines.py,
//  pxr/usd/usd/testenv/testUsdSplinesCpp.cpp
// Copyright 2016, 2024, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdSplinesCpp.cpp
// (registered as testUsdSplinesCpp; no testenv directory). splines.test.ts
// holds the separate testUsdSplines.py port.
//
// API mapping:
//   - TF_AXIOM failures are expect() failures; T(x) for a Ts value type is
//     the number x on a knot of that TfType (Ts_GetType<T>(): 'double',
//     'float', 'GfHalf', 'GfTimeCode').
//   - TsSpline operator== is TsSpline.equals.
//   - UsdStage::CreateNew(filename) + Save is an in-memory stage whose root
//     layer is exported to filename, in a scratch working directory.
//   - UsdAttribute::Get<T>(&value, time) returning false is
//     getValueAtTime(time) === undefined; TsSpline::Eval likewise.
//   - The TF_CODING_ERROR SetSpline posts for an unsupported value type is a
//     thrown Error (UsdAttribute::SetSpline, attribute.cpp).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  CurveType as TsCurveType, ExtrapMode as TsExtrapMode, Extrapolation as TsExtrapolation,
  InterpMode as TsInterpMode, Knot as TsKnot, LoopParams as TsLoopParams, Spline as TsSpline,
} from 'typescript-usd/ts'
import { Type as TfType } from 'typescript-usd/tf'
import { AttributeQuery, Stage, TimeCode as UsdTimeCode, type Attribute } from 'typescript-usd/usd'

type TsTypeName = 'double' | 'float' | 'GfHalf' | 'GfTimeCode'
const sdfTypeFor: Record<TsTypeName, string> = {
  double: 'double', float: 'float', GfHalf: 'half', GfTimeCode: 'timecode',
}

// testUsdSplinesCpp.cpp:26-74 _TestSplineAndAttr
function testSplineAndAttr(spline: TsSpline, attr: Attribute): void {
  let splineValue = spline.eval(1.0)
  let attrValue = attr.getValueAtTime(1.0)
  if (attrValue === undefined || splineValue === undefined) {
    expect(attrValue === undefined).toBe(splineValue === undefined)
  } else {
    expect(attrValue).toBe(splineValue)
  }
  const attrQuery = new AttributeQuery(attr)
  expect(attrQuery.getSpline()!.equals(spline)).toBe(true)
  const queryValue = attrQuery.get(1.0)
  if (queryValue === undefined || splineValue === undefined) {
    expect(queryValue === undefined).toBe(splineValue === undefined)
  } else {
    expect(queryValue).toBe(splineValue)
  }

  // Do a pre value test.
  splineValue = spline.evalPreValue(0.0)
  attrValue = attr.getValueAtTime(UsdTimeCode.PreTime(1.0))
  if (attrValue === undefined || splineValue === undefined) {
    expect(attrValue === undefined).toBe(splineValue === undefined)
  } else {
    expect(attrValue).toBe(splineValue)
  }
}

// testUsdSplinesCpp.cpp:76-99 _GetTestSpline<T>
function getTestSpline(typeName: TsTypeName = 'double'): TsSpline {
  const type = TfType.declare(typeName)
  const spline = new TsSpline(type)
  const knot1 = new TsKnot(type)
  knot1.SetTime(1)
  knot1.setValue(8.0)
  knot1.setPreValue(6.0)
  knot1.setNextInterpolation(TsInterpMode.Curve)
  knot1.setPostTanWidth(1.3)
  knot1.setPostTanSlope(0.125)
  spline.setKnot(knot1)
  const knot2 = new TsKnot(type)
  knot2.SetTime(6)
  knot2.setValue(20.0)
  knot2.setPreValue(10.0)
  knot2.setNextInterpolation(TsInterpMode.Curve)
  knot2.setPreTanWidth(1.3)
  knot2.setPreTanSlope(-0.2)
  knot2.setPostTanWidth(2)
  knot2.setPostTanSlope(0.3)
  spline.setKnot(knot2)
  return spline
}

// testUsdSplinesCpp.cpp:101-139 _DoSerializationTest
async function doSerializationTest(desc: string, spline: TsSpline, attrType = 'double', isEmpty = false) {
  for (const format of ['usda', 'usdc']) {
    const filename1 = `test_Serialization_${desc}.${format}`
    const filename2 = `${filename1}.copy.${format}`
    const stage = Stage.createNew()
    const prim = stage.definePrim('/MyPrim')
    const attr = prim.createAttribute('myAttr', attrType)
    expect(attr.hasSpline()).toBe(false)
    expect(attr.valueMightBeTimeVarying()).toBe(false)
    attr.setSpline(spline)
    expect(attr.hasSpline()).toBe(true)
    // Having a spline makes this attr might be time varying.
    expect(attr.valueMightBeTimeVarying()).toBe(true)

    expect(await stage.getRootLayer().export(filename1)).toBe(true)
    expect(await stage.getRootLayer().export(filename2)).toBe(true)

    const stage2 = (await Stage.open(filename2))!
    const attr2 = stage2.getAttributeAtPath('/MyPrim.myAttr')!
    expect(attr2.hasSpline()).toBe(true)

    const spline2 = attr2.getSpline()!
    expect(spline2.IsEmpty()).toBe(isEmpty)
    expect(spline.equals(spline2)).toBe(true)
  }
}

// testUsdSplinesCpp.cpp:141-192 _DoLayerOffsetTest<T>
async function doLayerOffsetTest(typeName: TsTypeName, scale: number) {
  const stage = Stage.createNew()
  const rootLayer = stage.getRootLayer()
  const deepLayer = Layer.createAnonymous()

  rootLayer.setSubLayerPaths([deepLayer.identifier])
  rootLayer.setSubLayerOffset({ offset: 5.0, scale }, 0)
  await stage.flushChanges()

  stage.setEditTarget(stage.getEditTargetForLocalLayer(deepLayer))

  const spline = getTestSpline(typeName)

  const prim = stage.definePrim('/MyPrim')
  const attr = prim.createAttribute('myAttr', sdfTypeFor[typeName])
  expect(attr.hasSpline()).toBe(false)
  expect(attr.valueMightBeTimeVarying()).toBe(false)
  attr.setSpline(spline)
  expect(attr.hasSpline()).toBe(true)
  expect(attr.valueMightBeTimeVarying()).toBe(true)

  testSplineAndAttr(spline, attr)

  const sdfAttr = deepLayer.getAttributeAtPath('/MyPrim.myAttr')!
  const value = sdfAttr.getInfo('spline')
  expect(value).toBeInstanceOf(TsSpline)
  const sdfSpline = value as TsSpline

  const attr2 = stage.getAttributeAtPath('/MyPrim.myAttr')!
  const spline2 = attr2.getSpline()!
  expect(spline2.equals(spline)).toBe(true)
  testSplineAndAttr(spline2, attr2)

  const value3 = attr2.getMetadata('spline')
  expect(value3).toBeInstanceOf(TsSpline)
  const spline3 = value3 as TsSpline

  expect(spline3.equals(spline)).toBe(true)
  expect(sdfSpline.equals(spline)).toBe(false)
}

describe('testUsdSplinesCpp', () => {
  let scratch = ''
  const cwd = process.cwd()
  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'testUsdSplinesCpp-'))
    process.chdir(scratch)
  })
  afterEach(() => {
    process.chdir(cwd)
    rmSync(scratch, { recursive: true, force: true })
  })

  // testUsdSplinesCpp.cpp:194-202
  it('TestSerializationEmpty', async () => {
    const attrType = 'double'
    await doSerializationTest('Empty', new TsSpline(TfType.declare('double')), attrType, true)
  })

  // testUsdSplinesCpp.cpp:204-277
  it('TestSerializationMuseum', async () => {
    const twoKnotBezier = (() => {
      const spline = new TsSpline()
      spline.setCurveType(TsCurveType.Bezier)
      const knot1 = new TsKnot()
      knot1.SetTime(1.0)
      knot1.setNextInterpolation(TsInterpMode.Curve)
      knot1.setValue(1.0)
      knot1.setPostTanSlope(1.0)
      knot1.setPostTanWidth(0.5)
      const knot2 = new TsKnot()
      knot2.SetTime(5.0)
      knot2.setNextInterpolation(TsInterpMode.Curve)
      knot2.setValue(2.0)
      knot2.setPreTanSlope(0.0)
      knot2.setPreTanWidth(0.5)
      spline.setKnot(knot1)
      spline.setKnot(knot2)
      return spline
    })()

    const complexParams = (() => {
      const spline = new TsSpline()
      spline.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.Linear))
      const postExtrap = new TsExtrapolation(TsExtrapMode.Sloped)
      postExtrap.slope = 0.57
      spline.setPostExtrapolation(postExtrap)
      const knot1 = new TsKnot()
      knot1.SetTime(7)
      knot1.setNextInterpolation(TsInterpMode.Held)
      knot1.setPreValue(5.5)
      knot1.setValue(7.21)
      const knot2 = new TsKnot()
      knot2.SetTime(15)
      knot2.setNextInterpolation(TsInterpMode.Curve)
      knot2.setValue(8.18)
      knot2.setPostTanSlope(1.17)
      knot2.setPostTanWidth(2.49)
      const knot3 = new TsKnot()
      knot3.SetTime(20)
      knot3.setNextInterpolation(TsInterpMode.Curve)
      knot3.setValue(14.72)
      knot3.setPreTanSlope(-1.4)
      knot3.setPreTanWidth(3.77)
      knot3.setPostTanSlope(-1.4)
      knot3.setPostTanWidth(1.1)
      spline.setKnot(knot1)
      spline.setKnot(knot2)
      spline.setKnot(knot3)
      return spline
    })()

    for (const [exhibit, spline] of [['TwoKnotBezier', twoKnotBezier], ['ComplexParams', complexParams]] as const) {
      await doSerializationTest(`Museum.${exhibit}`, spline)
    }
  })

  // testUsdSplinesCpp.cpp:279-349
  it('TestSerializationComplex', async () => {
    // Bezier, custom data dictionary.
    {
      const spline = new TsSpline()
      const knot1 = new TsKnot()
      knot1.SetTime(-14.7)
      knot1.setValue(11.30752)
      knot1.setNextInterpolation(TsInterpMode.Curve)
      knot1.setPostTanWidth(1.8)
      knot1.setPostTanSlope(1.4)
      knot1.setCustomData({ a: 'yes', b: 4, c: { d: 'ugh' } })
      spline.setKnot(knot1)
      const knot2 = new TsKnot()
      knot2.SetTime(-1.2)
      knot2.setValue(22.994037)
      knot2.setNextInterpolation(TsInterpMode.Curve)
      knot2.setPreTanWidth(1.6)
      knot2.setPreTanSlope(0.7)
      knot2.setPostTanWidth(2.3)
      knot2.setPostTanSlope(5.7)
      spline.setKnot(knot2)
      await doSerializationTest('Complex.1', spline)
    }

    // Bezier
    {
      const spline = getTestSpline('double')
      const knot1 = new TsKnot()
      knot1.SetTime(40)
      knot1.setValue(-44.0)
      knot1.setNextInterpolation(TsInterpMode.Curve)
      knot1.setPreTanWidth(1)
      knot1.setPreTanSlope(0.0)
      knot1.setPostTanWidth(7.3)
      knot1.setPostTanSlope(0.0)
      spline.setKnot(knot1)
      await doSerializationTest('Complex.2', spline)
    }

    // Hermite
    {
      const spline = new TsSpline()
      spline.setCurveType(TsCurveType.Hermite)
      const knot1 = new TsKnot()
      knot1.SetTime(1)
      knot1.setValue(8.0)
      knot1.setNextInterpolation(TsInterpMode.Curve)
      knot1.setPostTanSlope(4.0)
      spline.setKnot(knot1)
      const knot2 = new TsKnot()
      knot2.SetTime(6)
      knot2.setValue(20.0)
      knot2.setNextInterpolation(TsInterpMode.Curve)
      knot2.setPreTanSlope(-0.7)
      knot2.setPostTanSlope(1.0)
      spline.setKnot(knot2)
      await doSerializationTest('Complex.3', spline)
    }
  })

  // testUsdSplinesCpp.cpp:351-372
  it('TestSerializationValueTypes', async () => {
    await doSerializationTest('ValueTypes.Float', getTestSpline('float'), 'float')
    await doSerializationTest('ValueTypes.Half', getTestSpline('GfHalf'), 'half')
    await doSerializationTest('ValueTypes.TimeCode', getTestSpline('GfTimeCode'), 'timecode')
  })

  // testUsdSplinesCpp.cpp:374-410
  it('TestSerializationLoops', async () => {
    // Valid loop params.
    const spline = new TsSpline()
    const knot1 = new TsKnot()
    knot1.SetTime(1)
    knot1.setValue(5.0)
    knot1.setNextInterpolation(TsInterpMode.Curve)
    knot1.setPreTanWidth(1)
    knot1.setPreTanSlope(1.0)
    knot1.setPostTanWidth(1)
    knot1.setPostTanSlope(1.0)
    spline.setKnot(knot1)

    const lp = new TsLoopParams()
    lp.protoStart = 1
    lp.protoEnd = 10
    lp.numPostLoops = 1
    spline.setInnerLoopParams(lp)
    await doSerializationTest('Loops.Valid', spline)

    // No knot at the prototype start time, so the loop params are invalid.
    // They should be serialized and read back anyway.
    lp.protoStart = 2
    spline.setInnerLoopParams(lp)
    await doSerializationTest('Loops.Invalid', spline)
  })

  // testUsdSplinesCpp.cpp:412-418
  it('TestLayerOffsets', async () => {
    await doLayerOffsetTest('double', 2.0)
  })

  // testUsdSplinesCpp.cpp:420-426
  it('TestLayerOffsetsTimeCode', async () => {
    await doLayerOffsetTest('GfTimeCode', 2.0)
  })

  // testUsdSplinesCpp.cpp:428-447
  it('TestInvalidType', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/MyPrim')
    const attr = prim.createAttribute('myAttr', 'string')
    const spline = getTestSpline('double')

    expect(attr.hasSpline()).toBe(false)
    // A coding error is posted: String value splines are not allowed.
    expect(() => attr.setSpline(spline)).toThrow()
    expect(attr.hasSpline()).toBe(false)
    expect(attr.valueMightBeTimeVarying()).toBe(false)
  })

  // testUsdSplinesCpp.cpp:449-473
  it('TestClobbered', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/MyPrim')
    const attr = prim.createAttribute('myAttr', 'double')
    const spline = getTestSpline('double')

    attr.setSpline(spline)
    expect(attr.hasSpline()).toBe(true)
    expect(attr.getSpline()!.equals(spline)).toBe(true)
    attr.setTimeSample(1, 100.0)

    expect(attr.hasSpline()).toBe(false)
    expect(attr.getSpline()?.IsEmpty() ?? true).toBe(true)
    attr.setSpline(spline)
    expect(attr.hasSpline()).toBe(false)
    expect(attr.getSpline()?.IsEmpty() ?? true).toBe(true)

    expect(attr.getValueAtTime(1)).toBe(100.0)
  })

  // testUsdSplinesCpp.cpp:475-508
  it('TestWeakerSplineOpinion', async () => {
    const stage = Stage.createNew()
    const rootLayer = stage.getRootLayer()
    const subLayer = Layer.createAnonymous()
    rootLayer.setSubLayerPaths([subLayer.identifier])
    await stage.flushChanges()

    // Set spline in the subLayer
    stage.setEditTarget(stage.getEditTargetForLocalLayer(subLayer))
    const prim = stage.definePrim('/MyPrim')
    const attr = prim.createAttribute('myAttr', 'double')
    const spline = getTestSpline('double')
    attr.setSpline(spline)
    expect(attr.hasSpline()).toBe(true)
    expect(attr.getSpline()!.equals(spline)).toBe(true)

    // Set stronger time samples in the rootLayer
    stage.setEditTarget(stage.getEditTargetForLocalLayer(rootLayer))
    stage.definePrim('/MyPrim')
    const rootAttr = prim.createAttribute('myAttr', 'double')
    expect(attr.hasSpline()).toBe(true)
    expect(attr.getSpline()!.equals(spline)).toBe(true)
    rootAttr.setTimeSample(1, 100.0)
    expect(attr.hasSpline()).toBe(false)
    expect(attr.getSpline()?.IsEmpty() ?? true).toBe(true)

    expect(attr.getValueAtTime(1)).toBe(100.0)
  })
})
