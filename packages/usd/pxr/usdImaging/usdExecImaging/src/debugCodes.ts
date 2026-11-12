// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdExecImaging/debugCodes.cpp,
//  pxr/usdImaging/usdExecImaging/debugCodes.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/debugCodes.{h,cpp}
// (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG_CODES (debugCodes.h:16-19). */
export const UsdExecImagingDebugCodes = {
  USDEXECIMAGING_REQUEST: 'USDEXECIMAGING_REQUEST',
  USDEXECIMAGING_GRAPH_AFTER_REBUILD: 'USDEXECIMAGING_GRAPH_AFTER_REBUILD',
} as const

// TF_REGISTRY_FUNCTION(TfDebug) (debugCodes.cpp:13-18).
TfDebug.registerDebugSymbol(UsdExecImagingDebugCodes.USDEXECIMAGING_REQUEST,
  'show UsdExecImaging_Request API calls')
TfDebug.registerDebugSymbol(UsdExecImagingDebugCodes.USDEXECIMAGING_GRAPH_AFTER_REBUILD,
  'write dot graph to file after rebuilding the exec request')
