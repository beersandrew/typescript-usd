// The witch's robe computed by OpenExec from its recipe (W13 slice, steps 1, 2
// and 4): ask for the points, edit the profile, ask again; and change time on
// a time-sampled profile.

import { describe, expect, it } from 'vitest'
import { Vec2f as GfVec2f, type Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import { ExecUsdSystem, ExecUsdValueKey } from 'typescript-usd/execUsd'
import { writeFileSync } from 'node:fs'
import { registerStagehandPlugin } from './plugin.ts'
import { StagehandTokens, computePointsRuns, revolvePoints } from './revolve.ts'

registerStagehandPlugin()

const robe = `#usda 1.0
(
    upAxis = "Y"
    metersPerUnit = 1
)
def Xform "Heath" {
    def Mesh "Robe" (
        prepend apiSchemas = ["StagehandRevolveAPI"]
    ) {
        float2[] stagehand:revolve:profile = [(0, 0), (0.5, 0), (0.44, 0.3), (0.28, 0.95), (0.17, 1.3), (0, 1.38)]
        int stagehand:revolve:segments = 24
    }
    def Mesh "Cauldron" (
        prepend apiSchemas = ["StagehandRevolveAPI"]
    ) {
        float2[] stagehand:revolve:profile.timeSamples = {
            0: [(0, 0.05), (0.28, 0.12), (0.4, 0.35), (0.36, 0.6)],
            24: [(0, 0.05), (0.56, 0.12), (0.8, 0.35), (0.72, 0.6)],
        }
    }
}
`

async function openStage(): Promise<UsdStage> {
  const layer = SdfLayer.createAnonymous('.usda')
  expect(layer.importFromString(robe)).toBe(true)
  const stage = (await UsdStage.open(layer))!
  expect(await _interim_ExecLoadPluginsAsync()).toBe(true)
  return stage
}

const maxRadius = (pts: GfVec3f[]): number =>
  Math.max(...pts.map(p => Math.hypot(p.get(0), p.get(2))))

describe('Stagehand on OpenExec', () => {
  it('computes the robe from its recipe and recomputes after an edit', async () => {
    const stage = await openStage()
    const prim = stage.getPrim('/Heath/Robe')!
    expect(prim.hasAPI('StagehandRevolveAPI')).toBe(true)

    const system = new ExecUsdSystem(stage)
    const request = system.buildRequest([
      new ExecUsdValueKey(prim, StagehandTokens.computePoints),
      new ExecUsdValueKey(prim, StagehandTokens.computeFaceVertexCounts),
      new ExecUsdValueKey(prim, StagehandTokens.computeFaceVertexIndices),
    ])
    expect(request.isValid()).toBe(true)

    const runs0 = computePointsRuns.count
    let view = system.compute(request)
    let points = view.Get(0).Get<GfVec3f[]>()
    const before = points.map(p => [p.get(0), p.get(1), p.get(2)])
    // Asking again with nothing changed is served from OpenExec's cache.
    system.compute(request)
    expect(computePointsRuns.count - runs0).toBe(1)
    expect(points.length).toBe(6 * 24)
    expect(view.Get(1).Get<number[]>().length).toBe(5 * 24)
    expect(view.Get(2).Get<number[]>().length).toBe(5 * 24 * 4)
    expect(maxRadius(points)).toBeCloseTo(0.5, 5)

    // Edit only the recipe: a taller robe with a wide flared hem.
    prim.getAttr(StagehandTokens.profile)!.set([
      new GfVec2f(0, 0), new GfVec2f(0.7, 0), new GfVec2f(0.3, 0.4),
      new GfVec2f(0.35, 0.9), new GfVec2f(0.1, 1.6), new GfVec2f(0, 1.9)])
    view = system.compute(request)
    points = view.Get(0).Get<GfVec3f[]>()
    expect(maxRadius(points)).toBeCloseTo(0.7, 5)
    expect(Math.max(...points.map(p => p.get(1)))).toBeCloseTo(1.9, 5)
    expect(computePointsRuns.count - runs0).toBe(2)

    // For the review page: the robe as OpenExec computed it, before and after.
    if (process.env.STAGEHAND_DUMP) {
      writeFileSync(process.env.STAGEHAND_DUMP, JSON.stringify({
        before, after: points.map(p => [p.get(0), p.get(1), p.get(2)]),
        indices: view.Get(2).Get<number[]>(), segments: 24,
      }))
    }

    request.destroy(); system.destroy()
  })

  it('uses the schema fallback and follows time samples', async () => {
    const stage = await openStage()
    const prim = stage.getPrim('/Heath/Cauldron')!
    const system = new ExecUsdSystem(stage)
    const request = system.buildRequest([new ExecUsdValueKey(prim, StagehandTokens.computePoints)])

    // ExecUsdSystem starts at the default time, where a time-sampled profile
    // has no value; a viewer sets the playhead first, as here.
    system.changeTime(new UsdTimeCode(0))
    let points = system.compute(request).Get(0).Get<GfVec3f[]>()
    expect(points.length).toBe(4 * 16)   // segments fallback from generatedSchema.usda
    expect(maxRadius(points)).toBeCloseTo(0.4, 5)

    system.changeTime(new UsdTimeCode(24))
    points = system.compute(request).Get(0).Get<GfVec3f[]>()
    expect(maxRadius(points)).toBeCloseTo(0.8, 5)

    request.destroy(); system.destroy()
  })

  it('matches the baked spike', () => {
    const pts = revolvePoints([new GfVec2f(0.5, 0)], 4)
    expect(pts.map(p => [p.get(0), p.get(1), p.get(2)].map(v => Math.round(v * 1e6) / 1e6 + 0)))
      .toEqual([[0.5, 0, 0], [0, 0, -0.5], [-0.5, 0, 0], [0, 0, 0.5]])
  })
})
