// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/primvar.cpp,
//  pxr/usd/usdSkel/testenv/testUsdSkelBindingAPI.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelBindingAPI.py
// (registered as testUsdSkelBindingAPI).
//
// API mapping: the returned UsdGeomPrimvar is its attribute here;
// UsdGeomPrimvar::GetInterpolation / GetElementSize read the
// interpolation / elementSize metadata (primvar.cpp), with fallbacks
// 'constant' and 1. The TS BindingAPI has no Get*Primvar; the primvars are
// read through getJointIndicesAttr / getJointWeightsAttr.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage, type Attribute } from 'typescript-usd/usd'
import { BindingAPI } from '../../src/index.ts'

const interpolation = (attr: Attribute): unknown => attr.getMetadata('interpolation') ?? 'constant'
const elementSize = (attr: Attribute): unknown => attr.getMetadata('elementSize') ?? 1

describe('testUsdSkelBindingAPI', () => {
  // Tests for helpers for getting/setting joint influences.
  it('test_JointInfluences', async () => {
    const stage = await Stage.open(Layer.createAnonymous())
    const gprim = stage.definePrim('/Model/Gprim')

    const binding = new BindingAPI(gprim, stage)

    let indices = binding.createJointIndicesPrimvar(false, 3)
    expect(indices.isValid()).toBe(true)
    expect(interpolation(indices)).toBe('vertex')
    expect(elementSize(indices)).toBe(3)

    let weights = binding.createJointWeightsPrimvar(true)
    expect(weights.isValid()).toBe(true)
    expect(interpolation(weights)).toBe('constant')

    // Should be able to re-create bindings with an alternate
    // interpolation and/or element size.
    weights = binding.createJointWeightsPrimvar(false, 3)
    expect(weights.isValid()).toBe(true)
    expect(interpolation(weights)).toBe('vertex')
    expect(elementSize(weights)).toBe(3)

    expect(binding.setRigidJointInfluence(10, 0.5)).toBe(true)
    indices = binding.getJointIndicesAttr()
    weights = binding.getJointWeightsAttr()
    expect(Array.from(indices.getValue() as ArrayLike<number>)).toEqual([10])
    expect(Array.from(weights.getValue() as ArrayLike<number>)).toEqual([0.5])
  })
})
