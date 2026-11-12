// Ported from OpenSubdiv 3.6.1: opensubdiv/far/catmarkPatchBuilder.h,
//  opensubdiv/far/catmarkPatchBuilder.cpp
// Copyright 2017, 2018 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Partial port of OpenSubdiv 3.6.1 opensubdiv/far/catmarkPatchBuilder.h and
// catmarkPatchBuilder.cpp:1926-1940 (patch types), 1981-2001 (constructor, patchTypeFromBasis) -- Far::CatmarkPatchBuilder.
// Local source addition (see PROVENANCE.md).
//
// Not ported (adaptive refinement only): convertToPatchType /
// convertSourcePatch, catmarkPatchBuilder.cpp:39-1924 (Gregory and B-spline conversion matrices).

import { SchemeType } from '../sdc/types.ts'
import { PatchType } from './patchDescriptor.ts'
import { PatchBuilder, BasisType, type PatchBuilderOptions } from './patchBuilder.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'

//  The patch type associated with each basis, indexed by BasisType.
const patchTypeFromBasisArray: readonly PatchType[] = [
  PatchType.NON_PATCH, // undefined
  PatchType.REGULAR, // regular
  PatchType.GREGORY_BASIS, // Gregory
  PatchType.QUADS, // linear
  PatchType.NON_PATCH, // Bezier -- for future use
]

export class CatmarkPatchBuilder extends PatchBuilder {
  // catmarkPatchBuilder.cpp:1981-1992
  constructor(refiner: TopologyRefiner, options: PatchBuilderOptions) {
    super(refiner, options)

    this._regPatchType = patchTypeFromBasisArray[this._options.regBasisType]!
    this._irregPatchType =
      this._options.irregBasisType === BasisType.BASIS_UNSPECIFIED
        ? this._regPatchType
        : patchTypeFromBasisArray[this._options.irregBasisType]!

    this._nativePatchType = patchTypeFromBasisArray[BasisType.BASIS_REGULAR]!
    this._linearPatchType = patchTypeFromBasisArray[BasisType.BASIS_LINEAR]!
  }

  // catmarkPatchBuilder.cpp:1997-2001
  protected patchTypeFromBasis(basis: BasisType): PatchType {
    return patchTypeFromBasisArray[basis]!
  }
}

PatchBuilder.register(SchemeType.CATMARK, CatmarkPatchBuilder)
