// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/renderTask.cpp,
//  pxr/imaging/hdx/renderTask.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/renderTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index
//   (hd/src/renderIndex.ts); `*dirtyBits = Clean` is that.
// - The dynamic_casts to HdStRenderPassState / HdSt_RenderPass are
//   instanceof checks.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import {
  ChangeTracker as HdChangeTracker,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type BufferArrayRange as HdBufferArrayRange,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type RenderPass as HdRenderPass,
  type RenderPassState as HdRenderPassState,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  BindingType as HdStBindingType,
  BindingRequest as HdStBindingRequest,
  LightingShader as HdStLightingShader,
  RenderPassState as HdStRenderPassState,
  _RenderPass as HdSt_RenderPass,
  type RenderPassShader as HdStRenderPassShader,
} from 'typescript-usd/hdSt'
import { Value as VtValue } from 'typescript-usd/vt'
import { HdxRenderSetupTask, HdxRenderTaskParams } from './renderSetupTask.ts'
import { HdxTask } from './task.ts'
import { HdxTokens } from './tokens.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** renderTask.h:27-125. A task for rendering geometry to pixels.
 *
 *  Rendering state management can be handled two ways:
 *  1.) An application can create an HdxRenderTask and pass it the
 *      HdxRenderTaskParams struct as "params".
 *  2.) An application can create an HdxRenderSetupTask and an
 *      HdxRenderTask, and pass params to the setup task. In this case
 *      the setup task must run first.
 *
 *  Parameter unpacking is handled by HdxRenderSetupTask; in case #1,
 *  HdxRenderTask creates a dummy setup task internally to manage the sync
 *  process.
 *
 *  Case #2 introduces more complexity, but it's useful for cases where two
 *  separate HdxRenderTask's want to share the same HdStRenderPassState. */
export class HdxRenderTask extends HdxTask {
  private _pass: HdRenderPass | null = null
  private _renderTags: string[] = []

  // Optional internal render setup task, for params unpacking.
  private _setupTask: HdxRenderSetupTask | null = null

  /** renderTask.cpp:27-33 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** renderTask.cpp:37-45 */
  override isConverged(): boolean {
    if (this._pass) {
      return this._pass.isConverged()
    }

    return true
  }

  /** renderTask.cpp:47-113 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const bits = dirtyBits

    if (bits & HdChangeTracker.DirtyCollection) {
      const val = delegate.Get(this.getId(), HdTokens.collection)

      const held = val.IsEmpty() ? undefined : val.Get<unknown>()
      const collection = held instanceof HdRprimCollection ? held : new HdRprimCollection()

      // Check for cases where the collection is empty (i.e. default
      // constructed).  To do this, the code looks at the root paths,
      // if it is empty, the collection doesn't refer to any prims at
      // all.
      if (!collection.getName()) {
        this._pass = null
      } else {
        if (!this._pass) {
          const index = delegate.getRenderIndex()
          const renderDelegate = index.getRenderDelegate()
          this._pass = renderDelegate.createRenderPass(index, collection) ?? null
        } else {
          this._pass.setRprimCollection(collection)
        }
      }
    }

    if (bits & HdChangeTracker.DirtyParams) {
      // if HdxRenderTaskParams is set on this task, create an
      // HdxRenderSetupTask to unpack them internally.
      //
      // As params is optional, the base class helpper can't be used.
      const valueVt = delegate.Get(this.getId(), HdTokens.params)
      const held = valueVt.IsEmpty() ? undefined : valueVt.UncheckedGet<unknown>()
      if (held instanceof HdxRenderTaskParams) {
        const params = held

        if (!this._setupTask) {
          // note that _setupTask should have the same id, since it will
          // use that id to look up params in the scene delegate.
          // this setup task isn't indexed, so there's no concern
          // about name conflicts.
          this._setupTask = new HdxRenderSetupTask(delegate, this.getId())
        }

        this._setupTask.syncParams(delegate, params)
      } else {
        // If params are not set, expect the renderpass state to be passed
        // in the task context.
      }
    }

    if (bits & HdChangeTracker.DirtyRenderTags) {
      this._renderTags = this._getTaskRenderTags(delegate)
    }

    // sync render pass
    if (this._pass) {
      this._pass.sync()
    }
  }

  /** renderTask.cpp:115-122 */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    if (this._setupTask) {
      this._setupTask.Prepare(ctx, renderIndex)
    }
  }

  /** renderTask.cpp:124-148 */
  Execute(ctx: HdTaskContext): void {
    const renderPassState = this._getRenderPassState(ctx)

    if (!TF_VERIFY(renderPassState)) return

    if (renderPassState instanceof HdStRenderPassState) {
      // Bail out early for Storm tasks that have no rendering work to submit
      // and don't need to clear AOVs.
      if (!this._hasDrawItems() && !this._needToClearAovs(renderPassState)) {
        return
      }
      this._setHdStRenderPassState(ctx, renderPassState)
    }

    // Render geometry with the rendertags (if any)
    if (this._pass) {
      this._pass.Execute(renderPassState!, this.getRenderTags())
    }
  }

  /** renderTask.cpp:150-154 */
  override getRenderTags(): readonly string[] {
    return this._renderTags
  }

  /** renderTask.cpp:156-172 */
  protected _getRenderPassState(ctx: HdTaskContext): HdRenderPassState | null {
    if (this._setupTask) {
      // If HdxRenderTaskParams is set on this task, we will have created an
      // internal HdxRenderSetupTask in _Sync, to sync and unpack the params,
      // and we should use the resulting resources.
      return this._setupTask.getRenderPassState()
    } else {
      // Otherwise, we expect an application-created HdxRenderSetupTask to
      // have run and put the renderpass resources in the task context.
      // See HdxRenderSetupTask::_Execute.
      return HdxTask._getTaskContextData<HdRenderPassState>(ctx, HdxTokens.renderPassState) ?? null
    }
  }

  /** renderTask.cpp:174-185. Returns whether the render pass has any draw
   *  items to submit. For non-Storm backends, this returns true. When using
   *  with Storm tasks, make sure to call it after HdxRenderTask::Prepare(). */
  protected _hasDrawItems(): boolean {
    if (this._pass instanceof HdSt_RenderPass) {
      return this._pass.hasDrawItems(this.getRenderTags())
    } else {
      // Non-Storm backends don't typically use the draw item subsystem.
      // Return true to signify that there is rendering work to do.
      return true
    }
  }

  /** renderTask.cpp:187-201. Setup additional state that
   *  HdStRenderPassState requires. */
  private _setHdStRenderPassState(ctx: HdTaskContext, renderPassState: HdStRenderPassState): void {
    // Can't use GetTaskContextData because the lightingShader
    // is optional.
    const lightingShader = ctx.get(HdxTokens.lightingShader)

    // it's possible to not set lighting shader to HdRenderPassState.
    // Hd_DefaultLightingShader will be used in that case.
    if (lightingShader instanceof HdStLightingShader) {
      renderPassState.setLightingShader(lightingShader)
    }
    // Register selection highlight bindings with the shader
    this._setHdStSelectionBindings(ctx, renderPassState.getRenderPassShader()!)
  }

  /** renderTask.cpp:203-230. Binds the selection highlight buffers published
   *  by HdxSelectionTask onto the given render pass shader. */
  protected _setHdStSelectionBindings(ctx: HdTaskContext,
    renderPassShader: HdStRenderPassShader): void {
    // Selection Setup
    // Note that selectionTask comes after renderTask, so that
    // it can access rprimIDs populated in RenderTask::_Sync.
    const vo = ctx.get(HdxTokens.selectionOffsets) as HdBufferArrayRange | undefined
    const vu = ctx.get(HdxTokens.selectionUniforms) as HdBufferArrayRange | undefined

    if (vo && vu) {
      const obar = vo
      const ubar = vu

      renderPassShader.addBufferBinding(
        new HdStBindingRequest(HdStBindingType.SSBO,
          HdxTokens.selectionOffsets, obar,
          /*interleave*/false))
      renderPassShader.addBufferBinding(
        new HdStBindingRequest(HdStBindingType.UBO,
          HdxTokens.selectionUniforms, ubar,
          /*interleave*/true))
    } else {
      renderPassShader.removeBufferBinding(HdxTokens.selectionOffsets)
      renderPassShader.removeBufferBinding(HdxTokens.selectionUniforms)
    }
  }

  /** renderTask.cpp:232-244. Inspect the AOV bindings to determine if any
   *  of them need to be cleared. */
  private _needToClearAovs(renderPassState: HdRenderPassState): boolean {
    const aovBindings = renderPassState.getAovBindings()
    for (const binding of aovBindings) {
      const clearValue = binding.clearValue
      if (clearValue !== undefined && clearValue !== null &&
        !(clearValue instanceof VtValue && clearValue.IsEmpty())) {
        return true
      }
    }
    return false
  }
}
