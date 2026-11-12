// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdConnections.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdConnections.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdConnections/resources), as main() does with
// PlugRegistry::RegisterPlugins. Opening a stage is asynchronous here
// (testHelpers.ts _OpenStage). ExecRequestIndexSet is a Set<number>; the
// callback's `invalidIndices = indices` copies the set. std::accumulate over
// a VdfReadIteratorRange is a sum over the iterable range. ASSERT_EQ is
// expect; scope-end destructors are Destroy() (TfErrorMark: Dispose()).

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfErrorMark } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { EfTimeInterval } from 'typescript-usd/ef'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator, VdfReadIteratorRange } from 'typescript-usd/vdf'
import {
  Connections, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations,
  IncomingConnections, type ExecRequestIndexSet,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  emptyAttr: 'emptyAttr',
  computeViaIncomingConnections: 'computeViaIncomingConnections',
  computeConnectedConstants: 'computeConnectedConstants',
  computeConstant: 'computeConstant',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdConnectionsCustomSchema', (self) => {
    // A prim computation that computes the values of the string-valued
    // attributes that target the prim with attribute connections.
    self.primComputation(
      _tokens.computeViaIncomingConnections)
      .Callback(T.string, (ctx: VdfContext): string => {
        let result = ''
        for (const it = new VdfReadIterator<string>(
          T.string, ctx, ExecBuiltinComputations.computeResolvedValue);
          !it.isAtEnd(); it.increment()) {
          if (result.length !== 0) {
            result += ' '
          }
          result += "'" + it.deref() + "'"
        }
        return result.length === 0 ? '(no value)' : result
      })
      .inputs(
        IncomingConnections(
          T.string, ExecBuiltinComputations.computeResolvedValue),
      )

    // An attribute computation that always returns the constant value 1.
    self.attributeComputation(_tokens.attr, _tokens.computeConstant)
      .Callback(T.int, (_ctx: VdfContext) => { return 1 })

    // An attribute computation that sums computeConstant on all targeted
    // objects.
    self.attributeComputation(_tokens.attr, _tokens.computeConnectedConstants)
      .Callback(T.int, (ctx: VdfContext): number => {
        const range = new VdfReadIteratorRange<number>(
          T.int, ctx, _tokens.computeConstant)
        let sum = 0
        for (const value of range) {
          sum += value
        }
        return sum
      })
      .inputs(
        Connections(T.int, _tokens.computeConstant),
      )

    self.attributeExpression(_tokens.emptyAttr)
      .Callback(T.string, (ctx: VdfContext): void => {
        ctx.setEmptyOutput()
      })
  })

// Verifies we got the expected single invalid index and resets
// invalidIndices in preparation for more testing.
//
// `indexSet` should be the ExecRequestIndexSet that we get from a request
// invalidation callback.
//
// `i` is the single index we expect to find in the set.
//
function VERIFY_SINGLE_INVALID_INDEX(indexSet: ExecRequestIndexSet, i: number): void {
  expect(indexSet.size).toBe(1)
  expect(indexSet.has(i) ? 1 : 0).toBe(1)
  indexSet.clear()
}

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdConnections')
  expect(testPlugins.length).toBe(1)
  expect(
    testPlugins[0]!.getName()).toBe('testExecUsdConnections')
}

describe('testExecUsdConnections', () => {
  // Test that we get the expected results and the expected invalidation
  // when attribute connections are edited.
  //
  it('TestAttributeConnections', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
            string attr = "attr value"

            // Note that 'attr2' does not exist
            string attr.connect = [</Prim.attr2>]

            string attr3 = "attr3 value"
            string emptyAttr = "empty"
            string[] array = ["array value"]
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())

    const attr = usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr.isValid())

    let invalidIndices: ExecRequestIndexSet = new Set()

    const request = execSystem.buildRequest(
      [new ExecUsdValueKey(attr, ExecBuiltinComputations.computeValue)],
      (indices: ReadonlySet<number>,
        _interval: EfTimeInterval) => {
        invalidIndices = new Set(indices)
      })
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())
    // The connection owned by 'attr' targets 'attr2', which does not exist,
    // so the computed result falls back to the resolved value of 'attr'.
    {
      const view = execSystem.compute(request)
      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(
        v.Get<string>()).toBe(
        'attr value')
    }

    // Add a connection to an existing attribute. The value of the connected
    // attribute is ignored, and the computed result is the resolved value of
    // the owning attribute 'attr'.
    attr.addConnection('/Prim.attr3')
    VERIFY_SINGLE_INVALID_INDEX(invalidIndices, 0)
    {
      const view = execSystem.compute(request)
      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(
        v.Get<string>()).toBe(
        'attr value')
    }

    // Remove the connection that targets attr2, s.t. the single remaining
    // valid connection owned by 'attr' provides its computed value.
    attr.removeConnection('/Prim.attr2')
    TF_AXIOM(request.isValid())
    VERIFY_SINGLE_INVALID_INDEX(invalidIndices, 0)
    {
      const view = execSystem.compute(request)
      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(
        v.Get<string>()).toBe(
        'attr3 value')
    }

    // Remove the existing connection and connect an attribute that produces
    // an empty output.
    attr.removeConnection('/Prim.attr3')
    VERIFY_SINGLE_INVALID_INDEX(invalidIndices, 0)

    const emptyAttr =
      usdStage.getAttributeAtPath('/Prim.emptyAttr')!
    TF_AXIOM(emptyAttr.isValid())

    attr.addConnection('/Prim.emptyAttr')
    {
      const view = execSystem.compute(request)
      TF_AXIOM(view.Get(0).IsEmpty())
    }

    // Reverse the connection s.t. 'emptyAttr' targets 'attr'. The connected
    // value is ignored since the computed value is provided by the
    // expression registered for 'emptyAttr'.
    attr.removeConnection('/Prim.emptyAttr')
    TF_AXIOM(emptyAttr.isValid())
    VERIFY_SINGLE_INVALID_INDEX(invalidIndices, 0)
    emptyAttr.addConnection('/Prim.attr')

    const emptyAttrRequest = execSystem.buildRequest([
      new ExecUsdValueKey(emptyAttr, ExecBuiltinComputations.computeValue)])
    TF_AXIOM(emptyAttrRequest.isValid())

    execSystem.prepareRequest(emptyAttrRequest)
    TF_AXIOM(emptyAttrRequest.isValid())
    {
      const view = execSystem.compute(emptyAttrRequest)
      TF_AXIOM(view.Get(0).IsEmpty())
    }

    // Connect scalar-typed attribute 'attr' to an array-typed attribute
    // 'array' that contains a single element.
    const arrayAttr =
      usdStage.getAttributeAtPath('/Prim.array')!
    TF_AXIOM(arrayAttr.isValid())

    attr.addConnection('/Prim.array')
    // This is an unsupported case, so the computed value is the resolved
    // value of 'attr'.
    {
      const view = execSystem.compute(request)
      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(
        v.Get<string>()).toBe(
        'attr value')
    }

    emptyAttrRequest.destroy()
    request.destroy()
    execSystem.destroy()
  })

  // Tests that Connections inputs omit input values from targeted objects if
  // those objects don't provide the requested computation.
  //
  it('TestConnectionsComputationNotFound', async () => {
    const errorMark = new TfErrorMark()

    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
            string attr = "Prim.attr"
            string attr.connect = [
                </Target1.attr>,
                </Target2.otherAttr>,
                </Target3.attr>
            ]
        }
        def CustomSchema "Target1" {
            # This attribute has the computeConstant computation.
            string attr = "Target1.attr"
        }
        def CustomSchema "Target2" {
            # This attribute does not have the computeConstant computation,
            # because the attribute has a different name.
            string otherAttr = "Target2.otherAttr"
        }
        def "Target3" {
            # This attribute does not have the computeConstant computation,
            # because the prim is not a CustomSchema.
            string attr = "Target3.attr"
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const attr =
      usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr.isValid())

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(attr, _tokens.computeConnectedConstants)])
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const view = execSystem.compute(request)
    TF_AXIOM(view.Get(0).IsHolding(T.int))
    expect(view.Get(0).Get<number>()).toBe(1)

    // There was previously a bug where composing the exec prim definition of
    // typeless prims (e.g. Target3) would emit a coding error. This error
    // mark verifies that no such coding errors were emitted.
    TF_AXIOM(errorMark.isClean())

    request.destroy()
    execSystem.destroy()
    errorMark.dispose()
  })

  it('TestIncomingConnections', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
            string attr = "attr value"
            string attr.connect = [</Prim>]
            string attr3 = "attr3 value"
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(prim, _tokens.computeViaIncomingConnections)])
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    {
      const view = execSystem.compute(request)
      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(
        v.Get<string>()).toBe(
        "'attr value'")
    }

    const attr3 = usdStage.getAttributeAtPath('/Prim.attr3')!
    TF_AXIOM(attr3.isValid())

    // Add another connection
    attr3.addConnection('/Prim')

    {
      const view = execSystem.compute(request)
      const v = view.Get(0)
      TF_AXIOM(v.IsHolding(T.string))
      expect(
        v.Get<string>()).toBe(
        "'attr value' " +
        "'attr3 value'")
    }

    request.destroy()
    execSystem.destroy()
  })

  // Test that a request's schedule is properly invalidated when the leaf
  // node for one of the request's value keys becomes disconnected.
  //
  // Note that the deletion of any non-leaf node in the schedule would
  // invalidate the schedule. This test carefully constructs a situation in
  // which the leaf node is disconnected, but the node feeding that leaf node
  // remains in the network.
  //
  it('TestDisconnectedValueKeys', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
            int attr = 1
            int attrTarget = 2
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())

    const attr = usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr.isValid())

    // Request the resolved value and computed value of the attribute
    // provider. The compiled network contains a leaf node for each requested
    // computation, both of which source their input from the resolved value
    // of the provider, as the provider does not own any connections nor an
    // expression.
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(attr, ExecBuiltinComputations.computeResolvedValue),
      new ExecUsdValueKey(attr, ExecBuiltinComputations.computeValue)])
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    // The provider does not own any connections, so the computed result
    // falls back to its resolved value.
    {
      const view = execSystem.compute(request)
      const v = view.Get(1)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(1)
    }

    // Add a connection s.t. the computed value of the provider is sourced
    // across the connection. This will disconnect the leaf input
    // representing 'computeValue' and reconnect it to the result of
    // 'computeConnectedValue'.
    //
    // Note that the node providing 'computeResolvedValue' is still feeding
    // the leaf node for the value key at index 0. Although no nodes in the
    // schedule were modified, the request schedule is still invalidated
    // since a leaf node corresponding to a value key in the request was
    // disconnected.
    //
    attr.addConnection('/Prim.attrTarget')
    {
      const view = execSystem.compute(request)
      const v = view.Get(1)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(2)
    }

    // Remove the connection and verify that the computed value is the
    // resolved value of the owner. This will disconnect the leaf input
    // representing 'computeValue' and reconnect it to the output that is
    // providing 'computeResolvedValue'.
    attr.removeConnection('/Prim.attrTarget')
    {
      const view = execSystem.compute(request)
      const v = view.Get(1)
      TF_AXIOM(v.IsHolding(T.int))
      expect(v.Get<number>()).toBe(1)
    }

    request.destroy()
    execSystem.destroy()
  })
})
