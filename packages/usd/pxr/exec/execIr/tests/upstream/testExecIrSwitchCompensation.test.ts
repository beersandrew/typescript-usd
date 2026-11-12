// Ported from OpenUSD 26.11.1:
//  pxr/exec/execIr/testenv/testExecIrSwitchCompensation.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/testenv/testExecIrSwitchCompensation.cpp
//
// Adaptations:
// - Importing typescript-usd/execIr registers the execIr schemas and
//   computations, as linking execIr does; typescript-usd/execGeom registers
//   the execGeom plugin. Library plugins load asynchronously on the web, so
//   each test awaits _interim_ExecLoadPluginsAsync() before compiling
//   (docs/openexec-x1.md decision D4).
// - UsdStage::Open of a layer is the asynchronous Stage.open; the stage and
//   layer API is typescript-usd's camelCase API.
// - ASSERT_CLOSE (lines 167-178) is _ASSERT_CLOSE, with GfIsClose of matrices
//   and doubles at 1e-6, raising TF_FATAL_ERROR (which throws). ASSERT_EQ
//   (lines 180-191) is _ASSERT_EQ with ===.
// - _EnsureNoErrors (lines 193-199) is a TfErrorMark checked with TF_VERIFY
//   at the end of each test.
// - UsdAttribute::Get(&value) at the default time is Attribute.get();
//   Get(&value, time) is getValueAtTime(time); Set(value, time) is
//   setTimeSample(time, value). A token value is a string, wrapped as a
//   VtValue of type token for overrides.
// - TsKnot values are plain numbers (TsKnot::SetValue(VtValue) and
//   GetValue(VtValue*) take and return the double directly), so
//   _SetSplineKnot (lines 399-442) takes a number rather than a VtValue.
//   TsSpline::GetKnot(time, &knot) returns the knot or undefined;
//   TsSpline::SetKnot returns the affected interval rather than a bool, so
//   TF_VERIFY(spline.SetKnot(knot)) verifies that a value was returned;
//   CanBreakdown returns a {value, reason} result.
// - The referencing layer names the rig layer by its identifier, as
//   GetIdentifier() does (line 616).

import { describe, it } from 'vitest'
import {
  TF_AXIOM, TF_FATAL_ERROR, TF_VERIFY, TfErrorMark, Type as TfType,
} from 'typescript-usd/tf'
import {
  IsCloseMatrix as GfIsCloseMatrix,
  Matrix4d as GfMatrix4d,
  Vec3d as GfVec3d,
  makeRotation as GfRotation,
} from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import {
  Stage as UsdStage, TimeCode as UsdTimeCode, type Attribute as UsdAttribute,
} from 'typescript-usd/usd'
import {
  Knot as TsKnot, Spline as TsSpline, InterpCurve as TsInterpCurve,
} from 'typescript-usd/ts'
import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import {
  ExecUsdSystem, ExecUsdValueKey, type ExecUsdValueOverrideVector,
} from 'typescript-usd/execUsd'
import 'typescript-usd/execGeom'
import { ExecIrComputations, ExecIrTokens } from 'typescript-usd/execIr'

const T = VtValueTypes

type UsdPrim = NonNullable<ReturnType<UsdStage['getPrim']>>

// This scene defines a "waddler," a rig with two JointScopes and a
// SwitchController that allows one or the other JointScope to act as the
// parent. I.e., when the switch attribute is set to 'rig1', Joint1 acts as the
// parent and Joint1's avars control the posing and Joint2 inherits
// transformation from Joint1. When the switch attribute is set to 'rig2', the
// roles are reversed, and Joint2's avars drive the overall pose. And
// importantly, rotate avars pivot about the origin of whichever JointScope is
// currently acting as the parent, allowing the rig to "waddle," as it
// alternately pivots about one end or the other.
//
// testExecIrSwitchCompensation.cpp:37-165
const waddlerRigLayerContents = `#usda 1.0
    def Scope "Rig" {
        def Scope "Anim" {
            token switch = "rig1"

            def IrJointScope "Joint1" {
                matrix4d posed:space.connect = [
                    </Rig/Control/Switch1.out:space>
                ]

                def IrJointScope "Joint2" {
                    double rest:tz = 10.0
                    matrix4d posed:space.connect = [
                        </Rig/Control/Switch2.out:space>
                    ]
                }
            }
        }

        def Scope "Control" {
            def IrSwitchController "Switch1" {
                token switch.connect = </Rig/Anim.switch>
                matrix4d rig1:space.connect = </Rig/Control/Rig1/FK1.out:space>
                matrix4d rig2:space.connect = </Rig/Control/Rig2/FK1.out:space>
            }

            def IrSwitchController "Switch2" {
                token switch.connect = </Rig/Anim.switch>
                matrix4d rig1:space.connect = </Rig/Control/Rig1/FK2.out:space>
                matrix4d rig2:space.connect = </Rig/Control/Rig2/FK2.out:space>
            }

            def Scope "Rig1" {
                def IrFkController "FK1" {
                    double in:tx.connect = </Rig/Anim/Joint1.avars:tx>
                    double in:ty.connect = </Rig/Anim/Joint1.avars:ty>
                    double in:tz.connect = </Rig/Anim/Joint1.avars:tz>
                    double in:rx.connect = </Rig/Anim/Joint1.avars:rx>
                    double in:ry.connect = </Rig/Anim/Joint1.avars:ry>
                    double in:rz.connect = </Rig/Anim/Joint1.avars:rz>
                    double in:rspin.connect = </Rig/Anim/Joint1.avars:rspin>
                    token in:rotationOrder.connect = [
                        </Rig/Anim/Joint1.avars:rotationOrder>
                    ]
                    matrix4d in:defaultSpace.connect = [
                        </Rig/Anim/Joint1.avars:defaultSpace>
                    ]
                }

                def IrFkController "FK2" {
                    double in:tx.connect = </Rig/Anim/Joint1/Joint2.avars:tx>
                    double in:ty.connect = </Rig/Anim/Joint1/Joint2.avars:ty>
                    double in:tz.connect = </Rig/Anim/Joint1/Joint2.avars:tz>
                    double in:rx.connect = </Rig/Anim/Joint1/Joint2.avars:rx>
                    double in:ry.connect = </Rig/Anim/Joint1/Joint2.avars:ry>
                    double in:rz.connect = </Rig/Anim/Joint1/Joint2.avars:rz>
                    double in:rspin.connect = [
                        </Rig/Anim/Joint1/Joint2.avars:rspin>
                    ]
                    token in:rotationOrder.connect = [
                        </Rig/Anim/Joint1/Joint2.avars:rotationOrder>
                    ]
                    matrix4d in:defaultSpace.connect = [
                        </Rig/Anim/Joint1/Joint2.avars:defaultSpace>
                    ]

                    matrix4d parentIn:defaultSpace.connect = [
                        </Rig/Control/Rig1/FK1.out:defaultSpace>
                    ]
                    matrix4d parentIn:space.connect = [
                        </Rig/Control/Rig1/FK1.out:space>
                    ]
                }
            }

            def Scope "Rig2" {
                def IrFkController "FK1" {
                    double in:tx.connect = </Rig/Anim/Joint1.avars:tx>
                    double in:ty.connect = </Rig/Anim/Joint1.avars:ty>
                    double in:tz.connect = </Rig/Anim/Joint1.avars:tz>
                    double in:rx.connect = </Rig/Anim/Joint1.avars:rx>
                    double in:ry.connect = </Rig/Anim/Joint1.avars:ry>
                    double in:rz.connect = </Rig/Anim/Joint1.avars:rz>
                    double in:rspin.connect = </Rig/Anim/Joint1.avars:rspin>
                    token in:rotationOrder.connect = [
                        </Rig/Anim/Joint1.avars:rotationOrder>
                    ]
                    matrix4d in:defaultSpace.connect = [
                        </Rig/Anim/Joint1.avars:defaultSpace>
                    ]

                    matrix4d parentIn:defaultSpace.connect = [
                        </Rig/Control/Rig2/FK2.out:defaultSpace>
                    ]
                    matrix4d parentIn:space.connect = [
                        </Rig/Control/Rig2/FK2.out:space>
                    ]
                }

                def IrFkController "FK2" {
                    double in:tx.connect = </Rig/Anim/Joint1/Joint2.avars:tx>
                    double in:ty.connect = </Rig/Anim/Joint1/Joint2.avars:ty>
                    double in:tz.connect = </Rig/Anim/Joint1/Joint2.avars:tz>
                    double in:rx.connect = </Rig/Anim/Joint1/Joint2.avars:rx>
                    double in:ry.connect = </Rig/Anim/Joint1/Joint2.avars:ry>
                    double in:rz.connect = </Rig/Anim/Joint1/Joint2.avars:rz>
                    double in:rspin.connect = [
                        </Rig/Anim/Joint1/Joint2.avars:rspin>
                    ]
                    token in:rotationOrder.connect = [
                        </Rig/Anim/Joint1/Joint2.avars:rotationOrder>
                    ]
                    matrix4d in:defaultSpace.connect = [
                        </Rig/Anim/Joint1/Joint2.avars:defaultSpace>
                    ]
                }
            }
        }
    }
    `

// ASSERT_CLOSE (testExecIrSwitchCompensation.cpp:167-178)
function _ASSERT_CLOSE(expr: string, actual: GfMatrix4d | number, expected: GfMatrix4d | number): void {
  const close = typeof actual === 'number'
    ? Math.abs(actual - (expected as number)) <= 1e-6
    : GfIsCloseMatrix(actual, expected as GfMatrix4d, 1e-6)
  if (!close) {
    TF_FATAL_ERROR(`Expected ${expr} =~ '${String(expected)}'; got '${String(actual)}'`)
  }
}

// ASSERT_EQ (testExecIrSwitchCompensation.cpp:180-191)
function _ASSERT_EQ(expr: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    TF_FATAL_ERROR(`Expected ${expr} == '${String(expected)}'; got '${String(actual)}'`)
  }
}

// struct _EnsureNoErrors (testExecIrSwitchCompensation.cpp:193-199)
async function _WithEnsureNoErrors(body: () => Promise<void>): Promise<void> {
  const mark = new TfErrorMark()
  try {
    await body()
  } finally {
    TF_VERIFY(mark.isClean(), 'mark.IsClean()')
    if (!mark.isClean()) {
      throw new Error('_EnsureNoErrors: errors were posted: ' +
        mark.getErrors().map(e => e.getCommentary()).join('; '))
    }
    mark.dispose()
  }
}

// Tests inverse and forward computation through a switch controller by:
// - Solving for input avar values with a switch avar override that selects a
//   specified rig and the given desired values as goals for the output spaces,
//   to confirm we get the expected input values.
// - Authoring the switch avar value and authoring the resulting input values
//   onto the input avars and computing the output spaces, to confirm that we
//   get the desired values that were used as goals for the initial inversion.
//
// testExecIrSwitchCompensation.cpp:201-311
function _VerifySwitchInverseAndForwardResults(
  switchAttribute: UsdAttribute,
  switchValue: string,
  jointScopes: readonly UsdPrim[],
  expectedInputValues: readonly number[],
  desiredValues: readonly GfMatrix4d[],
  execSystem: ExecUsdSystem,
): void {
  // Verify that the switch value isn't what the switch is currently set to,
  // to make sure the switch value override has an effect.
  const value = switchAttribute.get()
  TF_AXIOM(value !== undefined)
  TF_AXIOM(value !== switchValue)

  const inputAvars: UsdAttribute[] = []
  const outputSpaces: UsdAttribute[] = []
  for (const prim of jointScopes) {
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsRx)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsRy)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsRz)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsRspin)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsTx)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsTy)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.avarsTz)!)

    outputSpaces.push(prim.getAttr(ExecIrTokens.posedSpace)!)
  }
  TF_AXIOM(inputAvars.length === expectedInputValues.length)
  for (const attr of inputAvars) {
    TF_AXIOM(attr.isValid())
  }
  TF_AXIOM(outputSpaces.length === desiredValues.length)
  for (const attr of outputSpaces) {
    TF_AXIOM(attr.isValid())
  }

  // Invert, specifying the desired values as goals, and confirm we get the
  // expected input values.
  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const avar of inputAvars) {
      valueKeys.push(new ExecUsdValueKey(
        avar, ExecIrComputations.computeDesiredValue))
    }
    TF_AXIOM(valueKeys.length === expectedInputValues.length)
    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    const overrides: ExecUsdValueOverrideVector = []
    overrides.push({
      valueKey: new ExecUsdValueKey(switchAttribute,
        ExecBuiltinComputations.computeValue),
      overrideValue: VtValue.create(switchValue, T.token),
    })
    for (let i = 0; i < desiredValues.length; ++i) {
      overrides.push({
        valueKey: new ExecUsdValueKey(outputSpaces[i]!,
          ExecIrComputations.explicitDesiredValue),
        overrideValue: VtValue.create(desiredValues[i]!, T.GfMatrix4d),
      })
    }
    const cache = execSystem.computeWithOverrides(request, overrides)

    for (let i = 0; i < expectedInputValues.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.double))
      _ASSERT_CLOSE('value.Get<double>()', value.Get<number>(), expectedInputValues[i]!)
    }
  }

  // Author the switch value and the expected input values and do a forward
  // compute to confirm we get the desired output values.
  switchAttribute.set(switchValue)
  for (let i = 0; i < expectedInputValues.length; ++i) {
    inputAvars[i]!.set(expectedInputValues[i]!)
  }

  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const attr of outputSpaces) {
      valueKeys.push(new ExecUsdValueKey(attr, ExecBuiltinComputations.computeValue))
    }
    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    const cache = execSystem.compute(request)

    for (let i = 0; i < desiredValues.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()', value.Get<GfMatrix4d>(), desiredValues[i]!)
    }
  }
}

// testExecIrSwitchCompensation.cpp:313-397
async function Test_WaddlerRigBasic(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    TF_AXIOM(await _interim_ExecLoadPluginsAsync())
    const layer = SdfLayer.createAnonymous('.usda')
    layer.importFromString(waddlerRigLayerContents)
    const usdStage = await UsdStage.open(layer)
    TF_AXIOM(usdStage)

    const joint1 = usdStage.getPrim('/Rig/Anim/Joint1')!
    const joint2 = usdStage.getPrim('/Rig/Anim/Joint1/Joint2')!
    TF_AXIOM(joint1 && joint2)

    const joint1Space = joint1.getAttr(ExecIrTokens.posedSpace)!
    const joint2Space = joint2.getAttr(ExecIrTokens.posedSpace)!
    TF_AXIOM(joint1Space.isValid() && joint2Space.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const outputRequest = execSystem.buildRequest([
      new ExecUsdValueKey(joint1Space),
      new ExecUsdValueKey(joint2Space),
    ])
    TF_AXIOM(outputRequest.isValid())

    const switchAttr = usdStage.getAttributeAtPath('/Rig/Anim.switch')!
    TF_AXIOM(switchAttr && switchAttr.isValid())

    // Set the switch to Rig2 and test inverse computation with an override
    // that selects Rig1.
    switchAttr.set(ExecIrTokens.rig2)

    {
      const desiredOutSpaceValue1 = new GfMatrix4d(
        GfRotation([1, 0, 0], 90),
        new GfVec3d(0, 0, 0))
      const desiredOutSpaceValue2 = new GfMatrix4d(
        GfRotation([1, 0, 0], 90),
        new GfVec3d(10, 20, 30))

      const expectedInputValues = [
        90.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 0.0, 10.0, 30.0, -30.0,
      ]

      _VerifySwitchInverseAndForwardResults(
        switchAttr, ExecIrTokens.rig1,
        [joint1, joint2],
        expectedInputValues,
        [desiredOutSpaceValue1, desiredOutSpaceValue2],
        execSystem)
    }

    // Verify the switch is now set to Rig1 and test inverse with an override
    // that selects Rig2.
    {
      const value = switchAttr.get()
      TF_AXIOM(value !== undefined)
      _ASSERT_EQ('value', value, ExecIrTokens.rig1)

      const desiredOutSpaceValue1 = new GfMatrix4d(
        GfRotation([0, 1, 0], -90),
        new GfVec3d(1, 2, 3))
      const desiredOutSpaceValue2 = new GfMatrix4d(
        GfRotation([0, 1, 0], -90),
        new GfVec3d(0))

      const expectedInputValues = [
        0.0, 0.0, 0.0, 0.0, 3.0, 2.0, 9.0,
        0.0, -90.0, 0.0, 0.0, 0.0, 0.0, -10.0,
      ]

      _VerifySwitchInverseAndForwardResults(
        switchAttr, ExecIrTokens.rig2,
        [joint1, joint2],
        expectedInputValues,
        [desiredOutSpaceValue1, desiredOutSpaceValue2],
        execSystem)
    }
  })
}

// Adds a knot to attr's spline with the given value at the given time, with
// curve interpolation.
//
// testExecIrSwitchCompensation.cpp:399-442
function _SetSplineKnot(
  attr: UsdAttribute,
  time: UsdTimeCode,
  value: number,
): void {
  const valueType = TfType.declare(attr.typeName)

  // If the attribute doesn't already have a spline, author an empty spline
  // onto it.
  if (!attr.hasSpline()) {
    attr.setSpline(new TsSpline(valueType))
  }
  const spline = attr.getSpline()!

  // Get or create a knot at the given time.
  let knot = spline.getKnot(time.GetValue())
  if (!knot) {
    knot = new TsKnot(valueType)
    knot.SetTime(time.GetValue())
  }

  // Set the knots value and interpolation for the segment after the knot.
  knot.setValue(value)
  knot.setNextInterpolation(TsInterpCurve)

  // Set the knot on the spline and author the spline onto the attribute.
  spline.setKnot(knot)
  attr.setSpline(spline)
}

// Breaks down the given attribute's spline and copies all broken down values
// (which are _at_ the given time) to the corresponding pre-time, in
// preparation for authoring other values at the given time without disturbing
// animation in the interval before that time.
//
// testExecIrSwitchCompensation.cpp:444-470
function _BreakdownPreTime(
  attr: UsdAttribute,
  time: UsdTimeCode,
): void {
  const spline = attr.getSpline()!
  if (spline.canBreakdown(time.GetValue()).value) {
    spline.breakdown(time.GetValue())
  }

  const knot = spline.getKnot(time.GetValue())
  if (TF_VERIFY(knot !== undefined, 'spline.GetKnot(time.GetValue(), &knot)')) {
    const value = knot!.GetValue()
    knot!.setPreValue(value)
    if (!TF_VERIFY(spline.setKnot(knot!) !== undefined, 'spline.SetKnot(knot)')) {
      return
    }
  }

  attr.setSpline(spline)
}

// Author a value to a switch attribute with compensation that authors input
// avar values such that the overall pose is the same before and after the
// change to the switch attribute value.
//
// testExecIrSwitchCompensation.cpp:472-573
function _CompensateSwitch(
  time: UsdTimeCode,
  switchAttribute: UsdAttribute,
  switchValue: VtValue,
  inputAvars: readonly UsdAttribute[],
  outputSpaces: readonly UsdAttribute[],
): void {
  const execSystem = new ExecUsdSystem(switchAttribute.getStage())
  execSystem.changeTime(time)

  // Breakdown all input avar values to the pre-time, in preparation for
  // setting new values at the current time as we compensate.
  for (const attr of inputAvars) {
    _BreakdownPreTime(attr, time)
  }

  // Compute in the forward direction to get the current values of the output
  // spaces.
  const preSwitchSpaceValues: GfMatrix4d[] = []
  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const avar of outputSpaces) {
      valueKeys.push(new ExecUsdValueKey(avar))
    }
    const request = execSystem.buildRequest(valueKeys)
    const cache = execSystem.compute(request)

    for (let i = 0; i < outputSpaces.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      preSwitchSpaceValues.push(value.Get<GfMatrix4d>())
    }
  }

  // Invert to compute the input avar values that will keep the output spaces
  // the same when we author the new switch avar value.
  const inputAvarValues: number[] = []
  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const avar of inputAvars) {
      valueKeys.push(new ExecUsdValueKey(
        avar, ExecIrComputations.computeDesiredValue))
    }
    const request = execSystem.buildRequest(valueKeys)

    const overrides: ExecUsdValueOverrideVector = []
    overrides.push({
      valueKey: new ExecUsdValueKey(switchAttribute,
        ExecBuiltinComputations.computeValue),
      overrideValue: switchValue,
    })
    for (let i = 0; i < outputSpaces.length; ++i) {
      overrides.push({
        valueKey: new ExecUsdValueKey(outputSpaces[i]!,
          ExecIrComputations.explicitDesiredValue),
        overrideValue: VtValue.create(preSwitchSpaceValues[i]!, T.GfMatrix4d),
      })
    }

    const cache = execSystem.computeWithOverrides(request, overrides)

    for (let i = 0; i < inputAvars.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.double))
      inputAvarValues.push(value.Get<number>())
    }
  }

  // Author the switch value and the input avar values that compensate for
  // the switch value change.
  switchAttribute.setTimeSample(time.GetValue(), switchValue.Get<string>())
  for (let i = 0; i < inputAvarValues.length; ++i) {
    _SetSplineKnot(inputAvars[i]!, time, inputAvarValues[i]!)
  }

  // TEST: Compute in the forward direction to confirm we got the desired
  // values.
  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const avar of outputSpaces) {
      valueKeys.push(new ExecUsdValueKey(avar))
    }
    const request = execSystem.buildRequest(valueKeys)
    const cache = execSystem.compute(request)

    for (let i = 0; i < outputSpaces.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()', value.Get<GfMatrix4d>(), preSwitchSpaceValues[i]!)
    }
  }
}

// testExecIrSwitchCompensation.cpp:575-588
function _VerifyAvarValues(
  time: UsdTimeCode,
  inputAvars: readonly UsdAttribute[],
  expectedValues: readonly number[],
): void {
  _ASSERT_EQ('inputAvars.size()', inputAvars.length, expectedValues.length)
  for (let i = 0; i < inputAvars.length; ++i) {
    const value = inputAvars[i]!.getValueAtTime(time)
    if (TF_VERIFY(typeof value === 'number', 'inputAvars[i].Get(&value, time)')) {
      _ASSERT_CLOSE('value', value as number, expectedValues[i]!)
    }
  }
}

// testExecIrSwitchCompensation.cpp:590-602
function _VerifyComputedValue(
  time: UsdTimeCode,
  attr: UsdAttribute,
  expectedValue: GfMatrix4d,
): void {
  const execSystem = new ExecUsdSystem(attr.getStage())
  execSystem.changeTime(time)
  const request = execSystem.buildRequest([new ExecUsdValueKey(attr)])
  const cache = execSystem.compute(request)
  const value = cache.Get(0)
  TF_AXIOM(value.IsHolding(T.GfMatrix4d))
  _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()', value.Get<GfMatrix4d>(), expectedValue)
}

function _M(...v: number[]): GfMatrix4d {
  return new GfMatrix4d(...v)
}

// testExecIrSwitchCompensation.cpp:604-800
async function Test_WaddlerRigSwitchCompensation(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    TF_AXIOM(await _interim_ExecLoadPluginsAsync())

    // Create a scene that references the waddler rig.
    const rigLayer = SdfLayer.createAnonymous('.usda')
    rigLayer.importFromString(waddlerRigLayerContents)
    const layer = SdfLayer.createAnonymous('.usda')
    layer.importFromString(`#usda 1.0
        def Scope "Root" (
            references = @${rigLayer.identifier}@</Rig>
            ) {
        }
        `)
    const usdStage = await UsdStage.open(layer)
    TF_AXIOM(usdStage)

    const switchAttr = usdStage.getAttributeAtPath('/Root/Anim.switch')!
    TF_AXIOM(switchAttr && switchAttr.isValid())

    const joint1 = usdStage.getPrim('/Root/Anim/Joint1')!
    const joint2 = usdStage.getPrim('/Root/Anim/Joint1/Joint2')!
    TF_AXIOM(joint1 && joint2)

    const ry1 = joint1.getAttr(ExecIrTokens.avarsRy)!
    const ry2 = joint2.getAttr(ExecIrTokens.avarsRy)!
    TF_AXIOM(ry1.isValid() && ry2.isValid())

    const joint1Space = joint1.getAttr(ExecIrTokens.posedSpace)!
    const joint2Space = joint2.getAttr(ExecIrTokens.posedSpace)!
    TF_AXIOM(joint1Space.isValid() && joint2Space.isValid())
    const outputSpaces = [joint1Space, joint2Space]

    const inputAvars: UsdAttribute[] = []
    for (const prim of [joint1, joint2]) {
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsTx)!)
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsTy)!)
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsTz)!)
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsRx)!)
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsRy)!)
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsRz)!)
      inputAvars.push(prim.getAttr(ExecIrTokens.avarsRspin)!)
    }
    for (const attr of inputAvars) {
      TF_AXIOM(attr.isValid())
    }

    // Start the current time at 0.
    let currentTime = new UsdTimeCode(0.0)

    // Initialize all avars with empty splines and set 0.0 knots for all input
    // avars at the initial time and set an initial time sample for the switch
    // attribute selecting 'rig1'.
    //
    // This starts the waddler off at the origin, pointing up along the Z axis.
    for (const attr of inputAvars) {
      _SetSplineKnot(attr, currentTime, 0.0)
    }
    switchAttr.setTimeSample(currentTime.GetValue(), ExecIrTokens.rig1)

    // Verify that the posed spaces for both joints start where we expect:
    // - They both have the same orientation, which is the identity.
    // - They are both at X=0
    // - Joint1 is at Z=0
    // - Joint2 is at Z=10
    _VerifyComputedValue(
      currentTime,
      joint1Space,
      _M(1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1))
    _VerifyComputedValue(
      currentTime,
      joint2Space,
      _M(1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 10, 1))

    // Set the current time to 10.0 and author a knot to Joint1.avars:ry that
    // rotates the waddler so it is laying on the ground.
    currentTime = new UsdTimeCode(10.0)
    _SetSplineKnot(ry1, currentTime, 90.0)

    // Switch from rig1 to rig2, compensating into the input avars.
    _CompensateSwitch(
      currentTime,
      switchAttr, VtValue.create(ExecIrTokens.rig2, T.token),
      inputAvars, outputSpaces)

    // Verify the compensated input avar values:
    // - Joint2 now has the 90 degree rotation about Y because it is the
    //   parent.
    // - Joint2 is at X=10 because the rotation we applied moved it along the X
    //   axis.
    // - Joint2 is at Z=-10 because its rest position was at Z=10
    // - Joint1 is now zeroed out because it is now the child and inherits its
    //   transform from Joint2.
    _VerifyAvarValues(
      currentTime,
      inputAvars,
      [0, 0, 0, 0, 0, 0, 0,
        10, 0, -10, 0, 90, 0, 0])

    // Set the current time to 30.0 and author a knot to Joint2.avars:ry that
    // rotates the waddler so it is laying on the ground, pointing in the
    // direction of the -X axis.
    currentTime = new UsdTimeCode(30.0)
    _SetSplineKnot(ry2, currentTime, 270.0)

    // Switch from rig2 to rig1, compensating into the input avars.
    _CompensateSwitch(
      currentTime,
      switchAttr, VtValue.create(ExecIrTokens.rig1, T.token),
      inputAvars, outputSpaces)

    // Verify the compensated input avar values:
    // - Joint1 now has a -90 orientation about Y because it is now the parent
    //   and it is on the ground, pointing in the opposite direction from where
    //   it was at time=10.
    // - Joint1 is now at X=20 because the rotations we applied moved it along
    //   the X axis.
    // - Joint2 is now zeroed out because it is now the child and inherits its
    //   transform from Joint2.
    _VerifyAvarValues(
      currentTime,
      inputAvars,
      [20, 0, 0, 0, -90, 0, 0,
        0, 0, 0, 0, 0, 0, 0])

    // Set the current time to 50.0 and author a knot to Joint1.avars:ry that
    // rotates the waddler so it is laying on the ground, pointing in the
    // direction of the +X axis.
    currentTime = new UsdTimeCode(50.0)
    _SetSplineKnot(ry1, currentTime, 90.0)

    // Switch from rig1 to rig2, compensating into the input avars.
    _CompensateSwitch(
      currentTime,
      switchAttr, VtValue.create(ExecIrTokens.rig2, T.token),
      inputAvars, outputSpaces)

    // Verify the compensated input avar values:
    // - Joint2 now has the 90 degree rotation about Y because it is the parent
    //   and it is on the ground, in the same orientation as it was at
    //   time=10.
    // - Joint2 is at X=30 because the rotations we applied moved it along the
    //   X axis.
    // - Joint2 is at Z=-10 because its rest position was at Z=10
    // - Joint1 is now zeroed out because it is now the child and inherits its
    //   transform from Joint2.
    _VerifyAvarValues(
      currentTime,
      inputAvars,
      [0, 0, 0, 0, 0, 0, 0,
        30, 0, -10, 0, 90, 0, 0])

    // Set the current time to 60.0 and author a knot to Joint2.avars:ry that
    // rotates the waddler so it is back to pointing upward along the Z axis.
    currentTime = new UsdTimeCode(60.0)
    _SetSplineKnot(ry2, currentTime, 180.0)

    // Verify that the posed spaces for both joints ended up where we expect:
    // - They both have the same orientation, which is a rotation by 180 about
    //   the Y axis, relative to the identity (where they started).
    // - They are both at X=30
    // - Joint1 is at Z=10
    _VerifyComputedValue(
      currentTime,
      joint1Space,
      _M(-1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, -1, 0,
        30, 0, 10, 1))
    _VerifyComputedValue(
      currentTime,
      joint2Space,
      _M(-1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, -1, 0,
        30, 0, 0, 1))
  })
}

describe('testExecIrSwitchCompensation', () => {
  it('Test_WaddlerRigBasic', Test_WaddlerRigBasic)
  it('Test_WaddlerRigSwitchCompensation', Test_WaddlerRigSwitchCompensation)
})
