// Ported from Microsoft's Direct3D 11 reference tessellator
//  (github.com/microsoft/DirectX-Specs
//  d3d/archive/images/d3d11/tessellator.cpp, tessellator.hpp, commit 98063a7).
// Copyright (c) Microsoft Corporation. MIT License.
// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUTessellator: the Direct3D 11 fixed-function tessellator, ported
// from Microsoft's reference implementation, CHWTessellator, which the
// Direct3D 11.3 Functional Specification names as the concrete definition of
// the tessellation pattern (section 11.7.1, "Tessellation Pattern"; sections
// 11.7.2-11.7.14 describe it in words: fractional odd/even partitioning
// 11.7.3, the ruler-function vertex splits 11.7.5, triangulation and
// transitions 11.7.6, integer and pow2 partitioning 11.7.7, isolines
// 11.7.8, TessFactor ranges 11.7.11, culling 11.7.12, precision 11.7.14).
//
// Source: github.com/microsoft/DirectX-Specs, d3d/archive/images/d3d11/
// tessellator.cpp and tessellator.hpp ("Microsoft D3D11 Fixed Function
// Tessellator Reference - May 7, 2012"), commit 98063a7152bba494ee01f9da4f9186d49b2a4f19,
// code under the repository's LICENSE-CODE (MIT, Copyright (c) Microsoft
// Corporation). Line numbers below cite tessellator.cpp of that commit.
// The CHLSLTessellator wrapper (HLSL hull shader helper code,
// tessellator.cpp:2125-2673) is not ported: Metal hands the hull stage's
// factors straight to the fixed-function stage, which is CHWTessellator.
//
// Why this exists: WebGPU has no tessellator. Storm draws refined curves
// (and adaptive subdivision) on Metal with post-tessellation vertex
// functions fed by Apple's fixed-function tessellator
// (hgiMetal/graphicsPipeline.mm:178-235), which produces the Direct3D 11
// pattern (verified against a native Metal capture,
// tests/fixtures/tessellator/). HgiWebGPU runs the same algorithm in a
// compute kernel (tessellatorWGSL.ts, a line-for-line WGSL rendering of this
// file); this TypeScript port is the readable reference the kernel and the
// tests are checked against (packages/usd/docs/imaging-i2.md section 2.2.1).
//
// The XBox 360 comparison mode (ALLOW_XBOX_360_COMPARISON) is not D3D11
// behavior and is left out. Points are kept in the 16.16 fixed point the
// reference computes them in (DefinePoint converts them to float exactly:
// every value is a multiple of 2^-16 in [0, 1]).

/** D3D11_TESSELLATOR_PARTITIONING (tessellator.hpp:54-60) */
export enum HgiWebGPUTessellatorPartitioning {
  Integer = 0,
  Pow2 = 1,
  FractionalOdd = 2,
  FractionalEven = 3,
}

/** D3D11_TESSELLATOR_OUTPUT_PRIMITIVE (tessellator.hpp:74-80) */
export enum HgiWebGPUTessellatorOutputPrimitive {
  Point = 0,
  Line = 1,
  TriangleCW = 2,
  TriangleCCW = 3,
}

/** Metal's tessellationOutputWindingOrder as the reference tessellator's
 *  output primitive: Metal's counter-clockwise order emits the triangles
 *  the reference stores for D3D11_TESSELLATOR_OUTPUT_TRIANGLE_CW
 *  (tessellator.cpp:1605-1620), as the native capture shows
 *  (tests/fixtures/tessellator/). */
export function HgiWebGPUTessellatorOutputPrimitiveForMetalWinding(winding: 'ccw' | 'cw'):
  HgiWebGPUTessellatorOutputPrimitive {
  return winding === 'ccw'
    ? HgiWebGPUTessellatorOutputPrimitive.TriangleCW
    : HgiWebGPUTessellatorOutputPrimitive.TriangleCCW
}

// tessellator.hpp:43-53
const D3D11_TESSELLATOR_MIN_ODD_TESSELLATION_FACTOR = 1
const D3D11_TESSELLATOR_MAX_ODD_TESSELLATION_FACTOR = 63
const D3D11_TESSELLATOR_MIN_EVEN_TESSELLATION_FACTOR = 2
const D3D11_TESSELLATOR_MAX_EVEN_TESSELLATION_FACTOR = 64
const D3D11_TESSELLATOR_MIN_ISOLINE_DENSITY_TESSELLATION_FACTOR = 1
const D3D11_TESSELLATOR_MAX_ISOLINE_DENSITY_TESSELLATION_FACTOR = 64
export const D3D11_TESSELLATOR_MAX_TESSELLATION_FACTOR = 64
const MAX_POINT_COUNT = (D3D11_TESSELLATOR_MAX_TESSELLATION_FACTOR + 1) * (D3D11_TESSELLATOR_MAX_TESSELLATION_FACTOR + 1)
const MAX_INDEX_COUNT = D3D11_TESSELLATOR_MAX_TESSELLATION_FACTOR * D3D11_TESSELLATOR_MAX_TESSELLATION_FACTOR * 2 * 3

// ---------------------------------------------------------------------------
// D3D compliant float math (tessellator.cpp:8-76), on float32 values.

const _f32 = new Float32Array(1)
const _u32 = new Uint32Array(_f32.buffer)
const _i32 = new Int32Array(_f32.buffer)
function _bits(a: number): number { _f32[0] = a; return _u32[0]! }
function _fromBits(b: number): number { _u32[0] = b >>> 0; return _f32[0]! }

/** tessellator.cpp:15-20 */
function isNaN32(a: number): boolean {
  const u = _bits(a)
  return ((u & 0x7f800000) >>> 0) === 0x7f800000 && (u & 0x007fffff) !== 0
}
/** tessellator.cpp:26-37 */
function flush(a: number): number {
  const b = _bits(a) & 0x7fffffff
  if (b < 0x00800000) return _fromBits(_bits(a) & 0x80000000)
  return a
}
/** IEEE754R min (tessellator.cpp:43-55) */
function fmin(a: number, b: number): number {
  const _a = flush(a)
  const _b = flush(b)
  if (isNaN32(_b)) return a
  else if (_a === 0 && _b === 0) return (_bits(_a) & 0x80000000) ? a : b
  return _a < _b ? a : b
}
/** IEEE754R max (tessellator.cpp:61-74) */
function fmax(a: number, b: number): number {
  const _a = flush(a)
  const _b = flush(b)
  if (isNaN32(_b)) return a
  else if (_a === 0 && _b === 0) return (_bits(_b) & 0x80000000) ? a : b
  return _a >= _b ? a : b
}

// ---------------------------------------------------------------------------
// Fixed point math (tessellator.cpp:80-380).

const FXP_INTEGER_BITS = 15
const FXP_FRACTION_BITS = 16
const FXP_FRACTION_MASK = 0x0000ffff
const FXP_INTEGER_MASK = 0x7fff0000
const FXP_ONE = 1 << FXP_FRACTION_BITS
const FXP_ONE_THIRD = 0x00005555
const FXP_TWO_THIRDS = 0x0000aaaa
const FXP_ONE_HALF = 0x00008000

/** tessellator.cpp:310-331: 1/n in 16.16 for n in 0..64. */
export const s_fixedReciprocal: readonly number[] = [
  0xffffffff, // 1/0 is the first entry (unused)
  0x10000, 0x8000, 0x5555, 0x4000,
  0x3333, 0x2aab, 0x2492, 0x2000,
  0x1c72, 0x199a, 0x1746, 0x1555,
  0x13b1, 0x1249, 0x1111, 0x1000,
  0xf0f, 0xe39, 0xd79, 0xccd,
  0xc31, 0xba3, 0xb21, 0xaab,
  0xa3d, 0x9d9, 0x97b, 0x925,
  0x8d4, 0x889, 0x842, 0x800,
  0x7c2, 0x788, 0x750, 0x71c,
  0x6eb, 0x6bd, 0x690, 0x666,
  0x63e, 0x618, 0x5f4, 0x5d1,
  0x5b0, 0x591, 0x572, 0x555,
  0x539, 0x51f, 0x505, 0x4ec,
  0x4d5, 0x4be, 0x4a8, 0x492,
  0x47e, 0x46a, 0x457, 0x444,
  0x432, 0x421, 0x410, 0x400, // 1/64 is the last entry
]

/** floatToIDotF<c_uIBits, c_uFBits, c_bSigned> (tessellator.cpp:100-298),
 *  for the unsigned 15.16 format floatToFixed uses (:337-340). */
export function floatToFixed(input: number): number {
  const c_uIBits = FXP_INTEGER_BITS
  const c_uFBits = FXP_FRACTION_BITS
  // unsigned: c_iMinResult = 0, c_iMaxResult = ~0
  const c_iMaxResult = -1
  const _fltMantissaBitCount = 23
  const _fltExponentBias = 127
  const _fltHiddenBit = 1 << _fltMantissaBitCount
  const _fltMantissaMask = _fltHiddenBit - 1
  const _fltExponentMask = 0x7f800000
  const _fltSignBit = 0x80000000 | 0

  let _fxpMaxPosValueFloat = (_fltExponentBias + c_uIBits) << _fltMantissaBitCount
  const iShift = _fltMantissaBitCount + 1 - c_uIBits - c_uFBits
  if (iShift >= 0) _fxpMaxPosValueFloat -= 1 << iShift
  const _fxpMaxNegValueFloat = 0

  _f32[0] = input
  let output = _i32[0]!
  const unbiasedExponent = ((output & _fltExponentMask) >> _fltMantissaBitCount) - _fltExponentBias
  const isNegative = output & _fltSignBit

  if (unbiasedExponent === (_fltExponentBias + 1) && (output & _fltMantissaMask)) {
    output = 0 // nan converts to 0
  } else if (!isNegative && output >= _fxpMaxPosValueFloat) {
    output = c_iMaxResult
  } else if (isNegative && (output & ~_fltSignBit) >= _fxpMaxNegValueFloat) {
    output = 0 // c_iMinResult
  } else if (unbiasedExponent < -c_uFBits - 1) {
    output = 0
  } else {
    output = (output & _fltMantissaMask) | _fltHiddenBit
    const extraBits = _fltMantissaBitCount - c_uFBits - unbiasedExponent
    if (extraBits >= 0) {
      if (isNegative) output = (~output + 1) | 0
      const LSB = 1 << extraBits
      const extraBitsMask = LSB - 1
      const half = LSB >> 1
      // round to nearest-even at LSB
      if ((output & LSB) || (output & extraBitsMask) > half) output += half
      output >>= extraBits
    } else {
      output <<= -extraBits
      if (isNegative) output = (~output + 1) | 0
    }
  }
  return output >>> 0
}

/** tessellator.cpp:345-349 */
export function fixedToFloat(input: number): number {
  return Math.fround((input >>> FXP_FRACTION_BITS) + (input & FXP_FRACTION_MASK) / (1 << FXP_FRACTION_BITS))
}
/** tessellator.cpp:354-357 */
function isEven(input: number): boolean {
  return (Math.trunc(input) & 1) ? false : true
}
/** tessellator.cpp:362-369 */
function fxpCeil(input: number): number {
  if (input & FXP_FRACTION_MASK) return ((input & FXP_INTEGER_MASK) + FXP_ONE) >>> 0
  return input
}
/** tessellator.cpp:374-377 */
function fxpFloor(input: number): number {
  return (input & FXP_INTEGER_MASK) >>> 0
}
/** tessellator.cpp:1648-1655 */
function RemoveMSB(val: number): number {
  let check: number
  if (val <= 0x0000ffff) check = (val <= 0x000000ff) ? 0x00000080 : 0x00008000
  else check = (val <= 0x00ffffff) ? 0x00800000 : 0x80000000
  for (let i = 0; i < 8; i++, check >>>= 1) if (val & check) return (val & ~check)
  return 0
}

/** TESSELLATOR_PARITY (tessellator.hpp:155-159) */
const enum Parity { Even = 0, Odd = 1 }

/** TESS_FACTOR_CONTEXT (tessellator.hpp:182-189) */
interface TessFactorContext {
  fxpInvNumSegmentsOnFloorTessFactor: number
  fxpInvNumSegmentsOnCeilTessFactor: number
  fxpHalfTessFactorFraction: number
  numHalfTessFactorPoints: number
  splitPointOnFloorHalfTessFactor: number
}
function _ctx(): TessFactorContext {
  return {
    fxpInvNumSegmentsOnFloorTessFactor: 0, fxpInvNumSegmentsOnCeilTessFactor: 0,
    fxpHalfTessFactorFraction: 0, numHalfTessFactorPoints: 0, splitPointOnFloorHalfTessFactor: 0,
  }
}

const enum Diagonals { InsideToOutside = 0, InsideToOutsideExceptMiddle = 1, Mirrored = 2 }

// tessellator.hpp:140-150
const U = 0
const V = 1
const Ueq0 = 0
const Veq0 = 1
const Weq0 = 2
const Ueq1 = 2
const Veq1 = 3
const QUAD_AXES = 2
const QUAD_EDGES = 4
const TRI_EDGES = 3

// tessellator.cpp:557-558
const EPSILON = 0.0000152587890625 // 2^(-16), min positive fixed point fraction
const MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON = D3D11_TESSELLATOR_MIN_ODD_TESSELLATION_FACTOR + EPSILON / 2

/** tessellator.cpp:1915-1931: ruler-function stitching tables. */
const finalPointPositionTable = [0, 32, 16, 8, 17, 4, 18, 9, 19, 2, 20, 10, 21, 5, 22, 11, 23,
  1, 24, 12, 25, 6, 26, 13, 27, 3, 28, 14, 29, 7, 30, 15, 31]
const loopStart = [1, 1, 17, 9, 9, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
const loopEnd = [0, 0, 17, 17, 25, 25, 25, 25, 29, 29, 29, 29, 29, 29, 29, 29, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 32]

/** CHWTessellator (tessellator.hpp:85-336, tessellator.cpp:386-2120). */
export class HgiWebGPUTessellator {
  private m_originalParity: Parity = Parity.Odd
  private m_parity: Parity = Parity.Odd
  private m_originalPartitioning = HgiWebGPUTessellatorPartitioning.Integer
  private m_partitioning = HgiWebGPUTessellatorPartitioning.Integer
  private m_outputPrimitive = HgiWebGPUTessellatorOutputPrimitive.TriangleCW
  /** u, v of point i at [2i], [2i + 1], in 16.16 fixed point. */
  private readonly m_Point = new Int32Array(MAX_POINT_COUNT * 2)
  private readonly m_Index = new Int32Array(MAX_INDEX_COUNT)
  private m_NumPoints = 0
  private m_NumIndices = 0
  private m_bUsingPatchedIndices = false
  private m_bUsingPatchedIndices2 = false
  private readonly m_IndexPatchContext = {
    insidePointIndexDeltaToRealValue: 0, insidePointIndexBadValue: 0, insidePointIndexReplacementValue: 0,
    outsidePointIndexPatchBase: 0, outsidePointIndexDeltaToRealValue: 0, outsidePointIndexBadValue: 0,
    outsidePointIndexReplacementValue: 0,
  }
  private readonly m_IndexPatchContext2 = {
    baseIndexToInvert: 0, indexInversionEndPoint: 0, cornerCaseBadValue: 0, cornerCaseReplacementValue: 0,
  }

  /** tessellator.cpp:411-440 */
  init(partitioning: HgiWebGPUTessellatorPartitioning, outputPrimitive: HgiWebGPUTessellatorOutputPrimitive): void {
    this.m_partitioning = partitioning
    this.m_originalPartitioning = partitioning
    switch (partitioning) {
      case HgiWebGPUTessellatorPartitioning.FractionalOdd:
        this.m_parity = Parity.Odd
        break
      case HgiWebGPUTessellatorPartitioning.FractionalEven:
        this.m_parity = Parity.Even
        break
      default:
        break
    }
    this.m_originalParity = this.m_parity
    this.m_outputPrimitive = outputPrimitive
    this.m_NumPoints = 0
    this.m_NumIndices = 0
  }

  /** tessellator.cpp:1546-1577 */
  getPointCount(): number { return this.m_NumPoints }
  getIndexCount(): number { return this.m_NumIndices }
  /** The points' (u, v) in 16.16 fixed point, two per point. */
  getPointsFixed(): Int32Array { return this.m_Point.subarray(0, this.m_NumPoints * 2) }
  /** The points' (u, v) as DefinePoint stores them (tessellator.cpp:1580-1588). */
  getPoints(): Float32Array {
    const out = new Float32Array(this.m_NumPoints * 2)
    for (let i = 0; i < out.length; i++) out[i] = fixedToFloat(this.m_Point[i]!)
    return out
  }
  getIndices(): Int32Array { return this.m_Index.subarray(0, this.m_NumIndices) }

  // tessellator.hpp:192-205
  private odd(): boolean { return this.m_parity === Parity.Odd }
  private setTessellationParity(parity: Parity): void { this.m_parity = parity }
  private hwIntegerPartitioning(): boolean {
    return this.m_partitioning === HgiWebGPUTessellatorPartitioning.Integer ||
      this.m_partitioning === HgiWebGPUTessellatorPartitioning.Pow2
  }
  private restorePartitioning(): void { this.m_partitioning = this.m_originalPartitioning }
  private overridePartitioning(p: HgiWebGPUTessellatorPartitioning): void { this.m_partitioning = p }

  /** Metal's pow2 partitioning rounds each factor up to a power of two
   *  before the fixed-function stage (the native capture,
   *  tests/fixtures/tessellator/: pow2 factor 3 tessellates as 4), which is
   *  what Direct3D leaves to the HLSL helper code:
   *  CHLSLTessellator::RoundUpTessFactor (tessellator.cpp:2657-2673). The
   *  hardware stage itself treats pow2 as integer (tessellator.cpp:526). */
  private _roundUpPow2(tessFactor: number): number {
    if (this.m_originalPartitioning !== HgiWebGPUTessellatorPartitioning.Pow2) return tessFactor
    const bits = _bits(tessFactor)
    if (bits & 0x007fffff) return _fromBits(((bits & 0x7f800000) + 0x00800000) >>> 0)
    return tessFactor
  }

  /** tessellator.cpp:446-498 */
  tessellateQuadDomain(tessFactor_Ueq0: number, tessFactor_Veq0: number, tessFactor_Ueq1: number,
    tessFactor_Veq1: number, insideTessFactor_U: number, insideTessFactor_V: number): void {
    const r = (f: number) => this._roundUpPow2(f)
    const p = this.quadProcessTessFactors(r(tessFactor_Ueq0), r(tessFactor_Veq0), r(tessFactor_Ueq1),
      r(tessFactor_Veq1), r(insideTessFactor_U), r(insideTessFactor_V))
    if (p.bPatchCulled) {
      this.m_NumPoints = 0
      this.m_NumIndices = 0
      return
    } else if (p.bJustDoMinimumTessFactor) {
      this.definePoint(0, 0, 0)
      this.definePoint(FXP_ONE, 0, 1)
      this.definePoint(FXP_ONE, FXP_ONE, 2)
      this.definePoint(0, FXP_ONE, 3)
      this.m_NumPoints = 4
      switch (this.m_outputPrimitive) {
        case HgiWebGPUTessellatorOutputPrimitive.TriangleCW:
        case HgiWebGPUTessellatorOutputPrimitive.TriangleCCW:
          // function orients them CCW if needed
          this.defineClockwiseTriangle(0, 1, 3, 0)
          this.defineClockwiseTriangle(1, 2, 3, 3)
          this.m_NumIndices = 6
          break
        case HgiWebGPUTessellatorOutputPrimitive.Point:
          this.dumpAllPoints()
          break
        case HgiWebGPUTessellatorOutputPrimitive.Line:
          this.dumpAllPointsAsInOrderLineList()
          break
      }
      return
    }

    this.quadGeneratePoints(p)

    if (this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.Point) {
      this.dumpAllPoints()
      return
    }
    if (this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.Line) {
      this.dumpAllPointsAsInOrderLineList()
      return
    }

    this.quadGenerateConnectivity(p)
  }

  /** The clamping of a factor shared by the quad, tri and isoline processing
   *  (tessellator.cpp:520-541, 1039-1060, 1415-1436). */
  private _bounds(): [number, number] {
    switch (this.m_originalPartitioning) {
      case HgiWebGPUTessellatorPartitioning.FractionalEven:
        return [D3D11_TESSELLATOR_MIN_EVEN_TESSELLATION_FACTOR, D3D11_TESSELLATOR_MAX_EVEN_TESSELLATION_FACTOR]
      case HgiWebGPUTessellatorPartitioning.FractionalOdd:
        return [D3D11_TESSELLATOR_MIN_ODD_TESSELLATION_FACTOR, D3D11_TESSELLATOR_MAX_ODD_TESSELLATION_FACTOR]
      default: // integer and pow2: don't care about pow2 distinction for validation, just treat as integer
        return [D3D11_TESSELLATOR_MIN_ODD_TESSELLATION_FACTOR, D3D11_TESSELLATOR_MAX_EVEN_TESSELLATION_FACTOR]
    }
  }

  /** tessellator.cpp:504-681 */
  private quadProcessTessFactors(tessFactor_Ueq0: number, tessFactor_Veq0: number, tessFactor_Ueq1: number,
    tessFactor_Veq1: number, insideTessFactor_U: number, insideTessFactor_V: number) {
    const p = {
      outsideTessFactor: [0, 0, 0, 0],
      insideTessFactor: [0, 0],
      outsideTessFactorParity: [Parity.Even, Parity.Even, Parity.Even, Parity.Even],
      insideTessFactorParity: [Parity.Even, Parity.Even],
      outsideTessFactorCtx: [_ctx(), _ctx(), _ctx(), _ctx()],
      insideTessFactorCtx: [_ctx(), _ctx()],
      bJustDoMinimumTessFactor: false,
      bPatchCulled: false,
      numPointsForOutsideEdge: [0, 0, 0, 0],
      numPointsForInsideTessFactor: [0, 0],
      insideEdgePointBaseOffset: 0,
    }
    // Is the patch culled?
    if (!(tessFactor_Ueq0 > 0) || // NaN will pass
        !(tessFactor_Veq0 > 0) ||
        !(tessFactor_Ueq1 > 0) ||
        !(tessFactor_Veq1 > 0)) {
      p.bPatchCulled = true
      return p
    }

    // Clamp edge TessFactors
    let [lowerBound, upperBound] = this._bounds()
    tessFactor_Ueq0 = fmin(upperBound, fmax(lowerBound, tessFactor_Ueq0))
    tessFactor_Veq0 = fmin(upperBound, fmax(lowerBound, tessFactor_Veq0))
    tessFactor_Ueq1 = fmin(upperBound, fmax(lowerBound, tessFactor_Ueq1))
    tessFactor_Veq1 = fmin(upperBound, fmax(lowerBound, tessFactor_Veq1))

    if (this.hwIntegerPartitioning()) { // pow2 or integer, round to next int
      tessFactor_Ueq0 = Math.ceil(tessFactor_Ueq0)
      tessFactor_Veq0 = Math.ceil(tessFactor_Veq0)
      tessFactor_Ueq1 = Math.ceil(tessFactor_Ueq1)
      tessFactor_Veq1 = Math.ceil(tessFactor_Veq1)
    }

    // Clamp inside TessFactors
    if (this.m_originalPartitioning === HgiWebGPUTessellatorPartitioning.FractionalOdd) {
      // If any TessFactor will end up > 1 after floatToFixed conversion
      // later, then force the inside TessFactors to be > 1 so there is a
      // picture frame.
      if (tessFactor_Ueq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          tessFactor_Veq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          tessFactor_Ueq1 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          tessFactor_Veq1 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          insideTessFactor_U > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          insideTessFactor_V > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON) {
        // Force picture frame
        lowerBound = Math.fround(D3D11_TESSELLATOR_MIN_ODD_TESSELLATION_FACTOR + EPSILON)
      }
    }

    insideTessFactor_U = fmin(upperBound, fmax(lowerBound, insideTessFactor_U))
    insideTessFactor_V = fmin(upperBound, fmax(lowerBound, insideTessFactor_V))
    // Note the above clamps map NaN to lowerBound

    if (this.hwIntegerPartitioning()) {
      insideTessFactor_U = Math.ceil(insideTessFactor_U)
      insideTessFactor_V = Math.ceil(insideTessFactor_V)
    }

    this.m_NumPoints = 0
    this.m_NumIndices = 0

    // Process tessFactors
    const outsideTessFactor = [tessFactor_Ueq0, tessFactor_Veq0, tessFactor_Ueq1, tessFactor_Veq1]
    const insideTessFactor = [insideTessFactor_U, insideTessFactor_V]
    if (this.hwIntegerPartitioning()) {
      for (let edge = 0; edge < QUAD_EDGES; edge++) {
        p.outsideTessFactorParity[edge] = isEven(outsideTessFactor[edge]!) ? Parity.Even : Parity.Odd
      }
      for (let axis = 0; axis < QUAD_AXES; axis++) {
        p.insideTessFactorParity[axis] = (isEven(insideTessFactor[axis]!) || insideTessFactor[axis] === 1)
          ? Parity.Even : Parity.Odd
      }
    } else {
      for (let edge = 0; edge < QUAD_EDGES; edge++) p.outsideTessFactorParity[edge] = this.m_originalParity
      p.insideTessFactorParity[U] = p.insideTessFactorParity[V] = this.m_originalParity
    }

    // Save fixed point TessFactors
    for (let edge = 0; edge < QUAD_EDGES; edge++) p.outsideTessFactor[edge] = floatToFixed(outsideTessFactor[edge]!)
    for (let axis = 0; axis < QUAD_AXES; axis++) p.insideTessFactor[axis] = floatToFixed(insideTessFactor[axis]!)

    if (this.hwIntegerPartitioning() || this.odd()) {
      // Special case if all TessFactors are 1
      if (FXP_ONE === p.insideTessFactor[U] && FXP_ONE === p.insideTessFactor[V] &&
          FXP_ONE === p.outsideTessFactor[Ueq0] && FXP_ONE === p.outsideTessFactor[Veq0] &&
          FXP_ONE === p.outsideTessFactor[Ueq1] && FXP_ONE === p.outsideTessFactor[Veq1]) {
        p.bJustDoMinimumTessFactor = true
        return p
      }
    }
    p.bJustDoMinimumTessFactor = false

    // Compute TessFactor-specific metadata
    for (let edge = 0; edge < QUAD_EDGES; edge++) {
      this.setTessellationParity(p.outsideTessFactorParity[edge]!)
      this.computeTessFactorContext(p.outsideTessFactor[edge]!, p.outsideTessFactorCtx[edge]!)
    }
    for (let axis = 0; axis < QUAD_AXES; axis++) {
      this.setTessellationParity(p.insideTessFactorParity[axis]!)
      this.computeTessFactorContext(p.insideTessFactor[axis]!, p.insideTessFactorCtx[axis]!)
    }

    // outside edge offsets and storage
    for (let edge = 0; edge < QUAD_EDGES; edge++) {
      this.setTessellationParity(p.outsideTessFactorParity[edge]!)
      p.numPointsForOutsideEdge[edge] = this.numPointsForTessFactor(p.outsideTessFactor[edge]!)
      this.m_NumPoints += p.numPointsForOutsideEdge[edge]!
    }
    this.m_NumPoints -= 4

    // inside edge offsets
    for (let axis = 0; axis < QUAD_AXES; axis++) {
      this.setTessellationParity(p.insideTessFactorParity[axis]!)
      p.numPointsForInsideTessFactor[axis] = this.numPointsForTessFactor(p.insideTessFactor[axis]!)
      const pointCountMin = (Parity.Odd === p.insideTessFactorParity[axis]) ? 4 : 3
      // max() allows degenerate transition regions when inside TessFactor == 1
      p.numPointsForInsideTessFactor[axis] = Math.max(pointCountMin, p.numPointsForInsideTessFactor[axis]!)
    }

    p.insideEdgePointBaseOffset = this.m_NumPoints

    // inside storage, including interior edges above
    const numInteriorPoints = (p.numPointsForInsideTessFactor[U]! - 2) * (p.numPointsForInsideTessFactor[V]! - 2)
    this.m_NumPoints += numInteriorPoints
    return p
  }

  /** tessellator.cpp:686-786 */
  private quadGeneratePoints(p: ReturnType<HgiWebGPUTessellator['quadProcessTessFactors']>): void {
    // Generate exterior ring edge points, clockwise from top-left
    let pointOffset = 0
    for (let edge = 0; edge < QUAD_EDGES; edge++) {
      const parity = edge & 0x1
      const startPoint = 0
      const endPoint = p.numPointsForOutsideEdge[edge]! - 1
      for (let pt = startPoint; pt < endPoint; pt++, pointOffset++) { // don't include end, since next edge starts with it.
        const q = (edge === 1 || edge === 2) ? pt : endPoint - pt // reverse order
        this.setTessellationParity(p.outsideTessFactorParity[edge]!)
        const fxpParam = this.placePointIn1D(p.outsideTessFactorCtx[edge]!, q)
        if (parity) {
          this.definePoint(fxpParam, (edge === 3) ? FXP_ONE : 0, pointOffset)
        } else {
          this.definePoint((edge === 2) ? FXP_ONE : 0, fxpParam, pointOffset)
        }
      }
    }

    // Generate interior ring points, clockwise from (U==0,V==1) (bottom-left) spiralling toward center
    const startRing = 1
    const minNumPointsForTessFactor = Math.min(p.numPointsForInsideTessFactor[U]!, p.numPointsForInsideTessFactor[V]!)
    const numRings = minNumPointsForTessFactor >> 1 // note for even tess we aren't counting center point here.
    for (let ring = startRing; ring < numRings; ring++) {
      const startPoint = ring
      const endPoint = [p.numPointsForInsideTessFactor[U]! - 1 - startPoint,
        p.numPointsForInsideTessFactor[V]! - 1 - startPoint]
      for (let edge = 0; edge < QUAD_EDGES; edge++) {
        const parity = [edge & 0x1, (edge + 1) & 0x1]
        const perpendicularAxisPoint = (edge < 2) ? startPoint : endPoint[parity[0]!]!
        this.setTessellationParity(p.insideTessFactorParity[parity[0]!]!)
        const fxpPerpParam = this.placePointIn1D(p.insideTessFactorCtx[parity[0]!]!, perpendicularAxisPoint)
        this.setTessellationParity(p.insideTessFactorParity[parity[1]!]!)
        for (let pt = startPoint; pt < endPoint[parity[1]!]!; pt++, pointOffset++) { // don't include end: next edge starts with it.
          const q = (edge === 1 || edge === 2) ? pt : endPoint[parity[1]!]! - (pt - startPoint)
          const fxpParam = this.placePointIn1D(p.insideTessFactorCtx[parity[1]!]!, q)
          if (parity[1]) {
            this.definePoint(fxpPerpParam, fxpParam, pointOffset)
          } else {
            this.definePoint(fxpParam, fxpPerpParam, pointOffset)
          }
        }
      }
    }
    // For even tessellation, the inner "ring" is degenerate - a row of points
    if (p.numPointsForInsideTessFactor[U]! > p.numPointsForInsideTessFactor[V]! &&
        Parity.Even === p.insideTessFactorParity[V]) {
      const startPoint = numRings
      const endPoint = p.numPointsForInsideTessFactor[U]! - 1 - startPoint
      this.setTessellationParity(p.insideTessFactorParity[U]!)
      for (let pt = startPoint; pt <= endPoint; pt++, pointOffset++) {
        const fxpParam = this.placePointIn1D(p.insideTessFactorCtx[U]!, pt)
        this.definePoint(fxpParam, FXP_ONE_HALF, pointOffset)
      }
    } else if (p.numPointsForInsideTessFactor[V]! >= p.numPointsForInsideTessFactor[U]! &&
               Parity.Even === p.insideTessFactorParity[U]) {
      const startPoint = numRings
      const endPoint = p.numPointsForInsideTessFactor[V]! - 1 - startPoint
      this.setTessellationParity(p.insideTessFactorParity[V]!)
      for (let pt = endPoint; pt >= startPoint; pt--, pointOffset++) {
        const fxpParam = this.placePointIn1D(p.insideTessFactorCtx[V]!, pt)
        this.definePoint(FXP_ONE_HALF, fxpParam, pointOffset)
      }
    }
  }

  /** tessellator.cpp:791-961 */
  private quadGenerateConnectivity(p: ReturnType<HgiWebGPUTessellator['quadProcessTessFactors']>): void {
    // Generate primitives for all the concentric rings, one side at a time for each ring
    const startRing = 1
    const numPointRowsToCenter = [(p.numPointsForInsideTessFactor[U]! + 1) >> 1,
      (p.numPointsForInsideTessFactor[V]! + 1) >> 1] // +1 is so even tess includes the center point
    const numRings = Math.min(numPointRowsToCenter[U]!, numPointRowsToCenter[V]!)
    const degeneratePointRing = [ // Even partitioning causes degenerate row of points
      (Parity.Even === p.insideTessFactorParity[V]) ? numPointRowsToCenter[V]! - 1 : -1,
      (Parity.Even === p.insideTessFactorParity[U]) ? numPointRowsToCenter[U]! - 1 : -1]

    const outsideTessFactorCtx = [p.outsideTessFactorCtx[Ueq0]!, p.outsideTessFactorCtx[Veq0]!,
      p.outsideTessFactorCtx[Ueq1]!, p.outsideTessFactorCtx[Veq1]!]
    const outsideTessFactorParity = [p.outsideTessFactorParity[Ueq0]!, p.outsideTessFactorParity[Veq0]!,
      p.outsideTessFactorParity[Ueq1]!, p.outsideTessFactorParity[Veq1]!]
    const numPointsForOutsideEdge = [p.numPointsForOutsideEdge[Ueq0]!, p.numPointsForOutsideEdge[Veq0]!,
      p.numPointsForOutsideEdge[Ueq1]!, p.numPointsForOutsideEdge[Veq1]!]

    let insideEdgePointBaseOffset = p.insideEdgePointBaseOffset
    let outsideEdgePointBaseOffset = 0
    for (let ring = startRing; ring < numRings; ring++) {
      const numPointsForInsideEdge = [p.numPointsForInsideTessFactor[U]! - 2 * ring,
        p.numPointsForInsideTessFactor[V]! - 2 * ring]
      const edge0InsidePointBaseOffset = insideEdgePointBaseOffset
      const edge0OutsidePointBaseOffset = outsideEdgePointBaseOffset

      for (let edge = 0; edge < QUAD_EDGES; edge++) {
        const parity = (edge + 1) & 0x1
        const numTriangles = numPointsForInsideEdge[parity]! + numPointsForOutsideEdge[edge]! - 2
        let insideBaseOffset: number
        let outsideBaseOffset: number
        if (edge === 3) {
          // Patch the indexing so Stitch() sees 2 sequentially increasing
          // rows of points across the wrap to the ring's first point.
          if (ring === degeneratePointRing[parity]) {
            const c2 = this.m_IndexPatchContext2
            c2.baseIndexToInvert = insideEdgePointBaseOffset + 1
            c2.cornerCaseBadValue = outsideEdgePointBaseOffset + numPointsForOutsideEdge[edge]! - 1
            c2.cornerCaseReplacementValue = edge0OutsidePointBaseOffset
            c2.indexInversionEndPoint = (c2.baseIndexToInvert << 1) - 1
            insideBaseOffset = c2.baseIndexToInvert
            outsideBaseOffset = outsideEdgePointBaseOffset
            this.m_bUsingPatchedIndices2 = true
          } else {
            const c = this.m_IndexPatchContext
            c.insidePointIndexDeltaToRealValue = insideEdgePointBaseOffset
            c.insidePointIndexBadValue = numPointsForInsideEdge[parity]! - 1
            c.insidePointIndexReplacementValue = edge0InsidePointBaseOffset
            c.outsidePointIndexPatchBase = c.insidePointIndexBadValue + 1 // past inside patched index range
            c.outsidePointIndexDeltaToRealValue = outsideEdgePointBaseOffset - c.outsidePointIndexPatchBase
            c.outsidePointIndexBadValue = c.outsidePointIndexPatchBase + numPointsForOutsideEdge[edge]! - 1
            c.outsidePointIndexReplacementValue = edge0OutsidePointBaseOffset
            insideBaseOffset = 0
            outsideBaseOffset = c.outsidePointIndexPatchBase
            this.m_bUsingPatchedIndices = true
          }
        } else if (edge === 2 && ring === degeneratePointRing[parity]) {
          const c2 = this.m_IndexPatchContext2
          c2.baseIndexToInvert = insideEdgePointBaseOffset
          c2.cornerCaseBadValue = -1 // unused
          c2.cornerCaseReplacementValue = -1 // unused
          c2.indexInversionEndPoint = c2.baseIndexToInvert << 1
          insideBaseOffset = c2.baseIndexToInvert
          outsideBaseOffset = outsideEdgePointBaseOffset
          this.m_bUsingPatchedIndices2 = true
        } else {
          insideBaseOffset = insideEdgePointBaseOffset
          outsideBaseOffset = outsideEdgePointBaseOffset
        }
        if (ring === startRing) {
          this.stitchTransition(this.m_NumIndices,
            insideBaseOffset, p.insideTessFactorCtx[parity]!.numHalfTessFactorPoints, p.insideTessFactorParity[parity]!,
            outsideBaseOffset, outsideTessFactorCtx[edge]!.numHalfTessFactorPoints, outsideTessFactorParity[edge]!)
        } else {
          this.stitchRegular(true, Diagonals.Mirrored, this.m_NumIndices,
            numPointsForInsideEdge[parity]!, insideBaseOffset, outsideBaseOffset)
        }
        this.m_bUsingPatchedIndices = false
        this.m_bUsingPatchedIndices2 = false
        this.m_NumIndices += numTriangles * 3
        outsideEdgePointBaseOffset += numPointsForOutsideEdge[edge]! - 1
        if (edge === 2 && ring === degeneratePointRing[parity]) {
          insideEdgePointBaseOffset -= numPointsForInsideEdge[parity]! - 1
        } else {
          insideEdgePointBaseOffset += numPointsForInsideEdge[parity]! - 1
        }
        numPointsForOutsideEdge[edge] = numPointsForInsideEdge[parity]!
      }
      if (startRing === ring) {
        for (let edge = 0; edge < QUAD_EDGES; edge++) {
          outsideTessFactorCtx[edge] = p.insideTessFactorCtx[edge & 1]!
          outsideTessFactorParity[edge] = p.insideTessFactorParity[edge & 1]!
        }
      }
    }

    // Triangulate center - a row of quads if odd
    if (p.numPointsForInsideTessFactor[U]! > p.numPointsForInsideTessFactor[V]! &&
        Parity.Odd === p.insideTessFactorParity[V]) {
      this.m_bUsingPatchedIndices2 = true
      const stripNumQuads = (((p.numPointsForInsideTessFactor[U]! >> 1) - (p.numPointsForInsideTessFactor[V]! >> 1)) << 1) +
        ((Parity.Even === p.insideTessFactorParity[U]) ? 2 : 1)
      const c2 = this.m_IndexPatchContext2
      c2.baseIndexToInvert = outsideEdgePointBaseOffset + stripNumQuads + 2
      c2.cornerCaseBadValue = c2.baseIndexToInvert
      c2.cornerCaseReplacementValue = outsideEdgePointBaseOffset
      c2.indexInversionEndPoint = c2.baseIndexToInvert + c2.baseIndexToInvert + stripNumQuads
      this.stitchRegular(false, Diagonals.InsideToOutside, this.m_NumIndices, stripNumQuads + 1,
        c2.baseIndexToInvert, outsideEdgePointBaseOffset + 1)
      this.m_bUsingPatchedIndices2 = false
      this.m_NumIndices += stripNumQuads * 6
    } else if (p.numPointsForInsideTessFactor[V]! >= p.numPointsForInsideTessFactor[U]! &&
               Parity.Odd === p.insideTessFactorParity[U]) {
      this.m_bUsingPatchedIndices2 = true
      const stripNumQuads = (((p.numPointsForInsideTessFactor[V]! >> 1) - (p.numPointsForInsideTessFactor[U]! >> 1)) << 1) +
        ((Parity.Even === p.insideTessFactorParity[V]) ? 2 : 1)
      const c2 = this.m_IndexPatchContext2
      c2.baseIndexToInvert = outsideEdgePointBaseOffset + stripNumQuads + 1
      c2.cornerCaseBadValue = -1 // unused
      c2.indexInversionEndPoint = c2.baseIndexToInvert + c2.baseIndexToInvert + stripNumQuads
      const diag = (Parity.Even === p.insideTessFactorParity[V])
        ? Diagonals.InsideToOutside : Diagonals.InsideToOutsideExceptMiddle
      this.stitchRegular(false, diag, this.m_NumIndices, stripNumQuads + 1,
        c2.baseIndexToInvert, outsideEdgePointBaseOffset)
      this.m_bUsingPatchedIndices2 = false
      this.m_NumIndices += stripNumQuads * 6
    }
  }

  /** tessellator.cpp:967-1017 */
  tessellateTriDomain(tessFactor_Ueq0: number, tessFactor_Veq0: number, tessFactor_Weq0: number,
    insideTessFactor: number): void {
    const r = (f: number) => this._roundUpPow2(f)
    const p = this.triProcessTessFactors(r(tessFactor_Ueq0), r(tessFactor_Veq0), r(tessFactor_Weq0), r(insideTessFactor))
    if (p.bPatchCulled) {
      this.m_NumPoints = 0
      this.m_NumIndices = 0
      return
    } else if (p.bJustDoMinimumTessFactor) {
      this.definePoint(0, FXP_ONE, 0) // V=1 (beginning of Ueq0 edge VW)
      this.definePoint(0, 0, 1) // W=1 (beginning of Veq0 edge WU)
      this.definePoint(FXP_ONE, 0, 2) // U=1 (beginning of Weq0 edge UV)
      this.m_NumPoints = 3
      switch (this.m_outputPrimitive) {
        case HgiWebGPUTessellatorOutputPrimitive.TriangleCW:
        case HgiWebGPUTessellatorOutputPrimitive.TriangleCCW:
          this.defineClockwiseTriangle(0, 1, 2, this.m_NumIndices)
          this.m_NumIndices = 3
          break
        case HgiWebGPUTessellatorOutputPrimitive.Point:
          this.dumpAllPoints()
          break
        case HgiWebGPUTessellatorOutputPrimitive.Line:
          this.dumpAllPointsAsInOrderLineList()
          break
      }
      return
    }

    this.triGeneratePoints(p)

    if (this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.Point) {
      this.dumpAllPoints()
      return
    }
    if (this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.Line) {
      this.dumpAllPointsAsInOrderLineList()
      return
    }

    this.triGenerateConnectivity(p)
  }

  /** tessellator.cpp:1023-1187 */
  private triProcessTessFactors(tessFactor_Ueq0: number, tessFactor_Veq0: number, tessFactor_Weq0: number,
    insideTessFactor: number) {
    const p = {
      outsideTessFactor: [0, 0, 0],
      insideTessFactor: 0,
      outsideTessFactorParity: [Parity.Even, Parity.Even, Parity.Even],
      insideTessFactorParity: Parity.Even,
      outsideTessFactorCtx: [_ctx(), _ctx(), _ctx()],
      insideTessFactorCtx: _ctx(),
      bJustDoMinimumTessFactor: false,
      bPatchCulled: false,
      numPointsForOutsideEdge: [0, 0, 0],
      numPointsForInsideTessFactor: 0,
      insideEdgePointBaseOffset: 0,
    }
    // Is the patch culled?
    if (!(tessFactor_Ueq0 > 0) || !(tessFactor_Veq0 > 0) || !(tessFactor_Weq0 > 0)) {
      p.bPatchCulled = true
      return p
    }

    // Clamp edge TessFactors
    let [lowerBound, upperBound] = this._bounds()
    tessFactor_Ueq0 = fmin(upperBound, fmax(lowerBound, tessFactor_Ueq0))
    tessFactor_Veq0 = fmin(upperBound, fmax(lowerBound, tessFactor_Veq0))
    tessFactor_Weq0 = fmin(upperBound, fmax(lowerBound, tessFactor_Weq0))

    if (this.hwIntegerPartitioning()) {
      tessFactor_Ueq0 = Math.ceil(tessFactor_Ueq0)
      tessFactor_Veq0 = Math.ceil(tessFactor_Veq0)
      tessFactor_Weq0 = Math.ceil(tessFactor_Weq0)
    }

    // Clamp inside TessFactors
    if (this.m_originalPartitioning === HgiWebGPUTessellatorPartitioning.FractionalOdd) {
      if (tessFactor_Ueq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          tessFactor_Veq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
          tessFactor_Weq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON) {
        // Force picture frame
        lowerBound = Math.fround(D3D11_TESSELLATOR_MIN_ODD_TESSELLATION_FACTOR + EPSILON)
      }
    }

    insideTessFactor = fmin(upperBound, fmax(lowerBound, insideTessFactor))
    // Note the above clamps map NaN to lowerBound

    if (this.hwIntegerPartitioning()) {
      insideTessFactor = Math.ceil(insideTessFactor)
    }

    this.m_NumPoints = 0
    this.m_NumIndices = 0

    // Process tessFactors
    const outsideTessFactor = [tessFactor_Ueq0, tessFactor_Veq0, tessFactor_Weq0]
    if (this.hwIntegerPartitioning()) {
      for (let edge = 0; edge < TRI_EDGES; edge++) {
        p.outsideTessFactorParity[edge] = isEven(outsideTessFactor[edge]!) ? Parity.Even : Parity.Odd
      }
      p.insideTessFactorParity = (isEven(insideTessFactor) || insideTessFactor === 1) ? Parity.Even : Parity.Odd
    } else {
      for (let edge = 0; edge < TRI_EDGES; edge++) p.outsideTessFactorParity[edge] = this.m_originalParity
      p.insideTessFactorParity = this.m_originalParity
    }

    // Save fixed point TessFactors
    for (let edge = 0; edge < TRI_EDGES; edge++) p.outsideTessFactor[edge] = floatToFixed(outsideTessFactor[edge]!)
    p.insideTessFactor = floatToFixed(insideTessFactor)

    if (this.hwIntegerPartitioning() || this.odd()) {
      // Special case if all TessFactors are 1
      if (FXP_ONE === p.insideTessFactor && FXP_ONE === p.outsideTessFactor[Ueq0] &&
          FXP_ONE === p.outsideTessFactor[Veq0] && FXP_ONE === p.outsideTessFactor[Weq0]) {
        p.bJustDoMinimumTessFactor = true
        return p
      }
    }
    p.bJustDoMinimumTessFactor = false

    // Compute per-TessFactor metadata
    for (let edge = 0; edge < TRI_EDGES; edge++) {
      this.setTessellationParity(p.outsideTessFactorParity[edge]!)
      this.computeTessFactorContext(p.outsideTessFactor[edge]!, p.outsideTessFactorCtx[edge]!)
    }
    this.setTessellationParity(p.insideTessFactorParity)
    this.computeTessFactorContext(p.insideTessFactor, p.insideTessFactorCtx)

    // outside edge offsets and storage
    for (let edge = 0; edge < TRI_EDGES; edge++) {
      this.setTessellationParity(p.outsideTessFactorParity[edge]!)
      p.numPointsForOutsideEdge[edge] = this.numPointsForTessFactor(p.outsideTessFactor[edge]!)
      this.m_NumPoints += p.numPointsForOutsideEdge[edge]!
    }
    this.m_NumPoints -= 3

    // inside edge offsets
    this.setTessellationParity(p.insideTessFactorParity)
    p.numPointsForInsideTessFactor = this.numPointsForTessFactor(p.insideTessFactor)
    {
      const pointCountMin = this.odd() ? 4 : 3
      // max() allows degenerate transition regions when inside TessFactor == 1
      p.numPointsForInsideTessFactor = Math.max(pointCountMin, p.numPointsForInsideTessFactor)
    }

    p.insideEdgePointBaseOffset = this.m_NumPoints

    // inside storage, including interior edges above
    {
      const numInteriorRings = (p.numPointsForInsideTessFactor >> 1) - 1
      let numInteriorPoints: number
      if (this.odd()) {
        numInteriorPoints = TRI_EDGES * (numInteriorRings * (numInteriorRings + 1) - numInteriorRings)
      } else {
        numInteriorPoints = TRI_EDGES * (numInteriorRings * (numInteriorRings + 1)) + 1
      }
      this.m_NumPoints += numInteriorPoints
    }
    return p
  }

  /** tessellator.cpp:1192-1284 */
  private triGeneratePoints(p: ReturnType<HgiWebGPUTessellator['triProcessTessFactors']>): void {
    // Generate exterior ring edge points, clockwise starting from point V (VW, the U==0 edge)
    let pointOffset = 0
    for (let edge = 0; edge < TRI_EDGES; edge++) {
      const parity = edge & 0x1
      const startPoint = 0
      const endPoint = p.numPointsForOutsideEdge[edge]! - 1
      for (let pt = startPoint; pt < endPoint; pt++, pointOffset++) {
        const q = parity ? pt : endPoint - pt
        this.setTessellationParity(p.outsideTessFactorParity[edge]!)
        const fxpParam = this.placePointIn1D(p.outsideTessFactorCtx[edge]!, q)
        if (edge === 0) {
          this.definePoint(0, fxpParam, pointOffset)
        } else {
          this.definePoint(fxpParam, (edge === 2) ? (FXP_ONE - fxpParam) >>> 0 : 0, pointOffset)
        }
      }
    }

    // Generate interior ring points, clockwise spiralling in
    this.setTessellationParity(p.insideTessFactorParity)
    const startRing = 1
    const numRings = p.numPointsForInsideTessFactor >> 1
    for (let ring = startRing; ring < numRings; ring++) {
      const startPoint = ring
      const endPoint = p.numPointsForInsideTessFactor - 1 - startPoint
      for (let edge = 0; edge < TRI_EDGES; edge++) {
        const parity = edge & 0x1
        const perpendicularAxisPoint = startPoint
        let fxpPerpParam = this.placePointIn1D(p.insideTessFactorCtx, perpendicularAxisPoint)
        fxpPerpParam = (fxpPerpParam * FXP_TWO_THIRDS) >>> 0 // Map location to the right size in barycentric space.
        fxpPerpParam = ((fxpPerpParam + FXP_ONE_HALF) >>> FXP_FRACTION_BITS) // get back to n.16
        for (let pt = startPoint; pt < endPoint; pt++, pointOffset++) {
          const q = parity ? pt : endPoint - (pt - startPoint)
          const fxpParam = this.placePointIn1D(p.insideTessFactorCtx, q)
          // edge0 VW, has perpendicular parameter U constant
          // edge1 WU, has perpendicular parameter V constant
          // edge2 UV, has perpendicular parameter W constant
          const deriv = 2 // reciprocal is the rate of change of edge-parallel parameters as they are pushed into the triangle
          const d = Math.floor((fxpPerpParam + 1) / deriv)
          switch (edge) {
            case 0:
              this.definePoint(fxpPerpParam, (fxpParam - d) >>> 0, pointOffset)
              break
            case 1:
              this.definePoint((fxpParam - d) >>> 0, fxpPerpParam, pointOffset)
              break
            case 2:
              this.definePoint((fxpParam - d) >>> 0, (FXP_ONE - (fxpParam - d) - fxpPerpParam) >>> 0, pointOffset)
              break
          }
        }
      }
    }
    if (!this.odd()) {
      // Last point is the point at the center.
      this.definePoint(FXP_ONE_THIRD, FXP_ONE_THIRD, pointOffset)
    }
  }

  /** tessellator.cpp:1289-1377 */
  private triGenerateConnectivity(p: ReturnType<HgiWebGPUTessellator['triProcessTessFactors']>): void {
    // Generate primitives for all the concentric rings, one side at a time for each ring
    const startRing = 1
    const numRings = (p.numPointsForInsideTessFactor + 1) >> 1 // +1 is so even tess includes the center point
    const outsideTessFactorCtx = [p.outsideTessFactorCtx[Ueq0]!, p.outsideTessFactorCtx[Veq0]!, p.outsideTessFactorCtx[Weq0]!]
    const outsideTessFactorParity = [p.outsideTessFactorParity[Ueq0]!, p.outsideTessFactorParity[Veq0]!,
      p.outsideTessFactorParity[Weq0]!]
    const numPointsForOutsideEdge = [p.numPointsForOutsideEdge[Ueq0]!, p.numPointsForOutsideEdge[Veq0]!,
      p.numPointsForOutsideEdge[Weq0]!]

    let insideEdgePointBaseOffset = p.insideEdgePointBaseOffset
    let outsideEdgePointBaseOffset = 0
    for (let ring = startRing; ring < numRings; ring++) {
      const numPointsForInsideEdge = p.numPointsForInsideTessFactor - 2 * ring
      const edge0InsidePointBaseOffset = insideEdgePointBaseOffset
      const edge0OutsidePointBaseOffset = outsideEdgePointBaseOffset
      for (let edge = 0; edge < TRI_EDGES; edge++) {
        const numTriangles = numPointsForInsideEdge + numPointsForOutsideEdge[edge]! - 2
        let insideBaseOffset: number
        let outsideBaseOffset: number
        if (edge === 2) {
          const c = this.m_IndexPatchContext
          c.insidePointIndexDeltaToRealValue = insideEdgePointBaseOffset
          c.insidePointIndexBadValue = numPointsForInsideEdge - 1
          c.insidePointIndexReplacementValue = edge0InsidePointBaseOffset
          c.outsidePointIndexPatchBase = c.insidePointIndexBadValue + 1 // past inside patched index range
          c.outsidePointIndexDeltaToRealValue = outsideEdgePointBaseOffset - c.outsidePointIndexPatchBase
          c.outsidePointIndexBadValue = c.outsidePointIndexPatchBase + numPointsForOutsideEdge[edge]! - 1
          c.outsidePointIndexReplacementValue = edge0OutsidePointBaseOffset
          this.m_bUsingPatchedIndices = true
          insideBaseOffset = 0
          outsideBaseOffset = c.outsidePointIndexPatchBase
        } else {
          insideBaseOffset = insideEdgePointBaseOffset
          outsideBaseOffset = outsideEdgePointBaseOffset
        }
        if (ring === startRing) {
          this.stitchTransition(this.m_NumIndices,
            insideBaseOffset, p.insideTessFactorCtx.numHalfTessFactorPoints, p.insideTessFactorParity,
            outsideBaseOffset, outsideTessFactorCtx[edge]!.numHalfTessFactorPoints, outsideTessFactorParity[edge]!)
        } else {
          this.stitchRegular(true, Diagonals.Mirrored, this.m_NumIndices,
            numPointsForInsideEdge, insideBaseOffset, outsideBaseOffset)
        }
        if (edge === 2) {
          this.m_bUsingPatchedIndices = false
        }
        this.m_NumIndices += numTriangles * 3
        outsideEdgePointBaseOffset += numPointsForOutsideEdge[edge]! - 1
        insideEdgePointBaseOffset += numPointsForInsideEdge - 1
        numPointsForOutsideEdge[edge] = numPointsForInsideEdge
      }
      if (startRing === ring) {
        for (let edge = 0; edge < TRI_EDGES; edge++) {
          outsideTessFactorCtx[edge] = p.insideTessFactorCtx
          outsideTessFactorParity[edge] = p.insideTessFactorParity
        }
      }
    }
    if (this.odd()) {
      // Triangulate center (a single triangle)
      this.defineClockwiseTriangle(outsideEdgePointBaseOffset, outsideEdgePointBaseOffset + 1,
        outsideEdgePointBaseOffset + 2, this.m_NumIndices)
      this.m_NumIndices += 3
    }
  }

  /** tessellator.cpp:1382-1394 */
  tessellateIsoLineDomain(TessFactor_V_LineDensity: number, TessFactor_U_LineDetail: number): void {
    const p = this.isoLineProcessTessFactors(TessFactor_V_LineDensity, TessFactor_U_LineDetail)
    if (p.bPatchCulled) {
      this.m_NumPoints = 0
      this.m_NumIndices = 0
      return
    }
    this.isoLineGeneratePoints(p)
    this.isoLineGenerateConnectivity(p)
  }

  /** tessellator.cpp:1399-1485 */
  private isoLineProcessTessFactors(TessFactor_V_LineDensity: number, TessFactor_U_LineDetail: number) {
    const p = {
      lineDensityParity: Parity.Even,
      lineDetailParity: Parity.Even,
      lineDensityTessFactorCtx: _ctx(),
      lineDetailTessFactorCtx: _ctx(),
      bPatchCulled: false,
      numPointsPerLine: 0,
      numLines: 0,
    }
    // Is the patch culled?
    if (!(TessFactor_V_LineDensity > 0) || !(TessFactor_U_LineDetail > 0)) {
      p.bPatchCulled = true
      return p
    }

    // Clamp edge TessFactors
    const [lowerBound, upperBound] = this._bounds()
    TessFactor_V_LineDensity = fmin(D3D11_TESSELLATOR_MAX_ISOLINE_DENSITY_TESSELLATION_FACTOR,
      fmax(D3D11_TESSELLATOR_MIN_ISOLINE_DENSITY_TESSELLATION_FACTOR, TessFactor_V_LineDensity))
    TessFactor_U_LineDetail = fmin(upperBound, fmax(lowerBound, TessFactor_U_LineDetail))

    this.m_NumPoints = 0
    this.m_NumIndices = 0

    // Process tessFactors
    if (this.hwIntegerPartitioning()) {
      TessFactor_U_LineDetail = Math.ceil(TessFactor_U_LineDetail)
      p.lineDetailParity = isEven(TessFactor_U_LineDetail) ? Parity.Even : Parity.Odd
    } else {
      p.lineDetailParity = this.m_originalParity
    }

    const fxpTessFactor_U_LineDetail = floatToFixed(TessFactor_U_LineDetail)

    this.setTessellationParity(p.lineDetailParity)

    this.computeTessFactorContext(fxpTessFactor_U_LineDetail, p.lineDetailTessFactorCtx)
    p.numPointsPerLine = this.numPointsForTessFactor(fxpTessFactor_U_LineDetail)

    this.overridePartitioning(HgiWebGPUTessellatorPartitioning.Integer)

    TessFactor_V_LineDensity = Math.ceil(TessFactor_V_LineDensity)
    p.lineDensityParity = isEven(TessFactor_V_LineDensity) ? Parity.Even : Parity.Odd
    this.setTessellationParity(p.lineDensityParity)
    const fxpTessFactor_V_LineDensity = floatToFixed(TessFactor_V_LineDensity)
    this.computeTessFactorContext(fxpTessFactor_V_LineDensity, p.lineDensityTessFactorCtx)

    p.numLines = this.numPointsForTessFactor(fxpTessFactor_V_LineDensity) - 1 // don't draw last line at V == 1.

    this.restorePartitioning()

    // outside edge offsets
    this.m_NumPoints = p.numPointsPerLine * p.numLines
    if (this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.Point) {
      this.m_NumIndices = this.m_NumPoints
    } else { // line
      this.m_NumIndices = p.numLines * (p.numPointsPerLine - 1) * 2
    }
    return p
  }

  /** tessellator.cpp:1490-1507 */
  private isoLineGeneratePoints(p: ReturnType<HgiWebGPUTessellator['isoLineProcessTessFactors']>): void {
    let pointOffset = 0
    for (let line = 0; line < p.numLines; line++) {
      for (let point = 0; point < p.numPointsPerLine; point++) {
        this.setTessellationParity(p.lineDensityParity)
        const fxpV = this.placePointIn1D(p.lineDensityTessFactorCtx, line)
        this.setTessellationParity(p.lineDetailParity)
        const fxpU = this.placePointIn1D(p.lineDetailTessFactorCtx, point)
        this.definePoint(fxpU, fxpV, pointOffset++)
      }
    }
  }

  /** tessellator.cpp:1512-1541 */
  private isoLineGenerateConnectivity(p: ReturnType<HgiWebGPUTessellator['isoLineProcessTessFactors']>): void {
    let pointOffset = 0
    let indexOffset = 0
    if (this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.Point) {
      for (let line = 0; line < p.numLines; line++) {
        for (let point = 0; point < p.numPointsPerLine; point++) {
          this.defineIndex(pointOffset++, indexOffset++)
        }
      }
    } else { // line
      for (let line = 0; line < p.numLines; line++) {
        for (let point = 0; point < p.numPointsPerLine; point++) {
          if (point > 0) {
            this.defineIndex(pointOffset - 1, indexOffset++)
            this.defineIndex(pointOffset, indexOffset++)
          }
          pointOffset++
        }
      }
    }
  }

  /** tessellator.cpp:1580-1588 */
  private definePoint(fxpU: number, fxpV: number, pointStorageOffset: number): number {
    this.m_Point[pointStorageOffset * 2] = fxpU
    this.m_Point[pointStorageOffset * 2 + 1] = fxpV
    return pointStorageOffset
  }

  /** tessellator.cpp:1593-1600 */
  private defineIndex(index: number, indexStorageOffset: number): void {
    index = this.patchIndexValue(index)
    this.m_Index[indexStorageOffset] = index
  }

  /** tessellator.cpp:1605-1620: inputs a clockwise triangle, stores a CW or
   *  CCW triangle depending on the state. */
  private defineClockwiseTriangle(index0: number, index1: number, index2: number, indexStorageBaseOffset: number): void {
    this.defineIndex(index0, indexStorageBaseOffset)
    const bWantClockwise = this.m_outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.TriangleCW
    if (bWantClockwise) {
      this.defineIndex(index1, indexStorageBaseOffset + 1)
      this.defineIndex(index2, indexStorageBaseOffset + 2)
    } else {
      this.defineIndex(index2, indexStorageBaseOffset + 1)
      this.defineIndex(index1, indexStorageBaseOffset + 2)
    }
  }

  /** tessellator.cpp:1625-1631 */
  private dumpAllPoints(): void {
    for (let p = 0; p < this.m_NumPoints; p++) this.defineIndex(p, this.m_NumIndices++)
  }

  /** tessellator.cpp:1636-1643 */
  private dumpAllPointsAsInOrderLineList(): void {
    for (let p = 1; p < this.m_NumPoints; p++) {
      this.defineIndex(p - 1, this.m_NumIndices++)
      this.defineIndex(p, this.m_NumIndices++)
    }
  }

  /** tessellator.cpp:1683-1695 */
  private numPointsForTessFactor(fxpTessFactor: number): number {
    if (this.odd()) {
      return (fxpCeil(FXP_ONE_HALF + Math.floor((fxpTessFactor + 1) / 2)) * 2) >>> FXP_FRACTION_BITS
    }
    return ((fxpCeil(Math.floor((fxpTessFactor + 1) / 2)) * 2) >>> FXP_FRACTION_BITS) + 1
  }

  /** tessellator.cpp:1700-1750 */
  private computeTessFactorContext(fxpTessFactor: number, ctx: TessFactorContext): void {
    let fxpHalfTessFactor = Math.floor((fxpTessFactor + 1) / 2)
    if (this.odd() || fxpHalfTessFactor === FXP_ONE_HALF) { // fxpHalfTessFactor == 1/2 if TessFactor is 1, but we're pretending we are even.
      fxpHalfTessFactor += FXP_ONE_HALF
    }
    const fxpFloorHalfTessFactor = fxpFloor(fxpHalfTessFactor)
    const fxpCeilHalfTessFactor = fxpCeil(fxpHalfTessFactor)
    ctx.fxpHalfTessFactorFraction = fxpHalfTessFactor - fxpFloorHalfTessFactor
    ctx.numHalfTessFactorPoints = fxpCeilHalfTessFactor >>> FXP_FRACTION_BITS // for EVEN, we don't include the point always fixed at the midpoint of the TessFactor
    if (fxpCeilHalfTessFactor === fxpFloorHalfTessFactor) {
      ctx.splitPointOnFloorHalfTessFactor = ctx.numHalfTessFactorPoints + 1 // pick value to cause this to be ignored
    } else if (this.odd()) {
      if (fxpFloorHalfTessFactor === FXP_ONE) {
        ctx.splitPointOnFloorHalfTessFactor = 0
      } else {
        ctx.splitPointOnFloorHalfTessFactor = (RemoveMSB((fxpFloorHalfTessFactor >>> FXP_FRACTION_BITS) - 1) << 1) + 1
      }
    } else {
      ctx.splitPointOnFloorHalfTessFactor = (RemoveMSB(fxpFloorHalfTessFactor >>> FXP_FRACTION_BITS) << 1) + 1
    }
    let numFloorSegments = (fxpFloorHalfTessFactor * 2) >>> FXP_FRACTION_BITS
    let numCeilSegments = (fxpCeilHalfTessFactor * 2) >>> FXP_FRACTION_BITS
    if (this.odd()) {
      numFloorSegments -= 1
      numCeilSegments -= 1
    }
    ctx.fxpInvNumSegmentsOnFloorTessFactor = s_fixedReciprocal[numFloorSegments]!
    ctx.fxpInvNumSegmentsOnCeilTessFactor = s_fixedReciprocal[numCeilSegments]!
  }

  /** tessellator.cpp:1755-1807 */
  private placePointIn1D(ctx: TessFactorContext, point: number): number {
    let bFlip: boolean
    if (point >= ctx.numHalfTessFactorPoints) {
      point = (ctx.numHalfTessFactorPoints << 1) - point
      if (this.odd()) point -= 1
      bFlip = true
    } else {
      bFlip = false
    }
    if (point === ctx.numHalfTessFactorPoints) {
      return FXP_ONE_HALF // special casing middle since 16 bit fixed math below can't reproduce 0.5 exactly
    }
    const indexOnCeilHalfTessFactor = point
    let indexOnFloorHalfTessFactor = indexOnCeilHalfTessFactor
    if (point > ctx.splitPointOnFloorHalfTessFactor) {
      indexOnFloorHalfTessFactor -= 1
    }
    // The products and the lerp below stay within 32 bits (tessellator.cpp:1782-1795).
    const fxpLocationOnFloorHalfTessFactor = indexOnFloorHalfTessFactor * ctx.fxpInvNumSegmentsOnFloorTessFactor
    const fxpLocationOnCeilHalfTessFactor = indexOnCeilHalfTessFactor * ctx.fxpInvNumSegmentsOnCeilTessFactor
    let fxpLocation = (fxpLocationOnFloorHalfTessFactor * (FXP_ONE - ctx.fxpHalfTessFactorFraction) +
      fxpLocationOnCeilHalfTessFactor * ctx.fxpHalfTessFactorFraction) >>> 0
    fxpLocation = ((fxpLocation + FXP_ONE_HALF) >>> 0) >>> FXP_FRACTION_BITS // get back to n.16
    if (bFlip) {
      fxpLocation = FXP_ONE - fxpLocation
    }
    return fxpLocation
  }

  /** tessellator.cpp:1812-1894 */
  private stitchRegular(bTrapezoid: boolean, diagonals: Diagonals, baseIndexOffset: number,
    numInsideEdgePoints: number, insideEdgePointBaseOffset: number, outsideEdgePointBaseOffset: number): void {
    let insidePoint = insideEdgePointBaseOffset
    let outsidePoint = outsideEdgePointBaseOffset
    if (bTrapezoid) {
      this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
      baseIndexOffset += 3; outsidePoint++
    }
    let p: number
    switch (diagonals) {
      case Diagonals.InsideToOutside:
        // Diagonals pointing from inside edge forward towards outside edge
        for (p = 0; p < numInsideEdgePoints - 1; p++) {
          this.defineClockwiseTriangle(insidePoint, outsidePoint, outsidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          this.defineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          insidePoint++; outsidePoint++
        }
        break
      case Diagonals.InsideToOutsideExceptMiddle: // Assumes ODD tessellation
        // First half
        for (p = 0; p < Math.trunc(numInsideEdgePoints / 2) - 1; p++) {
          this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
          baseIndexOffset += 3
          this.defineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          insidePoint++; outsidePoint++
        }
        // Middle
        this.defineClockwiseTriangle(outsidePoint, insidePoint + 1, insidePoint, baseIndexOffset)
        baseIndexOffset += 3
        this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3
        insidePoint++; outsidePoint++; p += 2
        // Second half
        for (; p < numInsideEdgePoints; p++) {
          this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
          baseIndexOffset += 3
          this.defineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          insidePoint++; outsidePoint++
        }
        break
      case Diagonals.Mirrored:
        // First half, diagonals pointing from outside of outside edge to inside of inside edge
        for (p = 0; p < Math.trunc(numInsideEdgePoints / 2); p++) {
          this.defineClockwiseTriangle(outsidePoint, insidePoint + 1, insidePoint, baseIndexOffset)
          baseIndexOffset += 3
          this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          insidePoint++; outsidePoint++
        }
        // Second half, diagonals pointing from inside of inside edge to outside of outside edge
        for (; p < numInsideEdgePoints - 1; p++) {
          this.defineClockwiseTriangle(insidePoint, outsidePoint, outsidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          this.defineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset)
          baseIndexOffset += 3
          insidePoint++; outsidePoint++
        }
        break
    }
    if (bTrapezoid) {
      this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
      baseIndexOffset += 3
    }
  }

  /** tessellator.cpp:1899-2072 (without the XBox 360 tables). */
  private stitchTransition(baseIndexOffset: number,
    insideEdgePointBaseOffset: number, insideNumHalfTessFactorPoints: number, insideEdgeTessFactorParity: Parity,
    outsideEdgePointBaseOffset: number, outsideNumHalfTessFactorPoints: number, outsideTessFactorParity: Parity): void {
    if (Parity.Odd === insideEdgeTessFactorParity) insideNumHalfTessFactorPoints -= 1
    if (Parity.Odd === outsideTessFactorParity) outsideNumHalfTessFactorPoints -= 1
    // Walk first half
    let outsidePoint = outsideEdgePointBaseOffset
    let insidePoint = insideEdgePointBaseOffset

    // iStart,iEnd are a small optimization so the loop below doesn't have to go from 0 up to 31
    const iStart = Math.min(loopStart[insideNumHalfTessFactorPoints]!, loopStart[outsideNumHalfTessFactorPoints]!)
    const iEnd = Math.max(loopEnd[insideNumHalfTessFactorPoints]!, loopEnd[outsideNumHalfTessFactorPoints]!)

    if (finalPointPositionTable[0]! < outsideNumHalfTessFactorPoints) { // since we dont' start the loop at 0 below, we need a special case.
      // Advance outside
      this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
      baseIndexOffset += 3; outsidePoint++
    }

    for (let i = iStart; i <= iEnd; i++) {
      if (finalPointPositionTable[i]! < insideNumHalfTessFactorPoints) {
        // Advance inside
        this.defineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3; insidePoint++
      }
      if (finalPointPositionTable[i]! < outsideNumHalfTessFactorPoints) {
        // Advance outside
        this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
        baseIndexOffset += 3; outsidePoint++
      }
    }

    if (insideEdgeTessFactorParity !== outsideTessFactorParity || insideEdgeTessFactorParity === Parity.Odd) {
      if (insideEdgeTessFactorParity === outsideTessFactorParity) {
        // Quad in the middle
        this.defineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3
        this.defineClockwiseTriangle(insidePoint + 1, outsidePoint, outsidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3
        insidePoint++
        outsidePoint++
      } else if (Parity.Even === insideEdgeTessFactorParity) {
        // Triangle pointing inside
        this.defineClockwiseTriangle(insidePoint, outsidePoint, outsidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3
        outsidePoint++
      } else {
        // Triangle pointing outside
        this.defineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3
        insidePoint++
      }
    }

    // Walk second half.
    for (let i = iEnd; i >= iStart; i--) {
      if (finalPointPositionTable[i]! < outsideNumHalfTessFactorPoints) {
        // Advance outside
        this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
        baseIndexOffset += 3; outsidePoint++
      }
      if (finalPointPositionTable[i]! < insideNumHalfTessFactorPoints) {
        // Advance inside
        this.defineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset)
        baseIndexOffset += 3; insidePoint++
      }
    }
    // Below case is not needed if we didn't optimize loop above and made it run from 31 down to 0.
    if (finalPointPositionTable[0]! < outsideNumHalfTessFactorPoints) {
      this.defineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset)
      baseIndexOffset += 3; outsidePoint++
    }
  }

  /** tessellator.cpp:2077-2115 */
  private patchIndexValue(index: number): number {
    if (this.m_bUsingPatchedIndices) {
      const c = this.m_IndexPatchContext
      if (index >= c.outsidePointIndexPatchBase) { // assumed remapped outide indices are > remapped inside vertices
        if (index === c.outsidePointIndexBadValue) index = c.outsidePointIndexReplacementValue
        else index += c.outsidePointIndexDeltaToRealValue
      } else {
        if (index === c.insidePointIndexBadValue) index = c.insidePointIndexReplacementValue
        else index += c.insidePointIndexDeltaToRealValue
      }
    } else if (this.m_bUsingPatchedIndices2) {
      const c2 = this.m_IndexPatchContext2
      if (index >= c2.baseIndexToInvert) {
        if (index === c2.cornerCaseBadValue) index = c2.cornerCaseReplacementValue
        else index = c2.indexInversionEndPoint - index
      } else if (index === c2.cornerCaseBadValue) {
        index = c2.cornerCaseReplacementValue
      }
    }
    return index
  }
}
