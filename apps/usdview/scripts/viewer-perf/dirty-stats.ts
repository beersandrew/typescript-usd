// Per-frame change-tracking counts for the playback measurements
// (packages/usd/docs/performance-viewer.md, Playback): what a time change
// dirties and what Sync then runs, without changing library code. Tooling
// only.
//
// - setTime: the entries UsdImagingStageSceneIndex::_SetTime sends
//   (stageSceneIndex.cpp:426-435): prims, and per locator (its first two
//   elements) how many prims carry it;
// - marked: rprims, sprims and instancers the change tracker marked dirty
//   (HdChangeTracker::_MarkRprimDirty and friends) during the frame;
// - sync: per Hydra prim class, Sync calls and inclusive ms;
// - resolves: attribute value resolutions (UsdStage._resolveAttribute) by
//   property name;
// - byGroup: per path group (the first three path elements, e.g.
//   /World/Units/Cars), resolutions and rprim Sync calls and ms.
import { RprimChangeTracker as HdRprimChangeTracker, RenderIndex as HdRenderIndex } from 'typescript-usd/hd'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'
import { Stage as UsdStage } from 'typescript-usd/usd'

type AnyFn = (this: unknown, ...args: unknown[]) => unknown
interface Counts {
  setTimePrims: number
  setTimeLocators: Record<string, number>
  marked: Record<string, Set<string>>
  sync: Record<string, { calls: number, ms: number }>
  resolves: Record<string, number>
  groupResolves: Record<string, number>
  groupSyncMs: Record<string, number>
  groupSyncs: Record<string, number>
}
let current: Counts | undefined
const fresh = (): Counts => ({ setTimePrims: 0, setTimeLocators: {}, marked: {}, sync: {}, resolves: {}, groupResolves: {}, groupSyncMs: {}, groupSyncs: {} })
const group = (path: string) => path.split('/').slice(0, 4).join('/')
let inSetTime = false
const wrappedClasses = new Set<object>()

function wrapSync(proto: object, label: string): void {
  if (wrappedClasses.has(proto)) return
  wrappedClasses.add(proto)
  for (const method of ['sync', 'Sync']) {
    const original = (proto as Record<string, unknown>)[method]
    if (typeof original !== 'function') continue
    ;(proto as Record<string, unknown>)[method] = function (this: unknown, ...args: unknown[]) {
      const start = performance.now()
      try { return (original as AnyFn).apply(this, args) } finally {
        if (current) {
          const ms = performance.now() - start
          const s = current.sync[label] ??= { calls: 0, ms: 0 }; s.calls++; s.ms += ms
          const id = (this as { getId?(): unknown }).getId?.()
          if (label.startsWith('rprim') && id !== undefined) {
            const g = group(String(id)); current.groupSyncMs[g] = (current.groupSyncMs[g] ?? 0) + ms; current.groupSyncs[g] = (current.groupSyncs[g] ?? 0) + 1
          }
        }
      }
    }
  }
}

function wrapClassesOf(index: HdRenderIndex): void {
  const self = index as unknown as Record<string, Map<string, Record<string, unknown>>>
  for (const [field, key] of [['_rprims', 'rprim'], ['_sprims', 'sprim'], ['_bprims', 'bprim']] as const) {
    for (const entry of self[field]?.values() ?? []) {
      const prim = entry[key] as object | undefined
      if (prim) wrapSync(Object.getPrototypeOf(prim), `${key} ${prim.constructor.name}`)
    }
  }
  for (const instancer of (self._instancerMap as unknown as Map<string, object> | undefined)?.values() ?? [])
    wrapSync(Object.getPrototypeOf(instancer), `instancer ${instancer.constructor.name}`)
}

export function installDirtyStats(): void {
  const proto = UsdImagingStageSceneIndex.prototype as unknown as Record<string, AnyFn>
  const setTime = proto._setTime!
  proto._setTime = function (this: unknown, ...args: unknown[]) {
    inSetTime = true
    try { return setTime.apply(this, args) } finally { inSetTime = false }
  }
  const send = proto._sendPrimsDirtied!
  proto._sendPrimsDirtied = function (this: unknown, ...args: unknown[]) {
    if (inSetTime && current) {
      const entries = args[0] as { primPath: string, dirtyLocators: { [Symbol.iterator](): Iterator<{ toString(): string }> } }[]
      current.setTimePrims += entries.length
      for (const e of entries) {
        for (const l of e.dirtyLocators) {
          const key = String(l).split('/').slice(0, 2).join('/') || '(empty)'
          current.setTimeLocators[key] = (current.setTimeLocators[key] ?? 0) + 1
        }
      }
    }
    return send.apply(this, args)
  }
  const tracker = HdRprimChangeTracker.prototype as unknown as Record<string, AnyFn>
  for (const [method, kind] of [['_MarkRprimDirty', 'rprim'], ['_MarkSprimDirty', 'sprim'], ['_MarkInstancerDirty', 'instancer'], ['_MarkBprimDirty', 'bprim']] as const) {
    const original = tracker[method]
    if (typeof original !== 'function') continue
    tracker[method] = function (this: unknown, ...args: unknown[]) {
      if (current) (current.marked[kind] ??= new Set()).add(String(args[0]))
      return original.apply(this, args)
    }
  }
  const stage = UsdStage.prototype as unknown as Record<string, AnyFn>
  const resolve = stage._resolveAttribute!
  stage._resolveAttribute = function (this: unknown, ...args: unknown[]) {
    if (current) {
      const k = String(args[1]); current.resolves[k] = (current.resolves[k] ?? 0) + 1
      const g = group(String(args[5] ?? args[0])); current.groupResolves[g] = (current.groupResolves[g] ?? 0) + 1
    }
    return resolve.apply(this, args)
  }
  const syncAll = HdRenderIndex.prototype.SyncAll
  HdRenderIndex.prototype.SyncAll = function (this: HdRenderIndex, ...args: Parameters<typeof syncAll>) {
    wrapClassesOf(this)
    return syncAll.apply(this, args)
  }
}

/** Starts counting a frame. */
export function beginFrame(): void { current = fresh() }

/** Ends the frame's counts (undefined when none was begun). */
export function endFrame(): { setTimePrims: number, setTimeLocators: Record<string, number>, marked: Record<string, number>, sync: Record<string, { calls: number, ms: number }>, resolves: Record<string, number>, groupResolves: Record<string, number>, groupSyncMs: Record<string, number>, groupSyncs: Record<string, number> } | undefined {
  const c = current
  current = undefined
  if (!c) return undefined
  return { setTimePrims: c.setTimePrims, setTimeLocators: c.setTimeLocators,
    marked: Object.fromEntries(Object.entries(c.marked).map(([k, v]) => [k, v.size])), sync: c.sync, resolves: c.resolves,
    groupResolves: c.groupResolves, groupSyncMs: c.groupSyncMs, groupSyncs: c.groupSyncs }
}

/** Mean per frame of a list of frame counts. */
export function meanCounts(frames: NonNullable<ReturnType<typeof endFrame>>[]): Record<string, unknown> {
  const n = Math.max(1, frames.length)
  const r = (x: number) => Math.round(x / n * 100) / 100
  const sum = (pick: (f: NonNullable<ReturnType<typeof endFrame>>) => Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const f of frames) for (const [k, v] of Object.entries(pick(f))) out[k] = (out[k] ?? 0) + v
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r(v)]))
  }
  return {
    setTimePrims: r(frames.reduce((t, f) => t + f.setTimePrims, 0)),
    setTimeLocators: sum(f => f.setTimeLocators),
    marked: sum(f => f.marked),
    syncCalls: sum(f => Object.fromEntries(Object.entries(f.sync).map(([k, v]) => [k, v.calls]))),
    syncMs: sum(f => Object.fromEntries(Object.entries(f.sync).map(([k, v]) => [k, v.ms]))),
    resolvesTotal: r(frames.reduce((t, f) => t + Object.values(f.resolves).reduce((a, b) => a + b, 0), 0)),
    resolves: Object.fromEntries(Object.entries(sum(f => f.resolves)).slice(0, 15)),
    byGroup: Object.fromEntries(Object.entries(sum(f => f.groupSyncMs)).map(([g, ms]) => [g, {
      syncMs: ms, syncs: sum(f => f.groupSyncs)[g] ?? 0, resolves: sum(f => f.groupResolves)[g] ?? 0 }])),
  }
}
