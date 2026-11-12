// Ported from OpenSubdiv 3.7.0: opensubdiv/sdc/crease.h,
//  opensubdiv/sdc/crease.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/sdc/crease.{h,cpp} — Sdc::Crease.
//
// Light-weight class that computes crease-related properties (sharpness values
// and associated interpolation weights). Its implementation is independent of
// the subdivision scheme. Methods take primitive arrays rather than topology so
// callers can gather locally for re-use.
//
// DIVERGENCE from upstream: sharpness arithmetic is performed in JS doubles
// rather than C++ `float`. Threshold branches (at 0.0 and 10.0) are unaffected;
// fractional weights differ only beyond float precision, well within the
// tolerance used to compare against the C++ oracle.

import { Options, CreasingMethod, VtxBoundaryInterpolation } from './options.ts'

export enum Rule {
  UNKNOWN = 0,
  SMOOTH = 1 << 0,
  DART = 1 << 1,
  CREASE = 1 << 2,
  CORNER = 1 << 3,
}

export const SHARPNESS_SMOOTH = 0.0
export const SHARPNESS_INFINITE = 10.0

export function IsSmooth(sharpness: number): boolean {
  return sharpness <= SHARPNESS_SMOOTH
}
export function IsSharp(sharpness: number): boolean {
  return sharpness > SHARPNESS_SMOOTH
}
export function IsInfinite(sharpness: number): boolean {
  return sharpness >= SHARPNESS_INFINITE
}
export function IsSemiSharp(sharpness: number): boolean {
  return SHARPNESS_SMOOTH < sharpness && sharpness < SHARPNESS_INFINITE
}

export class Crease {
  private _options: Options

  constructor(options?: Options) {
    this._options = options ?? new Options()
  }

  isUniform(): boolean {
    return this._options.getCreasingMethod() === CreasingMethod.UNIFORM
  }

  //  Optional sharp features ------------------------------------------------

  // Despite the presence of the BOUNDARY_NONE option, boundary edges are always
  // sharpened. Much of the code relies on sharpness to indicate boundaries.
  sharpenBoundaryEdge(_edgeSharpness: number): number {
    return SHARPNESS_INFINITE
  }

  sharpenBoundaryVertex(vertexSharpness: number): number {
    return this._options.getVtxBoundaryInterpolation() === VtxBoundaryInterpolation.EDGE_AND_CORNER
      ? SHARPNESS_INFINITE
      : vertexSharpness
  }

  //  Sharpness subdivision --------------------------------------------------

  private decrementSharpness(sharpness: number): number {
    if (IsSmooth(sharpness)) return SHARPNESS_SMOOTH // redundant but most common
    if (IsInfinite(sharpness)) return SHARPNESS_INFINITE
    if (sharpness > 1.0) return sharpness - 1.0
    return SHARPNESS_SMOOTH
  }

  subdivideUniformSharpness(vertexOrEdgeSharpness: number): number {
    return this.decrementSharpness(vertexOrEdgeSharpness)
  }

  subdivideVertexSharpness(vertexSharpness: number): number {
    return this.decrementSharpness(vertexSharpness)
  }

  subdivideEdgeSharpnessAtVertex(
    edgeSharpness: number,
    incEdgeCountAtVertex: number,
    incEdgeSharpness: ArrayLike<number>,
  ): number {
    if (this.isUniform() || incEdgeCountAtVertex < 2) {
      return this.decrementSharpness(edgeSharpness)
    }

    if (IsSmooth(edgeSharpness)) return SHARPNESS_SMOOTH
    if (IsInfinite(edgeSharpness)) return SHARPNESS_INFINITE

    let sharpSum = 0.0
    let sharpCount = 0
    for (let i = 0; i < incEdgeCountAtVertex; ++i) {
      const s = incEdgeSharpness[i]!
      if (IsSemiSharp(s)) {
        sharpCount++
        sharpSum += s
      }
    }
    if (sharpCount > 1) {
      // Chaikin rule is 3/4 original sharpness + 1/4 average of the others
      const avgSharpnessAtVertex = (sharpSum - edgeSharpness) / (sharpCount - 1)
      edgeSharpness = 0.75 * edgeSharpness + 0.25 * avgSharpnessAtVertex
    }
    edgeSharpness -= 1.0
    return IsSharp(edgeSharpness) ? edgeSharpness : SHARPNESS_SMOOTH
  }

  subdivideEdgeSharpnessesAroundVertex(
    edgeCount: number,
    parentSharpness: ArrayLike<number>,
    childSharpness: number[],
  ): void {
    if (this.isUniform() || edgeCount < 2) {
      for (let i = 0; i < edgeCount; ++i) {
        childSharpness[i] = this.decrementSharpness(parentSharpness[i]!)
      }
      return
    }

    if (this._options.getCreasingMethod() === CreasingMethod.CHAIKIN) {
      let sharpSum = 0.0
      let sharpCount = 0
      for (let i = 0; i < edgeCount; ++i) {
        if (IsSemiSharp(parentSharpness[i]!)) {
          sharpCount++
          sharpSum += parentSharpness[i]!
        }
      }

      // The smooth case is most common -- specialize for it first:
      if (sharpCount === 0) {
        for (let i = 0; i < edgeCount; ++i) {
          childSharpness[i] = parentSharpness[i]!
        }
      } else {
        for (let i = 0; i < edgeCount; ++i) {
          const pSharp = parentSharpness[i]!
          if (IsSmooth(pSharp)) {
            childSharpness[i] = SHARPNESS_SMOOTH
          } else if (IsInfinite(pSharp)) {
            childSharpness[i] = SHARPNESS_INFINITE
          } else if (sharpCount === 1) {
            // Special case to avoid divide by zero below.
            childSharpness[i] = this.decrementSharpness(pSharp)
          } else {
            const pOtherAverage = (sharpSum - pSharp) / (sharpCount - 1)
            // Chaikin rule is 3/4 original sharpness + 1/4 average of the others
            let cSharp = 0.75 * pSharp + 0.25 * pOtherAverage - 1.0
            if (IsSmooth(cSharp)) cSharp = SHARPNESS_SMOOTH
            childSharpness[i] = cSharp
          }
        }
      }
    }
  }

  //  Rule determination -----------------------------------------------------

  determineVertexVertexRule(vertexSharpness: number, sharpEdgeCount: number): Rule
  determineVertexVertexRule(
    vertexSharpness: number,
    incidentEdgeCount: number,
    incidentEdgeSharpness: ArrayLike<number>,
  ): Rule
  determineVertexVertexRule(
    vertexSharpness: number,
    edgeCountOrSharpCount: number,
    incidentEdgeSharpness?: ArrayLike<number>,
  ): Rule {
    if (IsSharp(vertexSharpness)) return Rule.CORNER

    let sharpEdgeCount: number
    if (incidentEdgeSharpness === undefined) {
      sharpEdgeCount = edgeCountOrSharpCount
    } else {
      sharpEdgeCount = 0
      for (let i = 0; i < edgeCountOrSharpCount; ++i) {
        if (IsSharp(incidentEdgeSharpness[i]!)) sharpEdgeCount++
      }
    }
    return sharpEdgeCount > 2 ? Rule.CORNER : (1 << sharpEdgeCount)
  }

  //  Transitional weighting -------------------------------------------------

  computeFractionalWeightAtVertex(
    parentVertexSharpness: number,
    childVertexSharpness: number,
    incidentEdgeCount: number,
    parentSharpness: ArrayLike<number>,
    childSharpness: ArrayLike<number> | null,
  ): number {
    let transitionCount = 0
    let transitionSum = 0.0

    if (IsSharp(parentVertexSharpness) && IsSmooth(childVertexSharpness)) {
      transitionCount = 1
      transitionSum = parentVertexSharpness
    }

    // For non-simple (Chaikin) methods we need the child-edge sharpness values
    // to ensure the sharpness went from a non-zero value to zero.
    if (this.isUniform() || childSharpness === null) {
      for (let i = 0; i < incidentEdgeCount; ++i) {
        const p = parentSharpness[i]!
        if (IsSharp(p) && p <= 1.0) {
          transitionSum += p
          transitionCount++
        }
      }
    } else {
      for (let i = 0; i < incidentEdgeCount; ++i) {
        if (IsSharp(parentSharpness[i]!) && IsSmooth(childSharpness[i]!)) {
          transitionSum += parentSharpness[i]!
          transitionCount++
        }
      }
    }
    if (transitionCount === 0) return 0.0
    const fractionalWeight = transitionSum / transitionCount
    return fractionalWeight > 1.0 ? 1.0 : fractionalWeight
  }

  getSharpEdgePairOfCrease(
    incidentEdgeSharpness: ArrayLike<number>,
    incidentEdgeCount: number,
    sharpEdgePair: [number, number],
  ): void {
    // Only to be called when a crease is present -- exactly two sharp edges.
    sharpEdgePair[0] = 0
    while (IsSmooth(incidentEdgeSharpness[sharpEdgePair[0]]!)) ++sharpEdgePair[0]

    sharpEdgePair[1] = incidentEdgeCount - 1
    while (IsSmooth(incidentEdgeSharpness[sharpEdgePair[1]]!)) --sharpEdgePair[1]
  }
}
