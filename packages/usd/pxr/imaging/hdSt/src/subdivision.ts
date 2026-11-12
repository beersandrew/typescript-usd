// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/subdivision.cpp,
//  pxr/imaging/hdSt/subdivision.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/subdivision.{h,cpp} (OpenUSD 26.11.1), over
// the OpenSubdiv 3.6.1 Far port in packages/opensubdiv (@opensubdiv/core).
//
// Deliberate divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - std::unique_ptr / std::shared_ptr members are plain references; the
//   _gpuStencilMutex is not needed in JS.
// - HdSt_OsdStencilTableBufferSource::GetData and
//   HdSt_OsdRefineComputationCPU::GetData return typed arrays built from the
//   Far tables (upstream returns the tables' own storage); the weights are
//   Float32 as upstream uploads them (subdivision.cpp:295-300).
// - The `Uniform` struct of _EvalStencilsGPU is an Int32Array of its ten
//   int fields.
// - The pipeline hash combines the shader program handle's id where
//   upstream combines the program pointer (subdivision.cpp:1925-1927); the
//   hash is only a registry cache key.
// - Far's PatchParam fields are unsigned 32-bit numbers here; `*((int*)&field)`
//   is `field | 0`.
// - HD_TRACE_FUNCTION / HD_TRACE_SCOPE / HF_MALLOC_TAG_FUNCTION are not
//   ported.
// - Adaptive refinement: TopologyRefiner.RefineAdaptive and feature-adaptive
//   patch construction are not in packages/opensubdiv (PROVENANCE.md), so the
//   adaptive branch of HdSt_OsdTopologyComputation::Resolve
//   (subdivision.cpp:1046-1066) posts a coding error and leaves the
//   subdivision without tables. FAITHFULNESS-DEBT(hdst-osd-adaptive).
//   RefinesToBSplinePatches / RefinesToBoxSplineTrianglePatches are true only
//   with HD_ENABLE_OPENSUBDIV3_ADAPTIVE or RefineModePatches.

import { Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3i as GfVec3i, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { HashCombine as TfHashCombine, Token as TfToken } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import {
  BufferSource as HdBufferSource,
  ComputedBufferSource as HdComputedBufferSource,
  VtBufferSource as HdVtBufferSource,
  MeshUtil as HdMeshUtil,
  MeshTriQuadBuilder as HdMeshTriQuadBuilder,
  Tokens as HdTokens,
  PerfTokens as HdPerfTokens,
  PerfLog as HdPerfLog,
  Type as HdType,
  GetComponentCount as HdGetComponentCount,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type BufferSpec as HdBufferSpec,
  type BufferArrayRange as HdBufferArrayRange,
  type ResourceRegistry as HdResourceRegistry,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import {
  type Hgi,
  type HgiBufferHandle,
  type HgiResourceBindingsHandle,
  type HgiComputePipelineHandle,
  type HgiShaderProgramHandle,
  type HgiShaderFunctionDesc,
  HgiResourceBindingsDesc,
  HgiBufferBindDesc,
  HgiComputePipelineDesc,
  HgiBindResourceType,
  HgiBindingType,
  HgiShaderStageBits,
  HgiShaderKeywordTokens,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddWritableBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
} from 'typescript-usd/hgi'
import { RefinerFactory as PxOsdRefinerFactory, OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import {
  StencilTableFactory,
  StencilTableFactoryOptions,
  StencilInterpolationMode,
  PatchTableFactory,
  PatchTableFactoryOptions,
  type StencilTableReal,
  type PatchTable,
  type TopologyRefiner,
} from '@opensubdiv/core/far'
import { HdStComputation } from './computation.ts'
import { HdStGLSLProgram } from './glslProgram.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdSt_MeshTopologyInterpolation,
  type HdSt_MeshTopology,
} from './meshTopology.ts'
import { HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

// subdivision.cpp:50-60
const _tokens = {
  evalStencils: 'evalStencils',
  stencilData: 'stencilData',
  sizes: 'sizes',
  offsets: 'offsets',
  indices: 'indices',
  weights: 'weights',
  baseFaceToRefinedFacesMap: 'baseFaceToRefinedFacesMap',
  refinedFaceCounts: 'refinedFaceCounts',
} as const

/** subdivision.h:37-38 HdSt_Subdivision::StencilTable / PatchTable */
type StencilTable = StencilTableReal

/** subdivision.cpp:62-73. The stencil table data is managed using two buffer
 *  array ranges the first containing the sizes and offsets which are
 *  perPoint for each refined point, and the second containing the indices
 *  and weights which are perIndex for each refined point stencil index. */
export class HdSt_GpuStencilTable {
  constructor(
    public numCoarsePoints: number,
    public numRefinedPoints: number,
    public perPointRange: HdBufferArrayRange | null,
    public perIndexRange: HdBufferArrayRange | null,
  ) {}
}

/** subdivision.h:29-30 */
export type HdSt_GpuStencilTableSharedPtr = HdSt_GpuStencilTable

/** A VtValue holding a VtArray over freshly filled int storage. */
function _IntArrayValue(
  vtTypeName: 'int' | 'GfVec2i' | 'GfVec3i' | 'GfVec4i', buffer: Int32Array,
): VtValue {
  return VtValue.createArray(VtArray._adopt(VtValueTypes[vtTypeName], buffer))
}

/** `static_cast<float const*>(source->GetData())` */
function _AsFloat32(data: ArrayBufferView): Float32Array {
  if (data instanceof Float32Array) return data
  return new Float32Array(data.buffer as ArrayBuffer, data.byteOffset,
    Math.floor(data.byteLength / 4))
}

/** subdivision.h:36-158. Subdivision struct holding subdivision tables and
 *  patch tables. This single struct can be used for cpu and gpu subdivision
 *  at the same time. */
export class HdSt_Subdivision {
  private _vertexStencils: StencilTable | null = null
  private _varyingStencils: StencilTable | null = null
  private _faceVaryingStencils: (StencilTable | null)[] = []
  private _patchTable: PatchTable | null = null

  private readonly _adaptive: boolean
  private readonly _refineLevel: number
  private _maxNumFaceVarying = 0 // calculated during SetRefinementTables()

  private _gpuVertexStencils: HdSt_GpuStencilTable | null = null
  private _gpuVaryingStencils: HdSt_GpuStencilTable | null = null
  private _gpuFaceVaryingStencils: (HdSt_GpuStencilTable | null)[] = []

  /** subdivision.cpp:727-732 */
  constructor(adaptive: boolean, refineLevel: number) {
    this._adaptive = adaptive
    this._refineLevel = refineLevel
  }

  /** subdivision.h:45-47 */
  isAdaptive(): boolean {
    return this._adaptive
  }

  /** subdivision.h:49-51 */
  getRefineLevel(): number {
    return this._refineLevel
  }

  /** subdivision.cpp:759-767. Returns the total number of vertices,
   *  including coarse and refined ones. */
  getNumVertices(): number {
    if (!TF_VERIFY(this._vertexStencils)) return 0

    return this._vertexStencils!.getNumStencils() +
      this._vertexStencils!.getNumControlVertices()
  }

  /** subdivision.cpp:769-777 */
  getNumVarying(): number {
    if (!TF_VERIFY(this._varyingStencils)) return 0

    return this._varyingStencils!.getNumStencils() +
      this._varyingStencils!.getNumControlVertices()
  }

  /** subdivision.cpp:779-787 */
  getNumFaceVarying(channel: number): number {
    const stencils = this._faceVaryingStencils[channel] ?? null
    if (!TF_VERIFY(stencils)) return 0

    return stencils!.getNumStencils() + stencils!.getNumControlVertices()
  }

  /** subdivision.cpp:789-795. Returns the largest total number of
   *  face-varying values (coarse and refined) for all the face-varying
   *  channels. */
  getMaxNumFaceVarying(): number {
    return this._maxNumFaceVarying
  }

  /** subdivision.cpp:797-809 */
  getRefinedFvarIndices(channel: number): number[] {
    const fvarIndices: number[] = []
    if (this._patchTable && this._patchTable.getNumFVarChannels() > channel) {
      const indices = this._patchTable.getFVarValues(channel)
      for (let i = 0; i < indices.length; ++i) {
        fvarIndices.push(indices[i]!)
      }
    }
    return fvarIndices
  }

  /** subdivision.cpp:836-885 */
  refineCPU(
    source: HdBufferSource,
    primvarBuffer: { data: Float32Array },
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): void {
    const stencilTable = this.getStencilTable(interpolation, fvarChannel)

    if (!TF_VERIFY(stencilTable)) return

    // if there is no stencil (e.g. torus with adaptive refinement),
    // just return here
    if (stencilTable!.getNumStencils() === 0) return

    // Stride is measured here in components, not bytes.
    const elementStride = HdGetComponentCount(source.getTupleType().type)

    const numTotalElements =
      stencilTable!.getNumControlVertices() + stencilTable!.getNumStencils()
    primvarBuffer.data = new Float32Array(numTotalElements * elementStride)

    // if the mesh has more vertices than that in use in topology,
    // we need to trim the buffer so that they won't overrun the coarse
    // vertex buffer which we allocated using the stencil table.
    // see HdSt_Subdivision::GetNumVertices()
    let numSrcElements = source.getNumElements()
    if (numSrcElements > stencilTable!.getNumControlVertices()) {
      numSrcElements = stencilTable!.getNumControlVertices()
    }

    const srcData = _AsFloat32(source.getData())
    primvarBuffer.data.set(srcData.subarray(0, numSrcElements * elementStride))

    _EvalStencilsCPU(
      primvarBuffer.data,
      elementStride,
      stencilTable!.getNumControlVertices(),
      stencilTable!.getNumStencils(),
      stencilTable!.getSizes(),
      stencilTable!.getOffsets(),
      stencilTable!.getControlIndices(),
      stencilTable!.getWeights(),
    )
  }

  /** subdivision.cpp:887-911 */
  refineGPU(
    primvarRange: HdBufferArrayRange | null,
    primvarName: string,
    gpuStencilTable: HdSt_GpuStencilTable | null,
    resourceRegistry: HdStResourceRegistry,
  ): void {
    if (!TF_VERIFY(gpuStencilTable)) return

    // if there is no stencil (e.g. torus with adaptive refinement),
    // just return here
    if (gpuStencilTable!.numRefinedPoints === 0) return

    _EvalStencilsGPU(
      primvarRange,
      primvarName,
      gpuStencilTable!.numCoarsePoints,
      gpuStencilTable!.numRefinedPoints,
      gpuStencilTable!.perPointRange,
      gpuStencilTable!.perIndexRange,
      resourceRegistry)
  }

  // computation factory methods

  /** subdivision.cpp:913-918 */
  createTopologyComputation(topology: HdSt_MeshTopology, id: SdfPath): HdBufferSource {
    return new HdSt_OsdTopologyComputation(topology, id)
  }

  /** subdivision.cpp:920-925 */
  createIndexComputation(
    topology: HdSt_MeshTopology, osdTopology: HdBufferSource | null,
  ): HdBufferSource {
    return new HdSt_OsdIndexComputation(topology, osdTopology)
  }

  /** subdivision.cpp:927-933 */
  createFvarIndexComputation(
    topology: HdSt_MeshTopology, osdTopology: HdBufferSource | null, channel: number,
  ): HdBufferSource {
    return new HdSt_OsdFvarIndexComputation(topology, osdTopology, channel)
  }

  /** subdivision.cpp:935-944 */
  createRefineComputationCPU(
    topology: HdSt_MeshTopology,
    source: HdBufferSource,
    osdTopology: HdBufferSource | null,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): HdBufferSource {
    return new HdSt_OsdRefineComputationCPU(
      topology, source, osdTopology, interpolation, fvarChannel)
  }

  /** subdivision.cpp:946-962 */
  createRefineComputationGPU(
    topology: HdSt_MeshTopology,
    osdTopology: HdBufferSource | null,
    name: string,
    dataType: HdType,
    resourceRegistry: HdStResourceRegistry,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): HdStComputation {
    const gpuStencilTable = this._getGpuStencilTable(
      topology, osdTopology, resourceRegistry, interpolation, fvarChannel)

    return new HdSt_OsdRefineComputationGPU(
      topology, name, dataType, gpuStencilTable, interpolation)
  }

  /** subdivision.cpp:964-970 */
  createBaseFaceToRefinedFacesMapComputation(osdTopology: HdBufferSource | null): HdBufferSource {
    return new HdSt_OsdBaseFaceToRefinedFacesMapComputation(this, osdTopology)
  }

  /** subdivision.cpp:432-439. Returns true if the subdivision for `scheme`
   *  generates triangles, instead of quads. */
  static refinesToTriangles(scheme: string): boolean {
    if (scheme === PxOsdOpenSubdivTokens.loop) {
      return true
    }
    return false
  }

  /** subdivision.cpp:441-445. Returns true if the subdivision for `scheme`
   *  generates bspline patches. */
  static refinesToBSplinePatches(scheme: string): boolean {
    return scheme === PxOsdOpenSubdivTokens.catmullClark
  }

  /** subdivision.cpp:447-457. Returns true if the subdivision for `scheme`
   *  generates box spline triangle patches; v3.4.0 added support for limit
   *  surface patches for loop meshes. */
  static refinesToBoxSplineTrianglePatches(scheme: string): boolean {
    if (scheme === PxOsdOpenSubdivTokens.loop) {
      return true
    }
    return false
  }

  /** subdivision.cpp:736-757. Takes ownership of stencil tables and patch
   *  table. */
  setRefinementTables(
    vertexStencils: StencilTable | null,
    varyingStencils: StencilTable | null,
    faceVaryingStencils: (StencilTable | null)[],
    patchTable: PatchTable | null,
  ): void {
    this._vertexStencils = vertexStencils
    this._varyingStencils = varyingStencils

    this._faceVaryingStencils = faceVaryingStencils.slice()

    this._patchTable = patchTable

    this._maxNumFaceVarying = 0
    for (let i = 0; i < this._faceVaryingStencils.length; ++i) {
      this._maxNumFaceVarying = Math.max(this._maxNumFaceVarying, this.getNumFaceVarying(i))
    }
  }

  /** subdivision.cpp:319-339 */
  getStencilTable(
    interpolation: HdSt_MeshTopologyInterpolation, fvarChannel: number,
  ): StencilTable | null {
    if (interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_FACEVARYING) {
      if (!TF_VERIFY(fvarChannel >= 0)) {
        return null
      }

      if (!TF_VERIFY(fvarChannel < this._faceVaryingStencils.length)) {
        return null
      }
    }

    return (interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_VERTEX)
      ? this._vertexStencils
      : (interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_VARYING)
        ? this._varyingStencils
        : this._faceVaryingStencils[fvarChannel] ?? null
  }

  /** subdivision.h:131-133 */
  getPatchTable(): PatchTable | null {
    return this._patchTable
  }

  /** subdivision.cpp:341-374 */
  private _getGpuStencilTable(
    topology: HdSt_MeshTopology,
    osdTopology: HdBufferSource | null,
    registry: HdStResourceRegistry,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): HdSt_GpuStencilTable {
    if (interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_VERTEX) {
      if (!this._gpuVertexStencils) {
        this._gpuVertexStencils = this._createGpuStencilTable(
          osdTopology, registry, interpolation)
      }
      return this._gpuVertexStencils
    } else if (interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_VARYING) {
      if (!this._gpuVaryingStencils) {
        this._gpuVaryingStencils = this._createGpuStencilTable(
          osdTopology, registry, interpolation)
      }
      return this._gpuVaryingStencils
    } else {
      if (this._gpuFaceVaryingStencils.length === 0) {
        this._gpuFaceVaryingStencils = new Array<HdSt_GpuStencilTable | null>(
          topology.getFvarTopologies().length).fill(null)
      }
      if (!this._gpuFaceVaryingStencils[fvarChannel]) {
        this._gpuFaceVaryingStencils[fvarChannel] = this._createGpuStencilTable(
          osdTopology, registry, interpolation, fvarChannel)
      }
      return this._gpuFaceVaryingStencils[fvarChannel]!
    }
  }

  /** subdivision.cpp:376-430 */
  private _createGpuStencilTable(
    osdTopology: HdBufferSource | null,
    registry: HdStResourceRegistry,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): HdSt_GpuStencilTable {
    // Allocate buffer array range for perPoint data
    const perPointSpecs: HdBufferSpec[] = [
      { name: _tokens.sizes, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      { name: _tokens.offsets, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
    ]
    const perPointRange =
      registry.allocateSingleBufferArrayRange(
        _tokens.stencilData, perPointSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

    // Allocate buffer array range for perIndex data
    const perIndexSpecs: HdBufferSpec[] = [
      { name: _tokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      { name: _tokens.weights, tupleType: { type: HdType.HdTypeFloat, count: 1 } },
    ]
    const perIndexRange =
      registry.allocateSingleBufferArrayRange(
        _tokens.stencilData, perIndexSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

    const gpuStencilTable =
      new HdSt_GpuStencilTable(0, 0, perPointRange, perIndexRange)

    // Register buffer sources for computed perPoint stencil table data
    const perPointSources: HdBufferSource[] = [
      new HdSt_OsdStencilTableBufferSource(
        this, osdTopology, _tokens.sizes,
        gpuStencilTable, interpolation, fvarChannel),
      new HdSt_OsdStencilTableBufferSource(
        this, osdTopology, _tokens.offsets,
        gpuStencilTable, interpolation, fvarChannel),
    ]
    registry.addSources(perPointRange, perPointSources)

    // Register buffer sources for computed perIndex stencil table data
    const perIndexSources: HdBufferSource[] = [
      new HdSt_OsdStencilTableBufferSource(
        this, osdTopology, _tokens.indices,
        gpuStencilTable, interpolation, fvarChannel),
      new HdSt_OsdStencilTableBufferSource(
        this, osdTopology, _tokens.weights,
        gpuStencilTable, interpolation, fvarChannel),
    ]
    registry.addSources(perIndexRange, perIndexSources)

    return gpuStencilTable
  }
}

// ---------------------------------------------------------------------------

/** subdivision.cpp:196-245. This class isn't inherited from
 *  HdComputedBufferSource. GetData() returns the internal stencil table
 *  data to skip unecessary copy. */
class HdSt_OsdStencilTableBufferSource extends HdBufferSource {
  private readonly _subdivision: HdSt_Subdivision
  private readonly _osdTopology: HdBufferSource | null
  private readonly _name: string
  private readonly _gpuStencilTable: HdSt_GpuStencilTable
  private readonly _interpolation: HdSt_MeshTopologyInterpolation
  private readonly _fvarChannel: number
  private _resultData: ArrayBufferView = new Int32Array(0)
  private _resultNumElements = 0
  private _resultTupleType: HdTupleType = { type: HdType.HdTypeInt32, count: 0 }

  /** subdivision.cpp:247-264 */
  constructor(
    subdivision: HdSt_Subdivision,
    osdTopology: HdBufferSource | null,
    name: string,
    gpuStencilTable: HdSt_GpuStencilTable,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ) {
    super()
    this._subdivision = subdivision
    this._osdTopology = osdTopology
    this._name = name
    this._gpuStencilTable = gpuStencilTable
    this._interpolation = interpolation
    this._fvarChannel = fvarChannel
  }

  /** subdivision.cpp:266-305 */
  override resolve(): boolean {
    if (this._osdTopology && !this._osdTopology.isResolved()) return false

    if (!this._tryLock()) return false

    const stencilTable =
      this._subdivision.getStencilTable(this._interpolation, this._fvarChannel)
    if (!stencilTable) {
      this._setResolveError()
      return true
    }

    this._gpuStencilTable.numCoarsePoints = stencilTable.getNumControlVertices()
    this._gpuStencilTable.numRefinedPoints = stencilTable.getNumStencils()

    if (this._name === _tokens.sizes) {
      this._resultData = Int32Array.from(stencilTable.getSizes())
      this._resultNumElements = stencilTable.getSizes().length
      this._resultTupleType = { type: HdType.HdTypeInt32, count: 1 }
    } else if (this._name === _tokens.offsets) {
      this._resultData = Int32Array.from(stencilTable.getOffsets())
      this._resultNumElements = stencilTable.getOffsets().length
      this._resultTupleType = { type: HdType.HdTypeInt32, count: 1 }
    } else if (this._name === _tokens.indices) {
      this._resultData = Int32Array.from(stencilTable.getControlIndices())
      this._resultNumElements = stencilTable.getControlIndices().length
      this._resultTupleType = { type: HdType.HdTypeInt32, count: 1 }
    } else if (this._name === _tokens.weights) {
      // Note: weights table may have excess entries, so here we
      // copy only the entries corresponding to control indices.
      const n = stencilTable.getControlIndices().length
      this._resultData = Float32Array.from(stencilTable.getWeights().slice(0, n))
      this._resultNumElements = n
      this._resultTupleType = { type: HdType.HdTypeFloat, count: 1 }
    }

    this._setResolved()
    return true
  }

  /** subdivision.cpp:307-311 */
  override getBufferSpecs(): HdBufferSpec[] {
    // nothing
    return []
  }

  /** subdivision.h:216-218 */
  override getName(): string {
    return this._name
  }

  /** subdivision.h:219-221 */
  override computeHash(): bigint {
    return 0n
  }

  /** subdivision.h:222-224 */
  override getData(): ArrayBufferView {
    return this._resultData
  }

  /** subdivision.h:225-227 */
  override getTupleType(): HdTupleType {
    return this._resultTupleType
  }

  /** subdivision.h:228-230 */
  override getNumElements(): number {
    return this._resultNumElements
  }

  /** subdivision.cpp:313-317 */
  protected override _checkValid(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------

/** subdivision.h:160-196. OpenSubdiv CPU Refinement. This class isn't
 *  inherited from HdComputedBufferSource. GetData() returns the internal
 *  buffer to skip unecessary copy. */
export class HdSt_OsdRefineComputationCPU extends HdBufferSource {
  private readonly _topology: HdSt_MeshTopology
  private readonly _source: HdBufferSource
  private readonly _osdTopology: HdBufferSource | null
  private readonly _primvarBuffer: { data: Float32Array } = { data: new Float32Array(0) }
  private readonly _interpolation: HdSt_MeshTopologyInterpolation
  private readonly _fvarChannel: number

  /** subdivision.cpp:534-546 */
  constructor(
    topology: HdSt_MeshTopology,
    source: HdBufferSource,
    osdTopology: HdBufferSource | null,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ) {
    super()
    this._topology = topology
    this._source = source
    this._osdTopology = osdTopology
    this._interpolation = interpolation
    this._fvarChannel = fvarChannel
  }

  /** subdivision.cpp:550-554 */
  override getName(): string {
    return this._source.getName()
  }

  /** subdivision.cpp:556-567 (TfHashAppend appends the interpolation) */
  override computeHash(): bigint {
    return TfHashCombine(this.getInterpolation())
  }

  /** subdivision.cpp:569-573 */
  override getData(): ArrayBufferView {
    return this._primvarBuffer.data
  }

  /** subdivision.cpp:575-579 */
  override getTupleType(): HdTupleType {
    return this._source.getTupleType()
  }

  /** subdivision.cpp:581-588 */
  override getNumElements(): number {
    // Stride is measured here in components, not bytes.
    const elementStride = HdGetComponentCount(this._source.getTupleType().type)
    return Math.floor(this._primvarBuffer.data.length / elementStride)
  }

  /** subdivision.cpp:590-594 */
  getInterpolation(): HdSt_MeshTopologyInterpolation {
    return this._interpolation
  }

  /** subdivision.cpp:596-623 */
  override resolve(): boolean {
    if (this._source && !this._source.isResolved()) return false
    if (this._osdTopology && !this._osdTopology.isResolved()) return false

    if (!this._tryLock()) return false

    const subdivision = this._topology.getSubdivision()
    if (!TF_VERIFY(subdivision)) {
      this._setResolved()
      return true
    }

    // prepare cpu vertex buffer including refined vertices
    subdivision!.refineCPU(this._source,
      this._primvarBuffer,
      this._interpolation,
      this._fvarChannel)

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.subdivisionRefineCPU)

    this._setResolved()
    return true
  }

  /** subdivision.cpp:625-634 */
  protected override _checkValid(): boolean {
    let valid = this._source.isValid()

    // _osdTopology is optional
    valid = valid && (this._osdTopology ? this._osdTopology.isValid() : true)

    return valid
  }

  /** subdivision.cpp:636-641 */
  override getBufferSpecs(): HdBufferSpec[] {
    // produces same buffer specs as source
    return this._source.getBufferSpecs()
  }

  /** subdivision.cpp:643-647 */
  override hasPreChainedBuffer(): boolean {
    return true
  }

  /** subdivision.cpp:649-653 */
  override getPreChainedBuffer(): HdBufferSource | null {
    return this._source
  }
}

// ---------------------------------------------------------------------------

/** subdivision.h:198-227. OpenSubdiv GPU Refinement. */
export class HdSt_OsdRefineComputationGPU extends HdStComputation {
  private readonly _topology: HdSt_MeshTopology
  private readonly _primvarName: string
  private readonly _gpuStencilTable: HdSt_GpuStencilTable
  private readonly _interpolation: HdSt_MeshTopologyInterpolation

  /** subdivision.cpp:659-670 */
  constructor(
    topology: HdSt_MeshTopology,
    primvarName: string,
    _type: HdType,
    gpuStencilTable: HdSt_GpuStencilTable,
    interpolation: HdSt_MeshTopologyInterpolation,
  ) {
    super()
    this._topology = topology
    this._primvarName = primvarName
    this._gpuStencilTable = gpuStencilTable
    this._interpolation = interpolation
  }

  /** subdivision.cpp:674-681 */
  override getBufferSpecs(): HdBufferSpec[] {
    // nothing
    //
    // GPU subdivision requires the source data on GPU in prior to
    // execution, so no need to populate bufferspec on registration.
    return []
  }

  /** subdivision.cpp:683-702 */
  override Execute(range: HdBufferArrayRange | null, resourceRegistry: HdResourceRegistry): void {
    const subdivision = this._topology.getSubdivision()
    if (!TF_VERIFY(subdivision)) return

    const hdStResourceRegistry = resourceRegistry as unknown as HdStResourceRegistry

    subdivision!.refineGPU(range,
      this._primvarName,
      this._gpuStencilTable,
      hdStResourceRegistry)

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.subdivisionRefineGPU)
  }

  /** subdivision.cpp:704-717. Returns the total number of vertices,
   *  including coarse and refined ones. */
  override getNumOutputElements(): number {
    const subdivision = this._topology.getSubdivision()
    if (!TF_VERIFY(subdivision)) return 0
    if (this._interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_VERTEX) {
      return subdivision!.getNumVertices()
    } else if (this._interpolation === HdSt_MeshTopologyInterpolation.INTERPOLATE_VARYING) {
      return subdivision!.getNumVarying()
    } else {
      return subdivision!.getMaxNumFaceVarying()
    }
  }

  /** subdivision.cpp:719-723 */
  getInterpolation(): HdSt_MeshTopologyInterpolation {
    return this._interpolation
  }
}

// ---------------------------------------------------------------------------

/** subdivision.cpp:153-170 */
class HdSt_OsdTopologyComputation extends HdComputedBufferSource {
  private readonly _topology: HdSt_MeshTopology
  private readonly _id: SdfPath

  /** subdivision.cpp:973-979 */
  constructor(topology: HdSt_MeshTopology, id: SdfPath) {
    super()
    this._topology = topology
    this._id = id
  }

  /** subdivision.cpp:981-985 */
  override getBufferSpecs(): HdBufferSpec[] {
    // nothing
    return []
  }

  /** subdivision.cpp:987-1146 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    // do far analysis and set stencils and patch table into HdSt_Subdivision.

    if (!TF_VERIFY(this._topology)) {
      this._setResolved()
      return true
    }

    const subdivision = this._topology.getSubdivision()
    if (!TF_VERIFY(subdivision)) {
      this._setResolved()
      return true
    }

    // create topology refiner
    let refiner: TopologyRefiner | null = null

    // for empty topology, we don't need to refine anything.
    // but still need to return the typed buffer for codegen
    let numFvarChannels = 0
    if (this._topology.getFaceVertexCounts().length === 0) {
      // leave refiner empty
    } else {
      refiner = PxOsdRefinerFactory.create(this._topology.getPxOsdMeshTopology(),
        this._topology.getFvarTopologies(),
        TfToken(this._id.toString()))
      if (!refiner) {
        this._setResolveError()
        return true
      }
      numFvarChannels = refiner.getNumFVarChannels()
    }

    let vertexStencils: StencilTable | null = null
    let varyingStencils: StencilTable | null = null
    const faceVaryingStencils: (StencilTable | null)[] =
      new Array<StencilTable | null>(numFvarChannels).fill(null)
    let patchTable: PatchTable | null = null

    // refine topology and create stencil tables and patch table
    if (refiner) {
      const adaptive = subdivision!.isAdaptive()
      const level = subdivision!.getRefineLevel()

      const patchOptions = new PatchTableFactoryOptions(level)
      if (numFvarChannels > 0) {
        patchOptions.generateFVarTables = true
        patchOptions.includeFVarBaseLevelIndices = true
        patchOptions.generateFVarLegacyLinearPatches = !adaptive
      }
      if (adaptive) {
        // FAITHFULNESS-DEBT(hdst-osd-adaptive): subdivision.cpp:1046-1066
        // sets ENDCAP_BSPLINE_BASIS, useInfSharpPatch and
        // generateLegacySharpCornerPatches and calls
        // refiner->RefineAdaptive(patchOptions.GetRefineAdaptiveOptions());
        // the Far port has no adaptive refinement (packages/opensubdiv
        // PROVENANCE.md), so no tables are built.
        TF_CODING_ERROR(`Adaptive OpenSubdiv refinement is not available; <${this._id.toString()}> is not refined`)
        refiner = null
      } else {
        refiner.refineUniform({ refinementLevel: level })
      }
      if (refiner) {
        const options = new StencilTableFactoryOptions()
        options.generateOffsets = true
        options.generateIntermediateLevels = adaptive
        options.interpolationMode = StencilInterpolationMode.INTERPOLATE_VERTEX
        vertexStencils = StencilTableFactory.create(refiner, options)

        options.interpolationMode = StencilInterpolationMode.INTERPOLATE_VARYING
        varyingStencils = StencilTableFactory.create(refiner, options)

        options.interpolationMode = StencilInterpolationMode.INTERPOLATE_FACE_VARYING
        for (let i = 0; i < numFvarChannels; ++i) {
          options.fvarChannel = i
          faceVaryingStencils[i] = StencilTableFactory.create(refiner, options)
        }

        patchTable = PatchTableFactory.create(refiner, patchOptions)
      }
    }

    // merge local point stencils
    if (refiner && patchTable && patchTable.getLocalPointStencilTable()) {
      // append stencils
      const vertexStencilsWithLocalPoints =
        StencilTableFactory.AppendLocalPointStencilTable(
          refiner,
          vertexStencils,
          patchTable.getLocalPointStencilTable())
      if (vertexStencilsWithLocalPoints) {
        vertexStencils = vertexStencilsWithLocalPoints
      }
    }
    if (refiner && patchTable && patchTable.getLocalPointVaryingStencilTable()) {
      // append stencils
      const varyingStencilsWithLocalPoints =
        StencilTableFactory.appendLocalPointStencilTableVarying(
          refiner,
          varyingStencils,
          patchTable.getLocalPointVaryingStencilTable())
      if (varyingStencilsWithLocalPoints) {
        varyingStencils = varyingStencilsWithLocalPoints
      }
    }
    for (let i = 0; i < numFvarChannels; ++i) {
      if (refiner && patchTable && patchTable.getLocalPointFaceVaryingStencilTable(i)) {
        // append stencils
        const faceVaryingStencilsWithLocalPoints =
          StencilTableFactory.appendLocalPointStencilTableFaceVarying(
            refiner,
            faceVaryingStencils[i]!,
            patchTable.getLocalPointFaceVaryingStencilTable(i),
            i)
        if (faceVaryingStencilsWithLocalPoints) {
          faceVaryingStencils[i] = faceVaryingStencilsWithLocalPoints
        }
      }
    }

    // set tables to topology
    // HdSt_Subdivision takes an ownership of stencilTables and patchTable.
    subdivision!.setRefinementTables(vertexStencils,
      varyingStencils,
      faceVaryingStencils,
      patchTable)

    this._setResolved()
    return true
  }

  /** subdivision.cpp:1148-1152 */
  protected override _checkValid(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------

/** subdivision.cpp:94-98 */
interface BaseFaceInfo {
  baseFaceParam: number
  baseFaceEdgeIndices: [number, number]
}

/** subdivision.cpp:76-122. OpenSubdiv refined index buffer computation.
 *
 *  computes index buffer and primitiveParam
 *
 *  primitiveParam : refined quads to coarse faces mapping buffer
 *
 *  ----+-----------+-----------+------
 *  ... |i0 i1 i2 i3|i4 i5 i6 i7| ...    index buffer (for quads)
 *  ----+-----------+-----------+------
 *  ... |           |           | ...    primitive param[0] (coarse face index)
 *  ... |     p0    |     p1    | ...    primitive param[1] (patch param 0)
 *  ... |           |           | ...    primitive param[2] (patch param 1)
 *  ----+-----------+-----------+------ */
class HdSt_OsdIndexComputation extends HdComputedBufferSource {
  private readonly _topology: HdSt_MeshTopology
  private readonly _osdTopology: HdBufferSource | null
  private _primitiveBuffer: HdBufferSource | null = null
  private _edgeIndicesBuffer: HdBufferSource | null = null

  /** subdivision.cpp:1156-1162 */
  constructor(topology: HdSt_MeshTopology, osdTopology: HdBufferSource | null) {
    super()
    this._topology = topology
    this._osdTopology = osdTopology
  }

  /** subdivision.cpp:461-507 */
  override getBufferSpecs(): HdBufferSpec[] {
    const specs: HdBufferSpec[] = []
    if (this._topology.refinesToBSplinePatches()) {
      // bi-cubic bspline patches
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 16 } })
      // 3+1 (includes sharpness)
      specs.push({ name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32Vec4, count: 1 } })
      specs.push({ name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    } else if (this._topology.refinesToBoxSplineTrianglePatches()) {
      // quartic box spline triangle patches
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 12 } })
      // 3+1 (includes sharpness)
      specs.push({ name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32Vec4, count: 1 } })
      // int will suffice, but this unifies it for all the cases
      specs.push({ name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    } else if (HdSt_Subdivision.refinesToTriangles(this._topology.getScheme())) {
      // triangles (loop)
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32Vec3, count: 1 } })
      specs.push({ name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32Vec3, count: 1 } })
      // int will suffice, but this unifies it for all the cases
      specs.push({ name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    } else {
      // quads (catmark, bilinear)
      if (this._topology.triangulateQuads()) {
        specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 6 } })
      } else {
        specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 4 } })
      }
      specs.push({ name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32Vec3, count: 1 } })
      specs.push({ name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    }
    return specs
  }

  /** subdivision.cpp:509-514 */
  override hasChainedBuffer(): boolean {
    return true
  }

  /** subdivision.cpp:516-521 */
  override getChainedBuffers(): HdBufferSource[] {
    return [this._primitiveBuffer!, this._edgeIndicesBuffer!]
  }

  /** subdivision.cpp:523-528 */
  protected override _checkValid(): boolean {
    return true
  }

  /** subdivision.cpp:1164-1254 */
  override resolve(): boolean {
    if (this._osdTopology && !this._osdTopology.isResolved()) return false

    if (!this._tryLock()) return false

    const subdivision = this._topology.getSubdivision()
    if (!TF_VERIFY(subdivision)) {
      this._setResolved()
      return true
    }

    const patchTable = subdivision!.getPatchTable()

    let firstIndex: number[] = []
    let ptableSize = 0
    if (patchTable) {
      ptableSize = patchTable.getPatchControlVerticesTable().length
      if (ptableSize > 0) {
        firstIndex = patchTable.getPatchControlVerticesTable()
      }
    }

    const scheme = this._topology.getScheme()

    if (this._topology.refinesToBSplinePatches() ||
        this._topology.refinesToBoxSplineTrianglePatches()) {
      // Bundle groups of 12 or 16 patch control vertices.
      const arraySize = (ptableSize > 0)
        ? patchTable!.getPatchArrayDescriptor(0).getNumControlVertices()
        : 0

      const indices = Int32Array.from(firstIndex.slice(0, ptableSize))

      const patchIndices =
        new HdVtBufferSource(HdTokens.indices, _IntArrayValue('int', indices), arraySize)

      this._setResult(patchIndices)

      this._populatePatchPrimitiveBuffer(patchTable)
    } else if (HdSt_Subdivision.refinesToTriangles(scheme)) {
      // populate refined triangle indices.
      const numTris = Math.floor(ptableSize / 3)
      const indices = Int32Array.from(firstIndex.slice(0, numTris * 3))

      const triIndices =
        new HdVtBufferSource(HdTokens.indices, _IntArrayValue('GfVec3i', indices))
      this._setResult(triIndices)

      this._populateUniformPrimitiveBuffer(patchTable)
    } else {
      // populate refined quad indices.
      const numQuads = Math.floor(ptableSize / 4)

      const numIndicesPerQuad =
        this._topology.triangulateQuads()
          ? HdMeshTriQuadBuilder.NumIndicesPerTriQuad
          : HdMeshTriQuadBuilder.NumIndicesPerQuad
      const indices = new Int32Array(numQuads * numIndicesPerQuad)

      if (numIndicesPerQuad === 4) {
        indices.set(firstIndex.slice(0, ptableSize))
      } else {
        const outputIndices = new HdMeshTriQuadBuilder(indices, true)
        for (let i = 0; i < numQuads; ++i) {
          const quadIndices = new GfVec4i(firstIndex[i * 4]!, firstIndex[i * 4 + 1]!,
            firstIndex[i * 4 + 2]!, firstIndex[i * 4 + 3]!)
          outputIndices.emitQuadFace(quadIndices)
        }
      }

      // refined quads index buffer
      const quadIndices =
        new HdVtBufferSource(HdTokens.indices, _IntArrayValue('int', indices), numIndicesPerQuad)
      this._setResult(quadIndices)

      this._populateUniformPrimitiveBuffer(patchTable)
    }

    this._setResolved()
    return true
  }

  /** subdivision.cpp:1256-1321 */
  private _createBaseFaceMapping(result: BaseFaceInfo[]): void {
    const numVertsPtr = this._topology.getFaceVertexCounts()
    const numFaces = this._topology.getFaceVertexCounts().length
    const numVertIndices = this._topology.getFaceVertexIndices().length

    result.length = 0

    let regFaceSize = 4
    if (HdSt_Subdivision.refinesToTriangles(this._topology.getScheme())) {
      regFaceSize = 3
    }

    for (let i = 0, v = 0, ev = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!

      if (v + nv > numVertIndices) break

      if (nv === regFaceSize) {
        result.push({
          baseFaceParam: HdMeshUtil.encodeCoarseFaceParam(i, /*edgeFlag=*/0),
          baseFaceEdgeIndices: [ev, 0],
        })
      } else if (nv < 3) {
        const numBaseFaces = (regFaceSize === 4) ? nv : nv - 2
        for (let f = 0; f < numBaseFaces; ++f) {
          result.push({
            baseFaceParam: HdMeshUtil.encodeCoarseFaceParam(i, /*edgeFlag=*/0),
            baseFaceEdgeIndices: [-1, -1],
          })
        }
      } else {
        for (let j = 0; j < nv; ++j) {
          let edgeFlag = 0
          if (j === 0) {
            edgeFlag = 1
          } else if (j === nv - 1) {
            edgeFlag = 2
          } else {
            edgeFlag = 3
          }

          result.push({
            baseFaceParam: HdMeshUtil.encodeCoarseFaceParam(i, edgeFlag),
            baseFaceEdgeIndices: [ev + j, ev + (j + nv - 1) % nv],
          })
        }
      }

      v += nv
      ev += nv
    }
  }

  /** subdivision.cpp:1323-1363 */
  private _populateUniformPrimitiveBuffer(patchTable: PatchTable | null): void {
    const patchFaceToBaseFaceMapping: BaseFaceInfo[] = []
    this._createBaseFaceMapping(patchFaceToBaseFaceMapping)

    const numPatches = patchTable
      ? patchTable.getPatchParamTable().length
      : 0
    const primitiveParam = new Int32Array(numPatches * 3)
    const edgeIndices = new Int32Array(numPatches * 2)

    for (let i = 0; i < numPatches; ++i) {
      const patchParam = patchTable!.getPatchParamTable()[i]!

      const patchFaceIndex = patchParam.getFaceId()
      const info = patchFaceToBaseFaceMapping[patchFaceIndex]!

      primitiveParam[i * 3 + 0] = info.baseFaceParam
      primitiveParam[i * 3 + 1] = patchParam.field0 | 0
      primitiveParam[i * 3 + 2] = patchParam.field1 | 0

      edgeIndices[i * 2 + 0] = info.baseFaceEdgeIndices[0]
      edgeIndices[i * 2 + 1] = info.baseFaceEdgeIndices[1]
    }

    this._primitiveBuffer = new HdVtBufferSource(
      HdTokens.primitiveParam,
      _IntArrayValue('GfVec3i', primitiveParam))

    this._edgeIndicesBuffer = new HdVtBufferSource(
      HdTokens.edgeIndices,
      _IntArrayValue('GfVec2i', edgeIndices))
  }

  /** subdivision.cpp:1365-1414 */
  private _populatePatchPrimitiveBuffer(patchTable: PatchTable | null): void {
    const patchFaceToBaseFaceMapping: BaseFaceInfo[] = []
    this._createBaseFaceMapping(patchFaceToBaseFaceMapping)

    const numPatches = patchTable
      ? patchTable.getPatchParamTable().length
      : 0
    const primitiveParam = new Int32Array(numPatches * 4)
    const edgeIndices = new Int32Array(numPatches * 2)

    for (let i = 0; i < numPatches; ++i) {
      const patchParam = patchTable!.getPatchParamTable()[i]!

      let sharpness = 0.0
      if (i < patchTable!.getSharpnessIndexTable().length) {
        const sharpnessIndex = patchTable!.getSharpnessIndexTable()[i]!
        if (sharpnessIndex >= 0) {
          sharpness = patchTable!.getSharpnessValues()[sharpnessIndex]!
        }
      }

      const patchFaceIndex = patchParam.getFaceId()
      const info = patchFaceToBaseFaceMapping[patchFaceIndex]!

      primitiveParam[i * 4 + 0] = info.baseFaceParam
      primitiveParam[i * 4 + 1] = patchParam.field0 | 0
      primitiveParam[i * 4 + 2] = patchParam.field1 | 0

      const sharpnessAsInt = Math.trunc(sharpness)
      primitiveParam[i * 4 + 3] = sharpnessAsInt

      edgeIndices[i * 2 + 0] = info.baseFaceEdgeIndices[0]
      edgeIndices[i * 2 + 1] = info.baseFaceEdgeIndices[1]
    }
    this._primitiveBuffer = new HdVtBufferSource(
      HdTokens.primitiveParam,
      _IntArrayValue('GfVec4i', primitiveParam))

    this._edgeIndicesBuffer = new HdVtBufferSource(
      HdTokens.edgeIndices,
      _IntArrayValue('GfVec2i', edgeIndices))
  }
}

// ---------------------------------------------------------------------------

/** subdivision.cpp:124-151 */
class HdSt_OsdFvarIndexComputation extends HdComputedBufferSource {
  private readonly _topology: HdSt_MeshTopology
  private readonly _osdTopology: HdBufferSource | null
  private _fvarPatchParamBuffer: HdBufferSource | null = null
  private readonly _channel: number
  private readonly _indicesName: string
  private readonly _patchParamName: string

  /** subdivision.cpp:1418-1430 */
  constructor(topology: HdSt_MeshTopology, osdTopology: HdBufferSource | null, channel: number) {
    super()
    this._topology = topology
    this._osdTopology = osdTopology
    this._channel = channel
    this._indicesName = TfToken(HdStTokens.fvarIndices + String(this._channel))
    this._patchParamName = TfToken(HdStTokens.fvarPatchParam + String(this._channel))
  }

  /** subdivision.cpp:1432-1496 */
  override resolve(): boolean {
    if (this._osdTopology && !this._osdTopology.isResolved()) return false

    if (!this._tryLock()) return false

    const subdivision = this._topology.getSubdivision()
    if (!TF_VERIFY(subdivision)) {
      this._setResolved()
      return true
    }

    const patchTable = subdivision!.getPatchTable()
    const numPatches = patchTable ? patchTable.getNumPatchesTotal() : 0

    const fvarIndices = subdivision!.getRefinedFvarIndices(this._channel)

    const scheme = this._topology.getScheme()

    if (this._topology.refinesToBSplinePatches() ||
        this._topology.refinesToBoxSplineTrianglePatches()) {
      // Bundle groups of 12 or 16 patch control vertices
      const arraySize = (numPatches > 0)
        ? patchTable!.getFVarPatchDescriptor(this._channel).getNumControlVertices()
        : 0

      const indices = new Int32Array(arraySize * numPatches)
      indices.set(fvarIndices.slice(0, arraySize * numPatches))

      const patchIndices =
        new HdVtBufferSource(this._indicesName, _IntArrayValue('int', indices), arraySize)

      this._setResult(patchIndices)
      this._populateFvarPatchParamBuffer(patchTable)
    } else if (HdSt_Subdivision.refinesToTriangles(scheme)) {
      // populate refined triangle indices.
      const indices = new Int32Array(3 * numPatches)
      indices.set(fvarIndices.slice(0, 3 * numPatches))

      const triIndices =
        new HdVtBufferSource(this._indicesName, _IntArrayValue('GfVec3i', indices))
      this._setResult(triIndices)
    } else {
      // populate refined quad indices.
      const indices = new Int32Array(4 * numPatches)
      indices.set(fvarIndices.slice(0, 4 * numPatches))

      const quadIndices =
        new HdVtBufferSource(this._indicesName, _IntArrayValue('GfVec4i', indices))
      this._setResult(quadIndices)
    }

    this._setResolved()
    return true
  }

  /** subdivision.cpp:1498-1522 */
  private _populateFvarPatchParamBuffer(patchTable: PatchTable | null): void {
    let fvarPatchParam = new Int32Array(0)

    if (patchTable) {
      const patchParamArray = patchTable.getFVarPatchParams(this._channel)
      const numPatches = patchParamArray.length
      fvarPatchParam = new Int32Array(numPatches * 2)

      for (let i = 0; i < numPatches; ++i) {
        const patchParam = patchParamArray[i]!
        fvarPatchParam[i * 2 + 0] = patchParam.field0 | 0
        fvarPatchParam[i * 2 + 1] = patchParam.field1 | 0
      }
    }

    this._fvarPatchParamBuffer = new HdVtBufferSource(
      this._patchParamName, _IntArrayValue('GfVec2i', fvarPatchParam))
  }

  /** subdivision.cpp:1524-1542 */
  override getBufferSpecs(): HdBufferSpec[] {
    const specs: HdBufferSpec[] = []
    if (this._topology.refinesToBSplinePatches()) {
      // bi-cubic bspline patches
      specs.push({ name: this._indicesName, tupleType: { type: HdType.HdTypeInt32, count: 16 } })
      specs.push({ name: this._patchParamName, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    } else if (this._topology.refinesToBoxSplineTrianglePatches()) {
      // quartic box spline triangle patches
      specs.push({ name: this._indicesName, tupleType: { type: HdType.HdTypeInt32, count: 12 } })
      specs.push({ name: this._patchParamName, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    } else if (HdSt_Subdivision.refinesToTriangles(this._topology.getScheme())) {
      // triangles (loop)
      specs.push({ name: this._indicesName, tupleType: { type: HdType.HdTypeInt32Vec3, count: 1 } })
    } else {
      // quads (catmark, bilinear)
      specs.push({ name: this._indicesName, tupleType: { type: HdType.HdTypeInt32Vec4, count: 1 } })
    }
    return specs
  }

  /** subdivision.cpp:1544-1549 */
  override hasChainedBuffer(): boolean {
    return (this._topology.refinesToBSplinePatches() ||
            this._topology.refinesToBoxSplineTrianglePatches())
  }

  /** subdivision.cpp:1551-1560 */
  override getChainedBuffers(): HdBufferSource[] {
    if (this._topology.refinesToBSplinePatches() ||
        this._topology.refinesToBoxSplineTrianglePatches()) {
      return [this._fvarPatchParamBuffer!]
    } else {
      return []
    }
  }

  /** subdivision.cpp:1562-1565 */
  protected override _checkValid(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------

/** subdivision.cpp:172-194 */
class HdSt_OsdBaseFaceToRefinedFacesMapComputation extends HdComputedBufferSource {
  private readonly _subdivision: HdSt_Subdivision
  private readonly _osdTopology: HdBufferSource | null
  private _refinedFaceCounts: HdBufferSource | null = null

  /** subdivision.cpp:1569-1574 */
  constructor(subdivision: HdSt_Subdivision, osdTopology: HdBufferSource | null) {
    super()
    this._subdivision = subdivision
    this._osdTopology = osdTopology
  }

  /** subdivision.cpp:1576-1583 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [
      { name: _tokens.baseFaceToRefinedFacesMap, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      { name: _tokens.refinedFaceCounts, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
    ]
  }

  /** subdivision.cpp:1585-1635 */
  override resolve(): boolean {
    if (this._osdTopology && !this._osdTopology.isResolved()) return false

    if (!this._tryLock()) return false

    if (!TF_VERIFY(this._subdivision)) {
      this._setResolved()
      return true
    }

    const patchTable = this._subdivision.getPatchTable()
    const numPatches = patchTable
      ? patchTable.getPatchParamTable().length : 0
    const numBaseFaces = patchTable
      ? patchTable.getNumPtexFaces() : 0

    const baseFaceToRefinedFacesMap: number[][] =
      Array.from({ length: numBaseFaces }, () => [])

    for (let i = 0; i < numPatches; ++i) {
      const patchParam = patchTable!.getPatchParamTable()[i]!
      baseFaceToRefinedFacesMap[patchParam.getFaceId()]!.push(i)
    }

    const baseFaceToRefinedFacesArr: number[] = []
    const refinedFaceCounts = new Int32Array(numBaseFaces)
    let currRefinedFaceCount = 0

    for (let i = 0; i < numBaseFaces; ++i) {
      const refinedFaces = baseFaceToRefinedFacesMap[i]!
      currRefinedFaceCount += refinedFaces.length

      for (let j = 0; j < refinedFaces.length; ++j) {
        baseFaceToRefinedFacesArr.push(refinedFaces[j]!)
      }
      refinedFaceCounts[i] = currRefinedFaceCount
    }

    const source = new HdVtBufferSource(
      _tokens.baseFaceToRefinedFacesMap,
      _IntArrayValue('int', Int32Array.from(baseFaceToRefinedFacesArr)))
    this._setResult(source)

    this._refinedFaceCounts = new HdVtBufferSource(
      _tokens.refinedFaceCounts, _IntArrayValue('int', refinedFaceCounts))

    this._setResolved()
    return true
  }

  /** subdivision.cpp:1637-1641 */
  override hasChainedBuffer(): boolean {
    return true
  }

  /** subdivision.cpp:1643-1647 */
  override getChainedBuffers(): HdBufferSource[] {
    return [this._refinedFaceCounts!]
  }

  /** subdivision.cpp:1649-1653 */
  protected override _checkValid(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------

/** subdivision.cpp:1659-1695 */
function _EvalStencilsCPU(
  primvarBuffer: Float32Array,
  elementStride: number,
  numCoarsePoints: number,
  numRefinedPoints: number,
  sizes: readonly number[],
  offsets: readonly number[],
  indices: readonly number[],
  weights: readonly number[],
): void {
  const numElements = elementStride
  // float accumulation, as upstream's std::vector<float> dst
  const dst = new Float32Array(numElements)

  for (let pointIndex = 0; pointIndex < numRefinedPoints; ++pointIndex) {
    for (let element = 0; element < numElements; ++element) {
      dst[element] = 0
    }

    const stencilSize = sizes[pointIndex]!
    const stencilOffset = offsets[pointIndex]!

    for (let stencil = 0; stencil < stencilSize; ++stencil) {
      const index = indices[stencil + stencilOffset]!
      const weight = Math.fround(weights[stencil + stencilOffset]!)
      const srcIndex = index * elementStride
      for (let element = 0; element < numElements; ++element) {
        dst[element] = dst[element]! + Math.fround(weight * primvarBuffer[srcIndex + element]!)
      }
    }

    const dstIndex = (pointIndex + numCoarsePoints) * elementStride
    for (let element = 0; element < numElements; ++element) {
      primvarBuffer[dstIndex + element] = dst[element]!
    }
  }
}

// subdivision.cpp:1697-1704
const BufferBinding_Uniforms = 0
const BufferBinding_Sizes = 1
const BufferBinding_Offsets = 2
const BufferBinding_Indices = 3
const BufferBinding_Weights = 4
const BufferBinding_Primvar = 5

/** subdivision.cpp:1706-1776 */
function _CreateResourceBindings(
  hgi: Hgi,
  sizes: HgiBufferHandle,
  offsets: HgiBufferHandle,
  indices: HgiBufferHandle,
  weights: HgiBufferHandle,
  primvar: HgiBufferHandle,
): HgiResourceBindingsHandle {
  // Begin the resource set
  const resourceDesc = new HgiResourceBindingsDesc()
  resourceDesc.debugName = 'EvalStencils'

  const bind = (handle: HgiBufferHandle, bindingIndex: number, writable: boolean): void => {
    const bufBind = new HgiBufferBindDesc()
    bufBind.bindingIndex = bindingIndex
    bufBind.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
    bufBind.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    bufBind.writable = writable
    bufBind.offsets.push(0)
    bufBind.buffers.push(handle)
    resourceDesc.buffers.push(bufBind)
  }

  if (sizes.isSet()) bind(sizes, BufferBinding_Sizes, false)
  if (offsets.isSet()) bind(offsets, BufferBinding_Offsets, false)
  if (indices.isSet()) bind(indices, BufferBinding_Indices, false)
  if (weights.isSet()) bind(weights, BufferBinding_Weights, false)
  if (primvar.isSet()) bind(primvar, BufferBinding_Primvar, true)

  return hgi.createResourceBindings(resourceDesc)
}

/** subdivision.cpp:1778-1790 */
function _CreatePipeline(
  hgi: Hgi,
  constantValuesSize: number,
  program: HgiShaderProgramHandle,
): HgiComputePipelineHandle {
  const desc = new HgiComputePipelineDesc()
  desc.debugName = 'EvalStencils'
  desc.shaderProgram = program
  desc.shaderConstantsDesc.byteSize = constantValuesSize
  return hgi.CreateComputePipeline(desc)
}

/** subdivision.cpp:1792-1974 */
function _EvalStencilsGPU(
  primvarRange_: HdBufferArrayRange | null,
  primvarName: string,
  numCoarsePoints: number,
  numRefinedPoints: number,
  perPointRange_: HdBufferArrayRange | null,
  perIndexRange_: HdBufferArrayRange | null,
  resourceRegistry: HdStResourceRegistry,
): void {
  // select shader by datatype
  const shaderToken = TfToken(_tokens.evalStencils)
  if (!TF_VERIFY(shaderToken.length > 0)) return

  const primvarRange = primvarRange_ as HdStBufferArrayRange

  const primvar = primvarRange.getResource(primvarName)
  if (!primvar) return
  const elementOffset = primvarRange.getElementOffset()
  const elementStride = HdGetComponentCount(primvar.getTupleType().type)

  // struct Uniform { int pointIndexStart; int pointIndexEnd; int srcBase;
  //   int srcStride; int dstBase; int dstStride; int sizesBase;
  //   int offsetsBase; int indicesBase; int weightsBase; }
  const uniform = new Int32Array(10)

  const hdStResourceRegistry = resourceRegistry
  const defines = `#define EVAL_STENCILS_NUM_ELEMENTS ${elementStride}\n`
  const computeProgram = HdStGLSLProgram.getComputeProgram(shaderToken,
    defines,
    hdStResourceRegistry,
    (computeDesc: HgiShaderFunctionDesc) => {
      computeDesc.debugName = shaderToken
      computeDesc.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
      computeDesc.computeDescriptor.localSize = new GfVec3i(64, 1, 1)

      HgiShaderFunctionAddBuffer(computeDesc,
        'sizes', HdStTokens._int,
        BufferBinding_Sizes, HgiBindingType.HgiBindingTypePointer)
      HgiShaderFunctionAddBuffer(computeDesc,
        'offsets', HdStTokens._int,
        BufferBinding_Offsets, HgiBindingType.HgiBindingTypePointer)
      HgiShaderFunctionAddBuffer(computeDesc,
        'indices', HdStTokens._int,
        BufferBinding_Indices, HgiBindingType.HgiBindingTypePointer)
      HgiShaderFunctionAddBuffer(computeDesc,
        'weights', HdStTokens._float,
        BufferBinding_Weights, HgiBindingType.HgiBindingTypePointer)
      HgiShaderFunctionAddWritableBuffer(computeDesc,
        'primvar', HdStTokens._float,
        BufferBinding_Primvar)

      const params = [
        'pointIndexStart',
        'pointIndexEnd',
        'srcBase',
        'srcStride',
        'dstBase',
        'dstStride',
        'sizesBase',
        'offsetsBase',
        'indicesBase',
        'weightsBase',
      ]
      for (const param of params) {
        HgiShaderFunctionAddConstantParam(
          computeDesc, param, HdStTokens._int)
      }
      HgiShaderFunctionAddStageInput(
        computeDesc, 'hd_GlobalInvocationID', 'uvec3',
        HgiShaderKeywordTokens.hdGlobalInvocationID)
    })

  if (!computeProgram) return

  const perPointRange = perPointRange_ as HdStBufferArrayRange
  const perIndexRange = perIndexRange_ as HdStBufferArrayRange

  // prepare uniform buffer for GPU computation
  uniform[0] = 0                     // pointIndexStart
  uniform[1] = numRefinedPoints      // pointIndexEnd
  const numPoints = uniform[1] - uniform[0]

  uniform[2] = elementOffset         // srcBase
  uniform[3] = elementStride         // srcStride

  uniform[4] = elementOffset + numCoarsePoints // dstBase
  uniform[5] = elementStride         // dstStride

  uniform[6] = perPointRange.getElementOffset() // sizesBase
  uniform[7] = perPointRange.getElementOffset() // offsetsBase
  uniform[8] = perIndexRange.getElementOffset() // indicesBase
  uniform[9] = perIndexRange.getElementOffset() // weightsBase

  // buffer resources for GPU computation
  const sizes = perPointRange.getResource(_tokens.sizes)
  const offsets = perPointRange.getResource(_tokens.offsets)
  const indices = perIndexRange.getResource(_tokens.indices)
  const weights = perIndexRange.getResource(_tokens.weights)
  if (!sizes || !offsets || !indices || !weights) return

  const hgi = hdStResourceRegistry.getHgi()

  // Generate hash for resource bindings and pipeline.
  // XXX Needs fingerprint hash to avoid collisions
  const rbHash = TfHashCombine(
    BigInt(sizes.getHandle().getId()),
    BigInt(offsets.getHandle().getId()),
    BigInt(indices.getHandle().getId()),
    BigInt(weights.getHandle().getId()),
    BigInt(primvar.getHandle().getId()))

  const pHash = TfHashCombine(
    BigInt(computeProgram.getProgram().getId()),
    BigInt(uniform.byteLength))

  // Get or add resource bindings in registry.
  const resourceBindingsInstance =
    hdStResourceRegistry.registerResourceBindings(rbHash)
  if (resourceBindingsInstance.isFirstInstance()) {
    const rb = _CreateResourceBindings(hgi,
      sizes.getHandle(),
      offsets.getHandle(),
      indices.getHandle(),
      weights.getHandle(),
      primvar.getHandle())
    resourceBindingsInstance.setValue(rb)
  }

  const resourceBindings = resourceBindingsInstance.GetValue()!

  // Get or add pipeline in registry.
  const computePipelineInstance =
    hdStResourceRegistry.registerComputePipeline(pHash)
  if (computePipelineInstance.isFirstInstance()) {
    const pipe = _CreatePipeline(
      hgi, uniform.byteLength, computeProgram.getProgram())
    computePipelineInstance.setValue(pipe)
  }

  const pipeline = computePipelineInstance.GetValue()!

  const computeCmds = hdStResourceRegistry.getGlobalComputeCmds()
  computeCmds.pushDebugGroup('EvalStencils Cmds')
  computeCmds.bindResources(resourceBindings)
  computeCmds.bindPipeline(pipeline)

  // transfer uniform buffer
  computeCmds.setConstantValues(
    pipeline, BufferBinding_Uniforms, uniform.byteLength, uniform)

  // dispatch compute kernel
  computeCmds.Dispatch(numPoints, 1)

  // submit the work
  computeCmds.popDebugGroup()
}
