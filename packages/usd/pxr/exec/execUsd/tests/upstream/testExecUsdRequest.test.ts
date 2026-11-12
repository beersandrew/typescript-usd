// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/testenv/testExecUsdRequest.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdRequest.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdRequest/resources), as ConfigureTestPlugin
// does with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous
// here (testHelpers.ts _OpenStage). UsdTimeCode is registered with the exec
// type registry under its C++ name; GfMatrix4d's operator* and operator==
// are GetMultiply and equals; UsdTimeCode's operator== is
// testHelpers.ts _TimeCodeEquals. The std::atomic<int> counter is a number.
// WorkParallelForN is typescript-usd/work's (serial: threading is out of
// scope). ASSERT_EQ is expect; scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { WorkParallelForN } from 'typescript-usd/work'
import { TimeCode as UsdTimeCode, type Stage as UsdStage } from 'typescript-usd/usd'
import { EfTimeType, type EfTime } from 'typescript-usd/ef'
import type { VdfContext } from 'typescript-usd/vdf'
import { Vdf_SetSizeof } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations, ExecTypeRegistry,
  NamespaceAncestor, Stage,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources, _TimeCodeEquals } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  computeXf: 'computeXf',
  computeTimeVarying: 'computeTimeVarying',
  xf: 'xf',
} as const

const UsdTimeCodeType = TfType.define('UsdTimeCode')
// sizeof(UsdTimeCode) in the native build (macOS arm64, libc++),
// the TS stand-in for sizeof (pxr/exec/vdf/src/estimateSize.ts).
Vdf_SetSizeof(UsdTimeCodeType, 16)

// TF_REGISTRY_FUNCTION(ExecTypeRegistry)
TfRegistryManager.add('ExecTypeRegistry', () => {
  ExecTypeRegistry.registerType(UsdTimeCodeType, UsdTimeCode.Default())
})

let NumComputed = 0
// Reads the counter (the callback's increments are invisible to TS's
// control-flow narrowing).
const _NumComputed = (): number => NumComputed

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecUsdRequestComputedTransform', (self) => {
  self.primComputation(_tokens.computeXf)
    .Callback(T.GfMatrix4d, (ctx: VdfContext) => {
      const id = new GfMatrix4d(1)
      const xf = ctx.getInputValuePtr<GfMatrix4d>(
        T.GfMatrix4d, _tokens.xf, id)!
      const parentXf = ctx.getInputValuePtr<GfMatrix4d>(
        T.GfMatrix4d, _tokens.computeXf, id)!
      return xf.getMultiply(parentXf)
    })
    .inputs(
      AttributeValue(T.GfMatrix4d, _tokens.xf),
      NamespaceAncestor(T.GfMatrix4d, _tokens.computeXf),
    )

  self.primComputation(_tokens.computeTimeVarying)
    .Callback(UsdTimeCodeType, (ctx: VdfContext) => {
      ++NumComputed
      const tc = ctx.getInputValue<EfTime>(
        EfTimeType, ExecBuiltinComputations.computeTime).getTimeCode()
      return tc
    })
    .inputs(
      Stage().Computation(EfTimeType, ExecBuiltinComputations.computeTime),
    )
})

function ConfigureTestPlugin(): void {
  const testPlugins = _RegisterTestResources('testExecUsdRequest')

  TF_AXIOM(testPlugins.length === 1)
  TF_AXIOM(testPlugins[0]!.getName() === 'testExecUsdRequest')
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
                def ComputedTransform "B"
                {
                    matrix4d xf = ( (3, 0, 0, 0), (0, 3, 0, 0), (0, 0, 3, 0), (0, 0, 0, 1) )
                }
            }
            def ComputedTransform "A2"
            {
                matrix4d xf = ( (5, 0, 0, 0), (0, 5, 0, 0), (0, 0, 5, 0), (0, 0, 0, 1) )
            }
            def ComputedTransform "A3"
            {
                matrix4d xf = ( (7, 0, 0, 0), (0, 7, 0, 0), (0, 0, 7, 0), (0, 0, 0, 1) )
                def ComputedTransform "B"
                {
                    matrix4d xf = ( (3, 0, 0, 0), (0, 3, 0, 0), (0, 0, 3, 0), (0, 0, 0, 1) )
                }
            }
        }
        `)

  TF_AXIOM(stage)
  return stage
}

function ASSERT_MATRIX_EQ(actual: GfMatrix4d, expected: GfMatrix4d): void {
  expect(actual.equals(expected),
    `Expected '${expected}'; got '${actual}'`).toBe(true)
}

function ASSERT_TIMECODE_EQ(actual: UsdTimeCode, expected: UsdTimeCode): void {
  expect(_TimeCodeEquals(actual, expected),
    `Expected '${expected.GetValue()}'; got '${actual.GetValue()}'`).toBe(true)
}

ConfigureTestPlugin()

describe('testExecUsdRequest', () => {
  it('TestValueExtraction', async () => {
    const stage = await CreateTestStage()

    const system = new ExecUsdSystem(stage)

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getPrim('/Root')!, _tokens.computeXf),
      new ExecUsdValueKey(stage.getPrim('/Root/A1')!, _tokens.computeXf),
      new ExecUsdValueKey(stage.getPrim('/Root/A1/B')!, _tokens.computeXf),
      new ExecUsdValueKey(stage.getPrim('/Root/A2')!, _tokens.computeXf),
      new ExecUsdValueKey(stage.getPrim('/Root/A3/B')!, _tokens.computeXf),
    ])
    TF_AXIOM(request.isValid())

    system.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const view = system.compute(request)

    // Extract values concurrently and repeatedly from the same index.
    WorkParallelForN(
      12345,
      (i: number, n: number) => {
        for (; i !== n; ++i) {
          const v = view.Get(i % 4)
          TF_AXIOM(!v.IsEmpty())
        }
      })

    // Assert that the request values are as expected.
    let v = view.Get(0)
    TF_AXIOM(!v.IsEmpty())
    TF_AXIOM(v.IsHolding(T.GfMatrix4d))
    ASSERT_MATRIX_EQ(v.Get<GfMatrix4d>(), new GfMatrix4d(1.))

    v = view.Get(1)
    TF_AXIOM(!v.IsEmpty())
    TF_AXIOM(v.IsHolding(T.GfMatrix4d))
    ASSERT_MATRIX_EQ(v.Get<GfMatrix4d>(), new GfMatrix4d(1.).setScale(2.))

    v = view.Get(2)
    TF_AXIOM(!v.IsEmpty())
    TF_AXIOM(v.IsHolding(T.GfMatrix4d))
    ASSERT_MATRIX_EQ(v.Get<GfMatrix4d>(), new GfMatrix4d(1.).setScale(6.))

    v = view.Get(3)
    TF_AXIOM(!v.IsEmpty())
    TF_AXIOM(v.IsHolding(T.GfMatrix4d))
    ASSERT_MATRIX_EQ(v.Get<GfMatrix4d>(), new GfMatrix4d(1.).setScale(5.))

    v = view.Get(4)
    TF_AXIOM(!v.IsEmpty())
    TF_AXIOM(v.IsHolding(T.GfMatrix4d))
    ASSERT_MATRIX_EQ(v.Get<GfMatrix4d>(), new GfMatrix4d(1.).setScale(21.))

    request.destroy()
    system.destroy()
  })

  it('TestTimeVaryingCache', async () => {
    // Initialize NumComputed. We don't expect it to be incremented until
    // values are computed.
    NumComputed = 0

    const stage = await CreateTestStage()

    const system = new ExecUsdSystem(stage)

    const request =
      system.buildRequest([
        new ExecUsdValueKey(stage.getPrim('/Root')!, _tokens.computeTimeVarying)])
    TF_AXIOM(request.isValid())

    TF_AXIOM(_NumComputed() === 0)

    // Compute for the first time, and verify that the callback is invoked
    // and returns the expected computed value.
    let currentTime = UsdTimeCode.Default()
    let v = system.compute(request).Get(0)
    TF_AXIOM(v.IsHolding(UsdTimeCodeType))
    ASSERT_TIMECODE_EQ(v.Get<UsdTimeCode>(), currentTime)
    TF_AXIOM(_NumComputed() === 1)

    // Compute again. The result should still be cached, and the callback
    // should not be invoked.
    v = system.compute(request).Get(0)
    TF_AXIOM(v.IsHolding(UsdTimeCodeType))
    ASSERT_TIMECODE_EQ(v.Get<UsdTimeCode>(), currentTime)
    TF_AXIOM(_NumComputed() === 1)

    // Change the time, and compute again. Verify that the callback is
    // invoked and returns the expected computed value.
    currentTime = new UsdTimeCode(1.0)
    system.changeTime(currentTime)
    v = system.compute(request).Get(0)
    TF_AXIOM(v.IsHolding(UsdTimeCodeType))
    ASSERT_TIMECODE_EQ(v.Get<UsdTimeCode>(), currentTime)
    TF_AXIOM(_NumComputed() === 2)

    // Change time to a previously visited time code, and compute. Verify
    // that the callback is not invoked, as the computed result should still
    // be cached.
    currentTime = UsdTimeCode.Default()
    system.changeTime(currentTime)
    v = system.compute(request).Get(0)
    TF_AXIOM(v.IsHolding(UsdTimeCodeType))
    ASSERT_TIMECODE_EQ(v.Get<UsdTimeCode>(), currentTime)
    TF_AXIOM(_NumComputed() === 2)

    request.destroy()
    system.destroy()
  })
})
