// Ported from Microsoft's Direct3D 11 reference tessellator
//  (github.com/microsoft/DirectX-Specs
//  d3d/archive/images/d3d11/tessellator.cpp, tessellator.hpp, commit 98063a7).
// Copyright (c) Microsoft Corporation. MIT License.
// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The WGSL compute kernels of HgiWebGPU's tessellation emulation
// (packages/usd/docs/imaging-i2.md section 2.2.1): the Direct3D 11
// fixed-function tessellator of tessellator.ts (a port of Microsoft's
// reference CHWTessellator, tessellator.cpp of github.com/microsoft/
// DirectX-Specs d3d/archive/images/d3d11 at 98063a7) rendered function by
// function in WGSL, one invocation per patch, for the quad and triangle
// domains Metal tessellates (Metal has no isoline domain; hgiMetal draws
// isoline patches as triangles, graphicsPipeline.mm:208-221).
//
// Three entry points run per patch draw, in one compute pass:
// - countEntry: each patch's point and index counts (QuadProcessTessFactors
//   / TriProcessTessFactors, and the connectivity walk without writes);
// - scanEntry (one workgroup): exclusive prefix sums of the counts, the
//   draw's slice of the point and index pools, and its indexed indirect
//   draw arguments;
// - writeEntry: the points, as (patch, u, v) with u and v in the
//   reference's 16.16 fixed point, and the triangle indices into the point
//   pool, in the reference's order and winding (DefineClockwiseTriangle).
// The emulated post-tessellation vertex stage
// (HgiWebGPUPostTessVertexShaderSection) reads the point of each index.
//
// tessellator.ts is the readable reference; tests/tessellatorWGSL.test.ts
// checks this source runs the same algorithm (it is executed in Safari by
// tests/browser/storm-image/tessellator/run.mjs against tessellator.ts).

export const HgiWebGPUTessellatorWGSL = /* wgsl */ `
struct Params {
  patchCount: u32,
  // Index of the draw's first factor half: the factor buffer's binding
  // offset / 2 + patchStart * halvesPerPatch.
  firstFactorHalf: u32,
  halvesPerPatch: u32,
  // 0: quad, 1: triangle
  domain: u32,
  // D3D11_TESSELLATOR_PARTITIONING: 0 integer, 1 pow2, 2 fractional odd, 3 fractional even
  partitioning: u32,
  // D3D11_TESSELLATOR_OUTPUT_TRIANGLE_CW (1) or _CCW (0)
  outputCW: u32,
  instanceCount: u32,
  // Word offset of the draw's DrawIndexedIndirect arguments in state.
  argsWord: u32,
  pointCapacity: u32,
  indexCapacity: u32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> factors: array<u32>;
// Per patch: point count and index count (countEntry), then their
// exclusive prefix sums (scanEntry).
@group(0) @binding(2) var<storage, read_write> counts: array<u32>;
// Per point: patch (from the draw's first patch), u, v (16.16 fixed point).
@group(0) @binding(3) var<storage, read_write> points: array<u32>;
@group(0) @binding(4) var<storage, read_write> indices: array<u32>;
// [0] point cursor, [1] index cursor, [2] points needed, [3] indices needed,
// [4] draws dropped, [5] the draw's first point, [6] its first index,
// [7] whether it fits; then the indirect arguments of each draw.
@group(0) @binding(5) var<storage, read_write> state: array<u32>;

// tessellator.hpp:43-53
const MIN_ODD: f32 = 1.0;
const MAX_ODD: f32 = 63.0;
const MIN_EVEN: f32 = 2.0;
const MAX_EVEN: f32 = 64.0;

// tessellator.cpp:300-308
const FXP_FRACTION_BITS: u32 = 16u;
const FXP_FRACTION_MASK: u32 = 0x0000ffffu;
const FXP_INTEGER_MASK: u32 = 0x7fff0000u;
const FXP_ONE: u32 = 0x10000u;
const FXP_ONE_THIRD: u32 = 0x00005555u;
const FXP_TWO_THIRDS: u32 = 0x0000aaaau;
const FXP_ONE_HALF: u32 = 0x00008000u;

// tessellator.cpp:557-558
const EPSILON: f32 = 0.0000152587890625;
const MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON: f32 = 1.00000762939453125;

const PARITY_EVEN: u32 = 0u;
const PARITY_ODD: u32 = 1u;
const P_INTEGER: u32 = 0u;
const P_POW2: u32 = 1u;
const P_ODD: u32 = 2u;
const P_EVEN: u32 = 3u;
const DIAG_INSIDE_TO_OUTSIDE: u32 = 0u;
const DIAG_INSIDE_TO_OUTSIDE_EXCEPT_MIDDLE: u32 = 1u;
const DIAG_MIRRORED: u32 = 2u;

// tessellator.cpp:310-331
const s_fixedReciprocal = array<u32, 65>(
  0xffffffffu,
  0x10000u, 0x8000u, 0x5555u, 0x4000u,
  0x3333u, 0x2aabu, 0x2492u, 0x2000u,
  0x1c72u, 0x199au, 0x1746u, 0x1555u,
  0x13b1u, 0x1249u, 0x1111u, 0x1000u,
  0xf0fu, 0xe39u, 0xd79u, 0xccdu,
  0xc31u, 0xba3u, 0xb21u, 0xaabu,
  0xa3du, 0x9d9u, 0x97bu, 0x925u,
  0x8d4u, 0x889u, 0x842u, 0x800u,
  0x7c2u, 0x788u, 0x750u, 0x71cu,
  0x6ebu, 0x6bdu, 0x690u, 0x666u,
  0x63eu, 0x618u, 0x5f4u, 0x5d1u,
  0x5b0u, 0x591u, 0x572u, 0x555u,
  0x539u, 0x51fu, 0x505u, 0x4ecu,
  0x4d5u, 0x4beu, 0x4a8u, 0x492u,
  0x47eu, 0x46au, 0x457u, 0x444u,
  0x432u, 0x421u, 0x410u, 0x400u);

// tessellator.cpp:1915-1931
const finalPointPositionTable = array<i32, 33>(0, 32, 16, 8, 17, 4, 18, 9, 19, 2, 20, 10, 21, 5, 22, 11, 23,
  1, 24, 12, 25, 6, 26, 13, 27, 3, 28, 14, 29, 7, 30, 15, 31);
const loopStartTable = array<i32, 33>(1, 1, 17, 9, 9, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2);
const loopEndTable = array<i32, 33>(0, 0, 17, 17, 25, 25, 25, 25, 29, 29, 29, 29, 29, 29, 29, 29, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 32);

// TESS_FACTOR_CONTEXT (tessellator.hpp:182-189)
struct Ctx {
  invFloor: u32,
  invCeil: u32,
  fraction: u32,
  numHalfTessFactorPoints: i32,
  splitPointOnFloorHalfTessFactor: i32,
};

// CHWTessellator state (tessellator.hpp:160-178, 318-333).
var<private> m_parity: u32;
var<private> m_originalParity: u32;
var<private> m_partitioning: u32;
var<private> m_originalPartitioning: u32;
var<private> m_NumPoints: i32;
var<private> m_NumIndices: i32;
var<private> m_bUsingPatchedIndices: bool;
var<private> m_bUsingPatchedIndices2: bool;
// INDEX_PATCH_CONTEXT
var<private> ipc_insideDelta: i32;
var<private> ipc_insideBad: i32;
var<private> ipc_insideReplacement: i32;
var<private> ipc_outsidePatchBase: i32;
var<private> ipc_outsideDelta: i32;
var<private> ipc_outsideBad: i32;
var<private> ipc_outsideReplacement: i32;
// INDEX_PATCH_CONTEXT2
var<private> ipc2_baseIndexToInvert: i32;
var<private> ipc2_indexInversionEndPoint: i32;
var<private> ipc2_cornerCaseBadValue: i32;
var<private> ipc2_cornerCaseReplacementValue: i32;
// Output: whether to write, the patch, and its slices of the pools.
var<private> g_write: bool;
var<private> g_patch: u32;
var<private> g_pointBase: u32;
var<private> g_indexBase: u32;

// PROCESSED_TESS_FACTORS_QUAD / _TRI (tessellator.hpp:240-268); the tri
// domain uses entries 0-2 of the outside arrays and entry 0 of the inside.
var<private> pf_outsideTessFactor: array<u32, 4>;
var<private> pf_insideTessFactor: array<u32, 2>;
var<private> pf_outsideParity: array<u32, 4>;
var<private> pf_insideParity: array<u32, 2>;
var<private> pf_outsideCtx: array<Ctx, 4>;
var<private> pf_insideCtx: array<Ctx, 2>;
var<private> pf_bJustDoMinimumTessFactor: bool;
var<private> pf_bPatchCulled: bool;
var<private> pf_numPointsForOutsideEdge: array<i32, 4>;
var<private> pf_numPointsForInsideTessFactor: array<i32, 2>;
var<private> pf_insideEdgePointBaseOffset: i32;

// D3D compliant float math (tessellator.cpp:15-74)
fn isNaN32(a: f32) -> bool {
  let u = bitcast<u32>(a);
  return (u & 0x7f800000u) == 0x7f800000u && (u & 0x007fffffu) != 0u;
}
fn flush32(a: f32) -> f32 {
  let b = bitcast<u32>(a) & 0x7fffffffu;
  if (b < 0x00800000u) { return bitcast<f32>(bitcast<u32>(a) & 0x80000000u); }
  return a;
}
fn fmin32(a: f32, b: f32) -> f32 {
  let _a = flush32(a);
  let _b = flush32(b);
  if (isNaN32(_b)) { return a; }
  if (_a == 0.0 && _b == 0.0) { return select(b, a, (bitcast<u32>(_a) & 0x80000000u) != 0u); }
  return select(b, a, _a < _b);
}
fn fmax32(a: f32, b: f32) -> f32 {
  let _a = flush32(a);
  let _b = flush32(b);
  if (isNaN32(_b)) { return a; }
  if (_a == 0.0 && _b == 0.0) { return select(b, a, (bitcast<u32>(_b) & 0x80000000u) != 0u); }
  return select(b, a, _a >= _b);
}

// floatToIDotF<15, 16, false> (tessellator.cpp:100-298, 337-340)
fn floatToFixed(input: f32) -> u32 {
  let maxPos = i32((127u + 15u) << 23u);
  var output = bitcast<i32>(input);
  let unbiasedExponent = ((output & 0x7f800000) >> 23u) - 127;
  let isNegative = (output & bitcast<i32>(0x80000000u)) != 0;
  if (unbiasedExponent == 128 && (output & 0x007fffff) != 0) {
    output = 0;
  } else if (!isNegative && output >= maxPos) {
    output = -1;
  } else if (isNegative && (output & 0x7fffffff) >= 0) {
    output = 0;
  } else if (unbiasedExponent < -16 - 1) {
    output = 0;
  } else {
    output = (output & 0x007fffff) | 0x00800000;
    let extraBits = 23 - 16 - unbiasedExponent;
    if (extraBits >= 0) {
      let LSB = 1 << u32(extraBits);
      let extraBitsMask = LSB - 1;
      let half = LSB >> 1u;
      if ((output & LSB) != 0 || (output & extraBitsMask) > half) { output += half; }
      output = output >> u32(extraBits);
    } else {
      output = output << u32(-extraBits);
    }
  }
  return bitcast<u32>(output);
}
fn isEven(input: f32) -> bool { return (i32(input) & 1) == 0; }
fn fxpCeil(input: u32) -> u32 {
  if ((input & FXP_FRACTION_MASK) != 0u) { return (input & FXP_INTEGER_MASK) + FXP_ONE; }
  return input;
}
fn fxpFloor(input: u32) -> u32 { return input & FXP_INTEGER_MASK; }
// tessellator.cpp:1648-1655
fn RemoveMSB(val: i32) -> i32 {
  var check: i32;
  if (val <= 0x0000ffff) { check = select(0x00008000, 0x00000080, val <= 0x000000ff); }
  else if (val <= 0x00ffffff) { check = 0x00800000; }
  // (an if, not select(): Safari's Metal translation of select() with
  // INT_MIN is ambiguous)
  else { check = bitcast<i32>(0x80000000u); }
  for (var i = 0; i < 8; i++) {
    if ((val & check) != 0) { return val & ~check; }
    check = bitcast<i32>(bitcast<u32>(check) >> 1u);
  }
  return 0;
}

fn Odd() -> bool { return m_parity == PARITY_ODD; }
fn HWIntegerPartitioning() -> bool { return m_partitioning == P_INTEGER || m_partitioning == P_POW2; }

// Metal's pow2 partitioning rounds each factor up to a power of two
// (CHLSLTessellator::RoundUpTessFactor, tessellator.cpp:2657-2673; see
// tessellator.ts _RoundUpPow2).
fn RoundUpPow2(f: f32) -> f32 {
  if (m_originalPartitioning != P_POW2) { return f; }
  let bits = bitcast<u32>(f);
  if ((bits & 0x007fffffu) != 0u) { return bitcast<f32>((bits & 0x7f800000u) + 0x00800000u); }
  return f;
}

// tessellator.cpp:1580-1588
fn DefinePoint(fxpU: u32, fxpV: u32, pointStorageOffset: i32) {
  if (g_write) {
    let i = (g_pointBase + u32(pointStorageOffset)) * 3u;
    points[i] = g_patch;
    points[i + 1u] = fxpU;
    points[i + 2u] = fxpV;
  }
}
// tessellator.cpp:2077-2115
fn PatchIndexValue(index_in: i32) -> i32 {
  var index = index_in;
  if (m_bUsingPatchedIndices) {
    if (index >= ipc_outsidePatchBase) {
      if (index == ipc_outsideBad) { index = ipc_outsideReplacement; }
      else { index += ipc_outsideDelta; }
    } else {
      if (index == ipc_insideBad) { index = ipc_insideReplacement; }
      else { index += ipc_insideDelta; }
    }
  } else if (m_bUsingPatchedIndices2) {
    if (index >= ipc2_baseIndexToInvert) {
      if (index == ipc2_cornerCaseBadValue) { index = ipc2_cornerCaseReplacementValue; }
      else { index = ipc2_indexInversionEndPoint - index; }
    } else if (index == ipc2_cornerCaseBadValue) {
      index = ipc2_cornerCaseReplacementValue;
    }
  }
  return index;
}
// tessellator.cpp:1593-1600
fn DefineIndex(index: i32, indexStorageOffset: i32) {
  if (g_write) {
    indices[g_indexBase + u32(indexStorageOffset)] = g_pointBase + u32(PatchIndexValue(index));
  }
}
// tessellator.cpp:1605-1620
fn DefineClockwiseTriangle(index0: i32, index1: i32, index2: i32, base: i32) {
  DefineIndex(index0, base);
  if (params.outputCW != 0u) {
    DefineIndex(index1, base + 1);
    DefineIndex(index2, base + 2);
  } else {
    DefineIndex(index2, base + 1);
    DefineIndex(index1, base + 2);
  }
}

// tessellator.cpp:1683-1695
fn NumPointsForTessFactor(fxpTessFactor: u32) -> i32 {
  if (Odd()) {
    return i32((fxpCeil(FXP_ONE_HALF + (fxpTessFactor + 1u) / 2u) * 2u) >> FXP_FRACTION_BITS);
  }
  return i32((fxpCeil((fxpTessFactor + 1u) / 2u) * 2u) >> FXP_FRACTION_BITS) + 1;
}
// tessellator.cpp:1700-1750
fn ComputeTessFactorContext(fxpTessFactor: u32) -> Ctx {
  var ctx: Ctx;
  var fxpHalfTessFactor = (fxpTessFactor + 1u) / 2u;
  if (Odd() || fxpHalfTessFactor == FXP_ONE_HALF) { fxpHalfTessFactor += FXP_ONE_HALF; }
  let fxpFloorHalfTessFactor = fxpFloor(fxpHalfTessFactor);
  let fxpCeilHalfTessFactor = fxpCeil(fxpHalfTessFactor);
  ctx.fraction = fxpHalfTessFactor - fxpFloorHalfTessFactor;
  ctx.numHalfTessFactorPoints = i32(fxpCeilHalfTessFactor >> FXP_FRACTION_BITS);
  if (fxpCeilHalfTessFactor == fxpFloorHalfTessFactor) {
    ctx.splitPointOnFloorHalfTessFactor = ctx.numHalfTessFactorPoints + 1;
  } else if (Odd()) {
    if (fxpFloorHalfTessFactor == FXP_ONE) {
      ctx.splitPointOnFloorHalfTessFactor = 0;
    } else {
      ctx.splitPointOnFloorHalfTessFactor = (RemoveMSB(i32(fxpFloorHalfTessFactor >> FXP_FRACTION_BITS) - 1) << 1u) + 1;
    }
  } else {
    ctx.splitPointOnFloorHalfTessFactor = (RemoveMSB(i32(fxpFloorHalfTessFactor >> FXP_FRACTION_BITS)) << 1u) + 1;
  }
  var numFloorSegments = i32((fxpFloorHalfTessFactor * 2u) >> FXP_FRACTION_BITS);
  var numCeilSegments = i32((fxpCeilHalfTessFactor * 2u) >> FXP_FRACTION_BITS);
  if (Odd()) {
    numFloorSegments -= 1;
    numCeilSegments -= 1;
  }
  ctx.invFloor = s_fixedReciprocal[numFloorSegments];
  ctx.invCeil = s_fixedReciprocal[numCeilSegments];
  return ctx;
}
// tessellator.cpp:1755-1807
fn PlacePointIn1D(ctx: Ctx, point_in: i32) -> u32 {
  var point = point_in;
  var bFlip = false;
  if (point >= ctx.numHalfTessFactorPoints) {
    point = (ctx.numHalfTessFactorPoints << 1u) - point;
    if (Odd()) { point -= 1; }
    bFlip = true;
  }
  if (point == ctx.numHalfTessFactorPoints) { return FXP_ONE_HALF; }
  let indexOnCeilHalfTessFactor = u32(point);
  var indexOnFloorHalfTessFactor = indexOnCeilHalfTessFactor;
  if (point > ctx.splitPointOnFloorHalfTessFactor) { indexOnFloorHalfTessFactor -= 1u; }
  let fxpLocationOnFloorHalfTessFactor = indexOnFloorHalfTessFactor * ctx.invFloor;
  let fxpLocationOnCeilHalfTessFactor = indexOnCeilHalfTessFactor * ctx.invCeil;
  var fxpLocation = fxpLocationOnFloorHalfTessFactor * (FXP_ONE - ctx.fraction) +
                    fxpLocationOnCeilHalfTessFactor * ctx.fraction;
  fxpLocation = (fxpLocation + FXP_ONE_HALF) >> FXP_FRACTION_BITS;
  if (bFlip) { fxpLocation = FXP_ONE - fxpLocation; }
  return fxpLocation;
}

// tessellator.cpp:1812-1894
fn StitchRegular(bTrapezoid: bool, diagonals: u32, baseIndexOffset_in: i32, numInsideEdgePoints: i32,
                 insideEdgePointBaseOffset: i32, outsideEdgePointBaseOffset: i32) {
  var baseIndexOffset = baseIndexOffset_in;
  var insidePoint = insideEdgePointBaseOffset;
  var outsidePoint = outsideEdgePointBaseOffset;
  if (bTrapezoid) {
    DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
    baseIndexOffset += 3; outsidePoint++;
  }
  var p: i32;
  switch (diagonals) {
    case 0u: { // DIAGONALS_INSIDE_TO_OUTSIDE
      for (p = 0; p < numInsideEdgePoints - 1; p++) {
        DefineClockwiseTriangle(insidePoint, outsidePoint, outsidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        DefineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        insidePoint++; outsidePoint++;
      }
    }
    case 1u: { // DIAGONALS_INSIDE_TO_OUTSIDE_EXCEPT_MIDDLE
      for (p = 0; p < numInsideEdgePoints / 2 - 1; p++) {
        DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
        baseIndexOffset += 3;
        DefineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        insidePoint++; outsidePoint++;
      }
      DefineClockwiseTriangle(outsidePoint, insidePoint + 1, insidePoint, baseIndexOffset);
      baseIndexOffset += 3;
      DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3;
      insidePoint++; outsidePoint++; p += 2;
      for (; p < numInsideEdgePoints; p++) {
        DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
        baseIndexOffset += 3;
        DefineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        insidePoint++; outsidePoint++;
      }
    }
    default: { // DIAGONALS_MIRRORED
      for (p = 0; p < numInsideEdgePoints / 2; p++) {
        DefineClockwiseTriangle(outsidePoint, insidePoint + 1, insidePoint, baseIndexOffset);
        baseIndexOffset += 3;
        DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        insidePoint++; outsidePoint++;
      }
      for (; p < numInsideEdgePoints - 1; p++) {
        DefineClockwiseTriangle(insidePoint, outsidePoint, outsidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        DefineClockwiseTriangle(insidePoint, outsidePoint + 1, insidePoint + 1, baseIndexOffset);
        baseIndexOffset += 3;
        insidePoint++; outsidePoint++;
      }
    }
  }
  if (bTrapezoid) {
    DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
    baseIndexOffset += 3;
  }
}

// tessellator.cpp:1899-2072
fn StitchTransition(baseIndexOffset_in: i32,
                    insideEdgePointBaseOffset: i32, insideNumHalfTessFactorPoints_in: i32, insideEdgeTessFactorParity: u32,
                    outsideEdgePointBaseOffset: i32, outsideNumHalfTessFactorPoints_in: i32, outsideTessFactorParity: u32) {
  var baseIndexOffset = baseIndexOffset_in;
  var insideNumHalfTessFactorPoints = insideNumHalfTessFactorPoints_in;
  var outsideNumHalfTessFactorPoints = outsideNumHalfTessFactorPoints_in;
  if (insideEdgeTessFactorParity == PARITY_ODD) { insideNumHalfTessFactorPoints -= 1; }
  if (outsideTessFactorParity == PARITY_ODD) { outsideNumHalfTessFactorPoints -= 1; }
  var outsidePoint = outsideEdgePointBaseOffset;
  var insidePoint = insideEdgePointBaseOffset;
  let iStart = min(loopStartTable[insideNumHalfTessFactorPoints], loopStartTable[outsideNumHalfTessFactorPoints]);
  let iEnd = max(loopEndTable[insideNumHalfTessFactorPoints], loopEndTable[outsideNumHalfTessFactorPoints]);

  if (finalPointPositionTable[0] < outsideNumHalfTessFactorPoints) {
    DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
    baseIndexOffset += 3; outsidePoint++;
  }
  for (var i = iStart; i <= iEnd; i++) {
    if (finalPointPositionTable[i] < insideNumHalfTessFactorPoints) {
      DefineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3; insidePoint++;
    }
    if (finalPointPositionTable[i] < outsideNumHalfTessFactorPoints) {
      DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
      baseIndexOffset += 3; outsidePoint++;
    }
  }
  if (insideEdgeTessFactorParity != outsideTessFactorParity || insideEdgeTessFactorParity == PARITY_ODD) {
    if (insideEdgeTessFactorParity == outsideTessFactorParity) {
      DefineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3;
      DefineClockwiseTriangle(insidePoint + 1, outsidePoint, outsidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3;
      insidePoint++;
      outsidePoint++;
    } else if (insideEdgeTessFactorParity == PARITY_EVEN) {
      DefineClockwiseTriangle(insidePoint, outsidePoint, outsidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3;
      outsidePoint++;
    } else {
      DefineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3;
      insidePoint++;
    }
  }
  for (var i = iEnd; i >= iStart; i--) {
    if (finalPointPositionTable[i] < outsideNumHalfTessFactorPoints) {
      DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
      baseIndexOffset += 3; outsidePoint++;
    }
    if (finalPointPositionTable[i] < insideNumHalfTessFactorPoints) {
      DefineClockwiseTriangle(insidePoint, outsidePoint, insidePoint + 1, baseIndexOffset);
      baseIndexOffset += 3; insidePoint++;
    }
  }
  if (finalPointPositionTable[0] < outsideNumHalfTessFactorPoints) {
    DefineClockwiseTriangle(outsidePoint, outsidePoint + 1, insidePoint, baseIndexOffset);
    baseIndexOffset += 3; outsidePoint++;
  }
}

// The factor clamping bounds (tessellator.cpp:520-541, 1039-1060)
fn LowerBound() -> f32 {
  if (m_originalPartitioning == P_EVEN) { return MIN_EVEN; }
  return MIN_ODD;
}
fn UpperBound() -> f32 {
  if (m_originalPartitioning == P_ODD) { return MAX_ODD; }
  return MAX_EVEN;
}

// tessellator.cpp:504-681
fn QuadProcessTessFactors(f_Ueq0: f32, f_Veq0: f32, f_Ueq1: f32, f_Veq1: f32, f_InsideU: f32, f_InsideV: f32) {
  var tessFactor_Ueq0 = f_Ueq0;
  var tessFactor_Veq0 = f_Veq0;
  var tessFactor_Ueq1 = f_Ueq1;
  var tessFactor_Veq1 = f_Veq1;
  var insideTessFactor_U = f_InsideU;
  var insideTessFactor_V = f_InsideV;
  if (!(tessFactor_Ueq0 > 0.0) || !(tessFactor_Veq0 > 0.0) || !(tessFactor_Ueq1 > 0.0) || !(tessFactor_Veq1 > 0.0)) {
    pf_bPatchCulled = true;
    return;
  }
  pf_bPatchCulled = false;

  var lowerBound = LowerBound();
  let upperBound = UpperBound();
  tessFactor_Ueq0 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Ueq0));
  tessFactor_Veq0 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Veq0));
  tessFactor_Ueq1 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Ueq1));
  tessFactor_Veq1 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Veq1));

  if (HWIntegerPartitioning()) {
    tessFactor_Ueq0 = ceil(tessFactor_Ueq0);
    tessFactor_Veq0 = ceil(tessFactor_Veq0);
    tessFactor_Ueq1 = ceil(tessFactor_Ueq1);
    tessFactor_Veq1 = ceil(tessFactor_Veq1);
  }

  if (m_originalPartitioning == P_ODD) {
    if (tessFactor_Ueq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        tessFactor_Veq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        tessFactor_Ueq1 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        tessFactor_Veq1 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        insideTessFactor_U > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        insideTessFactor_V > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON) {
      lowerBound = MIN_ODD + EPSILON;
    }
  }

  insideTessFactor_U = fmin32(upperBound, fmax32(lowerBound, insideTessFactor_U));
  insideTessFactor_V = fmin32(upperBound, fmax32(lowerBound, insideTessFactor_V));

  if (HWIntegerPartitioning()) {
    insideTessFactor_U = ceil(insideTessFactor_U);
    insideTessFactor_V = ceil(insideTessFactor_V);
  }

  m_NumPoints = 0;
  m_NumIndices = 0;

  let outsideTessFactor = array<f32, 4>(tessFactor_Ueq0, tessFactor_Veq0, tessFactor_Ueq1, tessFactor_Veq1);
  let insideTessFactor = array<f32, 2>(insideTessFactor_U, insideTessFactor_V);
  if (HWIntegerPartitioning()) {
    for (var edge = 0; edge < 4; edge++) {
      pf_outsideParity[edge] = select(PARITY_ODD, PARITY_EVEN, isEven(outsideTessFactor[edge]));
    }
    for (var axis = 0; axis < 2; axis++) {
      pf_insideParity[axis] = select(PARITY_ODD, PARITY_EVEN, isEven(insideTessFactor[axis]) || insideTessFactor[axis] == 1.0);
    }
  } else {
    for (var edge = 0; edge < 4; edge++) { pf_outsideParity[edge] = m_originalParity; }
    pf_insideParity[0] = m_originalParity;
    pf_insideParity[1] = m_originalParity;
  }

  for (var edge = 0; edge < 4; edge++) { pf_outsideTessFactor[edge] = floatToFixed(outsideTessFactor[edge]); }
  for (var axis = 0; axis < 2; axis++) { pf_insideTessFactor[axis] = floatToFixed(insideTessFactor[axis]); }

  if (HWIntegerPartitioning() || Odd()) {
    if (pf_insideTessFactor[0] == FXP_ONE && pf_insideTessFactor[1] == FXP_ONE &&
        pf_outsideTessFactor[0] == FXP_ONE && pf_outsideTessFactor[1] == FXP_ONE &&
        pf_outsideTessFactor[2] == FXP_ONE && pf_outsideTessFactor[3] == FXP_ONE) {
      pf_bJustDoMinimumTessFactor = true;
      return;
    }
  }
  pf_bJustDoMinimumTessFactor = false;

  for (var edge = 0; edge < 4; edge++) {
    m_parity = pf_outsideParity[edge];
    pf_outsideCtx[edge] = ComputeTessFactorContext(pf_outsideTessFactor[edge]);
  }
  for (var axis = 0; axis < 2; axis++) {
    m_parity = pf_insideParity[axis];
    pf_insideCtx[axis] = ComputeTessFactorContext(pf_insideTessFactor[axis]);
  }

  for (var edge = 0; edge < 4; edge++) {
    m_parity = pf_outsideParity[edge];
    pf_numPointsForOutsideEdge[edge] = NumPointsForTessFactor(pf_outsideTessFactor[edge]);
    m_NumPoints += pf_numPointsForOutsideEdge[edge];
  }
  m_NumPoints -= 4;

  for (var axis = 0; axis < 2; axis++) {
    m_parity = pf_insideParity[axis];
    pf_numPointsForInsideTessFactor[axis] = NumPointsForTessFactor(pf_insideTessFactor[axis]);
    let pointCountMin = select(3, 4, pf_insideParity[axis] == PARITY_ODD);
    pf_numPointsForInsideTessFactor[axis] = max(pointCountMin, pf_numPointsForInsideTessFactor[axis]);
  }

  pf_insideEdgePointBaseOffset = m_NumPoints;
  m_NumPoints += (pf_numPointsForInsideTessFactor[0] - 2) * (pf_numPointsForInsideTessFactor[1] - 2);
}

// tessellator.cpp:686-786
fn QuadGeneratePoints() {
  var pointOffset = 0;
  for (var edge = 0; edge < 4; edge++) {
    let parity = edge & 1;
    let endPoint = pf_numPointsForOutsideEdge[edge] - 1;
    for (var p = 0; p < endPoint; p++) {
      let q = select(endPoint - p, p, edge == 1 || edge == 2);
      m_parity = pf_outsideParity[edge];
      let fxpParam = PlacePointIn1D(pf_outsideCtx[edge], q);
      if (parity != 0) {
        DefinePoint(fxpParam, select(0u, FXP_ONE, edge == 3), pointOffset);
      } else {
        DefinePoint(select(0u, FXP_ONE, edge == 2), fxpParam, pointOffset);
      }
      pointOffset++;
    }
  }

  let minNumPointsForTessFactor = min(pf_numPointsForInsideTessFactor[0], pf_numPointsForInsideTessFactor[1]);
  let numRings = minNumPointsForTessFactor >> 1u;
  for (var ring = 1; ring < numRings; ring++) {
    let startPoint = ring;
    let endPoint = array<i32, 2>(pf_numPointsForInsideTessFactor[0] - 1 - startPoint,
                                 pf_numPointsForInsideTessFactor[1] - 1 - startPoint);
    for (var edge = 0; edge < 4; edge++) {
      let parity0 = edge & 1;
      let parity1 = (edge + 1) & 1;
      let perpendicularAxisPoint = select(endPoint[parity0], startPoint, edge < 2);
      m_parity = pf_insideParity[parity0];
      let fxpPerpParam = PlacePointIn1D(pf_insideCtx[parity0], perpendicularAxisPoint);
      m_parity = pf_insideParity[parity1];
      for (var p = startPoint; p < endPoint[parity1]; p++) {
        let q = select(endPoint[parity1] - (p - startPoint), p, edge == 1 || edge == 2);
        let fxpParam = PlacePointIn1D(pf_insideCtx[parity1], q);
        if (parity1 != 0) {
          DefinePoint(fxpPerpParam, fxpParam, pointOffset);
        } else {
          DefinePoint(fxpParam, fxpPerpParam, pointOffset);
        }
        pointOffset++;
      }
    }
  }
  if (pf_numPointsForInsideTessFactor[0] > pf_numPointsForInsideTessFactor[1] && pf_insideParity[1] == PARITY_EVEN) {
    let startPoint = numRings;
    let endPoint = pf_numPointsForInsideTessFactor[0] - 1 - startPoint;
    m_parity = pf_insideParity[0];
    for (var p = startPoint; p <= endPoint; p++) {
      let fxpParam = PlacePointIn1D(pf_insideCtx[0], p);
      DefinePoint(fxpParam, FXP_ONE_HALF, pointOffset);
      pointOffset++;
    }
  } else if (pf_numPointsForInsideTessFactor[1] >= pf_numPointsForInsideTessFactor[0] && pf_insideParity[0] == PARITY_EVEN) {
    let startPoint = numRings;
    let endPoint = pf_numPointsForInsideTessFactor[1] - 1 - startPoint;
    m_parity = pf_insideParity[1];
    for (var p = endPoint; p >= startPoint; p--) {
      let fxpParam = PlacePointIn1D(pf_insideCtx[1], p);
      DefinePoint(FXP_ONE_HALF, fxpParam, pointOffset);
      pointOffset++;
    }
  }
}

// tessellator.cpp:791-961
fn QuadGenerateConnectivity() {
  let numPointRowsToCenter = array<i32, 2>((pf_numPointsForInsideTessFactor[0] + 1) >> 1u,
                                           (pf_numPointsForInsideTessFactor[1] + 1) >> 1u);
  let numRings = min(numPointRowsToCenter[0], numPointRowsToCenter[1]);
  let degeneratePointRing = array<i32, 2>(
    select(-1, numPointRowsToCenter[1] - 1, pf_insideParity[1] == PARITY_EVEN),
    select(-1, numPointRowsToCenter[0] - 1, pf_insideParity[0] == PARITY_EVEN));

  var outsideCtxNumHalf = array<i32, 4>(pf_outsideCtx[0].numHalfTessFactorPoints, pf_outsideCtx[1].numHalfTessFactorPoints,
                                        pf_outsideCtx[2].numHalfTessFactorPoints, pf_outsideCtx[3].numHalfTessFactorPoints);
  var outsideTessFactorParity = pf_outsideParity;
  var numPointsForOutsideEdge = pf_numPointsForOutsideEdge;

  var insideEdgePointBaseOffset = pf_insideEdgePointBaseOffset;
  var outsideEdgePointBaseOffset = 0;
  for (var ring = 1; ring < numRings; ring++) {
    let numPointsForInsideEdge = array<i32, 2>(pf_numPointsForInsideTessFactor[0] - 2 * ring,
                                               pf_numPointsForInsideTessFactor[1] - 2 * ring);
    let edge0InsidePointBaseOffset = insideEdgePointBaseOffset;
    let edge0OutsidePointBaseOffset = outsideEdgePointBaseOffset;
    for (var edge = 0; edge < 4; edge++) {
      let parity = (edge + 1) & 1;
      let numTriangles = numPointsForInsideEdge[parity] + numPointsForOutsideEdge[edge] - 2;
      var insideBaseOffset: i32;
      var outsideBaseOffset: i32;
      if (edge == 3) {
        if (ring == degeneratePointRing[parity]) {
          ipc2_baseIndexToInvert = insideEdgePointBaseOffset + 1;
          ipc2_cornerCaseBadValue = outsideEdgePointBaseOffset + numPointsForOutsideEdge[edge] - 1;
          ipc2_cornerCaseReplacementValue = edge0OutsidePointBaseOffset;
          ipc2_indexInversionEndPoint = (ipc2_baseIndexToInvert << 1u) - 1;
          insideBaseOffset = ipc2_baseIndexToInvert;
          outsideBaseOffset = outsideEdgePointBaseOffset;
          m_bUsingPatchedIndices2 = true;
        } else {
          ipc_insideDelta = insideEdgePointBaseOffset;
          ipc_insideBad = numPointsForInsideEdge[parity] - 1;
          ipc_insideReplacement = edge0InsidePointBaseOffset;
          ipc_outsidePatchBase = ipc_insideBad + 1;
          ipc_outsideDelta = outsideEdgePointBaseOffset - ipc_outsidePatchBase;
          ipc_outsideBad = ipc_outsidePatchBase + numPointsForOutsideEdge[edge] - 1;
          ipc_outsideReplacement = edge0OutsidePointBaseOffset;
          insideBaseOffset = 0;
          outsideBaseOffset = ipc_outsidePatchBase;
          m_bUsingPatchedIndices = true;
        }
      } else if (edge == 2 && ring == degeneratePointRing[parity]) {
        ipc2_baseIndexToInvert = insideEdgePointBaseOffset;
        ipc2_cornerCaseBadValue = -1;
        ipc2_cornerCaseReplacementValue = -1;
        ipc2_indexInversionEndPoint = ipc2_baseIndexToInvert << 1u;
        insideBaseOffset = ipc2_baseIndexToInvert;
        outsideBaseOffset = outsideEdgePointBaseOffset;
        m_bUsingPatchedIndices2 = true;
      } else {
        insideBaseOffset = insideEdgePointBaseOffset;
        outsideBaseOffset = outsideEdgePointBaseOffset;
      }
      if (ring == 1) {
        StitchTransition(m_NumIndices,
          insideBaseOffset, pf_insideCtx[parity].numHalfTessFactorPoints, pf_insideParity[parity],
          outsideBaseOffset, outsideCtxNumHalf[edge], outsideTessFactorParity[edge]);
      } else {
        StitchRegular(true, DIAG_MIRRORED, m_NumIndices, numPointsForInsideEdge[parity],
          insideBaseOffset, outsideBaseOffset);
      }
      m_bUsingPatchedIndices = false;
      m_bUsingPatchedIndices2 = false;
      m_NumIndices += numTriangles * 3;
      outsideEdgePointBaseOffset += numPointsForOutsideEdge[edge] - 1;
      if (edge == 2 && ring == degeneratePointRing[parity]) {
        insideEdgePointBaseOffset -= numPointsForInsideEdge[parity] - 1;
      } else {
        insideEdgePointBaseOffset += numPointsForInsideEdge[parity] - 1;
      }
      numPointsForOutsideEdge[edge] = numPointsForInsideEdge[parity];
    }
    if (ring == 1) {
      for (var edge = 0; edge < 4; edge++) {
        outsideCtxNumHalf[edge] = pf_insideCtx[edge & 1].numHalfTessFactorPoints;
        outsideTessFactorParity[edge] = pf_insideParity[edge & 1];
      }
    }
  }

  if (pf_numPointsForInsideTessFactor[0] > pf_numPointsForInsideTessFactor[1] && pf_insideParity[1] == PARITY_ODD) {
    m_bUsingPatchedIndices2 = true;
    let stripNumQuads = (((pf_numPointsForInsideTessFactor[0] >> 1u) - (pf_numPointsForInsideTessFactor[1] >> 1u)) << 1u) +
                        select(1, 2, pf_insideParity[0] == PARITY_EVEN);
    ipc2_baseIndexToInvert = outsideEdgePointBaseOffset + stripNumQuads + 2;
    ipc2_cornerCaseBadValue = ipc2_baseIndexToInvert;
    ipc2_cornerCaseReplacementValue = outsideEdgePointBaseOffset;
    ipc2_indexInversionEndPoint = ipc2_baseIndexToInvert + ipc2_baseIndexToInvert + stripNumQuads;
    StitchRegular(false, DIAG_INSIDE_TO_OUTSIDE, m_NumIndices, stripNumQuads + 1,
      ipc2_baseIndexToInvert, outsideEdgePointBaseOffset + 1);
    m_bUsingPatchedIndices2 = false;
    m_NumIndices += stripNumQuads * 6;
  } else if (pf_numPointsForInsideTessFactor[1] >= pf_numPointsForInsideTessFactor[0] && pf_insideParity[0] == PARITY_ODD) {
    m_bUsingPatchedIndices2 = true;
    let stripNumQuads = (((pf_numPointsForInsideTessFactor[1] >> 1u) - (pf_numPointsForInsideTessFactor[0] >> 1u)) << 1u) +
                        select(1, 2, pf_insideParity[1] == PARITY_EVEN);
    ipc2_baseIndexToInvert = outsideEdgePointBaseOffset + stripNumQuads + 1;
    ipc2_cornerCaseBadValue = -1;
    ipc2_indexInversionEndPoint = ipc2_baseIndexToInvert + ipc2_baseIndexToInvert + stripNumQuads;
    let diag = select(DIAG_INSIDE_TO_OUTSIDE_EXCEPT_MIDDLE, DIAG_INSIDE_TO_OUTSIDE, pf_insideParity[1] == PARITY_EVEN);
    StitchRegular(false, diag, m_NumIndices, stripNumQuads + 1,
      ipc2_baseIndexToInvert, outsideEdgePointBaseOffset);
    m_bUsingPatchedIndices2 = false;
    m_NumIndices += stripNumQuads * 6;
  }
}

// tessellator.cpp:446-498
fn TessellateQuadDomain(f0: f32, f1: f32, f2: f32, f3: f32, i0: f32, i1: f32) {
  QuadProcessTessFactors(RoundUpPow2(f0), RoundUpPow2(f1), RoundUpPow2(f2), RoundUpPow2(f3),
                         RoundUpPow2(i0), RoundUpPow2(i1));
  if (pf_bPatchCulled) {
    m_NumPoints = 0;
    m_NumIndices = 0;
    return;
  }
  if (pf_bJustDoMinimumTessFactor) {
    DefinePoint(0u, 0u, 0);
    DefinePoint(FXP_ONE, 0u, 1);
    DefinePoint(FXP_ONE, FXP_ONE, 2);
    DefinePoint(0u, FXP_ONE, 3);
    m_NumPoints = 4;
    DefineClockwiseTriangle(0, 1, 3, 0);
    DefineClockwiseTriangle(1, 2, 3, 3);
    m_NumIndices = 6;
    return;
  }
  QuadGeneratePoints();
  QuadGenerateConnectivity();
}

// tessellator.cpp:1023-1187
fn TriProcessTessFactors(f_Ueq0: f32, f_Veq0: f32, f_Weq0: f32, f_Inside: f32) {
  var tessFactor_Ueq0 = f_Ueq0;
  var tessFactor_Veq0 = f_Veq0;
  var tessFactor_Weq0 = f_Weq0;
  var insideTessFactor = f_Inside;
  if (!(tessFactor_Ueq0 > 0.0) || !(tessFactor_Veq0 > 0.0) || !(tessFactor_Weq0 > 0.0)) {
    pf_bPatchCulled = true;
    return;
  }
  pf_bPatchCulled = false;

  var lowerBound = LowerBound();
  let upperBound = UpperBound();
  tessFactor_Ueq0 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Ueq0));
  tessFactor_Veq0 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Veq0));
  tessFactor_Weq0 = fmin32(upperBound, fmax32(lowerBound, tessFactor_Weq0));

  if (HWIntegerPartitioning()) {
    tessFactor_Ueq0 = ceil(tessFactor_Ueq0);
    tessFactor_Veq0 = ceil(tessFactor_Veq0);
    tessFactor_Weq0 = ceil(tessFactor_Weq0);
  }

  if (m_originalPartitioning == P_ODD) {
    if (tessFactor_Ueq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        tessFactor_Veq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON ||
        tessFactor_Weq0 > MIN_ODD_TESSFACTOR_PLUS_HALF_EPSILON) {
      lowerBound = MIN_ODD + EPSILON;
    }
  }

  insideTessFactor = fmin32(upperBound, fmax32(lowerBound, insideTessFactor));
  if (HWIntegerPartitioning()) {
    insideTessFactor = ceil(insideTessFactor);
  }

  m_NumPoints = 0;
  m_NumIndices = 0;

  let outsideTessFactor = array<f32, 3>(tessFactor_Ueq0, tessFactor_Veq0, tessFactor_Weq0);
  if (HWIntegerPartitioning()) {
    for (var edge = 0; edge < 3; edge++) {
      pf_outsideParity[edge] = select(PARITY_ODD, PARITY_EVEN, isEven(outsideTessFactor[edge]));
    }
    pf_insideParity[0] = select(PARITY_ODD, PARITY_EVEN, isEven(insideTessFactor) || insideTessFactor == 1.0);
  } else {
    for (var edge = 0; edge < 3; edge++) { pf_outsideParity[edge] = m_originalParity; }
    pf_insideParity[0] = m_originalParity;
  }

  for (var edge = 0; edge < 3; edge++) { pf_outsideTessFactor[edge] = floatToFixed(outsideTessFactor[edge]); }
  pf_insideTessFactor[0] = floatToFixed(insideTessFactor);

  if (HWIntegerPartitioning() || Odd()) {
    if (pf_insideTessFactor[0] == FXP_ONE && pf_outsideTessFactor[0] == FXP_ONE &&
        pf_outsideTessFactor[1] == FXP_ONE && pf_outsideTessFactor[2] == FXP_ONE) {
      pf_bJustDoMinimumTessFactor = true;
      return;
    }
  }
  pf_bJustDoMinimumTessFactor = false;

  for (var edge = 0; edge < 3; edge++) {
    m_parity = pf_outsideParity[edge];
    pf_outsideCtx[edge] = ComputeTessFactorContext(pf_outsideTessFactor[edge]);
  }
  m_parity = pf_insideParity[0];
  pf_insideCtx[0] = ComputeTessFactorContext(pf_insideTessFactor[0]);

  for (var edge = 0; edge < 3; edge++) {
    m_parity = pf_outsideParity[edge];
    pf_numPointsForOutsideEdge[edge] = NumPointsForTessFactor(pf_outsideTessFactor[edge]);
    m_NumPoints += pf_numPointsForOutsideEdge[edge];
  }
  m_NumPoints -= 3;

  m_parity = pf_insideParity[0];
  pf_numPointsForInsideTessFactor[0] = NumPointsForTessFactor(pf_insideTessFactor[0]);
  let pointCountMin = select(3, 4, Odd());
  pf_numPointsForInsideTessFactor[0] = max(pointCountMin, pf_numPointsForInsideTessFactor[0]);

  pf_insideEdgePointBaseOffset = m_NumPoints;

  let numInteriorRings = (pf_numPointsForInsideTessFactor[0] >> 1u) - 1;
  var numInteriorPoints: i32;
  if (Odd()) {
    numInteriorPoints = 3 * (numInteriorRings * (numInteriorRings + 1) - numInteriorRings);
  } else {
    numInteriorPoints = 3 * (numInteriorRings * (numInteriorRings + 1)) + 1;
  }
  m_NumPoints += numInteriorPoints;
}

// tessellator.cpp:1192-1284
fn TriGeneratePoints() {
  var pointOffset = 0;
  for (var edge = 0; edge < 3; edge++) {
    let parity = edge & 1;
    let endPoint = pf_numPointsForOutsideEdge[edge] - 1;
    for (var p = 0; p < endPoint; p++) {
      let q = select(endPoint - p, p, parity != 0);
      m_parity = pf_outsideParity[edge];
      let fxpParam = PlacePointIn1D(pf_outsideCtx[edge], q);
      if (edge == 0) {
        DefinePoint(0u, fxpParam, pointOffset);
      } else {
        DefinePoint(fxpParam, select(0u, FXP_ONE - fxpParam, edge == 2), pointOffset);
      }
      pointOffset++;
    }
  }

  m_parity = pf_insideParity[0];
  let numRings = pf_numPointsForInsideTessFactor[0] >> 1u;
  for (var ring = 1; ring < numRings; ring++) {
    let startPoint = ring;
    let endPoint = pf_numPointsForInsideTessFactor[0] - 1 - startPoint;
    for (var edge = 0; edge < 3; edge++) {
      let parity = edge & 1;
      var fxpPerpParam = PlacePointIn1D(pf_insideCtx[0], startPoint);
      fxpPerpParam *= FXP_TWO_THIRDS;
      fxpPerpParam = (fxpPerpParam + FXP_ONE_HALF) >> FXP_FRACTION_BITS;
      for (var p = startPoint; p < endPoint; p++) {
        let q = select(endPoint - (p - startPoint), p, parity != 0);
        let fxpParam = PlacePointIn1D(pf_insideCtx[0], q);
        let d = (fxpPerpParam + 1u) / 2u;
        switch (edge) {
          case 0: { DefinePoint(fxpPerpParam, fxpParam - d, pointOffset); }
          case 1: { DefinePoint(fxpParam - d, fxpPerpParam, pointOffset); }
          default: { DefinePoint(fxpParam - d, FXP_ONE - (fxpParam - d) - fxpPerpParam, pointOffset); }
        }
        pointOffset++;
      }
    }
  }
  if (!Odd()) {
    DefinePoint(FXP_ONE_THIRD, FXP_ONE_THIRD, pointOffset);
  }
}

// tessellator.cpp:1289-1377
fn TriGenerateConnectivity() {
  let numRings = (pf_numPointsForInsideTessFactor[0] + 1) >> 1u;
  var outsideCtxNumHalf = array<i32, 3>(pf_outsideCtx[0].numHalfTessFactorPoints, pf_outsideCtx[1].numHalfTessFactorPoints,
                                        pf_outsideCtx[2].numHalfTessFactorPoints);
  var outsideTessFactorParity = array<u32, 3>(pf_outsideParity[0], pf_outsideParity[1], pf_outsideParity[2]);
  var numPointsForOutsideEdge = array<i32, 3>(pf_numPointsForOutsideEdge[0], pf_numPointsForOutsideEdge[1],
                                              pf_numPointsForOutsideEdge[2]);
  var insideEdgePointBaseOffset = pf_insideEdgePointBaseOffset;
  var outsideEdgePointBaseOffset = 0;
  for (var ring = 1; ring < numRings; ring++) {
    let numPointsForInsideEdge = pf_numPointsForInsideTessFactor[0] - 2 * ring;
    let edge0InsidePointBaseOffset = insideEdgePointBaseOffset;
    let edge0OutsidePointBaseOffset = outsideEdgePointBaseOffset;
    for (var edge = 0; edge < 3; edge++) {
      let numTriangles = numPointsForInsideEdge + numPointsForOutsideEdge[edge] - 2;
      var insideBaseOffset: i32;
      var outsideBaseOffset: i32;
      if (edge == 2) {
        ipc_insideDelta = insideEdgePointBaseOffset;
        ipc_insideBad = numPointsForInsideEdge - 1;
        ipc_insideReplacement = edge0InsidePointBaseOffset;
        ipc_outsidePatchBase = ipc_insideBad + 1;
        ipc_outsideDelta = outsideEdgePointBaseOffset - ipc_outsidePatchBase;
        ipc_outsideBad = ipc_outsidePatchBase + numPointsForOutsideEdge[edge] - 1;
        ipc_outsideReplacement = edge0OutsidePointBaseOffset;
        m_bUsingPatchedIndices = true;
        insideBaseOffset = 0;
        outsideBaseOffset = ipc_outsidePatchBase;
      } else {
        insideBaseOffset = insideEdgePointBaseOffset;
        outsideBaseOffset = outsideEdgePointBaseOffset;
      }
      if (ring == 1) {
        StitchTransition(m_NumIndices,
          insideBaseOffset, pf_insideCtx[0].numHalfTessFactorPoints, pf_insideParity[0],
          outsideBaseOffset, outsideCtxNumHalf[edge], outsideTessFactorParity[edge]);
      } else {
        StitchRegular(true, DIAG_MIRRORED, m_NumIndices, numPointsForInsideEdge,
          insideBaseOffset, outsideBaseOffset);
      }
      if (edge == 2) {
        m_bUsingPatchedIndices = false;
      }
      m_NumIndices += numTriangles * 3;
      outsideEdgePointBaseOffset += numPointsForOutsideEdge[edge] - 1;
      insideEdgePointBaseOffset += numPointsForInsideEdge - 1;
      numPointsForOutsideEdge[edge] = numPointsForInsideEdge;
    }
    if (ring == 1) {
      for (var edge = 0; edge < 3; edge++) {
        outsideCtxNumHalf[edge] = pf_insideCtx[0].numHalfTessFactorPoints;
        outsideTessFactorParity[edge] = pf_insideParity[0];
      }
    }
  }
  if (Odd()) {
    DefineClockwiseTriangle(outsideEdgePointBaseOffset, outsideEdgePointBaseOffset + 1,
      outsideEdgePointBaseOffset + 2, m_NumIndices);
    m_NumIndices += 3;
  }
}

// tessellator.cpp:967-1017
fn TessellateTriDomain(f0: f32, f1: f32, f2: f32, inside: f32) {
  TriProcessTessFactors(RoundUpPow2(f0), RoundUpPow2(f1), RoundUpPow2(f2), RoundUpPow2(inside));
  if (pf_bPatchCulled) {
    m_NumPoints = 0;
    m_NumIndices = 0;
    return;
  }
  if (pf_bJustDoMinimumTessFactor) {
    DefinePoint(0u, FXP_ONE, 0);
    DefinePoint(0u, 0u, 1);
    DefinePoint(FXP_ONE, 0u, 2);
    m_NumPoints = 3;
    DefineClockwiseTriangle(0, 1, 2, 0);
    m_NumIndices = 3;
    return;
  }
  TriGeneratePoints();
  TriGenerateConnectivity();
}

// CHWTessellator::Init (tessellator.cpp:411-440) and the patch's factors.
fn Factor(patchIndex: u32, k: u32) -> f32 {
  let h = params.firstFactorHalf + patchIndex * params.halvesPerPatch + k;
  let pair = unpack2x16float(factors[h >> 1u]);
  return select(pair.x, pair.y, (h & 1u) != 0u);
}
fn Tessellate(patchIndex: u32) {
  m_partitioning = params.partitioning;
  m_originalPartitioning = params.partitioning;
  m_parity = PARITY_ODD;
  if (params.partitioning == P_EVEN) { m_parity = PARITY_EVEN; }
  m_originalParity = m_parity;
  m_NumPoints = 0;
  m_NumIndices = 0;
  m_bUsingPatchedIndices = false;
  m_bUsingPatchedIndices2 = false;
  g_patch = patchIndex;
  if (params.domain == 0u) {
    TessellateQuadDomain(Factor(patchIndex, 0u), Factor(patchIndex, 1u), Factor(patchIndex, 2u), Factor(patchIndex, 3u),
                         Factor(patchIndex, 4u), Factor(patchIndex, 5u));
  } else {
    TessellateTriDomain(Factor(patchIndex, 0u), Factor(patchIndex, 1u), Factor(patchIndex, 2u), Factor(patchIndex, 3u));
  }
}

@compute @workgroup_size(64)
fn countEntry(@builtin(global_invocation_id) gid: vec3<u32>) {
  let patchIndex = gid.x;
  if (patchIndex >= params.patchCount) { return; }
  g_write = false;
  Tessellate(patchIndex);
  counts[2u * patchIndex] = u32(m_NumPoints);
  counts[2u * patchIndex + 1u] = u32(m_NumIndices);
}

var<workgroup> wgPoints: array<u32, 256>;
var<workgroup> wgIndices: array<u32, 256>;

@compute @workgroup_size(256)
fn scanEntry(@builtin(local_invocation_index) t: u32) {
  let n = params.patchCount;
  let per = (n + 255u) / 256u;
  let begin = min(t * per, n);
  let end = min(begin + per, n);
  var sp = 0u;
  var si = 0u;
  for (var i = begin; i < end; i++) {
    sp += counts[2u * i];
    si += counts[2u * i + 1u];
  }
  wgPoints[t] = sp;
  wgIndices[t] = si;
  workgroupBarrier();
  for (var off = 1u; off < 256u; off = off << 1u) {
    var ap = 0u;
    var ai = 0u;
    if (t >= off) {
      ap = wgPoints[t - off];
      ai = wgIndices[t - off];
    }
    workgroupBarrier();
    wgPoints[t] += ap;
    wgIndices[t] += ai;
    workgroupBarrier();
  }
  var rp = wgPoints[t] - sp;
  var ri = wgIndices[t] - si;
  for (var i = begin; i < end; i++) {
    let cp = counts[2u * i];
    let ci = counts[2u * i + 1u];
    counts[2u * i] = rp;
    counts[2u * i + 1u] = ri;
    rp += cp;
    ri += ci;
  }
  if (t == 255u) {
    let totalPoints = wgPoints[255];
    let totalIndices = wgIndices[255];
    let pointBase = state[0];
    let indexBase = state[1];
    let fits = totalPoints <= params.pointCapacity - min(pointBase, params.pointCapacity) &&
               totalIndices <= params.indexCapacity - min(indexBase, params.indexCapacity);
    state[2] += totalPoints;
    state[3] += totalIndices;
    state[5] = pointBase;
    state[6] = indexBase;
    state[7] = select(0u, 1u, fits);
    let a = params.argsWord;
    state[a] = select(0u, totalIndices, fits);
    state[a + 1u] = params.instanceCount;
    state[a + 2u] = indexBase;
    state[a + 3u] = 0u;
    state[a + 4u] = 0u;
    if (fits) {
      state[0] = pointBase + totalPoints;
      state[1] = indexBase + totalIndices;
    } else {
      state[4] += 1u;
    }
  }
}

@compute @workgroup_size(64)
fn writeEntry(@builtin(global_invocation_id) gid: vec3<u32>) {
  let patchIndex = gid.x;
  if (patchIndex >= params.patchCount || state[7] == 0u) { return; }
  g_write = true;
  g_pointBase = state[5] + counts[2u * patchIndex];
  g_indexBase = state[6] + counts[2u * patchIndex + 1u];
  Tessellate(patchIndex);
}
`
