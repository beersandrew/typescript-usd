// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Node driver for the CPU side of the viewer's imaging path
// (packages/usd/docs/performance-viewer.md): opens a prepared asset-acceptance
// scene (scene.usda with /AcceptanceCam, written by the asset harness's native
// half; see ../asset-acceptance/run.mjs),
// builds the viewer's engine (src/stage-view-engine.ts: UsdImagingGLEngine on
// HgiWebGPU with the GLSL to WGSL translator) on a stub GPU device
// (null-gpu.ts), and times the same steps the native program (run with the
// capture tooling kept outside this repository; FIXTURES.md) times: open, first Render, orbit renders and
// playback renders. Every Render's CPU work runs (scene index chain, Hydra
// sync, Storm commit, code generation, HgiWebGPU encoding); nothing is drawn.
// run.mjs bundles this file (Vite SSR, source maps); with --profile-dir each
// step is sampled by the V8 profiler (node:inspector) into
// <dir>/<step>.cpuprofile, which profile.mjs maps to sources.
// Prints one JSON object. Tooling only.
//
// With --settle the first render is followed by renders until the engine
// is converged (texture loads done, as usdview redraws until converged:
// stageView.py:1543-1548), each after a macrotask so asynchronous loads
// settle; the settled renders are reported apart and not counted in orbit or
// playback. Playback frames then also start after a macrotask (untimed).
//
//   node node.mjs <scene.usda> [--orbit N] [--playback N] [--width W] [--complexity low|...] [--profile-dir DIR] [--settle] [--settings JSON]
//
//   ...also:
//       [--camera PATH] [--from T] [--frame-times]
//   --camera  the scene camera (default /AcceptanceCam); playback draws through it by path
//   --from    the first playback time code (default the stage's start); playback
//             then plays N consecutive time codes, wrapping at the end
//   --frame-times  also print every playback frame's ms (playback.frameMs)
//   --gpu-calls  also report the GPU calls per orbit and playback frame by
//             kind, label and call site (gpuCalls; slow, times not comparable)
//   --dirty-stats  also count what each playback frame dirtied and synced
//             (dirty-stats.ts; playback.dirty, means per frame)
import { Session } from 'node:inspector/promises'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { installGpuGlobals, createNullDevice, gpuCallSites } from './null-gpu'
import { installDirtyStats, beginFrame, endFrame, meanCounts } from './dirty-stats'
import { installProbe, snapshot, delta, perFrame, rounded, stormStats } from './probe'
import { Stage } from 'typescript-usd/usd'
import { BBoxCache, Camera as UsdGeomCamera, XformCache, getStageUpAxis } from 'typescript-usd/usdGeom'
import { Matrix4d as GfMatrix4d, Frustum as GfFrustum, Camera as GfCamera, Range1f as GfRange1f } from 'typescript-usd/gf'
import 'typescript-usd/usdMtlx'
import 'typescript-usd/hdSt/materialx'
import { StageViewEngine, prepareStorm, createHgi } from '../../src/stage-view-engine'
import { defaultDisplaySettings, mergeDisplaySettings, type DisplaySettings } from '../../src/display-settings'

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]! }
const scene = args[0]!
const orbitFrames = Number(option('--orbit', '60'))
const playbackFrames = Number(option('--playback', '0'))
const width = Number(option('--width', '512'))
const complexity = option('--complexity', 'low') as DisplaySettings['complexity']
const profileDir = option('--profile-dir', '')
const settle = args.includes('--settle')
const cameraPath = option('--camera', '/AcceptanceCam')
const fromOption = option('--from', '')
const frameTimes = args.includes('--frame-times')
const dirtyStats = args.includes('--dirty-stats')
const gpuCalls = args.includes('--gpu-calls')
const ms = (t: number) => Math.round(t * 100) / 100
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : null }

const session = profileDir ? new Session() : undefined
if (session) {
  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.setSamplingInterval', { interval: 100 })
}
/** Runs fn under the V8 sampling profiler when --profile-dir is given. */
async function profiled<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  if (!session) return fn()
  await session.post('Profiler.start')
  try { return await fn() } finally {
    const { profile } = await session.post('Profiler.stop')
    writeFileSync(path.join(profileDir, `${name}.cpuprofile`), JSON.stringify(profile))
  }
}

installGpuGlobals()
installProbe()
const dirtyFrames: NonNullable<ReturnType<typeof endFrame>>[] = []
const t0 = performance.now()
await prepareStorm()
// After prepareStorm: the imaging modules are evaluated by then.
if (dirtyStats) installDirtyStats()
const registerMs = performance.now() - t0
const heap = () => Math.round(process.memoryUsage().heapUsed / 1048576 * 10) / 10

const openStart = performance.now()
const opened = await profiled('open', () => Stage.open(scene))
if (!opened) throw new Error(`cannot open ${scene}`)
const stage = opened
const openMs = performance.now() - openStart
const time = stage.startTimeCode ?? 0

// The harness's display settings (../asset-acceptance/harness.ts).
const settings = mergeDisplaySettings(defaultDisplaySettings(), {
  background: 'Black', cameraLightEnabled: true, sceneLightsEnabled: true, domeLightEnabled: false, domeLightTexturesVisible: false,
  enableSceneMaterials: true, defaultMaterialAmbient: 0.2, defaultMaterialSpecular: 0.1, renderMode: 'Smooth Shaded', cullBackfaces: false,
  displayRender: false, displayProxy: true, displayGuide: false, showBBoxes: false, showBBoxPlayback: false, selHighlightMode: 'Never', complexity,
  // --settings '<json>': display settings over the harness's (e.g. the
  // viewer's own domeLightTexturesVisible: true).
  ...JSON.parse(option('--settings', '{}')) as Partial<DisplaySettings>,
})
const { device, counters } = createNullDevice()
const hgi = createHgi(device)
const zUp = getStageUpAxis(stage) === 'Z'
const buildStart = performance.now()
const engine = new StageViewEngine(hgi, stage, time, settings, width, width)
engine.applySettings(settings, zUp)
const buildMs = performance.now() - buildStart

// /AcceptanceCam (or --camera) at the start time (the prepared scene), drawn as a scene camera.
const camPrim = stage.getPrim(cameraPath)
if (!camPrim) throw new Error(`no ${cameraPath}: pass a prepared scene.usda or --camera`)
// As the viewer's ViewerCameraController.authored (src/viewer-camera.ts).
const cam = UsdGeomCamera.getCamera(camPrim, time)
const camToWorld = new GfMatrix4d(...new XformCache(stage, time).getLocalToWorldTransform(cameraPath))
const frustum = new GfCamera(camToWorld, cam.projection === 'orthographic' ? GfCamera.Orthographic : GfCamera.Perspective, cam.horizontalAperture, cam.verticalAperture,
  cam.horizontalApertureOffset, cam.verticalApertureOffset, cam.focalLength, new GfRange1f(cam.clippingRange[0], cam.clippingRange[1])).getFrustum()
const cameraFor = (f: typeof frustum, scenePath: string | null) => {
  const p = f.getPosition()
  return { view: f.computeViewMatrix(), projection: f.computeProjectionMatrix(), eye: [p.get(0), p.get(1), p.get(2)] as const, scenePath, fitWindow: false }
}

const frameSnap = () => ({ phases: snapshot(), draws: counters.draws, dispatches: counters.dispatches, textures: counters.textures, writes: counters.writes, writeBytes: counters.writeBytes, buffers: counters.buffers, bufferBytes: counters.bufferBytes, submits: counters.submits, copies: counters.copies, copyBytes: counters.copyBytes, maps: counters.maps,
  computePasses: counters.computePasses, renderPasses: counters.renderPasses, encoders: counters.encoders, calls: new Map(counters.calls), t: performance.now() })
const s0 = frameSnap()
const firstRenderMs = await profiled('firstRender', () => {
  const firstStart = performance.now()
  engine.Render(cameraFor(frustum, cameraPath), width, width)
  return performance.now() - firstStart
})
const macrotask = () => new Promise(resolve => setTimeout(resolve, 0))
let settleRenders = 0
if (settle) {
  for (; settleRenders < 200 && !engine.isConverged(); settleRenders++) {
    await macrotask()
    engine.Render(cameraFor(frustum, cameraPath), width, width)
  }
}
const s1 = frameSnap()
const firstDrawSinceOpenMs = performance.now() - openStart
const heapAfterFirst = heap()

// Orbit: the free camera turned about the bounds centre around the stage up
// axis, one full turn over orbitFrames renders (the native program does
// the same turn).
const bbox = new BBoxCache(time, ['default', 'proxy'], true).computeWorldBound(stage.getPrim('/')!).ComputeAlignedRange()
const m = bbox.getMidpoint(), mid = bbox.IsEmpty() ? [0, 0, 0] : [m.get(0), m.get(1), m.get(2)]
const center: [number, number, number] = [mid[0]!, mid[1]!, mid[2]!]
const axis: [number, number, number] = zUp ? [0, 0, 1] : [0, 1, 0]
const orbitMs: number[] = []
if (gpuCalls) gpuCallSites(true)
const s2 = frameSnap()
await profiled('orbit', () => { for (let i = 1; i <= orbitFrames; i++) {
  const turn = new GfMatrix4d(1).setTranslate([-center[0], -center[1], -center[2]])
    .multiplyInPlace(new GfMatrix4d(1).setRotate({ axis, angle: 360 * i / orbitFrames }))
    .multiplyInPlace(new GfMatrix4d(1).setTranslate(center))
  const f = new GfFrustum(frustum).Transform(turn)
  const start = performance.now()
  engine.Render(cameraFor(f, null), width, width)
  orbitMs.push(performance.now() - start)
} })
const s3 = frameSnap()

// Playback: SetTime then Render at each time code (as the viewer's setTime).
const playbackMs: number[] = []
const unconverged: number[] = []
let s4 = s3, s5 = s3
const end = stage.endTimeCode ?? time
if (playbackFrames > 0 && end > time) {
  s4 = frameSnap()
  // Wrap-around over the time range, as the Safari and native playbacks.
  const from = fromOption === '' ? time : Number(fromOption)
  await profiled('playback', async () => { for (let i = 0, t = from; i < playbackFrames; i++, t = t + 1 > end ? time : t + 1) {
    if (settle) await macrotask()
    if (dirtyStats) beginFrame()
    const start = performance.now()
    engine.SetTime(t)
    engine.Render(cameraFor(frustum, cameraPath), width, width)
    playbackMs.push(performance.now() - start)
    if (!engine.isConverged()) unconverged.push(t)
    const counts = endFrame()
    if (counts) dirtyFrames.push(counts)
  } })
  s5 = frameSnap()
}
/** GPU calls per frame between two snapshots: totals by kind, and the call
 *  sites (kind [label] caller) by count per frame. */
const callsPerFrame = (a: ReturnType<typeof frameSnap>, b: ReturnType<typeof frameSnap>, n: number) => {
  if (!gpuCalls || n === 0) return undefined
  const per = (k: keyof typeof a) => Math.round(((b[k] as number) - (a[k] as number)) / n * 100) / 100
  const sites = [...b.calls].map(([k, v]) => [k, Math.round((v - (a.calls.get(k) ?? 0)) / n * 100) / 100] as const).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1])
  return { createBuffer: per('buffers'), createBufferBytes: per('bufferBytes'), writeBuffer: per('writes'), writeBufferBytes: per('writeBytes'), copyBufferToBuffer: per('copies'), copyBytes: per('copyBytes'),
    mapAsync: per('maps'), encoders: per('encoders'), computePasses: per('computePasses'), dispatches: per('dispatches'), renderPasses: per('renderPasses'), draws: per('draws'), submits: per('submits'), sites: Object.fromEntries(sites) }
}
console.log(JSON.stringify({
  scene, ...(gpuCalls ? { gpuCalls: { orbit: callsPerFrame(s2, s3, orbitMs.length), playback: callsPerFrame(s4, s5, playbackMs.length) } } : {}), node: process.version, registerMs: ms(registerMs), openMs: ms(openMs), engineConstructMs: ms(buildMs),
  firstRenderMs: ms(firstRenderMs), firstDrawSinceOpenMs: ms(firstDrawSinceOpenMs),
  firstRender: { phases: rounded(delta(s0.phases, s1.phases)), draws: s1.draws - s0.draws, ...(settle ? { settleRenders, converged: engine.isConverged() } : {}) },
  orbit: { frames: orbitMs.length, medianMs: median(orbitMs), p95Ms: orbitMs.length ? [...orbitMs].sort((a, b) => a - b)[Math.floor(orbitMs.length * 0.95)] : null,
    drawsPerFrame: orbitMs.length ? (s3.draws - s2.draws) / orbitMs.length : null, phasesPerFrame: perFrame(delta(s2.phases, s3.phases), orbitMs.length) },
  playback: { frames: playbackMs.length, medianMs: median(playbackMs), maxMs: playbackMs.length ? Math.max(...playbackMs) : null,
    meanMs: playbackMs.length ? ms(playbackMs.reduce((a, b) => a + b, 0) / playbackMs.length) : null,
    draws: s5.draws - s4.draws, dispatches: s5.dispatches - s4.dispatches, texturesCreated: s5.textures - s4.textures, unconvergedTimes: unconverged,
    bufferWritesPerFrame: playbackMs.length ? (s5.writes - s4.writes) / playbackMs.length : null,
    bufferWriteBytesPerFrame: playbackMs.length ? Math.round((s5.writeBytes - s4.writeBytes) / playbackMs.length) : null,
    buffersCreatedPerFrame: playbackMs.length ? (s5.buffers - s4.buffers) / playbackMs.length : null,
    bufferBytesCreatedPerFrame: playbackMs.length ? Math.round((s5.bufferBytes - s4.bufferBytes) / playbackMs.length) : null,
    framesMs: playbackMs.map(ms), ...(frameTimes ? { frameMs: playbackMs.map(ms) } : {}), ...(dirtyStats ? { dirty: meanCounts(dirtyFrames) } : {}),
    phasesPerFrame: perFrame(delta(s4.phases, s5.phases), playbackMs.length), phases: rounded(delta(s4.phases, s5.phases)) },
  heapMB: { afterFirstRender: heapAfterFirst, end: heap() },
  gpuObjects: { buffers: counters.buffers, textures: counters.textures, submits: counters.submits }, storm: stormStats(),
}))
process.exit(0)
