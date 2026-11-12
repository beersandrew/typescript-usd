// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/oitRenderTask.cpp,
//  pxr/imaging/hdx/oitRenderTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/oitRenderTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value (hd/src/task.ts).
// - The dynamic_casts to HdStRenderPassState are instanceof checks.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import {
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
  AovTokens as HdAovTokens,
  ChangeTracker as HdChangeTracker,
  RenderPassState as HdRenderPassState,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type RenderPass as HdRenderPass,
  type RenderPassAovBinding as HdRenderPassAovBinding,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import {
  RenderPassShader as HdStRenderPassShader,
  RenderPassState as HdStRenderPassState,
} from 'typescript-usd/hdSt'
import { HdxOitBufferAccessor } from './oitBufferAccessor.ts'
import { HdxPackageRenderPassOitOpaqueShader, HdxPackageRenderPassOitShader } from './package.ts'
import { HdxRenderTask } from './renderTask.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** oitRenderTask.cpp:23-29 */
let _renderPassOitGlslfx: HioGlslfx | null = null
function _GetRenderPassOitGlslfx(): HioGlslfx {
  return (_renderPassOitGlslfx ??= new HioGlslfx(HdxPackageRenderPassOitShader()))
}

/** oitRenderTask.cpp:31-37 */
let _renderPassOitOpaqueGlslfx: HioGlslfx | null = null
function _GetRenderPassOitOpaqueGlslfx(): HioGlslfx {
  return (_renderPassOitOpaqueGlslfx ??= new HioGlslfx(HdxPackageRenderPassOitOpaqueShader()))
}

/** oitRenderTask.cpp:173-181 */
function _HasColorAov(aovBindings: readonly HdRenderPassAovBinding[]): boolean {
  return aovBindings.some(binding => binding.aovName === HdAovTokens.color)
}

/** oitRenderTask.h:22-64. A task for rendering transparent geometry into
 *  OIT buffers. Its companion task, OITResolveTask, will blend the buffers
 *  to screen. */
export class HdxOitRenderTask extends HdxRenderTask {
  private readonly _translucentPassShader: HdStRenderPassShader
  private readonly _opaquePassShader: HdStRenderPassShader
  private readonly _isOitEnabled: boolean
  private readonly _translucentPassState: HdStRenderPassState
  private _translucentPass: HdRenderPass | null = null

  /** oitRenderTask.cpp:39-49 */
  constructor(delegate: HdSceneDelegate | null, id: string) {
    super(delegate, id)
    this._translucentPassShader = new HdStRenderPassShader(_GetRenderPassOitGlslfx())
    this._opaquePassShader = new HdStRenderPassShader(_GetRenderPassOitOpaqueGlslfx())
    this._isOitEnabled = HdxOitBufferAccessor.isOitEnabled()
    this._translucentPassState = new HdStRenderPassState(this._translucentPassShader)
  }

  /** oitRenderTask.cpp:53-63 */
  override isConverged(): boolean {
    if (super.isConverged()) {
      if (this._translucentPass) {
        return this._translucentPass.isConverged()
      }
      return true
    }
    return false
  }

  /** oitRenderTask.cpp:65-108 */
  protected override _sync(delegate: HdSceneDelegate, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (this._isOitEnabled) {
      if (dirtyBits & HdChangeTracker.DirtyCollection) {
        const v = delegate.Get(this.getId(), HdTokens.collection)
        const held = v.IsEmpty() ? undefined : v.Get<unknown>()
        const coll = held instanceof HdRprimCollection ? held : new HdRprimCollection()
        if (!coll.getName() && this._translucentPass) {
          // destroy the translucent pass
          this._translucentPass = null
        } else if (this._translucentPass) {
          // update the translucent pass
          this._translucentPass.setRprimCollection(coll)
        } else if (coll.getName()) {
          // create the translucent pass
          const renderIndex = delegate.getRenderIndex()
          this._translucentPass = renderIndex.getRenderDelegate()
            .createRenderPass(renderIndex, coll) ?? null
        }
      }

      // Sync opaque pass
      super._sync(delegate, ctx, dirtyBits)

      // Sync translucent pass

      // XXX: We cannot sync task params from the opaque to the translucent
      // pass here, as they may be managed by a separate, application-
      // controlled setup task whose path we cannot determine. Without the
      // path, we cannot retrieve them from the delegate. So we must wait
      // until the setup task's Prepare() phase has processed the task params
      // into the opaque pass's state and published that into the task
      // context.

      if (this._translucentPass) {
        this._translucentPass.sync()
      }
    }
  }

  /** oitRenderTask.cpp:110-145 */
  override Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    // OIT buffers take up significant GPU resources. Skip if there are no
    // oit draw items (i.e. no translucent draw items)
    if (this._isOitEnabled && this._hasDrawItems()) {
      // prepare opaque pass
      super.Prepare(ctx, renderIndex)
      new HdxOitBufferAccessor(ctx).requestOitBuffers()

      // OIT expects alphaThreshold to be 0. Because HdStRenderPassState
      // conditionally includes it in the uniform BAR when it isn't zero, we
      // have to keep it out of there. The shaders were compiled against a
      // uniform BAR without alphaThreshold. If an application sends down a
      // non-zero alphaThreshold, the BAR layout will change and the shader
      // will read garbage after the insertion. We protect against misbehaving
      // applications here by detecting erroneous alphaThreshold and calling
      // Prepare() again to make sure the BAR layout is as the shaders expect.
      const opaquePassState = this._getRenderPassState(ctx)
      if (opaquePassState instanceof HdStRenderPassState) {
        if (opaquePassState.getAlphaThreshold() !== 0.0) {
          opaquePassState.setAlphaThreshold(0.0)
          // This forced Prepare() needs to happen here, before the
          // render delegate commits the malformed uniform BAR to the GPU.
          opaquePassState.Prepare(renderIndex.getResourceRegistry())
        }
      }

      // Divergence: without forced early fragment tests the translucent
      // pass reads the depth AOV through AOV input textures (Execute,
      // oitRenderTask.cpp:242-256). Upstream allocates their texture handles
      // in Execute, after the frame's resource commit, so the first frame
      // draws with unloaded handles (GL tolerates an unbound sampler; WebGPU
      // rejects the bind group). They are allocated here, before the commit,
      // as HdxOitVolumeRenderTask::Prepare does (oitVolumeRenderTask.cpp:
      // 70-76); the translucent pass state copies these aov input bindings
      // from the opaque pass state, so Execute finds the handles valid.
      if (opaquePassState && !this._getHgi().getCapabilities()!.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesForceEarlyFragmentTest)) {
        this._translucentPassShader.updateAovInputTextures(
          opaquePassState.getAovInputBindings(), renderIndex)
      }

      // XXX: We cannot sync or prepare the translucent pass here either
      // because the separate, application-controlled setup task's Prepare()
      // phase may not have completed yet. We have to wait until our own
      // Execute() phase to set up the translucent pass's state and do any
      // tasks required for syncing and preparing the translucent pass.
    }
  }

  /** oitRenderTask.cpp:183-275 */
  override Execute(ctx: HdTaskContext): void {
    if (!this._isOitEnabled || !this._hasDrawItems()) {
      return
    }

    const opaquePassState = this._getRenderPassState(ctx)
    if (!TF_VERIFY(opaquePassState)) {
      return
    }
    if (!TF_VERIFY(opaquePassState instanceof HdStRenderPassState, 'OIT only works with Storm')) {
      return
    }
    const stOpaquePassState = opaquePassState as HdStRenderPassState

    // if there are aovs, but none of them is color, skip rendering for this
    // task. NB: Not const& because we'll use it again below.
    let aovBindings = [...opaquePassState!.getAovBindings()]
    if (aovBindings.length !== 0 && !_HasColorAov(aovBindings)) {
      return
    }

    const oitBufferAccessor = new HdxOitBufferAccessor(ctx)
    oitBufferAccessor.requestOitBuffers()
    oitBufferAccessor.initializeOitBuffersIfNecessary(this._getHgi())
    if (!oitBufferAccessor.addOitBufferBindings(this._translucentPassShader)) {
      TF_CODING_ERROR(
        'No OIT buffers allocated but needed by OIT render task')
      return
    }

    //
    // 1. Opaque pixels pass
    //
    // Fragments that are opaque (alpha >= 1.0) are rendered to the active
    // framebuffer. Translucent fragments are discarded.
    // This can reduce the data written to the OIT SSBO buffers because of
    // improved depth testing.
    //

    // Opaque pass state overrides
    stOpaquePassState.setRenderPassShader(this._opaquePassShader)
    // blending is relevant only for the oitResolve task.
    stOpaquePassState.setBlendEnabled(false)
    stOpaquePassState.setAlphaToCoverageEnabled(false)
    stOpaquePassState.setAlphaThreshold(0.0)
    // We render into an SSBO -- not MSAA compatible
    stOpaquePassState.setMultiSampleEnabled(false)
    stOpaquePassState.setEnableDepthMask(true)
    stOpaquePassState.setColorMaskUseDefault(false)
    stOpaquePassState.setColorMasks([HdRenderPassState.ColorMaskRGBA])

    // opaque pass execution
    super.Execute(ctx)

    if (!this._translucentPass || !this._translucentPassState) {
      return
    }

    //
    // 2. Translucent pixels pass
    //
    // Fill OIT SSBO buffers for the translucent fragments.
    //

    // Copy the now fully resolved opaque pass state onto the translucent
    // pass state, preserving only the shader.
    const stTranslucentPassState = this._translucentPassState
    stTranslucentPassState.copyAllExceptShaderFrom(stOpaquePassState)

    const renderIndex = this._translucentPass.getRenderIndex()

    const capabilities = this._getHgi().getCapabilities()!
    if (!capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesForceEarlyFragmentTest)) {
      // In case we don't have support for early fragment test, we need
      // to skip the depth texture for the translucent pass to avoid reading
      // and writing to the same depth texture.
      aovBindings = aovBindings.filter(aov =>
        !(HdAovHasDepthSemantic(aov.aovName) ||
          HdAovHasDepthStencilSemantic(aov.aovName)))
      this._translucentPassState.setAovBindings(aovBindings)
      // We need to bind the depth texture if the platform doesn't allow
      // early fragment test to be forced. This works in tandem with the
      // TaskController setting the depth as input textures for the
      // OIT task.
      this._translucentPassShader.updateAovInputTextures(
        this._translucentPassState.getAovInputBindings(),
        renderIndex)
    }

    // Ensure OIT buffer bindings are registered with the shader
    oitBufferAccessor.addOitBufferBindings(this._translucentPassShader)
    // Ensure RenderPassState buffer binding is registered with the shader
    stTranslucentPassState.setRenderPassShader(this._translucentPassShader)
    // Ensure selection highlight bindings are registered with the shader
    this._setHdStSelectionBindings(ctx, this._translucentPassShader)

    // Translucent pass state overrides
    this._translucentPassState.setEnableDepthMask(false)
    this._translucentPassState.setColorMasks([HdRenderPassState.ColorMaskNone])

    // execute the translucent pass
    this._translucentPass.Execute(this._translucentPassState, this.getRenderTags())
  }
}
