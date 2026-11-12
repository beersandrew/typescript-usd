// Ported from OpenUSD 26.11.1:
//  pxr/exec/execGeom/testenv/testExecGeomXformable.cpp,
//  pxr/exec/execGeom/testenv/testExecGeomXformable/normalizeDotFiles.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execGeom/testenv/testExecGeomXformable.cpp
//
// Adaptations:
// - Upstream deliberately does not link execGeom, so that the test relies on
//   plugin loading (testExecGeomXformable.cpp:72-74). Here the test imports
//   typescript-usd/execGeom only for its plugin registration (the analog of
//   plugin discovery on the plugin path); xformable.ts, the plugin library
//   that registers the computations, is loaded by exec through the plugin.
//   Library plugins load asynchronously on the web, so the test awaits
//   _interim_ExecLoadPluginsAsync() before compiling (docs/openexec-x1.md
//   decision D4).
// - TraceCollector enabling and the trace report file (lines 63, 96-101) are
//   dropped: they only write the testCompiler.spy debugging artifact.
// - The registered test (pxr/exec/execGeom/CMakeLists.txt:52-58) normalizes
//   the testCompiler.dot that GraphNetwork writes (lines 86-87) with
//   normalizeDotFiles.py and DIFF_COMPAREs testCompiler.out with the
//   baseline (copied verbatim to fixtures/testExecGeomXformable/baseline).
//   Here the program runs in a fresh temporary directory and the comparison
//   follows it in the same it(); the script is execUsd's testHelpers.ts
//   _NormalizeDotFile (the same script, byte for byte).

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { IsClose as GfIsClose, Matrix4d as GfMatrix4d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import { ExecUsdSystem, ExecUsdValueKey } from 'typescript-usd/execUsd'
import 'typescript-usd/execGeom'
import { _NormalizeDotFile } from '../../../execUsd/tests/testHelpers.ts'

const layerContents = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 0.01
    upAxis = "Z"
)
def Xform "Root" (
    kind = "component"
)
{
    def Xform "A1"
    {
        uniform token[] xformOpOrder = [ "xformOp:transform" ]
        matrix4d xformOp:transform = ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (2, 0, 0, 1) )
        def Xform "B"
        {
            uniform token[] xformOpOrder = [ "xformOp:transform" ]
            matrix4d xformOp:transform = ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (3, 0, 0, 1) )
        }
    }
    def Xform "A2"
    {
        uniform token[] xformOpOrder = [ "xformOp:transform" ]
        matrix4d xformOp:transform = ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (5, 0, 0, 1) )
    }
}
`

describe('testExecGeomXformable', () => {
  it('TestExecGeomXformable', async () => {
    const testDirectory = mkdtempSync(join(tmpdir(), 'testExecGeomXformable-'))

    expect(await _interim_ExecLoadPluginsAsync()).toBe(true)

    const layer = SdfLayer.createAnonymous('.usda')
    layer.importFromString(layerContents)
    const usdStage = await UsdStage.open(layer)
    TF_AXIOM(usdStage)

    const execSystem = new ExecUsdSystem(usdStage)

    // Note that we deliberately avoid using the token defined in
    // execGeom/tokens.h, and more importantly, linking with execGeom, so that
    // this test relies on plugin loading.
    const valueKeys = [
      new ExecUsdValueKey(usdStage.getPrim('/Root/A1/B')!,
        'computeLocalToWorldTransform'),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const execSystemDiagnostics = new ExecUsdSystem.Diagnostics(execSystem)
    execSystemDiagnostics.graphNetwork(join(testDirectory, 'testCompiler.dot'))

    const cache = execSystem.compute(request)

    const value = cache.Get(0)
    TF_AXIOM(!value.IsEmpty())
    const matrix = value.Get<GfMatrix4d>()
    TF_AXIOM(GfIsClose(matrix.extractTranslation(), new GfVec3d(5, 0, 0), 1e-6))

    // POST_COMMAND normalizeDotFiles.py testCompiler.dot;
    // DIFF_COMPARE testCompiler.out
    const normalized = _NormalizeDotFile(
      readFileSync(join(testDirectory, 'testCompiler.dot'), 'utf8'))
    const baseline = readFileSync(new URL(
      '../fixtures/testExecGeomXformable/baseline/testCompiler.out', import.meta.url), 'utf8')
    expect(normalized, 'DIFF_COMPARE testCompiler.out').toBe(baseline)
  })
})
