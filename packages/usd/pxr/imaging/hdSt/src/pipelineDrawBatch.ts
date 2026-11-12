// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/pipelineDrawBatch.cpp,
//  pxr/imaging/hdSt/pipelineDrawBatch.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/pipelineDrawBatch.{h,cpp} (OpenUSD 26.11.1).
//
// Drawing batch that is executed using an Hgi graphics pipeline
// (pipelineDrawBatch.h:24-31). The file follows upstream order: private
// tokens and env setting (pipelineDrawBatch.cpp:50-67), the draw command
// layouts and their traits (:193-458), the file-local draw item / binding
// helpers (:459-598, :1024-1359, :1553-1585), HdSt_PipelineDrawBatch
// (pipelineDrawBatch.h:32-198, pipelineDrawBatch.cpp:69-2000) and its
// _CullingProgram (pipelineDrawBatch.h:100-120, pipelineDrawBatch.cpp:
// 2002-2042).
//
// Divergences:
// - The _Draw*Command structs are described by their uint32_t field names;
//   sizeof/offsetof are computed from that layout (every field is a
//   uint32_t, the unions' members have equal size), in bytes as upstream.
// - The file-private helpers are exported (with their upstream names) so
//   tests can build the culling program's inputs and read the layouts.
// - _drawCommandBuffer (std::vector<uint32_t>) is a number[] of uint32
//   values, the type HgiGraphicsCmds::DrawIndexedIndirect takes here.
// - Pipeline cache keys hash the shader program handle's id where upstream
//   hashes its pointer, and the function name string where upstream hashes
//   ArchHash64(__FUNCTION__); they are cache keys only.
// - The destructor is destroy() (pipelineDrawBatch.cpp:100-108). Dropping a
//   dispatch buffer marks it expired for the registry's garbage collection
//   (PLATFORM-DIVERGENCE(hd-bar-shared-ptr), see dispatchBuffer.ts).
// - _PrepareIndirectCommandBuffer returns when Hgi has no indirect command
//   encoder (upstream dereferences it; only Hgis reporting
//   IndirectCommandBuffers reach it).
// - _EndGPUCountVisibleInstances cannot wait for the GPU synchronously; the
//   read-back count lands when the submission completes
//   (PLATFORM-DIVERGENCE(hdst-gpu-count-visible-readback)).

import { HdSt_TextureBinder } from './textureBinder.ts'
import {
  MakeTokens as TfMakeTokens,
  type Token as TfToken,
  Debug as TfDebug,
  HashCombine as TfHashCombine,
  TfEnvSetting,
  TfGetEnvSetting,
} from 'typescript-usd/tf'
import { Matrix4f as GfMatrix4f } from 'typescript-usd/gf'
import {
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  DebugCodes as HdDebugCodes,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  Tokens as HdTokens,
  Type as HdType,
  type BufferArrayRange as HdBufferArrayRange,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import {
  HgiBindResourceType,
  HgiBufferCpuToGpuOp,
  HgiBufferGpuToCpuOp,
  HgiBufferUsageBits,
  HgiComputeDispatch,
  HgiComputePipelineDesc,
  HgiDeviceCapabilitiesBits,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiMemoryBarrierBits,
  HgiResourceBindingsDesc,
  HgiShaderStageBits,
  HgiSubmitWaitType,
  HgiTessellationState,
  HgiVertexAttributeDesc,
  HgiVertexBufferBinding,
  HgiVertexBufferDesc,
  HgiVertexBufferStepFunction,
  type Hgi,
  type HgiBufferHandle,
  type HgiComputePipelineHandle,
  type HgiGraphicsCmds,
  type HgiGraphicsPipelineHandle,
  type HgiIndirectCommands,
  type HgiVertexBufferBindingVector,
  type HgiVertexBufferDescVector,
} from 'typescript-usd/hgi'
import { HdStBinding, HdStBindingRequest } from './binding.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import type { HdStBufferResource } from './bufferResource.ts'
import { HdSt_CodeGen } from './codeGen.ts'
import { HdSt_CullingComputeShaderKey } from './cullingShaderKey.ts'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdStDispatchBuffer } from './dispatchBuffer.ts'
import {
  HdSt_DrawBatch,
  HdSt_DrawBatchDrawingProgram,
  HdSt_DrawBatchValidationResult,
} from './drawBatch.ts'
import type { HdStDrawItem } from './drawItem.ts'
import type { HdStDrawItemInstance } from './drawItemInstance.ts'
import { HdSt_GeometricShader } from './geometricShader.ts'
import type { HdStGLSLProgram } from './glslProgram.ts'
import { HdStHgiConversions } from './hgiConversions.ts'
import { HdSt_IndirectDrawBatch } from './indirectDrawBatch.ts'
import type { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import type { HdStRenderPassState } from './renderPassState.ts'
import {
  HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding,
  type HdSt_ResourceBinder,
} from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** TF_DEFINE_PRIVATE_TOKENS (pipelineDrawBatch.cpp:50-64) */
export const _tokens = TfMakeTokens({
  constantPrimvars: 'constantPrimvars',

  dispatchBuffer: 'dispatchBuffer',
  drawCullInput: 'drawCullInput',

  drawIndirect: 'drawIndirect',
  drawIndirectCull: 'drawIndirectCull',
  drawIndirectResult: 'drawIndirectResult',

  ulocCullParams: 'ulocCullParams',
})

/** pipelineDrawBatch.cpp:66-67 */
export const HDST_ENABLE_PIPELINE_DRAW_BATCH_GPU_FRUSTUM_CULLING =
  new TfEnvSetting<boolean>('HDST_ENABLE_PIPELINE_DRAW_BATCH_GPU_FRUSTUM_CULLING', true,
    'Enable pipeline draw batching GPU frustum culling')

// Draw command dispatch buffers are built as arrays of uint32_t, but
// we use these struct definitions to reason consistently about element
// access and offsets.
//
// The _DrawingCoord struct defines bundles of element offsets into buffers
// which together represent the drawing coordinate input to the shader.
// These must be kept in sync with codeGen. For instanced culling we need
// only a subset of the drawing coord. It might be beneficial to rearrange
// the drawing coord tuples.
//
// Note: _Draw*Command structs are layed out such that the first elements
// match the layout of Vulkan and GL and D3D indirect draw parameters.
//
// Note: Metal Patch drawing uses a different encoding than Vulkan and GL
// and D3D. Also, there is no base vertex offset in the indexed draw encoding,
// so we need to manually step vertex buffer binding offsets while encoding
// draw commands.
//
// Note: GL specifies baseVertex as 'int' and other as 'uint', but
// we never set negative baseVertex in our use cases.

/** A struct of uint32_t fields, in declaration order. */
interface _Uint32Struct {
  readonly fields: readonly string[]
}

const _sizeofUint32 = 4

function _sizeof(s: _Uint32Struct): number {
  return s.fields.length * _sizeofUint32
}

function _offsetof(s: _Uint32Struct, field: string): number {
  const i = s.fields.indexOf(field)
  if (i < 0) throw new Error(`offsetof: no field ${field}`)
  return i * _sizeofUint32
}

/** pipelineDrawBatch.cpp:216-238. DrawingCoord 10 integers
 *  (+ numInstanceLevels) */
export const _DrawingCoord: _Uint32Struct = {
  fields: [
    // drawingCoord0 (ivec4 for drawing and culling)
    'modelDC', 'constantDC', 'elementDC', 'primitiveDC',
    // drawingCoord1 (ivec4 for drawing or ivec2 for culling)
    'fvarDC', 'instanceIndexDC', 'shaderDC', 'vertexDC',
    // drawingCoord2 (ivec2 for drawing)
    'topVisDC', 'varyingDC',
    // drawingCoordI (int32[] for drawing and culling)
    // uint32_t instanceDC[numInstanceLevels];
  ],
}

const _drawingCoordFields = _DrawingCoord.fields.map((f) => `drawingCoord.${f}`)

/** pipelineDrawBatch.cpp:240-259. DrawNonIndexed + non-instance culling :
 *  14 integers (+ numInstanceLevels). `common` and `metalPatch` alias the
 *  same four uint32_t. */
export const _DrawNonIndexedCommand: _Uint32Struct = {
  fields: [
    'common.count', 'common.instanceCount', 'common.baseVertex', 'common.baseInstance',
    ..._drawingCoordFields,
  ],
}

/** pipelineDrawBatch.cpp:261-285. DrawNonIndexed + Instance culling :
 *  18 integers (+ numInstanceLevels) */
export const _DrawNonIndexedInstanceCullCommand: _Uint32Struct = {
  fields: [
    'common.count', 'common.instanceCount', 'common.baseVertex', 'common.baseInstance',
    'cullCount', 'cullInstanceCount', 'cullBaseVertex', 'cullBaseInstance',
    ..._drawingCoordFields,
  ],
}

/** pipelineDrawBatch.cpp:287-308. DrawIndexed + non-instance culling :
 *  15 integers (+ numInstanceLevels) */
export const _DrawIndexedCommand: _Uint32Struct = {
  fields: [
    'common.count', 'common.instanceCount', 'common.baseIndex', 'common.baseVertex',
    'common.baseInstance',
    ..._drawingCoordFields,
  ],
}

/** pipelineDrawBatch.cpp:310-336. DrawIndexed + Instance culling :
 *  19 integers (+ numInstanceLevels) */
export const _DrawIndexedInstanceCullCommand: _Uint32Struct = {
  fields: [
    'common.count', 'common.instanceCount', 'common.baseIndex', 'common.baseVertex',
    'common.baseInstance',
    'cullCount', 'cullInstanceCount', 'cullBaseVertex', 'cullBaseInstance',
    ..._drawingCoordFields,
  ],
}

/** pipelineDrawBatch.cpp:338-363. These traits capture sizes and offsets for
 *  the _Draw*Command structs */
export class _DrawCommandTraits {
  // Since the underlying buffer is an array of uint32_t, we capture
  // the size of the struct as the number of uint32_t elements.
  numUInt32 = 0

  // Additional uint32_t values needed to align command entries.
  numUInt32Padding = 0

  instancerNumLevels = 0
  instanceIndexWidth = 0

  count_offset = 0
  instanceCount_offset = 0
  baseInstance_offset = 0
  cullCount_offset = 0
  cullInstanceCount_offset = 0

  drawingCoord0_offset = 0
  drawingCoord1_offset = 0
  drawingCoord2_offset = 0
  drawingCoordI_offset = 0

  patchBaseVertex_offset = 0
}

/** pipelineDrawBatch.cpp:365-395 */
export function _SetDrawCommandTraits(
  CmdType: _Uint32Struct,
  traits: _DrawCommandTraits,
  instancerNumLevels: number,
  uint32Alignment: number,
): void {
  // Number of uint32_t in the command struct
  // followed by instanceDC[instancerNumLevals]
  traits.numUInt32 = _sizeof(CmdType) / _sizeofUint32 + instancerNumLevels

  if (uint32Alignment > 0) {
    const alignMask = uint32Alignment - 1
    const alignedNumUInt32 = (traits.numUInt32 + alignMask) & ~alignMask
    traits.numUInt32Padding = alignedNumUInt32 - traits.numUInt32
    traits.numUInt32 = alignedNumUInt32
  } else {
    traits.numUInt32Padding = 0
  }

  traits.instancerNumLevels = instancerNumLevels
  traits.instanceIndexWidth = instancerNumLevels + 1

  traits.count_offset = _offsetof(CmdType, 'common.count')
  traits.instanceCount_offset = _offsetof(CmdType, 'common.instanceCount')
  traits.baseInstance_offset = _offsetof(CmdType, 'common.baseInstance')

  // These are different only for instanced culling.
  traits.cullCount_offset = traits.count_offset
  traits.cullInstanceCount_offset = traits.instanceCount_offset
}

/** pipelineDrawBatch.cpp:397-402 */
export function _SetInstanceCullTraits(CmdType: _Uint32Struct, traits: _DrawCommandTraits): void {
  traits.cullCount_offset = _offsetof(CmdType, 'cullCount')
  traits.cullInstanceCount_offset = _offsetof(CmdType, 'cullInstanceCount')
}

/** pipelineDrawBatch.cpp:404-420 */
export function _SetDrawingCoordTraits(CmdType: _Uint32Struct, traits: _DrawCommandTraits): void {
  // drawingCoord bundles are located by the offsets to their first elements
  traits.drawingCoord0_offset = _offsetof(CmdType, 'drawingCoord.modelDC')
  traits.drawingCoord1_offset = _offsetof(CmdType, 'drawingCoord.fvarDC')
  traits.drawingCoord2_offset = _offsetof(CmdType, 'drawingCoord.topVisDC')

  // drawingCoord instancer bindings follow the base drawing coord struct
  traits.drawingCoordI_offset = _sizeof(CmdType)

  // needed to step vertex buffer binding offsets for Metal tessellation
  traits.patchBaseVertex_offset = _offsetof(CmdType, 'drawingCoord.vertexDC')
}

/** pipelineDrawBatch.cpp:422-458 */
export function _GetDrawCommandTraits(
  instancerNumLevels: number,
  useDrawIndexed: boolean,
  useInstanceCulling: boolean,
  uint32Alignment: number,
): _DrawCommandTraits {
  const traits = new _DrawCommandTraits()
  if (!useDrawIndexed) {
    if (useInstanceCulling) {
      const CmdType = _DrawNonIndexedInstanceCullCommand
      _SetDrawCommandTraits(CmdType, traits, instancerNumLevels, uint32Alignment)
      _SetInstanceCullTraits(CmdType, traits)
      _SetDrawingCoordTraits(CmdType, traits)
    } else {
      const CmdType = _DrawNonIndexedCommand
      _SetDrawCommandTraits(CmdType, traits, instancerNumLevels, uint32Alignment)
      _SetDrawingCoordTraits(CmdType, traits)
    }
  } else {
    if (useInstanceCulling) {
      const CmdType = _DrawIndexedInstanceCullCommand
      _SetDrawCommandTraits(CmdType, traits, instancerNumLevels, uint32Alignment)
      _SetInstanceCullTraits(CmdType, traits)
      _SetDrawingCoordTraits(CmdType, traits)
    } else {
      const CmdType = _DrawIndexedCommand
      _SetDrawCommandTraits(CmdType, traits, instancerNumLevels, uint32Alignment)
      _SetDrawingCoordTraits(CmdType, traits)
    }
  }
  return traits
}

/** Index (in uint32_t) of a field of a _Draw*Command struct. */
function _uint32Index(s: _Uint32Struct, field: string): number {
  return _offsetof(s, field) / _sizeofUint32
}

/** The metalPatch member of _DrawIndexedCommand's union
 *  (pipelineDrawBatch.cpp:297-303). */
const _DrawIndexedCommandMetalPatch: _Uint32Struct = {
  fields: [
    'metalPatch.patchCount', 'metalPatch.instanceCount', 'metalPatch.patchStart',
    'metalPatch.baseInstance', 'metalPatch.baseVertex',
  ],
}

/** pipelineDrawBatch.cpp:459-485 */
export function _AddDrawResourceViews(
  dispatchBuffer: HdStDispatchBuffer,
  traits: _DrawCommandTraits,
): void {
  // draw indirect command
  dispatchBuffer.addBufferResourceView(
    HdTokens.drawDispatch, { type: HdType.HdTypeInt32, count: 1 },
    traits.count_offset)
  // drawing coord 0
  dispatchBuffer.addBufferResourceView(
    HdTokens.drawingCoord0, { type: HdType.HdTypeInt32Vec4, count: 1 },
    traits.drawingCoord0_offset)
  // drawing coord 1
  dispatchBuffer.addBufferResourceView(
    HdTokens.drawingCoord1, { type: HdType.HdTypeInt32Vec4, count: 1 },
    traits.drawingCoord1_offset)
  // drawing coord 2
  dispatchBuffer.addBufferResourceView(
    HdTokens.drawingCoord2, { type: HdType.HdTypeInt32Vec2, count: 1 },
    traits.drawingCoord2_offset)
  // instance drawing coords
  if (traits.instancerNumLevels > 0) {
    dispatchBuffer.addBufferResourceView(
      HdTokens.drawingCoordI, { type: HdType.HdTypeInt32, count: traits.instancerNumLevels },
      traits.drawingCoordI_offset)
  }
}

/** pipelineDrawBatch.cpp:487-491 */
function _GetShaderBar(shader: HdSt_MaterialNetworkShader | null): HdBufferArrayRange | null {
  return shader ? shader.getShaderData() : null
}

/** pipelineDrawBatch.cpp:493-534. Collection of resources for a drawItem */
class _DrawItemState {
  constantBar: HdStBufferArrayRange | null
  indexBar: HdStBufferArrayRange | null
  topVisBar: HdStBufferArrayRange | null
  elementBar: HdStBufferArrayRange | null
  fvarBar: HdStBufferArrayRange | null
  varyingBar: HdStBufferArrayRange | null
  vertexBar: HdStBufferArrayRange | null
  shaderBar: HdStBufferArrayRange | null
  instanceIndexBar: HdStBufferArrayRange | null
  instancePrimvarBars: (HdStBufferArrayRange | null)[]

  constructor(drawItem: HdStDrawItem) {
    // std::static_pointer_cast<HdStBufferArrayRange>
    const st = (bar: HdBufferArrayRange | null) => bar as HdStBufferArrayRange | null
    this.constantBar = st(drawItem.getConstantPrimvarRange())
    this.indexBar = st(drawItem.getTopologyRange())
    this.topVisBar = st(drawItem.getTopologyVisibilityRange())
    this.elementBar = st(drawItem.getElementPrimvarRange())
    this.fvarBar = st(drawItem.getFaceVaryingPrimvarRange())
    this.varyingBar = st(drawItem.getVaryingPrimvarRange())
    this.vertexBar = st(drawItem.getVertexPrimvarRange())
    this.shaderBar = st(_GetShaderBar(drawItem.getMaterialNetworkShader()))
    this.instanceIndexBar = st(drawItem.getInstanceIndexRange())

    this.instancePrimvarBars = new Array<HdStBufferArrayRange | null>(
      drawItem.getInstancePrimvarNumLevels()).fill(null)
    for (let i = 0; i < this.instancePrimvarBars.length; ++i) {
      this.instancePrimvarBars[i] = st(drawItem.getInstancePrimvarRange(i))
    }
  }
}

/** pipelineDrawBatch.cpp:536-540 */
function _GetElementOffset(range: HdBufferArrayRange | null): number {
  return range ? range.getElementOffset() >>> 0 : 0
}

/** pipelineDrawBatch.cpp:542-546 */
function _GetElementCount(range: HdBufferArrayRange | null): number {
  return range ? range.getNumElements() >>> 0 : 0
}

/** pipelineDrawBatch.cpp:548-563 */
function _GetInstanceCount(
  drawItemInstance: HdStDrawItemInstance,
  instanceIndexBar: HdBufferArrayRange | null,
  instanceIndexWidth: number,
): number {
  // It's possible to have an instanceIndexBar which exists but is empty,
  // i.e. GetNumElements() == 0, and no instancePrimvars.
  // In that case instanceCount should be 0, instead of 1, otherwise the
  // frustum culling shader might write out-of-bounds to the result buffer.
  // this is covered by testHdDrawBatching/EmptyDrawBatchTest
  const numInstances =
    instanceIndexBar ? instanceIndexBar.getNumElements() >>> 0 : 1
  const instanceCount =
    drawItemInstance.isVisible() ? Math.floor(numInstances / instanceIndexWidth) >>> 0 : 0
  return instanceCount
}

/** pipelineDrawBatch.cpp:565-596 */
function _AllocateTessFactorsBuffer(
  drawItem: HdStDrawItem | null,
  resourceRegistry: HdStResourceRegistry,
): HdStBufferResource | null {
  if (!drawItem) { return null }

  const indexBar = drawItem.getTopologyRange() as HdStBufferArrayRange | null
  if (!indexBar) { return null }

  const indexBuffer = indexBar.getResource(HdTokens.indices)
  if (!indexBuffer) { return null }

  const indexBufferHandle = indexBuffer.getHandle()
  if (!indexBufferHandle.Get()) { return null }

  const byteSizeOfTuple = HdDataSizeOfTupleType(indexBuffer.getTupleType())
  const byteSizeOfResource = indexBufferHandle.Get()!.getByteSizeOfResource()

  const numElements = Math.floor(byteSizeOfResource / byteSizeOfTuple)
  const numTessFactorsPerElement = 6

  return resourceRegistry.registerBufferResource(
    HdTokens.tessFactors,
    { type: HdType.HdTypeHalfFloat, count: numElements * numTessFactorsPerElement },
    HgiBufferUsageBits.HgiBufferUsageUniform)
}

////////////////////////////////////////////////////////////
// GPU Resource Binding
////////////////////////////////////////////////////////////

/** pipelineDrawBatch.cpp:1026-1060. Resources to Bind/Unbind for a drawItem */
export class _BindingState extends _DrawItemState {
  dispatchBuffer: HdStDispatchBuffer
  binder: HdSt_ResourceBinder
  glslProgram: HdStGLSLProgram
  shaders: HdStShaderCode[]
  geometricShader: HdSt_GeometricShader

  constructor(
    drawItem: HdStDrawItem,
    dispatchBuffer: HdStDispatchBuffer,
    binder: HdSt_ResourceBinder,
    glslProgram: HdStGLSLProgram,
    shaders: HdStShaderCode[],
    geometricShader: HdSt_GeometricShader,
  ) {
    super(drawItem)
    this.dispatchBuffer = dispatchBuffer
    this.binder = binder
    this.glslProgram = glslProgram
    this.shaders = shaders
    this.geometricShader = geometricShader
  }

  /** pipelineDrawBatch.cpp:1062-1083. Core resources needed for view
   *  transformation & frustum culling. */
  getBindingsForViewTransformation(bindingsDesc: HgiResourceBindingsDesc): void {
    bindingsDesc.debugName = 'PipelineDrawBatch.ViewTransformation'

    // Bind the constant buffer for the prim transformation and bounds.
    this.binder.getInterleavedBufferArrayBindingDesc(
      bindingsDesc, this.constantBar, _tokens.constantPrimvars)

    this.binder.getInterleavedBufferArrayBindingDesc(
      bindingsDesc, this.topVisBar, HdTokens.topologyVisibility)

    // Bind the instance buffers to support instance transformations.
    if (this.instanceIndexBar) {
      for (let level = 0; level < this.instancePrimvarBars.length; ++level) {
        this.binder.getInstanceBufferArrayBindingDesc(
          bindingsDesc, this.instancePrimvarBars[level]!, level)
      }
      this.binder.getBufferArrayBindingDesc(bindingsDesc, this.instanceIndexBar)
    }
  }

  /** pipelineDrawBatch.cpp:1085-1133. Core resources plus additional
   *  resources needed for drawing. */
  getBindingsForDrawing(
    bindingsDesc: HgiResourceBindingsDesc,
    tessFactorsBuffer: HdStBufferResource | null,
    bindTessFactors: boolean,
  ): void {
    this.getBindingsForViewTransformation(bindingsDesc)

    bindingsDesc.debugName = 'PipelineDrawBatch.Drawing'

    this.binder.getBufferArrayBindingDesc(bindingsDesc, this.indexBar)
    if (!this.geometricShader.isPrimTypePoints()) {
      this.binder.getBufferArrayBindingDesc(bindingsDesc, this.elementBar)
      this.binder.getBufferArrayBindingDesc(bindingsDesc, this.fvarBar)
    }
    this.binder.getBufferArrayBindingDesc(bindingsDesc, this.varyingBar)

    if (tessFactorsBuffer) {
      this.binder.getBufferBindingDesc(bindingsDesc,
        HdTokens.tessFactors,
        tessFactorsBuffer,
        tessFactorsBuffer.getOffset())
      if (bindTessFactors) {
        this.binder.getBufferBindingDesc(bindingsDesc,
          HdTokens.tessFactors,
          tessFactorsBuffer,
          tessFactorsBuffer.getOffset())
        const tessFactorBuffDesc = bindingsDesc.buffers[bindingsDesc.buffers.length - 1]!
        tessFactorBuffDesc.resourceType = HgiBindResourceType.HgiBindResourceTypeTessFactors
      }
    }

    for (const shader of this.shaders) {
      const shaderBar = shader.getShaderData() as HdStBufferArrayRange | null

      this.binder.getInterleavedBufferArrayBindingDesc(
        bindingsDesc, shaderBar, HdTokens.materialParams)

      const bindingRequests: HdStBindingRequest[] = []
      shader.addBindings(bindingRequests)
      for (const req of bindingRequests) {
        this.binder.getBindingRequestBindingDesc(bindingsDesc, req)
      }
      HdSt_TextureBinder.getBindingDescs(
        this.binder, bindingsDesc, shader.getNamedTextureHandles())
    }
  }
}

/** pipelineDrawBatch.cpp:1135-1180 */
export function _GetVertexBuffersForViewTransformation(state: _BindingState): HgiVertexBufferDescVector {
  // Bind the dispatchBuffer drawing coordinate resource views
  const dispatchBar = state.dispatchBuffer.getBufferArrayRange()
  const dispatchBufferStride =
    state.dispatchBuffer.getCommandNumUints() * _sizeofUint32

  const attrDescVector: HgiVertexAttributeDesc[] = []

  for (const [name, resource] of dispatchBar.getResources()) {
    const binding = state.binder.getBinding(name as TfToken)
    const tupleType: HdTupleType = resource.getTupleType()

    if (binding.getType() === HdStBinding.DRAW_INDEX_INSTANCE) {
      const attrDesc = new HgiVertexAttributeDesc()
      attrDesc.format = HdStHgiConversions.getHgiVertexFormat(tupleType.type)
      attrDesc.offset = resource.getOffset()
      attrDesc.shaderBindLocation = binding.getLocation()
      attrDescVector.push(attrDesc)
    } else if (binding.getType() === HdStBinding.DRAW_INDEX_INSTANCE_ARRAY) {
      for (let i = 0; i < tupleType.count; ++i) {
        const attrDesc = new HgiVertexAttributeDesc()
        attrDesc.format = HdStHgiConversions.getHgiVertexFormat(tupleType.type)
        attrDesc.offset = resource.getOffset() + i * _sizeofUint32
        attrDesc.shaderBindLocation = binding.getLocation() + i
        attrDescVector.push(attrDesc)
      }
    }
  }

  // All drawing coordinate resources are sourced from the same buffer.
  const bufferDesc = new HgiVertexBufferDesc()
  bufferDesc.bindingIndex = 0
  bufferDesc.vertexAttributes = attrDescVector
  bufferDesc.vertexStepFunction = HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerDrawCommand
  bufferDesc.vertexStride = dispatchBufferStride

  return [bufferDesc]
}

/** pipelineDrawBatch.cpp:1182-1221 */
export function _GetVertexBuffersForDrawing(state: _BindingState): HgiVertexBufferDescVector {
  // Bind the vertexBar resources
  const vertexBufferDescVector = _GetVertexBuffersForViewTransformation(state)

  if (state.vertexBar) {
    for (const [name, resource] of state.vertexBar.getResources()) {
      const binding = state.binder.getBinding(name as TfToken)
      const tupleType = resource.getTupleType()

      if (binding.getType() === HdStBinding.VERTEX_ATTR) {
        const attrDesc = new HgiVertexAttributeDesc()
        attrDesc.format = HdStHgiConversions.getHgiVertexFormat(tupleType.type)
        attrDesc.offset = resource.getOffset()
        attrDesc.shaderBindLocation = binding.getLocation()

        // Each vertexBar resource is sourced from a distinct buffer.
        const bufferDesc = new HgiVertexBufferDesc()
        bufferDesc.bindingIndex = vertexBufferDescVector.length
        bufferDesc.vertexAttributes = [attrDesc]
        if (state.geometricShader.getUseMetalTessellation()) {
          bufferDesc.vertexStepFunction =
            HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerPatchControlPoint
        } else {
          bufferDesc.vertexStepFunction =
            HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerVertex
        }
        bufferDesc.vertexStride = HdDataSizeOfTupleType(tupleType)
        vertexBufferDescVector.push(bufferDesc)
      }
    }
  }

  return vertexBufferDescVector
}

/** pipelineDrawBatch.cpp:1223-1237 */
function _GetVertexBufferBindingsForViewTransformation(
  bindings: HgiVertexBufferBindingVector,
  state: _BindingState,
): number {
  // Bind the dispatchBuffer drawing coordinate resource views
  const resource = state.dispatchBuffer.getEntireResource()

  bindings.push(new HgiVertexBufferBinding(resource.getHandle(),
    resource.getOffset() >>> 0,
    0))

  return bindings.length >>> 0
}

/** pipelineDrawBatch.cpp:1239-1263 */
export function _GetVertexBufferBindingsForDrawing(
  bindings: HgiVertexBufferBindingVector,
  state: _BindingState,
): number {
  let nextBinding = // continue binding subsequent locations
    _GetVertexBufferBindingsForViewTransformation(bindings, state)

  if (state.vertexBar) {
    for (const [name, resource] of state.vertexBar.getResources()) {
      const binding = state.binder.getBinding(name as TfToken)

      if (binding.getType() === HdStBinding.VERTEX_ATTR) {
        bindings.push(new HgiVertexBufferBinding(resource.getHandle(),
          resource.getOffset() >>> 0,
          nextBinding))
        nextBinding++
      }
    }
  }

  return nextBinding
}

////////////////////////////////////////////////////////////
// GPU Drawing
////////////////////////////////////////////////////////////

/** pipelineDrawBatch.cpp:1271-1312 */
function _GetDrawPipeline(
  renderPassState: HdStRenderPassState,
  resourceRegistry: HdStResourceRegistry,
  state: _BindingState,
  firstDrawBatch: boolean,
  ahead = false,
): HgiGraphicsPipelineHandle {
  // Drawing pipeline is compatible as long as the shader and
  // pipeline state are the same.
  const programHandle = state.glslProgram.getProgram()

  // ArchHash64(__FUNCTION__) salt and the program handle pointer: a cache
  // key only (see the file header).
  const salt = '_GetDrawPipeline'
  let hash = TfHashCombine(salt)
  hash = TfHashCombine(hash, BigInt(programHandle.getId()))
  hash = TfHashCombine(hash, renderPassState.getGraphicsPipelineHash(
    state.geometricShader, firstDrawBatch))

  const pipelineInstance = resourceRegistry.registerGraphicsPipeline(hash)

  if (pipelineInstance.isFirstInstance()) {
    const pipeDesc = new HgiGraphicsPipelineDesc()

    renderPassState.initGraphicsPipelineDesc(pipeDesc,
      state.geometricShader,
      firstDrawBatch)

    pipeDesc.shaderProgram = state.glslProgram.getProgram()
    pipeDesc.vertexBuffers = _GetVertexBuffersForDrawing(state)
    pipeDesc.debugName = 'Draw Pipeline'

    const hgi = resourceRegistry.getHgi()
    // PLATFORM-DIVERGENCE(hdst-compile-ahead): created ahead of its first
    // draw (compileDrawingProgramAhead), in the background where the Hgi
    // can (hgiwebgpu-pipeline-ahead).
    const createAhead = (hgi as { _createGraphicsPipelineAhead?(desc: HgiGraphicsPipelineDesc): HgiGraphicsPipelineHandle })._createGraphicsPipelineAhead
    const pso = ahead && createAhead ? createAhead.call(hgi, pipeDesc) : hgi.CreateGraphicsPipeline(pipeDesc)

    pipelineInstance.setValue(pso)
  }

  return pipelineInstance.GetValue()!
}

/** pipelineDrawBatch.cpp:1314-1359 */
function _GetPTCSPipeline(
  renderPassState: HdStRenderPassState,
  resourceRegistry: HdStResourceRegistry,
  state: _BindingState,
  firstDrawBatch: boolean,
): HgiGraphicsPipelineHandle {
  // PTCS pipeline is compatible as long as the shader and
  // pipeline state are the same.
  const programHandle = state.glslProgram.getProgram()

  const salt = '_GetPTCSPipeline'
  let hash = TfHashCombine(salt)
  hash = TfHashCombine(hash, BigInt(programHandle.getId()))
  hash = TfHashCombine(hash, renderPassState.getGraphicsPipelineHash(
    state.geometricShader, firstDrawBatch))

  const pipelineInstance = resourceRegistry.registerGraphicsPipeline(hash)

  if (pipelineInstance.isFirstInstance()) {
    const pipeDesc = new HgiGraphicsPipelineDesc()

    renderPassState.initGraphicsPipelineDesc(pipeDesc,
      state.geometricShader,
      firstDrawBatch)

    pipeDesc.rasterizationState.rasterizerEnabled = false

    pipeDesc.shaderProgram = state.glslProgram.getProgram()
    pipeDesc.vertexBuffers = _GetVertexBuffersForDrawing(state)
    pipeDesc.tessellationState.tessFactorMode =
      HgiTessellationState.TessFactorMode.TessControl
    pipeDesc.debugName = 'PTCS Pipeline'

    const hgi = resourceRegistry.getHgi()
    const pso = hgi.CreateGraphicsPipeline(pipeDesc)

    pipelineInstance.setValue(pso)
  }

  return pipelineInstance.GetValue()!
}

////////////////////////////////////////////////////////////
// GPU Frustum Culling
////////////////////////////////////////////////////////////

/** pipelineDrawBatch.cpp:1553-1585 */
function _GetCullPipeline(
  resourceRegistry: HdStResourceRegistry,
  state: _BindingState,
  byteSizeUniforms: number,
): HgiComputePipelineHandle {
  // Culling pipeline is compatible as long as the shader is the same.
  const programHandle = state.glslProgram.getProgram()
  // reinterpret_cast<uint64_t>(programHandle.Get()): the handle's id.
  const hash = programHandle.getId()

  const pipelineInstance = resourceRegistry.registerComputePipeline(hash)

  if (pipelineInstance.isFirstInstance()) {
    // Create a points primitive, vertex shader only pipeline that uses
    // a uniform block data for the 'cullParams' in the shader.
    const pipeDesc = new HgiComputePipelineDesc()
    pipeDesc.debugName = 'FrustumCulling Pipeline'
    pipeDesc.shaderProgram = programHandle
    pipeDesc.shaderConstantsDesc.byteSize = byteSizeUniforms

    const hgi = resourceRegistry.getHgi()
    const pipe = hgi.CreateComputePipeline(pipeDesc)

    pipelineInstance.setValue(pipe)
  }

  return pipelineInstance.GetValue()!
}

/** sizeof(Uniforms) of _ExecuteFrustumCull (pipelineDrawBatch.cpp:1683-1688):
 *  GfMatrix4f cullMatrix; GfVec2f drawRangeNDC; uint32_t drawCommandNumUints;
 *  uint32_t indexEnd. */
const _sizeofCullUniforms = 16 * 4 + 2 * 4 + 4 + 4

let _nextDebugId = 0

/** Drops a dispatch buffer reference (shared_ptr reset): the registry's
 *  GarbageCollectDispatchBuffers frees it. PLATFORM-DIVERGENCE(hd-bar-shared-ptr) */
function _ReleaseDispatchBuffer(dispatchBuffer: HdStDispatchBuffer | null): null {
  if (dispatchBuffer) dispatchBuffer._expired = true
  return null
}

/** pipelineDrawBatch.h:24-198. Drawing batch that is executed using an Hgi
 *  graphics pipeline.
 *
 *  A valid draw batch contains draw items that have the same
 *  primitive type and that share aggregated drawing resources,
 *  e.g. uniform and non uniform primvar buffers. */
export class HdSt_PipelineDrawBatch extends HdSt_DrawBatch {
  private _resourceRegistry: HdStResourceRegistry | null = null

  private _dispatchBuffer: HdStDispatchBuffer | null = null
  private _dispatchBufferCullInput: HdStDispatchBuffer | null = null

  private _tessFactorsBuffer: HdStBufferResource | null = null

  private _drawCommandBuffer: number[] = []
  private _drawCommandBufferDirty = false

  private _bufferArraysHash: bigint = 0n
  private _barElementOffsetsHash: bigint = 0n

  private _resultBuffer: HdStBufferResource | null = null

  private _numVisibleItems = 0
  private _numVisibleItemsPostCull = 0
  private _numTotalVertices = 0
  private _numTotalElements = 0

  private _cullingProgram = new HdSt_PipelineDrawBatchCullingProgram()
  /* The following two values are set before draw by
   * SetEnableTinyPrimCulling(). */
  private _useTinyPrimCulling = false
  private _dirtyCullingProgram = false

  /* The following four values are initialized in _Init(). */
  private _useDrawIndexed = true
  private _useInstancing = false
  private _useGpuCulling = false
  private _useInstanceCulling = false
  private readonly _allowGpuFrustumCulling: boolean
  private readonly _allowIndirectCommandEncoding: boolean

  private _instanceCountOffset = 0
  private _cullInstanceCountOffset = 0
  private _drawCoordOffset = 0
  private _patchBaseVertexByteOffset = 0

  private _indirectCommands: HgiIndirectCommands | null = null

  /** pipelineDrawBatch.cpp:69-98 */
  constructor(
    drawItemInstance: HdStDrawItemInstance,
    allowGpuFrustumCulling = true,
    allowIndirectCommandEncoding = true,
  ) {
    super(drawItemInstance)
    this._allowGpuFrustumCulling = allowGpuFrustumCulling
    this._allowIndirectCommandEncoding = allowIndirectCommandEncoding
    this._init(drawItemInstance)
  }

  /** pipelineDrawBatch.cpp:100-108 (the destructor) */
  destroy(): void {
    if (this._resultBuffer) {
      this._destroyBuffer(this._resultBuffer)
    }
    if (this._tessFactorsBuffer) {
      this._destroyBuffer(this._tessFactorsBuffer)
    }
    this._dispatchBuffer = _ReleaseDispatchBuffer(this._dispatchBuffer)
    this._dispatchBufferCullInput = _ReleaseDispatchBuffer(this._dispatchBufferCullInput)
  }

  /** pipelineDrawBatch.cpp:110-144 */
  protected override _init(drawItemInstance: HdStDrawItemInstance): void {
    super._init(drawItemInstance)
    drawItemInstance.setBatchIndex(0)
    drawItemInstance.setBatch(this)

    // remember buffer arrays version for dispatch buffer updating
    const drawItem = drawItemInstance.getDrawItem()
    this._bufferArraysHash = drawItem.getBufferArraysHash()
    // _barElementOffsetsHash is updated during _CompileBatch
    this._barElementOffsetsHash = 0n

    // determine drawing and culling config according to the first drawitem
    this._useDrawIndexed = Boolean(drawItem.getTopologyRange())
    this._useInstancing = Boolean(drawItem.getInstanceIndexRange())
    this._useGpuCulling = this._allowGpuFrustumCulling &&
      HdSt_PipelineDrawBatch.isEnabledGPUFrustumCulling()

    // note: _useInstancing condition is not necessary. it can be removed
    //       if we decide always to use instance culling.
    this._useInstanceCulling = this._useInstancing &&
      this._useGpuCulling && HdSt_PipelineDrawBatch.isEnabledGPUInstanceFrustumCulling()

    if (this._useGpuCulling) {
      if (this._cullingProgram.initialize(
        this._useDrawIndexed, this._useInstanceCulling, this._bufferArraysHash)) {
        this._dirtyCullingProgram = true
      }
    }

    TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
      '   Resetting dispatch buffer.\n')
    this._dispatchBuffer = _ReleaseDispatchBuffer(this._dispatchBuffer)
  }

  /** pipelineDrawBatch.cpp:146-153 */
  override setEnableTinyPrimCulling(tinyPrimCulling: boolean): void {
    if (this._useTinyPrimCulling !== tinyPrimCulling) {
      this._useTinyPrimCulling = tinyPrimCulling
      this._dirtyCullingProgram = true
    }
  }

  /** pipelineDrawBatch.cpp:155-161. Returns whether pipeline draw batching
   *  is enabled. */
  static isEnabled(hgi: Hgi): boolean {
    // We require Hgi resource generation.
    return HdSt_CodeGen.isEnabledHgiResourceGeneration(hgi)
  }

  /** pipelineDrawBatch.cpp:163-173. Returns whether to do frustum culling on
   *  the GPU */
  static isEnabledGPUFrustumCulling(): boolean {
    // Allow GPU frustum culling for PipelineDrawBatch to be disabled even
    // when other GPU frustum culling is enabled. Both switches must be true
    // for PipelineDrawBatch to use GPU frustum culling.
    const isEnabled =
      TfGetEnvSetting(HDST_ENABLE_PIPELINE_DRAW_BATCH_GPU_FRUSTUM_CULLING)
    return isEnabled && HdSt_IndirectDrawBatch.isEnabledGPUFrustumCulling()
  }

  /** pipelineDrawBatch.cpp:175-180. Returns whether to read back the count
   *  of visible items from the GPU. Disabled by default, since there is some
   *  performance penalty. */
  static isEnabledGPUCountVisibleInstances(): boolean {
    return HdSt_IndirectDrawBatch.isEnabledGPUCountVisibleInstances()
  }

  /** pipelineDrawBatch.cpp:182-187. Returns whether to do per-instance
   *  culling on the GPU */
  static isEnabledGPUInstanceFrustumCulling(): boolean {
    return HdSt_IndirectDrawBatch.isEnabledGPUInstanceFrustumCulling()
  }

  ////////////////////////////////////////////////////////////
  // GPU Command Buffer Preparation
  ////////////////////////////////////////////////////////////

  /** pipelineDrawBatch.cpp:600-878 */
  private _compileBatch(resourceRegistry: HdStResourceRegistry): void {
    if (this._drawItemInstances.length === 0) return

    const numDrawItemInstances = this._drawItemInstances.length

    const instancerNumLevels =
      this._drawItemInstances[0]!.getDrawItem().getInstancePrimvarNumLevels()

    const useMetalTessellation =
      this._drawItemInstances[0]!.getDrawItem()
        .getGeometricShader()!.getUseMetalTessellation()

    // Align drawing commands to 32 bytes for Metal.
    const uint32Alignment = useMetalTessellation ? 8 : 0

    // Get the layout of the command buffer we are building.
    const traits =
      _GetDrawCommandTraits(instancerNumLevels,
        this._useDrawIndexed,
        this._useInstanceCulling,
        uint32Alignment)

    const D = HdStDebugCodes.HDST_DRAW
    TfDebug.msg(D, '\nCompile Dispatch Buffer\n')
    TfDebug.msg(D, ` - numUInt32: ${traits.numUInt32}\n`)
    TfDebug.msg(D, ` - useDrawIndexed: ${Number(this._useDrawIndexed)}\n`)
    TfDebug.msg(D, ` - useInstanceCulling: ${Number(this._useInstanceCulling)}\n`)
    TfDebug.msg(D, ` - num draw items: ${numDrawItemInstances}\n`)

    this._drawCommandBuffer = new Array<number>(numDrawItemInstances * traits.numUInt32).fill(0)
    const cmd = this._drawCommandBuffer
    let cmdIt = 0
    const push = (v: number) => { cmd[cmdIt++] = v >>> 0 }

    // Count the number of visible items. We may actually draw fewer
    // items than this when GPU frustum culling is active.
    this._numVisibleItems = 0
    this._numVisibleItemsPostCull = 0
    this._numTotalElements = 0
    this._numTotalVertices = 0

    TfDebug.msg(D, ' - Processing Items:\n')
    this._barElementOffsetsHash = 0n
    for (let item = 0; item < numDrawItemInstances; ++item) {
      const drawItemInstance = this._drawItemInstances[item]!
      const drawItem = drawItemInstance.getDrawItem()

      this._barElementOffsetsHash =
        TfHashCombine(this._barElementOffsetsHash,
          drawItem.getElementOffsetsHash())

      const dc = new _DrawItemState(drawItem)

      // drawing coordinates.
      const modelDC = 0 // reserved for future extension
      const constantDC = _GetElementOffset(dc.constantBar)
      const vertexDC = _GetElementOffset(dc.vertexBar)
      const topVisDC = _GetElementOffset(dc.topVisBar)
      const elementDC = _GetElementOffset(dc.elementBar)
      const primitiveDC = _GetElementOffset(dc.indexBar)
      const fvarDC = _GetElementOffset(dc.fvarBar)
      const instanceIndexDC = _GetElementOffset(dc.instanceIndexBar)
      const shaderDC = _GetElementOffset(dc.shaderBar)
      const varyingDC = _GetElementOffset(dc.varyingBar)

      // 3 for triangles, 4 for quads, 6 for triquads, n for patches
      const numIndicesPerPrimitive =
        drawItem.getGeometricShader()!.getPrimitiveIndexSize()

      const baseVertex = vertexDC

      // Query fallback vertex count from geometric shader if the vertex bar
      // is empty
      const vertexCount = dc.vertexBar
        ? _GetElementCount(dc.vertexBar)
        : drawItem.getGeometricShader()!.getVertexCountFallback()

      // if delegate fails to get vertex primvars, it could be empty.
      // skip the drawitem to prevent drawing uninitialized vertices.
      const numElements =
        vertexCount !== 0 ? _GetElementCount(dc.indexBar) : 0

      const baseIndex = (primitiveDC * numIndicesPerPrimitive) >>> 0
      const indexCount = (numElements * numIndicesPerPrimitive) >>> 0

      const instanceCount =
        _GetInstanceCount(drawItemInstance,
          dc.instanceIndexBar,
          traits.instanceIndexWidth)

      // tessellated patches are encoded differently for Metal.
      const patchStart = primitiveDC
      const patchCount = numElements

      const baseInstance = item >>> 0

      // draw command
      if (!this._useDrawIndexed) {
        if (this._useInstanceCulling) {
          // _DrawNonIndexedInstanceCullCommand
          if (useMetalTessellation) {
            push(patchCount)
            push(instanceCount)
            push(patchStart)
            push(baseInstance)

            push(1)             /* cullCount (always 1) */
            push(instanceCount) /* cullInstanceCount */
            push(0)             /* cullBaseVertex (not used)*/
            push(baseInstance)  /* cullBaseInstance */
          } else {
            push(vertexCount)
            push(instanceCount)
            push(baseVertex)
            push(baseInstance)

            push(1)             /* cullCount (always 1) */
            push(instanceCount) /* cullInstanceCount */
            push(0)             /* cullBaseVertex (not used)*/
            push(baseInstance)  /* cullBaseInstance */
          }
        } else {
          // _DrawNonIndexedCommand
          if (useMetalTessellation) {
            push(patchCount)
            push(instanceCount)
            push(patchStart)
            push(baseInstance)
          } else {
            push(vertexCount)
            push(instanceCount)
            push(baseVertex)
            push(baseInstance)
          }
        }
      } else {
        if (this._useInstanceCulling) {
          // _DrawIndexedInstanceCullCommand
          if (useMetalTessellation) {
            push(patchCount)
            push(instanceCount)
            push(patchStart)
            push(baseInstance)
            push(baseVertex)

            push(1)             /* cullCount (always 1) */
            push(instanceCount) /* cullInstanceCount */
            push(0)             /* cullBaseVertex (not used)*/
            push(baseInstance)  /* cullBaseInstance */
          } else {
            push(indexCount)
            push(instanceCount)
            push(baseIndex)
            push(baseVertex)
            push(baseInstance)

            push(1)             /* cullCount (always 1) */
            push(instanceCount) /* cullInstanceCount */
            push(0)             /* cullBaseVertex (not used)*/
            push(baseInstance)  /* cullBaseInstance */
          }
        } else {
          // _DrawIndexedCommand
          if (useMetalTessellation) {
            push(patchCount)
            push(instanceCount)
            push(patchStart)
            push(baseInstance)
            push(baseVertex)
          } else {
            push(indexCount)
            push(instanceCount)
            push(baseIndex)
            push(baseVertex)
            push(baseInstance)
          }
        }
      }

      // drawingCoord0
      push(modelDC)
      push(constantDC)
      push(elementDC)
      push(primitiveDC)

      // drawingCoord1
      push(fvarDC)
      push(instanceIndexDC)
      push(shaderDC)
      push(vertexDC)

      // drawingCoord2
      push(topVisDC)
      push(varyingDC)

      // drawingCoordI
      for (let i = 0; i < dc.instancePrimvarBars.length; ++i) {
        const instanceDC = _GetElementOffset(dc.instancePrimvarBars[i]!)
        push(instanceDC)
      }

      // add padding and clear to 0
      for (let i = 0; i < traits.numUInt32Padding; ++i) {
        push(0)
      }

      if (TfDebug.isEnabled(D)) {
        // upstream writes this line to std::cout
        TfDebug.msg(D, '   - ' +
          cmd.slice(cmdIt - traits.numUInt32, cmdIt).map((v) => `${v} `).join('') + '\n')
      }

      this._numVisibleItems += instanceCount
      this._numTotalElements += numElements
      this._numTotalVertices += vertexCount
    }

    TfDebug.msg(D, ` - Num Visible: ${this._numVisibleItems}\n`)
    TfDebug.msg(D, ` - Total Elements: ${this._numTotalElements}\n`)
    TfDebug.msg(D, ` - Total Verts: ${this._numTotalVertices}\n`)

    // make sure we filled all
    TF_VERIFY(cmdIt === this._drawCommandBuffer.length)

    // cache the location of instanceCount and cullInstanceCount,
    // to be used during DrawItemInstanceChanged().
    this._instanceCountOffset = traits.instanceCount_offset / _sizeofUint32
    this._cullInstanceCountOffset = traits.cullInstanceCount_offset / _sizeofUint32

    // cache the offset needed for compute culling.
    this._drawCoordOffset = traits.drawingCoord0_offset / _sizeofUint32

    // cache the location of patchBaseVertex for tessellated patch drawing.
    this._patchBaseVertexByteOffset = traits.patchBaseVertex_offset

    // allocate draw dispatch buffer
    _ReleaseDispatchBuffer(this._dispatchBuffer)
    this._dispatchBuffer =
      resourceRegistry.registerDispatchBuffer(_tokens.drawIndirect,
        numDrawItemInstances,
        traits.numUInt32)

    // allocate tessFactors buffer for Metal tessellation
    if (useMetalTessellation &&
      this._drawItemInstances[0]!.getDrawItem()
        .getGeometricShader()!.isPrimTypePatches()) {
      this._tessFactorsBuffer = _AllocateTessFactorsBuffer(
        this._drawItemInstances[0]!.getDrawItem(),
        resourceRegistry)
    }

    // add drawing resource views
    _AddDrawResourceViews(this._dispatchBuffer, traits)

    // copy data
    this._dispatchBuffer.copyData(this._drawCommandBuffer)

    if (this._useGpuCulling) {
      // Make a duplicate of the draw dispatch buffer to use as an input
      // for GPU frustum culling (a single buffer cannot be bound for
      // both reading and writing). We use only the instanceCount
      // and drawingCoord parameters, but it is simplest to just make
      // a copy.
      _ReleaseDispatchBuffer(this._dispatchBufferCullInput)
      this._dispatchBufferCullInput =
        resourceRegistry.registerDispatchBuffer(_tokens.drawIndirectCull,
          numDrawItemInstances,
          traits.numUInt32)

      // copy data
      this._dispatchBufferCullInput.copyData(this._drawCommandBuffer)
    }
  }

  /** pipelineDrawBatch.cpp:880-947 */
  override validate(deepValidation: boolean): HdSt_DrawBatchValidationResult {
    if (!TF_VERIFY(this._drawItemInstances.length > 0)) {
      return HdSt_DrawBatchValidationResult.RebuildAllBatches
    }

    TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
      `Validating pipeline draw batch ${this._DebugId()} ` +
      `(deep validation = ${Number(deepValidation)})...\n`)

    // check the hash to see they've been reallocated/migrated or not.
    // note that we just need to compare the hash of the first item,
    // since drawitems are aggregated and ensure that they are sharing
    // same buffer arrays.
    const batchItem = this._drawItemInstances[0]!.getDrawItem()
    const bufferArraysHash = batchItem.getBufferArraysHash()

    if (this._bufferArraysHash !== bufferArraysHash) {
      this._bufferArraysHash = bufferArraysHash
      TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
        '   Buffer arrays hash changed. Need to rebuild batch.\n')
      return HdSt_DrawBatchValidationResult.RebuildBatch
    }

    // Deep validation is flagged explicitly when a drawItem has changes to
    // its BARs (e.g. buffer spec, aggregation, element offsets) or when its
    // material network shader or geometric shader changes.
    if (deepValidation) {
      // look through all draw items to be still compatible

      const numDrawItemInstances = this._drawItemInstances.length
      let barElementOffsetsHash = 0n

      for (let item = 0; item < numDrawItemInstances; ++item) {
        const drawItem = this._drawItemInstances[item]!.getDrawItem()

        if (!TF_VERIFY(drawItem.getGeometricShader())) {
          return HdSt_DrawBatchValidationResult.RebuildAllBatches
        }

        if (!this._isAggregated(batchItem, drawItem)) {
          TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
            '   Deep validation: Found draw item that fails aggregation' +
            ' test. Need to rebuild all batches.\n')
          return HdSt_DrawBatchValidationResult.RebuildAllBatches
        }

        barElementOffsetsHash = TfHashCombine(barElementOffsetsHash,
          drawItem.getElementOffsetsHash())
      }

      if (this._barElementOffsetsHash !== barElementOffsetsHash) {
        TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
          '   Deep validation: Element offsets hash mismatch.' +
          '   Rebuilding batch (even though only the dispatch buffer' +
          '   needs to be updated)\n.')
        return HdSt_DrawBatchValidationResult.RebuildBatch
      }
    }

    TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
      '   Validation passed. No need to rebuild batch.\n')
    return HdSt_DrawBatchValidationResult.ValidBatch
  }

  /** pipelineDrawBatch.cpp:949-955 */
  private _hasNothingToDraw(): boolean {
    return (this._useDrawIndexed && this._numTotalElements === 0) ||
      (!this._useDrawIndexed && this._numTotalVertices === 0) ||
      (this._numVisibleItems === 0)
  }

  /** PLATFORM-DIVERGENCE(hdst-compile-ahead): the dispatch buffer first, as
   *  prepareDraw builds it before the draw compiles the program (the
   *  program's bindings name it). */
  override compileDrawingProgramAhead(state: HdStRenderPassState, resourceRegistry: HdStResourceRegistry, firstDrawBatch = false): boolean {
    if (this._drawItemInstances.length === 0) return false
    if (!this._dispatchBuffer) {
      this._resourceRegistry = resourceRegistry
      this._compileBatch(resourceRegistry)
    }
    const compiled = super.compileDrawingProgramAhead(state, resourceRegistry, firstDrawBatch)
    // And the draw pipeline executeDraw binds (its direct draw path), whose
    // creation compiles the program for the GPU (hgiwebgpu-pipeline-ahead).
    const program = this._getDrawingProgram(state, resourceRegistry)
    if (!this._indirectCommands && !this._tessFactorsBuffer && program.isValid() && program.getGLSLProgram()) {
      const binding = new _BindingState(
        this._drawItemInstances[0]!.getDrawItem(),
        this._dispatchBuffer!,
        program.getBinder(),
        program.getGLSLProgram()!,
        program.getComposedShaders(),
        program.getGeometricShader()!)
      _GetDrawPipeline(state, resourceRegistry, binding, firstDrawBatch, /*ahead*/ true)
    }
    return compiled
  }

  /** pipelineDrawBatch.cpp:957-993. Prepare draw commands and apply view
   *  frustum culling for this batch. */
  override prepareDraw(
    _gfxCmds: HgiGraphicsCmds | null,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
  ): void {
    // Needed to cleanup resources in the destructor
    this._resourceRegistry = resourceRegistry

    if (!this._dispatchBuffer) {
      this._compileBatch(resourceRegistry)
    }

    if (this._hasNothingToDraw()) return

    // Do we have to update our dispatch buffer because drawitem instance
    // data has changed?
    // On the first time through, after batches have just been compiled,
    // the flag will be false because the resource registry will have already
    // uploaded the buffer.
    const updateBufferData = this._drawCommandBufferDirty
    if (updateBufferData) {
      this._dispatchBuffer!.copyData(this._drawCommandBuffer)
      this._drawCommandBufferDirty = false
    }

    if (this._useGpuCulling) {
      // Ignore passed in gfxCmds for now since GPU frustum culling
      // may still require multiple command buffer submissions.
      this._executeFrustumCull(updateBufferData,
        renderPassState, resourceRegistry)
    } else {
      this._numVisibleItemsPostCull = this._numVisibleItems
    }
  }

  /** pipelineDrawBatch.cpp:995-1018. Encode drawing commands for this
   *  batch. */
  override encodeDraw(
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    firstDrawBatch: boolean,
  ): void {
    if (this._hasNothingToDraw()) return

    const hgi = resourceRegistry.getHgi()
    const capabilities = hgi.getCapabilities()!

    // For ICBs on Apple Silicon, we do not support rendering to non-MSAA
    // surfaces, such as OIT as Volumetrics.  Disable in these cases.
    const drawICB =
      this._allowIndirectCommandEncoding &&
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsIndirectCommandBuffers) &&
      renderPassState.getMultiSampleEnabled()

    this._indirectCommands = null
    if (drawICB) {
      this._prepareIndirectCommandBuffer(renderPassState, resourceRegistry,
        firstDrawBatch)
    }
  }

  /** pipelineDrawBatch.cpp:1361-1450. Executes the drawing commands for
   *  this batch. */
  override executeDraw(
    gfxCmds: HgiGraphicsCmds,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    firstDrawBatch: boolean,
  ): void {
    if (!TF_VERIFY(this._drawItemInstances.length > 0)) return

    if (!TF_VERIFY(this._dispatchBuffer)) return

    if (this._hasNothingToDraw()) return

    const hgi = resourceRegistry.getHgi()
    const capabilities = hgi.getCapabilities()!

    if (this._tessFactorsBuffer) {
      // Metal tessellation tessFactors are computed by PTCS.
      this._executePTCS(gfxCmds, renderPassState, resourceRegistry,
        firstDrawBatch)
      // Finish computing tessFactors before drawing.
      gfxCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
    }

    //
    // If an indirect command buffer was created in the Prepare phase then
    // execute it here.  Otherwise render with the normal graphicsCmd path.
    //
    if (this._indirectCommands) {
      const encoder = hgi.getIndirectCommandEncoder()!
      encoder.executeDraw(gfxCmds, this._indirectCommands)

      hgi.destroyResourceBindings(this._indirectCommands.resourceBindings)
      this._indirectCommands = null
    } else {
      const program = this._getDrawingProgram(renderPassState,
        resourceRegistry)
      if (!TF_VERIFY(program.isValid())) return

      const state = new _BindingState(
        this._drawItemInstances[0]!.getDrawItem(),
        this._dispatchBuffer!,
        program.getBinder(),
        program.getGLSLProgram()!,
        program.getComposedShaders(),
        program.getGeometricShader()!)

      const psoHandle =
        _GetDrawPipeline(
          renderPassState,
          resourceRegistry,
          state,
          firstDrawBatch)

      gfxCmds.bindPipeline(psoHandle)

      const bindingsDesc = new HgiResourceBindingsDesc()
      state.getBindingsForDrawing(bindingsDesc,
        this._tessFactorsBuffer, /*bindTessFactors=*/true)

      const resourceBindings = hgi.createResourceBindings(bindingsDesc)
      gfxCmds.bindResources(resourceBindings)

      const bindings: HgiVertexBufferBindingVector = []
      _GetVertexBufferBindingsForDrawing(bindings, state)
      gfxCmds.bindVertexBuffers(bindings)

      // Drawing can be either direct or indirect. For either case,
      // the drawing batch and drawing program are prepared to resolve
      // drawing coordinate state indirectly, i.e. from buffer data.
      const drawIndirect =
        capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMultiDrawIndirect)

      if (drawIndirect) {
        this._executeDrawIndirect(gfxCmds, state.indexBar)
      } else {
        this._executeDrawImmediate(gfxCmds, state.indexBar)
      }

      hgi.destroyResourceBindings(resourceBindings)
    }

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.drawCalls)
    HdPerfLog.GetInstance().addCounter(HdTokens.itemsDrawn, this._numVisibleItemsPostCull)
  }

  /** pipelineDrawBatch.cpp:1452-1483 */
  private _executeDrawIndirect(
    gfxCmds: HgiGraphicsCmds,
    indexBar: HdStBufferArrayRange | null,
  ): void {
    const paramBuffer = this._dispatchBuffer!
      .getBufferArrayRange().getResource(HdTokens.drawDispatch)
    if (!TF_VERIFY(paramBuffer)) return

    if (!this._useDrawIndexed) {
      gfxCmds.drawIndirect(
        paramBuffer!.getHandle(),
        paramBuffer!.getOffset(),
        this._dispatchBuffer!.getCount(),
        paramBuffer!.getStride())
    } else {
      const indexBuffer = indexBar!.getResource(HdTokens.indices)
      if (!TF_VERIFY(indexBuffer)) return

      gfxCmds.drawIndexedIndirect(
        indexBuffer!.getHandle(),
        paramBuffer!.getHandle(),
        paramBuffer!.getOffset(),
        this._dispatchBuffer!.getCount(),
        paramBuffer!.getStride(),
        this._drawCommandBuffer,
        this._patchBaseVertexByteOffset)
    }
  }

  /** pipelineDrawBatch.cpp:1485-1547 */
  private _executeDrawImmediate(
    gfxCmds: HgiGraphicsCmds,
    indexBar: HdStBufferArrayRange | null,
  ): void {
    const drawCount = this._dispatchBuffer!.getCount() >>> 0
    const strideUInt32 = this._dispatchBuffer!.getCommandNumUints() >>> 0
    const buf = this._drawCommandBuffer

    if (!this._useDrawIndexed) {
      const C = _DrawNonIndexedCommand
      for (let i = 0; i < drawCount; ++i) {
        const at = (field: string) => buf[i * strideUInt32 + _uint32Index(C, field)]!

        if (at('common.count') && at('common.instanceCount')) {
          gfxCmds.draw(
            at('common.count'),
            at('common.baseVertex'),
            at('common.instanceCount'),
            at('common.baseInstance'))
        }
      }
    } else {
      const indexBuffer = indexBar!.getResource(HdTokens.indices)
      if (!TF_VERIFY(indexBuffer)) return

      const useMetalTessellation =
        this._drawItemInstances[0]!.getDrawItem()
          .getGeometricShader()!.getUseMetalTessellation()

      const C = _DrawIndexedCommand
      const M = _DrawIndexedCommandMetalPatch
      for (let i = 0; i < drawCount; ++i) {
        const at = (s: _Uint32Struct, field: string) =>
          buf[i * strideUInt32 + _uint32Index(s, field)]!

        const indexBufferByteOffset =
          (at(C, 'common.baseIndex') * _sizeofUint32) >>> 0

        if (at(C, 'common.count') && at(C, 'common.instanceCount')) {
          if (useMetalTessellation) {
            gfxCmds.drawIndexed(
              indexBuffer!.getHandle(),
              at(M, 'metalPatch.patchCount'),
              indexBufferByteOffset,
              at(M, 'metalPatch.baseVertex'),
              at(M, 'metalPatch.instanceCount'),
              at(M, 'metalPatch.baseInstance'))
          } else {
            gfxCmds.drawIndexed(
              indexBuffer!.getHandle(),
              at(C, 'common.count'),
              indexBufferByteOffset,
              at(C, 'common.baseVertex'),
              at(C, 'common.instanceCount'),
              at(C, 'common.baseInstance'))
          }
        }
      }
    }
  }

  ////////////////////////////////////////////////////////////
  // GPU Frustum Culling
  ////////////////////////////////////////////////////////////

  /** pipelineDrawBatch.cpp:1587-1658 */
  private _prepareIndirectCommandBuffer(
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    firstDrawBatch: boolean,
  ): void {
    const hgi = resourceRegistry.getHgi()
    // Divergence: upstream dereferences the encoder unchecked (see the file
    // header); an Hgi reporting IndirectCommandBuffers provides one.
    const encoder = hgi.getIndirectCommandEncoder()
    if (!TF_VERIFY(encoder, 'IndirectCommandBuffers without an encoder')) return

    const program = this._getDrawingProgram(renderPassState,
      resourceRegistry)
    if (!TF_VERIFY(program.isValid())) return

    const state = new _BindingState(
      this._drawItemInstances[0]!.getDrawItem(),
      this._dispatchBuffer!,
      program.getBinder(),
      program.getGLSLProgram()!,
      program.getComposedShaders(),
      program.getGeometricShader()!)

    const psoHandle =
      _GetDrawPipeline(
        renderPassState,
        resourceRegistry,
        state,
        firstDrawBatch)

    const bindingsDesc = new HgiResourceBindingsDesc()
    state.getBindingsForDrawing(bindingsDesc,
      this._tessFactorsBuffer, /*bindTessFactors=*/true)

    const resourceBindings = hgi.createResourceBindings(bindingsDesc)

    const vertexBindings: HgiVertexBufferBindingVector = []
    _GetVertexBufferBindingsForDrawing(vertexBindings, state)

    const paramBuffer = this._dispatchBuffer!
      .getBufferArrayRange().getResource(HdTokens.drawDispatch)!

    const computeCmds =
      resourceRegistry.getGlobalComputeCmds(HgiComputeDispatch.HgiComputeDispatchConcurrent)

    if (!this._useDrawIndexed) {
      this._indirectCommands = encoder!.encodeDraw(
        computeCmds,
        psoHandle,
        resourceBindings,
        vertexBindings,
        paramBuffer.getHandle(),
        paramBuffer.getOffset(),
        this._dispatchBuffer!.getCount(),
        paramBuffer.getStride())
    } else {
      const indexBuffer = state.indexBar!.getResource(HdTokens.indices)!

      this._indirectCommands = encoder!.encodeDrawIndexed(
        computeCmds,
        psoHandle,
        resourceBindings,
        vertexBindings,
        indexBuffer.getHandle(),
        paramBuffer.getHandle(),
        paramBuffer.getOffset(),
        this._dispatchBuffer!.getCount(),
        paramBuffer.getStride(),
        this._patchBaseVertexByteOffset)
    }
  }

  /** pipelineDrawBatch.cpp:1660-1786 */
  private _executeFrustumCull(
    updateBufferData: boolean,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
  ): void {
    // Disable GPU culling when instancing enabled and
    // not using instance culling.
    if (this._useInstancing && !this._useInstanceCulling) return

    // Bypass freezeCulling if the command buffer is dirty.
    const freezeCulling = TfDebug.isEnabled(HdDebugCodes.HD_FREEZE_CULL_FRUSTUM)
    if (freezeCulling && !updateBufferData) return

    if (updateBufferData) {
      this._dispatchBufferCullInput!.copyData(this._drawCommandBuffer)
    }

    this._createCullingProgram(resourceRegistry)
    if (!TF_VERIFY(this._cullingProgram.isValid())) return

    // We perform frustum culling in a compute shader, stomping the
    // instanceCount of each drawing command in the dispatch buffer to 0 for
    // primitives that are culled, skipping over other elements.

    const state = new _BindingState(
      this._drawItemInstances[0]!.getDrawItem(),
      this._dispatchBufferCullInput!,
      this._cullingProgram.getBinder(),
      this._cullingProgram.getGLSLProgram()!,
      this._cullingProgram.getComposedShaders(),
      this._cullingProgram.getGeometricShader()!)

    const hgi = resourceRegistry.getHgi()

    const psoHandle =
      _GetCullPipeline(resourceRegistry,
        state,
        _sizeofCullUniforms)

    const computeCmds =
      resourceRegistry.getGlobalComputeCmds(HgiComputeDispatch.HgiComputeDispatchConcurrent)
    computeCmds.pushDebugGroup('FrustumCulling Cmds')

    const bindingsDesc = new HgiResourceBindingsDesc()
    state.getBindingsForViewTransformation(bindingsDesc)

    if (HdSt_PipelineDrawBatch.isEnabledGPUCountVisibleInstances()) {
      this._beginGPUCountVisibleInstances(resourceRegistry)
      state.binder.getBufferBindingDesc(
        bindingsDesc,
        _tokens.drawIndirectResult,
        this._resultBuffer,
        this._resultBuffer!.getOffset())
    }

    // bind destination buffer
    // (using entire buffer bind to start from offset=0)
    state.binder.getBufferBindingDesc(
      bindingsDesc,
      _tokens.dispatchBuffer,
      this._dispatchBuffer!.getEntireResource(),
      this._dispatchBuffer!.getEntireResource().getOffset())

    // bind the read-only copy of the destination buffer for input.
    state.binder.getBufferBindingDesc(
      bindingsDesc,
      _tokens.drawCullInput,
      this._dispatchBufferCullInput!.getEntireResource(),
      this._dispatchBufferCullInput!.getEntireResource().getOffset())

    // HdSt_ResourceBinder::GetBufferBindingDesc() sets state usage
    // to all graphics pipeline stages. Instead we have to set all the
    // buffer stage usage to Compute.
    for (const bufDesc of bindingsDesc.buffers) {
      bufDesc.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
      bufDesc.writable = true
    }

    const resourceBindings = hgi.createResourceBindings(bindingsDesc)

    computeCmds.bindResources(resourceBindings)
    computeCmds.bindPipeline(psoHandle)

    const cullMatrix = new GfMatrix4f(renderPassState.getCullMatrix())
    const drawRangeNdc = renderPassState.getDrawingRangeNDC()

    const inputCount = this._dispatchBufferCullInput!.getCount()

    // set instanced cull parameters
    // struct Uniforms { GfMatrix4f cullMatrix; GfVec2f drawRangeNDC;
    //   uint32_t drawCommandNumUints; uint32_t indexEnd; }
    const cullParams = new ArrayBuffer(_sizeofCullUniforms)
    const f32 = new Float32Array(cullParams)
    const u32 = new Uint32Array(cullParams)
    f32.set(cullMatrix.GetArray(), 0)
    f32[16] = drawRangeNdc.get(0)
    f32[17] = drawRangeNdc.get(1)
    u32[18] = this._dispatchBuffer!.getCommandNumUints()
    u32[19] = inputCount

    computeCmds.setConstantValues(
      psoHandle, 0,
      _sizeofCullUniforms, cullParams)

    computeCmds.Dispatch(inputCount, 1)
    computeCmds.popDebugGroup()

    if (HdSt_PipelineDrawBatch.isEnabledGPUCountVisibleInstances()) {
      this._endGPUCountVisibleInstances(resourceRegistry)
    } else {
      this._numVisibleItemsPostCull = this._numVisibleItems
    }

    hgi.destroyResourceBindings(resourceBindings)
  }

  /** pipelineDrawBatch.cpp:1789-1854 */
  private _executePTCS(
    ptcsGfxCmds: HgiGraphicsCmds,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    firstDrawBatch: boolean,
  ): void {
    if (!TF_VERIFY(this._drawItemInstances.length > 0)) return

    if (!TF_VERIFY(this._dispatchBuffer)) return

    if (this._hasNothingToDraw()) return

    const capabilities = resourceRegistry.getHgi().getCapabilities()!

    // Drawing can be either direct or indirect. For either case,
    // the drawing batch and drawing program are prepared to resolve
    // drawing coordinate state indirectly, i.e. from buffer data.
    const drawIndirect =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMultiDrawIndirect)
    const program = this._getDrawingProgram(renderPassState,
      resourceRegistry)
    if (!TF_VERIFY(program.isValid())) return

    const state = new _BindingState(
      this._drawItemInstances[0]!.getDrawItem(),
      this._dispatchBuffer!,
      program.getBinder(),
      program.getGLSLProgram()!,
      program.getComposedShaders(),
      program.getGeometricShader()!)

    const hgi = resourceRegistry.getHgi()

    const psoTessHandle =
      _GetPTCSPipeline(renderPassState,
        resourceRegistry,
        state,
        firstDrawBatch)

    ptcsGfxCmds.bindPipeline(psoTessHandle)

    const bindingsDesc = new HgiResourceBindingsDesc()
    state.getBindingsForDrawing(bindingsDesc,
      this._tessFactorsBuffer, /*bindTessFactors=*/false)

    const resourceBindings = hgi.createResourceBindings(bindingsDesc)
    ptcsGfxCmds.bindResources(resourceBindings)

    const bindings: HgiVertexBufferBindingVector = []
    _GetVertexBufferBindingsForDrawing(bindings, state)
    ptcsGfxCmds.bindVertexBuffers(bindings)

    if (drawIndirect) {
      this._executeDrawIndirect(ptcsGfxCmds, state.indexBar)
    } else {
      this._executeDrawImmediate(ptcsGfxCmds, state.indexBar)
    }

    hgi.destroyResourceBindings(resourceBindings)
  }

  /** pipelineDrawBatch.cpp:1856-1899 */
  override drawItemInstanceChanged(instance: HdStDrawItemInstance): void {
    // We need to check the visibility and update if needed
    if (!this._dispatchBuffer) return

    const batchIndex = instance.getBatchIndex()
    const commandNumUints = this._dispatchBuffer.getCommandNumUints()
    const numLevels = instance.getDrawItem().getInstancePrimvarNumLevels()
    const instanceIndexWidth = numLevels + 1

    // When non-instance culling is being used, cullcommand points the same
    // location as drawcommands. Then we update the same place twice, it
    // might be better than branching.
    const instanceCountIt =
      batchIndex * commandNumUints + this._instanceCountOffset
    const cullInstanceCountIt =
      batchIndex * commandNumUints + this._cullInstanceCountOffset

    const instanceIndexBar =
      instance.getDrawItem().getInstanceIndexRange() as HdStBufferArrayRange | null

    const newInstanceCount =
      _GetInstanceCount(instance, instanceIndexBar, instanceIndexWidth)

    TfDebug.msg(HdStDebugCodes.HDST_DRAW,
      `\nInstance Count changed: ${this._drawCommandBuffer[instanceCountIt]} -> ` +
      `${newInstanceCount}\n`)

    // Update instance count and overall count of visible items.
    if (newInstanceCount !== this._drawCommandBuffer[instanceCountIt]) {
      this._numVisibleItems += (newInstanceCount - this._drawCommandBuffer[instanceCountIt]!)
      this._drawCommandBuffer[instanceCountIt] = newInstanceCount
      this._drawCommandBuffer[cullInstanceCountIt] = newInstanceCount
      this._drawCommandBufferDirty = true
    }
  }

  /** pipelineDrawBatch.cpp:1901-1930 */
  private _beginGPUCountVisibleInstances(resourceRegistry: HdStResourceRegistry): void {
    if (!this._resultBuffer) {
      const tupleType: HdTupleType = { type: HdType.HdTypeInt32, count: 1 }

      this._resultBuffer =
        resourceRegistry.registerBufferResource(
          _tokens.drawIndirectResult, tupleType,
          HgiBufferUsageBits.HgiBufferUsageStorage,
          'PipelineDrawBatch Visible Instances')
    }

    // Reset visible item count
    const count = new Int32Array([0])
    const blitCmds = resourceRegistry.getGlobalBlitCmds()
    const op = new HgiBufferCpuToGpuOp()
    op.cpuSourceBuffer = count
    op.sourceByteOffset = 0
    op.gpuDestinationBuffer = this._resultBuffer.getHandle()
    op.destinationByteOffset = 0
    op.byteSize = count.byteLength
    blitCmds.copyBufferCpuToGpu(op)

    // For now we need to submit here, because there gfx commands after
    // _BeginGPUCountVisibleInstances that rely on this having executed on GPU.
    void resourceRegistry.submitBlitWork()
  }

  /** pipelineDrawBatch.cpp:1932-1956. The result is
   *  _numVisibleItemsPostCull, upstream's out-parameter. */
  private _endGPUCountVisibleInstances(resourceRegistry: HdStResourceRegistry): void {
    // Submit and wait for all the work recorded up to this point.
    // The GPU work must complete before we can read-back the GPU buffer.
    void resourceRegistry.submitComputeWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

    const count = new Int32Array([0])

    // Submit GPU buffer read back
    const copyOp = new HgiBufferGpuToCpuOp()
    copyOp.byteSize = count.byteLength
    copyOp.cpuDestinationBuffer = count
    copyOp.destinationByteOffset = 0
    copyOp.gpuSourceBuffer = this._resultBuffer!.getHandle()
    copyOp.sourceByteOffset = 0

    const blitCmds = resourceRegistry.getGlobalBlitCmds()
    blitCmds.copyBufferGpuToCpu(copyOp)
    const done = resourceRegistry.submitBlitWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

    // PLATFORM-DIVERGENCE(hdst-gpu-count-visible-readback): pxr/imaging/hdSt/pipelineDrawBatch.cpp:1937-1955 blocks until the GPU finishes and returns the count. WebGPU reads a buffer back only through the asynchronous GPUBuffer.mapAsync, and Hgi submission returns a promise here (hdst-readbuffer-sync), so the count is the pre-cull count until the read-back resolves; an ExecuteDraw after that adds the read-back count.
    this._numVisibleItemsPostCull = this._numVisibleItems
    void done.then(() => {
      this._numVisibleItemsPostCull = count[0]!
    })
  }

  /** pipelineDrawBatch.cpp:1958-1969 */
  private _destroyBuffer(bufferResource: HdStBufferResource): void {
    if (!TF_VERIFY(bufferResource) || !TF_VERIFY(this._resourceRegistry)) {
      return
    }

    const buffer: HgiBufferHandle = bufferResource.getHandle()
    this._resourceRegistry!.getHgi().destroyBuffer(buffer)
    bufferResource.setAllocation(new HgiHandle(), 0)
  }

  /** pipelineDrawBatch.cpp:1971-2000 */
  private _createCullingProgram(resourceRegistry: HdStResourceRegistry): void {
    if (!this._cullingProgram.getGLSLProgram() || this._dirtyCullingProgram) {
      // Create a culling compute shader key
      const shaderKey = new HdSt_CullingComputeShaderKey(this._useInstanceCulling,
        this._useTinyPrimCulling,
        HdSt_PipelineDrawBatch.isEnabledGPUCountVisibleInstances())

      // access the drawing coord from the drawCullInput buffer
      const drawingCoordBufferBinding =
        new HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding(
          _tokens.drawCullInput,
          this._drawCoordOffset >>> 0,
          this._dispatchBuffer!.getCommandNumUints() >>> 0)

      // sharing the culling geometric shader for the same configuration.
      const cullShader = HdSt_GeometricShader.create(shaderKey, resourceRegistry)
      this._cullingProgram.setDrawingCoordBufferBinding(drawingCoordBufferBinding)
      this._cullingProgram.setGeometricShader(cullShader)

      this._cullingProgram.compileShader(this._drawItemInstances[0]!.getDrawItem(),
        resourceRegistry,
        this._logShaderCacheLookup())

      this._dirtyCullingProgram = false
    }
  }

  /** The `%p` of upstream's debug messages. */
  private readonly _debugId = ++_nextDebugId
  private _DebugId(): string {
    return `0x${this._debugId.toString(16)}`
  }

  // Test access to the batch state upstream keeps private.
  /** The draw command buffer (std::vector<uint32_t> _drawCommandBuffer). */
  _getDrawCommandBuffer(): readonly number[] { return this._drawCommandBuffer }
  /** The draw dispatch buffer. */
  _getDispatchBuffer(): HdStDispatchBuffer | null { return this._dispatchBuffer }
  /** The GPU culling input copy of the dispatch buffer. */
  _getDispatchBufferCullInput(): HdStDispatchBuffer | null { return this._dispatchBufferCullInput }
  /** The culling program. */
  _getCullingProgram(): HdSt_PipelineDrawBatchCullingProgram { return this._cullingProgram }
}

/** HdSt_PipelineDrawBatch::_CullingProgram (pipelineDrawBatch.h:100-120) */
export class HdSt_PipelineDrawBatchCullingProgram extends HdSt_DrawBatchDrawingProgram {
  private _useDrawIndexed = true
  private _useInstanceCulling = false
  private _bufferArrayHash: bigint = 0n

  /** pipelineDrawBatch.cpp:2002-2018 */
  initialize(useDrawIndexed: boolean, useInstanceCulling: boolean,
    bufferArrayHash: bigint): boolean {
    if (useDrawIndexed === this._useDrawIndexed &&
      useInstanceCulling === this._useInstanceCulling &&
      bufferArrayHash === this._bufferArrayHash) {
      return false
    }

    this._useDrawIndexed = useDrawIndexed
    this._useInstanceCulling = useInstanceCulling
    this._bufferArrayHash = bufferArrayHash
    return true
  }

  /** pipelineDrawBatch.cpp:2020-2042 */
  protected override _getCustomBindings(
    customBindings: HdStBindingRequest[],
    enableInstanceDraw: { value: boolean },
  ): void {
    if (!TF_VERIFY(enableInstanceDraw) ||
      !TF_VERIFY(customBindings)) return

    customBindings.push(new HdStBindingRequest(HdStBinding.SSBO,
      _tokens.drawIndirectResult))
    customBindings.push(new HdStBindingRequest(HdStBinding.SSBO,
      _tokens.dispatchBuffer))
    customBindings.push(new HdStBindingRequest(HdStBinding.UBO,
      _tokens.ulocCullParams))
    customBindings.push(new HdStBindingRequest(HdStBinding.SSBO,
      _tokens.drawCullInput))

    // set instanceDraw true if instanceCulling is enabled.
    // this value will be used to determine if glVertexAttribDivisor needs to
    // be enabled or not.
    enableInstanceDraw.value = this._useInstanceCulling
  }
}
