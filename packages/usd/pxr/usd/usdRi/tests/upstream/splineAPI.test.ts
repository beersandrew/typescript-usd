// Ported from OpenUSD 26.11.1: pxr/usd/usdRi/testenv/testUsdRiSplineAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdRi/testenv/testUsdRiSplineAPI.py
// (registered as testUsdRiSplineAPI). Sdf.ValueTypeNames values are their
// scene-description type names; Python RuntimeError is a thrown Error.
import { describe, expect, it } from 'vitest'
import { ValueTypeNames } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { SphereLight } from 'typescript-usd/usdLux'
import { SplineAPI, Tokens } from 'typescript-usd/usdRi'

function SetEaseOut(spline: SplineAPI): void {
  spline.createInterpolationAttr().set(Tokens.catmullRom)
  spline.createPositionsAttr().set([0.0, 0.3, 0.7, 1.0])
  spline.createValuesAttr().set([1.0, 0.8, 0.2, 0.0])
}

function IsValid(spline: SplineAPI): boolean {
  return spline.validate()[0]
}

describe('TestUsdRiSplineAPI', () => {
  it('test_Basic', () => {
    const stage = Stage.createNew()

    // can't use these if not properly initialized
    const bogusSpline = new SplineAPI()
    expect(() => bogusSpline.validate()[0]).toThrow()

    const light = SphereLight.define(stage, '/Light')
    const rod = stage.definePrim('/Light/Rod', 'PxrRodLightFilter')
    light.getFiltersRel().setTargets([rod.path])

    // Create SplineAPI for "fallOffRamp" spline for the Rod prim
    const falloffRamp = new SplineAPI(rod, 'falloffRamp',
      ValueTypeNames.FloatArray.name, true)
    // Create SplineAPI for "colorRamp" spline for the Rod prim
    const colorRamp = new SplineAPI(rod, 'colorRamp',
      ValueTypeNames.Color3fArray.name, true)

    // initially invalid since no spline exists
    expect(IsValid(falloffRamp)).toBe(false)
    expect(IsValid(colorRamp)).toBe(false)

    // set a simple ease-out falloff spline
    SetEaseOut(falloffRamp)
    expect(IsValid(falloffRamp)).toBe(true)

    // try a mismatch of values & positions
    falloffRamp.createValuesAttr().set([1.0, 0.8, 0.2])
    expect(IsValid(falloffRamp)).toBe(false)

    // try a bogus interpolation value
    SetEaseOut(falloffRamp)
    expect(IsValid(falloffRamp)).toBe(true)
    falloffRamp.createInterpolationAttr().set('bogus')
    expect(IsValid(falloffRamp)).toBe(false)

    // check all known interp types
    for (const interp of ['linear', 'constant', 'catmull-rom', 'bspline']) {
      falloffRamp.createInterpolationAttr().set(interp)
      expect(IsValid(falloffRamp), interp).toBe(true)
    }

    // try non-sorted positions
    falloffRamp.createPositionsAttr().set([1.0, 0.7, 0.3, 0.0])
    expect(IsValid(falloffRamp)).toBe(false)

    // set a red->green->blue color ramp
    colorRamp.createInterpolationAttr().set(Tokens.linear)
    colorRamp.createPositionsAttr().set([0.0, 0.5, 1.0])
    colorRamp.createValuesAttr().set([
      [1.0, 0.0, 0.0],
      [0.0, 1.0, 0.0],
      [0.0, 0.0, 1.0]])
    expect(IsValid(colorRamp)).toBe(true)
  })
})
