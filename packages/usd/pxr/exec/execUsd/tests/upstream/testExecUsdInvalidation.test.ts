// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdInvalidation.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdInvalidation.cpp
//
// Opening a stage is asynchronous here (testHelpers.ts _OpenStage).
// _VerifyAttrValue's ValueType template argument is a TfType argument.
// UsdAttribute::Set(value) is Attribute.set(value) and Set(value, time) is
// setTimeSample(time.GetValue(), value); TsKnot::SetValue(VtValue(value)) is
// SetValue(value). ASSERT_EQ is expect; scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { TsKnot, TsSpline } from 'typescript-usd/ts'
import { TimeCode as UsdTimeCode, type Attribute as UsdAttribute } from 'typescript-usd/usd'
import { ExecBuiltinComputations, ExecSystem } from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage } from '../testHelpers.ts'

const T = VtValueTypes

// Verfies that the computed value of the given attribute matches the given
// expected value.
function _VerifyAttrValue<ValueType>(
  valueType: TfType,
  attr: UsdAttribute,
  expectedValue: ValueType,
  execSystem: ExecUsdSystem,
): void {
  const request =
    execSystem.buildRequest([new ExecUsdValueKey(
      attr, ExecBuiltinComputations.computeResolvedValue)])

  const cache = execSystem.compute(request)
  const value = cache.Get(0)
  TF_AXIOM(value.IsHolding(valueType))
  expect(value.Get<ValueType>()).toBe(expectedValue)

  request.destroy()
}

// Sets a spline on attr with a knot with the given value at the given time.
function _SetSplineKnot(
  time: UsdTimeCode,
  value: number,
  attr: UsdAttribute,
): void {
  const doubleType = TfType.findByName('double')
  const spline = new TsSpline(doubleType)

  const knot = new TsKnot(doubleType)
  knot.SetTime(time.GetValue())
  knot.setValue(value)
  spline.setKnot(knot)

  attr.setSpline(spline)
}

// UsdAttribute::Set(value, time).
function _SetAtTime(attr: UsdAttribute, value: unknown, time: UsdTimeCode): void {
  if (time.isDefault()) {
    attr.set(value)
  } else {
    attr.setTimeSample(time.GetValue(), value)
  }
}

async function doTimeInvalidationTest<ValueType>(
  valueType: TfType,
  layerContents: string,
  timeAndValues: Array<[UsdTimeCode, ValueType]>,
): Promise<void> {
  const usdStage = await _OpenStage(layerContents)
  TF_AXIOM(usdStage)

  const attr = usdStage.getAttributeAtPath('/Prim.attr')!
  TF_AXIOM(attr)

  const execSystem = new ExecUsdSystem(usdStage)

  for (const [time, expectedValue] of timeAndValues) {
    execSystem.changeTime(time)
    _VerifyAttrValue(valueType, attr, expectedValue, execSystem)
  }

  execSystem.destroy()
}

describe('testExecUsdInvalidation', () => {
  it('Test_ValueInvalidation', async () => {
    const usdStage = await _OpenStage(
      `#usda 1.0
        def Scope "Prim" {
            custom double attr = 0
        }
        `)
    TF_AXIOM(usdStage)

    const attr = usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr)

    const execSystem = new ExecUsdSystem(usdStage)
    const time = new UsdTimeCode(0.0)
    execSystem.changeTime(time)

    _VerifyAttrValue(T.double, attr, 0.0, execSystem)

    // Author the default value.
    attr.set(1.0)
    _VerifyAttrValue(T.double, attr, 1.0, execSystem)

    // Change the default value.
    attr.set(2.0)
    _VerifyAttrValue(T.double, attr, 2.0, execSystem)

    // Add a spline.
    _SetSplineKnot(time, 3.0, attr)
    _VerifyAttrValue(T.double, attr, 3.0, execSystem)

    // Change the value produced by the spline.
    _SetSplineKnot(time, 4.0, attr)
    _VerifyAttrValue(T.double, attr, 4.0, execSystem)

    // Author a time sample.
    _SetAtTime(attr, 5.0, time)
    _VerifyAttrValue(T.double, attr, 5.0, execSystem)

    // Change the time sample value.
    _SetAtTime(attr, 6.0, time)
    _VerifyAttrValue(T.double, attr, 6.0, execSystem)

    // InvalidateAll: The computed value should remain the same. (And we
    // shouldn't crash.)
    new ExecSystem.Diagnostics(execSystem).invalidateAll()
    execSystem.changeTime(time)
    _VerifyAttrValue(T.double, attr, 6.0, execSystem)

    // Set the time back to default.
    execSystem.changeTime(UsdTimeCode.Default())
    _VerifyAttrValue(T.double, attr, 2.0, execSystem)

    execSystem.destroy()
  })

  it('Test_TimeInvalidationSpline', async () => {
    await doTimeInvalidationTest<number>(
      T.double,
      `#usda 1.0
            def Scope "Prim" {
                custom double attr = -11.0
                double attr.spline = {
                    0: 0; post linear,
                    10: 10; post held,
                }
            }
        `,
      [
        [new UsdTimeCode(-1.0), 0.0],
        [new UsdTimeCode(0.0), 0.0],
        [new UsdTimeCode(5.0), 5.0],
        [new UsdTimeCode(10.0), 10.0],
        [UsdTimeCode.Default(), -11.0],
        [new UsdTimeCode(15.0), 10.0],
      ])
  })

  it('Test_TimeInvalidationTimeSamples', async () => {
    await doTimeInvalidationTest<string>(
      T.string,
      `#usda 1.0
            def Scope "Prim" {
                custom string attr = "default"
                string attr.timeSamples = {
                    0: "time sample 0",
                    10: "time sample 10",
                }
            }
        `,
      [
        [new UsdTimeCode(-1.0), 'time sample 0'],
        [new UsdTimeCode(0.0), 'time sample 0'],
        [new UsdTimeCode(5.0), 'time sample 0'],
        [new UsdTimeCode(10.0), 'time sample 10'],
        [UsdTimeCode.Default(), 'default'],
        [new UsdTimeCode(15.0), 'time sample 10'],
      ])
  })

  it('Test_TimeInvalidationSingleTimeSample', async () => {
    await doTimeInvalidationTest<string>(
      T.string,
      `#usda 1.0
            def Scope "Prim" {
                custom string attr = "default"
                string attr.timeSamples = {
                    0: "time sample",
                }
            }
        `,
      [
        [new UsdTimeCode(-1.0), 'time sample'],
        [new UsdTimeCode(0.0), 'time sample'],
        [new UsdTimeCode(1.0), 'time sample'],
        [UsdTimeCode.Default(), 'default'],
        [new UsdTimeCode(10.0), 'time sample'],
      ])
  })
})
