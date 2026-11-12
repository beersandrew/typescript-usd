// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/debugCodes.cpp,
//  pxr/imaging/hdSt/debugCodes.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG_CODES (debugCodes.h:15-41) */
export const HdStDebugCodes = {
  HDST_DRAW: 'HDST_DRAW',
  HDST_DRAW_BATCH: 'HDST_DRAW_BATCH',
  HDST_FORCE_DRAW_BATCH_REBUILD: 'HDST_FORCE_DRAW_BATCH_REBUILD',
  HDST_DRAW_ITEM_GATHER: 'HDST_DRAW_ITEM_GATHER',
  HDST_DRAWITEMS_CACHE: 'HDST_DRAWITEMS_CACHE',
  HDST_DISABLE_FRUSTUM_CULLING: 'HDST_DISABLE_FRUSTUM_CULLING',
  HDST_DISABLE_MULTITHREADED_CULLING: 'HDST_DISABLE_MULTITHREADED_CULLING',
  HDST_DUMP_GLSLFX_CONFIG: 'HDST_DUMP_GLSLFX_CONFIG',
  HDST_DUMP_FAILING_SHADER_SOURCE: 'HDST_DUMP_FAILING_SHADER_SOURCE',
  HDST_DUMP_FAILING_SHADER_SOURCEFILE: 'HDST_DUMP_FAILING_SHADER_SOURCEFILE',
  HDST_DUMP_SHADER_SOURCE: 'HDST_DUMP_SHADER_SOURCE',
  HDST_DUMP_SHADER_SOURCEFILE: 'HDST_DUMP_SHADER_SOURCEFILE',
  HDST_LOG_COMPUTE_SHADER_PROGRAM_HITS: 'HDST_LOG_COMPUTE_SHADER_PROGRAM_HITS',
  HDST_LOG_COMPUTE_SHADER_PROGRAM_MISSES: 'HDST_LOG_COMPUTE_SHADER_PROGRAM_MISSES',
  HDST_LOG_DRAWING_SHADER_PROGRAM_HITS: 'HDST_LOG_DRAWING_SHADER_PROGRAM_HITS',
  HDST_LOG_DRAWING_SHADER_PROGRAM_MISSES: 'HDST_LOG_DRAWING_SHADER_PROGRAM_MISSES',
  HDST_LOG_TEXTURE_FALLBACKS: 'HDST_LOG_TEXTURE_FALLBACKS',
  HDST_LOG_SKIPPED_PRIMVAR: 'HDST_LOG_SKIPPED_PRIMVAR',
  HDST_MATERIAL_ADDED: 'HDST_MATERIAL_ADDED',
  HDST_MATERIAL_REMOVED: 'HDST_MATERIAL_REMOVED',
  HDST_MTLX: 'HDST_MTLX',
  HDST_MTLX_VALUES: 'HDST_MTLX_VALUES',
  HDST_MTLX_DISABLE_ANONYMIZE: 'HDST_MTLX_DISABLE_ANONYMIZE',
  HDST_MTLX_DUMP_SHADER_SOURCEFILE: 'HDST_MTLX_DUMP_SHADER_SOURCEFILE',
} as const

// debugCodes.cpp:15-79
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DRAW,
  'Reports diagnostics for drawing')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DRAW_BATCH,
  'Reports diagnostics for draw batches')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_FORCE_DRAW_BATCH_REBUILD,
  'Forces rebuild of draw batches.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DRAW_ITEM_GATHER,
  'Reports when draw items are fetched for a render pass.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DRAWITEMS_CACHE,
  'Reports lookups from the draw items cache.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DISABLE_FRUSTUM_CULLING,
  'Disable view frustum culling')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DISABLE_MULTITHREADED_CULLING,
  'Force the use of the single threaded version of frustum culling')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DUMP_GLSLFX_CONFIG,
  'Print composed GLSLFX configuration')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCE,
  'Print generated shader source code for shaders that fail compilation')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCEFILE,
  'Write out generated shader source code to files for shaders that ' +
  'fail compilation')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DUMP_SHADER_SOURCE,
  'Print generated shader source code')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_DUMP_SHADER_SOURCEFILE,
  'Write out generated shader source code to files')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_LOG_COMPUTE_SHADER_PROGRAM_HITS,
  'Log compute shader program hits in the resource registry.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_LOG_COMPUTE_SHADER_PROGRAM_MISSES,
  'Log compute shader program misses in the resource registry.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_HITS,
  'Log drawing shader program hits in the resource registry. ' +
  "Use env var 'HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM' to limit logging to " +
  'a subset of prims.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_MISSES,
  'Log drawing shader program misses in the resource registry.' +
  "Use env var 'HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM' to limit logging to " +
  'a subset of prims.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_LOG_TEXTURE_FALLBACKS,
  "Log the fallback value used whenever a texture isn't present.")
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_LOG_SKIPPED_PRIMVAR,
  'Output a message whenever a primvar reaches hydra but is skipped')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_MATERIAL_ADDED,
  'Report when a material is added')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_MATERIAL_REMOVED,
  'Report when a material is removed')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_MTLX,
  'Debug messages in the MaterialX Filter.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_MTLX_VALUES,
  'Logging the HdSt_MaterialParams sent back to the Material Network.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_MTLX_DISABLE_ANONYMIZE,
  'Disable the anonymization the Hydra network before creating the ' +
  'MaterialX Document.')
TfDebug.registerDebugSymbol(HdStDebugCodes.HDST_MTLX_DUMP_SHADER_SOURCEFILE,
  'Write out the MaterialX generated glslfx shader to a file')
