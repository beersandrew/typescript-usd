// Ported from OpenUSD 26.11.1: pxr/imaging/hioOpenVDB/debugCodes.cpp,
//  pxr/imaging/hioOpenVDB/debugCodes.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hioOpenVDB/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** debugCodes.h */
export const HioOpenVDBDebugCodes = {
  HIOOPENVDB_DEBUG_TEXTURE: 'HIOOPENVDB_DEBUG_TEXTURE',
} as const

// debugCodes.cpp:16-21
TfDebug.registerDebugSymbol(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
  'HioVDB texture loading')
