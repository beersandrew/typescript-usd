// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/unitTestHelper.cpp,
//  pxr/imaging/hgi/unitTestHelper.h,
//  pxr/imaging/hgi/testenv/testHgiCommand.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/unitTestHelper.{h,cpp} (OpenUSD 26.11.1), the
// drivers behind testenv/testHgiCommand.cpp.
//
// Asynchronous where Hgi is (see hgi.ts): construction is split into the
// constructor plus Init() (Hgi::CreatePlatformDefaultHgi returns a promise),
// and ExecuteTestGfxCmdBfr / WriteToFile await SubmitCmds.
//
// WriteToFile (unitTestHelper.cpp:281-329) reads the color target back and
// hands it to HioImage::OpenForWriting. Writing image files is not part of
// this repo's hio, so ReadBackTexels() performs the read back and returns the
// texels with the HioImage::StorageSpec fields upstream fills in; the caller
// writes or compares them.

import { Vec3i as GfVec3i, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { Token as TfToken } from 'typescript-usd/tf'
import { HgiAttachmentDesc } from './attachmentDesc.ts'
import { HgiTextureGpuToCpuOp } from './blitCmdsOps.ts'
import { HgiBufferDesc, type HgiBufferHandle } from './buffer.ts'
import {
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiBlendFactor,
  HgiBlendOp,
  HgiBufferUsageBits,
  HgiCompareFunction,
  HgiComponentSwizzle,
  HgiCullMode,
  HgiPolygonMode,
  HgiSampleCount,
  HgiShaderStageBits,
  HgiSubmitWaitType,
  HgiTextureType,
  HgiTextureUsageBits,
  HgiWinding,
} from './enums.ts'
import { HgiGraphicsCmdsDesc } from './graphicsCmdsDesc.ts'
import {
  HgiDepthStencilState,
  HgiGraphicsPipelineDesc,
  HgiVertexAttributeDesc,
  HgiVertexBufferDesc,
  type HgiGraphicsPipelineHandle,
} from './graphicsPipeline.ts'
import { HgiHandle } from './handle.ts'
import { Hgi, type HgiUniquePtr } from './hgi.ts'
import { HgiVertexBufferBinding } from './resourceBindings.ts'
import {
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionDesc,
} from './shaderFunctionDesc.ts'
import { HgiShaderProgramDesc, type HgiShaderProgramHandle } from './shaderProgram.ts'
import {
  HgiComponentMapping,
  HgiTextureDesc,
  HgiTextureViewDesc,
  type HgiTextureHandle,
  type HgiTextureViewHandle,
} from './texture.ts'
import { HgiFormat, HgiGetDataSize } from './types.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** unitTestHelper.h:16-32 */
export class HgiInitializationTestDriver {
  protected _hgi: HgiUniquePtr | null = null

  /** unitTestHelper.cpp:19-22 */
  async init(): Promise<void> {
    this._hgi = await Hgi.createPlatformDefaultHgi()
  }

  getHgi(): Hgi | null { return this._hgi }
}

/** unitTestHelper.cpp:25-30 */
export const glslfx_vertShaderStr =
  'void main(void)\n' +
  '{\n' +
  '    gl_Position = position;\n' +
  '    uvOut = uvIn;\n' +
  '}\n'

/** unitTestHelper.cpp:32-37 */
export const glslfx_fragShaderStr =
  'void main(void)\n' +
  '{\n' +
  '    vec4 color = vec4(1.0, 0.0, 1.0, 1.0);\n' +
  '    hd_FragColor = color;\n' +
  '}\n'

/** unitTestHelper.h:34-62 */
export class HgiPipelineCreationTestDriver {
  protected _hgi: HgiUniquePtr | null = null
  protected _shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  protected _pipeline: HgiGraphicsPipelineHandle = new HgiHandle()
  protected _vboDesc = new HgiVertexBufferDesc()
  protected _colorAtt = new HgiAttachmentDesc()
  protected _depthAtt = new HgiAttachmentDesc()

  /** unitTestHelper.cpp:40-44 */
  constructor() {
    this._createVertexBufferDescriptor()
  }

  /** The Hgi::CreatePlatformDefaultHgi() initializer of
   *  unitTestHelper.cpp:41. `hgi` substitutes a caller-made instance. */
  async init(hgi?: Hgi): Promise<void> {
    this._hgi = hgi ?? await Hgi.createPlatformDefaultHgi()
  }

  getHgi(): Hgi | null { return this._hgi }

  /** unitTestHelper.cpp:46-54 (the destructor). */
  destroy(): void {
    if (this._shaderProgram.isSet()) {
      this._destroyShaderProgram()
    }
    if (this._pipeline.isSet()) {
      this._hgi!.destroyGraphicsPipeline(this._pipeline)
    }
  }

  /** unitTestHelper.cpp:74-86 */
  createTestPipeline(): boolean {
    if (!this._createShaderProgram()) {
      return false
    }

    if (!this._createPipeline()) {
      return false
    }

    return true
  }

  /** unitTestHelper.cpp:56-71 */
  protected _createVertexBufferDescriptor(): void {
    const posAttr = new HgiVertexAttributeDesc()
    posAttr.format = HgiFormat.HgiFormatFloat32Vec3
    posAttr.offset = 0
    posAttr.shaderBindLocation = 0

    const uvAttr = new HgiVertexAttributeDesc()
    uvAttr.format = HgiFormat.HgiFormatFloat32Vec2
    uvAttr.offset = 4 * 4 // after posAttr
    uvAttr.shaderBindLocation = 1

    this._vboDesc.bindingIndex = 0
    this._vboDesc.vertexStride = 4 * 6 // pos, uv
    this._vboDesc.vertexAttributes = [posAttr, uvAttr]
  }

  /** unitTestHelper.cpp:88-132 */
  protected _createShaderProgram(): boolean {
    const hgi = this._hgi!
    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = TfToken('Vertex')
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(
      vertDesc, 'position', 'vec4', 'position')
    HgiShaderFunctionAddStageInput(
      vertDesc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(
      vertDesc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(
      vertDesc, 'uvOut', 'vec2')

    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.debugName = TfToken('Fragment')
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(
      fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddStageOutput(
      fragDesc, 'hd_FragColor', 'vec4', 'color')

    vertDesc.shaderCode = glslfx_vertShaderStr
    const vertFn = hgi.CreateShaderFunction(vertDesc)

    fragDesc.shaderCode = glslfx_fragShaderStr
    const fragFn = hgi.CreateShaderFunction(fragDesc)

    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = TfToken('FullscreenTriangle')
    programDesc.shaderFunctions.push(vertFn)
    programDesc.shaderFunctions.push(fragFn)
    this._shaderProgram = hgi.createShaderProgram(programDesc)

    if (!this._shaderProgram.Get()!.isValid() || !vertFn.Get()!.isValid() ||
        !fragFn.Get()!.isValid()) {
      TF_CODING_ERROR('Failed to create shader program')
      this._printCompileErrors()
      this._destroyShaderProgram()
      return false
    }

    return true
  }

  /** unitTestHelper.cpp:134-194 */
  protected _createPipeline(): boolean {
    const hgi = this._hgi!
    if (this._pipeline.isSet()) {
      hgi.destroyGraphicsPipeline(this._pipeline)
    }

    // Setup color attachment
    this._colorAtt.blendEnabled = false
    this._colorAtt.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpDontCare
    this._colorAtt.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    this._colorAtt.srcColorBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._colorAtt.dstColorBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._colorAtt.colorBlendOp = HgiBlendOp.HgiBlendOpAdd
    this._colorAtt.srcAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._colorAtt.dstAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._colorAtt.alphaBlendOp = HgiBlendOp.HgiBlendOpAdd
    this._colorAtt.format = HgiFormat.HgiFormatUNorm8Vec4
    this._colorAtt.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget

    // Setup depth attachment
    this._depthAtt = new HgiAttachmentDesc()
    this._depthAtt.blendEnabled = false
    this._depthAtt.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpDontCare
    this._depthAtt.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    this._depthAtt.srcColorBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._depthAtt.dstColorBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._depthAtt.colorBlendOp = HgiBlendOp.HgiBlendOpAdd
    this._depthAtt.srcAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._depthAtt.dstAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._depthAtt.alphaBlendOp = HgiBlendOp.HgiBlendOpAdd
    this._depthAtt.format = HgiFormat.HgiFormatFloat32
    this._depthAtt.usage = HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget

    const desc = new HgiGraphicsPipelineDesc()
    desc.debugName = 'Forward Pipeline'
    desc.shaderProgram = this._shaderProgram
    desc.colorAttachmentDescs.push(this._colorAtt)
    desc.depthAttachmentDesc = this._depthAtt

    const depthState = new HgiDepthStencilState()
    depthState.depthTestEnabled = true
    depthState.depthCompareFn = HgiCompareFunction.HgiCompareFunctionAlways
    depthState.stencilTestEnabled = false
    desc.depthState = depthState

    desc.vertexBuffers = [this._vboDesc]
    desc.depthState.depthWriteEnabled = false
    desc.multiSampleState.alphaToCoverageEnable = false
    desc.rasterizationState.cullMode = HgiCullMode.HgiCullModeBack
    desc.rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeFill
    desc.rasterizationState.winding = HgiWinding.HgiWindingCounterClockwise
    desc.shaderProgram = this._shaderProgram

    this._pipeline = hgi.CreateGraphicsPipeline(desc)
    if (!this._pipeline.isSet()) {
      return false
    }

    return true
  }

  /** unitTestHelper.cpp:196-203 */
  protected _destroyShaderProgram(): void {
    const hgi = this._hgi!
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      hgi.destroyShaderFunction(fn)
    }
    hgi.destroyShaderProgram(this._shaderProgram)
  }

  /** unitTestHelper.cpp:205-212. Returns the text upstream prints to
   *  std::cout, one line per function then the program. */
  protected _printCompileErrors(): string {
    const lines: string[] = []
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      lines.push(fn.Get()!.getCompileErrors())
    }
    lines.push(this._shaderProgram.Get()!.getCompileErrors())
    const text = lines.join('\n')
    console.log(text)
    return text
  }
}

/** The HioImage::StorageSpec WriteToFile fills (unitTestHelper.cpp:300-305)
 *  and the texels it points at. */
export interface HgiUnitTestReadBack {
  width: number
  height: number
  format: HgiFormat
  /** Rows as stored by the color target. */
  texels: Uint8Array
  /** HioImage writes rows bottom-up when set. */
  flipped: boolean
}

/** unitTestHelper.h:64-93 */
export class HgiGfxCmdBfrExecutionTestDriver extends HgiPipelineCreationTestDriver {
  private readonly _renderDim = new GfVec3i(600, 400, 1)

  private _indexBuffer: HgiBufferHandle = new HgiHandle()
  private _vertexBuffer: HgiBufferHandle = new HgiHandle()

  private _colorTarget: HgiTextureHandle = new HgiHandle()
  private _colorTargetView: HgiTextureViewHandle = new HgiHandle()

  private _depthTarget: HgiTextureHandle = new HgiHandle()
  private _depthTargetView: HgiTextureViewHandle = new HgiHandle()

  /** unitTestHelper.cpp:220-245 (the destructor). */
  override destroy(): void {
    const hgi = this._hgi!
    if (this._colorTarget.isSet()) {
      hgi.destroyTexture(this._colorTarget)
    }

    if (this._colorTargetView.isSet()) {
      hgi.destroyTextureView(this._colorTargetView)
    }

    if (this._depthTarget.isSet()) {
      hgi.destroyTexture(this._depthTarget)
    }

    if (this._depthTargetView.isSet()) {
      hgi.destroyTextureView(this._depthTargetView)
    }

    if (this._vertexBuffer.isSet()) {
      hgi.destroyBuffer(this._vertexBuffer)
    }

    if (this._indexBuffer.isSet()) {
      hgi.destroyBuffer(this._indexBuffer)
    }
    super.destroy()
  }

  /** unitTestHelper.cpp:247-279 */
  async executeTestGfxCmdBfr(): Promise<boolean> {
    const hgi = this._hgi!
    if (!this._createResourceBuffers()) {
      return false
    }

    if (!this._createRenderTargets()) {
      return false
    }

    {
      const viewport = new GfVec4i(0, 0, this._renderDim.data[0]!, this._renderDim.data[1]!)

      const gfxDesc = new HgiGraphicsCmdsDesc()
      gfxDesc.colorAttachmentDescs.push(this._colorAtt)
      gfxDesc.depthAttachmentDesc = this._depthAtt
      gfxDesc.colorTextures.push(this._colorTarget)
      gfxDesc.depthTexture = this._depthTarget

      const gfxCmds = hgi.createGraphicsCmds(gfxDesc)
      gfxCmds.pushDebugGroup('Draw Test')
      gfxCmds.bindPipeline(this._pipeline)
      gfxCmds.bindVertexBuffers([new HgiVertexBufferBinding(this._vertexBuffer, 0, 0)])
      gfxCmds.setViewport(viewport)
      gfxCmds.drawIndexed(this._indexBuffer, 3, 0, 0, 1, 0)
      gfxCmds.popDebugGroup()

      await hgi.submitCmds(gfxCmds, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
    }

    return true
  }

  /** unitTestHelper.cpp:281-298: the read back half of WriteToFile. */
  async readBackTexels(): Promise<HgiUnitTestReadBack> {
    const hgi = this._hgi!
    const byteSize = HgiGetDataSize(HgiFormat.HgiFormatUNorm8Vec4, this._renderDim)

    const texels = new Uint8Array(byteSize)
    const readBackOp = new HgiTextureGpuToCpuOp()
    readBackOp.cpuDestinationBuffer = texels
    readBackOp.destinationBufferByteSize = byteSize
    readBackOp.destinationByteOffset = 0
    readBackOp.gpuSourceTexture = this._colorTarget
    readBackOp.mipLevel = 0
    readBackOp.sourceTexelOffset = new GfVec3i(0, 0, 0)

    const blitCmds = hgi.createBlitCmds()
    blitCmds.copyTextureGpuToCpu(readBackOp)
    await hgi.submitCmds(blitCmds, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

    return {
      width: this._renderDim.data[0]!,
      height: this._renderDim.data[1]!,
      format: HgiFormat.HgiFormatUNorm8Vec4,
      texels,
      flipped: true,
    }
  }

  /** unitTestHelper.cpp:332-374 */
  private _createResourceBuffers(): boolean {
    const hgi = this._hgi!
    if (this._vertexBuffer.isSet()) {
      hgi.destroyBuffer(this._vertexBuffer)
    }

    if (this._indexBuffer.isSet()) {
      hgi.destroyBuffer(this._indexBuffer)
    }

    const elementsPerVertex = 6
    const vertData = new Float32Array([
      -0.25, 0.25, 0, 0.25, 0, 1,
      -0.25, -0.25, 0, 0.25, 0, 0,
      0.25, -0.25, 0, 0.25, 0.25, 0])

    const vboDesc = new HgiBufferDesc()
    vboDesc.debugName = 'VertexBuffer'
    vboDesc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    vboDesc.initialData = vertData
    vboDesc.byteSize = vertData.byteLength
    vboDesc.vertexStride = elementsPerVertex * vertData.BYTES_PER_ELEMENT
    this._vertexBuffer = hgi.createBuffer(vboDesc)
    if (!this._vertexBuffer.isSet()) {
      return false
    }

    const indices = new Int32Array([0, 1, 2])

    const iboDesc = new HgiBufferDesc()
    iboDesc.debugName = 'IndexBuffer'
    iboDesc.usage = HgiBufferUsageBits.HgiBufferUsageIndex32
    iboDesc.initialData = indices
    iboDesc.byteSize = indices.byteLength
    this._indexBuffer = hgi.createBuffer(iboDesc)
    if (!this._indexBuffer.isSet()) {
      return false
    }

    return true
  }

  /** unitTestHelper.cpp:376-463 */
  private _createRenderTargets(): boolean {
    const hgi = this._hgi!
    if (this._colorTarget.isSet()) {
      hgi.destroyTexture(this._colorTarget)
    }

    if (this._colorTargetView.isSet()) {
      hgi.destroyTextureView(this._colorTargetView)
    }

    if (this._depthTarget.isSet()) {
      hgi.destroyTexture(this._depthTarget)
    }

    if (this._depthTargetView.isSet()) {
      hgi.destroyTextureView(this._depthTargetView)
    }

    // create color render target
    let desc = new HgiTextureDesc()
    desc.componentMapping = new HgiComponentMapping(
      HgiComponentSwizzle.HgiComponentSwizzleR, HgiComponentSwizzle.HgiComponentSwizzleG,
      HgiComponentSwizzle.HgiComponentSwizzleB, HgiComponentSwizzle.HgiComponentSwizzleA)
    desc.debugName = 'Color Buffer'
    desc.dimensions = new GfVec3i(this._renderDim)
    desc.format = HgiFormat.HgiFormatUNorm8Vec4
    desc.initialData = null
    desc.layerCount = 1
    desc.mipLevels = 1
    desc.pixelsByteSize = 0
    desc.sampleCount = HgiSampleCount.HgiSampleCount1
    desc.type = HgiTextureType.HgiTextureType2D
    desc.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
    this._colorTarget = hgi.createTexture(desc)
    if (!this._colorTarget.isSet()) {
      return false
    }

    // create color view
    let viewDesc = new HgiTextureViewDesc()
    viewDesc.debugName = 'Color Buffer View'
    viewDesc.format = HgiFormat.HgiFormatUNorm8Vec4
    viewDesc.layerCount = 1
    viewDesc.mipLevels = 1
    viewDesc.sourceFirstLayer = 0
    viewDesc.sourceFirstMip = 0
    viewDesc.sourceTexture = this._colorTarget
    this._colorTargetView = hgi.createTextureView(viewDesc)
    if (!this._colorTargetView.isSet()) {
      return false
    }

    // create depth target
    desc = new HgiTextureDesc()
    desc.componentMapping = new HgiComponentMapping(
      HgiComponentSwizzle.HgiComponentSwizzleR, HgiComponentSwizzle.HgiComponentSwizzleG,
      HgiComponentSwizzle.HgiComponentSwizzleB, HgiComponentSwizzle.HgiComponentSwizzleA)
    desc.debugName = 'Depth Buffer'
    desc.dimensions = new GfVec3i(this._renderDim)
    desc.format = HgiFormat.HgiFormatFloat32
    desc.initialData = null
    desc.layerCount = 1
    desc.mipLevels = 1
    desc.pixelsByteSize = 0
    desc.sampleCount = HgiSampleCount.HgiSampleCount1
    desc.type = HgiTextureType.HgiTextureType2D
    desc.usage = HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget
    this._depthTarget = hgi.createTexture(desc)
    if (!this._depthTarget.isSet()) {
      return false
    }

    // create depth view
    viewDesc = new HgiTextureViewDesc()
    viewDesc.debugName = 'Depth Buffer View'
    viewDesc.format = HgiFormat.HgiFormatFloat32
    viewDesc.layerCount = 1
    viewDesc.mipLevels = 1
    viewDesc.sourceFirstLayer = 0
    viewDesc.sourceFirstMip = 0
    viewDesc.sourceTexture = this._depthTarget
    this._depthTargetView = hgi.createTextureView(viewDesc)
    if (!this._depthTargetView.isSet()) {
      return false
    }

    return true
  }
}
