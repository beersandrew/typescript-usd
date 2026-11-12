// Ported from OpenUSD 26.11.1: pxr/imaging/pxOsd/tokens.cpp,
//  pxr/imaging/pxOsd/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/pxOsd/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

// tokens.h:16-31 PXOSD_OPENSUBDIV_TOKENS.
export const PxOsdOpenSubdivTokens = TfMakeTokens({
  all: 'all',
  none: 'none',
  cornersOnly: 'cornersOnly',
  cornersPlus1: 'cornersPlus1',
  cornersPlus2: 'cornersPlus2',
  boundaries: 'boundaries',
  bilinear: 'bilinear',
  catmullClark: 'catmullClark',
  loop: 'loop',
  edgeOnly: 'edgeOnly',
  edgeAndCorner: 'edgeAndCorner',
  uniform: 'uniform',
  chaikin: 'chaikin',
  leftHanded: 'leftHanded',
  rightHanded: 'rightHanded',
  smooth: 'smooth',
})
