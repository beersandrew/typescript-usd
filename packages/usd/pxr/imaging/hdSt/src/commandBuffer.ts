// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/commandBuffer.cpp,
//  pxr/imaging/hdSt/commandBuffer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/commandBuffer.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Visibility sync and CPU frustum culling run on one thread; upstream
//   splits them with WorkParallelForN (commandBuffer.cpp:527-557, 586-599).
//   The results are the same.
// - HD_PERF_COUNTER_SET for drawCalls/itemsDrawn/drawBatches
//   (commandBuffer.cpp:364-375) are recorded through HdPerfLog when present.
// - Batch keys are TfHashCombine's bigint (upstream size_t).
// - The render index is typed by the members used here (GetResourceRegistry,
//   GetChangeTracker().GetVisibilityChangeCount()).

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  Debug as TfDebug,
  HashCombine as TfHashCombine,
  TfEnvSetting,
  TfGetEnvSetting,
} from 'typescript-usd/tf'
import { DebugCodes as HdDebugCodes, PerfLog as HdPerfLog, PerfTokens as HdPerfTokens } from 'typescript-usd/hd'
import {
  HgiComputeDispatch,
  HgiDeviceCapabilitiesBits,
  HgiMemoryBarrierBits,
  type Hgi,
  type HgiGraphicsCmds,
} from 'typescript-usd/hgi'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdSt_DrawBatch } from './drawBatch.ts'
import { HdSt_DrawBatchValidationResult } from './drawBatch.ts'
import type { HdStDrawItem } from './drawItem.ts'
import { HdStDrawItemInstance } from './drawItemInstance.ts'
import { HdSt_IndirectDrawBatch } from './indirectDrawBatch.ts'
import { HdSt_PipelineDrawBatch } from './pipelineDrawBatch.ts'
import type { HdStRenderPassState } from './renderPassState.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** The parts of HdRenderIndex HdStCommandBuffer::PrepareDraw uses. */
export interface HdStCommandBufferRenderIndex {
  getResourceRegistry(): unknown
  getChangeTracker(): { getVisibilityChangeCount(): number }
}

/** commandBuffer.cpp:49-60 */
function _NewDrawBatch(
  drawItemInstance: HdStDrawItemInstance,
  usePipelineDrawBatch: boolean,
  allowTextureResourceRebinding: boolean,
): HdSt_DrawBatch {
  if (usePipelineDrawBatch) {
    return new HdSt_PipelineDrawBatch(drawItemInstance)
  } else {
    return new HdSt_IndirectDrawBatch(
      drawItemInstance, true, allowTextureResourceRebinding)
  }
}

/** commandBuffer.cpp:62-64 */
export const HDST_DRAW_BATCH_TEXTURE_AGGREGATION_THRESHOLD = new TfEnvSetting<number>(
  'HDST_DRAW_BATCH_TEXTURE_AGGREGATION_THRESHOLD', 10,
  'Specifies the draw item instance count threshold ' +
  'for aggregating draw items which use distinct textures.')

/** commandBuffer.cpp:66-72 */
function _GetTextureAggregationThreshold(): number {
  return TfGetEnvSetting(HDST_DRAW_BATCH_TEXTURE_AGGREGATION_THRESHOLD)
}

/** commandBuffer.cpp:76-88 (_SortByTexture) */
function _SortByTexture(aInstance: HdStDrawItemInstance, bInstance: HdStDrawItemInstance): number {
  const textureA = aInstance.getDrawItem().getMaterialNetworkShader()!.computeTextureSourceHash()
  const textureB = bInstance.getDrawItem().getMaterialNetworkShader()!.computeTextureSourceHash()
  return textureA < textureB ? -1 : textureA > textureB ? 1 : 0
}

/** commandBuffer.cpp:94-145. A cheap bucketing strategy to reduce the
 *  number of comparison tests required to figure out if a draw item can be
 *  batched. */
class _BatchMap {
  private _batchesByKey = new Map<bigint, HdSt_DrawBatch[]>()
  private _prevKey: bigint = 0n
  private _prevBatchForKey: HdSt_DrawBatch | null = null

  /** commandBuffer.cpp:102-132 */
  insertOrAppend(
    key: bigint,
    drawItemInstance: HdStDrawItemInstance,
    usePipelineDrawBatch: boolean,
    allowTextureResourceRebinding: boolean,
  ): HdSt_DrawBatch | null {
    // Do a quick check to see if the draw item can be batched with the
    // previous draw item, before looking up in the map.
    if (key === this._prevKey && this._prevBatchForKey) {
      if (this._prevBatchForKey.append(drawItemInstance)) {
        return null
      }
    }

    let batchesForKey = this._batchesByKey.get(key)
    if (!batchesForKey) {
      batchesForKey = []
      this._batchesByKey.set(key, batchesForKey)
    }
    for (const batch of batchesForKey) {
      if (batch.append(drawItemInstance)) {
        this._setPreviousBatchForKey(key, batch)
        return null
      }
    }

    const newBatch = _NewDrawBatch(drawItemInstance,
      usePipelineDrawBatch, allowTextureResourceRebinding)

    batchesForKey.push(newBatch)
    this._setPreviousBatchForKey(key, newBatch)

    return newBatch
  }

  private _setPreviousBatchForKey(key: bigint, batch: HdSt_DrawBatch): void {
    this._prevKey = key
    this._prevBatchForKey = batch
  }
}

/** commandBuffer.cpp:147-185 */
function _InsertDrawItemInstance(
  drawBatches: HdSt_DrawBatch[],
  drawItemInstance: HdStDrawItemInstance,
  batchMap: _BatchMap,
  usePipelineDrawBatch: boolean,
  allowTextureResourceRebinding: boolean,
): void {
  const drawItem = drawItemInstance.getDrawItem()

  // The draw item instances in a batch need to have compatible
  // pipeline configurations and resource allocations.
  // Currently, draw items with distinct geometric shader hashes
  // or buffer array hashes can never be part of the same batch.
  // We combine these two hashes into a key that can be used to to
  // reduce the number of batches which need to be considered
  // as candidate batches.
  let key = TfHashCombine(
    drawItem.getGeometricShader()!.computeHash(),
    drawItem.getBufferArraysHash())

  // When we're not allowing texture resource rebinding within a
  // batch, we'll also combine the texture source hash into the key.
  // (Note the texture source hash will be 0 for bindless textures).
  if (!allowTextureResourceRebinding) {
    const textureHash = drawItem.getMaterialNetworkShader()!.computeTextureSourceHash()
    key = TfHashCombine(key, textureHash)
  }

  // Keep track of newly created draw batches.
  const newBatch = batchMap.insertOrAppend(
    key, drawItemInstance, usePipelineDrawBatch, allowTextureResourceRebinding)
  if (newBatch) {
    drawBatches.push(newBatch)
  }
}

/** commandBuffer.cpp:187-202 */
function _BatchDrawItemInstances(
  drawBatches: HdSt_DrawBatch[],
  instances: HdStDrawItemInstance[],
  usePipelineDrawBatch: boolean,
): void {
  const batchMap = new _BatchMap()
  for (const drawItemInstance of instances) {
    _InsertDrawItemInstance(
      drawBatches,
      drawItemInstance,
      batchMap,
      usePipelineDrawBatch,
      /*allowTextureResourceRebinding=*/false)
  }
}

/** commandBuffer.cpp:204-212 */
function _HasTextureResourceBinding(instance: HdStDrawItemInstance): boolean {
  const materialNetworkShader = instance.getDrawItem().getMaterialNetworkShader()
  if (materialNetworkShader) {
    return BigInt(materialNetworkShader.computeTextureSourceHash()) !== 0n
  }
  return false
}

/** commandBuffer.cpp:214-221 */
function _ShouldAttemptToAggregate(instances: readonly HdStDrawItemInstance[]): boolean {
  const threshold = _GetTextureAggregationThreshold()
  return instances.length <= threshold && _HasTextureResourceBinding(instances[0]!)
}

/** commandBuffer.cpp:223-268. Returns the new batch list (upstream swaps it
 *  into *drawBatches). */
function _AggregateDrawBatches(
  drawBatches: HdSt_DrawBatch[],
  usePipelineDrawBatch: boolean,
): HdSt_DrawBatch[] {
  const result: HdSt_DrawBatch[] = []

  // Collect draw item instances to aggregate
  const toAggregate: HdStDrawItemInstance[] = []

  for (const batch of drawBatches) {
    const instances = batch.getDrawItemInstances()
    if (_ShouldAttemptToAggregate(instances)) {
      for (const instance of instances) {
        toAggregate.push(instance)
      }
    } else {
      result.push(batch)
    }
  }

  if (toAggregate.length === 0) {
    return drawBatches
  }

  // Sort the draw item instances to improve sequential coherence
  // within the resulting aggregated draw batches.
  toAggregate.sort(_SortByTexture)

  const batchMap = new _BatchMap()
  for (const drawItemInstance of toAggregate) {
    _InsertDrawItemInstance(
      result,
      drawItemInstance,
      batchMap,
      usePipelineDrawBatch,
      /*allowTextureResourceRebinding=*/true)
  }

  return result
}

/** commandBuffer.cpp:270-288 */
function _IsEnabledFrustumCullCPU(hgi: Hgi): boolean {
  if (TfDebug.isEnabled(HdStDebugCodes.HDST_DISABLE_FRUSTUM_CULLING)) {
    return false
  }
  const capabilities = hgi.getCapabilities()!

  const multiDrawIndirectEnabled =
    capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMultiDrawIndirect)

  const gpuFrustumCullingEnabled =
    HdSt_PipelineDrawBatch.isEnabled(hgi)
      ? HdSt_PipelineDrawBatch.isEnabledGPUFrustumCulling()
      : HdSt_IndirectDrawBatch.isEnabledGPUFrustumCulling()

  // Enable CPU Frustum culling only when GPU frustum culling is not enabled.
  return !(multiDrawIndirectEnabled && gpuFrustumCullingEnabled)
}

/** commandBuffer.h:37-117. A buffer of commands (HdStDrawItem or
 *  HdComputeItem objects) to be executed. */
export class HdStCommandBuffer {
  private _drawItems: readonly HdStDrawItem[] | null = null
  private _drawItemInstances: HdStDrawItemInstance[] = []
  private _drawBatches: HdSt_DrawBatch[] = []
  private _visibleSize = 0
  private _visChangeCount = 0
  private _drawBatchesVersion = 0
  /** compileDrawingProgramsAhead: the next batch to compile ahead. */
  private _compileAheadNext = 0
  /** compileDrawingProgramsAhead: the batches were rebuilt this frame. */
  private _compileAheadRebuilt = false

  /** commandBuffer.cpp:292-349 */
  prepareDraw(
    gfxCmds: HgiGraphicsCmds | null,
    renderPassState: HdStRenderPassState,
    renderIndex: HdStCommandBufferRenderIndex,
  ): void {
    // Downcast the resource registry
    const resourceRegistry = renderIndex.getResourceRegistry() as HdStResourceRegistry | null
    if (!TF_VERIFY(resourceRegistry)) {
      return
    }

    const hgi = resourceRegistry!.getHgi()

    if (_IsEnabledFrustumCullCPU(hgi)) {
      const freezeCulling = TfDebug.isEnabled(HdDebugCodes.HD_FREEZE_CULL_FRUSTUM)

      if (!freezeCulling) {
        this._frustumCullCPU(renderPassState.getCullMatrix())
      }

      TfDebug.msg(HdDebugCodes.HD_DRAWITEMS_CULLED,
        `CPU CULLED: ${this.getCulledSize()} drawItems\n`)
    } else {
      // Since culling state is stored across renders,
      // we need to update all items visible state
      const tracker = renderIndex.getChangeTracker()
      this.syncDrawItemVisibility(tracker.getVisibilityChangeCount())
    }

    for (const batch of this._drawBatches) {
      batch.prepareDraw(gfxCmds, renderPassState, resourceRegistry!)
    }

    // Once all the prepare work is done, add a memory barrier before the next
    // stage.
    const computeCmds = resourceRegistry!.getGlobalComputeCmds(
      HgiComputeDispatch.HgiComputeDispatchConcurrent)

    computeCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)

    for (const batch of this._drawBatches) {
      batch.encodeDraw(renderPassState, resourceRegistry!,
        /*firstDrawBatch*/batch === this._drawBatches[0])
    }

    computeCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)

    //
    // Compute work that was set up for indirect command buffers and frustum
    // culling in the batch preparation is submitted to device.
    //
    resourceRegistry!.submitComputeWork()
  }

  /** commandBuffer.cpp:351-376 */
  executeDraw(
    gfxCmds: HgiGraphicsCmds,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
  ): void {
    //
    // draw batches
    //
    for (const batch of this._drawBatches) {
      batch.executeDraw(gfxCmds, renderPassState, resourceRegistry,
        /*firstDrawBatch*/batch === this._drawBatches[0])
    }
  }

  /** PLATFORM-DIVERGENCE(hdst-compile-ahead): Storm compiles a batch's
   *  drawing program the first time the batch draws (executeDraw,
   *  pipelineDrawBatch.cpp:1361-1450), and a batch whose items are all
   *  frustum culled does not draw, so the programs of geometry coming into
   *  view are compiled on the frame it does (upstream too). Upstream's
   *  compile is the driver's, fast and native; here every program's GLSL is
   *  translated to WGSL on the page's one thread (hgiWebGPU/src/glsl), tens
   *  of milliseconds for a new material, which makes that frame long. So
   *  after a pass draws, and on the frames it draws nothing while textures
   *  load (renderPass.ts), the batches that have not drawn yet compile their
   *  programs ahead, within a budget per frame (HDST_COMPILE_AHEAD_MS, kept
   *  in the render param and shared by the passes), but not on the frame that
   *  built them. What is drawn does not change: a draw that finds its program
   *  compiled uses it as it would its own, and recompiles if its shaders
   *  changed meanwhile. */
  compileDrawingProgramsAhead(
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    budget: { compileAheadBudgetMs: number },
  ): void {
    // Not on the frame that built the batches: that frame already did the
    // work that made them (typically syncing the prims just added).
    if (this._compileAheadRebuilt) {
      this._compileAheadRebuilt = false
      return
    }
    while (this._compileAheadNext < this._drawBatches.length && budget.compileAheadBudgetMs > 0) {
      const start = performance.now()
      const batch = this._drawBatches[this._compileAheadNext++]!
      batch.compileDrawingProgramAhead(renderPassState, resourceRegistry, batch === this._drawBatches[0])
      budget.compileAheadBudgetMs -= performance.now() - start
    }
  }

  /** commandBuffer.cpp:511-561 */
  syncDrawItemVisibility(visChangeCount: number): void {
    if (this._visChangeCount === visChangeCount) {
      // There were no changes to visibility since the last time sync was
      // called, no need to re-sync now. Note that visChangeCount starts at
      // 0 in the class and starts at 1 in the change tracker, which ensures a
      // sync after contruction.
      return
    }

    this._visibleSize = 0
    for (const instance of this._drawItemInstances) {
      const item = instance.getDrawItem()

      const visible = item.getVisible()
      // however, if this is an instancing prim and visible, it always has
      // to be called since instanceCount may changes over time.
      if (instance.isVisible() !== visible || (visible && item.hasInstancer())) {
        instance.setVisible(visible)
      }
      if (visible) {
        ++this._visibleSize
      }
    }

    // Mark visible state as clean;
    this._visChangeCount = visChangeCount
  }

  /** commandBuffer.cpp:378-391 */
  setDrawItems(
    drawItems: readonly HdStDrawItem[],
    currentDrawBatchesVersion: number,
    hgi: Hgi,
  ): void {
    if (drawItems === this._drawItems &&
      currentDrawBatchesVersion === this._drawBatchesVersion) {
      return
    }
    this._drawItems = drawItems
    this._rebuildDrawBatches(hgi)
    this._drawBatchesVersion = currentDrawBatchesVersion
  }

  /** commandBuffer.cpp:393-455 */
  rebuildDrawBatchesIfNeeded(currentBatchesVersion: number, hgi: Hgi): void {
    const deepValidation = currentBatchesVersion !== this._drawBatchesVersion
    this._drawBatchesVersion = currentBatchesVersion

    if (TfDebug.isEnabled(HdStDebugCodes.HDST_DRAW_BATCH) && this._drawBatches.length > 0) {
      TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
        `Command buffer : RebuildDrawBatchesIfNeeded (deepValidation=${deepValidation ? 1 : 0})\n`)
    }

    // Force rebuild of all batches for debugging purposes. This helps quickly
    // triage issues wherein the command buffer wasn't updated correctly.
    let rebuildAllDrawBatches = TfDebug.isEnabled(HdStDebugCodes.HDST_FORCE_DRAW_BATCH_REBUILD)

    if (!rebuildAllDrawBatches) {
      // Gather results of validation ...
      const results: HdSt_DrawBatchValidationResult[] = []

      for (const batch of this._drawBatches) {
        const result = batch.validate(deepValidation)

        if (result === HdSt_DrawBatchValidationResult.RebuildAllBatches) {
          // Skip validation of remaining batches since we need to rebuild
          // all batches. We don't expect to use this hammer on a frequent
          // basis.
          rebuildAllDrawBatches = true
          break
        }

        results.push(result)
      }

      // ... and attempt to rebuild necessary batches
      if (!rebuildAllDrawBatches) {
        TF_VERIFY(results.length === this._drawBatches.length)
        const numBatches = results.length
        for (let i = 0; i < numBatches; i++) {
          if (results[i] === HdSt_DrawBatchValidationResult.RebuildBatch) {
            if (!this._drawBatches[i]!.rebuild()) {
              // If a batch rebuild fails, we fallback to rebuilding
              // all draw batches. This can be improved in the future.
              rebuildAllDrawBatches = true
              break
            }
          }
        }
      }
    }

    if (rebuildAllDrawBatches) {
      this._rebuildDrawBatches(hgi)
    }
  }

  /** commandBuffer.h:84-87 */
  getTotalSize(): number {
    return this._drawItems ? this._drawItems.length : 0
  }

  /** commandBuffer.h:90 */
  getVisibleSize(): number { return this._visibleSize }

  /** commandBuffer.h:93-98 */
  getCulledSize(): number {
    return this._drawItems ? this._drawItems.length - this._visibleSize : 0
  }

  /** commandBuffer.cpp:613-619 */
  setEnableTinyPrimCulling(tinyPrimCulling: boolean): void {
    for (const batch of this._drawBatches) {
      batch.setEnableTinyPrimCulling(tinyPrimCulling)
    }
  }

  /** The batches built for the current draw items (for tests). */
  _getDrawBatches(): readonly HdSt_DrawBatch[] {
    return this._drawBatches
  }

  /** commandBuffer.cpp:457-509 */
  private _rebuildDrawBatches(hgi: Hgi): void {
    TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
      'Rebuilding all draw batches for command buffer ...\n')

    this._visibleSize = 0

    // Dropping the batches runs their destructors upstream.
    for (const batch of this._drawBatches) batch.destroy()
    this._drawBatches = []
    this._compileAheadNext = 0
    this._compileAheadRebuilt = true
    this._drawItemInstances = []

    // commandBuffer.cpp:471
    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.rebuildBatches)

    const drawItems = this._drawItems ?? []

    for (const drawItem of drawItems) {
      if (!TF_VERIFY(drawItem.getGeometricShader(), String(drawItem.getRprimID())) ||
        !TF_VERIFY(drawItem.getMaterialNetworkShader(), String(drawItem.getRprimID()))) {
        continue
      }

      this._drawItemInstances.push(new HdStDrawItemInstance(drawItem))
    }

    const usePipelineDrawBatch = HdSt_PipelineDrawBatch.isEnabled(hgi)

    this._drawBatches = []

    _BatchDrawItemInstances(
      this._drawBatches,
      this._drawItemInstances,
      usePipelineDrawBatch)

    if (!usePipelineDrawBatch && _GetTextureAggregationThreshold() > 0) {
      this._drawBatches = _AggregateDrawBatches(
        this._drawBatches,
        usePipelineDrawBatch)
    }

    TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH,
      `   ${this._drawBatches.length} draw batches created for ${drawItems.length} draw items\n`)
  }

  /** commandBuffer.cpp:563-611 */
  private _frustumCullCPU(cullMatrix: GfMatrix4d): void {
    for (const itemInstance of this._drawItemInstances) {
      const item = itemInstance.getDrawItem()
      const visible = item.getVisible() && item.intersectsViewVolume(cullMatrix)
      if (itemInstance.isVisible() !== visible || (visible && item.hasInstancer())) {
        itemInstance.setVisible(visible)
      }
    }

    this._visibleSize = 0
    for (const instance of this._drawItemInstances) {
      if (instance.isVisible()) {
        ++this._visibleSize
      }
    }
  }
}
