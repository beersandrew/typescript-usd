// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdTimeSamples.py, pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/attribute.h
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of the applicable sections of testenv/testUsdTimeSamples.py.
// Expected values are from the registered v26.05 testenv, also run live
// against the matching reference build before this port.

import { beforeEach, describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import { Attribute, InterpolationTypeHeld, Stage, AttributeQuery as UsdAttributeQuery, ResolveInfoSource as UsdResolveInfoSource, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}

beforeEach(() => {
  _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
    Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
  )))
})

describe('UsdTimeSamples', () => {
  it('UsdTimeCode construction, ordering, and SafeStep', () => {
    expect(UsdTimeCode.Default()).toEqual(UsdTimeCode.Default())
    expect(UsdTimeCode.safeStep()).toBe(4.440892098500626e-9)
    expect(UsdTimeCode.Default() < UsdTimeCode.EarliestTime()).toBe(true)
    expect(UsdTimeCode.PreTime(2) < new UsdTimeCode(2)).toBe(true)
  })

  it('enumerates intervals and brackets from the selected time-sample source', () => {
    const stage = Stage.createNew()
    const writable = stage.definePrim('/Test').createAttr('varying', 0)
    writable.setTimeSample(1, 1)
    writable.setTimeSample(2, 2)
    const attr = stage.get('/Test.varying')!

    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.TimeSamples)
    expect(attr.getResolveInfo(1).getSource()).toBe(UsdResolveInfoSource.TimeSamples)
    expect(attr.getResolveInfo('default').getSource()).toBe(UsdResolveInfoSource.Default)
    expect(attr.getTimeSampleKeys()).toEqual([1, 2])
    expect(attr.getTimeSamplesInInterval(new GfInterval(0, 1))).toEqual([1])
    expect(attr.getTimeSamplesInInterval(new GfInterval(0, 6))).toEqual([1, 2])
    expect(attr.getTimeSamplesInInterval(new GfInterval(1, 2, false, false))).toEqual([])
    expect(attr.getTimeSamplesInInterval(new GfInterval(1, 2, true, false))).toEqual([1])
    expect(attr.getTimeSamplesInInterval(new GfInterval(1, 2, false, true))).toEqual([2])
    expect(attr.getTimeSamplesInInterval(new GfInterval())).toEqual([])
    expect(attr.getTimeSamplesInInterval(new GfInterval(50, 1))).toEqual([])
    expect(attr.getBracketingTimeSamples(1.5)).toEqual([1, 2])
    expect(attr.getBracketingTimeSamples(0.9)).toEqual([1, 1])
    expect(attr.getBracketingTimeSamples(2.1)).toEqual([2, 2])
  })

  it('UsdAttribute unions time samples across attributes', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/foo')
    prim.createAttr('attr1').setTimeSample(1, true)
    prim.attr('attr1').setTimeSample(3, false)
    prim.createAttr('attr2').setTimeSample(2, 100)
    prim.attr('attr2').setTimeSample(4, 200)
    const attrs = [stage.get('/foo.attr1')!, stage.get('/foo.attr2')!]
    expect(Attribute.getUnionedTimeSamples(attrs)).toEqual([1, 2, 3, 4])
    expect(Attribute.getUnionedTimeSamplesInInterval(
      attrs, new GfInterval(1.5, 3.5))).toEqual([2, 3])
  })

  it('UsdAttributeQuery unions time samples across cached queries', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/foo')
    prim.createAttr('attr1').setTimeSample(1, true)
    prim.attr('attr1').setTimeSample(3, false)
    prim.createAttr('attr2').setTimeSample(2, 100)
    prim.attr('attr2').setTimeSample(4, 200)
    const queries = [
      new UsdAttributeQuery(stage.get('/foo.attr1')),
      new UsdAttributeQuery(stage.get('/foo.attr2')),
    ]
    expect(UsdAttributeQuery.getUnionedTimeSamples(queries)).toEqual([1, 2, 3, 4])
    expect(UsdAttributeQuery.getUnionedTimeSamplesInInterval(
      queries, new GfInterval(1.5, 3.5))).toEqual([2, 3])
  })

  it('an empty authored time-sample map resolves through to the default', async () => {
    files = {
      'empty.usda': `#usda 1.0
def "Foo" {
    int x = 123
    int x.timeSamples = {}
}
`,
    }
    _setResolverForTest(new ArInMemoryResolver({
      'empty.usda': new TextEncoder().encode(files['empty.usda']!),
    }))
    const x = ((await Stage.open('empty.usda'))!).get('/Foo.x')!
    expect(x.getValue()).toBe(123)
    expect(x.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Default)
  })

  // OpenUSD v26.08 testUsdTimeSamples.py:97-171 and stage.cpp:9360-9404.
  it('distinguishes default-only and time-samples-only values at default and numeric times', async () => {
    _setResolverForTest(new ArInMemoryResolver({
      'resolution.usda': new TextEncoder().encode(`#usda 1.0
def "P" {
    int fromDefault = 7
    int sampled.timeSamples = { 0: 2, 10: 12 }
}
`),
    }))
    const stage = (await Stage.open('resolution.usda'))!
    stage.setInterpolationType(InterpolationTypeHeld)
    const fromDefault = stage.get('/P.fromDefault')!
    const sampled = stage.get('/P.sampled')!

    expect(fromDefault.getResolveInfo('default').getSource()).toBe(UsdResolveInfoSource.Default)
    expect([-5, 0, 5, 10, 15].map(time => fromDefault.getValueAtTime(time)))
      .toEqual([7, 7, 7, 7, 7])
    expect(sampled.getResolveInfo('default').getSource()).toBe(UsdResolveInfoSource.None)
    expect(sampled.getValue()).toBeUndefined()
    expect([-5, 0, 5, 10, 15].map(time => sampled.getValueAtTime(time)))
      .toEqual([2, 2, 2, 12, 12])
  })

  it('layer offsets affect sample enumeration, bracketing, and values', async () => {
    files = {
      'source.usda': `#usda 1.0
def "Source" {
    float x.timeSamples = { 0: 0, 10: 10 }
}
`,
      'root.usda': `#usda 1.0
def "Test1" ( references = @./source.usda@</Source> (offset = 100) ) {}
def "Test2" ( references = @./source.usda@</Source> (scale = 2) ) {}
`,
    }
    _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    )))
    const stage = (await Stage.open('root.usda'))!
    const shifted = stage.get('/Test1.x')!
    expect(shifted.getTimeSampleKeys()).toEqual([100, 110])
    expect(shifted.getTimeSamplesInInterval(new GfInterval(0, 10))).toEqual([])
    expect(shifted.getValueAtTime(10)).toBe(0)
    expect(shifted.getValueAtTime(110)).toBe(10)
    const scaled = stage.get('/Test2.x')!
    expect(scaled.getTimeSampleKeys()).toEqual([0, 20])
    expect(scaled.getValueAtTime(10)).toBe(5)
  })

  it('SdfLayer returns the previous authored sample strictly before a time', async () => {
    files = {
      'previous.usda': `#usda 1.0
def "Prim" {
    double attr.timeSamples = { 1: 1, 2: 2, 3: 3 }
}
`,
    }
    _setResolverForTest(new ArInMemoryResolver({
      'previous.usda': new TextEncoder().encode(files['previous.usda']!),
    }))
    const layer = ((await Stage.open('previous.usda'))!).getRootLayer()
    expect(layer.getPreviousTimeSampleForPath('/Prim.attr', 2)).toBe(1)
    expect(layer.getPreviousTimeSampleForPath('/Prim.attr', 7)).toBe(3)
  })

  it('PreTime queries use the value immediately before an exact sample', () => {
    const stage = Stage.createNew()
    const x = stage.definePrim('/Foo').createAttr('x')
    x.setTimeSample(1, 'zero')
    x.setTimeSample(2, 'one')
    x.setTimeSample(3, 'two')
    const attr = stage.get('/Foo.x')!
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(0))).toBe('zero')
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(2))).toBe('zero')
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(2.5))).toBe('one')
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(3))).toBe('one')
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(4))).toBe('two')
  })

  // test_PreTimeTimeSamples (testUsdTimeSamples.py:360-389) as upstream
  // writes it: UsdAttribute::Set(value, time) and Get(time) (attribute.h:
  // 474-553), with the default time when no time is given.
  it('UsdAttribute Get(time) and Set(value, time), held values', () => {
    const stage = Stage.createNew()
    const x = stage.definePrim('/Foo').createAttribute('x', 'string')
    x.set('zero', new UsdTimeCode(1))
    x.set('one', 2)
    x.set('two', new UsdTimeCode(3))
    x.set('dflt', UsdTimeCode.Default())
    expect(x.getTimeSampleKeys()).toEqual([1, 2, 3])
    expect(x.get()).toBe('dflt')
    expect(x.get(UsdTimeCode.Default())).toBe('dflt')
    // Ordinary time samples queries.
    expect(x.get(new UsdTimeCode(0))).toBe('zero')
    expect(x.get(new UsdTimeCode(1))).toBe('zero')
    expect(x.get(new UsdTimeCode(2))).toBe('one')
    expect(x.get(new UsdTimeCode(3))).toBe('two')
    expect(x.get(4)).toBe('two')
    // Pre-time queries.
    expect(x.get(UsdTimeCode.PreTime(0))).toBe('zero')
    expect(x.get(UsdTimeCode.PreTime(1))).toBe('zero')
    expect(x.get(UsdTimeCode.PreTime(1.5))).toBe('zero')
    expect(x.get(UsdTimeCode.PreTime(2))).toBe('zero')
    expect(x.get(UsdTimeCode.PreTime(2.5))).toBe('one')
    expect(x.get(UsdTimeCode.PreTime(3))).toBe('one')
    expect(x.get(UsdTimeCode.PreTime(4))).toBe('two')
    // UsdStage::_SetValue (stage.cpp:2031-2036): no value is set at a pre-time.
    x.set('pre', UsdTimeCode.PreTime(5))
    expect(x.getTimeSampleKeys()).toEqual([1, 2, 3])
  })

  it('PreTime preserves linear interpolation at and between samples', async () => {
    _setResolverForTest(new ArInMemoryResolver({
      'linear.usda': new TextEncoder().encode(`#usda 1.0
def "Foo" {
    double x.timeSamples = { 1: 0, 2: 1.1, 3: 2.2 }
}
`),
    }))
    const x = ((await Stage.open('linear.usda'))!).get('/Foo.x')!
    expect(x.getValueAtTime(UsdTimeCode.PreTime(0))).toBe(0)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(1))).toBe(0)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(1.5))).toBe(0.55)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(2))).toBe(1.1)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(2.5))).toBeCloseTo(1.65)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(3))).toBe(2.2)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(4))).toBe(2.2)
  })

  it('PreTime holds across a blocked linear sample', async () => {
    _setResolverForTest(new ArInMemoryResolver({
      'blocked.usda': new TextEncoder().encode(`#usda 1.0
def "Foo" {
    double x.timeSamples = { 1: 0, 2: None, 3: 2.2 }
}
`),
    }))
    const x = ((await Stage.open('blocked.usda'))!).get('/Foo.x')!
    expect(x.getValueAtTime(1.5)).toBe(0)
    expect(x.getValueAtTime(2)).toBeUndefined()
    expect(x.getValueAtTime(2.5)).toBeUndefined()
    expect(x.getValueAtTime(UsdTimeCode.PreTime(2))).toBe(0)
    expect(x.getValueAtTime(UsdTimeCode.PreTime(2.5))).toBeUndefined()
    expect(x.getValueAtTime(UsdTimeCode.PreTime(3))).toBeUndefined()
    expect(x.getValueAtTime(UsdTimeCode.PreTime(4))).toBe(2.2)
  })

  it('PreTime holds mismatched arrays and interpolates equal-sized arrays', async () => {
    _setResolverForTest(new ArInMemoryResolver({
      'arrays.usda': new TextEncoder().encode(`#usda 1.0
def "Foo" {
    double[] x.timeSamples = {
        1: [0, 1], 2: [1], 3: [2, 3], 4: [4, 5], 5: None, 6: [6, 7]
    }
}
`),
    }))
    const x = ((await Stage.open('arrays.usda'))!).get('/Foo.x')!
    expect(x.getValueAtTime(1.5)).toEqual([0, 1])
    expect(x.getValueAtTime(2.5)).toEqual([1])
    expect(x.getValueAtTime(3.5)).toEqual([3, 4])
    expect(x.getValueAtTime(UsdTimeCode.PreTime(2))).toEqual([0, 1])
    expect(x.getValueAtTime(UsdTimeCode.PreTime(3))).toEqual([1])
    expect(x.getValueAtTime(UsdTimeCode.PreTime(4))).toEqual([4, 5])
    expect(x.getValueAtTime(UsdTimeCode.PreTime(5))).toEqual([4, 5])
    expect(x.getValueAtTime(UsdTimeCode.PreTime(6))).toBeUndefined()
  })

  it('PreTime applies reference offsets to held, linear, and blocked sources', async () => {
    _setResolverForTest(new ArInMemoryResolver({
      'offset.usda': new TextEncoder().encode(`#usda 1.0
def "Foo" {
    string held.timeSamples = { 1: "zero", 2: "one", 3: "two" }
    double linear.timeSamples = { 1: 0, 2: 1.1, 3: 2.2 }
    double blocked.timeSamples = { 1: 0, 2: None, 3: 2.2 }
    double[] arrays.timeSamples = {
        1: [0, 1], 2: [1], 3: [2, 3], 4: [4, 5], 5: None, 6: [6, 7]
    }
}
def "FooOffset" ( references = </Foo> (offset = 10) ) {}
`),
    }))
    const stage = (await Stage.open('offset.usda'))!
    const held = stage.get('/FooOffset.held')!
    expect(held.getValueAtTime(UsdTimeCode.PreTime(12))).toBe('zero')
    expect(held.getValueAtTime(UsdTimeCode.PreTime(12.5))).toBe('one')
    expect(held.getValueAtTime(UsdTimeCode.PreTime(13))).toBe('one')
    const linear = stage.get('/FooOffset.linear')!
    expect(linear.getValueAtTime(UsdTimeCode.PreTime(11.5))).toBe(0.55)
    expect(linear.getValueAtTime(UsdTimeCode.PreTime(12))).toBe(1.1)
    expect(linear.getValueAtTime(UsdTimeCode.PreTime(12.5))).toBeCloseTo(1.65)
    const blocked = stage.get('/FooOffset.blocked')!
    expect(blocked.getValueAtTime(UsdTimeCode.PreTime(12))).toBe(0)
    expect(blocked.getValueAtTime(UsdTimeCode.PreTime(12.5))).toBeUndefined()
    expect(blocked.getValueAtTime(UsdTimeCode.PreTime(13))).toBeUndefined()
    const arrays = stage.get('/FooOffset.arrays')!
    expect(arrays.getValueAtTime(13.5)).toEqual([3, 4])
    expect(arrays.getValueAtTime(UsdTimeCode.PreTime(12))).toEqual([0, 1])
    expect(arrays.getValueAtTime(UsdTimeCode.PreTime(13))).toEqual([1])
    expect(arrays.getValueAtTime(UsdTimeCode.PreTime(14))).toEqual([4, 5])
    expect(arrays.getValueAtTime(UsdTimeCode.PreTime(15))).toEqual([4, 5])
    expect(arrays.getValueAtTime(UsdTimeCode.PreTime(16))).toBeUndefined()
  })
})
