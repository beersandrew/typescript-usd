// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchBasis.h,
//  opensubdiv/far/patchBasis.cpp
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/patchBasis.h:39-104 and
// patchBasis.cpp:40-1372 -- Far::internal basis evaluation for all patch
// types. Local source addition (see PROVENANCE.md).
//
// DIVERGENCE: the C++ templates over REAL; this evaluates in double and
// writes into the caller's arrays, so a Float32Array output receives float
// values rounded once from the double result (far/types.ts). The C++
// default "0" (absent) output pointers are null here.
//
// OPENSUBDIV_GREGORY_EVAL_TRUE_DERIVATIVES is not defined in the upstream
// build, so the approximate Gregory derivatives (patchBasis.cpp:462-481) are
// the ones ported.

import { PatchType } from './patchDescriptor.ts'
import type { PatchParam } from './patchParam.ts'
import { type Real } from './types.ts'

export type BasisWeights = number[] | Float32Array | Float64Array
type Out = BasisWeights | null | undefined

//
//  Simple bilinear quad (patchBasis.cpp:58-97)
//
export function EvalBasisLinear(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  const sC = 1.0 - s
  const tC = 1.0 - t

  if (wP) {
    wP[0] = sC * tC
    wP[1] = s * tC
    wP[2] = s * t
    wP[3] = sC * t
  }
  if (wDs && wDt) {
    wDs[0] = -tC
    wDs[1] = tC
    wDs[2] = t
    wDs[3] = -t

    wDt[0] = -sC
    wDt[1] = -s
    wDt[2] = s
    wDt[3] = sC

    if (wDss && wDst && wDtt) {
      for (let i = 0; i < 4; ++i) {
        wDss[i] = 0.0
        wDtt[i] = 0.0
      }

      wDst[0] = 1.0
      wDst[1] = -1.0
      wDst[2] = 1.0
      wDst[3] = -1.0
    }
  }
  return 4
}

//
//  Bicubic BSpline patch (patchBasis.cpp:99-251)
//
// patchBasis.cpp:126-152
function evalBSplineCurve(t: number, wP: number[] | null, wDP: number[] | null, wDP2: number[] | null): void {
  const one6th = 1.0 / 6.0

  const t2 = t * t
  const t3 = t * t2

  if (wP) {
    wP[0] = one6th * (1.0 - 3.0 * (t - t2) - t3)
    wP[1] = one6th * (4.0 - 6.0 * t2 + 3.0 * t3)
    wP[2] = one6th * (1.0 + 3.0 * (t + t2 - t3))
    wP[3] = one6th * t3
  }
  if (wDP) {
    wDP[0] = -0.5 * t2 + t - 0.5
    wDP[1] = 1.5 * t2 - 2.0 * t
    wDP[2] = -1.5 * t2 + t + 0.5
    wDP[3] = 0.5 * t2
  }
  if (wDP2) {
    wDP2[0] = -t + 1.0
    wDP2[1] = 3.0 * t - 2.0
    wDP2[2] = -3.0 * t + 1.0
    wDP2[3] = t
  }
}

// patchBasis.cpp:157-189
function adjustBSplineBoundaryWeights(boundary: number, w: BasisWeights): void {
  if ((boundary & 1) !== 0) {
    for (let i = 0; i < 4; ++i) {
      w[i + 8] = w[i + 8]! - w[i + 0]!
      w[i + 4] = w[i + 4]! + w[i + 0]! * 2.0
      w[i + 0] = 0.0
    }
  }
  if ((boundary & 2) !== 0) {
    for (let i = 0; i < 16; i += 4) {
      w[i + 1] = w[i + 1]! - w[i + 3]!
      w[i + 2] = w[i + 2]! + w[i + 3]! * 2.0
      w[i + 3] = 0.0
    }
  }
  if ((boundary & 4) !== 0) {
    for (let i = 0; i < 4; ++i) {
      w[i + 4] = w[i + 4]! - w[i + 12]!
      w[i + 8] = w[i + 8]! + w[i + 12]! * 2.0
      w[i + 12] = 0.0
    }
  }
  if ((boundary & 8) !== 0) {
    for (let i = 0; i < 16; i += 4) {
      w[i + 2] = w[i + 2]! - w[i + 0]!
      w[i + 1] = w[i + 1]! + w[i + 0]! * 2.0
      w[i + 0] = 0.0
    }
  }
}

// patchBasis.cpp:191-210
function boundBasisBSpline(boundary: number, wP: Out, wDs: Out, wDt: Out, wDss: Out, wDst: Out, wDtt: Out): void {
  if (wP) {
    adjustBSplineBoundaryWeights(boundary, wP)
  }
  if (wDs && wDt) {
    adjustBSplineBoundaryWeights(boundary, wDs)
    adjustBSplineBoundaryWeights(boundary, wDt)

    if (wDss && wDst && wDtt) {
      adjustBSplineBoundaryWeights(boundary, wDss)
      adjustBSplineBoundaryWeights(boundary, wDst)
      adjustBSplineBoundaryWeights(boundary, wDtt)
    }
  }
}

// Tensor-product combination shared by the BSpline and Bezier bases
// (patchBasis.cpp:225-249 and 319-343).
function combineTensor(
  sW: number[],
  tW: number[],
  dsW: number[],
  dtW: number[],
  dssW: number[],
  dttW: number[],
  wP: Out,
  wDs: Out,
  wDt: Out,
  wDss: Out,
  wDst: Out,
  wDtt: Out,
): void {
  if (wP) {
    for (let i = 0; i < 4; ++i) {
      for (let j = 0; j < 4; ++j) {
        wP[4 * i + j] = sW[j]! * tW[i]!
      }
    }
  }
  if (wDs && wDt) {
    for (let i = 0; i < 4; ++i) {
      for (let j = 0; j < 4; ++j) {
        wDs[4 * i + j] = dsW[j]! * tW[i]!
        wDt[4 * i + j] = sW[j]! * dtW[i]!
      }
    }

    if (wDss && wDst && wDtt) {
      for (let i = 0; i < 4; ++i) {
        for (let j = 0; j < 4; ++j) {
          wDss[4 * i + j] = dssW[j]! * tW[i]!
          wDst[4 * i + j] = dsW[j]! * dtW[i]!
          wDtt[4 * i + j] = sW[j]! * dttW[i]!
        }
      }
    }
  }
}

// patchBasis.cpp:214-251
export function EvalBasisBSpline(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  const sWeights: number[] = [],
    tWeights: number[] = [],
    dsWeights: number[] = [],
    dtWeights: number[] = [],
    dssWeights: number[] = [],
    dttWeights: number[] = []

  evalBSplineCurve(s, wP ? sWeights : null, wDs ? dsWeights : null, wDss ? dssWeights : null)
  evalBSplineCurve(t, wP ? tWeights : null, wDt ? dtWeights : null, wDtt ? dttWeights : null)

  combineTensor(sWeights, tWeights, dsWeights, dtWeights, dssWeights, dttWeights, wP, wDs, wDt, wDss, wDst, wDtt)
  return 16
}

//
//  Bicubic Bezier patch (patchBasis.cpp:253-345)
//
// patchBasis.cpp:275-305
function evalBezierCurve(t: number, wP: number[] | null, wDP: number[] | null, wDP2: number[] | null): void {
  //  The four uniform cubic Bezier basis functions (in terms of t and its
  //  complement tC) evaluated at t:
  const t2 = t * t
  const tC = 1.0 - t
  const tC2 = tC * tC

  if (wP) {
    wP[0] = tC2 * tC
    wP[1] = tC2 * t * 3.0
    wP[2] = t2 * tC * 3.0
    wP[3] = t2 * t
  }

  //  Derivatives of the above four basis functions at t:
  if (wDP) {
    wDP[0] = -3.0 * tC2
    wDP[1] = 9.0 * t2 - 12.0 * t + 3.0
    wDP[2] = -9.0 * t2 + 6.0 * t
    wDP[3] = 3.0 * t2
  }

  //  Second derivatives of the basis functions at t:
  if (wDP2) {
    wDP2[0] = 6.0 * tC
    wDP2[1] = 18.0 * t - 12.0
    wDP2[2] = -18.0 * t + 6.0
    wDP2[3] = 6.0 * t
  }
}

// patchBasis.cpp:308-345
export function EvalBasisBezier(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  const sWeights: number[] = [],
    tWeights: number[] = [],
    dsWeights: number[] = [],
    dtWeights: number[] = [],
    dssWeights: number[] = [],
    dttWeights: number[] = []

  evalBezierCurve(s, wP ? sWeights : null, wDs ? dsWeights : null, wDss ? dssWeights : null)
  evalBezierCurve(t, wP ? tWeights : null, wDt ? dtWeights : null, wDtt ? dttWeights : null)

  combineTensor(sWeights, tWeights, dsWeights, dtWeights, dssWeights, dttWeights, wP, wDs, wDt, wDss, wDst, wDtt)
  return 16
}

//
//  Cubic Gregory patch (patchBasis.cpp:347-532)
//
export function EvalBasisGregory(s: number, t: number, point: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  //  Indices of boundary and interior points and their corresponding Bezier
  //  points (patchBasis.cpp:386-392):
  const boundaryGregory = [0, 1, 7, 5, 2, 6, 16, 12, 15, 17, 11, 10]
  const boundaryBezSCol = [0, 1, 2, 3, 0, 3, 0, 3, 0, 1, 2, 3]
  const boundaryBezTRow = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 3]

  const interiorGregory = [3, 4, 8, 9, 13, 14, 18, 19]
  const interiorBezSCol = [1, 1, 2, 2, 2, 2, 1, 1]
  const interiorBezTRow = [1, 1, 1, 1, 2, 2, 2, 2]

  //  Directional Bezier basis functions B at s and t:
  const Bs: number[] = [],
    Bds: number[] = [],
    Bdss: number[] = []
  const Bt: number[] = [],
    Bdt: number[] = [],
    Bdtt: number[] = []

  evalBezierCurve(s, Bs, wDs ? Bds : null, wDss ? Bdss : null)
  evalBezierCurve(t, Bt, wDt ? Bdt : null, wDtt ? Bdtt : null)

  //  Rational multipliers G at s and t:
  const sC = 1.0 - s
  const tC = 1.0 - t

  //  Use <= here to avoid compiler warnings -- the sums should always be
  //  non-negative:
  let df0 = s + t
  df0 = df0 <= 0.0 ? 1.0 : 1.0 / df0
  let df1 = sC + t
  df1 = df1 <= 0.0 ? 1.0 : 1.0 / df1
  let df2 = sC + tC
  df2 = df2 <= 0.0 ? 1.0 : 1.0 / df2
  let df3 = s + tC
  df3 = df3 <= 0.0 ? 1.0 : 1.0 / df3

  //  Make sure the G[i] for pairs of interior points sum to 1 in all cases:
  const G = [s * df0, 1.0 - s * df0, t * df1, 1.0 - t * df1, sC * df2, 1.0 - sC * df2, tC * df3, 1.0 - tC * df3]

  //  Combined weights for boundary and interior points:
  if (point) {
    for (let i = 0; i < 12; ++i) {
      point[boundaryGregory[i]!] = Bs[boundaryBezSCol[i]!]! * Bt[boundaryBezTRow[i]!]!
    }
    for (let i = 0; i < 8; ++i) {
      point[interiorGregory[i]!] = Bs[interiorBezSCol[i]!]! * Bt[interiorBezTRow[i]!]! * G[i]!
    }
  }

  if (wDs && wDt) {
    const find_second_partials = !!(wDs && wDst && wDtt)

    //  Combined weights for boundary points -- simple tensor products:
    for (let i = 0; i < 12; ++i) {
      const iDst = boundaryGregory[i]!
      const tRow = boundaryBezTRow[i]!
      const sCol = boundaryBezSCol[i]!

      wDs[iDst] = Bds[sCol]! * Bt[tRow]!
      wDt[iDst] = Bdt[tRow]! * Bs[sCol]!

      if (find_second_partials) {
        wDss![iDst] = Bdss[sCol]! * Bt[tRow]!
        wDst![iDst] = Bds[sCol]! * Bdt[tRow]!
        wDtt![iDst] = Bs[sCol]! * Bdtt[tRow]!
      }
    }

    //  Approximation to the true Gregory derivatives by differentiating the
    //  Bezier patch unique to the given (s,t) (patchBasis.cpp:462-481):
    for (let i = 0; i < 8; ++i) {
      const iDst = interiorGregory[i]!
      const tRow = interiorBezTRow[i]!
      const sCol = interiorBezSCol[i]!

      wDs[iDst] = Bds[sCol]! * Bt[tRow]! * G[i]!
      wDt[iDst] = Bdt[tRow]! * Bs[sCol]! * G[i]!

      if (find_second_partials) {
        wDss![iDst] = Bdss[sCol]! * Bt[tRow]! * G[i]!
        wDst![iDst] = Bds[sCol]! * Bdt[tRow]! * G[i]!
        wDtt![iDst] = Bs[sCol]! * Bdtt[tRow]! * G[i]!
      }
    }
  }
  return 20
}

//
//  Simple linear triangle (patchBasis.cpp:559-589)
//
export function EvalBasisLinearTri(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  if (wP) {
    wP[0] = 1.0 - s - t
    wP[1] = s
    wP[2] = t
  }
  if (wDs && wDt) {
    wDs[0] = -1.0
    wDs[1] = 1.0
    wDs[2] = 0.0

    wDt[0] = -1.0
    wDt[1] = 0.0
    wDt[2] = 1.0

    if (wDss && wDst && wDtt) {
      wDss[0] = wDss[1] = wDss[2] = 0.0
      wDst[0] = wDst[1] = wDst[2] = 0.0
      wDtt[0] = wDtt[1] = wDtt[2] = 0.0
    }
  }
  return 3
}

//
//  Quartic Box spline triangle (patchBasis.cpp:592-1011)
//
// patchBasis.cpp:645-668
function evalBivariateMonomialsQuartic(s: number, t: number, M: number[]): void {
  M[0] = 1.0

  M[1] = s
  M[2] = t

  M[3] = s * s
  M[4] = s * t
  M[5] = t * t

  M[6] = M[3]! * s
  M[7] = M[4]! * s
  M[8] = M[4]! * t
  M[9] = M[5]! * t

  M[10] = M[6]! * s
  M[11] = M[7]! * s
  M[12] = M[3]! * M[5]!
  M[13] = M[8]! * t
  M[14] = M[9]! * t
}

// patchBasis.cpp:670-770
function evalBoxSplineTriDerivWeights(M: number[], ds: number, dt: number, w: BasisWeights): void {
  let S = 1.0

  const totalOrder = ds + dt
  if (totalOrder === 0) {
    S *= 1.0 / 12.0

    w[0] = S * (1 - 2 * M[1]! - 4 * M[2]! + 6 * M[4]! + 6 * M[5]! + 2 * M[6]! - 6 * M[8]! - 4 * M[9]! - M[10]! - 2 * M[11]! + 2 * M[13]! + M[14]!)
    w[1] = S * (1 + 2 * M[1]! - 2 * M[2]! - 6 * M[4]! - 4 * M[6]! + 6 * M[8]! + 2 * M[9]! + 2 * M[10]! + 4 * M[11]! - 2 * M[13]! - M[14]!)
    w[2] = S * (2 * M[6]! - M[10]! - 2 * M[11]!)
    w[3] = S * (1 - 4 * M[1]! - 2 * M[2]! + 6 * M[3]! + 6 * M[4]! - 4 * M[6]! - 6 * M[7]! + 2 * M[9]! + M[10]! + 2 * M[11]! - 2 * M[13]! - M[14]!)
    w[4] = S * (6 - 12 * M[3]! - 12 * M[4]! - 12 * M[5]! + 8 * M[6]! + 12 * M[7]! + 12 * M[8]! + 8 * M[9]! - M[10]! - 2 * M[11]! - 2 * M[13]! - M[14]!)
    w[5] = S * (1 + 4 * M[1]! + 2 * M[2]! + 6 * M[3]! + 6 * M[4]! - 4 * M[6]! - 6 * M[7]! - 12 * M[8]! - 4 * M[9]! - M[10]! - 2 * M[11]! + 4 * M[13]! + 2 * M[14]!)
    w[6] = S * (M[10]! + 2 * M[11]!)
    w[7] = S * (1 - 2 * M[1]! + 2 * M[2]! - 6 * M[4]! + 2 * M[6]! + 6 * M[7]! - 4 * M[9]! - M[10]! - 2 * M[11]! + 4 * M[13]! + 2 * M[14]!)
    w[8] = S * (1 + 2 * M[1]! + 4 * M[2]! + 6 * M[4]! + 6 * M[5]! - 4 * M[6]! - 12 * M[7]! - 6 * M[8]! - 4 * M[9]! + 2 * M[10]! + 4 * M[11]! - 2 * M[13]! - M[14]!)
    w[9] = S * (2 * M[6]! + 6 * M[7]! + 6 * M[8]! + 2 * M[9]! - M[10]! - 2 * M[11]! - 2 * M[13]! - M[14]!)
    w[10] = S * (2 * M[9]! - 2 * M[13]! - M[14]!)
    w[11] = S * (2 * M[13]! + M[14]!)
  } else if (totalOrder === 1) {
    S *= 1.0 / 6.0

    if (ds) {
      w[0] = S * (-1 + 3 * M[2]! + 3 * M[3]! - 3 * M[5]! - 2 * M[6]! - 3 * M[7]! + M[9]!)
      w[1] = S * (1 - 3 * M[2]! - 6 * M[3]! + 3 * M[5]! + 4 * M[6]! + 6 * M[7]! - M[9]!)
      w[2] = S * (3 * M[3]! - 2 * M[6]! - 3 * M[7]!)
      w[3] = S * (-2 + 6 * M[1]! + 3 * M[2]! - 6 * M[3]! - 6 * M[4]! + 2 * M[6]! + 3 * M[7]! - M[9]!)
      w[4] = S * (-12 * M[1]! - 6 * M[2]! + 12 * M[3]! + 12 * M[4]! + 6 * M[5]! - 2 * M[6]! - 3 * M[7]! - M[9]!)
      w[5] = S * (2 + 6 * M[1]! + 3 * M[2]! - 6 * M[3]! - 6 * M[4]! - 6 * M[5]! - 2 * M[6]! - 3 * M[7]! + 2 * M[9]!)
      w[6] = S * (2 * M[6]! + 3 * M[7]!)
      w[7] = S * (-1 - 3 * M[2]! + 3 * M[3]! + 6 * M[4]! - 2 * M[6]! - 3 * M[7]! + 2 * M[9]!)
      w[8] = S * (1 + 3 * M[2]! - 6 * M[3]! - 12 * M[4]! - 3 * M[5]! + 4 * M[6]! + 6 * M[7]! - M[9]!)
      w[9] = S * (3 * M[3]! + 6 * M[4]! + 3 * M[5]! - 2 * M[6]! - 3 * M[7]! - M[9]!)
      w[10] = S * -M[9]!
      w[11] = S * M[9]!
    } else {
      w[0] = S * (-2 + 3 * M[1]! + 6 * M[2]! - 6 * M[4]! - 6 * M[5]! - M[6]! + 3 * M[8]! + 2 * M[9]!)
      w[1] = S * (-1 - 3 * M[1]! + 6 * M[4]! + 3 * M[5]! + 2 * M[6]! - 3 * M[8]! - 2 * M[9]!)
      w[2] = S * -M[6]!
      w[3] = S * (-1 + 3 * M[1]! - 3 * M[3]! + 3 * M[5]! + M[6]! - 3 * M[8]! - 2 * M[9]!)
      w[4] = S * (-6 * M[1]! - 12 * M[2]! + 6 * M[3]! + 12 * M[4]! + 12 * M[5]! - M[6]! - 3 * M[8]! - 2 * M[9]!)
      w[5] = S * (1 + 3 * M[1]! - 3 * M[3]! - 12 * M[4]! - 6 * M[5]! - M[6]! + 6 * M[8]! + 4 * M[9]!)
      w[6] = S * +M[6]!
      w[7] = S * (1 - 3 * M[1]! + 3 * M[3]! - 6 * M[5]! - M[6]! + 6 * M[8]! + 4 * M[9]!)
      w[8] = S * (2 + 3 * M[1]! + 6 * M[2]! - 6 * M[3]! - 6 * M[4]! - 6 * M[5]! + 2 * M[6]! - 3 * M[8]! - 2 * M[9]!)
      w[9] = S * (+3 * M[3]! + 6 * M[4]! + 3 * M[5]! - M[6]! - 3 * M[8]! - 2 * M[9]!)
      w[10] = S * (3 * M[5]! - 3 * M[8]! - 2 * M[9]!)
      w[11] = S * (3 * M[8]! + 2 * M[9]!)
    }
  } else if (totalOrder === 2) {
    if (ds === 2) {
      w[0] = S * (+M[1]! - M[3]! - M[4]!)
      w[1] = S * (-2 * M[1]! + 2 * M[3]! + 2 * M[4]!)
      w[2] = S * (M[1]! - M[3]! - M[4]!)
      w[3] = S * (1 - 2 * M[1]! - M[2]! + M[3]! + M[4]!)
      w[4] = S * (-2 + 4 * M[1]! + 2 * M[2]! - M[3]! - M[4]!)
      w[5] = S * (1 - 2 * M[1]! - M[2]! - M[3]! - M[4]!)
      w[6] = S * (M[3]! + M[4]!)
      w[7] = S * (+M[1]! + M[2]! - M[3]! - M[4]!)
      w[8] = S * (-2 * M[1]! - 2 * M[2]! + 2 * M[3]! + 2 * M[4]!)
      w[9] = S * (M[1]! + M[2]! - M[3]! - M[4]!)
      w[10] = 0
      w[11] = 0
    } else if (dt === 2) {
      w[0] = S * (1 - M[1]! - 2 * M[2]! + M[4]! + M[5]!)
      w[1] = S * (+M[1]! + M[2]! - M[4]! - M[5]!)
      w[2] = 0
      w[3] = S * (+M[2]! - M[4]! - M[5]!)
      w[4] = S * (-2 + 2 * M[1]! + 4 * M[2]! - M[4]! - M[5]!)
      w[5] = S * (-2 * M[1]! - 2 * M[2]! + 2 * M[4]! + 2 * M[5]!)
      w[6] = 0
      w[7] = S * (-2 * M[2]! + 2 * M[4]! + 2 * M[5]!)
      w[8] = S * (1 - M[1]! - 2 * M[2]! - M[4]! - M[5]!)
      w[9] = S * (+M[1]! + M[2]! - M[4]! - M[5]!)
      w[10] = S * (M[2]! - M[4]! - M[5]!)
      w[11] = S * (M[4]! + M[5]!)
    } else {
      S *= 1.0 / 2.0

      w[0] = S * (1 - 2 * M[2]! - M[3]! + M[5]!)
      w[1] = S * (-1 + 2 * M[2]! + 2 * M[3]! - M[5]!)
      w[2] = S * -M[3]!
      w[3] = S * (1 - 2 * M[1]! + M[3]! - M[5]!)
      w[4] = S * (-2 + 4 * M[1]! + 4 * M[2]! - M[3]! - M[5]!)
      w[5] = S * (1 - 2 * M[1]! - 4 * M[2]! - M[3]! + 2 * M[5]!)
      w[6] = S * +M[3]!
      w[7] = S * (-1 + 2 * M[1]! - M[3]! + 2 * M[5]!)
      w[8] = S * (1 - 4 * M[1]! - 2 * M[2]! + 2 * M[3]! - M[5]!)
      w[9] = S * (+2 * M[1]! + 2 * M[2]! - M[3]! - M[5]!)
      w[10] = S * -M[5]!
      w[11] = S * M[5]!
    }
  } else {
    throw new Error('evalBoxSplineTriDerivWeights: totalOrder > 2')
  }
}

// patchBasis.cpp:772-965
function adjustBoxSplineTriBoundaryWeights(boundaryMask: number, weights: BasisWeights): void {
  if (boundaryMask === 0) return

  //  Determine boundary edges and vertices from the lower 3 and upper 2
  //  bits of the 5-bit mask:
  const upperBits = (boundaryMask >> 3) & 0x3
  const lowerBits = boundaryMask & 7

  let eBits = lowerBits
  let vBits = 0

  if (upperBits === 1) {
    //  Boundary vertices only:
    vBits = eBits
    eBits = 0
  } else if (upperBits === 2) {
    //  Opposite vertex bit is edge bit rotated one to the right:
    vBits = ((eBits & 1) << 2) | (eBits >> 1)
  }

  const edge0IsBoundary = (eBits & 1) !== 0
  const edge1IsBoundary = (eBits & 2) !== 0
  const edge2IsBoundary = (eBits & 4) !== 0

  const w = weights
  const add = (i: number, x: number): void => {
    w[i] = w[i]! + x
  }

  //  Adjust weights for the 4 boundary points and 3 interior points to
  //  account for the 3 phantom points adjacent to each boundary edge:
  if (edge0IsBoundary) {
    const w0 = w[0]!
    if (edge2IsBoundary) {
      //  P0 = B1 + (B1 - I1)
      add(4, w0)
      add(4, w0)
      add(8, -w0)
    } else {
      //  P0 = B1 + (B0 - I0)
      add(4, w0)
      add(3, w0)
      add(7, -w0)
    }

    //  P1 = B1 + (B2 - I1)
    const w1 = w[1]!
    add(4, w1)
    add(5, w1)
    add(8, -w1)

    const w2 = w[2]!
    if (edge1IsBoundary) {
      //  P2 = B2 + (B2 - I1)
      add(5, w2)
      add(5, w2)
      add(8, -w2)
    } else {
      //  P2 = B2 + (B3 - I2)
      add(5, w2)
      add(6, w2)
      add(9, -w2)
    }
    //  Clear weights for the phantom points:
    w[0] = w[1] = w[2] = 0.0
  }
  if (edge1IsBoundary) {
    const w0 = w[6]!
    if (edge0IsBoundary) {
      add(5, w0)
      add(5, w0)
      add(4, -w0)
    } else {
      add(5, w0)
      add(2, w0)
      add(1, -w0)
    }

    const w1 = w[9]!
    add(5, w1)
    add(8, w1)
    add(4, -w1)

    const w2 = w[11]!
    if (edge2IsBoundary) {
      add(8, w2)
      add(8, w2)
      add(4, -w2)
    } else {
      add(8, w2)
      add(10, w2)
      add(7, -w2)
    }
    w[6] = w[9] = w[11] = 0.0
  }
  if (edge2IsBoundary) {
    const w0 = w[10]!
    if (edge1IsBoundary) {
      add(8, w0)
      add(8, w0)
      add(5, -w0)
    } else {
      add(8, w0)
      add(11, w0)
      add(9, -w0)
    }

    const w1 = w[7]!
    add(8, w1)
    add(4, w1)
    add(5, -w1)

    const w2 = w[3]!
    if (edge0IsBoundary) {
      add(4, w2)
      add(4, w2)
      add(5, -w2)
    } else {
      add(4, w2)
      add(0, w2)
      add(1, -w2)
    }
    w[10] = w[7] = w[3] = 0.0
  }

  //  Adjust weights for the 3 boundary points and the 2 interior points to
  //  account for the 2 phantom points adjacent to each boundary vertex:
  if ((vBits & 1) !== 0) {
    const w0 = w[3]!
    add(4, w0)
    add(7, w0)
    add(8, -w0)

    const w1 = w[0]!
    add(4, w1)
    add(1, w1)
    add(5, -w1)

    w[3] = w[0] = 0.0
  }
  if ((vBits & 2) !== 0) {
    const w0 = w[2]!
    add(5, w0)
    add(1, w0)
    add(4, -w0)

    const w1 = w[6]!
    add(5, w1)
    add(9, w1)
    add(8, -w1)

    w[2] = w[6] = 0.0
  }
  if ((vBits & 4) !== 0) {
    const w0 = w[11]!
    add(8, w0)
    add(9, w0)
    add(5, -w0)

    const w1 = w[10]!
    add(8, w1)
    add(7, w1)
    add(4, -w1)

    w[11] = w[10] = 0.0
  }
}

// patchBasis.cpp:967-986
function boundBasisBoxSplineTri(boundary: number, wP: Out, wDs: Out, wDt: Out, wDss: Out, wDst: Out, wDtt: Out): void {
  if (wP) {
    adjustBoxSplineTriBoundaryWeights(boundary, wP)
  }
  if (wDs && wDt) {
    adjustBoxSplineTriBoundaryWeights(boundary, wDs)
    adjustBoxSplineTriBoundaryWeights(boundary, wDt)

    if (wDss && wDst && wDtt) {
      adjustBoxSplineTriBoundaryWeights(boundary, wDss)
      adjustBoxSplineTriBoundaryWeights(boundary, wDst)
      adjustBoxSplineTriBoundaryWeights(boundary, wDtt)
    }
  }
}

// patchBasis.cpp:989-1011
export function EvalBasisBoxSplineTri(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  const stMonomials: number[] = []
  evalBivariateMonomialsQuartic(s, t, stMonomials)

  if (wP) {
    evalBoxSplineTriDerivWeights(stMonomials, 0, 0, wP)
  }
  if (wDs && wDt) {
    evalBoxSplineTriDerivWeights(stMonomials, 1, 0, wDs)
    evalBoxSplineTriDerivWeights(stMonomials, 0, 1, wDt)

    if (wDss && wDst && wDtt) {
      evalBoxSplineTriDerivWeights(stMonomials, 2, 0, wDss)
      evalBoxSplineTriDerivWeights(stMonomials, 1, 1, wDst)
      evalBoxSplineTriDerivWeights(stMonomials, 0, 2, wDtt)
    }
  }
  return 12
}

//
//  Quartic Bezier triangle (patchBasis.cpp:1014-1180)
//
// patchBasis.cpp:1037-1157
function evalBezierTriDerivWeights(s: number, t: number, ds: number, dt: number, wB: BasisWeights): void {
  const u = s
  const v = t
  const w = 1 - u - v

  const uu = u * u
  const vv = v * v
  const ww = w * w

  const uv = u * v
  const vw = v * w
  const uw = u * w

  const totalOrder = ds + dt
  if (totalOrder === 0) {
    wB[0] = ww * ww
    wB[1] = 4 * uw * ww
    wB[2] = 6 * uw * uw
    wB[3] = 4 * uw * uu
    wB[4] = uu * uu
    wB[5] = 4 * vw * ww
    wB[6] = 12 * ww * uv
    wB[7] = 12 * uu * vw
    wB[8] = 4 * uv * uu
    wB[9] = 6 * vw * vw
    wB[10] = 12 * vv * uw
    wB[11] = 6 * uv * uv
    wB[12] = 4 * vw * vv
    wB[13] = 4 * uv * vv
    wB[14] = vv * vv
  } else if (totalOrder === 1) {
    if (ds === 1) {
      wB[0] = -4 * ww * w
      wB[1] = 4 * ww * (w - 3 * u)
      wB[2] = 12 * uw * (w - u)
      wB[3] = 4 * uu * (3 * w - u)
      wB[4] = 4 * uu * u
      wB[5] = -12 * vw * w
      wB[6] = 12 * vw * (w - 2 * u)
      wB[7] = 12 * uv * (2 * w - u)
      wB[8] = 12 * uv * u
      wB[9] = -12 * vv * w
      wB[10] = 12 * vv * (w - u)
      wB[11] = 12 * vv * u
      wB[12] = -4 * vv * v
      wB[13] = 4 * vv * v
      wB[14] = 0
    } else {
      wB[0] = -4 * ww * w
      wB[1] = -12 * ww * u
      wB[2] = -12 * uu * w
      wB[3] = -4 * uu * u
      wB[4] = 0
      wB[5] = 4 * ww * (w - 3 * v)
      wB[6] = 12 * uw * (w - 2 * v)
      wB[7] = 12 * uu * (w - v)
      wB[8] = 4 * uu * u
      wB[9] = 12 * vw * (w - v)
      wB[10] = 12 * uv * (2 * w - v)
      wB[11] = 12 * uv * u
      wB[12] = 4 * vv * (3 * w - v)
      wB[13] = 12 * vv * u
      wB[14] = 4 * vv * v
    }
  } else if (totalOrder === 2) {
    if (ds === 2) {
      wB[0] = 12 * ww
      wB[1] = 24 * (uw - ww)
      wB[2] = 12 * (uu - 4 * uw + ww)
      wB[3] = 24 * (uw - uu)
      wB[4] = 12 * uu
      wB[5] = 24 * vw
      wB[6] = 24 * (uv - 2 * vw)
      wB[7] = 24 * (vw - 2 * uv)
      wB[8] = 24 * uv
      wB[9] = 12 * vv
      wB[10] = -24 * vv
      wB[11] = 12 * vv
      wB[12] = 0
      wB[13] = 0
      wB[14] = 0
    } else if (dt === 2) {
      wB[0] = 12 * ww
      wB[1] = 24 * uw
      wB[2] = 12 * uu
      wB[3] = 0
      wB[4] = 0
      wB[5] = 24 * (vw - ww)
      wB[6] = 24 * (uv - 2 * uw)
      wB[7] = -24 * uu
      wB[8] = 0
      wB[9] = 12 * (vv - 4 * vw + ww)
      wB[10] = 24 * (uw - 2 * uv)
      wB[11] = 12 * uu
      wB[12] = 24 * (vw - vv)
      wB[13] = 24 * uv
      wB[14] = 12 * vv
    } else {
      wB[0] = 12 * ww
      wB[3] = -12 * uu
      wB[13] = 12 * vv
      wB[11] = 24 * uv
      wB[1] = 24 * uw - wB[0]!
      wB[2] = -24 * uw - wB[3]!
      wB[5] = 24 * vw - wB[0]!
      wB[6] = -24 * vw + wB[11]! - wB[1]!
      wB[8] = -wB[3]!
      wB[7] = -(wB[11]! + wB[2]!)
      wB[9] = wB[13]! - wB[5]! - wB[0]!
      wB[10] = -(wB[9]! + wB[11]!)
      wB[12] = -wB[13]!
      wB[4] = 0
      wB[14] = 0
    }
  } else {
    throw new Error('evalBezierTriDerivWeights: totalOrder > 2')
  }
}

// patchBasis.cpp:1160-1180
export function EvalBasisBezierTri(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  if (wP) {
    evalBezierTriDerivWeights(s, t, 0, 0, wP)
  }
  if (wDs && wDt) {
    evalBezierTriDerivWeights(s, t, 1, 0, wDs)
    evalBezierTriDerivWeights(s, t, 0, 1, wDt)

    if (wDss && wDst && wDtt) {
      evalBezierTriDerivWeights(s, t, 2, 0, wDss)
      evalBezierTriDerivWeights(s, t, 1, 1, wDst)
      evalBezierTriDerivWeights(s, t, 0, 2, wDtt)
    }
  }
  return 15
}

//
//  Quartic Gregory triangle (patchBasis.cpp:1183-1292)
//
// patchBasis.cpp:1206-1231
function convertBezierWeightsToGregory(wB: readonly number[], rG: readonly number[], wG: BasisWeights): void {
  wG[0] = wB[0]!
  wG[1] = wB[1]!
  wG[2] = wB[5]!
  wG[3] = wB[6]! * rG[0]!
  wG[4] = wB[6]! * rG[1]!

  wG[5] = wB[4]!
  wG[6] = wB[8]!
  wG[7] = wB[3]!
  wG[8] = wB[7]! * rG[2]!
  wG[9] = wB[7]! * rG[3]!

  wG[10] = wB[14]!
  wG[11] = wB[12]!
  wG[12] = wB[13]!
  wG[13] = wB[10]! * rG[4]!
  wG[14] = wB[10]! * rG[5]!

  wG[15] = wB[2]!
  wG[16] = wB[11]!
  wG[17] = wB[9]!
}

// patchBasis.cpp:1234-1292
export function EvalBasisGregoryTri(s: number, t: number, wP: Out, wDs?: Out, wDt?: Out, wDss?: Out, wDst?: Out, wDtt?: Out): number {
  const BP: number[] = [],
    BDs: number[] = [],
    BDt: number[] = [],
    BDss: number[] = [],
    BDst: number[] = [],
    BDtt: number[] = []

  const G = [1.0, 0.0, 1.0, 0.0, 1.0, 0.0]
  const u = s
  const v = t
  const w = 1 - u - v

  if (u + v > 0) {
    G[0] = u / (u + v)
    G[1] = v / (u + v)
  }
  if (v + w > 0) {
    G[2] = v / (v + w)
    G[3] = w / (v + w)
  }
  if (w + u > 0) {
    G[4] = w / (w + u)
    G[5] = u / (w + u)
  }

  //  Compute Bezier basis functions and convert, adjusting interior points:
  if (wP) {
    evalBezierTriDerivWeights(s, t, 0, 0, BP)
    convertBezierWeightsToGregory(BP, G, wP)
  }
  if (wDs && wDt) {
    evalBezierTriDerivWeights(s, t, 1, 0, BDs)
    evalBezierTriDerivWeights(s, t, 0, 1, BDt)

    convertBezierWeightsToGregory(BDs, G, wDs)
    convertBezierWeightsToGregory(BDt, G, wDt)

    if (wDss && wDst && wDtt) {
      evalBezierTriDerivWeights(s, t, 2, 0, BDss)
      evalBezierTriDerivWeights(s, t, 1, 1, BDst)
      evalBezierTriDerivWeights(s, t, 0, 2, BDtt)

      convertBezierWeightsToGregory(BDss, G, wDss)
      convertBezierWeightsToGregory(BDst, G, wDst)
      convertBezierWeightsToGregory(BDtt, G, wDtt)
    }
  }
  return 18
}

// patchBasis.cpp:1298-1329
export function EvaluatePatchBasisNormalized(
  patchType: PatchType,
  param: PatchParam,
  s: number,
  t: number,
  wP: Out,
  wDs?: Out,
  wDt?: Out,
  wDss?: Out,
  wDst?: Out,
  wDtt?: Out,
): number {
  const boundaryMask = param.getBoundary()

  let nPoints = 0
  if (patchType === PatchType.REGULAR) {
    nPoints = EvalBasisBSpline(s, t, wP, wDs, wDt, wDss, wDst, wDtt)
    if (boundaryMask) {
      boundBasisBSpline(boundaryMask, wP, wDs, wDt, wDss, wDst, wDtt)
    }
  } else if (patchType === PatchType.LOOP) {
    nPoints = EvalBasisBoxSplineTri(s, t, wP, wDs, wDt, wDss, wDst, wDtt)
    if (boundaryMask) {
      boundBasisBoxSplineTri(boundaryMask, wP, wDs, wDt, wDss, wDst, wDtt)
    }
  } else if (patchType === PatchType.GREGORY_BASIS) {
    nPoints = EvalBasisGregory(s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  } else if (patchType === PatchType.GREGORY_TRIANGLE) {
    nPoints = EvalBasisGregoryTri(s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  } else if (patchType === PatchType.QUADS) {
    nPoints = EvalBasisLinear(s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  } else if (patchType === PatchType.TRIANGLES) {
    nPoints = EvalBasisLinearTri(s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  } else {
    throw new Error(`EvaluatePatchBasisNormalized: unsupported patch type ${patchType}`)
  }
  return nPoints
}

/** The REAL a basis-weight array evaluates in: float for a Float32Array. */
export function realOfWeights(w: Out): Real {
  return w instanceof Float32Array ? 'float' : 'double'
}

// patchBasis.cpp:1331-1372
export function EvaluatePatchBasis(
  patchType: PatchType,
  param: PatchParam,
  s: number,
  t: number,
  wP: Out,
  wDs?: Out,
  wDt?: Out,
  wDss?: Out,
  wDst?: Out,
  wDtt?: Out,
): number {
  const real = realOfWeights(wP)
  let derivSign = 1.0

  if (patchType === PatchType.LOOP || patchType === PatchType.GREGORY_TRIANGLE || patchType === PatchType.TRIANGLES) {
    ;[s, t] = param.normalizeTriangle(s, t, real)
    if (param.isTriangleRotated()) {
      derivSign = -1.0
    }
  } else {
    ;[s, t] = param.Normalize(s, t, real)
  }

  const nPoints = EvaluatePatchBasisNormalized(patchType, param, s, t, wP, wDs, wDt, wDss, wDst, wDtt)

  if (wDs && wDt) {
    const d1Scale = derivSign * (1 << param.getDepth())

    for (let i = 0; i < nPoints; ++i) {
      wDs[i] = wDs[i]! * d1Scale
      wDt[i] = wDt[i]! * d1Scale
    }

    if (wDss && wDst && wDtt) {
      const d2Scale = derivSign * d1Scale * d1Scale

      for (let i = 0; i < nPoints; ++i) {
        wDss[i] = wDss[i]! * d2Scale
        wDst[i] = wDst[i]! * d2Scale
        wDtt[i] = wDtt[i]! * d2Scale
      }
    }
  }
  return nPoints
}
