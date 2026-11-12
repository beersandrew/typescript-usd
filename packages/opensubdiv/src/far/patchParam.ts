// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchParam.h
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/patchParam.h:152-323 --
// Far::PatchParam. Local source addition (see PROVENANCE.md).
//
// field0 and field1 are the two 32-bit words HdSt uploads per patch
// (hdSt/subdivision.cpp:1340-1356, 1514-1516); they hold the same bits as
// the C++ bitfields.
//
// DIVERGENCE: the C++ Normalize/Unnormalize templates update u and v by
// reference; these return the new [u, v]. The Real tag selects the REAL
// instantiation (far/types.ts).

import type { Index } from './types.ts'
import { type Real, realRound } from './types.ts'

// patchParam.h:234-240
function pack(value: number, width: number, offset: number): number {
  return ((value & ((1 << width) - 1)) << offset) >>> 0
}
function unpack(value: number, width: number, offset: number): number {
  return (value >>> offset) & ((1 << width) - 1)
}

export class PatchParam {
  field0 = 0
  field1 = 0

  /** A PatchParam from its two packed words. */
  static fromFields(field0: number, field1: number): PatchParam {
    const p = new PatchParam()
    p.field0 = field0 >>> 0
    p.field1 = field1 >>> 0
    return p
  }

  clone(): PatchParam {
    return PatchParam.fromFields(this.field0, this.field1)
  }

  // patchParam.h:248-262
  Set(
    faceid: Index,
    u: number,
    v: number,
    depth: number,
    nonquad: boolean,
    boundary: number,
    transition: number,
    regular = false,
  ): void {
    this.field0 = (pack(faceid, 28, 0) | pack(transition, 4, 28)) >>> 0

    this.field1 =
      (pack(u, 10, 22) |
        pack(v, 10, 12) |
        pack(boundary, 5, 7) |
        pack(regular ? 1 : 0, 1, 5) |
        pack(nonquad ? 1 : 0, 1, 4) |
        pack(depth, 4, 0)) >>>
      0
  }

  // patchParam.h:174
  clear(): void {
    this.field0 = 0
    this.field1 = 0
  }

  // patchParam.h:177-197
  getFaceId(): Index {
    return unpack(this.field0, 28, 0)
  }
  getU(): number {
    return unpack(this.field1, 10, 22)
  }
  getV(): number {
    return unpack(this.field1, 10, 12)
  }
  getTransition(): number {
    return unpack(this.field0, 4, 28)
  }
  getBoundary(): number {
    return unpack(this.field1, 5, 7)
  }
  nonQuadRoot(): boolean {
    return unpack(this.field1, 1, 4) !== 0
  }
  getDepth(): number {
    return unpack(this.field1, 4, 0)
  }

  // patchParam.h:264-267
  getParamFraction(): number {
    return Math.fround(1.0 / (1 << (this.getDepth() - (this.nonQuadRoot() ? 1 : 0))))
  }

  // patchParam.h:269-277
  Normalize(u: number, v: number, real: Real = 'double'): [number, number] {
    const R = realRound(real)
    const fracInv = R(1.0 / this.getParamFraction())
    return [R(R(u * fracInv) - this.getU()), R(R(v * fracInv) - this.getV())]
  }

  // patchParam.h:279-287
  unnormalize(u: number, v: number, real: Real = 'double'): [number, number] {
    const R = realRound(real)
    const frac = R(this.getParamFraction())
    return [R(R(u + this.getU()) * frac), R(R(v + this.getV()) * frac)]
  }

  // patchParam.h:289-293
  isTriangleRotated(): boolean {
    return this.getU() + this.getV() >= 1 << this.getDepth()
  }

  // patchParam.h:295-308
  normalizeTriangle(u: number, v: number, real: Real = 'double'): [number, number] {
    if (this.isTriangleRotated()) {
      const R = realRound(real)
      const fracInv = R(1.0 / this.getParamFraction())

      const depthFactor = 1 << this.getDepth()
      return [R(depthFactor - this.getU() - R(u * fracInv)), R(depthFactor - this.getV() - R(v * fracInv))]
    }
    return this.Normalize(u, v, real)
  }

  // patchParam.h:310-323
  unnormalizeTriangle(u: number, v: number, real: Real = 'double'): [number, number] {
    if (this.isTriangleRotated()) {
      const R = realRound(real)
      const frac = this.getParamFraction()

      const depthFactor = 1 << this.getDepth()
      return [R(R(depthFactor - this.getU() - u) * frac), R(R(depthFactor - this.getV() - v) * frac)]
    }
    return this.unnormalize(u, v, real)
  }

  // patchParam.h:228
  isRegular(): boolean {
    return unpack(this.field1, 1, 5) !== 0
  }
}
