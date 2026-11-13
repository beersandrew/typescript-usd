// The working set (src/working-set.ts, PLATFORM-DIVERGENCE(usdview-working-set)):
// payload windows derived from a scene camera's path and each payload prim's
// extentsHint, applied by the load schedule's scheduler (src/load-schedule.ts).
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { createHttpResolverContext } from '../src/http-resolver'
import { LoadScheduler, carrierLoaded, scheduledCarriers, type LoadSchedule, type LoadScheduleChange } from '../src/load-schedule'
import { defaultWorkingSetOptions, deriveWorkingSet, extentsHintBox, frameWindows, worldBox } from '../src/working-set'
import { parseStartupOptions } from '../src/startup-options'

// A camera at y = 1 that moves from x = 0 (frame 1) to x = 300 (frame 301)
// looking down -z, past four payloads:
// - Start: beside the camera's first position (within `near`);
// - Ahead: 10 m in front of the camera's path at x = 200 (in view near frame 201);
// - Behind: 500 m behind the camera (never near, never in view);
// - NoHint: no extentsHint (wanted at every frame).
const entry = (name: string, at: string, hint?: string) => `    def Xform "${name}" (
        prepend payload = @./unit.usda@</Unit>
    )
    {
${hint ? `        float3[] extentsHint = ${hint}\n` : ''}        double3 xformOp:translate = ${at}
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
`
const files: Record<string, string> = {
  '/root.usda': `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 301
)
def Xform "World"
{
    def Camera "cam"
    {
        float focalLength = 50
        float horizontalAperture = 36
        float verticalAperture = 24
        float2 clippingRange = (0.1, 1000)
        double3 xformOp:translate.timeSamples = {
            1: (0, 1, 0),
            301: (300, 1, 0),
        }
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
${entry('Start', '(0, 0, 3)', '[(-1, 0, -1), (1, 2, 1)]')}${entry('Ahead', '(200, 0, -10)', '[(-1, 0, -1), (1, 2, 1)]')}${entry('Behind', '(0, 0, 500)', '[(-1, 0, -1), (1, 2, 1)]')}${entry('NoHint', '(100, 0, 0)')}}
`,
  '/unit.usda': `#usda 1.0
def Xform "Unit"
{
    def Mesh "M"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    }
}
`,
}
const url = 'https://working-set.example/root.usda'
async function open() {
  const fetcher: typeof fetch = async input => {
    const body = files[new URL(String(input)).pathname]
    return body === undefined ? new Response('', {status: 404}) : new Response(body)
  }
  return (await Stage.open(url, {resolverContext: createHttpResolverContext(url, undefined, fetcher), loadPayloads: false}))!
}

describe('working set', () => {
  it('reads extentsHint as the union of its non-empty purposes', () => {
    expect(extentsHintBox([[0, 0, 0], [1, 1, 1]])).toEqual({min: [0, 0, 0], max: [1, 1, 1]})
    // default, render (empty), proxy
    expect(extentsHintBox([[0, 0, 0], [1, 1, 1], [3e38, 3e38, 3e38], [-3e38, -3e38, -3e38], [-2, 0, 0], [0, 4, 1]]))
      .toEqual({min: [-2, 0, 0], max: [1, 4, 1]})
    expect(extentsHintBox(undefined)).toBeUndefined()
    expect(extentsHintBox([[1, 1, 1], [0, 0, 0]])).toBeUndefined()
  })

  it('transforms a box to world space (row vectors, translation in the last row)', () => {
    const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]
    expect(worldBox({min: [0, 0, 0], max: [1, 2, 3]}, translate)).toEqual({min: [10, 20, 30], max: [11, 22, 33]})
    const rotateY90 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]   // x -> -z, z -> x
    expect(worldBox({min: [0, 0, 0], max: [1, 1, 2]}, rotateY90)).toEqual({min: [0, 0, -1], max: [2, 1, 0]})
  })

  it('widens frame runs and merges those that touch', () => {
    expect(frameWindows([], 4, 2)).toEqual([])
    expect(frameWindows([10, 12, 14], 4, 2)).toEqual([[6, 16]])
    expect(frameWindows([10, 20], 4, 2)).toEqual([[6, 12], [16, 22]])
    expect(frameWindows([10, 15], 4, 2)).toEqual([[6, 17]])
  })

  it('derives windows from the camera path and extentsHint', async () => {
    const stage = await open()
    try {
      const schedule = deriveWorkingSet(stage, '/World/cam', 1, 301)!
      expect([...schedule.carriers.keys()].sort()).toEqual(['/World/Ahead', '/World/Behind', '/World/NoHint', '/World/Start'])
      const {ahead, keep} = defaultWorkingSetOptions
      // Start: wanted from the first frame (within `near`), loaded `ahead` frames before it.
      expect(schedule.windows!.get('/World/Start')![0]![0]).toBe(1 - ahead)
      // Ahead: wanted only while the camera passes it, loaded before it comes into view.
      const [first, last] = schedule.windows!.get("/World/Ahead")![0]!
      expect(first).toBeGreaterThan(1)
      expect(first).toBeLessThan(201 - ahead)
      expect(last).toBeGreaterThan(201)
      expect(last).toBeLessThan(301 + keep)
      // Behind: never wanted, never loaded.
      expect(schedule.windows!.get('/World/Behind')).toEqual([])
      expect(scheduledCarriers(schedule, 150).has('/World/Behind')).toBe(false)
      // NoHint: no extentsHint, so wanted at every frame.
      expect(schedule.windows!.get('/World/NoHint')).toEqual([[1 - ahead, 301 + keep]])
      expect(schedule.lead).toBe(ahead)
      // A working set's carrier is the payload prim itself.
      expect(carrierLoaded(stage, '/World/Start')).toBe(false)
      await stage.loadAndUnload(['/World/Start'], [])
      expect(carrierLoaded(stage, '/World/Start')).toBe(true)
    } finally { stage.dispose() }
  })

  it('derives nothing without a scene camera or any extentsHint', async () => {
    const stage = await open()
    try {
      expect(deriveWorkingSet(stage, '/World/Missing', 1, 301)).toBeUndefined()
      expect(deriveWorkingSet(stage, '/World/Start', 1, 301)).toBeUndefined()   // not a camera
    } finally { stage.dispose() }
  })

  it('loads within the per-change budget, soonest first, and what is needed now at once', async () => {
    // Lead 10: a carrier is needed on screen 10 frames after its window opens.
    const schedule: LoadSchedule = {
      carriers: new Map([['/A', [0, 100]], ['/B', [5, 100]], ['/C', [8, 100]], ['/D', [-20, 100]]]),
      windows: new Map([['/A', [[0, 100]]], ['/B', [[5, 100]]], ['/C', [[8, 100]]], ['/D', [[-20, 100]]]]),
      perChange: 1, lead: 10,
    }
    const loaded = new Set<string>(), applied: LoadScheduleChange[] = []
    const scheduler = new LoadScheduler(schedule, path => loaded.has(path), async change => {
      applied.push(change)
      for (const path of change.load) loaded.add(path)
    })
    // Frame 8: D's window opened 28 frames ago (needed now: outside the budget);
    // A, B and C are in their lead-in: one per frame, the soonest first.
    expect(scheduler.change(8)).toEqual({load: ['/D', '/A'], unload: []})
    await scheduler.update(8)
    await scheduler.update(9)
    await scheduler.update(10)
    expect(applied).toEqual([{load: ['/D', '/A'], unload: []}, {load: ['/B'], unload: []}, {load: ['/C'], unload: []}])
    expect(scheduler.change(11)).toBeUndefined()
  })

  it('is on unless ?workingSet=0', () => {
    expect(parseStartupOptions('').options.workingSet).toBeUndefined()
    expect(parseStartupOptions('?workingSet=0').options.workingSet).toBe(false)
    expect(parseStartupOptions('?workingSet=1').options.workingSet).toBe(true)
    expect(parseStartupOptions('?workingSet=x').warnings).toHaveLength(1)
  })
})
