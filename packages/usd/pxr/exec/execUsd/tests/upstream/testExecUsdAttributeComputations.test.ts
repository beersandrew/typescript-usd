// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdAttributeComputations.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdAttributeComputations.cpp
//
// The codeless test schemas are registered from the upstream testenv
// resources (fixtures/testExecUsdAttributeComputations/resources), as main()
// does with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous
// here (testHelpers.ts _OpenStage). Template value types are TfType
// arguments (VtValueTypes.string for std::string). ASSERT_EQ is expect; the
// destructors of the request and the system at the end of each scope are
// their Destroy() calls.

import { describe, expect, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator } from 'typescript-usd/vdf'
import {
  Computation, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations, Prim, Relationship,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  computeConstant: 'computeConstant',
  computePrimComputation: 'computePrimComputation',
  computeStringValue: 'computeStringValue',
  computeSiblingAttrComputation: 'computeSiblingAttrComputation',
  computeSiblingAttrValue: 'computeSiblingAttrValue',
  computeViaRelTargets: 'computeViaRelTargets',
  consumesDispatchedComputation: 'consumesDispatchedComputation',
  dispatchedComputation: 'dispatchedComputation',
  dispatchingRel: 'dispatchingRel',
  otherAttr: 'otherAttr',
  rel: 'rel',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdAttributeComputationsCustomSchema', (self) => {
    // An attribute computation that returns a constant string.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeConstant)
      .Callback(T.string, (_ctx: VdfContext) => {
        return 'attribute computation result'
      })

    // An attribute computation with the same name and result type, registered
    // on a different attribute.
    self.attributeComputation(
      _tokens.otherAttr,
      _tokens.computeConstant)
      .Callback(T.string, (_ctx: VdfContext): string => {
        return 'sibling attribute computation result'
      })

    // A prim computation with the same name and result type.
    self.primComputation(
      _tokens.computeConstant)
      .Callback(T.string, (_ctx: VdfContext): string => {
        return 'prim computation result'
      })

    // An attribute computation that computes the value of the owning
    // attribute, which must be string-valued.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeStringValue)
      .Callback(T.string, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<string>(
            T.string, ExecBuiltinComputations.computeValue)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Computation(T.string, ExecBuiltinComputations.computeValue),
      )

    // An attribute computation that computes the value of the prim
    // computation.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computePrimComputation)
      .Callback(T.string, (ctx: VdfContext): string => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, _tokens.computeConstant)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Prim().Computation(T.string, _tokens.computeConstant),
      )

    // An attribute computation that computes the value of a string-valued
    // sibling attribute.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeSiblingAttrValue)
      .Callback(T.string, (ctx: VdfContext): string => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, _tokens.otherAttr)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Prim().AttributeValue(T.string, _tokens.otherAttr),
      )

    // An attribute computation that requests the 'computeConstant'
    // computation on the sibling attribute 'otherAttr'.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeSiblingAttrComputation)
      .Callback(T.string, (ctx: VdfContext): string => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, _tokens.computeConstant)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Prim().Attribute(_tokens.otherAttr)
          .Computation(T.string, _tokens.computeConstant),
      )

    // An attribute computation that requests the 'computeConstant'
    // computation on all objects targeted by the relationship 'rel'.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeViaRelTargets)
      .Callback(T.string, (ctx: VdfContext): string => {
        let result = ''
        for (const it = new VdfReadIterator<string>(T.string, ctx, _tokens.computeConstant);
          !it.isAtEnd(); it.increment()) {
          if (result.length !== 0) {
            result += ' '
          }
          result += "'" + it.deref() + "'"
        }
        return result.length === 0 ? '(no value)' : result
      })
      .inputs(
        Prim().Relationship(_tokens.rel)
          .targetedObjects(T.string, _tokens.computeConstant),
      )
  })

// Test dispatched attribute computations.

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdAttributeComputationsDispatchingSchema', (self) => {
    self.dispatchedAttributeComputation(
      _tokens.dispatchedComputation)
      .Callback(T.string, (_ctx: VdfContext): string => {
        return 'dispatched attribute computation result'
      })

    // Register a prim computation that requests the above dispatched
    // computation via a relationship.
    self.primComputation(_tokens.consumesDispatchedComputation)
      .Callback(T.string, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<string>(
            T.string, _tokens.dispatchedComputation)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Relationship(_tokens.dispatchingRel)
          .targetedObjects(T.string, _tokens.dispatchedComputation)
          .fallsBackToDispatched(),
      )
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdAttributeComputations')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdAttributeComputations')
}

describe('testExecUsdAttributeComputations', () => {
  it('TestAttributeComputations', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
            string attr = "my attribute value"
            string otherAttr = "sibling attribute value"
            rel rel = [</Prim.attr>, </Prim.otherAttr>, </Prim>]
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const attr = usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr.isValid())

    const valueKeys = [
      new ExecUsdValueKey(attr, _tokens.computeConstant),
      new ExecUsdValueKey(attr, _tokens.computeStringValue),
      new ExecUsdValueKey(attr, _tokens.computePrimComputation),
      new ExecUsdValueKey(attr, _tokens.computeSiblingAttrValue),
      new ExecUsdValueKey(attr, _tokens.computeSiblingAttrComputation),
      new ExecUsdValueKey(attr, _tokens.computeViaRelTargets),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)
      let index = 0

      let v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('attribute computation result')

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('my attribute value')

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('prim computation result')

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('sibling attribute value')

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('sibling attribute computation result')

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(
        "'attribute computation result' " +
        "'sibling attribute computation result' " +
        "'prim computation result'")
    }

    request.destroy()
    execSystem.destroy()
  })

  it('TestDispatchedAttributeComputations', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "DispatchingPrim" (apiSchemas = ["DispatchingSchema"]) {
            add rel dispatchingRel = </DispatchedOnPrim.attr>
        }
        def Scope "DispatchedOnPrim" {
            string attr
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const dispatchingPrim = usdStage.getPrim('/DispatchingPrim')!
    TF_AXIOM(dispatchingPrim.isValid())

    const valueKeys = [
      new ExecUsdValueKey(dispatchingPrim,
        'consumesDispatchedComputation'),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)

      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(
        'dispatched attribute computation result')
    }

    request.destroy()
    execSystem.destroy()
  })
})
