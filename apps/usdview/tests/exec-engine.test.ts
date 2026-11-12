// Ported from OpenUSD 26.11.1: pxr/exec/execGeom/xformable.cpp,
//  pxr/usdImaging/usdExecImaging/geomXformablePrimAdapter.cpp
// Copyright 2025, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller test (no browser, nothing drawn): the viewer's engine
// (src/stage-view-engine.ts: UsdImagingGLEngine on HgiWebGPU) on the stub GPU
// device of the Node perf driver (scripts/viewer-perf/null-gpu.ts), with
// USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX on and the OpenExec plugins
// prepared as the runtime prepares them: before the stage opens
// (src/runtime.ts; a prim resolves its schema type when it is composed,
// stage.cpp:3513-3536). The engine's terminal scene index then publishes,
// for each controller-driven prim, ExecUsdSystem's
// computeLocalToWorldTransform (execGeom/xformable.cpp:23-57) as xform/matrix
// (usdExecImaging/geomXformablePrimAdapter.cpp:44-63).
//
// Expected values come only from the native OpenUSD 26.11.1 capture of the
// library's from-scratch spotlight rig
// (packages/usd/pxr/exec/execIr/tests/fixtures/spotlightRig, recorded from
// ExecUsdSystem's values by the capture tooling kept outside this
// repository; FIXTURES.md).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Frustum as GfFrustum, Vec3d as GfVec3d, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { XformSchema as HdXformSchema, type SceneIndexBase as HdSceneIndexBase } from 'typescript-usd/hd'
import { installGpuGlobals, createNullDevice } from '../scripts/viewer-perf/null-gpu'
import { StageViewEngine, prepareStorm, createHgi } from '../src/stage-view-engine'
import { defaultDisplaySettings } from '../src/display-settings'
import { applyEnvParameters, execSceneIndexSetting, prepareExecSceneIndex } from '../src/exec-scene-index'

const fixtureDir = new URL('../../../packages/usd/pxr/exec/execIr/tests/fixtures/spotlightRig/', import.meta.url)
interface Frame { frame: number, localToWorld: Record<string, number[]> }
const expected = (JSON.parse(readFileSync(new URL('expected.json', fixtureDir), 'utf8')) as
  { payload: { stage: string, request: { localToWorld: string[] }, frames: Frame[] } }).payload

afterEach(() => { delete process.env[execSceneIndexSetting] })

it('publishes native computeLocalToWorldTransform for controller-driven prims at frames 1, 12, 24, 36, 48', async () => {
  applyEnvParameters({ [execSceneIndexSetting]: '1' })
  installGpuGlobals()
  await prepareStorm()
  await prepareExecSceneIndex()
  const stage = (await Stage.open(fileURLToPath(new URL(expected.stage, fixtureDir))))!
  const settings = defaultDisplaySettings()
  const engine = new StageViewEngine(createHgi(createNullDevice().device), stage, 1, settings, 64, 64)
  engine.applySettings(settings, false)
  const frustum = new GfFrustum()
  frustum.setPosition(new GfVec3d(0, 2, 10))
  const camera = { view: frustum.computeViewMatrix(), projection: frustum.computeProjectionMatrix(), eye: [0, 2, 10] as const, scenePath: null }
  // The terminal scene index is UsdImagingGLEngine's own (engine.cpp:2774-2777);
  // StageViewEngine does not expose it.
  const terminal = () => (engine as unknown as { _engine: { _getTerminalSceneIndex(): HdSceneIndexBase } })._engine._getTerminalSceneIndex()
  try {
    for (const frame of [1, 12, 24, 36, 48]) {
      engine.SetTime(frame)
      engine.Render(camera, 64, 64)
      const row = expected.frames.find(f => f.frame === frame)!
      for (const path of expected.request.localToWorld) {
        const matrix = HdXformSchema.getFromParent(terminal().getPrim(path).dataSource).getMatrix()?.getTypedValue(0) as GfMatrix4d | undefined
        expect(matrix, `${path} @${frame}`).toBeDefined()
        const actual = [...matrix!.GetArray()], native = row.localToWorld[path]!
        for (let i = 0; i < 16; i++) {
          expect(Math.abs(actual[i]! - native[i]!), `${path}[${i}] @${frame}: ${actual[i]} vs ${native[i]}`).toBeLessThanOrEqual(1e-12)
        }
      }
    }
  } finally { engine.destroy() }
}, 60_000)
