// Ported from OpenUSD 26.11.1: pxr/base/vt/testenv/testVtArray.py,
//  pxr/base/vt/testenv/testVtCpp.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the applicable value-semantics and container operations registered by
// pxr/base/vt/testenv/testVtArray.py (testVtArray) and testVtCpp.cpp
// (testVtCpp). Python buffer/numpy/operator bindings and C++ capacity,
// allocator, iterator-address, refcount, and foreign-source mechanics are
// substrate-only. Copy-on-write identity and detachment are public behavior.

import { describe, expect, it } from 'vitest'
import { Array as VtArray, ValueTypes as VtValueTypes } from '../../src/index.ts'

describe('testVtArray', () => {
  it('constructs, sizes, indexes, slices, and formats', () => {
    const empty = new VtArray<number>([], VtValueTypes.double)
    expect(empty.empty()).toBe(true)
    expect(empty.toString()).toBe('[]')
    const values = VtArray.ofSize(4, VtValueTypes.double)
    for (let i = 0; i < values.size; i++) values.set(i, i)
    expect(values.get(-1)).toBe(3)
    expect(values.slice(undefined, undefined).equals([0, 1, 2, 3])).toBe(true)
    expect(() => values.get(-5)).toThrow(RangeError)
    expect(() => values.set(4, 1)).toThrow(RangeError)
  })

  it('copy construction shares until the first mutable access detaches', () => {
    const source = new VtArray([1, 2, 3, 4], VtValueTypes.int)
    const copy = new VtArray(source)
    expect(source.isIdentical(copy)).toBe(true)
    source.set(0, 9)
    expect(source.isIdentical(copy)).toBe(false)
    source.resize(3)
    expect(source.equals([9, 2, 3])).toBe(true)
    expect(copy.equals([1, 2, 3, 4])).toBe(true)
    copy.push_back(5)
    expect(source.equals([9, 2, 3])).toBe(true)
  })

  it('copy construction value-copies mutable element value types', () => {
    class Element {
      value: number
      constructor(source: Element | number) {
        this.value = source instanceof Element ? source.value : source
      }
    }
    // Element is not a numeric type, so the array holds element objects.
    const source = new VtArray([new Element(1)], VtValueTypes.dictionary)
    const copy = new VtArray(source)
    source.get(0).value = 9
    expect(copy.get(0).value).toBe(1)
  })

  it('resizes, inserts, erases, assigns, and uses front/back operations', () => {
    const values = new VtArray([9, 3, -9], VtValueTypes.int)
    values.insert(2, 7, 4)
    expect(values.equals([9, 3, 7, 7, 7, 7, -9])).toBe(true)
    values.insert(3, [1, 2, 3, 4])
    expect(values.erase(2, 4)).toBe(2)
    expect(values.equals([9, 3, 2, 3, 4, 7, 7, 7, -9])).toBe(true)
    expect(values.front()).toBe(9)
    expect(values.back()).toBe(-9)
    expect(values.pop_back()).toBe(-9)
    values.assign([1, 2, 3])
    values.resize(5, 8)
    expect(values.equals([1, 2, 3, 8, 8])).toBe(true)
    values.clear()
    expect(values.empty()).toBe(true)
  })

  it('iterator and toArray boundaries do not leak mutable backing storage', () => {
    const values = new VtArray([1, 2, 3], VtValueTypes.int)
    expect([...values]).toEqual([1, 2, 3])
    const plain = values.toArray()
    plain[0] = 99
    expect(values.get(0)).toBe(1)
  })
})
