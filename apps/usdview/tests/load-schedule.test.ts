// ?loadSchedule=1 (src/load-schedule.ts): the load schedule of
// docs/viewer-contracts.md, "Load schedule". Controller/mock tests, no browser.
import { describe, expect, it } from 'vitest'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'
import { LoadScheduler, carrierLoaded, loadScheduleChange, parseLoadSchedule, readLoadSchedule, scheduledCarriers, type LoadScheduleChange } from '../src/load-schedule'
import { parseStartupOptions } from '../src/startup-options'
import { A, B, C, open } from './load-schedule-scene'

describe('load schedule', () => {
  it('reads the root layer schedule (int2 windows) and reports malformed carriers', async () => {
    const stage = await open()
    try {
      const {schedule, warnings} = readLoadSchedule(stage)
      expect(warnings).toEqual([])
      expect([...schedule!.carriers]).toEqual([[A, [-47, 217]], [B, [133, 397]], [C, [313, 577]]])
    } finally { stage.dispose() }
    expect(parseLoadSchedule({})).toEqual({warnings: []})
    expect(parseLoadSchedule(undefined)).toEqual({warnings: []})
    expect(parseLoadSchedule({tourLoad: {lead: 48}}).schedule).toBeUndefined()
    const bad = parseLoadSchedule({tourLoad: {carriers: {'/A': [1, 2], 'B': [1, 2], '/C': [1.5, 2], '/D': 'x'}}})
    expect([...bad.schedule!.carriers.keys()]).toEqual(['/A'])
    expect(bad.warnings).toHaveLength(3)
  })

  it('selects the carriers whose inclusive window holds the frame', () => {
    const {schedule} = parseLoadSchedule({tourLoad: {carriers: {[A]: [-47, 217], [B]: [133, 397], [C]: [313, 577]}}})
    const at = (frame: number) => [...scheduledCarriers(schedule!, frame)]
    expect(at(-48)).toEqual([])
    expect(at(1)).toEqual([A])
    expect(at(132)).toEqual([A])
    expect(at(133)).toEqual([A, B])
    expect(at(217)).toEqual([A, B])
    expect(at(218)).toEqual([B])
    expect(at(313)).toEqual([B, C])
    expect(at(578)).toEqual([])
    const loaded = new Set([A])
    expect(loadScheduleChange(schedule!, 133, path => loaded.has(path))).toEqual({load: [B], unload: []})
    expect(loadScheduleChange(schedule!, 1, path => loaded.has(path))).toBeUndefined()
    expect(loadScheduleChange(schedule!, 400, path => loaded.has(path))).toEqual({load: [C], unload: [A]})
  })

  it('keeps one change in flight and applies the latest frame when it settles', async () => {
    const {schedule} = parseLoadSchedule({tourLoad: {carriers: {[A]: [0, 10], [B]: [5, 20], [C]: [15, 30]}}})
    const loaded = new Set<string>(), applied: LoadScheduleChange[] = []
    let release!: () => void
    const scheduler = new LoadScheduler(schedule!, path => loaded.has(path), async change => {
      applied.push(change)
      await new Promise<void>(resolve => { release = resolve })
      for (const path of change.load) loaded.add(path)
      for (const path of change.unload) loaded.delete(path)
    })
    const first = scheduler.update(0)
    expect(scheduler.busy).toBe(true)
    const joined = [scheduler.update(6), scheduler.update(12), scheduler.update(16)]
    expect(applied).toEqual([{load: [A], unload: []}])
    release(); await Promise.resolve(); await Promise.resolve()
    // Frames 6 and 12 were superseded: only frame 16's set is applied.
    expect(applied).toEqual([{load: [A], unload: []}, {load: [B, C], unload: [A]}])
    release()
    expect(await first).toBe(true)
    for (const p of joined) expect(await p).toBe(true)
    expect(scheduler.busy).toBe(false)
    expect([...loaded].sort()).toEqual([B, C])
    expect(await scheduler.update(17)).toBe(false)
    expect(applied).toHaveLength(2)
  })

  it('does not repeat a change that cannot progress (a carrier without payloads)', async () => {
    const {schedule} = parseLoadSchedule({tourLoad: {carriers: {'/Empty': [0, 10]}}})
    let calls = 0
    const scheduler = new LoadScheduler(schedule!, () => false, async () => { calls++ })
    expect(await scheduler.update(1)).toBe(true)
    expect(await scheduler.update(2)).toBe(false)
    expect(calls).toBe(1)
  })

  it('loads and unloads carriers with descendants in one LoadAndUnload per change, and the stage scene index follows', async () => {
    const stage = await open()
    try {
      const {schedule} = readLoadSchedule(stage)
      const calls: [string[], string[]][] = []
      const scheduler = new LoadScheduler(schedule!, path => carrierLoaded(stage, path), async ({load, unload}) => {
        calls.push([load, unload]); await stage.loadAndUnload(load, unload)
      })
      const sceneIndex = UsdImagingStageSceneIndex.new()
      sceneIndex.SetStage(stage)
      const meshes = () => [A, B, C].filter(path => sceneIndex.getPrim(`${path}/Unit/M`).primType === 'mesh')
      sceneIndex.SetTime(1)
      expect(meshes()).toEqual([])
      expect(await scheduler.update(1)).toBe(true)
      sceneIndex.ApplyPendingUpdates()
      expect(!!stage.getPrim(`${A}/Unit/M`)).toBe(true)
      expect(stage.getPrim(`${A}/Labels`)!.isLoaded).toBe(true)
      expect(!!stage.getPrim(`${B}/Unit/M`)).toBe(false)
      expect(meshes()).toEqual([A])
      await scheduler.update(133); sceneIndex.ApplyPendingUpdates()
      expect(meshes()).toEqual([A, B])
      await scheduler.update(400); sceneIndex.ApplyPendingUpdates()
      expect(meshes()).toEqual([C])
      expect(!!stage.getPrim(`${A}/Unit/M`)).toBe(false)
      expect(calls).toEqual([[[A], []], [[B], []], [[C], [A, B]]])
      // Payloads outside the schedule are not the schedule's to change.
      expect(stage.getPrim('/Scene/Loose')!.isLoaded).toBe(false)
      sceneIndex.SetStage(undefined)
    } finally { stage.dispose() }
  })

  it('is an opt-in startup option', () => {
    expect(parseStartupOptions('').options.loadSchedule).toBeUndefined()
    expect(parseStartupOptions('?loadSchedule=1').options.loadSchedule).toBe(true)
    expect(parseStartupOptions('?loadSchedule=0').options.loadSchedule).toBe(false)
    expect(parseStartupOptions('?loadSchedule=yes').warnings).toEqual(['Invalid startup loadSchedule: yes. Expected 0 or 1.'])
  })
})
