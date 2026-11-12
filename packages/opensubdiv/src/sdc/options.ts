// Ported from OpenSubdiv 3.7.0: opensubdiv/sdc/options.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/sdc/options.h — Sdc::Options.
//
// All supported options that can be applied to a subdivision scheme to affect
// the shape of the limit surface. Upstream packs four enums into a byte each;
// we keep them as plain numeric fields with the same defaults.

export enum VtxBoundaryInterpolation {
  NONE = 0, // no boundary interpolation, except explicitly sharpened edges
  EDGE_ONLY, // all boundary edges sharpened and interpolated
  EDGE_AND_CORNER, // all boundary edges and corner vertices sharpened
}

export enum FVarLinearInterpolation {
  NONE = 0, // smooth everywhere ("edge only")
  CORNERS_ONLY, // sharpen corners only
  CORNERS_PLUS1, // ("edge corner")
  CORNERS_PLUS2, // ("edge and corner + propagate corner")
  BOUNDARIES, // sharpen all boundaries ("always sharp")
  ALL, // bilinear interpolation ("bilinear")
}

export enum CreasingMethod {
  UNIFORM = 0, // Catmark rule
  CHAIKIN, // Chaikin rule
}

export enum TriangleSubdivision {
  CATMARK = 0, // Catmark weights (Catmark scheme only)
  SMOOTH, // "smooth triangle" weights (Catmark scheme only)
}

export class Options {
  private _vtxBoundInterp: VtxBoundaryInterpolation = VtxBoundaryInterpolation.NONE
  private _fvarLinInterp: FVarLinearInterpolation = FVarLinearInterpolation.ALL
  private _creasingMethod: CreasingMethod = CreasingMethod.UNIFORM
  private _triangleSub: TriangleSubdivision = TriangleSubdivision.CATMARK

  getVtxBoundaryInterpolation(): VtxBoundaryInterpolation {
    return this._vtxBoundInterp
  }
  setVtxBoundaryInterpolation(b: VtxBoundaryInterpolation): void {
    this._vtxBoundInterp = b
  }

  getFVarLinearInterpolation(): FVarLinearInterpolation {
    return this._fvarLinInterp
  }
  setFVarLinearInterpolation(b: FVarLinearInterpolation): void {
    this._fvarLinInterp = b
  }

  getCreasingMethod(): CreasingMethod {
    return this._creasingMethod
  }
  setCreasingMethod(c: CreasingMethod): void {
    this._creasingMethod = c
  }

  getTriangleSubdivision(): TriangleSubdivision {
    return this._triangleSub
  }
  setTriangleSubdivision(t: TriangleSubdivision): void {
    this._triangleSub = t
  }
}
