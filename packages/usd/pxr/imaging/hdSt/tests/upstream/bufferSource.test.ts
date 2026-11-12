// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBufferSource.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStBufferSource.cpp
// (OpenUSD 26.11.1). The upstream test verifies with TF_VERIFY and an error
// mark; each TF_VERIFY is an expectation here. The stdout dump is not diffed
// upstream and is not reproduced.

import { describe, expect, it } from 'vitest'
import {
  Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  DataSizeOfType as HdDataSizeOfType,
  GetComponentCount as HdGetComponentCount,
  GetComponentType as HdGetComponentType,
  GetValueTupleType as HdGetValueTupleType,
  Tokens as HdTokens,
  TupleTypeEquals,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
} from 'typescript-usd/hd'

type Kind = { name: string, type: TfType, make: (i: number) => unknown, size: number }
const k = (name: string, make: (i: number) => unknown, size: number): Kind =>
  ({ name, type: (VtValueTypes as Record<string, TfType>)[name] ?? TfType.declare(name), make, size })

const kinds = {
  GfVec2f: k('GfVec2f', i => new GfVec2f(i), 8),
  GfVec3f: k('GfVec3f', i => new GfVec3f(i), 12),
  GfVec4f: k('GfVec4f', i => new GfVec4f(i), 16),
  GfVec2d: k('GfVec2d', i => new GfVec2d(i), 16),
  GfVec3d: k('GfVec3d', i => new GfVec3d(i), 24),
  GfVec4d: k('GfVec4d', i => new GfVec4d(i), 32),
  GfVec2i: k('GfVec2i', i => new GfVec2i(i), 8),
  GfVec3i: k('GfVec3i', i => new GfVec3i(i), 12),
  GfVec4i: k('GfVec4i', i => new GfVec4i(i), 16),
  GfMatrix4f: k('GfMatrix4f', i => new GfMatrix4f(i), 64),
  GfMatrix4d: k('GfMatrix4d', i => new GfMatrix4d(i), 128),
  int: k('int', i => i, 4),
  float: k('float', i => i, 4),
  double: k('double', i => i, 8),
}

function components(v: unknown): number[] {
  if (typeof v === 'number') return [v]
  const o = v as { GetArray?: () => readonly number[], data?: readonly number[] }
  return o.GetArray ? [...o.GetArray()] : [...o.data!]
}

function dataComponents(b: HdVtBufferSource): number[] {
  return Array.from(b.getData() as unknown as ArrayLike<number>)
}

function scalarValue(kind: Kind, i: number): VtValue {
  return VtValue.create(kind.make(i), kind.type)
}

function arrayValue(kind: Kind, length: number): [VtValue, unknown[]] {
  const elems = Array.from({ length }, (_, i) => kind.make(i))
  return [VtValue.createArray(new VtArray<unknown>(elems, kind.type)), elems]
}

/** testHdStBufferSource.cpp:39-58 */
function BasicTest(kind: Kind, numComponents: number): void {
  const value = kind.make(1)
  const v = scalarValue(kind, 1)
  const b = new HdVtBufferSource(HdTokens.points, v)
  expect(TupleTypeEquals(b.getTupleType(), HdGetValueTupleType(v))).toBe(true)
  expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
  expect(HdDataSizeOfTupleType(b.getTupleType())).toBe(kind.size)
  expect(b.getNumElements()).toBe(1)
  expect(dataComponents(b)).toEqual(components(value))
}

/** testHdStBufferSource.cpp:60-104 */
function BasicDoubleTest(dbl: Kind, flt: Kind, numComponents: number): void {
  const vDbl = scalarValue(dbl, 1)
  const vFlt = scalarValue(flt, 1)
  {
    const b = new HdVtBufferSource(HdTokens.points, vDbl, 1, true)
    expect(TupleTypeEquals(b.getTupleType(), HdGetValueTupleType(vDbl))).toBe(true)
    expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
    expect(HdDataSizeOfTupleType(b.getTupleType())).toBe(dbl.size)
    expect(b.getNumElements()).toBe(1)
    expect(dataComponents(b)).toEqual(components(dbl.make(1)))
  }
  {
    const b = new HdVtBufferSource(HdTokens.points, vDbl, 1, false)
    expect(TupleTypeEquals(b.getTupleType(), HdGetValueTupleType(vFlt))).toBe(true)
    expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
    expect(HdDataSizeOfTupleType(b.getTupleType())).toBe(flt.size)
    expect(b.getNumElements()).toBe(1)
    expect(dataComponents(b)).toEqual(components(flt.make(1)))
  }
}

/** testHdStBufferSource.cpp:106-156 */
function BasicArrayTest(kind: Kind, length: number, numComponents: number): void {
  const [v, elems] = arrayValue(kind, length)
  const expected = elems.flatMap(components)
  {
    const b = new HdVtBufferSource(HdTokens.points, v)
    expect(b.getTupleType().type).toBe(HdGetValueTupleType(v).type)
    expect(b.getTupleType().count).toBe(1)
    expect(b.getNumElements()).toBe(length)
    expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
    expect(HdDataSizeOfType(b.getTupleType().type)).toBe(kind.size)
    expect(dataComponents(b)).toEqual(expected)
  }
  {
    const b = new HdVtBufferSource(HdTokens.points, v, length)
    expect(TupleTypeEquals(b.getTupleType(), HdGetValueTupleType(v))).toBe(true)
    expect(b.getNumElements()).toBe(1)
    expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
    expect(HdDataSizeOfType(b.getTupleType().type)).toBe(kind.size)
    expect(dataComponents(b)).toEqual(expected)
  }
}

/** testHdStBufferSource.cpp:158-258 */
function BasicDoubleArrayTest(dbl: Kind, flt: Kind, length: number, numComponents: number): void {
  const [vDbl, dElems] = arrayValue(dbl, length)
  const [vFlt, fElems] = arrayValue(flt, length)
  for (const arraySize of [1, length]) {
    {
      const b = new HdVtBufferSource(HdTokens.points, vDbl, arraySize, true)
      if (arraySize === 1) {
        expect(b.getTupleType().type).toBe(HdGetValueTupleType(vDbl).type)
        expect(b.getTupleType().count).toBe(1)
        expect(b.getNumElements()).toBe(length)
      } else {
        expect(TupleTypeEquals(b.getTupleType(), HdGetValueTupleType(vDbl))).toBe(true)
        expect(b.getNumElements()).toBe(1)
      }
      expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
      expect(HdDataSizeOfType(b.getTupleType().type)).toBe(dbl.size)
      expect(dataComponents(b)).toEqual(dElems.flatMap(components))
    }
    {
      const b = new HdVtBufferSource(HdTokens.points, vDbl, arraySize, false)
      if (arraySize === 1) {
        expect(b.getTupleType().type).toBe(HdGetValueTupleType(vFlt).type)
        expect(b.getTupleType().count).toBe(1)
        expect(b.getNumElements()).toBe(length)
      } else {
        expect(TupleTypeEquals(b.getTupleType(), HdGetValueTupleType(vFlt))).toBe(true)
        expect(b.getNumElements()).toBe(1)
      }
      expect(HdGetComponentCount(b.getTupleType().type)).toBe(numComponents)
      expect(HdDataSizeOfType(b.getTupleType().type)).toBe(flt.size)
      expect(dataComponents(b)).toEqual(fElems.flatMap(components))
    }
  }
}

describe('testHdStBufferSource', () => {
  let mark: TfErrorMark
  const begin = () => { mark = new TfErrorMark(); mark.setMark() }
  const clean = () => { expect(mark.isClean()).toBe(true); mark.clear() }

  it('non-array (testHdStBufferSource.cpp:313-321)', () => {
    begin()
    BasicTest(kinds.GfVec2f, 2)
    BasicTest(kinds.GfVec3f, 3)
    BasicTest(kinds.GfVec4f, 4)
    BasicDoubleTest(kinds.GfVec2d, kinds.GfVec2f, 2)
    BasicDoubleTest(kinds.GfVec3d, kinds.GfVec3f, 3)
    BasicDoubleTest(kinds.GfVec4d, kinds.GfVec4f, 4)
    BasicTest(kinds.GfMatrix4f, 16)
    BasicDoubleTest(kinds.GfMatrix4d, kinds.GfMatrix4f, 16)
    clean()
  })

  it('array (testHdStBufferSource.cpp:323-338)', () => {
    begin()
    BasicArrayTest(kinds.int, 10, 1)
    BasicArrayTest(kinds.float, 10, 1)
    BasicDoubleArrayTest(kinds.double, kinds.float, 10, 1)
    BasicArrayTest(kinds.GfVec2i, 10, 2)
    BasicArrayTest(kinds.GfVec3i, 10, 3)
    BasicArrayTest(kinds.GfVec4i, 10, 4)
    BasicArrayTest(kinds.GfVec2f, 10, 2)
    BasicArrayTest(kinds.GfVec3f, 10, 3)
    BasicArrayTest(kinds.GfVec4f, 10, 4)
    BasicDoubleArrayTest(kinds.GfVec2d, kinds.GfVec2f, 10, 2)
    BasicDoubleArrayTest(kinds.GfVec3d, kinds.GfVec3f, 10, 3)
    BasicDoubleArrayTest(kinds.GfVec4d, kinds.GfVec4f, 10, 4)
    BasicArrayTest(kinds.GfMatrix4f, 10, 16)
    BasicDoubleArrayTest(kinds.GfMatrix4d, kinds.GfMatrix4f, 10, 16)
    clean()
  })

  it('double to float matrix type conversion (testHdStBufferSource.cpp:260-302, 340-342)', () => {
    begin()
    {
      // MatrixTest<GfMatrix4d>
      const b = new HdVtBufferSource(HdTokens.points, new GfMatrix4d(1))
      expect(b.getTupleType().type).toBe(HdType.HdTypeFloatMat4)
      expect(HdGetComponentCount(b.getTupleType().type)).toBe(16)
      expect(HdGetComponentType(b.getTupleType().type)).toBe(HdType.HdTypeFloat)
      expect(HdDataSizeOfTupleType(b.getTupleType())).toBe(64)
      expect(b.getNumElements()).toBe(1)
    }
    {
      // MatrixArrayTest<GfMatrix4d>(10)
      const elems = Array.from({ length: 10 }, (_, i) => new GfMatrix4d(i))
      const b = new HdVtBufferSource(HdTokens.points,
        new VtArray<GfMatrix4d>(elems, VtValueTypes.GfMatrix4d))
      expect(b.getTupleType().type).toBe(HdType.HdTypeFloatMat4)
      expect(HdGetComponentCount(b.getTupleType().type)).toBe(16)
      expect(HdGetComponentType(b.getTupleType().type)).toBe(HdType.HdTypeFloat)
      expect(HdDataSizeOfType(b.getTupleType().type)).toBe(64)
      expect(HdDataSizeOfTupleType(b.getTupleType())).toBe(64)
      expect(b.getNumElements()).toBe(10)
    }
    clean()
  })
})
