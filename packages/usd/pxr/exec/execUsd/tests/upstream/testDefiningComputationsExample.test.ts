// Ported from OpenUSD 26.11.1:
//  extras/exec/examples/definingComputations/definingComputations.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 extras/exec/examples/definingComputations/definingComputations.cpp
//
// The registered test testDefiningComputationsExample
// (extras/exec/examples/definingComputations/CMakeLists.txt:16-20) runs the
// example in testenv/testDefiningComputationsExample. Its resources (the
// ParamsAPI schema's plugInfo.json, schema.usda and generatedSchema.usda) are
// copied verbatim to fixtures/testDefiningComputationsExample/resources and
// registered as main() does with PlugRegistry::RegisterPlugins
// (testHelpers.ts _RegisterTestResources). The computations are registered
// by the test program itself with EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, as
// upstream's are. main() is the it(); opening a stage is asynchronous here
// (testHelpers.ts _OpenStage) and the Exec plugins are loaded before
// compiling (docs/openexec-x1.md D4). The expected values are the example's
// own TF_AXIOMs.

import { describe, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS (definingComputations.cpp:27-32)
const _tokens = {
  computeDensity: 'computeDensity',
  computeMomentum: 'computeMomentum',
} as const

// Note: This code is slightly different from what's shown in the tutorial
// documentation because the test infrastructure doesn't allow us to generate
// code for a schema and include the generated tokens header here. Therefore,
// we construct the ParamsAPI property tokens manually below.
// (definingComputations.cpp:34-75)
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('UsdSchemaExamplesParamsAPI', (self) => {
  // Define a computation that reads the values of the attributes params:mass
  // and params:velocity and computes the momentum.
  self.primComputation(_tokens.computeMomentum)
    .Callback(T.double, (context: VdfContext) => {
      const mass =
        context.getInputValue<number>(T.double, 'params:mass')
      const velocity =
        context.getInputValue<number>(T.double, 'params:velocity')

      return mass * velocity
    })
    .inputs(
      AttributeValue(T.double, 'params:mass'),
      AttributeValue(T.double, 'params:velocity'),
    )

  // Define a computation that reads the values of the attributes params:mass
  // and params:volume and computes the density.
  self.primComputation(_tokens.computeDensity)
    .Callback(T.double, (context: VdfContext) => {
      const mass =
        context.getInputValue<number>(T.double, 'params:mass')
      const volume =
        context.getInputValue<number>(T.double, 'params:volume')

      return mass === 0.0 ? 0.0 : volume / mass
    })
    .inputs(
      AttributeValue(T.double, 'params:mass'),
      AttributeValue(T.double, 'params:volume'),
    )
})

describe('testDefiningComputationsExample', () => {
  // Test the computations registered above (definingComputations.cpp:77-129);
  // EXPECTED_RETURN_CODE 0.
  it('main', async () => {
    // Load the custom schema.
    const testPlugins = _RegisterTestResources('testDefiningComputationsExample')
    TF_AXIOM(testPlugins.length === 1)
    TF_AXIOM(testPlugins[0]!.getName() === 'definingComputations')

    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "Root" (
            apiSchemas = ["ParamsAPI"]
        )
        {
            double params:mass = 2.0
            double params:velocity = 5.0
            double params:volume = 10.0
        }
    `)
    TF_AXIOM(usdStage)
    TF_AXIOM(await _interim_ExecLoadPluginsAsync())

    const root = usdStage.getPrim('/Root')!
    TF_AXIOM(root)

    const execSystem = new ExecUsdSystem(usdStage)

    const valueKeys = [
      new ExecUsdValueKey(root, _tokens.computeMomentum),
      new ExecUsdValueKey(root, _tokens.computeDensity),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const view = execSystem.compute(request)
    let v = view.Get(0)
    const momentum = v.Get<number>()
    TF_AXIOM(momentum === 10.0)

    v = view.Get(1)
    const density = v.Get<number>()
    TF_AXIOM(density === 5.0)

    // Scope-end destructors.
    request.destroy()
    execSystem.destroy()
  })
})
