// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/imageShaderRenderPass.cpp,
//  pxr/imaging/hdSt/imageShaderRenderPass.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/imageShaderRenderPass.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergences:
// - __ARCH_PRETTY_FUNCTION__ (the debug group name) is the method's name.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3f as GfVec3f } from 'typescript-usd/gf'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  RenderPass as HdRenderPass,
  RprimSharedData as HdRprimSharedData,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BufferSource as HdBufferSource,
  type RenderIndex as HdRenderIndex,
  type RenderPassState as HdRenderPassState,
  type RprimCollection as HdRprimCollection,
} from 'typescript-usd/hd'
import type { Hgi } from 'typescript-usd/hgi'
import type { HdSt_DrawBatch } from './drawBatch.ts'
import { HdStDrawItem } from './drawItem.ts'
import { HdStDrawItemInstance } from './drawItemInstance.ts'
import { HdSt_GeometricShader } from './geometricShader.ts'
import { HdSt_ImageShaderShaderKey } from './imageShaderShaderKey.ts'
import { HdSt_IndirectDrawBatch } from './indirectDrawBatch.ts'
import { HdSt_PipelineDrawBatch } from './pipelineDrawBatch.ts'
import type { HdStRenderDelegate } from './renderDelegate.ts'
import { HdStRenderPassState } from './renderPassState.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** imageShaderRenderPass.cpp:26-48 */
function _NewDrawBatch(drawItemInstance: HdStDrawItemInstance,
  index: HdRenderIndex): HdSt_DrawBatch {
  const resourceRegistry = index.getResourceRegistry() as HdStResourceRegistry

  // Since we're just drawing a single full-screen triangle
  // we don't want frustum culling or indirect command encoding.
  const allowGpuFrustumCulling = false
  const allowIndirectCommandEncoding = false
  if (HdSt_PipelineDrawBatch.isEnabled(resourceRegistry.getHgi())) {
    return new HdSt_PipelineDrawBatch(
      drawItemInstance,
      allowGpuFrustumCulling,
      allowIndirectCommandEncoding)
  } else {
    return new HdSt_IndirectDrawBatch(
      drawItemInstance,
      allowGpuFrustumCulling)
  }
}

/** imageShaderRenderPass.h:31-66. A single, full-screen triangle render
 *  pass. The task that creates this RenderPass should set a RenderPassShader
 *  on the RenderPassState. The RenderPassShader is your full-screen post-
 *  effect. The benefit of using RenderPassShader is that it participates in
 *  codegen. This means your full-screen shader can use buffers created by
 *  other tasks. */
export class HdSt_ImageShaderRenderPass extends HdRenderPass {
  // We re-use the immediateBatch to draw the full-screen triangle.
  private readonly _sharedData: HdRprimSharedData
  private readonly _drawItem: HdStDrawItem
  private readonly _drawItemInstance: HdStDrawItemInstance
  private readonly _drawBatch: HdSt_DrawBatch
  private readonly _hgi: Hgi

  /** imageShaderRenderPass.cpp:50-65 */
  constructor(index: HdRenderIndex, collection: HdRprimCollection) {
    super(index, collection)
    this._sharedData = new HdRprimSharedData(1)
    this._drawItem = new HdStDrawItem(this._sharedData)
    this._drawItemInstance = new HdStDrawItemInstance(this._drawItem)
    this._sharedData.instancerLevels = 0
    this._sharedData.rprimID = '/imageShaderRenderPass'
    this._drawBatch = _NewDrawBatch(this._drawItemInstance, index)

    const renderDelegate = index.getRenderDelegate() as unknown as HdStRenderDelegate
    this._hgi = renderDelegate.getHgi()
  }

  /** imageShaderRenderPass.cpp:69-96. Setup a BAR for a single triangle. */
  private _setupVertexPrimvarBAR(registry: HdStResourceRegistry): void {
    // The current logic in HdSt_PipelineDrawBatch::ExecuteDraw will use
    // glDrawArraysInstanced if it finds a VertexPrimvar buffer but no
    // index buffer, We setup the BAR to meet this requirement to draw our
    // full-screen triangle for post-process shaders.

    const sources: HdBufferSource[] = [
      new HdVtBufferSource(
        HdTokens.points, VtValue.createArray(new VtArray<GfVec3f>(
          [new GfVec3f(0, 0, 0), new GfVec3f(0, 0, 0), new GfVec3f(0, 0, 0)],
          VtValueTypes.GfVec3f)))]

    const bufferSpecs = HdBufferSpec.getBufferSpecs(sources)

    const vertexPrimvarRange =
      registry.allocateNonUniformBufferArrayRange(
        HdTokens.primvar, bufferSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex)

    registry.addSources(vertexPrimvarRange, sources)

    const drawingCoord = this._drawItem.getDrawingCoord()
    this._sharedData.barContainer.Set(
      drawingCoord.getVertexPrimvarIndex(),
      vertexPrimvarRange)
  }

  /** imageShaderRenderPass.cpp:98-121. Set the vertex BAR and geometric
   *  shader for the triangle. This function should be called before the
   *  Execute task phase. */
  setupFullscreenTriangleDrawItem(): void {
    const resourceRegistry = this.getRenderIndex().getResourceRegistry() as HdStResourceRegistry
    TF_VERIFY(resourceRegistry)

    // First time we must create a VertexPrimvar BAR for the triangle and setup
    // the geometric shader that provides the vertex and fragment shaders.
    if (!this._sharedData.barContainer.Get(
      this._drawItem.getDrawingCoord().getVertexPrimvarIndex())) {
      this._setupVertexPrimvarBAR(resourceRegistry)

      const shaderKey = new HdSt_ImageShaderShaderKey()
      const geometricShader =
        HdSt_GeometricShader.create(shaderKey, resourceRegistry)

      this._drawItem.setGeometricShader(geometricShader)
    }
  }

  /** imageShaderRenderPass.cpp:123-161 */
  protected override _execute(renderPassState: HdRenderPassState,
    _renderTags: readonly string[]): void {
    // Downcast render pass state
    if (!TF_VERIFY(renderPassState instanceof HdStRenderPassState)) return
    const stRenderPassState = renderPassState as HdStRenderPassState

    const resourceRegistry = this.getRenderIndex().getResourceRegistry() as HdStResourceRegistry
    TF_VERIFY(resourceRegistry)

    this._drawBatch.prepareDraw(null, stRenderPassState, resourceRegistry)

    // Create graphics work to render into aovs.
    const desc = stRenderPassState.makeGraphicsCmdsDesc(this.getRenderIndex() as never)
    const gfxCmds = this._hgi.createGraphicsCmds(desc)
    if (!TF_VERIFY(gfxCmds)) {
      return
    }

    gfxCmds.pushDebugGroup('HdSt_ImageShaderRenderPass::_Execute')

    const viewport = stRenderPassState.computeViewport()
    gfxCmds.setViewport(viewport)

    // Camera state needs to be updated once per pass (not per batch).
    stRenderPassState.applyStateFromCamera()

    this._drawBatch.executeDraw(gfxCmds, stRenderPassState, resourceRegistry,
      /*firstDrawBatch*/true)

    gfxCmds.popDebugGroup()
    void this._hgi.submitCmds(gfxCmds)
  }
}
