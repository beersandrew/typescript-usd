// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/domeLightComputations.cpp,
//  pxr/imaging/hdSt/light.cpp, pxr/imaging/hdSt/simpleLightingShader.cpp
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Storm's dome light computations during playback, through the viewer's
// engine (src/stage-view-engine.ts: UsdImagingGLEngine on HgiWebGPU) on the
// stub GPU device of the Node perf driver (scripts/viewer-perf/null-gpu.ts).
// Controller check, not GPU acceptance: nothing is drawn.
//
// Upstream queues the environment computations (cubemap, BRDF, mipmaps,
// irradiance, prefilter) only from HdStSimpleLightingShader::
// AddResourcesFromTextures (hdSt/simpleLightingShader.cpp:595-701), which
// the texture handle registry calls when the dome light's environment
// texture is (re)committed. AllocateTextureHandles keeps the handles while
// the resolved file is the same (simpleLightingShader.cpp:408-418), so a
// time change that re-syncs the light (HdStLight::Sync, hdSt/light.cpp:
// 395-470: here the time-sampled ancestor transform and visibility dirty it)
// runs none of them; a new texture file runs them again. The counts follow
// simpleLightingShader.cpp:625-690 for the fixture's 8x4 latlong image: a
// cubemap of width 8 / 4 = 2 (domeLightComputations.cpp:423-433), so
// log2(2) + 1 = 2 cubemap levels and max(2 - 1, 1) = 1 prefilter level:
// cubemap, BRDF, irradiance and one prefilter computation, plus the mipmap
// computation.
import { afterEach, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Frustum as GfFrustum, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { _DomeLightComputationGPU, _DomeLightMipmapComputationGPU, Light as HdStLight } from 'typescript-usd/hdSt'
import { installGpuGlobals, createNullDevice } from '../scripts/viewer-perf/null-gpu'
import { StageViewEngine, prepareStorm, createHgi } from '../src/stage-view-engine'
import { defaultDisplaySettings, mergeDisplaySettings } from '../src/display-settings'

const fixture = fileURLToPath(new URL('./fixtures/dome-playback/dome.usda', import.meta.url))
const macrotask = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { vi.restoreAllMocks() })

it('runs the dome light computations once per environment texture, not per time change (simpleLightingShader.cpp:408-418, 595-701)', async () => {
  installGpuGlobals()
  await prepareStorm()
  const stage = (await Stage.open(fixture))!
  const settings = mergeDisplaySettings(defaultDisplaySettings(), { sceneLightsEnabled: true, domeLightEnabled: false, showBBoxes: false })
  const engine = new StageViewEngine(createHgi(createNullDevice().device), stage, 1, settings, 64, 64)
  engine.applySettings(settings, false)
  const computations = vi.spyOn(_DomeLightComputationGPU.prototype, 'Execute')
  const mipmaps = vi.spyOn(_DomeLightMipmapComputationGPU.prototype, 'Execute')
  const lightSyncs = vi.spyOn(HdStLight.prototype, 'sync')
  const frustum = new GfFrustum()
  frustum.setPosition(new GfVec3d(0, 0, 5))
  const camera = { view: frustum.computeViewMatrix(), projection: frustum.computeProjectionMatrix(), eye: [0, 0, 5] as const, scenePath: null }
  // usdview draws again until converged (stageView.py:1543-1548): the
  // environment texture loads asynchronously.
  const settle = async () => {
    engine.Render(camera, 64, 64)
    for (let i = 0; i < 100 && !engine.isConverged(); i++) { await macrotask(); engine.Render(camera, 64, 64) }
    expect(engine.isConverged()).toBe(true)
  }
  try {
    await settle()
    expect(computations).toHaveBeenCalledTimes(4)
    expect(mipmaps).toHaveBeenCalledTimes(1)

    // Playback: every time change re-syncs the dome light, none recomputes.
    const synced = lightSyncs.mock.calls.length
    for (let t = 2; t <= 10; t++) {
      engine.SetTime(t)
      engine.Render(camera, 64, 64)
      await macrotask()
    }
    expect(lightSyncs.mock.calls.length - synced).toBeGreaterThanOrEqual(9)
    expect(engine.isConverged()).toBe(true)
    expect(computations).toHaveBeenCalledTimes(4)
    expect(mipmaps).toHaveBeenCalledTimes(1)

    // A new environment texture runs them again, once.
    stage.getPrim('/Unit/Dome')!.getAttr('inputs:texture:file')!.set(new SdfAssetPath('./sky_b.png'))
    // The browser resolver is asynchronous: authored asset paths resolve
    // before Get reads them (usd/src/stage.ts _resolvedAttributeAsset).
    await stage.flushChanges()
    await settle()
    expect(computations).toHaveBeenCalledTimes(8)
    expect(mipmaps).toHaveBeenCalledTimes(2)
  } finally {
    engine.destroy()
    stage.dispose()
  }
})
