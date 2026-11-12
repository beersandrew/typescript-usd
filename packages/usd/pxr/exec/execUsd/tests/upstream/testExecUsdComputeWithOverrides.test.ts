// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdComputeWithOverrides.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdComputeWithOverrides.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdComputeWithOverrides/resources), as main()
// does with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous
// here (testHelpers.ts _OpenStage), and so is UsdPrim::SetActive (awaited).
// VtValue("...") is VtValue.Create(value, string) and VtValue(42) is
// VtValue.Create(42, int). Iterating a TfErrorMark is GetErrors(), its
// destructor Dispose(); `GetErrorCode() == TF_DIAGNOSTIC_CODING_ERROR_TYPE`
// is IsCodingError(). ASSERT_EQ is expect; scope-end destructors are
// Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfErrorMark } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  AttributeValue, Computation, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations,
  NamespaceAncestor, Relationship, SdfPathType,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import type { ExecUsdValueOverrideVector } from '../../src/valueOverride.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  computeViaRelationship: 'computeViaRelationship',
  computeTestValue: 'computeTestValue',
  relationship: 'relationship',
  unknownComputation: 'unknownComputation',
} as const

const _String = (s: string): VtValue => VtValue.create(s, T.string)

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdComputeWithOverridesCustomSchema', (self) => {
    // This computation recursively requests itself on the prim's namespace
    // ancestor, then appends the string value of the 'attr' attribute.
    self.primComputation(_tokens.computeTestValue)
      .inputs(
        NamespaceAncestor(T.string, _tokens.computeTestValue),
        AttributeValue(T.string, _tokens.attr))
      .Callback(T.string, (ctx: VdfContext): string => {
        const emptyString = ''
        const parentValue =
          ctx.getInputValuePtr<string>(
            T.string, _tokens.computeTestValue, emptyString)!
        const attrValue =
          ctx.getInputValuePtr<string>(T.string, _tokens.attr, emptyString)!
        return parentValue + attrValue
      })

    // This computation requests itself on a single target of the
    // 'relationship' relationship, then appends the value of the 'attr'
    // attribute, if present, or the owning prim's name. The appended strings
    // are separated by a space.
    self.primComputation(_tokens.computeViaRelationship)
      .inputs(
        Relationship(_tokens.relationship)
          .targetedObjects(T.string, _tokens.computeViaRelationship),
        AttributeValue(T.string, _tokens.attr),
        Computation(SdfPathType, ExecBuiltinComputations.computePath))
      .Callback(T.string, (ctx: VdfContext): string => {
        const attrValue =
          ctx.getInputValuePtr<string>(T.string, _tokens.attr)
        const name =
          attrValue !== null
            ? attrValue
            : ctx.getInputValue<SdfPath>(
              SdfPathType, ExecBuiltinComputations.computePath).name
        const relValue =
          ctx.getInputValuePtr<string>(
            T.string, _tokens.computeViaRelationship)
        return relValue !== null ? relValue + ' ' + name : name
      })
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdComputeWithOverrides')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdComputeWithOverrides')
}

describe('testExecUsdComputeWithOverrides', () => {
  it('TestComputeWithOverrides', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Root" {
            string attr = "(Root)"

            def CustomSchema "Child1" {
                string attr = "(Child1)"
            }

            def CustomSchema "Child2" {
                string attr = "(Child2)"
            }

            # This prim is not part of the exec request.
            def CustomSchema "Child3" {
                string attr = "(Child3)"
            }
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const root = usdStage.getPrim('/Root')!
    const rootAttr =
      usdStage.getAttributeAtPath('/Root.attr')!
    const child1 = usdStage.getPrim('/Root/Child1')!
    const child1Attr =
      usdStage.getAttributeAtPath('/Root/Child1.attr')!
    const child2 = usdStage.getPrim('/Root/Child2')!
    const child3 = usdStage.getPrim('/Root/Child3')!
    TF_AXIOM(root.isValid())
    TF_AXIOM(rootAttr.isValid())
    TF_AXIOM(child1.isValid())
    TF_AXIOM(child1Attr.isValid())
    TF_AXIOM(child2.isValid())
    TF_AXIOM(child3.isValid())

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(child1, _tokens.computeTestValue),
      new ExecUsdValueKey(child2, _tokens.computeTestValue),
    ])
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      // Compute the request without overrides.
      const view = execSystem.compute(request)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(Root)(Child1)')
      expect(v1.Get<string>()).toBe('(Root)(Child2)')
    }
    {
      // Compute the request with an override for the Root's computation
      // result.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(root, _tokens.computeTestValue),
          overrideValue: _String('(RootOverride)') },
      ]
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(RootOverride)(Child1)')
      expect(v1.Get<string>()).toBe('(RootOverride)(Child2)')
    }
    {
      // Compute the request with an override for the Root's attr value.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(rootAttr),
          overrideValue: _String('(RootAttrOverride)') },
      ]
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(RootAttrOverride)(Child1)')
      expect(v1.Get<string>()).toBe('(RootAttrOverride)(Child2)')
    }
    {
      // Compute the request with an override for Child1's attr value.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(child1Attr),
          overrideValue: _String('(Child1AttrOverride)') },
      ]
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(Root)(Child1AttrOverride)')
      expect(v1.Get<string>()).toBe('(Root)(Child2)')
    }
    {
      // Compute the request with an override for Child1's computation
      // result.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(child1, _tokens.computeTestValue),
          overrideValue: _String('(Child1Override)') },
      ]
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      // </Root/Child1> computeTestValue was overridden, so its result does
      // not have any contribution from the root prim.
      expect(v0.Get<string>()).toBe('(Child1Override)')
      expect(v1.Get<string>()).toBe('(Root)(Child2)')
    }
    {
      // Compute the request with an override for Child3's computation
      // result. Child3 is not part of the request, nor is it part of the
      // compiled network. Overriding this value should have no effect.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(child3, _tokens.computeTestValue),
          overrideValue: _String('(Child3Override)') },
      ]
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(Root)(Child1)')
      expect(v1.Get<string>()).toBe('(Root)(Child2)')
    }
    {
      // Compute the request with an override for a computation on Root that
      // is not defined. This should emit a coding error and not affect the
      // results.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(root, _tokens.unknownComputation),
          overrideValue: _String('(RootOverride)') },
      ]
      const errorMark = new TfErrorMark()
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(Root)(Child1)')
      expect(v1.Get<string>()).toBe('(Root)(Child2)')

      // Check for the expected coding error. It should be the only error.
      const errors = errorMark.getErrors()
      expect(errors.length).toBe(1)
      expect(errors[0]!.isCodingError()).toBe(true)
      expect(
        errors[0]!.getCommentary()).toBe(
        "Cannot override value for value key '/Root [unknownComputation]'" +
        ', because the computation was not defined for the provider.')
      errorMark.dispose()
    }
    {
      // Compute the request with an override for the Root's computation
      // result, but using an override value of the wrong type. This should
      // emit a coding error and not affect the results.
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(root, _tokens.computeTestValue),
          overrideValue: VtValue.create(42, T.int) },
      ]
      const errorMark = new TfErrorMark()
      const view =
        execSystem.computeWithOverrides(request, overrides)
      const v0 = view.Get(0)
      const v1 = view.Get(1)
      TF_AXIOM(v0.IsHolding(T.string))
      TF_AXIOM(v1.IsHolding(T.string))
      expect(v0.Get<string>()).toBe('(Root)(Child1)')
      expect(v1.Get<string>()).toBe('(Root)(Child2)')

      // Check for the expected coding error. It should be the only error.
      const errors = errorMark.getErrors()
      expect(errors.length).toBe(1)
      expect(errors[0]!.isCodingError()).toBe(true)
      expect(
        errors[0]!.getCommentary()).toBe(
        "Expected override of value key '/Root [computeTestValue]' " +
        "to have type 'string'; got 'int'")
      errorMark.dispose()
    }

    request.destroy()
    execSystem.destroy()
  })

  // Test that ComputeWithOverrides produces correct result when scene edits
  // have happened that require invalidation to be processed before
  // computation.
  //
  it('TestInvalidation', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "Root" {
            def CustomSchema "Child1" {
                custom rel relationship = </Root/Child2>
            }

            def CustomSchema "Child2" {
                custom rel relationship = </Root/Child3>
                string attr = "Child2.attr"
            }

            def CustomSchema "Child3" {
            }
        }
    `)

    const child1 = usdStage.getPrim('/Root/Child1')!
    const child3 = usdStage.getPrim('/Root/Child3')!
    TF_AXIOM(child1 && child3)

    const child2Attr =
      usdStage.getAttributeAtPath('/Root/Child2.attr')!
    TF_AXIOM(child2Attr)

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(child1, _tokens.computeViaRelationship),
    ])
    TF_AXIOM(request.isValid())

    // Do a Compute, causing the network to be recompiled, and populating
    // output caches with computed values.
    {
      const view = execSystem.compute(request)
      expect(view.Get(0).Get<string>()).toBe(
        'Child3 Child2.attr Child1')
    }

    // Author an attribute value that the following ComputeWithOverrides call
    // depends on.
    child2Attr.set('AuthoredValue')

    // Call ComputeWithOverrides, providing an override that doesn't mask the
    // value of the attribute we just authored, so that the results allow us
    // to confirm that invalidation due to the above authoring is processed,
    // invalidating caches from the above call to Compute.
    {
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(child3, _tokens.computeViaRelationship),
          overrideValue: _String('Child3Override') },
      ]

      const view =
        execSystem.computeWithOverrides(request, overrides)
      expect(view.Get(0).Get<string>()).toBe(
        'Child3Override AuthoredValue Child1')
    }

    request.destroy()
    execSystem.destroy()
  })

  // Test ComputeWithOverrides when uncompilation makes topological changes
  // to the network that causes structural invalidation caches to become
  // stale.
  //
  // This provides coverage for a bug that caused ComputeWithOverrides to
  // produce incorrect results in this situation.
  //
  it('TestTopologicalUpdate', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "Root" {
            def CustomSchema "Child1" {
                custom rel relationship = </Root/Child2>
            }

            def CustomSchema "Child2" {
                custom rel relationship = </Root/Child3>
            }

            def CustomSchema "Child3" {
            }
        }
    `)

    const child1 = usdStage.getPrim('/Root/Child1')!
    const child2 = usdStage.getPrim('/Root/Child2')!
    const child3 = usdStage.getPrim('/Root/Child3')!
    TF_AXIOM(child1 && child2 && child3)

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(child1, _tokens.computeViaRelationship),
    ])
    TF_AXIOM(request.isValid())

    // Do an initial ComputeWithOverrides.
    //
    // The executor used to do the evaluation will cache data that is used to
    // accelerate subsequent invalidation traversals.
    {
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(child3, _tokens.computeViaRelationship),
          overrideValue: _String('Child3Override') },
      ]

      const view =
        execSystem.computeWithOverrides(request, overrides)
      expect(view.Get(0).Get<string>()).toBe(
        'Child3Override Child2 Child1')
    }

    // Toggle 'active' on Child2 so we uncompile nodes that are visited in the
    // invalidation traversal done as part of the call to
    // ComputeWithOverrides above.
    await child2.setActive(false)
    await child2.setActive(true)

    // Do a Compute, causing the network to be recompiled, and populating
    // output caches with new computed values.
    {
      const view = execSystem.compute(request)
      expect(view.Get(0).Get<string>()).toBe(
        'Child3 Child2 Child1')
    }

    // Call ComputeWithOverrides again.
    //
    // In order to produce the correct result, this must invalidate all
    // outputs that depend on the overridden output. If the invalidation
    // caches used to perform that invalidation traversal are stale, we can
    // fail to visit all outputs, returning results from the Compute call
    // above.
    {
      const overrides: ExecUsdValueOverrideVector = [
        { valueKey: new ExecUsdValueKey(child3, _tokens.computeViaRelationship),
          overrideValue: _String('Child3Override') },
      ]

      const view =
        execSystem.computeWithOverrides(request, overrides)
      expect(view.Get(0).Get<string>()).toBe(
        'Child3Override Child2 Child1')
    }

    request.destroy()
    execSystem.destroy()
  })
})
