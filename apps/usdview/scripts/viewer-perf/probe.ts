// Ported from OpenUSD 26.11.1: pxr/imaging/hd/engine.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Phase timing for the viewer performance measurements
// (packages/usd/docs/performance-viewer.md): wraps the engine's phase entry
// points with performance.now() spans, without changing library code. The
// same probe runs in Safari (the asset-acceptance harness with perf=1) and in
// Node (node.ts, CPU-only with a stub GPU device). Tooling only.
//
// Phases are the steps of UsdImagingGLEngine::Render (usdImagingGL/
// engine.cpp:762-785 and _Execute) and HdEngine::Execute (hd/engine.cpp:
// 58-124): PrepareBatch (scene time and the first population of the stage
// scene index), SyncAll (rprim/sprim/bprim and task sync), task Prepare,
// CommitResources (HdStResourceRegistry commit), task Execute (draw
// submission), plus code generation (HdSt_CodeGen::Compile), the GLSL to
// WGSL translation, Hgi pipeline and shader creation and command submission.
// Spans are inclusive: a nested phase is also counted in its parent.
import { Engine as HdEngine, RenderIndex as HdRenderIndex } from 'typescript-usd/hd'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { _CodeGen as HdStCodeGen, TextureUtils as HdStTextureUtils, UvTextureObject as HdStUvTextureObject,
  _DomeLightComputationGPU as HdStDomeLightComputationGPU, _DomeLightMipmapComputationGPU as HdStDomeLightMipmapComputationGPU,
  SimpleLightingShader as HdStSimpleLightingShader, Light as HdStLight } from 'typescript-usd/hdSt'
import * as Hdx from 'typescript-usd/hdx'
import { HgiWebGPU, HgiWebGPUGlslShaderBodyTranslator } from 'typescript-usd/hgiWebGPU'
import { Hio_StbImage } from 'typescript-usd/hio'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'
import { Engine as UsdImagingGLEngine } from 'typescript-usd/usdImagingGL'

export interface PhaseTotal { calls: number, ms: number, maxMs: number }
export type PhaseTotals = Record<string, PhaseTotal>

const totals: PhaseTotals = {}
let installed = false
let engine: InstanceType<typeof UsdImagingGLEngine> | undefined

/** Storm's own memory accounting of the last engine that rendered
 *  (UsdImagingGLEngine::GetRenderStats, hdSt/renderDelegate.cpp:271-288:
 *  gpuMemoryUsed includes textureMemory), as numbers. */
export function stormStats(): Record<string, number> {
  const out: Record<string, number> = {}
  const stats = engine?.getRenderStats() as unknown
  const entries: [unknown, unknown][] = stats && typeof (stats as Iterable<unknown>)[Symbol.iterator] === 'function'
    ? [...(stats as Iterable<[unknown, unknown]>)] : Object.entries((stats ?? {}) as Record<string, unknown>)
  for (const [k, v] of entries) {
    const value = typeof v === 'object' && v !== null && 'Get' in v ? (v as { Get(): unknown }).Get() : v
    if (typeof value === 'number' || typeof value === 'bigint') out[String(k)] = Number(value)
  }
  return out
}

/** Every probed call as a span (performance.now() ms, nesting depth), up to
 *  `timelineLimit` spans: the order of the load's phases, which the totals
 *  above do not show. */
export interface PhaseSpan { name: string, start: number, end: number, depth: number }
const timeline: PhaseSpan[] = []
const timelineLimit = 20000
let depth = 0

function add(name: string, ms: number) {
  const t = totals[name] ??= { calls: 0, ms: 0, maxMs: 0 }
  t.calls++; t.ms += ms; if (ms > t.maxMs) t.maxMs = ms
}

type AnyFn = (this: unknown, ...args: unknown[]) => unknown
function wrap(target: object | undefined, method: string, name: string) {
  if (!target) return
  const original = (target as Record<string, unknown>)[method]
  if (typeof original !== 'function' || (original as { __probed?: true }).__probed) return
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const start = performance.now()
    let result: unknown
    depth++
    try { result = (original as AnyFn).apply(this, args) } finally {
      depth--
      const end = performance.now()
      add(name, end - start)
      if (timeline.length < timelineLimit) timeline.push({ name, start, end, depth })
    }
    return result
  }
  ;(wrapped as { __probed?: true }).__probed = true
  ;(target as Record<string, unknown>)[method] = wrapped
}

/** One span of a texture's load or commit (start and end in
 *  performance.now() ms): `phase` is
 *  - load: HdStTextureUtils.GetAllMipImagesAsync, every mip of one file
 *    (the asynchronous part of HdStAssetUvTextureObject._Load);
 *  - open: Hio_StbImage._OpenForReadingAsync of one mip (fetch + decode);
 *  - fetch: the resolver's openAsset and the asset's getBuffer;
 *  - read: Hio_StbImage.ReadCropped (CPU conversion into the storage);
 *  - upload: HdStUvTextureObject._CreateTexture (Hgi texture creation and
 *    its initial data);
 *  - mips: HdStUvTextureObject._GenerateMipmaps (blit encoding only).
 *  Asynchronous spans overlap: they end when their promise settles. */
export interface TextureSpan { phase: string, file: string, mip?: number, start: number, end: number }
const textureSpans: TextureSpan[] = []

function wrapSpan(target: object | undefined, method: string, phase: string, describe: (self: unknown, args: unknown[]) => { file: string, mip?: number }, before?: () => void) {
  if (!target) return
  const original = (target as Record<string, unknown>)[method]
  if (typeof original !== 'function' || (original as { __probed?: true }).__probed) return
  const wrapped = function (this: unknown, ...args: unknown[]) {
    before?.()
    const start = performance.now()
    const record = () => { textureSpans.push({ phase, ...describe(this, args), start, end: performance.now() }) }
    let result: unknown
    try { result = (original as AnyFn).apply(this, args) } catch (e) { record(); throw e }
    if (result instanceof Promise) return result.finally(record)
    record()
    return result
  }
  ;(wrapped as { __probed?: true }).__probed = true
  ;(target as Record<string, unknown>)[method] = wrapped
}

function installTextureSpans(): void {
  const fileOf = (self: unknown) => ({ file: String((self as { GetTextureIdentifier?(): { getFilePath(): unknown } }).GetTextureIdentifier?.().getFilePath() ?? '') })
  wrapSpan(HdStTextureUtils, 'GetAllMipImagesAsync', 'load', (_s, a) => ({ file: String(a[0]) }), wrapResolver)
  wrapSpan(Hio_StbImage.prototype, '_OpenForReadingAsync', 'open', (_s, a) => ({ file: String(a[0]), mip: a[2] as number }))
  wrapSpan(Hio_StbImage.prototype, 'ReadCropped', 'read', s => ({ file: (s as { getFilename(): string }).getFilename() }))
  wrapSpan(HdStUvTextureObject.prototype, '_CreateTexture', 'upload', fileOf)
  wrapSpan(HdStUvTextureObject.prototype, '_GenerateMipmaps', 'mips', fileOf)
}

/** Wraps the resolver serving the image reads (the one current when a load
 *  starts) and its assets' getBuffer. */
function wrapResolver(): void {
  const resolver = ArGetResolver() as unknown as Record<string, unknown>
  const openAsset = resolver.openAsset as AnyFn | undefined
  if (typeof openAsset === 'function' && !(openAsset as { __probed?: true }).__probed) {
    const wrapped = async function (this: unknown, ...args: unknown[]) {
      const file = String(args[0])
      const start = performance.now()
      const asset = await openAsset.apply(this, args) as Record<string, unknown> | undefined
      textureSpans.push({ phase: 'fetch', file, start, end: performance.now() })
      const getBuffer = asset?.getBuffer as AnyFn | undefined
      if (asset && typeof getBuffer === 'function') {
        asset.getBuffer = async function (this: unknown, ...a: unknown[]) {
          const s = performance.now()
          try { return await getBuffer.apply(this, a) } finally { textureSpans.push({ phase: 'fetch', file, start: s, end: performance.now() }) }
        }
      }
      return asset
    }
    ;(wrapped as { __probed?: true }).__probed = true
    resolver.openAsset = wrapped
  }
}

/** The texture spans so far, and per phase the call count, the summed span
 *  time and the wall time the phase's spans cover (their union), plus the
 *  wall time from the first load to the last commit. Only image files
 *  (spans of the resolver's reads of other assets are dropped). */
export function textureReport(): { phases: Record<string, { calls: number, sumMs: number, wallMs: number }>, firstToLastMs: number, files: number, spans: TextureSpan[] } {
  const loaded = new Set(textureSpans.filter(s => s.phase === 'load' || s.phase === 'open').map(s => s.file))
  const spans = textureSpans.filter(s => s.phase !== 'fetch' || loaded.has(s.file))
  const phases: Record<string, { calls: number, sumMs: number, wallMs: number }> = {}
  for (const phase of [...new Set(spans.map(s => s.phase))]) {
    const list = spans.filter(s => s.phase === phase).sort((a, b) => a.start - b.start)
    let wall = 0, cursor = -Infinity
    for (const s of list) { const from = Math.max(s.start, cursor); if (s.end > from) { wall += s.end - from; cursor = s.end } }
    phases[phase] = { calls: list.length, sumMs: Math.round(list.reduce((t, s) => t + s.end - s.start, 0)), wallMs: Math.round(wall) }
  }
  const firstToLastMs = spans.length ? Math.round(Math.max(...spans.map(s => s.end)) - Math.min(...spans.map(s => s.start))) : 0
  const r = (x: number) => Math.round(x * 10) / 10
  return { phases, firstToLastMs, files: loaded.size, spans: spans.map(s => ({ ...s, start: r(s.start), end: r(s.end) })) }
}

/** GLSL to WGSL translation inputs: calls and distinct (stage,
 *  declarations, code) bodies (step 3 of performance-viewer.md counts the
 *  repeated ones). */
const translationBodies = new Map<string, number>()
let translationCalls = 0
function countTranslations(): void {
  const original = HgiWebGPUGlslShaderBodyTranslator.Translate
  if ((original as { __counted?: true }).__counted) return
  const counted = function (this: unknown, input: Parameters<typeof original>[0]) {
    translationCalls++
    const key = `${input.stage}\0${input.declarations}\0${input.code}`
    translationBodies.set(key, (translationBodies.get(key) ?? 0) + 1)
    return original.call(this, input)
  }
  ;(counted as { __counted?: true }).__counted = true
  HgiWebGPUGlslShaderBodyTranslator.Translate = counted
}

/** Translation calls, distinct bodies and the calls that repeated a body. */
export function translationReport(): { calls: number, distinct: number, repeated: number } {
  return { calls: translationCalls, distinct: translationBodies.size, repeated: translationCalls - translationBodies.size }
}

/** Every HTTP request of the page (globalThis.fetch, which the runtime's
 *  transport calls): URL, start, until the response headers arrived, and
 *  its Content-Length. */
export interface HttpSpan { url: string, start: number, end: number, bytes: number | null }
const httpSpans: HttpSpan[] = []
function countFetches(): void {
  const original = globalThis.fetch
  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const start = performance.now()
    const response = await original(input, init)
    const length = response.headers.get('content-length')
    httpSpans.push({ url: input instanceof Request ? input.url : String(input), start, end: performance.now(), bytes: length === null ? null : Number(length) })
    return response
  }
}

/** The page's HTTP requests so far (times relative to `from`), harness
 *  endpoints excluded. */
export function httpReport(from: number): HttpSpan[] {
  const r = (x: number) => Math.round(x * 10) / 10
  return httpSpans.filter(s => !s.url.includes('/__acceptance/')).map(s => ({ ...s, start: r(s.start - from), end: r(s.end - from) }))
}

/** Installs the phase spans once (idempotent). */
export function installProbe(): void {
  if (installed) return
  installed = true
  const render = UsdImagingGLEngine.prototype.RenderBatch
  UsdImagingGLEngine.prototype.RenderBatch = function (this: InstanceType<typeof UsdImagingGLEngine>, ...args: Parameters<typeof render>) { engine = this; return render.apply(this, args) }
  wrap(UsdImagingGLEngine.prototype, 'PrepareBatch', 'engine.PrepareBatch')
  wrap(UsdImagingGLEngine.prototype, 'RenderBatch', 'engine.RenderBatch')
  wrap(UsdImagingStageSceneIndex.prototype, 'SetStage', 'usdImaging.SetStage (populate)')
  wrap(UsdImagingStageSceneIndex.prototype, 'ApplyPendingUpdates', 'usdImaging.ApplyPendingUpdates')
  wrap(UsdImagingStageSceneIndex.prototype, 'SetTime', 'usdImaging.SetTime')
  wrap(HdEngine.prototype, 'Execute', 'hd.Execute')
  wrap(HdRenderIndex.prototype, 'SyncAll', 'hd.SyncAll')
  wrap(HdRenderIndex.prototype, 'CommitResources', 'hd.CommitResources')
  // Every hdx task class with its own Prepare/Execute (a subclass calling
  // super is counted under both names).
  for (const [name, value] of Object.entries(Hdx)) {
    if (typeof value !== 'function' || !/Task$/.test(name) || name === 'Task') continue
    const proto = (value as { prototype?: object }).prototype
    if (!proto) continue
    for (const method of ['Prepare', 'Execute'] as const)
      if (Object.prototype.hasOwnProperty.call(proto, method)) wrap(proto, method, `hdx.${name}.${method}`)
  }
  wrap(HdStCodeGen.prototype, 'Compile', 'hdSt.CodeGen.Compile')
  wrap(HdStCodeGen.prototype, 'CompileComputeProgram', 'hdSt.CodeGen.CompileComputeProgram')
  countTranslations()
  wrap(HgiWebGPUGlslShaderBodyTranslator, 'Translate', 'hgiWebGPU.GLSL->WGSL Translate')
  wrap(HgiWebGPU.prototype, 'CreateShaderFunction', 'hgiWebGPU.CreateShaderFunction')
  wrap(HgiWebGPU.prototype, 'CreateGraphicsPipeline', 'hgiWebGPU.CreateGraphicsPipeline')
  wrap(HgiWebGPU.prototype, 'CreateComputePipeline', 'hgiWebGPU.CreateComputePipeline')
  wrap(HgiWebGPU.prototype, '_SubmitCmds', 'hgiWebGPU.SubmitCmds')
  // Dome light computations (hdSt/simpleLightingShader.cpp:595-701: queued
  // when the environment texture is (re)committed) and the light's Sync.
  wrap(HdStLight.prototype, 'sync', 'hdSt.Light.Sync')
  wrap(HdStSimpleLightingShader.prototype, 'allocateTextureHandles', 'hdSt.SimpleLightingShader.AllocateTextureHandles')
  wrap(HdStSimpleLightingShader.prototype, 'addResourcesFromTextures', 'hdSt.SimpleLightingShader.AddResourcesFromTextures')
  wrap(HdStDomeLightComputationGPU.prototype, 'Execute', 'hdSt.DomeLightComputationGPU.Execute')
  wrap(HdStDomeLightMipmapComputationGPU.prototype, 'Execute', 'hdSt.DomeLightMipmapComputationGPU.Execute')
  installTextureSpans()
  countFetches()
}

/** The probed spans that began at or after `from` and ended by `to`,
 *  at most `maxDepth` deep, times relative to `from` (0.1 ms). */
export function phaseTimeline(from: number, to: number, maxDepth = 3): PhaseSpan[] {
  const r = (x: number) => Math.round(x * 10) / 10
  return timeline.filter(s => s.start >= from && s.end <= to && s.depth <= maxDepth).sort((a, b) => a.start - b.start)
    .map(s => ({ name: s.name, start: r(s.start - from), end: r(s.end - from), depth: s.depth }))
}

/** A copy of the running totals. */
export function snapshot(): PhaseTotals {
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { ...v }]))
}

/** b - a per phase (phases with no calls in between are dropped). */
export function delta(a: PhaseTotals, b: PhaseTotals): PhaseTotals {
  const out: PhaseTotals = {}
  for (const [k, v] of Object.entries(b)) {
    const calls = v.calls - (a[k]?.calls ?? 0)
    if (calls > 0) out[k] = { calls, ms: v.ms - (a[k]?.ms ?? 0), maxMs: v.maxMs }
  }
  return out
}

/** Rounded for reports: ms per phase over `frames` frames (per-frame means). */
export function perFrame(d: PhaseTotals, frames: number): Record<string, number> {
  return Object.fromEntries(Object.entries(d).sort((x, y) => y[1].ms - x[1].ms).map(([k, v]) => [k, Math.round(v.ms / Math.max(1, frames) * 1000) / 1000]))
}

export function rounded(d: PhaseTotals): Record<string, { calls: number, ms: number, maxMs: number }> {
  return Object.fromEntries(Object.entries(d).sort((x, y) => y[1].ms - x[1].ms).map(([k, v]) => [k, { calls: v.calls, ms: Math.round(v.ms * 10) / 10, maxMs: Math.round(v.maxMs * 10) / 10 }]))
}
