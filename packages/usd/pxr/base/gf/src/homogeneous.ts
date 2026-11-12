// Ported from OpenUSD 26.11.1: pxr/base/gf/homogeneous.cpp,
//  pxr/base/gf/homogeneous.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — homogeneous-vector utility free functions.
//
// Mirrors OpenUSD pxr/base/gf/homogeneous.{h,cpp} 1:1: GfGetHomogenized,
// GfHomogeneousCross, and GfProject for the GfVec4f / GfVec4d homogeneous
// types. Operation order is ported verbatim from homogeneous.cpp so float
// rounding matches the Pixar oracle (no FAITHFULNESS-DEBT).
//
// C++ overloads on GfVec4f / GfVec4d are expressed here as a single function
// each that dispatches on the runtime vec type, so the 'f' (Math.fround) vs
// 'd' precision of the input is preserved through to the result.

import { GfVec3d, GfVec3f, GfVec4d, GfVec4f } from './vec.ts'

/**
 * Returns a vector which is `v` homogenized. If the fourth element of `v`
 * is 0, it is set to 1. Mirrors GfGetHomogenized (homogeneous.cpp):
 *   ret = v; if (ret[3] == 0) ret[3] = 1; ret /= ret[3]; return ret;
 */
export function GfGetHomogenized(v: GfVec4f): GfVec4f
export function GfGetHomogenized(v: GfVec4d): GfVec4d
export function GfGetHomogenized(v: GfVec4f | GfVec4d): GfVec4f | GfVec4d {
  // GfVec4{f,d} ret(v): copy (constructor rounds to the source scalar kind).
  const ret = v instanceof GfVec4f ? new GfVec4f(v) : new GfVec4d(v)
  if (ret.get(3) === 0) ret.setComponent(3, 1)
  ret.divideInPlace(ret.get(3))
  return ret
}

/**
 * Homogenizes `a` and `b` and then performs the cross product on the first
 * three elements of each. Returns the cross product as a homogenized vector.
 * Mirrors GfHomogeneousCross (homogeneous.cpp).
 */
export function GfHomogeneousCross(a: GfVec4f, b: GfVec4f): GfVec4f
export function GfHomogeneousCross(a: GfVec4d, b: GfVec4d): GfVec4d
export function GfHomogeneousCross(
  a: GfVec4f | GfVec4d,
  b: GfVec4f | GfVec4d,
): GfVec4f | GfVec4d {
  if (a instanceof GfVec4f) {
    const ah = GfGetHomogenized(a)
    const bh = GfGetHomogenized(b as GfVec4f)
    const prod = new GfVec3f(ah.get(0), ah.get(1), ah.get(2)).Cross(
      new GfVec3f(bh.get(0), bh.get(1), bh.get(2)),
    )
    return new GfVec4f(prod.get(0), prod.get(1), prod.get(2), 1)
  }
  const ah = GfGetHomogenized(a)
  const bh = GfGetHomogenized(b as GfVec4d)
  const prod = new GfVec3d(ah.get(0), ah.get(1), ah.get(2)).Cross(
    new GfVec3d(bh.get(0), bh.get(1), bh.get(2)),
  )
  return new GfVec4d(prod.get(0), prod.get(1), prod.get(2), 1)
}

/**
 * Projects homogeneous `v` into Euclidean space and returns the result as a
 * Vec3f / Vec3d. Mirrors the inline GfProject overloads (homogeneous.h):
 *   inv = (v[3] != 0) ? 1/v[3] : 1; return Vec3(inv*v[0], inv*v[1], inv*v[2]);
 */
export function GfProject(v: GfVec4f): GfVec3f
export function GfProject(v: GfVec4d): GfVec3d
export function GfProject(v: GfVec4f | GfVec4d): GfVec3f | GfVec3d {
  if (v instanceof GfVec4f) {
    const inv = v.get(3) !== 0 ? Math.fround(1.0 / v.get(3)) : 1.0
    return new GfVec3f(inv * v.get(0), inv * v.get(1), inv * v.get(2))
  }
  const inv = v.get(3) !== 0 ? 1.0 / v.get(3) : 1.0
  return new GfVec3d(inv * v.get(0), inv * v.get(1), inv * v.get(2))
}
