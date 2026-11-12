// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/debugCodes.cpp,
//  pxr/imaging/hgi/debugCodes.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** debugCodes.h:18-23 */
export const HgiDebugCodes = {
  HGI_DEBUG_DEVICE_CAPABILITIES: 'HGI_DEBUG_DEVICE_CAPABILITIES',
  HGI_DEBUG_INSTANCE_CREATION: 'HGI_DEBUG_INSTANCE_CREATION',
  HGI_DEBUG_IS_SUPPORTED: 'HGI_DEBUG_IS_SUPPORTED',
} as const

// debugCodes.cpp:17-26
TfDebug.registerDebugSymbol(HgiDebugCodes.HGI_DEBUG_DEVICE_CAPABILITIES,
  'Hgi report when device capabilities are initialized and dump contents')
TfDebug.registerDebugSymbol(HgiDebugCodes.HGI_DEBUG_INSTANCE_CREATION,
  'Hgi report when attempting to create an Hgi instance')
TfDebug.registerDebugSymbol(HgiDebugCodes.HGI_DEBUG_IS_SUPPORTED,
  'Hgi debug info when IsBackendSupported() is false')
