// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/oitVolumeRenderTask.cpp,
//  pxr/imaging/hdx/oitVolumeRenderTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/oitVolumeRenderTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value (hd/src/task.ts).
// - The task context holds the depth HgiTextureHandle itself (no VtValue).
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import {
  AovTokens as HdAovTokens,
  CullStyle as HdCullStyle,
  RenderPassState as HdRenderPassState,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type RenderPassAovBinding as HdRenderPassAovBinding,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { HgiTextureUsageBits, type HgiTextureHandle, type HgiTextureUsage } from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import {
  RenderPassShader as HdStRenderPassShader,
  RenderPassState as HdStRenderPassState,
} from 'typescript-usd/hdSt'
import { HdxOitBufferAccessor } from './oitBufferAccessor.ts'
import { HdxPackageRenderPassOitVolumeShader } from './package.ts'
import { HdxRenderTask } from './renderTask.ts'
import { HdxTask } from './task.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** oitVolumeRenderTask.cpp:23-29 */
let _renderPassOitVolumeGlslfx: HioGlslfx | null = null
function _GetRenderPassOitVolumeGlslfx(): HioGlslfx {
  return (_renderPassOitVolumeGlslfx ??= new HioGlslfx(HdxPackageRenderPassOitVolumeShader()))
}

/** oitVolumeRenderTask.cpp:78-86 */
function _HasColorAov(aovBindings: readonly HdRenderPassAovBinding[]): boolean {
  return aovBindings.some(binding => binding.aovName === HdAovTokens.color)
}

/** oitVolumeRenderTask.h:22-56. A task for rendering transparent geometry
 *  into OIT buffers. Its companion task, OITResolveTask, will blend the
 *  buffers to screen. */
export class HdxOitVolumeRenderTask extends HdxRenderTask {
  private readonly _oitVolumeRenderPassShader: HdStRenderPassShader
  private readonly _isOitEnabled: boolean

  /** oitVolumeRenderTask.cpp:31-39 */
  constructor(delegate: HdSceneDelegate | null, id: string) {
    super(delegate, id)
    this._oitVolumeRenderPassShader = new HdStRenderPassShader(_GetRenderPassOitVolumeGlslfx())
    this._isOitEnabled = HdxOitBufferAccessor.isOitEnabled()
  }

  /** oitVolumeRenderTask.cpp:43-55 */
  protected override _sync(delegate: HdSceneDelegate, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (this._isOitEnabled) {
      super._sync(delegate, ctx, dirtyBits)
    }
  }

  /** oitVolumeRenderTask.cpp:57-76 */
  override Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    // OIT buffers take up significant GPU resources. Skip if there are no
    // oit draw items (i.e. no volumetric draw items)
    if (!this._isOitEnabled || !this._hasDrawItems()) {
      return
    }

    super.Prepare(ctx, renderIndex)
    new HdxOitBufferAccessor(ctx).requestOitBuffers()

    const state = this._getRenderPassState(ctx)
    if (state) {
      this._oitVolumeRenderPassShader.updateAovInputTextures(
        state.getAovInputBindings(),
        renderIndex)
    }
  }

  /** oitVolumeRenderTask.cpp:88-166 */
  override Execute(ctx: HdTaskContext): void {
    if (!this._isOitEnabled || !this._hasDrawItems()) {
      return
    }

    const renderPassState = this._getRenderPassState(ctx)
    if (!TF_VERIFY(renderPassState)) return

    if (!TF_VERIFY(renderPassState instanceof HdStRenderPassState, 'OIT only works with HdSt')) {
      return
    }
    const extendedState = renderPassState as HdStRenderPassState

    // If there are aovs, but none of them are color, skip rendering for this
    // task.
    const aovBindings = renderPassState!.getAovBindings()
    if (aovBindings.length !== 0 && !_HasColorAov(aovBindings)) {
      return
    }

    //
    // Pre Execute Setup
    //

    const oitBufferAccessor = new HdxOitBufferAccessor(ctx)

    oitBufferAccessor.requestOitBuffers()
    oitBufferAccessor.initializeOitBuffersIfNecessary(this._getHgi())
    if (!oitBufferAccessor.addOitBufferBindings(this._oitVolumeRenderPassShader)) {
      TF_CODING_ERROR(
        'No OIT buffers allocated but needed by OIT volume render task')
      return
    }

    extendedState.setEnableDepthTest(false)
    // Setting cull style for consistency even though it is hard-coded in
    // shaders/volume.glslfx.
    extendedState.setCullStyle(HdCullStyle.HdCullStyleBack)

    // We render into an SSBO -- not MSSA compatible
    extendedState.setMultiSampleEnabled(false)

    // XXX
    //
    // To show volumes that intersect the far clipping plane, we might consider
    // calling glEnable(GL_DEPTH_CLAMP) here.

    //
    // Translucent pixels pass
    //
    extendedState.setRenderPassShader(this._oitVolumeRenderPassShader)
    extendedState.setEnableDepthMask(false)
    extendedState.setColorMasks([HdRenderPassState.ColorMaskNone])

    // Transition depth texture (if it exists) to shader read layout.
    let oldLayout: HgiTextureUsage = 0
    let depthTexture: HgiTextureHandle | undefined
    if (HdxTask._hasTaskContextData(ctx, HdAovTokens.depth)) {
      depthTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.depth)
      oldLayout = depthTexture?.Get()?.submitLayoutChange(
        HgiTextureUsageBits.HgiTextureUsageBitsShaderRead) ?? 0
    }

    super.Execute(ctx)

    // Restore old layout.
    if (oldLayout) {
      depthTexture!.Get()!.submitLayoutChange(oldLayout)
    }
  }
}
