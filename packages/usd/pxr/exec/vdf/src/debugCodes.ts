// Ported from OpenUSD 26.11.1: pxr/exec/vdf/debugCodes.cpp,
//  pxr/exec/vdf/debugCodes.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/debugCodes.h and debugCodes.cpp.
//
// TF_DEBUG codes are named by string (pxr/base/tf/src/debug.ts header).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG codes for Vdf execution (debugCodes.h:18-22). */
export const VdfDebugCodes = Object.freeze({
  VDF_MUNG_BUFFER_LOCKING: 'VDF_MUNG_BUFFER_LOCKING',
  VDF_SPARSE_INPUT_PATH_FINDER: 'VDF_SPARSE_INPUT_PATH_FINDER',
  VDF_SCHEDULING: 'VDF_SCHEDULING',
  VDF_PBEE_TRACE: 'VDF_PBEE_TRACE',
  VDF_SEE_TRACE: 'VDF_SEE_TRACE',
  VDF_SPARSE_OUTPUT_TRAVERSER_TRACING: 'VDF_SPARSE_OUTPUT_TRAVERSER_TRACING',
})

/**
 * The conditionally compiled codes (debugCodes.h:29-50) are compiled out by
 * default: TF_DEBUG on them is constant false, whatever the enabled state.
 */
export const VdfCompileTimeDisabledDebugCodes: ReadonlySet<string> = new Set([
  VdfDebugCodes.VDF_PBEE_TRACE,
  VdfDebugCodes.VDF_SEE_TRACE,
  VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING,
])

/** TF_DEBUG(code) for a Vdf code, honoring compile-time disabled codes. */
export function VdfIsDebugEnabled(code: string): boolean {
  return !VdfCompileTimeDisabledDebugCodes.has(code) && TfDebug.isEnabled(code)
}

// TF_REGISTRY_FUNCTION(TfDebug) (debugCodes.cpp:12-22).
TfDebug.registerDebugSymbol(VdfDebugCodes.VDF_MUNG_BUFFER_LOCKING,
  'Enable debugging output for mung buffer locking.')
TfDebug.registerDebugSymbol(VdfDebugCodes.VDF_SPARSE_INPUT_PATH_FINDER,
  'Enable debugging output for the sparse input path finder.')
TfDebug.registerDebugSymbol(VdfDebugCodes.VDF_SCHEDULING,
  'Enable debugging output for scheduling and schedule invalidation.')
