/** The working set (`?workingSet=0` turns it off; startup-options.ts): which
 * payloads stay loaded as a scene camera plays, derived when the scene opens.
 *
 * PLATFORM-DIVERGENCE(usdview-working-set): usdview loads every payload
 * (appController.py opens with Usd.Stage.LoadAll). Composing, syncing and
 * drawing every payload of a large scene stalls the browser's frames, and its
 * first frames wait for every texture. So when the scene has no authored load
 * schedule (load-schedule.ts), the viewer opens with `?camera=` set and the
 * scene's payload prims author `extentsHint` (UsdGeomModelAPI), the viewer
 * keeps loaded only the payloads near that camera's path:
 *
 * - a payload is wanted at a frame when its extentsHint box, in world space,
 *   is within `near` of the camera or intersects the camera's frustum out to
 *   `far` (widened to cover any viewport from square to ultrawide, which
 *   shows more than the camera's own aperture);
 * - it loads `ahead` frames before it is first wanted and unloads `keep`
 *   frames after it was last wanted.
 *
 * The windows feed the same LoadScheduler and LoadPrefetcher as an authored
 * schedule. A payload prim without extentsHint is wanted at every frame. The
 * camera is sampled every `step` frames. Defaults: checked against the USD
 * Museum's tour by rendering, at every load and unload, the frame before (or
 * after) it with the working set and with everything loaded: none at far
 * 120; at far 60, five frames where something 70-100 m down a row of doorways
 * appears a moment late, accepted for a median frame of 6.8 ms instead of 16
 * (Node, CPU only, the first two wings). */
import { BBox3d as GfBBox3d, Range1d as GfRange1d, Range3d as GfRange3d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { GfCamera, GfRange1f, GfMatrix4d } from 'typescript-usd/gf/camera'
import { Camera as UsdGeomCamera, XformCache } from 'typescript-usd/usdGeom'
import type { Stage } from 'typescript-usd/usd'
import type { LoadSchedule } from './load-schedule'

export interface WorkingSetOptions {
  near: number
  far: number
  ahead: number
  keep: number
  step: number
  /** Once loaded, a payload stays loaded while the camera is within this
   *  distance of it (and `keep` frames after), so one drifting in and out of
   *  view nearby is not loaded again and again. 0: unload `keep` frames after
   *  it was last wanted. */
  keepDistance: number
  /** Windows of one payload less than this many frames apart merge: it stays
   *  loaded across the gap rather than unloading and loading again (each costs
   *  a frame's sync). */
  mergeGap: number
  /** Carriers loaded (or unloaded) per frame while in their lead-in (load-schedule.ts perChange). */
  perChange: number
}

export const defaultWorkingSetOptions: WorkingSetOptions = { near: 8, far: 60, ahead: 48, keep: 72, step: 2, keepDistance: 40, mergeGap: 480, perChange: 1 }

/** The widest and narrowest viewports the frustum covers (width / height). */
const widestAspect = 2.4, narrowestAspect = 1

type Box = { min: [number, number, number], max: [number, number, number] }

function vec3(value: unknown): [number, number, number] | undefined {
  const v = value as { [i: number]: unknown, get?: (i: number) => unknown } | null | undefined
  if (!v) return undefined
  const at = (i: number) => (typeof v.get === 'function' ? v.get(i) : v[i]) as number
  const out: [number, number, number] = [at(0), at(1), at(2)]
  return out.every(Number.isFinite) ? out : undefined
}

function arrayItems(value: unknown): unknown[] {
  const v = value as { size?: number, length?: number, get?: (i: number) => unknown, [i: number]: unknown } | null | undefined
  if (!v) return []
  const n = typeof v.size === 'number' ? v.size : typeof v.length === 'number' ? v.length : 0
  const items: unknown[] = []
  for (let i = 0; i < n; i++) items.push(typeof v.get === 'function' ? v.get(i) : v[i])
  return items
}

/** The union of an extentsHint's non-empty purpose ranges (default, render,
 *  proxy, guide pairs; an empty range has min > max). */
export function extentsHintBox(value: unknown): Box | undefined {
  const items = arrayItems(value).map(vec3)
  let box: Box | undefined
  for (let i = 0; i + 1 < items.length; i += 2) {
    const lo = items[i], hi = items[i + 1]
    if (!lo || !hi || lo[0] > hi[0] || lo[1] > hi[1] || lo[2] > hi[2]) continue
    box = box
      ? { min: [Math.min(box.min[0], lo[0]), Math.min(box.min[1], lo[1]), Math.min(box.min[2], lo[2])],
          max: [Math.max(box.max[0], hi[0]), Math.max(box.max[1], hi[1]), Math.max(box.max[2], hi[2])] }
      : { min: [...lo], max: [...hi] }
  }
  return box
}

/** The world-space axis-aligned box of `box` under a row-major local-to-world
 *  matrix (row vectors: p' = p M, as GfMatrix4d). */
export function worldBox(box: Box, m: readonly number[]): Box {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let c = 0; c < 8; c++) {
    const x = c & 4 ? box.max[0] : box.min[0], y = c & 2 ? box.max[1] : box.min[1], z = c & 1 ? box.max[2] : box.min[2]
    for (let j = 0; j < 3; j++) {
      const v = x * m[j]! + y * m[4 + j]! + z * m[8 + j]! + m[12 + j]!
      if (v < min[j]!) min[j] = v
      if (v > max[j]!) max[j] = v
    }
  }
  return { min, max }
}

function distance(box: Box, p: readonly number[]): number {
  let s = 0
  for (let i = 0; i < 3; i++) {
    const d = Math.max(box.min[i]! - p[i]!, 0, p[i]! - box.max[i]!)
    s += d * d
  }
  return Math.sqrt(s)
}

/** Frame runs [first, last] from sorted frames, each widened by `before` and
 *  `after`, merged where they touch. */
export function frameWindows(frames: readonly number[], before: number, after: number): [number, number][] {
  const runs: [number, number][] = []
  for (const f of frames) {
    const a = f - before, b = f + after
    const last = runs[runs.length - 1]
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b)
    else runs.push([a, b])
  }
  return runs
}

/** Each window, extended while the camera stays within keepDistance (the
 *  sampled frames in `close`) `keep` frames before its end; overlapping
 *  windows merge. */
function extendWhileClose(runs: [number, number][], close: ReadonlySet<number>, options: WorkingSetOptions, end: number): [number, number][] {
  for (const run of options.keepDistance > 0 ? runs : []) {
    // The last wanted sample is run[1] - keep - step; extend sample by sample while close.
    let f = run[1] - options.keep
    while (f <= end && close.has(f)) f += options.step
    run[1] = Math.max(run[1], f - options.step + options.keep)
  }
  const merged: [number, number][] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run[0] <= last[1] + 1 + options.mergeGap) last[1] = Math.max(last[1], run[1])
    else merged.push(run)
  }
  return merged
}

/** The working set of `stage` (opened with payloads unloaded) for the scene
 *  camera at `cameraPath` over [start, end], as a load schedule whose carriers
 *  are the payload prims; undefined when there is nothing to schedule (no
 *  camera, or no payload prim authors extentsHint). */
export function deriveWorkingSet(stage: Stage, cameraPath: string, start: number, end: number,
  options: WorkingSetOptions = defaultWorkingSetOptions): LoadSchedule | undefined {
  const cameraPrim = stage.getPrim(cameraPath)
  if (!cameraPrim || !cameraPrim.isA('Camera') || !(end >= start)) return undefined
  const payloads = stage.findLoadable('/').filter(path => stage.getPrim(path)?.hasAuthoredPayloads())
  const xforms = new XformCache(stage)
  const boxes = new Map<string, Box | undefined>()
  for (const path of payloads) {
    const prim = stage.getPrim(path)!
    const hint = extentsHintBox(prim.getAttr('extentsHint')?.getValue())
    boxes.set(path, hint && worldBox(hint, xforms.getLocalToWorldTransform(path)))
  }
  if (![...boxes.values()].some(Boolean)) return undefined
  const wanted = new Map<string, number[]>(payloads.map(path => [path, []]))
  const close = new Map<string, Set<number>>(payloads.map(path => [path, new Set()]))
  const gfBoxes = new Map([...boxes].map(([path, box]) => [path, box && new GfBBox3d(new GfRange3d(new GfVec3d(...box.min), new GfVec3d(...box.max)))]))
  const nearFar = new GfRange1d(0.05, options.far)
  const cameraXforms = new XformCache(stage)
  for (let f = start; f <= end; f += options.step) {
    const value = UsdGeomCamera.getCamera(cameraPrim, f)
    if (!(value.horizontalAperture > 0 && value.verticalAperture > 0 && value.focalLength > 0)) continue
    // Cover every viewport shape: the widest horizontal and tallest vertical aperture.
    const h = Math.max(value.horizontalAperture, value.verticalAperture * widestAspect)
    const v = Math.max(value.verticalAperture, value.horizontalAperture / narrowestAspect)
    cameraXforms.setTime(f)
    const transform = new GfMatrix4d(...cameraXforms.getLocalToWorldTransform(cameraPath))
    const frustum = new GfCamera(transform, value.projection === 'orthographic' ? GfCamera.Orthographic : GfCamera.Perspective,
      h, v, value.horizontalApertureOffset, value.verticalApertureOffset, value.focalLength,
      new GfRange1f(0.05, options.far)).getFrustum()
    frustum.setNearFar(nearFar)
    const p = frustum.getPosition().data
    for (const [path, box] of boxes) {
      const d = box ? distance(box, p) : 0
      if (d <= options.keepDistance) close.get(path)!.add(f)
      if (!box || d <= options.near || frustum.intersects(gfBoxes.get(path)!)) {
        wanted.get(path)!.push(f)
      }
    }
  }
  const carriers = new Map<string, [number, number]>()
  const windows = new Map<string, [number, number][]>()
  for (const [path, frames] of wanted) {
    const near = close.get(path)!
    const runs = boxes.get(path) ? extendWhileClose(frameWindows(frames, options.ahead, options.keep + options.step), near, options, end) : [[start - options.ahead, end + options.keep] as [number, number]]
    // A payload never wanted stays a carrier with no window: never loaded.
    windows.set(path, runs)
    carriers.set(path, runs.length ? [runs[0]![0], runs[runs.length - 1]![1]] : [Infinity, -Infinity])
  }
  return { carriers, windows, perChange: options.perChange, lead: options.ahead }
}
