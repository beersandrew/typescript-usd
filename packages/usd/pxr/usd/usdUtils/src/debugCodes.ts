// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/debugCodes.cpp,
//  pxr/usd/usdUtils/debugCodes.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** debugCodes.h:15-17 */
export const UsdUtilsDebugCodes = {
  USDUTILS_CREATE_PACKAGE: 'USDUTILS_CREATE_PACKAGE',
} as const

// debugCodes.cpp:15-19
TfDebug.registerDebugSymbol(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE,
  'UsdUtils asset localization details')
