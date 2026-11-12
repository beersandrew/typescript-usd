// Ported from OpenUSD 26.11.1: pxr/imaging/hdMtlx/debugCodes.cpp,
//  pxr/imaging/hdMtlx/debugCodes.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdMtlx/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG_CODES (debugCodes.h:15-20) */
export const HdMtlxDebugCodes = {
  HDMTLX_DOCUMENT: 'HDMTLX_DOCUMENT',
  HDMTLX_VERSION_UPGRADE: 'HDMTLX_VERSION_UPGRADE',
  HDMTLX_WRITE_DOCUMENT: 'HDMTLX_WRITE_DOCUMENT',
  HDMTLX_WRITE_DOCUMENT_WITHOUT_INCLUDES: 'HDMTLX_WRITE_DOCUMENT_WITHOUT_INCLUDES',
} as const

// debugCodes.cpp:14-28
TfDebug.registerDebugSymbol(HdMtlxDebugCodes.HDMTLX_DOCUMENT,
  'Debug messages while the document is being generated.')
TfDebug.registerDebugSymbol(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE,
  'Write the MaterialX documents to disk, before and after the version upgrade')
TfDebug.registerDebugSymbol(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT,
  'Write the MaterialX document to disk after reconstruction in Hydra')
TfDebug.registerDebugSymbol(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT_WITHOUT_INCLUDES,
  'Write the MaterialX document to disk after reconstruction in Hydra, ' +
  'omitting the included files.')
