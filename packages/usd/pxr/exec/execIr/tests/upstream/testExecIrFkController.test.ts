// Ported from OpenUSD 26.11.1:
//  pxr/exec/execIr/testenv/testExecIrFkController.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/testenv/testExecIrFkController.cpp
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
// - _EnsureNoErrors (lines 47-53) is a TfErrorMark checked with TF_VERIFY at
//   the end of each test.

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
import { Stage as UsdStage, type Attribute as UsdAttribute } from 'typescript-usd/usd'
import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import {
  ExecUsdSystem, ExecUsdValueKey, type ExecUsdValueOverrideVector,
} from 'typescript-usd/execUsd'
import 'typescript-usd/execGeom'
import { ExecIrComputations, ExecIrTokens } from 'typescript-usd/execIr'

const T = VtValueTypes

// ASSERT_CLOSE (testExecIrFkController.cpp:34-45)
function _ASSERT_CLOSE(expr: string, actual: GfMatrix4d | number, expected: GfMatrix4d | number): void {
  const close = typeof actual === 'number'
    ? Math.abs(actual - (expected as number)) <= 1e-6
    : GfIsCloseMatrix(actual, expected as GfMatrix4d, 1e-6)
  if (!close) {
    TF_FATAL_ERROR(`Expected ${expr} == '${String(expected)}'; got '${String(actual)}'`)
  }
}

// struct _EnsureNoErrors (testExecIrFkController.cpp:47-53)
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
  expectTrue(await _interim_ExecLoadPluginsAsync())
  const layer = SdfLayer.createAnonymous('.usda')
  layer.importFromString(contents)
  return UsdStage.open(layer)
}

function expectTrue(v: boolean): void {
  TF_AXIOM(v)
}

function _M(...v: number[]): GfMatrix4d {
  return new GfMatrix4d(...v)
}

// GfMatrix4d(GfRotation(axis, angle), translation)
function _RotateXf(axis: [number, number, number], angle: number): GfMatrix4d {
  return new GfMatrix4d(GfRotation(axis, angle), new GfVec3d(0, 0, 0))
}

// testExecIrFkController.cpp:55-120
async function Test_IrForwardCompute(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`
        #usda 1.0

        def Scope "Root" {
            def IrFkController "FkController" {
                double in:rx =    90.0
                double in:ry =   -90.0
                double in:rz =    90.0
                double in:tx =     1.0
                double in:ty =     2.0
                double in:tz =     3.0
            }
        }
        `)
    TF_AXIOM(usdStage)

    const prim = usdStage.getPrim('/Root/FkController')!
    TF_AXIOM(prim)
    const outSpace = prim.getAttr(ExecIrTokens.outSpace)!
    TF_AXIOM(outSpace.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(outSpace, ExecBuiltinComputations.computeValue),
    ])
    TF_AXIOM(request.isValid())

    // Compute forward to get the output value produced by the authored scene.
    {
      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()',
        value.Get<GfMatrix4d>(),
        _M(0, 0, 1, 0,
          0, -1, 0, 0,
          1, 0, 0, 0,
          1, 2, 3, 1))
    }

    // Now set the parent space and compute again.
    {
      const parentSpace = prim.getAttr(ExecIrTokens.parentInSpace)!
      TF_AXIOM(parentSpace.isValid())
      parentSpace.set(_M(1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        1, 1, 1, 1))

      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()',
        value.Get<GfMatrix4d>(),
        _M(0, 0, 1, 0,
          0, -1, 0, 0,
          1, 0, 0, 0,
          2, 3, 4, 1))
    }
  })
}

// Tests inverse and forward computation by:
// - Solving for input avar values with the given desired values as goals for
//   the output spaces and confirming we get the expected input values.
// - Authoring the resulting input values onto the input avars and computing
//   the output spaces and confirming that we get the desired values that were
//   used for the initial inversion.
//
// testExecIrFkController.cpp:122-193
function _VerifyInverseAndForwardResults(
  inputAvars: readonly UsdAttribute[],
  expectedInputValues: readonly number[],
  outputSpaces: readonly UsdAttribute[],
  desiredValues: readonly GfMatrix4d[],
  execSystem: ExecUsdSystem,
): void {
  TF_AXIOM(inputAvars.length === expectedInputValues.length)
  TF_AXIOM(outputSpaces.length === desiredValues.length)

  // Invert, specifying the desired values as goals, and confirm we get the
  // expected input values.
  {
    const valueKeys: ExecUsdValueKey[] = []
    for (const attr of inputAvars) {
      valueKeys.push(new ExecUsdValueKey(
        attr, ExecIrComputations.computeDesiredValue))
    }
    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    const overrides: ExecUsdValueOverrideVector = []
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
    request.destroy()
  }

  // Author the expected input values and do a forward compute to confirm we
  // get the desired output values.
  {
    for (let i = 0; i < expectedInputValues.length; ++i) {
      inputAvars[i]!.set(expectedInputValues[i]!)
    }

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
    request.destroy()
  }
}

function _FkInputAttributes(prim: NonNullable<ReturnType<UsdStage['getPrim']>>): UsdAttribute[] {
  return [
    prim.getAttr(ExecIrTokens.inRx)!,
    prim.getAttr(ExecIrTokens.inRy)!,
    prim.getAttr(ExecIrTokens.inRz)!,
    prim.getAttr(ExecIrTokens.inRspin)!,
    prim.getAttr(ExecIrTokens.inTx)!,
    prim.getAttr(ExecIrTokens.inTy)!,
    prim.getAttr(ExecIrTokens.inTz)!,
  ]
}

// testExecIrFkController.cpp:195-301
async function Test_IrInverseCompute(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`#usda 1.0

        def Scope "Root" {
            def IrFkController "FkController" {
            }
        }
        `)
    TF_AXIOM(usdStage)

    const prim = usdStage.getPrim('/Root/FkController')!
    TF_AXIOM(prim)

    const outSpace = prim.getAttr(ExecIrTokens.outSpace)!
    TF_AXIOM(outSpace.isValid())

    const inputAttributes = _FkInputAttributes(prim)
    for (const attr of inputAttributes) {
      TF_AXIOM(attr.isValid())
    }

    const execSystem = new ExecUsdSystem(usdStage)

    const valueKeys: ExecUsdValueKey[] = []
    for (const attr of inputAttributes) {
      valueKeys.push(new ExecUsdValueKey(
        attr, ExecIrComputations.computeDesiredValue))
    }
    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    // Perform an inverse compute, to get the values of the invertible inputs
    // that produce the desired value for the output space.
    {
      const desiredOutSpaceValue = _M(0, 0, 1, 0,
        0, -1, 0, 0,
        1, 0, 0, 0,
        1, 2, 3, 1)

      // Expected input values in the same order as the value keys in the
      // request.
      const expectedInputValues = [
        90.0, -90.0, 90.0, 0.0, 1.0, 2.0, 3.0,
      ]

      _VerifyInverseAndForwardResults(
        inputAttributes, expectedInputValues,
        [outSpace], [desiredOutSpaceValue],
        execSystem)
    }

    // Invert with a different desired value.
    {
      const desiredOutSpaceValue = _M(0, 0, -1, 0,
        0, 1, 0, 0,
        1, 0, 0, 0,
        10, 20, 30, 1)

      // Expected input values in the same order as the value keys in the
      // request.
      const expectedInputValues = [
        0.0, 90.0, 0.0, 0.0, 10.0, 20.0, 30.0,
      ]

      _VerifyInverseAndForwardResults(
        inputAttributes, expectedInputValues,
        [outSpace], [desiredOutSpaceValue],
        execSystem)
    }

    // Now set the parent space and compute the inverse again.
    {
      const parentSpace = prim.getAttr(ExecIrTokens.parentInSpace)!
      TF_AXIOM(parentSpace.isValid())
      parentSpace.set(_M(1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        1, 1, 1, 1))

      const desiredOutSpaceValue = _M(0, 0, -1, 0,
        0, 1, 0, 0,
        1, 0, 0, 0,
        10, 20, 30, 1)

      // Expected input values in the same order as the value keys in the
      // request.
      const expectedInputValues = [
        0.0, 90.0, 0.0, 0.0, 9.0, 19.0, 29.0,
      ]

      _VerifyInverseAndForwardResults(
        inputAttributes, expectedInputValues,
        [outSpace], [desiredOutSpaceValue],
        execSystem)
    }
  })
}

// Test posing with default and parent spaces, using just translations, so that
// the results are easy to verify by hand (testExecIrFkController.cpp:303-393).
async function Test_IrSpacesTranslates(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`#usda 1.0

        def Scope "Root" {
            def IrFkController "FkController" {
                double in:tx = 5.0
                matrix4d in:defaultSpace = ((1,  0, 0, 0),
                                            (0,  1, 0, 0),
                                            (0,  0, 1, 0),
                                            (0, 10, 0, 1))
            }
        }
        `)
    TF_AXIOM(usdStage)

    const prim = usdStage.getPrim('/Root/FkController')!
    TF_AXIOM(prim)
    const outSpace = prim.getAttr(ExecIrTokens.outSpace)!
    TF_AXIOM(outSpace.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(outSpace, ExecBuiltinComputations.computeValue),
    ])
    TF_AXIOM(request.isValid())

    // Compute forward to get the output value produced by the authored scene.
    {
      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()',
        value.Get<GfMatrix4d>(),
        _M(1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          5, 10, 0, 1))
    }

    // Now set the parent space and compute again.
    {
      const parentSpace = prim.getAttr(ExecIrTokens.parentInSpace)!
      TF_AXIOM(parentSpace.isValid())
      parentSpace.set(_M(1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 20, 1))

      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(!value.IsEmpty())
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()',
        value.Get<GfMatrix4d>(),
        _M(1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          5, 10, 20, 1))
    }

    const inputAttributes = _FkInputAttributes(prim)
    for (const attr of inputAttributes) {
      TF_AXIOM(attr.isValid())
    }

    {
      const desiredOutSpaceValue = _M(1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        11, 22, 33, 1)

      // Expected input values in the same order as the value keys in the
      // request.
      const expectedInputValues = [
        0.0, 0.0, 0.0, 0.0, 11.0, 12.0, 13.0,
      ]

      _VerifyInverseAndForwardResults(
        inputAttributes, expectedInputValues,
        [outSpace], [desiredOutSpaceValue],
        execSystem)
    }
  })
}

// Test posing with default and parent spaces, using just rotations, so that the
// results are easy to verify by hand (testExecIrFkController.cpp:395-484).
async function Test_IrSpacesRotates(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`#usda 1.0

        def IrFkController "FkController" {
        }
        `)
    TF_AXIOM(usdStage)

    // Matrices representing rotations about the X axis by 30, 45, and 90
    // degrees.
    const rotateX30 = _RotateXf([1, 0, 0], 30)
    const rotateX45 = _RotateXf([1, 0, 0], 45)
    const rotateX90 = _RotateXf([1, 0, 0], 90)

    const prim = usdStage.getPrim('/FkController')!
    const outSpace = prim.getAttr(ExecIrTokens.outSpace)!
    const rx = prim.getAttr(ExecIrTokens.inRx)!
    const defaultSpace = prim.getAttr(ExecIrTokens.inDefaultSpace)!
    const parentSpace = prim.getAttr(ExecIrTokens.parentInSpace)!
    TF_AXIOM(prim && outSpace.isValid() && rx.isValid() &&
      defaultSpace.isValid() && parentSpace.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(outSpace, ExecBuiltinComputations.computeValue),
    ])

    // Set default space to a 45 degree rotation about X and pose by the same
    // rotation, resulting in a 90 degree rotation about X.
    {
      defaultSpace.set(rotateX45)
      rx.set(45.0)

      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(value.IsHolding(T.GfMatrix4d))
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()', value.Get<GfMatrix4d>(), rotateX90)
    }

    // Set default space and parent space to 30 degree rotations about X and
    // pose by the same rotation, resulting in a 90 degree rotation about X.
    {
      defaultSpace.set(rotateX30)
      parentSpace.set(rotateX30)
      rx.set(30.0)

      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(!value.IsEmpty())
      _ASSERT_CLOSE('value.Get<GfMatrix4d>()', value.Get<GfMatrix4d>(), new GfMatrix4d(rotateX90))
    }

    // Set default and parent space to 45 degree rotations about X and invert to
    // find the pose that make the out:space be the identity matrix, which is a
    // rotation about X of -90 degrees.
    {
      const inputAttributes = _FkInputAttributes(prim)
      for (const attr of inputAttributes) {
        TF_AXIOM(attr.isValid())
      }

      defaultSpace.set(rotateX45)
      parentSpace.set(rotateX45)

      const desiredOutSpaceValue = new GfMatrix4d(1)
      const expectedInputValues = [
        -90.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      ]

      _VerifyInverseAndForwardResults(
        inputAttributes, expectedInputValues,
        [outSpace], [desiredOutSpaceValue],
        execSystem)
    }
  })
}

// testExecIrFkController.cpp:486-585
async function Test_DependentFkControllers(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    // Create a scene with two fkControllers, where the child controller's
    // parent space is connected to the output of the parent controller.
    const usdStage = await _OpenStage(`#usda 1.0

        def Scope "Root" {
            def IrFkController "Parent" {
            }

            def IrFkController "Child" {
                matrix4d parentIn:space.connect = </Root/Parent.out:space>
            }
        }
        `)
    TF_AXIOM(usdStage)

    const parent = usdStage.getPrim('/Root/Parent')!
    const child = usdStage.getPrim('/Root/Child')!
    TF_AXIOM(parent && child)

    const parentOutSpace = parent.getAttr(ExecIrTokens.outSpace)!
    const childOutSpace = child.getAttr(ExecIrTokens.outSpace)!
    TF_AXIOM(parentOutSpace.isValid() && childOutSpace.isValid())

    const inputAttributes = [
      ..._FkInputAttributes(parent),
      ..._FkInputAttributes(child),
    ]
    for (const attr of inputAttributes) {
      TF_AXIOM(attr.isValid())
    }

    const execSystem = new ExecUsdSystem(usdStage)

    const desiredParentOutSpaceValue = _M(0, 0, 1, 0,
      0, -1, 0, 0,
      1, 0, 0, 0,
      0, 0, 0, 1)
    const desiredChildOutSpaceValue = new GfMatrix4d(desiredParentOutSpaceValue)
    desiredChildOutSpaceValue.setTranslateOnly(new GfVec3d(1, 2, 3))

    // Expected input values in the same order as the value keys in the request.
    const expectedInputValues = [
      90.0, -90.0, 90.0, 0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0, 3.0, -2.0, 1.0,
    ]

    _VerifyInverseAndForwardResults(
      inputAttributes, expectedInputValues,
      [parentOutSpace, childOutSpace],
      [desiredParentOutSpaceValue, desiredChildOutSpaceValue],
      execSystem)
  })
}

describe('testExecIrFkController', () => {
  it('Test_IrForwardCompute', Test_IrForwardCompute)
  it('Test_IrInverseCompute', Test_IrInverseCompute)
  it('Test_IrSpacesTranslates', Test_IrSpacesTranslates)
  it('Test_IrSpacesRotates', Test_IrSpacesRotates)
  it('Test_DependentFkControllers', Test_DependentFkControllers)
})
