// Portions ported from OpenUSD 26.11.1, including: pxr/imaging/hd/engine.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Test helper: arm.usda (fixtures/arm, the scene of testUsdImagingGLUsdSkel)
// through UsdImagingCreateSceneIndices (with the usdSkelImaging plugin) ->
// HdRenderIndex::InsertSceneIndex -> HdSceneIndexAdapterSceneDelegate ->
// HdStRenderDelegate on the recording, GPU-less test Hgi of the hdSt tests
// (its buffers live in CPU memory), syncing the rprims with the smoothHull
// repr and committing resources as HdEngine::Execute does after sync
// (HdStRenderDelegate::CommitResources -> HdStResourceRegistry::Commit).
import {
  RenderIndex as HdRenderIndex, ReprTokens as HdReprTokens,
} from 'typescript-usd/hd'
import { HgiTokens } from 'typescript-usd/hgi'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices, type UsdImagingSceneIndices } from 'typescript-usd/usdImaging'
import 'typescript-usd/usdSkelImaging'
import type { HdStBufferArrayRange } from '../../../imaging/hdSt/src/bufferArrayRange.ts'
import type { HdStDrawItem } from '../../../imaging/hdSt/src/drawItem.ts'
import { HdStRenderDelegate } from '../../../imaging/hdSt/src/renderDelegate.ts'
import { HdSt_RegisterShaderResources } from '../../../imaging/hdSt/src/shaderResources.ts'
import type { BufferTestBuffer } from '../../../imaging/hdSt/tests/bufferTestHgi.ts'
import { Hdx_RegisterShaderResources } from '../../../imaging/hdx/src/shaderResources.ts'
import { PipelineDrawBatchTestHgi } from '../../../imaging/hdSt/tests/pipelineDrawBatchTestHgi.ts'

export const armUsda = new URL('fixtures/arm/arm.usda', import.meta.url).pathname

export interface StormArm {
  hgi: PipelineDrawBatchTestHgi
  renderIndex: HdRenderIndex
  sceneIndices: UsdImagingSceneIndices
  /** SetTime on the stage scene index, then sync and commit. */
  syncAt(time: number): void
  /** The points the vertex primvar buffer of the arm (/Model/Arm) holds. */
  armPoints(): number[][]
}

export async function StormArmScene(usda = armUsda, armPath = '/Model/Arm'): Promise<StormArm> {
  HdSt_RegisterShaderResources()
  Hdx_RegisterShaderResources()
  const hgi = new PipelineDrawBatchTestHgi()
  const renderDelegate = new HdStRenderDelegate()
  renderDelegate.setDrivers([{ name: HgiTokens.renderDriver, driver: hgi }])
  const renderIndex = HdRenderIndex.new(renderDelegate)!
  const stage = (await UsdStage.open(usda))!
  const sceneIndices = UsdImagingCreateSceneIndices({ stage })
  renderIndex.insertSceneIndex(sceneIndices.finalSceneIndex, '/')

  return {
    hgi, renderIndex, sceneIndices,
    syncAt(time: number) {
      sceneIndices.stageSceneIndex.SetTime(time)
      renderIndex.SyncAll(HdReprTokens.smoothHull)
      // hd/engine.cpp HdEngine::Execute commits after sync.
      renderDelegate.CommitResources(renderIndex.getChangeTracker())
    },
    armPoints() {
      const rprim = renderIndex.getRprim(armPath)!
      const drawItem = rprim.getDrawItems(HdReprTokens.smoothHull)[0] as HdStDrawItem
      const bar = drawItem.getVertexPrimvarRange() as unknown as HdStBufferArrayRange
      const res = bar.getResource('points')!
      const buffer = res.getHandle().Get() as unknown as BufferTestBuffer
      const stride = res.getStride()
      const base = bar.getByteOffset('points') + res.getOffset()
      const view = new DataView(buffer.bytes.buffer, buffer.bytes.byteOffset)
      const points: number[][] = []
      for (let i = 0; i < bar.getNumElements(); ++i) {
        const o = base + i * stride
        points.push([0, 1, 2].map(c => view.getFloat32(o + 4 * c, true)))
      }
      return points
    },
  }
}
