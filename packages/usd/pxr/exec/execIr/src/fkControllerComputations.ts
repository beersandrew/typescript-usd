// Ported from OpenUSD 26.11.1: pxr/exec/execIr/fkControllerComputations.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/fkControllerComputations.cpp.
//
// Importing this module runs the EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA block
// for ExecIrFkController, as loading the execIr library does upstream.

import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from 'typescript-usd/exec'

import { ExecIrControllerBuilder } from './controllerBuilder.ts'
import { ExecIrTokens } from './tokens.ts'
import type { ExecIrResult } from './types.ts'
import {
  ExecIr_ComputeFkParams,
  ExecIr_UtilsCompute,
  ExecIr_UtilsComputeLocalRotation,
  ExecIr_UtilsComputeLocalTranslation,
  ExecIr_UtilsInvert,
} from './utils.ts'

const T = VtValueTypes

// fkControllerComputations.cpp:25-49
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('ExecIrFkController', (self) => {
  const builder = new ExecIrControllerBuilder(self, _Compute, _Invert)

  builder.invertibleInputAttribute(T.double, ExecIrTokens.inTx)
  builder.invertibleInputAttribute(T.double, ExecIrTokens.inTy)
  builder.invertibleInputAttribute(T.double, ExecIrTokens.inTz)
  builder.invertibleInputAttribute(T.double, ExecIrTokens.inRx)
  builder.invertibleInputAttribute(T.double, ExecIrTokens.inRy)
  builder.invertibleInputAttribute(T.double, ExecIrTokens.inRz)
  builder.invertibleInputAttribute(T.double, ExecIrTokens.inRspin)

  builder.nonInvertibleInputAttribute(T.GfMatrix4d,
    ExecIrTokens.parentInSpace)
  builder.nonInvertibleInputAttribute(T.GfMatrix4d,
    ExecIrTokens.parentInDefaultSpace)

  builder.invertibleOutputAttribute(T.GfMatrix4d, ExecIrTokens.outSpace)

  builder.switchAttribute(T.token, ExecIrTokens.inRotationOrder)

  builder.passthroughAttributes(T.GfMatrix4d,
    ExecIrTokens.inDefaultSpace,
    ExecIrTokens.outDefaultSpace)

  // ~ExecIrControllerBuilder at the end of the block.
  builder.destroy()
})

// Returns the forward-computed result for out:space
// (fkControllerComputations.cpp:51-63).
function _Compute(ctx: VdfContext): ExecIrResult {
  const outSpaceValue = ExecIr_UtilsCompute(
    ExecIr_ComputeFkParams(ctx),
    ExecIr_UtilsComputeLocalTranslation(ctx),
    ExecIr_UtilsComputeLocalRotation(ctx))

  return new Map([
    [ExecIrTokens.outSpace, VtValue.create(outSpaceValue, T.GfMatrix4d)]])
}

// Populates the result map with inverted values that attempt to satisfy the
// given posed space (fkControllerComputations.cpp:65-78).
function _Invert(ctx: VdfContext): ExecIrResult {
  const posedSpace =
    ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, ExecIrTokens.outSpace)

  const resultMap: ExecIrResult = new Map()
  ExecIr_UtilsInvert(
    ctx, posedSpace, ExecIr_ComputeFkParams(ctx), resultMap)
  return resultMap
}
