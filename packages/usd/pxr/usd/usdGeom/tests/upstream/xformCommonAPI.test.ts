// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomXformCommonAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdGeom/testenv/testUsdGeomXformCommonAPI.py.
//
// All numeric expectations are taken from the upstream test (which embeds
// Pixar-verified values) and cross-checked against the usd-2605 reference
// build. Float comparisons use a 1e-5 tolerance, matching the suite's
// _AssertGfIsClose(eps=1e-5).

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'
import { TfErrorMark } from 'typescript-usd/tf'
import { Xform, XformOp } from 'typescript-usd/usdGeom'
import { type Vec3, type Matrix4 } from 'typescript-usd/gf'
import { XformCommonAPI, type RotationOrder } from '../../src/xformCommonAPI.ts'

// ---- helpers ----

let tmpDir: string | null = null
afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = null
  }
})

function writeUsda(content: string): string {
  if (!tmpDir) tmpDir = mkdtempSync(path.join(tmpdir(), 'usd-xca-'))
  const p = path.join(tmpDir, 'scene.usda')
  writeFileSync(p, `#usda 1.0\n${content}`)
  return p
}

// Wrap a Xform schema object as a XformCommonAPI (mirrors UsdGeom.XformCommonAPI(x)).
function api(x: Xform): XformCommonAPI {
  return new XformCommonAPI(x.prim, x.stage)
}

function order(x: Xform): string[] {
  return (x.prim.attr('xformOpOrder').get() as string[] | undefined) ?? []
}

// Authors a raw xform op (token + optional value) directly, appending it to
// the prim's xformOpOrder — used to construct non-conforming orders that the
// XformCommonAPI authoring path would never produce.
function appendOp(prim: Prim, token: string, value?: unknown): void {
  if (value !== undefined) {
    prim.createAttr(token.replace('!invert!', ''), value)
  }
  const cur = (prim.attr('xformOpOrder').get() as string[] | undefined) ?? []
  prim.attr('xformOpOrder').set([...cur, token])
}

function expectVecClose(actual: Vec3, expected: Vec3, tol = 1e-5): void {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 5)
}

function expectVectorsEqual(
  actual: [Vec3, Vec3, Vec3, Vec3, RotationOrder],
  translation: Vec3, rotation: Vec3, scale: Vec3, pivot: Vec3, rotOrder: RotationOrder,
): void {
  expectVecClose(actual[0], translation)
  expectVecClose(actual[1], rotation)
  expectVecClose(actual[2], scale)
  expectVecClose(actual[3], pivot)
  expect(actual[4]).toBe(rotOrder)
}

// UsdGeomXformable::GetLocalTransformation as a row-major Matrix4.
function localTransform(x: Xform, time?: number): Matrix4 {
  return [...x.getLocalTransformation(time).GetArray()] as Matrix4
}

// Where the Python test expects Tf.ErrorException, the C++ call posted a
// coding error: the errors fn posts, observed with a TfErrorMark.
function postedErrors(fn: () => unknown): string[] {
  const mark = new TfErrorMark()
  try {
    fn()
    const errors = mark.getErrors().map(e => e.getCommentary())
    mark.clear()
    return errors
  } finally {
    mark.dispose()
  }
}

function matrixClose(a: Matrix4, b: Matrix4, tol = 1e-5): boolean {
  for (let i = 0; i < 16; i++) {
    if (Number.isNaN(a[i]!) || Number.isNaN(b[i]!)) continue
    if (Math.abs(a[i]! - b[i]!) > tol) return false
  }
  return true
}

// ---------------------------------------------------------------------------

describe('test_EmptyXformable', () => {
  it('authors and round-trips component vectors, rejects rotation-order change', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/X')
    const xa = api(x)
    expect(xa.isValid()).toBe(true)

    expectVectorsEqual(
      xa.getXformVectors(),
      [0, 0, 0], [0, 0, 0], [1, 1, 1], [0, 0, 0], 'XYZ',
    )

    expect(xa.setXformVectors(
      [10, 20, 30], [30, 45, 60], [1, 2, 3], [0, 10, 0],
      XformCommonAPI.RotationOrderYXZ,
    )).toBe(true)

    expect(order(x)).toEqual([
      'xformOp:translate', 'xformOp:translate:pivot',
      'xformOp:rotateYXZ', 'xformOp:scale',
      '!invert!xformOp:translate:pivot',
    ])
    expect(xa.isValid()).toBe(true)

    expectVectorsEqual(
      xa.getXformVectors(),
      [10, 20, 30], [30, 45, 60], [1, 2, 3], [0, 10, 0], 'YXZ',
    )

    // A SetXformVectors with a different rotation order must fail without
    // authoring anything.
    expect(postedErrors(() => xa.setXformVectors(
      [100, 200, 300], [3, 4, 6], [3, 2, 1], [10, 0, 10],
      XformCommonAPI.RotationOrderZYX, 10.0,
    ))).toHaveLength(1)

    expectVectorsEqual(
      xa.getXformVectors(10.0),
      [10, 20, 30], [30, 45, 60], [1, 2, 3], [0, 10, 0], 'YXZ',
    )

    // Adding an extra op makes X incompatible.
    x.addTranslateOp(XformOp.PrecisionDouble, 'extraTranslate')
    expect(api(x).isValid()).toBe(false)
  })
})

describe('test_SetIndividualOps', () => {
  it('authors ops sparsely in canonical order', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/X')

    // Test the Get() factory.
    let xa = XformCommonAPI.get(s, '/X')
    expect(xa.isValid()).toBe(true)

    expect(xa.setTranslate([2, 3, 4])).toBe(true)
    expect(order(x)).toEqual(['xformOp:translate'])

    // Clear the op order; this invalidates the existing components.
    x.prim.attr('xformOpOrder').set([])

    xa = api(x)
    expect(xa.isValid()).toBe(true)

    // Get with nothing authored.
    expectVectorsEqual(
      xa.getXformVectors(1.0),
      [0, 0, 0], [0, 0, 0], [1, 1, 1], [0, 0, 0], 'XYZ',
    )

    expect(xa.setRotate([30, 45, 60])).toBe(true)
    expect(xa.isValid()).toBe(true)

    // SetRotate with a different rotation order must raise.
    expect(postedErrors(() => xa.setRotate([30, 45, 60], XformCommonAPI.RotationOrderZYX))).toHaveLength(1)

    expect(order(x)).toEqual(['xformOp:rotateXYZ'])
    expectVectorsEqual(
      xa.getXformVectors(1.0),
      [0, 0, 0], [30, 45, 60], [1, 1, 1], [0, 0, 0], 'XYZ',
    )

    expect(xa.setTranslate([20, 30, 40])).toBe(true)
    expect(order(x)).toEqual(['xformOp:translate', 'xformOp:rotateXYZ'])
    expectVectorsEqual(
      xa.getXformVectors(1.0),
      [20, 30, 40], [30, 45, 60], [1, 1, 1], [0, 0, 0], 'XYZ',
    )

    expect(xa.setPivot([100, 200, 300], 1.0)).toBe(true)
    expect(order(x)).toEqual([
      'xformOp:translate', 'xformOp:translate:pivot',
      'xformOp:rotateXYZ', '!invert!xformOp:translate:pivot',
    ])
    expectVectorsEqual(
      xa.getXformVectors(1.0),
      [20, 30, 40], [30, 45, 60], [1, 1, 1], [100, 200, 300], 'XYZ',
    )

    expect(xa.setScale([1.5, 2.0, 4.5], 2.0)).toBe(true)
    expect(order(x)).toEqual([
      'xformOp:translate', 'xformOp:translate:pivot',
      'xformOp:rotateXYZ', 'xformOp:scale',
      '!invert!xformOp:translate:pivot',
    ])
    expectVectorsEqual(
      xa.getXformVectors(1.0),
      [20, 30, 40], [30, 45, 60], [1.5, 2.0, 4.5], [100, 200, 300], 'XYZ',
    )
  })
})

describe('test_IncompatibleXformables', () => {
  it('rejects orders that do not conform to the common set', () => {
    const s = Stage.createNew()

    const orient = Xform.define(s, '/Orient')
    appendOp(orient.prim, 'xformOp:orient', [1, 0, 0, 0])
    expect(XformCommonAPI.get(s, '/Orient').isValid()).toBe(false)

    const rotX = Xform.define(s, '/RotX')
    appendOp(rotX.prim, 'xformOp:rotateX', 0)
    expect(XformCommonAPI.get(s, '/RotX').isValid()).toBe(false)

    const rotY = Xform.define(s, '/RotY')
    appendOp(rotY.prim, 'xformOp:rotateY', 0)
    expect(XformCommonAPI.get(s, '/RotY').isValid()).toBe(false)

    const rotZ = Xform.define(s, '/RotZ')
    appendOp(rotZ.prim, 'xformOp:rotateZ', 0)
    expect(XformCommonAPI.get(s, '/RotZ').isValid()).toBe(false)

    const matrix = Xform.define(s, '/Matrix')
    appendOp(matrix.prim, 'xformOp:transform', [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
    expect(XformCommonAPI.get(s, '/Matrix').isValid()).toBe(false)

    // Scale before rotate.
    const bad1 = Xform.define(s, '/BadOpOrder1')
    appendOp(bad1.prim, 'xformOp:scale', [1, 1, 1])
    appendOp(bad1.prim, 'xformOp:rotateZXY', [0, 0, 0])
    expect(XformCommonAPI.get(s, '/BadOpOrder1').isValid()).toBe(false)

    // Rotate before translate.
    const bad2 = Xform.define(s, '/BadOpOrder2')
    appendOp(bad2.prim, 'xformOp:rotateYZX', [0, 0, 0])
    appendOp(bad2.prim, 'xformOp:translate', [0, 0, 0])
    expect(XformCommonAPI.get(s, '/BadOpOrder2').isValid()).toBe(false)

    // Scale before translate.
    const bad3 = Xform.define(s, '/BadOpOrder3')
    appendOp(bad3.prim, 'xformOp:scale', [1, 1, 1])
    appendOp(bad3.prim, 'xformOp:translate', [0, 0, 0])
    expect(XformCommonAPI.get(s, '/BadOpOrder3').isValid()).toBe(false)

    // Scale outside the (pivot, invPivot) pair.
    const bad4 = Xform.define(s, '/BadOpOrder4')
    XformCommonAPI.get(s, '/BadOpOrder4').setPivot([10, 20, 30])
    appendOp(bad4.prim, 'xformOp:scale', [1, 1, 1])
    expect(XformCommonAPI.get(s, '/BadOpOrder4').isValid()).toBe(false)

    // Rotate outside the (pivot, invPivot) pair.
    const bad5 = Xform.define(s, '/BadOpOrder5')
    XformCommonAPI.get(s, '/BadOpOrder5').setPivot([10, 20, 30])
    appendOp(bad5.prim, 'xformOp:rotateXZY', [0, 0, 0])
    expect(XformCommonAPI.get(s, '/BadOpOrder5').isValid()).toBe(false)

    // Translate after the (pivot, invPivot) pair.
    const bad6 = Xform.define(s, '/BadOpOrder6')
    XformCommonAPI.get(s, '/BadOpOrder6').setPivot([10, 20, 30])
    appendOp(bad6.prim, 'xformOp:translate', [0, 0, 0])
    expect(XformCommonAPI.get(s, '/BadOpOrder6').isValid()).toBe(false)
  })
})

describe('test_PreserveResetXformStack', () => {
  it('keeps the !resetXformStack! sentinel through individual sets', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const xa = api(x)
    expect(xa.isValid()).toBe(true)

    expect(xa.setResetXformStack(true)).toBe(true)
    expect(xa.setTranslate([10, 20, 30])).toBe(true)
    expect(xa.getResetXformStack()).toBe(true)

    expect(order(x)).toEqual(['!resetXformStack!', 'xformOp:translate'])

    expect(xa.setRotate([10, 20, 30])).toBe(true)
    expect(xa.getResetXformStack()).toBe(true)

    expect(xa.setScale([10, 20, 30])).toBe(true)
    expect(xa.getResetXformStack()).toBe(true)

    expect(xa.setPivot([10, 20, 30])).toBe(true)
    expect(xa.getResetXformStack()).toBe(true)

    expect(order(x)).toEqual([
      '!resetXformStack!', 'xformOp:translate',
      'xformOp:translate:pivot', 'xformOp:rotateXYZ', 'xformOp:scale',
      '!invert!xformOp:translate:pivot',
    ])
  })
})

describe('test_MatrixDecomposition', () => {
  it('decomposes an incompatible matrix xform into recomposable components', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/X')
    const xa = api(x)
    expect(xa.isValid()).toBe(true)
    expect(xa.setXformVectors(
      [10, 20, 30], [30, 45, 60], [1, 2, 3], [0, 0, 0],
      XformCommonAPI.RotationOrderYXZ,
    )).toBe(true)

    // y is a single matrix op holding x's local transform — incompatible.
    const y = Xform.define(s, '/Y')
    y.addTransformOp().set([...localTransform(x)])
    const ya = api(y)
    expect(ya.isValid()).toBe(false)

    // Setters fail on an incompatible xformable.
    expect(ya.setTranslate([10, 20, 30])).toBe(false)
    expect(ya.setRotate([10, 20, 30])).toBe(false)
    expect(ya.setScale([1, 2, 3])).toBe(false)
    expect(ya.setPivot([10, 10, 10])).toBe(false)

    // But GetXformVectors still works via full matrix decomposition.
    const v = ya.getXformVectors()

    const z = Xform.define(s, '/Z')
    const za = api(z)
    expect(za.isValid()).toBe(true)
    expect(za.setTranslate(v[0])).toBe(true)
    expect(za.setRotate(v[1])).toBe(true)
    expect(za.setScale(v[2])).toBe(true)
    expect(za.setPivot(v[3])).toBe(true)

    // The recomposed local transform must match x's, even if the individual
    // component values differ.
    expect(matrixClose(localTransform(x), localTransform(z))).toBe(true)
  })
})

describe('test_Bug116955', () => {
  it('re-invoking the API on compatible ops does not lose state', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/X')

    api(x).setTranslate([1, 2, 3])
    api(x).setTranslate([5, 6, 7])
    expectVectorsEqual(
      api(x).getXformVectors(),
      [5, 6, 7], [0, 0, 0], [1, 1, 1], [0, 0, 0], 'XYZ',
    )

    api(x).setRotate([1, 2, 3])
    api(x).setRotate([5, 6, 7])
    expectVectorsEqual(
      api(x).getXformVectors(),
      [5, 6, 7], [5, 6, 7], [1, 1, 1], [0, 0, 0], 'XYZ',
    )

    api(x).setScale([2, 2, 2])
    api(x).setScale([3, 4, 5])
    expectVectorsEqual(
      api(x).getXformVectors(),
      [5, 6, 7], [5, 6, 7], [3, 4, 5], [0, 0, 0], 'XYZ',
    )

    api(x).setPivot([100, 200, 300])
    api(x).setPivot([300, 400, 500])
    expectVectorsEqual(
      api(x).getXformVectors(),
      [5, 6, 7], [5, 6, 7], [3, 4, 5], [300, 400, 500], 'XYZ',
    )

    api(x).setResetXformStack(true)
    api(x).setResetXformStack(true)
    expect(api(x).getResetXformStack()).toBe(true)

    api(x).setResetXformStack(false)
    expect(api(x).getResetXformStack()).toBe(false)
  })
})

describe('test_GetXformVectorsByAccumulation', () => {
  function validate(
    prim: Prim, stage: Stage,
    translation: Vec3, rotation: Vec3, scale: Vec3, pivot: Vec3, rotOrder: RotationOrder,
  ): void {
    const v = new XformCommonAPI(prim, stage).getXformVectorsByAccumulation()
    expectVecClose(v[0], translation)
    expectVecClose(v[1], rotation)
    expectVecClose(v[2], scale)
    expectVecClose(v[3], pivot)
    expect(v[4]).toBe(rotOrder)
  }

  it('reduces non-conforming orders to common transforms', () => {
    const s = Stage.createNew()

    // Single axis rotations.
    let xf = Xform.define(s, '/RotX')
    appendOp(xf.prim, 'xformOp:rotateX', 45.0)
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [45, 0, 0], [1, 1, 1], [0, 0, 0], 'XYZ')

    xf = Xform.define(s, '/RotY')
    appendOp(xf.prim, 'xformOp:rotateY', 60.0)
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [0, 60, 0], [1, 1, 1], [0, 0, 0], 'XYZ')

    xf = Xform.define(s, '/RotZ')
    appendOp(xf.prim, 'xformOp:rotateZ', 115.0)
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [0, 0, 115], [1, 1, 1], [0, 0, 0], 'XYZ')

    // Three axis rotation with a non-default order and a (non-conforming-named)
    // pivot.
    xf = Xform.define(s, '/RotZYX')
    appendOp(xf.prim, 'xformOp:translate:myRotatePivot', [-3, -2, -1])
    appendOp(xf.prim, 'xformOp:rotateZYX', [90, 60, 30])
    appendOp(xf.prim, '!invert!xformOp:translate:myRotatePivot')
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [90, 60, 30], [1, 1, 1], [-3, -2, -1], 'ZYX')

    // Accumulation of translation ops.
    xf = Xform.define(s, '/TranslationsOnly')
    appendOp(xf.prim, 'xformOp:translate:transOne', [1, 2, 3])
    appendOp(xf.prim, 'xformOp:translate:transTwo', [9, 8, 7])
    appendOp(xf.prim, 'xformOp:translate:transThree', [10, 20, 30])
    appendOp(xf.prim, 'xformOp:translate:transFour', [90, 80, 70])
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [110, 110, 110], [0, 0, 0], [1, 1, 1], [0, 0, 0], 'XYZ')

    // Rotate op with a pivot.
    xf = Xform.define(s, '/RotateWithPivot')
    appendOp(xf.prim, 'xformOp:translate:rotatePivot', [3, 6, 9])
    appendOp(xf.prim, 'xformOp:rotateXYZ', [0, 45, 0])
    appendOp(xf.prim, '!invert!xformOp:translate:rotatePivot')
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [0, 45, 0], [1, 1, 1], [3, 6, 9], 'XYZ')

    // Accumulation of scale ops.
    xf = Xform.define(s, '/ScalesOnly')
    appendOp(xf.prim, 'xformOp:scale:scaleOne', [1, 2, 3])
    appendOp(xf.prim, 'xformOp:scale:scaleTwo', [2, 4, 6])
    appendOp(xf.prim, 'xformOp:scale:scaleThree', [10, 20, 30])
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [0, 0, 0], [20, 160, 540], [0, 0, 0], 'XYZ')

    // Accumulation of scale ops with a pivot.
    xf = Xform.define(s, '/ScalesWithPivot')
    appendOp(xf.prim, 'xformOp:translate:scalePivot', [15, 25, 35])
    appendOp(xf.prim, 'xformOp:scale:scaleOne', [10, 20, 30])
    appendOp(xf.prim, 'xformOp:scale:scaleTwo', [0.5, 0.5, 0.5])
    appendOp(xf.prim, '!invert!xformOp:translate:scalePivot')
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [0, 0, 0], [0, 0, 0], [5, 10, 15], [15, 25, 35], 'XYZ')

    // Accumulation of scale ops with a pivot and translation.
    xf = Xform.define(s, '/ScalesWithPivotAndTranslate')
    appendOp(xf.prim, 'xformOp:translate', [123, 456, 789])
    appendOp(xf.prim, 'xformOp:translate:scalePivot', [-222, -444, -666])
    appendOp(xf.prim, 'xformOp:scale:scaleOne', [2, 2, 2])
    appendOp(xf.prim, 'xformOp:scale:scaleTwo', [2, 2, 2])
    appendOp(xf.prim, 'xformOp:scale:scaleThree', [2, 2, 2])
    appendOp(xf.prim, '!invert!xformOp:translate:scalePivot')
    expect(api(xf).isValid()).toBe(false)
    validate(xf.prim, s, [123, 456, 789], [0, 0, 0], [8, 8, 8], [-222, -444, -666], 'XYZ')
  })

  it('handles Maya-style orders (conforming, reducible, and irreducible)', () => {
    const s = Stage.createNew()

    // Typical Maya export: starts out conforming.
    const xf = Xform.define(s, '/MayaXformOrder')
    appendOp(xf.prim, 'xformOp:translate', [1, 2, 3])
    appendOp(xf.prim, 'xformOp:translate:pivot', [10, 20, 30])
    appendOp(xf.prim, 'xformOp:rotateXYZ', [0, 45, 0])
    appendOp(xf.prim, '!invert!xformOp:translate:pivot')
    expect(api(xf).isValid()).toBe(true)
    {
      const v = new XformCommonAPI(xf.prim, s).getXformVectorsByAccumulation()
      expectVecClose(v[0], [1, 2, 3]); expectVecClose(v[1], [0, 45, 0])
      expectVecClose(v[2], [1, 1, 1]); expectVecClose(v[3], [10, 20, 30])
      expect(v[4]).toBe('XYZ')
    }

    // Add a scale pivot and a scale (initially at the same place as the rotate
    // pivot). No longer conforms, but is still reducible.
    appendOp(xf.prim, 'xformOp:translate:scalePivot', [10, 20, 30])
    appendOp(xf.prim, 'xformOp:scale:mayaScale', [2, 4, 6])
    appendOp(xf.prim, '!invert!xformOp:translate:scalePivot')
    expect(api(xf).isValid()).toBe(false)
    {
      const v = new XformCommonAPI(xf.prim, s).getXformVectorsByAccumulation()
      expectVecClose(v[0], [1, 2, 3]); expectVecClose(v[1], [0, 45, 0])
      expectVecClose(v[2], [2, 4, 6]); expectVecClose(v[3], [10, 20, 30])
      expect(v[4]).toBe('XYZ')
    }

    // Move the scale pivot so it no longer matches the rotate pivot — the order
    // is now neither conforming nor reducible, so we fall back to full
    // decomposition with a zero pivot.
    xf.prim.attr('xformOp:translate:scalePivot').set([200, 300, 400])
    expect(api(xf).isValid()).toBe(false)
    {
      const v = new XformCommonAPI(xf.prim, s).getXformVectorsByAccumulation()
      expectVecClose(v[0], [-1572.9191898578665, -898.0, -1253.9343417595162])
      expectVecClose(v[1], [0, 45, 0])
      expectVecClose(v[2], [2, 4, 6])
      expectVecClose(v[3], [0, 0, 0])
      expect(v[4]).toBe('XYZ')
    }
  })

  it('handles Maya translate/pivot-only and pivot+rotate orders', () => {
    const s = Stage.createNew()

    // Translate + rotate pivot, no actual rotation (only translates).
    let xf = Xform.define(s, '/MayaTranslateRotatePivotOnly')
    appendOp(xf.prim, 'xformOp:translate', [20, 40, 60])
    appendOp(xf.prim, 'xformOp:translate:rotatePivot', [50, 150, 250])
    appendOp(xf.prim, '!invert!xformOp:translate:rotatePivot')
    expect(api(xf).isValid()).toBe(false)
    {
      const v = new XformCommonAPI(xf.prim, s).getXformVectorsByAccumulation()
      expectVecClose(v[0], [20, 40, 60]); expectVecClose(v[1], [0, 0, 0])
      expectVecClose(v[2], [1, 1, 1]); expectVecClose(v[3], [50, 150, 250])
      expect(v[4]).toBe('XYZ')
    }

    // Translate + rotate & scale pivots, with rotation but no scaling.
    xf = Xform.define(s, '/MayaPivotsAndRotateNoScale')
    appendOp(xf.prim, 'xformOp:translate', [11, 22, 33])
    appendOp(xf.prim, 'xformOp:translate:rotatePivot', [111, 222, 333])
    appendOp(xf.prim, 'xformOp:rotateZ', 44.0)
    appendOp(xf.prim, '!invert!xformOp:translate:rotatePivot')
    appendOp(xf.prim, 'xformOp:translate:scalePivot', [111, 222, 333])
    appendOp(xf.prim, '!invert!xformOp:translate:scalePivot')
    expect(api(xf).isValid()).toBe(false)
    {
      const v = new XformCommonAPI(xf.prim, s).getXformVectorsByAccumulation()
      expectVecClose(v[0], [11, 22, 33]); expectVecClose(v[1], [0, 0, 44])
      expectVecClose(v[2], [1, 1, 1]); expectVecClose(v[3], [111, 222, 333])
      expect(v[4]).toBe('XYZ')
    }

    // Translate + identical rotate & scale pivots, no rotation or scaling.
    xf = Xform.define(s, '/MayaIdenticalPivots')
    appendOp(xf.prim, 'xformOp:translate', [300, 600, 900])
    appendOp(xf.prim, 'xformOp:translate:rotatePivot', [-100, -300, -500])
    appendOp(xf.prim, '!invert!xformOp:translate:rotatePivot')
    appendOp(xf.prim, 'xformOp:translate:scalePivot', [-100, -300, -500])
    appendOp(xf.prim, '!invert!xformOp:translate:scalePivot')
    expect(api(xf).isValid()).toBe(false)
    {
      const v = new XformCommonAPI(xf.prim, s).getXformVectorsByAccumulation()
      expectVecClose(v[0], [300, 600, 900]); expectVecClose(v[1], [0, 0, 0])
      expectVecClose(v[2], [1, 1, 1]); expectVecClose(v[3], [-100, -300, -500])
      expect(v[4]).toBe('XYZ')
    }
  })
})

describe('test_GetRotationTransform', () => {
  // Golden rotate-op transforms for value (10,20,30), captured from the
  // usd-2605 reference build (x.GetLocalTransformation() of a single rotate op),
  // row-major. Used directly because xformable.ts's evaluation reverses the
  // packed Euler triples; comparing against Pixar is the faithful reference.
  const GOLDEN: Record<string, Matrix4> = {
    rotateXYZ: [0.81379768, 0.46984631, -0.34202014, 0, -0.44096961, 0.88256412, 0.16317591, 0, 0.37852231, 0.01802831, 0.92541658, 0, 0, 0, 0, 1],
    rotateXZY: [0.81379768, 0.5, -0.29619813, 0, -0.40331711, 0.85286853, 0.33158796, 0, 0.41841204, -0.15038373, 0.89572099, 0, 0, 0, 0, 1],
    rotateYXZ: [0.78410209, 0.52128058, -0.33682409, 0, -0.49240388, 0.85286853, 0.17364818, 0, 0.37778609, 0.02969559, 0.92541658, 0, 0, 0, 0, 1],
    rotateYZX: [0.81379768, 0.52209946, -0.25523613, 0, -0.5, 0.85286853, 0.15038373, 0, 0.29619813, 0.00523613, 0.95511217, 0, 0, 0, 0, 1],
    rotateZXY: [0.84349327, 0.49240388, -0.21461018, 0, -0.41841204, 0.85286853, 0.31232456, 0, 0.33682409, -0.17364818, 0.92541658, 0, 0, 0, 0, 1],
    rotateZYX: [0.81379768, 0.54383814, -0.20487413, 0, -0.46984631, 0.82317294, 0.31879578, 0, 0.34202014, -0.16317591, 0.92541658, 0, 0, 0, 0, 1],
  }

  it('matches the local transform (and Pixar) for every three-axis rotate op', () => {
    const s = Stage.createNew()
    const opTypes = [
      'rotateXYZ', 'rotateXZY', 'rotateYXZ', 'rotateYZX', 'rotateZXY', 'rotateZYX',
    ]
    let count = 0
    for (const opType of opTypes) {
      count++
      const x = Xform.define(s, `/X${count}`)
      appendOp(x.prim, `xformOp:${opType}`, [10, 20, 30])
      const v = new XformCommonAPI(x.prim, s).getXformVectorsByAccumulation()
      const transform = XformCommonAPI.getRotationTransform(v[1], v[4])
      // Matches both the API's own local transform and the Pixar golden.
      const rotation = [...transform.GetArray()] as Matrix4
      expect(matrixClose(localTransform(x), rotation)).toBe(true)
      expect(matrixClose(rotation, GOLDEN[opType]!)).toBe(true)
    }
  })
})

describe('test_CreateXformOps', () => {
  it('creates requested ops idempotently and validates rotation order', () => {
    const s = Stage.createNew()

    const xf = Xform.define(s, '/A')
    const xfc = api(xf)

    // No flags → no ops.
    let ops = xfc.createXformOps()
    expect(ops.translateOp.isDefined()).toBe(false)
    expect(ops.pivotOp.isDefined()).toBe(false)
    expect(ops.rotateOp.isDefined()).toBe(false)
    expect(ops.scaleOp.isDefined()).toBe(false)
    expect(ops.inversePivotOp.isDefined()).toBe(false)
    expect(order(xf)).toEqual([])
    expect(xfc.isValid()).toBe(true)

    // A single rotate op.
    ops = xfc.createXformOps(XformCommonAPI.OpRotate)
    expect(ops.translateOp.isDefined()).toBe(false)
    expect(ops.rotateOp.isDefined()).toBe(true)
    expect(ops.scaleOp.isDefined()).toBe(false)
    expect(order(xf)).toEqual(['xformOp:rotateXYZ'])
    expect(ops.rotateOp.getName()).toBe('xformOp:rotateXYZ')
    expect(xfc.isValid()).toBe(true)

    // Adding a rotate with a different rotation order must raise.
    expect(postedErrors(() => xfc.createXformOps(
      XformCommonAPI.RotationOrderYXZ, XformCommonAPI.OpRotate,
    ))).toHaveLength(1)
    expect(order(xf)).toEqual(['xformOp:rotateXYZ'])
    expect(xfc.isValid()).toBe(true)

    // Add a scale op outside the API; it remains conforming.
    xf.addScaleOp()
    expect(order(xf)).toEqual(['xformOp:rotateXYZ', 'xformOp:scale'])
    expect(xfc.isValid()).toBe(true)
    ops = xfc.createXformOps()
    expect(ops.translateOp.isDefined()).toBe(false)
    expect(ops.rotateOp.isDefined()).toBe(true)
    expect(ops.scaleOp.isDefined()).toBe(true)

    // A fresh prim: create with an explicit rotation order.
    const xf2 = Xform.define(s, '/B')
    const xfc2 = api(xf2)
    ops = xfc2.createXformOps(
      XformCommonAPI.RotationOrderYXZ,
      XformCommonAPI.OpTranslate, XformCommonAPI.OpRotate,
    )
    expect(ops.translateOp.isDefined()).toBe(true)
    expect(ops.rotateOp.isDefined()).toBe(true)
    expect(xfc2.isValid()).toBe(true)

    // Re-create the rotate op without specifying an order: the existing YXZ is
    // retained.
    ops = xfc2.createXformOps(XformCommonAPI.OpRotate)
    expect(ops.translateOp.isDefined()).toBe(true)
    expect(ops.rotateOp.isDefined()).toBe(true)
    expect(ops.rotateOp.getOpType()).toBe(XformOp.TypeRotateYXZ)
  })
})

describe('test_RotationOrderConversions', () => {
  it('round-trips RotationOrder <-> op type and rejects non-three-axis ops', () => {
    const pairs: [RotationOrder, XformOp.Type][] = [
      ['XYZ', XformOp.TypeRotateXYZ], ['XZY', XformOp.TypeRotateXZY], ['YXZ', XformOp.TypeRotateYXZ],
      ['YZX', XformOp.TypeRotateYZX], ['ZXY', XformOp.TypeRotateZXY], ['ZYX', XformOp.TypeRotateZYX],
    ]
    for (const [rotOrder, opType] of pairs) {
      expect(XformCommonAPI.convertRotationOrderToOpType(rotOrder)).toBe(opType)
      expect(XformCommonAPI.convertOpTypeToRotationOrder(opType)).toBe(rotOrder)
      expect(XformCommonAPI.canConvertOpTypeToRotationOrder(opType)).toBe(true)
    }

    const nonThreeAxis = [
      XformOp.TypeTransform, XformOp.TypeTranslate, XformOp.TypeScale, XformOp.TypeOrient,
      XformOp.TypeRotateX, XformOp.TypeRotateY, XformOp.TypeRotateZ,
    ]
    for (const opType of nonThreeAxis) {
      expect(XformCommonAPI.canConvertOpTypeToRotationOrder(opType)).toBe(false)
      expect(postedErrors(() => XformCommonAPI.convertOpTypeToRotationOrder(opType))).toHaveLength(1)
    }
  })
})

describe('test_Double3AndFloat3PivotPosition', () => {
  it('extracts the pivot whether authored as double3 or float3', async () => {
    const p = writeUsda(`
def Xform "Double"
{
    double3 xformOp:translate:pivot = (0.5, 0.0, 0.0)
    uniform token[] xformOpOrder = ["xformOp:translate:pivot", "!invert!xformOp:translate:pivot"]
}

def Xform "Float"
{
    float3 xformOp:translate:pivot = (0.5, 0.0, 0.0)
    uniform token[] xformOpOrder = ["xformOp:translate:pivot", "!invert!xformOp:translate:pivot"]
}
`)
    const stage = (await Stage.open(p))!

    const dv = XformCommonAPI.get(stage, '/Double').getXformVectorsByAccumulation()
    expectVecClose(dv[0], [0, 0, 0]); expectVecClose(dv[1], [0, 0, 0])
    expectVecClose(dv[2], [1, 1, 1]); expectVecClose(dv[3], [0.5, 0, 0])
    expect(dv[4]).toBe('XYZ')

    const fv = XformCommonAPI.get(stage, '/Float').getXformVectorsByAccumulation()
    expectVecClose(fv[0], [0, 0, 0]); expectVecClose(fv[1], [0, 0, 0])
    expectVecClose(fv[2], [1, 1, 1]); expectVecClose(fv[3], [0.5, 0, 0])
    expect(fv[4]).toBe('XYZ')
  })
})
