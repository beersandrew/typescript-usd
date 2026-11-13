/** Payload load schedule (`?loadSchedule=1`, startup-options.ts).
 *
 * A scene may carry a schedule in its root layer's
 * `customLayerData["tourLoad"] = {lead, carriers: {"/carrier/path": int2 (first, last)}}`
 * (docs/viewer-contracts.md, "Load schedule"). At frame f the viewer loads
 * every carrier whose window holds f (first <= f <= last), with its descendants,
 * and unloads the rest, in one UsdStage::LoadAndUnload per change. A usdview
 * plugin can apply the same schedule on every frame change, with the stage
 * opened `--unloaded`. Scenes without a schedule are left alone. */
import type {Stage} from 'typescript-usd/usd'

/** The root layer customLayerData key the schedule is read from. */
export const loadScheduleKey = 'tourLoad'

export interface LoadSchedule {
  /** Carrier prim path -> inclusive frame window [first, last]. */
  readonly carriers: ReadonlyMap<string, readonly [number, number]>
  /** A derived working set (working-set.ts): per carrier, its windows, when it
   *  has more than one (or none); `carriers` then holds their span. */
  readonly windows?: ReadonlyMap<string, readonly (readonly [number, number])[]>
  /** A derived working set's budget: at most this many carriers load (and
   *  unload) per change, those needed soonest first, so a frame where many
   *  windows open together spreads its loads over the next frames (each load
   *  syncs its prims in that frame's draw). Unset: the whole change at once. */
  readonly perChange?: number
  /** With perChange: how many frames a window opens before its carrier is
   *  needed on screen (working-set.ts `ahead`). A carrier further into its
   *  window than this (the first frame, a seek) loads at once, outside the
   *  budget. */
  readonly lead?: number
}

/** The next frame at or after `frame` that one of the carrier's windows holds. */
function nextNeeded(schedule: LoadSchedule, path: string, frame: number): number {
  let best = Infinity
  for (const [a, b] of carrierWindows(schedule, path)) if (b >= frame) best = Math.min(best, Math.max(a, frame))
  return best
}

/** Whether the carrier is needed on screen at `frame`: a window holding it
 *  opened at least `lead` frames ago. */
function neededNow(schedule: LoadSchedule, path: string, frame: number): boolean {
  const lead = schedule.lead ?? 0
  return carrierWindows(schedule, path).some(([a, b]) => a <= frame && frame <= b && frame - a >= lead)
}

/** A carrier's windows: its `windows` entry, else its one `carriers` window. */
export function carrierWindows(schedule: LoadSchedule, path: string): readonly (readonly [number, number])[] {
  const windows = schedule.windows?.get(path)
  if (windows) return windows
  const window = schedule.carriers.get(path)
  return window ? [window] : []
}

const int = (value: unknown) => typeof value === 'number' && Number.isInteger(value) ? value : undefined
function frameWindow(value: unknown): [number, number] | undefined {
  // int2 values arrive as GfVec2i (get(i)); accept plain pairs too.
  const v = value as {get?: (i: number) => unknown, length?: number} | null
  const pair = v && typeof v.get === 'function' ? [v.get(0), v.get(1)] : Array.isArray(value) && value.length === 2 ? value : undefined
  const first = int(pair?.[0]), last = int(pair?.[1])
  return first === undefined || last === undefined ? undefined : [first, last]
}

/** The schedule (`_schedule` in such a plugin): the carriers of a root layer's customLayerData, or
 * undefined when it has no schedule. Malformed entries are reported, not applied. */
export function parseLoadSchedule(customLayerData: unknown): {schedule?: LoadSchedule, warnings: string[]} {
  const warnings: string[] = []
  const entry = (customLayerData as Record<string, unknown> | null | undefined)?.[loadScheduleKey]
  if (entry === undefined || entry === null) return {warnings}
  const carriers = (entry as Record<string, unknown>).carriers
  if (typeof entry !== 'object' || typeof carriers !== 'object' || carriers === null) {
    warnings.push(`Load schedule: customLayerData["${loadScheduleKey}"] has no carriers dictionary; loading everything.`)
    return {warnings}
  }
  const map = new Map<string, [number, number]>()
  for (const [path, value] of Object.entries(carriers as Record<string, unknown>)) {
    const w = frameWindow(value)
    if (!path.startsWith('/') || !w) warnings.push(`Load schedule: ignoring carrier ${path} (expected an absolute prim path and an int2 (first, last)).`)
    else map.set(path, w)
  }
  return {schedule: {carriers: map}, warnings}
}

export function readLoadSchedule(stage: Stage): {schedule?: LoadSchedule, warnings: string[]} {
  return parseLoadSchedule(stage.getRootLayer().getField('/', 'customLayerData'))
}

/** The carriers whose window holds `frame` (a plugin's `apply` `want`). */
export function scheduledCarriers(schedule: LoadSchedule, frame: number): Set<string> {
  const want = new Set<string>()
  for (const [path, [first, last]] of schedule.carriers) {
    if (!(first <= frame && frame <= last)) continue
    if (carrierWindows(schedule, path).some(([a, b]) => a <= frame && frame <= b)) want.add(path)
  }
  return want
}

/** `_loaded` in such a plugin: a carrier is loaded when any of its payload children is
 * (an authored schedule's carrier has no payload), or, for a working set's
 * carrier (working-set.ts), which is the payload prim itself, when it is. */
export function carrierLoaded(stage: Stage, path: string): boolean {
  const prim = stage.getPrim(path)
  if (!prim) return false
  if (prim.hasAuthoredPayloads()) return prim.isLoaded
  return prim.getChildren().some(child => child.hasAuthoredPayloads() && child.isLoaded)
}

export interface LoadScheduleChange { load: string[], unload: string[] }

/** `apply` in such a plugin: what to load and unload at `frame`, or undefined when the
 * stage already holds the scheduled set. */
export function loadScheduleChange(schedule: LoadSchedule, frame: number, loaded: (path: string) => boolean): LoadScheduleChange | undefined {
  const want = scheduledCarriers(schedule, frame)
  const load: string[] = [], unload: string[] = []
  for (const path of schedule.carriers.keys()) {
    const have = loaded(path)
    if (want.has(path) && !have) load.push(path)
    else if (!want.has(path) && have) unload.push(path)
  }
  return load.length || unload.length ? {load, unload} : undefined
}

/** Applies a schedule as the frame changes. One load/unload is in flight at a
 * time: frames requested meanwhile only record the latest frame, whose set is
 * applied when the change in flight settles. */
export class LoadScheduler {
  #frame = 0
  #running: Promise<boolean> | undefined
  readonly schedule: LoadSchedule
  readonly #loaded: (path: string) => boolean
  readonly #apply: (change: LoadScheduleChange) => Promise<void>

  constructor(schedule: LoadSchedule, loaded: (path: string) => boolean, apply: (change: LoadScheduleChange) => Promise<void>) {
    this.schedule = schedule; this.#loaded = loaded; this.#apply = apply
  }
  /** The change `frame` would need now (within the schedule's per-change budget). */
  change(frame: number): LoadScheduleChange | undefined {
    const change = loadScheduleChange(this.schedule, frame, this.#loaded)
    const budget = this.schedule.perChange
    if (!change || !budget) return change
    const soonest = (a: string, b: string) => nextNeeded(this.schedule, a, frame) - nextNeeded(this.schedule, b, frame)
    const urgent = change.load.filter(path => neededNow(this.schedule, path, frame))
    const ahead = change.load.filter(path => !urgent.includes(path)).sort(soonest)
    return {load: [...urgent, ...ahead.slice(0, budget)], unload: change.unload.slice(0, budget)}
  }
  get busy(): boolean { return !!this.#running }
  /** Brings the stage to the latest requested frame's set. Resolves true when
   * a change was applied (by this call or the run it joined). */
  update(frame: number): Promise<boolean> {
    this.#frame = frame
    if (this.#running) return this.#running
    const running = this.#run()
    this.#running = running
    const clear = () => { if (this.#running === running) this.#running = undefined }
    running.then(clear, clear)
    return running
  }
  #previous = ''
  async #run(): Promise<boolean> {
    let applied = false
    for (;;) {
      const change = this.change(this.#frame)
      if (!change) { this.#previous = ''; return applied }
      // A carrier with no payload children never reads as loaded; asking
      // again for the change just applied would not progress.
      const key = JSON.stringify(change)
      if (key === this.#previous) return applied
      this.#previous = key
      await this.#apply(change)
      applied = true
      // With a budget, one change per frame: the next frame takes the rest.
      if (this.schedule.perChange) { this.#previous = ''; return applied }
    }
  }
}
