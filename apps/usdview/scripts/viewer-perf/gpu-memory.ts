// Node driver for Storm's GPU resource lifetime: opens a scene with a payload
// load schedule (root layer customLayerData["tourLoad"], src/load-schedule.ts)
// unloaded, as the viewer's ?loadSchedule=1 does, and steps through the
// schedule's frames, applying each frame's LoadAndUnload and rendering after
// it on the stub GPU device (null-gpu.ts). A scene without a schedule opens
// loaded and is only stepped through. With --settle each frame renders until
// the engine converges (texture loads done); OpenVDB field reads
// (HioOpenVDB_TextureData::Read) are timed. Every --sample renders it records
// the GPU buffers and textures alive (created and not destroyed, count and
// bytes), Storm's resource allocation (HdStResourceRegistry::
// GetResourceAllocation: gpuMemoryUsed, buffer array sizes) and the instance
// registries' sizes. At the end it unloads every carrier, renders (which
// garbage collects, HdStRenderDelegate::CommitResources) and records the
// same once more. Prints one JSON object. Tooling only.
//
//   node gpu-memory.mjs <scene.usda> [--from F] [--to F] [--step N] [--sample N] [--width W] [--settle]
import { Stage } from 'typescript-usd/usd'
import { BBoxCache, getStageUpAxis } from 'typescript-usd/usdGeom'
import { Frustum as GfFrustum, Matrix4d as GfMatrix4d, Range1d as GfRange1d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import 'typescript-usd/usdMtlx'
import 'typescript-usd/hdSt/materialx'
import { installGpuGlobals, createNullDevice } from './null-gpu'
import { StageViewEngine, prepareStorm, createHgi } from '../../src/stage-view-engine'
import { defaultDisplaySettings, mergeDisplaySettings } from '../../src/display-settings'
import { carrierLoaded, readLoadSchedule, loadScheduleChange } from '../../src/load-schedule'
import { TextureData as HioOpenVDB_TextureData } from 'typescript-usd/hioOpenVDB'

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]! }
const scene = args[0]!
const width = Number(option('--width', '256'))
const step = Number(option('--step', '6'))
const sampleEvery = Number(option('--sample', '50'))
const settle = args.includes('--settle')

// HioOpenVDB_TextureData::Read times (ms), one per field read.
const vdbReads: { file: string, ms: number }[] = []
const read = HioOpenVDB_TextureData.prototype.Read
HioOpenVDB_TextureData.prototype.Read = async function (this: HioOpenVDB_TextureData, ...a: Parameters<typeof read>) {
  const start = performance.now()
  try { return await read.apply(this, a) } finally {
    vdbReads.push({ file: String((this as unknown as Record<string, unknown>)._filePath).split('/').pop()!, ms: Math.round((performance.now() - start) * 10) / 10 })
  }
}

installGpuGlobals()
await prepareStorm()
const stage = await Stage.open(scene, { loadPayloads: false })
if (!stage) throw new Error(`cannot open ${scene}`)
const { schedule } = readLoadSchedule(stage)
const from = Number(option('--from', String(stage.startTimeCode ?? 0)))
const to = Number(option('--to', String(stage.endTimeCode ?? 0)))
const carriers = [...schedule?.carriers.keys() ?? []]
const underCarrier = (p: string) => carriers.some(c => p === c || p.startsWith(`${c}/`))
// As the viewer (runtime.ts): every payload outside the schedule loads.
const outside = stage.findLoadable('/').filter(p => { const prim = stage.getPrim(p); return !!prim && !prim.isInPrototype() && !prim.isLoaded && !underCarrier(p) })
const first = schedule && loadScheduleChange(schedule, from, p => carrierLoaded(stage, p))
await stage.loadAndUnload([...first?.load ?? [], ...outside], [])

const settings = mergeDisplaySettings(defaultDisplaySettings(), { enableSceneMaterials: true, sceneLightsEnabled: true, selHighlightMode: 'Never' })
const { device, counters } = createNullDevice()
const engine = new StageViewEngine(createHgi(device), stage, from, settings, width, width)
const zUp = getStageUpAxis(stage) === 'Z'
engine.applySettings(settings, zUp)
const bbox = new BBoxCache(from, ['default', 'proxy'], true).computeWorldBound(stage.getPrim('/')!).ComputeAlignedRange()
const c = bbox.getMidpoint(), size = bbox.getSize()
const radius = Math.max(size.get(0), size.get(1), size.get(2), 1)
const eye = zUp ? [c.get(0), c.get(1) - radius, c.get(2) + radius * 0.5] : [c.get(0), c.get(1) + radius * 0.5, c.get(2) + radius]
const view = new GfMatrix4d(1).setLookAt(new GfVec3d(eye[0]!, eye[1]!, eye[2]!), new GfVec3d(c.get(0), c.get(1), c.get(2)), zUp ? new GfVec3d(0, 0, 1) : new GfVec3d(0, 1, 0))
const frustum = new GfFrustum()
frustum.setPerspective(45, 1, radius * 0.01, radius * 10)
void GfRange1d
const camera = { view, projection: frustum.computeProjectionMatrix(), eye: eye as unknown as readonly [number, number, number], scenePath: null, fitWindow: false }
const macrotask = () => new Promise(resolve => setTimeout(resolve, 0))
/** Renders (after a macrotask, so asynchronous loads progress) until the
 *  engine is converged; returns the renders. */
async function settleFrame(): Promise<number> {
  let n = 0
  for (; settle && n < 200 && !engine.isConverged(); n++) {
    await new Promise(resolve => setTimeout(resolve, 1))
    engine.Render(camera, width, width)
  }
  return n
}

type Any = Record<string, any>
const glEngine = (engine as unknown as Any)._engine
const registry = (): Any => (glEngine._getRenderIndexForTesting() as Any).getResourceRegistry()
const instSize = (r: Any) => typeof r?.size === 'function' ? r.size() : 0
function sample(frame: number, renders: number) {
  const reg = registry()
  const stats = glEngine.getRenderStats() as Any
  const num = (k: string) => { const v = typeof stats.get === 'function' ? stats.get(k) : stats[k]; const x = v && typeof v === 'object' && 'Get' in v ? v.Get() : v; return typeof x === 'number' || typeof x === 'bigint' ? Number(x) : 0 }
  let bufferArrays = 0, ranges = 0
  for (const name of ['_nonUniformBufferArrayRegistry', '_nonUniformImmutableBufferArrayRegistry', '_uniformUboBufferArrayRegistry', '_uniformSsboBufferArrayRegistry', '_singleBufferArrayRegistry']) {
    for (const entry of (reg[name]._entries as Map<unknown, Any>).values()) for (const ba of entry.bufferArrays) { bufferArrays++; ranges += ba.getRangeCount() }
  }
  let topoRanges = 0
  for (const name of ['_meshTopologyIndexRangeRegistry', '_basisCurvesTopologyIndexRangeRegistry', '_implicitPrimsTopologyIndexRangeRegistry']) {
    for (const r of (reg[name]._map as Map<unknown, Any>).values()) topoRanges += instSize(r)
  }
  const index = glEngine._getRenderIndexForTesting() as Any
  // Every range an rprim holds is alive and hosted by its buffer array.
  let heldRanges = 0, badRanges = 0
  for (const id of index.getRprimIds?.() ?? []) {
    const rprim = index.getRprim(id) as Any
    for (const range of (rprim?._rprimSharedData?.barContainer?._ranges ?? []) as Any[]) {
      if (!range) continue
      heldRanges++
      const array = range._stripedBufferArray ?? range._stripedBuffer ?? range._simpleBufferArray ?? null
      let hosted = !array
      if (array) for (let i = 0; i < array.getRangeCount(); i++) if (array.getRange(i) === range) { hosted = true; break }
      if (range._expired || !range.isValid() || !hosted) badRanges++
    }
  }
  return {
    heldRanges, badRanges,
    frame, renders, rprims: index.getRprimIds?.().length ?? null,
    liveBuffers: counters.liveBuffers, liveBufferMB: +(counters.liveBufferBytes / 1048576).toFixed(2),
    liveTextures: counters.liveTextures, liveTextureMB: +(counters.liveTextureBytes / 1048576).toFixed(2),
    gpuMemoryUsedMB: +(num('gpuMemoryUsed') / 1048576).toFixed(2), nonUniformMB: +(num('nonUniformSize') / 1048576).toFixed(2),
    uboMB: +(num('uboSize') / 1048576).toFixed(2), ssboMB: +(num('ssboSize') / 1048576).toFixed(2), singleMB: +(num('singleBufferSize') / 1048576).toFixed(2),
    textureMemoryMB: +(num('textureMemory') / 1048576).toFixed(2),
    bufferArrays, ranges,
    inst: { meshTopology: instSize(reg._meshTopologyRegistry), curvesTopology: instSize(reg._basisCurvesTopologyRegistry), topologyRanges: topoRanges,
      primvarRanges: instSize(reg._primvarRangeRegistry), vertexAdjacency: instSize(reg._vertexAdjacencyBuilderRegistry), glslPrograms: instSize(reg._glslProgramRegistry),
      pipelines: instSize(reg._graphicsPipelineRegistry), resourceBindings: instSize(reg._resourceBindingsRegistry),
      textureObjects: instSize(reg._textureHandleRegistry?.getTextureObjectRegistry?.()?._textureObjectRegistry) },
    heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
  }
}

const samples: ReturnType<typeof sample>[] = []
let renders = 0, changes = 0
const t0 = performance.now()
engine.SetTime(from)
engine.Render(camera, width, width); renders++
await macrotask()
renders += await settleFrame()
samples.push(sample(from, renders))
const baseline = samples[0]!
for (let f = from + step; f <= to; f += step) {
  const change = schedule && loadScheduleChange(schedule, f, p => carrierLoaded(stage, p))
  if (change) { await stage.loadAndUnload(change.load, change.unload); changes++ }
  engine.SetTime(f)
  engine.Render(camera, width, width); renders++
  // HgiWebGPU destroys trashed objects after onSubmittedWorkDone.
  await macrotask()
  renders += await settleFrame()
  if (renders % sampleEvery === 0 || settle) samples.push(sample(f, renders))
}
samples.push(sample(to, renders))
// Unload everything, then render twice (the first syncs the removals and
// flags garbage collection, CommitResources collects).
await stage.loadAndUnload([], ['/'])
engine.SetTime(to)
engine.Render(camera, width, width); await macrotask()
engine.Render(camera, width, width); await macrotask()
const unloaded = sample(to, renders + 2)
const grouped = new Map<string, [number, number]>()
for (const [k, [n, b]] of counters.liveByLabel) { const g = k.replace(/[0-9]+/g, "#"); const e = grouped.get(g) ?? [0, 0]; e[0] += n; e[1] += b; grouped.set(g, e) }
const liveByLabel = Object.fromEntries([...grouped].sort((a, b) => b[1][1] - a[1][1]).slice(0, 40).map(([k, [n, b]]) => [k, [n, +(b / 1048576).toFixed(3)]]))
console.log(JSON.stringify({ scene, from, to, step, renders, changes, seconds: Math.round((performance.now() - t0) / 1000), baseline, peak: samples.reduce((a, b) => b.liveBufferMB > a.liveBufferMB ? b : a), end: samples.at(-1), unloaded, liveByLabel, vdbReads, samples }))
process.exit(0)
