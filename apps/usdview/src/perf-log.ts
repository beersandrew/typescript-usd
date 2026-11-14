// ?perfLog=<url>: a per-frame performance log of a page's playback, posted as
// JSON to <url> every few seconds (tooling; off unless the parameter is set).
//
// Each displayed frame (requestAnimationFrame) records its interval and the
// scene frame shown, and frames slower than `slowMs` also record what ran in
// them: the viewer's `usdview:*` spans (load-timing.ts), WebGPU pipeline,
// shader module and texture creations (count and ms), queue texture writes,
// and the resources fetched (count, bytes, the slowest). Every frame also
// counts towards per-second totals. Main.ts imports this before the runtime
// opens a GPU device, so the GPUDevice wrappers see every call.

interface Counts {
  pipelines: number; pipelineMs: number; shaders: number; shaderMs: number
  textures: number; textureWrites: number; textureWriteMs: number
  fetches: number; fetchBytes: number; spans: Record<string, number>
  passes: number; mipPasses: number; submits: number
  slowestFetch?: { name: string, ms: number }
}
const zero = (): Counts => ({ pipelines: 0, pipelineMs: 0, shaders: 0, shaderMs: 0, textures: 0, textureWrites: 0, textureWriteMs: 0, fetches: 0, fetchBytes: 0, spans: {}, passes: 0, mipPasses: 0, submits: 0 })

const slowMs = 50
const endpoint = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('perfLog')

if (endpoint && typeof GPUDevice !== 'undefined') {
  let counts = zero()
  const t0 = performance.now()
  const round = (v: number) => Math.round(v * 10) / 10
  const timedWrap = (proto: object, names: string[], add: (ms: number) => void) => {
    const P = proto as Record<string, (...a: unknown[]) => unknown>
    for (const name of names) {
      const original = P[name]
      if (typeof original !== 'function') continue
      P[name] = function (this: unknown, ...a: unknown[]) {
        const s = performance.now()
        const result = original.apply(this, a)
        if (result instanceof Promise) void result.finally(() => add(performance.now() - s))
        else add(performance.now() - s)
        return result
      }
    }
  }
  timedWrap(GPUDevice.prototype, ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync'], ms => { counts.pipelines++; counts.pipelineMs += ms })
  timedWrap(GPUDevice.prototype, ['createShaderModule'], ms => { counts.shaders++; counts.shaderMs += ms })
  timedWrap(GPUDevice.prototype, ['createTexture'], () => { counts.textures++ })
  timedWrap(GPUQueue.prototype, ['writeTexture', 'copyExternalImageToTexture'], ms => { counts.textureWrites++; counts.textureWriteMs += ms })
  // Render passes, and those that draw a mipmap level (hgiWebGPU blitCmds generateMipMaps).
  const E = GPUCommandEncoder.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const beginRenderPass = E.beginRenderPass!
  // A mipmap level's pass draws into a view of mip level 1 or more.
  const mipViews = new WeakSet<object>()
  const T = GPUTexture.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const createView = T.createView!
  T.createView = function (this: unknown, ...a: unknown[]) {
    const view = createView.apply(this, a) as object
    if (((a[0] as GPUTextureViewDescriptor | undefined)?.baseMipLevel ?? 0) > 0) mipViews.add(view)
    return view
  }
  E.beginRenderPass = function (this: unknown, ...a: unknown[]) {
    const desc = a[0] as GPURenderPassDescriptor
    const mip = [...desc.colorAttachments].some(c => c && mipViews.has(c.view as object))
    if (mip) counts.mipPasses++; else counts.passes++
    return beginRenderPass.apply(this, a)
  }
  // GPU time: from each submit to its work done (GPUQueue.onSubmittedWorkDone),
  // the longest per displayed frame, filled in when it arrives.
  let frameId = 0
  const gpuMs = new Map<number, number>()
  const Q = GPUQueue.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const submit = Q.submit!
  Q.submit = function (this: GPUQueue, ...a: unknown[]) {
    const id = frameId, s = performance.now()
    counts.submits++
    const result = submit.apply(this, a)
    void this.onSubmittedWorkDone().then(() => {
      const ms = performance.now() - s
      if (ms > (gpuMs.get(id) ?? 0)) gpuMs.set(id, ms)
    })
    return result
  }
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'measure' && entry.name.startsWith('usdview:')) {
        const name = entry.name.slice(8)
        counts.spans[name] = (counts.spans[name] ?? 0) + entry.duration
      } else if (entry.entryType === 'resource') {
        const r = entry as PerformanceResourceTiming
        counts.fetches++; counts.fetchBytes += r.transferSize || r.encodedBodySize || 0
        if (!counts.slowestFetch || r.duration > counts.slowestFetch.ms) counts.slowestFetch = { name: r.name.replace(/^.*\/s\//, ''), ms: round(r.duration) }
      }
    }
  }).observe({ entryTypes: ['measure', 'resource'] })

  let sceneFrame: number | undefined
  document.addEventListener('time-changed', event => {
    const detail = (event as CustomEvent<{ current?: number, currentTime?: number, time?: number }>).detail
    const f = detail?.current ?? detail?.currentTime ?? detail?.time
    if (typeof f === 'number') sceneFrame = f
  })

  const slow: Record<string, unknown>[] = []
  const seconds: Record<string, unknown>[] = []
  let second = zero(), secondStart = performance.now(), frames = 0, last = performance.now()
  const add = (into: Counts, from: Counts) => {
    for (const key of ['pipelines', 'pipelineMs', 'shaders', 'shaderMs', 'textures', 'textureWrites', 'textureWriteMs', 'fetches', 'fetchBytes', 'passes', 'mipPasses', 'submits'] as const) into[key] += from[key]
    for (const [k, v] of Object.entries(from.spans)) into.spans[k] = (into.spans[k] ?? 0) + v
  }
  const pack = (c: Counts) => ({ ...c, pipelineMs: round(c.pipelineMs), shaderMs: round(c.shaderMs), textureWriteMs: round(c.textureWriteMs),
    spans: Object.fromEntries(Object.entries(c.spans).map(([k, v]) => [k, round(v)])) })
  const tick = (now: number) => {
    const dt = now - last; last = now; frames++
    // The GPU time of the frame before this one (its work was submitted then).
    if (dt > slowMs) slow.push({ t: round(now - t0), dt: round(dt), frame: sceneFrame, id: frameId, ...pack(counts) })
    frameId++
    if (gpuMs.size > 4000) for (const k of [...gpuMs.keys()].slice(0, 2000)) gpuMs.delete(k)
    add(second, counts); counts = zero()
    if (now - secondStart >= 1000) {
      seconds.push({ t: round(now - t0), fps: round(frames * 1000 / (now - secondStart)), frame: sceneFrame, ...pack(second) })
      second = zero(); secondStart = now; frames = 0
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const post = () => {
    for (const record of slow) {
      if (record.gpuMs !== undefined) continue
      const id = record.id as number
      // Work submitted in the slow interval (the frame ending it and the one
      // before), once its completion has arrived.
      if (!gpuMs.has(id) && !gpuMs.has(id - 1)) continue
      record.gpuMs = round(Math.max(gpuMs.get(id) ?? 0, gpuMs.get(id - 1) ?? 0))
    }
    const body = JSON.stringify({ userAgent: navigator.userAgent, page: location.href, t: round(performance.now() - t0), slow, seconds })
    void fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: body.length < 60000 }).catch(() => undefined)
  }
  setInterval(post, 5000)
  addEventListener('pagehide', post)
}

export {}
