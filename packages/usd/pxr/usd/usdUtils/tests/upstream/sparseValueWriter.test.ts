// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsSparseValueWriter.py,
//  pxr/usd/usdUtils/wrapSparseValueWriter.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsSparseValueWriter.py
// (registered as testUsdUtilsSparseValueWriter; no testenv directory).
//
// API mapping (wrapSparseValueWriter.cpp):
//   - UsdUtils.SparseAttrValueWriter(attr, defaultValue=) is
//     new SparseAttrValueWriter(attr, defaultValue); SetTimeSample(value,
//     time) is setTimeSample(value, time); UsdUtils.SparseValueWriter's
//     SetAttribute / GetSparseAttrValueWriters are setAttribute /
//     getSparseAttrValueWriters.
//   - Usd.Stage.CreateInMemory() is Stage.createNew(); UsdGeom.Scope.Define is
//     Scope.define; prim.CreateAttribute is createAttribute; attr.Get() is
//     getValue(); GetTimeSamples() is getTimeSampleKeys().
//   - sphere.CreateRadiusAttr() / cylinder.CreateHeightAttr() with no default
//     value author no value; getRadiusAttr() / getHeightAttr() are the same
//     attributes, with their schema fallbacks.
//   - Python's valueType(x) for the Gf types is the matching Gf constructor;
//     Python lists for array attributes are JS arrays.
//   - A Tf.ErrorException raised for a TF_CODING_ERROR is an error posted to
//     a TfErrorMark.
//
// TestAttrOfType and TestQuats assert attr.GetTimeSamples() (the scalar
// attribute) after authoring the array attribute, as upstream does.
import { describe, expect, it } from 'vitest'
import {
  Matrix2d, Matrix3d, Matrix4d, Quatd, Quatf, Quath, Vec2d, Vec2f, Vec2h, Vec3d, Vec3f, Vec3h, Vec4d, Vec4f, Vec4h,
} from 'typescript-usd/gf'
import { ValueTypeNames } from 'typescript-usd/sdf'
import { Mark as TfErrorMark } from 'typescript-usd/tf'
import { Stage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Cylinder, Scope, Sphere } from 'typescript-usd/usdGeom'
import { SparseAttrValueWriter, SparseValueWriter } from 'typescript-usd/usdUtils'

type ValueType = (x: number) => unknown

// `with self.assertRaises(Tf.ErrorException):`
function expectCodingError(action: () => unknown): void {
  const mark = new TfErrorMark()
  try {
    action()
    expect(mark.isClean()).toBe(false)
  } finally {
    mark.clear()
    mark.dispose()
  }
}

// testUsdUtilsSparseValueWriter.py:14-88
function testAttrOfType(
  typeName: string, arrayTypeName: string, defaultValue: unknown, valueType: ValueType, epsilon: number,
  defaultMatchesTen: boolean,
): void {
  const s = Stage.createNew()
  const scope = Scope.define(s, '/Scope')

  // Test scalar valued attribute.
  const attr = scope.prim.createAttribute('attr', typeName)
  expect(attr.hasAuthoredValue()).toBe(false)

  const valueWriter = new SparseAttrValueWriter(attr, defaultValue)
  expect(attr.hasAuthoredValue()).toBe(true)

  valueWriter.setTimeSample(valueType(10.), 0.0)
  valueWriter.setTimeSample(valueType(10.), 0.5)
  valueWriter.setTimeSample(valueType(10.), 1.0)
  valueWriter.setTimeSample(valueType(20.), 2.0)
  valueWriter.setTimeSample(valueType(20.), 3.0)
  valueWriter.setTimeSample(valueType(20.), 4.0)
  valueWriter.setTimeSample(valueType(30.), 5.0)
  valueWriter.setTimeSample(valueType(30. + (epsilon / 2)), 6.0)
  valueWriter.setTimeSample(valueType(30.), 7.0)
  valueWriter.setTimeSample(valueType(30. + (epsilon * 2)), 8.0)
  // `defaultValue == valueType(10.0)`
  let expectedTimeSamples = defaultMatchesTen
    ? [1.0, 2.0, 4.0, 5.0, 7.0, 8.0]
    : [0.0, 1.0, 2.0, 4.0, 5.0, 7.0, 8.0]
  expect(attr.getTimeSampleKeys()).toEqual(expectedTimeSamples)

  // Test array valued attribute.
  const arrayAttr = scope.prim.createAttribute('arrayAttr', arrayTypeName)
  expect(arrayAttr.hasAuthoredValue()).toBe(false)

  const arrayValueWriter = new SparseAttrValueWriter(arrayAttr, [defaultValue, defaultValue])
  expect(arrayAttr.hasAuthoredValue()).toBe(true)

  arrayValueWriter.setTimeSample([valueType(10.), valueType(10.)], 0.0)
  arrayValueWriter.setTimeSample([valueType(10.), valueType(10.)], 0.5)
  arrayValueWriter.setTimeSample([valueType(10.), valueType(10.)], 1.0)
  arrayValueWriter.setTimeSample([valueType(20.), valueType(10.)], 2.0)
  arrayValueWriter.setTimeSample([valueType(20.), valueType(10.)], 3.0)
  arrayValueWriter.setTimeSample([valueType(20.), valueType(10.)], 4.0)
  arrayValueWriter.setTimeSample([valueType(30.), valueType(30.)], 5.0)
  arrayValueWriter.setTimeSample([valueType(30.), valueType(30. + (epsilon / 2))], 6.0)
  arrayValueWriter.setTimeSample([valueType(30.), valueType(30.)], 7.0)
  arrayValueWriter.setTimeSample([valueType(30. + (epsilon * 2)), valueType(30.)], 8.0)

  expectedTimeSamples = defaultMatchesTen
    ? [1.0, 2.0, 4.0, 5.0, 7.0, 8.0]
    : [0.0, 1.0, 2.0, 4.0, 5.0, 7.0, 8.0]
  expect(attr.getTimeSampleKeys()).toEqual(expectedTimeSamples)
}

type QuatType = (real: number, imaginary: number) => unknown

// testUsdUtilsSparseValueWriter.py:131-224
function testQuats(typeName: string, arrayTypeName: string, defaultValue: unknown, q: QuatType, epsilon: number): void {
  const s = Stage.createNew()
  const scope = Scope.define(s, '/Scope')

  // Test scalar valued quat attribute.
  const attr = scope.prim.createAttribute('quat', typeName)
  expect(attr.hasAuthoredValue()).toBe(false)

  const valueWriter = new SparseAttrValueWriter(attr, defaultValue)
  expect(attr.hasAuthoredValue()).toBe(true)

  valueWriter.setTimeSample(q(10., 10.0), 1.0)
  valueWriter.setTimeSample(q(20., 20.0), 2.0)
  valueWriter.setTimeSample(q(20., 20.0), 3.0)
  valueWriter.setTimeSample(q(20., 20.0), 4.0)
  valueWriter.setTimeSample(q(30., 30.0), 5.0)
  valueWriter.setTimeSample(q(30. + epsilon / 2, 30.0 + epsilon / 2), 6.0)
  valueWriter.setTimeSample(q(30., 30.0), 7.0)
  valueWriter.setTimeSample(q(30. + epsilon * 2, 30.0 + epsilon * 2), 8.0)

  expect(attr.getTimeSampleKeys()).toEqual([1.0, 2.0, 4.0, 5.0, 7.0, 8.0])

  // Test array valued quats.
  const arrayAttr = scope.prim.createAttribute('arrayQuat', arrayTypeName)
  expect(arrayAttr.hasAuthoredValue()).toBe(false)

  const arrayValueWriter = new SparseAttrValueWriter(arrayAttr, [defaultValue, defaultValue])
  expect(arrayAttr.hasAuthoredValue()).toBe(true)

  arrayValueWriter.setTimeSample([q(10., 10.0), q(10., 10.0)], 1.0)
  arrayValueWriter.setTimeSample([q(20., 10.0), q(10., 20.0)], 2.0)
  arrayValueWriter.setTimeSample([q(20., 10.0), q(10., 20.0)], 3.0)
  arrayValueWriter.setTimeSample([q(20., 10.0), q(10., 20.0)], 4.0)
  arrayValueWriter.setTimeSample([q(30., 30.0), q(30., 30.0)], 5.0)
  arrayValueWriter.setTimeSample([q(30. + epsilon / 2, 30.0 + epsilon / 2),
    q(30. + epsilon / 2, 30.0 + epsilon / 2)], 6.0)
  arrayValueWriter.setTimeSample([q(30., 30.0), q(30., 30.0)], 7.0)
  arrayValueWriter.setTimeSample([q(30., 30.0 + epsilon * 2), q(30. + epsilon * 2, 30.0)], 8.0)

  const expectedTimeSamples = [1.0, 2.0, 4.0, 5.0, 7.0, 8.0]
  expect(attr.getTimeSampleKeys()).toEqual(expectedTimeSamples)
}

const num: ValueType = x => x

describe('TestUsdUtilsSparseAuthoring', () => {
  // testUsdUtilsSparseValueWriter.py:90-92
  it('test_Double', () => {
    testAttrOfType(ValueTypeNames.Double.name, ValueTypeNames.DoubleArray.name, 0.0, num, 1e-12, false)
  })

  // testUsdUtilsSparseValueWriter.py:94-97
  it('test_Float', () => {
    // default value matches first time-sample.
    testAttrOfType(ValueTypeNames.Float.name, ValueTypeNames.FloatArray.name, 10.0, num, 1e-6, true)
  })

  // testUsdUtilsSparseValueWriter.py:99-101
  it('test_Half', () => {
    testAttrOfType(ValueTypeNames.Half.name, ValueTypeNames.HalfArray.name, 20.0, num, 1e-2, false)
  })

  // testUsdUtilsSparseValueWriter.py:103-121
  it('test_Vectors', () => {
    testAttrOfType(ValueTypeNames.Float2.name, ValueTypeNames.Float2Array.name, new Vec2f(0.0), x => new Vec2f(x), 1e-6, false)
    testAttrOfType(ValueTypeNames.Float3.name, ValueTypeNames.Float3Array.name, new Vec3f(0.0), x => new Vec3f(x), 1e-6, false)
    testAttrOfType(ValueTypeNames.Float4.name, ValueTypeNames.Float4Array.name, new Vec4f(0.0), x => new Vec4f(x), 1e-6, false)

    testAttrOfType(ValueTypeNames.Double2.name, ValueTypeNames.Double2Array.name, new Vec2d(0.0), x => new Vec2d(x), 1e-12, false)
    testAttrOfType(ValueTypeNames.Double3.name, ValueTypeNames.Double3Array.name, new Vec3d(0.0), x => new Vec3d(x), 1e-12, false)
    testAttrOfType(ValueTypeNames.Double4.name, ValueTypeNames.Double4Array.name, new Vec4d(0.0), x => new Vec4d(x), 1e-12, false)

    testAttrOfType(ValueTypeNames.Half2.name, ValueTypeNames.Half2Array.name, new Vec2h(0.0), x => new Vec2h(x), 1e-2, false)
    testAttrOfType(ValueTypeNames.Half3.name, ValueTypeNames.Half3Array.name, new Vec3h(0.0), x => new Vec3h(x), 1e-2, false)
    testAttrOfType(ValueTypeNames.Half4.name, ValueTypeNames.Half4Array.name, new Vec4h(0.0), x => new Vec4h(x), 1e-2, false)
  })

  // testUsdUtilsSparseValueWriter.py:123-129
  it('test_Matrices', () => {
    testAttrOfType(ValueTypeNames.Matrix2d.name, ValueTypeNames.Matrix2dArray.name, new Matrix2d(0.0), x => new Matrix2d(x), 1e-12, false)
    testAttrOfType(ValueTypeNames.Matrix3d.name, ValueTypeNames.Matrix3dArray.name, new Matrix3d(0.0), x => new Matrix3d(x), 1e-12, false)
    testAttrOfType(ValueTypeNames.Matrix4d.name, ValueTypeNames.Matrix4dArray.name, new Matrix4d(0.0), x => new Matrix4d(x), 1e-12, false)
  })

  // testUsdUtilsSparseValueWriter.py:226-235
  it('test_testQuats', () => {
    testQuats(ValueTypeNames.Quatd.name, ValueTypeNames.QuatdArray.name,
      new Quatd(0.0), (r, i) => new Quatd(r, new Vec3d(i)), 1e-12)
    testQuats(ValueTypeNames.Quatf.name, ValueTypeNames.QuatfArray.name,
      new Quatf(0.0), (r, i) => new Quatf(r, new Vec3f(i)), 1e-6)
    testQuats(ValueTypeNames.Quath.name, ValueTypeNames.QuathArray.name,
      new Quath(0.0), (r, i) => new Quath(r, new Vec3h(i)), 1e-2)
  })

  // testUsdUtilsSparseValueWriter.py:237-253
  it('test_MatchDefault', () => {
    const s = Stage.createNew()
    const sphere = Sphere.define(s, '/Sphere')
    const radius = sphere.getRadiusAttr()
    const attrValueWriter = new SparseAttrValueWriter(radius, 1.0)

    // Default value isn't authored into scene description since it matches
    // the fallback value of radius.
    expect(radius.hasAuthoredValue()).toBe(false)

    attrValueWriter.setTimeSample(10.0, 1.0)
    attrValueWriter.setTimeSample(10.0, 2.0)
    attrValueWriter.setTimeSample(10.0, 3.0)
    attrValueWriter.setTimeSample(20.0, 4.0)

    expect(radius.getTimeSampleKeys()).toEqual([1.0, 3.0, 4.0])
  })

  // testUsdUtilsSparseValueWriter.py:255-291
  it('test_SparseValueWriter', () => {
    const s = Stage.createNew()
    const cylinder = Cylinder.define(s, '/Cylinder')
    const radius = cylinder.getRadiusAttr()
    const height = cylinder.getHeightAttr()

    const valueWriter = new SparseValueWriter()

    valueWriter.setAttribute(radius, 2.0, UsdTimeCode.Default())
    valueWriter.setAttribute(height, 2.0, UsdTimeCode.Default())

    expect(valueWriter.getSparseAttrValueWriters().length).toBe(2)

    // Default value isn't authored for the height attribute into scene
    // description since it matches the fallback value of height.
    expect(height.hasAuthoredValue()).toBe(false)

    // Default value is authored for the radius attribute into scene
    // description since it does not match the fallback value of radius,
    // which is 1.0.
    expect(radius.hasAuthoredValue()).toBe(true)

    expect(radius.getValue()).toBe(2.0)
    // Calling SetAttribute again with time-Default will update the default
    // value.
    valueWriter.setAttribute(radius, 5.0, UsdTimeCode.Default())
    expect(radius.getValue()).toBe(5.0)

    valueWriter.setAttribute(radius, 10.0, 1.0)
    valueWriter.setAttribute(radius, 20.0, 2.0)
    valueWriter.setAttribute(radius, 20.0, 3.0)
    valueWriter.setAttribute(radius, 20.0, 4.0)

    valueWriter.setAttribute(height, 2.0, 1.0)
    valueWriter.setAttribute(height, 2.0, 2.0)
    valueWriter.setAttribute(height, 3.0, 3.0)
    valueWriter.setAttribute(height, 3.0, 4.0)

    expect(radius.getTimeSampleKeys()).toEqual([1.0, 2.0])
    expect(height.getTimeSampleKeys()).toEqual([2.0, 3.0])
  })

  // testUsdUtilsSparseValueWriter.py:293-309
  it('test_ErrorCases', () => {
    const s = Stage.createNew()
    const scope = Scope.define(s, '/Scope')

    const attr1 = scope.prim.createAttribute('attr1', ValueTypeNames.Float.name)
    expect(attr1.hasAuthoredValue()).toBe(false)

    const attrValueWriter = new SparseAttrValueWriter(attr1)
    // No default value was specified. So no authored value yet.
    expect(attr1.hasAuthoredValue()).toBe(false)

    attrValueWriter.setTimeSample(10.0, 10.0)
    // Authoring an earlier time-sample than the previous one results in
    // a coding error also.

    // Calling SetTimeSample with time=default raises a coding error.
    expectCodingError(() => attrValueWriter.setTimeSample(10.0, UsdTimeCode.Default()))

    expectCodingError(() => attrValueWriter.setTimeSample(20.0, 5.0))
  })
})
