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
  for (const [path, [first, last]] of schedule.carriers) if (first <= frame && frame <= last) want.add(path)
  return want
}

/** `_loaded` in such a plugin: a carrier is loaded when any of its payload children is
 * (the carrier itself has no payload). */
export function carrierLoaded(stage: Stage, path: string): boolean {
  const prim = stage.getPrim(path)
  return !!prim && prim.getChildren().some(child => child.hasAuthoredPayloads() && child.isLoaded)
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
  /** The change `frame` would need now. */
  change(frame: number): LoadScheduleChange | undefined { return loadScheduleChange(this.schedule, frame, this.#loaded) }
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
    }
  }
}
