// UsdSkelImagingComputeSkinningTransforms keeps the skinning transforms as
// flat row-major arrays between UsdSkelMakeTransforms, the anim mapper,
// UsdSkelConcatJointTransforms and the inverse-bind multiply (skelData.ts).
// This test checks that the result is bit for bit the one of the previous
// implementation, which converted to GfMatrix4f and back around each step
// (kept below as the reference): every call the scene index makes while
// skinning the fixture scenes at several times is recomputed with the
// reference and compared element by element (Object.is, so -0 and NaN count).
//
// MUSEUM_DIR (optional): a USD Museum checkout; its skinning and crowds
// exhibits are compared too.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Matrix4f as GfMatrix4f, type Matrix4 as GfMatrix4Tuple } from 'typescript-usd/gf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import {
  AnimMapper as UsdSkelAnimMapper, type Topology as UsdSkelTopology,
  concatJointTransforms as UsdSkelConcatJointTransforms, makeTransforms as UsdSkelMakeTransforms,
} from 'typescript-usd/usdSkel'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'
import type { Array as VtArray } from 'typescript-usd/vt'
import type { UsdSkelImagingAnimationSchema } from '../src/animationSchema.ts'
import { _UsdSkelImagingGetArray } from '../src/dataSourceUtils.ts'
import type { HdMatrix4fArrayDataSource, UsdSkelImagingSkelData } from '../src/skelData.ts'
import { DumpSkinning } from './skinningDump.ts'

type _Args = [UsdSkelImagingSkelData, HdMatrix4fArrayDataSource | undefined,
  readonly UsdSkelImagingAnimationSchema[], readonly string[], number]
const calls: { args: _Args, result: VtArray<GfMatrix4f> }[] = []

vi.mock('../src/skelData.ts', async importOriginal => {
  const m = await importOriginal<typeof import('../src/skelData.ts')>()
  return {
    ...m,
    UsdSkelImagingComputeSkinningTransforms: (...args: _Args) => {
      const result = m.UsdSkelImagingComputeSkinningTransforms(...args)
      calls.push({ args, result })
      return result
    },
  }
})
await import('typescript-usd/usdSkelImaging')

// ---- The previous implementation (skelData.ts before the flat arrays) ----

function _RefToTuple(m: GfMatrix4f): GfMatrix4Tuple {
  return [...m.GetArray()] as GfMatrix4Tuple
}
function _RefFromTuple(m: readonly number[]): GfMatrix4f {
  return new GfMatrix4f(...m)
}
function _RefMultiplyInPlace(matrices: readonly GfMatrix4f[], result: GfMatrix4f[]): boolean {
  if (matrices.length !== result.length) return false
  for (let i = 0; i < result.length; ++i) result[i] = matrices[i]!.getMultiply(result[i]!)
  return true
}
function _RefComputeJointLocalTransforms(data: UsdSkelImagingSkelData,
  animationSchema: UsdSkelImagingAnimationSchema, restTransforms: HdMatrix4fArrayDataSource | undefined,
  shutterOffset: number): GfMatrix4f[] {
  const rest = (t: number) => _UsdSkelImagingGetArray<GfMatrix4f>(restTransforms, t)
  const animMapper = new UsdSkelAnimMapper(
    _UsdSkelImagingGetArray<string>(animationSchema.getJoints()),
    _UsdSkelImagingGetArray<string>(data.skeletonSchema.getJoints()))
  if (animMapper.isNull()) return rest(shutterOffset)
  const translations = _UsdSkelImagingGetArray<{ data: readonly number[] }>(
    animationSchema.getTranslations(), shutterOffset)
  const rotations = _UsdSkelImagingGetArray<{ GetReal(): number, GetImaginary(): { data: readonly number[] } }>(
    animationSchema.getRotations(), shutterOffset)
  const scales = _UsdSkelImagingGetArray<{ data: readonly number[] }>(
    animationSchema.getScales(), shutterOffset)
  const tuples = UsdSkelMakeTransforms(
    translations.map(t => t.data),
    rotations.map(r => [r.GetReal(), ...r.GetImaginary().data]),
    scales.map(s => s.data))
  if (!tuples) return rest(shutterOffset)
  const animTransforms = tuples.map(_RefFromTuple)
  if (animTransforms.length === 0) return rest(0.0)
  if (animMapper.isIdentity()) return animTransforms
  const result = animMapper.isSparse() ? rest(shutterOffset)
    : Array.from({ length: data.topology.getNumJoints() }, () => new GfMatrix4f(1))
  try {
    return animMapper.remap(animTransforms, result, 1, new GfMatrix4f(1))
  } catch {
    return rest(shutterOffset)
  }
}
function _RefConcatJointTransforms(topology: UsdSkelTopology, localTransforms: readonly GfMatrix4f[]): GfMatrix4f[] {
  const n = topology.size
  const empty = () => Array.from({ length: n }, () => new GfMatrix4f(0))
  if (localTransforms.length !== n) return empty()
  try {
    return UsdSkelConcatJointTransforms(topology, localTransforms.map(_RefToTuple)).map(_RefFromTuple)
  } catch {
    return empty()
  }
}
function _RefComputeSkinningTransforms(...[data, restTransforms, animationSchemas, , shutterOffset]: _Args): GfMatrix4f[] {
  const numJoints = data.topology.size
  const result: GfMatrix4f[] = new Array(animationSchemas.length * numJoints)
  for (let i = 0; i < animationSchemas.length; ++i) {
    const xforms = _RefConcatJointTransforms(data.topology,
      _RefComputeJointLocalTransforms(data, animationSchemas[i]!, restTransforms, shutterOffset))
    _RefMultiplyInPlace(data.inverseBindTransforms, xforms)
    for (let j = 0; j < numJoints; ++j) result[i * numJoints + j] = xforms[j] ?? new GfMatrix4f(0)
  }
  return result
}

// ---- The comparison ----

const fixtures = new URL('.', import.meta.url).pathname
const museum = process.env.MUSEUM_DIR
const scenes: { name: string, file: string, times: number[] }[] = [
  { name: 'arm', file: path.join(fixtures, 'fixtures/arm/arm.usda'), times: [1, 4, 7, 10] },
  { name: 'dqArm', file: path.join(fixtures, 'fixtures/dqArm/dqArm.usda'), times: [1, 4, 7, 10] },
  { name: 'testUsdSkelImagingChanges', file: path.join(fixtures, 'upstream/fixtures/testUsdSkelImagingChanges/skinning.usda'), times: [0, 1, 5, 10] },
  { name: 'testUsdSkelImagingComputations', file: path.join(fixtures, 'upstream/fixtures/testUsdSkelImagingComputations/model.usda'), times: [0, 1, 5, 10] },
  ...(museum ? [
    { name: 'museum skinning', file: path.join(museum, 'animation/characters/skinning/skinning.usda'), times: [1, 37, 100, 173, 250, 344] },
    { name: 'museum crowds', file: path.join(museum, 'instancing/crowds/crowds/crowds.usda'), times: [1, 24, 60, 120, 200] },
  ] : []),
]

describe('flat skinning transforms equal the GfMatrix4f implementation bit for bit', () => {
  for (const scene of scenes) {
    it.skipIf(!existsSync(scene.file))(scene.name, async () => {
      const stage = await UsdStage.open(scene.file)
      expect(stage).toBeTruthy()
      const sis = UsdImagingCreateSceneIndices({ stage: stage! })
      let compared = 0, elements = 0
      for (const time of scene.times) {
        calls.length = 0
        sis.stageSceneIndex.SetTime(time)
        // An empty prefix: every prim (DumpSkinning matches `${prefix}/...`).
        DumpSkinning(sis.finalSceneIndex, '')
        // The data sources answer for the stage's current time: compare
        // before the next SetTime.
        for (const { args, result } of calls) {
          const expected = _RefComputeSkinningTransforms(...args)
          const actual = result.toArray()
          expect(actual.length).toBe(expected.length)
          for (let j = 0; j < expected.length; ++j) {
            const a = actual[j]!.GetArray(), e = expected[j]!.GetArray()
            for (let k = 0; k < 16; ++k) {
              if (!Object.is(a[k], e[k])) {
                expect.fail(`${scene.name} t=${time}: matrix ${j} element ${k}: ${a[k]} vs ${e[k]}`)
              }
            }
            elements += 16
          }
          ++compared
        }
      }
      expect(compared).toBeGreaterThan(0)
      expect(elements).toBeGreaterThan(0)
    })
  }
})
