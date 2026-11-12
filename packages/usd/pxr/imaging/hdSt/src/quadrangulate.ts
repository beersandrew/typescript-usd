// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/quadrangulate.cpp,
//  pxr/imaging/hdSt/quadrangulate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/quadrangulate.{h,cpp} (OpenUSD 26.11.1).
//
// Computation classes for quadrangulation (quadrangulate.h:24-90):
//
//  *CPU quadrangulation
//
//   (buffersource)
//    QuadIndexBuilderComputation  (quad indices)
//     |
//     +--QuadrangulateComputation (primvar quadrangulation)
//
//    note: QuadrangulateComputation also copies the original primvars.
//          no need to transfer the original primvars to GPU separately.
//
//  *GPU quadrangulation
//
//   (buffersource)
//    QuadIndexBuilderComputation  (quad indices)
//     |
//     +--QuadrangulateTableComputation  (quadrangulate table on GPU)
//
//   (computation)
//    QuadrangulateComputationGPU  (primvar quadrangulation)
//
//    note: QuadrangulateComputationGPU just fills quadrangulated primvars.
//          the original primvars has to be transfered before the computation.
//
//  *Computation dependencies
//
//   Topology ---> QuadInfo --->  QuadIndices
//                          --->  QuadrangulateComputation(CPU)
//                          --->  QuadrangulateTable --->
//                          ----------------------------> QuadrangulateComputationGPU
//
// Deliberate divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - The `Uniform` struct is an Int32Array of its eight int fields.
// - The pipeline hash combines the shader program handle's id where
//   upstream combines the program pointer (quadrangulate.cpp:598-600); the
//   hash is only a registry cache key.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import {
  Array as VtArray,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import { Vec3i as GfVec3i, type Vec2i as GfVec2i } from 'typescript-usd/gf'
import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import {
  ComputedBufferSource as HdComputedBufferSource,
  NullBufferSource as HdNullBufferSource,
  VtBufferSource as HdVtBufferSource,
  MeshUtil as HdMeshUtil,
  QuadInfo as HdQuadInfo,
  Tokens as HdTokens,
  PerfTokens as HdPerfTokens,
  PerfLog as HdPerfLog,
  Type as HdType,
  GetComponentType as HdGetComponentType,
  GetComponentCount as HdGetComponentCount,
  DataSizeOfType as HdDataSizeOfType,
  type BufferSource as HdBufferSource,
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
import { HdStComputation } from './computation.ts'
import { HdStGLSLProgram } from './glslProgram.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import type { HdSt_MeshTopology } from './meshTopology.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStGLSLProgramTokens, HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

// quadrangulate.cpp:39-43
const BufferBinding_Uniforms = 0
const BufferBinding_Primvar = 1
const BufferBinding_Quadinfo = 2

/** quadrangulate.cpp:45-79 */
function _CreateResourceBindings(
  hgi: Hgi,
  primvar: HgiBufferHandle,
  quadrangulateTable: HgiBufferHandle,
): HgiResourceBindingsHandle {
  // Begin the resource set
  const resourceDesc = new HgiResourceBindingsDesc()
  resourceDesc.debugName = 'Quadrangulate'

  if (primvar.isSet()) {
    const bufBind0 = new HgiBufferBindDesc()
    bufBind0.bindingIndex = BufferBinding_Primvar
    bufBind0.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
    bufBind0.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    bufBind0.writable = true
    bufBind0.offsets.push(0)
    bufBind0.buffers.push(primvar)
    resourceDesc.buffers.push(bufBind0)
  }

  if (quadrangulateTable.isSet()) {
    const bufBind1 = new HgiBufferBindDesc()
    bufBind1.bindingIndex = BufferBinding_Quadinfo
    bufBind1.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
    bufBind1.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    bufBind1.writable = true
    bufBind1.offsets.push(0)
    bufBind1.buffers.push(quadrangulateTable)
    resourceDesc.buffers.push(bufBind1)
  }

  return hgi.createResourceBindings(resourceDesc)
}

/** quadrangulate.cpp:81-93 */
function _CreatePipeline(
  hgi: Hgi,
  constantValuesSize: number,
  program: HgiShaderProgramHandle,
): HgiComputePipelineHandle {
  const desc = new HgiComputePipelineDesc()
  desc.debugName = 'Quadrangulate'
  desc.shaderProgram = program
  desc.shaderConstantsDesc.byteSize = constantValuesSize
  return hgi.CreateComputePipeline(desc)
}

/** quadrangulate.h:92-104. Quad info computation. */
export class HdSt_QuadInfoBuilderComputation extends HdNullBufferSource {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology

  /** quadrangulate.cpp:97-101 */
  constructor(topology: HdSt_MeshTopology, id: SdfPath) {
    super()
    this._id = id
    this._topology = topology
  }

  /** quadrangulate.cpp:103-118 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    const quadInfo = new HdQuadInfo()
    const meshUtil = new HdMeshUtil(this._topology, this._id)
    meshUtil.computeQuadInfo(quadInfo)

    // Set quadinfo to topology
    // topology takes ownership of quadinfo so no need to free.
    this._topology.setQuadInfo(quadInfo)

    this._setResolved()
    return true
  }

  /** quadrangulate.cpp:120-124 */
  protected override _checkValid(): boolean {
    return true
  }
}

/** quadrangulate.h:106-141. Quad indices computation CPU.
 *
 *  Index quadrangulation generates a mapping from triangle ID to authored
 *  face index domain, called primitiveParams:
 *  ----+-----------+-----------+------
 *  ... |i0 i1 i2 i3|i4 i5 i6 i7| ...    index buffer (for quads)
 *  ----+-----------+-----------+------
 *  ... |     m0    |     m1    | ...    primitive param buffer
 *  ----+-----------+-----------+------
 */
export class HdSt_QuadIndexBuilderComputation extends HdComputedBufferSource {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology
  private readonly _quadInfoBuilder: HdSt_QuadInfoBuilderComputation | null
  private _primitiveParam: HdBufferSource | null = null
  private _quadsEdgeIndices: HdBufferSource | null = null

  /** quadrangulate.cpp:128-134 */
  constructor(
    topology: HdSt_MeshTopology,
    quadInfoBuilder: HdSt_QuadInfoBuilderComputation | null,
    id: SdfPath,
  ) {
    super()
    this._id = id
    this._topology = topology
    this._quadInfoBuilder = quadInfoBuilder
  }

  /** quadrangulate.cpp:136-153 */
  override getBufferSpecs(): HdBufferSpec[] {
    const specs: HdBufferSpec[] = []
    if (this._topology.triangulateQuads()) {
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 6 } })
    } else {
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 4 } })
    }
    // coarse-quads uses int2 as primitive param.
    specs.push({ name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32, count: 1 } })
    // 2 edge indices per quad
    specs.push({ name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    return specs
  }

  /** quadrangulate.cpp:155-200 */
  override resolve(): boolean {
    // quadInfoBuilder may or may not exists, depending on how we switched
    // the repr of the mesh. If it exists, we have to wait.
    if (this._quadInfoBuilder && !this._quadInfoBuilder.isResolved()) return false

    if (!this._tryLock()) return false

    // generate quad index buffer
    const quadsFaceVertexIndices = { value: null as unknown as VtArray<number> }
    const primitiveParam = { value: null as unknown as VtArray<number> }
    const quadsEdgeIndices = { value: null as unknown as VtArray<GfVec2i> }
    const meshUtil = new HdMeshUtil(this._topology, this._id)
    if (this._topology.triangulateQuads()) {
      meshUtil.computeTriQuadIndices(
        quadsFaceVertexIndices,
        primitiveParam,
        quadsEdgeIndices)
    } else {
      meshUtil.computeQuadIndices(
        quadsFaceVertexIndices,
        primitiveParam,
        quadsEdgeIndices)
    }

    if (this._topology.triangulateQuads()) {
      this._setResult(new HdVtBufferSource(HdTokens.indices,
        VtValue.createArray(quadsFaceVertexIndices.value), 6))
    } else {
      this._setResult(new HdVtBufferSource(HdTokens.indices,
        VtValue.createArray(quadsFaceVertexIndices.value), 4))
    }

    this._primitiveParam = new HdVtBufferSource(HdTokens.primitiveParam,
      VtValue.createArray(primitiveParam.value))

    this._quadsEdgeIndices = new HdVtBufferSource(HdTokens.edgeIndices,
      VtValue.createArray(quadsEdgeIndices.value))

    this._setResolved()
    return true
  }

  /** quadrangulate.cpp:202-206 */
  override hasChainedBuffer(): boolean {
    return true
  }

  /** quadrangulate.cpp:208-212 */
  override getChainedBuffers(): HdBufferSource[] {
    return [this._primitiveParam!, this._quadsEdgeIndices!]
  }

  /** quadrangulate.cpp:214-218 */
  protected override _checkValid(): boolean {
    return true
  }
}

/** quadrangulate.h:143-160. Quadrangulate table computation (for GPU
 *  quadrangulation). */
export class HdSt_QuadrangulateTableComputation extends HdComputedBufferSource {
  private readonly _topology: HdSt_MeshTopology
  private readonly _quadInfoBuilder: HdBufferSource | null

  /** quadrangulate.cpp:223-227 */
  constructor(topology: HdSt_MeshTopology, quadInfoBuilder: HdBufferSource | null) {
    super()
    this._topology = topology
    this._quadInfoBuilder = quadInfoBuilder
  }

  /** quadrangulate.cpp:229-290 */
  override resolve(): boolean {
    if (!TF_VERIFY(this._quadInfoBuilder)) return false
    if (!this._quadInfoBuilder!.isResolved()) return false
    if (!this._tryLock()) return false

    const quadInfo = this._topology.getQuadInfo()
    if (!quadInfo) {
      TF_CODING_ERROR('QuadInfo is null.')
      return true
    }

    // transfer quadrangulation table to GPU
    // for the same reason as cpu quadrangulation, we need a check
    // of IsAllQuads here.
    // see the comment on HdSt_MeshTopology::Quadrangulate()
    if (!quadInfo.isAllQuads()) {
      const quadInfoStride = quadInfo.maxNumVert + 2
      const numNonQuads = quadInfo.numVerts.length

      // create a buffer source for gpu quadinfo table
      const array = new Int32Array(quadInfoStride * numNonQuads)

      let index = 0, vertIndex = 0, dstOffset = quadInfo.pointsOffset
      for (let i = 0; i < numNonQuads; ++i) {
        // GPU quadinfo table layout
        //
        // struct NonQuad {
        //     int numVert;
        //     int dstOffset;
        //     int index[maxNumVert];
        // } [numNonQuads]
        //
        const numVert = quadInfo.numVerts[i]!
        array[index] = numVert
        array[index + 1] = dstOffset
        for (let j = 0; j < numVert; ++j) {
          array[index + j + 2] = quadInfo.verts[vertIndex++]!
        }
        index += quadInfoStride
        dstOffset += numVert + 1 // edge + center
      }

      // sanity check for number of points
      TF_VERIFY(dstOffset ===
        quadInfo.pointsOffset +
        quadInfo.numAdditionalPoints)

      // GPU quadrangulate table
      const table = new HdVtBufferSource(
        HdTokens.quadInfo,
        VtValue.createArray(VtArray._adopt<number>(VtValueTypes.int, array)))

      this._setResult(table)
    } else {
      this._topology.clearQuadrangulateTableRange()
    }
    this._setResolved()
    return true
  }

  /** quadrangulate.cpp:292-298 */
  override getBufferSpecs(): HdBufferSpec[] {
    // quadinfo computation produces an index buffer for quads.
    return [{ name: HdTokens.quadInfo, tupleType: { type: HdType.HdTypeInt32, count: 1 } }]
  }

  /** quadrangulate.cpp:300-304 */
  protected override _checkValid(): boolean {
    return true
  }
}

/** quadrangulate.h:162-189. CPU quadrangulation. */
export class HdSt_QuadrangulateComputation extends HdComputedBufferSource {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology
  private readonly _source: HdBufferSource
  private readonly _quadInfoBuilder: HdBufferSource | null

  /** quadrangulate.cpp:308-316 */
  constructor(
    topology: HdSt_MeshTopology,
    source: HdBufferSource,
    quadInfoBuilder: HdBufferSource | null,
    id: SdfPath,
  ) {
    super()
    this._id = id
    this._topology = topology
    this._source = source
    this._quadInfoBuilder = quadInfoBuilder
  }

  /** quadrangulate.cpp:318-366 */
  override resolve(): boolean {
    if (!TF_VERIFY(this._source)) return false
    if (!this._source.isResolved()) return false
    if (this._quadInfoBuilder && !this._quadInfoBuilder.isResolved()) return false

    if (!this._tryLock()) return false

    const perfLog = HdPerfLog.GetInstance()
    perfLog.incrementCounter(HdPerfTokens.quadrangulateCPU)

    const quadInfo = this._topology.getQuadInfo()
    if (!TF_VERIFY(quadInfo)) return true

    // If the topology is all quads, just return source.
    // This check is needed since if the topology changes, we don't know
    // whether the topology is all-quads or not until the quadinfo computation
    // is resolved. So we conservatively register primvar quadrangulations
    // on that case, it hits this condition. Once quadinfo resolved on the
    // topology, HdSt_MeshTopology::GetQuadrangulateComputation returns null
    // and nobody calls this function for all-quads prims.
    if (quadInfo!.isAllQuads()) {
      this._setResult(this._source)
      this._setResolved()
      return true
    }

    const result: { value: VtValue } = { value: VtValue.getEmpty() }
    const meshUtil = new HdMeshUtil(this._topology, this._id)
    if (meshUtil.computeQuadrangulatedPrimvar(quadInfo!,
      this._source.getData(),
      this._source.getNumElements(),
      this._source.getTupleType().type,
      result)) {
      perfLog.addCounter(HdPerfTokens.quadrangulatedVerts,
        quadInfo!.numAdditionalPoints)

      this._setResult(new HdVtBufferSource(
        this._source.getName(),
        result.value))
    } else {
      this._setResult(this._source)
    }

    this._setResolved()
    return true
  }

  /** quadrangulate.cpp:368-373 */
  override getBufferSpecs(): HdBufferSpec[] {
    // produces same spec buffer as source
    return this._source.getBufferSpecs()
  }

  /** quadrangulate.cpp:375-379 */
  override getTupleType(): HdTupleType {
    return this._source.getTupleType()
  }

  /** quadrangulate.cpp:381-385 */
  protected override _checkValid(): boolean {
    return this._source.isValid()
  }

  /** quadrangulate.cpp:387-391 */
  override hasPreChainedBuffer(): boolean {
    return true
  }

  /** quadrangulate.cpp:393-397 */
  override getPreChainedBuffer(): HdBufferSource | null {
    return this._source
  }
}

/** quadrangulate.h:191-210. CPU face-varying quadrangulation. */
export class HdSt_QuadrangulateFaceVaryingComputation extends HdComputedBufferSource {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology
  private readonly _source: HdBufferSource

  /** quadrangulate.cpp:401-406 */
  constructor(topology: HdSt_MeshTopology, source: HdBufferSource, id: SdfPath) {
    super()
    this._id = id
    this._topology = topology
    this._source = source
  }

  /** quadrangulate.cpp:408-438 */
  override resolve(): boolean {
    if (!TF_VERIFY(this._source)) return false
    if (!this._source.isResolved()) return false

    if (!this._tryLock()) return false

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.quadrangulateFaceVarying)

    // XXX: we could skip this if the mesh is all quads, like above in
    // HdSt_QuadrangulateComputation::Resolve()...

    const result: { value: VtValue } = { value: VtValue.getEmpty() }
    const meshUtil = new HdMeshUtil(this._topology, this._id)
    if (meshUtil.computeQuadrangulatedFaceVaryingPrimvar(
      this._source.getData(),
      this._source.getNumElements(),
      this._source.getTupleType().type,
      result)) {
      this._setResult(new HdVtBufferSource(
        this._source.getName(),
        result.value))
    } else {
      this._setResult(this._source)
    }

    this._setResolved()
    return true
  }

  /** quadrangulate.cpp:440-445 */
  override getBufferSpecs(): HdBufferSpec[] {
    // produces same spec buffer as source
    return this._source.getBufferSpecs()
  }

  /** quadrangulate.cpp:448-452 */
  protected override _checkValid(): boolean {
    return this._source.isValid()
  }
}

/** quadrangulate.h:212-235. GPU quadrangulation. */
export class HdSt_QuadrangulateComputationGPU extends HdStComputation {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology
  private readonly _name: string
  private readonly _dataType: HdType

  /** quadrangulate.cpp:456-466. This computaion doesn't generate buffer
   *  source (i.e. 2nd phase). */
  constructor(topology: HdSt_MeshTopology, sourceName: string, dataType: HdType, id: SdfPath) {
    super()
    this._id = id
    this._topology = topology
    this._name = sourceName
    this._dataType = dataType
    const compType = HdGetComponentType(dataType)
    if (compType !== HdType.HdTypeFloat && compType !== HdType.HdTypeDouble) {
      TF_CODING_ERROR(`Unsupported primvar type ${HdType[dataType]} for quadrangulation [${id.toString()}]`)
    }
  }

  /** quadrangulate.cpp:468-644 */
  override Execute(range: HdBufferArrayRange | null, resourceRegistry: HdResourceRegistry): void {
    if (!TF_VERIFY(this._topology)) return

    const perfLog = HdPerfLog.GetInstance()
    perfLog.incrementCounter(HdPerfTokens.quadrangulateGPU)

    // if this topology doesn't contain non-quad faces, quadInfoRange is null.
    const quadrangulateTableRange = this._topology.getQuadrangulateTableRange()
    if (!quadrangulateTableRange) return

    const quadInfo = this._topology.getQuadInfo()
    if (!quadInfo) {
      TF_CODING_ERROR('QuadInfo is null.')
      return
    }

    // struct Uniform { int vertexOffset; int quadInfoStride;
    //   int quadInfoOffset; int maxNumVert; int primvarOffset;
    //   int primvarStride; int numComponents; int indexEnd; }
    const uniform = new Int32Array(8)

    // select shader by datatype
    const shaderToken =
      HdGetComponentType(this._dataType) === HdType.HdTypeFloat
        ? HdStGLSLProgramTokens.quadrangulateFloat
        : HdStGLSLProgramTokens.quadrangulateDouble

    const hdStResourceRegistry = resourceRegistry as unknown as HdStResourceRegistry
    const computeProgram = HdStGLSLProgram.getComputeProgram(shaderToken, hdStResourceRegistry,
      (computeDesc: HgiShaderFunctionDesc) => {
        computeDesc.debugName = shaderToken
        computeDesc.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
        computeDesc.computeDescriptor.localSize = new GfVec3i(64, 1, 1)

        if (shaderToken === HdStGLSLProgramTokens.quadrangulateFloat) {
          HgiShaderFunctionAddWritableBuffer(
            computeDesc, 'primvar', HdStTokens._float,
            BufferBinding_Primvar)
        } else {
          HgiShaderFunctionAddWritableBuffer(
            computeDesc, 'primvar', HdStTokens._double,
            BufferBinding_Primvar)
        }
        HgiShaderFunctionAddBuffer(
          computeDesc, 'quadInfo', HdStTokens._int,
          BufferBinding_Quadinfo, HgiBindingType.HgiBindingTypePointer)

        const params = [
          'vertexOffset',       // offset in aggregated buffer
          'quadInfoStride',
          'quadInfoOffset',
          'maxNumVert',
          'primvarOffset',      // interleave offset
          'primvarStride',      // interleave stride
          'numComponents',      // interleave datasize
          'indexEnd',
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

    const range_ = range as HdStBufferArrayRange

    // buffer resources for GPU computation
    const primvar = range_.getResource(this._name)!

    const quadrangulateTableRange_ = quadrangulateTableRange as HdStBufferArrayRange

    const quadrangulateTable = quadrangulateTableRange_.getResource()!

    // prepare uniform buffer for GPU computation
    const quadInfoStride = quadInfo.maxNumVert + 2

    // coherent vertex offset in aggregated buffer array
    uniform[0] = range_.getElementOffset()
    // quadinfo offset/stride in aggregated adjacency table
    uniform[1] = quadInfoStride
    uniform[2] = quadrangulateTableRange.getElementOffset()
    uniform[3] = quadInfo.maxNumVert
    // interleaved offset/stride to points
    // note: this code (and the glsl smooth normal compute shader) assumes
    // components in interleaved vertex array are always same data type.
    // i.e. it can't handle an interleaved array which interleaves
    // float/double, float/int etc.
    const componentSize =
      HdDataSizeOfType(HdGetComponentType(primvar.getTupleType().type))
    uniform[4] = Math.trunc(primvar.getOffset() / componentSize)
    uniform[5] = Math.trunc(primvar.getStride() / componentSize)
    uniform[6] = HdGetComponentCount(primvar.getTupleType().type)

    const numNonQuads = quadInfo.numVerts.length
    uniform[7] = numNonQuads

    const hgi = hdStResourceRegistry.getHgi()

    // Generate hash for resource bindings and pipeline.
    // XXX Needs fingerprint hash to avoid collisions
    const rbHash = TfHashCombine(
      BigInt(primvar.getHandle().getId()),
      BigInt(quadrangulateTable.getHandle().getId()))

    const pHash = TfHashCombine(
      BigInt(computeProgram.getProgram().getId()),
      BigInt(uniform.byteLength))

    // Get or add resource bindings in registry.
    const resourceBindingsInstance =
      hdStResourceRegistry.registerResourceBindings(rbHash)
    if (resourceBindingsInstance.isFirstInstance()) {
      const rb = _CreateResourceBindings(
        hgi, primvar.getHandle(), quadrangulateTable.getHandle())
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
    computeCmds.pushDebugGroup('Quadrangulate Cmds')
    computeCmds.bindResources(resourceBindings)
    computeCmds.bindPipeline(pipeline)

    // Queue transfer uniform buffer
    computeCmds.setConstantValues(
      pipeline, BufferBinding_Uniforms, uniform.byteLength, uniform)

    // Queue compute work
    computeCmds.Dispatch(numNonQuads, 1)

    computeCmds.popDebugGroup()

    perfLog.addCounter(HdPerfTokens.quadrangulatedVerts,
      quadInfo.numAdditionalPoints)
  }

  /** quadrangulate.cpp:646-653 */
  override getBufferSpecs(): HdBufferSpec[] {
    // nothing
    //
    // GPU quadrangulation requires the source data on GPU in prior to
    // execution, so no need to populate bufferspec on registration.
    return []
  }

  /** quadrangulate.cpp:655-666 */
  override getNumOutputElements(): number {
    const quadInfo = this._topology.getQuadInfo()

    if (!quadInfo) {
      TF_CODING_ERROR(`QuadInfo is null [${this._id.toString()}]`)
      return 0
    }

    return quadInfo.pointsOffset + quadInfo.numAdditionalPoints
  }
}
