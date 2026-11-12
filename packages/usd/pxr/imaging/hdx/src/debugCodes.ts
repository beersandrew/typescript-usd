// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/debugCodes.cpp,
//  pxr/imaging/hdx/debugCodes.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG_CODES (debugCodes.h:17-25) */
export const HdxDebugCodes = {
  HDX_DEBUG_DUMP_SHADOW_TEXTURES: 'HDX_DEBUG_DUMP_SHADOW_TEXTURES',
  HDX_DISABLE_ALPHA_TO_COVERAGE: 'HDX_DISABLE_ALPHA_TO_COVERAGE',
  HDX_INTERSECT: 'HDX_INTERSECT',
  HDX_SELECTION_SETUP: 'HDX_SELECTION_SETUP',
} as const

// debugCodes.cpp:15-25
TfDebug.registerDebugSymbol(HdxDebugCodes.HDX_DEBUG_DUMP_SHADOW_TEXTURES,
  'Output shadow textures to image files')
TfDebug.registerDebugSymbol(HdxDebugCodes.HDX_DISABLE_ALPHA_TO_COVERAGE,
  'Disable alpha to coverage transpancy')
TfDebug.registerDebugSymbol(HdxDebugCodes.HDX_INTERSECT,
  'Output debug info of intersector')
TfDebug.registerDebugSymbol(HdxDebugCodes.HDX_SELECTION_SETUP,
  'Output debug info during creation of selection buffer')
