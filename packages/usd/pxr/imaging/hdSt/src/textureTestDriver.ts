// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStDynamicUvTexture.cpp,
//  pxr/imaging/hdSt/testenv/testHdStSamplerObjectRegistry.cpp,
//  pxr/imaging/hdSt/testenv/testHdStTextureHandleRegistry.cpp,
//  pxr/imaging/hdSt/testenv/testHdStTextureObjectRegistry.cpp,
//  pxr/imaging/hdSt/unitTestHelper.cpp, pxr/imaging/hdSt/unitTestHelper.h,
//  and 1 more cited below
// Copyright 2016, 2017, 2018, 2020 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/unitTestHelper.{h,cpp} (OpenUSD 26.11.1):
// HdSt_TextureTestDriver (unitTestHelper.h:630-681,
// unitTestHelper.cpp:325-713), the driver of Storm's texture image tests
// (testHdStTextureObjectRegistry, testHdStTextureHandleRegistry,
// testHdStSamplerObjectRegistry, testHdStDynamicUvTexture). It lives in its
// own file so that it is independent of the scene test drivers in
// unitTestHelper.ts.
//
// Divergences:
// - The driver is given its Hgi (upstream: Hgi::CreatePlatformDefaultHgi()),
//   as HdSt_TestDriverBase is (unitTestHelper.ts header).
// - WriteToFile reads the texture back asynchronously
//   (HdStTextureUtils::HgiTextureReadback, textureUtils.ts) and hands the
//   HioImage::StorageSpec it would write (8-bit quantisation as
//   Hio_StbImage::Write, hio/stbImage.cpp:566-575, and the vertical flip)
//   to the writer set with SetImageWriter: image writing is not part of
//   this repository's hio.

import { Vec3i as GfVec3i, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { Token as TfToken } from 'typescript-usd/tf'
import { RenderIndex as HdRenderIndex } from 'typescript-usd/hd'
import {
  HgiAttachmentDesc,
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiBlendFactor,
  HgiBlendOp,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiCompareFunction,
  HgiCullMode,
  HgiDepthStencilState,
  HgiFormat,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiPolygonMode,
  HgiResourceBindingsDesc,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  HgiTextureBindDesc,
  HgiTokens,
  HgiVertexAttributeDesc,
  HgiVertexBufferBinding,
  HgiVertexBufferDesc,
  HgiWinding,
  type Hgi,
  type HgiBufferHandle,
  type HgiGraphicsPipelineHandle,
  type HgiResourceBindingsHandle,
  type HgiSamplerHandle,
  type HgiShaderProgramHandle,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HioGlslfx, HioGlslfxInputStream } from 'typescript-usd/hio'
import { HdStRenderDelegate } from './renderDelegate.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStTextureUtils } from './textureUtils.ts'
import { TF_CODING_ERROR, TF_RUNTIME_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** What WriteToFile would write: 8-bit RGBA rows, top row first (see the
 *  header). */
export interface HdSt_TextureTestImage {
  filename: string
  width: number
  height: number
  rgba: Uint8Array
}

/** hio/stbImage.cpp:566-575 _Quantize */
function _Quantize(value: number): number {
  const result = Math.floor(Math.fround(Math.fround(255 * value) + Math.fround(0.499999)))
  return Math.min(255, Math.max(0, result))
}

/** unitTestHelper.cpp:441-457 */
const vertShaderStr =
  '-- glslfx version 0.1\n' +
  '-- configuration\n' +
  '{\n' +
  '    "techniques": {\n' +
  '        "default": {\n' +
  '            "VertexPassthrough": {\n' +
  '                "source": [ "Vertex.Main" ]\n' +
  '            }\n' +
  '        }\n' +
  '    }\n' +
  '}\n' +
  '-- glsl Vertex.Main\n' +
  'void main(void)\n' +
  '{\n' +
  '    gl_Position = position;\n' +
  '    uvOut = uvIn;\n' +
  '}\n'

/** unitTestHelper.cpp:459-477 */
const fragShaderStr =
  '-- glslfx version 0.1\n' +
  '-- configuration\n' +
  '{\n' +
  '    "techniques": {\n' +
  '        "default": {\n' +
  '            "FullscreenTexture": {\n' +
  '                "source": [ "Fragment.Main" ]\n' +
  '            }\n' +
  '        }\n' +
  '    }\n' +
  '}\n' +
  '-- glsl Fragment.Main\n' +
  'void main(void)\n' +
  '{\n' +
  '    vec2 coord = (uvOut * screenSize) / 100.f;\n' +
  '    vec4 color = vec4(HgiGet_colorIn(coord).xyz, 1.0);\n' +
  '    hd_FragColor = color;\n' +
  '}\n'

/** unitTestHelper.h:630-681. A driver for texture tests: draws a
 *  fullscreen triangle sampling an input texture into an output texture. */
export class HdSt_TextureTestDriver {
  private readonly _hgi: Hgi
  private readonly _hgiDriver: { name: string, driver: unknown }
  private readonly _renderDelegate = new HdStRenderDelegate()
  private readonly _renderIndex: HdRenderIndex
  private readonly _resourceRegistry: HdStResourceRegistry

  private _indexBuffer: HgiBufferHandle = new HgiHandle()
  private _vertexBuffer: HgiBufferHandle = new HgiHandle()
  private _shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  private _resourceBindings: HgiResourceBindingsHandle = new HgiHandle()
  private _pipeline: HgiGraphicsPipelineHandle = new HgiHandle()
  private readonly _vboDesc = new HgiVertexBufferDesc()
  private readonly _attachment0 = new HgiAttachmentDesc()
  private _constantsData = new Uint8Array(0)

  private _imageWriter: ((image: HdSt_TextureTestImage) => void) | null = null

  /** unitTestHelper.cpp:327-341 (see the header on the Hgi). */
  constructor(hgi: Hgi) {
    this._hgi = hgi
    this._hgiDriver = { name: HgiTokens.renderDriver, driver: hgi }
    // HdRenderIndex::New(renderDelegate, drivers) hands the drivers to the
    // render delegate (unitTestHelper.ts, HdSt_TestDriverBase).
    this._renderDelegate.setDrivers([this._hgiDriver])
    this._renderIndex = HdRenderIndex.new(this._renderDelegate)!
    this._resourceRegistry =
      this._renderIndex.getResourceRegistry() as HdStResourceRegistry
    this._createVertexBufferDescriptor()
  }

  /** unitTestHelper.cpp:343-360 (destructor). */
  destroy(): void {
    if (this._vertexBuffer.isSet()) {
      this._hgi.destroyBuffer(this._vertexBuffer)
    }
    if (this._indexBuffer.isSet()) {
      this._hgi.destroyBuffer(this._indexBuffer)
    }
    if (this._shaderProgram.isSet()) {
      this._destroyShaderProgram()
    }
    if (this._resourceBindings.isSet()) {
      this._hgi.destroyResourceBindings(this._resourceBindings)
    }
    if (this._pipeline.isSet()) {
      this._hgi.destroyGraphicsPipeline(this._pipeline)
    }
  }

  /** unitTestHelper.h:651-652 */
  getHgi(): Hgi {
    return this._hgi
  }

  /** unitTestHelper.cpp:362-366 */
  getResourceRegistry(): HdStResourceRegistry {
    return this._resourceRegistry
  }

  /** Where WriteToFile hands its images (see the header). */
  setImageWriter(writer: ((image: HdSt_TextureTestImage) => void) | null): void {
    this._imageWriter = writer
  }

  /** unitTestHelper.cpp:368-406 */
  draw(colorDst: HgiTextureHandle, inputTexture: HgiTextureHandle,
    inputSampler: HgiSamplerHandle): void {
    const textureDesc = colorDst.Get()!.getDescriptor()

    const viewport = new GfVec4i(0, 0, textureDesc.dimensions.data[0]!,
      textureDesc.dimensions.data[1]!)
    const screenSize = new Float32Array([viewport.data[2]!, viewport.data[3]!])
    this._constantsData = new Uint8Array(screenSize.buffer)

    this._createShaderProgram()
    this._createBufferResources()
    this._createTextureBindings(inputTexture, inputSampler)
    this._createPipeline(colorDst)

    // Create graphics commands
    const gfxDesc = new HgiGraphicsCmdsDesc()
    if (colorDst.isSet()) {
      gfxDesc.colorAttachmentDescs.push(this._attachment0)
      gfxDesc.colorTextures.push(colorDst)
    }

    const gfxCmds = this._hgi.createGraphicsCmds(gfxDesc)
    gfxCmds.pushDebugGroup('Debug HdSt_TextureTestDriver')
    gfxCmds.bindResources(this._resourceBindings)
    gfxCmds.bindPipeline(this._pipeline)
    gfxCmds.bindVertexBuffers([new HgiVertexBufferBinding(this._vertexBuffer, 0, 0)])
    gfxCmds.setViewport(viewport)
    gfxCmds.setConstantValues(this._pipeline, HgiShaderStageBits.HgiShaderStageFragment, 0,
      this._constantsData.byteLength, this._constantsData)
    gfxCmds.drawIndexed(this._indexBuffer, 3, 0, 0, 1, 0)
    gfxCmds.popDebugGroup()

    void this._hgi.submitCmds(gfxCmds)
  }

  /** unitTestHelper.cpp:408-439 (see the header). */
  async writeToFile(texture: HgiTextureHandle, filename: string): Promise<boolean> {
    const tex = texture.Get()
    if (!tex) {
      TF_CODING_ERROR('No data for texture')
      return false
    }
    const textureDesc = tex.getDescriptor()
    const width = textureDesc.dimensions.data[0]!
    const height = textureDesc.dimensions.data[1]!
    if (textureDesc.format !== HgiFormat.HgiFormatFloat32Vec4) {
      TF_CODING_ERROR('Hgi texture has format not corresponding to a' +
        'HioFormat')
      return false
    }

    const buffer = await HdStTextureUtils.hgiTextureReadback(this._hgi, texture)
    if (buffer.byteLength === 0) {
      TF_CODING_ERROR('No data for texture')
      return false
    }
    const floats = new Float32Array(buffer.buffer, buffer.byteOffset, width * height * 4)
    // storage.flipped = true: the first row written is the last row read.
    const rgba = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4
      for (let i = 0; i < width * 4; i++) {
        rgba[y * width * 4 + i] = _Quantize(floats[src + i]!)
      }
    }

    if (!this._imageWriter) {
      TF_RUNTIME_ERROR(`Failed to open image for writing ${filename}`)
      return false
    }
    this._imageWriter({ filename, width, height, rgba })
    return true
  }

  /** unitTestHelper.cpp:479-557 */
  private _createShaderProgram(): void {
    if (this._pipeline.isSet()) {
      this._hgi.destroyGraphicsPipeline(this._pipeline)
    }
    if (this._shaderProgram.isSet()) {
      this._destroyShaderProgram()
    }

    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = TfToken('Vertex')
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(vertDesc, 'position', 'vec4', 'position')
    HgiShaderFunctionAddStageInput(vertDesc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(vertDesc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(vertDesc, 'uvOut', 'vec2')

    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.debugName = TfToken('Fragment')
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddTexture(fragDesc, 'colorIn')
    HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')
    HgiShaderFunctionAddConstantParam(fragDesc, 'screenSize', 'vec2')

    const vsGlslfx = new HioGlslfx(new HioGlslfxInputStream(vertShaderStr))
    const fsGlslfx = new HioGlslfx(new HioGlslfxInputStream(fragShaderStr))

    // Setup the vertex shader
    let vsCode = ''
    vsCode += vsGlslfx.getSource(TfToken('VertexPassthrough'))
    TF_VERIFY(vsCode !== '')
    vertDesc.shaderCode = vsCode
    const vertFn = this._hgi.CreateShaderFunction(vertDesc)

    // Setup the fragment shader
    let fsCode = ''
    fsCode += fsGlslfx.getSource(TfToken('FullscreenTexture'))
    TF_VERIFY(fsCode !== '')
    fragDesc.shaderCode = fsCode
    const fragFn = this._hgi.CreateShaderFunction(fragDesc)

    // Setup the shader program
    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = 'FullscreenTriangle'
    programDesc.shaderFunctions.push(vertFn)
    programDesc.shaderFunctions.push(fragFn)
    this._shaderProgram = this._hgi.createShaderProgram(programDesc)

    if (!this._shaderProgram.Get()!.isValid() || !vertFn.Get()!.isValid() ||
      !fragFn.Get()!.isValid()) {
      TF_CODING_ERROR('Failed to create shader program')
      this._printCompileErrors()
      this._destroyShaderProgram()
      return
    }
  }

  /** unitTestHelper.cpp:559-590 */
  private _createBufferResources(): void {
    if (this._vertexBuffer.isSet()) {
      return
    }

    const elementsPerVertex = 6
    const vertData = new Float32Array([
      -1, 1, 0, 1, 0, 1,
      -1, -1, 0, 1, 0, 0,
      1, -1, 0, 1, 1, 0])

    const vboDesc = new HgiBufferDesc()
    vboDesc.debugName = 'HdSt_TextureTestDriver VertexBuffer'
    vboDesc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    vboDesc.initialData = vertData
    vboDesc.byteSize = vertData.byteLength
    vboDesc.vertexStride = elementsPerVertex * 4
    this._vertexBuffer = this._hgi.createBuffer(vboDesc)

    const indices = new Int32Array([0, 1, 2])

    const iboDesc = new HgiBufferDesc()
    iboDesc.debugName = 'HdSt_TextureTestDriver IndexBuffer'
    iboDesc.usage = HgiBufferUsageBits.HgiBufferUsageIndex32
    iboDesc.initialData = indices
    iboDesc.byteSize = indices.byteLength
    this._indexBuffer = this._hgi.createBuffer(iboDesc)
  }

  /** unitTestHelper.cpp:592-626 */
  private _createTextureBindings(textureHandle: HgiTextureHandle,
    samplerHandle: HgiSamplerHandle): boolean {
    const resourceDesc = new HgiResourceBindingsDesc()
    resourceDesc.debugName = 'HdSt_TextureTestDriver'

    if (textureHandle.isSet()) {
      const texBindDesc = new HgiTextureBindDesc()
      texBindDesc.bindingIndex = 0
      texBindDesc.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
      texBindDesc.writable = false
      texBindDesc.textures.push(textureHandle)
      if (samplerHandle.isSet()) {
        texBindDesc.samplers.push(samplerHandle)
      }
      resourceDesc.textures.push(texBindDesc)
    }

    // If nothing has changed in the descriptor we avoid re-creating the
    // resource bindings object.
    if (this._resourceBindings.isSet()) {
      const desc = this._resourceBindings.Get()!.getDescriptor()
      if (desc.equals(resourceDesc)) {
        return true
      }
      this._hgi.destroyResourceBindings(this._resourceBindings)
    }

    this._resourceBindings = this._hgi.createResourceBindings(resourceDesc)

    return true
  }

  /** unitTestHelper.cpp:628-646 */
  private _createVertexBufferDescriptor(): void {
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

  /** unitTestHelper.cpp:648-697 */
  private _createPipeline(colorDst: HgiTextureHandle): boolean {
    if (this._pipeline.isSet()) {
      this._hgi.destroyGraphicsPipeline(this._pipeline)
    }

    // Setup attachments
    this._attachment0.blendEnabled = false
    this._attachment0.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
    this._attachment0.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    this._attachment0.srcColorBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._attachment0.dstColorBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._attachment0.colorBlendOp = HgiBlendOp.HgiBlendOpAdd
    this._attachment0.srcAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._attachment0.dstAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorZero
    this._attachment0.alphaBlendOp = HgiBlendOp.HgiBlendOpAdd

    if (colorDst.isSet()) {
      this._attachment0.format = colorDst.Get()!.getDescriptor().format
      this._attachment0.usage = colorDst.Get()!.getDescriptor().usage
    } else {
      this._attachment0.format = HgiFormat.HgiFormatInvalid
    }

    const desc = new HgiGraphicsPipelineDesc()
    desc.debugName = 'TestPipeline'
    desc.shaderProgram = this._shaderProgram
    if (this._attachment0.format !== HgiFormat.HgiFormatInvalid) {
      desc.colorAttachmentDescs.push(this._attachment0)
    }

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
    desc.shaderConstantsDesc.byteSize = this._constantsData.byteLength
    desc.shaderConstantsDesc.stageUsage = HgiShaderStageBits.HgiShaderStageFragment

    this._pipeline = this._hgi.CreateGraphicsPipeline(desc)

    return true
  }

  /** unitTestHelper.cpp:699-706 */
  private _destroyShaderProgram(): void {
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      this._hgi.destroyShaderFunction(fn)
    }
    this._hgi.destroyShaderProgram(this._shaderProgram)
  }

  /** unitTestHelper.cpp:708-713 */
  private _printCompileErrors(): void {
    for (const fn of this._shaderProgram.Get()!.getShaderFunctions()) {
      console.log(fn.Get()!.getCompileErrors())
    }
    console.log(this._shaderProgram.Get()!.getCompileErrors())
  }
}
