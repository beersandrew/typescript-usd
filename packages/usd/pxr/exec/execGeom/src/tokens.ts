// Ported from OpenUSD 26.11.1: pxr/exec/execGeom/tokens.cpp,
//  pxr/exec/execGeom/tokens.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execGeom/tokens.h and tokens.cpp.
//
// TF_DECLARE_PUBLIC_TOKENS(ExecGeomXformableTokens, EXEC_GEOM_XFORMABLE_TOKENS)
// (tokens.h:20-24, tokens.cpp:11-12). TfToken is `string`.

export const ExecGeomXformableTokens = Object.freeze({
  computeLocalToWorldTransform: 'computeLocalToWorldTransform',
} as const)
