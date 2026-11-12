// Ported from OpenUSD 26.11.1: pxr/base/vt/testenv/testVtCpp.cpp,
//  pxr/base/vt/testenv/testVtValue.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported/adapted from pxr/base/vt/testenv/testVtCpp.cpp (testVtCpp, VtValue
// portion) and testVtValue.py (testVtValue, non-binding observables).
//
// Adaptation: upstream infers the held type from the C++ static type
// (VtValue(1.25) -> double). TS cannot infer USD type from a JS value, so the
// type is supplied explicitly (VtValue.Create(1.25, VtValueTypes.double)). The
// hold/extract/type/array and registered numeric-cast assertions port directly.
import { describe, it, expect } from 'vitest'
import { Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes } from '../../src/index.ts'

describe('VtValue', () => {
  it('value-copies held arrays at construction', () => {
    const source = new VtArray([1, 2], VtValueTypes.int)
    const value = VtValue.createArray(source)
    source.set(0, 9)
    expect(value.Get<VtArray<number>>().toArray()).toEqual([1, 2])
  })

  it('empty value', () => {
    const v = VtValue.getEmpty()
    expect(v.IsEmpty()).toBe(true)
    expect(v.getType().isUnknown()).toBe(true)
    expect(v.isArrayValued()).toBe(false)
    expect(v.getWithDefault(42)).toBe(42)
  })

  it('holds a scalar with its USD type and extracts it', () => {
    const v = VtValue.create(1.25, VtValueTypes.double)
    expect(v.IsEmpty()).toBe(false)
    expect(v.IsHolding(VtValueTypes.double)).toBe(true)
    expect(v.Get<number>()).toBe(1.25)
    expect(v.getTypeName()).toBe('double')
    expect(v.isArrayValued()).toBe(false)
  })

  it('distinguishes USD types the JS runtime erases (float vs double vs int)', () => {
    // All three hold the JS number 2, but their USD identity differs.
    const d = VtValue.create(2, VtValueTypes.double)
    const f = VtValue.create(2, VtValueTypes.float)
    const i = VtValue.create(2, VtValueTypes.int)
    expect(d.IsHolding(VtValueTypes.double)).toBe(true)
    expect(d.IsHolding(VtValueTypes.float)).toBe(false)
    expect(f.IsHolding(VtValueTypes.float)).toBe(true)
    expect(i.IsHolding(VtValueTypes.int)).toBe(true)
    expect(i.IsHolding(VtValueTypes.double)).toBe(false)
    expect(d.equals(f)).toBe(false) // same JS value, different type
  })

  it('array-valued', () => {
    const arr = new VtArray<number>([1, 2, 3], VtValueTypes.int)
    const v = VtValue.createArray(arr)
    expect(v.isArrayValued()).toBe(true)
    expect(v.getArraySize()).toBe(3)
    expect(v.getElementType()).toBe(VtValueTypes.int)
    expect(v.getTypeName()).toBe('int[]')
    expect(v.Get<VtArray<number>>().get(1)).toBe(2)
    // a scalar int is NOT holding the int[] array type
    expect(VtValue.create(2, VtValueTypes.int).isArrayValued()).toBe(false)
  })

  it('Swap exchanges contents', () => {
    const a = VtValue.create('hi', VtValueTypes.string)
    const b = VtValue.create(7, VtValueTypes.int)
    a.swap(b)
    expect(a.IsHolding(VtValueTypes.int)).toBe(true)
    expect(a.Get<number>()).toBe(7)
    expect(b.IsHolding(VtValueTypes.string)).toBe(true)
    expect(b.Get<string>()).toBe('hi')
  })

  it('equals: same type + value', () => {
    expect(VtValue.create(1.5, VtValueTypes.double)
      .equals(VtValue.create(1.5, VtValueTypes.double))).toBe(true)
    const arr1 = VtValue.createArray(new VtArray([1, 2], VtValueTypes.int))
    const arr2 = VtValue.createArray(new VtArray([1, 2], VtValueTypes.int))
    expect(arr1.equals(arr2)).toBe(true)
  })

  it('registered numeric casts preserve type identity and reject overflow', () => {
    const d = VtValue.create(3.75, VtValueTypes.double)
    const i = d.castToType(VtValueTypes.int)
    expect(i.IsHolding(VtValueTypes.int)).toBe(true)
    expect(i.Get<number>()).toBe(3)
    expect(d.castToType(VtValueTypes.float).Get<number>()).toBe(Math.fround(3.75))
    expect(VtValue.create(-1, VtValueTypes.int)
      .castToType(VtValueTypes.uint).IsEmpty()).toBe(true)
    expect(VtValue.create(Infinity, VtValueTypes.double)
      .castToType(VtValueTypes.int).IsEmpty()).toBe(true)
    expect(VtValue.castToTypeOf(
      VtValue.create(3, VtValueTypes.int),
      VtValue.create(0, VtValueTypes.double),
    ).Get<number>()).toBe(3)
  })

  it('token/string registered cast retains the value and changes the tag', () => {
    const token = VtValue.create('hello', VtValueTypes.token)
    const string = token.castToType(VtValueTypes.string)
    expect(string.Get<string>()).toBe('hello')
    expect(string.IsHolding(VtValueTypes.string)).toBe(true)
  })
})
