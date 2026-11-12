// Ported from OpenUSD 26.11.1: pxr/exec/execGeom/xformable.cpp,
//  pxr/usdImaging/usdExecImaging/geomXformablePrimAdapter.cpp,
//  pxr/usdImaging/usdImagingGL/engine.cpp
// Copyright 2016, 2025, 2026 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller tests (no GPU, not a browser test) of usdExecImaging
// (pxr/usdImaging/usdExecImaging, OpenUSD 26.11.1) and of the exec hunk of
// UsdImagingGLEngine (usdImagingGL/engine.cpp:99-105, 466, 516-517, 568-569,
// 1679-1771, 2566). Upstream has no tests for usdExecImaging.
//
// Expected values come only from the native capture
// pxr/exec/execIr/tests/fixtures/spotlightRig/expected.json (its capture
// authors the stage; FIXTURES.md): ExecUsdSystem's computeLocalToWorldTransform
// (execGeom/xformable.cpp:23-57) for the controller-driven spotlight rig, which UsdExecImaging_GeomXformablePrimAdapter publishes as
// xform/matrix with xform/resetXformStack true
// (geomXformablePrimAdapter.cpp:24-63).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  MergingSceneIndex as HdMergingSceneIndex, RendererPlugin as HdRendererPlugin,
  RendererPluginRegistry as HdRendererPluginRegistry, RenderDelegate as HdRenderDelegate,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry, XformSchema as HdXformSchema,
  type Bprim as HdBprim, type RendererCreateArgsSchema as HdRendererCreateArgsSchema,
  type RenderSettingsMap as HdRenderSettingsMap, type Rprim as HdRprim, type SceneIndexBase as HdSceneIndexBase,
  type Sprim as HdSprim,
} from 'typescript-usd/hd'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import 'typescript-usd/execGeom'
import 'typescript-usd/execIr'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { UsdImagingStageSceneIndex, UsdImagingStageSceneIndexInterfaceType } from 'typescript-usd/usdImaging'
import { Engine as UsdImagingGLEngine, RenderParams as UsdImagingGLRenderParams } from 'typescript-usd/usdImagingGL'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'
import { UsdExecImaging_StageSceneIndex, UsdExecImaging_StageSceneIndexType } from '../src/index.ts'

interface SpotlightFrame {
  frame: number
  localToWorld: Record<string, number[]>
}
interface SpotlightPayload {
  stage: string
  request: { localToWorld: string[] }
  frames: SpotlightFrame[]
}

const fixtureDir = new URL('../../../exec/execIr/tests/fixtures/spotlightRig/', import.meta.url)
const expected = readOracleFixture<SpotlightPayload>(new URL('expected.json', fixtureDir))
const FRAMES = [1, 12, 24, 36, 48]
const TOLERANCE = 1e-12

function expectedFrame(frame: number): SpotlightFrame {
  const row = expected.frames.find(f => f.frame === frame)
  if (!row) throw new Error(`expected.json has no frame ${frame}`)
  return row
}

function expectXformMatchesNative(sceneIndex: HdSceneIndexBase, frame: number): void {
  const row = expectedFrame(frame)
  expect(expected.request.localToWorld.length).toBe(3)
  for (const path of expected.request.localToWorld) {
    const xform = HdXformSchema.getFromParent(sceneIndex.getPrim(path).dataSource)
    expect(xform.getResetXformStack()?.getTypedValue(0), `${path} resetXformStack @${frame}`).toBe(true)
    const matrix = xform.getMatrix()?.getTypedValue(0) as GfMatrix4d | undefined
    expect(matrix, `${path} matrix @${frame}`).toBeDefined()
    const actual = [...matrix!.GetArray()]
    const native = row.localToWorld[path]!
    expect(actual.length).toBe(16)
    for (let i = 0; i < 16; i++) {
      expect(Math.abs(actual[i]! - native[i]!), `${path}[${i}] @${frame}: ${actual[i]} vs ${native[i]}`)
        .toBeLessThanOrEqual(TOLERANCE)
    }
  }
}

async function openSpotlight(): Promise<UsdStage> {
  return (await UsdStage.open(new URL(expected.stage, fixtureDir).pathname))!
}

beforeAll(async () => {
  // Exec plugins must be loaded before compiling (docs/openexec-x1.md D4).
  expect(await _interim_ExecLoadPluginsAsync()).toBe(true)
})

describe('UsdExecImaging_StageSceneIndex', () => {
  it('is manufactured through its TfType factory (stageSceneIndex.cpp:13-26, plugInfo.json)', () => {
    const type = UsdImagingStageSceneIndexInterfaceType.findDerivedByName('UsdExecImaging_StageSceneIndex')
    expect(type).toBe(UsdExecImaging_StageSceneIndexType)
    const factory = type.getFactory<{ 'new'(): unknown }>()
    expect(factory?.new()).toBeInstanceOf(UsdExecImaging_StageSceneIndex)
  })

  it('overrides the stage scene index xforms with computeLocalToWorldTransform at frames 1, 12, 24, 36, 48', async () => {
    const stage = await openSpotlight()
    const execSceneIndex = UsdExecImaging_StageSceneIndex.new()
    const stageSceneIndex = UsdImagingStageSceneIndex.new()
    // engine.cpp:1746-1758: the exec scene index is the first input.
    const merging = HdMergingSceneIndex.new()
    merging.addInputScene(execSceneIndex, '/')
    merging.addInputScene(stageSceneIndex, '/')

    stageSceneIndex.SetStage(stage)
    execSceneIndex.SetStage(stage)

    for (const frame of FRAMES) {
      stageSceneIndex.SetTime(frame)
      execSceneIndex.SetTime(frame)
      expect(execSceneIndex.getTime().GetValue()).toBe(frame)
      expectXformMatchesNative(merging, frame)
    }
    execSceneIndex.SetStage(undefined)
    stageSceneIndex.SetStage(undefined)
  })
})

// Registration-side doubles of a renderer plugin, as in
// usdImagingGL/tests/engine.test.ts.
class _TestRenderDelegate extends HdRenderDelegate {
  constructor(_settingsMap?: HdRenderSettingsMap) { super() }
  getSupportedRprimTypes(): string[] { return [] }
  getSupportedSprimTypes(): string[] { return [] }
  getSupportedBprimTypes(): string[] { return [] }
  createRprim(): HdRprim { throw new Error('unsupported') }
  destroyRprim(): void {}
  createSprim(): HdSprim { throw new Error('unsupported') }
  destroySprim(): void {}
  createBprim(): HdBprim { throw new Error('unsupported') }
  destroyBprim(): void {}
  CommitResources(): void {}
  override requiresStormTasks(): boolean { return true }
}
class _TestRendererPlugin extends HdRendererPlugin {
  isSupported(_args: HdRendererCreateArgsSchema): boolean { return true }
  createRenderDelegate(settingsMap?: HdRenderSettingsMap): HdRenderDelegate | null {
    return new _TestRenderDelegate(settingsMap)
  }
  deleteRenderDelegate(): void {}
}

describe('UsdImagingGLEngine USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX (engine.cpp:99-105, 1679-1771)', () => {
  const ENV = 'USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX'
  let engine: UsdImagingGLEngine | null = null
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[ENV]
    HdRendererPluginRegistry._resetInstance()
    HdSceneIndexPluginRegistry._resetInstance()
    UsdImagingGLEngine._resetAppSceneIndicesRegistration()
    HdRendererPluginRegistry.define('TestPlugin', () => new _TestRendererPlugin(), { displayName: 'Test', priority: 0 })
  })
  afterEach(() => {
    engine?.destroy()
    engine = null
    if (saved === undefined) delete process.env[ENV]
    else process.env[ENV] = saved
  })

  it('has no exec scene index when the setting is off (its default)', async () => {
    delete process.env[ENV]
    engine = new UsdImagingGLEngine({ gpuEnabled: false })
    const params = new UsdImagingGLRenderParams()
    params.frame = new UsdTimeCode(24)
    engine.PrepareBatch((await openSpotlight()).getPrim('/')!, params)
    expect(engine['_execStageSceneIndex']).toBeNull()
    expect(engine['_noticeBatchingStageSceneIndex']).toBeNull()
  })

  it('merges the exec scene index above the stage scene index when the setting is on', async () => {
    process.env[ENV] = '1'
    engine = new UsdImagingGLEngine({ gpuEnabled: false })
    expect(engine['_execStageSceneIndex']).toBeInstanceOf(UsdExecImaging_StageSceneIndex)
    const stage = await openSpotlight()
    for (const frame of FRAMES) {
      const params = new UsdImagingGLRenderParams()
      params.frame = new UsdTimeCode(frame)
      // The exec request is built by the first ApplyPendingUpdates after
      // SetStage (engine.cpp:568-569, 2566; stageSceneIndex.cpp:85-92), so
      // the first frame is prepared twice.
      if (frame === FRAMES[0]) engine.PrepareBatch(stage.getPrim('/')!, params)
      engine.PrepareBatch(stage.getPrim('/')!, params)
      expectXformMatchesNative(engine._getTerminalSceneIndexForTesting()!, frame)
    }
  })
})
