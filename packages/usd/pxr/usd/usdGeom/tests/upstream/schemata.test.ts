// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomImageable.py,
//  pxr/usd/usdGeom/testenv/testUsdGeomPurposeVisibility.py,
//  pxr/usd/usdGeom/testenv/testUsdGeomSchemata.py
// Copyright 2017, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomSchemata.py (intrinsic gprims),
// testUsdGeomImageable.py, and testUsdGeomPurposeVisibility.py.
// Define + fallback + round-trip checks for Sphere/Cube/Cone/Cylinder/Capsule/Plane,
// and Imageable visibility/purpose computation.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  Sphere, Cube, Cone, Cylinder, Capsule, Plane, Imageable, Gprim, Xform,
} from 'typescript-usd/usdGeom'

describe('intrinsic gprim schemas', () => {
  it('Sphere: define, is(), radius fallback and round-trip', () => {
    const stage = Stage.createNew()
    const sphere = Sphere.define(stage, '/S')
    const prim = stage.getPrim('/S')!
    expect(Sphere.is(prim)).toBe(true)
    expect(Cube.is(prim)).toBe(false)
    expect(Sphere.getRadius(prim)).toBe(1.0)

    sphere.getRadiusAttr().set(3.5)
    expect(Sphere.getRadius(stage.getPrim('/S')!)).toBe(3.5)
  })

  it('Cube: size fallback is 2', () => {
    const stage = Stage.createNew()
    Cube.define(stage, '/C')
    const prim = stage.getPrim('/C')!
    expect(Cube.is(prim)).toBe(true)
    expect(Cube.getSize(prim)).toBe(2.0)
  })

  it('Cone: height 2, radius 1, axis Z fallbacks', () => {
    const stage = Stage.createNew()
    const cone = Cone.define(stage, '/Cone')
    const prim = stage.getPrim('/Cone')!
    expect(Cone.getHeight(prim)).toBe(2.0)
    expect(Cone.getRadius(prim)).toBe(1.0)
    expect(Cone.getAxis(prim)).toBe('Z')

    cone.getAxisAttr().set('Y')
    expect(Cone.getAxis(stage.getPrim('/Cone')!)).toBe('Y')
  })

  it('Cylinder: height 2, radius 1, axis Z fallbacks', () => {
    const stage = Stage.createNew()
    Cylinder.define(stage, '/Cyl')
    const prim = stage.getPrim('/Cyl')!
    expect(Cylinder.getHeight(prim)).toBe(2.0)
    expect(Cylinder.getRadius(prim)).toBe(1.0)
    expect(Cylinder.getAxis(prim)).toBe('Z')
  })

  it('Capsule: height 1, radius 0.5 fallbacks', () => {
    const stage = Stage.createNew()
    Capsule.define(stage, '/Cap')
    const prim = stage.getPrim('/Cap')!
    expect(Capsule.getHeight(prim)).toBe(1.0)
    expect(Capsule.getRadius(prim)).toBe(0.5)
  })

  it('Plane: width 2, length 2, doubleSided defaults true', () => {
    const stage = Stage.createNew()
    Plane.define(stage, '/P')
    const prim = stage.getPrim('/P')!
    expect(Plane.getWidth(prim)).toBe(2.0)
    expect(Plane.getLength(prim)).toBe(2.0)
    expect(Plane.getDoubleSided(prim)).toBe(true)
    // F1-C: value resolution consults the PRIM's definition — a Plane prim's
    // doubleSided fallback is true no matter which schema class API reads it
    // (Usd_GetFallbackValue reads the prim definition, stage.cpp:6215). The
    // previous 'false' gated the hand-rolled per-class fallback table.
    expect(Gprim.getDoubleSided(prim)).toBe(true)
  })

  it('gprims author displayColor via the Gprim base', () => {
    const stage = Stage.createNew()
    const sphere = Sphere.define(stage, '/S')
    sphere.getDisplayColorAttr().set([[1, 0, 0]])
    const dc = Gprim.getDisplayColor(stage.getPrim('/S')!)
    expect(dc).not.toBeNull()
    expect([...dc!]).toEqual([1, 0, 0])
  })

  it('gprims carry xform ops via the Xformable base', () => {
    const stage = Stage.createNew()
    const cube = Cube.define(stage, '/C')
    cube.addTranslateOp().set([1, 2, 3])
    const order = stage.getPrim('/C')!.getAttr('xformOpOrder')?.getValue()
    expect(order).toEqual(['xformOp:translate'])
  })
})

describe('Imageable visibility and purpose', () => {
  it('local visibility fallback is inherited; purpose fallback is default', () => {
    const stage = Stage.createNew()
    Sphere.define(stage, '/S')
    const prim = stage.getPrim('/S')!
    expect(Imageable.getVisibility(prim)).toBe('inherited')
    expect(Imageable.getPurpose(prim)).toBe('default')
  })

  it('computeVisibility: invisible ancestor prunes descendants', () => {
    const stage = Stage.createNew()
    const parent = Xform.define(stage, '/Root')
    Sphere.define(stage, '/Root/S')
    expect(Imageable.computeVisibility(stage, '/Root/S')).toBe('inherited')

    parent.makeInvisible()
    expect(Imageable.computeVisibility(stage, '/Root/S')).toBe('invisible')
    expect(Imageable.computeVisibility(stage, '/Root')).toBe('invisible')
  })

  it('computeVisibility: invisible on the prim itself wins', () => {
    const stage = Stage.createNew()
    const s = Sphere.define(stage, '/S')
    s.makeInvisible()
    expect(Imageable.computeVisibility(stage, '/S')).toBe('invisible')
    s.makeVisible()
    expect(Imageable.computeVisibility(stage, '/S')).toBe('inherited')
  })

  it('computePurpose: nearest authored ancestor opinion wins', () => {
    const stage = Stage.createNew()
    const root = Xform.define(stage, '/Root')
    const child = Sphere.define(stage, '/Root/S')

    expect(Imageable.computePurpose(stage, '/Root/S')).toBe('default')

    root.getPurposeAttr().set('guide')
    expect(Imageable.computePurpose(stage, '/Root/S')).toBe('guide')

    // The prim's own authored opinion is nearer than the ancestor's
    child.getPurposeAttr().set('render')
    expect(Imageable.computePurpose(stage, '/Root/S')).toBe('render')
  })
})
