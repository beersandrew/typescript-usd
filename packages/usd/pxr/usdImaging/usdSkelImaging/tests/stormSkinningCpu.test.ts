// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompGpuComputation.cpp,
//  pxr/imaging/hdSt/mesh.cpp,
//  pxr/usdImaging/usdSkelImaging/extComputations.cpp
// Copyright 2016, 2017, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller test (Node, no GPU): the arm scene through Storm with
// USDSKELIMAGING_FORCE_CPU_COMPUTE=1, so the skinning computation has no GPU
// kernel (pxr/usdImaging/usdSkelImaging/extComputations.cpp:539-580) and
// HdSt_GetExtComputationPrimvarsComputations
// (pxr/imaging/hdSt/extCompGpuComputation.cpp:451-482) schedules an
// HdStExtCompCpuComputation whose HdStExtCompPrimvarBufferSource fills the
// points of /Model/Arm. The points committed to the vertex buffer must be
// the reference build's UsdSkel-skinned points (fixtures/arm, FIXTURES.md),
// both on the first sync and after SetTime (the points fastpath of
// pxr/imaging/hdSt/mesh.cpp:1575-1650).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { StormArmScene } from './stormSkinningHarness.ts'

const ENV = 'USDSKELIMAGING_FORCE_CPU_COMPUTE'
let saved: string | undefined

const reference = JSON.parse(readFileSync(
  new URL('fixtures/arm/armSkinnedPoints.json', import.meta.url), 'utf8')).payload as {
  pointsTolerance: number, samples: Record<string, number[][]>
}

function _Diffs(actual: number[][], time: number): string[] {
  const expected = reference.samples[String(time)]!
  const diffs: string[] = []
  if (actual.length !== expected.length) return [`${actual.length} points, expected ${expected.length}`]
  for (let i = 0; i < expected.length; ++i) {
    for (let c = 0; c < 3; ++c) {
      if (!(Math.abs(actual[i]![c]! - expected[i]![c]!) <= reference.pointsTolerance)) {
        diffs.push(`point ${i}: ${actual[i]} vs ${expected[i]}`)
        break
      }
    }
  }
  return diffs
}

describe('arm.usda skinned by Storm on the CPU (HdStExtCompCpuComputation)', () => {
  beforeAll(() => { saved = process.env[ENV]; process.env[ENV] = '1' })
  afterAll(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved })

  it('commits the reference skinned points at times 1, 7 and 10', async () => {
    const arm = await StormArmScene()
    const mark = new TfErrorMark()
    for (const time of [7, 1, 10]) {
      arm.syncAt(time)
      expect(_Diffs(arm.armPoints(), time), `time ${time}`).toEqual([])
    }
    // No GPU ext computation was dispatched (extCompGpuComputation.cpp:265
    // labels its work 'ExtComputation'; the smooth normals computation of
    // the mesh runs on the GPU in both paths).
    expect(arm.hgi.calls.filter(c => c.call === 'compute.PushDebugGroup' &&
      c.args[0] === 'ExtComputation')).toEqual([])
    expect(mark.isClean()).toBe(true)
  })
})
