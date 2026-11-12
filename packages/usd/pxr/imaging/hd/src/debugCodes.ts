// Ported from OpenUSD 26.11.1: pxr/imaging/hd/debugCodes.cpp,
//  pxr/imaging/hd/debugCodes.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/debugCodes.{h,cpp} (OpenUSD 26.11.1).

import { Debug as TfDebug } from 'typescript-usd/tf'

/** TF_DEBUG_CODES (debugCodes.h) */
export const HdDebugCodes = {
  HD_BPRIM_ADDED: 'HD_BPRIM_ADDED',
  HD_BPRIM_REMOVED: 'HD_BPRIM_REMOVED',
  HD_BUFFER_ARRAY_INFO: 'HD_BUFFER_ARRAY_INFO',
  HD_BUFFER_ARRAY_RANGE_CLEANED: 'HD_BUFFER_ARRAY_RANGE_CLEANED',
  HD_CACHE_HITS: 'HD_CACHE_HITS',
  HD_CACHE_MISSES: 'HD_CACHE_MISSES',
  HD_COUNTER_CHANGED: 'HD_COUNTER_CHANGED',
  HD_DIRTY_ALL_COLLECTIONS: 'HD_DIRTY_ALL_COLLECTIONS',
  HD_DIRTY_LIST: 'HD_DIRTY_LIST',
  HD_DISABLE_MULTITHREADED_RPRIM_SYNC: 'HD_DISABLE_MULTITHREADED_RPRIM_SYNC',
  HD_DRAWITEMS_CULLED: 'HD_DRAWITEMS_CULLED',
  HD_ENGINE_PHASE_INFO: 'HD_ENGINE_PHASE_INFO',
  HD_EXT_COMPUTATION_ADDED: 'HD_EXT_COMPUTATION_ADDED',
  HD_EXT_COMPUTATION_REMOVED: 'HD_EXT_COMPUTATION_REMOVED',
  HD_EXT_COMPUTATION_UPDATED: 'HD_EXT_COMPUTATION_UPDATED',
  HD_EXT_COMPUTATION_EXECUTION: 'HD_EXT_COMPUTATION_EXECUTION',
  HD_FREEZE_CULL_FRUSTUM: 'HD_FREEZE_CULL_FRUSTUM',
  HD_INSTANCE_PROXY_VIEW_SCENE_INDEX: 'HD_INSTANCE_PROXY_VIEW_SCENE_INDEX',
  HD_INSTANCER_ADDED: 'HD_INSTANCER_ADDED',
  HD_INSTANCER_CLEANED: 'HD_INSTANCER_CLEANED',
  HD_INSTANCER_REMOVED: 'HD_INSTANCER_REMOVED',
  HD_INSTANCER_UPDATED: 'HD_INSTANCER_UPDATED',
  HD_RENDER_SETTINGS: 'HD_RENDER_SETTINGS',
  HD_RENDERER_PLUGIN: 'HD_RENDERER_PLUGIN',
  HD_RPRIM_ADDED: 'HD_RPRIM_ADDED',
  HD_RPRIM_CLEANED: 'HD_RPRIM_CLEANED',
  HD_RPRIM_REMOVED: 'HD_RPRIM_REMOVED',
  HD_RPRIM_UPDATED: 'HD_RPRIM_UPDATED',
  HD_SAFE_MODE: 'HD_SAFE_MODE',
  HD_SCENE_INDEX_PLUGIN_ORDERING: 'HD_SCENE_INDEX_PLUGIN_ORDERING',
  HD_SCENE_INDEX_PLUGIN_REGISTRY: 'HD_SCENE_INDEX_PLUGIN_REGISTRY',
  HD_SELECTION_UPDATE: 'HD_SELECTION_UPDATE',
  HD_SHARED_EXT_COMPUTATION_DATA: 'HD_SHARED_EXT_COMPUTATION_DATA',
  HD_SPRIM_ADDED: 'HD_SPRIM_ADDED',
  HD_SPRIM_REMOVED: 'HD_SPRIM_REMOVED',
  HD_SYNC_ALL: 'HD_SYNC_ALL',
  HD_TASK_ADDED: 'HD_TASK_ADDED',
  HD_TASK_REMOVED: 'HD_TASK_REMOVED',
  HD_VARYING_STATE: 'HD_VARYING_STATE',
} as const

// debugCodes.cpp (TF_REGISTRY_FUNCTION(TfDebug))
TfDebug.registerDebugSymbol(HdDebugCodes.HD_BPRIM_ADDED,
  'Report when bprims are added')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_BPRIM_REMOVED,
  'Report when bprims are removed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_BUFFER_ARRAY_INFO,
  'Report detail info of HdBufferArrays')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_BUFFER_ARRAY_RANGE_CLEANED,
  'Report when bufferArrayRange is cleaned')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_CACHE_HITS,
  'Report every cache hit')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_CACHE_MISSES,
  'Report every cache miss')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_COUNTER_CHANGED,
  'Report values when counters change')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_DIRTY_ALL_COLLECTIONS,
  'Reports diagnostics when all collections are marked dirty')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_DIRTY_LIST,
  'Reports dirty list state changes')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_DISABLE_MULTITHREADED_RPRIM_SYNC,
  'Run RPrim sync on a single thread')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_DRAWITEMS_CULLED,
  'Report the number of draw items culled in each render pass')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_ENGINE_PHASE_INFO,
  'Report the execution phase of the Hydra engine')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_EXT_COMPUTATION_ADDED,
  'Report when ExtComputations are added')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_EXT_COMPUTATION_REMOVED,
  'Report when ExtComputations are removed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_EXT_COMPUTATION_UPDATED,
  'Report when ExtComputations are updated')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_EXT_COMPUTATION_EXECUTION,
  'Report when ExtComputations are executed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_FREEZE_CULL_FRUSTUM,
  "Freeze the frustum used for culling at it's current value")
TfDebug.registerDebugSymbol(HdDebugCodes.HD_INSTANCE_PROXY_VIEW_SCENE_INDEX,
  'Log tracking and query operations for the instance proxy view scene index.')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_INSTANCER_ADDED,
  'Report when instancers are added')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_INSTANCER_CLEANED,
  'Report when instancers are fully cleaned')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_INSTANCER_REMOVED,
  'Report when instancers are removed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_INSTANCER_UPDATED,
  'Report when instancers are updated')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_RENDER_SETTINGS,
  'Report render settings changes')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_RENDERER_PLUGIN,
  'Report debug info on renderer plugins')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_RPRIM_ADDED,
  'Report when rprims are added')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_RPRIM_CLEANED,
  'Report when rprims are fully cleaned')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_RPRIM_REMOVED,
  'Report when rprims are removed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_RPRIM_UPDATED,
  'Report when rprims are updated')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SAFE_MODE,
  'Enable additional security checks')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SCENE_INDEX_PLUGIN_ORDERING,
  'Report debug info on scene index plugin ordering such as cycle detection and topological sorting')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SCENE_INDEX_PLUGIN_REGISTRY,
  'Report debug info on scene index plugin registry')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SELECTION_UPDATE,
  'Report when selection is updated')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SHARED_EXT_COMPUTATION_DATA,
  'Report info related to deduplication of ext computation data buffers')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SPRIM_ADDED,
  'Report when sprims are added')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SPRIM_REMOVED,
  'Report when sprims are removed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_SYNC_ALL,
  'Report debugging info for the sync all algorithm.')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_TASK_ADDED,
  'Report when tasks are added')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_TASK_REMOVED,
  'Report when tasks are removed')
TfDebug.registerDebugSymbol(HdDebugCodes.HD_VARYING_STATE,
  'Reports state tracking of varying state')
