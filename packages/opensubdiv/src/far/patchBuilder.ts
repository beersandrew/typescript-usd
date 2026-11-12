// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchBuilder.h,
//  opensubdiv/far/patchBuilder.cpp
// Copyright 2017, 2018 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Partial port of OpenSubdiv 3.6.1 opensubdiv/far/patchBuilder.h:153-323 and
// patchBuilder.cpp:500-1387 -- Far::PatchBuilder. Local source addition (see
// PROVENANCE.md).
//
// Ported: the options, the scheme-specific construction (Create and the
// patch types chosen by catmarkPatchBuilder.ts, loopPatchBuilder.ts and
// bilinearPatchBuilder.ts) and ComputePatchParam -- everything the uniform
// PatchTableFactory path uses (patchTableFactory.cpp:379-476, 744-912).
//
// Not ported (adaptive refinement only): IsFaceAPatch, IsFaceALeaf,
// IsPatchRegular, GetRegularPatchBoundaryMask, GetIrregularPatchCornerSpans,
// DoesFaceVaryingPatchMatch, GetRegularPatchPoints,
// GetIrregularPatchConversionMatrix, GetIrregularPatchSourcePoints,
// IsRegularSingleCreasePatch, SourcePatch (patchBuilder.cpp:536-1271,
// 1389-1624) and the scheme builders' convertToPatchType. They need
// TopologyRefiner::RefineAdaptive, which this port's refiner lacks.

import { SchemeType, SchemeTypeTraits } from '../sdc/types.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'
import { PatchType } from './patchDescriptor.ts'
import { PatchParam } from './patchParam.ts'
import type { PtexIndices } from './ptexIndices.ts'
import type { Index } from './types.ts'

// patchBuilder.h:160-166
export enum BasisType {
  BASIS_UNSPECIFIED,
  BASIS_REGULAR,
  BASIS_GREGORY,
  BASIS_LINEAR,
  BASIS_BEZIER, // to be supported in future
}

// patchBuilder.h:174-186
export class PatchBuilderOptions {
  regBasisType = BasisType.BASIS_UNSPECIFIED
  irregBasisType = BasisType.BASIS_UNSPECIFIED
  fillMissingBoundaryPoints = false
  approxInfSharpWithSmooth = false
  approxSmoothCornerWithSharp = false
}

// patchBuilder.h:253-256
export interface SingleCreaseInfo {
  creaseEdgeInFace: number
  creaseSharpness: number
}

type PatchBuilderConstructor = new (refiner: TopologyRefiner, options: PatchBuilderOptions) => PatchBuilder

// The scheme-specific subclasses register themselves here so that Create
// (patchBuilder.cpp:500-512) can construct them without a module cycle.
const builders = new Map<SchemeType, PatchBuilderConstructor>()

export abstract class PatchBuilder {
  static readonly Options = PatchBuilderOptions

  readonly _refiner: TopologyRefiner
  readonly _options: PatchBuilderOptions

  _schemeType: SchemeType
  _schemeRegFaceSize: number
  _schemeIsLinear: boolean

  _regPatchType: PatchType = PatchType.NON_PATCH
  _irregPatchType: PatchType = PatchType.NON_PATCH
  _nativePatchType: PatchType = PatchType.NON_PATCH
  _linearPatchType: PatchType = PatchType.NON_PATCH

  /** Registers the builder for a scheme (see `builders` above). */
  static register(scheme: SchemeType, ctor: PatchBuilderConstructor): void {
    builders.set(scheme, ctor)
  }

  // patchBuilder.cpp:500-512
  static create(refiner: TopologyRefiner, options: PatchBuilderOptions): PatchBuilder {
    const ctor = builders.get(refiner.getSchemeType())
    if (!ctor) throw new Error('Unrecognized Sdc::SchemeType for PatchBuilder construction')
    return new ctor(refiner, options)
  }

  // patchBuilder.cpp:514-528
  constructor(refiner: TopologyRefiner, options: PatchBuilderOptions) {
    this._refiner = refiner
    this._options = options

    //  Initialize members with properties of the subdivision scheme and patch
    //  choices for quick retrieval:
    this._schemeType = refiner.getSchemeType()
    this._schemeRegFaceSize = SchemeTypeTraits.getRegularFaceSize(this._schemeType)
    this._schemeIsLinear = SchemeTypeTraits.getLocalNeighborhoodSize(this._schemeType) === 0

    //  Initialization of members involving patch types is deferred to the
    //  subclass for the scheme
  }

  // patchBuilder.h:200-209
  getRegularFaceSize(): number {
    return this._schemeRegFaceSize
  }
  getRegularBasisType(): BasisType {
    return this._options.regBasisType
  }
  getIrregularBasisType(): BasisType {
    return this._options.irregBasisType
  }
  getRegularPatchType(): PatchType {
    return this._regPatchType
  }
  getIrregularPatchType(): PatchType {
    return this._irregPatchType
  }
  getNativePatchType(): PatchType {
    return this._nativePatchType
  }
  getLinearPatchType(): PatchType {
    return this._linearPatchType
  }

  // patchBuilder.h:301
  protected abstract patchTypeFromBasis(basis: BasisType): PatchType

  // patchBuilder.cpp:1272-1387
  computePatchParam(
    levelIndex: number,
    faceIndex: Index,
    ptexIndices: PtexIndices,
    isRegular = true,
    boundaryMask = 0,
    computeTransitionMask = false,
  ): PatchParam {
    //  Move up the hierarchy accumulating u,v indices to the coarse level:
    const depth = levelIndex
    let childIndexInParent = 0
    let u = 0
    let v = 0
    let ofs = 1

    const regFaceSize = this._schemeRegFaceSize

    let irregBase = this._refiner.getLevel(depth).getFaceVertices(faceIndex).length !== regFaceSize

    //  For triangle refinement, the parameterization is rotated at the fourth
    //  triangle subface at each level. The u and v values computed for
    //  rotated triangles will be negative while walking through the levels.
    let rotatedTriangle = false

    let childFaceIndex = faceIndex
    for (let i = depth; i > 0; --i) {
      const refinement = this._refiner.getRefinement(i - 1)
      const parentLevel = this._refiner.getLevel(i - 1)

      const parentFaceIndex = refinement.getChildFaceParentFace(childFaceIndex)

      irregBase = parentLevel.getFaceVertices(parentFaceIndex).length !== regFaceSize

      if (this._schemeRegFaceSize === 3) {
        //  For now, irregular faces are not considered for triangle
        //  refinement.
        childIndexInParent = getChildFaceInParentFace(refinement, parentFaceIndex, childFaceIndex)

        if (rotatedTriangle) {
          switch (childIndexInParent) {
            case 0:
              break
            case 1:
              u -= ofs
              break
            case 2:
              v -= ofs
              break
            case 3:
              u += ofs
              v += ofs
              rotatedTriangle = false
              break
          }
        } else {
          switch (childIndexInParent) {
            case 0:
              break
            case 1:
              u += ofs
              break
            case 2:
              v += ofs
              break
            case 3:
              u -= ofs
              v -= ofs
              rotatedTriangle = true
              break
          }
        }
        ofs = (ofs << 1) & 0xffff
      } else if (!irregBase) {
        childIndexInParent = getChildFaceInParentFace(refinement, parentFaceIndex, childFaceIndex)

        switch (childIndexInParent) {
          case 0:
            break
          case 1:
            u += ofs
            break
          case 2:
            u += ofs
            v += ofs
            break
          case 3:
            v += ofs
            break
        }
        ofs = (ofs << 1) & 0xffff
      } else {
        //  If the root face is not a quad, offset the ptex index CCW to
        //  match the correct child face
        const children = refinement.getFaceChildFaces(parentFaceIndex)

        for (let j = 0; j < children.length; ++j) {
          if (children[j] === childFaceIndex) {
            childIndexInParent = j
            break
          }
        }
      }
      childFaceIndex = parentFaceIndex
    }
    if (rotatedTriangle) {
      //  A triangle still tagged as rotated has negative u and v; map them
      //  onto positive values in the opposite diagonal of parameter space.
      u += ofs
      v += ofs
    }
    const baseFaceIndex = childFaceIndex

    //  Need to store ptex index from base face and child of an irregular face:
    let ptexIndex = ptexIndices.getFaceId(baseFaceIndex)
    if (irregBase) {
      ptexIndex += childIndexInParent
    }

    //  Compute/identify the transition mask if requested, otherwise leave it 0:
    let transitionMask = 0
    if (computeTransitionMask && levelIndex < this._refiner.getMaxLevel()) {
      // patchBuilder.cpp:1375-1378 reads Refinement::getParentFaceSparseTag,
      // which exists only for adaptive (sparse) refinement.
      throw new Error('PatchBuilder.ComputePatchParam(): transition masks need adaptive refinement (not ported)')
    }

    const param = new PatchParam()
    param.Set(ptexIndex, (u << 16) >> 16, (v << 16) >> 16, depth, irregBase, boundaryMask, transitionMask, isRegular)
    return param
  }
}

// Vtr::internal::Refinement::getChildFaceInParentFace (vtr/refinement.h:156)
// returns _childFaceTag[f]._indexInParent, which this port's Refinement
// does not keep. For uniform refinement, populateFaceParentFromParentFaces
// (vtr/refinement.cpp:374-399) assigns it as the child's position among its
// parent's child faces (0 for every child of a face with more than 4); the
// callers above only ask for children of triangles and quads, where the
// position is what this recovers.
function getChildFaceInParentFace(
  refinement: { getFaceChildFaces(f: Index): ArrayLike<number> },
  parentFace: Index,
  childFace: Index,
): number {
  const children = refinement.getFaceChildFaces(parentFace)
  for (let j = 0; j < children.length; ++j) {
    if (children[j] === childFace) return j
  }
  throw new Error('PatchBuilder: child face not found in its parent')
}
