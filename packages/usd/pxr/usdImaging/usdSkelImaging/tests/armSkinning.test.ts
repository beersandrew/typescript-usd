// Controller test: UsdImagingCreateSceneIndices over the arm scene of
// testUsdImagingGLUsdSkel (pxr/usdImaging/usdImagingGL/testenv/
// testUsdImagingGLUsdSkel/arm.usda, copied unchanged into fixtures/arm) with
// the usdSkelImaging scene index plugin yields skinned points for /Model/Arm
// through the skinning ext computations.
//
// Expected values:
// - fixtures/arm/armSkinnedPoints.json: the reference build's UsdSkel
//   skinned points (UsdSkelSkinningQuery::ComputeSkinnedPoints) in the mesh's
//   local space (FIXTURES.md).
// - fixtures/sceneIndex/arm.t<time>.txt: the reference build's scene index
//   chain for the same scene (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'
import 'typescript-usd/usdSkelImaging'
import { CompareDump, DumpSkinning } from './skinningDump.ts'

const armUsda = new URL('fixtures/arm/arm.usda', import.meta.url).pathname
const reference = JSON.parse(readFileSync(
  new URL('fixtures/arm/armSkinnedPoints.json', import.meta.url), 'utf8')).payload as {
  primPath: string, pointsTolerance: number, samples: Record<string, number[][]>
}

/** The skinnedPoints lines of a DumpSkinning printout. */
function _ComputedPoints(dump: string[]): number[][] {
  const i = dump.findIndex(l => l.startsWith('\tcomputed skinnedPoints '))
  if (i < 0) return []
  const n = Number(dump[i]!.split(' ').at(-1))
  return dump.slice(i + 1, i + 1 + n).map(l => l.trim().split(' ').map(Number))
}

describe('usdSkelImaging arm.usda through UsdImagingCreateSceneIndices', () => {
  for (const time of [1, 7, 10]) {
    it(`skins /Model/Arm at time ${time} as UsdSkel does`, async () => {
      const stage = await UsdStage.open(armUsda)
      expect(stage).toBeTruthy()
      const sis = UsdImagingCreateSceneIndices({ stage: stage! })
      sis.stageSceneIndex.SetTime(time)

      const dump = DumpSkinning(sis.finalSceneIndex, '/Model')
      const points = _ComputedPoints(dump)
      const expected = reference.samples[String(time)]!
      expect(points.length).toBe(expected.length)
      for (let i = 0; i < expected.length; ++i) {
        for (let c = 0; c < 3; ++c) {
          expect(Math.abs(points[i]![c]! - expected[i]![c]!),
            `point ${i}[${c}]: ${points[i]} vs ${expected[i]}`).toBeLessThanOrEqual(reference.pointsTolerance)
        }
      }
    })

    it(`matches the reference scene index chain at time ${time}`, async () => {
      const stage = await UsdStage.open(armUsda)
      const sis = UsdImagingCreateSceneIndices({ stage: stage! })
      sis.stageSceneIndex.SetTime(time)
      const captured = readFileSync(new URL(`fixtures/sceneIndex/arm.t${time}.txt`, import.meta.url), 'utf8')
      expect(CompareDump(DumpSkinning(sis.finalSceneIndex, '/Model'), captured, 1e-6)).toEqual([])
    })
  }

  it('re-skins after SetTime on an existing scene index chain', async () => {
    const stage = await UsdStage.open(armUsda)
    const sis = UsdImagingCreateSceneIndices({ stage: stage! })
    for (const time of [1, 7, 10]) {
      sis.stageSceneIndex.SetTime(time)
      const points = _ComputedPoints(DumpSkinning(sis.finalSceneIndex, '/Model'))
      const expected = reference.samples[String(time)]!
      expect(points.flat().map((x, i) => Math.abs(x - expected.flat()[i]!) <= reference.pointsTolerance))
        .toEqual(expected.flat().map(() => true))
    }
  })
})
