// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdDispatchedComputations.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdDispatchedComputations.cpp
//
// The codeless test schemas are registered from the upstream testenv
// resources (fixtures/testExecUsdDispatchedComputations/resources), as main()
// does with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous
// here (testHelpers.ts _OpenStage). Template value types are TfType
// arguments. ASSERT_EQ is expect; scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, NamespaceAncestor, Relationship,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  consumesDispatchedComputation: 'consumesDispatchedComputation',
  consumesDispatchedComputationOnAncestor: 'consumesDispatchedComputationOnAncestor',
  consumesRecursiveDispatchedComputationOnAncestor:
    'consumesRecursiveDispatchedComputationOnAncestor',
  recursiveDispatchedComputationOnAncestor: 'recursiveDispatchedComputationOnAncestor',
  dispatchedComputation: 'dispatchedComputation',
  dispatchingRel: 'dispatchingRel',
  myAttr: 'myAttr',
  nonDispatchedInput: 'nonDispatchedInput',
  nonDispatchingRel: 'nonDispatchingRel',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdDispatchedComputationsDispatchingSchema1', (self) => {
    self.dispatchedPrimComputation(
      _tokens.dispatchedComputation)
      .Callback(T.int, (_ctx: VdfContext) => { return 42 })

    // Register a prim computation that requests the above dispatched
    // computation via a relationship.
    self.primComputation(_tokens.consumesDispatchedComputation)
      .Callback(T.int, (ctx: VdfContext) => {
        let result = 0
        for (const it = new VdfReadIterator<number>(T.int, ctx, _tokens.dispatchedComputation);
          !it.isAtEnd(); it.increment()) {
          result += it.deref()
        }
        for (const it = new VdfReadIterator<number>(T.int, ctx, _tokens.nonDispatchedInput);
          !it.isAtEnd(); it.increment()) {
          result += it.deref()
        }
        return result
      })
      .inputs(

        // This input can find the dispatched computation.
        Relationship(_tokens.dispatchingRel)
          .targetedObjects(T.int, _tokens.dispatchedComputation)
          .fallsBackToDispatched(),

        // This input *can't* find the dispatched computation because it
        // doesn't request it.
        Relationship(_tokens.nonDispatchingRel)
          .targetedObjects(T.int, _tokens.dispatchedComputation)
          .inputName(_tokens.nonDispatchedInput),
      )

    // Register a prim computation that requests the above dispatched
    // computation on a namespace ancestor.
    self.primComputation(_tokens.consumesDispatchedComputationOnAncestor)
      .Callback(T.int, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<number>(T.int, _tokens.dispatchedComputation)
        return valuePtr !== null ? valuePtr : -1
      })
      .inputs(
        NamespaceAncestor(T.int, _tokens.dispatchedComputation)
          .fallsBackToDispatched())

    // Register a recursive dispatched computation, i.e., a dispatched
    // computation that requests an input from another input of the same
    // dispatched computation.
    self.dispatchedPrimComputation(
      _tokens.recursiveDispatchedComputationOnAncestor)
      .Callback(T.int, (ctx: VdfContext) => {
        const attrValuePtr =
          ctx.getInputValuePtr<number>(T.int, _tokens.myAttr)
        if (attrValuePtr !== null) {
          return attrValuePtr
        }

        const valuePtr =
          ctx.getInputValuePtr<number>(
            T.int, _tokens.recursiveDispatchedComputationOnAncestor)
        return valuePtr !== null ? valuePtr : -1
      })
      .inputs(
        AttributeValue(T.int, _tokens.myAttr),
        NamespaceAncestor(
          T.int, _tokens.recursiveDispatchedComputationOnAncestor)
          .fallsBackToDispatched())

    // Register a computation that consumes a recursive dispatched
    // computation.
    self.primComputation(
      _tokens.consumesRecursiveDispatchedComputationOnAncestor)
      .Callback(T.int, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<number>(
            T.int, _tokens.recursiveDispatchedComputationOnAncestor)
        return valuePtr !== null ? valuePtr : -1
      })
      .inputs(
        NamespaceAncestor(
          T.int, _tokens.recursiveDispatchedComputationOnAncestor)
          .fallsBackToDispatched())
  })

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdDispatchedComputationsDispatchingSchema2', (self) => {
    // Register a dispatched computation that only applies to prims with
    // MatchingSchema applied.
    self.dispatchedPrimComputation(
      _tokens.dispatchedComputation,
      TfType.findByName('TestExecUsdDispatchedComputationsMatchingingSchema'))
      .Callback(T.int, (_ctx: VdfContext) => { return 11 })

    self.primComputation(_tokens.consumesDispatchedComputation)
      .Callback(T.int, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<number>(T.int, _tokens.dispatchedComputation)
        return valuePtr !== null ? valuePtr : -1
      })
      .inputs(
        Relationship(_tokens.dispatchingRel)
          .targetedObjects(T.int, _tokens.dispatchedComputation)
          .fallsBackToDispatched(),
      )
  })

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdDispatchedComputationsNonDispatchingSchema', (self) => {
    // Register a computation that requests a dispatched computation that it
    // will fail to find, since it does not dispatch the requested
    // computation.
    //
    // Note that if a schema that *does* dispatch 'dispatchedComputation' is
    // applied to the same prim as this schema, then this computation *can*
    // find the dispatched computation.
    //
    self.primComputation(_tokens.consumesDispatchedComputation)
      .Callback(T.int, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<number>(T.int, _tokens.dispatchedComputation)
        return valuePtr !== null ? valuePtr + 100 : -100
      })
      .inputs(
        Relationship(_tokens.dispatchingRel)
          .targetedObjects(T.int, _tokens.dispatchedComputation)
          .fallsBackToDispatched(),
      )
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdDispatchedComputations')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdDispatchedComputations')
}

describe('testExecUsdDispatchedComputations', () => {
  // Tests the semantics of dispatched computations.
  it('TestDispatchedComputation', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "DispatchedOnPrim" {}

        # DispatchingSchema1 dispatches a computaiton, which is found via
        # dispatchingRel, but not via nonDispatchingRel.
        def Scope "DispatchingPrim1" (apiSchemas = ["DispatchingSchema1"]) {
            add rel dispatchingRel = </DispatchedOnPrim>
            add rel nonDispatchingRel = </DispatchedOnPrim>
        }

        # DispatchingSchema2 dispatches a computation of the same name as the
        # one dispatched by DispatchingSchema1, but there is no name collision,
        # due to dispatching semantics. Furthermore, this dispatched computation
        # only matches if the API schema MatchingSchema is applied to the target
        # prim.
        def Scope "DispatchingPrim2" (apiSchemas = ["DispatchingSchema2"]) {
            add rel dispatchingRel = </DispatchedOnPrim>
        }

        # The schema applied to this prim attempts to consume a dispatched
        # computation of the same name as the computations dispatched by the
        # dispatching schemas, but it can't find it because it doesn't dispatch
        # the computation.
        def Scope "NonDispatchingPrim" (apiSchemas = ["NonDispatchingSchema"]) {
            add rel dispatchingRel = </DispatchedOnPrim>
            def Scope "DispatchedOnPrim" {}
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const dispatchedOnPrim =
      usdStage.getPrim('/DispatchedOnPrim')!
    TF_AXIOM(dispatchedOnPrim.isValid())

    const dispatchingPrim1 =
      usdStage.getPrim('/DispatchingPrim1')!
    TF_AXIOM(dispatchingPrim1.isValid())

    const dispatchingPrim2 =
      usdStage.getPrim('/DispatchingPrim2')!
    TF_AXIOM(dispatchingPrim2.isValid())

    const nonDispatchingPrim =
      usdStage.getPrim('/NonDispatchingPrim')!
    TF_AXIOM(nonDispatchingPrim.isValid())

    const valueKeys = [
      new ExecUsdValueKey(dispatchingPrim1,
        'consumesDispatchedComputation'),
      new ExecUsdValueKey(dispatchingPrim2,
        'consumesDispatchedComputation'),
      new ExecUsdValueKey(nonDispatchingPrim,
        'consumesDispatchedComputation'),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)

      let v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(42)

      v = execSystem.compute(request).Get(1)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(-1)

      v = view.Get(2)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(-100)
    }

    // Now apply MatchingSchema to dispatchedOnPrim, so the computation
    // dispatched by DispatchingPrim2 will be found.
    dispatchedOnPrim.applyAPI('MatchingSchema')

    {
      const view = execSystem.compute(request)

      const v = view.Get(1)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(11)
    }

    // Now apply a dispatching schema to NonDispatchingPrim, so that it will
    // be able to find the dispatched computation.
    //
    // Note that NonDispatchingSchema is stronger, so we end up computing the
    // 'consumesDispatchedComputation' defined by that schema, but finding
    // the 'dispatchedComputation' dispatched by DispatchingSchema1.
    //
    nonDispatchingPrim.applyAPI('DispatchingSchema1')

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)

      const v = view.Get(2)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(142)
    }

    request.destroy()
    execSystem.destroy()
  })

  // Tests dispatched computations consumed via namespace ancestor inputs.
  it('TestDispatchedComputationOnAncestor', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "Root" {
            def Scope "DispatchingPrim" (apiSchemas = ["DispatchingSchema1"]) {
            }
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const dispatchingPrim =
      usdStage.getPrim('/Root/DispatchingPrim')!
    TF_AXIOM(dispatchingPrim.isValid())

    const valueKeys = [
      new ExecUsdValueKey(dispatchingPrim,
        'consumesDispatchedComputationOnAncestor'),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const view = execSystem.compute(request)

    const v = view.Get(0)
    TF_AXIOM(v.IsHolding(T.int))
    expect(v.Get<number>()).toBe(42)

    request.destroy()
    execSystem.destroy()
  })

  // Tests that a computation can be dispatched recursively.
  //
  // I.e., here we verify that a dispatched computation can take input from a
  // different instance of the same computation, dispatched onto a different
  // prim.
  //
  it('TestRecursiveDispatchedComputation', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def Scope "Root" {
            custom int myAttr = 10
            def Scope "Prim" {
                def Scope "DispatchingPrim" (
                    apiSchemas = ["DispatchingSchema1"]
                ) {
                }
            }
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const dispatchingPrim =
      usdStage.getPrim('/Root/Prim/DispatchingPrim')!
    TF_AXIOM(dispatchingPrim.isValid())

    const valueKeys = [
      new ExecUsdValueKey(dispatchingPrim,
        'consumesRecursiveDispatchedComputationOnAncestor'),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const view = execSystem.compute(request)

    const v = view.Get(0)
    TF_AXIOM(v.IsHolding(T.int))
    expect(v.Get<number>()).toBe(10)

    request.destroy()
    execSystem.destroy()
  })
})
