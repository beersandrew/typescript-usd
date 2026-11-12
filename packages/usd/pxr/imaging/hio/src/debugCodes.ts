// Ported from OpenUSD 26.11.1: pxr/imaging/hio/debugCodes.cpp,
//  pxr/imaging/hio/debugCodes.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** debugCodes.h:16-22 */
export const HioDebugCodes = {
  HIO_DEBUG_GLSLFX: 'HIO_DEBUG_GLSLFX',
  HIO_DEBUG_TEXTURE_IMAGE_PLUGINS: 'HIO_DEBUG_TEXTURE_IMAGE_PLUGINS',
  HIO_DEBUG_FIELD_TEXTURE_DATA_PLUGINS: 'HIO_DEBUG_FIELD_TEXTURE_DATA_PLUGINS',
} as const

// debugCodes.cpp:17-25
TfDebug.registerDebugSymbol(HioDebugCodes.HIO_DEBUG_GLSLFX,
  'Hio GLSLFX info')
TfDebug.registerDebugSymbol(HioDebugCodes.HIO_DEBUG_TEXTURE_IMAGE_PLUGINS,
  'Hio image texture plugin registration and loading')
TfDebug.registerDebugSymbol(HioDebugCodes.HIO_DEBUG_FIELD_TEXTURE_DATA_PLUGINS,
  'Hio field texture data plugin registration and loading')
