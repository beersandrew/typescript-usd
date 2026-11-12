// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdBasicCompilation.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdBasicCompilation.cpp
//
// The registered test (pxr/exec/execUsd/CMakeLists.txt:96-115) runs the
// program, normalizes testCompiler.dot with normalizeDotFiles.py and
// DIFF_COMPAREs testCompiler.out with the baseline
// (fixtures/testExecUsdBasicCompilation/baseline). Here the program runs in a
// fresh temporary directory and the normalization and comparison follow it
// in the same it() (testHelpers.ts _DiffCompare). Opening a stage is
// asynchronous here (testHelpers.ts _OpenStage). The trace report is
// written to testCompiler.spy as upstream does; nothing compares it
// (typescript-usd/trace's Reporter lacks SerializeProcessedCollections,
// which fails loudly at that call).
// Scope-end destructors are Destroy().

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'vitest'
// pxr/usd/usdGeom/xform.h: links usdGeom, which registers its schema plugin.
import 'typescript-usd/usdGeom'
import { TF_AXIOM } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { TraceCollector, TraceReporter } from 'typescript-usd/trace'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, NamespaceAncestor,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _DiffCompare, _MakeTestDirectory, _OpenStage } from '../testHelpers.ts'

const T = VtValueTypes

const layerContents =
  `#usda 1.0
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
        matrix4d xf = ( (2, 0, 0, 0), (0, 2, 0, 0), (0, 0, 2, 0), (0, 0, 0, 1) )
        def Xform "B"
        {
            matrix4d xf = ( (3, 0, 0, 0), (0, 3, 0, 0), (0, 0, 3, 0), (0, 0, 0, 1) )
        }
    }
    def Xform "A2"
    {
        matrix4d xf = ( (5, 0, 0, 0), (0, 5, 0, 0), (0, 0, 5, 0), (0, 0, 0, 1) )
    }
}
`

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  computeXf: 'computeXf',
  parentXf: 'parentXf',
  xf: 'xf',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('UsdGeomXform', (self) => {
  self.primComputation(_tokens.computeXf)
    .Callback(T.GfMatrix4d, (ctx: VdfContext) => {
      ctx.setOutput(new GfMatrix4d(1))
    })
    .inputs(
      AttributeValue(T.GfMatrix4d, _tokens.xf),
      NamespaceAncestor(T.GfMatrix4d, _tokens.computeXf)
        .inputName(_tokens.parentXf),
    )
})

describe('testExecUsdBasicCompilation', () => {
  it('TestCompiler', async () => {
    const testDirectory = _MakeTestDirectory('testExecUsdBasicCompilation')

    TraceCollector.GetInstance().setEnabled(true)

    const usdStage = await _OpenStage(layerContents)
    TF_AXIOM(usdStage)

    const execSystem = new ExecUsdSystem(usdStage)

    const valueKeys = [
      new ExecUsdValueKey(usdStage.getPrim('/Root/A1/B')!, _tokens.computeXf),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const execSystemDiagnostics = new ExecUsdSystem.Diagnostics(execSystem)
    execSystemDiagnostics.graphNetwork(join(testDirectory, 'testCompiler.dot'))

    TraceCollector.GetInstance().setEnabled(false)

    TraceReporter.getGlobalReporter().updateTraceTrees()
    // TraceReporterBase::SerializeProcessedCollections
    // (pxr/base/trace/reporterBase.h): typescript-usd/trace's Reporter does
    // not derive from TraceReporterBase, so the call fails loudly here.
    const reporter = TraceReporter.getGlobalReporter() as unknown as {
      serializeProcessedCollections?: () => string
    }
    if (typeof reporter.serializeProcessedCollections !== 'function') {
      throw new Error('TraceReporter::SerializeProcessedCollections ' +
        '(pxr/base/trace/reporterBase.h) is not available on typescript-usd/trace Reporter')
    }
    writeFileSync(join(testDirectory, 'testCompiler.spy'),
      reporter.serializeProcessedCollections())

    request.destroy()
    execSystem.destroy()

    // POST_COMMAND normalizeDotFiles.py testCompiler.dot;
    // DIFF_COMPARE testCompiler.out
    _DiffCompare('testExecUsdBasicCompilation', testDirectory, 'testCompiler')
  })
})
