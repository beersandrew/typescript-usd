// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfGamma.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfGamma.py.
//
// One describe() per upstream test method, every assert mirrored. This file is
// the CONFORMANCE oracle for the "Gamma" capability. Every numeric expectation
// is captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/gamma.json — never hand-derived (AGENTS.md numeric-fixture rule).
//
// NOTE on half precision: upstream tests Gf.Vec3h / Gf.Vec4h alongside the f/d
// variants. GfVec*h is the documented precision-twin exclusion (typescript-usd memory
// gf-math-classification) and is not implemented in src/vec.ts, so those cases
// are covered by their f/d siblings here rather than ported verbatim. This is
// not a silent skip: it is the same exclusion every gf suite makes.
import { describe, it, expect } from 'vitest'
import { GfVec3d, GfVec3f, GfVec4d, GfVec4f } from '../../src/vec.ts'
import {
  GfApplyGamma,
  GfGetDisplayGamma,
  GfConvertDisplayToLinear,
  GfConvertLinearToDisplay,
} from '../../src/gamma.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// Captured from the OpenUSD 26.11.1 build (FIXTURES.md).
interface GammaFixture {
  displayGamma: number
  [key: string]: number | number[]
}
const G = readOracleFixture<GammaFixture>(new URL('./fixtures/gamma.json', import.meta.url))

describe('test_DifferentVecs', () => {
  // Gamma converting vecs of different types and sizes.
  it('Gf.ApplyGamma(Gf.Vec3f(1,2,3), 2.0) == Gf.Vec3f(1,4,9)', () => {
    expect(GfApplyGamma(new GfVec3f(1, 2, 3), 2.0).equals(new GfVec3f(1, 4, 9))).toBe(true)
    expect([...GfApplyGamma(new GfVec3f(1, 2, 3), 2.0).data]).toEqual(G.applyGamma_vec3f_1_2_3_g2)
  })

  it('Gf.ApplyGamma(Gf.Vec3d(1,2,3), 2.0) == Gf.Vec3d(1,4,9)', () => {
    expect(GfApplyGamma(new GfVec3d(1, 2, 3), 2.0).equals(new GfVec3d(1, 4, 9))).toBe(true)
    expect([...GfApplyGamma(new GfVec3d(1, 2, 3), 2.0).data]).toEqual(G.applyGamma_vec3d_1_2_3_g2)
  })

  it('Gf.ApplyGamma(Gf.Vec4f(1,2,3,4), 2.0) == Gf.Vec4f(1,4,9,4) (alpha unchanged)', () => {
    expect(GfApplyGamma(new GfVec4f(1, 2, 3, 4), 2.0).equals(new GfVec4f(1, 4, 9, 4))).toBe(true)
    expect([...GfApplyGamma(new GfVec4f(1, 2, 3, 4), 2.0).data]).toEqual(G.applyGamma_vec4f_1_2_3_4_g2)
  })

  it('Gf.ApplyGamma(Gf.Vec4d(1,2,3,4), 2.0) == Gf.Vec4d(1,4,9,4) (alpha unchanged)', () => {
    expect(GfApplyGamma(new GfVec4d(1, 2, 3, 4), 2.0).equals(new GfVec4d(1, 4, 9, 4))).toBe(true)
    expect([...GfApplyGamma(new GfVec4d(1, 2, 3, 4), 2.0).data]).toEqual(G.applyGamma_vec4d_1_2_3_4_g2)
  })
})

describe('test_DisplayGamma', () => {
  it('GfGetDisplayGamma() == 2.2', () => {
    expect(GfGetDisplayGamma()).toBe(G.displayGamma)
  })

  // ConvertDisplayToLinear == ApplyGamma(v, 2.2)
  it('ApplyGamma(Vec3f, 2.2) == ConvertDisplayToLinear(Vec3f)', () => {
    const a = GfApplyGamma(new GfVec3f(0.5, 0.5, 0.5), 2.2)
    const b = GfConvertDisplayToLinear(new GfVec3f(0.5, 0.5, 0.5))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec3f_half_g22)
  })

  it('ApplyGamma(Vec3d, 2.2) == ConvertDisplayToLinear(Vec3d)', () => {
    const a = GfApplyGamma(new GfVec3d(0.5, 0.5, 0.5), 2.2)
    const b = GfConvertDisplayToLinear(new GfVec3d(0.5, 0.5, 0.5))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec3d_half_g22)
  })

  it('ApplyGamma(Vec4f, 2.2) == ConvertDisplayToLinear(Vec4f) (alpha unchanged)', () => {
    const a = GfApplyGamma(new GfVec4f(0.5, 0.5, 0.5, 0.8), 2.2)
    const b = GfConvertDisplayToLinear(new GfVec4f(0.5, 0.5, 0.5, 0.8))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec4f_half_g22)
  })

  it('ApplyGamma(Vec4d, 2.2) == ConvertDisplayToLinear(Vec4d) (alpha unchanged)', () => {
    const a = GfApplyGamma(new GfVec4d(0.5, 0.5, 0.5, 0.8), 2.2)
    const b = GfConvertDisplayToLinear(new GfVec4d(0.5, 0.5, 0.5, 0.8))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec4d_half_g22)
  })

  // ConvertLinearToDisplay == ApplyGamma(v, 1.0/2.2)
  it('ApplyGamma(Vec3f, 1/2.2) == ConvertLinearToDisplay(Vec3f)', () => {
    const a = GfApplyGamma(new GfVec3f(0.5, 0.5, 0.5), 1.0 / 2.2)
    const b = GfConvertLinearToDisplay(new GfVec3f(0.5, 0.5, 0.5))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec3f_half_ginv)
  })

  it('ApplyGamma(Vec3d, 1/2.2) == ConvertLinearToDisplay(Vec3d)', () => {
    const a = GfApplyGamma(new GfVec3d(0.5, 0.5, 0.5), 1.0 / 2.2)
    const b = GfConvertLinearToDisplay(new GfVec3d(0.5, 0.5, 0.5))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec3d_half_ginv)
  })

  it('ApplyGamma(Vec4f, 1/2.2) == ConvertLinearToDisplay(Vec4f) (alpha unchanged)', () => {
    const a = GfApplyGamma(new GfVec4f(0.5, 0.5, 0.5, 0.8), 1.0 / 2.2)
    const b = GfConvertLinearToDisplay(new GfVec4f(0.5, 0.5, 0.5, 0.8))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec4f_half_ginv)
  })

  it('ApplyGamma(Vec4d, 1/2.2) == ConvertLinearToDisplay(Vec4d) (alpha unchanged)', () => {
    const a = GfApplyGamma(new GfVec4d(0.5, 0.5, 0.5, 0.8), 1.0 / 2.2)
    const b = GfConvertLinearToDisplay(new GfVec4d(0.5, 0.5, 0.5, 0.8))
    expect(a.equals(b)).toBe(true)
    expect([...a.data]).toEqual(G.applyGamma_vec4d_half_ginv)
  })
})
