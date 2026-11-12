// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomMotionAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomMotionAPI.py — namespace
// inheritance of motion:blurScale / motion:nonlinearSampleCount. An opinion
// only counts where MotionAPI is APPLIED and the attr is authored; otherwise
// the nearest such ancestor wins, else the schema fallback (1.0 / 3).

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Xform, Mesh, MotionAPI } from 'typescript-usd/usdGeom'

describe('UsdGeomMotionAPI', () => {
  it('inherits authored values down namespace and respects apply gating', () => {
    const stage = Stage.createNew()

    // Parent authors blurScale=0.5, nonlinearSampleCount=5 (MotionAPI applied).
    const root1 = Xform.define(stage, '/root1')
    const root1Motion = MotionAPI.apply(root1.prim)
    root1Motion.createMotionBlurScaleAttr(0.5)
    root1Motion.createNonlinearSampleCountAttr(5)

    // Child does not apply/author — inherits from parent.
    const mesh1 = Mesh.define(stage, '/root1/mesh1')
    expect(new MotionAPI(mesh1.prim, stage).computeMotionBlurScale()).toBe(0.5)
    expect(new MotionAPI(mesh1.prim, stage).computeNonlinearSampleCount()).toBe(5)

    // Applying without authoring still inherits from the parent.
    MotionAPI.apply(mesh1.prim)
    expect(new MotionAPI(mesh1.prim, stage).computeMotionBlurScale()).toBe(0.5)
    expect(new MotionAPI(mesh1.prim, stage).computeNonlinearSampleCount()).toBe(5)

    // Authoring with MotionAPI NOT applied has no effect — parent still wins.
    const mesh2 = Mesh.define(stage, '/root1/mesh2')
    new MotionAPI(mesh2.prim, stage).createMotionBlurScaleAttr(2.0)
    new MotionAPI(mesh2.prim, stage).createNonlinearSampleCountAttr(10)
    expect(new MotionAPI(mesh2.prim, stage).computeMotionBlurScale()).toBe(0.5)
    expect(new MotionAPI(mesh2.prim, stage).computeNonlinearSampleCount()).toBe(5)

    // Once applied, the child's own authored opinion takes over.
    MotionAPI.apply(mesh2.prim)
    expect(new MotionAPI(mesh2.prim, stage).computeMotionBlurScale()).toBe(2.0)
    expect(new MotionAPI(mesh2.prim, stage).computeNonlinearSampleCount()).toBe(10)

    // Nothing authored anywhere → schema fallbacks (1.0 / 3).
    Xform.define(stage, '/root2')
    const root2Child = Mesh.define(stage, '/root2/mesh')
    expect(new MotionAPI(root2Child.prim, stage).computeMotionBlurScale()).toBe(1.0)
    expect(new MotionAPI(root2Child.prim, stage).computeNonlinearSampleCount()).toBe(3)
  })
})
