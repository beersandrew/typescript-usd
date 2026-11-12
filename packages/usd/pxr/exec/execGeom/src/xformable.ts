// Ported from OpenUSD 26.11.1: pxr/exec/execGeom/xformable.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execGeom/xformable.cpp.
//
// This module is the execGeom plugin's library (plugInfo.json "LibraryPath",
// src/plugin/registerPlugin.ts): importing it runs the
// EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA block below, as loading the execGeom
// shared library runs its TF_REGISTRY_FUNCTION(ExecDefinitionRegistryTag).
// Exec_PluginData loads it (PlugPlugin.LoadAsync, then Load) when exec first
// looks up computations for UsdGeomXformable.

import 'typescript-usd/usdGeom'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  AttributeValue,
  EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA,
  NamespaceAncestor,
} from 'typescript-usd/exec'

import { ExecGeomXformableTokens } from './tokens.ts'

// TF_DEFINE_PRIVATE_TOKENS (xformable.cpp:18-22)
const _tokens = {
  xformOpTransform: 'xformOp:transform',
} as const

const GfMatrix4dType = VtValueTypes.GfMatrix4d

// xformable.cpp:24-48
function _ComputeLocalToWorldTransform(ctx: VdfContext): GfMatrix4d {
  const localToParent =
    ctx.getInputValuePtr<GfMatrix4d>(
      GfMatrix4dType, _tokens.xformOpTransform)

  const parentToWorld =
    ctx.getInputValuePtr<GfMatrix4d>(
      GfMatrix4dType, ExecGeomXformableTokens.computeLocalToWorldTransform)

  // The computed local-to-world matrix is the local matrix multiplied with
  // the parent local-to-world, if we have both. If we are missing either
  // value, then the matrix we have provides the local-to-world transform. And
  // if we have neither, we fall back to the identity matrix.
  if (parentToWorld) {
    return localToParent
      ? localToParent.getMultiply(parentToWorld)
      : parentToWorld
  } else {
    return localToParent
      ? localToParent
      : new GfMatrix4d(1.0)
  }
}

// xformable.cpp:50-60
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('UsdGeomXformable', (self) => {
  self.primComputation(ExecGeomXformableTokens.computeLocalToWorldTransform)
    .Callback<GfMatrix4d>(GfMatrix4dType, _ComputeLocalToWorldTransform)
    .inputs(
      AttributeValue(GfMatrix4dType,
        _tokens.xformOpTransform),
      NamespaceAncestor(GfMatrix4dType,
        ExecGeomXformableTokens.computeLocalToWorldTransform),
    )
})
