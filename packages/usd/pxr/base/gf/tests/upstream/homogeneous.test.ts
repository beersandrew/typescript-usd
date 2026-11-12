// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfHomogeneous.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfHomogeneous.py.
//
// One describe() per upstream test method, every assert mirrored. Exercises
// GfGetHomogenized, GfHomogeneousCross and GfProject for both the double and
// float vec4 variants. Every expected value is captured from the OpenUSD
// 26.11.1 build (FIXTURES.md) into fixtures/homogeneous.json —
// never hand-derived (AGENTS.md numeric-fixture rule).
import { describe, it, expect } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import { GfVec3d, GfVec3f, GfVec4d, GfVec4f } from '../../src/vec.ts'
import {
  GfGetHomogenized,
  GfHomogeneousCross,
  GfProject,
} from '../../src/homogeneous.ts'

type V = number[]
const G = readOracleFixture<{
  getHomogenized: Record<'f_2462' | 'f_1230' | 'd_2462' | 'd_1230', V>
  getHomogenizedCross: Record<'f_result' | 'f_expected' | 'd_result' | 'd_expected', V>
  project: Record<'d_2462' | 'd_2460' | 'f_2462' | 'f_2460', V>
}>(new URL('./fixtures/homogeneous.json', import.meta.url))

// Gf.IsClose analogue: |v1 - v2|^2 <= tolerance^2 (componentwise).
function isClose(
  a: readonly number[],
  b: readonly number[],
  tolerance: number,
): boolean {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tolerance * tolerance
}

describe('test_GetHomogenized', () => {
  it('homogenizes Vec4f (w divided out; w==0 -> 1)', () => {
    expect(GfGetHomogenized(new GfVec4f(2, 4, 6, 2)).data).toEqual(
      G.getHomogenized.f_2462,
    )
    expect(GfGetHomogenized(new GfVec4f(1, 2, 3, 0)).data).toEqual(
      G.getHomogenized.f_1230,
    )
  })

  it('homogenizes Vec4d (w divided out; w==0 -> 1)', () => {
    expect(GfGetHomogenized(new GfVec4d(2, 4, 6, 2)).data).toEqual(
      G.getHomogenized.d_2462,
    )
    expect(GfGetHomogenized(new GfVec4d(1, 2, 3, 0)).data).toEqual(
      G.getHomogenized.d_1230,
    )
  })
})

describe('test_GetHomogenizedCross', () => {
  it('Vec4f: cross of homogenized xyz matches v3 ^ v4', () => {
    const r = GfHomogeneousCross(new GfVec4f(3, 1, 4, 1), new GfVec4f(5, 9, 2, 6))
    const result = new GfVec3f(r.get(0), r.get(1), r.get(2))
    const v3 = new GfVec3f(3, 1, 4)
    const v4 = new GfVec3f(5 / 6, 9 / 6, 2 / 6)
    const expected = v3.Cross(v4)
    expect(isClose(result.data, expected.data, 0.00001)).toBe(true)
    expect(isClose(result.data, G.getHomogenizedCross.f_result, 0.00001)).toBe(true)
    expect(isClose(expected.data, G.getHomogenizedCross.f_expected, 0.00001)).toBe(true)
  })

  it('Vec4d: cross of homogenized xyz matches v3 ^ v4', () => {
    const r = GfHomogeneousCross(new GfVec4d(3, 1, 4, 1), new GfVec4d(5, 9, 2, 6))
    const result = new GfVec3d(r.get(0), r.get(1), r.get(2))
    const v3 = new GfVec3d(3, 1, 4)
    const v4 = new GfVec3d(5 / 6, 9 / 6, 2 / 6)
    const expected = v3.Cross(v4)
    expect(isClose(result.data, expected.data, 0.00001)).toBe(true)
    expect(isClose(result.data, G.getHomogenizedCross.d_result, 0.00001)).toBe(true)
    expect(isClose(expected.data, G.getHomogenizedCross.d_expected, 0.00001)).toBe(true)
  })
})

describe('test_Project', () => {
  it('projects Vec4d into Euclidean space (w==0 -> identity divide)', () => {
    expect(GfProject(new GfVec4d(2, 4, 6, 2)).data).toEqual(
      G.project.d_2462,
    )
    expect(GfProject(new GfVec4d(2, 4, 6, 0)).data).toEqual(
      G.project.d_2460,
    )
  })

  it('projects Vec4f into Euclidean space (w==0 -> identity divide)', () => {
    expect(GfProject(new GfVec4f(2, 4, 6, 2)).data).toEqual(
      G.project.f_2462,
    )
    expect(GfProject(new GfVec4f(2, 4, 6, 0)).data).toEqual(
      G.project.f_2460,
    )
  })
})
