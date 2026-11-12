// Ported from OpenUSD 26.11.1: pxr/imaging/hdMtlx/tokens.cpp,
//  pxr/imaging/hdMtlx/tokens.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdMtlx/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** HdMtlxTokens (tokens.h:17-21) */
export const HdMtlxTokens = TfMakeTokens({
  surfaceshaderName: 'Surface',
  displacementshaderName: 'Displacement',
})
