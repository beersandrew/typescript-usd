// Loading ahead while paused (src/load-ahead.ts, PLATFORM-DIVERGENCE(usdview-paused-load-ahead);
// docs/viewer-contracts.md "Working set"). Controller tests, no browser.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { carrierLoaded, LoadScheduler, readLoadSchedule, scheduledCarriers, type LoadSchedule, type LoadScheduleChange } from '../src/load-schedule'
import { LoadPrefetcher } from '../src/load-prefetch'
import { PausedLoadAhead } from '../src/load-ahead'
import { A, B, C, open } from './load-schedule-scene'

// Lead 10, one carrier per change. At frame 10: /U needed now, /L1-/L3 in their
// lead-in (needed at 15, 18, 19), /X opens later, /Old's window is over.
const windows = { '/U': [-20, 100], '/L1': [5, 100], '/L2': [8, 100], '/L3': [9, 100], '/X': [50, 100], '/Old': [-100, 0] } as const
function budgeted(perChange = 1): LoadSchedule {
  const entries = Object.entries(windows) as [string, readonly [number, number]][]
  return { carriers: new Map(entries), windows: new Map(entries.map(([path, w]) => [path, [w]])), ...perChange ? { perChange, lead: 10 } : {} }
}
function fakeScheduler(schedule = budgeted(), loaded = new Set<string>(['/Old'])) {
  const applied: LoadScheduleChange[] = []
  let gate: Promise<void> | undefined
  const scheduler = new LoadScheduler(schedule, path => loaded.has(path), async change => {
    applied.push(change)
    await gate
    for (const path of change.load) loaded.add(path)
    for (const path of change.unload) loaded.delete(path)
  })
  return { scheduler, loaded, applied, hold: (promise: Promise<void> | undefined) => { gate = promise } }
}

afterEach(() => { vi.useRealTimers() })

describe('load scheduler remainder (paused load-ahead)', () => {
  it('ranks lead-in carriers whose windows are all open by when each is needed', () => {
    const { scheduler } = fakeScheduler()
    // A jump to 10: /U at once, then the lead-in carrier needed soonest (/L1 at 15).
    expect(scheduler.change(10)).toEqual({ load: ['/U', '/L1'], unload: ['/Old'] })
  })

  it('settles the paused frame\'s set one budget at a time, soonest first, never beyond it', async () => {
    const { scheduler, loaded, applied } = fakeScheduler()
    await scheduler.update(10)
    expect(scheduler.remainder(10)).toEqual({ load: ['/L2'], unload: [] })
    expect(await scheduler.settle(10)).toBe(true)
    expect(await scheduler.settle(10)).toBe(true)
    expect(await scheduler.settle(10)).toBe(false)
    expect(applied.slice(1)).toEqual([{ load: ['/L2'], unload: [] }, { load: ['/L3'], unload: [] }])
    // What playback at frame 10 holds, and nothing more.
    expect([...loaded].sort()).toEqual([...scheduledCarriers(budgeted(), 10)].sort())
    expect(loaded.has('/X')).toBe(false)
    // Playing on from here loads only windows opening later.
    expect(scheduler.change(11)).toBeUndefined()
  })

  it('has nothing left after a frame change for a schedule without a budget', async () => {
    const { scheduler } = fakeScheduler(budgeted(0))
    await scheduler.update(10)
    expect(scheduler.remainder(10)).toBeUndefined()
  })

  it('runs a frame change requested during a settle after it, for that frame', async () => {
    const { scheduler, loaded, hold } = fakeScheduler()
    await scheduler.update(10)
    let release!: () => void
    hold(new Promise<void>(resolve => { release = resolve }))
    const settling = scheduler.settle(10)
    expect(scheduler.busy).toBe(true)
    // A settle does not start while a change is in flight.
    expect(await scheduler.settle(10)).toBe(false)
    const playing = scheduler.update(60)
    hold(undefined); release()
    await settling; await playing
    // Frame 60: /X needed now loads, /Old stays unloaded.
    expect(loaded.has('/X')).toBe(true)
  })
})

describe('paused load-ahead', () => {
  const ahead = (scheduler: LoadScheduler, options: { idle?: () => boolean, frame?: () => number, now?: () => number, prefetcher?: LoadPrefetcher } = {}) =>
    new PausedLoadAhead({ scheduler, idle: options.idle ?? (() => true), frame: options.frame ?? (() => 10), now: options.now ?? (() => 1e6), interval: 10, quiet: 100, ...options.prefetcher ? { prefetcher: options.prefetcher } : {} })

  it('loads the rest of the paused frame\'s set a step per idle moment, then stops', async () => {
    vi.useFakeTimers()
    const { scheduler, applied } = fakeScheduler()
    await scheduler.update(10)
    const loader = ahead(scheduler)
    loader.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(applied.slice(1)).toEqual([{ load: ['/L2'], unload: [] }])
    await vi.advanceTimersByTimeAsync(10)
    expect(applied.slice(1).map(change => change.load)).toEqual([['/L2'], ['/L3']])
    // Done: no timer left.
    expect(loader.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits while the viewer is busy or was touched within the quiet time', async () => {
    vi.useFakeTimers()
    const { scheduler, applied } = fakeScheduler()
    await scheduler.update(10)
    let idle = false, now = 1000
    const loader = ahead(scheduler, { idle: () => idle, now: () => now })
    loader.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(applied).toHaveLength(1)
    idle = true
    loader.interact()
    now += 50
    await vi.advanceTimersByTimeAsync(100)
    expect(applied).toHaveLength(1)
    now += 100
    await vi.advanceTimersByTimeAsync(100)
    expect(applied).toHaveLength(3)
  })

  it('stops when playback or a scrub starts, and a step in flight does not re-arm', async () => {
    vi.useFakeTimers()
    const { scheduler, applied, hold } = fakeScheduler()
    await scheduler.update(10)
    const loader = ahead(scheduler)
    let release!: () => void
    hold(new Promise<void>(resolve => { release = resolve }))
    loader.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(applied).toHaveLength(2)
    loader.stop()
    hold(undefined); release()
    await vi.advanceTimersByTimeAsync(1000)
    expect(applied).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
    // Paused again: it carries on.
    loader.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(applied).toHaveLength(3)
  })

  it('reads a carrier\'s layers and images before loading it, and loads only the paused frame\'s set', async () => {
    const stage = await open()
    try {
      // The scene's windows with a budget: A (-47..217), B (133..397), C (313..577).
      const authored = readLoadSchedule(stage).schedule!
      const schedule: LoadSchedule = { ...authored, perChange: 1, lead: 48 }
      const events: string[] = []
      const scheduler = new LoadScheduler(schedule, path => carrierLoaded(stage, path), async change => {
        events.push(`load ${change.load.join(' ')}`); await stage.loadAndUnload(change.load, change.unload)
      })
      // Paused at 340 after a jump that loaded B (needed now); C (opened at
      // 313, needed at 361) is in its lead-in.
      await stage.loadAndUnload([B], [])
      const prefetcher = new LoadPrefetcher(stage, schedule)
      const read = prefetcher.read.bind(prefetcher)
      prefetcher.read = async carrier => { events.push(`read ${carrier}`); await read(carrier); events.push(`read ${carrier} done`) }
      const loader = ahead(scheduler, { frame: () => 340, prefetcher })
      expect(await loader.step()).toBe('loaded')
      expect(events).toEqual([`read ${C}`, `read ${C} done`, `load ${C}`])
      expect(stage.getLoadSet().sort()).toEqual([`${B}/Labels`, `${B}/Unit`, `${C}/Labels`, `${C}/Unit`].sort())
      // Its images stay held through the load's first draws.
      expect(prefetcher.imagesHeld).toContain(C)
      prefetcher.update(340)
      expect(prefetcher.imagesHeld).toContain(C)
      expect(await loader.step()).toBe('done')
      expect(stage.getPrim(`${A}/Unit/M`)).toBeUndefined()
      prefetcher.dispose()
    } finally { stage.dispose() }
  })
})
