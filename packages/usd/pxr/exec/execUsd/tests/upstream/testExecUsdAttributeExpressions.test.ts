// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdAttributeExpressions.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdAttributeExpressions.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdAttributeExpressions/resources), as main()
// does with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous
// here (testHelpers.ts _OpenStage). Template value types are TfType
// arguments. ASSERT_EQ is expect; scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  Computation, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  pluginExpressionAttr: 'pluginExpressionAttr',
  authoredValue: 'authoredValue',
  connectedValue: 'connectedValue',
  AppliedAPI: 'AppliedAPI',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdAttributeExpressionsCustomSchema', (self) => {
    // The expression for attr prepends the authored value of attr with
    // "pluginExpr:".
    self.attributeExpression(_tokens.pluginExpressionAttr)
      .Callback(T.string, (ctx: VdfContext) => {
        return 'pluginExpr:' + ctx.getInputValue<string>(
          T.string, ExecBuiltinComputations.computeResolvedValue)
      })
      .inputs(
        Computation(
          T.string, ExecBuiltinComputations.computeResolvedValue))
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdAttributeExpressions')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdAttributeExpressions')
}

describe('testExecUsdAttributeExpressions', () => {
  it('TestCustomSchemaAttributeExpression', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "PrimWithPluginAttrExpr" {
            string pluginExpressionAttr = "PrimWithPluginAttrExpr.pluginExpressionAttr"
        }
        def "PrimWithoutAttrExpr" {
            string attr = "PrimWithoutAttrExpr.attr"
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const attrWithPluginExpr =
      usdStage.getAttributeAtPath(
        '/PrimWithPluginAttrExpr.pluginExpressionAttr')!
    const attrWithoutExpr =
      usdStage.getAttributeAtPath('/PrimWithoutAttrExpr.attr')!
    TF_AXIOM(attrWithPluginExpr.isValid())
    TF_AXIOM(attrWithoutExpr.isValid())

    const valueKeys = [
      // Computed value of attribute with a plugin expression.
      new ExecUsdValueKey(attrWithPluginExpr, ExecBuiltinComputations.computeValue),

      // Authored value of attribute with a plugin expression.
      new ExecUsdValueKey(attrWithPluginExpr, ExecBuiltinComputations.computeResolvedValue),

      // Computed value of attribute without a registered expression.
      new ExecUsdValueKey(attrWithoutExpr, ExecBuiltinComputations.computeValue),

      // Authored value of attribute without a registered expression.
      new ExecUsdValueKey(attrWithoutExpr, ExecBuiltinComputations.computeResolvedValue),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)
      TF_AXIOM(view.Get(0).IsHolding(T.string))
      TF_AXIOM(view.Get(1).IsHolding(T.string))
      TF_AXIOM(view.Get(2).IsHolding(T.string))
      TF_AXIOM(view.Get(3).IsHolding(T.string))
      expect(
        view.Get(0).Get<string>()).toBe(
        'pluginExpr:PrimWithPluginAttrExpr.pluginExpressionAttr')
      expect(
        view.Get(1).Get<string>()).toBe(
        'PrimWithPluginAttrExpr.pluginExpressionAttr')
      expect(view.Get(2).Get<string>()).toBe('PrimWithoutAttrExpr.attr')
      expect(view.Get(3).Get<string>()).toBe('PrimWithoutAttrExpr.attr')
    }

    request.destroy()
    execSystem.destroy()
  })
})
