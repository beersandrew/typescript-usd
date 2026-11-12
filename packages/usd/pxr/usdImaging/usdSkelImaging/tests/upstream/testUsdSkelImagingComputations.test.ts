// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/testenv/testUsdSkelImagingComputations.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedPointsBasedPrim.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdSkelImaging/testenv/
// testUsdSkelImagingComputations.cpp (OpenUSD 26.11.1), registered in
// pxr/usdImaging/usdSkelImaging/CMakeLists.txt:107-114 with
// USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS=1. model.usda is copied unchanged
// into fixtures/testUsdSkelImagingComputations.
//
// The upstream test inspects the HdExtComputation sprims and ext computation
// primvar descriptors UsdImagingDelegate's skeleton adapter creates. This
// port inspects the scene index chain (UsdImagingCreateSceneIndices with the
// usdSkelImaging plugin), the only imaging path of this port, against the
// reference build's output for the same chain, captured into
// ../fixtures/sceneIndex/model.txt (FIXTURES.md): every prim under /Root
// with its ext computation primvars, and every ext computation with its
// inputs, outputs, element count, kernel, callback and the outputs its CPU
// callback computes. On the scene index chain no normals computations are
// created for model.usda: its meshes have the default catmullClark
// subdivision scheme (dataSourceResolvedPointsBasedPrim.cpp:1108-1139),
// whereas UsdImagingDelegate's adapter creates them regardless.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'
import 'typescript-usd/usdSkelImaging'
import { CompareDump, DumpSkinning } from '../skinningDump.ts'

const ENV = 'USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS'
let saved: string | undefined

describe('testUsdSkelImagingComputations', () => {
  beforeAll(() => { saved = process.env[ENV]; process.env[ENV] = '1' })
  afterAll(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved })

  /** testUsdSkelImagingComputations.cpp:206-345 TestSkinningComputations */
  it('TestSkinningComputations', async () => {
    const stage = await UsdStage.open(new URL(
      'fixtures/testUsdSkelImagingComputations/model.usda', import.meta.url).pathname)
    expect(stage).toBeTruthy()
    const sis = UsdImagingCreateSceneIndices({ stage: stage! })
    sis.stageSceneIndex.SetTime(0)

    const captured = readFileSync(new URL('../fixtures/sceneIndex/model.txt', import.meta.url), 'utf8')
    expect(CompareDump(DumpSkinning(sis.finalSceneIndex, '/Root'), captured, 1e-6)).toEqual([])
  })
})
