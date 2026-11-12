// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/colorCorrectionTask.cpp,
//  pxr/imaging/hdx/colorCorrectionTask.h,
//  pxr/imaging/hdx/shaders/colorCorrection.glslfx
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/colorCorrectionTask.{h,cpp} (OpenUSD 26.11.1).
//
// This is the build without OpenColorIO (PXR_OCIO_PLUGIN_ENABLED undefined,
// colorCorrectionTask.cpp:647-668): _GetUseOcio() is false, the OCIO resource
// preparation does nothing, and the shader applies colorCorrection.glslfx's
// sRGB curve.
//
// Divergences:
// - FAITHFULNESS-DEBT(hdx-ocio): OpenColorIO is not ported. Upstream's
//   non-OCIO build silently color corrects with sRGB when the openColorIO
//   mode is requested; here _Sync additionally posts a warning (once per
//   params change) so the substitution is diagnosed.
// - The WorkDispatcher (background OCIO resource preparation,
//   colorCorrectionTask.cpp:1096-1108) has nothing to run in the non-OCIO
//   build and is not ported.
// - Task dirty bits are passed by value and cleared by the render index.
// - HdxColorCorrectionTaskParams is a class (Clone() / Equals(); operator<<
//   not ported); VtValue holds it under HdxColorCorrectionTaskParamsType.
// - The destructor is Destroy(). Hgi Destroy* take handles by value; members
//   are reset to empty handles.
// - _PrintCompileErrors writes to the console (std::cout upstream).

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Vec4i as GfVec4i } from 'typescript-usd/gf'
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
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiCullMode,
  HgiFormat,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiPolygonMode,
  HgiResourceBindingsDesc,
  HgiSamplerAddressMode,
  HgiSamplerDesc,
  HgiSamplerFilter,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  HgiTextureBindDesc,
  HgiTextureUsageBits,
  HgiVertexAttributeDesc,
  HgiVertexBufferBinding,
  HgiVertexBufferDesc,
  HgiWinding,
  type HgiBufferHandle,
  type HgiGraphicsCmds,
  type HgiGraphicsPipelineHandle,
  type HgiResourceBindingsHandle,
  type HgiSamplerHandle,
  type HgiShaderProgramHandle,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdxPackageColorCorrectionShader } from './package.ts'
import { HdxTask } from './task.ts'
import { HdxAovTokens, HdxColorCorrectionTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** colorCorrectionTask.cpp:32-37 */
const _tokens = {
  colorCorrectionVertex: TfToken('ColorCorrectionVertex'),
  colorCorrectionFragment: TfToken('ColorCorrectionFragment'),
  colorCorrectionShader: TfToken('colorCorrectionShader'),
}

/** colorCorrectionTask.cpp:39 */
const HDX_DEFAULT_LUT3D_SIZE_OCIO = 65

/** colorCorrectionTask.h:27-61. ColorCorrectionTask parameters.
 *
 *  `lut3dSizeOCIO`: We default to 65 (0-64) samples which works well with
 *  OCIO resampling. */
export class HdxColorCorrectionTaskParams {
  // Switch between HdColorCorrectionTokens.
  // We default to 'disabled' to be backwards compatible with clients that are
  // still running with sRGB buffers.
  colorCorrectionMode: TfToken = HdxColorCorrectionTokens.disabled

  // 'display', 'view', 'colorspace' and 'look' are options the client may
  // supply to configure OCIO. If one is not provided the default values
  // is substituted. You can find the values for these strings inside the
  // profile/config .ocio file.
  displayOCIO = ''
  viewOCIO = ''
  colorspaceOCIO = ''
  looksOCIO = ''

  // The width, height and depth used for the GPU LUT 3d texture.
  lut3dSizeOCIO = HDX_DEFAULT_LUT3D_SIZE_OCIO

  // The name of the aov to color correct
  aovName: TfToken = TfToken('')

  Clone(): HdxColorCorrectionTaskParams {
    return Object.assign(new HdxColorCorrectionTaskParams(), this)
  }

  /** colorCorrectionTask.cpp:1228-1238 (operator==) */
  Equals(rhs: HdxColorCorrectionTaskParams): boolean {
    const lhs = this
    return lhs.colorCorrectionMode === rhs.colorCorrectionMode &&
      lhs.displayOCIO === rhs.displayOCIO &&
      lhs.viewOCIO === rhs.viewOCIO &&
      lhs.colorspaceOCIO === rhs.colorspaceOCIO &&
      lhs.looksOCIO === rhs.looksOCIO &&
      lhs.lut3dSizeOCIO === rhs.lut3dSizeOCIO &&
      lhs.aovName === rhs.aovName
  }
}
export const HdxColorCorrectionTaskParamsType = TfType.declare('HdxColorCorrectionTaskParams')

/** colorCorrectionTask.h:64-224. A task for performing color correction
 *  (and optionally color grading) on a color buffer to transform its color
 *  for display. */
export class HdxColorCorrectionTask extends HdxTask {
  private _params = new HdxColorCorrectionTaskParams()

  private _attachment0 = new HgiAttachmentDesc()
  private _indexBuffer: HgiBufferHandle = new HgiHandle()
  private _vertexBuffer: HgiBufferHandle = new HgiHandle()
  private _aovSampler: HgiSamplerHandle = new HgiHandle()

  private _shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  private _resourceBindings: HgiResourceBindingsHandle = new HgiHandle()
  private _pipeline: HgiGraphicsPipelineHandle = new HgiHandle()
  private _screenSize = new Float32Array(2)

  // _OCIOResources::constantValues (colorCorrectionTask.h:131)
  private _constantValues = new Uint8Array(0)

  /** colorCorrectionTask.cpp:48-55 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
    this._params.lut3dSizeOCIO = HDX_DEFAULT_LUT3D_SIZE_OCIO
  }

  /** colorCorrectionTask.cpp:57-101 (the destructor; the OCIO LUTs and
   *  buffers are never created in this build). */
  destroy(): void {
    const hgi = this._getHgi()
    if (this._aovSampler.isSet()) {
      hgi.destroySampler(this._aovSampler)
      this._aovSampler = new HgiHandle()
    }

    if (this._vertexBuffer.isSet()) {
      hgi.destroyBuffer(this._vertexBuffer)
      this._vertexBuffer = new HgiHandle()
    }

    if (this._indexBuffer.isSet()) {
      hgi.destroyBuffer(this._indexBuffer)
      this._indexBuffer = new HgiHandle()
    }

    if (this._shaderProgram.isSet()) {
      this._destroyShaderProgram()
    }

    if (this._resourceBindings.isSet()) {
      hgi.destroyResourceBindings(this._resourceBindings)
      this._resourceBindings = new HgiHandle()
    }

    if (this._pipeline.isSet()) {
      hgi.destroyGraphicsPipeline(this._pipeline)
      this._pipeline = new HgiHandle()
    }
  }

  /** colorCorrectionTask.cpp:103-118. Utility to check if OCIO should be
   *  used: never in a build without OCIO. */
  private _getUseOcio(): boolean {
    // Client can choose to use Hydra's build-in sRGB color correction or use
    // OpenColorIO for color correction in which case we insert extra OCIO code.
    return false
  }

  /** colorCorrectionTask.cpp:716-731 */
  private _setConstants(gfxCmds: HgiGraphicsCmds): void {
    const screenSizeBytes = this._screenSize.byteLength
    if (this._constantValues.length < screenSizeBytes) {
      const grown = new Uint8Array(screenSizeBytes)
      grown.set(this._constantValues)
      this._constantValues = grown
    }
    this._constantValues.set(new Uint8Array(this._screenSize.buffer, 0, screenSizeBytes))

    gfxCmds.setConstantValues(
      this._pipeline,
      HgiShaderStageBits.HgiShaderStageFragment,
      0,
      this._constantValues.length,
      this._constantValues)
  }

  /** colorCorrectionTask.cpp:749-882. Utility function to create the GL
   *  program for color correction. */
  private _createShaderResources(): boolean {
    if (this._shaderProgram.isSet()) {
      return true
    }

    // OCIO is not used in this build (_GetUseOcio()); the GLSLFX_USE_OCIO
    // branch (colorCorrectionTask.cpp:806-857) is not taken.
    const useOCIO = this._getUseOcio()
    void useOCIO

    const hgi = this._getHgi()
    const glslfx = new HioGlslfx(
      HdxPackageColorCorrectionShader(), HioGlslfxTokens.defVal)

    // Setup the vertex shader
    let vsCode = ''
    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = _tokens.colorCorrectionVertex
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(
      vertDesc, 'position', 'vec4')
    HgiShaderFunctionAddStageInput(
      vertDesc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(
      vertDesc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(
      vertDesc, 'uvOut', 'vec2')
    vsCode += glslfx.getSource(_tokens.colorCorrectionVertex)
    vertDesc.shaderCode = vsCode
    const vertFn = hgi.CreateShaderFunction(vertDesc)

    // Setup the fragment shader
    let fsCode = ''
    const fragDesc = new HgiShaderFunctionDesc()
    HgiShaderFunctionAddStageInput(
      fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddTexture(
      fragDesc, 'colorIn', /*bindIndex = */0)
    HgiShaderFunctionAddStageOutput(
      fragDesc, 'hd_FragColor', 'vec4', 'color')
    HgiShaderFunctionAddConstantParam(
      fragDesc, 'screenSize', 'vec2')
    fragDesc.debugName = _tokens.colorCorrectionFragment
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    fsCode += glslfx.getSource(_tokens.colorCorrectionFragment)

    fragDesc.shaderCode = fsCode
    const fragFn = hgi.CreateShaderFunction(fragDesc)

    // Setup the shader program
    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = _tokens.colorCorrectionShader
    programDesc.shaderFunctions.push(vertFn)
    programDesc.shaderFunctions.push(fragFn)
    this._shaderProgram = hgi.createShaderProgram(programDesc)

    if (!this._shaderProgram.Get()?.isValid() || !vertFn.Get()?.isValid() ||
      !fragFn.Get()?.isValid()) {
      TF_CODING_ERROR('Failed to create color correction shader')
      this._printCompileErrors()
      this._destroyShaderProgram()
      return false
    }

    return true
  }

  /** colorCorrectionTask.cpp:883-913. Utility function to create buffer
   *  resources. */
  private _createBufferResources(): boolean {
    if (this._vertexBuffer.isSet()) {
      return true
    }

    // A larger-than screen triangle made to fit the screen.
    const vertData = new Float32Array([
      -1, 3, 0, 1, 0, 2,
      -1, -1, 0, 1, 0, 0,
      3, -1, 0, 1, 2, 0])

    const hgi = this._getHgi()
    const vboDesc = new HgiBufferDesc()
    vboDesc.debugName = 'HdxColorCorrectionTask VertexBuffer'
    vboDesc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    vboDesc.initialData = vertData
    vboDesc.byteSize = vertData.byteLength
    vboDesc.vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT
    this._vertexBuffer = hgi.createBuffer(vboDesc)

    const indices = new Int32Array([0, 1, 2])

    const iboDesc = new HgiBufferDesc()
    iboDesc.debugName = 'HdxColorCorrectionTask IndexBuffer'
    iboDesc.usage = HgiBufferUsageBits.HgiBufferUsageIndex32
    iboDesc.initialData = indices
    iboDesc.byteSize = indices.byteLength
    this._indexBuffer = hgi.createBuffer(iboDesc)
    return true
  }

  /** colorCorrectionTask.cpp:915-952. Utility to create resource
   *  bindings. */
  private _createResourceBindings(aovTexture: HgiTextureHandle): boolean {
    // Begin the resource set
    const resourceDesc = new HgiResourceBindingsDesc()
    resourceDesc.debugName = 'ColorCorrection'

    const texBind0 = new HgiTextureBindDesc()
    texBind0.bindingIndex = 0
    texBind0.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
    texBind0.writable = false
    texBind0.textures.push(aovTexture)
    texBind0.samplers.push(this._aovSampler)
    resourceDesc.textures.push(texBind0)

    // If nothing has changed in the descriptor we avoid re-creating the
    // resource bindings object.
    const hgi = this._getHgi()
    if (this._resourceBindings.isSet()) {
      const desc = this._resourceBindings.Get()!.getDescriptor()
      if (desc.equals(resourceDesc)) {
        return true
      } else {
        hgi.destroyResourceBindings(this._resourceBindings)
        this._resourceBindings = new HgiHandle()
      }
    }

    this._resourceBindings = hgi.createResourceBindings(resourceDesc)

    return true
  }

  /** colorCorrectionTask.cpp:954-1029. Utility to create a pipeline. */
  private _createPipeline(aovTexture: HgiTextureHandle): boolean {
    const hgi = this._getHgi()
    const aovDesc = aovTexture.Get()!.getDescriptor()
    if (this._pipeline.isSet()) {
      if (this._attachment0.format === aovDesc.format) {
        return true
      }

      hgi.destroyGraphicsPipeline(this._pipeline)
      this._pipeline = new HgiHandle()
    }

    const desc = new HgiGraphicsPipelineDesc()
    desc.debugName = 'ColorCorrection Pipeline'
    desc.shaderProgram = this._shaderProgram

    // Describe the vertex buffer
    const posAttr = new HgiVertexAttributeDesc()
    posAttr.format = HgiFormat.HgiFormatFloat32Vec3
    posAttr.offset = 0
    posAttr.shaderBindLocation = 0

    const uvAttr = new HgiVertexAttributeDesc()
    uvAttr.format = HgiFormat.HgiFormatFloat32Vec2
    uvAttr.offset = Float32Array.BYTES_PER_ELEMENT * 4 // after posAttr
    uvAttr.shaderBindLocation = 1

    let bindSlots = 0

    const vboDesc = new HgiVertexBufferDesc()

    vboDesc.bindingIndex = bindSlots++
    vboDesc.vertexStride = Float32Array.BYTES_PER_ELEMENT * 6 // pos, uv
    vboDesc.vertexAttributes = [posAttr, uvAttr]

    desc.vertexBuffers.push(vboDesc)

    // Depth test and write can be off since we only colorcorrect the color aov.
    desc.depthState.depthTestEnabled = false
    desc.depthState.depthWriteEnabled = false

    // We don't use the stencil mask in this task.
    desc.depthState.stencilTestEnabled = false

    // Alpha to coverage would prevent any pixels that have an alpha of 0.0 from
    // being written. We want to color correct all pixels. Even background
    // pixels that were set with a clearColor alpha of 0.0.
    desc.multiSampleState.alphaToCoverageEnable = false

    // The MSAA on renderPipelineState has to match the render target.
    desc.multiSampleState.sampleCount = aovDesc.sampleCount
    desc.multiSampleState.multiSampleEnable =
      desc.multiSampleState.sampleCount > 1

    // Setup rasterization state
    desc.rasterizationState.cullMode = HgiCullMode.HgiCullModeBack
    desc.rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeFill
    desc.rasterizationState.winding = HgiWinding.HgiWindingCounterClockwise

    // Setup attachment descriptor
    this._attachment0.blendEnabled = false
    this._attachment0.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpDontCare
    this._attachment0.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    this._attachment0.format = aovDesc.format
    this._attachment0.usage = aovDesc.usage
    desc.colorAttachmentDescs.push(this._attachment0.clone())

    desc.shaderConstantsDesc.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
    desc.shaderConstantsDesc.byteSize = this._screenSize.byteLength

    this._pipeline = hgi.CreateGraphicsPipeline(desc)

    return true
  }

  /** colorCorrectionTask.cpp:1031-1044. Utility to create an AOV sampler. */
  private _createAovSampler(): boolean {
    if (this._aovSampler.isSet()) {
      return true
    }
    const sampDesc = new HgiSamplerDesc()
    sampDesc.magFilter = HgiSamplerFilter.HgiSamplerFilterLinear
    sampDesc.minFilter = HgiSamplerFilter.HgiSamplerFilterLinear
    sampDesc.addressModeU = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
    sampDesc.addressModeV = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
    this._aovSampler = this._getHgi().createSampler(sampDesc)
    return true
  }

  /** colorCorrectionTask.cpp:1046-1076. Apply color correction to the
   *  currently bound framebuffer. */
  private _applyColorCorrection(aovTexture: HgiTextureHandle): void {
    const hgi = this._getHgi()
    const dimensions = aovTexture.Get()!.getDescriptor().dimensions

    // Prepare graphics cmds.
    const gfxDesc = new HgiGraphicsCmdsDesc()
    gfxDesc.colorAttachmentDescs.push(this._attachment0.clone())
    gfxDesc.colorTextures.push(aovTexture)

    // Begin rendering
    const gfxCmds = hgi.createGraphicsCmds(gfxDesc)
    gfxCmds.pushDebugGroup('ColorCorrection')
    gfxCmds.bindResources(this._resourceBindings)
    gfxCmds.bindPipeline(this._pipeline)
    gfxCmds.bindVertexBuffers([new HgiVertexBufferBinding(this._vertexBuffer, 0, 0)])

    // Update viewport/screen size
    const vp = new GfVec4i(0, 0, dimensions.get(0), dimensions.get(1))
    this._screenSize[0] = dimensions.get(0)
    this._screenSize[1] = dimensions.get(1)
    this._setConstants(gfxCmds)
    gfxCmds.setViewport(vp)

    gfxCmds.drawIndexed(this._indexBuffer, 3, 0, 0, 1, 0)
    gfxCmds.popDebugGroup()

    // Done recording commands, submit work.
    void hgi.submitCmds(gfxCmds)
  }

  /** colorCorrectionTask.cpp:1077-1115 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxColorCorrectionTaskParams)
      if (params) {
        this._params = params.Clone()
        if (this._params.lut3dSizeOCIO <= 0) {
          TF_CODING_ERROR('Invalid OCIO LUT size.')
          this._params.lut3dSizeOCIO = 65
        }

        // FAITHFULNESS-DEBT(hdx-ocio): see the header.
        if (this._params.colorCorrectionMode === HdxColorCorrectionTokens.openColorIO) {
          TF_WARN('HdxColorCorrectionTask: OpenColorIO is not available in this ' +
            'build; color correcting with sRGB instead')
        }

        // Rebuild Hgi objects when ColorCorrection params change
        const hgi = this._getHgi()
        this._destroyShaderProgram()
        if (this._resourceBindings.isSet()) {
          hgi.destroyResourceBindings(this._resourceBindings)
          this._resourceBindings = new HgiHandle()
        }
        if (this._pipeline.isSet()) {
          hgi.destroyGraphicsPipeline(this._pipeline)
          this._pipeline = new HgiHandle()
        }

        // colorCorrectionTask.cpp:1100-1108: the background OCIO resource
        // preparation is a no-op in a build without OCIO (see the header).
      }
    }
  }

  /** colorCorrectionTask.cpp:1117-1121 */
  Prepare(_ctx: HdTaskContext, _renderIndex: HdRenderIndex): void {}

  /** colorCorrectionTask.cpp:1123-1183 */
  Execute(ctx: HdTaskContext): void {
    // We currently only color correct the color aov.
    if (this._params.aovName !== HdAovTokens.color) {
      return
    }

    // The color aov has the rendered results and we wish to
    // color correct it into colorIntermediate aov to ensure we do not
    // read from the same color target that we write into.
    if (!HdxTask._hasTaskContextData(ctx, HdAovTokens.color) ||
      !HdxTask._hasTaskContextData(ctx, HdxAovTokens.colorIntermediate)) {
      return
    }

    const aovTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.color)
    const aovTextureIntermediate =
      HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdxAovTokens.colorIntermediate)
    if (!aovTexture?.isSet() || !aovTextureIntermediate?.isSet()) {
      return
    }

    // We need to ensure the incoming color buffer is set to the correct layout
    // ie: Shader Read Only Optimal
    // since we are going to be sampling from this buffer and writing to a
    // color-corrected intermediate buffer.
    // However, the intermediate color-corrected buffer is in the correct layout
    // ie: Color Attachment Optimal.
    // So, no layout transition there.
    const oldLayout =
      aovTexture.Get()!.submitLayoutChange(HgiTextureUsageBits.HgiTextureUsageBitsShaderRead)

    if (!TF_VERIFY(this._createBufferResources())) {
      return
    }
    if (!TF_VERIFY(this._createAovSampler())) {
      return
    }
    if (!TF_VERIFY(this._createShaderResources())) {
      return
    }
    if (!TF_VERIFY(this._createResourceBindings(aovTexture))) {
      return
    }
    if (!TF_VERIFY(this._createPipeline(aovTextureIntermediate))) {
      return
    }

    this._applyColorCorrection(aovTextureIntermediate)

    // Before we ping-pong the buffers, we are going to ensure the color buffer
    // is converted to a Color Attachment Optimal layout.
    // Hence, preserving the state atomicity of this pass.
    // Otherwise, it's business as usual.
    aovTexture.Get()!.submitLayoutChange(oldLayout)

    // Toggle color and colorIntermediate
    this._toggleRenderTarget(ctx)
  }

  /** colorCorrectionTask.cpp:1185-1194. Destroy shader program and the
   *  shader functions it holds. */
  private _destroyShaderProgram(): void {
    if (!this._shaderProgram.isSet()) return

    const hgi = this._getHgi()
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      hgi.destroyShaderFunction(fn)
    }
    hgi.destroyShaderProgram(this._shaderProgram)
    this._shaderProgram = new HgiHandle()
  }

  /** colorCorrectionTask.cpp:1196-1205. Print shader compile errors. */
  private _printCompileErrors(): void {
    if (!this._shaderProgram.isSet()) return

    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      console.log(fn.Get()?.getCompileErrors())
    }
    console.log(this._shaderProgram.Get()!.getCompileErrors())
  }
}
