// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_coding.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_simd.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_table.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_table_init.c
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// OpenEXR: Copyright (c) Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// OpenEXR: Copyright (c) DreamWorks Animation LLC and Contributors of the
//  OpenEXR Project. BSD 3-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore):
//   internal_dwa_simd.h:99-125    csc709Inverse / csc709Inverse64 (scalar)
//   internal_dwa_simd.h:217-231   interleaveByte2 (scalar)
//   internal_dwa_simd.h:369-374   convertFloatToHalf64_scalar
//   internal_dwa_simd.h:456-544   fromHalfZigZag_scalar
//   internal_dwa_simd.h:864-873   dctInverse8x8DcOnly (scalar)
//   internal_dwa_simd.h:889-1076  dctInverse8x8_scalar / dctInverse8x8_scalar_N
//   internal_dwa_table_init.c:17-108 dwa_convertToLinear /
//                                 dwa_convertToNonLinear / init_dwa_tables
//   internal_dwa_table.c:11-15    exrcore_dwaToLinearTable /
//                                 exrcore_dwaToNonLinearTable
// Only the decode-side helpers are ported (no forward DCT / forward CSC).
//
// Which upstream variant these reproduce: the expected fixtures come from a
// native macOS arm64 build. There IMF_HAVE_SSE2 is undefined and
// initializeFuncs (internal_dwa_simd.h:2340-2400) selects
// convertFloatToHalf64_neon and fromHalfZigZag_neon, and keeps the scalar
// inverse DCT (dctInverse8x8_scalar_N) and scalar csc709Inverse64. The NEON
// half<->float conversions (vcvt_f16_f32 / vcvt_f32_f16, round to nearest
// even, denormals kept) give the same bits as float_to_half / half_to_float
// of internal_coding.h for every non-NaN value, so the scalar forms are
// ported. The scalar inverse DCT and CSC are compiled by clang, whose
// default -ffp-contract=on fuses each `x * y + z` / `x * y - z` inside one
// C expression into an fma (clang CodeGen tryEmitFMulAdd: the left-hand
// multiply is fused first). The ports below reproduce that contraction with
// an exactly rounded float fma (fmaf below), which is what the arm64 build
// computes; the x86 SSE2/AVX inverse DCTs are a different (unfused) code
// path and are not reproduced. Checked: the disassembly of the native
// hioOpenEXR.dylib (arm64) dctInverse8x8_scalar / LossyDctDecoder_execute
// uses fmla / fmadd in exactly this order and these constant bits, and
// 20000 random blocks through upstream dctInverse8x8_scalar + csc709Inverse
// compiled with Apple clang -O2 match these ports bit for bit (an unfused
// build differs in ~43% of the floats; the DWA fixtures alone do not
// distinguish the two after half quantization).
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) DreamWorks Animation LLC and Contributors of the OpenEXR Project

import { float_to_half, half_to_float } from './openexrCoreCoding.ts'

const fround = Math.fround

const _fmaD = new Float64Array(1)
const _fmaW = new Uint32Array(_fmaD.buffer)
// Index of the low / high 32-bit word of a float64 in _fmaW (little-endian
// hosts store the low word first).
const _LO = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 0 : 1
const _HI = 1 - _LO

/** fmaf(a, b, c) for float32 a, b, c: a * b + c rounded once to float32 (what
 *  the arm64 FMADD/FMSUB instructions compute). The product of two float32
 *  values is exact in a double; the double sum's rounding error is
 *  recovered exactly (TwoSum) and, when non-zero, the double is nudged one
 *  double-ulp towards the exact value so the final float32 rounding cannot
 *  suffer double rounding. (Underflowing products below the double range do
 *  not occur in the DWA data path.) */
export function fmaf(a: number, b: number, c: number): number {
  const p = a * b
  const s = p + c
  const bb = s - p
  const err = (p - (s - bb)) + (c - bb)
  if (err === 0 || s !== s || s === Infinity || s === -Infinity) return fround(s)
  _fmaD[0] = s
  let lo = _fmaW[_LO]!, hi = _fmaW[_HI]!
  if ((err > 0) === (s > 0)) {
    // away from zero: increment the magnitude
    lo = (lo + 1) >>> 0
    if (lo === 0) hi = (hi + 1) >>> 0
  } else {
    // towards zero: decrement the magnitude
    if (lo === 0) hi = (hi - 1) >>> 0
    lo = (lo - 1) >>> 0
  }
  _fmaW[_LO] = lo
  _fmaW[_HI] = hi
  return fround(_fmaD[0]!)
}

//
// Color space conversion, Inverse 709 CSC, Y'CbCr -> R'G'B'
//

/** internal_dwa_simd.h:99-111 csc709Inverse, on comp0[i0], comp1[i1],
 *  comp2[i2]. Each line is one clang-contracted expression:
 *  src0 + k*src2 -> fma(k, src2, src0); src0 - k1*src1 - k2*src2 ->
 *  fma(-k2, src2, fma(-k1, src1, src0)). */
export function csc709Inverse(comp0: Float32Array, comp1: Float32Array, comp2: Float32Array, i: number): void {
  const src0 = comp0[i]!
  const src1 = comp1[i]!
  const src2 = comp2[i]!

  comp0[i] = fmaf(K_15747, src2, src0)
  comp1[i] = fmaf(-K_04682, src2, fmaf(-K_01873, src1, src0))
  comp2[i] = fmaf(K_18556, src1, src0)
}
const K_15747 = fround(1.5747)
const K_01873 = fround(0.1873)
const K_04682 = fround(0.4682)
const K_18556 = fround(1.8556)

//
// Scalar color space conversion, based on 709 primiary chromaticies.
// No scaling or offsets, just the matrix
//

/** internal_dwa_simd.h:113-125 csc709Inverse64 (the !IMF_HAVE_SSE2 form) */
export function csc709Inverse64(comp0: Float32Array, comp1: Float32Array, comp2: Float32Array): void {
  for (let i = 0; i < 64; ++i) csc709Inverse(comp0, comp1, comp2, i)
}

//
// Byte interleaving of 2 byte arrays:
//    src0 = AAAA
//    src1 = BBBB
//    dst  = ABABABAB
//
// numBytes is the size of each of the source buffers
//

/** internal_dwa_simd.h:217-231 interleaveByte2 (scalar default; the SSE2
 *  form writes the same bytes). Arrays with offsets stand for the pointers. */
export function interleaveByte2(dst: Uint8Array, dstOff: number, src: Uint8Array, src0: number, src1: number,
  numBytes: number): void {
  for (let x = 0; x < numBytes; ++x) {
    dst[dstOff + 2 * x] = src[src0 + x]!
    dst[dstOff + 2 * x + 1] = src[src1 + x]!
  }
}

//
// Float -> half float conversion
//
// Default boring conversion
//

/** internal_dwa_simd.h:369-374 convertFloatToHalf64_scalar (same bits as
 *  convertFloatToHalf64_neon, internal_dwa_simd.h:376-391, except NaN
 *  payloads). */
export function convertFloatToHalf64(dst: Uint16Array, dstOff: number, src: Float32Array): void {
  for (let i = 0; i < 64; ++i) dst[dstOff + i] = float_to_half(src[i]!)
}

//
// Convert an 8x8 block of HALF from zig-zag order to
// FLOAT in normal order. The order we want is:
//
//          src                           dst
//  0  1  2  3  4  5  6  7       0  1  5  6 14 15 27 28
//  8  9 10 11 12 13 14 15       2  4  7 13 16 26 29 42
// 16 17 18 19 20 21 22 23       3  8 12 17 25 30 41 43
// 24 25 26 27 28 29 30 31       9 11 18 24 31 40 44 53
// 32 33 34 35 36 37 38 39      10 19 23 32 39 45 52 54
// 40 41 42 43 44 45 46 47      20 22 33 38 46 51 55 60
// 48 49 50 51 52 53 54 55      21 34 37 47 50 56 59 61
// 56 57 58 59 60 61 62 63      35 36 48 49 57 58 62 63
//
const kFromZigZag = [
  0, 1, 5, 6, 14, 15, 27, 28,
  2, 4, 7, 13, 16, 26, 29, 42,
  3, 8, 12, 17, 25, 30, 41, 43,
  9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54,
  20, 22, 33, 38, 46, 51, 55, 60,
  21, 34, 37, 47, 50, 56, 59, 61,
  35, 36, 48, 49, 57, 58, 62, 63,
]

/** internal_dwa_simd.h:471-544 fromHalfZigZag_scalar (unrolled upstream;
 *  table driven here — dst[i] = half_to_float(src[kFromZigZag[i]]). Same
 *  result as fromHalfZigZag_neon, internal_dwa_simd.h:805-855.) */
export function fromHalfZigZag(src: Uint16Array, dst: Float32Array): void {
  for (let i = 0; i < 64; ++i) dst[i] = half_to_float(src[kFromZigZag[i]!]!)
}

//
// Inverse 8x8 DCT, only inverting the DC. This assumes that
// all AC frequencies are 0.
//

const K_DC = fround(3.535536e-01)

/** internal_dwa_simd.h:864-873 dctInverse8x8DcOnly (scalar) */
export function dctInverse8x8DcOnly(data: Float32Array): void {
  const val = fround(fround(data[0]! * K_DC) * K_DC)

  for (let i = 0; i < 64; ++i) data[i] = val
}

//
// Full 8x8 Inverse DCT:
//
// Simple inverse DCT on an 8x8 block, with scalar ops only.
//  Operates on data in-place.
//
// This is based on the iDCT formuation (y = frequency domain,
//                                       x = spatial domain)
//
//    [x0]    [        ][y0]    [        ][y1]
//    [x1] =  [  M1    ][y2]  + [  M2    ][y3]
//    [x2]    [        ][y4]    [        ][y5]
//    [x3]    [        ][y6]    [        ][y7]
//
//    [x7]    [        ][y0]    [        ][y1]
//    [x6] =  [  M1    ][y2]  - [  M2    ][y3]
//    [x5]    [        ][y4]    [        ][y5]
//    [x4]    [        ][y6]    [        ][y7]
//
// where M1:             M2:
//
//   [a  c  a   f]     [b  d  e  g]
//   [a  f -a  -c]     [d -g -b -e]
//   [a -f -a   c]     [e -b  g  d]
//   [a -c  a  -f]     [g -e  d -b]
//
// and the constants are as defined below..
//
// If you know how many of the lower rows are zero, that can
// be passed in to help speed things up. If you don't know,
// just set zeroedRows=0.
//

// `.5f * cosf (k * 3.14159f / n)`: clang folds these at compile time; the
// argument is formed in float, cosf is evaluated in double and rounded to
// float, then multiplied by .5f (exact). The resulting bits equal the
// constants in the native arm64 binary (a 3eb504fb, b 3efb14bf, c 3eec8361,
// d 3ed4db36, e 3e8e39e5, f 3e43ef33, g 3dc7c60b; DcOnly's 3.535536e-01f is
// 3eb504fa).
const PI_F = fround(3.14159)
const cosf = (x: number): number => fround(Math.cos(x))
const IDCT_A = fround(0.5 * cosf(fround(PI_F / 4.0)))
const IDCT_B = fround(0.5 * cosf(fround(PI_F / 16.0)))
const IDCT_C = fround(0.5 * cosf(fround(PI_F / 8.0)))
const IDCT_D = fround(0.5 * cosf(fround(fround(3 * PI_F) / 16.0)))
const IDCT_E = fround(0.5 * cosf(fround(fround(5 * PI_F) / 16.0)))
const IDCT_F = fround(0.5 * cosf(fround(fround(3 * PI_F) / 8.0)))
const IDCT_G = fround(0.5 * cosf(fround(fround(7 * PI_F) / 16.0)))

/** One clang-contracted `p*q + r*s + t*u + v*w` (internal_dwa_simd.h:957,
 *  995-996): fma(v, w, fma(t, u, fma(p, q, r*s))). The signs of the
 *  subtracted terms are folded into the first factor (fma(-x, y, z) is
 *  z - x*y exactly). */
function sum4(p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number): number {
  return fmaf(v, w, fmaf(t, u, fmaf(p, q, fround(r * s))))
}

/** internal_dwa_simd.h:926-1028 dctInverse8x8_scalar, on data[0..63] */
export function dctInverse8x8_scalar(data: Float32Array, zeroedRows: number): void {
  const a = IDCT_A, b = IDCT_B, c = IDCT_C, d = IDCT_D, e = IDCT_E, f = IDCT_F, g = IDCT_G

  //
  // First pass - row wise.
  //
  // This looks less-compact than the description above in
  // an attempt to fold together common sub-expressions.
  //

  for (let row = 0; row < 8 - zeroedRows; ++row) {
    const o = row * 8
    const r0 = data[o]!, r1 = data[o + 1]!, r2 = data[o + 2]!, r3 = data[o + 3]!
    const r4 = data[o + 4]!, r5 = data[o + 5]!, r6 = data[o + 6]!, r7 = data[o + 7]!

    const alpha0 = fround(c * r2)
    const alpha1 = fround(f * r2)
    const alpha2 = fround(c * r6)
    const alpha3 = fround(f * r6)

    // beta[0] = b * rowPtr[1] + d * rowPtr[3] + e * rowPtr[5] + g * rowPtr[7];
    const beta0 = sum4(b, r1, d, r3, e, r5, g, r7)
    // beta[1] = d * rowPtr[1] - g * rowPtr[3] - b * rowPtr[5] - e * rowPtr[7];
    const beta1 = fmaf(-e, r7, fmaf(-b, r5, fmaf(d, r1, -fround(g * r3))))
    // beta[2] = e * rowPtr[1] - b * rowPtr[3] + g * rowPtr[5] + d * rowPtr[7];
    const beta2 = fmaf(d, r7, fmaf(g, r5, fmaf(e, r1, -fround(b * r3))))
    // beta[3] = g * rowPtr[1] - e * rowPtr[3] + d * rowPtr[5] - b * rowPtr[7];
    const beta3 = fmaf(-b, r7, fmaf(d, r5, fmaf(g, r1, -fround(e * r3))))

    const theta0 = fround(a * fround(r0 + r4))
    const theta3 = fround(a * fround(r0 - r4))

    const theta1 = fround(alpha0 + alpha3)
    const theta2 = fround(alpha1 - alpha2)

    const gamma0 = fround(theta0 + theta1)
    const gamma1 = fround(theta3 + theta2)
    const gamma2 = fround(theta3 - theta2)
    const gamma3 = fround(theta0 - theta1)

    data[o] = gamma0 + beta0
    data[o + 1] = gamma1 + beta1
    data[o + 2] = gamma2 + beta2
    data[o + 3] = gamma3 + beta3

    data[o + 4] = gamma3 - beta3
    data[o + 5] = gamma2 - beta2
    data[o + 6] = gamma1 - beta1
    data[o + 7] = gamma0 - beta0
  }

  //
  // Second pass - column wise.
  //

  for (let column = 0; column < 8; ++column) {
    const y0 = data[column]!, y1 = data[8 + column]!, y2 = data[16 + column]!, y3 = data[24 + column]!
    const y4 = data[32 + column]!, y5 = data[40 + column]!, y6 = data[48 + column]!, y7 = data[56 + column]!

    const alpha0 = fround(c * y2)
    const alpha1 = fround(f * y2)
    const alpha2 = fround(c * y6)
    const alpha3 = fround(f * y6)

    const beta0 = sum4(b, y1, d, y3, e, y5, g, y7)
    const beta1 = fmaf(-e, y7, fmaf(-b, y5, fmaf(d, y1, -fround(g * y3))))
    const beta2 = fmaf(d, y7, fmaf(g, y5, fmaf(e, y1, -fround(b * y3))))
    const beta3 = fmaf(-b, y7, fmaf(d, y5, fmaf(g, y1, -fround(e * y3))))

    const theta0 = fround(a * fround(y0 + y4))
    const theta3 = fround(a * fround(y0 - y4))

    const theta1 = fround(alpha0 + alpha3)
    const theta2 = fround(alpha1 - alpha2)

    const gamma0 = fround(theta0 + theta1)
    const gamma1 = fround(theta3 + theta2)
    const gamma2 = fround(theta3 - theta2)
    const gamma3 = fround(theta0 - theta1)

    data[column] = gamma0 + beta0
    data[8 + column] = gamma1 + beta1
    data[16 + column] = gamma2 + beta2
    data[24 + column] = gamma3 + beta3

    data[32 + column] = gamma3 - beta3
    data[40 + column] = gamma2 - beta2
    data[48 + column] = gamma1 - beta1
    data[56 + column] = gamma0 - beta0
  }
}

/** internal_dwa_simd.h:1030-1076 dctInverse8x8_scalar_0 .. _7, the
 *  dctInverse8x8_N dispatch (internal_dwa_simd.h:2331-2338) on arm64. */
export const dctInverse8x8_0 = (data: Float32Array): void => dctInverse8x8_scalar(data, 0)
export const dctInverse8x8_1 = (data: Float32Array): void => dctInverse8x8_scalar(data, 1)
export const dctInverse8x8_2 = (data: Float32Array): void => dctInverse8x8_scalar(data, 2)
export const dctInverse8x8_3 = (data: Float32Array): void => dctInverse8x8_scalar(data, 3)
export const dctInverse8x8_4 = (data: Float32Array): void => dctInverse8x8_scalar(data, 4)
export const dctInverse8x8_5 = (data: Float32Array): void => dctInverse8x8_scalar(data, 5)
export const dctInverse8x8_6 = (data: Float32Array): void => dctInverse8x8_scalar(data, 6)
export const dctInverse8x8_7 = (data: Float32Array): void => dctInverse8x8_scalar(data, 7)

// internal_dwa_table_init.c:17-40
//
// Nonlinearly encode luminance. For values below 1.0, we want
// to use a gamma 2.2 function to match what is fairly common
// for storing output referred. However, > 1, gamma functions blow up,
// and log functions are much better behaved. We could use a log
// function everywhere, but it tends to over-sample dark
// regions and undersample the brighter regions, when
// compared to the way real devices reproduce values.
//
// So, above 1, use a log function which is a smooth blend
// into the gamma function.
//
//  Nonlinear(linear) =
//
//    linear^(1./2.2)             / linear <= 1.0
//                               |
//    ln(linear)/ln(e^2.2) + 1    \ otherwise
//
//
// toNonlinear[] needs to take in XDR format half float values,
// and output NATIVE format float.
//
// toLinear[] does the opposite - takes in NATIVE half and
// outputs XDR half values.
//

// powf / logf: evaluated in double (Math.pow / Math.log) and rounded to
// float. Divergence: macOS libm's powf / logf are not guaranteed correctly
// rounded and V8's Math.pow is not guaranteed correctly rounded in double,
// so a result within an ulp of a float rounding boundary could differ in
// the last float ulp; that changes the table entry only if it also crosses
// a half rounding boundary. Checked: both 65536-entry tables built here are
// identical to the tables computed by the upstream functions compiled with
// Apple clang against macOS arm64 libm (0 differing entries).
const powf = (x: number, y: number): number => fround(Math.pow(x, y))
const logf = (x: number): number => fround(Math.log(x))

const K_2_2 = fround(2.2)
const K_E_2_2 = fround(9.02501329156) // = pow(2.7182818, 2.2)
const K_INV_2_2 = fround(1.0 / K_2_2)

/** internal_dwa_table_init.c:42-67 dwa_convertToLinear */
function dwa_convertToLinear(x: number): number {
  if (x === 0) return 0
  if ((x & 0x7c00) === 0x7c00) // infinity/nan?
    return 0

  let f = half_to_float(x)
  const sign = f < 0.0 ? -1.0 : 1.0
  f = Math.abs(f)

  let px: number, py: number
  if (f <= 1.0) {
    px = f
    py = K_2_2
  } else {
    px = K_E_2_2
    py = fround(f - 1.0)
  }
  const z = fround(sign * powf(px, py))
  return float_to_half(z)
}

/** internal_dwa_table_init.c:69-91 dwa_convertToNonLinear */
function dwa_convertToNonLinear(x: number): number {
  if (x === 0) return 0
  if ((x & 0x7c00) === 0x7c00) // infinity/nan?
    return 0

  let f = half_to_float(x)
  const sign = f < 0.0 ? -1.0 : 1.0
  f = Math.abs(f)

  let z: number
  if (f <= 1.0) {
    z = powf(f, K_INV_2_2)
  } else {
    z = fround(fround(logf(f) / K_2_2) + 1.0)
  }
  return float_to_half(fround(sign * z))
}

/** internal_dwa_table.c:11-15 */
export const exrcore_dwaToLinearTable = new Uint16Array(65536)
export const exrcore_dwaToNonLinearTable = new Uint16Array(65536)

let dwa_tables_once = false

/** internal_dwa_table_init.c:94-102 init_dwa_tables */
function init_dwa_tables(): void {
  for (let i = 0; i < 65536; i++) {
    exrcore_dwaToLinearTable[i] = dwa_convertToLinear(i)
    exrcore_dwaToNonLinearTable[i] = dwa_convertToNonLinear(i)
  }
}

/** internal_dwa_table_init.c:104-108 exrcore_ensure_dwa_tables (call_once) */
export function exrcore_ensure_dwa_tables(): void {
  if (dwa_tables_once) return
  dwa_tables_once = true
  init_dwa_tables()
}
