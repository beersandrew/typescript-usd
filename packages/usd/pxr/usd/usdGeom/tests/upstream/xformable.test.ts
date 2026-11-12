// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomXformable.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdGeom/testenv/testUsdGeomXformable.py: UsdGeomXformOp
// and UsdGeomXformable's op API (Add/Get<Op>Op with precision, suffix and
// inverse, GetOrderedXformOps, SetXformOpOrder, GetLocalTransformation,
// time samples). Expected values are the testenv's own assertions.
// test_ScalarRotateOps, test_VectorRotateOps, test_PrestoRotatePivot,
// test_OrientOp and test_TransformOp are covered by xform.test.ts's op
// matrix checks; test_InvalidXformable and test_ImplicitConversions exercise
// Python-only behavior (SchemaBase __getattribute__, implicit Usd.Property
// conversion).

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Error as TfError, Mark as TfErrorMark } from 'typescript-usd/tf'
import {
  Interval as GfInterval, Matrix4d as GfMatrix4d, Quatd as GfQuatd, Quatf as GfQuatf,
  Quath as GfQuath, Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, makeRotation,
} from 'typescript-usd/gf'
import { Xform, XformCache, XformOp, XformOpTypes, Xformable } from 'typescript-usd/usdGeom'

// _AssertCloseXf (testUsdGeomXformable.py:12-14).
function assertCloseXf(a: GfMatrix4d | readonly number[], b: GfMatrix4d | readonly number[]): void {
  const av = a instanceof GfMatrix4d ? a.GetArray() : a
  const bv = b instanceof GfMatrix4d ? b.GetArray() : b
  for (let i = 0; i < 16; i++) expect(Math.abs(av[i]! - bv[i]!)).toBeLessThanOrEqual(1e-4)
}

// with self.assertRaises(RuntimeError): a Tf error posted or thrown by fn
// (UsdStage::_SetValue's type mismatch coding error is thrown here, see
// usd/src/stage.ts checkValueTypeMatches).
function raises(fn: () => void): boolean {
  const mark = new TfErrorMark()
  try {
    fn()
    return !mark.isClean()
  } catch (e) {
    if (e instanceof TfError) return true
    throw e
  } finally {
    mark.clear()
    mark.dispose()
  }
}

const translate = (v: [number, number, number]) => new GfMatrix4d(1).setTranslate(v)
const scale = (v: [number, number, number]) => new GfMatrix4d(1).setScale(v)
const order = (x: Xformable) => [...(x.getXformOpOrderAttr().get() as Iterable<string>)]

describe('testUsdGeomXformable', () => {
  it('test_TranslateOp', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const translation: [number, number, number] = [10, 20, 30]
    const translateOp = x.addTranslateOp()
    translateOp.set(new GfVec3d(...translation))
    const xform = x.getLocalTransformation()
    assertCloseXf(xform, translate(translation))
    expect(order(x)).toEqual(['xformOp:translate'])

    const getTranslateOp = x.getTranslateOp()
    expect(getTranslateOp.getOpName()).toBe('xformOp:translate')
    expect(getTranslateOp.getOpType()).toBe(XformOp.TypeTranslate)
    expect(translateOp.getAttr().getPath()).toBe(getTranslateOp.getAttr().getPath())

    // Do a scalar translation on Y X and Z and checks that the computed
    // xform (xform2) is same as the xform above.
    x.clearXformOpOrder()
    x.addTranslateYOp().set(20)
    x.addTranslateXOp().set(10)
    x.addTranslateZOp().set(30)
    expect(order(x)).toEqual(['xformOp:translateY', 'xformOp:translateX', 'xformOp:translateZ'])
    assertCloseXf(xform, x.getLocalTransformation())
  })

  it.each([
    ['X', XformOp.TypeTranslateX, [10, 0, 0]],
    ['Y', XformOp.TypeTranslateY, [0, 20, 0]],
    ['Z', XformOp.TypeTranslateZ, [0, 0, 30]],
  ] as const)('test_Translate%sOp', (axis, opType, expected) => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const op = x[`addTranslate${axis}Op`]()
    op.set(expected[0] + expected[1] + expected[2])
    assertCloseXf(x.getLocalTransformation(), translate([...expected]))
    expect(order(x)).toEqual([`xformOp:translate${axis}`])
    const getOp = x[`getTranslate${axis}Op`]()
    expect(getOp.getOpName()).toBe(`xformOp:translate${axis}`)
    expect(getOp.getOpType()).toBe(opType)
    expect(op.getAttr().getPath()).toBe(getOp.getAttr().getPath())
  })

  it('test_ScaleOp', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const scaleOp = x.addScaleOp()
    scaleOp.set(new GfVec3f(10, 20, 30))
    const xform = x.getLocalTransformation()
    assertCloseXf(xform, scale([10, 20, 30]))
    expect(order(x)).toEqual(['xformOp:scale'])
    const getScaleOp = x.getScaleOp()
    expect(getScaleOp.getOpName()).toBe('xformOp:scale')
    expect(getScaleOp.getOpType()).toBe(XformOp.TypeScale)
    expect(scaleOp.getAttr().getPath()).toBe(getScaleOp.getAttr().getPath())

    // Scale is commutative, so check that computing in the order YXZ yields
    // the same result as above.
    x.clearXformOpOrder()
    x.addScaleYOp().set(20)
    x.addScaleXOp().set(10)
    x.addScaleZOp().set(30)
    expect(order(x)).toEqual(['xformOp:scaleY', 'xformOp:scaleX', 'xformOp:scaleZ'])
    assertCloseXf(xform, x.getLocalTransformation())
  })

  it.each([
    ['X', XformOp.TypeScaleX, [10, 1, 1], 10],
    ['Y', XformOp.TypeScaleY, [1, 20, 1], 20],
    ['Z', XformOp.TypeScaleZ, [1, 1, 30], 30],
  ] as const)('test_Scale%sOp', (axis, opType, expected, value) => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const op = x[`addScale${axis}Op`]()
    op.set(value)
    assertCloseXf(x.getLocalTransformation(), scale([...expected]))
    expect(order(x)).toEqual([`xformOp:scale${axis}`])
    const getOp = x[`getScale${axis}Op`]()
    expect(getOp.getOpName()).toBe(`xformOp:scale${axis}`)
    expect(getOp.getOpType()).toBe(opType)
    expect(op.getAttr().getPath()).toBe(getOp.getAttr().getPath())
  })

  it('test_ResetXformStack', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    x.addTranslateOp().set(new GfVec3d(20, 30, 40))

    x.setResetXformStack(true)
    expect(order(x)).toEqual(['!resetXformStack!', 'xformOp:translate'])
    // Calling it twice should have no effect the second time.
    x.setResetXformStack(true)
    expect(order(x)).toEqual(['!resetXformStack!', 'xformOp:translate'])

    x.setResetXformStack(false)
    expect(order(x)).toEqual(['xformOp:translate'])
    // Again, calling this twice shouldn't make a difference.
    x.setResetXformStack(false)
    expect(order(x)).toEqual(['xformOp:translate'])

    x.addTransformOp().set(new GfMatrix4d(1))
    x.setResetXformStack(true)
    expect(order(x)).toEqual(['!resetXformStack!', 'xformOp:translate', 'xformOp:transform'])
    x.setResetXformStack(false)
    expect(order(x)).toEqual(['xformOp:translate', 'xformOp:transform'])

    const cx = Xform.define(s, '/World/Model')
    cx.addTranslateOp().set(new GfVec3d(10, 10, 10))
    const cache = new XformCache()
    assertCloseXf(cache.getLocalToWorldTransform(cx.prim), translate([30, 40, 50]))

    cx.setResetXformStack(true)
    expect(order(cx)).toEqual(['!resetXformStack!', 'xformOp:translate'])

    // Clear the xform cache and recompute local-to-world xform.
    cache.clear()
    const newCxCtm = cache.getLocalToWorldTransform(cx.prim)
    const localCxXform = cx.getLocalTransformation()
    assertCloseXf(newCxCtm, translate([10, 10, 10]))
    assertCloseXf(newCxCtm, localCxXform)

    // Test resetXformStack when it's not at the beginning of xformOpOrder.
    cx.setResetXformStack(false)
    cx.getXformOpOrderAttr().set([...order(cx), XformOpTypes.resetXformStack])
    cx.addTransformOp().set(new GfMatrix4d(2))
    expect(cx.getResetXformStack()).toBe(true)
  })

  it('test_InverseOps', () => {
    const IDENTITY = new GfMatrix4d(1)
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    x.addTranslateOp().set(new GfVec3d(20, 30, 40))
    x.addTranslateOp(XformOp.PrecisionDouble, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    x.addScaleOp().set(new GfVec3f(2, 3, 4))
    x.addScaleOp(XformOp.PrecisionFloat, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    x.addRotateXOp().set(30)
    x.addRotateXOp(XformOp.PrecisionFloat, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    x.addRotateYOp().set(45)
    x.addRotateYOp(XformOp.PrecisionFloat, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    x.addRotateZOp().set(60)
    x.addRotateZOp(XformOp.PrecisionFloat, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    x.addRotateXYZOp(XformOp.PrecisionFloat, 'firstRotate').set(new GfVec3f(10, 20, 30))
    x.addRotateXYZOp(XformOp.PrecisionFloat, 'firstRotate', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    x.addRotateZYXOp(XformOp.PrecisionFloat, 'lastRotate').set(new GfVec3f(30, 60, 45))
    x.addRotateZYXOp(XformOp.PrecisionFloat, 'lastRotate', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    const quat = new GfQuatf(1, new GfVec3f(2, 3, 4))
    x.addOrientOp().set(quat)
    x.addOrientOp(XformOp.PrecisionFloat, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    const rotation = makeRotation([2, 3, 4], 1)
    x.addTransformOp().set(new GfMatrix4d(rotation, new GfVec3d(10, 20, 30)))
    x.addTransformOp(XformOp.PrecisionDouble, '', true)
    assertCloseXf(x.getLocalTransformation(), IDENTITY)

    // We've got tons of xform ops in x now, let's test GetOrderedXformOps API.
    const xformOpOrder = x.getOrderedXformOps().map(op => op.getOpName())
    expect(xformOpOrder).toEqual(order(x))
  })

  it('test_GetXformOp', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const translateOp = x.addTranslateOp()
    translateOp.set(new GfVec3d(10, 20, 30))
    assertCloseXf(x.getLocalTransformation(), translate([10, 20, 30]))
    expect(order(x)).toEqual(['xformOp:translate'])

    // Should return an invalid op if op does not exist
    expect(x.getXformOp(XformOp.TypeScale).isDefined()).toBe(false)

    // Should return the correct suffix name if multiple of the same op are present
    const translate2Op = x.addTranslateOp(XformOp.PrecisionDouble, 'translate2')
    expect(x.getTranslateOp().getOpName()).toBe('xformOp:translate')
    expect(x.getTranslateOp().getOpType()).toBe(XformOp.TypeTranslate)
    expect(x.getTranslateOp().equals(translateOp)).toBe(true)
    expect(x.getTranslateOp('translate2').getOpName()).toBe('xformOp:translate:translate2')
    expect(x.getTranslateOp('translate2').getOpType()).toBe(XformOp.TypeTranslate)
    expect(x.getTranslateOp('translate2').equals(translate2Op)).toBe(true)

    // Should treat inverse ops as distinct from their regular version
    const scaleInvOp = x.addScaleOp(XformOp.PrecisionFloat, '', true)
    expect(scaleInvOp.isDefined()).toBe(true)
    expect(x.getScaleOp().isDefined()).toBe(false)
    const scaleOp = x.addScaleOp()
    expect(scaleOp.isDefined()).toBe(true)
    expect(x.getScaleOp().getOpName()).toBe('xformOp:scale')
    expect(x.getScaleOp().getOpType()).toBe(XformOp.TypeScale)
    expect(scaleOp.equals(x.getScaleOp())).toBe(true)
    expect(x.getScaleOp('', true).getOpName()).toBe('!invert!xformOp:scale')
    expect(x.getScaleOp('', true).getOpType()).toBe(XformOp.TypeScale)
    expect(scaleInvOp.equals(x.getScaleOp('', true))).toBe(true)
  })

  it('test_AddExistingXformOp', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    x.addTranslateOp()
    expect(raises(() => x.addTranslateOp())).toBe(true)

    // Adding an inverse op is OK, since it is considered to be separate from
    // the original op.
    const invTranslateOp = x.addTranslateOp(XformOp.PrecisionDouble, '', true)
    expect(invTranslateOp.isDefined()).toBe(true)

    // Setting a value on an inverse op is not ok.
    expect(raises(() => invTranslateOp.set(new GfVec3d(1, 1, 1)))).toBe(true)

    x.addScaleOp(XformOp.PrecisionDouble)
    expect(raises(() => x.addScaleOp(XformOp.PrecisionFloat, '', true))).toBe(true)
  })

  it('test_SingularTransformOp', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const transformOp = x.addTransformOp()
    const singularMat = new GfMatrix4d(
      32, 8, 11, 17,
      8, 20, 17, 23,
      11, 17, 14, 26,
      17, 23, 26, 2)
    transformOp.set(singularMat, 1)

    // Insert a translate op in the middle, as two consecutive inverse ops are
    // simply skipped when computing local transform value.
    x.addTranslateOp().set(new GfVec3d(1, 1, 1))
    x.addTransformOp(XformOp.PrecisionDouble, '', true)
    expect(raises(() => x.getLocalTransformation(1))).toBe(true)

    // If the translateOp in the middle is removed from xformOpOrder, then
    // calling GetLocalTransformation() should not result in an error as the
    // pair of consecutive inverse xformOps will get skipped.
    x.getXformOpOrderAttr().set(['xformOp:transform', '!invert!xformOp:transform'])
    expect(x.getLocalTransformation(1).equals(new GfMatrix4d(1))).toBe(true)
  })

  it('test_VaryingPrecisionOps', () => {
    const s = Stage.createNew()
    const x1 = Xform.define(s, '/World')

    const halfRotOp = x1.addRotateXYZOp(XformOp.PrecisionHalf, 'Half')
    expect(halfRotOp.getPrecision()).toBe(XformOp.PrecisionHalf)
    halfRotOp.set(new GfVec3h(0, 0, 60))

    const doubleRotOp = x1.addRotateXYZOp(XformOp.PrecisionDouble, 'Double')
    expect(doubleRotOp.getPrecision()).toBe(XformOp.PrecisionDouble)
    doubleRotOp.set(new GfVec3d(0, 45.123456789, 0))

    const floatRotOp = x1.addRotateXYZOp(XformOp.PrecisionFloat, 'Float')
    expect(floatRotOp.getPrecision()).toBe(XformOp.PrecisionFloat)
    floatRotOp.set(new GfVec3f(30, 0, 0))

    expect(order(x1)).toEqual([
      'xformOp:rotateXYZ:Half', 'xformOp:rotateXYZ:Double', 'xformOp:rotateXYZ:Float'])
    const xform1 = x1.getLocalTransformation()

    const x2 = Xform.define(s, '/World2')
    x2.addRotateXYZOp(XformOp.PrecisionDouble).set(new GfVec3d(30, 45.123456789, 60))
    const xform2 = x2.getLocalTransformation()

    // Everything gets converted to double internally, so the xforms computed
    // must be equal.
    expect(xform1.equals(xform2)).toBe(true)

    const x3 = Xform.define(s, '/World3')
    const quatd = new GfQuatd(1, new GfVec3d(2, 3, 4)).GetNormalized()
    const quatf = new GfQuatf(2, new GfVec3f(3, 4, 5)).GetNormalized()
    const quath = new GfQuath(3, new GfVec3h(4, 5, 6)).GetNormalized()

    x3.addOrientOp().set(quatf)
    const floatOrientOp = x3.addOrientOp(XformOp.PrecisionFloat, 'Float')
    floatOrientOp.set(quatf)
    const doubleOrientOp = x3.addOrientOp(XformOp.PrecisionDouble, 'Double')
    doubleOrientOp.set(quatd)
    const halfOrientOp = x3.addOrientOp(XformOp.PrecisionHalf, 'Half')
    halfOrientOp.set(quath)

    const xform3 = x3.getLocalTransformation()
    assertCloseXf(xform3, new GfMatrix4d(
      -0.27080552040616, -0.120257027227524, 0.955092988938746, 0,
      0.95202181574436, 0.113459757051953, 0.284220593688289, 0,
      -0.14254414216081, 0.986237867318078, 0.0837617848635551, 0,
      0, 0, 0, 1))
  })

  it('test_VaryingPrecisionOps: a quatd cannot be set on a float-precision op', () => {
    const s = Stage.createNew()
    const x3 = Xform.define(s, '/World3')
    const floatOrientOp = x3.addOrientOp(XformOp.PrecisionFloat, 'Float')
    const quatd = new GfQuatd(1, new GfVec3d(2, 3, 4)).GetNormalized()
    // Cannot set a quatd on an op that is of precision float.
    expect(raises(() => floatOrientOp.set(quatd))).toBe(true)
  })

  it('test_InvalidXformOps', () => {
    const s = Stage.createNew()
    const p = s.definePrim('/World', 'Xform')
    const x = new Xformable(p)

    // Create an attribute that is not in the xformOp namespace.
    const attr1 = p.createAttribute('myXformOp:transform', 'matrix4d')
    expect(raises(() => new XformOp(attr1, false))).toBe(true)

    // Create an xform op with an invalid optype.
    const attr2 = p.createAttribute('xformOp:translateXYZ', 'double3')
    expect(raises(() => new XformOp(attr2, false))).toBe(true)

    // Create an xform op with opType=transform and typeName=Matrix4f.
    expect(raises(() => x.addTransformOp(XformOp.PrecisionFloat))).toBe(true)

    // Test Validity of XformOp with no attr
    const xformOp = new XformOp()
    expect(xformOp.isDefined()).toBe(false)
  })

  // Test TypeToken to TypeEnum mapping
  it('test_XformOpTypes', () => {
    const typeEnums = [
      XformOp.TypeScale, XformOp.TypeInvalid, XformOp.TypeTranslate, XformOp.TypeRotateZ,
      XformOp.TypeRotateX, XformOp.TypeRotateY, XformOp.TypeRotateZYX, XformOp.TypeRotateXYZ,
      XformOp.TypeRotateXZY, XformOp.TypeRotateYXZ, XformOp.TypeRotateYZX, XformOp.TypeRotateZXY,
      XformOp.TypeTransform, XformOp.TypeOrient,
    ]
    const typeTokens = [
      'scale', '', 'translate', 'rotateZ', 'rotateX', 'rotateY', 'rotateZYX', 'rotateXYZ',
      'rotateXZY', 'rotateYXZ', 'rotateYZX', 'rotateZXY', 'transform', 'orient',
    ]
    typeEnums.forEach((typeEnum, index) => {
      expect(XformOp.getOpTypeEnum(typeTokens[index]!)).toBe(typeEnum)
      expect(XformOp.getOpTypeToken(typeEnum)).toBe(typeTokens[index])
    })
  })

  it('test_MightBeTimeVarying', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const translation = new GfVec3d(10, 20, 30)
    const xlateOp = x.addTranslateOp()
    expect(x.transformMightBeTimeVarying()).toBe(false)

    xlateOp.set(translation)
    expect(x.transformMightBeTimeVarying()).toBe(false)

    xlateOp.set(new GfVec3d(20, 40, 60), 1)
    expect(x.transformMightBeTimeVarying()).toBe(false)
    // Test both overloads of TransformMightBeTimeVarying.
    expect(x.transformMightBeTimeVarying([xlateOp])).toBe(false)

    expect(x.getTimeSamples()).toEqual([1])
    xlateOp.set(new GfVec3d(30, 60, 90), 2)

    expect(x.transformMightBeTimeVarying()).toBe(true)
    expect(x.transformMightBeTimeVarying([xlateOp])).toBe(true)
    expect(x.getTimeSamples()).toEqual([1, 2])

    x.getXformOpOrderAttr().set(['xformOp:translate', '!resetXformStack!'])
    expect(x.transformMightBeTimeVarying()).toBe(false)
    expect(x.getTimeSamples()).toEqual([])

    x.getXformOpOrderAttr().set(['!resetXformStack!', 'xformOp:translate'])
    expect(x.transformMightBeTimeVarying()).toBe(true)
    expect(x.getTimeSamples()).toEqual([1, 2])
  })

  it('test_GetTimeSamples', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    const xlateOp = x.addTranslateOp()
    const scaleOp = x.addScaleOp()
    expect(xlateOp.getTimeSamples()).toEqual([])
    expect(scaleOp.getTimeSamples()).toEqual([])
    expect(x.getTimeSamples()).toEqual([])

    xlateOp.set(new GfVec3d(10, 20, 30), 1)
    expect(x.getTimeSamples()).toEqual([1])
    xlateOp.set(new GfVec3d(10, 20, 30), 3)
    expect(x.getTimeSamples()).toEqual([1, 3])
    scaleOp.set(new GfVec3f(1, 2, 3), 2)
    expect(x.getTimeSamples()).toEqual([1, 2, 3])
    scaleOp.set(new GfVec3f(1, 2, 3), 4)
    expect(x.getTimeSamples()).toEqual([1, 2, 3, 4])

    expect(xlateOp.getTimeSamples()).toEqual([1, 3])
    expect(scaleOp.getTimeSamples()).toEqual([2, 4])
    expect(xlateOp.getTimeSamplesInInterval(new GfInterval(2, 4))).toEqual([3])
    expect(scaleOp.getTimeSamplesInInterval(new GfInterval(0, 3))).toEqual([2])
    expect(x.getTimeSamplesInInterval(new GfInterval(1.5, 3.2))).toEqual([2, 3])
  })

  it('test_PureOvers', () => {
    const s = Stage.createNew()
    // Create a pure over prim and invoke various API.
    const xf = new Xformable(s.overridePrim('/World'))
    xf.setResetXformStack(true)
    xf.makeMatrixXform().set(new GfMatrix4d(1))
    xf.setXformOpOrder(xf.getOrderedXformOps(), false)
    expect(order(xf)).toEqual(['xformOp:transform'])
  })

  it('test_Bug109853', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    // A non-existent xformOp in xformOpOrder results in a warning, not a
    // crash, when GetLocalTransformation is called.
    x.getXformOpOrderAttr().set(['xformOp:transform'])
    expect(x.getLocalTransformation().equals(new GfMatrix4d(1))).toBe(true)
  })

  it('test_XformOpOperators', () => {
    const s = Stage.createNew()
    const rootXform = Xform.define(s, '/Root')
    const translateOp = rootXform.addTranslateOp()
    const scaleOp = rootXform.addScaleOp()
    expect(new XformOp().isDefined()).toBe(false)
    expect(translateOp.isDefined()).toBe(true)
    expect(scaleOp.isDefined()).toBe(true)
    const xformOps = rootXform.getOrderedXformOps()
    expect(xformOps).toHaveLength(2)
    expect(xformOps[0]!.equals(translateOp)).toBe(true)
    expect(xformOps[1]!.equals(scaleOp)).toBe(true)
  })

  it('GetOrderedXformOps reports resetXformStack (xformable.cpp:616-697)', () => {
    const s = Stage.createNew()
    const x = Xform.define(s, '/World')
    x.addTranslateOp()
    x.setResetXformStack(true)
    const resets = { value: false }
    expect(x.getOrderedXformOps(resets).map(op => op.getOpName())).toEqual(['xformOp:translate'])
    expect(resets.value).toBe(true)
  })
})
