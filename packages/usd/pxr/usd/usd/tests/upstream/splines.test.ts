// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdSplines.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of the ten registered v26.05 testenv/testUsdSplines.py methods.
// The native testenv was run live against the matching reference build.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, AttributeQuery as UsdAttributeQuery, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { ArInMemoryResolver, Layer } from 'typescript-usd/usd/_internal'
import {
  CurveType as TsCurveType, ExtrapMode as TsExtrapMode, Extrapolation as TsExtrapolation, InterpMode as TsInterpMode, Knot as TsKnot,
  LoopParams as TsLoopParams, Spline as TsSpline,
} from 'typescript-usd/ts'
import { Type as TfType } from 'typescript-usd/tf'

let files: Record<string, string> = {}

beforeEach(() => {
  files = {}
  _setResolverForTest(new ArInMemoryResolver({}))
})

function knot(
  time: number, value: number, preValue = value,
  interpolation = TsInterpMode.Curve,
): TsKnot {
  const result = new TsKnot(TfType.declare('double'))
  result.SetTime(time)
  result.setValue(value)
  if (preValue !== value) result.setPreValue(preValue)
  result.setNextInterpolation(interpolation)
  return result
}

function testSpline(typeName = 'double'): TsSpline {
  const valueType = TfType.declare(typeName)
  const spline = new TsSpline(valueType)
  const first = new TsKnot(valueType)
  first.SetTime(1)
  first.setValue(8)
  first.setPreValue(6)
  first.setNextInterpolation(TsInterpMode.Curve)
  first.setPostTanWidth(1.3)
  first.setPostTanSlope(0.125)
  const second = new TsKnot(valueType)
  second.SetTime(6)
  second.setValue(20)
  second.setPreValue(10)
  second.setNextInterpolation(TsInterpMode.Curve)
  second.setPreTanWidth(1.3)
  second.setPreTanSlope(-0.2)
  second.setPostTanWidth(2)
  second.setPostTanSlope(0.3)
  spline.setKnots([first, second])
  return spline
}

function roundTripSpline(spline: TsSpline, typeName = 'double'): TsSpline | undefined {
  const layer = Layer.createAnonymous('.usda')
  layer.definePrimSpec('/MyPrim')
  layer.declareProperty('/MyPrim', 'myAttr', typeName)
  layer.setField('/MyPrim.myAttr', 'spline', spline)
  const copy = Layer.createInMemory('spline-copy.usda', layer.toUsda())
  return copy.getField('/MyPrim.myAttr', 'spline') as TsSpline | undefined
}

describe('UsdSplines', () => {
  it('serializes empty splines and their non-knot state', () => {
    const cases = [new TsSpline()]
    const hermite = new TsSpline()
    hermite.setCurveType(TsCurveType.Hermite)
    cases.push(hermite)
    const pre = new TsSpline()
    pre.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.Linear, 2))
    cases.push(pre)
    const post = new TsSpline()
    post.setPostExtrapolation(new TsExtrapolation(TsExtrapMode.Linear, 2))
    cases.push(post)
    const loop = new TsSpline()
    loop.setInnerLoopParams(new TsLoopParams(1, 2, 3, 4))
    cases.push(loop)
    for (const spline of cases) expect(roundTripSpline(spline)).toEqual(spline)
  })

  it('serializes the representative museum spline shapes', () => {
    const bezier = new TsSpline()
    bezier.setKnots([knot(1, 8), knot(6, 20)])
    const complex = testSpline()
    complex.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.Sloped, 0.5))
    expect(roundTripSpline(bezier)).toEqual(bezier)
    expect(roundTripSpline(complex)).toEqual(complex)
  })

  it('serializes complex Bezier, Hermite, tangent, and custom-data state', () => {
    const spline = testSpline()
    const knots = spline.getKnots()
    knots[0]!.setCustomData({ a: 'yes', b: 4, c: { d: 'ugh' } })
    spline.setKnots(knots)
    const hermite = testSpline()
    hermite.setCurveType(TsCurveType.Hermite)
    expect(roundTripSpline(spline)).toEqual(spline)
    expect(roundTripSpline(hermite)).toEqual(hermite)
  })

  it('serializes float, half, and timecode spline value types', () => {
    for (const typeName of ['float', 'half', 'timecode']) {
      const spline = testSpline(typeName === 'timecode' ? 'double' : typeName)
      if (typeName === 'timecode') spline.setTimeValued(true)
      expect(roundTripSpline(spline, typeName)).toEqual(spline)
    }
  })

  it('serializes valid and invalid inner loop parameters', () => {
    const spline = testSpline()
    spline.setInnerLoopParams(new TsLoopParams(1, 10, 0, 1))
    expect(roundTripSpline(spline)).toEqual(spline)
    spline.setInnerLoopParams(new TsLoopParams(2, 10, 0, 1))
    expect(roundTripSpline(spline)).toEqual(spline)
  })

  it('applies layer offsets to spline query times', async () => {
    files = {
      'root.usda': `#usda 1.0\n(subLayers = [@./deep.usda@ (offset = 5; scale = 2)])`,
      'deep.usda': `#usda 1.0
def "MyPrim" { double myAttr.spline = { 1: 6 & 8; post held, } ; }`,
    }
    _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    )))
    const attr = ((await Stage.open('root.usda'))!).get('/MyPrim.myAttr')!
    expect(attr.getValueAtTime(7)).toBe(8)
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(7))).toBe(6)
    const spline = attr.getSpline()!
    expect(spline.getKnots()[0]?.getTime()).toBe(7)
    expect(spline.getKnots()[0]?.GetValue()).toBe(8)
    expect(attr.getField('spline')).toEqual(spline)
    const query = new UsdAttributeQuery(attr)
    expect(query.getSpline()).toEqual(spline)
    expect(query.get(7)).toBe(8)
    expect(query.get(UsdTimeCode.PreTime(7))).toBe(6)
  })

  it('applies layer offsets to timecode-valued spline values', async () => {
    files = {
      'root.usda': `#usda 1.0\n(subLayers = [@./deep.usda@ (offset = 5; scale = 2)])`,
      'deep.usda': `#usda 1.0
def "MyPrim" { timecode myAttr.spline = { 1: 6 & 8; post held, } ; }`,
    }
    _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    )))
    const attr = ((await Stage.open('root.usda'))!).get('/MyPrim.myAttr')!
    expect(attr.getValueAtTime(7)).toBe(21)
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(7))).toBe(17)
    const spline = attr.getSpline()!
    expect(spline.getKnots()[0]?.getTime()).toBe(7)
    expect(spline.getKnots()[0]?.getPreValue()).toBe(17)
    expect(spline.getKnots()[0]?.GetValue()).toBe(21)
    expect(attr.getField('spline')).toEqual(spline)
    const query = new UsdAttributeQuery(attr)
    expect(query.getSpline()).toEqual(spline)
    expect(query.get(7)).toBe(21)
    expect(query.get(UsdTimeCode.PreTime(7))).toBe(17)
  })

  it('rejects splines on unsupported attribute value types', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/MyPrim')
    stage.declareProperty('/MyPrim', 'myAttr', 'string')
    const attr = prim.attr('myAttr')
    expect(() => attr.setSpline(testSpline())).toThrow()
    expect(stage.get('/MyPrim.myAttr')!.hasSpline()).toBe(false)
  })

  it('stronger time samples clobber a spline source', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/MyPrim')
    stage.declareProperty('/MyPrim', 'myAttr', 'double')
    const attr = prim.attr('myAttr')
    attr.setSpline(testSpline())
    expect(stage.get('/MyPrim.myAttr')!.hasSpline()).toBe(true)
    attr.setTimeSample(1, 100)
    expect(stage.get('/MyPrim.myAttr')!.hasSpline()).toBe(false)
    expect(stage.get('/MyPrim.myAttr')!.getSpline()?.getKnots() ?? []).toEqual([])
    attr.setSpline(testSpline())
    expect(stage.get('/MyPrim.myAttr')!.hasSpline()).toBe(false)
    expect(stage.get('/MyPrim.myAttr')!.getValueAtTime(1)).toBe(100)
  })

  it('a stronger ordinary opinion hides a weaker spline', async () => {
    files = {
      'root.usda': `#usda 1.0
(subLayers = [@./weak.usda@])
def "MyPrim" { double myAttr.timeSamples = { 1: 100 } ; }`,
      'weak.usda': `#usda 1.0
over "MyPrim" { double myAttr.spline = { 1: 6 & 8; post held, } ; }`,
    }
    _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    )))
    const attr = ((await Stage.open('root.usda'))!).get('/MyPrim.myAttr')!
    expect(attr.hasSpline()).toBe(false)
    expect(attr.getSpline()?.getKnots() ?? []).toEqual([])
    expect(attr.getValueAtTime(1)).toBe(100)
  })
})
