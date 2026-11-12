// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchTableFactory.h,
//  opensubdiv/far/patchTableFactory.cpp
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Partial port of OpenSubdiv 3.6.1 opensubdiv/far/patchTableFactory.h:40-225
// and patchTableFactory.cpp:98-2045 -- Far::PatchTableFactory and its
// internal PatchTableBuilder. Local source addition (see PROVENANCE.md).
//
// Ported: Options, Create, the PatchTableBuilder constructor and the uniform
// path (allocateVertexTables, allocateFVarChannels, BuildUniformPolygons),
// and the deprecated PatchFaceTag.
//
// Not ported: BuildPatches and everything it uses -- identifyPatches,
// populatePatches, LocalPointHelper, LegacyGregoryHelper
// (patchTableFactory.cpp:485-675, 914-1966). They build feature-adaptive
// patches, which need TopologyRefiner::RefineAdaptive; this port's refiner
// refines uniformly only, so Create always takes the uniform path
// (patchTableFactory.cpp:453), as HdSt does with adaptive refinement off
// (hd/meshTopology.cpp:21, hdSt/subdivision.cpp:1036-1098).

import { FVarLinearInterpolation } from '../sdc/options.ts'
import { AdaptiveOptions, type TopologyRefiner } from './topologyRefiner.ts'
import { PatchDescriptor, PatchType } from './patchDescriptor.ts'
import { PatchTable } from './patchTable.ts'
import { PatchParam } from './patchParam.ts'
import { PatchBuilder, PatchBuilderOptions, BasisType } from './patchBuilder.ts'
import { PtexIndices } from './ptexIndices.ts'
import { INDEX_INVALID } from './types.ts'
import { type Real } from './types.ts'
// The scheme builders register themselves with PatchBuilder.Create.
import './catmarkPatchBuilder.ts'
import './loopPatchBuilder.ts'
import './bilinearPatchBuilder.ts'

// patchTableFactory.h:55-61
export enum EndCapType {
  ENDCAP_NONE = 0, // unspecified
  ENDCAP_BILINEAR_BASIS, // use linear patches (simple quads or tris)
  ENDCAP_BSPLINE_BASIS, // use BSpline-like patches (same patch type as regular)
  ENDCAP_GREGORY_BASIS, // use Gregory patches (highest quality, recommended default)
  ENDCAP_LEGACY_GREGORY, // legacy option for 2.x style Gregory patches (Catmark only)
}

// patchTableFactory.h:45-141 -- Far::PatchTableFactory::Options.
export class PatchTableFactoryOptions {
  static readonly ENDCAP_NONE = EndCapType.ENDCAP_NONE
  static readonly ENDCAP_BILINEAR_BASIS = EndCapType.ENDCAP_BILINEAR_BASIS
  static readonly ENDCAP_BSPLINE_BASIS = EndCapType.ENDCAP_BSPLINE_BASIS
  static readonly ENDCAP_GREGORY_BASIS = EndCapType.ENDCAP_GREGORY_BASIS
  static readonly ENDCAP_LEGACY_GREGORY = EndCapType.ENDCAP_LEGACY_GREGORY

  generateAllLevels = false // Generate levels from 'firstLevel' to 'maxLevel' (Uniform mode only)
  includeBaseLevelIndices = true // Include base level in patch point indices (Uniform mode only)
  includeFVarBaseLevelIndices = false // Include base level in face-varying patch point indices (Uniform mode only)
  triangulateQuads = false // Triangulate 'QUADS' primitives (Uniform mode only)

  useSingleCreasePatch = false // Use single crease patch
  useInfSharpPatch = false // Use infinitely-sharp patch
  maxIsolationLevel: number // Cap adaptive feature isolation to the given level (max. 10)

  // end-capping
  endCapType = EndCapType.ENDCAP_GREGORY_BASIS
  shareEndCapPatchPoints = true // Share endcap patch points among adjacent endcap patches.

  // varying
  generateVaryingTables = true // Generate varying patch tables
  generateVaryingLocalPoints = true // Generate local points with varying patches

  // face-varying
  generateFVarTables = false // Generate face-varying patch tables

  // precision
  patchPrecisionDouble = false // Generate double-precision stencils for vertex patches
  fvarPatchPrecisionDouble = false // Generate double-precision stencils for face-varying patches

  // legacy behaviors (default to true)
  generateFVarLegacyLinearPatches = true // Generate all linear face-varying patches (legacy)
  generateLegacySharpCornerPatches = true // Generate sharp regular patches at smooth corners (legacy)

  numFVarChannels = -1 // Number of channel indices and interpolation modes passed
  fvarChannelIndices: readonly number[] | null = null // List containing the indices of the channels selected for the factory

  // patchTableFactory.h:63-82
  constructor(maxIsolation = 10) {
    this.maxIsolationLevel = maxIsolation & 0xf
  }

  // patchTableFactory.h:85-91
  getEndCapType(): EndCapType {
    return this.endCapType
  }
  setEndCapType(e: EndCapType): void {
    this.endCapType = e & 0x7
  }
  setMaxIsolationLevel(level: number): void {
    this.maxIsolationLevel = level & 0xf
  }

  // patchTableFactory.h:94-97, 212-224
  setPatchPrecision(real: Real): void {
    this.patchPrecisionDouble = real === 'double'
  }
  setFVarPatchPrecision(real: Real): void {
    this.fvarPatchPrecisionDouble = real === 'double'
  }

  // patchTableFactory.h:100-108
  getRefineAdaptiveOptions(): AdaptiveOptions {
    const adaptiveOptions = new AdaptiveOptions(this.maxIsolationLevel)

    adaptiveOptions.useInfSharpPatch = this.useInfSharpPatch
    adaptiveOptions.useSingleCreasePatch = this.useSingleCreasePatch
    adaptiveOptions.considerFVarChannels = this.generateFVarTables && !this.generateFVarLegacyLinearPatches
    return adaptiveOptions
  }
}

// patchTableFactory.h:192-207 and patchTableFactory.cpp:1994-2045 --
// PatchFaceTag, kept upstream only for interface preservation.
export class PatchFaceTag {
  _hasPatch = 0
  _isRegular = 0
  _transitionMask = 0
  _boundaryMask = 0
  _boundaryIndex = 0
  _boundaryCount = 0
  _hasBoundaryEdge = 0
  _isSingleCrease = 0

  clear(): void {
    this._hasPatch = this._isRegular = this._transitionMask = this._boundaryMask = 0
    this._boundaryIndex = this._boundaryCount = this._hasBoundaryEdge = this._isSingleCrease = 0
  }
  assignTransitionPropertiesFromEdgeMask(tMask: number): void {
    this._transitionMask = tMask
  }
  assignBoundaryPropertiesFromEdgeMask(eMask: number): void {
    const edgeMaskToCount = [0, 1, 1, 2, 1, -1, 2, -1, 1, 2, -1, -1, 2, -1, -1, -1]
    const edgeMaskToIndex = [-1, 0, 1, 1, 2, -1, 2, -1, 3, 0, -1, -1, 3, -1, -1, -1]

    this._boundaryMask = eMask
    this._hasBoundaryEdge = eMask > 0 ? 1 : 0

    this._boundaryCount = edgeMaskToCount[eMask]!
    this._boundaryIndex = edgeMaskToIndex[eMask]!
  }
  assignBoundaryPropertiesFromVertexMask(vMask: number): void {
    const singleBitVertexMaskToCount = [0, 1, 1, -1, 1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1]
    const singleBitVertexMaskToIndex = [0, 0, 1, -1, 2, -1, -1, -1, 3, -1, -1, -1, -1, -1, -1, -1]

    this._boundaryMask = vMask

    this._boundaryCount = singleBitVertexMaskToCount[vMask]!
    this._boundaryIndex = singleBitVertexMaskToIndex[vMask]!
  }
}

// patchTableFactory.cpp:98-376 -- the PatchTableBuilder (uniform subset).
class PatchTableBuilder {
  readonly _refiner: TopologyRefiner
  readonly _options: PatchTableFactoryOptions
  readonly _selectedFaces: readonly number[]

  _requiresLocalPoints = false
  _requiresRegularLocalPoints = false
  _requiresIrregularLocalPoints = false
  _requiresSharpnessArray = false
  _requiresFVarPatches = false
  _requiresVaryingPatches = false
  _requiresVaryingLocalPoints = false

  _buildUniformLinear = false

  _table: PatchTable
  _patchBuilder: PatchBuilder
  _ptexIndices: PtexIndices

  _fvarChannelIndices: number[] = []

  _requiresLegacyGregoryTables = false

  // patchTableFactory.cpp:379-476
  constructor(refiner: TopologyRefiner, opts: PatchTableFactoryOptions, faces: readonly number[]) {
    this._refiner = refiner
    this._options = opts
    this._selectedFaces = faces
    this._ptexIndices = new PtexIndices(refiner)

    if (this._options.generateFVarTables) {
      //  If client-code does not select specific channels, default to all the
      //  channels in the refiner.
      if (this._options.numFVarChannels === -1) {
        for (let fvc = 0; fvc < this._refiner.getNumFVarChannels(); ++fvc) {
          this._fvarChannelIndices[fvc] = fvc // std::iota
        }
      } else {
        this._fvarChannelIndices = (this._options.fvarChannelIndices ?? []).slice(0, this._options.numFVarChannels)
      }
    }

    //  Translate PatchTableFactory options to the PatchBuilder options:
    const patchOptions = new PatchBuilderOptions()

    patchOptions.regBasisType = BasisType.BASIS_REGULAR
    switch (this._options.getEndCapType()) {
      case EndCapType.ENDCAP_BILINEAR_BASIS:
        patchOptions.irregBasisType = BasisType.BASIS_LINEAR
        break
      case EndCapType.ENDCAP_BSPLINE_BASIS:
        patchOptions.irregBasisType = BasisType.BASIS_REGULAR
        break
      case EndCapType.ENDCAP_GREGORY_BASIS:
        patchOptions.irregBasisType = BasisType.BASIS_GREGORY
        break
      default:
        //  The PatchBuilder will infer if left un-specified
        patchOptions.irregBasisType = BasisType.BASIS_UNSPECIFIED
        break
    }
    patchOptions.fillMissingBoundaryPoints = true
    patchOptions.approxInfSharpWithSmooth = !this._options.useInfSharpPatch
    patchOptions.approxSmoothCornerWithSharp = this._options.generateLegacySharpCornerPatches

    this._patchBuilder = PatchBuilder.create(this._refiner, patchOptions)

    //  Initialize member variables that capture specified options:
    this._requiresRegularLocalPoints = patchOptions.regBasisType !== BasisType.BASIS_REGULAR
    this._requiresIrregularLocalPoints = this._options.getEndCapType() !== EndCapType.ENDCAP_LEGACY_GREGORY
    this._requiresLocalPoints = this._requiresIrregularLocalPoints || this._requiresRegularLocalPoints

    this._requiresSharpnessArray = this._options.useSingleCreasePatch
    this._requiresFVarPatches = this._fvarChannelIndices.length > 0

    this._requiresVaryingPatches = this._options.generateVaryingTables
    this._requiresVaryingLocalPoints = this._options.generateVaryingTables && this._options.generateVaryingLocalPoints

    //  Option to be made public in future:
    const options_generateNonLinearUniformPatches = false

    this._buildUniformLinear = this._refiner.isUniform() && !options_generateNonLinearUniformPatches

    //  Create and initialize the new PatchTable instance to be assembled:
    this._table = new PatchTable(this._refiner.getMaxValence())

    this._table._numPtexFaces = this._ptexIndices.getNumFaces()

    this._table._vertexPrecisionIsDouble = this._options.patchPrecisionDouble
    this._table._varyingPrecisionIsDouble = this._options.patchPrecisionDouble
    this._table._faceVaryingPrecisionIsDouble = this._options.fvarPatchPrecisionDouble

    this._table._varyingDesc = new PatchDescriptor(this._patchBuilder.getLinearPatchType())

    //  State and helper to support LegacyGregory arrays in the PatchTable:
    this._requiresLegacyGregoryTables =
      !this._refiner.isUniform() && this._options.getEndCapType() === EndCapType.ENDCAP_LEGACY_GREGORY
  }

  // patchTableFactory.cpp:110
  uniformPolygonsSpecified(): boolean {
    return this._buildUniformLinear
  }

  // patchTableFactory.cpp:115
  getPatchTable(): PatchTable {
    return this._table
  }

  // patchTableFactory.cpp:299-303
  isFVarChannelLinear(fvcInTable: number): boolean {
    if (this._options.generateFVarLegacyLinearPatches) return true
    return (
      this._refiner.getFVarLinearInterpolation(this._fvarChannelIndices[fvcInTable]!) === FVarLinearInterpolation.ALL
    )
  }

  // patchTableFactory.cpp:680-704
  allocateVertexTables(): void {
    let ncvs = 0
    let npatches = 0
    for (let i = 0; i < this._table.getNumPatchArrays(); ++i) {
      npatches += this._table.getNumPatches(i)
      ncvs += this._table.getNumControlVertices(i)
    }

    if (ncvs === 0 || npatches === 0) return

    this._table._patchVerts = new Array<number>(ncvs).fill(0)

    this._table._paramTable = []
    for (let i = 0; i < npatches; ++i) this._table._paramTable.push(new PatchParam())

    if (this._requiresVaryingPatches && !this._buildUniformLinear) {
      this._table.allocateVaryingVertices(new PatchDescriptor(this._patchBuilder.getLinearPatchType()), npatches)
    }

    if (this._requiresSharpnessArray) {
      this._table._sharpnessIndices = new Array<number>(npatches).fill(INDEX_INVALID)
    }
  }

  // patchTableFactory.cpp:709-742
  allocateFVarChannels(): void {
    const npatches = this._table.getNumPatchesTotal()

    this._table.allocateFVarPatchChannels(this._fvarChannelIndices.length)

    //  Initialize each channel
    for (let fvc = 0; fvc < this._fvarChannelIndices.length; ++fvc) {
      const refinerChannel = this._fvarChannelIndices[fvc]!

      const interpolation = this._refiner.getFVarLinearInterpolation(refinerChannel)

      this._table.setFVarPatchChannelLinearInterpolation(interpolation, fvc)

      let regPatchType = this._patchBuilder.getLinearPatchType()
      let irregPatchType = regPatchType
      if (this._buildUniformLinear) {
        if (this._options.triangulateQuads) {
          regPatchType = PatchType.TRIANGLES
          irregPatchType = regPatchType
        }
      } else {
        if (!this.isFVarChannelLinear(fvc)) {
          regPatchType = this._patchBuilder.getRegularPatchType()
          irregPatchType = this._patchBuilder.getIrregularPatchType()
        }
      }
      this._table.allocateFVarPatchChannelValues(
        new PatchDescriptor(regPatchType),
        new PatchDescriptor(irregPatchType),
        npatches,
        fvc,
      )
    }
  }

  // patchTableFactory.cpp:744-912
  buildUniformPolygons(): void {
    //  Default behavior is to include base level vertices in the patch
    //  vertices for vertex and varying patches, but not face-varying:
    const includeBaseLevelIndices = this._options.includeBaseLevelIndices
    const includeBaseLevelFVarIndices = this._options.includeFVarBaseLevelIndices

    //  ensure that triangulateQuads is only set for quadrilateral schemes
    const triangulateQuads = this._options.triangulateQuads && this._patchBuilder.getRegularFaceSize() === 4

    //  level=0 may contain n-gons, which are not supported in PatchTable.
    //  even if generateAllLevels = true, we start from level 1.
    const maxlevel = this._refiner.getMaxLevel()
    const firstlevel = this._options.generateAllLevels ? 1 : maxlevel

    const ptype = triangulateQuads ? PatchType.TRIANGLES : this._patchBuilder.getLinearPatchType()

    //  Allocate and initialize the table's members.
    this._table._isUniformLinear = true

    const desc = new PatchDescriptor(ptype)

    //  generate patch arrays
    const offsets = { vidx: 0, pidx: 0 }
    for (let level = firstlevel; level <= maxlevel; ++level) {
      const refLevel = this._refiner.getLevel(level)

      let npatches = refLevel.getNumFaces()
      if (this._refiner.hasHoles()) {
        for (let i = npatches - 1; i >= 0; --i) {
          npatches -= refLevel.isFaceHole(i) ? 1 : 0
        }
      }

      if (triangulateQuads) npatches *= 2

      this._table.pushPatchArray(desc, npatches, offsets)
    }

    //  Allocate various tables
    this.allocateVertexTables()

    if (this._requiresFVarPatches) {
      this.allocateFVarChannels()
    }

    //  Now populate the patches:
    const patchVerts = this._table._patchVerts
    const paramTable = this._table._paramTable
    let iptr = 0
    let pptr = 0

    let levelVertOffset = includeBaseLevelIndices ? this._refiner.getLevel(0).getNumVertices() : 0

    const nfvc = this._fvarChannelIndices.length
    const levelFVarVertOffsets = new Array<number>(nfvc).fill(0)
    const fptr = new Array<number>(nfvc).fill(0)
    const fpptr = new Array<number>(nfvc).fill(0)
    if (this._requiresFVarPatches) {
      for (let fvc = 0; fvc < nfvc; ++fvc) {
        if (includeBaseLevelFVarIndices) {
          const refinerChannel = this._fvarChannelIndices[fvc]!
          levelFVarVertOffsets[fvc] = this._refiner.getLevel(0).getNumFVarValues(refinerChannel)
        }
      }
    }

    for (let level = 1; level <= maxlevel; ++level) {
      const refLevel = this._refiner.getLevel(level)

      const nfaces = refLevel.getNumFaces()
      if (level >= firstlevel) {
        for (let face = 0; face < nfaces; ++face) {
          if (this._refiner.hasHoles() && refLevel.isFaceHole(face)) {
            continue
          }

          const fverts = refLevel.getFaceVertices(face)
          for (let vert = 0; vert < fverts.length; ++vert) {
            patchVerts[iptr++] = levelVertOffset + fverts[vert]!
          }

          const pparam = this._patchBuilder.computePatchParam(level, face, this._ptexIndices)
          paramTable[pptr++] = pparam

          if (this._requiresFVarPatches) {
            for (let fvc = 0; fvc < nfvc; ++fvc) {
              const refinerChannel = this._fvarChannelIndices[fvc]!
              const channel = this._table.getFVarPatchChannel(fvc)

              const fvalues = refLevel.getFaceFVarValues(face, refinerChannel)
              for (let vert = 0; vert < fvalues.length; ++vert) {
                channel.patchValues[fptr[fvc]! + vert] = levelFVarVertOffsets[fvc]! + fvalues[vert]!
              }
              fptr[fvc]! += fvalues.length
              channel.patchParam[fpptr[fvc]!++] = pparam
            }
          }

          if (triangulateQuads) {
            //  Triangulate the quadrilateral:
            //      {v0,v1,v2,v3} -> {v0,v1,v2},{v3,v0,v2}.
            patchVerts[iptr] = patchVerts[iptr - 4]! // copy v0 index
            ++iptr
            patchVerts[iptr] = patchVerts[iptr - 3]! // copy v2 index
            ++iptr

            paramTable[pptr++] = pparam

            if (this._requiresFVarPatches) {
              for (let fvc = 0; fvc < nfvc; ++fvc) {
                const channel = this._table.getFVarPatchChannel(fvc)
                channel.patchValues[fptr[fvc]!] = channel.patchValues[fptr[fvc]! - 4]! // copy fv0 index
                ++fptr[fvc]!
                channel.patchValues[fptr[fvc]!] = channel.patchValues[fptr[fvc]! - 3]! // copy fv2 index
                ++fptr[fvc]!

                channel.patchParam[fpptr[fvc]!++] = pparam
              }
            }
          }
        }
      }

      if (this._options.generateAllLevels) {
        levelVertOffset += this._refiner.getLevel(level).getNumVertices()

        if (this._requiresFVarPatches) {
          for (let fvc = 0; fvc < nfvc; ++fvc) {
            const refinerChannel = this._fvarChannelIndices[fvc]!
            levelFVarVertOffsets[fvc]! += this._refiner.getLevel(level).getNumFVarValues(refinerChannel)
          }
        }
      }
    }
  }

  // patchTableFactory.cpp:914-919
  buildPatches(): void {
    throw new Error(
      'PatchTableFactory: feature-adaptive patches need TopologyRefiner::RefineAdaptive, which is not ported',
    )
  }
}

// patchTableFactory.h:40-209 -- Far::PatchTableFactory.
export const PatchTableFactory = {
  Options: PatchTableFactoryOptions,
  PatchFaceTag,

  // patchTableFactory.cpp:1973-1986
  create(
    refiner: TopologyRefiner,
    options: PatchTableFactoryOptions = new PatchTableFactoryOptions(),
    selectedFaces: readonly number[] = [],
  ): PatchTable {
    const builder = new PatchTableBuilder(refiner, options, selectedFaces)

    if (builder.uniformPolygonsSpecified()) {
      builder.buildUniformPolygons()
    } else {
      builder.buildPatches()
    }
    return builder.getPatchTable()
  },
}
