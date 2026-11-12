// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSkel/testenv/testUsdSkelAnimMapper.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelAnimMapper.py
// (registered as testUsdSkelAnimMapper).
//
// API mapping: UsdSkel.AnimMapper(Vt.TokenArray, Vt.TokenArray) is
// new AnimMapper(string[], string[]); the Python Remap is the VtValue
// overload, which here is remap() on VtArray arguments. A failed VtValue
// remap (Tf.ErrorException in Python) posts a coding error and returns
// undefined.
import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { Array as VtArray, ValueTypes } from 'typescript-usd/vt'
import { AnimMapper } from '../../src/index.ts'

const IntArray = (values: number[] = []) => new VtArray<number>(values, ValueTypes.int)
const FloatArray = (values: number[] = []) => new VtArray<number>(values, ValueTypes.float)
const Vec3fArray = (values: unknown[] = []) => new VtArray<unknown>(values, ValueTypes.GfVec3f)

function MakeMapper(fromOrder: string, toOrder: string): AnimMapper {
  return new AnimMapper([...fromOrder], [...toOrder])
}

function expectArray(actual: VtArray<number> | undefined, expected: VtArray<number>): void {
  expect(actual).toBeDefined()
  expect(actual!.toArray()).toEqual(expected.toArray())
}

describe('TestUsdSkelAnimMapper', () => {
  function TestRemapping(fromOrder: string, toOrder: string, args: {
    expect: VtArray<number>, srcData: VtArray<number>, trgData?: VtArray<number>,
    elementSize?: number, defaultValue?: number,
  }): void {
    const mapper = MakeMapper(fromOrder, toOrder)
    expectArray(mapper.remap(args.srcData, args.trgData ?? null,
      args.elementSize ?? 1, args.defaultValue), args.expect)
    expect(mapper.size).toBe(toOrder.length)
  }

  // Test mapping when either the source or dest order is empty.
  it('test_EmptyArrays', () => {
    const source = IntArray([1, 2, 3])
    const target = IntArray([4, 5, 6])

    let mapper = MakeMapper('ABC', '')
    expect(mapper.isIdentity()).toBe(false)
    expect(mapper.isNull()).toBe(true)

    expectArray(mapper.remap(source), IntArray())
    expectArray(mapper.remap(source, target), IntArray())

    mapper = MakeMapper('', 'ABC')
    expect(mapper.isIdentity()).toBe(false)
    expect(mapper.isNull()).toBe(true)

    expectArray(mapper.remap(source), IntArray([0, 0, 0]))
    expectArray(mapper.remap(source, null, 2), IntArray([0, 0, 0, 0, 0, 0]))
    expectArray(mapper.remap(source, target), target)
    expectArray(mapper.remap(source, target, 2), IntArray([4, 5, 6, 0, 0, 0]))

    expectArray(mapper.remap(source, IntArray([1, 2, 3, 4])), IntArray([1, 2, 3]))
  })

  it('test_Remapping', () => {
    // Identity
    TestRemapping('ABC', 'ABC', {
      srcData: IntArray([1, 2, 3]),
      expect: IntArray([1, 2, 3]) })
    TestRemapping('ABC', 'ABC', {
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      expect: IntArray([10, 11, 20, 21, 30, 31]),
      elementSize: 2 })

    // Offset, output uninitialized
    TestRemapping('ABC', 'DEABC', {
      srcData: IntArray([1, 2, 3]),
      expect: IntArray([0, 0, 1, 2, 3]) })
    TestRemapping('ABC', 'DEABC', {
      defaultValue: 7,
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      expect: IntArray([7, 7, 7, 7, 10, 11, 20, 21, 30, 31]),
      elementSize: 2 })
    TestRemapping('ABC', 'DEABC', {
      srcData: IntArray(),
      expect: IntArray([0, 0, 0, 0, 0]) })

    // Offset, output initialized
    TestRemapping('ABC', 'DEABC', {
      srcData: IntArray([1, 2, 3]),
      trgData: IntArray([4, 5, 6, 7, 8]),
      expect: IntArray([4, 5, 1, 2, 3]) })
    TestRemapping('ABC', 'DEABC', {
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      trgData: IntArray([40, 41, 50, 51, 60, 61, 70, 71, 80, 81]),
      expect: IntArray([40, 41, 50, 51, 10, 11, 20, 21, 30, 31]),
      elementSize: 2 })
    TestRemapping('ABC', 'DEABC', {
      srcData: IntArray(),
      trgData: IntArray([4, 5, 6, 7, 8]),
      expect: IntArray([4, 5, 6, 7, 8]) })

    // Offset, with some elements missing
    TestRemapping('ABC', 'DEAB', {
      srcData: IntArray([1, 2, 3]),
      expect: IntArray([0, 0, 1, 2]) })
    TestRemapping('ABC', 'DEAB', {
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      expect: IntArray([0, 0, 0, 0, 10, 11, 20, 21]),
      elementSize: 2 })

    // Indexed. Same case as above, but last elem is misordered
    // (so this should not be treated as an offset mapping)
    TestRemapping('ABC', 'CDEAB', {
      srcData: IntArray([1, 2, 3]),
      expect: IntArray([3, 0, 0, 1, 2]) })
    TestRemapping('ABC', 'CDEAB', {
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      expect: IntArray([30, 31, 0, 0, 0, 0, 10, 11, 20, 21]),
      elementSize: 2 })

    // Indexed, output uninitialized
    TestRemapping('ABC', 'CDAEB', {
      srcData: IntArray([1, 2, 3]),
      expect: IntArray([3, 0, 1, 0, 2]) })
    TestRemapping('ABC', 'CDAEB', {
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      expect: IntArray([30, 31, 0, 0, 10, 11, 0, 0, 20, 21]),
      elementSize: 2 })

    // Indexed, output initialized
    TestRemapping('ABC', 'CDAEB', {
      srcData: IntArray([1, 2, 3]),
      trgData: IntArray([4, 5, 6, 7, 8]),
      expect: IntArray([3, 5, 1, 7, 2]) })
    TestRemapping('ABC', 'CDAEB', {
      srcData: IntArray([10, 11, 20, 21, 30, 31]),
      trgData: IntArray([40, 41, 50, 51, 60, 61, 70, 71, 80, 81]),
      expect: IntArray([30, 31, 50, 51, 10, 11, 70, 71, 20, 21]),
      elementSize: 2 })
  })

  // Test remapping on an identity map.
  it('test_IdentityRemapping', () => {
    const mapper = MakeMapper('ABC', 'ABC')
    expect(mapper.isIdentity()).toBe(true)

    const source = IntArray([1, 2, 3])
    expectArray(mapper.remap(source), source)

    expect(MakeMapper('ABC', 'DABC').isIdentity()).toBe(false)
    expect(MakeMapper('ABC', 'AB').isIdentity()).toBe(false)
  })

  // Test remapping scenarios that should throw errors.
  it('test_Errors', () => {
    const mapper = MakeMapper('ABC', 'BCD')

    const raises = (fn: () => unknown): boolean => {
      const mark = new TfErrorMark()
      try {
        const result = fn()
        const posted = !mark.isClean()
        mark.clear()
        return posted && result === undefined
      } finally {
        mark.dispose()
      }
    }

    expect(raises(() => mapper.remap<number>(IntArray(), FloatArray()))).toBe(true)

    expect(raises(() => mapper.remap<unknown>(Vec3fArray(), null, 1, 1.0))).toBe(true)
  })
})
