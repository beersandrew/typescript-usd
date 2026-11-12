// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/boundingBoxTask.cpp,
//  pxr/imaging/hdx/boundingBoxTask.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/boundingBoxTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index.
// - HdxBoundingBoxTaskParams is a class (Clone() / Equals(); operator<< not
//   ported); VtValue holds it under HdxBoundingBoxTaskParamsType.
// - The destructor is Destroy(). Hgi Destroy* take handles by value; members
//   are reset to empty handles.
// - _ShaderConstants (boundingBoxTask.cpp:39-46) is written as its std430
//   bytes: vec4 color, vec4 viewport, float dashSize (36 bytes).

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Transform as GfTransform,
  Vec4f as GfVec4f,
  type BBox3d as GfBBox3d,
  type Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { HioGlslfx, HioGlslfxTokens } from 'typescript-usd/hio'
import {
  AovTokens as HdAovTokens,
  ChangeTracker as HdChangeTracker,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  HgiAttachmentDesc,
  HgiBindResourceType,
  HgiBindingType,
  HgiBufferBindDesc,
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiDeviceCapabilitiesBits,
  HgiFormat,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiInterpolationType,
  HgiMemoryBarrierBits,
  HgiPrimitiveType,
  HgiResourceBindingsDesc,
  HgiSampleCount,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionDesc,
  HgiShaderFunctionParamDesc,
  HgiShaderKeywordTokens,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  HgiVertexAttributeDesc,
  HgiVertexBufferBinding,
  HgiVertexBufferDesc,
  type HgiBufferHandle,
  type HgiGraphicsCmds,
  type HgiGraphicsPipelineHandle,
  type HgiResourceBindingsHandle,
  type HgiShaderProgramHandle,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { RenderPassState as HdStRenderPassState } from 'typescript-usd/hdSt'
import { HdxPackageBoundingBoxShader } from './package.ts'
import { HdxTask } from './task.ts'
import { HdxTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** boundingBoxTask.cpp:30-35 */
const _tokens = {
  boundingBoxVertex: TfToken('BoundingBoxVertex'),
  boundingBoxFragment: TfToken('BoundingBoxFragment'),
  boundingBoxShader: TfToken('boundingBoxShader'),
}

/** boundingBoxTask.cpp:39-46: sizeof(_ShaderConstants). */
const _SHADER_CONSTANTS_BYTE_SIZE = 36

/** boundingBoxTask.h:28-48 */
export class HdxBoundingBoxTaskParams {
  aovName: TfToken = TfToken('')

  // Data provided by the application
  bboxes: GfBBox3d[] = []
  color = new GfVec4f(1, 1, 1, 1)
  dashSize = 3

  Clone(): HdxBoundingBoxTaskParams {
    const p = Object.assign(new HdxBoundingBoxTaskParams(), this)
    p.bboxes = [...this.bboxes]
    return p
  }

  /** boundingBoxTask.cpp:571-578 (operator==) */
  Equals(rhs: HdxBoundingBoxTaskParams): boolean {
    const lhs = this
    return lhs.aovName === rhs.aovName &&
      lhs.bboxes.length === rhs.bboxes.length &&
      lhs.bboxes.every((b, i) => (b as unknown as { equals(o: GfBBox3d): boolean }).equals(rhs.bboxes[i]!)) &&
      lhs.color.equals(rhs.color) &&
      lhs.dashSize === rhs.dashSize
  }
}
export const HdxBoundingBoxTaskParamsType = TfType.declare('HdxBoundingBoxTaskParams')

/** boundingBoxTask.cpp:356-367 */
function _MatchesFormatAndSampleCount(texture: HgiTextureHandle, format: HgiFormat,
  sampleCount: HgiSampleCount): boolean {
  if (texture && texture.isSet()) {
    const desc = texture.Get()!.getDescriptor()
    return format === desc.format && sampleCount === desc.sampleCount
  }
  return false
}

/** boundingBoxTask.cpp:458-469 */
function _GetWorldMatrixFromBBox(bbox: GfBBox3d): GfMatrix4d {
  // Convert bbox to a matrix that can be applied to the cube line geometry.
  const worldTransform = new GfTransform()
  const range = bbox.getRange()
  worldTransform.setScale(range.getMax().subtract(range.getMin()).getScaled(0.5))
  worldTransform.setTranslation(range.getMidpoint())
  return worldTransform.getMatrix().getMultiply(bbox.getMatrix())
}

const _clamp = (v: number) => Math.min(1, Math.max(0, v))

/** boundingBoxTask.h:51-135. A task for rendering bounding boxes. */
export class HdxBoundingBoxTask extends HdxTask {
  private _colorAttachment = new HgiAttachmentDesc()
  private _depthAttachment = new HgiAttachmentDesc()

  private _vertexBuffer: HgiBufferHandle = new HgiHandle()
  private _maxTransforms = 2
  private _transformsBuffer: HgiBufferHandle = new HgiHandle()
  private _shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  private _resourceBindings: HgiResourceBindingsHandle = new HgiHandle()
  private _pipeline: HgiGraphicsPipelineHandle = new HgiHandle()

  private _params = new HdxBoundingBoxTaskParams()

  /** boundingBoxTask.cpp:50-62 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** boundingBoxTask.cpp:64-85 (the destructor). */
  destroy(): void {
    const hgi = this._getHgi()
    if (this._vertexBuffer.isSet()) { hgi.destroyBuffer(this._vertexBuffer); this._vertexBuffer = new HgiHandle() }
    if (this._transformsBuffer.isSet()) {
      hgi.destroyBuffer(this._transformsBuffer); this._transformsBuffer = new HgiHandle()
    }
    if (this._shaderProgram.isSet()) this._destroyShaderProgram()
    if (this._resourceBindings.isSet()) {
      hgi.destroyResourceBindings(this._resourceBindings); this._resourceBindings = new HgiHandle()
    }
    if (this._pipeline.isSet()) {
      hgi.destroyGraphicsPipeline(this._pipeline); this._pipeline = new HgiHandle()
    }
  }

  /** boundingBoxTask.cpp:87-171. Utility function to create the shader for
   *  drawing dashed lines. */
  private _createShaderResources(): boolean {
    if (this._shaderProgram.isSet()) {
      return true
    }

    const hgi = this._getHgi()
    const glslfx = new HioGlslfx(HdxPackageBoundingBoxShader(), HioGlslfxTokens.defVal)

    // Using a constant buffer that contains data for both vertex and
    // fragment stages for simplicity.
    const addConstantParams = (stageDesc: HgiShaderFunctionDesc) => {
      HgiShaderFunctionAddConstantParam(stageDesc, 'color', 'vec4')
      HgiShaderFunctionAddConstantParam(stageDesc, 'viewport', 'vec4')
      HgiShaderFunctionAddConstantParam(stageDesc, 'dashSize', 'float')
    }

    // Setup the vertex shader
    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = _tokens.boundingBoxVertex
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(vertDesc, 'position', 'vec3')
    HgiShaderFunctionAddStageInput(vertDesc, 'hd_InstanceID', 'uint',
      HgiShaderKeywordTokens.hdInstanceID)
    HgiShaderFunctionAddStageOutput(vertDesc, 'gl_Position', 'vec4', 'position')
    const dashStartParam = new HgiShaderFunctionParamDesc()
    dashStartParam.nameInShader = 'dashStart'
    dashStartParam.type = 'vec2'
    dashStartParam.interpolation = HgiInterpolationType.HgiInterpolationFlat
    HgiShaderFunctionAddStageOutput(vertDesc, dashStartParam)
    addConstantParams(vertDesc)
    HgiShaderFunctionAddBuffer(vertDesc, 'worldViewProj', 'mat4', 1,
      HgiBindingType.HgiBindingTypeUniformArray, this._maxTransforms)
    vertDesc.shaderCode = glslfx.getSource(_tokens.boundingBoxVertex)
    const vertFn = hgi.CreateShaderFunction(vertDesc)

    // Setup the fragment shader
    const fragDesc = new HgiShaderFunctionDesc()
    HgiShaderFunctionAddStageInput(fragDesc, 'gl_FragCoord', 'vec4',
      HgiShaderKeywordTokens.hdFragCoord)
    HgiShaderFunctionAddStageInput(fragDesc, dashStartParam)
    HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')
    addConstantParams(fragDesc)
    fragDesc.debugName = _tokens.boundingBoxFragment
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    fragDesc.shaderCode = glslfx.getSource(_tokens.boundingBoxFragment)
    const fragFn = hgi.CreateShaderFunction(fragDesc)

    // Setup the shader program
    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = _tokens.boundingBoxShader
    programDesc.shaderFunctions.push(vertFn, fragFn)
    this._shaderProgram = hgi.createShaderProgram(programDesc)

    if (!this._shaderProgram.Get()?.isValid() || !vertFn.Get()?.isValid() ||
      !fragFn.Get()?.isValid()) {
      TF_CODING_ERROR('Failed to create bounding box shader')
      this._printCompileErrors()
      this._destroyShaderProgram()
      return false
    }

    return true
  }

  /** boundingBoxTask.cpp:173-230 */
  private _createBufferResources(): boolean {
    const hgi = this._getHgi()
    if (this._vertexBuffer.isSet() && this._transformsBuffer.isSet()) {
      if (this._params.bboxes.length <= this._maxTransforms) {
        return true
      }

      // Must re-create any objects that depend on the transform buffer size
      // directly and any objects that depend on those re-created objects.
      if (this._pipeline.isSet()) {
        hgi.destroyGraphicsPipeline(this._pipeline); this._pipeline = new HgiHandle()
      }
      this._destroyShaderProgram()
      if (this._resourceBindings.isSet()) {
        hgi.destroyResourceBindings(this._resourceBindings); this._resourceBindings = new HgiHandle()
      }
      hgi.destroyBuffer(this._transformsBuffer); this._transformsBuffer = new HgiHandle()
    }

    if (!this._vertexBuffer.isSet()) {
      // 12 edges of a cube with sides of length 2, centered at the origin
      const vertData = new Float32Array([
        -1, -1, -1, -1, -1, +1,
        -1, +1, -1, -1, +1, +1,
        +1, -1, -1, +1, -1, +1,
        +1, +1, -1, +1, +1, +1,

        -1, -1, -1, -1, +1, -1,
        +1, -1, -1, +1, +1, -1,
        -1, -1, +1, -1, +1, +1,
        +1, -1, +1, +1, +1, +1,

        -1, -1, -1, +1, -1, -1,
        -1, +1, -1, +1, +1, -1,
        -1, -1, +1, +1, -1, +1,
        -1, +1, +1, +1, +1, +1,
      ])

      const vboDesc = new HgiBufferDesc()
      vboDesc.debugName = 'HdxBoundingBoxTask VertexBuffer'
      vboDesc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
      vboDesc.initialData = vertData
      vboDesc.byteSize = vertData.byteLength
      vboDesc.vertexStride = 3 * Float32Array.BYTES_PER_ELEMENT
      this._vertexBuffer = hgi.createBuffer(vboDesc)
    }

    // Uniform array of transforms for the bboxes
    this._maxTransforms = this._params.bboxes.length

    const transformsDesc = new HgiBufferDesc()
    transformsDesc.debugName = 'HdxBoundingBoxTask TransformsBuffer'
    transformsDesc.usage = HgiBufferUsageBits.HgiBufferUsageUniform
    transformsDesc.byteSize = 16 * Float32Array.BYTES_PER_ELEMENT * this._maxTransforms
    this._transformsBuffer = hgi.createBuffer(transformsDesc)

    return true
  }

  /** boundingBoxTask.cpp:232-258 */
  private _createResourceBindings(): boolean {
    if (this._resourceBindings.isSet()) {
      return true
    }

    const resourceDesc = new HgiResourceBindingsDesc()
    resourceDesc.debugName = 'BoundingBox'

    // Transform array used only in the vertex shader.
    // Note this binds at index 1 since shader constants are also used, which
    // will bind at index 0 on some backends.
    const bufBind1 = new HgiBufferBindDesc()
    bufBind1.bindingIndex = 1
    bufBind1.resourceType = HgiBindResourceType.HgiBindResourceTypeUniformBuffer
    bufBind1.stageUsage = HgiShaderStageBits.HgiShaderStageVertex
    bufBind1.offsets.push(0)
    bufBind1.sizes.push(0)
    bufBind1.buffers.push(this._transformsBuffer)
    bufBind1.writable = false
    resourceDesc.buffers.push(bufBind1)

    this._resourceBindings = this._getHgi().createResourceBindings(resourceDesc)

    return true
  }

  /** boundingBoxTask.cpp:369-427 */
  private _createPipeline(colorTexture: HgiTextureHandle, depthTexture: HgiTextureHandle): boolean {
    const hgi = this._getHgi()
    if (this._pipeline.isSet()) {
      const sampleCount =
        this._pipeline.Get()!.getDescriptor().multiSampleState.sampleCount

      if (_MatchesFormatAndSampleCount(colorTexture, this._colorAttachment.format, sampleCount) &&
        _MatchesFormatAndSampleCount(depthTexture, this._depthAttachment.format, sampleCount)) {
        return true
      }

      hgi.destroyGraphicsPipeline(this._pipeline)
      this._pipeline = new HgiHandle()
    }

    const desc = new HgiGraphicsPipelineDesc()
    desc.debugName = 'BoundingBox Pipeline'
    desc.primitiveType = HgiPrimitiveType.HgiPrimitiveTypeLineList
    desc.shaderProgram = this._shaderProgram

    // Describe the vertex buffer
    const posAttr = new HgiVertexAttributeDesc()
    posAttr.format = HgiFormat.HgiFormatFloat32Vec3
    posAttr.offset = 0
    posAttr.shaderBindLocation = 0

    const vboDesc = new HgiVertexBufferDesc()
    vboDesc.bindingIndex = 0
    vboDesc.vertexStride = 3 * Float32Array.BYTES_PER_ELEMENT // pos
    vboDesc.vertexAttributes.push(posAttr)

    desc.vertexBuffers.push(vboDesc)

    // The MSAA on renderPipelineState has to match the render target.
    const colorDesc = colorTexture.Get()!.getDescriptor()
    const sampleCount = colorDesc.sampleCount
    desc.multiSampleState.multiSampleEnable = sampleCount !== HgiSampleCount.HgiSampleCount1
    desc.multiSampleState.sampleCount = sampleCount

    // Setup color attachment descriptor
    this._colorAttachment.format = colorDesc.format
    this._colorAttachment.usage = colorDesc.usage
    desc.colorAttachmentDescs.push(this._colorAttachment.clone())

    // Setup depth attachment descriptor
    const depthDesc = depthTexture.Get()!.getDescriptor()
    this._depthAttachment.format = depthDesc.format
    this._depthAttachment.usage = depthDesc.usage
    desc.depthAttachmentDesc = this._depthAttachment.clone()

    // Shared constants used in both vertex and fragment stages.
    desc.shaderConstantsDesc.stageUsage =
      HgiShaderStageBits.HgiShaderStageVertex | HgiShaderStageBits.HgiShaderStageFragment
    desc.shaderConstantsDesc.byteSize = _SHADER_CONSTANTS_BYTE_SIZE

    this._pipeline = hgi.CreateGraphicsPipeline(desc)

    return true
  }

  /** boundingBoxTask.cpp:429-456. Utility to get the view and projection
   *  matrix from the camera. */
  private _computeViewProjectionMatrix(hdStRenderPassState: HdStRenderPassState): GfMatrix4d {
    // Get the view and projection matrices.
    const view = hdStRenderPassState.getWorldToViewMatrix()
    let projection = hdStRenderPassState.getProjectionMatrix()

    const capabilities = this._getHgi().getCapabilities()!
    if (!capabilities.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne)) {
      // Different backends use different clip space depth ranges. The
      // codebase generally assumes an OpenGL-style depth of [-1, 1] when
      // computing projection matrices, so we must add an additional
      // conversion when the Hgi backend expects a [0, 1] depth range.
      const depthAdjustmentMat = new GfMatrix4d(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.5, 0.0,
        0.0, 0.0, 0.5, 1.0)
      projection = projection.getMultiply(depthAdjustmentMat)
    }

    return view.getMultiply(projection)
  }

  /** boundingBoxTask.cpp:471-529 */
  private _updateShaderConstants(gfxCmds: HgiGraphicsCmds, gfxViewport: GfVec4i,
    hdStRenderPassState: HdStRenderPassState): void {
    const hgi = this._getHgi()
    // View-Projection matrix is the same for either bbox
    const viewProj = this._computeViewProjectionMatrix(hdStRenderPassState)

    // Populate the transforms based on the provided bboxes
    const transforms = new Float32Array(16 * this._maxTransforms)
    for (let i = 0; i < this._maxTransforms; ++i) {
      const m = i < this._params.bboxes.length
        ? new GfMatrix4f(_GetWorldMatrixFromBBox(this._params.bboxes[i]!).getMultiply(viewProj))
        : new GfMatrix4f(1.0)
      for (let r = 0; r < 4; ++r) {
        for (let c = 0; c < 4; ++c) transforms[i * 16 + r * 4 + c] = m.getElement(r, c)
      }
    }

    // Upload the transform data to the GPU.
    const transformsStaging = this._transformsBuffer.Get()!.getCPUStagingAddress()!
    transformsStaging.set(new Uint8Array(transforms.buffer, 0, transforms.byteLength))

    const transformsBlit = new HgiBufferCpuToGpuOp()
    transformsBlit.cpuSourceBuffer = transformsStaging
    transformsBlit.sourceByteOffset = 0
    transformsBlit.gpuDestinationBuffer = this._transformsBuffer
    transformsBlit.destinationByteOffset = 0
    transformsBlit.byteSize = transforms.byteLength

    const blitCmds = hgi.createBlitCmds()
    blitCmds.copyBufferCpuToGpu(transformsBlit)
    blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
    void hgi.submitCmds(blitCmds)

    // Update and upload the other constant data.
    const color = this._params.color

    // dashSize smaller than 1 pixel disables any line pattern
    const dashSize = this._params.dashSize < 1.0 ? 0.0 : this._params.dashSize

    const constants = new Float32Array(_SHADER_CONSTANTS_BYTE_SIZE / 4)
    constants.set([_clamp(color.get(0)), _clamp(color.get(1)), _clamp(color.get(2)),
      _clamp(color.get(3)),
      gfxViewport.get(0), gfxViewport.get(1), gfxViewport.get(2), gfxViewport.get(3),
      dashSize])

    gfxCmds.setConstantValues(
      this._pipeline,
      HgiShaderStageBits.HgiShaderStageVertex | HgiShaderStageBits.HgiShaderStageFragment,
      0,
      _SHADER_CONSTANTS_BYTE_SIZE,
      constants)
  }

  /** boundingBoxTask.cpp:531-561. Create and submit the draw commands. */
  private _drawBBoxes(colorTexture: HgiTextureHandle, depthTexture: HgiTextureHandle,
    hdStRenderPassState: HdStRenderPassState): void {
    const hgi = this._getHgi()
    // Prepare graphics cmds.
    const gfxDesc = new HgiGraphicsCmdsDesc()
    gfxDesc.colorAttachmentDescs.push(this._colorAttachment.clone())
    gfxDesc.colorTextures.push(colorTexture)
    gfxDesc.depthAttachmentDesc = this._depthAttachment.clone()
    gfxDesc.depthTexture = depthTexture

    // Begin rendering
    const gfxCmds = hgi.createGraphicsCmds(gfxDesc)
    gfxCmds.pushDebugGroup('BoundingBox')
    gfxCmds.bindPipeline(this._pipeline)
    gfxCmds.bindVertexBuffers([new HgiVertexBufferBinding(this._vertexBuffer, 0, 0)])

    const viewport = hdStRenderPassState.computeViewport()
    gfxCmds.setViewport(viewport)

    this._updateShaderConstants(gfxCmds, viewport, hdStRenderPassState)
    gfxCmds.bindResources(this._resourceBindings)

    const instanceCount = this._params.bboxes.length
    gfxCmds.draw(24, 0, instanceCount, 0)

    gfxCmds.popDebugGroup()

    // Done recording commands, submit work.
    void hgi.submitCmds(gfxCmds)
  }

  /** boundingBoxTask.cpp:563-575 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxBoundingBoxTaskParams)
      if (params) this._params = params.Clone()
    }
  }

  /** boundingBoxTask.cpp:577-581 */
  Prepare(_ctx: HdTaskContext, _renderIndex: HdRenderIndex): void {}

  /** boundingBoxTask.cpp:583-626 */
  Execute(ctx: HdTaskContext): void {
    // Only draw the bounding boxes when rendering to the color aov
    if (this._params.bboxes.length === 0 || this._params.aovName !== HdAovTokens.color) {
      return
    }

    // We want to render the bounding boxes into the color aov
    // and have them respect the depth aov.
    if (!HdxTask._hasTaskContextData(ctx, HdAovTokens.color) ||
      !HdxTask._hasTaskContextData(ctx, HdAovTokens.depth)) {
      return
    }

    const colorTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.color)
    const depthTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.depth)
    if (!colorTexture?.isSet() || !depthTexture?.isSet()) {
      return
    }

    if (!TF_VERIFY(this._createBufferResources())) {
      return
    }
    if (!TF_VERIFY(this._createShaderResources())) {
      return
    }
    if (!TF_VERIFY(this._createResourceBindings())) {
      return
    }
    if (!TF_VERIFY(this._createPipeline(colorTexture, depthTexture))) {
      return
    }

    const renderPassState = HdxTask._getTaskContextData<unknown>(ctx, HdxTokens.renderPassState)
    if (!(renderPassState instanceof HdStRenderPassState)) {
      return
    }

    this._drawBBoxes(colorTexture, depthTexture, renderPassState)
  }

  /** boundingBoxTask.cpp:628-637 */
  private _destroyShaderProgram(): void {
    if (!this._shaderProgram.isSet()) return

    const hgi = this._getHgi()
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      hgi.destroyShaderFunction(fn)
    }
    hgi.destroyShaderProgram(this._shaderProgram)
    this._shaderProgram = new HgiHandle()
  }

  /** boundingBoxTask.cpp:639-648 */
  private _printCompileErrors(): void {
    if (!this._shaderProgram.isSet()) return

    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      console.log(fn.Get()?.getCompileErrors())
    }
    console.log(this._shaderProgram.Get()!.getCompileErrors())
  }
}
