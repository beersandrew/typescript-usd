// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomConstraintTarget.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomConstraintTarget.py — the
// constraintTargets:<name> matrix attribute on a model prim: create/get,
// identifier round-trip, ComputeInWorldSpace (local · localToWorld), and the
// validity rules (model-ness, namespace, matrix typing).
//
// The C++ test composes a rotation via Gf.Rotation; the local Pixar build
// segfaults on Gf matrix ops in this environment, so the local/model matrices
// here are built with the repo's own typescript-usd/gf (itself measured green against
// Pixar) and the expected world matrix is mul4(local, model) — the same
// row-vector composition under test, with gf as the arithmetic oracle.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { mul4, makeRotation, rotationToMatrix, type Matrix4 } from 'typescript-usd/gf'
import { Xform, ModelAPI as GeomModelAPI, ConstraintTarget } from 'typescript-usd/usdGeom'

// 4x4 row-major flat -> number[][] (the matrix4d attr shape).
function toRows(m: Matrix4): number[][] {
  return [
    [m[0], m[1], m[2], m[3]],
    [m[4], m[5], m[6], m[7]],
    [m[8], m[9], m[10], m[11]],
    [m[12], m[13], m[14], m[15]],
  ]
}

describe('UsdGeomConstraintTarget', () => {
  it('create / identifier / ComputeInWorldSpace / validity', () => {
    const stage = Stage.createNew()

    const model = Xform.define(stage, '/Model')
    stage.getEditTarget().getLayer()!.setField('/Model', 'kind', 'component')

    // modelSpace: scale 2, translate (10,20,30).
    const modelSpace: Matrix4 = [
      2, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 2, 0,
      10, 20, 30, 1,
    ]
    model.addTransformOp().set(toRows(modelSpace))

    const geomModel = new GeomModelAPI(model.prim, stage)
    const ct = geomModel.createConstraintTarget('rootXf')
    expect(ct.getAttr()).not.toBeNull()
    expect(ct.isValid()).toBe(true)

    const fetched = geomModel.getConstraintTarget('rootXf')
    expect(fetched.isValid()).toBe(true)

    fetched.setIdentifier('RootXf')
    expect(fetched.getIdentifier()).toBe('RootXf')

    // localConstraintSpace: a 45° rotation about (1,1,0).
    const local = rotationToMatrix(makeRotation([1, 1, 0], 45))
    fetched.set(toRows(local))

    const world = fetched.computeInWorldSpace()
    const expected = mul4(local, modelSpace)
    for (let i = 0; i < 16; i++) expect(world[i]).toBeCloseTo(expected[i]!, 9)
    // Order matters: model·local (the wrong order) must NOT match.
    const wrongOrder = mul4(modelSpace, local)
    expect(world.some((v, i) => Math.abs(v - wrongOrder[i]!) > 1e-6)).toBe(true)

    // Type rules: only matrix-backed types are valid.
    stage.declareProperty('/Model', 'constraintTargets:rootXf', 'double')
    expect(fetched.isValid()).toBe(false)
    stage.declareProperty('/Model', 'constraintTargets:rootXf', 'frame4d')
    expect(fetched.isValid()).toBe(true)
    stage.declareProperty('/Model', 'constraintTargets:rootXf', 'matrix4d')
    expect(fetched.isValid()).toBe(true)

    // Name not in the constraintTargets namespace -> invalid.
    stage.declareProperty('/Model', 'invalidConstraintTargetName', 'matrix4d')
    expect(new ConstraintTarget(model.prim.attr('invalidConstraintTargetName')).isValid()).toBe(false)

    // In-namespace but wrong type -> invalid.
    stage.declareProperty('/Model', 'constraintTargets:invalidTypeXf', 'float')
    expect(new ConstraintTarget(model.prim.attr('constraintTargets:invalidTypeXf')).isValid()).toBe(false)

    // Remove model-ness -> the constraint target is no longer valid.
    stage.getEditTarget().getLayer()!.eraseField('/Model', 'kind')
    expect(fetched.isValid()).toBe(false)
  })
})
