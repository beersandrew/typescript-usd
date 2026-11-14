// A content-keyed render pipeline cache on every GPUDevice, so a pipeline
// created again (an exhibit unloaded and loaded again, a Storm program
// rebuilt) reuses the one already compiled.
//
// PLATFORM-DIVERGENCE(usdview-pipeline-cache): usdview creates each Storm
// pipeline when its first draw needs it (hgiMetal/graphicsPipeline.mm, through
// HgiMetal::CreateGraphicsPipeline), and native drivers keep compiled
// pipelines in their own caches. WebGPU has no pipeline cache, and WebKit
// compiles each new pipeline's Metal shaders on the GPU process's timeline,
// about 15-20 ms each (performance-viewer.md, November 13).
//
// A pipeline's key is its descriptor, with each shader module replaced by its
// WGSL source and each pipeline layout by its bind group layouts' entries.
// Labels are ignored. A request whose key matches a pipeline already created
// gets that pipeline. WebGPU accepts it because equal layouts are
// group-equivalent.
//
// Main.ts imports this after perf-log.ts. These wrappers are then outermost,
// so a pipeline served from the cache is not counted as a creation.

const codeOf = new WeakMap<object, string>()
const entriesOf = new WeakMap<object, unknown>()
const groupsOf = new WeakMap<object, object[]>()

if (typeof GPUDevice !== 'undefined') {
  const D = GPUDevice.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const createShaderModule = D.createShaderModule!, createBindGroupLayout = D.createBindGroupLayout!
  const createPipelineLayout = D.createPipelineLayout!
  const createRenderPipeline = D.createRenderPipeline!, createRenderPipelineAsync = D.createRenderPipelineAsync!
  D.createShaderModule = function (this: GPUDevice, ...a: unknown[]) {
    const m = createShaderModule.apply(this, a) as object
    codeOf.set(m, (a[0] as GPUShaderModuleDescriptor).code)
    return m
  }
  D.createBindGroupLayout = function (this: GPUDevice, ...a: unknown[]) {
    const l = createBindGroupLayout.apply(this, a) as object
    entriesOf.set(l, (a[0] as GPUBindGroupLayoutDescriptor).entries)
    return l
  }
  D.createPipelineLayout = function (this: GPUDevice, ...a: unknown[]) {
    const l = createPipelineLayout.apply(this, a) as object
    groupsOf.set(l, [...(a[0] as GPUPipelineLayoutDescriptor).bindGroupLayouts] as object[])
    return l
  }

  // One index per WGSL source, shared by every key.
  const codes = new Map<string, number>()
  const codeId = (m: GPUShaderModule) => {
    const code = codeOf.get(m)
    if (code === undefined) return undefined
    let i = codes.get(code)
    if (i === undefined) codes.set(code, i = codes.size)
    return i
  }
  const keyOf = (desc: GPURenderPipelineDescriptor): string | undefined => {
    const vertex = codeId(desc.vertex.module)
    const fragment = desc.fragment ? codeId(desc.fragment.module) : null
    if (vertex === undefined || fragment === undefined) return undefined
    let layout: unknown = 'auto'
    if (desc.layout !== 'auto') {
      const groups = groupsOf.get(desc.layout as object)
      if (!groups) return undefined
      layout = groups.map(g => entriesOf.get(g) ?? null)
    }
    const { label: _l, ...rest } = desc
    return JSON.stringify({ ...rest, layout, vertex: { ...desc.vertex, module: vertex },
      ...(desc.fragment ? { fragment: { ...desc.fragment, module: fragment } } : {}) })
  }

  // Per device: created pipelines and those still compiling, by key.
  interface Cache { ready: Map<string, GPURenderPipeline>, compiling: Map<string, Promise<GPURenderPipeline>> }
  const caches = new WeakMap<GPUDevice, Cache>()
  const cacheOf = (device: GPUDevice) => {
    let c = caches.get(device)
    if (!c) caches.set(device, c = { ready: new Map(), compiling: new Map() })
    return c
  }

  D.createRenderPipeline = function (this: GPUDevice, ...a: unknown[]) {
    const key = keyOf(a[0] as GPURenderPipelineDescriptor)
    const hit = key && cacheOf(this).ready.get(key)
    if (hit) return hit
    const p = createRenderPipeline.apply(this, a) as GPURenderPipeline
    if (key) cacheOf(this).ready.set(key, p)
    return p
  }
  D.createRenderPipelineAsync = function (this: GPUDevice, ...a: unknown[]) {
    const key = keyOf(a[0] as GPURenderPipelineDescriptor)
    if (!key) return createRenderPipelineAsync.apply(this, a)
    const c = cacheOf(this)
    const hit = c.ready.get(key)
    if (hit) return Promise.resolve(hit)
    const pending = c.compiling.get(key)
    if (pending) return pending
    const p = (createRenderPipelineAsync.apply(this, a) as Promise<GPURenderPipeline>).then(pipeline => {
      c.ready.set(key, pipeline); c.compiling.delete(key); return pipeline
    }, error => { c.compiling.delete(key); throw error })
    c.compiling.set(key, p)
    return p
  }
}

export {}
