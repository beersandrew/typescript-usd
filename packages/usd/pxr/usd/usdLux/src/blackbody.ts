// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/blackbody.cpp,
//  pxr/usd/usdLux/blackbody.h, pxr/base/gf/vec3f.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdLux/blackbody.{h,cpp}.
//
// GfVec3f arithmetic is single precision: every float operation below rounds
// with Math.fround. GfVec3f scalar products and quotients go through double
// (vec3f.h:208-228: operator*=(double), operator/= multiplies by 1.0 / s).
import { Vec3f as GfVec3f } from 'typescript-usd/gf'

const f = Math.fround

// blackbody.cpp:13-56: lookup table from "Colour Rendering of Spectra" by
// John Walker (https://www.fourmilab.ch/documents/specrend/specrend.c),
// covering 1000K to 10000K in 500K steps for Rec709 / sRGB chromaticity. The
// beginning and ending knots are repeated to simplify boundary behavior; the
// last 4 knots represent the segment starting at 1.0.
const _blackbodyRGB: ReadonlyArray<readonly [number, number, number]> = [
  [1.000000, 0.027490, 0.000000], //  1000 K (Approximation)
  [1.000000, 0.027490, 0.000000], //  1000 K (Approximation)
  [1.000000, 0.149664, 0.000000], //  1500 K (Approximation)
  [1.000000, 0.256644, 0.008095], //  2000 K
  [1.000000, 0.372033, 0.067450], //  2500 K
  [1.000000, 0.476725, 0.153601], //  3000 K
  [1.000000, 0.570376, 0.259196], //  3500 K
  [1.000000, 0.653480, 0.377155], //  4000 K
  [1.000000, 0.726878, 0.501606], //  4500 K
  [1.000000, 0.791543, 0.628050], //  5000 K
  [1.000000, 0.848462, 0.753228], //  5500 K
  [1.000000, 0.898581, 0.874905], //  6000 K
  [1.000000, 0.942771, 0.991642], //  6500 K
  [0.906947, 0.890456, 1.000000], //  7000 K
  [0.828247, 0.841838, 1.000000], //  7500 K
  [0.765791, 0.801896, 1.000000], //  8000 K
  [0.715255, 0.768579, 1.000000], //  8500 K
  [0.673683, 0.740423, 1.000000], //  9000 K
  [0.638992, 0.716359, 1.000000], //  9500 K
  [0.609681, 0.695588, 1.000000], // 10000 K
  [0.609681, 0.695588, 1.000000], // 10000 K
  [0.609681, 0.695588, 1.000000], // 10000 K
].map(([r, g, b]) => [f(r!), f(g!), f(b!)] as const)

// blackbody.cpp:58-64: Catmull-Rom basis.
const _basis: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.5, 1.5, -1.5, 0.5],
  [1.0, -2.5, 2.0, -0.5],
  [-0.5, 0.0, 0.5, 0.0],
  [0.0, 1.0, 0.0, 0.0],
]

type V3 = [number, number, number]

// GfVec3f operator*(double, GfVec3f) (vec3f.h:208-219).
function scale(s: number, v: readonly number[]): V3 {
  return [f(v[0]! * s), f(v[1]! * s), f(v[2]! * s)]
}

// GfVec3f operator+ (vec3f.h:186-194).
function add(a: readonly number[], b: readonly number[]): V3 {
  return [f(a[0]! + b[0]!), f(a[1]! + b[1]!), f(a[2]! + b[2]!)]
}

// blackbody.cpp:66-69 (GfDot of GfVec3f, vec3f.h:234-236).
function _Rec709RgbToLuma(rgb: readonly number[]): number {
  return f(f(f(rgb[0]! * f(0.2126)) + f(rgb[1]! * f(0.7152))) + f(rgb[2]! * f(0.0722)))
}

// GfMax (gf/math.h:328-331).
function max(a1: number, a2: number): number {
  return a1 < a2 ? a2 : a1
}

// GfClamp (gf/math.h:273-278).
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

// UsdLuxBlackbodyTemperatureAsRgb (blackbody.cpp:71-114).
export function BlackbodyTemperatureAsRgb(temp: number): GfVec3f {
  temp = f(temp)
  // Catmull-Rom interpolation of _blackbodyRGB
  const numKnots = _blackbodyRGB.length
  // Parametric distance along spline
  const u_spline = clamp(f(f(temp - 1000.0) / 9000.0), 0.0, 1.0)
  // Last 4 knots represent a trailing segment starting at u_spline==1.0,
  // to simplify boundary behavior
  const numSegs = numKnots - 4
  const x = f(u_spline * numSegs)
  const seg = Math.trunc(Math.floor(x))
  const u_seg = f(x - seg) // Parameter within segment

  // Knot values for this segment
  const k0 = _blackbodyRGB[seg + 0]!
  const k1 = _blackbodyRGB[seg + 1]!
  const k2 = _blackbodyRGB[seg + 2]!
  const k3 = _blackbodyRGB[seg + 3]!

  // Compute cubic coefficients.
  const coeff = (row: readonly number[]): V3 => add(add(add(
    scale(row[0]!, k0), scale(row[1]!, k1)), scale(row[2]!, k2)), scale(row[3]!, k3))
  const a = coeff(_basis[0]!)
  const b = coeff(_basis[1]!)
  const c = coeff(_basis[2]!)
  const d = coeff(_basis[3]!)

  // Eval cubic polynomial.
  let rgb = add(scale(u_seg, add(scale(u_seg, add(scale(u_seg, a), b)), c)), d)

  // Normalize to the same luminance as (1,1,1)
  rgb = scale(1.0 / _Rec709RgbToLuma(rgb), rgb)

  // Clamp at zero, since the spline can produce small negative values,
  // e.g. in the blue component at 1300k.
  return new GfVec3f(max(rgb[0], 0), max(rgb[1], 0), max(rgb[2], 0))
}
