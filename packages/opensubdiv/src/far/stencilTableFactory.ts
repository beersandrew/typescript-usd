// Ported from OpenSubdiv 3.6.1: opensubdiv/far/stencilTableFactory.h,
//  opensubdiv/far/stencilTableFactory.cpp
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/stencilTableFactory.h:50-375 and
// stencilTableFactory.cpp:59-662 -- Far::StencilTableFactoryReal<REAL> and
// LimitStencilTableFactoryReal<REAL>. Local source addition (see
// PROVENANCE.md).
//
// The float/double template instantiations are instances tagged with their
// Real; StencilTableFactory and LimitStencilTableFactory are the float ones,
// as in the C++ wrappers (stencilTableFactory.h:287-375).

import type { TopologyRefiner } from './topologyRefiner.ts'
import { PrimvarRefinerReal } from './primvarRefinerReal.ts'
import { StencilBuilder } from './stencilBuilder.ts'
import { StencilTableReal, LimitStencilTableReal, type StencilReal } from './stencilTable.ts'
import { PatchTableFactory, PatchTableFactoryOptions, EndCapType } from './patchTableFactory.ts'
import type { PatchTable } from './patchTable.ts'
import { PatchMap } from './patchMap.ts'
import { type Real } from './types.ts'

// stencilTableFactory.cpp:51-52
function isWeightZero(w: number): boolean {
  return w === 0.0
}

// stencilTableFactory.h:55-59 and 213-217
export enum StencilInterpolationMode {
  INTERPOLATE_VERTEX = 0, // vertex primvar stencils
  INTERPOLATE_VARYING, // varying primvar stencils
  INTERPOLATE_FACE_VARYING, // face-varying primvar stencils
}

// stencilTableFactory.h:61-81
export class StencilTableFactoryOptions {
  interpolationMode = StencilInterpolationMode.INTERPOLATE_VERTEX // interpolation mode
  generateOffsets = false // populate optional "_offsets" field
  generateControlVerts = false // generate stencils for control-vertices
  generateIntermediateLevels = true // vertices at all levels or highest only
  factorizeIntermediateLevels = true // accumulate stencil weights from control vertices or from the stencils of the previous level
  maxLevel = 10 // generate stencils up to 'maxLevel'
  fvarChannel = 0 // face-varying channel to use
}

// stencilTableFactory.h:219-242
export class LimitStencilTableFactoryOptions {
  interpolationMode = StencilInterpolationMode.INTERPOLATE_VERTEX // interpolation mode
  generate1stDerivatives = true // Generate weights for 1st derivatives
  generate2ndDerivatives = false // Generate weights for 2nd derivatives
  fvarChannel = 0 // face-varying channel to use
}

// stencilTableFactory.h:233-242 -- the C++ s/t pointers are arrays here.
export interface LocationArray {
  ptexIdx: number // ptex face index
  numLocations: number // number of (u,v) coordinates in the array
  s: ArrayLike<number> // array of u coordinates
  t: ArrayLike<number> // array of v coordinates
}

// stencilTableFactory.h:50-195 -- Far::StencilTableFactoryReal<REAL>.
export class StencilTableFactoryReal {
  static readonly INTERPOLATE_VERTEX = StencilInterpolationMode.INTERPOLATE_VERTEX
  static readonly INTERPOLATE_VARYING = StencilInterpolationMode.INTERPOLATE_VARYING
  static readonly INTERPOLATE_FACE_VARYING = StencilInterpolationMode.INTERPOLATE_FACE_VARYING
  static readonly Options = StencilTableFactoryOptions

  constructor(readonly _real: Real) {}

  // stencilTableFactory.cpp:59-72
  generateControlVertStencils(numControlVerts: number, dst: StencilReal): void {
    //  Control vertices contribute a single index with a weight of 1.0
    for (let i = 0; i < numControlVerts; ++i) {
      dst._sizes[dst._sizeIndex] = 1
      dst._indices[dst._offset] = i
      dst._weights[dst._offset] = 1.0
      dst.Next()
    }
  }

  // stencilTableFactory.cpp:74-151 -- Create(refiner, options)
  create(refiner: TopologyRefiner, options?: StencilTableFactoryOptions): StencilTableReal
  // stencilTableFactory.cpp:153-219 -- Create(numTables, tables); null where
  // the C++ returns NULL.
  create(numTables: number, tables: readonly (StencilTableReal | null)[]): StencilTableReal | null
  create(
    a: TopologyRefiner | number,
    b?: StencilTableFactoryOptions | readonly (StencilTableReal | null)[],
  ): StencilTableReal | null {
    if (typeof a === 'number') {
      return this.createFromTables(a, (b as readonly (StencilTableReal | null)[] | undefined) ?? null)
    }
    return this.createFromRefiner(a, (b as StencilTableFactoryOptions | undefined) ?? new StencilTableFactoryOptions())
  }

  private createFromRefiner(refiner: TopologyRefiner, options: StencilTableFactoryOptions): StencilTableReal {
    const interpolateVertex = options.interpolationMode === StencilInterpolationMode.INTERPOLATE_VERTEX
    const interpolateVarying = options.interpolationMode === StencilInterpolationMode.INTERPOLATE_VARYING
    const interpolateFaceVarying = options.interpolationMode === StencilInterpolationMode.INTERPOLATE_FACE_VARYING

    const numControlVertices = !interpolateFaceVarying
      ? refiner.getLevel(0).getNumVertices()
      : refiner.getLevel(0).getNumFVarValues(options.fvarChannel)

    const maxlevel = Math.min(options.maxLevel, refiner.getMaxLevel())
    if (maxlevel === 0 && !options.generateControlVerts) {
      const result = new StencilTableReal(this._real)
      result._numControlVertices = numControlVertices
      return result
    }

    const builder = new StencilBuilder(this._real, numControlVertices, /*genControlVerts*/ true, /*compactWeights*/ true)

    //
    //  Interpolate stencils for each refinement level
    //
    const primvarRefiner = new PrimvarRefinerReal(refiner, this._real)

    let srcIndex = builder.index(0)
    let dstIndex = builder.index(numControlVertices)

    for (let level = 1; level <= maxlevel; ++level) {
      if (interpolateVertex) {
        primvarRefiner.interpolate(level, srcIndex, dstIndex)
      } else if (interpolateVarying) {
        primvarRefiner.interpolateVarying(level, srcIndex, dstIndex)
      } else {
        primvarRefiner.interpolateFaceVarying(level, srcIndex, dstIndex, options.fvarChannel)
      }

      if (options.factorizeIntermediateLevels) {
        srcIndex = dstIndex
      }

      const dstVertex = !interpolateFaceVarying
        ? refiner.getLevel(level).getNumVertices()
        : refiner.getLevel(level).getNumFVarValues(options.fvarChannel)
      dstIndex = dstIndex.at(dstVertex)

      if (!options.factorizeIntermediateLevels) {
        //  All previous verts are considered as coarse verts, as a result,
        //  srcIndex is not updated and the coarse vertex count is.
        builder.setCoarseVertCount(dstIndex.getOffset())
      }
    }

    let firstOffset = numControlVertices
    if (!options.generateIntermediateLevels) firstOffset = srcIndex.getOffset()

    //  Copy stencils from the StencilBuilder into the StencilTable.
    //  Always initialize numControlVertices (useful for torus case)
    return StencilTableReal.fromStencilData(
      this._real,
      numControlVertices,
      builder.getStencilOffsets(),
      builder.getStencilSizes(),
      builder.getStencilSources(),
      builder.getStencilWeights(),
      options.generateControlVerts,
      firstOffset,
    )
  }

  private createFromTables(numTables: number, tables: readonly (StencilTableReal | null)[] | null): StencilTableReal | null {
    //  Returns null for empty inputs or erroneous condition
    //  (stencilTableFactory.cpp:160-164).
    if (numTables <= 0 || !tables) {
      return null
    }

    let ncvs = -1
    let nstencils = 0
    let nelems = 0

    for (let i = 0; i < numTables; ++i) {
      const st = tables[i]
      //  allow the tables could have a null entry.
      if (!st) continue

      if (ncvs >= 0 && st.getNumControlVertices() !== ncvs) {
        return null
      }
      ncvs = st.getNumControlVertices()
      nstencils += st.getNumStencils()
      nelems += st.getControlIndices().length
    }

    if (ncvs === -1) {
      return null
    }

    const result = new StencilTableReal(this._real)
    result.resize(nstencils, nelems)

    let sizes = 0
    let indices = 0
    for (let i = 0; i < numTables; ++i) {
      const st = tables[i]
      if (!st) continue

      const stNstencils = st.getNumStencils()
      const stNelems = st._indices.length
      for (let k = 0; k < stNstencils; ++k) result._sizes[sizes + k] = st._sizes[k]!
      for (let k = 0; k < stNelems; ++k) {
        result._indices[indices + k] = st._indices[k]!
        result._weights[indices + k] = st._weights[k]!
      }

      sizes += stNstencils
      indices += stNelems
    }

    result._numControlVertices = ncvs

    //  have to re-generate offsets from scratch
    result.generateOffsets()

    return result
  }

  // stencilTableFactory.cpp:223-237
  AppendLocalPointStencilTable(
    refiner: TopologyRefiner,
    baseStencilTable: StencilTableReal | null,
    localPointStencilTable: StencilTableReal | null,
    factorize = true,
  ): StencilTableReal | null {
    return this.appendLocalPointStencilTable(refiner, baseStencilTable, localPointStencilTable, /*channel*/ -1, factorize)
  }

  // stencilTableFactory.h:148-155
  appendLocalPointStencilTableVarying(
    refiner: TopologyRefiner,
    baseStencilTable: StencilTableReal | null,
    localPointStencilTable: StencilTableReal | null,
    factorize = true,
  ): StencilTableReal | null {
    return this.AppendLocalPointStencilTable(refiner, baseStencilTable, localPointStencilTable, factorize)
  }

  // stencilTableFactory.cpp:239-254
  appendLocalPointStencilTableFaceVarying(
    refiner: TopologyRefiner,
    baseStencilTable: StencilTableReal | null,
    localPointStencilTable: StencilTableReal | null,
    channel = 0,
    factorize = true,
  ): StencilTableReal | null {
    return this.appendLocalPointStencilTable(refiner, baseStencilTable, localPointStencilTable, channel, factorize)
  }

  // stencilTableFactory.cpp:256-408
  private appendLocalPointStencilTable(
    refiner: TopologyRefiner,
    baseStencilTable: StencilTableReal | null,
    localPointStencilTable: StencilTableReal | null,
    channel: number,
    factorize: boolean,
  ): StencilTableReal | null {
    //  require the local point stencils exist and be non-empty
    if (localPointStencilTable === null || localPointStencilTable.getNumStencils() === 0) {
      return null
    }

    const nControlVerts =
      channel < 0 ? refiner.getLevel(0).getNumVertices() : refiner.getLevel(0).getNumFVarValues(channel)

    //  if no base stencils or empty, return copy of local point stencils
    if (baseStencilTable === null || baseStencilTable.getNumStencils() === 0) {
      const result = localPointStencilTable.clone()
      result._numControlVertices = nControlVerts
      return result
    }

    //  baseStencilTable can be built with or without singular stencils
    //  (single weight of 1.0f) as place-holders for coarse mesh vertices --
    //  see the diagrams at stencilTableFactory.cpp:296-326.
    let controlVertsIndexOffset = 0
    const nBaseStencils = baseStencilTable.getNumStencils()
    const nBaseStencilsElements = baseStencilTable._indices.length
    {
      const nverts = channel < 0 ? refiner.getNumVerticesTotal() : refiner.getNumFVarValuesTotal(channel)
      if (nBaseStencils === nverts) {
        //  the table contains stencils for the control vertices
        controlVertsIndexOffset = 0
      } else if (nBaseStencils === nverts - nControlVerts) {
        //  the table does not contain stencils for the control vertices
        controlVertsIndexOffset = nControlVerts
      } else {
        //  these are not the stencils you are looking for.
        return null
      }
    }

    //  copy all local point stencils to proto stencils, and factorize if
    //  needed.
    const nLocalPointStencils = localPointStencilTable.getNumStencils()
    let nLocalPointStencilsElements = 0

    const builder = new StencilBuilder(this._real, nControlVerts, /*genControlVerts*/ false, /*compactWeights*/ factorize)
    const origin = builder.index(0)
    let dst = origin
    let srcIdx = origin

    for (let i = 0; i < nLocalPointStencils; ++i) {
      const src = localPointStencilTable.getStencil(i)
      dst = origin.at(i)
      for (let j = 0; j < src.getSize(); ++j) {
        const index = src.getVertexIndex(j)
        const weight = src.getWeight(j)
        if (isWeightZero(weight)) continue

        if (factorize) {
          //  subtracting controlVertsIndex if the baseStencil doesn't include
          //  control vertices, since local point stencils are created with
          //  absolute indices including control (level=0) vertices.
          dst.addWithWeightStencil(baseStencilTable.getStencil(index - controlVertsIndexOffset), weight)
        } else {
          srcIdx = origin.at(index + controlVertsIndexOffset)
          dst.addWithWeight(srcIdx, weight)
        }
      }
      nLocalPointStencilsElements += builder.getNumVertsInStencil(i)
    }

    //  create new stencil table
    const result = new StencilTableReal(this._real)
    result._numControlVertices = nControlVerts
    result.resize(nBaseStencils + nLocalPointStencils, nBaseStencilsElements + nLocalPointStencilsElements)

    //  put base stencils first
    for (let k = 0; k < nBaseStencils; ++k) result._sizes[k] = baseStencilTable._sizes[k]!
    for (let k = 0; k < nBaseStencilsElements; ++k) {
      result._indices[k] = baseStencilTable._indices[k]!
      result._weights[k] = baseStencilTable._weights[k]!
    }

    let sizes = nBaseStencils
    let elem = nBaseStencilsElements

    //  endcap stencils second
    for (let i = 0; i < nLocalPointStencils; ++i) {
      const size = builder.getNumVertsInStencil(i)
      const idx = builder.getStencilOffsets()[i]!
      for (let j = 0; j < size; ++j) {
        result._indices[elem] = builder.getStencilSources()[idx + j]!
        result._weights[elem] = builder.getStencilWeights()[idx + j]!
        ++elem
      }
      result._sizes[sizes++] = size
    }

    //  have to re-generate offsets from scratch
    result.generateOffsets()

    return result
  }
}

// stencilTableFactory.h:208-276 -- Far::LimitStencilTableFactoryReal<REAL>.
export class LimitStencilTableFactoryReal {
  static readonly INTERPOLATE_VERTEX = StencilInterpolationMode.INTERPOLATE_VERTEX
  static readonly INTERPOLATE_VARYING = StencilInterpolationMode.INTERPOLATE_VARYING
  static readonly INTERPOLATE_FACE_VARYING = StencilInterpolationMode.INTERPOLATE_FACE_VARYING
  static readonly Options = LimitStencilTableFactoryOptions

  constructor(readonly _real: Real) {}

  // stencilTableFactory.cpp:410-662 -- null where the C++ returns 0.
  create(
    refiner: TopologyRefiner,
    locationArrays: readonly LocationArray[],
    cvStencilsIn: StencilTableReal | null = null,
    patchTableIn: PatchTable | null = null,
    options: LimitStencilTableFactoryOptions = new LimitStencilTableFactoryOptions(),
  ): LimitStencilTableReal | null {
    const stencilFactory = new StencilTableFactoryReal(this._real)

    //  Compute the total number of stencils to generate
    let numStencils = 0
    let numLimitStencils = 0
    for (let i = 0; i < locationArrays.length; ++i) {
      numStencils += locationArrays[i]!.numLocations
    }
    if (numStencils <= 0) {
      return null
    }

    const uniform = refiner.isUniform()
    const maxlevel = refiner.getMaxLevel()

    const interpolateVertex = options.interpolationMode === StencilInterpolationMode.INTERPOLATE_VERTEX
    const interpolateVarying = options.interpolationMode === StencilInterpolationMode.INTERPOLATE_VARYING
    const interpolateFaceVarying = options.interpolationMode === StencilInterpolationMode.INTERPOLATE_FACE_VARYING
    const fvarChannel = options.fvarChannel

    //
    //  Quick sanity checks for given PatchTable and/or StencilTables:
    //
    let nRefinedStencils = 0
    if (uniform) {
      //  Uniform stencils must include at least the last level points:
      nRefinedStencils = interpolateFaceVarying
        ? refiner.getLevel(maxlevel).getNumFVarValues(fvarChannel)
        : refiner.getLevel(maxlevel).getNumVertices()
    } else {
      //  Adaptive stencils must include at least all refined points:
      nRefinedStencils = interpolateFaceVarying ? refiner.getNumFVarValuesTotal(fvarChannel) : refiner.getNumVerticesTotal()
    }
    if (cvStencilsIn && cvStencilsIn.getNumStencils() < nRefinedStencils) {
      //  Too few stencils in given StencilTable
      return null
    }
    if (patchTableIn && patchTableIn.isFeatureAdaptive() === uniform) {
      //  Adaptive/uniform mismatch with given PatchTable and refiner
      return null
    }

    //  If an appropriate StencilTable was given, use it, otherwise create one
    let cvstencils = cvStencilsIn
    if (!cvstencils) {
      //  Stencils for the control vertices are necessary to properly
      //  factorize patches with control vertices at level 0 (natural regular
      //  patches, such as in a torus); they are single-index stencils of
      //  weight 1.0.
      const stencilTableOptions = new StencilTableFactoryOptions()
      stencilTableOptions.generateIntermediateLevels = uniform ? false : true
      stencilTableOptions.generateControlVerts = true
      stencilTableOptions.generateOffsets = true
      stencilTableOptions.interpolationMode = options.interpolationMode
      stencilTableOptions.fvarChannel = options.fvarChannel

      cvstencils = stencilFactory.create(refiner, stencilTableOptions)
    }

    //  If an appropriate PatchTable was given, use it, otherwise create one
    let patchtable = patchTableIn
    if (!patchtable) {
      const patchTableOptions = new PatchTableFactoryOptions()
      patchTableOptions.setPatchPrecision(this._real)
      patchTableOptions.includeBaseLevelIndices = true
      patchTableOptions.generateVaryingTables = interpolateVarying
      patchTableOptions.generateFVarTables = interpolateFaceVarying
      if (interpolateFaceVarying) {
        patchTableOptions.includeFVarBaseLevelIndices = true
        patchTableOptions.numFVarChannels = 1
        patchTableOptions.fvarChannelIndices = [fvarChannel]
        patchTableOptions.generateFVarLegacyLinearPatches = uniform || !refiner.getAdaptiveOptions().considerFVarChannels
      }
      patchTableOptions.setEndCapType(EndCapType.ENDCAP_GREGORY_BASIS)
      patchTableOptions.useInfSharpPatch = !uniform && refiner.getAdaptiveOptions().useInfSharpPatch

      patchtable = PatchTableFactory.create(refiner, patchTableOptions)
    }

    //  Append local point stencils and further verify size of given
    //  StencilTable:
    let localstencils: StencilTableReal | null = null
    if (interpolateVertex) {
      localstencils = patchtable.getLocalPointStencilTable()
    } else if (interpolateFaceVarying) {
      localstencils = patchtable.getLocalPointFaceVaryingStencilTable(fvarChannel)
    } else {
      localstencils = patchtable.getLocalPointVaryingStencilTable()
    }

    if (localstencils && cvstencils.getNumStencils() === nRefinedStencils) {
      const refinedstencils = cvstencils
      const appended = interpolateFaceVarying
        ? stencilFactory.appendLocalPointStencilTableFaceVarying(refiner, refinedstencils, localstencils, fvarChannel)
        : stencilFactory.AppendLocalPointStencilTable(refiner, refinedstencils, localstencils)
      if (!appended) throw new Error('LimitStencilTableFactory: local point stencils could not be appended')
      cvstencils = appended
    }

    //  Create a patch-map to locate sub-patches faster
    const patchmap = new PatchMap(patchtable)

    //
    //  Generate limit stencils for locations
    //
    const nControlVertices = interpolateFaceVarying
      ? refiner.getLevel(0).getNumFVarValues(fvarChannel)
      : refiner.getLevel(0).getNumVertices()

    const builder = new StencilBuilder(this._real, nControlVertices, /*genControlVerts*/ false, /*compactWeights*/ true)
    const origin = builder.index(0)
    let dst = origin

    //  Generally use the patches corresponding to the interpolation mode, but
    //  Uniform PatchTables do not have varying patches -- use the equivalent
    //  linear vertex patches in this case:
    const useVertexPatches = interpolateVertex || (interpolateVarying && uniform)
    const useFVarPatches = interpolateFaceVarying

    const makeWeights = (): Float32Array | Float64Array => (this._real === 'float' ? new Float32Array(20) : new Float64Array(20))
    const wP = makeWeights(),
      wDs = makeWeights(),
      wDt = makeWeights(),
      wDss = makeWeights(),
      wDst = makeWeights(),
      wDtt = makeWeights()
    const R = this._real === 'float' ? Math.fround : (x: number): number => x

    for (let i = 0; i < locationArrays.length; ++i) {
      const array = locationArrays[i]!
      if (!(array.ptexIdx >= 0)) throw new Error('LimitStencilTableFactory: negative ptex index')

      for (let j = 0; j < array.numLocations; ++j) {
        // for each target (s,t) point on that face
        const s = R(array.s[j]!)
        const t = R(array.t[j]!)

        const handle = patchmap.findPatch(array.ptexIdx, s, t)
        if (handle) {
          let cvs: number[]
          if (useVertexPatches) {
            cvs = patchtable.getPatchVertices(handle)
          } else if (useFVarPatches) {
            cvs = patchtable.GetPatchFVarValues(handle, fvarChannel)
          } else {
            cvs = patchtable.getPatchVaryingVertices(handle)
          }

          const src = cvstencils
          dst = origin.at(numLimitStencils)

          if (options.generate2ndDerivatives) {
            if (useVertexPatches) {
              patchtable.evaluateBasis(handle, s, t, wP, wDs, wDt, wDss, wDst, wDtt)
            } else if (useFVarPatches) {
              patchtable.evaluateBasisFaceVarying(handle, s, t, wP, wDs, wDt, wDss, wDst, wDtt, fvarChannel)
            } else {
              patchtable.evaluateBasisVarying(handle, s, t, wP, wDs, wDt, wDss, wDst, wDtt)
            }

            dst.clear()
            for (let k = 0; k < cvs.length; ++k) {
              dst.addWithWeightStencil2nd(src.getStencil(cvs[k]!), wP[k]!, wDs[k]!, wDt[k]!, wDss[k]!, wDst[k]!, wDtt[k]!)
            }
          } else if (options.generate1stDerivatives) {
            if (useVertexPatches) {
              patchtable.evaluateBasis(handle, s, t, wP, wDs, wDt)
            } else if (useFVarPatches) {
              patchtable.evaluateBasisFaceVarying(handle, s, t, wP, wDs, wDt, null, null, null, fvarChannel)
            } else {
              patchtable.evaluateBasisVarying(handle, s, t, wP, wDs, wDt)
            }

            dst.clear()
            for (let k = 0; k < cvs.length; ++k) {
              dst.addWithWeightStencil1st(src.getStencil(cvs[k]!), wP[k]!, wDs[k]!, wDt[k]!)
            }
          } else {
            if (useVertexPatches) {
              patchtable.evaluateBasis(handle, s, t, wP)
            } else if (useFVarPatches) {
              patchtable.evaluateBasisFaceVarying(handle, s, t, wP, null, null, null, null, null, fvarChannel)
            } else {
              patchtable.evaluateBasisVarying(handle, s, t, wP)
            }

            dst.clear()
            for (let k = 0; k < cvs.length; ++k) {
              dst.addWithWeightStencil(src.getStencil(cvs[k]!), wP[k]!)
            }
          }

          ++numLimitStencils
        }
      }
    }

    //
    //  Copy the proto-stencils into the limit stencil table
    //
    return LimitStencilTableReal.fromLimitStencilData(
      this._real,
      nControlVertices,
      builder.getStencilOffsets(),
      builder.getStencilSizes(),
      builder.getStencilSources(),
      builder.getStencilWeights(),
      builder.getStencilDuWeights(),
      builder.getStencilDvWeights(),
      builder.getStencilDuuWeights(),
      builder.getStencilDuvWeights(),
      builder.getStencilDvvWeights(),
      /*ctrlVerts*/ false,
      /*firstOffset*/ 0,
    )
  }
}

// stencilTableFactory.h:287-347 -- the float wrapper Far::StencilTableFactory.
export const StencilTableFactory = new StencilTableFactoryReal('float')

// stencilTableFactory.h:354-375 -- the float wrapper
// Far::LimitStencilTableFactory.
export const LimitStencilTableFactory = new LimitStencilTableFactoryReal('float')

