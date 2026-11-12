// Ported from OpenUSD 26.11.1: pxr/base/vt/value.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtValue and Sdf's value copy and equality dispatch through one per-type
// record (typeInfo.ts; upstream's VtValue _TypeInfo, value.h:150, 537, 1521)
// instead of instanceof/typeof chains. The classification must be exactly
// the one the chains made; the previous chains are kept below as the
// reference and compared over a corpus of held values.
import { describe, expect, it } from 'vitest'
import {
  Array as VtArray, ArrayEdit as VtArrayEdit, Dictionary as VtDictionary, Value as VtValue, ValueTypes,
  _CopyHeldValue as copyHeldValue, _GetTypeKind as vtTypeKind,
} from 'typescript-usd/vt'
import {
  Vec3f as GfVec3f, Vec2d as GfVec2d, Vec4i as GfVec4i, Matrix4d as GfMatrix4d, Matrix3d as GfMatrix3d,
  Quatf as GfQuatf, Quaternion as GfQuaternion, Range3d as GfRange3d, Interval as GfInterval,
  _MatrixBase as GfMatrixBase, _QuatBase as GfQuatBase, _VecBase as GfVecBase,
} from 'typescript-usd/gf'
import { _sdfCloneValue as sdfCloneValue, _sdfValuesEqual as sdfValuesEqual, _sdfIsGfValue } from 'typescript-usd/sdf/_internal'
import { SdfPath } from 'typescript-usd/sdf/path'

// ---- previous classification (value.ts copyHeldValue, abstractData.ts,
// schema.ts _sdfIsGfValue before the table) ----
function previousKind(value: unknown): string {
  if (value instanceof VtArray) return 'array'
  if (value instanceof VtArrayEdit) return 'arrayEdit'
  if (value instanceof VtDictionary) return 'dictionary'
  if (value === null || typeof value !== 'object') return 'primitive'
  if (Array.isArray(value)) return 'list'
  if (Object.getPrototypeOf(value) === Object.prototype) return 'record'
  if (value instanceof GfVecBase || value instanceof GfMatrixBase || value instanceof GfQuatBase) return 'gf'
  return 'object'
}

class ExtVec extends GfVec3f {}
class Opaque { constructor(readonly x = 1) {} equals(o: unknown): boolean { return o instanceof Opaque && o.x === this.x } }

const corpus = (): unknown[] => [
  undefined, null, true, 0, -0, NaN, 3.5, 12n, '', 'token', Symbol.for('s'), () => 1,
  [], [1, 2], [[1], 'a'], [new GfVec3f(1, 2, 3)], [VtValue.create(1, ValueTypes.int)],
  {}, { a: 1, b: { c: [1] } }, Object.create(null),
  new VtArray([1, 2, 3], ValueTypes.float), new VtArray(['a'], ValueTypes.token),
  new VtArray([new GfVec3f(1, 2, 3)], ValueTypes.GfVec3f),
  new VtArrayEdit([]), new VtDictionary([['k', VtValue.create(1, ValueTypes.int)]]),
  new GfVec3f(1, 2, 3), new GfVec2d(1, 2), new GfVec4i(1, 2, 3, 4), new GfMatrix4d(1), new GfMatrix3d(2),
  new GfQuatf(1, 0, 0, 0), new GfQuaternion(1, [0, 0, 0]), new GfRange3d(), new GfInterval(0, 1),
  new ExtVec(1, 2, 3), new Opaque(), new Map([['a', 1]]), new Set([1]), new Date(0),
  SdfPath.fromString('/A/B.c'), new Uint8Array([1, 2]),
]

describe('Vt type-info dispatch', () => {
  it('classifies every held value as the previous instanceof chains did', () => {
    for (const value of corpus()) expect(vtTypeKind(value), String(previousKind(value))).toBe(previousKind(value))
  })

  it('answers _sdfIsGfValue as the previous instanceof test did', () => {
    for (const value of corpus()) {
      expect(_sdfIsGfValue(value)).toBe(
        value instanceof GfVecBase || value instanceof GfMatrixBase || value instanceof GfQuatBase)
    }
  })

  it('copies held values into the same kinds and equal contents', () => {
    for (const value of corpus()) {
      const copy = copyHeldValue(value)
      if (value === null || typeof value !== 'object') { expect(Object.is(copy, value)).toBe(true); continue }
      expect(Object.getPrototypeOf(copy)).toBe(Object.getPrototypeOf(value))
      const sdfCopy = sdfCloneValue(value)
      // Sdf copies a dictionary, including a prototype-less one, as a plain object.
      const proto = Object.getPrototypeOf(value)
      expect(Object.getPrototypeOf(sdfCopy)).toBe(proto === null ? Object.prototype : proto)
      if (proto !== null) expect(sdfValuesEqual(sdfCopy, value)).toBe(true)
    }
  })

  it('reports array-ness and element types through the VtValue', () => {
    const array = VtValue.createArray(new VtArray([1, 2, 3], ValueTypes.float))
    expect([array.isArrayValued(), array.getArraySize(), array.getElementType()]).toEqual([true, 3, ValueTypes.float])
    const scalar = VtValue.create(new GfVec3f(1, 2, 3), ValueTypes.GfVec3f)
    expect([scalar.isArrayValued(), scalar.getArraySize(), scalar.getElementType().isUnknown()]).toEqual([false, 0, true])
    const edit = VtValue.createArrayEdit(new VtArrayEdit([]), ValueTypes.int)
    expect([edit.isArrayEditValued(), edit.isArrayValued(), edit.getElementType()]).toEqual([true, false, ValueTypes.int])
    const swapped = VtValue.getEmpty()
    swapped.swap(array)
    expect([swapped.isArrayValued(), array.isArrayValued(), array.IsEmpty()]).toEqual([true, false, true])
    expect(swapped.equals(VtValue.createArray(new VtArray([1, 2, 3], ValueTypes.float)))).toBe(true)
    expect(scalar.equals(VtValue.create(new GfVec3f(1, 2, 3), ValueTypes.GfVec3f))).toBe(true)
    expect(scalar.equals(VtValue.create(new GfVec3f(1, 2, 4), ValueTypes.GfVec3f))).toBe(false)
  })
})
