// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/visualizeAovTask.cpp,
//  pxr/imaging/hdx/visualizeAovTask.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/visualizeAovTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - _UpdateMinMaxDepth (visualizeAovTask.cpp:476-509) reads the depth AOV
//   back on the CPU, waiting for the GPU (HdStTextureUtils::
//   HgiTextureReadback). WebGPU readback is asynchronous: the readback is
//   started each Execute and a frame draws with the min/max of the latest
//   completed readback (0, 0 until the first completes). So that a client
//   rendering to convergence (UsdImagingGLEngine::IsConverged) gets the
//   frame's own range, IsConverged (HdxTask's progressive interface, not
//   overridden upstream) is false while the drawn range is not that of the
//   latest completed readback, or none has completed.
// - Task dirty bits are passed by value and cleared by the render index.
// - HdxVisualizeAovTaskParams is a class (Clone() / Equals(); operator<< not
//   ported); VtValue holds it under HdxVisualizeAovTaskParamsType.
// - The destructor is Destroy(). Hgi Destroy* take handles by value; members
//   are reset to empty handles.

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Vec3i as GfVec3i, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { HioGlslfx, HioGlslfxTokens } from 'typescript-usd/hio'
import {
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
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
  HgiGetComponentCount,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiIsFloatFormat,
  HgiPolygonMode,
  HgiResourceBindingsDesc,
  HgiSampleCount,
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
  HgiTextureDesc,
  HgiTextureUsageBits,
  HgiVertexAttributeDesc,
  HgiVertexBufferBinding,
  HgiVertexBufferDesc,
  HgiWinding,
  type HgiBufferHandle,
  type HgiGraphicsPipelineHandle,
  type HgiResourceBindingsHandle,
  type HgiSamplerHandle,
  type HgiShaderProgramHandle,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { TextureUtils as HdStTextureUtils } from 'typescript-usd/hdSt'
import { HdxPackageVisualizeAovShader } from './package.ts'
import { HdxPresentTask } from './presentTask.ts'
import { HdxTask } from './task.ts'
import { HdxAovTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** visualizeAovTask.cpp:25-41 */
const _tokens = {
  // texture identifiers
  aovIn: TfToken('aovIn'),
  depthIn: TfToken('depthIn'),
  idIn: TfToken('idIn'),
  normalIn: TfToken('normalIn'),

  // shader mixins
  visualizeAovVertex: TfToken('VisualizeVertex'),
  visualizeAovFragmentDepth: TfToken('VisualizeFragmentDepth'),
  visualizeAovFragmentFallback: TfToken('VisualizeFragmentFallback'),
  visualizeAovFragmentId: TfToken('VisualizeFragmentId'),
  visualizeAovFragmentNormal: TfToken('VisualizeFragmentNormal'),

  empty: TfToken(''),
}

/** visualizeAovTask.h:151-157 */
export class HdxVisualizeAovTaskParams {
  aovName: TfToken = TfToken('')

  Clone(): HdxVisualizeAovTaskParams {
    return Object.assign(new HdxVisualizeAovTaskParams(), this)
  }

  /** visualizeAovTask.cpp:666-670 (operator==) */
  Equals(rhs: HdxVisualizeAovTaskParams): boolean {
    return this.aovName === rhs.aovName
  }
}
export const HdxVisualizeAovTaskParamsType = TfType.declare('HdxVisualizeAovTaskParams')

/** visualizeAovTask.h:69-76. Enumeration of visualization kernels. */
enum VizKernel {
  VizKernelDepth = 0,
  VizKernelId,
  VizKernelNormal,
  VizKernelFallback,
  VizKernelNone,
}

/** visualizeAovTask.cpp:89-97 */
function _IsIdAov(aovName: TfToken): boolean {
  return aovName === HdAovTokens.primId ||
    aovName === HdAovTokens.instanceId ||
    aovName === HdAovTokens.elementId ||
    aovName === HdAovTokens.edgeId ||
    aovName === HdAovTokens.pointId
}

/** visualizeAovTask.h:27-147. A task for visualizing non-color AOVs such as
 *  depth, normals, primId.
 *
 *  Different kernels are used depending on the AOV:
 *      Depth: Renormalized from the range [0.0, 1.0] to [min, max] depth to
 *             provide better contrast.
 *      Normals: Transform each component from [-1.0, 1.0] tp [0.0, 1.0] so
 *               negative components don't appear black.
 *      Ids: Integer ids are colorized by multiplying by a large prime and
 *           shuffling resulting bits so that neighboring ids are easily
 *           distinguishable.
 *      Other Aovs: A fallback kernel that transfers the AOV contents into a
 *                  float texture is used.
 *
 *  This task updates the 'color' entry of the task context with the colorized
 *  texture contents. */
export class HdxVisualizeAovTask extends HdxTask {
  // Kernel dependent resources
  private _outputTexture: HgiTextureHandle = new HgiHandle()
  private _outputTextureDimensions = new GfVec3i(0, 0, 0)
  private _outputAttachmentDesc = new HgiAttachmentDesc()
  private _shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  private _resourceBindings: HgiResourceBindingsHandle = new HgiHandle()
  private _pipeline: HgiGraphicsPipelineHandle = new HgiHandle()

  // Kernel independent resources
  private _indexBuffer: HgiBufferHandle = new HgiHandle()
  private _vertexBuffer: HgiBufferHandle = new HgiHandle()
  private _sampler: HgiSamplerHandle = new HgiHandle()
  private _screenSize = new Float32Array(2)
  private _minMaxDepth = new Float32Array(2)
  /** The min/max of the latest completed depth readback, and whether the
   *  last depth visualization drew with it (see the header). */
  private _readbackMinMaxDepth: Float32Array | null = null
  private _drawnMinMaxDepth: Float32Array | null = null
  private _vizKernel = VizKernel.VizKernelNone

  /** visualizeAovTask.cpp:45-54 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** Not overridden upstream (see the header): a depth visualization has
   *  converged once it drew with the range of the latest completed depth
   *  readback. */
  override isConverged(): boolean {
    if (this._vizKernel !== VizKernel.VizKernelDepth || !this._drawnMinMaxDepth) return true
    const readback = this._readbackMinMaxDepth
    return !!readback && readback[0] === this._drawnMinMaxDepth[0] &&
      readback[1] === this._drawnMinMaxDepth[1]
  }

  /** visualizeAovTask.cpp:56-87 (the destructor). */
  destroy(): void {
    const hgi = this._getHgi()
    // Kernel independent resources
    for (const key of ['_vertexBuffer', '_indexBuffer'] as const) {
      if (this[key].isSet()) { hgi.destroyBuffer(this[key]); this[key] = new HgiHandle() }
    }
    if (this._sampler.isSet()) { hgi.destroySampler(this._sampler); this._sampler = new HgiHandle() }

    // Kernel dependent resources
    if (this._outputTexture.isSet()) {
      hgi.destroyTexture(this._outputTexture); this._outputTexture = new HgiHandle()
    }
    if (this._shaderProgram.isSet()) this._destroyShaderProgram()
    if (this._resourceBindings.isSet()) {
      hgi.destroyResourceBindings(this._resourceBindings); this._resourceBindings = new HgiHandle()
    }
    if (this._pipeline.isSet()) {
      hgi.destroyGraphicsPipeline(this._pipeline); this._pipeline = new HgiHandle()
    }
  }

  /** visualizeAovTask.cpp:99-121. Returns true if the enum member was
   *  updated, indicating that the kernel to be used has changed. */
  private _updateVizKernel(aovName: TfToken): boolean {
    let vk = VizKernel.VizKernelFallback

    if (aovName === HdAovTokens.color) {
      vk = VizKernel.VizKernelNone
    } else if (HdAovHasDepthSemantic(aovName) ||
      HdAovHasDepthStencilSemantic(aovName)) {
      vk = VizKernel.VizKernelDepth
    } else if (_IsIdAov(aovName)) {
      vk = VizKernel.VizKernelId
    } else if (aovName === HdAovTokens.normal) {
      vk = VizKernel.VizKernelNormal
    }

    if (vk !== this._vizKernel) {
      this._vizKernel = vk
      return true
    }
    return false
  }

  /** visualizeAovTask.cpp:123-139. Returns a token used in sampling the
   *  texture based on the kernel used. */
  private _getTextureIdentifierForShader(): TfToken {
    switch (this._vizKernel) {
      case VizKernel.VizKernelDepth:
        return _tokens.depthIn
      case VizKernel.VizKernelId:
        return _tokens.idIn
      case VizKernel.VizKernelNormal:
        return _tokens.normalIn
      case VizKernel.VizKernelFallback:
        return _tokens.aovIn
      default:
        TF_CODING_ERROR('Unhandled kernel viz enumeration')
        return _tokens.empty
    }
  }

  /** visualizeAovTask.cpp:141-157. Returns the fragment shader mixin based
   *  on the kernel used. */
  private _getFragmentMixin(): TfToken {
    switch (this._vizKernel) {
      case VizKernel.VizKernelDepth:
        return _tokens.visualizeAovFragmentDepth
      case VizKernel.VizKernelId:
        return _tokens.visualizeAovFragmentId
      case VizKernel.VizKernelNormal:
        return _tokens.visualizeAovFragmentNormal
      case VizKernel.VizKernelFallback:
        return _tokens.visualizeAovFragmentFallback
      default:
        TF_CODING_ERROR('Unhandled kernel viz enumeration')
        return _tokens.empty
    }
  }

  /** visualizeAovTask.cpp:159-237 */
  private _createShaderResources(inputAovTextureDesc: HgiTextureDesc): boolean {
    if (this._shaderProgram.isSet()) {
      return true
    }

    const hgi = this._getHgi()
    const glslfx = new HioGlslfx(HdxPackageVisualizeAovShader(), HioGlslfxTokens.defVal)

    // Setup the vertex shader (same for all kernels)
    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = _tokens.visualizeAovVertex
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(vertDesc, 'position', 'vec4')
    HgiShaderFunctionAddStageInput(vertDesc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(vertDesc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(vertDesc, 'uvOut', 'vec2')
    vertDesc.shaderCode = glslfx.getSource(_tokens.visualizeAovVertex)
    const vertFn = hgi.CreateShaderFunction(vertDesc)

    // Setup the fragment shader based on the kernel used.
    const mixin = this._getFragmentMixin()
    const fragDesc = new HgiShaderFunctionDesc()
    HgiShaderFunctionAddStageInput(fragDesc, 'uvOut', 'vec2')

    HgiShaderFunctionAddTexture(
      fragDesc, this._getTextureIdentifierForShader(),
      /*bindIndex = */0, /*dimensions = */2, inputAovTextureDesc.format)

    HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')
    HgiShaderFunctionAddConstantParam(fragDesc, 'screenSize', 'vec2')

    if (this._vizKernel === VizKernel.VizKernelDepth) {
      HgiShaderFunctionAddConstantParam(fragDesc, 'minMaxDepth', 'vec2')
    }
    fragDesc.debugName = mixin
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    fragDesc.shaderCode = glslfx.getSource(mixin)
    const fragFn = hgi.CreateShaderFunction(fragDesc)

    // Setup the shader program
    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = mixin
    programDesc.shaderFunctions.push(vertFn, fragFn)
    this._shaderProgram = hgi.createShaderProgram(programDesc)

    if (!this._shaderProgram.Get()?.isValid() || !vertFn.Get()?.isValid() ||
      !fragFn.Get()?.isValid()) {
      TF_CODING_ERROR(`Failed to create AOV visualization shader ${mixin}`)
      this._printCompileErrors()
      this._destroyShaderProgram()
      return false
    }

    return true
  }

  /** visualizeAovTask.cpp:239-269 */
  private _createBufferResources(): boolean {
    if (this._vertexBuffer.isSet() && this._indexBuffer.isSet()) {
      return true
    }

    // A larger-than screen triangle made to fit the screen.
    const vertData = new Float32Array([
      -1, 3, 0, 1, 0, 2,
      -1, -1, 0, 1, 0, 0,
      3, -1, 0, 1, 2, 0])

    const hgi = this._getHgi()
    const vboDesc = new HgiBufferDesc()
    vboDesc.debugName = 'HdxVisualizeAovTask VertexBuffer'
    vboDesc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    vboDesc.initialData = vertData
    vboDesc.byteSize = vertData.byteLength
    vboDesc.vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT
    this._vertexBuffer = hgi.createBuffer(vboDesc)

    const indices = new Int32Array([0, 1, 2])

    const iboDesc = new HgiBufferDesc()
    iboDesc.debugName = 'HdxVisualizeAovTask IndexBuffer'
    iboDesc.usage = HgiBufferUsageBits.HgiBufferUsageIndex32
    iboDesc.initialData = indices
    iboDesc.byteSize = indices.byteLength
    this._indexBuffer = hgi.createBuffer(iboDesc)
    return true
  }

  /** visualizeAovTask.cpp:271-302 */
  private _createResourceBindings(inputAovTexture: HgiTextureHandle): boolean {
    // Begin the resource set
    const resourceDesc = new HgiResourceBindingsDesc()
    resourceDesc.debugName = 'HdxVisualizeAovTask resourceDesc'

    const texBind0 = new HgiTextureBindDesc()
    texBind0.bindingIndex = 0
    texBind0.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
    texBind0.writable = false
    texBind0.textures.push(inputAovTexture)
    texBind0.samplers.push(this._sampler)
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

  /** visualizeAovTask.cpp:304-371 */
  private _createPipeline(outputTextureDesc: HgiTextureDesc): boolean {
    if (this._pipeline.isSet()) {
      return true
    }

    const desc = new HgiGraphicsPipelineDesc()
    desc.debugName = 'AOV Visualiztion Pipeline'
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

    // Setup rasterization state
    desc.rasterizationState.cullMode = HgiCullMode.HgiCullModeBack
    desc.rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeFill
    desc.rasterizationState.winding = HgiWinding.HgiWindingCounterClockwise

    // Setup attachment descriptor
    this._outputAttachmentDesc.blendEnabled = false
    this._outputAttachmentDesc.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpDontCare
    this._outputAttachmentDesc.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    this._outputAttachmentDesc.format = outputTextureDesc.format
    this._outputAttachmentDesc.usage = outputTextureDesc.usage
    desc.colorAttachmentDescs.push(this._outputAttachmentDesc.clone())

    desc.shaderConstantsDesc.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
    desc.shaderConstantsDesc.byteSize = this._screenSize.byteLength
    if (this._vizKernel === VizKernel.VizKernelDepth) {
      desc.shaderConstantsDesc.byteSize += this._minMaxDepth.byteLength
    }

    this._pipeline = this._getHgi().CreateGraphicsPipeline(desc)

    return true
  }

  /** visualizeAovTask.cpp:373-396 */
  private _createSampler(inputAovTextureDesc: HgiTextureDesc): boolean {
    if (this._sampler.isSet()) {
      return true
    }

    const sampDesc = new HgiSamplerDesc()

    if (HgiIsFloatFormat(inputAovTextureDesc.format)) {
      sampDesc.magFilter = HgiSamplerFilter.HgiSamplerFilterLinear
      sampDesc.minFilter = HgiSamplerFilter.HgiSamplerFilterLinear
    } else {
      sampDesc.magFilter = HgiSamplerFilter.HgiSamplerFilterNearest
      sampDesc.minFilter = HgiSamplerFilter.HgiSamplerFilterNearest
    }

    sampDesc.addressModeU = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
    sampDesc.addressModeV = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge

    this._sampler = this._getHgi().createSampler(sampDesc)

    return true
  }

  /** visualizeAovTask.cpp:398-424. Create texture to write the colorized
   *  results into. */
  private _createOutputTexture(dimensions: GfVec3i): boolean {
    const hgi = this._getHgi()
    if (this._outputTexture.isSet()) {
      if (this._outputTextureDimensions.equals(dimensions)) {
        return true
      }
      hgi.destroyTexture(this._outputTexture)
      this._outputTexture = new HgiHandle()
    }

    this._outputTextureDimensions = dimensions

    const texDesc = new HgiTextureDesc()
    texDesc.debugName = 'Visualize Aov Output Texture'
    texDesc.dimensions = dimensions
    texDesc.format = HgiFormat.HgiFormatFloat32Vec4
    texDesc.layerCount = 1
    texDesc.mipLevels = 1
    texDesc.sampleCount = HgiSampleCount.HgiSampleCount1
    texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget |
      HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
    this._outputTexture = hgi.createTexture(texDesc)

    return this._outputTexture.isSet()
  }

  /** visualizeAovTask.cpp:426-435 */
  private _destroyShaderProgram(): void {
    if (!this._shaderProgram.isSet()) return

    const hgi = this._getHgi()
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      hgi.destroyShaderFunction(fn)
    }
    hgi.destroyShaderProgram(this._shaderProgram)
    this._shaderProgram = new HgiHandle()
  }

  /** visualizeAovTask.cpp:437-446 */
  private _printCompileErrors(): void {
    if (!this._shaderProgram.isSet()) return

    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      console.log(fn.Get()?.getCompileErrors())
    }
    console.log(this._shaderProgram.Get()!.getCompileErrors())
  }

  /** visualizeAovTask.cpp:448-480 (asynchronous; see the header). */
  private _updateMinMaxDepth(inputAovTexture: HgiTextureHandle): void {
    // XXX CPU readback to determine min, max depth
    // This should be rewritten to use a compute shader.
    const textureDesc = inputAovTexture.Get()!.getDescriptor()
    if (textureDesc.format !== HgiFormat.HgiFormatFloat32) {
      TF_WARN("Non-floating point depth AOVs aren't supported yet.")
      // The range stays as it is: converged (see IsConverged).
      this._readbackMinMaxDepth = new Float32Array(this._minMaxDepth)
      return
    }

    const width = textureDesc.dimensions.get(0)
    const height = textureDesc.dimensions.get(1)
    void HdStTextureUtils.hgiTextureReadback(this._getHgi(), inputAovTexture).then(buffer => {
      const ptr = new Float32Array(buffer.buffer, buffer.byteOffset, width * height)
      // std::numeric_limits<float>::max() / ::min() (the smallest positive
      // normal float, as upstream initializes max).
      let min = 3.4028234663852886e38
      let max = 1.1754943508222875e-38
      for (let ii = 0; ii < width * height; ii++) {
        const val = ptr[ii]!
        if (val < min) {
          min = val
        }
        if (val > max) {
          max = val
        }
      }

      this._minMaxDepth[0] = min
      this._minMaxDepth[1] = max
      this._readbackMinMaxDepth = new Float32Array([min, max])
    })
  }

  /** visualizeAovTask.cpp:482-538. Execute the appropriate kernel and
   *  update the task context 'color' entry. */
  private _applyVisualizationKernel(outputTexture: HgiTextureHandle): void {
    const hgi = this._getHgi()
    const dimensions = outputTexture.Get()!.getDescriptor().dimensions

    // Prepare graphics cmds.
    const gfxDesc = new HgiGraphicsCmdsDesc()
    gfxDesc.colorAttachmentDescs.push(this._outputAttachmentDesc.clone())
    gfxDesc.colorTextures.push(outputTexture)

    // Begin rendering
    const gfxCmds = hgi.createGraphicsCmds(gfxDesc)
    gfxCmds.pushDebugGroup('Visualize AOV')
    gfxCmds.bindResources(this._resourceBindings)
    gfxCmds.bindPipeline(this._pipeline)
    gfxCmds.bindVertexBuffers([new HgiVertexBufferBinding(this._vertexBuffer, 0, 0)])
    const vp = new GfVec4i(0, 0, dimensions.get(0), dimensions.get(1))
    this._screenSize[0] = dimensions.get(0)
    this._screenSize[1] = dimensions.get(1)

    if (this._vizKernel === VizKernel.VizKernelDepth) {
      this._drawnMinMaxDepth = new Float32Array(this._minMaxDepth)
      const data = new Float32Array([
        this._screenSize[0]!, this._screenSize[1]!,
        this._minMaxDepth[0]!, this._minMaxDepth[1]!])

      gfxCmds.setConstantValues(
        this._pipeline,
        HgiShaderStageBits.HgiShaderStageFragment,
        0,
        data.byteLength,
        data)
    } else {
      gfxCmds.setConstantValues(
        this._pipeline,
        HgiShaderStageBits.HgiShaderStageFragment,
        0,
        this._screenSize.byteLength,
        this._screenSize)
    }

    gfxCmds.setViewport(vp)
    gfxCmds.drawIndexed(this._indexBuffer, 3, 0, 0, 1, 0)
    gfxCmds.popDebugGroup()

    // Done recording commands, submit work.
    void hgi.submitCmds(gfxCmds)
  }

  /** visualizeAovTask.cpp:540-567 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxVisualizeAovTaskParams)
      if (params) {
        // Rebuild necessary Hgi objects when aov to be visualized changes.
        if (this._updateVizKernel(params.aovName)) {
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
        }
      }
    }
  }

  /** visualizeAovTask.cpp:569-573 */
  Prepare(_ctx: HdTaskContext, _renderIndex: HdRenderIndex): void {}

  /** visualizeAovTask.cpp:575-650 */
  Execute(ctx: HdTaskContext): void {
    if (this._vizKernel === VizKernel.VizKernelNone) {
      return
    }

    // XXX: HdxAovInputTask sets the 'color' and 'colorIntermediate' texture
    // handles for the "active" AOV on the task context.
    // The naming is misleading and may be improved to
    // 'aovTexture' and 'aovTextureIntermediate' instead.
    if (!HdxTask._hasTaskContextData(ctx, HdAovTokens.color) ||
      !HdxTask._hasTaskContextData(ctx, HdxAovTokens.colorIntermediate)) {
      return
    }

    const aovTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.color)
    const aovTextureIntermediate =
      HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdxAovTokens.colorIntermediate)
    if (!aovTexture?.isSet() || !aovTextureIntermediate) {
      return
    }
    const aovTexDesc = aovTexture.Get()!.getDescriptor()

    // Transition from color target layout to shader read layout
    const oldLayout =
      aovTexture.Get()!.submitLayoutChange(HgiTextureUsageBits.HgiTextureUsageBitsShaderRead)

    if (!TF_VERIFY(this._createBufferResources())) {
      return
    }
    if (!TF_VERIFY(this._createSampler(/*inputTextureDesc*/aovTexDesc))) {
      return
    }
    if (!TF_VERIFY(this._createShaderResources(/*inputTextureDesc*/aovTexDesc))) {
      return
    }
    if (!TF_VERIFY(this._createResourceBindings(/*inputTexture*/aovTexture))) {
      return
    }

    // Normal AOV typically uses a 3 channel float format in which case we can
    // reuse the intermediate AOV to write the colorized results into.
    // For single channel AOVs like id or depth, colorize such that all color
    // components (R,G,B) are used.
    const canUseIntermediateAovTexture =
      HdxPresentTask.isFormatSupported(aovTexDesc.format) &&
      HgiGetComponentCount(aovTexDesc.format) >= 3

    if (!canUseIntermediateAovTexture &&
      !TF_VERIFY(this._createOutputTexture(aovTexDesc.dimensions))) {
      return
    }

    const outputTexture = canUseIntermediateAovTexture
      ? aovTextureIntermediate : this._outputTexture
    if (!TF_VERIFY(this._createPipeline(outputTexture.Get()!.getDescriptor()))) {
      return
    }

    if (this._vizKernel === VizKernel.VizKernelDepth) {
      this._updateMinMaxDepth(/*inputTexture*/aovTexture)
    }

    this._applyVisualizationKernel(outputTexture)

    // Restore the original color target layout
    aovTexture.Get()!.submitLayoutChange(oldLayout)

    if (canUseIntermediateAovTexture) {
      // Swap the handles on the task context so that future downstream tasks
      // can use HdxAovTokens->color to get the output of this task.
      this._toggleRenderTarget(ctx)
    } else {
      ctx.set(HdAovTokens.color, this._outputTexture)
    }
  }
}
