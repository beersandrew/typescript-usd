// Ported from OpenUSD 26.11.1: pxr/imaging/hgiInterop/metal.mm,
//  pxr/imaging/hgiInterop/opengl.cpp, pxr/imaging/hgiInterop/opengl.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiInteropWebGPU: the WebGPU destination of HgiInterop. Modelled on
// pxr/imaging/hgiInterop/opengl.{h,cpp} (HgiInteropOpenGL, OpenUSD 26.11.1)
// and the source-region / orientation handling of metal.mm; there is no
// upstream WebGPU interop. Written against the Hgi interface: the source
// textures and the application's framebuffer textures are Hgi textures of
// the same Hgi (the framebuffer's color texture is the application's
// texture, e.g. a canvas's current texture, wrapped with
// HgiWebGPU.WrapExternalTexture).
//
// What it keeps from opengl.cpp:
// - a fullscreen triangle sampling `colorIn` (and `depthIn`) at
//   srcRegion.xy + uv * srcRegion.zw (opengl.cpp:28-51, 80-91), writing
//   the depth when a source depth is given;
// - blending with pre-multiplied alpha factors: color and alpha
//   (ONE, ONE_MINUS_SRC_ALPHA), FUNC_ADD (opengl.cpp:233-251);
// - depth test LEQUAL with depth writes when a depth texture is given
//   (opengl.cpp:216-231), else no depth test and no depth writes;
// - no alpha to coverage (opengl.cpp:253-256);
// - the viewport set to the composite region (opengl.cpp:258-260).
//
// Divergences (WebGPU):
// - Hgi textures store rows bottom-up (hgiWebGPU/src/shaderGenerator.ts flips
//   clip space y, as hgiMetal/hgiVulkan do), a canvas displays its rows
//   top-down; the v coordinate is flipped when sampling the source, as
//   metal.mm:247-249 does for Metal textures presented to OpenGL.
// - The fullscreen triangle's z is 0 (WebGPU clips z to [0, w]); opengl.cpp
//   uses -1, OpenGL's near plane. The depth written comes from the texture.
// - dstRegion is (left, BOTTOM, width, height) as upstream; the Hgi viewport
//   of the framebuffer is top-left based, so its y is
//   height - (bottom + regionHeight).
// - A framebuffer without a depth texture composites without depth, as the
//   OpenGL path does when no depth texture is given (a canvas has no depth
//   buffer of its own).
// - The source textures are sampled with a nearest, clamp-to-edge sampler
//   (OpenGL's default for the bound textures upstream is the texture's own
//   state); a 32-bit float depth texture is not filterable in WebGPU.

import { Token as TfToken } from 'typescript-usd/tf'
import { Vec4i as GfVec4i, type Vec4f as GfVec4f } from 'typescript-usd/gf'
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
  HgiFormat,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
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
  HgiVertexAttributeDesc,
  HgiVertexBufferBinding,
  HgiVertexBufferDesc,
  HgiWinding,
  type Hgi,
  type HgiBufferHandle,
  type HgiGraphicsPipelineHandle,
  type HgiSamplerHandle,
  type HgiShaderProgramHandle,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'

/** The destination API token: HgiWebGPU's API name
 *  (hgiWebGPU/src/hgi.ts HgiWebGPUTokens). */
export const HgiInteropWebGPUTokens = {
  WebGPU: TfToken('WebGPU'),
} as const

/** The dstFramebuffer of a WebGPU application: its color texture and an
 *  optional depth texture, as Hgi textures of the source Hgi. */
export interface HgiInteropWebGPUFramebuffer {
  color: HgiTextureHandle
  depth?: HgiTextureHandle | null
}

/** opengl.cpp:16-25 */
const _vertexFullscreen = `void main(void)
{
    gl_Position = position;
    uv = uvIn;
}
`

/** opengl.cpp:27-36 with metal.mm:247-249's flip of v. */
const _fragmentNoDepthFullscreen = `void main(void)
{
    vec2 remappedUv = vec2(srcRegion.x + uv.x * srcRegion.z,
                           srcRegion.y + (1.0 - uv.y) * srcRegion.w);
    hd_FragColor = HgiGet_colorIn(remappedUv);
}
`

/** opengl.cpp:38-50 with metal.mm:278-280's flip of v. */
const _fragmentDepthFullscreen = `void main(void)
{
    vec2 remappedUv = vec2(srcRegion.x + uv.x * srcRegion.z,
                           srcRegion.y + (1.0 - uv.y) * srcRegion.w);
    float depth = HgiGet_depthIn(remappedUv).r;
    hd_FragColor = HgiGet_colorIn(remappedUv);
    gl_FragDepth = depth;
}
`

/** opengl.h:20-50 (HgiInteropOpenGL), for a WebGPU destination. */
export class HgiInteropWebGPU {
  private readonly _hgi: Hgi
  private _prgNoDepth: HgiShaderProgramHandle = new HgiHandle()
  private _prgDepth: HgiShaderProgramHandle = new HgiHandle()
  private _vertexBuffer: HgiBufferHandle = new HgiHandle()
  private _sampler: HgiSamplerHandle = new HgiHandle()
  private readonly _pipelines = new Map<string, HgiGraphicsPipelineHandle>()

  /** opengl.cpp:93-109 */
  constructor(hgi: Hgi) {
    this._hgi = hgi
    this._prgNoDepth = this._createProgram(false)
    this._prgDepth = this._createProgram(true)
    this._vertexBuffer = this._createVertexBuffer()
    const sampDesc = new HgiSamplerDesc()
    sampDesc.debugName = 'HgiInterop'
    sampDesc.magFilter = HgiSamplerFilter.HgiSamplerFilterNearest
    sampDesc.minFilter = HgiSamplerFilter.HgiSamplerFilterNearest
    sampDesc.addressModeU = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
    sampDesc.addressModeV = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
    this._sampler = hgi.createSampler(sampDesc)
  }

  /** opengl.cpp:111-120 (the destructor). */
  destroy(): void {
    const hgi = this._hgi
    for (const prg of [this._prgNoDepth, this._prgDepth]) {
      if (!prg.isSet()) continue
      for (const fn of prg.Get()!.getShaderFunctions()) hgi.destroyShaderFunction(fn)
      hgi.destroyShaderProgram(prg)
    }
    for (const pipeline of this._pipelines.values()) hgi.destroyGraphicsPipeline(pipeline)
    this._pipelines.clear()
    if (this._vertexBuffer.isSet()) hgi.destroyBuffer(this._vertexBuffer)
    if (this._sampler.isSet()) hgi.destroySampler(this._sampler)
  }

  /** opengl.cpp:52-63, 65-76 (_CompileShader, _LinkProgram) as Hgi shader
   *  functions. */
  private _createProgram(withDepth: boolean): HgiShaderProgramHandle {
    const hgi = this._hgi
    const vertDesc = new HgiShaderFunctionDesc()
    vertDesc.debugName = 'HgiInteropVertex'
    vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(vertDesc, 'position', 'vec4', 'position')
    HgiShaderFunctionAddStageInput(vertDesc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(vertDesc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(vertDesc, 'uv', 'vec2')
    vertDesc.shaderCode = _vertexFullscreen

    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.debugName = withDepth ? 'HgiInteropFragmentDepth' : 'HgiInteropFragmentNoDepth'
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(fragDesc, 'uv', 'vec2')
    HgiShaderFunctionAddTexture(fragDesc, 'colorIn', /*bindIndex*/0)
    HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')
    HgiShaderFunctionAddConstantParam(fragDesc, 'srcRegion', 'vec4')
    if (withDepth) {
      HgiShaderFunctionAddTexture(fragDesc, 'depthIn', /*bindIndex*/1)
      HgiShaderFunctionAddStageOutput(fragDesc, 'gl_FragDepth', 'float', 'depth(any)')
    }
    fragDesc.shaderCode = withDepth ? _fragmentDepthFullscreen : _fragmentNoDepthFullscreen

    const programDesc = new HgiShaderProgramDesc()
    programDesc.debugName = withDepth ? 'HgiInteropDepth' : 'HgiInteropNoDepth'
    const vertFn = hgi.CreateShaderFunction(vertDesc)
    const fragFn = hgi.CreateShaderFunction(fragDesc)
    programDesc.shaderFunctions.push(vertFn, fragFn)
    const prg = hgi.createShaderProgram(programDesc)
    if (!prg.Get()?.isValid() || !vertFn.Get()?.isValid() || !fragFn.Get()?.isValid()) {
      TF_CODING_ERROR('HgiInteropWebGPU: failed to create the composite program: ' +
        `${vertFn.Get()?.getCompileErrors() ?? ''} ${fragFn.Get()?.getCompileErrors() ?? ''} ` +
        `${prg.Get()?.getCompileErrors() ?? ''}`)
    }
    return prg
  }

  /** opengl.cpp:78-91 (z 0 instead of -1, see the header). */
  private _createVertexBuffer(): HgiBufferHandle {
    const vertices = new Float32Array([
      /* position        uv */
      -1, 3, 0, 1, 0, 2,
      -1, -1, 0, 1, 0, 0,
      3, -1, 0, 1, 2, 0])
    const desc = new HgiBufferDesc()
    desc.debugName = 'HgiInterop VertexBuffer'
    desc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    desc.initialData = vertices
    desc.byteSize = vertices.byteLength
    desc.vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT
    return this._hgi.createBuffer(desc)
  }

  private _getPipeline(prg: HgiShaderProgramHandle, colorFormat: HgiFormat,
    depthFormat: HgiFormat | null, sampleCount: HgiSampleCount): {
      pipeline: HgiGraphicsPipelineHandle, color: HgiAttachmentDesc, depth: HgiAttachmentDesc
    } {
    // opengl.cpp:233-251: pre-multiplied alpha blending.
    const color = new HgiAttachmentDesc()
    color.format = colorFormat
    color.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
    color.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    color.blendEnabled = true
    color.srcColorBlendFactor = HgiBlendFactor.HgiBlendFactorOne
    color.dstColorBlendFactor = HgiBlendFactor.HgiBlendFactorOneMinusSrcAlpha
    color.colorBlendOp = HgiBlendOp.HgiBlendOpAdd
    color.srcAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorOne
    color.dstAlphaBlendFactor = HgiBlendFactor.HgiBlendFactorOneMinusSrcAlpha
    color.alphaBlendOp = HgiBlendOp.HgiBlendOpAdd

    const depth = new HgiAttachmentDesc()
    if (depthFormat !== null) {
      depth.format = depthFormat
      depth.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
      depth.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
    }

    const key = `${prg.getId()}|${colorFormat}|${depthFormat}|${sampleCount}`
    let pipeline = this._pipelines.get(key)
    if (!pipeline) {
      const desc = new HgiGraphicsPipelineDesc()
      desc.debugName = 'HgiInterop Pipeline'
      desc.shaderProgram = prg
      const posAttr = new HgiVertexAttributeDesc()
      posAttr.format = HgiFormat.HgiFormatFloat32Vec4
      posAttr.offset = 0
      posAttr.shaderBindLocation = 0
      const uvAttr = new HgiVertexAttributeDesc()
      uvAttr.format = HgiFormat.HgiFormatFloat32Vec2
      uvAttr.offset = 4 * Float32Array.BYTES_PER_ELEMENT
      uvAttr.shaderBindLocation = 1
      const vbo = new HgiVertexBufferDesc()
      vbo.bindingIndex = 0
      vbo.vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT
      vbo.vertexAttributes = [posAttr, uvAttr]
      desc.vertexBuffers = [vbo]

      // opengl.cpp:216-231
      if (depthFormat !== null) {
        desc.depthState.depthTestEnabled = true
        desc.depthState.depthWriteEnabled = true
        // Note: Use LEQUAL and not LESS to ensure that fragments with only
        // translucent contribution (that don't update depth) are composited.
        desc.depthState.depthCompareFn = HgiCompareFunction.HgiCompareFunctionLEqual
      } else {
        desc.depthState.depthTestEnabled = false
        desc.depthState.depthWriteEnabled = false
      }
      desc.depthState.stencilTestEnabled = false

      // opengl.cpp:253-256: disable alpha to coverage.
      desc.multiSampleState.alphaToCoverageEnable = false
      desc.multiSampleState.sampleCount = sampleCount
      desc.multiSampleState.multiSampleEnable = sampleCount !== HgiSampleCount.HgiSampleCount1

      desc.rasterizationState.cullMode = HgiCullMode.HgiCullModeNone
      desc.rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeFill
      desc.rasterizationState.winding = HgiWinding.HgiWindingCounterClockwise

      desc.colorAttachmentDescs = [color]
      desc.depthAttachmentDesc = depth

      desc.shaderConstantsDesc.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
      desc.shaderConstantsDesc.byteSize = 4 * Float32Array.BYTES_PER_ELEMENT

      pipeline = this._hgi.CreateGraphicsPipeline(desc)
      this._pipelines.set(key, pipeline)
    }
    return { pipeline, color, depth }
  }

  /** opengl.cpp:122-296. Composite the provided textures over the
   *  framebuffer's contents. */
  compositeToInterop(
    color: HgiTextureHandle,
    depth: HgiTextureHandle | null,
    framebuffer: HgiInteropWebGPUFramebuffer | null,
    compRegion: GfVec4i,
    normalizedSrcRegion: GfVec4f,
  ): void {
    if (!color || !color.isSet()) {
      TF_WARN('No valid color texture provided')
      return
    }

    // When no destination framebuffer is specified, OpenGL composites into
    // the currently bound framebuffer; WebGPU has none.
    if (!framebuffer || !framebuffer.color || !framebuffer.color.isSet()) {
      TF_CODING_ERROR(
        'dstFramebuffer must hold an HgiInteropWebGPUFramebuffer when targeting WebGPU')
      return
    }

    const hgi = this._hgi
    const dstColor = framebuffer.color
    const dstDepth = framebuffer.depth && framebuffer.depth.isSet() ? framebuffer.depth : null
    // Depth is optional
    const useDepth = !!(depth && depth.isSet() && dstDepth)

    // Setup shader program
    const prg = useDepth ? this._prgDepth : this._prgNoDepth
    if (!prg.isSet() || !prg.Get()!.isValid()) {
      return
    }

    const dstDesc = dstColor.Get()!.getDescriptor()
    const { pipeline, color: colorAttachment, depth: depthAttachment } = this._getPipeline(
      prg, dstDesc.format,
      useDepth ? dstDepth!.Get()!.getDescriptor().format : null,
      dstDesc.sampleCount)
    colorAttachment.usage = dstDesc.usage

    const bindings = new HgiResourceBindingsDesc()
    bindings.debugName = 'HgiInterop'
    const colorBind = new HgiTextureBindDesc()
    colorBind.bindingIndex = 0
    colorBind.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
    colorBind.textures.push(color)
    colorBind.samplers.push(this._sampler)
    bindings.textures.push(colorBind)
    if (useDepth) {
      const depthBind = new HgiTextureBindDesc()
      depthBind.bindingIndex = 1
      depthBind.stageUsage = HgiShaderStageBits.HgiShaderStageFragment
      depthBind.textures.push(depth!)
      depthBind.samplers.push(this._sampler)
      bindings.textures.push(depthBind)
    }
    const resourceBindings = hgi.createResourceBindings(bindings)

    const gfxDesc = new HgiGraphicsCmdsDesc()
    gfxDesc.colorAttachmentDescs = [colorAttachment]
    gfxDesc.colorTextures = [dstColor]
    if (useDepth) {
      gfxDesc.depthAttachmentDesc = depthAttachment
      gfxDesc.depthTexture = dstDepth!
    }

    const gfxCmds = hgi.createGraphicsCmds(gfxDesc)
    gfxCmds.pushDebugGroup('Interop')
    gfxCmds.bindPipeline(pipeline)
    gfxCmds.bindResources(resourceBindings)
    const srcRegion = new Float32Array([
      normalizedSrcRegion.get(0), normalizedSrcRegion.get(1),
      normalizedSrcRegion.get(2), normalizedSrcRegion.get(3)])
    gfxCmds.setConstantValues(pipeline, HgiShaderStageBits.HgiShaderStageFragment,
      0, srcRegion.byteLength, srcRegion)
    // dstRegion is (left, BOTTOM, width, height); see the header.
    const fbHeight = dstDesc.dimensions.get(1)
    gfxCmds.setViewport(new GfVec4i(compRegion.get(0),
      fbHeight - (compRegion.get(1) + compRegion.get(3)),
      compRegion.get(2), compRegion.get(3)))
    gfxCmds.bindVertexBuffers([new HgiVertexBufferBinding(this._vertexBuffer, 0, 0)])

    // Draw fullscreen triangle
    gfxCmds.draw(3, 0, 1, 0)
    gfxCmds.popDebugGroup()
    void hgi.submitCmds(gfxCmds)

    hgi.destroyResourceBindings(resourceBindings)
  }
}
