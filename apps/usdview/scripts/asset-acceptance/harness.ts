// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdAppUtils/frameRecorder.cpp
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser asset acceptance: the browser side. Served by run.mjs at
// /__acceptance/harness?id=<id>&scene=<url>&w=<px>&h=<px>[&complexity=<c>]
// [&complexityRoundTrip=<c>][&axes=1],
// one page (inside the driver's iframe) per asset. Opens the prepared
// scene.usda through the viewer runtime (createRuntime, the same runtime the
// <usd-viewer> element drives) and renders it with the settings
// usdAppUtils/frameRecorder.cpp:396-468 uses for `usdrecord --camera
// /AcceptanceCam -w <w>`, as far as the runtime exposes them:
//   camera /AcceptanceCam (its own clipping range and apertures), stage start
//   time code, camera light on, scene lights on, dome light visibility off,
//   default material specular 0.1 and ambient (see materialAmbient below;
//   with usdrecord's lighting the frame recorder's material and camera-light
//   ambient instead),
//   complexity low (1.0),
//   purposes default + proxy, black background, no axes, highlights or bounds.
// complexityRoundTrip (the manifest's "complexityRoundTrip"): the scene is
// opened and drawn at `complexity`, switched to complexityRoundTrip and
// drawn, then switched back to `complexity` (each until a capture is
// stable) and captured as below: the round trip of the viewer's Display >
// Complexity menu. usdrecord renders at `complexity` only.
// axes=1 (the manifest's "viewerAxes"): the viewer's world axes stay on, as
// in the viewer, so the capture includes the viewer's overlay composite over
// Storm's image (ViewportOverlayLayer); the fixture hides the axes in opaque
// geometry, so the expected image is still usdrecord's.
// Payloads load before the first frame (progressive=0, as usdrecord's
// Usd.Stage.Open loads all). The capture is the viewer's own
// captureViewerImage (the canvas, sRGB 8-bit), taken once two consecutive
// captures are byte-identical (textures arrive asynchronously). It is
// captured twice: with usdview's lighting state, which the viewer follows
// (browser.png, compared with usdview's render), then with usdrecord's
// (runtime.setLightingSource('frameRecorder'), frameRecorder.cpp:396-454:
// browser-usdrecord.png, compared with usdrecord's native.png). The result
// (timings, every diagnostic, status line, console warnings/errors, uncaught
// errors) and the PNG are posted to the run.mjs server. Tooling only.
import { createRuntime } from '../../src/runtime'
import type { ViewerDiagnostic } from '../../src/contracts'
import type { complexities } from '../../src/display-settings'

const q = new URLSearchParams(location.search)
const id = q.get('id') ?? 'unknown'
const scene = q.get('scene') ?? ''
const width = Number(q.get('w') ?? 512), height = Number(q.get('h') ?? 512)
const complexity = (q.get('complexity') ?? 'low') as keyof typeof complexities
const complexityRoundTrip = q.get('complexityRoundTrip') as keyof typeof complexities | null
const viewerAxes = q.get('axes') === '1'
// Default-material ambient (usdview's 0.2); run.mjs --material-ambient
// overrides it for the camera-light-ambient experiment described there.
const materialAmbient = Number(q.get('ambient') ?? 0.2)
const settleLimitMs = Number(q.get('settleMs') ?? 60000)
// The performance guard's playback measure (score.mjs; run.mjs passes
// playback=1 for assets whose manifest entry has "guard": {"playback": true}).
const playback = q.get('playback') === '1'
// perf=1 (run.mjs --perf): the viewer performance measurements of
// packages/usd/docs/performance-viewer.md on top of the capture: phase spans
// (../viewer-perf/probe.ts), WebGPU allocations and draw calls, an orbit
// (steady-state redraws) and wrap-around playback. The probe module imports
// the imaging modules before the runtime opens the scene, so a perf run's
// open and settled timings are not used by the performance guard.
const perf = q.get('perf') === '1'

interface Result {
  id: string, scene: string, userAgent: string, adapter?: unknown
  outcome: 'captured' | 'open-failed' | 'capture-failed' | 'error'
  error?: string
  timings: Record<string, number>
  measures: Record<string, number>
  diagnostics: ViewerDiagnostic[]
  statuses: string[]
  console: { level: string, message: string, count: number }[]
  uncaught: string[]
  camera?: unknown
  time?: unknown
  geometry?: unknown
  capturesUntilStable?: number
  /** Captures until stable of browser-usdrecord.png (usdrecord's lighting). */
  frameRecorderCapturesUntilStable?: number
  playback?: { frames: number, start: number, end: number, frameMs: number[], medianMs: number, p95Ms: number, cpuMedianMs: number | null }
  perf?: Record<string, unknown>
  canvas?: [number, number]
  settings: { width: number, height: number, complexity: string, complexityRoundTrip?: string, materialAmbient: number }
  /** Captures until stable before and at complexityRoundTrip. */
  complexityRoundTripCapturesUntilStable?: [number, number]
}
const t0 = performance.now()
const since = () => Math.round(performance.now() - t0)
const result: Result = { id, scene, userAgent: navigator.userAgent, outcome: 'error', settings: { width, height, complexity, ...(complexityRoundTrip ? { complexityRoundTrip } : {}), materialAmbient }, timings: {}, measures: {}, diagnostics: [], statuses: [], console: [], uncaught: [] }
const log = (message: string) => { void fetch(`/__acceptance/log?id=${encodeURIComponent(id)}`, { method: 'POST', body: message }) }

// Every console warning/error (the library posts Tf diagnostics there too),
// deduplicated with counts so a per-prim warning cannot flood the report.
const consoleSeen = new Map<string, { level: string, message: string, count: number }>()
for (const level of ['warn', 'error'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    const message = args.map(a => a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()).join(' ').slice(0, 2000)
    const key = level + '\0' + message
    const entry = consoleSeen.get(key)
    if (entry) entry.count++
    else if (consoleSeen.size < 500) consoleSeen.set(key, { level, message, count: 1 })
    original(...args)
  }
}
addEventListener('error', event => result.uncaught.push(`error: ${event.message}`))
addEventListener('unhandledrejection', event => result.uncaught.push(`unhandledrejection: ${event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason)}`))

// Safari's Error.stack omits the message, so both are kept.
const errorText = (error: unknown) => error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function digest(blob: Blob): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')
}

// Steps of the run, to browser.log (run.mjs times them): a page that stops
// is placed between two steps.
const step = (what: string) => log(`step ${since()} ms: ${what}`)

async function run(): Promise<Blob | undefined> {
  step('started')
  const adapter = await navigator.gpu?.requestAdapter()
  const info = (adapter as unknown as { info?: Record<string, unknown> } | null)?.info
  if (info) result.adapter = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description }
  const canvas = document.createElement('canvas')
  canvas.style.width = `${width / devicePixelRatio}px`
  canvas.style.height = `${height / devicePixelRatio}px`
  document.body.prepend(canvas)
  let lastFrameCpu: number | undefined
  if (perf) { const s = performance.now(); gpu = installGpuCounters(); probe = await import('../viewer-perf/probe'); probe.installProbe(); result.timings.probeImportMs = Math.round(performance.now() - s) }
  const runtime = await createRuntime(canvas, {
    selectionChanged() {},
    statusChanged(message) { result.statuses.push(`${since()} ms: ${message}`) },
    diagnosticsChanged(diagnostics) { result.diagnostics = [...diagnostics] },
    frameRendered(stats) { lastFrameCpu = stats.cpuMilliseconds; if (result.timings.firstFrameMs === undefined) result.timings.firstFrameMs = since(); onFrame?.(stats.cpuMilliseconds) },
  })
  result.timings.runtimeMs = since()
  step('runtime created')
  runtime.resize(width, height, 1)
  runtime.setAxesVisible?.(viewerAxes)
  const warnings = runtime.setStartupOptions?.({ camera: '/AcceptanceCam', progressive: false, complexity }) ?? []
  for (const message of warnings) result.diagnostics.push({ severity: 'warning', message })
  await runtime.setDisplaySettings?.({
    background: 'Black', cameraLightEnabled: true, sceneLightsEnabled: true, domeLightEnabled: false, domeLightTexturesVisible: false,
    enableSceneMaterials: true, defaultMaterialAmbient: materialAmbient, defaultMaterialSpecular: 0.1, renderMode: 'Smooth Shaded', cullBackfaces: false,
    displayRender: false, displayProxy: true, displayGuide: false, showBBoxes: false, showBBoxPlayback: false, selHighlightMode: 'Never', complexity,
  })
  const openStart = performance.now()
  result.timings.openStartMs = since()
  step('opening')
  try { await runtime.open(scene) }
  catch (error) { result.outcome = 'open-failed'; result.error = errorText(error); result.timings.openMs = Math.round(performance.now() - openStart); return undefined }
  result.timings.openMs = Math.round(performance.now() - openStart)
  step('opened')
  result.diagnostics = [...(runtime.getDiagnostics?.() ?? result.diagnostics)]
  result.camera = runtime.getCameraState?.()
  result.time = runtime.getTimeState?.()
  result.geometry = runtime.getGeometryState?.()
  result.canvas = [canvas.width, canvas.height]
  // Settle: textures and late imaging updates arrive after open resolves.
  // One settle mechanism for both captures; each capture's duration is kept
  // (the usdview-lit settle's captureMs goes to the perf measure).
  const settle = async (what: string) => {
    let previous = '', captures = 0, blob: Blob | undefined
    const captureMs: number[] = []
    const settleStart = performance.now()
    while (performance.now() - settleStart < settleLimitMs) {
      await sleep(captures === 0 ? 250 : 1000)
      let next: Blob
      const captureStart = performance.now()
      try { next = await runtime.captureViewerImage!() }
      catch (error) { log(`capture retry: ${errorText(error)}`); continue }
      captures++
      step(`${what} capture ${captures}`)
      captureMs.push(Math.round((performance.now() - captureStart) * 100) / 100)
      const key = await digest(next)
      if (key === previous) { blob = next; break }
      previous = key; blob = next
    }
    if (blob && performance.now() - settleStart >= settleLimitMs) result.statuses.push(`${since()} ms: ${what} capture did not stabilise within ${settleLimitMs} ms; last capture used`)
    return { blob, captures, captureMs }
  }
  if (complexityRoundTrip) {
    const before = await settle(`complexity ${complexity}`)
    await runtime.setDisplaySettings?.({ complexity: complexityRoundTrip })
    const during = await settle(`complexity ${complexityRoundTrip}`)
    result.complexityRoundTripCapturesUntilStable = [before.captures, during.captures]
    await runtime.setDisplaySettings?.({ complexity })
  }
  const usdview = await settle('usdview-lit')
  result.capturesUntilStable = usdview.captures
  const settledPhases = probe?.snapshot()
  // Perf only: the load's order of events, from the start of runtime.open()
  // to the settled capture (the usdview: spans and the probed phases).
  if (probe) {
    const end = performance.now(), r = (x: number) => Math.round(x * 10) / 10
    loadTimeline = {
      measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('usdview:') && e.startTime >= openStart && e.startTime + e.duration <= end)
        .map(e => ({ name: e.name.slice('usdview:'.length), start: r(e.startTime - openStart), end: r(e.startTime + e.duration - openStart) })),
      phases: probe.phaseTimeline(openStart, end),
      textures: probe.textureReport().spans.map(s => ({ ...s, start: r(s.start - openStart), end: r(s.end - openStart) })),
      http: probe.httpReport(openStart),
    }
  }
  result.timings.settledMs = since()
  if (lastFrameCpu !== undefined) result.timings.lastFrameCpuMs = Math.round(lastFrameCpu * 100) / 100
  result.diagnostics = [...(runtime.getDiagnostics?.() ?? result.diagnostics)]
  if (!usdview.blob) { result.outcome = 'capture-failed'; return undefined }
  if (playback) step('playback')
  if (playback) { const measured = await measurePlayback(runtime, () => lastFrameCpu); if (measured) result.playback = measured }
  // The same view with usdrecord's lighting state (usdAppUtils/
  // frameRecorder.cpp:396-454: the camera light's ambient 0.01 that
  // usdview's lacks), for the like-for-like comparison with usdrecord's
  // native.png; browser.png (usdview's lighting) stays the comparison with
  // usdview's own render.
  if (runtime.setLightingSource) {
    // The playback measure moved the time; back to the captured time code.
    const captured = (result.time as { current?: number } | undefined)?.current
    if (playback && captured !== undefined) await runtime.setTime?.(captured)
    runtime.setLightingSource('frameRecorder')
    const recorder = await settle('frameRecorder-lit')
    result.frameRecorderCapturesUntilStable = recorder.captures
    if (recorder.blob) frameRecorderImage = recorder.blob
    else result.statuses.push(`${since()} ms: no capture with usdrecord's lighting`)
  }
  // The perf measure (its orbit moves the camera) runs after both captures,
  // with usdview's lighting as the performance baseline was recorded.
  if (perf && probe) {
    runtime.setLightingSource?.('usdview')
    result.perf = await measurePerf(runtime, probe, settledPhases!, usdview.captureMs)
  }
  result.outcome = 'captured'
  step('disposing')
  runtime.dispose()
  step('disposed')
  return usdview.blob
}

/** Frame time at each of the stage's time codes (start..end, one time code
 *  per frame, at most 240 frames): wall time from setTime until the next
 *  animation frame after the update resolves; the render CPU time is the
 *  runtime's frameRendered measure. */
async function measurePlayback(runtime: Awaited<ReturnType<typeof createRuntime>>, cpu: () => number | undefined): Promise<Result['playback']> {
  const time = runtime.getTimeState?.()
  if (!time || !runtime.setTime || !(time.end > time.start)) return undefined
  const frameMs: number[] = [], cpuMs: number[] = []
  const last = Math.min(time.end, time.start + 239)
  for (let t = time.start; t <= last; t++) {
    const begin = performance.now()
    await runtime.setTime(t)
    await new Promise(resolve => requestAnimationFrame(resolve))
    frameMs.push(Math.round((performance.now() - begin) * 100) / 100)
    const c = cpu(); if (c !== undefined) cpuMs.push(c)
  }
  const sorted = [...frameMs].sort((a, b) => a - b), pick = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!
  const cpuSorted = cpuMs.sort((a, b) => a - b)
  return { frames: frameMs.length, start: time.start, end: last, frameMs, medianMs: pick(0.5), p95Ms: pick(0.95), cpuMedianMs: cpuSorted.length ? Math.round(cpuSorted[cpuSorted.length >> 1]! * 100) / 100 : null }
}

// Performance mode (perf=1) -------------------------------------------------
type Probe = typeof import('../viewer-perf/probe')
let probe: Probe | undefined
let onFrame: ((cpuMs: number) => void) | undefined
/** While a perf step records: every queue submission (frame index, command
 *  buffer labels, submit time, completion time), so the GPU time of each
 *  submission can be read as the gap between consecutive completions. */
let submitTrace: { frame: number, entries: { frame: number, labels: string, submitAt: number, doneAt: number, passes: { kind: string, begin: number, end: number }[] }[], pending: Promise<void>[] } | undefined
let timestampsAvailable = false
let gpu: ReturnType<typeof installGpuCounters> | undefined
let loadTimeline: unknown

// Bytes per texel (block formats: per 4x4 block / 16) of the formats Storm
// and the viewer allocate; others count 4.
const texelBytes: Record<string, number> = {
  r8unorm: 1, r8uint: 1, rg8unorm: 2, r16float: 2, r16uint: 2, depth16unorm: 2, rgba8unorm: 4, 'rgba8unorm-srgb': 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4,
  r32float: 4, r32uint: 4, r32sint: 4, rg16float: 4, depth32float: 4, depth24plus: 4, 'depth24plus-stencil8': 4, rg11b10ufloat: 4,
  'depth32float-stencil8': 5, rg32float: 8, rgba16float: 8, rgba16uint: 8, rgba32float: 16, rgba32uint: 16,
  'bc1-rgba-unorm': 0.5, 'bc1-rgba-unorm-srgb': 0.5, 'bc3-rgba-unorm': 1, 'bc3-rgba-unorm-srgb': 1, 'bc7-rgba-unorm': 1, 'bc7-rgba-unorm-srgb': 1,
}
/** Counts WebGPU buffer and texture bytes (as allocated by the page, not
 *  the driver's own) and draw calls, by wrapping the prototypes. */
function installGpuCounters() {
  const state = { liveBytes: 0, peakBytes: 0, buffers: 0, bufferBytes: 0, textures: 0, draws: 0, submits: 0, commandBuffers: 0, writes: 0, writeBytes: 0, copies: 0, copyBytes: 0, maps: 0,
    computePasses: 0, dispatches: 0, renderPasses: 0, queue: undefined as GPUQueue | undefined }
  const sizes = new WeakMap<object, number>()
  const track = (o: object, bytes: number) => { sizes.set(o, bytes); state.liveBytes += bytes; if (state.liveBytes > state.peakBytes) state.peakBytes = state.liveBytes }
  const untrack = (o: object) => { const b = sizes.get(o); if (b !== undefined) { state.liveBytes -= b; sizes.delete(o) } }
  // GPU pass timing (submitTrace): timestamp-query when the adapter has it.
  const A = GPUAdapter.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const requestDevice = A.requestDevice!
  A.requestDevice = function (this: GPUAdapter, desc?: unknown) {
    const d = { ...(desc as GPUDeviceDescriptor | undefined) }
    timestampsAvailable = this.features.has('timestamp-query')
    if (timestampsAvailable) d.requiredFeatures = [...(d.requiredFeatures ?? []), 'timestamp-query']
    return requestDevice.call(this, d)
  }
  const D = GPUDevice.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const createBuffer = D.createBuffer!, createTexture = D.createTexture!
  D.createBuffer = function (this: GPUDevice, desc: unknown) { const b = createBuffer.call(this, desc) as GPUBuffer; state.buffers++; state.bufferBytes += (desc as GPUBufferDescriptor).size; track(b, (desc as GPUBufferDescriptor).size); return b }
  D.createTexture = function (this: GPUDevice, desc: unknown) {
    const t = createTexture.call(this, desc) as GPUTexture; state.textures++
    let bytes = 0, w = t.width, h = t.height
    const layers = t.dimension === '3d' ? 1 : t.depthOrArrayLayers
    let d = t.dimension === '3d' ? t.depthOrArrayLayers : 1
    for (let m = 0; m < t.mipLevelCount; m++) { bytes += w * h * d; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); d = Math.max(1, d >> 1) }
    track(t, bytes * layers * t.sampleCount * (texelBytes[t.format] ?? 4)); return t
  }
  for (const P of [GPUBuffer.prototype, GPUTexture.prototype] as unknown as Record<string, (...a: unknown[]) => unknown>[]) {
    const destroy = P.destroy!
    P.destroy = function (this: object) { untrack(this); return destroy.call(this) }
  }
  const E = GPURenderPassEncoder.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  for (const name of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) {
    const original = E[name]!
    E[name] = function (this: object, ...a: unknown[]) { state.draws++; return original.apply(this, a) }
  }
  const Q = GPUQueue.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const submit = Q.submit!
  // Command buffers carry their encoder's label (for submitTrace).
  const encoderLabels = new WeakMap<object, string>()
  const encoderDevices = new WeakMap<object, GPUDevice>()
  // Per encoder (then per command buffer): its timed passes, each a query
  // set of two timestamps resolved into a mappable buffer at finish.
  interface TimedPass { kind: string, querySet: GPUQuerySet, readback?: GPUBuffer }
  const encoderPasses = new WeakMap<object, TimedPass[]>()
  const createEncoder = D.createCommandEncoder!
  D.createCommandEncoder = function (this: GPUDevice, desc?: unknown) {
    const e = createEncoder.call(this, desc) as object; encoderLabels.set(e, (desc as GPUCommandEncoderDescriptor | undefined)?.label ?? ''); encoderDevices.set(e, this); return e
  }
  const CE = GPUCommandEncoder.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const finish = CE.finish!, resolveQuerySet = CE.resolveQuerySet!, rawCopy = CE.copyBufferToBuffer!
  const timedPass = (encoder: object, kind: string, desc: Record<string, unknown> | undefined) => {
    const device = encoderDevices.get(encoder)
    if (!submitTrace || !timestampsAvailable || !device || desc?.timestampWrites) return desc
    const querySet = device.createQuerySet({ type: 'timestamp', count: 2 })
    const list = encoderPasses.get(encoder) ?? []; list.push({ kind, querySet }); encoderPasses.set(encoder, list)
    return { ...desc, timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
  }
  CE.finish = function (this: object, ...a: unknown[]) {
    const passes = encoderPasses.get(this), device = encoderDevices.get(this)
    if (passes && device) for (const pass of passes) {
      const resolve = createBuffer.call(device, { size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) as GPUBuffer
      pass.readback = createBuffer.call(device, { size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }) as GPUBuffer
      resolveQuerySet.call(this, pass.querySet, 0, 2, resolve, 0)
      rawCopy.call(this, resolve, 0, pass.readback, 0, 16)
    }
    const b = finish.apply(this, a) as object; encoderLabels.set(b, encoderLabels.get(this) ?? ''); if (passes) encoderPasses.set(b, passes); return b
  }
  Q.submit = function (this: GPUQueue, ...a: unknown[]) {
    state.submits++; state.commandBuffers += (a[0] as unknown[]).length; state.queue = this
    const result = submit.apply(this, a)
    if (submitTrace) {
      const passes = (a[0] as object[]).flatMap(b => encoderPasses.get(b) ?? [])
      const entry = { frame: submitTrace.frame, labels: (a[0] as object[]).map(b => encoderLabels.get(b) ?? '').join('+'), submitAt: performance.now(), doneAt: 0,
        passes: [] as { kind: string, begin: number, end: number }[] }
      submitTrace.entries.push(entry)
      submitTrace.pending.push(this.onSubmittedWorkDone().then(async () => {
        entry.doneAt = performance.now()
        for (const pass of passes) {
          if (!pass.readback) continue
          await pass.readback.mapAsync(GPUMapMode.READ)
          const t = new BigUint64Array(pass.readback.getMappedRange())
          entry.passes.push({ kind: pass.kind, begin: Number(t[0]) / 1e6, end: Number(t[1]) / 1e6 })
          pass.readback.unmap(); pass.readback.destroy(); pass.querySet.destroy()
        }
      }))
    }
    return result
  }
  const writeBuffer = Q.writeBuffer!
  Q.writeBuffer = function (this: GPUQueue, ...a: unknown[]) {
    state.writes++
    const data = a[2] as ArrayBufferView | ArrayBuffer, element = ArrayBuffer.isView(data) ? ((data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1) : 1
    state.writeBytes += a[4] !== undefined ? (a[4] as number) * element : data.byteLength - ((a[3] as number | undefined) ?? 0) * element
    return writeBuffer.apply(this, a)
  }
  const C = GPUCommandEncoder.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const copy = C.copyBufferToBuffer!, beginCompute = C.beginComputePass!, beginRender = C.beginRenderPass!
  C.copyBufferToBuffer = function (this: object, ...a: unknown[]) { state.copies++; state.copyBytes += (a[4] as number | undefined) ?? 0; return copy.apply(this, a) }
  C.beginComputePass = function (this: object, ...a: unknown[]) { state.computePasses++; return beginCompute.call(this, timedPass(this, `compute ${(a[0] as { label?: string } | undefined)?.label ?? ''}`, a[0] as Record<string, unknown> | undefined)) }
  C.beginRenderPass = function (this: object, ...a: unknown[]) { state.renderPasses++; return beginRender.call(this, timedPass(this, `render ${(a[0] as { label?: string } | undefined)?.label ?? ''}`, a[0] as Record<string, unknown>)) }
  const CP = GPUComputePassEncoder.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    const original = CP[name]!
    CP[name] = function (this: object, ...a: unknown[]) { state.dispatches++; return original.apply(this, a) }
  }
  const B = GPUBuffer.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  const mapAsync = B.mapAsync!
  B.mapAsync = function (this: object, ...a: unknown[]) { state.maps++; return mapAsync.apply(this, a) }
  return state
}

const r2 = (v: number) => Math.round(v * 100) / 100
function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b), pick = (f: number) => s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))]! : null
  return { n: s.length, median: pick(0.5), p95: pick(0.95), min: s[0] ?? null, max: s.at(-1) ?? null }
}

/** Orbit (runtime.orbitOnce: one turn redrawn every animation frame) and
 *  wrap-around playback, with per-frame CPU time (the runtime's
 *  frameRendered), the animation-frame interval, the latency until the GPU
 *  finished the frame's work (GPUQueue.onSubmittedWorkDone), and the phase
 *  spans per frame. */
async function measurePerf(runtime: Awaited<ReturnType<typeof createRuntime>>, p: Probe, settledPhases: ReturnType<Probe['snapshot']>, captureMs: number[]) {
  const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null
  const out: Record<string, unknown> = { load: { timeline: loadTimeline, phases: p.rounded(p.delta({}, settledPhases)), captureMs, gpu: { ...gpu, queue: undefined }, storm: p.stormStats(), jsHeapBytes: heap(), textures: p.textureReport(), translations: p.translationReport() } }
  const record = async (body: () => Promise<number>) => {
    const cpu: number[] = [], gpuDone: number[] = [], stamps: number[] = []
    const pending: Promise<void>[] = []
    submitTrace = { frame: 0, entries: [], pending: [] }
    onFrame = cpuMs => {
      if (submitTrace) submitTrace.frame++
      cpu.push(cpuMs); const t = performance.now(); stamps.push(t)
      const q = gpu?.queue; if (q) pending.push(q.onSubmittedWorkDone().then(() => { gpuDone.push(performance.now() - t) }))
    }
    const before = p.snapshot(), draws0 = gpu?.draws ?? 0, gpu0 = gpu ? { ...gpu } : undefined
    const wall0 = performance.now()
    const frames = await body()
    const wallMs = performance.now() - wall0
    onFrame = undefined
    await Promise.all(pending)
    const trace = submitTrace!; submitTrace = undefined
    await Promise.all(trace.pending)
    // Per submission slot of a frame (its index in the frame and labels):
    // the median gap from the previous completion (or from its own submit
    // when the queue was idle) to its completion, and the median submit to
    // completion latency.
    const slots = new Map<string, { gpu: number[], latency: number[] }>()
    for (let i = 0; i < trace.entries.length; i++) {
      const e = trace.entries[i]!, prev = trace.entries[i - 1]
      const index = trace.entries.slice(0, i).filter(x => x.frame === e.frame).length
      const slot = slots.get(`${index} ${e.labels}`) ?? { gpu: [], latency: [] }
      slot.gpu.push(e.doneAt - Math.max(e.submitAt, prev?.doneAt ?? -Infinity)); slot.latency.push(e.doneAt - e.submitAt)
      slots.set(`${index} ${e.labels}`, slot)
    }
    const submitSlots = Object.fromEntries([...slots].map(([k, v]) => [k, { n: v.gpu.length, gpuMs: stats(v.gpu.map(r2)).median, latencyMs: stats(v.latency.map(r2)).median }]))
    // GPU timestamps (timestamp-query): per pass slot of a frame (index,
    // command buffer label, pass kind) the median pass duration, and per
    // frame the sum of pass durations and the span from the first pass's
    // beginning to the last pass's end.
    const passSlots = new Map<string, number[]>(), passSum: number[] = [], passSpan: number[] = []
    const byFrame = new Map<number, typeof trace.entries>()
    for (const e of trace.entries) byFrame.set(e.frame, [...(byFrame.get(e.frame) ?? []), e])
    for (const entries of byFrame.values()) {
      const passes = entries.flatMap(e => e.passes.map(p => ({ ...p, labels: e.labels }))).filter(p => p.end >= p.begin && p.begin > 0)
      if (!passes.length) continue
      passes.forEach((p, i) => { const k = `${i} ${p.labels} / ${p.kind}`; passSlots.set(k, [...(passSlots.get(k) ?? []), p.end - p.begin]) })
      passSum.push(passes.reduce((t, p) => t + p.end - p.begin, 0))
      passSpan.push(Math.max(...passes.map(p => p.end)) - Math.min(...passes.map(p => p.begin)))
    }
    const gpuTimestamps = timestampsAvailable ? { passMsSum: stats(passSum.map(r2)), passSpanMs: stats(passSpan.map(r2)),
      passes: Object.fromEntries([...passSlots].map(([k, v]) => [k, { n: v.length, ms: stats(v.map(x => Math.round(x * 1000) / 1000)).median }])),
      // Frames 20-29 as recorded (CPU times relative to the first
      // submission, GPU times relative to the first pass's beginning).
      sample: (() => {
        const entries = trace.entries.filter(e => e.frame >= 20 && e.frame < 30)
        const cpu0 = entries[0]?.submitAt ?? 0, gpu0 = Math.min(...entries.flatMap(e => e.passes.map(p => p.begin)).filter(x => x > 0))
        const r3 = (x: number) => Math.round(x * 1000) / 1000
        return entries.map(e => ({ frame: e.frame, labels: e.labels, submit: r3(e.submitAt - cpu0), done: r3(e.doneAt - cpu0), passes: e.passes.map(p => [p.kind, r3(p.begin - gpu0), r3(p.end - gpu0)]) }))
      })() } : 'timestamp-query unavailable'
    const intervals = stamps.slice(1).map((t, i) => t - stamps[i]!)
    const n = Math.max(1, cpu.length)
    return { frames: cpu.length, requested: frames, wallMs: r2(wallMs), cpuMs: stats(cpu.map(r2)), frameIntervalMs: stats(intervals.map(r2)), gpuDoneAfterCpuMs: stats(gpuDone.map(r2)),
      drawsPerFrame: gpu ? r2(((gpu.draws) - draws0) / n) : null, submitSlots, gpuTimestamps,
      gpuCallsPerFrame: gpu && gpu0 ? Object.fromEntries((['buffers', 'bufferBytes', 'writes', 'writeBytes', 'copies', 'copyBytes', 'maps', 'computePasses', 'dispatches', 'renderPasses', 'submits', 'commandBuffers'] as const)
        .map(k => [k, r2((gpu![k] - gpu0[k]) / n)])) : null, phasesPerFrame: p.perFrame(p.delta(before, p.snapshot()), n) }
  }
  if (runtime.orbitOnce) out.orbit = await record(async () => { await runtime.orbitOnce!(undefined, 3000); return 0 })
  const time = runtime.getTimeState?.()
  if (time && runtime.setTime && time.end > time.start) {
    const play = async () => {
      let t = time.start, frames = 0
      for (; frames < 120; frames++) {
        await runtime.setTime!(t)
        await new Promise(resolve => requestAnimationFrame(resolve))
        t = t + 1 > time.end ? time.start : t + 1
      }
      return frames
    }
    // Time steps while paused: each setTime waits for its frame's WebGPU
    // error scopes (runtime.ts timeStepDraw), so the GPU work of a frame
    // completes before the next starts.
    out.playback = await record(play)
    // The same steps while playing (runtime.setPlaybackActive(true), as
    // TimelineControls.play, without its frame-rate timer): frames do not
    // wait for the GPU (stageView.py:1547), as usdview's playback.
    if (runtime.setPlaybackActive) {
      runtime.setPlaybackActive(true)
      try { out.playbackActive = await record(play) } finally { runtime.setPlaybackActive(false) }
    }
  }
  out.gpuEnd = { ...gpu, queue: undefined }
  out.stormEnd = p.stormStats()
  out.jsHeapBytes = heap()
  return out
}

let image: Blob | undefined, frameRecorderImage: Blob | undefined
try { image = await run() }
catch (error) { result.outcome = 'error'; result.error = errorText(error) }
for (const entry of performance.getEntriesByType('measure')) if (entry.name.startsWith('usdview:')) {
  const key = entry.name.slice('usdview:'.length)
  result.measures[key] = Math.round(((result.measures[key] ?? 0) + entry.duration) * 10) / 10
}
result.timings.totalMs = since()
result.console = [...consoleSeen.values()]
if (image) await fetch(`/__acceptance/image?id=${encodeURIComponent(id)}`, { method: 'POST', body: image })
if (frameRecorderImage) await fetch(`/__acceptance/image?id=${encodeURIComponent(id)}&lighting=frameRecorder`, { method: 'POST', body: frameRecorderImage })
await fetch(`/__acceptance/result?id=${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(result) })
parent.postMessage({ acceptanceDone: id }, location.origin)
