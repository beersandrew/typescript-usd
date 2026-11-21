// Step 3 of the W13 TypeScript plan: Hydra sees the robe OpenExec computes.
// The exec stage scene index is merged in front of the stage scene index, as
// UsdImagingGLEngine does (engine.cpp:1746-1758, and this port's
// usdExecImaging tests); the robe's points and topology come from the
// Stagehand adapter, its transform still from execGeom.

import { describe, expect, it } from 'vitest'
import {
  MergingSceneIndex as HdMergingSceneIndex, MeshSchema as HdMeshSchema,
  PrimvarsSchema as HdPrimvarsSchema, TypedSampledDataSource as HdTypedSampledDataSource,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Vec2f as GfVec2f, type Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import type { Array as VtArray } from 'typescript-usd/vt'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import 'typescript-usd/execGeom'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'
import { UsdExecImaging_StageSceneIndex } from 'typescript-usd/usdExecImaging'
import { registerStagehandPlugin } from './plugin.ts'
import { StagehandTokens } from './revolve.ts'
import './imaging.ts'

registerStagehandPlugin()

const scene = `#usda 1.0
(
    upAxis = "Y"
    startTimeCode = 0
    endTimeCode = 24
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

const radius = (pts: readonly GfVec3f[]): number =>
  Math.max(...pts.map(p => Math.hypot(p.get(0), p.get(2))))

function meshOf(si: HdSceneIndexBase, path: string) {
  const ds = si.getPrim(path).dataSource
  const pts = HdPrimvarsSchema.getFromParent(ds).getPrimvar('points').getPrimvarValue()
  const topo = HdMeshSchema.getFromParent(ds).GetTopology()
  return {
    points: pts instanceof HdTypedSampledDataSource
      ? (pts.getTypedValue(0) as VtArray<GfVec3f> | undefined)?.toArray() ?? []
      : [],
    counts: (topo.getFaceVertexCounts()?.getTypedValue(0) as unknown as VtArray<number> | undefined)?.toArray() ?? [],
    indices: (topo.getFaceVertexIndices()?.getTypedValue(0) as unknown as VtArray<number> | undefined)?.toArray() ?? [],
  }
}

describe('Stagehand imaging', () => {
  it('serves computed points and topology to Hydra, and follows edits and time', async () => {
    const layer = SdfLayer.createAnonymous('.usda')
    expect(layer.importFromString(scene)).toBe(true)
    const stage = (await UsdStage.open(layer))!
    expect(await _interim_ExecLoadPluginsAsync()).toBe(true)

    const execSceneIndex = UsdExecImaging_StageSceneIndex.new()
    const stageSceneIndex = UsdImagingStageSceneIndex.new()
    const merging = HdMergingSceneIndex.new()
    merging.addInputScene(execSceneIndex, '/')
    merging.addInputScene(stageSceneIndex, '/')
    stageSceneIndex.SetStage(stage); execSceneIndex.SetStage(stage)
    stageSceneIndex.SetTime(0); execSceneIndex.SetTime(0)

    // Without exec the Mesh has no points or faces at all (only a recipe).
    const plain = meshOf(stageSceneIndex, '/Heath/Robe')
    expect(plain.points.length).toBe(0)

    // The exec scene index layers both adapters: execGeom's transform and
    // Stagehand's points and topology.
    expect(execSceneIndex.getPrim('/Heath/Robe').dataSource?.getNames().sort())
      .toEqual(['mesh', 'primvars', 'xform'])

    let robe = meshOf(merging, '/Heath/Robe')
    expect(robe.points.length).toBe(6 * 24)
    expect(robe.counts.length).toBe(5 * 24)
    expect(robe.indices.length).toBe(5 * 24 * 4)
    expect(radius(robe.points)).toBeCloseTo(0.5, 5)

    // Edit the recipe; the scene index serves the recomputed robe.
    stage.getPrim('/Heath/Robe')!.getAttr(StagehandTokens.profile)!.set([
      new GfVec2f(0, 0), new GfVec2f(0.7, 0), new GfVec2f(0.3, 0.4),
      new GfVec2f(0.35, 0.9), new GfVec2f(0.1, 1.6), new GfVec2f(0, 1.9)])
    await stage.flushChanges()
    // As UsdImagingGLEngine does each frame (engine.cpp ApplyPendingUpdates).
    stageSceneIndex.ApplyPendingUpdates(); execSceneIndex.ApplyPendingUpdates()
    robe = meshOf(merging, '/Heath/Robe')
    expect(radius(robe.points)).toBeCloseTo(0.7, 5)

    // For the review page: what Hydra receives for the cauldron at 0, 12, 24.
    if (process.env.STAGEHAND_DUMP) {
      const frames: Record<number, number[][]> = {}
      let indices: number[] = []
      for (const t of [0, 12, 24]) {
        stageSceneIndex.SetTime(t); execSceneIndex.SetTime(t)
        const m = meshOf(merging, '/Heath/Cauldron')
        frames[t] = m.points.map(p => [p.get(0), p.get(1), p.get(2)]); indices = m.indices
      }
      const r = meshOf(merging, '/Heath/Robe')
      const { writeFileSync } = await import('node:fs')
      writeFileSync(process.env.STAGEHAND_DUMP, JSON.stringify({
        frames, indices, robe: r.points.map(p => [p.get(0), p.get(1), p.get(2)]), robeIndices: r.indices }))
      stageSceneIndex.SetTime(0); execSceneIndex.SetTime(0)
    }

    // Scrub: the cauldron grows with the playhead.
    expect(radius(meshOf(merging, '/Heath/Cauldron').points)).toBeCloseTo(0.4, 5)
    stageSceneIndex.SetTime(24); execSceneIndex.SetTime(24)
    expect(radius(meshOf(merging, '/Heath/Cauldron').points)).toBeCloseTo(0.8, 5)

    execSceneIndex.SetStage(undefined); stageSceneIndex.SetStage(undefined)
  })
})
