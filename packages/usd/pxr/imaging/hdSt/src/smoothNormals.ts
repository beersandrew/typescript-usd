// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/smoothNormals.cpp,
//  pxr/imaging/hdSt/smoothNormals.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/smoothNormals.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - `static_cast<const GfVec3f*>(_points->GetData())` is a Float32Array
//   (Float64Array for GfVec3d) view of the source bytes.
// - The `Uniform` struct is an Int32Array of its seven int fields.
// - The pipeline hash combines the shader program handle's id where
//   upstream combines the program pointer (smoothNormals.cpp:403-405); the
//   hash is only a registry cache key.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Value as VtValue } from 'typescript-usd/vt'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { HashCombine as TfHashCombine, Token as TfToken } from 'typescript-usd/tf'
import {
  ComputedBufferSource as HdComputedBufferSource,
  VtBufferSource as HdVtBufferSource,
  _SmoothNormals as Hd_SmoothNormals,
  Type as HdType,
  GetComponentType as HdGetComponentType,
  DataSizeOfType as HdDataSizeOfType,
  type _VertexAdjacency as Hd_VertexAdjacency,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type BufferArrayRange as HdBufferArrayRange,
  type ResourceRegistry as HdResourceRegistry,
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
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStGLSLProgramTokens, HdStTokens } from './tokens.ts'
import type { HdSt_VertexAdjacencyBuilder } from './vertexAdjacency.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** `static_cast<T const*>(data)` for a GfVec3f / GfVec3d source. */
function _AsComponents<T extends Float32ArrayConstructor | Float64ArrayConstructor>(
  data: ArrayBufferView, ctor: T,
): InstanceType<T> {
  if (data instanceof ctor) return data as InstanceType<T>
  return new ctor(data.buffer as ArrayBuffer, data.byteOffset,
    Math.floor(data.byteLength / ctor.BYTES_PER_ELEMENT)) as InstanceType<T>
}

/** smoothNormals.h:22-56. Smooth normal computation CPU. */
export class HdSt_SmoothNormalsComputationCPU extends HdComputedBufferSource {
  private readonly _adjacency: Hd_VertexAdjacency | null
  private readonly _points: HdBufferSource
  private readonly _dstName: string
  private readonly _adjacencyBuilder: HdBufferSource | null
  private readonly _packed: boolean

  /** smoothNormals.cpp:35-47 */
  constructor(
    adjacency: Hd_VertexAdjacency | null,
    points: HdBufferSource,
    dstName: string,
    adjacencyBuilder: HdBufferSource | null,
    packed: boolean,
  ) {
    super()
    this._adjacency = adjacency
    this._points = points
    this._dstName = dstName
    this._adjacencyBuilder = adjacencyBuilder
    this._packed = packed
  }

  /** smoothNormals.cpp:49-59 */
  override getBufferSpecs(): HdBufferSpec[] {
    // The datatype of normals is the same as that of points,
    // unless the packed format was requested.
    return [{
      name: this._dstName,
      tupleType: this._packed
        ? { type: HdType.HdTypeInt32_2_10_10_10_REV, count: 1 }
        : this._points.getTupleType(),
    }]
  }

  /** smoothNormals.cpp:61-65 */
  override getName(): string {
    return this._dstName
  }

  /** smoothNormals.cpp:67-135 */
  override resolve(): boolean {
    // dependency check first
    if (this._adjacencyBuilder) {
      if (!this._adjacencyBuilder.isResolved()) return false
    }
    if (!this._points.isResolved()) return false
    if (!this._tryLock()) return false

    if (!TF_VERIFY(this._adjacency)) return true
    const adjacency = this._adjacency!

    const numPoints = this._points.getNumElements()

    let normals: HdBufferSource | null = null

    switch (this._points.getTupleType().type) {
      case HdType.HdTypeFloatVec3: {
        const points = _AsComponents(this._points.getData(), Float32Array)
        normals = new HdVtBufferSource(this._dstName, this._packed
          ? VtValue.createArray(Hd_SmoothNormals.computeSmoothNormalsPacked(adjacency, numPoints, points))
          : VtValue.createArray(Hd_SmoothNormals.computeSmoothNormals(adjacency, numPoints, points)))
        break
      }
      case HdType.HdTypeDoubleVec3: {
        const points = _AsComponents(this._points.getData(), Float64Array)
        normals = new HdVtBufferSource(this._dstName, this._packed
          ? VtValue.createArray(Hd_SmoothNormals.computeSmoothNormalsPacked(adjacency, numPoints, points))
          : VtValue.createArray(Hd_SmoothNormals.computeSmoothNormals(adjacency, numPoints, points)))
        break
      }
      default:
        TF_CODING_ERROR('Unsupported points type for computing smooth normals')
        break
    }

    // smoothNormals.cpp:130 sets the (possibly null) result.
    if (normals) this._setResult(normals)

    // call base class to mark as resolved.
    this._setResolved()
    return true
  }

  /** smoothNormals.cpp:137-146 */
  protected override _checkValid(): boolean {
    let valid = this._points ? this._points.isValid() : false

    // _adjacencyBuilder is an optional source
    valid = valid && (this._adjacencyBuilder ? this._adjacencyBuilder.isValid() : true)

    return valid
  }
}

// smoothNormals.cpp:150-155
const BufferBinding_Uniforms = 0
const BufferBinding_Points = 1
const BufferBinding_Normals = 2
const BufferBinding_Adjacency = 3

/** smoothNormals.cpp:157-203 */
function _CreateResourceBindings(
  hgi: Hgi,
  points: HgiBufferHandle,
  normals: HgiBufferHandle,
  adjacency: HgiBufferHandle,
): HgiResourceBindingsHandle {
  // Begin the resource set
  const resourceDesc = new HgiResourceBindingsDesc()
  resourceDesc.debugName = 'SmoothNormals'

  if (points.isSet()) {
    const bufBind0 = new HgiBufferBindDesc()
    bufBind0.bindingIndex = BufferBinding_Points
    bufBind0.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
    bufBind0.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    bufBind0.writable = false
    bufBind0.offsets.push(0)
    bufBind0.buffers.push(points)
    resourceDesc.buffers.push(bufBind0)
  }

  if (normals.isSet()) {
    const bufBind1 = new HgiBufferBindDesc()
    bufBind1.bindingIndex = BufferBinding_Normals
    bufBind1.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
    bufBind1.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    bufBind1.writable = true
    bufBind1.offsets.push(0)
    bufBind1.buffers.push(normals)
    resourceDesc.buffers.push(bufBind1)
  }

  if (adjacency.isSet()) {
    const bufBind2 = new HgiBufferBindDesc()
    bufBind2.bindingIndex = BufferBinding_Adjacency
    bufBind2.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
    bufBind2.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    bufBind2.writable = false
    bufBind2.offsets.push(0)
    bufBind2.buffers.push(adjacency)
    resourceDesc.buffers.push(bufBind2)
  }

  return hgi.createResourceBindings(resourceDesc)
}

/** smoothNormals.cpp:205-217 */
function _CreatePipeline(
  hgi: Hgi,
  constantValuesSize: number,
  program: HgiShaderProgramHandle,
): HgiComputePipelineHandle {
  const desc = new HgiComputePipelineDesc()
  desc.debugName = 'SmoothNormals'
  desc.shaderProgram = program
  desc.shaderConstantsDesc.byteSize = constantValuesSize
  return hgi.CreateComputePipeline(desc)
}

/** smoothNormals.h:58-90. Smooth normal computation GPU. */
export class HdSt_SmoothNormalsComputationGPU extends HdStComputation {
  private readonly _vertexAdjacencyBuilder: HdSt_VertexAdjacencyBuilder | null
  private readonly _srcName: string
  private readonly _dstName: string
  private readonly _srcDataType: HdType
  private readonly _dstDataType: HdType

  /** smoothNormals.cpp:221-237 */
  constructor(
    vertexAdjacencyBuilder: HdSt_VertexAdjacencyBuilder | null,
    srcName: string,
    dstName: string,
    srcDataType: HdType,
    packed: boolean,
  ) {
    super()
    this._vertexAdjacencyBuilder = vertexAdjacencyBuilder
    this._srcName = srcName
    this._dstName = dstName
    if (srcDataType !== HdType.HdTypeFloatVec3 && srcDataType !== HdType.HdTypeDoubleVec3) {
      TF_CODING_ERROR(
        `Unsupported points type ${HdType[srcDataType]} for computing smooth normals`)
      srcDataType = HdType.HdTypeInvalid
    }
    this._srcDataType = srcDataType
    this._dstDataType = packed ? HdType.HdTypeInt32_2_10_10_10_REV : srcDataType
  }

  /** smoothNormals.cpp:239-450 */
  override Execute(range_: HdBufferArrayRange | null, resourceRegistry: HdResourceRegistry): void {
    if (this._srcDataType === HdType.HdTypeInvalid)
      return

    TF_VERIFY(this._vertexAdjacencyBuilder)
    const adjacencyRange_ = this._vertexAdjacencyBuilder!.getVertexAdjacencyRange()
    TF_VERIFY(adjacencyRange_)

    const adjacencyRange = adjacencyRange_ as HdStBufferArrayRange

    const range = range_ as HdStBufferArrayRange

    // buffer resources for GPU computation
    const points = range.getResource(this._srcName)
    const normals = range.getResource(this._dstName)
    const adjacency = adjacencyRange.getResource()

    if (!points || !normals || !adjacency
      || !points.getHandle().isSet() || !normals.getHandle().isSet()
      || !adjacency.getHandle().isSet()) {
      return
    }

    // select shader by datatype
    let shaderToken = TfToken('')
    if (this._srcDataType === HdType.HdTypeFloatVec3) {
      if (this._dstDataType === HdType.HdTypeFloatVec3) {
        shaderToken = HdStGLSLProgramTokens.smoothNormalsFloatToFloat
      } else if (this._dstDataType === HdType.HdTypeInt32_2_10_10_10_REV) {
        shaderToken = HdStGLSLProgramTokens.smoothNormalsFloatToPacked
      }
    } else if (this._srcDataType === HdType.HdTypeDoubleVec3) {
      if (this._dstDataType === HdType.HdTypeDoubleVec3) {
        shaderToken = HdStGLSLProgramTokens.smoothNormalsDoubleToDouble
      } else if (this._dstDataType === HdType.HdTypeInt32_2_10_10_10_REV) {
        shaderToken = HdStGLSLProgramTokens.smoothNormalsDoubleToPacked
      }
    }
    if (!TF_VERIFY(shaderToken !== '')) return

    // struct Uniform { int vertexOffset; int adjacencyOffset;
    //   int pointsOffset; int pointsStride; int normalsOffset;
    //   int normalsStride; int indexEnd; }
    const uniform = new Int32Array(7)

    const hdStResourceRegistry = resourceRegistry as unknown as HdStResourceRegistry
    const computeProgram = HdStGLSLProgram.getComputeProgram(shaderToken, hdStResourceRegistry,
      (computeDesc: HgiShaderFunctionDesc) => {
        computeDesc.debugName = shaderToken
        computeDesc.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
        computeDesc.computeDescriptor.localSize = new GfVec3i(64, 1, 1)

        let srcType = ''
        let dstType = ''
        if (this._srcDataType === HdType.HdTypeFloatVec3) {
          srcType = HdStTokens._float
        } else {
          srcType = HdStTokens._double
        }

        if (this._dstDataType === HdType.HdTypeFloatVec3) {
          dstType = HdStTokens._float
        } else if (this._dstDataType === HdType.HdTypeDoubleVec3) {
          dstType = HdStTokens._double
        } else if (this._dstDataType === HdType.HdTypeInt32_2_10_10_10_REV) {
          dstType = HdStTokens._int
        }
        HgiShaderFunctionAddBuffer(computeDesc,
          'points', srcType,
          BufferBinding_Points, HgiBindingType.HgiBindingTypePointer)
        HgiShaderFunctionAddWritableBuffer(computeDesc,
          'normals', dstType,
          BufferBinding_Normals)
        HgiShaderFunctionAddBuffer(computeDesc,
          'entry', HdStTokens._int,
          BufferBinding_Adjacency, HgiBindingType.HgiBindingTypePointer)

        const params = [
          'vertexOffset',       // offset in aggregated buffer
          'adjacencyOffset',    // offset in aggregated buffer
          'pointsOffset',       // interleave offset
          'pointsStride',       // interleave stride
          'normalsOffset',      // interleave offset
          'normalsStride',      // interleave stride
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

    // prepare uniform buffer for GPU computation
    // coherent vertex offset in aggregated buffer array
    uniform[0] = range.getElementOffset()
    // adjacency offset/stride in aggregated adjacency table
    uniform[1] = adjacencyRange.getElementOffset()
    // interleaved offset/stride to points
    // note: this code (and the glsl smooth normal compute shader) assumes
    // components in interleaved vertex array are always same data type.
    // i.e. it can't handle an interleaved array which interleaves
    // float/double, float/int etc.
    //
    // The offset and stride values we pass to the shader are in terms
    // of indexes, not bytes, so we must convert the HdStBufferResource
    // offset/stride (which are in bytes) to counts of float[]/double[]
    // entries.
    const pointComponentSize =
      HdDataSizeOfType(HdGetComponentType(points.getTupleType().type))
    uniform[2] = Math.trunc(points.getOffset() / pointComponentSize)
    uniform[3] = Math.trunc(points.getStride() / pointComponentSize)
    // interleaved offset/stride to normals
    const normalComponentSize =
      HdDataSizeOfType(HdGetComponentType(normals.getTupleType().type))
    uniform[4] = Math.trunc(normals.getOffset() / normalComponentSize)
    uniform[5] = Math.trunc(normals.getStride() / normalComponentSize)
    // The number of points is based off the size of the output,
    // However, the number of points in the adjacency table
    // is computed based off the largest vertex indexed from
    // to topology (aka topology->ComputeNumPoints).
    //
    // Therefore, we need to clamp the number of points
    // to the number of entries in the adjancency table.
    const numDestPoints = range.getNumElements()
    const numSrcPoints =
      this._vertexAdjacencyBuilder!.getVertexAdjacency().getNumPoints()

    const numPoints = Math.min(numSrcPoints, numDestPoints)
    uniform[6] = numPoints

    const hgi = hdStResourceRegistry.getHgi()

    // Generate hash for resource bindings and pipeline.
    // XXX Needs fingerprint hash to avoid collisions
    const rbHash = TfHashCombine(
      BigInt(points.getHandle().getId()),
      BigInt(normals.getHandle().getId()),
      BigInt(adjacency.getHandle().getId()))

    const pHash = TfHashCombine(
      BigInt(computeProgram.getProgram().getId()),
      BigInt(uniform.byteLength))

    // Get or add resource bindings in registry.
    const resourceBindingsInstance =
      hdStResourceRegistry.registerResourceBindings(rbHash)
    if (resourceBindingsInstance.isFirstInstance()) {
      const rb = _CreateResourceBindings(hgi,
        points.getHandle(),
        normals.getHandle(),
        adjacency.getHandle())
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
    computeCmds.pushDebugGroup('Smooth Normals Cmds')
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

  /** smoothNormals.cpp:452-457 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._dstName, tupleType: { type: this._dstDataType, count: 1 } }]
  }

  /** smoothNormals.h:79-82. This computation doesn't generate buffer source
   *  (i.e. 2nd phase). This is a gpu computation, but no need to resize the
   *  destination since it belongs the same range as src buffer. */
  override getNumOutputElements(): number { return 0 }
}
