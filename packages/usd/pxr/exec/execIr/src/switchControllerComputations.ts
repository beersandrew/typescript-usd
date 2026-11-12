// Ported from OpenUSD 26.11.1:
//  pxr/exec/execIr/switchControllerComputations.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/switchControllerComputations.cpp.
//
// Importing this module runs the EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA block
// for ExecIrSwitchController, as loading the execIr library does upstream.

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { TF_VERIFY } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from 'typescript-usd/exec'

import { ExecIrControllerBuilder } from './controllerBuilder.ts'
import { ExecIrTokens } from './tokens.ts'
import type { ExecIrResult } from './types.ts'

const T = VtValueTypes

// TODO (upstream): This switch controller is hard coded to support two rigs,
// each of which controls two joint scopes. In the future, a general switch
// controller schema will be configurable via application of multi-apply
// schemas.
//
// switchControllerComputations.cpp:24-39
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('ExecIrSwitchController', (self) => {
  const builder = new ExecIrControllerBuilder(self, _Compute, _Invert)

  builder.switchAttribute(T.token, ExecIrTokens.switch_)

  builder.invertibleInputAttributes(T.GfMatrix4d, [
    ExecIrTokens.rig1Space,
    ExecIrTokens.rig2Space,
  ])

  builder.invertibleOutputAttribute(T.GfMatrix4d, ExecIrTokens.outSpace)

  // ~ExecIrControllerBuilder at the end of the block.
  builder.destroy()
})

// The switch controller forward computation passes through the computed values
// for the rig that is currently selected, based on the value of the swtich
// avar (switchControllerComputations.cpp:41-65).
function _Compute(ctx: VdfContext): ExecIrResult {
  const switchValue = ctx.getInputValue<string>(T.token,
    ExecIrTokens.switch_)
  if (switchValue === ExecIrTokens.rig1) {
    return new Map([
      [ExecIrTokens.outSpace,
        VtValue.create(ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, ExecIrTokens.rig1Space),
          T.GfMatrix4d)],
    ])
  } else if (switchValue === ExecIrTokens.rig2) {
    return new Map([
      [ExecIrTokens.outSpace,
        VtValue.create(ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, ExecIrTokens.rig2Space),
          T.GfMatrix4d)],
    ])
  } else {
    TF_VERIFY(false, 'false', `Unexpected switch value '${switchValue}'`)
    // `return {{}};` list-initializes the result with one value-initialized
    // entry: an empty token mapped to an empty VtValue.
    return new Map([['', VtValue.getEmpty()]])
  }
}

// The switch controller inverse computation passes through the inverted values
// for the rig that is currently selected, based on the value of the swtich
// avar (switchControllerComputations.cpp:67-91).
function _Invert(ctx: VdfContext): ExecIrResult {
  const switchValue = ctx.getInputValue<string>(T.token,
    ExecIrTokens.switch_)
  if (switchValue === ExecIrTokens.rig1) {
    return new Map([
      [ExecIrTokens.rig1Space,
        VtValue.create(ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, ExecIrTokens.outSpace),
          T.GfMatrix4d)],
    ])
  } else if (switchValue === ExecIrTokens.rig2) {
    return new Map([
      [ExecIrTokens.rig2Space,
        VtValue.create(ctx.getInputValue<GfMatrix4d>(T.GfMatrix4d, ExecIrTokens.outSpace),
          T.GfMatrix4d)],
    ])
  } else {
    TF_VERIFY(false, 'false', `Unexpected switch value '${switchValue}'`)
    // `return {{}};` list-initializes the result with one value-initialized
    // entry: an empty token mapped to an empty VtValue.
    return new Map([['', VtValue.getEmpty()]])
  }
}
