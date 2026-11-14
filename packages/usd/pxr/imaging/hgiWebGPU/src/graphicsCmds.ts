// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/graphicsCmds.h,
//  pxr/imaging/hgiMetal/graphicsCmds.mm,
//  pxr/imaging/hgiVulkan/graphicsCmds.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUGraphicsCmds. Modelled on pxr/imaging/hgiMetal/graphicsCmds.{h,mm}
// (one render pass for the cmds object, state cached and resources bound
// lazily before draws) with hgiVulkan/graphicsCmds.cpp for submission: each
// cmds object records its own command buffer and _Submit hands it to the
// queue (hgiVulkan/graphicsCmds.cpp _Submit).

import { HgiWebGPU_EncodeDepthResolve } from './depthResolve.ts'
import {
  HgiBindResourceType,
  HgiCmds,
  HgiGraphicsCmds,
  HgiMemoryBarrierBits,
  HgiSubmitWaitType,
  type Hgi,
  type HgiBufferHandle,
  type HgiCpuData,
  type HgiGraphicsCmdsDesc,
  type HgiGraphicsPipelineHandle,
  type HgiMemoryBarrier,
  type HgiResourceBindingsHandle,
  type HgiShaderStage,
  type HgiVertexBufferBindingVector,
  HgiVertexBufferStepFunction,
} from 'typescript-usd/hgi'
import type { Vec4f as GfVec4f, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { HgiWebGPUBytes, type HgiWebGPUBuffer } from './buffer.ts'
import { HgiWebGPUConversions } from './conversions.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './diagnostic.ts'
import {
  HgiWebGPUConstantsBindGroup,
  HgiWebGPUControlPointIndexBinding,
  HgiWebGPUPatchDrawBinding,
  HgiWebGPUPulledAttributeBindingBase,
  HgiWebGPUTessPointsBinding,
} from './bindGroupLayouts.ts'
import type { HgiWebGPUGraphicsPipeline, HgiWebGPUPatchEmulation } from './graphicsPipeline.ts'
import type { HgiWebGPU } from './hgi.ts'
import type { HgiWebGPUPackedAttributes } from './pulledAttributePacker.ts'
import {
  HgiWebGPUConstantsAllocator,
  HgiWebGPUResourceBindings,
  type HgiWebGPUUniformSlot,
} from './resourceBindings.ts'
import type { HgiWebGPUTexture } from './texture.ts'
import type { HgiWebGPUTessellatedDraw, HgiWebGPUTessellationFrame } from './tessellation.ts'

/** One emulated patch draw's parameters. */
interface _PatchDraw {
  patchStart: number
  patchCount: number
  instanceCount: number
  baseInstance: number
  baseVertex: number
  drawIndex: number
  indexBuffer: HgiWebGPUBuffer | null
}

export class HgiWebGPUGraphicsCmds extends HgiGraphicsCmds {
  private readonly _hgi: HgiWebGPU
  private readonly _descriptor: HgiGraphicsCmdsDesc
  private _commandEncoder: GPUCommandEncoder | null
  // The multisampled depth attachment and its resolve texture, resolved
  // after the pass (depthResolve.ts).
  private _depthResolve: { source: GPUTexture, target: GPUTexture } | null = null
  private _encoder: GPURenderPassEncoder | null = null
  private _pipeline: HgiWebGPUGraphicsPipeline | null = null
  /** The bound pipeline draws with rasterization disabled. */
  private _rasterizationDisabled = false
  private _resourceBindings: HgiWebGPUResourceBindings | null = null
  private _resourcesDirty = false
  private readonly _constants: HgiWebGPUConstantsAllocator
  private _renderSize: [number, number] = [0, 0]
  private _debugDepth = 0
  /** The bound pipeline's patch emulation (hgiMetal's _primitiveType ==
   *  HgiPrimitiveTypePatchList and _primitiveIndexSize,
   *  graphicsCmds.mm:442-462). */
  private _patch: HgiWebGPUPatchEmulation | null = null
  /** The vertex buffers bound per slot (hgiMetal/stepFunctions.mm:56-74
   *  records their offsets the same way). */
  private readonly _vertexBindings = new Map<number, { buffer: GPUBuffer, source: HgiWebGPUBuffer, byteOffset: number }>()
  /** The constants of a patch pipeline: its constants bind group also holds
   *  the per-draw patch parameters, so it is set at each draw. */
  private _patchConstants: HgiWebGPUUniformSlot | null = null
  /** The last SetViewport (x, y, width, height), for emulated points. */
  private _viewport: [number, number, number, number] = [0, 0, 1, 1]
  private readonly _patchBindGroups = new Map<string, GPUBindGroup>()
  /** Scratch of _PatchConstantsBindGroup, reused across draws. */
  private _patchWords = new Uint32Array(0)
  private _patchFloats = new Float32Array(0)
  private readonly _patchAttributeBuffers: GPUBuffer[] = []
  private readonly _patchResources: GPUBufferBinding[] = []
  private readonly _patchKey: number[] = []
  private _lastPatchKey: number[] = []
  private _lastPatchBindGroup: GPUBindGroup | null = null
  private readonly _bufferIds = new WeakMap<GPUBuffer | GPUBindGroupLayout, number>()
  private _nextBufferId = 0
  private _placeholderStorage: GPUBuffer | null = null
  /** The compute work of patch draws with per-patch factors (the
   *  post-tessellation control stage and the tessellator,
   *  HgiWebGPUTessellation): a command encoder submitted just before this
   *  cmds' render pass. */
  private _preEncoder: GPUCommandEncoder | null = null
  /** The depth copies of the depth textures the pass samples as float
   *  textures (depthSampling.ts), submitted before the pass, and the
   *  textures copied. */
  private _depthReadEncoder: GPUCommandEncoder | null = null
  private readonly _depthReads = new Set<HgiWebGPUTexture>()
  private readonly _depthRead = (texture: HgiWebGPUTexture): void => {
    if (this._depthReads.has(texture)) return
    this._depthReads.add(texture)
    const device = this._hgi.getPrimaryDevice()
    this._depthReadEncoder ??= device.createCommandEncoder({ label: 'HgiWebGPUGraphicsCmds depth sampling' })
    texture.encodeShaderRead(device, this._depthReadEncoder)
  }
  private _prePass: GPUComputePassEncoder | null = null
  /** This cmds' serial with HgiWebGPUPulledAttributePacker, once it packs,
   *  and the packed buffers its draws read. */
  private _packSerial: number | null = null
  private readonly _packed = new Set<HgiWebGPUPackedAttributes>()
  /** The packed buffers' copies go on the pre-pass encoder, ahead of the
   *  draws that read them. */
  private readonly _packEncoder = (): GPUCommandEncoder => {
    this._prePass?.end()
    this._prePass = null
    return this._prePassEncoder()
  }
  /** The buffers the pass and the pre-pass bind as writable storage, whose
   *  write version is bumped when this cmds is submitted
   *  (HgiWebGPUBuffer._noteWrite). */
  private readonly _written = new Set<HgiWebGPUBuffer>()
  private readonly _write = (buffer: HgiWebGPUBuffer): void => { this._written.add(buffer) }
  private _tessFrame: HgiWebGPUTessellationFrame | null = null
  /** The tessellation of each control-stage draw, found by the patch draw
   *  that follows it (_TessKey). */
  private readonly _tessDraws = new Map<string, HgiWebGPUTessellatedDraw>()

  /** hgiMetal/graphicsCmds.mm:58-231 */
  constructor(hgi: HgiWebGPU, desc: HgiGraphicsCmdsDesc) {
    super()
    this._hgi = hgi
    this._descriptor = desc
    const device = hgi.getPrimaryDevice()
    this._commandEncoder = device.createCommandEncoder({ label: 'HgiWebGPUGraphicsCmds' })
    this._constants = new HgiWebGPUConstantsAllocator(device,
      hgi.getCapabilities().minUniformBufferOffsetAlignment)

    TF_VERIFY(desc.colorTextures.length === desc.colorAttachmentDescs.length,
      'desc.colorTextures.size() == desc.colorAttachmentDescs.size()')

    if (desc.colorResolveTextures.length > 0 &&
        desc.colorResolveTextures.length !== desc.colorTextures.length) {
      TF_CODING_ERROR('color and resolve texture count mismatch.')
      return
    }

    if (desc.depthResolveTexture.isSet() && !desc.depthTexture.isSet()) {
      TF_CODING_ERROR('DepthResolve texture without depth texture.')
      return
    }

    if (!desc.hasAttachments()) {
      // hgiMetal/graphicsCmds.mm:93-100 gives attachment-less passes (the
      // vertex-only GPU culling pass) a default target size; a WebGPU render
      // pass needs an attachment, so no render pass is begun. Storm's
      // attachment-less "prepare" cmds (hdSt/renderPass.cpp:131-147) only
      // push and pop a debug group on them: the pipeline draw batch's prepare
      // work is recorded on compute cmds. A draw recorded here reports a
      // coding error (no pass).
      return
    }

    // Color attachments (hgiMetal/graphicsCmds.mm:102-151)
    const colorAttachments: GPURenderPassColorAttachment[] = []
    const resolvingColor = desc.colorResolveTextures.length > 0
    for (let i = 0; i < desc.colorAttachmentDescs.length; i++) {
      const hgiColorAttachment = desc.colorAttachmentDescs[i]!
      const colorTexture = desc.colorTextures[i]!.Get() as HgiWebGPUTexture
      TF_VERIFY(colorTexture.getDescriptor().format === hgiColorAttachment.format,
        'colorTexture->GetDescriptor().format == hgiColorAttachment.format')
      const clearColor = hgiColorAttachment.clearValue.data
      const attachment: GPURenderPassColorAttachment = {
        view: colorTexture.getTextureView()!,
        loadOp: HgiWebGPUConversions.getAttachmentLoadOp(hgiColorAttachment.loadOp),
        storeOp: HgiWebGPUConversions.getAttachmentStoreOp(hgiColorAttachment.storeOp),
        // A don't-care load clears to the attachment's clear value.
        clearValue: { r: clearColor[0]!, g: clearColor[1]!, b: clearColor[2]!, a: clearColor[3]! },
      }
      if (resolvingColor) {
        const resolveTexture = desc.colorResolveTextures[i]!.Get() as HgiWebGPUTexture
        attachment.resolveTarget = resolveTexture.getTextureView()!
      }
      colorAttachments.push(attachment)
      if (i === 0) {
        const d = colorTexture.getDescriptor().dimensions.data
        this._renderSize = [d[0]!, d[1]!]
      }
    }

    // Depth attachment (hgiMetal/graphicsCmds.mm:153-200)
    let depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined
    if (desc.depthTexture.isSet()) {
      const hgiDepthAttachment = desc.depthAttachmentDesc
      const depthTexture = desc.depthTexture.Get() as HgiWebGPUTexture
      TF_VERIFY(depthTexture.getDescriptor().format === hgiDepthAttachment.format,
        'depthTexture->GetDescriptor().format == hgiDepthAttachment.format')
      depthStencilAttachment = {
        view: depthTexture.getTextureView()!,
        depthLoadOp: HgiWebGPUConversions.getAttachmentLoadOp(hgiDepthAttachment.loadOp),
        depthStoreOp: HgiWebGPUConversions.getAttachmentStoreOp(hgiDepthAttachment.storeOp),
        depthClearValue: hgiDepthAttachment.clearValue.data[0]!,
      }
      const format = depthTexture.getGpuFormat()
      if (format && HgiWebGPUConversions.hasStencil(format)) {
        depthStencilAttachment.stencilLoadOp =
          HgiWebGPUConversions.getAttachmentLoadOp(hgiDepthAttachment.loadOp)
        depthStencilAttachment.stencilStoreOp =
          HgiWebGPUConversions.getAttachmentStoreOp(hgiDepthAttachment.storeOp)
        depthStencilAttachment.stencilClearValue = hgiDepthAttachment.clearValue.data[1]!
      }
      if (desc.depthResolveTexture.isSet()) {
        // hgiMetal/graphicsCmds.mm:178-193 resolves into the depth resolve
        // texture with the pass; WebGPU passes resolve color only, so the
        // resolve is recorded after the pass (depthResolve.ts).
        const resolve = (desc.depthResolveTexture.Get() as HgiWebGPUTexture).getTextureId()
        const source = depthTexture.getTextureId()
        if (resolve && source) this._depthResolve = { source, target: resolve }
      }
      if (colorAttachments.length === 0) {
        const d = depthTexture.getDescriptor().dimensions.data
        this._renderSize = [d[0]!, d[1]!]
      }
    }

    this._encoder = this._commandEncoder.beginRenderPass({
      label: 'HgiWebGPUGraphicsCmds',
      colorAttachments,
      ...(depthStencilAttachment ? { depthStencilAttachment } : {}),
    })
  }

  /** hgiMetal/graphicsCmds.mm:766-783 */
  pushDebugGroup(label: string, _color: GfVec4f = HgiCmds.s_graphicsDebugColor): void {
    this._encoder?.pushDebugGroup(label)
    this._debugDepth++
  }

  /** hgiMetal/graphicsCmds.mm:785-798 */
  popDebugGroup(): void {
    if (this._debugDepth === 0) return
    this._encoder?.popDebugGroup()
    this._debugDepth--
  }

  /** hgiMetal/graphicsCmds.mm:800-815 */
  insertDebugMarker(label: string, _color: GfVec4f = HgiCmds.s_markerDebugColor): void {
    this._encoder?.insertDebugMarker(label)
  }

  /** hgiMetal/graphicsCmds.mm:404-422. Metal inverts the viewport in y; a
   *  WebGPU viewport cannot have a negative height, so the generated vertex
   *  stage flips clip-space y instead (HgiWebGPUShaderGenerator) and the
   *  viewport keeps the Hgi rectangle, which then addresses the same rows
   *  OpenGL's bottom-left origin does. */
  setViewport(vp: GfVec4i): void {
    const [x, y, w, h] = vp.data as [number, number, number, number]
    this._encoder?.setViewport(x, y, w, h, 0.0, 1.0)
    // The emulated points size their squares in pixels of the viewport.
    this._viewport = [x, y, w, h]
  }

  /** hgiMetal/graphicsCmds.mm:424-440. WebGPU rejects a scissor rectangle
   *  outside the attachment, so it is clamped. */
  setScissor(sc: GfVec4i): void {
    const [x, y, w, h] = sc.data as [number, number, number, number]
    const [rw, rh] = this._renderSize
    const x0 = Math.min(Math.max(x, 0), rw)
    const y0 = Math.min(Math.max(y, 0), rh)
    this._encoder?.setScissorRect(x0, y0,
      Math.max(0, Math.min(x + w, rw) - x0), Math.max(0, Math.min(y + h, rh) - y0))
  }

  /** hgiMetal/graphicsCmds.mm:442-462 */
  bindPipeline(pipeline: HgiGraphicsPipelineHandle): void {
    const p = pipeline.Get() as HgiWebGPUGraphicsPipeline | null
    const state = p?.getRenderPipelineState()
    const control = p?.getComputePipelineState()
    if (this._encoder && (p?.isRasterizationDisabled() || p?.exceedsDeviceLimits())) {
      // No fragments and no vertex-stage writes: its draws are nothing
      // (HgiWebGPUGraphicsPipeline._CreateRenderPipelineState). A pipeline
      // over the device's binding limits was not created and was
      // reported then; its draws are skipped too.
      this._pipeline = p
      this._patch = null
      this._patchConstants = null
      this._rasterizationDisabled = true
      return
    }
    this._rasterizationDisabled = false
    if (!this._encoder || !p || (!state && !control)) {
      TF_CODING_ERROR('HgiWebGPU: BindPipeline with an invalid pipeline')
      this._pipeline = null
      return
    }
    this._pipeline = p
    this._patch = p.getPatchEmulation()
    this._patchConstants = null
    if (!state) {
      // The post-tessellation control stage: dispatched on the pre-pass
      // encoder by its draws (_DispatchControl).
      this._resourcesDirty = true
      return
    }
    this._encoder.setPipeline(state)

    // hgiMetal/graphicsPipeline.mm BindPipeline sets the blend color and
    // stencil reference of the pipeline descriptor on the encoder.
    const desc = p.getDescriptor()
    const color = desc.colorAttachmentDescs[0]?.blendConstantColor.data
    if (color) {
      this._encoder.setBlendConstant({ r: color[0]!, g: color[1]!, b: color[2]!, a: color[3]! })
    }
    if (desc.depthState.stencilTestEnabled) {
      this._encoder.setStencilReference(desc.depthState.stencilFront.referenceValue)
    }

    // Groups the program declares nothing in still need a (empty) bind group.
    const layouts = p.getBindGroupLayouts()
    layouts.layouts.forEach((layout, group) => {
      if (layouts.entries[group]!.length === 0) {
        this._encoder!.setBindGroup(group, this._hgi._getEmptyBindGroup(layout))
      }
    })
    this._resourcesDirty = true
  }

  /** hgiMetal/graphicsCmds.mm:464-480: the resources are bound before the
   *  next draw (_SyncArgumentBuffer, :386-402). */
  bindResources(r: HgiResourceBindingsHandle): void {
    this._resourceBindings = r.Get() as HgiWebGPUResourceBindings | null
    this._resourcesDirty = true
  }

  /** hgiMetal/graphicsCmds.mm:482-494 */
  setConstantValues(
    pipeline: HgiGraphicsPipelineHandle,
    _stages: HgiShaderStage,
    _bindIndex: number,
    byteSize: number,
    data: HgiCpuData,
  ): void {
    const p = pipeline.Get() as HgiWebGPUGraphicsPipeline | null
    if (!this._encoder || !p || p.isRasterizationDisabled() || p.exceedsDeviceLimits()) return
    if (p.getPatchEmulation()) {
      // Bound with the patch parameters at the next draw (_DrawPatches).
      this._patchConstants = this._constants.allocateSlot(byteSize, HgiWebGPUBytes(data, 0, byteSize))
      return
    }
    HgiWebGPUResourceBindings.setConstantValues(
      this._constants, this._encoder, p.getBindGroupLayouts(), byteSize, data)
  }

  /** hgiMetal/graphicsCmds.mm:496-509 */
  bindVertexBuffers(bindings: HgiVertexBufferBindingVector): void {
    for (const binding of bindings) {
      const source = binding.buffer.Get() as HgiWebGPUBuffer | null
      const buffer = source?.getBufferId()
      if (buffer) {
        this._encoder?.setVertexBuffer(binding.index, buffer, binding.byteOffset)
        this._vertexBindings.set(binding.index, { buffer, source: source!, byteOffset: binding.byteOffset })
      }
    }
  }

  /** hgiMetal/graphicsCmds.mm:511-549 */
  draw(vertexCount: number, baseVertex: number, instanceCount: number, baseInstance: number): void {
    if (this._rasterizationDisabled) return
    if (this._isPulledVertexDraw()) {
      // Vertex pulling: vertexCount vertices from baseVertex; the
      // per-draw-command buffers step by baseInstance as for patches.
      this._drawPatches({
        patchStart: 0, patchCount: vertexCount,
        instanceCount, baseInstance, baseVertex, drawIndex: baseInstance, indexBuffer: null,
      })
      return
    }
    if (this._patch) {
      // hgiMetal/graphicsCmds.mm:524-532: drawPatches from patch 0, the
      // per-draw buffers stepped by baseInstance; no control point indices.
      this._drawPatches({
        patchStart: 0,
        patchCount: Math.floor(vertexCount / this._patch.controlPoints),
        instanceCount, baseInstance, baseVertex: 0, drawIndex: baseInstance, indexBuffer: null,
      })
      return
    }
    if (!this._syncResources()) return
    this._encoder!.draw(vertexCount, instanceCount, baseVertex, baseInstance)
  }

  /** hgiMetal/graphicsCmds.mm:551-620. WebGPU has no multi-draw indirect;
   *  each draw is issued from its own record (stride apart). */
  drawIndirect(
    drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number,
    drawCount: number,
    stride: number,
  ): void {
    if (this._rasterizationDisabled) return
    if (this._isPulledVertexDraw()) {
      // Vertex pulling: the draws' {vertexCount, instanceCount, baseVertex,
      // baseInstance} are read from the CPU copy of the draw parameter
      // buffer (HgiWebGPUBuffer's staging memory, which mirrors what Storm
      // copied into it). PLATFORM-DIVERGENCE(hgiWebGPU-patch-indirect): as for
      // patches, GPU frustum culling's instance counts are not read.
      const staging = (drawParameterBuffer.Get() as HgiWebGPUBuffer | null)?.getCPUStagingAddress()
      if (!staging) return
      const words = new Uint32Array(staging.buffer, staging.byteOffset, Math.floor(staging.byteLength / 4))
      for (let i = 0; i < drawCount; i++) {
        const cmd = (drawBufferByteOffset + i * stride) / 4
        this._drawPatches({
          patchStart: 0,
          patchCount: words[cmd] ?? 0,
          instanceCount: words[cmd + 1] ?? 0,
          baseVertex: words[cmd + 2] ?? 0,
          baseInstance: words[cmd + 3] ?? 0,
          drawIndex: i, indexBuffer: null,
        })
      }
      return
    }
    if (this._patch) {
      // hgiMetal/graphicsCmds.mm:584-597 draws the patches from Metal's
      // patch indirect arguments; the emulation draws 3 or 6 vertices per
      // patch, which needs the arguments on the CPU, and DrawIndirect has
      // no CPU copy of them (DrawIndexedIndirect has).
      TF_CODING_ERROR('HgiWebGPU: DrawIndirect of patches is not supported')
      return
    }
    if (!this._syncResources()) return
    const buffer = (drawParameterBuffer.Get() as HgiWebGPUBuffer | null)?.getBufferId()
    if (!buffer) return
    for (let i = 0; i < drawCount; i++) {
      this._encoder!.drawIndirect(buffer, drawBufferByteOffset + i * stride)
    }
  }

  /** hgiMetal/graphicsCmds.mm:622-670 */
  drawIndexed(
    indexBuffer: HgiBufferHandle,
    indexCount: number,
    indexBufferByteOffset: number,
    baseVertex: number,
    instanceCount: number,
    baseInstance: number,
  ): void {
    if (this._rasterizationDisabled) return
    const source = indexBuffer.Get() as HgiWebGPUBuffer | null
    const buffer = source?.getBufferId()
    if (this._patch) {
      // hgiMetal/graphicsCmds.mm:637-650: drawIndexedPatches with
      // patchStart indexBufferByteOffset / sizeof(uint32_t), patchCount
      // indexCount and the patch base offsets stepped by baseVertex, as
      // upstream passes them.
      this._drawPatches({
        patchStart: Math.floor(indexBufferByteOffset / 4),
        patchCount: indexCount,
        instanceCount, baseInstance, baseVertex, drawIndex: baseInstance, indexBuffer: buffer ? source : null,
      })
      return
    }
    if (!this._syncResources()) return
    if (!buffer) return
    // HgiBufferUsageIndex32: 32-bit indices.
    this._encoder!.setIndexBuffer(buffer, 'uint32', indexBufferByteOffset)
    this._encoder!.drawIndexed(indexCount, instanceCount, 0, baseVertex, baseInstance)
  }

  /** hgiMetal/graphicsCmds.mm:672-764. WebGPU has no multi-draw indirect;
   *  draws are issued one by one, as hgiMetal does without indirect command
   *  buffers. */
  drawIndexedIndirect(
    indexBuffer: HgiBufferHandle,
    drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number,
    drawCount: number,
    stride: number,
    drawParameterBufferUInt32: readonly number[] | Uint32Array,
    patchBaseVertexByteOffset: number,
  ): void {
    if (this._rasterizationDisabled) return
    if (this._isPulledVertexDraw()) {
      // Vertex pulling: {indexCount, instanceCount, firstIndex, baseVertex,
      // baseInstance} per draw from the CPU copy, as for patches.
      const index = _IndexSource(indexBuffer)
      for (let i = 0; i < drawCount; i++) {
        const cmd = (i * stride) / 4
        this._drawPatches({
          patchCount: drawParameterBufferUInt32[cmd] ?? 0,
          instanceCount: drawParameterBufferUInt32[cmd + 1] ?? 0,
          patchStart: drawParameterBufferUInt32[cmd + 2] ?? 0,
          baseVertex: drawParameterBufferUInt32[cmd + 3] ?? 0,
          baseInstance: drawParameterBufferUInt32[cmd + 4] ?? 0,
          drawIndex: i,
          indexBuffer: index,
        })
      }
      return
    }
    if (this._patch) {
      // hgiMetal/graphicsCmds.mm:705-735: per draw, the per-draw-command
      // buffers step to the draw (SetVertexBufferOffsets(encoder, offset)),
      // the per-control-point buffers to the draw's base vertex read from
      // the CPU copy of the draw parameters (SetPatchBaseOffsets), and Metal
      // reads MTLDrawPatchIndirectArguments {patchCount, instanceCount,
      // patchStart, baseInstance} (hdSt/pipelineDrawBatch.cpp:287-307).
      // The emulation draws 3 or 6 vertices per patch, which a WebGPU
      // indirect draw of those arguments cannot express, so the arguments
      // are read from the same CPU copy.
      // PLATFORM-DIVERGENCE(hgiWebGPU-patch-indirect): instanceCount comes from
      // the CPU copy, so GPU frustum culling's writes to the draw parameter
      // buffer do not skip patch draws (the image is unchanged; culled
      // draws are drawn).
      const index = _IndexSource(indexBuffer)
      for (let i = 0; i < drawCount; i++) {
        const cmd = (i * stride) / 4
        const baseVertexIndex = (patchBaseVertexByteOffset + i * stride) / 4
        this._drawPatches({
          patchCount: drawParameterBufferUInt32[cmd] ?? 0,
          instanceCount: drawParameterBufferUInt32[cmd + 1] ?? 0,
          patchStart: drawParameterBufferUInt32[cmd + 2] ?? 0,
          baseInstance: drawParameterBufferUInt32[cmd + 3] ?? 0,
          baseVertex: drawParameterBufferUInt32[baseVertexIndex] ?? 0,
          drawIndex: i,
          indexBuffer: index,
        })
      }
      return
    }
    if (!this._syncResources()) return
    const index = (indexBuffer.Get() as HgiWebGPUBuffer | null)?.getBufferId()
    const params = (drawParameterBuffer.Get() as HgiWebGPUBuffer | null)?.getBufferId()
    if (!index || !params) return
    this._encoder!.setIndexBuffer(index, 'uint32')
    for (let i = 0; i < drawCount; i++) {
      this._encoder!.drawIndexedIndirect(params, drawBufferByteOffset + i * stride)
    }
  }

  /** One emulated patch draw (HgiWebGPUPostTessVertexShaderSection): the
   *  per-draw parameters Metal expresses with vertex buffer offsets
   *  (hgiMetal/stepFunctions.mm:76-104) and patchStart, written to a uniform
   *  slice; the constants bind group with them, the control point indices
   *  and the pulled vertex buffers; then patchCount * verticesPerPatch
   *  vertices from vertex 0, so the stage's patch_id counts from the draw's
   *  first patch. */
  private _drawPatches(d: _PatchDraw): void {
    const pe = this._patch!
    if (pe.primitive === 'control') {
      this._dispatchControl(d)
      return
    }
    if (!this._syncResources()) return
    if (d.patchCount === 0 || d.instanceCount === 0) return
    let tessellated: HgiWebGPUTessellatedDraw | null = null
    if (pe.tessellated) {
      // The tessellation the control stage's draw encoded
      // (hgiMetal/resourceBindings.mm:136-141 binds the factors; the
      // tessellator reads them).
      const factors = this._tessFactorsBinding(HgiBindResourceType.HgiBindResourceTypeTessFactors, null)
      tessellated = factors ? this._tessDraws.get(this._tessKey(factors, d)) ?? null : null
      if (!tessellated) {
        TF_CODING_ERROR(`HgiWebGPU: patch draw '${this._pipeline!.getDescriptor().debugName}' has per-patch ` +
          'tessellation factors but no post-tessellation control stage ran for it')
        return
      }
    }
    const group = this._patchConstantsBindGroup(d, tessellated)
    if (!group) return
    this._encoder!.setBindGroup(HgiWebGPUConstantsBindGroup, group.bindGroup, group.offsets)
    if (tessellated) {
      // The tessellator's triangles, as an indexed indirect draw of its
      // points (HgiWebGPUPostTessVertexShaderSection reads each point).
      this._encoder!.setIndexBuffer(tessellated.indices, 'uint32')
      this._encoder!.drawIndexedIndirect(tessellated.argsBuffer, tessellated.argsOffset)
      return
    }
    this._encoder!.draw(d.patchCount * pe.verticesPerPatch, d.instanceCount, 0, d.baseInstance)
  }

  /** The emulated HgiPolygonModeLine's culling and front face
   *  (HgiWebGPUPostTessVertexShaderSection): 1 cull front, 2 cull back, 4
   *  front face counter-clockwise, as the pipeline's GPUPrimitiveState
   *  would apply them to the triangles. */
  private _polygonModeLineFlags(): number {
    if (!this._patch?.lines) return 0
    const ras = this._pipeline!.getDescriptor().rasterizationState
    const cull = HgiWebGPUConversions.getCullMode(ras.cullMode)
    return (cull === 'front' ? 1 : cull === 'back' ? 2 : 0) |
      (HgiWebGPUConversions.getWinding(ras.winding) === 'ccw' ? 4 : 0)
  }

  /** The constants bind group of an emulated patch draw: the constant
   *  parameters, HgiWebGPUPatchDraw (the per-draw parameters Metal
   *  expresses with vertex buffer offsets, hgiMetal/stepFunctions.mm:76-104,
   *  and patchStart), the control point indices, the pulled vertex buffers
   *  and the tessellated points. */
  private _patchConstantsBindGroup(d: _PatchDraw, tessellated: HgiWebGPUTessellatedDraw | null):
    { bindGroup: GPUBindGroup, offsets: number[] } | null {
    const pe = this._patch!
    const layouts = this._pipeline!.getBindGroupLayouts()
    const layout = layouts.layouts[HgiWebGPUConstantsBindGroup]
    const layoutEntries = layouts.entries[HgiWebGPUConstantsBindGroup]
    if (!layout || !layoutEntries) return null

    // HgiWebGPUPatchDraw: header, viewport, tess, corners, then per location
    // the first word and the words per control point, instance and patch.
    // Written to a scratch array reused across draws (the allocator copies
    // it into its staging buffer).
    const wordCount = 24 + 4 * pe.attributeSlots
    if (this._patchWords.length < wordCount) {
      this._patchWords = new Uint32Array(wordCount)
      this._patchFloats = new Float32Array(this._patchWords.buffer)
    }
    const words = this._patchWords
    const floats = this._patchFloats
    words.fill(0, 0, wordCount)
    words[0] = d.patchStart
    words[1] = d.baseInstance
    words[2] = d.baseVertex
    words[3] = d.indexBuffer ? 1 : 0
    for (let i = 0; i < 4; i++) floats[4 + i] = this._viewport[i]!
    words[8] = d.patchCount
    words[9] = tessellated ? 1 : 0
    words[10] = this._polygonModeLineFlags()
    for (let i = 0; i < 12; i++) floats[12 + i] = pe.corners[i] ?? 0
    // The packed variant (webgpu-storage-buffer-limit): the index buffer and
    // the vertex buffers the draw binds, copied into one buffer
    // (HgiWebGPUPulledAttributePacker); the attributes' first words and
    // the indices' first word (tess.w) count from their copies.
    let packed: HgiWebGPUPackedAttributes | null = null
    if (pe.packed) {
      const sources: HgiWebGPUBuffer[] = []
      if (d.indexBuffer) sources.push(d.indexBuffer)
      for (const a of pe.attributes) {
        const b = this._vertexBindings.get(a.bindingIndex)?.source
        if (b && !sources.includes(b)) sources.push(b)
      }
      const packer = this._hgi._getPulledAttributePacker()
      this._packSerial ??= packer.beginCmds()
      packed = packer.pack(this._packSerial, sources, b => this._written.has(b), this._packEncoder)
      if (!packed) return null
      this._packed.add(packed)
      if (d.indexBuffer) words[11] = packed.bases.get(d.indexBuffer.getBufferId()!)! / 4
    }
    const attributeBuffers = this._patchAttributeBuffers
    attributeBuffers.length = 0
    for (const a of pe.attributes) {
      const vb = this._vertexBindings.get(a.bindingIndex)
      if (!vb || vb.byteOffset % 4 !== 0) {
        TF_CODING_ERROR(`HgiWebGPU: no 4-byte aligned vertex buffer bound at ${a.bindingIndex} ` +
          `for patch attribute location ${a.location}`)
        return null
      }
      const strideWords = a.stride / 4
      let first = ((packed?.bases.get(vb.buffer) ?? 0) + vb.byteOffset + a.offset) / 4
      let perControlPoint = 0
      let perInstance = 0
      let perPatch = 0
      switch (a.stepFunction) {
        case HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerDrawCommand:
          first += strideWords * d.drawIndex
          break
        case HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionConstant:
          break
        case HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerInstance:
          perInstance = strideWords
          break
        case HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerPatch:
          perPatch = strideWords
          break
        default:
          // PerPatchControlPoint (and PerVertex): the control point's index
          // from the patch base vertex.
          first += strideWords * d.baseVertex
          perControlPoint = strideWords
      }
      // Bit 31 of the per-control-point word flags a packed 10-10-10-2
      // attribute (HgiWebGPUPostTessVertexShaderSection's fetch unpacks it).
      const w = 24 + 4 * a.location
      words[w] = first
      words[w + 1] = (perControlPoint | (a.packedInt1010102 ? 0x80000000 : 0)) >>> 0
      words[w + 2] = perInstance
      words[w + 3] = perPatch
      attributeBuffers[a.location] = vb.buffer
    }
    const slot = this._constants.allocateSlot(wordCount * 4, new Uint8Array(words.buffer, 0, wordCount * 4))

    // The bind group's resources: its key is compared with the previous
    // draw's first, so consecutive draws over the same buffers reuse the
    // bind group without building the key string.
    const resources = this._patchResources
    resources.length = 0
    const offsets: number[] = []
    const key = this._patchKey
    key.length = 0
    key.push(this._bufferId(layout))
    for (const e of layoutEntries) {
      let resource: GPUBufferBinding
      if (e.binding === 0) {
        if (!this._patchConstants) {
          TF_CODING_ERROR('HgiWebGPU: patch draw without constant values')
          return null
        }
        resource = { buffer: this._patchConstants.buffer, offset: 0, size: this._patchConstants.size }
        offsets.push(this._patchConstants.offset)
      } else if (e.binding === HgiWebGPUPatchDrawBinding) {
        resource = { buffer: slot.buffer, offset: 0, size: slot.size }
        offsets.push(slot.offset)
      } else if (e.binding === HgiWebGPUControlPointIndexBinding) {
        resource = { buffer: packed?.buffer ?? d.indexBuffer?.getBufferId() ?? this._PlaceholderStorage() }
      } else if (e.binding === HgiWebGPUTessPointsBinding) {
        resource = { buffer: tessellated?.points ?? this._PlaceholderStorage() }
      } else {
        const buffer = attributeBuffers[e.binding - HgiWebGPUPulledAttributeBindingBase]
        if (!buffer) {
          TF_CODING_ERROR(`HgiWebGPU: nothing to bind at constants binding ${e.binding}`)
          return null
        }
        resource = { buffer }
      }
      resources.push(resource)
      key.push(e.binding, this._bufferId(resource.buffer), resource.size ?? -1)
    }
    const last = this._lastPatchKey
    if (this._lastPatchBindGroup && last.length === key.length && key.every((v, i) => v === last[i])) {
      return { bindGroup: this._lastPatchBindGroup, offsets }
    }
    const k = key.join(',')
    let bindGroup = this._patchBindGroups.get(k)
    if (!bindGroup) {
      bindGroup = this._hgi.getPrimaryDevice().createBindGroup({
        label: 'HgiWebGPU patch draw', layout,
        entries: layoutEntries.map((e, i) => ({ binding: e.binding, resource: resources[i]! })),
      })
      this._patchBindGroups.set(k, bindGroup)
    }
    this._lastPatchKey = key.slice()
    this._lastPatchBindGroup = bindGroup
    return { bindGroup, offsets }
  }

  /** A draw of the post-tessellation control stage (hgiMetal draws it as a
   *  rasterizer-disabled patch draw, graphicsPipeline.mm:187-193): a compute
   *  dispatch of one invocation per patch and instance on the pre-pass
   *  encoder, then the tessellation of the factors it writes
   *  (HgiWebGPUTessellation), kept for the patch draw that follows. */
  private _dispatchControl(d: _PatchDraw): void {
    const p = this._pipeline!
    const pe = this._patch!
    const pipeline = p.getComputePipelineState()
    if (!pipeline || !pe.tessellation) return
    if (d.patchCount === 0 || d.instanceCount === 0) return
    const factors = this._tessFactorsBinding(null, pe.tessFactorsBindIndex)
    if (!factors) {
      TF_CODING_ERROR(`HgiWebGPU: '${p.getDescriptor().debugName}' binds no tessellation factor buffer`)
      return
    }
    const group = this._patchConstantsBindGroup(d, null)
    if (!group) return
    const device = this._hgi.getPrimaryDevice()
    const pass = this._PrePass()
    pass.setPipeline(pipeline)
    const layouts = p.getBindGroupLayouts()
    layouts.layouts.forEach((layout, g) => {
      if (layouts.entries[g]!.length === 0) pass.setBindGroup(g, this._hgi._getEmptyBindGroup(layout))
    })
    this._resourceBindings?.bindResources(device, pass, layouts, this._depthRead, this._write)
    pass.setBindGroup(HgiWebGPUConstantsBindGroup, group.bindGroup, group.offsets)
    pass.dispatchWorkgroups(Math.ceil(d.patchCount / 64), d.instanceCount)

    const tessellation = this._hgi._getTessellation()
    this._tessFrame ??= tessellation.beginFrame()
    const result = tessellation.encode(this._tessFrame, {
      pass: () => this._PrePass(),
      suspend: work => {
        this._prePass?.end()
        this._prePass = null
        work(this._prePassEncoder())
      },
      allocateParams: bytes => this._constants.allocateSlot(bytes.byteLength, bytes),
      factors: factors.buffer,
      factorsByteOffset: factors.offset,
      patchStart: d.patchStart,
      patchCount: d.patchCount,
      instanceCount: d.instanceCount,
      config: pe.tessellation,
    })
    if (result) this._tessDraws.set(this._tessKey(factors, d), result)
  }

  /** The bound tessellation factor buffer: the binding of the given
   *  resource type (the patch draw's HgiBindResourceTypeTessFactors) or
   *  bind index (the control stage's buffer). */
  private _tessFactorsBinding(type: HgiBindResourceType | null, bindIndex: number | null):
    { buffer: GPUBuffer, offset: number } | null {
    const desc = this._resourceBindings?.getDescriptor()
    const b = desc?.buffers.find(x => type !== null ? x.resourceType === type : x.bindingIndex === bindIndex)
    const buffer = (b?.buffers[0]?.Get() as HgiWebGPUBuffer | undefined)?.getBufferId()
    return buffer ? { buffer, offset: b!.offsets[0] ?? 0 } : null
  }

  private _tessKey(factors: { buffer: GPUBuffer, offset: number }, d: _PatchDraw): string {
    return [this._bufferId(factors.buffer), factors.offset, d.patchStart, d.patchCount,
      d.baseVertex, d.baseInstance, d.instanceCount].join(':')
  }

  private _prePassEncoder(): GPUCommandEncoder {
    this._preEncoder ??= this._hgi.getPrimaryDevice().createCommandEncoder({
      label: 'HgiWebGPUGraphicsCmds tessellation',
    })
    return this._preEncoder
  }

  private _PrePass(): GPUComputePassEncoder {
    this._prePass ??= this._prePassEncoder().beginComputePass({ label: 'HgiWebGPUGraphicsCmds tessellation' })
    return this._prePass
  }

  /** The bound pipeline draws a vertex function with vertex pulling
   *  ('vertex' or 'point', HgiWebGPUPostTessVertexShaderSection). */
  private _isPulledVertexDraw(): boolean {
    const primitive = this._patch?.primitive
    return primitive === 'vertex' || primitive === 'point'
  }

  private _bufferId(o: GPUBuffer | GPUBindGroupLayout): number {
    let id = this._bufferIds.get(o)
    if (id === undefined) {
      id = this._nextBufferId++
      this._bufferIds.set(o, id)
    }
    return id
  }

  /** Bound as the control point indices of non-indexed patch draws, which
   *  the shader does not read. */
  private _PlaceholderStorage(): GPUBuffer {
    this._placeholderStorage ??= this._hgi.getPrimaryDevice().createBuffer({
      label: 'HgiWebGPU placeholder', size: 16, usage: 0x0080, // STORAGE
    })
    return this._placeholderStorage
  }

  /** hgiMetal/graphicsCmds.mm:817-838. WebGPU orders the work of separate
   *  passes and synchronizes resource use itself. */
  insertMemoryBarrier(barrier: HgiMemoryBarrier): void {
    TF_VERIFY(barrier === HgiMemoryBarrierBits.HgiMemoryBarrierAll, 'Unknown barrier')
  }

  /** _SyncArgumentBuffer (hgiMetal/graphicsCmds.mm:386-402): bind the
   *  pending resources against the bound pipeline's layouts. */
  private _syncResources(): boolean {
    if (!this._encoder || !this._pipeline) {
      TF_CODING_ERROR('HgiWebGPU: draw without a bound pipeline')
      return false
    }
    if (this._resourcesDirty && this._resourceBindings) {
      this._resourceBindings.bindResources(this._hgi.getPrimaryDevice(), this._encoder,
        this._pipeline.getBindGroupLayouts(), this._depthRead, this._write)
    }
    this._resourcesDirty = false
    return true
  }

  /** hgiMetal/graphicsCmds.mm:855-883 and hgiVulkan/graphicsCmds.cpp
   *  _Submit: end the pass and commit the command buffer. */
  override _submit(_hgi: Hgi, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    if (!this._commandEncoder) return false
    while (this._debugDepth > 0) this.popDebugGroup()
    this._encoder?.end()
    this._encoder = null
    if (this._depthResolve) {
      HgiWebGPU_EncodeDepthResolve(this._hgi.getPrimaryDevice(), this._commandEncoder,
        this._depthResolve.source, this._depthResolve.target)
      this._depthResolve = null
    }
    const queue = this._hgi.getPrimaryDevice().queue
    if (this._depthReadEncoder) {
      // The depth copies the pass samples precede it (depthSampling.ts).
      this._hgi._submitNow([this._depthReadEncoder.finish()])
      this._depthReadEncoder = null
      this._depthReads.clear()
    }
    let afterSubmit: (() => Promise<void>) | null = null
    // The packed ranges whose sources were written by work submitted since
    // this cmds copied them (HgiWebGPUPulledAttributePacker.refresh), copied
    // before its passes.
    let refresh: GPUCommandEncoder | null = null
    if (this._packed.size > 0) {
      this._hgi._getPulledAttributePacker().refresh(this._packed, () =>
        refresh ??= this._hgi.getPrimaryDevice().createCommandEncoder({ label: 'HgiWebGPUGraphicsCmds packed attributes' }))
      this._packed.clear()
    }
    if (refresh) this._hgi._submitNow([(refresh as GPUCommandEncoder).finish()])
    if (this._preEncoder) {
      // The control stages and the tessellator run before the render pass
      // (hgiMetal's InsertMemoryBarrier after the control stage,
      // hdSt/pipelineDrawBatch.cpp:1383, orders the same way).
      this._prePass?.end()
      this._prePass = null
      if (this._tessFrame) {
        afterSubmit = this._hgi._getTessellation().endFrame(this._tessFrame, this._preEncoder)
      }
      this._constants.flush()
      this._hgi._submitNow([this._preEncoder.finish(), this._commandEncoder.finish()])
      this._preEncoder = null
      this._tessFrame = null
      this._tessDraws.clear()
    } else {
      this._constants.flush()
      this._hgi._submitNow([this._commandEncoder.finish()])
    }
    void afterSubmit?.()
    for (const b of this._written) b._noteWrite()
    this._written.clear()
    this._commandEncoder = null
    const done = queue.onSubmittedWorkDone().then(() => {
      this._constants.destroy()
      this._placeholderStorage?.destroy()
      return true
    })
    return wait === HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted ? done : true
  }
}

/** The index buffer of a pulled or patch draw. */
function _IndexSource(indexBuffer: HgiBufferHandle): HgiWebGPUBuffer | null {
  const source = indexBuffer.Get() as HgiWebGPUBuffer | null
  return source?.getBufferId() ? source : null
}
