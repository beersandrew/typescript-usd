// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/selectionTask.cpp,
//  pxr/imaging/hdx/selectionTask.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/selectionTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index
//   (hd/src/renderIndex.ts); `*dirtyBits = Clean` is that.
// - HdxSelectionTaskParams is a class; VtValue holds it under
//   HdxSelectionTaskParamsType (Clone() is the struct copy, Equals()
//   operator==; operator<< is not ported).
// - The task context holds the buffer array ranges themselves (VtValue of
//   HdBufferArrayRangeSharedPtr upstream).
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Type as TfType } from 'typescript-usd/tf'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  ChangeTracker as HdChangeTracker,
  Task as HdTask,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSpec as HdBufferSpec,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import type { ResourceRegistry as HdStResourceRegistry } from 'typescript-usd/hdSt'
import { HdxSelectionTracker } from './selectionTracker.ts'
import { HdxTokens } from './tokens.ts'

/** selectionTask.h:25-33 */
export class HdxSelectionTaskParams {
  enableSelectionHighlight = false
  enableLocateHighlight = false
  // lerp factor when blending occluded selection
  occludedSelectionOpacity = 0.0
  // "active" selection color
  selectionColor = new GfVec4f(0, 0, 0, 0)
  // "rollover" selection color
  locateColor = new GfVec4f(0, 0, 0, 0)

  /** The struct's copy. */
  Clone(): HdxSelectionTaskParams {
    return Object.assign(new HdxSelectionTaskParams(), this)
  }

  /** selectionTask.cpp:194-200 (operator==) */
  Equals(rhs: HdxSelectionTaskParams): boolean {
    return this.enableSelectionHighlight === rhs.enableSelectionHighlight &&
      this.enableLocateHighlight === rhs.enableLocateHighlight &&
      this.selectionColor.equals(rhs.selectionColor) &&
      this.locateColor.equals(rhs.locateColor)
  }
}
export const HdxSelectionTaskParamsType = TfType.declare('HdxSelectionTaskParams')

/** selectionTask.h:37-90. The SelectionTask is responsible for setting up
 *  render pass global buffers for selection and depositing those buffers
 *  into the task context for down stream consumption. Any render pass that
 *  wants to display selection may extract those buffers and bind them into
 *  the current render pass shader to enable selection highlighting. */
export class HdxSelectionTask extends HdTask {
  private _lastVersion: number
  private _hasSelection: boolean
  private _params: HdxSelectionTaskParams
  private _selOffsetBar: HdBufferArrayRange | null
  private _selUniformBar: HdBufferArrayRange | null
  private _pointColorsBufferSize: number

  /** selectionTask.cpp:25-35 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
    this._lastVersion = -1
    this._hasSelection = false
    this._params = new HdxSelectionTaskParams()
    this._params.occludedSelectionOpacity = 0.5
    this._selOffsetBar = null
    this._selUniformBar = null
    this._pointColorsBufferSize = 0
  }

  /** selectionTask.cpp:39-60 */
  sync(delegateArg: unknown, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const delegate = delegateArg as HdSceneDelegate
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxSelectionTaskParams)
      if (params) {
        this._params = params.Clone()
      }

      // We track the version of selection tracker in the task
      // to see if we need need to update the uniform buffers.
      // As the params have changed, we also need to force an
      // update of the uniform buffers.  We don't have access to
      // the selection tracker (as it is in the task context)
      // so we reset the version to -1 to cause a version mismatch
      // and force the uniform update.
      this._lastVersion = -1
    }
  }

  /** selectionTask.cpp:62-168 */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    const held = HdTask._getTaskContextData<unknown>(ctx, HdxTokens.selectionState)
    const sel = held instanceof HdxSelectionTracker ? held : null
    if (sel) {
      // Update the Hydra selection held by the tracker. This hook point
      // allows applications to transform their notion of selected
      // objects into Hydra selection entries.
      sel.updateSelection(renderIndex)
    }

    const hdStResourceRegistry =
      renderIndex.getResourceRegistry() as HdStResourceRegistry | undefined

    // Only Storm supports buffer array range. Without its registry
    // there's nowhere to put selection state, so don't compute it.
    if (!hdStResourceRegistry ||
      typeof hdStResourceRegistry.allocateSingleBufferArrayRange !== 'function') {
      return
    }

    if (sel && (sel.getVersion() !== this._lastVersion)) {
      this._lastVersion = sel.getVersion()

      if (!this._selOffsetBar) {
        const offsetSpecs: HdBufferSpec[] = []
        offsetSpecs.push({ name: HdxTokens.hdxSelectionBuffer,
          tupleType: { type: HdType.HdTypeInt32, count: 1 } })
        this._selOffsetBar =
          hdStResourceRegistry.allocateSingleBufferArrayRange(
            /*role*/HdxTokens.selection,
            offsetSpecs,
            HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
      }

      const ptColors = sel.getSelectedPointColors(renderIndex)
      const numPtColors = ptColors.length
      if (!this._selUniformBar ||
        numPtColors > this._pointColorsBufferSize) {
        // Allocate space for a small number of colors to avoid shader
        // permutations from different number of selected point colors.
        const s_minNumPointColors = 5
        this._pointColorsBufferSize =
          Math.max(numPtColors, s_minNumPointColors)

        const uniformSpecs: HdBufferSpec[] = []
        uniformSpecs.push({ name: HdxTokens.selColor,
          tupleType: { type: HdType.HdTypeFloatVec4, count: 1 } })
        uniformSpecs.push({ name: HdxTokens.selLocateColor,
          tupleType: { type: HdType.HdTypeFloatVec4, count: 1 } })
        uniformSpecs.push({ name: HdxTokens.occludedSelectionOpacity,
          tupleType: { type: HdType.HdTypeFloat, count: 1 } })
        uniformSpecs.push({ name: HdxTokens.selectionPointColors,
          tupleType: { type: HdType.HdTypeFloatVec4, count: this._pointColorsBufferSize } })
        this._selUniformBar =
          hdStResourceRegistry.allocateUniformBufferArrayRange(
            /*role*/HdxTokens.selection,
            uniformSpecs,
            HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform)
      }

      //
      // Uniforms
      //
      hdStResourceRegistry.addSources(
        this._selUniformBar,
        [
          new HdVtBufferSource(
            HdxTokens.selColor,
            VtValue.create(this._params.selectionColor, VtValueTypes.GfVec4f)),
          new HdVtBufferSource(
            HdxTokens.selLocateColor,
            VtValue.create(this._params.locateColor, VtValueTypes.GfVec4f)),
          new HdVtBufferSource(
            HdxTokens.occludedSelectionOpacity,
            VtValue.create(Math.fround(this._params.occludedSelectionOpacity), VtValueTypes.float)),
          new HdVtBufferSource(
            HdxTokens.selectionPointColors,
            VtValue.createArray(new VtArray<GfVec4f>(ptColors, VtValueTypes.GfVec4f)),
            ptColors.length),
        ])

      //
      // Offsets
      //
      const offsets = { value: [] as number[] }
      this._hasSelection = sel.getSelectionOffsetBuffer(
        renderIndex,
        this._params.enableSelectionHighlight,
        this._params.enableLocateHighlight,
        offsets)
      hdStResourceRegistry.addSource(
        this._selOffsetBar,
        new HdVtBufferSource(
          HdxTokens.hdxSelectionBuffer,
          VtValue.createArray(new VtArray<number>(offsets.value, VtValueTypes.int))))
    }

    ctx.set(HdxTokens.selectionOffsets, this._selOffsetBar ?? undefined)
    ctx.set(HdxTokens.selectionUniforms, this._selUniformBar ?? undefined)
  }

  /** selectionTask.cpp:170-177 */
  Execute(_ctx: HdTaskContext): void {
    // Note that selectionTask comes after renderTask.
  }
}
