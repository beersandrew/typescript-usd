// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchTable.h,
//  opensubdiv/far/patchTable.cpp
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/patchTable.h:55-900 and
// patchTable.cpp:37-649 -- Far::PatchTable. Local source addition (see
// PROVENANCE.md).
//
// DIVERGENCE: ConstIndexArray / PatchParamArray views are returned as copies
// (plain arrays) where the C++ returns pointer views into the tables; the
// tables themselves are reachable through the Get*Table() accessors and the
// internal fields used by PatchTableBuilder. The float/double EvaluateBasis
// overloads are selected by the output array type (Float32Array evaluates
// the float instantiation, anything else the double one).

import { Options } from '../sdc/options.ts'
import { FVarLinearInterpolation } from '../sdc/options.ts'
import { INDEX_INVALID, type Index } from './types.ts'
import { PatchDescriptor, PatchType } from './patchDescriptor.ts'
import { PatchParam } from './patchParam.ts'
import { EvaluatePatchBasis, type BasisWeights } from './patchBasis.ts'
import type { StencilTableReal } from './stencilTable.ts'
import type { Primvar, PrimvarBuffer } from './primvarRefinerReal.ts'

// patchTable.h:60-70 -- Far::PatchTable::PatchHandle.
export class PatchHandle {
  constructor(
    public arrayIndex: Index = 0, // Array index of the patch
    public patchIndex: Index = 0, // Absolute Index of the patch
    public vertIndex: Index = 0, // Relative offset to the first CV of the patch in array
  ) {}
}

// patchTable.h:548-562
export class PatchArray {
  constructor(
    public desc: PatchDescriptor,
    public numPatches: number,
    public vertIndex: Index,
    public patchIndex: Index,
    public quadOffsetIndex: Index,
  ) {}

  // patchTable.cpp:130-136
  print(): string {
    return (
      this.desc.print() +
      `    numPatches=${this.numPatches} vertIndex=${this.vertIndex} patchIndex=${this.patchIndex} ` +
      `quadOffsetIndex=${this.quadOffsetIndex}\n`
    )
  }
}

// patchTable.h:615-625
export class FVarPatchChannel {
  interpolation: FVarLinearInterpolation = new Options().getFVarLinearInterpolation()
  regDesc = new PatchDescriptor()
  irregDesc = new PatchDescriptor()
  stride = 0
  patchValues: number[] = []
  patchParam: PatchParam[] = []
}

type Weights = BasisWeights | null | undefined

export class PatchTable {
  static readonly PatchHandle = PatchHandle

  _maxValence: number // highest vertex valence found in the mesh
  _numPtexFaces = 0 // total number of ptex faces

  _patchArrays: PatchArray[] = [] // Vector of descriptors for arrays of patches
  _patchVerts: number[] = [] // Indices of the control vertices of the patches
  _paramTable: PatchParam[] = [] // PatchParam bitfields (one per patch)

  _quadOffsetsTable: number[] = [] // Quad offsets (for Gregory patches)
  _vertexValenceTable: number[] = [] // Vertex valence table (for Gregory patches)

  _localPointStencils: StencilTableReal | null = null // local point conversion stencils
  _localPointVaryingStencils: StencilTableReal | null = null // local point varying stencils

  _varyingDesc: PatchDescriptor
  _varyingVerts: number[] = []

  _fvarChannels: FVarPatchChannel[] = []
  _localPointFaceVaryingStencils: (StencilTableReal | null)[] = []

  _sharpnessIndices: number[] = [] // Indices of single-crease sharpness (one per patch)
  _sharpnessValues: number[] = [] // Sharpness values.

  _isUniformLinear = false

  _vertexPrecisionIsDouble = false
  _varyingPrecisionIsDouble = false
  _faceVaryingPrecisionIsDouble = false

  // patchTable.cpp:37-46 (constructor; the C++ one is protected and used by
  // PatchTableBuilder)
  constructor(maxvalence: number) {
    this._maxValence = maxvalence
    this._varyingDesc = new PatchDescriptor(PatchType.QUADS)
  }

  // patchTable.cpp:48-101 (copy constructor)
  clone(): PatchTable {
    const t = new PatchTable(this._maxValence)
    t._numPtexFaces = this._numPtexFaces
    t._patchArrays = this._patchArrays.map(
      (pa) => new PatchArray(new PatchDescriptor(pa.desc), pa.numPatches, pa.vertIndex, pa.patchIndex, pa.quadOffsetIndex),
    )
    t._patchVerts = this._patchVerts.slice()
    t._paramTable = this._paramTable.map((p) => p.clone())
    t._quadOffsetsTable = this._quadOffsetsTable.slice()
    t._vertexValenceTable = this._vertexValenceTable.slice()
    t._localPointStencils = this._localPointStencils ? this._localPointStencils.clone() : null
    t._localPointVaryingStencils = this._localPointVaryingStencils ? this._localPointVaryingStencils.clone() : null
    t._varyingDesc = new PatchDescriptor(this._varyingDesc)
    t._varyingVerts = this._varyingVerts.slice()
    t._fvarChannels = this._fvarChannels.map((c) => {
      const n = new FVarPatchChannel()
      n.interpolation = c.interpolation
      n.regDesc = new PatchDescriptor(c.regDesc)
      n.irregDesc = new PatchDescriptor(c.irregDesc)
      n.stride = c.stride
      n.patchValues = c.patchValues.slice()
      n.patchParam = c.patchParam.map((p) => p.clone())
      return n
    })
    t._localPointFaceVaryingStencils = this._localPointFaceVaryingStencils.map((s) => (s ? s.clone() : null))
    t._sharpnessIndices = this._sharpnessIndices.slice()
    t._sharpnessValues = this._sharpnessValues.slice()
    t._isUniformLinear = this._isUniformLinear
    t._vertexPrecisionIsDouble = this._vertexPrecisionIsDouble
    t._varyingPrecisionIsDouble = this._varyingPrecisionIsDouble
    t._faceVaryingPrecisionIsDouble = this._faceVaryingPrecisionIsDouble
    return t
  }

  // patchTable.cpp:376-380
  isFeatureAdaptive(): boolean {
    return !this._isUniformLinear
  }

  // patchTable.h:84-95
  getNumControlVerticesTotal(): number {
    return this._patchVerts.length
  }
  // patchTable.cpp:254-258 -- one PatchParam record per patch in the mesh
  getNumPatchesTotal(): number {
    return this._paramTable.length
  }
  getMaxValence(): number {
    return this._maxValence
  }
  getNumPtexFaces(): number {
    return this._numPtexFaces
  }

  //
  //  Individual patches (patchTable.cpp:236-322)
  //
  getPatchDescriptor(handle: PatchHandle): PatchDescriptor {
    return this.getPatchArray(handle.arrayIndex).desc
  }
  getPatchVertices(handle: PatchHandle): number[]
  getPatchVertices(arrayIndex: number, patchIndex: number): number[]
  getPatchVertices(a: PatchHandle | number, patchIndex?: number): number[] {
    if (a instanceof PatchHandle) {
      const pa = this.getPatchArray(a.arrayIndex)
      const vert = pa.vertIndex + a.vertIndex
      return this._patchVerts.slice(vert, vert + getPatchSize(pa.desc))
    }
    const pa = this.getPatchArray(a)
    const size = getPatchSize(pa.desc)
    const start = pa.vertIndex + patchIndex! * size
    if (!(start < this._patchVerts.length)) throw new Error('PatchTable.GetPatchVertices(): patch out of range')
    return this._patchVerts.slice(start, start + size)
  }
  getPatchParam(handle: PatchHandle): PatchParam
  getPatchParam(arrayIndex: number, patchIndex: number): PatchParam
  getPatchParam(a: PatchHandle | number, patchIndex?: number): PatchParam {
    if (a instanceof PatchHandle) {
      return this._paramTable[a.patchIndex]!
    }
    const pa = this.getPatchArray(a)
    return this._paramTable[pa.patchIndex + patchIndex!]!
  }

  //
  //  Arrays of patches (patchTable.cpp:241-322)
  //
  getNumPatchArrays(): number {
    return this._patchArrays.length
  }
  getNumPatches(arrayIndex: number): number {
    return this.getPatchArray(arrayIndex).numPatches
  }
  getNumControlVertices(arrayIndex: number): number {
    const pa = this.getPatchArray(arrayIndex)
    return pa.numPatches * getPatchSize(pa.desc)
  }
  getPatchArrayDescriptor(arrayIndex: number): PatchDescriptor {
    return this.getPatchArray(arrayIndex).desc
  }
  getPatchArrayVertices(arrayIndex: number): number[] {
    const pa = this.getPatchArray(arrayIndex)
    const size = getPatchSize(pa.desc)
    return this._patchVerts.slice(pa.vertIndex, pa.vertIndex + pa.numPatches * size)
  }
  getPatchParams(arrayIndex: number): PatchParam[] {
    const pa = this.getPatchArray(arrayIndex)
    return this._paramTable.slice(pa.patchIndex, pa.patchIndex + pa.numPatches)
  }

  //
  //  Change of basis patches (patchTable.cpp:346-369, patchTable.h:742-851)
  //
  getNumLocalPoints(): number {
    return this._localPointStencils ? this._localPointStencils.getNumStencils() : 0
  }
  getLocalPointStencilTable(): StencilTableReal | null {
    return this._localPointStencils
  }
  localPointStencilPrecisionMatchesType(real: 'float' | 'double'): boolean {
    return this._vertexPrecisionIsDouble === (real === 'double')
  }
  // patchTable.h:824-831
  computeLocalPointValues<V extends Primvar<V>>(src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    if (this._localPointStencils) this._localPointStencils.updateValues(src, dst)
  }

  getNumLocalPointsVarying(): number {
    return this._localPointVaryingStencils ? this._localPointVaryingStencils.getNumStencils() : 0
  }
  getLocalPointVaryingStencilTable(): StencilTableReal | null {
    return this._localPointVaryingStencils
  }
  localPointVaryingStencilPrecisionMatchesType(real: 'float' | 'double'): boolean {
    return this._varyingPrecisionIsDouble === (real === 'double')
  }
  // patchTable.h:833-840
  computeLocalPointValuesVarying<V extends Primvar<V>>(src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    if (this._localPointVaryingStencils) this._localPointVaryingStencils.updateValues(src, dst)
  }

  getNumLocalPointsFaceVarying(channel = 0): number {
    if (channel >= 0 && channel < this._localPointFaceVaryingStencils.length) {
      const s = this._localPointFaceVaryingStencils[channel]
      return s ? s.getNumStencils() : 0
    }
    return 0
  }
  getLocalPointFaceVaryingStencilTable(channel = 0): StencilTableReal | null {
    if (channel >= 0 && channel < this._localPointFaceVaryingStencils.length) {
      return this._localPointFaceVaryingStencils[channel] ?? null
    }
    return null
  }
  localPointFaceVaryingStencilPrecisionMatchesType(real: 'float' | 'double'): boolean {
    return this._faceVaryingPrecisionIsDouble === (real === 'double')
  }
  // patchTable.h:842-851
  computeLocalPointValuesFaceVarying<V extends Primvar<V>>(src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>, channel = 0): void {
    const stencils = this.getLocalPointFaceVaryingStencilTable(channel)
    if (stencils) stencils.updateValues(src, dst)
  }

  //
  //  Legacy gregory patch evaluation buffers (patchTable.cpp:371-375)
  //
  getPatchQuadOffsets(handle: PatchHandle): number[] {
    const pa = this.getPatchArray(handle.arrayIndex)
    const start = pa.quadOffsetIndex + handle.vertIndex
    return this._quadOffsetsTable.slice(start, start + 4)
  }
  getVertexValenceTable(): number[] {
    return this._vertexValenceTable
  }

  //
  //  Single-crease patches (patchTable.cpp:324-344)
  //
  getSingleCreasePatchSharpnessValue(handle: PatchHandle): number
  getSingleCreasePatchSharpnessValue(arrayIndex: number, patchIndex: number): number
  getSingleCreasePatchSharpnessValue(a: PatchHandle | number, patchIndex?: number): number {
    const p = a instanceof PatchHandle ? a.patchIndex : this.getPatchArray(a).patchIndex + patchIndex!
    const index = this._sharpnessIndices[p]!
    if (index === INDEX_INVALID) return 0.0
    return this._sharpnessValues[index]!
  }

  //
  //  Varying data (patchTable.cpp:382-429)
  //
  getVaryingPatchDescriptor(): PatchDescriptor {
    return this._varyingDesc
  }
  getPatchVaryingVertices(handle: PatchHandle): number[]
  getPatchVaryingVertices(array: number, patch: number): number[]
  getPatchVaryingVertices(a: PatchHandle | number, patch?: number): number[] {
    if (this._varyingVerts.length === 0) return []
    const numVaryingCVs = this._varyingDesc.getNumControlVertices()
    const start =
      a instanceof PatchHandle ? a.patchIndex * numVaryingCVs : (this.getPatchArray(a).patchIndex + patch!) * numVaryingCVs
    return this._varyingVerts.slice(start, start + numVaryingCVs)
  }
  getPatchArrayVaryingVertices(array: number): number[] {
    if (this._varyingVerts.length === 0) return []
    const pa = this.getPatchArray(array)
    const numVaryingCVs = this._varyingDesc.getNumControlVertices()
    const start = pa.patchIndex * numVaryingCVs
    return this._varyingVerts.slice(start, start + pa.numPatches * numVaryingCVs)
  }
  getVaryingVertices(): number[] {
    return this._varyingVerts
  }

  //
  //  Face-varying (patchTable.cpp:470-563)
  //
  getNumFVarChannels(): number {
    return this._fvarChannels.length
  }
  getFVarChannelLinearInterpolation(channel = 0): FVarLinearInterpolation {
    return this.getFVarPatchChannel(channel).interpolation
  }
  getFVarPatchDescriptorRegular(channel = 0): PatchDescriptor {
    return this.getFVarPatchChannel(channel).regDesc
  }
  getFVarPatchDescriptorIrregular(channel = 0): PatchDescriptor {
    return this.getFVarPatchChannel(channel).irregDesc
  }
  getFVarPatchDescriptor(channel = 0): PatchDescriptor {
    return this.getFVarPatchChannel(channel).irregDesc
  }
  GetPatchFVarValues(handle: PatchHandle, channel?: number): number[]
  GetPatchFVarValues(arrayIndex: number, patchIndex: number, channel?: number): number[]
  GetPatchFVarValues(a: PatchHandle | number, b?: number, c?: number): number[] {
    if (a instanceof PatchHandle) return this.getPatchFVarValues(a.patchIndex, b ?? 0)
    return this.getPatchFVarValues(this.getPatchIndex(a, b!), c ?? 0)
  }
  getPatchArrayFVarValues(array: number, channel = 0): number[] {
    const pa = this.getPatchArray(array)
    const c = this.getFVarPatchChannel(channel)
    const ncvs = c.stride
    const start = pa.patchIndex * ncvs
    return c.patchValues.slice(start, start + pa.numPatches * ncvs)
  }
  getFVarValues(channel = 0): number[] {
    return this.getFVarPatchChannel(channel).patchValues
  }
  getFVarValueStride(channel = 0): number {
    return this.getFVarPatchChannel(channel).stride
  }
  GetPatchFVarPatchParam(handle: PatchHandle, channel?: number): PatchParam
  GetPatchFVarPatchParam(arrayIndex: number, patchIndex: number, channel?: number): PatchParam
  GetPatchFVarPatchParam(a: PatchHandle | number, b?: number, c?: number): PatchParam {
    if (a instanceof PatchHandle) return this.getPatchFVarPatchParam(a.patchIndex, b ?? 0)
    return this.getPatchFVarPatchParam(this.getPatchIndex(a, b!), c ?? 0)
  }
  getPatchArrayFVarPatchParams(array: number, channel = 0): PatchParam[] {
    const pa = this.getPatchArray(array)
    const c = this.getFVarPatchChannel(channel)
    return c.patchParam.slice(pa.patchIndex, pa.patchIndex + pa.numPatches)
  }
  getFVarPatchParams(channel = 0): PatchParam[] {
    return this.getFVarPatchChannel(channel).patchParam
  }

  //
  //  Direct accessors (patchTable.h:375-394)
  //
  getPatchControlVerticesTable(): number[] {
    return this._patchVerts
  }
  getPatchParamTable(): PatchParam[] {
    return this._paramTable
  }
  getSharpnessIndexTable(): number[] {
    return this._sharpnessIndices
  }
  getSharpnessValues(): number[] {
    return this._sharpnessValues
  }
  getQuadOffsetsTable(): number[] {
    return this._quadOffsetsTable
  }

  // patchTable.cpp:565-574
  print(): string {
    let s = `patchTable\n  numPatches = ${this.getNumPatchesTotal()}\n`
    for (let i = 0; i < this.getNumPatchArrays(); ++i) {
      s += `  patchArray ${i}:\n` + this.getPatchArray(i).print()
    }
    return s
  }

  //
  //  Evaluation methods (patchTable.cpp:579-625)
  //
  evaluateBasis(handle: PatchHandle, s: number, t: number, wP: Weights, wDs?: Weights, wDt?: Weights, wDss?: Weights, wDst?: Weights, wDtt?: Weights): void {
    const param = this._paramTable[handle.patchIndex]!
    const patchType = this.getPatchArrayDescriptor(handle.arrayIndex).getType()

    EvaluatePatchBasis(patchType, param, s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  }

  evaluateBasisVarying(
    handle: PatchHandle,
    s: number,
    t: number,
    wP: Weights,
    wDs?: Weights,
    wDt?: Weights,
    wDss?: Weights,
    wDst?: Weights,
    wDtt?: Weights,
  ): void {
    const param = this._paramTable[handle.patchIndex]!
    const patchType = this.getVaryingPatchDescriptor().getType()

    EvaluatePatchBasis(patchType, param, s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  }

  evaluateBasisFaceVarying(
    handle: PatchHandle,
    s: number,
    t: number,
    wP: Weights,
    wDs: Weights = null,
    wDt: Weights = null,
    wDss: Weights = null,
    wDst: Weights = null,
    wDtt: Weights = null,
    channel = 0,
  ): void {
    const param = this.getPatchFVarPatchParam(handle.patchIndex, channel)
    const patchType = param.isRegular()
      ? this.getFVarPatchDescriptorRegular(channel).getType()
      : this.getFVarPatchDescriptorIrregular(channel).getType()

    EvaluatePatchBasis(patchType, param, s, t, wP, wDs, wDt, wDss, wDst, wDtt)
  }

  //
  //  Internal methods used by PatchTableBuilder (patchTable.cpp:137-234)
  //
  getPatchIndex(arrayIndex: number, patchIndex: number): Index {
    const pa = this.getPatchArray(arrayIndex)
    if (!(patchIndex < pa.numPatches)) throw new Error('PatchTable: patch index out of range')
    return pa.patchIndex + patchIndex
  }

  getPatchArray(arrayIndex: Index): PatchArray {
    const pa = this._patchArrays[arrayIndex]
    if (!pa) throw new Error(`PatchTable: no patch array ${arrayIndex}`)
    return pa
  }

  reservePatchArrays(_numPatchArrays: number): void {}

  // patchTable.cpp:203-218 -- the C++ in/out index pointers are a
  // { vidx, pidx, qoidx } record here.
  pushPatchArray(desc: PatchDescriptor, npatches: number, offsets: { vidx: number; pidx: number; qoidx?: number }): void {
    if (npatches > 0) {
      this._patchArrays.push(new PatchArray(desc, npatches, offsets.vidx, offsets.pidx, offsets.qoidx ?? 0))
      const nverts = getPatchSize(desc)
      offsets.vidx += npatches * nverts
      offsets.pidx += npatches
      if (offsets.qoidx !== undefined) {
        offsets.qoidx += desc.getType() === PatchType.GREGORY ? npatches * nverts : 0
      }
    }
  }

  // patchTable.cpp:265-272
  findPatchArray(desc: PatchDescriptor): Index {
    for (let i = 0; i < this._patchArrays.length; ++i) {
      if (this._patchArrays[i]!.desc.equals(desc)) return i
    }
    return INDEX_INVALID
  }

  // patchTable.cpp:152-157
  allocateVaryingVertices(desc: PatchDescriptor, numPatches: number): void {
    this._varyingDesc = desc
    this._varyingVerts = new Array<number>(numPatches * desc.getNumControlVertices()).fill(0)
  }

  // patchTable.cpp:430-468
  populateVaryingVertices(): void {
    const numVaryingCVs = this._varyingDesc.getNumControlVertices()
    for (let arrayIndex = 0; arrayIndex < this._patchArrays.length; ++arrayIndex) {
      const pa = this.getPatchArray(arrayIndex)
      const patchType = pa.desc.getType()
      for (let patch = 0; patch < pa.numPatches; ++patch) {
        const vertexCVs = this.getPatchVertices(arrayIndex, patch)
        const start = (pa.patchIndex + patch) * numVaryingCVs
        const v = this._varyingVerts
        if (patchType === PatchType.REGULAR) {
          v[start + 0] = vertexCVs[5]!
          v[start + 1] = vertexCVs[6]!
          v[start + 2] = vertexCVs[10]!
          v[start + 3] = vertexCVs[9]!
        } else if (patchType === PatchType.GREGORY_BASIS) {
          v[start + 0] = vertexCVs[0]!
          v[start + 1] = vertexCVs[5]!
          v[start + 2] = vertexCVs[10]!
          v[start + 3] = vertexCVs[15]!
        } else if (patchType === PatchType.QUADS) {
          v[start + 0] = vertexCVs[0]!
          v[start + 1] = vertexCVs[1]!
          v[start + 2] = vertexCVs[2]!
          v[start + 3] = vertexCVs[3]!
        } else if (patchType === PatchType.TRIANGLES) {
          v[start + 0] = vertexCVs[0]!
          v[start + 1] = vertexCVs[1]!
          v[start + 2] = vertexCVs[2]!
        }
      }
    }
  }

  // patchTable.cpp:159-168
  getFVarPatchChannel(channel: number): FVarPatchChannel {
    const c = this._fvarChannels[channel]
    if (!c) throw new Error(`PatchTable: no face-varying channel ${channel}`)
    return c
  }

  // patchTable.cpp:169-172
  allocateFVarPatchChannels(numChannels: number): void {
    this._fvarChannels = []
    for (let i = 0; i < numChannels; ++i) this._fvarChannels.push(new FVarPatchChannel())
  }

  // patchTable.cpp:173-186
  allocateFVarPatchChannelValues(regDesc: PatchDescriptor, irregDesc: PatchDescriptor, numPatches: number, channel: number): void {
    const c = this.getFVarPatchChannel(channel)
    c.regDesc = regDesc
    c.irregDesc = irregDesc

    c.stride = Math.max(regDesc.getNumControlVertices(), irregDesc.getNumControlVertices())

    c.patchValues = new Array<number>(numPatches * c.stride).fill(0)
    c.patchParam = []
    for (let i = 0; i < numPatches; ++i) c.patchParam.push(new PatchParam())
  }

  // patchTable.cpp:187-192
  setFVarPatchChannelLinearInterpolation(interpolation: FVarLinearInterpolation, channel: number): void {
    this.getFVarPatchChannel(channel).interpolation = interpolation
  }

  // patchTable.cpp:504-516
  getPatchFVarValues(patch: number, channel: number): number[] {
    const c = this.getFVarPatchChannel(channel)
    const ncvsThisPatch = c.patchParam[patch]!.isRegular()
      ? c.regDesc.getNumControlVertices()
      : c.irregDesc.getNumControlVertices()
    return c.patchValues.slice(patch * c.stride, patch * c.stride + ncvsThisPatch)
  }

  // patchTable.cpp:534-539
  getPatchFVarPatchParam(patch: number, channel: number): PatchParam {
    return this.getFVarPatchChannel(channel).patchParam[patch]!
  }
}

// patchTable.cpp:198-201
function getPatchSize(desc: PatchDescriptor): number {
  return desc.getNumControlVertices()
}
