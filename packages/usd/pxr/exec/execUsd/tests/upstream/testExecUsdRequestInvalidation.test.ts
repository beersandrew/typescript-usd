// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdRequestInvalidation.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdRequestInvalidation.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdRequestInvalidation/resources), as
// ConfigureTestPlugin does with PlugRegistry::RegisterPlugins. Opening a
// stage is asynchronous here (testHelpers.ts _OpenStage). GfMatrix4d's
// `* scale` and `* parentXf` are GetScalarMultiply and GetMultiply; `|=` on
// EfTimeInterval is OrAssign; SdfChangeBlock's scope is constructed and
// closed. std::unordered_map<int, int> is a Map<number, number>.
// SdfFieldKeys->Documentation is 'documentation'. ASSERT_EQ is expect;
// scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { ChangeBlock as SdfChangeBlock } from 'typescript-usd/sdf'
import { TimeCode as UsdTimeCode, type Stage as UsdStage } from 'typescript-usd/usd'
import { EfTimeInterval } from 'typescript-usd/ef'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, NamespaceAncestor,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// SdfFieldKeys (pxr/usd/sdf/schema.h)
const SdfFieldKeys = { Documentation: 'documentation' } as const

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  computeXf: 'computeXf',
  scale: 'scale',
  xf: 'xf',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdRequestInvalidationComputedTransform', (self) => {
    self.primComputation(_tokens.computeXf)
      .Callback(T.GfMatrix4d, (ctx: VdfContext) => {
        const fallbackScale = 1.0
        const scale = ctx.getInputValuePtr<number>(
          T.double, _tokens.scale, fallbackScale)!

        const id = new GfMatrix4d(1)
        const xf = ctx.getInputValuePtr<GfMatrix4d>(
          T.GfMatrix4d, _tokens.xf, id)!.getScalarMultiply(scale)
        const parentXf = ctx.getInputValuePtr<GfMatrix4d>(
          T.GfMatrix4d, _tokens.computeXf, id)!
        return xf.getMultiply(parentXf)
      })
      .inputs(
        AttributeValue(T.GfMatrix4d, _tokens.xf),
        AttributeValue(T.double, _tokens.scale),
        NamespaceAncestor(T.GfMatrix4d, _tokens.computeXf),
      )
  })

function ConfigureTestPlugin(): void {
  const testPlugins = _RegisterTestResources('testExecUsdRequestInvalidation')

  TF_AXIOM(testPlugins.length === 1)
  TF_AXIOM(testPlugins[0]!.getName() === 'testExecUsdRequestInvalidation')
}

async function CreateTestStage(): Promise<UsdStage> {
  const stage = await _OpenStage(
    `#usda 1.0
        (
            defaultPrim = "Root"
        )
        def ComputedTransform "Root" (
            kind = "component"
        )
        {
            def ComputedTransform "A1"
            {
                matrix4d xf = ( (2, 0, 0, 0), (0, 2, 0, 0), (0, 0, 2, 0), (0, 0, 0, 1) )
                double scale = 1
                double scale.spline = {
                    1: 1,
                    2: 2,
                }
                def ComputedTransform "B"
                {
                    matrix4d xf = ( (3, 0, 0, 0), (0, 3, 0, 0), (0, 0, 3, 0), (0, 0, 0, 1) )
                }
            }
            def ComputedTransform "A2"
            {
                matrix4d xf = ( (5, 0, 0, 0), (0, 5, 0, 0), (0, 0, 5, 0), (0, 0, 0, 1) )
            }
        }
        `)
  TF_AXIOM(stage)
  return stage
}

// Structure for keeping track of invalidation state as received from request
// callback invocations.
//
class _InvalidationState {
  // Map from invalid index to number of times invalidated.
  indices = new Map<number, number>()

  // The combined invalid time interval.
  interval = new EfTimeInterval()

  // Number of times the callback has been invoked.
  numInvoked = 0

  // Reset the invalidation state.
  Reset(): void {
    this.indices.clear()
    this.interval.clear()
    this.numInvoked = 0
  }

  // The value invalidation callback invoked by the request.
  valueCalback(
    invalidIndices: ReadonlySet<number>,
    invalidInterval: EfTimeInterval,
  ): void {
    // Add all invalid indices to the map and increment the invalidation
    // count for each entry.
    for (const i of invalidIndices) {
      this.indices.set(i, (this.indices.get(i) ?? 0) + 1)
    }

    // Combine the invalid interval.
    this.interval.orAssign(invalidInterval)

    // Increment the number of times the callback has been invoked.
    ++this.numInvoked
  }

  // The time invalidation callback invoked by the request
  timeCallback(
    invalidIndices: ReadonlySet<number>,
  ): void {
    // Add all invalid indices to the map and increment the invalidation
    // count for each entry.
    for (const i of invalidIndices) {
      this.indices.set(i, (this.indices.get(i) ?? 0) + 1)
    }

    // Increment the number of times the callback has been invoked.
    ++this.numInvoked
  }
}

// Validate the invalid indices map in a human-readable way.
//
// Iterate over an array of invalid indices, where each entry in the array
// represents the number of times invalidation was expected for the index at
// the given entry.
//
function _ValidateSet(
  indexMap: ReadonlyMap<number, number>,
  indexArray: readonly number[],
): boolean {
  let index = 0
  for (const expected of indexArray) {
    const recorded = indexMap.get(index) ?? 0
    if (expected !== recorded) {
      console.error(
        `Index ${index}: expected ${expected}, recorded ${recorded}`)
      return false
    }
    ++index
  }
  return true
}

ConfigureTestPlugin()

describe('testExecUsdRequestInvalidation', () => {
  it('TestRequestCallbacks', async () => {
    const stage = await CreateTestStage()

    const system = new ExecUsdSystem(stage)

    const invalidation = new _InvalidationState()

    const request =
      system.buildRequest([
        new ExecUsdValueKey(stage.getPrim('/Root')!, _tokens.computeXf),
        new ExecUsdValueKey(stage.getPrim('/Root/A1')!, _tokens.computeXf),
        new ExecUsdValueKey(stage.getPrim('/Root/A1/B')!, _tokens.computeXf),
        new ExecUsdValueKey(stage.getPrim('/Root/A2')!, _tokens.computeXf),
      ],
      (indices, interval) => invalidation.valueCalback(indices, interval),
      (indices) => invalidation.timeCallback(indices))
    TF_AXIOM(request.isValid())

    system.prepareRequest(request)
    TF_AXIOM(request.isValid())

    system.compute(request)
    expect(invalidation.numInvoked).toBe(0)

    // Change the value of an attribute directly connected to a leaf node and
    // validate the resulting invalidation.
    const Bxf = stage.getAttributeAtPath('/Root/A1/B.xf')!
    TF_AXIOM(Bxf)
    Bxf.set(new GfMatrix4d(1.0))
    expect(invalidation.numInvoked).toBe(1)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 0, 1, 0]))
    TF_AXIOM(invalidation.interval.isFullInterval())

    // Change the value of an attribute transitively connected to a leaf node
    // and validate the resulting invalidation.
    const A1xf = stage.getAttributeAtPath('/Root/A1.xf')!
    TF_AXIOM(A1xf)
    A1xf.set(new GfMatrix4d(1.0))
    expect(invalidation.numInvoked).toBe(2)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 1, 1, 0]))
    TF_AXIOM(invalidation.interval.isFullInterval())

    // Invalidate B.xf again, which should not send out additional
    // notification.
    Bxf.set(new GfMatrix4d(3.0))
    expect(invalidation.numInvoked).toBe(2)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 1, 1, 0]))
    TF_AXIOM(invalidation.interval.isFullInterval())

    // Cache values again to renew interest in invalidation notification.
    invalidation.Reset()
    system.compute(request)
    expect(invalidation.numInvoked).toBe(0)

    // Change the value of a previously changed attribute again.
    Bxf.set(new GfMatrix4d(2.0))
    expect(invalidation.numInvoked).toBe(1)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 0, 1, 0]))
    TF_AXIOM(invalidation.interval.isFullInterval())

    // Change the value of a never before changed attribute.
    const A2xf = stage.getAttributeAtPath('/Root/A2.xf')!
    TF_AXIOM(A2xf)
    A2xf.set(new GfMatrix4d(4.0))
    expect(invalidation.numInvoked).toBe(2)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 0, 1, 1]))
    TF_AXIOM(invalidation.interval.isFullInterval())

    // Cache values again to renew interest in invalidation notification.
    invalidation.Reset()
    system.compute(request)
    expect(invalidation.numInvoked).toBe(0)

    // Change the value of an irrelevant field
    A1xf.setMetadata(SdfFieldKeys.Documentation, 'test doc')
    expect(invalidation.numInvoked).toBe(0)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 0, 0, 0]))
    TF_AXIOM(invalidation.interval.IsEmpty())

    // Test changing multiple default values at the same time.
    const rootLayer = stage.getRootLayer()
    {
      const block = new SdfChangeBlock()
      rootLayer.getAttributeAtPath('/Root/A1.xf')!.setDefaultValue(
        VtValue.create(new GfMatrix4d(5.0), T.GfMatrix4d))
      rootLayer.getAttributeAtPath('/Root/A2.xf')!.setDefaultValue(
        VtValue.create(new GfMatrix4d(5.0), T.GfMatrix4d))
      block.close()
    }
    expect(invalidation.numInvoked).toBe(1)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 1, 1, 1]))
    TF_AXIOM(invalidation.interval.isFullInterval())

    // The exec system should be initialized with the default time, so there
    // should be no time invalidation here.
    invalidation.Reset()
    system.changeTime(UsdTimeCode.Default())
    expect(invalidation.numInvoked).toBe(0)

    // /Root/A1.scale is not varying between the default time and frame 1, so
    // there should not be invalidation.
    invalidation.Reset()
    system.changeTime(new UsdTimeCode(1.0))
    expect(invalidation.numInvoked).toBe(0)

    // /Root/A1.scale 's spline value is different on frame 2, so we should
    // be able to observe invalidation.
    invalidation.Reset()
    system.changeTime(new UsdTimeCode(2.0))
    expect(invalidation.numInvoked).toBe(1)
    TF_AXIOM(_ValidateSet(invalidation.indices, [0, 1, 1, 0]))
    TF_AXIOM(invalidation.interval.IsEmpty())

    // The knot value on frame 2 should be held over the following frames.
    invalidation.Reset()
    system.changeTime(new UsdTimeCode(3.0))
    expect(invalidation.numInvoked).toBe(0)

    request.destroy()
    system.destroy()
  })
})
