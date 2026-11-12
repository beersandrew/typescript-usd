// Ported from OpenUSD 26.11.1: pxr/exec/vdf/tokens.cpp, pxr/exec/vdf/tokens.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/tokens.h and tokens.cpp.
//
// TF_DECLARE_PUBLIC_TOKENS(VdfTokens, VDF_API, VDF_TOKENS) (tokens.h:18-23),
// made with TfMakeTokens (pxr/base/tf/src/token.ts).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** VdfTokens (tokens.h:18-21). */
export const VdfTokens = TfMakeTokens({
  empty: '',
  in: 'in',
  out: 'out',
})
