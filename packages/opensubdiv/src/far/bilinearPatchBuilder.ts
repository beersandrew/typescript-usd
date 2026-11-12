// Ported from OpenSubdiv 3.6.1: opensubdiv/far/bilinearPatchBuilder.h,
//  opensubdiv/far/bilinearPatchBuilder.cpp
// Copyright 2017, 2018 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Partial port of OpenSubdiv 3.6.1 opensubdiv/far/bilinearPatchBuilder.h and
// bilinearPatchBuilder.cpp:39-52 (patch types), 54-74 (constructor, patchTypeFromBasis) -- Far::BilinearPatchBuilder.
// Local source addition (see PROVENANCE.md).
//
// Not ported (adaptive refinement only): convertToPatchType /
// convertSourcePatch, bilinearPatchBuilder.cpp:76-107 (conversion matrices).

import { SchemeType } from '../sdc/types.ts'
import { PatchType } from './patchDescriptor.ts'
import { PatchBuilder, BasisType, type PatchBuilderOptions } from './patchBuilder.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'

//  The patch type associated with each basis, indexed by BasisType.
const patchTypeFromBasisArray: readonly PatchType[] = [
  PatchType.NON_PATCH, // undefined
  PatchType.QUADS, // regular
  PatchType.GREGORY_BASIS, // Gregory
  PatchType.QUADS, // linear
  PatchType.NON_PATCH, // Bezier -- for future use
]

export class BilinearPatchBuilder extends PatchBuilder {
  // bilinearPatchBuilder.cpp:54-65
  constructor(refiner: TopologyRefiner, options: PatchBuilderOptions) {
    super(refiner, options)

    this._regPatchType = patchTypeFromBasisArray[this._options.regBasisType]!
    this._irregPatchType =
      this._options.irregBasisType === BasisType.BASIS_UNSPECIFIED
        ? this._regPatchType
        : patchTypeFromBasisArray[this._options.irregBasisType]!

    this._nativePatchType = PatchType.QUADS
    this._linearPatchType = PatchType.QUADS
  }

  // bilinearPatchBuilder.cpp:70-74
  protected patchTypeFromBasis(basis: BasisType): PatchType {
    return patchTypeFromBasisArray[basis]!
  }
}

PatchBuilder.register(SchemeType.BILINEAR, BilinearPatchBuilder)
