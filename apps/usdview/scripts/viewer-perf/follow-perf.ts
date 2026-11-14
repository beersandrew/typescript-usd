// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdx/simpleLightTask.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Node driver for the follower's per-frame cost on a scene with a payload
// load schedule (docs/viewer-contracts.md, ?loadSchedule=1): opens the scene
// unloaded as the viewer does (runtime.ts: the first frame's carriers and
// every payload outside the schedule load before the first draw), then
// either steps every frame or follows a simulated leader. Each frame does
// what the viewer's changeTime does while playing (runtime.ts): the load
// schedule's LoadAndUnload when the frame's carrier set changes, the scene
// camera's frame (ViewerCameraController), UsdImagingGLEngine SetTime and
// one Render, here on the stub GPU device (null-gpu.ts), so CPU work only.
// Tooling only. Prints one JSON object.
//
//   node follow-perf.mjs <scene.usda> --camera PATH [--complexity high] [--plugin plugInfo.json ...]
//       [--from F] [--to F] [--width W] [--height H] [--follow] [--fps 24]
//   (default) every frame from..to, then a macrotask (asynchronous texture
//             loads progress there; its time is reported as idleMs)
//   --profile-frames F,F,... --profile-dir DIR: each listed frame's step
//             is sampled by the V8 profiler (100 us) into DIR/<frame>.cpuprofile
//             (map it with inclusive.mjs and the bundle's source map)
//   --web-profile plugInfo.json  the viewer's profile plugin; the default is
//             relative to this script, so a bundle built elsewhere needs it
//   --no-prefetch  do not read the next carriers' layers ahead (runtime.ts,
//             src/load-prefetch.ts)
//   --sliced  payload prims reach Hydra a share per frame (the viewer's
//             playback behavior, usdview-sliced-arrival)
//   --lights  each frame's record gains the lights Storm lit it with: the
//             HdxSimpleLightTask's lighting context after its last Sync of
//             the frame (useLighting, each light's id, dome flag, diffuse)
//   --follow  a leader advances one frame per 1000/fps ms of wall clock and
//             the follower seeks as follow.ts's FollowSeeker does (one seek
//             in flight, the newest leader frame waiting)
import { readFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import { installGpuGlobals, createNullDevice } from './null-gpu'
import { installProbe, snapshot, delta, rounded, textureReport } from './probe'
import { Stage } from 'typescript-usd/usd'
import { getStageUpAxis } from 'typescript-usd/usdGeom'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import 'typescript-usd/usdMtlx'
import 'typescript-usd/hdSt/materialx'
import { StageViewEngine, prepareStorm, createHgi } from '../../src/stage-view-engine'
import { defaultDisplaySettings, mergeDisplaySettings, type DisplaySettings } from '../../src/display-settings'
import { carrierLoaded, readLoadSchedule, LoadScheduler } from '../../src/load-schedule'
import { LoadPrefetcher } from '../../src/load-prefetch'
import { deriveWorkingSet, defaultWorkingSetOptions } from '../../src/working-set'
// load-prefetch.ts loads it on demand; in this one-file bundle it must be
// evaluated before the run below, which runs at the module's top level.
import 'typescript-usd/hio/_internal'
import { ViewerCameraController } from '../../src/viewer-camera'
import { defaultCamera } from '../../src/camera'
import { FollowSeeker } from '../../src/follow'
import { HgiWebGPU } from 'typescript-usd/hgiWebGPU'
import { SimpleLightTask as HdxSimpleLightTask } from 'typescript-usd/hdx'
import { Session } from 'node:inspector/promises'

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]! }
const options = (name: string) => args.flatMap((a, i) => a === name ? [args[i + 1]!] : [])
const scene = path.resolve(args[0]!)
const cameraPath = option('--camera', '')
const complexity = option('--complexity', 'high') as DisplaySettings['complexity']
const width = Number(option('--width', '1280')), height = Number(option('--height', '720'))
const follow = args.includes('--follow')
const fps = Number(option('--fps', '24'))
const r1 = (x: number) => Math.round(x * 10) / 10

installGpuGlobals()
installProbe()
await prepareStorm()
// ?plugin= (main.ts): the viewer's web profile first, then the page's plugins.
const here = path.dirname(fileURLToPath(import.meta.url))
const fileFetch = (async (url: string) => { try { return new Response(readFileSync(fileURLToPath(url), 'utf8')) } catch { return new Response(null, { status: 404 }) } }) as unknown as typeof fetch
for (const p of [path.resolve(here, option('--web-profile', '../../public/plugins/typescript-usd-web-profile/plugInfo.json')), ...options('--plugin')])
  await PlugRegistry.GetInstance().registerPluginsAsync(pathToFileURL(path.resolve(p)).href, { fetch: fileFetch })

const openStart = performance.now()
const stage = await Stage.open(scene, { loadPayloads: false })
if (!stage) throw new Error(`cannot open ${scene}`)
const from = Number(option('--from', String(stage.startTimeCode ?? 0)))
const to = Number(option('--to', String(stage.endTimeCode ?? 0)))
// --working-set: the viewer's working set for --camera (working-set.ts), as
// runtime.ts derives it for a scene with no authored schedule.
const workingSetStart = performance.now()
const schedule = args.includes('--working-set')
  ? deriveWorkingSet(stage, cameraPath, stage.startTimeCode ?? 0, stage.endTimeCode ?? 0, { ...defaultWorkingSetOptions, ...JSON.parse(option('--ws-options', '{}')) })
  : readLoadSchedule(stage).schedule
const workingSetMs = performance.now() - workingSetStart
const carriers = [...schedule?.carriers.keys() ?? []]
const underCarrier = (p: string) => carriers.some(c => p === c || p.startsWith(`${c}/`))
const outside = stage.findLoadable('/').filter(p => { const prim = stage.getPrim(p); return !!prim && !prim.isInPrototype() && !prim.isLoaded && !underCarrier(p) })
const changes: { frame: number, load: string[], unload: string[], ms: number }[] = []
const scheduler = schedule && new LoadScheduler(schedule, p => carrierLoaded(stage, p), async change => {
  const start = performance.now()
  await stage.loadAndUnload(change.load, change.unload)
  changes.push({ frame: currentFrame, load: change.load, unload: change.unload, ms: r1(performance.now() - start) })
})
let currentFrame = from
const prefetcher = schedule && !args.includes('--no-prefetch') ? new LoadPrefetcher(stage, schedule) : undefined
// --late-load: every payload loads in the first stepped frame instead (one
// resync of the whole scene during playback, for --sliced checks on any scene).
const lateLoad = args.includes('--late-load')
await stage.loadAndUnload([...scheduler?.change(from)?.load ?? [], ...(lateLoad ? [] : outside)], [])
const openMs = performance.now() - openStart

const settings = mergeDisplaySettings(defaultDisplaySettings(), { complexity })
const { device, counters } = createNullDevice()
// --dump-wgsl DIR: every shader module's WGSL, for inspecting what the GPU runs.
const dumpDir = option('--dump-wgsl', '')
if (dumpDir) {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(dumpDir, { recursive: true })
  let n = 0
  const create = device.createShaderModule.bind(device)
  ;(device as unknown as Record<string, unknown>).createShaderModule = (d: GPUShaderModuleDescriptor) => { writeFileSync(path.join(dumpDir, `${String(n++).padStart(3, '0')}-${(d.label ?? '').replace(/[^\w.-]+/g, '_').slice(0, 60)}.wgsl`), d.code); return create(d) }
}
const engine = new StageViewEngine(createHgi(device), stage, from, settings, width, height)
engine.applySettings(settings, getStageUpAxis(stage) === 'Z')
const controller = new ViewerCameraController(defaultCamera(), () => width / height)
controller.stage = stage
if (cameraPath) controller.select(cameraPath)
const stormCamera = () => { const v = controller.frame(); return { view: v.view, projection: v.projection, eye: v.eye, scenePath: controller.activeCameraPath, fitWindow: false } }
// Render passes per frame (HgiWebGPU::CreateGraphicsCmds): attachments,
// samples, size, load/store, resolves; the GPU cost is per pixel per pass.
const passes = new Map<string, number>()
{
  type Any = Record<string, any>
  const create = (HgiWebGPU.prototype as Any).createGraphicsCmds as (this: unknown, desc: Any) => unknown
  ;(HgiWebGPU.prototype as Any).createGraphicsCmds = function (this: unknown, desc: Any) {
    const tex = (h: Any) => h?.isSet?.() ? h.Get().getDescriptor() : undefined
    const c = (desc.colorTextures as Any[]).map(tex), d = tex(desc.depthTexture)
    const first = c[0] ?? d
    const key = first ? `${first.dimensions.data[0]}x${first.dimensions.data[1]} s${first.sampleCount} color${c.length}${desc.colorResolveTextures.length ? '+resolve' : ''} ${(desc.colorAttachmentDescs as Any[]).map(a => `${a.loadOp}/${a.storeOp}`).join(',')} depth${d ? `${desc.depthAttachmentDesc.loadOp}/${desc.depthAttachmentDesc.storeOp}` : '-'}${desc.depthResolveTexture?.isSet?.() ? '+resolve' : ''}` : 'none'
    passes.set(key, (passes.get(key) ?? 0) + 1)
    return create.call(this, desc)
  }
}
const profileFrames = new Set(option('--profile-frames', '').split(',').filter(Boolean).map(Number))
const profileDir = option('--profile-dir', '')
const session = profileFrames.size ? new Session() : undefined
if (session) {
  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.setSamplingInterval', { interval: 100 })
}
// --lights: the lighting context the simple light task leaves for the frame's
// render tasks (hdx/simpleLightTask.cpp Sync), as of its last Sync.
type LightRecord = { useLighting: boolean, lights: [id: string, dome: boolean, diffuse: number[]][] }
let lastLights: LightRecord | undefined
if (args.includes('--lights')) {
  type Any = Record<string, any>
  const sync = (HdxSimpleLightTask.prototype as Any).sync as (this: Any, ...a: unknown[]) => unknown
  ;(HdxSimpleLightTask.prototype as Any).sync = function (this: Any, ...a: unknown[]) {
    const result = sync.apply(this, a)
    const context = this._lightingShader.getLightingContext() as Any
    lastLights = { useLighting: context.getUseLighting(), lights: (context.getLights() as Any[]).map(l => [l.getID(), l.isDomeLight(), [...l.getDiffuse().data ?? l.getDiffuse()].map((x: number) => Math.round(x * 1000) / 1000)]) }
    return result
  }
}
const macrotask = () => new Promise(resolve => setTimeout(resolve, 0))

interface FrameRecord { lights?: LightRecord, frame: number, ms: number, loadMs: number, cameraMs: number, setTimeMs: number, renderMs: number, idleMs?: number, converged: boolean, gpu: Record<string, number>, phases: Record<string, { calls: number, ms: number, maxMs: number }> }
/** One frame as changeTime does it while playing (runtime.ts). */
async function step(frame: number): Promise<FrameRecord> {
  const profiling = session && profileFrames.has(frame)
  if (profiling) await session.post('Profiler.start')
  const rec = await stepFrame(frame)
  if (dumpFrames.has(frame)) await dumpScene(frame)
  if (profiling) {
    const { profile } = await session.post('Profiler.stop')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(profileDir || '.', { recursive: true })
    writeFileSync(path.join(profileDir || '.', `${frame}.cpuprofile`), JSON.stringify(profile))
  }
  return rec
}
// --dump-scene F,F,... --dump-dir DIR: after each listed frame, every prim of
// the render index's terminal scene index (path, type, and its data sources
// printed at the frame) into DIR/<frame>.txt, with the next frame's draw
// count. With --sliced the queued prims are sent first (as the viewer does
// when playback stops), so a sliced and an unsliced run can be compared.
const dumpFrames = new Set(option('--dump-scene', '').split(',').filter(Boolean).map(Number))
const sceneDumpDir = option('--dump-dir', '')
async function dumpScene(frame: number) {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { DebugPrintDataSource, SceneIndexPrimView } = await import('typescript-usd/hd')
  const sliced = args.includes('--sliced')
  if (sliced) engine.setSlicedArrival(false)
  const draws0 = counters.draws
  engine.Render(stormCamera(), width, height)
  const draws = counters.draws - draws0
  if (sliced) engine.setSlicedArrival(true)
  const index = (engine as unknown as { _engine: { _getRenderIndexForTesting(): { _terminalSceneIndex: Parameters<typeof DebugPrintDataSource>[0] & import("typescript-usd/hd").SceneIndexBase } } })._engine._getRenderIndexForTesting()._terminalSceneIndex
  const lines: string[] = [`draws ${draws}`]
  for (const p of new SceneIndexPrimView(index, '/')) {
    const prim = index.getPrim(p)
    lines.push(`<${p}> ${prim.primType}`, DebugPrintDataSource(prim.dataSource, 1).replace(/0x[0-9a-f]+/g, '0x'))
  }
  mkdirSync(sceneDumpDir || '.', { recursive: true })
  writeFileSync(path.join(sceneDumpDir || '.', `${frame}.txt`), lines.join('\n'))
}
async function stepFrame(frame: number): Promise<FrameRecord> {
  currentFrame = frame
  const before = snapshot()
  const c0 = { draws: counters.draws, dispatches: counters.dispatches, submits: counters.submits, writes: counters.writes, writeBytes: counters.writeBytes, buffers: counters.buffers, textures: counters.textures }
  const start = performance.now()
  if (scheduler?.change(frame)) await scheduler.update(frame)
  if (lateLoad && frame === from + 1) await stage.loadAndUnload(outside, [])
  prefetcher?.update(frame)
  const t1 = performance.now()
  controller.time = frame
  const camera = stormCamera()
  const t2 = performance.now()
  engine.SetTime(frame)
  const t3 = performance.now()
  engine.Render(camera, width, height)
  const end = performance.now()
  const phases = rounded(delta(before, snapshot()))
  for (const k of Object.keys(phases)) if (phases[k]!.ms < 0.5) delete phases[k]
  return { ...(lastLights ? { lights: lastLights } : {}), frame, ms: r1(end - start), loadMs: r1(t1 - start), cameraMs: r1(t2 - t1), setTimeMs: r1(t3 - t2), renderMs: r1(end - t3), converged: engine.isConverged(), gpu: Object.fromEntries(Object.entries(c0).map(([k, v]) => [k, (counters as unknown as Record<string, number>)[k]! - v])), phases }
}

const firstStart = performance.now()
controller.time = from
engine.SetTime(from)
engine.Render(stormCamera(), width, width)
// --sliced: added prims reach Hydra a share per frame, as while the viewer plays (usdview-sliced-arrival).
if (args.includes('--sliced')) {
  // --sliced-share N: the first share per frame (tooling; the engine adapts it from there).
  const share = Number(option('--sliced-share', '0'))
  if (share > 0) (engine as unknown as { _addedPerFrame: number })._addedPerFrame = share
  engine.setSlicedArrival(true)
}
const firstRenderMs = performance.now() - firstStart
for (let i = 0; i < 200 && !engine.isConverged(); i++) { await new Promise(resolve => setTimeout(resolve, 1)); engine.Render(stormCamera(), width, height) }

const frames: FrameRecord[] = []
const ticks: { t: number, leader: number, shown: number | undefined }[] = []
const t0 = performance.now()
if (!follow) {
  for (let f = from + 1; f <= to; f++) {
    const rec = await step(f)
    const idle = performance.now()
    await macrotask()
    rec.idleMs = r1(performance.now() - idle)
    frames.push(rec)
  }
} else {
  // The leader's clock: frame = from + floor(elapsed * fps); one message per frame.
  let shown: number | undefined
  const seeker = new FollowSeeker({ seek: async time => { const rec = await step(time); frames.push(rec); shown = time; return time } })
  const period = 1000 / fps
  await new Promise<void>(resolve => {
    let leader = from
    const tick = () => {
      const elapsed = performance.now() - t0
      const due = Math.min(to, from + 1 + Math.floor(elapsed / period))
      if (due !== leader) { leader = due; void seeker.request(leader, leader < to); ticks.push({ t: r1(elapsed), leader, shown }) }
      if (leader >= to) { void seeker.settled().then(() => resolve()); return }
      setTimeout(tick, period - (elapsed % period) + 0.1)
    }
    tick()
  })
}
const wallMs = performance.now() - t0

const sorted = frames.map(f => f.ms).sort((a, b) => a - b)
const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null
const sum = (k: keyof FrameRecord) => r1(frames.reduce((t, f) => t + (f[k] as number ?? 0), 0))
const phaseTotals: Record<string, number> = {}
for (const f of frames) for (const [k, v] of Object.entries(f.phases)) phaseTotals[k] = r1((phaseTotals[k] ?? 0) + v.ms)
const behind = ticks.map(t => t.shown === undefined ? null : t.leader - t.shown).filter((x): x is number => x !== null)
console.log(JSON.stringify({
  scene, mode: follow ? 'follow' : 'every', from, to, complexity, width, height, openMs: r1(openMs), workingSetMs: r1(workingSetMs), firstRenderMs: r1(firstRenderMs), wallMs: r1(wallMs),
  frames: frames.length, medianMs: q(0.5), p90Ms: q(0.9), p99Ms: q(0.99), maxMs: sorted.at(-1) ?? null,
  over42: frames.filter(f => f.ms > 1000 / fps).length,
  totals: { ms: sum('ms'), loadMs: sum('loadMs'), cameraMs: sum('cameraMs'), setTimeMs: sum('setTimeMs'), renderMs: sum('renderMs'), idleMs: sum('idleMs') },
  phaseTotals: Object.fromEntries(Object.entries(phaseTotals).sort((a, b) => b[1] - a[1])),
  worst: [...frames].sort((a, b) => b.ms - a.ms).slice(0, 15).map(({ lights, ...f }) => f),
  changes,
  ...(follow ? { behind: { max: Math.max(0, ...behind), mean: behind.length ? r1(behind.reduce((a, b) => a + b, 0) / behind.length) : null, ticks: ticks.length }, ticks } : {}),
  textures: (({ spans, ...rest }) => rest)(textureReport()),
  frameMs: frames.map(f => [f.frame, f.ms]),
  ...(lastLights ? { lightsByFrame: frames.map(f => [f.frame, f.lights]) } : {}),
  // Frames drawn while textures were still loading (Storm draws nothing then
  // and the viewer keeps the previous image, runtime.ts present), as
  // inclusive [first, last] runs.
  unconverged: frames.filter(f => !f.converged).reduce<[number, number][]>((runs, f) => { const last = runs.at(-1); if (last && last[1] === f.frame - 1) last[1] = f.frame; else runs.push([f.frame, f.frame]); return runs }, []),
  passesPerFrame: Object.fromEntries([...passes].map(([k, v]) => [k, Math.round(v / Math.max(1, frames.length) * 100) / 100])),
  gpuPerFrame: Object.fromEntries(Object.keys(frames[0]?.gpu ?? {}).map(k => [k, [...frames.map(f => f.gpu[k]!)].sort((a, b) => a - b)[frames.length >> 1]])),
}))
process.exit(0)
