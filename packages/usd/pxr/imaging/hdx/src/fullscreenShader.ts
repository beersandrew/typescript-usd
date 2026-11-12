// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/fullscreenShader.cpp,
//  pxr/imaging/hdx/fullscreenShader.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/fullscreenShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The destructor is Destroy() (effectsShader.ts).
// - The function-static HioGlslfx / source strings of _SetDefaultProgram
//   (fullscreenShader.cpp:449-468) are module variables.
// - SetProgram(glslfxPath, shaderName, fragDesc) sets fragDesc.shaderCode
//   for the call and resets it to null afterwards, as upstream does.

import { Token as TfToken } from 'typescript-usd/tf'
import { Vec4f as GfVec4f, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { HioGlslfx } from 'typescript-usd/hio'
import {
  HgiAttachmentDesc,
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiBindResourceType,
  HgiBufferBindDesc,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiCompareFunction,
  HgiCullMode,
  HgiDepthStencilState,
  HgiFormat,
  HgiHandle,
  HgiMultiSampleState,
  HgiPolygonMode,
  HgiPrimitiveType,
  HgiRasterizationState,
  HgiSamplerAddressMode,
  HgiSamplerDesc,
  HgiSamplerFilter,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  HgiTextureBindDesc,
  HgiVertexAttributeDesc,
  HgiVertexBufferDesc,
  HgiWinding,
  type Hgi,
  type HgiBlendFactor,
  type HgiBlendOp,
  type HgiBufferHandle,
  type HgiBufferHandleVector,
  type HgiSamplerHandle,
  type HgiSamplerHandleVector,
  type HgiShaderProgramHandle,
  type HgiTextureHandle,
  type HgiTextureHandleVector,
} from 'typescript-usd/hgi'
import { HdxEffectsShader } from './effectsShader.ts'
import { HdxPackageFullscreenShader } from './package.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** fullscreenShader.cpp:25-31 */
const _tokens = {
  fullscreenVertex: TfToken('FullscreenVertex'),
  compositeFragmentNoDepth: TfToken('CompositeFragmentNoDepth'),
  compositeFragmentWithDepth: TfToken('CompositeFragmentWithDepth'),
  fullscreenShader: TfToken('fullscreenShader'),
}

// fullscreenShader.cpp:449,459,465 (function statics).
let _fragGlslfx: HioGlslfx | null = null
let _fsCodeWithDepth: string | null = null
let _fsCodeNoDepth: string | null = null

/** fullscreenShader.h:30-200. This class is a utility for rendering deep
 *  raytracer or aov output (color/depth) to a hgi texture. This lets
 *  callers composite results into existing scenes. */
export class HdxFullscreenShader extends HdxEffectsShader {
  private _textures: HgiTextureHandleVector = []
  private _samplers: HgiSamplerHandleVector = []
  private _buffers: HgiBufferHandleVector = []

  private _glslfxPath = TfToken('')
  private _shaderName = TfToken('')

  private _indexBuffer: HgiBufferHandle = new HgiHandle()
  private _vertexBuffer: HgiBufferHandle = new HgiHandle()
  private _shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  private _defaultSampler: HgiSamplerHandle = new HgiHandle()

  private _depthStencilState = new HgiDepthStencilState()

  private _colorAttachment = new HgiAttachmentDesc()
  private _depthAttachment = new HgiAttachmentDesc()

  /** fullscreenShader.cpp:33-69. Create a new fullscreen shader object.
   *  debugName is assigned to the fullscreen pass as gpu debug group that
   *  is helpful when inspecting the frame on a gpu debugger. */
  constructor(hgi: Hgi | null, debugName: string) {
    super(hgi, debugName.length === 0 ? 'HdxFullscreenShader' : debugName)

    // Create descriptor for vertex pos and uvs
    this._setVertexBufferDescriptor()

    // Depth test and write must be on since we may want to transfer depth.
    // Depth test must be on because when off it also disables depth writes.
    // Instead we set the compare function to always.
    this._depthStencilState.depthTestEnabled = true
    this._depthStencilState.depthCompareFn = HgiCompareFunction.HgiCompareFunctionAlways

    // We don't use the stencil mask in this task.
    this._depthStencilState.stencilTestEnabled = false

    // Set attachment defaults for load and store
    this._colorAttachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpDontCare
    this._colorAttachment.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    this._depthAttachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpDontCare
    this._depthAttachment.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore

    // Alpha to coverage would prevent any pixels that have an alpha of 0.0 from
    // being written. We want to transfer all pixels. Even background
    // pixels that were set with a clearColor alpha of 0.0.
    const multiSampleState = new HgiMultiSampleState()
    multiSampleState.alphaToCoverageEnable = false
    this._setMultiSampleState(multiSampleState)

    // Setup rasterization state
    const rasterizationState = new HgiRasterizationState()
    rasterizationState.cullMode = HgiCullMode.HgiCullModeBack
    rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeFill
    rasterizationState.winding = HgiWinding.HgiWindingCounterClockwise
    this._setRasterizationState(rasterizationState)
  }

  /** fullscreenShader.cpp:71-93 (the destructor). */
  override destroy(): void {
    const hgi = this._getHgi()
    if (!hgi) {
      return
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
      this._shaderProgram = this._destroyShaderProgram(this._shaderProgram)
    }

    if (this._defaultSampler.isSet()) {
      hgi.destroySampler(this._defaultSampler)
      this._defaultSampler = new HgiHandle()
    }

    super.destroy()
  }

  /**
   * SetProgram(glslfxPath, shaderName, fragDesc) (fullscreenShader.cpp:95-123):
   * create and set the shader program from the glslfx file's `shaderName`
   * technique as the fragment stage; a no-op when glslfxPath and shaderName
   * did not change.
   *
   * SetProgram(fragDesc) (fullscreenShader.cpp:125-177): create and set the
   * shader program with fragDesc's code for the fragment stage.
   */
  setProgram(glslfxPath: TfToken, shaderName: TfToken, fragDesc: HgiShaderFunctionDesc): void
  setProgram(fragDesc: HgiShaderFunctionDesc): void
  setProgram(a: TfToken | HgiShaderFunctionDesc, shaderName?: TfToken,
    fragDescArg?: HgiShaderFunctionDesc): void {
    if (typeof a === 'string') {
      const glslfxPath = a
      const fragDesc = fragDescArg!
      if (this._glslfxPath === glslfxPath && this._shaderName === shaderName) {
        return
      }

      const fragGlslfx = new HioGlslfx(glslfxPath)
      const reason = { value: '' }
      if (!fragGlslfx.isValid(reason)) {
        TF_CODING_ERROR(`Couldn't load fragment shader ${fragGlslfx.getFilePath()}, ` +
          `error: ${reason.value}`)
      } else {
        this._glslfxPath = glslfxPath
        this._shaderName = shaderName!

        const fsCode = fragGlslfx.getSource(this._shaderName)
        TF_VERIFY(fsCode.length !== 0)
        fragDesc.shaderCode = fsCode

        this.setProgram(fragDesc)

        fragDesc.shaderCode = null
      }
      return
    }

    const fragDesc = a
    this._shaderProgram = this._destroyShaderProgram(this._shaderProgram)

    // Set up the vertex shader
    const vertGlslfx = new HioGlslfx(HdxPackageFullscreenShader())
    const reason = { value: '' }
    if (!vertGlslfx.isValid(reason)) {
      TF_CODING_ERROR(`Couldn't load vertex shader ${vertGlslfx.getFilePath()}, ` +
        `error: ${reason.value}`)
      return
    }

    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = _tokens.fullscreenVertex
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex

    HgiShaderFunctionAddStageInput(
      vertDesc, 'position', 'vec4', 'position')
    HgiShaderFunctionAddStageInput(
      vertDesc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(
      vertDesc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(
      vertDesc, 'uvOut', 'vec2')

    const vsCode = vertGlslfx.getSource(_tokens.fullscreenVertex)
    TF_VERIFY(vsCode.length !== 0)
    vertDesc.shaderCode = vsCode
    const hgi = this._getHgi()!
    const vertFn = hgi.CreateShaderFunction(vertDesc)

    // Create up the fragment shader
    const fragFn = hgi.CreateShaderFunction(fragDesc)

    // Setup the shader program
    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = _tokens.fullscreenShader
    programDesc.shaderFunctions.push(vertFn)
    programDesc.shaderFunctions.push(fragFn)
    this._shaderProgram = hgi.createShaderProgram(programDesc)

    if (!this._shaderProgram.Get()?.isValid() || !vertFn.Get()?.isValid() ||
      !fragFn.Get()?.isValid()) {
      TF_CODING_ERROR('Failed to create HdxFullscreenShader shader program')
      HdxEffectsShader.printCompileErrors(this._shaderProgram)
      this._shaderProgram = this._destroyShaderProgram(this._shaderProgram)
    }

    // Set the shader program to either a valid program or an empty handle.
    this._setShaderProgram(this._shaderProgram)
  }

  /** fullscreenShader.cpp:179-184. Bind (externally managed) buffers to the
   *  shader program. */
  bindBuffers(buffers: HgiBufferHandleVector): void {
    this._buffers = [...buffers]
  }

  /** fullscreenShader.cpp:300-322. Bind (externally managed) textures to
   *  the shader program. If samplers are provided they must match the
   *  textures; an empty handle uses the default sampler. */
  bindTextures(textures: HgiTextureHandleVector,
    samplers: HgiSamplerHandleVector = []): void {
    if (samplers.length !== 0 && textures.length !== samplers.length) {
      TF_CODING_ERROR('Samplers vector must be empty, or match the size of ' +
        'the provided textures vector.')
      this._textures = []
      this._samplers = []
      return
    }

    this._textures = [...textures]
    if (samplers.length === 0) {
      this._samplers = this._textures.map(() => this._getDefaultSampler())
    } else {
      this._samplers = samplers.map(s => s && s.isSet() ? s : this._getDefaultSampler())
    }
  }

  /** fullscreenShader.cpp:186-196. By default HdxFullscreenShader creates a
   *  pipeline object that enables depth testing and enables depth write if
   *  there is a provided depth texture. This function lets you override the
   *  default behavior. */
  setDepthState(state: HgiDepthStencilState): void {
    this._depthStencilState = Object.assign(new HgiDepthStencilState(), state)
    // Note: if we're doing meaningful depth testing, we need to load the depth.
    if (this._depthStencilState.depthTestEnabled &&
      this._depthStencilState.depthCompareFn !== HgiCompareFunction.HgiCompareFunctionNever &&
      this._depthStencilState.depthCompareFn !== HgiCompareFunction.HgiCompareFunctionAlways) {
      this._depthAttachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
    }
  }

  /** fullscreenShader.cpp:198-220. By default HdxFullscreenShader uses no
   *  blending (opaque). This function lets you override the default
   *  behavior. */
  setBlendState(
    enableBlending: boolean,
    srcColorBlendFactor: HgiBlendFactor,
    dstColorBlendFactor: HgiBlendFactor,
    colorBlendOp: HgiBlendOp,
    srcAlphaBlendFactor: HgiBlendFactor,
    dstAlphaBlendFactor: HgiBlendFactor,
    alphaBlendOp: HgiBlendOp,
  ): void {
    this._colorAttachment.blendEnabled = enableBlending
    this._colorAttachment.srcColorBlendFactor = srcColorBlendFactor
    this._colorAttachment.dstColorBlendFactor = dstColorBlendFactor
    this._colorAttachment.colorBlendOp = colorBlendOp
    this._colorAttachment.srcAlphaBlendFactor = srcAlphaBlendFactor
    this._colorAttachment.dstAlphaBlendFactor = dstAlphaBlendFactor
    this._colorAttachment.alphaBlendOp = alphaBlendOp

    // Note: if we're doing meaningful blending, we need to load the color.
    if (this._colorAttachment.blendEnabled) {
      this._colorAttachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
    }
  }

  /** fullscreenShader.cpp:222-232. By default HdxFullscreenShader uses
   *  LoadOpDontCare and StoreOpStore. This function lets you override the
   *  default behavior to clear. */
  setClearState(clearColor: GfVec4f, clearDepth: GfVec4f): void {
    this._colorAttachment.clearValue = clearColor
    this._colorAttachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpClear

    this._depthAttachment.clearValue = clearDepth
    this._depthAttachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpClear
  }

  /** fullscreenShader.cpp:234-240. Provide the shader constant values
   *  (uniforms). The data values are copied, so you do not have to set them
   *  each frame if they do not change in value. */
  setShaderConstants(byteSize: number, data: ArrayBufferView | ArrayBuffer): void {
    this._setShaderConstants(byteSize, data, HgiShaderStageBits.HgiShaderStageFragment)
  }

  /**
   * Draw(colorDst, depthDst) (fullscreenShader.cpp:400-413): draw the
   * internal textures to the provided destination textures; depth is
   * written when depthDst is set. The viewport is the color texture's size.
   *
   * Draw(colorDst, colorResolveDst, depthDst, depthResolveDst, viewport)
   * (fullscreenShader.cpp:415-424): the same with resolve textures and an
   * explicit viewport.
   */
  draw(colorDst: HgiTextureHandle, depthDst: HgiTextureHandle): void
  draw(colorDst: HgiTextureHandle, colorResolveDst: HgiTextureHandle,
    depthDst: HgiTextureHandle, depthResolveDst: HgiTextureHandle, viewport: GfVec4i): void
  draw(colorDst: HgiTextureHandle, b: HgiTextureHandle, c?: HgiTextureHandle,
    d?: HgiTextureHandle, viewport?: GfVec4i): void {
    if (viewport !== undefined) {
      this._draw(colorDst, b, c!, d!, viewport)
      return
    }
    const depthDst = b
    if (!colorDst || !colorDst.isSet()) {
      TF_CODING_ERROR('Color texture must be provided.')
      return
    }

    const dimensions = colorDst.Get()!.getDescriptor().dimensions
    const vp = new GfVec4i(0, 0, dimensions.get(0), dimensions.get(1))
    this._draw(colorDst, new HgiHandle(), depthDst, new HgiHandle(), vp)
  }

  /** fullscreenShader.cpp:242-298. Utility function to create buffer
   *  resources. */
  private _createBufferResources(): void {
    if (this._vertexBuffer.isSet()) {
      return
    }

    /* For the fullscreen pass, we draw a triangle:
     *
     * |\
     * |_\
     * | |\
     * |_|_\
     *
     * The vertices are at (-1, 3) [top left]; (-1, -1) [bottom left];
     * and (3, -1) [bottom right]; UVs are assigned so that the bottom left
     * is (0,0) and the clipped vertices are 2 on their axis, so that:
     * x=-1 => s = 0; x = 3 => s = 2, which means x = 1 => s = 1.
     *
     * This maps the texture space [0,1]^2 to the clip space XY [-1,1]^2.
     * The parts of the triangle extending past NDC space are clipped before
     * rasterization.
     *
     * This has the advantage (over rendering a quad) that we don't render
     * the diagonal twice.
     *
     * Note that we're passing in NDC positions, and we don't expect the vertex
     * shader to transform them.  Also note: the fragment shader can optionally
     * read depth from a texture, but otherwise the depth is -1, meaning near
     * plane.
     */
    const elementsPerVertex = 6
    const vertData = new Float32Array([
      -1, 3, 0, 1, 0, 2,
      -1, -1, 0, 1, 0, 0,
      3, -1, 0, 1, 2, 0])

    const hgi = this._getHgi()!
    const vboDesc = new HgiBufferDesc()
    vboDesc.debugName = 'HdxFullscreenShader VertexBuffer'
    vboDesc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    vboDesc.initialData = vertData
    vboDesc.byteSize = vertData.byteLength
    vboDesc.vertexStride = elementsPerVertex * Float32Array.BYTES_PER_ELEMENT
    this._vertexBuffer = hgi.createBuffer(vboDesc)

    const indices = new Int32Array([0, 1, 2])

    const iboDesc = new HgiBufferDesc()
    iboDesc.debugName = 'HdxFullscreenShader IndexBuffer'
    iboDesc.usage = HgiBufferUsageBits.HgiBufferUsageIndex32
    iboDesc.initialData = indices
    iboDesc.byteSize = indices.byteLength
    this._indexBuffer = hgi.createBuffer(iboDesc)

    this._setPrimitiveType(HgiPrimitiveType.HgiPrimitiveTypeTriangleList)
  }

  /** fullscreenShader.cpp:324-361. Utility to set resource bindings. */
  private _setResourceBindings(): void {
    const textureBindings: HgiTextureBindDesc[] = []
    for (let index = 0; index < this._textures.length; ++index) {
      const texture = this._textures[index]!
      if (!texture || !texture.isSet()) {
        continue
      }
      const texBind = new HgiTextureBindDesc()
      texBind.bindingIndex = index
      texBind.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
      texBind.writable = false
      texBind.textures.push(texture)
      texBind.samplers.push(this._samplers[index]!)
      textureBindings.push(texBind)
    }
    this._setTextureBindings(textureBindings)

    const bufferBindings: HgiBufferBindDesc[] = []
    for (let index = 0; index < this._buffers.length; ++index) {
      const buffer = this._buffers[index]!
      if (!buffer || !buffer.isSet()) {
        continue
      }
      const bufBind = new HgiBufferBindDesc()
      bufBind.bindingIndex = index
      bufBind.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
      bufBind.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
      bufBind.writable = false
      bufBind.offsets.push(0)
      bufBind.buffers.push(buffer)
      bufferBindings.push(bufBind)
    }
    this._setBufferBindings(bufferBindings)
  }

  /** fullscreenShader.cpp:363-383. Utility to create default vertex buffer
   *  descriptor. */
  private _setVertexBufferDescriptor(): void {
    // Describe the vertex buffer
    const posAttr = new HgiVertexAttributeDesc()
    posAttr.format = HgiFormat.HgiFormatFloat32Vec4
    posAttr.offset = 0
    posAttr.shaderBindLocation = 0

    const uvAttr = new HgiVertexAttributeDesc()
    uvAttr.format = HgiFormat.HgiFormatFloat32Vec2
    uvAttr.offset = Float32Array.BYTES_PER_ELEMENT * 4 // after posAttr
    uvAttr.shaderBindLocation = 1

    const vboDesc = new HgiVertexBufferDesc()
    vboDesc.bindingIndex = 0
    vboDesc.vertexStride = Float32Array.BYTES_PER_ELEMENT * 6 // pos, uv
    vboDesc.vertexAttributes = [posAttr, uvAttr]

    this._setVertexBufferDescs([vboDesc])
  }

  /** fullscreenShader.cpp:385-398. Utility to create and get the default
   *  texture sampler. */
  private _getDefaultSampler(): HgiSamplerHandle {
    if (!this._defaultSampler.isSet()) {
      const sampDesc = new HgiSamplerDesc()
      sampDesc.magFilter = HgiSamplerFilter.HgiSamplerFilterLinear
      sampDesc.minFilter = HgiSamplerFilter.HgiSamplerFilterLinear
      sampDesc.addressModeU = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
      sampDesc.addressModeV = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
      this._defaultSampler = this._getHgi()!.createSampler(sampDesc)
    }

    return this._defaultSampler
  }

  /** fullscreenShader.cpp:426-477. Utility to set the default program. */
  private _setDefaultProgram(writeDepth: boolean): void {
    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    fragDesc.debugName = writeDepth
      ? _tokens.compositeFragmentWithDepth
      : _tokens.compositeFragmentNoDepth
    HgiShaderFunctionAddStageInput(
      fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddStageOutput(
      fragDesc, 'hd_FragColor', 'vec4', 'color')
    HgiShaderFunctionAddTexture(
      fragDesc, 'colorIn', /*bindIndex = */0)

    if (writeDepth) {
      HgiShaderFunctionAddStageOutput(
        fragDesc, 'gl_FragDepth', 'float', 'depth(any)')
      HgiShaderFunctionAddTexture(
        fragDesc, 'depth', /*bindIndex = */1)
    }

    const fragGlslfx = (_fragGlslfx ??= new HioGlslfx(HdxPackageFullscreenShader()))
    const reason = { value: '' }
    if (!fragGlslfx.isValid(reason)) {
      TF_CODING_ERROR(`Couldn't load fragment shader ${fragGlslfx.getFilePath()}, ` +
        `error: ${reason.value}`)
    } else {
      this._glslfxPath = HdxPackageFullscreenShader()
      if (writeDepth) {
        this._shaderName = _tokens.compositeFragmentWithDepth
        const fsCodeWithDepth = (_fsCodeWithDepth ??=
          fragGlslfx.getSource(_tokens.compositeFragmentWithDepth))
        TF_VERIFY(fsCodeWithDepth.length !== 0)
        fragDesc.shaderCode = fsCodeWithDepth
      } else {
        this._shaderName = _tokens.compositeFragmentNoDepth
        const fsCodeNoDepth = (_fsCodeNoDepth ??=
          fragGlslfx.getSource(_tokens.compositeFragmentNoDepth))
        TF_VERIFY(fsCodeNoDepth.length !== 0)
        fragDesc.shaderCode = fsCodeNoDepth
      }

      // Not calling other SetProgram overload to avoid caching and benefit
      // from using statics for shader strings
      this.setProgram(fragDesc)

      fragDesc.shaderCode = null
    }
  }

  /** fullscreenShader.cpp:479-522. Internal draw method. */
  private _draw(
    colorDst: HgiTextureHandle,
    colorResolveDst: HgiTextureHandle,
    depthDst: HgiTextureHandle,
    depthResolveDst: HgiTextureHandle,
    viewport: GfVec4i,
  ): void {
    const writeDepth = !!depthDst && depthDst.isSet()

    // If the user has not set a custom shader program, pick default program.
    if (!this._shaderProgram.isSet()) {
      this._setDefaultProgram(writeDepth)
    }

    // Create draw buffers if they haven't been created yet.
    if (!this._vertexBuffer.isSet()) {
      this._createBufferResources()
    }

    // Set or update the resource bindings (textures may have changed)
    this._setResourceBindings()

    const colorAttachmentDescs = [this._colorAttachment]
    this._setColorAttachments(colorAttachmentDescs)
    this._setDepthAttachment(this._depthAttachment)

    this._depthStencilState.depthWriteEnabled = writeDepth
    this._setDepthStencilState(this._depthStencilState)

    const colorTextures: HgiTextureHandle[] = []
    if (colorDst && colorDst.isSet()) {
      colorTextures.push(colorDst)
    }
    const colorResolveTextures: HgiTextureHandle[] = []
    if (colorResolveDst && colorResolveDst.isSet()) {
      colorResolveTextures.push(colorResolveDst)
    }

    this._createAndSubmitGraphicsCmds(
      colorTextures, colorResolveTextures,
      depthDst ?? new HgiHandle(), depthResolveDst ?? new HgiHandle(),
      viewport)
  }

  /** fullscreenShader.cpp:524-528 */
  protected _recordDrawCmds(): void {
    this._drawIndexed(this._vertexBuffer, this._indexBuffer, 3, 0, 0, 1, 0)
  }
}
