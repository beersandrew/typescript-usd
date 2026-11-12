// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/tokens.cpp,
//  pxr/imaging/geomUtil/tokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** tokens.h:16-22 GEOMUTIL_INTERPOLATION_TOKENS */
export const GeomUtilInterpolationTokens = TfMakeTokens({
  constant: 'constant',
  uniform: 'uniform',
  vertex: 'vertex',
})
