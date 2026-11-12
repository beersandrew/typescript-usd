// A WebGPU device that does nothing, for profiling the CPU side of the
// imaging path in Node (node.ts): scene index chain, Hydra sync, Storm
// resource commit, code generation and the GLSL to WGSL translation, and
// HgiWebGPU's command encoding. Every GPU object is a stub that accepts any
// call; buffers map to zero-filled memory; submissions complete at once.
// Nothing here is drawn, so it measures CPU cost only. Tooling only.

const stub = (fields: Record<string, unknown> = {}): never => new Proxy(fields, {
  get(target, key) {
    if (key in target) return target[key as string]
    if (key === 'then' || typeof key === 'symbol') return undefined
    return (..._args: unknown[]) => stub()
  },
}) as never

// The WebGPU flag namespaces (WebGPU specification values).
const flags: Record<string, Record<string, number>> = {
  GPUBufferUsage: { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 },
  GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 },
  GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
  GPUMapMode: { READ: 1, WRITE: 2 },
  GPUColorWrite: { RED: 1, GREEN: 2, BLUE: 4, ALPHA: 8, ALL: 15 },
}
export function installGpuGlobals(): void {
  for (const [name, values] of Object.entries(flags)) (globalThis as Record<string, unknown>)[name] ??= Object.freeze({ ...values })
  // The WebGPU API is present, as in the browser (HdStRenderDelegate's
  // platform-default check, hdSt/src/renderDelegate.ts); no adapter.
  const nav = globalThis.navigator as unknown as Record<string, unknown> | undefined
  if (nav && !nav.gpu) Object.defineProperty(nav, 'gpu', { value: { requestAdapter: () => Promise.resolve(null), getPreferredCanvasFormat: () => 'bgra8unorm' }, configurable: true })
}

// Limits of the Apple M-series adapter Safari reports (the Safari runs of
// performance-viewer.md), so HgiWebGPU's capabilities match the browser.
const limits = {
  maxTextureDimension1D: 16384, maxTextureDimension2D: 16384, maxTextureDimension3D: 2048, maxTextureArrayLayers: 2048,
  maxBindGroups: 4, maxBindGroupsPlusVertexBuffers: 24, maxBindingsPerBindGroup: 1000,
  maxDynamicUniformBuffersPerPipelineLayout: 8, maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxSampledTexturesPerShaderStage: 48, maxSamplersPerShaderStage: 16, maxStorageBuffersPerShaderStage: 31,
  maxStorageTexturesPerShaderStage: 8, maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 4294967292, maxBufferSize: 4294967296,
  minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
  maxVertexBuffers: 8, maxVertexAttributes: 30, maxVertexBufferArrayStride: 2048, maxInterStageShaderVariables: 28,
  maxColorAttachments: 8, maxColorAttachmentBytesPerSample: 64, maxComputeWorkgroupStorageSize: 32768,
  maxComputeInvocationsPerWorkgroup: 1024, maxComputeWorkgroupSizeX: 1024, maxComputeWorkgroupSizeY: 1024,
  maxComputeWorkgroupSizeZ: 64, maxComputeWorkgroupsPerDimension: 65535,
  maxStorageBuffersInVertexStage: 31, maxStorageBuffersInFragmentStage: 31,
  maxStorageTexturesInVertexStage: 8, maxStorageTexturesInFragmentStage: 8,
}
const features = new Set(['float32-filterable', 'depth-clip-control', 'texture-compression-bc', 'rg11b10ufloat-renderable', 'depth32float-stencil8', 'clip-distances'])

// Bytes per texel of the formats Storm creates; others count 4.
const texelBytes: Record<string, number> = {
  r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, rg8unorm: 2, r16float: 2, r16uint: 2, r16sint: 2, depth16unorm: 2,
  rgba8unorm: 4, 'rgba8unorm-srgb': 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4, rgba8snorm: 4, r32float: 4, r32uint: 4, r32sint: 4,
  rg16float: 4, depth32float: 4, depth24plus: 4, 'depth24plus-stencil8': 4, rg11b10ufloat: 4, rgb10a2unorm: 4,
  rgba16float: 8, rg32float: 8, 'depth32float-stencil8': 8, rgba32float: 16, rgba32uint: 16, rgba32sint: 16,
}
const textureBytes = (format: string, w: number, h: number, d: number, mips: number, samples: number, dimension: string) => {
  let bytes = 0
  for (let m = 0; m < mips; m++) bytes += Math.max(1, w >> m) * Math.max(1, h >> m) * (dimension === '3d' ? Math.max(1, d >> m) : d)
  return bytes * (texelBytes[format] ?? 4) * samples
}

let callSites = false
/** Records the call site of every counted GPU call in counters.calls (slow:
 *  one stack trace per call). */
export function gpuCallSites(on: boolean): void { callSites = on }

/** A stub GPUDevice; counts the draw calls and compute dispatches encoded, the
 *  queue's buffer writes (calls and bytes), the buffers and textures created
 *  (count and bytes) and those still alive (created and not yet destroyed). */
export function createNullDevice(): { device: GPUDevice, counters: { draws: number, dispatches: number, submits: number, buffers: number, textures: number, writes: number, writeBytes: number, bufferBytes: number,
  liveBuffers: number, liveBufferBytes: number, liveTextures: number, liveTextureBytes: number, liveByLabel: Map<string, [number, number]>,
  copies: number, copyBytes: number, maps: number, computePasses: number, renderPasses: number, encoders: number, calls: Map<string, number> } } {
  const counters = { draws: 0, dispatches: 0, submits: 0, buffers: 0, textures: 0, writes: 0, writeBytes: 0, bufferBytes: 0,
    liveBuffers: 0, liveBufferBytes: 0, liveTextures: 0, liveTextureBytes: 0,
    /** copyBufferToBuffer calls and bytes, mapAsync calls, passes and
     *  command encoders created. */
    copies: 0, copyBytes: 0, maps: 0, computePasses: 0, renderPasses: 0, encoders: 0,
    /** With gpuCallSites(true): per GPU call kind, label and calling
     *  function (the first frame outside this file and hgiWebGPU's
     *  wrappers), the call count. */
    calls: new Map<string, number>(),
    /** The live buffers and textures by label: [count, bytes]. */
    liveByLabel: new Map<string, [number, number]>() }
  const track = (label: string, bytes: number, sign: number) => {
    const e = counters.liveByLabel.get(label) ?? [0, 0]
    e[0] += sign; e[1] += sign * bytes
    if (e[0] === 0) counters.liveByLabel.delete(label); else counters.liveByLabel.set(label, e)
  }
  const site = (kind: string, label = '') => {
    if (!callSites) return
    const frames = (new Error().stack ?? '').split('\n').slice(2).map(l => l.trim())
    const caller = frames.filter(l => !/null-gpu/.test(l)).slice(0, 3).map(l => l.replace(/^at /, '').replace(/ \(.*\/(packages|apps)\//, ' (').replace(/:\d+\)$/, ')')).join(' < ')
    const key = `${kind} [${label}] ${caller}`
    counters.calls.set(key, (counters.calls.get(key) ?? 0) + 1)
  }
  const draw = () => { counters.draws++ }
  const pass = () => { counters.renderPasses++; return stub({ draw, drawIndexed: draw, drawIndirect: draw, drawIndexedIndirect: draw, end() {} }) }
  const encoder = (desc?: GPUCommandEncoderDescriptor) => { counters.encoders++; site('createCommandEncoder', desc?.label); return stub({ beginRenderPass: pass,
    beginComputePass: (d?: GPUComputePassDescriptor) => { counters.computePasses++; site('beginComputePass', d?.label); return stub({ dispatchWorkgroups() { counters.dispatches++; site('dispatch') }, dispatchWorkgroupsIndirect() { counters.dispatches++; site('dispatch') }, end() {} }) },
    copyBufferToBuffer(_s: GPUBuffer, _so: number, _d: GPUBuffer, _do: number, size: number) { counters.copies++; counters.copyBytes += size; site('copyBufferToBuffer', `${(_s as { label?: string }).label} -> ${(_d as { label?: string }).label}`) },
    finish: () => stub() }) }
  const queue = stub({
    submit() { counters.submits++; site('submit') }, writeBuffer(_buffer: GPUBuffer, _offset: number, data: BufferSource | SharedArrayBuffer, dataOffset = 0, size?: number) {
      counters.writes++; site('writeBuffer', (_buffer as { label?: string }).label)
      const bytes = ArrayBuffer.isView(data) ? data.byteLength / ((data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1) : data.byteLength
      counters.writeBytes += (size ?? bytes - dataOffset) * (ArrayBuffer.isView(data) ? ((data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1) : 1)
    }, writeTexture() {}, copyExternalImageToTexture() {},
    onSubmittedWorkDone: () => Promise.resolve(),
  })
  const device = stub({
    label: 'null device', limits, features, queue, lost: new Promise(() => {}),
    addEventListener() {}, removeEventListener() {}, pushErrorScope() {}, popErrorScope: () => Promise.resolve(null), destroy() {},
    createBuffer(desc: GPUBufferDescriptor) {
      counters.buffers++; site('createBuffer', desc.label)
      counters.bufferBytes += desc.size
      counters.liveBuffers++
      counters.liveBufferBytes += desc.size
      const label = `buffer ${desc.label ?? ''}`
      track(label, desc.size, 1)
      let destroyed = false
      let mapped: ArrayBuffer | undefined
      return stub({ ...desc, size: desc.size, usage: desc.usage, mapState: 'unmapped', label: desc.label ?? '',
        getMappedRange: (offset = 0, size?: number) => { mapped ??= new ArrayBuffer(desc.size); return mapped.slice(offset, size === undefined ? undefined : offset + size) },
        mapAsync: () => { counters.maps++; site('mapAsync', desc.label); return Promise.resolve() }, unmap() {},
        destroy() { if (!destroyed) { destroyed = true; counters.liveBuffers--; counters.liveBufferBytes -= desc.size; track(label, desc.size, -1) } } })
    },
    createTexture(desc: GPUTextureDescriptor) {
      counters.textures++
      const size = desc.size as GPUExtent3DDict | number[]
      const [width, height, depth] = Array.isArray(size) ? [size[0] ?? 1, size[1] ?? 1, size[2] ?? 1] : [size.width, size.height ?? 1, size.depthOrArrayLayers ?? 1]
      const bytes = textureBytes(desc.format, width, height, depth, desc.mipLevelCount ?? 1, desc.sampleCount ?? 1, desc.dimension ?? '2d')
      counters.liveTextures++
      counters.liveTextureBytes += bytes
      const label = `texture ${desc.label ?? ''}`
      track(label, bytes, 1)
      let destroyed = false
      return stub({ ...desc, width, height, depthOrArrayLayers: depth, format: desc.format, mipLevelCount: desc.mipLevelCount ?? 1,
        sampleCount: desc.sampleCount ?? 1, dimension: desc.dimension ?? '2d', usage: desc.usage, createView: () => stub(),
        destroy() { if (!destroyed) { destroyed = true; counters.liveTextures--; counters.liveTextureBytes -= bytes; track(label, bytes, -1) } } })
    },
    createShaderModule: (desc: GPUShaderModuleDescriptor) => stub({ ...desc, getCompilationInfo: () => Promise.resolve({ messages: [] }) }),
    createRenderPipeline: () => stub({ getBindGroupLayout: () => stub() }),
    createComputePipeline: () => stub({ getBindGroupLayout: () => stub() }),
    createRenderPipelineAsync: () => Promise.resolve(stub({ getBindGroupLayout: () => stub() })),
    createComputePipelineAsync: () => Promise.resolve(stub({ getBindGroupLayout: () => stub() })),
    createCommandEncoder: encoder,
  })
  return { device, counters }
}
