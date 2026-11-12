// Ported from OpenUSD 26.11.1: pxr/exec/exec/debugCodes.cpp,
//  pxr/exec/exec/debugCodes.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/debugCodes.h and debugCodes.cpp.

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG_CODES (debugCodes.h:14-17). */
export const ExecDebugCodes = {
  EXEC_REQUEST_EXPIRATION: 'EXEC_REQUEST_EXPIRATION',
  EXEC_REQUEST_INVALIDATION: 'EXEC_REQUEST_INVALIDATION',
} as const

// TF_REGISTRY_FUNCTION(TfDebug) (debugCodes.cpp:13-19).
TfDebug.registerDebugSymbol(ExecDebugCodes.EXEC_REQUEST_EXPIRATION,
  'Report when request indices are expired.')
TfDebug.registerDebugSymbol(ExecDebugCodes.EXEC_REQUEST_INVALIDATION,
  'Report when requests are notified of invalidation')
