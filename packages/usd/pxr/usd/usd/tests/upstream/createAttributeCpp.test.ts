// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdCreateAttributeCpp.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdCreateAttributeCpp.cpp
// (registered as testUsdCreateAttributeCpp).
//
// Mapping:
//  - UsdStage::CreateNew("foo.usdc") / SdfLayer::CreateNew writes files; here
//    the layers are anonymous layers with the same tag, so they keep the
//    format's layer data without touching the file system.
//  - Get(&value[, time]) returning false is an undefined result. The typed
//    Get<double> calls on a string attribute ("Get with wrong type") have no
//    counterpart: values are untyped JavaScript values, so there is no typed
//    extraction to fail.
//  - GetTimeSamples / GetNumTimeSamples are getTimeSampleKeys and its length;
//    GetBracketingTimeSamples' hasTimeSamples is a non-empty bracket.
//  - The ExpectedError around Set(1.234) on a string attribute is a separate
//    case below (the type check is not implemented).
//  - The Py_IsInitialized() axiom has no counterpart.

import { describe, expect, it } from 'vitest'
import { Mark as TfErrorMark } from 'typescript-usd/tf'
import { AttributeSpec as SdfAttributeSpec, Layer, PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { Stage, type Attribute } from 'typescript-usd/usd'

// VerifyTimeSampleRange (testUsdCreateAttributeCpp.cpp:122-155).
function verifyTimeSampleRange(
  attr: Attribute, expectedNumSamples: number, expectedMin = 0, expectedMax = 0,
): void {
  const samples = attr.getTimeSampleKeys()
  expect(samples.length).toBe(expectedNumSamples)
  const bracket = attr.getBracketingTimeSamples((expectedMin + expectedMax) / 2.0)
  const hasTimeSamples = bracket.length > 0
  const numSamples = attr.getTimeSampleKeys().length
  if (expectedNumSamples === 0) {
    expect(samples).toEqual([])
    expect(hasTimeSamples).toBe(false)
    expect(numSamples).toBe(0)
  } else {
    expect(samples.length).toBeGreaterThan(0)
    expect(hasTimeSamples).toBe(true)
    expect(numSamples).toBe(expectedNumSamples)
    expect(samples[0]).toBe(expectedMin)
    expect(samples[samples.length - 1]).toBe(expectedMax)
    expect(bracket[0]).toBe(expectedMin)
    expect(bracket[1]).toBe(expectedMax)
  }
}

function expectHas(attr: Attribute, value: boolean, def: boolean, samples: boolean): void {
  expect(attr.hasValue()).toBe(value)
  expect(attr.hasAuthoredValue()).toBe(value)
  expect(attr.hasMetadata('default')).toBe(def)
  expect(attr.hasMetadata('timeSamples')).toBe(samples)
}

// TestValueMutation (testUsdCreateAttributeCpp.cpp:157-455), less the
// Set(1.234) type-mismatch check.
async function testValueMutation(layerTag: string): Promise<void> {
  const stage = await Stage.open(Layer.createAnonymous(layerTag))
  const prim = stage.overridePrim('/APrim')
  const attr = prim.createAttribute('attr1', 'string')

  // Empty initial state
  expect(attr.getValue()).toBeUndefined()

  // Make sure clear doesn't do anything crazy before authoring values
  expect(attr.clearAtTime(1.0)).toBe(true)
  expect(attr.clearDefault()).toBe(true)
  expect(attr.clear()).toBe(true)
  expect(attr.hasValue()).toBe(false)
  expect(attr.hasAuthoredValue()).toBe(false)
  expect(attr.hasMetadata('default')).toBe(false)
  expect(attr.hasMetadata('timeSamples')).toBe(false)
  verifyTimeSampleRange(attr, 0)

  // We should safely handle non-existant attributes as well
  const bogusAttr = prim.getAttr('Non_Existing_Attribute')!
  expect(bogusAttr.clear()).toBe(true)
  expect(bogusAttr.clearAtTime(1.0)).toBe(true)
  expect(bogusAttr.clearDefault()).toBe(true)

  // Test exclusively with UsdTimeCode::Default()
  attr.set('foo bar')
  expectHas(attr, true, true, false)
  verifyTimeSampleRange(attr, 0)
  expect(attr.getValue()).toBe('foo bar')

  // Clear a time, it should leave the default intact
  expect(attr.clearAtTime(1.0)).toBe(true)
  expect(attr.getValue()).toBe('foo bar')
  expectHas(attr, true, true, false)
  verifyTimeSampleRange(attr, 0)

  // Now clear the default
  expect(attr.clearDefault()).toBe(true)
  expect(attr.getValue()).toBeUndefined()
  expectHas(attr, false, false, false)
  verifyTimeSampleRange(attr, 0)

  // With a single time sample
  attr.setTimeSample(1.0, 'time=1')
  expectHas(attr, true, false, true)
  verifyTimeSampleRange(attr, 1, 1.0, 1.0)
  expect(attr.getValueAtTime(1.0)).toBe('time=1')

  // Clear the default, it should leave the time intact
  expect(attr.clearDefault()).toBe(true)
  expect(attr.getValueAtTime(1.0)).toBe('time=1')
  expectHas(attr, true, false, true)
  verifyTimeSampleRange(attr, 1, 1, 1)

  // Now clear the time value
  expect(attr.clearAtTime(1.0)).toBe(true)
  expect(attr.getValueAtTime(1.0)).toBeUndefined()
  expectHas(attr, false, false, false)
  verifyTimeSampleRange(attr, 0)

  // With multiple time samples
  attr.setTimeSample(1.0, 'time=1')
  attr.setTimeSample(2.0, 'time=2')
  expectHas(attr, true, false, true)
  verifyTimeSampleRange(attr, 2, 1, 2)
  expect(attr.getValueAtTime(1.0)).toBe('time=1')
  expect(attr.getValueAtTime(2.0)).toBe('time=2')

  // Clear the default, it should leave the time intact
  expect(attr.clearDefault()).toBe(true)
  expect(attr.getValueAtTime(1.0)).toBe('time=1')
  expect(attr.getValueAtTime(2.0)).toBe('time=2')

  // Now clear the time=1 value
  expect(attr.clearAtTime(1.0)).toBe(true)
  expect(attr.getValueAtTime(1.0)).toBe('time=2')
  expectHas(attr, true, false, true)
  verifyTimeSampleRange(attr, 1, 2, 2)

  // Now clear the time=2 value
  expect(attr.clearAtTime(2.0)).toBe(true)
  expect(attr.getValueAtTime(2.0)).toBeUndefined()
  expectHas(attr, false, false, false)
  verifyTimeSampleRange(attr, 0)

  // With multiple time samples and a default value
  attr.set('time=default')
  attr.setTimeSample(1.0, 'time=1')
  attr.setTimeSample(2.0, 'time=2')
  expect(attr.getValue()).toBe('time=default')
  expect(attr.getValueAtTime(1.0)).toBe('time=1')
  expect(attr.getValueAtTime(2.0)).toBe('time=2')
  expectHas(attr, true, true, true)
  verifyTimeSampleRange(attr, 2, 1, 2)

  // Clear t=1, it should leave t=2 and t=default
  expect(attr.clearAtTime(1.0)).toBe(true)
  // Because of held-value interpolation, and because we cleared the value at
  // 1.0, we expect value at 1.0 to be "time=2"
  expect(attr.getValueAtTime(1.0)).toBe('time=2')
  expect(attr.getValue()).toBe('time=default')
  expectHas(attr, true, true, true)
  verifyTimeSampleRange(attr, 1, 2, 2)

  // Now clear the time=2 value, should leave t=default
  expect(attr.clearAtTime(2.0)).toBe(true)
  expectHas(attr, true, true, false)
  verifyTimeSampleRange(attr, 0)
  expect(attr.getValueAtTime(1.0)).toBe('time=default')

  // Now clear the default value
  expect(attr.clearDefault()).toBe(true)
  expect(attr.getValueAtTime(2.0)).toBeUndefined()
  expectHas(attr, false, false, false)
  verifyTimeSampleRange(attr, 0)

  // Multiple time samples and single call to Clear
  attr.set('time=default')
  attr.setTimeSample(1.0, 'time=1')
  attr.setTimeSample(2.0, 'time=2')
  expect(attr.getValue()).toBe('time=default')
  expect(attr.getValueAtTime(1.0)).toBe('time=1')
  expect(attr.getValueAtTime(2.0)).toBe('time=2')
  expectHas(attr, true, true, true)
  verifyTimeSampleRange(attr, 2, 1, 2)

  // Clear() should remove all values
  expect(attr.clear()).toBe(true)
  expect(attr.getValueAtTime(1.0)).toBeUndefined()
  expect(attr.getValueAtTime(2.0)).toBeUndefined()
  expect(attr.getValue()).toBeUndefined()
  expectHas(attr, false, false, false)
  verifyTimeSampleRange(attr, 0)
}

describe('testUsdCreateAttributeCpp', () => {
  it('TestPrim', async () => {
    const primPath = '/CppFoo'
    const value = 'Foobar'
    const stage = await Stage.open(Layer.createAnonymous('foo.usdc'))
    const layer = stage.getRootLayer()

    {
      // Listing fields for a property on a non-existent prim path should not
      // post errors (bug 90170).
      const mark = new TfErrorMark()
      expect(layer.listFields('I_Do_Not_Exist.attribute')).toEqual([])
      expect(mark.isClean()).toBe(true)
    }

    expect(stage.overridePrim(primPath).isValid()).toBe(true)
    const prim = stage.getPrim(primPath)!
    expect(prim).toBeTruthy()
    expect(prim.createAttribute('Something', 'string').isValid()).toBe(true)
    prim.getAttr('Something')!.setTimeSample(0.0, value)
    const result = prim.getAttr('Something')!.getValueAtTime(0.0)
    expect(typeof result).toBe('string')
    expect(result).toBe(value)
  })

  it('TestIsDefined', async () => {
    // Create an attribute in a weak layer, reference it into a stronger layer
    // and assert that it wasn't defined in the strong layer. Then set a value
    // in the stronger layer, which implicitly must define the attribute.
    const weakLayer = Layer.createAnonymous('IsDefined_weak.usd')
    const strongLayer = Layer.createAnonymous('IsDefined_strong.usd')

    // Weak Layer: Create prim and attribute.
    let stage = await Stage.open(weakLayer)
    let p = stage.overridePrim('/Parent')
    expect(p.getAttr('attr1')!.isValid()).toBe(false)
    expect(p.createAttribute('attr1', 'string').isValid()).toBe(true)

    // Strong Layer: Create prim and a reference to weak layer.
    stage = await Stage.open(strongLayer)
    p = stage.overridePrim('/Parent')
    await p.getReferences().addReference(weakLayer.identifier, '/Parent')
    p = stage.getPrim('/Parent')!

    expect(p.getAttr('attr1')!.isValid()).toBe(true)
    expect(p.getAttr('attr1')!.isAuthoredAt(weakLayer)).toBe(true)
    expect(p.getAttr('attr1')!.isAuthoredAt(strongLayer)).toBe(false)

    // Now set a value and verify that the attr is defined everywhere.
    p.getAttr('attr1')!.set('foo')
    expect(p.getAttr('attr1')!.isValid()).toBe(true)
    expect(p.getAttr('attr1')!.isAuthoredAt(weakLayer)).toBe(true)
    expect(p.getAttr('attr1')!.isAuthoredAt(strongLayer)).toBe(true)
  })

  it('TestValueMutation("foo.usda")', async () => {
    await testValueMutation('foo.usda')
  })

  it('TestValueMutation("foo.usdc")', async () => {
    await testValueMutation('foo.usdc')
  })

  // UsdStage::_SetValue checks SdfValueTypeName::CanRepresent before
  // authoring and posts a coding error on a mismatch (stage.cpp:2048-2056).
  for (const layerTag of ['foo.usda', 'foo.usdc']) {
    it(`TestValueMutation("${layerTag}"): Set with incorrect type issues an error`, async () => {
      const stage = await Stage.open(Layer.createAnonymous(layerTag))
      const attr = stage.overridePrim('/APrim').createAttribute('attr1', 'string')
      expect(() => attr.set(1.234)).toThrow()
      expect(attr.getValue()).toBeUndefined()
    })
  }

  it('TestQueryTimeSample', () => {
    const l = Layer.createAnonymous('f.usdc')
    const p = SdfPrimSpec.new(l, 'Foo', 'def', 'Scope')!
    const a = SdfAttributeSpec.new(p, 'attr', 'string')!
    a.setInfo('timeSamples', new Map([[1.0, 'Foo']]))
    expect(l.queryTimeSample('/Foo.attr', 1.0)).toBe('Foo')
  })

  it('TestVariability', () => {
    const s = Stage.createNew()
    const foo = s.overridePrim('/foo')
    const varAttr = foo.createAttribute('varyingAttr', 'token[]')
    expect(varAttr.getVariability()).toBe('varying')
    const uniformAttr = foo.createAttribute('uniformAttr', 'token', true, 'uniform')
    expect(uniformAttr.getVariability()).toBe('uniform')
  })
})
