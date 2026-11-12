// Ported from OpenUSD 26.11.1:
//  pxr/exec/execIr/testenv/testExecIrSwitchController.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/testenv/testExecIrSwitchController.cpp
//
// Adaptations:
// - Importing typescript-usd/execIr registers the execIr schemas and
//   computations, as linking execIr does; typescript-usd/execGeom registers
//   the execGeom plugin. Library plugins load asynchronously on the web, so
//   each test awaits _interim_ExecLoadPluginsAsync() before compiling
//   (docs/openexec-x1.md decision D4).
// - UsdStage::Open of a layer is the asynchronous Stage.open; the stage and
//   layer API is typescript-usd's camelCase API.
// - ASSERT_CLOSE (lines 34-45) is _ASSERT_CLOSE, with GfIsClose of matrices
//   and doubles at 1e-6, raising TF_FATAL_ERROR (which throws).
// - ASSERT_EQ (lines 47-58) is _ASSERT_EQ with strict equality.
// - _EnsureNoErrors (lines 60-66) is a TfErrorMark checked with TF_VERIFY at
//   the end of the test.
// - UsdAttribute::Get(&value) is attr.get(), which hands out the resolved
//   value (a token is a string); "Get succeeded" is a value other than
//   undefined.

import { describe, it } from 'vitest'
import {
  TF_AXIOM, TF_FATAL_ERROR, TF_VERIFY, TfErrorMark,
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
  Stage as UsdStage, type Attribute as UsdAttribute, type Prim as UsdPrim,
} from 'typescript-usd/usd'
import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import {
  ExecUsdSystem, ExecUsdValueKey, type ExecUsdValueOverrideVector,
} from 'typescript-usd/execUsd'
import 'typescript-usd/execGeom'
import { ExecIrComputations, ExecIrTokens } from 'typescript-usd/execIr'

const T = VtValueTypes

// ASSERT_CLOSE (testExecIrSwitchController.cpp:34-45)
function _ASSERT_CLOSE(expr: string, actual: GfMatrix4d | number, expected: GfMatrix4d | number): void {
  const close = typeof actual === 'number'
    ? Math.abs(actual - (expected as number)) <= 1e-6
    : GfIsCloseMatrix(actual, expected as GfMatrix4d, 1e-6)
  if (!close) {
    TF_FATAL_ERROR(`Expected ${expr} == '${String(expected)}'; got '${String(actual)}'`)
  }
}

// ASSERT_EQ (testExecIrSwitchController.cpp:47-58)
function _ASSERT_EQ(expr: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    TF_FATAL_ERROR(`Expected ${expr} == '${String(expected)}'; got '${String(actual)}'`)
  }
}

// struct _EnsureNoErrors (testExecIrSwitchController.cpp:60-66)
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

async function _OpenStage(contents: string): Promise<UsdStage> {
  TF_AXIOM(await _interim_ExecLoadPluginsAsync())
  const layer = SdfLayer.createAnonymous('.usda')
  layer.importFromString(contents)
  return UsdStage.open(layer)
}

// GfMatrix4d(GfRotation(axis, angle), translation)
function _RotateXf(
  axis: [number, number, number], angle: number, translation: GfVec3d,
): GfMatrix4d {
  return new GfMatrix4d(GfRotation(axis, angle), translation)
}

// GfMatrix4d mat; mat.SetTranslate(t); return mat;
function _Translate(t: [number, number, number]): GfMatrix4d {
  return new GfMatrix4d().setTranslate(t)
}

// Tests inverse and forward computation through a switch controller by:
// - Solving for input avar values with a switch avar override that selects a
//   specified rig and the given desired values as goals for the output spaces,
//   to confirm we get the expected input values.
// - Authoring the switch avar value and authoring the resulting input values
//   onto the input avars and computing the output spaces, to confirm that we
//   get the desired values that were used as goals for the initial inversion.
//
// testExecIrSwitchController.cpp:68-164
function _VerifySwitchInverseAndForwardResults(
  switchAttribute: UsdAttribute,
  switchValue: string,
  inputPrims: readonly UsdPrim[],
  expectedInputValues: readonly number[],
  outputSpaces: readonly UsdAttribute[],
  desiredValues: readonly GfMatrix4d[],
  execSystem: ExecUsdSystem,
): void {
  TF_AXIOM(outputSpaces.length === desiredValues.length)

  // Verify that the switch value isn't what the switch is currently set to,
  // to make sure the switch value override has an effect.
  const value = switchAttribute.get()
  TF_AXIOM(value !== undefined)
  TF_AXIOM(value !== switchValue)

  const inputAvars: UsdAttribute[] = []
  for (const prim of inputPrims) {
    inputAvars.push(prim.getAttr(ExecIrTokens.inRx)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.inRy)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.inRz)!)
    inputAvars.push(
      prim.getAttr(ExecIrTokens.inRspin)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.inTx)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.inTy)!)
    inputAvars.push(prim.getAttr(ExecIrTokens.inTz)!)
  }
  TF_AXIOM(inputAvars.length === expectedInputValues.length)

  // Invert, specifying the desired values as goals, and confirm we get the
  // expected input values.
  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const avar of inputAvars) {
      valueKeys.push(new ExecUsdValueKey(
        avar, ExecIrComputations.computeDesiredValue))
    }
    TF_AXIOM(valueKeys.length === expectedInputValues.length)
    const request =
      execSystem.buildRequest(valueKeys)
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
    const cache =
      execSystem.computeWithOverrides(request, overrides)

    for (let i = 0; i < expectedInputValues.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.double))
      _ASSERT_CLOSE('value.Get<double>()', value.Get<number>(), expectedInputValues[i]!)
    }
    request.destroy()
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
    const request =
      execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    const cache = execSystem.compute(request)

    for (let i = 0; i < desiredValues.length; ++i) {
      const value = cache.Get(i)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()', value.Get<GfMatrix4d>(), desiredValues[i]!)
    }
    request.destroy()
  }
}

// testExecIrSwitchController.cpp:166-321
async function Test_BasicSwitch(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    // Create a scene with two rigs, each of which contains two independent FK
    // controllers, and a swtich controller that can select one of the rigs as
    // the source for two computed output spaces.
    const usdStage = await _OpenStage(`
        #usda 1.0

        def Scope "Root" {
            token switch = "rig1"

            def Scope "Rig1" {
                def IrFkController "FK1" {
                    double in:tx = 1.0
                }
                def IrFkController "FK2" {
                    double in:ty = 2.0
                }
            }

            def Scope "Rig2" {
                def IrFkController "FK1" {
                    double in:tx = 3.0
                }
                def IrFkController "FK2" {
                    double in:ty = 4.0
                }
            }

            def IrSwitchController "Switch1" {
                token switch.connect = </Root.switch>
                matrix4d rig1:space.connect = </Root/Rig1/FK1.out:space>
                matrix4d rig2:space.connect = </Root/Rig2/FK1.out:space>
            }

            def IrSwitchController "Switch2" {
                token switch.connect = </Root.switch>
                matrix4d rig1:space.connect = </Root/Rig1/FK2.out:space>
                matrix4d rig2:space.connect = </Root/Rig2/FK2.out:space>
            }
        }
        `)
    TF_AXIOM(usdStage)

    const joint1Space =
      usdStage.getAttributeAtPath('/Root/Switch1.out:space')!
    const joint2Space =
      usdStage.getAttributeAtPath('/Root/Switch2.out:space')!
    TF_AXIOM(joint1Space?.isValid() && joint2Space?.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const outputRequest = execSystem.buildRequest([
      new ExecUsdValueKey(joint1Space),
      new ExecUsdValueKey(joint2Space),
    ])
    TF_AXIOM(outputRequest.isValid())

    const switchAttr =
      usdStage.getAttributeAtPath('/Root.switch')!
    TF_AXIOM(switchAttr?.isValid())

    // With Rig1 active ('rig1' is the fallback value for the 'switch' avar),
    // compute in the forward direction and confirm that we get the values Rig1
    // computes as authored.
    {
      const cache = execSystem.compute(outputRequest)
      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        cache.Get(0).Get<GfMatrix4d>(),
        _Translate([1, 0, 0]))
      _ASSERT_CLOSE('cache.Get(1).Get<GfMatrix4d>()',
        cache.Get(1).Get<GfMatrix4d>(),
        _Translate([0, 2, 0]))
    }

    // Set the switch controller so Rig2 is active and compute in the forward
    // direction and confirm that we get the values Rig2 computes as authored.
    switchAttr.set(ExecIrTokens.rig2)

    {
      const cache = execSystem.compute(outputRequest)
      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        cache.Get(0).Get<GfMatrix4d>(),
        _Translate([3, 0, 0]))
      _ASSERT_CLOSE('cache.Get(1).Get<GfMatrix4d>()',
        cache.Get(1).Get<GfMatrix4d>(),
        _Translate([0, 4, 0]))
    }

    // Set the switch to Rig1 and test inverse computation with an override that
    // selects Rig2.
    switchAttr.set(ExecIrTokens.rig1)

    {
      const fk1 = usdStage.getPrim('/Root/Rig2/FK1')!
      const fk2 = usdStage.getPrim('/Root/Rig2/FK2')!
      TF_AXIOM(fk1 && fk2)

      const desiredOutSpaceValue1 = _RotateXf(
        [1, 0, 0], 90,
        new GfVec3d(0, 0, 0))
      const desiredOutSpaceValue2 = _RotateXf(
        [1, 0, 0], 0,
        new GfVec3d(10, 20, 30))

      const expectedInputValues = [
        90.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 0.0, 10.0, 20.0, 30.0,
      ]

      _VerifySwitchInverseAndForwardResults(
        switchAttr, ExecIrTokens.rig2,
        [fk1, fk2],
        expectedInputValues,
        [joint1Space, joint2Space],
        [desiredOutSpaceValue1, desiredOutSpaceValue2],
        execSystem)
    }

    // Verify the switch is now set to Rig2 and test inverse with an override
    // that selects Rig1.
    {
      const value = switchAttr.get()
      TF_AXIOM(value !== undefined)
      _ASSERT_EQ('value', value, ExecIrTokens.rig2)

      const fk1 = usdStage.getPrim('/Root/Rig1/FK1')!
      const fk2 = usdStage.getPrim('/Root/Rig1/FK2')!
      TF_AXIOM(fk1 && fk2)

      const desiredOutSpaceValue1 = _RotateXf(
        [1, 0, 0], 0,
        new GfVec3d(1, 2, 3))
      const desiredOutSpaceValue2 = _RotateXf(
        [0, 1, 0], -90,
        new GfVec3d(0, 0, 0))

      const expectedInputValues = [
        0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0,
        0.0, -90.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      ]

      _VerifySwitchInverseAndForwardResults(
        switchAttr, ExecIrTokens.rig1,
        [fk1, fk2],
        expectedInputValues,
        [joint1Space, joint2Space],
        [desiredOutSpaceValue1, desiredOutSpaceValue2],
        execSystem)
    }
  })
}

// main() (testExecIrSwitchController.cpp:323-326)
describe('testExecIrSwitchController', () => {
  it('Test_BasicSwitch', Test_BasicSwitch)
})
