// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/flatNormals.cpp,
//  pxr/imaging/hdSt/flatNormals.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/flatNormals.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - `static_cast<const GfVec3f*>(_points->GetData())` is a Float32Array
//   (Float64Array for GfVec3d) view of the source bytes.
// - The `Uniform` struct is an Int32Array of its twelve int fields.
// - The pipeline hash combines the shader program handle's id where
//   upstream combines the program pointer (flatNormals.cpp:438-440); the
//   hash is only a registry cache key.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Value as VtValue } from 'typescript-usd/vt'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { HashCombine as TfHashCombine, Token as TfToken } from 'typescript-usd/tf'
import {
  ComputedBufferSource as HdComputedBufferSource,
  VtBufferSource as HdVtBufferSource,
  _FlatNormals as Hd_FlatNormals,
  Tokens as HdTokens,
  Type as HdType,
  GetComponentType as HdGetComponentType,
  GetComponentCount as HdGetComponentCount,
  DataSizeOfType as HdDataSizeOfType,
  type MeshTopology as HdMeshTopology,
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
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** `static_cast<T const*>(data)` for a GfVec3f / GfVec3d source. */
function _AsComponents<T extends Float32ArrayConstructor | Float64ArrayConstructor>(
  data: ArrayBufferView, ctor: T,
): InstanceType<T> {
  if (data instanceof ctor) return data as InstanceType<T>
  return new ctor(data.buffer as ArrayBuffer, data.byteOffset,
    Math.floor(data.byteLength / ctor.BYTES_PER_ELEMENT)) as InstanceType<T>
}

/** flatNormals.h:23-52. Flat normal computation CPU. */
export class HdSt_FlatNormalsComputationCPU extends HdComputedBufferSource {
  private readonly _topology: HdMeshTopology | null
  private readonly _points: HdBufferSource
  private readonly _dstName: string
  private readonly _packed: boolean

  /** flatNormals.cpp:36-46 */
  constructor(
    topology: HdMeshTopology | null,
    points: HdBufferSource,
    dstName: string,
    packed: boolean,
  ) {
    super()
    this._topology = topology
    this._points = points
    this._dstName = dstName
    this._packed = packed
  }

  /** flatNormals.cpp:48-57 */
  override getBufferSpecs(): HdBufferSpec[] {
    // The datatype of normals is the same as that of points, unless the
    // packed format was requested.
    return [{
      name: this._dstName,
      tupleType: this._packed
        ? { type: HdType.HdTypeInt32_2_10_10_10_REV, count: 1 }
        : this._points.getTupleType(),
    }]
  }

  /** flatNormals.cpp:59-63 */
  override getName(): string {
    return this._dstName
  }

  /** flatNormals.cpp:65-107 */
  override resolve(): boolean {
    if (!this._points.isResolved()) { return false }
    if (!this._tryLock()) { return false }

    if (!TF_VERIFY(this._topology)) return true
    const topology = this._topology!

    let normals = VtValue.getEmpty()

    switch (this._points.getTupleType().type) {
      case HdType.HdTypeFloatVec3: {
        const points = _AsComponents(this._points.getData(), Float32Array)
        normals = this._packed
          ? VtValue.createArray(Hd_FlatNormals.computeFlatNormalsPacked(topology, points))
          : VtValue.createArray(Hd_FlatNormals.computeFlatNormals(topology, points))
        break
      }
      case HdType.HdTypeDoubleVec3: {
        const points = _AsComponents(this._points.getData(), Float64Array)
        normals = this._packed
          ? VtValue.createArray(Hd_FlatNormals.computeFlatNormalsPacked(topology, points))
          : VtValue.createArray(Hd_FlatNormals.computeFlatNormals(topology, points))
        break
      }
      default:
        TF_CODING_ERROR('Unsupported points type for computing flat normals')
        break
    }

    const normalsBuffer = new HdVtBufferSource(this._dstName, normals)
    this._setResult(normalsBuffer)
    this._setResolved()
    return true
  }

  /** flatNormals.cpp:109-114 */
  protected override _checkValid(): boolean {
    const valid = this._points ? this._points.isValid() : false
    return valid
  }
}

// flatNormals.cpp:118-124
const BufferBinding_Uniforms = 0
const BufferBinding_Points = 1
const BufferBinding_Normals = 2
const BufferBinding_Indices = 3
const BufferBinding_PrimitiveParam = 4

/** flatNormals.cpp:126-184 */
function _CreateResourceBindings(
  hgi: Hgi,
  points: HgiBufferHandle,
  normals: HgiBufferHandle,
  indices: HgiBufferHandle,
  primitiveParam: HgiBufferHandle,
): HgiResourceBindingsHandle {
  // Begin the resource set
  const resourceDesc = new HgiResourceBindingsDesc()
  resourceDesc.debugName = 'FlatNormals'

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

  if (points.isSet()) bind(points, BufferBinding_Points, false)
  if (normals.isSet()) bind(normals, BufferBinding_Normals, true)
  if (indices.isSet()) bind(indices, BufferBinding_Indices, false)
  if (primitiveParam.isSet()) bind(primitiveParam, BufferBinding_PrimitiveParam, false)

  return hgi.createResourceBindings(resourceDesc)
}

/** flatNormals.cpp:186-198 */
function _CreatePipeline(
  hgi: Hgi,
  constantValuesSize: number,
  program: HgiShaderProgramHandle,
): HgiComputePipelineHandle {
  const desc = new HgiComputePipelineDesc()
  desc.debugName = 'FlatNormals'
  desc.shaderProgram = program
  desc.shaderConstantsDesc.byteSize = constantValuesSize
  return hgi.CreateComputePipeline(desc)
}

/** flatNormals.h:54-88. Flat normal computation GPU. */
export class HdSt_FlatNormalsComputationGPU extends HdStComputation {
  private readonly _topologyRange: HdBufferArrayRange | null
  private readonly _vertexRange: HdBufferArrayRange | null
  private readonly _numFaces: number
  private readonly _srcName: string
  private readonly _dstName: string
  private readonly _srcDataType: HdType
  private readonly _dstDataType: HdType

  /** flatNormals.cpp:202-221 */
  constructor(
    topologyRange: HdBufferArrayRange | null,
    vertexRange: HdBufferArrayRange | null,
    numFaces: number,
    srcName: string,
    dstName: string,
    srcDataType: HdType,
    packed: boolean,
  ) {
    super()
    this._topologyRange = topologyRange
    this._vertexRange = vertexRange
    this._numFaces = numFaces
    this._srcName = srcName
    this._dstName = dstName
    if (srcDataType !== HdType.HdTypeFloatVec3 && srcDataType !== HdType.HdTypeDoubleVec3) {
      TF_CODING_ERROR(
        `Unsupported points type ${HdType[srcDataType]} for computing flat normals`)
      srcDataType = HdType.HdTypeInvalid
    }
    this._srcDataType = srcDataType
    this._dstDataType = packed ? HdType.HdTypeInt32_2_10_10_10_REV : srcDataType
  }

  /** flatNormals.cpp:223-227 */
  override getNumOutputElements(): number {
    return this._numFaces
  }

  /** flatNormals.cpp:229-485 */
  override Execute(range_: HdBufferArrayRange | null, resourceRegistry: HdResourceRegistry): void {
    if (this._srcDataType === HdType.HdTypeInvalid)
      return

    const range = range_ as HdStBufferArrayRange
    const vertexRange = this._vertexRange as HdStBufferArrayRange
    const topologyRange = this._topologyRange as HdStBufferArrayRange

    // buffer resources for GPU computation
    const points = vertexRange.getResource(this._srcName)
    const normals = range.getResource(this._dstName)
    const indices = topologyRange.getResource(HdTokens.indices)
    const primitiveParam = topologyRange.getResource(HdTokens.primitiveParam)

    if (!points || !normals || !indices || !primitiveParam
      || !points.getHandle().isSet() || !normals.getHandle().isSet()
      || !indices.getHandle().isSet() || !primitiveParam.getHandle().isSet()) {
      return
    }

    // select shader by datatype
    let shaderToken = TfToken('')
    const indexArity = HdGetComponentCount(indices.getTupleType().type)
    const indexCount = indices.getTupleType().count
    const T = HdStGLSLProgramTokens
    const src = this._srcDataType, dst = this._dstDataType
    const F3 = HdType.HdTypeFloatVec3, D3 = HdType.HdTypeDoubleVec3
    const P = HdType.HdTypeInt32_2_10_10_10_REV
    if (indexArity === 3) {
      if (src === F3) {
        if (dst === F3) shaderToken = T.flatNormalsTriFloatToFloat
        else if (dst === P) shaderToken = T.flatNormalsTriFloatToPacked
      } else if (src === D3) {
        if (dst === D3) shaderToken = T.flatNormalsTriDoubleToDouble
        else if (dst === P) shaderToken = T.flatNormalsTriDoubleToPacked
      }
    } else if (indexCount === 4) {
      if (src === F3) {
        if (dst === F3) shaderToken = T.flatNormalsQuadFloatToFloat
        else if (dst === P) shaderToken = T.flatNormalsQuadFloatToPacked
      } else if (src === D3) {
        if (dst === D3) shaderToken = T.flatNormalsQuadDoubleToDouble
        else if (dst === P) shaderToken = T.flatNormalsQuadDoubleToPacked
      }
    } else if (indexCount === 6) {
      if (src === F3) {
        if (dst === F3) shaderToken = T.flatNormalsTriQuadFloatToFloat
        else if (dst === P) shaderToken = T.flatNormalsTriQuadFloatToPacked
      } else if (src === D3) {
        if (dst === D3) shaderToken = T.flatNormalsTriQuadDoubleToDouble
        else if (dst === P) shaderToken = T.flatNormalsTriQuadDoubleToPacked
      }
    }
    if (!TF_VERIFY(shaderToken !== '')) return

    // struct Uniform { int vertexOffset; int elementOffset;
    //   int topologyOffset; int pointsOffset; int pointsStride;
    //   int normalsOffset; int normalsStride; int indexOffset;
    //   int indexStride; int pParamOffset; int pParamStride;
    //   int primIndexEnd; }
    const uniform = new Int32Array(12)

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
        HgiShaderFunctionAddBuffer(
          computeDesc, 'points', srcType,
          BufferBinding_Points, HgiBindingType.HgiBindingTypePointer)
        HgiShaderFunctionAddWritableBuffer(
          computeDesc, 'normals', dstType,
          BufferBinding_Normals)
        HgiShaderFunctionAddBuffer(
          computeDesc, 'indices', HdStTokens._int,
          BufferBinding_Indices, HgiBindingType.HgiBindingTypePointer)
        HgiShaderFunctionAddBuffer(
          computeDesc, 'primitiveParam', HdStTokens._int,
          BufferBinding_PrimitiveParam, HgiBindingType.HgiBindingTypePointer)

        const params = [
          'vertexOffset',       // offset in aggregated buffer
          'elementOffset',      // offset in aggregated buffer
          'topologyOffset',     // offset in aggregated buffer
          'pointsOffset',       // interleave offset
          'pointsStride',       // interleave stride
          'normalsOffset',      // interleave offset
          'normalsStride',      // interleave stride
          'indexOffset',        // interleave offset
          'indexStride',        // interleave stride
          'pParamOffset',       // interleave offset
          'pParamStride',       // interleave stride
          'primIndexEnd',
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
    uniform[0] = vertexRange.getElementOffset()
    // coherent element offset in aggregated buffer array
    uniform[1] = range.getElementOffset()
    // coherent topology offset in aggregated buffer array
    uniform[2] = topologyRange.getElementOffset()
    // interleaved offset/stride to points
    // note: this code (and the glsl flat normal compute shader) assumes
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
    uniform[3] = Math.trunc(points.getOffset() / pointComponentSize)
    uniform[4] = Math.trunc(points.getStride() / pointComponentSize)
    // interleaved offset/stride to normals
    const normalComponentSize =
      HdDataSizeOfType(HdGetComponentType(normals.getTupleType().type))
    uniform[5] = Math.trunc(normals.getOffset() / normalComponentSize)
    uniform[6] = Math.trunc(normals.getStride() / normalComponentSize)

    const indexComponentSize =
      HdDataSizeOfType(HdGetComponentType(indices.getTupleType().type))
    uniform[7] = Math.trunc(indices.getOffset() / indexComponentSize)
    uniform[8] = Math.trunc(indices.getStride() / indexComponentSize)

    const pParamComponentSize =
      HdDataSizeOfType(HdGetComponentType(primitiveParam.getTupleType().type))
    uniform[9] = Math.trunc(primitiveParam.getOffset() / pParamComponentSize)
    uniform[10] = Math.trunc(primitiveParam.getStride() / pParamComponentSize)

    const numPrims = topologyRange.getNumElements()
    uniform[11] = numPrims

    const hgi = hdStResourceRegistry.getHgi()

    // Generate hash for resource bindings and pipeline.
    // XXX Needs fingerprint hash to avoid collisions
    const rbHash = TfHashCombine(
      BigInt(points.getHandle().getId()),
      BigInt(normals.getHandle().getId()),
      BigInt(indices.getHandle().getId()),
      BigInt(primitiveParam.getHandle().getId()))

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
        indices.getHandle(),
        primitiveParam.getHandle())
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
    computeCmds.pushDebugGroup('Flat Normals Cmds')
    computeCmds.bindResources(resourceBindings)
    computeCmds.bindPipeline(pipeline)

    // transfer uniform buffer
    computeCmds.setConstantValues(
      pipeline, BufferBinding_Uniforms, uniform.byteLength, uniform)

    // Queue compute work
    computeCmds.Dispatch(numPrims, 1)

    computeCmds.popDebugGroup()
  }

  /** flatNormals.cpp:487-491 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._dstName, tupleType: { type: this._dstDataType, count: 1 } }]
  }
}
