// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/math/Math.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/math/Math.h (the subset the read + sample scope needs):
// vector/coord types, matMult, and the fused multiply-add it relies on.

/** 3D double-precision vector (upstream nanovdb::math::Vec3<double>). */
export type Vec3 = [number, number, number]

/** Signed 32-bit integer voxel coordinate (upstream nanovdb::Coord). */
export type Coord = [number, number, number]

/** Axis-aligned bounding box of Coords, both ends inclusive (upstream CoordBBox). */
export interface CoordBBox {
  min: Coord
  max: Coord
}

/** Axis-aligned bounding box in world space (upstream Vec3dBBox). */
export interface Vec3dBBox {
  min: Vec3
  max: Vec3
}

// DIVERGENCE from upstream: nanovdb::math uses the C std fma(), which is a
// hardware fused multiply-add. JavaScript has no fma primitive, so this is
// the classic software emulation (Dekker two-product + two-sum, e.g.
// Boldo & Muller). It returns the correctly rounded a*b+c for all inputs
// exercised here; pathological double-rounding ties and overflow at the
// splitting step (|a| or |b| > ~2^996) can differ in the last ulp — far
// outside grid-transform magnitudes, and the oracle fixtures verify the
// real data paths bit-exactly.
const SPLITTER = 134217729 // 2^27 + 1

export function fma(a: number, b: number, c: number): number {
  // Dekker split of a and b into high/low halves with 26/27-bit significands
  const aHi = SPLITTER * a - (SPLITTER * a - a)
  const aLo = a - aHi
  const bHi = SPLITTER * b - (SPLITTER * b - b)
  const bLo = b - bHi
  // two-product: p + e == a*b exactly
  const p = a * b
  const e = aLo * bLo - (p - aHi * bHi - aLo * bHi - aHi * bLo)
  // two-sum: s + d == p + c exactly
  const s = p + c
  const v = s - p
  const d = (p - (s - v)) + (c - v)
  return s + (e + d)
}

/**
 * Multiply a row-major 3x3 matrix with a 3d vector, then add a translation:
 * `mat * xyz + vec` (upstream math::matMult(mat, vec, xyz), 9 fma flops).
 */
export function matMult(mat: ArrayLike<number>, vec: ArrayLike<number>, xyz: Vec3): Vec3 {
  return [
    fma(xyz[0], mat[0]!, fma(xyz[1], mat[1]!, fma(xyz[2], mat[2]!, vec[0]!))),
    fma(xyz[0], mat[3]!, fma(xyz[1], mat[4]!, fma(xyz[2], mat[5]!, vec[1]!))),
    fma(xyz[0], mat[6]!, fma(xyz[1], mat[7]!, fma(xyz[2], mat[8]!, vec[2]!))),
  ]
}

/**
 * Single-rounding float32 fma (C fmaf) for float32 inputs: a*b is exact in
 * a JS double, and the only hazard — a double-rounding on an exact float32
 * tie — is detected and broken with the exact TwoSum residual.
 */
export function fmaf32(a: number, b: number, c: number): number {
  const p = a * b // exact: product of two float32s fits in a double
  const s = p + c // correctly rounded to double
  const f = Math.fround(s)
  if (f === s) return f
  const g = nextFloat32(f, s > f)
  const mid = (f + g) / 2 // exactly representable in double
  if (s !== mid) return f
  const bv = s - p
  const err = p - (s - bv) + (c - bv) // TwoSum residual: p + c === s + err exactly
  if (err === 0) return f // true tie -> round-half-even, which fround(s) gave us
  return (err > 0) === (g > f) ? g : f
}

const nfBuf = new Float32Array(1)
const nfU32 = new Uint32Array(nfBuf.buffer)

/** adjacent float32 above/below f */
export function nextFloat32(f: number, up: boolean): number {
  nfBuf[0] = f
  if (f === 0) {
    nfU32[0] = up ? 0x00000001 : 0x80000001
  } else {
    const positive = f > 0
    nfU32[0] = nfU32[0]! + (up === positive ? 1 : -1)
  }
  return nfBuf[0]!
}

/** Multiply a row-major 3x3 matrix with a 3d vector: `mat * xyz` (no translation). */
export function matMult3(mat: ArrayLike<number>, xyz: Vec3): Vec3 {
  return [
    fma(xyz[0], mat[0]!, fma(xyz[1], mat[1]!, xyz[2] * mat[2]!)),
    fma(xyz[0], mat[3]!, fma(xyz[1], mat[4]!, xyz[2] * mat[5]!)),
    fma(xyz[0], mat[6]!, fma(xyz[1], mat[7]!, xyz[2] * mat[8]!)),
  ]
}
