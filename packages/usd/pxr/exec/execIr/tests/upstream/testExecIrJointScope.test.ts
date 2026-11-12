// Ported from OpenUSD 26.11.1:
//  pxr/exec/execIr/testenv/testExecIrJointScope.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/testenv/testExecIrJointScope.cpp
//
// Adaptations:
// - Importing typescript-usd/execIr registers the execIr schemas and
//   computations, as linking execIr does; typescript-usd/execGeom registers
//   the execGeom plugin. Library plugins load asynchronously on the web, so
//   each test awaits _interim_ExecLoadPluginsAsync() before compiling
//   (docs/openexec-x1.md decision D4).
// - UsdStage::Open of a layer is the asynchronous Stage.open; the stage and
//   layer API is typescript-usd's camelCase API.
// - ASSERT_CLOSE (lines 35-46) is _ASSERT_CLOSE, with GfIsClose of matrices
//   and doubles at 1e-6, raising TF_FATAL_ERROR (which throws).
// - _EnsureNoErrors (lines 48-54) is a TfErrorMark checked with TF_VERIFY at
//   the end of each test.
// - GfMatrix4d operator* is GetMultiply (post-multiply, the same order).
// - UsdGeomXformable::AddXformOp(UsdGeomXformOp::TypeTransform) is
//   Xformable.addTransformOp(), and UsdGeomXformOp::Set(VtValue) is the
//   returned attribute's set().

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
import { Xformable as UsdGeomXformable } from 'typescript-usd/usdGeom'
import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import {
  ExecUsdSystem, ExecUsdValueKey, type ExecUsdValueOverrideVector,
} from 'typescript-usd/execUsd'
import 'typescript-usd/execGeom'
import { ExecIrComputations, ExecIrTokens } from 'typescript-usd/execIr'

const T = VtValueTypes

// ASSERT_CLOSE (testExecIrJointScope.cpp:35-46)
function _ASSERT_CLOSE(expr: string, actual: GfMatrix4d | number, expected: GfMatrix4d | number): void {
  const close = typeof actual === 'number'
    ? Math.abs(actual - (expected as number)) <= 1e-6
    : GfIsCloseMatrix(actual, expected as GfMatrix4d, 1e-6)
  if (!close) {
    TF_FATAL_ERROR(`Expected ${expr} == '${String(expected)}'; got '${String(actual)}'`)
  }
}

// struct _EnsureNoErrors (testExecIrJointScope.cpp:48-54)
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

function _M(...v: number[]): GfMatrix4d {
  return new GfMatrix4d(...v)
}

type UsdPrim = NonNullable<ReturnType<UsdStage['getPrim']>>

function _JointInputAttributes(joint: UsdPrim): UsdAttribute[] {
  return [
    joint.getAttr(ExecIrTokens.avarsRx)!,
    joint.getAttr(ExecIrTokens.avarsRy)!,
    joint.getAttr(ExecIrTokens.avarsRz)!,
    joint.getAttr(ExecIrTokens.avarsRspin)!,
    joint.getAttr(ExecIrTokens.avarsTx)!,
    joint.getAttr(ExecIrTokens.avarsTy)!,
    joint.getAttr(ExecIrTokens.avarsTz)!,
  ]
}

function _GetMatrix(value: VtValue): GfMatrix4d {
  TF_AXIOM(value.IsHolding(T.GfMatrix4d))
  return value.Get<GfMatrix4d>()
}

function _GetDouble(value: VtValue): number {
  TF_AXIOM(value.IsHolding(T.double))
  return value.Get<number>()
}

// testExecIrJointScope.cpp:56-191
async function Test_JointScopeBasic(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`#usda 1.0

        def Scope "Root" {
            def IrJointScope "Joint" {
                double avars:tx =   1.0
                double avars:ty =   2.0
                double avars:tz =   3.0
                double avars:rx =  90.0
                double avars:ry = -90.0
                double avars:rz =  90.0
                matrix4d posed:space.connect = [
                    </Root/FkController.out:space>
                ]
            }

            def IrFkController "FkController" {
                double in:tx.connect = </Root/Joint.avars:tx>
                double in:ty.connect = </Root/Joint.avars:ty>
                double in:tz.connect = </Root/Joint.avars:tz>
                double in:rx.connect = </Root/Joint.avars:rx>
                double in:ry.connect = </Root/Joint.avars:ry>
                double in:rz.connect = </Root/Joint.avars:rz>
                double in:rspin.connect = </Root/Joint.avars:rspin>
                token in:rotationOrder.connect = [
                    </Root/Joint.avars:rotationOrder>
                ]
                matrix4d in:defaultSpace.connect = [
                    </Root/Joint.avars:defaultSpace>
                ]
            }
        }
        `)
    TF_AXIOM(usdStage)

    const joint = usdStage.getPrim('/Root/Joint')!
    TF_AXIOM(joint)
    const posedSpace = joint.getAttr(ExecIrTokens.posedSpace)!
    TF_AXIOM(posedSpace.isValid())

    const inputAttributes = _JointInputAttributes(joint)
    for (const attr of inputAttributes) {
      TF_AXIOM(attr.isValid())
    }

    const execSystem = new ExecUsdSystem(usdStage)

    // Compute forward to get the output value produced by the authored
    // scene.
    {
      const request = execSystem.buildRequest([
        new ExecUsdValueKey(posedSpace, ExecBuiltinComputations.computeValue),
      ])
      TF_AXIOM(request.isValid())

      {
        const cache = execSystem.compute(request)
        _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
          _GetMatrix(cache.Get(0)),
          _M(0, 0, 1, 0,
            0, -1, 0, 0,
            1, 0, 0, 0,
            1, 2, 3, 1))
      }

      // Translate the rest space and compute again.
      const restTz = joint.getAttr(ExecIrTokens.restTz)!
      TF_AXIOM(restTz.isValid())
      restTz.set(10.0)

      {
        const cache = execSystem.compute(request)
        _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
          _GetMatrix(cache.Get(0)),
          _M(0, 0, 1, 0,
            0, -1, 0, 0,
            1, 0, 0, 0,
            1, 2, 13, 1))
      }
    }

    {
      const valueKeys: ExecUsdValueKey[] = []
      for (const attr of inputAttributes) {
        valueKeys.push(new ExecUsdValueKey(
          attr, ExecIrComputations.computeDesiredValue))
      }
      const request = execSystem.buildRequest(valueKeys)
      TF_AXIOM(request.isValid())

      // Perform an inverse compute, to get the values of the avars that
      // produce the desired value for the posed space.
      {
        const desiredPosedSpaceValue = _M(0, 0, 1, 0,
          0, -1, 0, 0,
          1, 0, 0, 0,
          6, 7, 18, 1)
        const overrides: ExecUsdValueOverrideVector = [{
          valueKey: new ExecUsdValueKey(posedSpace, ExecIrComputations.explicitDesiredValue),
          overrideValue: VtValue.create(desiredPosedSpaceValue, T.GfMatrix4d),
        }]
        const cache = execSystem.computeWithOverrides(request, overrides)

        // Expected input values in the same order as the value keys in the
        // request.
        const expectedInputValues = [
          90.0, -90.0, 90.0, 0.0, 6.0, 7.0, 8.0,
        ]
        for (let index = 0; index < expectedInputValues.length; ++index) {
          _ASSERT_CLOSE('cache.Get(index).Get<double>()',
            _GetDouble(cache.Get(index)),
            expectedInputValues[index]!)
        }
      }
    }
  })
}

// testExecIrJointScope.cpp:193-298
async function Test_JointScopeRestSpace(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`#usda 1.0

        def Xform "Root" {
            def IrJointScope "Joint" {
                double avars:ty = 10.0
                matrix4d posed:space.connect = [
                    </Root/FkController.out:space>
                ]
            }

            def IrFkController "FkController" {
                double in:tx.connect = </Root/Joint.avars:tx>
                double in:ty.connect = </Root/Joint.avars:ty>
                double in:tz.connect = </Root/Joint.avars:tz>
                double in:rx.connect = </Root/Joint.avars:rx>
                double in:ry.connect = </Root/Joint.avars:ry>
                double in:rz.connect = </Root/Joint.avars:rz>
                double in:rspin.connect = </Root/Joint.avars:rspin>
                token in:rotationOrder.connect = [
                    </Root/Joint.avars:rotationOrder>
                ]
                matrix4d in:defaultSpace.connect = [
                    </Root/Joint.avars:defaultSpace>
                ]
            }
        }
        `)
    TF_AXIOM(usdStage)

    const joint = usdStage.getPrim('/Root/Joint')!
    TF_AXIOM(joint)
    const posedSpace = joint.getAttr(ExecIrTokens.posedSpace)!
    TF_AXIOM(posedSpace.isValid())

    const inputAttributes = _JointInputAttributes(joint)
    for (const attr of inputAttributes) {
      TF_AXIOM(attr.isValid())
    }

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(posedSpace, ExecBuiltinComputations.computeValue),
    ])
    TF_AXIOM(request.isValid())

    // Compute forward to get the output value produced by the authored
    // scene.
    {
      const cache = execSystem.compute(request)
      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(0)),
        _M(1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 10, 0, 1))
    }

    // Rotate the posed space around the X axis.
    {
      const avarsRx = joint.getAttr(ExecIrTokens.avarsRx)!
      TF_AXIOM(avarsRx.isValid())
      avarsRx.set(90.0)

      const cache = execSystem.compute(request)
      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(0)),
        _M(1, 0, 0, 0,
          0, 0, 1, 0,
          0, -1, 0, 0,
          0, 10, 0, 1))
    }

    // Translate the rest space along the Z axis.
    {
      const restTz = joint.getAttr(ExecIrTokens.restTz)!
      TF_AXIOM(restTz.isValid())
      restTz.set(5.0)

      const cache = execSystem.compute(request)
      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(0)),
        _M(1, 0, 0, 0,
          0, 0, 1, 0,
          0, -1, 0, 0,
          0, 10, 5, 1))
    }
  })
}

// testExecIrJointScope.cpp:300-508
async function Test_JointScopeParentChild(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    // Create a scene with two fkControllers, where the child controller's
    // parent space is connected to the output of the parent controller.
    const usdStage = await _OpenStage(`#usda 1.0

        def Xform "Root" {
            def IrJointScope "ParentJoint" {
                double avars:rx = 90.0
                matrix4d posed:space.connect = [
                    </Root/ParentController.out:space>
                ]

                def IrJointScope "ChildJoint" {
                    double avars:tx =  1.0
                    double avars:ty =  2.0
                    double avars:tz =  3.0
                    double rest:tx  = 10.0
                    matrix4d posed:space.connect = [
                        </Root/ChildController.out:space>
                    ]
                }
            }

            def IrFkController "ParentController" {
                double in:tx.connect = </Root/ParentJoint.avars:tx>
                double in:ty.connect = </Root/ParentJoint.avars:ty>
                double in:tz.connect = </Root/ParentJoint.avars:tz>
                double in:rx.connect = </Root/ParentJoint.avars:rx>
                double in:ry.connect = </Root/ParentJoint.avars:ry>
                double in:rz.connect = </Root/ParentJoint.avars:rz>
                double in:rspin.connect = </Root/ParentJoint.avars:rspin>
                token in:rotationOrder.connect = [
                    </Root/ParentJoint.avars:rotationOrder>
                ]
                matrix4d in:defaultSpace.connect = [
                    </Root/ParentJoint.avars:defaultSpace>
                ]
            }

            def IrFkController "ChildController" {
                double in:tx.connect = </Root/ParentJoint/ChildJoint.avars:tx>
                double in:ty.connect = </Root/ParentJoint/ChildJoint.avars:ty>
                double in:tz.connect = </Root/ParentJoint/ChildJoint.avars:tz>
                double in:rx.connect = </Root/ParentJoint/ChildJoint.avars:rx>
                double in:ry.connect = </Root/ParentJoint/ChildJoint.avars:ry>
                double in:rz.connect = </Root/ParentJoint/ChildJoint.avars:rz>
                double in:rspin.connect = [
                    </Root/ParentJoint/ChildJoint.avars:rspin>
                ]
                token in:rotationOrder.connect = [
                    </Root/ParentJoint/ChildJoint.avars:rotationOrder>
                ]
                matrix4d in:defaultSpace.connect = [
                    </Root/ParentJoint/ChildJoint.avars:defaultSpace>
                ]
                matrix4d parentIn:defaultSpace.connect = [
                    </Root/ParentController.out:defaultSpace>
                ]
                matrix4d parentIn:space.connect = [
                    </Root/ParentController.out:space>
                ]
            }
        }
        `)
    TF_AXIOM(usdStage)

    const parent = usdStage.getPrim('/Root/ParentJoint')!
    const child = usdStage.getPrim('/Root/ParentJoint/ChildJoint')!
    TF_AXIOM(parent && child)

    const parentPosedSpace = parent.getAttr(ExecIrTokens.posedSpace)!
    const childPosedSpace = child.getAttr(ExecIrTokens.posedSpace)!
    TF_AXIOM(parentPosedSpace.isValid() && childPosedSpace.isValid())

    const inputAttributes = [
      ..._JointInputAttributes(parent),
      ..._JointInputAttributes(child),
    ]
    for (const attr of inputAttributes) {
      TF_AXIOM(attr.isValid())
    }

    const execSystem = new ExecUsdSystem(usdStage)

    const outputRequest = execSystem.buildRequest([
      new ExecUsdValueKey(parentPosedSpace, ExecBuiltinComputations.computeValue),
      new ExecUsdValueKey(childPosedSpace, ExecBuiltinComputations.computeValue),
    ])
    TF_AXIOM(outputRequest.isValid())

    // Matrices representing rotations about the X and Y axes by 90 degrees.
    const rotateX90 = new GfMatrix4d(GfRotation([1, 0, 0], 90), new GfVec3d(0, 0, 0))
    const rotateY90 = new GfMatrix4d(GfRotation([0, 1, 0], 90), new GfVec3d(0, 0, 0))

    // Compute in the forward direction.
    {
      const cache = execSystem.compute(outputRequest)

      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(0)), rotateX90)
      _ASSERT_CLOSE('cache.Get(1).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(1)),
        new GfMatrix4d().setTranslate(new GfVec3d(11, 2, 3)).getMultiply(rotateX90))
    }

    const valueKeys: ExecUsdValueKey[] = []
    for (const attr of inputAttributes) {
      valueKeys.push(new ExecUsdValueKey(
        attr, ExecIrComputations.computeDesiredValue))
    }
    const inputRequest = execSystem.buildRequest(valueKeys)
    TF_AXIOM(inputRequest.isValid())

    const desiredParentPosedSpaceValue = new GfMatrix4d(rotateY90)
    const desiredChildPosedSpaceValue = new GfMatrix4d(desiredParentPosedSpaceValue)
    desiredChildPosedSpaceValue.setTranslateOnly(new GfVec3d(15, 20, 0))

    // The expected results are:
    // - The parent posed space is rotated by 90 degrees about the Y axis.
    // - The child posed space is in a space that receives the parent rotation,
    //   which results in:
    //   o X is -10 (the Z goal rotated to the X axis, offsetting rest space)
    //   o Y is 20 (directly from the goal, no rotation since we rotate about Y)
    //   o Z is 15 (from the goal, rotated from X to Z)
    const expectedInputValues = [
      0.0, 90.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0, -10.0, 20.0, 15.0,
    ]

    {
      const overrides: ExecUsdValueOverrideVector = [
        {
          valueKey: new ExecUsdValueKey(parentPosedSpace, ExecIrComputations.explicitDesiredValue),
          overrideValue: VtValue.create(desiredParentPosedSpaceValue, T.GfMatrix4d),
        },
        {
          valueKey: new ExecUsdValueKey(childPosedSpace, ExecIrComputations.explicitDesiredValue),
          overrideValue: VtValue.create(desiredChildPosedSpaceValue, T.GfMatrix4d),
        },
      ]
      const cache = execSystem.computeWithOverrides(inputRequest, overrides)

      for (let index = 0; index < expectedInputValues.length; ++index) {
        _ASSERT_CLOSE('cache.Get(index).Get<double>()',
          _GetDouble(cache.Get(index)),
          expectedInputValues[index]!)
      }
    }

    // Author the expected input values and confirm we get the desired output
    // values.
    {
      let index = 0
      for (const attr of inputAttributes) {
        attr.set(expectedInputValues[index++]!)
      }

      const cache = execSystem.compute(outputRequest)

      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(0)), desiredParentPosedSpaceValue)
      _ASSERT_CLOSE('cache.Get(1).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(1)), desiredChildPosedSpaceValue)
    }

    // Add a transform on the root Xform and test that it is inherited by the
    // JointScope.
    {
      TF_AXIOM(usdStage.getPrim('/Root'))
      const xformable = new UsdGeomXformable(usdStage.getPrim('/Root'))
      TF_AXIOM(xformable.isValid())

      const rootTransform = new GfMatrix4d()
      rootTransform.setTranslate(new GfVec3d(1.1, 2.2, 3.3))

      const transformOp = xformable.addTransformOp()
      transformOp.set(rootTransform)

      const cache = execSystem.compute(outputRequest)
      _ASSERT_CLOSE('cache.Get(0).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(0)),
        desiredParentPosedSpaceValue.getMultiply(rootTransform))
      _ASSERT_CLOSE('cache.Get(1).Get<GfMatrix4d>()',
        _GetMatrix(cache.Get(1)),
        desiredChildPosedSpaceValue.getMultiply(rootTransform))
    }
  })
}

describe('testExecIrJointScope', () => {
  it('Test_JointScopeBasic', Test_JointScopeBasic)
  it('Test_JointScopeRestSpace', Test_JointScopeRestSpace)
  it('Test_JointScopeParentChild', Test_JointScopeParentChild)
})
