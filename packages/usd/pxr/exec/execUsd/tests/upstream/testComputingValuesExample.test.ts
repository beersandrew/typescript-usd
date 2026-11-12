// Ported from OpenUSD 26.11.1:
//  extras/exec/examples/computingValues/computingValues.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 extras/exec/examples/computingValues/computingValues.cpp
//
// The registered test testComputingValuesExample
// (extras/exec/examples/computingValues/CMakeLists.txt:16-20) runs the
// example in testenv/testComputingValuesExample, whose xformPrims.usda is
// copied verbatim to fixtures/testComputingValuesExample. It is the end-to-end
// S1 path: UsdStage -> ExecUsdSystem -> execGeom's
// computeLocalToWorldTransform (loaded through the execGeom plugin) ->
// ExecUsdCacheView. main() is the it(); UsdStage::Open is asynchronous here
// and the Exec plugins are loaded before compiling (docs/openexec-x1.md D4).
// The expected translations are the example's own TF_AXIOMs.

import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { IsClose as GfIsClose, type Matrix4d as GfMatrix4d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import { ExecGeomXformableTokens } from 'typescript-usd/execGeom'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'

const xformPrims = fileURLToPath(new URL(
  '../fixtures/testComputingValuesExample/xformPrims.usda', import.meta.url))

// computingValues.cpp:25-72
async function Example(): Promise<void> {
  // Open the layer that contains our scene on a UsdStage.
  const stage = (await UsdStage.open(xformPrims))!
  TF_AXIOM(await _interim_ExecLoadPluginsAsync())

  // Create an ExecUsdSystem, which we will use to evaluate computations on
  // the stage.
  const execSystem = new ExecUsdSystem(stage)

  // Create a vector of value keys that indicate which computed values we are
  // requesting for evaluation.
  const valueKeys = [
    new ExecUsdValueKey(stage.getPrim('/Root/A1')!,
      ExecGeomXformableTokens.computeLocalToWorldTransform),
    new ExecUsdValueKey(stage.getPrim('/Root/A2')!,
      ExecGeomXformableTokens.computeLocalToWorldTransform),
  ]

  // Build the request.
  const request = execSystem.buildRequest(valueKeys)

  // Prepare the request, ensuring the data flow graph is compiled and the
  // schedule is created.
  execSystem.prepareRequest(request)

  // Evaluate the data flow graph according to the schedule, to yield the
  // requested computed values.
  const cache = execSystem.compute(request)

  // Extract the values.
  let value = cache.Get(0)
  const a1LocalToWorld = value.Get<GfMatrix4d>()
  value = cache.Get(1)
  const a2LocalToWorld = value.Get<GfMatrix4d>()

  // The resulting matrices are the concatenation of the transforms
  // authored on A1 and Root and A2 and Root, respectively. Here, we
  // extract the translations from the resulting matrices, demonstrating
  // that we end up with the expected net translations necessary to
  // translate points in each local space into world space.
  TF_AXIOM(GfIsClose(
    a1LocalToWorld.extractTranslation(), new GfVec3d(1, 2, 0), 1e-6))
  TF_AXIOM(GfIsClose(
    a2LocalToWorld.extractTranslation(), new GfVec3d(1, 0, 3), 1e-6))

  // Scope-end destructors.
  request.destroy()
  execSystem.destroy()
}

describe('testComputingValuesExample', () => {
  // computingValues.cpp:74-79; EXPECTED_RETURN_CODE 0.
  it('main', async () => {
    await Example()
  })
})
