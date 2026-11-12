// Ported from OpenUSD 26.11.1: pxr/exec/execIr/xformableComputations.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/xformableComputations.cpp.
//
// Importing this module runs the EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA block
// for ExecIrXformable, as loading the execIr library does upstream.

import 'typescript-usd/usdGeom'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  AttributeValue,
  Computation,
  EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA,
  IncomingConnections,
  NamespaceAncestor,
  Prim,
  type ExecComputationBuilder,
} from 'typescript-usd/exec'
import { ExecGeomXformableTokens } from 'typescript-usd/execGeom'

import { ExecIrComputations } from './computations.ts'
import { ExecIr_ControllerBuilderBase } from './controllerBuilder.ts'
import { ExecIrTokens } from './tokens.ts'
import { ExecIr_ComputeDefaultSpace, ExecIr_ComputeLocalXf } from './utils.ts'

const T = VtValueTypes

// Builder used to register computations for input and output attributes
// (xformableComputations.cpp:26-69).
//
// TODO (upstream): When the OpenExec core provides builtin support for
// inversion, we won't need to define any of the plugin computations defined
// by this builder.
class _Builder extends ExecIr_ControllerBuilderBase {
  constructor(self: ExecComputationBuilder) {
    super(self)
  }

  // Defines the computations needed for an attribute that provides input
  // values for an invertible controller, via an attribute connection, when
  // performing a forward computation (xformableComputations.cpp:255-271).
  InputAttribute(valueType: TfType, attributeName: string): void {
    // The 'computeDesiredValue' computation gets its value from the
    // 'computeDesiredValue' computation via incoming connections--but only if
    // there is exactly one desired value present. Otherwise, no value is
    // returned. An error is emitted if more than one desired value is present.
    this._self.attributeComputation(
      attributeName, ExecIrComputations.computeDesiredValue)
      .Callback<unknown>(valueType, (ctx: VdfContext) =>
        _Builder._getExactlyOneDesiredValue(valueType, ctx))
      .inputs(
        IncomingConnections(valueType,
          ExecIrComputations.computeDesiredValue))
  }

  // Defines the computations needed for an attribute that receives values
  // values from an invertible controller output, via an attribute connection,
  // when performing a forward computation (xformableComputations.cpp:273-279).
  outputAttribute(valueType: TfType, attributeName: string): void {
    // Output attributes support computing desired values, for inversion.
    this._desiredValueComputations(valueType, attributeName)
  }

  // Defines a computation named `computationName` that computes a
  // transformation inherited from a namespace ancestor
  // (xformableComputations.cpp:281-321).
  //
  // Finds the nearest namespace ancestor that is either IrXformable or
  // Xformable:
  // - If the ancestor is IrXformable, yields the value of the attribute named
  //   `spaceAttributeName`.
  // - If the ancestor is Xformable, yields the value of the ancestor's
  //   computeLocalToWorldTransform computation.
  //
  // This is done by defining (for IrXformable prims) and dispatching (for
  // Xformable prims) a computation named `ancestorComputationName`.
  inheritedTransformationComputation(
    computationName: string,
    ancestorComputationName: string,
    spaceAttributeName: string,
  ): void {
    // This computation finds the ancestorComputationName computation on the
    // nearest namespace ancestor that defines it.
    this._self.primComputation(computationName)
      .inputs(
        NamespaceAncestor(T.GfMatrix4d, ancestorComputationName)
          .fallsBackToDispatched())
      .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<GfMatrix4d>(T.GfMatrix4d, ancestorComputationName)
        ctx.setOutput(valuePtr ? valuePtr : new GfMatrix4d(1))
      })

    // Define an ancestorComputationName computation for all IrXformable prims
    // that returns the value of the attribute with the name given by
    // spaceAttributeName.
    this._self.primComputation(ancestorComputationName)
      .inputs(AttributeValue(T.GfMatrix4d, spaceAttributeName))
      .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
        ctx.setOutputToReferenceInput(spaceAttributeName)
      })

    // Dispatch an ancestorComputationName computation onto all Xformable prims
    // that returns the value of the 'computeLocalToWorldTransform' computation.
    this._self.dispatchedPrimComputation(
      ancestorComputationName,
      TfType.findByName('UsdGeomXformable'))
      .inputs(Computation(T.GfMatrix4d,
        ExecGeomXformableTokens.computeLocalToWorldTransform))
      .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
        ctx.setOutputToReferenceInput(
          ExecGeomXformableTokens.computeLocalToWorldTransform)
      })
  }
}

// TF_DEFINE_PRIVATE_TOKENS (xformableComputations.cpp:73-83)
const _tokens = {
  computedDefaultSpace: 'computedDefaultSpace',
  computedRestSpace: 'computedRestSpace',
  defaultTransRotOffsetXf: 'defaultTransRotOffsetXf',
  localRestXf: 'localRestXf',
  parentDefaultSpace: 'parentDefaultSpace',
  parentRestSpace: 'parentRestSpace',
  restTransRotOffsetXf: 'restTransRotOffsetXf',
} as const

// xformableComputations.cpp:85-253
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('ExecIrXformable', (self) => {
  const builder = new _Builder(self)

  builder.InputAttribute(T.double, ExecIrTokens.avarsTx)
  builder.InputAttribute(T.double, ExecIrTokens.avarsTy)
  builder.InputAttribute(T.double, ExecIrTokens.avarsTz)
  builder.InputAttribute(T.double, ExecIrTokens.avarsRx)
  builder.InputAttribute(T.double, ExecIrTokens.avarsRy)
  builder.InputAttribute(T.double, ExecIrTokens.avarsRz)
  builder.InputAttribute(T.double, ExecIrTokens.avarsRspin)
  builder.InputAttribute(T.token, ExecIrTokens.avarsRotationOrder)
  builder.InputAttribute(T.GfMatrix4d, ExecIrTokens.avarsDefaultSpace)

  // avars:defaultSpace has an expression that simply returns the value of
  // default:space.
  self.attributeExpression(ExecIrTokens.avarsDefaultSpace)
    .inputs(Prim().AttributeValue(T.GfMatrix4d,
      ExecIrTokens.defaultSpace))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext): GfMatrix4d => {
      return ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d,
        ExecIrTokens.defaultSpace)
    })

  builder.InputAttribute(T.double,
    ExecIrTokens.avarsUnitScaleFactor)

  builder.InputAttribute(T.double, ExecIrTokens.restTx)
  builder.InputAttribute(T.double, ExecIrTokens.restTy)
  builder.InputAttribute(T.double, ExecIrTokens.restTz)
  builder.InputAttribute(T.double, ExecIrTokens.restRx)
  builder.InputAttribute(T.double, ExecIrTokens.restRy)
  builder.InputAttribute(T.double, ExecIrTokens.restRz)
  builder.InputAttribute(T.GfMatrix4d, ExecIrTokens.restSpace)

  builder.InputAttribute(T.double, ExecIrTokens.defaultTx)
  builder.InputAttribute(T.double, ExecIrTokens.defaultTy)
  builder.InputAttribute(T.double, ExecIrTokens.defaultTz)
  builder.InputAttribute(T.double, ExecIrTokens.defaultRx)
  builder.InputAttribute(T.double, ExecIrTokens.defaultRy)
  builder.InputAttribute(T.double, ExecIrTokens.defaultRz)
  builder.InputAttribute(T.GfMatrix4d, ExecIrTokens.defaultSpace)

  // Compute default:space by taking the offsets defined by the default
  // scalars and combining them with the parent default space.
  //
  // Default space is a world space transform representing the 'zero' position
  // for posing. This may be different from the rest pose in order to provide
  // default scaling for a character, to make variants, or to set a more
  // natural starting place for animation controls. Default space combines the
  // effect of that local transform with the rest space offset.
  self.attributeExpression(ExecIrTokens.defaultSpace)
    .inputs(
      Prim().Computation(T.GfMatrix4d, _tokens.defaultTransRotOffsetXf),
      Prim().Computation(T.GfMatrix4d, _tokens.localRestXf),
      Prim().AttributeValue(T.GfMatrix4d, ExecIrTokens.parentDefaultSpace))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext): GfMatrix4d => {
      return ExecIr_ComputeDefaultSpace(
        ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, _tokens.defaultTransRotOffsetXf),
        new GfMatrix4d(1), // defaultScaleXf
        ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, _tokens.localRestXf),
        ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, ExecIrTokens.parentDefaultSpace))
    })

  // The defaultTransRotOffsetXf computation represents the local authored
  // offset from where defaultSpace would normally be relative to the
  // parent. Note that we don't pass in handedness here, because this offset
  // will be applied to rest space, which already incorporates handedness.
  self.primComputation(_tokens.defaultTransRotOffsetXf)
    .inputs(
      AttributeValue(T.double, ExecIrTokens.defaultTx),
      AttributeValue(T.double, ExecIrTokens.defaultTy),
      AttributeValue(T.double, ExecIrTokens.defaultTz),
      AttributeValue(T.double, ExecIrTokens.defaultRx),
      AttributeValue(T.double, ExecIrTokens.defaultRy),
      AttributeValue(T.double, ExecIrTokens.defaultRz))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
      return ExecIr_ComputeLocalXf(
        ctx.getInputValue<number>(T.double, ExecIrTokens.defaultTx),
        ctx.getInputValue<number>(T.double, ExecIrTokens.defaultTy),
        ctx.getInputValue<number>(T.double, ExecIrTokens.defaultTz),
        0.0, // rSpin
        ctx.getInputValue<number>(T.double, ExecIrTokens.defaultRx),
        ctx.getInputValue<number>(T.double, ExecIrTokens.defaultRy),
        ctx.getInputValue<number>(T.double, ExecIrTokens.defaultRz),
        ExecIrTokens.XYZ,
        ctx)
    })

  // rest:space is the value of the restTransRotOffsetXf computation relative
  // to the parentRestSpace.
  //
  // Rest space is a world space transform representing the position of this
  // transformable object before any posing has happened. The fallback value
  // combines the effect of the restTx/y/z/... attributes to yield a local
  // transform. restSpace inherits from the transform parent. The connected
  // value is orthonormalized.
  self.attributeExpression(ExecIrTokens.restSpace)
    .inputs(
      Prim().Computation(T.GfMatrix4d, _tokens.restTransRotOffsetXf),
      Prim().Computation(T.GfMatrix4d, _tokens.parentRestSpace))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
      return ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, _tokens.restTransRotOffsetXf)
        .getMultiply(
          ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, _tokens.parentRestSpace))
    })

  // Compute the local transform that is the result of combining the authored
  // values of the rest space scalars.
  self.primComputation(_tokens.restTransRotOffsetXf)
    .inputs(
      AttributeValue(T.double, ExecIrTokens.restTx),
      AttributeValue(T.double, ExecIrTokens.restTy),
      AttributeValue(T.double, ExecIrTokens.restTz),
      AttributeValue(T.double, ExecIrTokens.restRx),
      AttributeValue(T.double, ExecIrTokens.restRy),
      AttributeValue(T.double, ExecIrTokens.restRz))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
      return ExecIr_ComputeLocalXf(
        ctx.getInputValue<number>(T.double, ExecIrTokens.restTx),
        ctx.getInputValue<number>(T.double, ExecIrTokens.restTy),
        ctx.getInputValue<number>(T.double, ExecIrTokens.restTz),
        0.0, // rSpin
        ctx.getInputValue<number>(T.double, ExecIrTokens.restRx),
        ctx.getInputValue<number>(T.double, ExecIrTokens.restRy),
        ctx.getInputValue<number>(T.double, ExecIrTokens.restRz),
        ExecIrTokens.XYZ,
        ctx)
    })

  // Compute local transform that defines the delta from the parent.
  self.primComputation(_tokens.localRestXf)
    .inputs(
      AttributeValue(T.GfMatrix4d, ExecIrTokens.restSpace),
      Computation(T.GfMatrix4d, _tokens.parentRestSpace))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext) => {
      return ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d,
        ExecIrTokens.restSpace)
        .getMultiply(ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d,
          _tokens.parentRestSpace).getInverse())
    })

  // Define the parentRestSpace computation, which computes the parent rest
  // space.
  builder.inheritedTransformationComputation(
    _tokens.parentRestSpace,
    _tokens.computedRestSpace,
    ExecIrTokens.restSpace)

  builder.outputAttribute(T.GfMatrix4d, ExecIrTokens.posedSpace)
  builder.outputAttribute(T.GfMatrix4d, ExecIrTokens.posedDefaultSpace)

  builder.InputAttribute(T.GfMatrix4d, ExecIrTokens.parentSpace)
  builder.InputAttribute(T.GfMatrix4d, ExecIrTokens.parentDefaultSpace)

  self.attributeExpression(ExecIrTokens.parentDefaultSpace)
    .inputs(Prim().Computation(T.GfMatrix4d, _tokens.parentDefaultSpace))
    .Callback<GfMatrix4d>(T.GfMatrix4d, (ctx: VdfContext): GfMatrix4d => {
      return ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, _tokens.parentDefaultSpace)
    })

  // Define the parentDefaultSpace computation, which computes the parent
  // default space.
  builder.inheritedTransformationComputation(
    _tokens.parentDefaultSpace,
    _tokens.computedDefaultSpace,
    ExecIrTokens.defaultSpace)
})
