// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderPass.cpp,
//  pxr/imaging/hdSt/renderPass.h, pxr/imaging/hd/renderPass.h,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderPass.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Hgi::SubmitCmds returns a promise here (hgi/src/hgi.ts header). The
//   commands are committed in call order, so _Execute does not wait, as
//   upstream does not (renderPass.cpp:147, 170). The promises are kept in
//   GetLastSubmission() so a caller that must wait for the GPU can.
// - HD_PERF_COUNTER_* calls are omitted.
// - Texture loads are asynchronous (textureObjectRegistry.ts header).
//   Upstream's commit loads every texture before any pass executes; here a
//   commit can leave textures to load, and draws that bind them (material
//   textures, the dome light textures computed from an environment map)
//   must not run against textures that are not there. While
//   HdSt_TextureObjectRegistry.HasUncommittedTextures(), _Execute only runs the
//   pass's graphics commands (clearing the AOVs) without drawing, and
//   IsConverged() is false (hd/renderPass.h:88-92, the progressive renderer
//   contract): clients render until converged as they do for progressive
//   renderers (UsdImagingGLEngine::IsConverged, engine.cpp:786-806;
//   usdviewq/stageView.py:1543-1548), or await LoadTexturesAsync() first.

import { Debug as TfDebug, TfEnvSetting, TfGetEnvSetting, type Token as TfToken } from 'typescript-usd/tf'
import {
  RenderPass as HdRenderPass,
  type RenderIndex as HdRenderIndex,
  type RenderPassState as HdRenderPassState,
  type RprimCollection as HdRprimCollection,
} from 'typescript-usd/hd'
import { HgiGraphicsCmdsDesc, type Hgi } from 'typescript-usd/hgi'
import { HdStCommandBuffer } from './commandBuffer.ts'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdStDrawItem } from './drawItem.ts'
import type { HdSt_DrawItemsCache } from './drawItemsCache.ts'
import type { HdStRenderParam } from './renderParam.ts'
import type { HdStRenderPassState } from './renderPassState.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStRenderSettingsTokens } from './tokens.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** renderPass.cpp:30-31 */
export const HDST_ENABLE_DRAW_ITEMS_CACHE = new TfEnvSetting<boolean>(
  'HDST_ENABLE_DRAW_ITEMS_CACHE', false,
  'Enable usage of the draw items cache in Storm.')

/** PLATFORM-DIVERGENCE(hdst-compile-ahead): the milliseconds per frame the
 *  render passes may spend compiling the programs of batches that have not
 *  drawn yet (HdStCommandBuffer.compileDrawingProgramsAhead); 0 compiles
 *  each program at its first draw only, as upstream does. */
export const HDST_COMPILE_AHEAD_MS = new TfEnvSetting<number>(
  'HDST_COMPILE_AHEAD_MS', 8,
  'Milliseconds per frame Storm may spend compiling the drawing programs of batches that have not drawn yet.')

/** renderPass.cpp:33-38 */
function _IsDrawItemsCacheEnabled(): boolean {
  return TfGetEnvSetting(HDST_ENABLE_DRAW_ITEMS_CACHE)
}

/** The HdStRenderDelegate members HdSt_RenderPass uses. */
interface _StRenderDelegate {
  getHgi(): Hgi
  getRenderParam(): unknown
  getDrawItemsCache(): HdSt_DrawItemsCache
  getRenderSettingsVersion(): number
  getRenderSetting(key: string, defValue?: unknown): unknown
}

function _StDelegate(renderIndex: HdRenderIndex): _StRenderDelegate {
  return renderIndex.getRenderDelegate() as unknown as _StRenderDelegate
}

function _StRenderParam(renderIndex: HdRenderIndex): HdStRenderParam {
  return _StDelegate(renderIndex).getRenderParam() as HdStRenderParam
}

/** renderPass.cpp:40-47 */
function _GetDrawBatchesVersion(renderIndex: HdRenderIndex): number {
  return _StRenderParam(renderIndex).getDrawBatchesVersion()
}

/** renderPass.cpp:49-56 */
function _GetMaterialTagsVersion(renderIndex: HdRenderIndex): number {
  return _StRenderParam(renderIndex).getMaterialTagsVersion()
}

/** renderPass.cpp:58-65 */
function _GetGeomSubsetDrawItemsVersion(renderIndex: HdRenderIndex): number {
  return _StRenderParam(renderIndex).getGeomSubsetDrawItemsVersion()
}

/** renderPass.cpp:181-188 */
function _GetDrawItemsCache(renderIndex: HdRenderIndex): HdSt_DrawItemsCache {
  return _StDelegate(renderIndex).getDrawItemsCache()
}

/** renderPass.h:28-94. A single draw pass to a render target/buffer. */
export class HdSt_RenderPass extends HdRenderPass {
  // Drawing state
  private _cmdBuffer = new HdStCommandBuffer()
  private _lastSettingsVersion = 0
  private _useTinyPrimCulling = false

  // Change tracking state.
  private _collectionVersion = 0
  private _rprimRenderTagVersion = 0
  private _taskRenderTagsVersion = 0
  private _prevRenderTags: readonly string[] = []
  private _materialTagsVersion = 0
  private _geomSubsetDrawItemsVersion = 0
  private _collectionChanged = false

  // DrawItems that are used to build the draw batches.
  private _drawItems: readonly HdStDrawItem[] | null = null
  private _drawItemCount = 0
  private _drawItemsChanged = false

  private _hgi: Hgi
  private _lastSubmission: Promise<unknown>[] = []

  /** renderPass.cpp:67-85 */
  constructor(index: HdRenderIndex, collection: HdRprimCollection) {
    super(index, collection)
    this._hgi = _StDelegate(index).getHgi()
  }

  /** renderPass.cpp:91-105 */
  hasDrawItems(renderTags: readonly string[]): boolean {
    // Note that using the material tag and render tags is not a sufficient
    // filter. The collection paths also matter for computing the correct
    // subset.  So this method may produce false positives, but serves its
    // purpose of identifying when work can be skipped due to definite lack of
    // draw items that pass the material tag and render tags filter.
    const renderParam = _StRenderParam(this.getRenderIndex())
    return renderParam.hasMaterialTag(this.getRprimCollection().getMaterialTag() as TfToken) &&
      (renderTags.length === 0 || renderParam.hasAnyRenderTag(renderTags as readonly TfToken[]))
  }

  /** hd/renderPass.h:88-92 (true in upstream Storm): false while textures
   *  wait for their load (see the header). */
  override isConverged(): boolean {
    const resourceRegistry = this.getRenderIndex().getResourceRegistry() as HdStResourceRegistry | null
    return !resourceRegistry?._getTextureHandleRegistry().getTextureObjectRegistry().hasUncommittedTextures()
  }

  /** The submissions of the last _Execute (see the header note). */
  getLastSubmission(): Promise<unknown[]> {
    return Promise.all(this._lastSubmission)
  }

  /** The command buffer (for tests). */
  _getCommandBuffer(): HdStCommandBuffer {
    return this._cmdBuffer
  }

  /** renderPass.cpp:107-171 */
  protected _execute(renderPassState: HdRenderPassState, renderTags: readonly string[]): void {
    // Downcast render pass state
    const stRenderPassState = renderPassState as HdStRenderPassState
    TF_VERIFY(stRenderPassState)

    // Downcast the resource registry
    const resourceRegistry = this.getRenderIndex().getResourceRegistry() as HdStResourceRegistry
    TF_VERIFY(resourceRegistry)

    // Textures still loading: no draws this time (see the header).
    if (!this.isConverged()) {
      const desc = stRenderPassState.makeGraphicsCmdsDesc(this.getRenderIndex() as never)
      const gfxCmds = this._hgi.createGraphicsCmds(desc)
      if (!TF_VERIFY(gfxCmds)) {
        return
      }
      this._lastSubmission = [this._hgi.submitCmds(gfxCmds)]
      // PLATFORM-DIVERGENCE(hdst-compile-ahead): meanwhile the batches are
      // built and their programs compiled, so the first frame that draws
      // does not compile them all at once.
      this._updateCommandBuffer(renderTags)
      this._cmdBuffer.compileDrawingProgramsAhead(stRenderPassState, resourceRegistry,
        _StRenderParam(this.getRenderIndex()))
      return
    }

    // Validate and update draw batches.
    this._updateCommandBuffer(renderTags)

    // Create graphics work to handle the prepare steps.
    // This does not have any AOVs since it only writes intermediate buffers.
    const prepareGfxCmds = this._hgi.createGraphicsCmds(new HgiGraphicsCmdsDesc())
    if (!TF_VERIFY(prepareGfxCmds)) {
      return
    }

    const collection = this.getRprimCollection()
    const prepareName = 'HdSt_RenderPass: Prepare ' + collection.getMaterialTag()

    prepareGfxCmds.pushDebugGroup(prepareName)

    this._cmdBuffer.prepareDraw(prepareGfxCmds, stRenderPassState, this.getRenderIndex() as never)

    prepareGfxCmds.popDebugGroup()
    this._lastSubmission = [this._hgi.submitCmds(prepareGfxCmds)]

    // Create graphics work to render into aovs.
    const desc = stRenderPassState.makeGraphicsCmdsDesc(this.getRenderIndex() as never)
    const gfxCmds = this._hgi.createGraphicsCmds(desc)
    if (!TF_VERIFY(gfxCmds)) {
      return
    }

    const passName = 'HdSt_RenderPass: ' + collection.getMaterialTag()

    gfxCmds.pushDebugGroup(passName)

    gfxCmds.setViewport(stRenderPassState.computeViewport())

    // Camera state needs to be updated once per pass (not per batch).
    stRenderPassState.applyStateFromCamera()

    this._cmdBuffer.executeDraw(gfxCmds, stRenderPassState, resourceRegistry)

    gfxCmds.popDebugGroup()
    this._lastSubmission.push(this._hgi.submitCmds(gfxCmds))

    // PLATFORM-DIVERGENCE(hdst-compile-ahead): the programs of batches that
    // did not draw (HdStCommandBuffer.compileDrawingProgramsAhead).
    this._cmdBuffer.compileDrawingProgramsAhead(stRenderPassState, resourceRegistry,
      _StRenderParam(this.getRenderIndex()))
  }

  /** renderPass.cpp:173-179 */
  protected override _markCollectionDirty(): void {
    // Force any cached data based on collection to be refreshed.
    this._collectionChanged = true
    this._collectionVersion = 0
  }

  /** renderPass.cpp:190-305 */
  private _updateDrawItems(renderTags: readonly string[]): void {
    const collection = this.getRprimCollection()
    if (_IsDrawItemsCacheEnabled()) {
      const cache = _GetDrawItemsCache(this.getRenderIndex())

      const cachedEntry = cache.getDrawItems(
        collection, renderTags, this.getRenderIndex(), this._drawItems)

      if (this._drawItems !== cachedEntry) {
        this._drawItems = cachedEntry
        this._drawItemsChanged = true
        this._drawItemCount = this._drawItems?.length ?? 0
      }
      // We don't rely on this state when using the cache. Reset always.
      this._collectionChanged = false

      return
    }

    const tracker = this.getRenderIndex().getChangeTracker()

    const collectionVersion = tracker.getCollectionVersion(collection.getName())

    const rprimRenderTagVersion = tracker.getRenderTagVersion()

    const materialTagsVersion = _GetMaterialTagsVersion(this.getRenderIndex())

    const geomSubsetDrawItemsVersion = _GetGeomSubsetDrawItemsVersion(this.getRenderIndex())

    const collectionChanged = this._collectionChanged ||
      this._collectionVersion !== collectionVersion

    const rprimRenderTagChanged = this._rprimRenderTagVersion !== rprimRenderTagVersion

    const materialTagsChanged = this._materialTagsVersion !== materialTagsVersion

    const geomSubsetDrawItemsChanged = this._geomSubsetDrawItemsVersion !== geomSubsetDrawItemsVersion

    const taskRenderTagsVersion = tracker.getTaskRenderTagsVersion()
    let taskRenderTagsChanged = false
    if (this._taskRenderTagsVersion !== taskRenderTagsVersion) {
      this._taskRenderTagsVersion = taskRenderTagsVersion
      if (this._prevRenderTags.length !== renderTags.length ||
        this._prevRenderTags.some((t, i) => t !== renderTags[i])) {
        this._prevRenderTags = [...renderTags]
        taskRenderTagsChanged = true
      }
    }

    if (collectionChanged ||
      rprimRenderTagChanged ||
      materialTagsChanged ||
      geomSubsetDrawItemsChanged ||
      taskRenderTagsChanged) {
      if (TfDebug.isEnabled(HdStDebugCodes.HDST_DRAW_ITEM_GATHER)) {
        const msg = (m: string): void => TfDebug.msg(HdStDebugCodes.HDST_DRAW_ITEM_GATHER, m)
        if (collectionChanged) {
          msg(`CollectionChanged: ${collection.getName()} (repr = ${collection.getReprSelector()}, ` +
            `version = ${this._collectionVersion} -> ${collectionVersion})\n`)
        }
        if (rprimRenderTagChanged) {
          msg(`RprimRenderTagChanged (version = ${this._rprimRenderTagVersion} -> ${rprimRenderTagVersion})\n`)
        }
        if (materialTagsChanged) {
          msg(`MaterialTagsChanged (version = ${this._materialTagsVersion} -> ${materialTagsVersion})\n`)
        }
        if (geomSubsetDrawItemsChanged) {
          msg(`GeomSubsetDrawItemsChanged (version = ${this._geomSubsetDrawItemsVersion} -> ${geomSubsetDrawItemsVersion})\n`)
        }
        if (taskRenderTagsChanged) {
          msg('TaskRenderTagsChanged\n')
        }
      }

      const renderParam = _StRenderParam(this.getRenderIndex())
      if (renderParam.hasMaterialTag(collection.getMaterialTag() as TfToken)) {
        this._drawItems = this.getRenderIndex().getDrawItems(collection, renderTags) as unknown as HdStDrawItem[]
      } else {
        // No need to even call GetDrawItems when we know that
        // there is no prim with the desired material tag.
        this._drawItems = []
      }
      this._drawItemCount = this._drawItems.length
      this._drawItemsChanged = true

      this._collectionVersion = collectionVersion
      this._collectionChanged = false

      this._rprimRenderTagVersion = rprimRenderTagVersion
      this._materialTagsVersion = materialTagsVersion
      this._geomSubsetDrawItemsVersion = geomSubsetDrawItemsVersion
    }
  }

  /** renderPass.cpp:307-348 */
  private _updateCommandBuffer(renderTags: readonly string[]): void {
    // -------------------------------------------------------------------
    // SCHEDULE PREPARATION
    // -------------------------------------------------------------------
    // We know what must be drawn and that the stream needs to be updated,
    // so iterate over each prim, cull it and schedule it to be drawn.

    // Ensure that the drawItems are always up-to-date before building the
    // command buffers.
    this._updateDrawItems(renderTags)

    const batchVersion = _GetDrawBatchesVersion(this.getRenderIndex())
    // Rebuild draw batches based on new draw items
    if (this._drawItemsChanged) {
      this._cmdBuffer.setDrawItems(this._drawItems ?? [], batchVersion, this._hgi)

      this._drawItemsChanged = false
    } else {
      // validate command buffer to not include expired drawItems,
      // which could be produced by migrating BARs at the new repr creation.
      this._cmdBuffer.rebuildDrawBatchesIfNeeded(batchVersion, this._hgi)
    }

    // -------------------------------------------------------------------
    // RENDER SETTINGS
    // -------------------------------------------------------------------
    const renderDelegate = _StDelegate(this.getRenderIndex())
    const currentSettingsVersion = renderDelegate.getRenderSettingsVersion()
    if (this._lastSettingsVersion !== currentSettingsVersion) {
      this._lastSettingsVersion = currentSettingsVersion
      this._useTinyPrimCulling = renderDelegate.getRenderSetting(
        HdStRenderSettingsTokens.enableTinyPrimCulling, false) as boolean
    }

    this._cmdBuffer.setEnableTinyPrimCulling(this._useTinyPrimCulling)
  }
}
