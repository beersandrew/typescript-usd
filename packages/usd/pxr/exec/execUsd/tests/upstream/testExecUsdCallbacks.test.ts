// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdCallbacks.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdCallbacks.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdCallbacks/resources), as main() does with
// PlugRegistry::RegisterPlugins. Opening a stage is asynchronous here
// (testHelpers.ts _OpenStage). C++ deduces a callback's result type from its
// return type; in TS every Callback names its result type (int for the
// lambda returning `1`, double for _CallbackFunction). ASSERT_EQ is expect;
// scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  convertibleReturnTypeComputation: 'convertibleReturnTypeComputation',
  functionPointerComputation: 'functionPointerComputation',
  returnTypeLambdaComputation: 'returnTypeLambdaComputation',
  voidFunctionPointerComputation: 'voidFunctionPointerComputation',
  voidLambdaComputation: 'voidLambdaComputation',
} as const

function _CallbackFunction(_ctx: VdfContext): number {
  return 3.0
}

function _CallbackFunctionVoidReturn(ctx: VdfContext): void {
  ctx.setOutput(4.0)
}

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdCallbacksCustomSchema', (self) => {
    //
    // Test different kinds of callback functions.
    //

    /// Callback: a lambda that returns the deduced result type
    self.primComputation(_tokens.returnTypeLambdaComputation)
      .Callback(T.int, (_ctx: VdfContext) => {
        return 1
      })

    // Callback: a lambda that returns void
    self.primComputation(
      _tokens.voidLambdaComputation)
      .Callback(T.float, (ctx: VdfContext) => {
        ctx.setOutput(2.0)
      })

    // Callback: a pointer to a function where the return type is the
    // deduced computation result type
    self.primComputation(
      _tokens.functionPointerComputation)
      .Callback(T.double, _CallbackFunction)

    // Callback: a pointer to a function that returns void
    self.primComputation(
      _tokens.voidFunctionPointerComputation)
      .Callback(T.double, _CallbackFunctionVoidReturn)

    // Callback: a lambda that returns a type that is convertible to the
    // computation result type
    self.primComputation(
      _tokens.convertibleReturnTypeComputation)
      .Callback(T.string, (_ctx: VdfContext) => {
        return 'string result value'
      })
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdCallbacks')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdCallbacks')
}

describe('testExecUsdCallbacks', () => {
  // Test different kinds of callback functions to make sure they compile
  // correctly and produce the expected values.
  //
  it('TestCallbackFunctions', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" (
            doc = "prim documentation"
        ) {
            int attr (doc = "attribute documentation")
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())
    const attr = usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr.isValid())

    const valueKeys = [
      new ExecUsdValueKey(prim, _tokens.returnTypeLambdaComputation),
      new ExecUsdValueKey(prim, _tokens.voidLambdaComputation),
      new ExecUsdValueKey(prim, _tokens.functionPointerComputation),
      new ExecUsdValueKey(prim, _tokens.voidFunctionPointerComputation),
      new ExecUsdValueKey(prim, _tokens.convertibleReturnTypeComputation),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)
      let index = 0

      let v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(1)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.float))
      expect(v.Get<number>()).toBe(2.0)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.double))
      expect(v.Get<number>()).toBe(3.0)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.double))
      expect(v.Get<number>()).toBe(4.0)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('string result value')
    }

    request.destroy()
    execSystem.destroy()
  })
})
