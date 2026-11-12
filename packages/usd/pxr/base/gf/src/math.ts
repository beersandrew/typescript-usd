// Ported from OpenUSD 26.11.1: pxr/base/gf/math.cpp, pxr/base/gf/math.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — assorted scalar/utility math free functions.
//
// Mirrors OpenUSD pxr/base/gf/math.{h,cpp} 1:1 (the free functions in the
// group_gf_BasicMath group). The C++ header overloads many of these on
// float/double (e.g. GfSqrt(double) / GfSqrt(float)); Python's Gf module
// surfaces the float overloads under a trailing `f` name (Sqrt / Sqrtf, ...).
// Since JS has only IEEE-754 doubles, the `*f` variants here reproduce the
// float32 overload faithfully by rounding inputs and the result through
// Math.fround (the same trick vec.ts uses for GfVec*f). The plain variants are
// pure double math, matching std::sqrt/exp/... order verbatim.
//
// Overlap with vec.ts: GfSqr, GfDot, GfCompMult and GfCompDiv also have GfVec
// overloads (defined in vec.ts via vec.h). The versions here cover the scalar
// arithmetic overloads from math.h and delegate to the vec.ts helpers when a
// GfVec is passed, so the math.h surface is complete. The scalar GfIsClose
// overload (math.h, |a-b| < eps) is intentionally NOT re-exported under that
// name to avoid a barrel collision with vec.ts's vector GfIsClose; it is
// available here as GfIsCloseScalar. (FAITHFULNESS note in the report.)

import { GfVec, GfDot as vecDot, GfCompMult as vecCompMult, GfCompDiv as vecCompDiv, type VecLike } from './vec.ts'

// --- Angle conversions (math.h inline) ---

/** GfRadiansToDegrees: radians * (180/pi). */
export function GfRadiansToDegrees(radians: number): number {
  return radians * (180.0 / Math.PI)
}

/** GfDegreesToRadians: degrees * (pi/180). */
export function GfDegreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180.0)
}

// --- Smooth interpolation (math.cpp) ---

/**
 * GfSmoothStep: cubic hermite blend. Returns 0 for val<=min, 1 for val>=max,
 * with optional endpoint slopes. Ported verbatim from GfSmoothStep in math.cpp.
 */
export function GfSmoothStep(
  min: number,
  max: number,
  val: number,
  slope0 = 0.0,
  slope1 = 0.0,
): number {
  if (val >= max) return 1.0
  if (val < min) return 0.0

  const dv = max - min
  const h = (val - min) / (max - min)
  const h2 = h * h
  const h3 = h2 * h

  let v = -2.0 * h3 + 3.0 * h2

  if (slope0 !== 0.0) {
    slope0 /= dv
    v += (h3 - 2 * h2 + h) * slope0
  }
  if (slope1 !== 0.0) {
    slope1 /= dv
    v += (h3 - h2) * slope1
  }
  return v
}

/**
 * GfSmoothRamp: linear ramp with smooth (C1) shoulders of fractional widths
 * w0/w1. Ported verbatim from GfSmoothRamp in math.cpp.
 */
export function GfSmoothRamp(
  tmin: number,
  tmax: number,
  t: number,
  w0: number,
  w1: number,
): number {
  if (t <= tmin) return 0.0
  if (t >= tmax) return 1.0

  const x = (t - tmin) / (tmax - tmin)
  const xr = 2.0 - w0 - w1

  if (x < w0) {
    return (x * x) / (w0 * xr)
  }
  if (x > 1.0 - w1) {
    return 1.0 - ((1.0 - x) * (1.0 - x)) / (w1 * xr)
  }
  return (2.0 * x - w0) / xr
}

// --- Squaring / sign (math.h templates) ---

/**
 * GfSqr: inner product of x with itself, i.e. x*x. Defined for scalars and all
 * GfVec types (for a GfVec this is the dot of the vector with itself).
 */
export function GfSqr(x: number): number
export function GfSqr(x: GfVec): number
export function GfSqr(x: number | GfVec): number {
  if (x instanceof GfVec) return vecDot(x, x)
  return x * x
}

/** GfSgn: signum of v (-1, 0, or 1). */
export function GfSgn(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0
}

// --- Scalar transcendental / rounding (math.h inline) ---

/** GfSqrt(double): std::sqrt(f). */
export function GfSqrt(f: number): number {
  return Math.sqrt(f)
}
/** GfSqrt(float) overload: float32 sqrt. */
export function GfSqrtf(f: number): number {
  return Math.fround(Math.sqrt(Math.fround(f)))
}

/** GfExp(double): std::exp(f). */
export function GfExp(f: number): number {
  return Math.exp(f)
}
/** GfExp(float) overload. */
export function GfExpf(f: number): number {
  return Math.fround(Math.exp(Math.fround(f)))
}

/** GfLog(double): std::log(f). */
export function GfLog(f: number): number {
  return Math.log(f)
}
/** GfLog(float) overload. */
export function GfLogf(f: number): number {
  return Math.fround(Math.log(Math.fround(f)))
}

/** GfFloor(double): std::floor(f). */
export function GfFloor(f: number): number {
  return Math.floor(f)
}
/** GfFloor(float) overload. */
export function GfFloorf(f: number): number {
  return Math.fround(Math.floor(Math.fround(f)))
}

/** GfCeil(double): std::ceil(f). */
export function GfCeil(f: number): number {
  return Math.ceil(f)
}
/** GfCeil(float) overload. */
export function GfCeilf(f: number): number {
  return Math.fround(Math.ceil(Math.fround(f)))
}

/** GfAbs(double): std::fabs(f). */
export function GfAbs(f: number): number {
  return Math.abs(f)
}
/** GfAbs(float) overload. */
export function GfAbsf(f: number): number {
  return Math.fround(Math.abs(Math.fround(f)))
}

/**
 * GfRound(double): std::rint(f) — round to nearest, ties to even (the default
 * IEEE rounding mode rint uses). JS Math.round ties toward +Infinity, so we
 * special-case exact halves to pick the even neighbour.
 */
export function GfRound(f: number): number {
  if (Math.abs(f - Math.trunc(f)) === 0.5) {
    const fl = Math.floor(f)
    return fl % 2 === 0 ? fl : fl + 1
  }
  return Math.round(f)
}
/** GfRound(float) overload. */
export function GfRoundf(f: number): number {
  return Math.fround(GfRound(Math.fround(f)))
}

/** GfPow(double): std::pow(f, p). */
export function GfPow(f: number, p: number): number {
  return Math.pow(f, p)
}
/** GfPow(float) overload. */
export function GfPowf(f: number, p: number): number {
  return Math.fround(Math.pow(Math.fround(f), Math.fround(p)))
}

/** GfSin(double). */
export function GfSin(v: number): number {
  return Math.sin(v)
}
/** GfSin(float) overload. */
export function GfSinf(v: number): number {
  return Math.fround(Math.sin(Math.fround(v)))
}
/** GfCos(double). */
export function GfCos(v: number): number {
  return Math.cos(v)
}
/** GfCos(float) overload. */
export function GfCosf(v: number): number {
  return Math.fround(Math.cos(Math.fround(v)))
}

/** OpenUSD v26.08 pxr/base/gf/math.h:258-261; tuple replaces out-pointers. */
export function GfSinCos(v: number): [sin: number, cos: number] {
  return [Math.sin(v), Math.cos(v)]
}

// --- Clamp / mod (math.h inline + math.cpp) ---

/** GfClamp(double): clamp value to [min, max]. */
export function GfClamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
/** GfClamp(float) overload. */
export function GfClampf(value: number, min: number, max: number): number {
  return Math.fround(
    GfClamp(Math.fround(value), Math.fround(min), Math.fround(max)),
  )
}

/**
 * GfMod(double): fmod with "correct" behaviour for negatives. For a = n*b the
 * result is 0; for positive a it is fmod(a,b); for negative a it is
 * fmod(a,b)+b. JS `%` matches C fmod (sign of dividend). Ported from math.cpp.
 */
export function GfMod(a: number, b: number): number {
  const c = a % b
  if (a < 0) return c ? b + c : 0
  return c
}
/** GfMod(float) overload. */
export function GfModf(a: number, b: number): number {
  const c = Math.fround(Math.fround(a) % Math.fround(b))
  if (a < 0) return Math.fround(c ? Math.fround(b) + c : 0)
  return c
}

// --- Lerp / min / max (math.h templates) ---

/** GfLerp(alpha, a, b): (1-alpha)*a + alpha*b (scalar form). */
export function GfLerp(alpha: number, a: number, b: number): number {
  return (1 - alpha) * a + alpha * b
}

/** GfMin: smallest of 2..N values (variadic). Mirrors the GfMin overloads. */
export function GfMin(a1: number, a2: number, ...rest: number[]): number {
  let m = a1 < a2 ? a1 : a2
  for (const v of rest) m = v < m ? v : m
  return m
}

/** GfMax: largest of 2..N values (variadic). Mirrors the GfMax overloads. */
export function GfMax(a1: number, a2: number, ...rest: number[]): number {
  let m = a1 < a2 ? a2 : a1
  for (const v of rest) m = m < v ? v : m
  return m
}

// --- Inner / component-wise products (math.h templates; scalar overloads) ---

/**
 * GfDot: inner product. For scalars this is the plain product; for GfVec it
 * delegates to the vector dot product (vec.ts). Mirrors math.h GfDot plus the
 * vec.h overload.
 */
export function GfDot(left: number, right: number): number
export function GfDot(left: VecLike, right: VecLike): number
export function GfDot(left: number | VecLike, right: number | VecLike): number {
  if (typeof left === 'number' && typeof right === 'number') return left * right
  return vecDot(left as VecLike, right as VecLike)
}

/**
 * GfCompMult: component-wise multiplication. For scalars the plain product.
 * Mirrors math.h GfCompMult plus the vec.h overload.
 */
export function GfCompMult(left: number, right: number): number
export function GfCompMult<T extends GfVec>(left: T, right: T): T
export function GfCompMult(left: number | GfVec, right: number | GfVec): number | GfVec {
  if (typeof left === 'number' && typeof right === 'number') return left * right
  return vecCompMult(left as GfVec, right as GfVec)
}

/**
 * GfCompDiv: component-wise quotient. For scalars the plain quotient.
 * Mirrors math.h GfCompDiv plus the vec.h overload.
 */
export function GfCompDiv(left: number, right: number): number
export function GfCompDiv<T extends GfVec>(left: T, right: T): T
export function GfCompDiv(left: number | GfVec, right: number | GfVec): number | GfVec {
  if (typeof left === 'number' && typeof right === 'number') return left / right
  return vecCompDiv(left as GfVec, right as GfVec)
}

// --- Scalar IsClose (math.h inline) ---

/**
 * GfIsCloseScalar: |a-b| < epsilon. This is math.h's scalar GfIsClose overload;
 * named distinctly so it does not collide with vec.ts's vector GfIsClose in the
 * package barrel.
 */
export function GfIsCloseScalar(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) < epsilon
}
