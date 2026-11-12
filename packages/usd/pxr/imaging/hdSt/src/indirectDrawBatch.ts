// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/indirectDrawBatch.cpp,
//  pxr/imaging/hdSt/indirectDrawBatch.h, pxr/imaging/hdSt/commandBuffer.cpp,
//  pxr/imaging/hdSt/pipelineDrawBatch.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/indirectDrawBatch.{h,cpp} (OpenUSD 26.11.1):
// the environment settings and static queries only.
//
// HdStCommandBuffer creates an HdSt_IndirectDrawBatch only when
// HdSt_PipelineDrawBatch::IsEnabled(hgi) is false, i.e. without Hgi
// resource generation (commandBuffer.cpp:49-60, pipelineDrawBatch.cpp:157-161),
// which is the OpenGL path. Every Hgi here generates resources, so the batch
// itself is not ported.

import { Debug as TfDebug, TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import type { HgiGraphicsCmds } from 'typescript-usd/hgi'
import { HdStDebugCodes } from './debugCodes.ts'
import { HdSt_DrawBatch, HdSt_DrawBatchValidationResult } from './drawBatch.ts'
import type { HdStDrawItemInstance } from './drawItemInstance.ts'
import type { HdStRenderPassState } from './renderPassState.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** indirectDrawBatch.cpp:64-69 */
export const HD_ENABLE_GPU_FRUSTUM_CULLING = new TfEnvSetting<boolean>(
  'HD_ENABLE_GPU_FRUSTUM_CULLING', true, 'Enable GPU frustum culling')
export const HD_ENABLE_GPU_COUNT_VISIBLE_INSTANCES = new TfEnvSetting<boolean>(
  'HD_ENABLE_GPU_COUNT_VISIBLE_INSTANCES', false,
  'Enable GPU frustum culling visible count query')
export const HD_ENABLE_GPU_INSTANCE_FRUSTUM_CULLING = new TfEnvSetting<boolean>(
  'HD_ENABLE_GPU_INSTANCE_FRUSTUM_CULLING', true,
  'Enable GPU per-instance frustum culling')

/** indirectDrawBatch.h:37-385 */
export class HdSt_IndirectDrawBatch extends HdSt_DrawBatch {
  // PLATFORM-DIVERGENCE(hdst-indirect-draw-batch): pxr/imaging/hdSt/indirectDrawBatch.cpp:71-1943 implements the non-Hgi-resource-generation (OpenGL) draw batch; HdStCommandBuffer never selects it here because every Hgi backend generates resources. Port it if an OpenGL-style backend is added.
  constructor(
    drawItemInstance: HdStDrawItemInstance,
    _allowGpuFrustumCulling = true,
    allowTextureResourceRebinding = false,
  ) {
    super(drawItemInstance, allowTextureResourceRebinding)
    TF_CODING_ERROR('HdSt_IndirectDrawBatch is not available: ' +
      'it requires an Hgi without resource generation')
    this._init(drawItemInstance)
  }

  /** indirectDrawBatch.cpp:147-157 */
  static isEnabledGPUFrustumCulling(): boolean {
    // GPU frustum culling requires SSBO of bindless buffer
    return TfGetEnvSetting(HD_ENABLE_GPU_FRUSTUM_CULLING) &&
      !TfDebug.isEnabled(HdStDebugCodes.HDST_DISABLE_FRUSTUM_CULLING)
  }

  /** indirectDrawBatch.cpp:159-166 */
  static isEnabledGPUCountVisibleInstances(): boolean {
    return TfGetEnvSetting(HD_ENABLE_GPU_COUNT_VISIBLE_INSTANCES)
  }

  /** indirectDrawBatch.cpp:168-177 */
  static isEnabledGPUInstanceFrustumCulling(): boolean {
    // GPU instance frustum culling requires SSBO of bindless buffer
    return TfGetEnvSetting(HD_ENABLE_GPU_INSTANCE_FRUSTUM_CULLING)
  }

  validate(_deepValidation: boolean): HdSt_DrawBatchValidationResult {
    return HdSt_DrawBatchValidationResult.RebuildAllBatches
  }

  prepareDraw(_gfxCmds: HgiGraphicsCmds | null, _state: HdStRenderPassState,
    _registry: HdStResourceRegistry): void {}

  encodeDraw(_state: HdStRenderPassState, _registry: HdStResourceRegistry,
    _firstDrawBatch: boolean): void {}

  executeDraw(_gfxCmds: HgiGraphicsCmds, _state: HdStRenderPassState,
    _registry: HdStResourceRegistry, _firstDrawBatch: boolean): void {}
}
