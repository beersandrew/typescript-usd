// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/hgi.h,
//  pxr/imaging/hgiMetal/hgi.mm, pxr/imaging/hgiVulkan/hgi.cpp,
//  pxr/imaging/hgiVulkan/hgi.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPU: the WebGPU implementation of the Hydra Graphics Interface.
// Modelled on pxr/imaging/hgiMetal/hgi.{h,mm} (resource creation and the
// TfType/HgiFactory registration) and pxr/imaging/hgiVulkan/hgi.{h,cpp}
// (each cmds object submits its own command buffer; no indirect command
// encoder).
//
// WebGPU adaptations:
// - The device is obtained asynchronously (navigator.gpu.requestAdapter /
//   requestDevice), so HgiWebGPU is constructed from a GPUDevice and
//   HgiWebGPU.Create() / the HgiFactory return promises (see hgi/hgi.ts).
// - Shader bodies are translated to WGSL through an
//   HgiWebGPUShaderBodyTranslator (shaderBodyTranslator.ts), which starts as
//   a pass-through for bodies that are WGSL already.

import { HgiWebGPUPulledAttributePacker } from './pulledAttributePacker.ts'
import { HgiWebGPUTessellation } from './tessellation.ts'
import {
  Hgi,
  HgiFactory,
  HgiGetTfType,
  type HgiCmds,
  type HgiSubmitWaitType,
  type HgiBufferDesc,
  type HgiBufferHandle,
  type HgiComputeCmdsDesc,
  type HgiComputePipelineDesc,
  type HgiComputePipelineHandle,
  type HgiGraphicsCmdsDesc,
  type HgiGraphicsPipelineDesc,
  type HgiGraphicsPipelineHandle,
  type HgiIndirectCommandEncoder,
  type HgiResourceBindingsDesc,
  type HgiResourceBindingsHandle,
  type HgiSamplerDesc,
  type HgiSamplerHandle,
  type HgiShaderFunctionDesc,
  type HgiShaderFunctionHandle,
  type HgiShaderProgramDesc,
  type HgiShaderProgramHandle,
  type HgiTextureDesc,
  type HgiTextureHandle,
  type HgiTextureViewDesc,
  type HgiTextureViewHandle,
  HgiHandle,
  HgiTextureView,
} from 'typescript-usd/hgi'
import { MakeTokens as TfMakeTokens, Type as TfType, type Token as TfToken } from 'typescript-usd/tf'
import { HgiWebGPUBlitCmds } from './blitCmds.ts'
import { HgiWebGPUBuffer } from './buffer.ts'
import { HgiWebGPUCapabilities } from './capabilities.ts'
import { HgiWebGPUComputeCmds } from './computeCmds.ts'
import { HgiWebGPUComputePipeline } from './computePipeline.ts'
import { HgiWebGPUSetupDebug } from './diagnostic.ts'
import { HgiWebGPUGarbageCollector } from './garbageCollector.ts'
import { HgiWebGPUGraphicsCmds } from './graphicsCmds.ts'
import { HgiWebGPUGraphicsPipeline } from './graphicsPipeline.ts'
import { HgiWebGPUResourceBindings } from './resourceBindings.ts'
import { HgiWebGPUSampler } from './sampler.ts'
import {
  HgiWebGPUWgslPassThroughTranslator,
  type HgiWebGPUShaderBodyTranslator,
} from './shaderBodyTranslator.ts'
import { HgiWebGPUShaderFunction } from './shaderFunction.ts'
import { HgiWebGPUShaderProgram } from './shaderProgram.ts'
import { HgiWebGPUTexture } from './texture.ts'

/** The API name token. HgiTokens (pxr/imaging/hgi/tokens.h:17-22) names the
 *  upstream backends only, so HgiWebGPU defines its own. */
export const HgiWebGPUTokens = TfMakeTokens({ WebGPU: 'WebGPU' })

/** Optional WebGPU features HgiWebGPU enables when the adapter has them. */
const _optionalFeatures: GPUFeatureName[] = [
  'float32-filterable',
  'depth-clip-control',
  'texture-compression-bc',
  'rg11b10ufloat-renderable',
  // HgiFormatFloat32UInt8 depth targets (conversions.ts GetPixelFormat), as
  // the depthStencil AOVs of HdxPickTask's overlay pass use.
  'depth32float-stencil8',
  // The fragment builtin primitive_index (gl_PrimitiveID; see
  // HgiWebGPUShaderGenerator).
  'primitive-index' as GPUFeatureName,
  // The vertex builtin clip_distances (gl_ClipDistance; see
  // HgiWebGPUShaderGenerator, HgiWebGPUCapabilities).
  'clip-distances' as GPUFeatureName,
]

/** Limits raised to the adapter's maximum. */
const _raisedLimits = [
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxStorageBuffersPerShaderStage',
  'maxSampledTexturesPerShaderStage',
  'maxSamplersPerShaderStage',
  'maxUniformBufferBindingSize',
  // Clip distances count against the interstage variables (WebGPU
  // maxInterStageShaderVariables validation), with the emulated
  // gl_PointCoord (HgiWebGPUPointCoordLocation) at the last guaranteed
  // location.
  'maxInterStageShaderVariables',
] as const

/** Per-stage limits that adapters may expose in addition to the
 *  per-shader-stage ones (Safari validates storage buffer counts in vertex
 *  and fragment stages against them; a material program's shader data adds
 *  a storage buffer). Raised when the adapter has them; Metal has no such
 *  per-stage cap below its argument-buffer limits. */
const _raisedLimitsIfPresent = [
  'maxStorageBuffersInVertexStage',
  'maxStorageBuffersInFragmentStage',
  'maxStorageTexturesInVertexStage',
  'maxStorageTexturesInFragmentStage',
] as const

const _mipmapShader = `
struct VsOut { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var corners = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  let p = corners[i];
  var o: VsOut;
  o.position = vec4<f32>(p, 0.0, 1.0);
  o.uv = p * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
  return o;
}
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;
@fragment fn fs(i: VsOut) -> @location(0) vec4<f32> { return textureSample(t, s, i.uv); }
`

export class HgiWebGPU extends Hgi {
  private _device: GPUDevice
  private readonly _capabilities: HgiWebGPUCapabilities
  private _translator: HgiWebGPUShaderBodyTranslator = HgiWebGPUWgslPassThroughTranslator
  private readonly _emptyBindGroups = new WeakMap<GPUBindGroupLayout, GPUBindGroup>()
  private readonly _mipmapPipelines = new Map<GPUTextureFormat, GPURenderPipeline | null>()
  private _mipmapSampler: GPUSampler | null = null
  private _frameDepth = 0
  /** PLATFORM-DIVERGENCE(hgiwebgpu-coalesced-submits): upstream commits each
   *  Hgi*Cmds' Metal command buffer when it is submitted, which is cheap. In a
   *  browser every GPUQueue.submit is a message to the GPU process (WebKit:
   *  about half a millisecond each), and a frame that loads payloads submits
   *  hundreds of small blit command buffers (HdStDispatchBuffer::CopyData per
   *  draw batch, texture uploads and their mipmaps): the USD Museum's tour in
   *  Safari spent 150-360 ms of such frames outside script. So a blit cmds
   *  submitted without waiting (HgiWebGPUBlitCmds._submit) is finished and
   *  held here, and submitted in the same GPUQueue.submit as the next
   *  graphics or compute cmds, before their command buffers, or at endFrame.
   *  The queue runs the same command buffers in the same order; only the
   *  number of submits changes. Work that waits, or reads back, submits at
   *  once, after what is held. */
  private readonly _held: { buffer: GPUCommandBuffer, submitted: () => void }[] = []

  /** Holds a finished command buffer for the next submit (see _held);
   *  `submitted` runs once it is submitted. */
  _holdSubmit(buffer: GPUCommandBuffer, submitted: () => void): void {
    this._held.push({ buffer, submitted })
  }

  /** GPUQueue.submit of the held command buffers, then `buffers`, in one call. */
  _submitNow(buffers: GPUCommandBuffer[]): void {
    const held = this._held.splice(0)
    if (held.length === 0 && buffers.length === 0) return
    this._device.queue.submit([...held.map(h => h.buffer), ...buffers])
    for (const h of held) h.submitted()
  }
  private readonly _garbageCollector: HgiWebGPUGarbageCollector
  private _destroyed = false
  private _tessellation: HgiWebGPUTessellation | null = null
  private _pulledAttributePacker: HgiWebGPUPulledAttributePacker | null = null

  /** hgiMetal/hgi.mm:64-129 */
  constructor(device: GPUDevice) {
    super()
    this._device = device
    this._capabilities = new HgiWebGPUCapabilities(device)
    this._garbageCollector = new HgiWebGPUGarbageCollector(device.queue)
    HgiWebGPUSetupDebug(device)
  }

  /** Acquire a WebGPU device and make an HgiWebGPU for it (the device half
   *  of hgiMetal/hgi.mm:64-87). Resolves null when WebGPU is unavailable. */
  static async create(device?: GPUDevice): Promise<HgiWebGPU | null> {
    if (device) return new HgiWebGPU(device)
    const gpu = (globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined)?.gpu
    if (!gpu) return null
    const adapter = await gpu.requestAdapter()
    if (!adapter) return null
    const requiredFeatures = _optionalFeatures.filter(f => adapter.features.has(f))
    const requiredLimits: Record<string, number> = {}
    const limits = adapter.limits as unknown as Record<string, number | undefined>
    for (const name of _raisedLimits) {
      const value = limits[name]
      if (value !== undefined) requiredLimits[name] = value
    }
    // The per-stage storage buffer/texture limits of newer WebGPU default to
    // the spec minimum (8) independently of the per-shader-stage ones;
    // raised only where the adapter reports them.
    for (const name of _raisedLimitsIfPresent) {
      const value = limits[name]
      if (typeof value === 'number') requiredLimits[name] = value
    }
    const created = await adapter.requestDevice({ requiredFeatures, requiredLimits })
    return new HgiWebGPU(created)
  }

  /** hgiMetal/hgi.mm:151-163 */
  IsBackendSupported(): boolean {
    return !this._destroyed && Boolean(this._device)
  }

  /** hgiMetal/hgi.mm:165-169 */
  getPrimaryDevice(): GPUDevice {
    return this._device
  }

  /** The translator of shader bodies to WGSL (shaderBodyTranslator.ts). */
  getShaderBodyTranslator(): HgiWebGPUShaderBodyTranslator {
    return this._translator
  }

  /** Install the translator of shader bodies to WGSL. Shader functions
   *  created afterwards use it. */
  setShaderBodyTranslator(translator: HgiWebGPUShaderBodyTranslator): void {
    this._translator = translator
  }

  isFloat32Filterable(): boolean {
    return this._capabilities.float32Filterable
  }

  /** The device has primitive-index (HgiWebGPUShaderGeneratorHgi). */
  hasPrimitiveIndex(): boolean {
    return this._device.features.has('primitive-index' as GPUFeatureName)
  }

  /** The device has clip-distances (HgiWebGPUShaderGeneratorHgi). */
  hasClipDistances(): boolean {
    return this._device.features.has('clip-distances' as GPUFeatureName)
  }

  /** hgiMetal/hgi.mm:171-177 */
  createGraphicsCmds(desc: HgiGraphicsCmdsDesc): HgiWebGPUGraphicsCmds {
    const cmds = new HgiWebGPUGraphicsCmds(this, desc)
    this._garbageCollector.cmdsCreated(cmds)
    return cmds
  }

  /** hgiMetal/hgi.mm:190-198 */
  createBlitCmds(): HgiWebGPUBlitCmds {
    const cmds = new HgiWebGPUBlitCmds(this)
    this._garbageCollector.cmdsCreated(cmds)
    return cmds
  }

  /** hgiMetal/hgi.mm:179-188 */
  createComputeCmds(desc: HgiComputeCmdsDesc): HgiWebGPUComputeCmds {
    const cmds = new HgiWebGPUComputeCmds(this, desc)
    this._garbageCollector.cmdsCreated(cmds)
    return cmds
  }

  /** hgiMetal/hgi.mm:200-204 */
  protected _CreateTexture(desc: HgiTextureDesc): HgiTextureHandle {
    return new HgiHandle(new HgiWebGPUTexture(this._device, desc), this.getUniqueId())
  }

  /** Wraps a GPUTexture the application owns (e.g. a canvas's
   *  getCurrentTexture()) as an Hgi texture that does not own it, so
   *  HgiInterop can present into it (the WebGPU counterpart of the OpenGL
   *  framebuffer HgiInterop composites into). `desc` describes it (format,
   *  dimensions, usage); Destroy it with DestroyTexture as any texture. */
  wrapExternalTexture(texture: GPUTexture, desc: HgiTextureDesc): HgiTextureHandle {
    return new HgiHandle(new HgiWebGPUTexture(this._device, desc, texture), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:206-210, deferred as hgiVulkan/hgi.cpp:139-143. */
  destroyTexture(texHandle: HgiTextureHandle): void {
    this._garbageCollector.trashObject(texHandle.Get() as HgiWebGPUTexture | null)
    texHandle._reset()
  }

  /** hgiMetal/hgi.mm:212-220 */
  protected _createTextureView(desc: HgiTextureViewDesc): HgiTextureViewHandle {
    const src = new HgiHandle<import('typescript-usd/hgi').HgiTexture>(
      new HgiWebGPUTexture(this._device, desc), this.getUniqueId())
    const view = new HgiTextureView(desc)
    view.setViewTexture(src)
    return new HgiHandle(view, this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:222-240 */
  destroyTextureView(viewHandle: HgiTextureViewHandle): void {
    const view = viewHandle.Get()
    if (view) {
      // Trash the texture inside the view (hgiVulkan/hgi.cpp:155-166).
      const texHandle = view.getViewTexture()
      this._garbageCollector.trashObject(texHandle.Get() as HgiWebGPUTexture | null)
      view.setViewTexture(new HgiHandle())
    }
    viewHandle._reset()
  }

  /** hgiMetal/hgi.mm:242-246 */
  createSampler(desc: HgiSamplerDesc): HgiSamplerHandle {
    return new HgiHandle(new HgiWebGPUSampler(this._device, desc), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:248-252, deferred as hgiVulkan/hgi.cpp:177-181. */
  destroySampler(smpHandle: HgiSamplerHandle): void {
    this._garbageCollector.trashObject(smpHandle.Get() as HgiWebGPUSampler | null)
    smpHandle._reset()
  }

  /** hgiMetal/hgi.mm:254-258 */
  protected _createBuffer(desc: HgiBufferDesc): HgiBufferHandle {
    return new HgiHandle(new HgiWebGPUBuffer(this._device, desc), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:260-264, deferred as hgiVulkan/hgi.cpp:193-197:
   *  Storm's memory managers record a copy out of a buffer and then destroy
   *  it before the copy is submitted (e.g. HdStVBOMemoryManager's
   *  reallocation). */
  destroyBuffer(bufHandle: HgiBufferHandle): void {
    this._garbageCollector.trashObject(bufHandle.Get() as HgiWebGPUBuffer | null)
    bufHandle._reset()
  }

  /** hgiMetal/hgi.mm:266-271 */
  CreateShaderFunction(desc: HgiShaderFunctionDesc): HgiShaderFunctionHandle {
    return new HgiHandle(new HgiWebGPUShaderFunction(this._device, this, desc), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:273-277 */
  destroyShaderFunction(shaderFunctionHandle: HgiShaderFunctionHandle): void {
    // Deferred as hgiVulkan/hgi.cpp:209-213.
    this._garbageCollector.trashObject(shaderFunctionHandle.Get() as HgiWebGPUShaderFunction | null)
    shaderFunctionHandle._reset()
  }

  /** hgiMetal/hgi.mm:279-284 */
  createShaderProgram(desc: HgiShaderProgramDesc): HgiShaderProgramHandle {
    return new HgiHandle(new HgiWebGPUShaderProgram(desc), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:286-290 */
  destroyShaderProgram(shaderProgramHandle: HgiShaderProgramHandle): void {
    shaderProgramHandle._reset()
  }

  /** hgiMetal/hgi.mm:293-298 */
  protected _createResourceBindings(desc: HgiResourceBindingsDesc): HgiResourceBindingsHandle {
    return new HgiHandle(new HgiWebGPUResourceBindings(desc), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:300-304 */
  destroyResourceBindings(resHandle: HgiResourceBindingsHandle): void {
    this._garbageCollector.trashObject(resHandle.Get() as HgiWebGPUResourceBindings | null)
    resHandle._reset()
  }

  /** hgiMetal/hgi.mm:306-311 */
  CreateGraphicsPipeline(desc: HgiGraphicsPipelineDesc): HgiGraphicsPipelineHandle {
    return new HgiHandle(new HgiWebGPUGraphicsPipeline(this._device, desc, {
      unclippedDepth: this._device.features.has('depth-clip-control'),
    }), this.getUniqueId())
  }

  /** PLATFORM-DIVERGENCE(hgiwebgpu-pipeline-ahead): CreateGraphicsPipeline
   *  for a pipeline that will be used later, compiled in the background
   *  (HgiWebGPUGraphicsPipeline's constructor). */
  _createGraphicsPipelineAhead(desc: HgiGraphicsPipelineDesc): HgiGraphicsPipelineHandle {
    return new HgiHandle(new HgiWebGPUGraphicsPipeline(this._device, desc, {
      unclippedDepth: this._device.features.has('depth-clip-control'),
    }, true), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:313-317 */
  destroyGraphicsPipeline(pipeHandle: HgiGraphicsPipelineHandle): void {
    // Deferred as hgiVulkan/hgi.cpp:255-259.
    this._garbageCollector.trashObject(pipeHandle.Get() as HgiWebGPUGraphicsPipeline | null)
    pipeHandle._reset()
  }

  /** hgiMetal/hgi.mm:319-324 */
  CreateComputePipeline(desc: HgiComputePipelineDesc): HgiComputePipelineHandle {
    return new HgiHandle(new HgiWebGPUComputePipeline(this._device, desc), this.getUniqueId())
  }

  /** hgiMetal/hgi.mm:326-330 */
  destroyComputePipeline(pipeHandle: HgiComputePipelineHandle): void {
    // Deferred as hgiVulkan/hgi.cpp:269-273.
    this._garbageCollector.trashObject(pipeHandle.Get() as HgiWebGPUComputePipeline | null)
    pipeHandle._reset()
  }

  /** hgiMetal/hgi.mm:332-335 */
  getAPIName(): TfToken {
    return HgiWebGPUTokens.WebGPU
  }

  /** hgiMetal/hgi.mm:337-341 */
  getCapabilities(): HgiWebGPUCapabilities {
    return this._capabilities
  }

  /** hgiVulkan/hgi.cpp:289-293: WebGPU has no indirect command buffers. */
  getIndirectCommandEncoder(): HgiIndirectCommandEncoder | null {
    return null
  }

  /** hgiMetal/hgi.mm:349-364 (the capture scope has no WebGPU counterpart). */
  startFrame(): void {
    this._frameDepth++
  }

  /** hgiMetal/hgi.mm:366-374 */
  endFrame(): void {
    if (this._frameDepth > 0) this._frameDepth--
    // hgiwebgpu-coalesced-submits: what is still held is submitted with the frame.
    this._submitNow([])
  }

  /** hgiMetal/hgi.mm:376-379. Trashed objects are destroyed as soon as the
   *  work that may use them completes (HgiWebGPUGarbageCollector), so there
   *  is nothing to collect here. */
  garbageCollect(): void {}

  /** hgiVulkan/hgi.cpp:353-381: submit, then let the garbage collector
   *  release objects that were waiting for this cmds object. */
  protected override _SubmitCmds(cmds: HgiCmds, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    const result = super._SubmitCmds(cmds, wait)
    this._garbageCollector.cmdsSubmitted(cmds)
    return result
  }

  /** The garbage collector (hgiVulkan/hgi.h GetGarbageCollector). */
  getGarbageCollector(): HgiWebGPUGarbageCollector {
    return this._garbageCollector
  }

  /** hgiMetal/hgi.mm:131-149 */
  _destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._garbageCollector.destroyAll()
    this._device.destroy()
  }

  /** The tessellator kernels and pools of patch draws with per-patch
   *  factors (HgiWebGPUTessellation), made at first use. */
  _getTessellation(): HgiWebGPUTessellation {
    this._tessellation ??= new HgiWebGPUTessellation(this._device)
    return this._tessellation
  }

  /** The packed buffers of draws over the device's storage buffer limit
   *  (HgiWebGPUPulledAttributePacker), made at first use. */
  _getPulledAttributePacker(): HgiWebGPUPulledAttributePacker {
    this._pulledAttributePacker ??= new HgiWebGPUPulledAttributePacker(this._device)
    return this._pulledAttributePacker
  }

  /** An empty bind group for a pipeline's unused bind group slot. */
  _getEmptyBindGroup(layout: GPUBindGroupLayout): GPUBindGroup {
    let group = this._emptyBindGroups.get(layout)
    if (!group) {
      group = this._device.createBindGroup({ label: 'HgiWebGPU empty', layout, entries: [] })
      this._emptyBindGroups.set(layout, group)
    }
    return group
  }

  /** The pipeline HgiWebGPUBlitCmds::GenerateMipMaps renders levels with. */
  _getMipmapPipeline(format: GPUTextureFormat): GPURenderPipeline | null {
    if (!this._mipmapPipelines.has(format)) {
      const filterable = !format.startsWith('r32float') && !format.startsWith('rg32float') &&
        !format.startsWith('rgba32float') || this._capabilities.float32Filterable
      if (!filterable) {
        this._mipmapPipelines.set(format, null)
      } else {
        const module = this._device.createShaderModule({ label: 'HgiWebGPU mipmaps', code: _mipmapShader })
        this._mipmapPipelines.set(format, this._device.createRenderPipeline({
          label: `HgiWebGPU mipmaps ${format}`,
          layout: 'auto',
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        }))
      }
    }
    return this._mipmapPipelines.get(format) ?? null
  }

  _getMipmapSampler(): GPUSampler {
    this._mipmapSampler ??= this._device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
    return this._mipmapSampler
  }
}

// hgiMetal/hgi.mm:34-38: TfType::Define<HgiMetal, TfType::Bases<Hgi>>() and
// SetFactory<HgiFactory<HgiMetal>>(). The factory acquires a device.
const _type = TfType.define('HgiWebGPU', [HgiGetTfType()])
if (!_type.getFactory()) {
  _type.setFactory(new HgiFactory(() => HgiWebGPU.create()))
}
