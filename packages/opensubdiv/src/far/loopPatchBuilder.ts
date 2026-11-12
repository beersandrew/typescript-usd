// Ported from OpenSubdiv 3.6.1: opensubdiv/far/loopPatchBuilder.h,
//  opensubdiv/far/loopPatchBuilder.cpp
// Copyright 2017, 2018 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Partial port of OpenSubdiv 3.6.1 opensubdiv/far/loopPatchBuilder.h and
// loopPatchBuilder.cpp:1816-1829 (patch types), 1831-1851 (constructor, patchTypeFromBasis) -- Far::LoopPatchBuilder.
// Local source addition (see PROVENANCE.md).
//
// Not ported (adaptive refinement only): convertToPatchType /
// convertSourcePatch, loopPatchBuilder.cpp:39-1814 (Gregory triangle and Loop conversion matrices).

import { SchemeType } from '../sdc/types.ts'
import { PatchType } from './patchDescriptor.ts'
import { PatchBuilder, BasisType, type PatchBuilderOptions } from './patchBuilder.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'

//  The patch type associated with each basis, indexed by BasisType.
const patchTypeFromBasisArray: readonly PatchType[] = [
  PatchType.NON_PATCH, // undefined
  PatchType.LOOP, // regular
  PatchType.GREGORY_TRIANGLE, // Gregory
  PatchType.TRIANGLES, // linear
  PatchType.NON_PATCH, // Bezier -- for future use
]

export class LoopPatchBuilder extends PatchBuilder {
  // loopPatchBuilder.cpp:1831-1842
  constructor(refiner: TopologyRefiner, options: PatchBuilderOptions) {
    super(refiner, options)

    this._regPatchType = patchTypeFromBasisArray[this._options.regBasisType]!
    this._irregPatchType =
      this._options.irregBasisType === BasisType.BASIS_UNSPECIFIED
        ? this._regPatchType
        : patchTypeFromBasisArray[this._options.irregBasisType]!

    this._nativePatchType = PatchType.LOOP
    this._linearPatchType = PatchType.TRIANGLES
  }

  // loopPatchBuilder.cpp:1847-1851
  protected patchTypeFromBasis(basis: BasisType): PatchType {
    return patchTypeFromBasisArray[basis]!
  }
}

PatchBuilder.register(SchemeType.LOOP, LoopPatchBuilder)
