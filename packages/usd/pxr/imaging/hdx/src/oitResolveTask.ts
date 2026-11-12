// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/oitResolveTask.cpp,
//  pxr/imaging/hdx/oitResolveTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/oitResolveTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - _GetScreenSize (oitResolveTask.cpp:35-95) queries the bound OpenGL
//   framebuffer when the render pass has no AOVs. There is no bound
//   framebuffer on the Hgi interface, so the no-AOV case takes upstream's
//   final fallback (oitScreenSizeFallback, 2048 x 2048).
// - Task dirty bits are passed by value (hd/src/task.ts).
// - HdxOitResolveTaskParams is a class with Clone() (struct copy) and
//   Equals() (operator==); operator<< is not ported.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Type as TfType } from 'typescript-usd/tf'
import { Vec2i as GfVec2i } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  AovTokens as HdAovTokens,
  BlendFactor as HdBlendFactor,
  BlendOp as HdBlendOp,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  ChangeTracker as HdChangeTracker,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderPassState as HdRenderPassState,
  RprimCollection as HdRprimCollection,
  Task as HdTask,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSpec as HdBufferSpec,
  type DirtyBits as HdDirtyBits,
  type RenderBuffer as HdRenderBuffer,
  type RenderIndex as HdRenderIndex,
  type RenderPassAovBinding as HdRenderPassAovBinding,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  RenderDelegate as HdStRenderDelegate,
  RenderPassShader as HdStRenderPassShader,
  RenderPassState as HdStRenderPassState,
  _ImageShaderRenderPass as HdSt_ImageShaderRenderPass,
  type ResourceRegistry as HdStResourceRegistry,
} from 'typescript-usd/hdSt'
import { HdxOitBufferAccessor } from './oitBufferAccessor.ts'
import { HdxPackageOitResolveImageShader } from './package.ts'
import { HdxTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** oitResolveTask.h:34-43 */
export class HdxOitResolveTaskParams {
  useAovMultiSample = true
  resolveAovMultiSample = true

  /** The struct's copy. */
  Clone(): HdxOitResolveTaskParams {
    return Object.assign(new HdxOitResolveTaskParams(), this)
  }

  /** oitResolveTask.cpp:442-448 (operator==) */
  Equals(rhs: HdxOitResolveTaskParams): boolean {
    return this.useAovMultiSample === rhs.useAovMultiSample &&
      this.resolveAovMultiSample === rhs.resolveAovMultiSample
  }
}
export const HdxOitResolveTaskParamsType = TfType.declare('HdxOitResolveTaskParams')

/** oitResolveTask.cpp:35-95 (see the header). */
function _GetScreenSize(): GfVec2i {
  const oitScreenSizeFallback = 2048

  return new GfVec2i(oitScreenSizeFallback, oitScreenSizeFallback)
}

/** oitResolveTask.cpp:207-215 */
function _HasColorAov(aovBindings: readonly HdRenderPassAovBinding[]): boolean {
  return aovBindings.some(binding => binding.aovName === HdAovTokens.color)
}

/** oitResolveTask.h:45-125. A task for resolving previous passes to pixels.
 *
 *  It is optional whether the render target used by the task has an alpha
 *  channel. */
export class HdxOitResolveTask extends HdTask {
  private _renderPass: HdSt_ImageShaderRenderPass | null = null
  private _renderPassState: HdStRenderPassState | null = null
  private _renderPassShader: HdStRenderPassShader | null = null

  private _screenSize = new GfVec2i(0, 0)
  private _counterBar: HdBufferArrayRange | null = null
  private _dataBar: HdBufferArrayRange | null = null
  private _jointBar: HdBufferArrayRange | null = null
  private _uniformBar: HdBufferArrayRange | null = null

  /** oitResolveTask.h:51 */
  static isOitEnabled(): boolean {
    return HdxOitBufferAccessor.isOitEnabled()
  }

  /** oitResolveTask.cpp:97-103 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** oitResolveTask.cpp:107-157 */
  sync(delegateArg: unknown, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const delegate = delegateArg as HdSceneDelegate
    if (!this._renderPassState) {
      // We do not use renderDelegate->CreateRenderPassState because
      // ImageShaders always use HdSt
      this._renderPassState = new HdStRenderPassState()
      this._renderPassState.setEnableDepthTest(false)
      this._renderPassState.setEnableDepthMask(false)
      this._renderPassState.setAlphaThreshold(0.0)
      this._renderPassState.setAlphaToCoverageEnabled(false)
      this._renderPassState.setColorMasks([HdRenderPassState.ColorMaskRGBA])
      this._renderPassState.setBlendEnabled(true)

      // We expect pre-multiplied color as input into the OIT resolve shader
      // e.g. vec4(rgb * a, a). Hence the src factor for rgb is "One" since
      // src alpha is already accounted for.
      // Alpha's are blended with the same blending equation as the rgb's.
      // Thinking about it conceptually, if you're looking through two glass
      // windows both occluding 50% of light, some light would still be
      // passing through. 50% of light passes through the first window, then
      // 50% of the remaining light through the second window. Hence the
      // equation: 0.5 + 0.5 * (1 - 0.5) = 0.75, as 75% of light is occluded.
      this._renderPassState.setBlend(
        HdBlendOp.HdBlendOpAdd,
        HdBlendFactor.HdBlendFactorOne,
        HdBlendFactor.HdBlendFactorOneMinusSrcAlpha,
        HdBlendOp.HdBlendOpAdd,
        HdBlendFactor.HdBlendFactorOne,
        HdBlendFactor.HdBlendFactorOneMinusSrcAlpha)

      this._renderPassShader = new HdStRenderPassShader(
        HdxPackageOitResolveImageShader())
      this._renderPassState.setRenderPassShader(this._renderPassShader)
    }

    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxOitResolveTaskParams)
      if (!params) {
        return
      }

      this._renderPassState.setUseAovMultiSample(
        params.useAovMultiSample)
      this._renderPassState.setResolveAovMultiSample(
        params.resolveAovMultiSample)
    }

    // Note: We defer creation of the render pass to the Prepare phase since
    // the notion of a "collection" is irrelevant to this task.
    // So, the Sync step for the image shader render pass is skipped as well.
  }

  /** oitResolveTask.cpp:159-170 */
  private _getContextRenderPassState(ctx: HdTaskContext): HdRenderPassState | null {
    if (!HdTask._hasTaskContextData(ctx, HdxTokens.renderPassState)) {
      return null
    }

    return HdTask._getTaskContextData<HdRenderPassState>(ctx, HdxTokens.renderPassState) ?? null
  }

  /** oitResolveTask.cpp:172-193 */
  private _updateCameraFraming(ctx: HdTaskContext): void {
    const ctxRenderPassState = this._getContextRenderPassState(ctx)
    if (!ctxRenderPassState) {
      TF_CODING_ERROR('Unable to set camera framing data due to missing ' +
        'render pass state on task context')
      return
    }

    this._renderPassState!.setCamera(ctxRenderPassState.getCamera())
    this._renderPassState!.setOverrideWindowPolicy(
      ctxRenderPassState.getOverrideWindowPolicy())

    const framing = ctxRenderPassState.getFraming()
    if (framing.isValid()) {
      this._renderPassState!.setFraming(framing)
    } else {
      this._renderPassState!.setViewport(ctxRenderPassState.getViewport())
    }
  }

  /** oitResolveTask.cpp:195-205 */
  private _getAovBindings(ctx: HdTaskContext): readonly HdRenderPassAovBinding[] {
    const ctxRenderPassState = this._getContextRenderPassState(ctx)
    if (!ctxRenderPassState) {
      return []
    }

    return ctxRenderPassState.getAovBindings()
  }

  /** oitResolveTask.cpp:217-237 */
  private _computeScreenSize(ctx: HdTaskContext, renderIndex: HdRenderIndex): GfVec2i {
    const aovBindings = this._getAovBindings(ctx)
    if (aovBindings.length === 0) {
      return _GetScreenSize()
    }

    const bufferId = aovBindings[0]!.renderBufferId
    const buffer = renderIndex.getBprim(HdPrimTypeTokens.renderBuffer, bufferId) as
      HdRenderBuffer | undefined
    if (!buffer) {
      TF_CODING_ERROR(`No render buffer at path ${bufferId} specified in AOV bindings`)
      return _GetScreenSize()
    }

    return new GfVec2i(buffer.getWidth(), buffer.getHeight())
  }

  /** oitResolveTask.cpp:239-353 */
  private _prepareOitBuffers(ctx: HdTaskContext, renderIndex: HdRenderIndex,
    screenSize: GfVec2i): void {
    const numSamples = 8 // Should match glslfx files

    if (!(screenSize.get(0) >= 0 && screenSize.get(1) >= 0)) {
      TF_CODING_ERROR(`Invalid screen size for OIT resolve task ${this.getId()}`)
      return
    }

    const hdStResourceRegistry = renderIndex.getResourceRegistry() as HdStResourceRegistry

    const spec = (name: string, type: HdType): HdBufferSpec => ({ name, tupleType: { type, count: 1 } })
    const createOitBuffers = !this._counterBar
    if (createOitBuffers) {
      //
      // Counter Buffer
      //
      const counterSpecs: HdBufferSpec[] = [
        spec(HdxTokens.hdxOitCounterBuffer, HdType.HdTypeInt32),
      ]
      this._counterBar = hdStResourceRegistry.allocateSingleBufferArrayRange(
        /*role*/HdxTokens.oitCounter,
        counterSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
      //
      // Index and Depth Buffer
      //

      const jointSpecs: HdBufferSpec[] = [
        spec(HdxTokens.hdxOitIndexBuffer, HdType.HdTypeInt32)]
      if (HdxOitBufferAccessor.isOitPackedDepthEnabled()) {
        jointSpecs.push(
          spec(HdxTokens.hdxOitTransmissionDepthBuffer, HdType.HdTypeUInt32))
      } else {
        jointSpecs.push(
          spec(HdxTokens.hdxOitDepthBuffer, HdType.HdTypeFloat))
      }
      this._jointBar = hdStResourceRegistry.allocateShaderStorageBufferArrayRange(
        /*role*/HdxTokens.oitJointBuffer,
        jointSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

      //
      // Data Buffer
      //
      const dataSpecs: HdBufferSpec[] = []
      if (HdxOitBufferAccessor.isOitPackedDepthEnabled()) {
        dataSpecs.push(
          spec(HdxTokens.hdxOitColorBuffer, HdType.HdTypeUInt32))
      } else {
        dataSpecs.push(
          spec(HdxTokens.hdxOitDataBuffer, HdType.HdTypeFloatVec4))
      }
      this._dataBar = hdStResourceRegistry.allocateSingleBufferArrayRange(
        /*role*/HdxTokens.oitData,
        dataSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
      //
      // Uniforms
      //
      const uniformSpecs: HdBufferSpec[] = [
        spec(HdxTokens.oitScreenSize, HdType.HdTypeInt32Vec2),
      ]
      this._uniformBar = hdStResourceRegistry.allocateUniformBufferArrayRange(
        /*role*/HdxTokens.oitUniforms,
        uniformSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform)
    }

    // Make sure task context has our buffer each frame (in case its cleared)
    ctx.set(HdxTokens.oitJointBufferBar, this._jointBar)
    ctx.set(HdxTokens.oitCounterBufferBar, this._counterBar)
    ctx.set(HdxTokens.oitDataBufferBar, this._dataBar)
    ctx.set(HdxTokens.oitUniformBar, this._uniformBar)

    // The OIT buffer are sized based on the size of the screen and use
    // fragCoord to index into the buffers.
    // We must update uniform screenSize when either X or Y increases in size.
    const resizeOitBuffers = (screenSize.get(0) > this._screenSize.get(0) ||
      screenSize.get(1) > this._screenSize.get(1))

    if (resizeOitBuffers) {
      const oldBufferSize = this._screenSize.get(0) * this._screenSize.get(1)
      const newBufferSize = screenSize.get(0) * screenSize.get(1)
      this._screenSize = screenSize

      if (oldBufferSize < newBufferSize) {
        // +1 because element 0 of the counter buffer is used as an atomic
        // counter in the shader to give each fragment a unique index.
        this._counterBar!.resize(newBufferSize + 1)
        this._jointBar!.resize(newBufferSize * numSamples)
        this._dataBar!.resize(newBufferSize * numSamples)
      }

      // Update the values in the uniform buffer
      hdStResourceRegistry.addSource(
        this._uniformBar,
        new HdVtBufferSource(
          HdxTokens.oitScreenSize,
          VtValue.create(this._screenSize, VtValueTypes.GfVec2i)))
    }
  }

  /** oitResolveTask.cpp:355-394 */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    // Only allocate/resize buffer if a render task requested it.
    if (!ctx.has(HdxTokens.oitRequestFlag)) {
      // Deallocate buffers here?
      return
    }

    // The HdTaskContext might not be cleared between two engine execute
    // iterations, so we explicitly delete the cleared flag here so that the
    // execute of the first oit render task will clear the buffer in this
    // iteration.
    ctx.delete(HdxTokens.oitClearedFlag)

    // If there are aovs, but none of them are color, skip this task.
    const aovBindings = this._getAovBindings(ctx)
    if (aovBindings.length !== 0 && !_HasColorAov(aovBindings)) {
      return
    }

    if (!this._renderPass) {
      const collection = new HdRprimCollection()
      const renderDelegate = renderIndex.getRenderDelegate()

      if (!TF_VERIFY(renderDelegate instanceof HdStRenderDelegate,
        'OIT Task only works with HdSt')) {
        return
      }

      this._renderPass = new HdSt_ImageShaderRenderPass(renderIndex, collection)
      this._renderPass.setupFullscreenTriangleDrawItem()
    }

    this._prepareOitBuffers(ctx, renderIndex, this._computeScreenSize(ctx, renderIndex))
  }

  /** oitResolveTask.cpp:396-440 */
  Execute(ctx: HdTaskContext): void {
    // Check whether the request flag was set and delete it so that for the
    // next iteration the request flag is not set unless an OIT render task
    // explicitly sets it.
    if (!ctx.delete(HdxTokens.oitRequestFlag)) {
      return
    }

    // Explicitly erase clear flag so that it can be re-used by subsequent
    // OIT render and resolve tasks.
    ctx.delete(HdxTokens.oitClearedFlag)

    // If there are aovs, but none of them are color, skip this task.
    const aovBindings = this._getAovBindings(ctx)
    if (aovBindings.length !== 0 && !_HasColorAov(aovBindings)) {
      return
    }

    if (!TF_VERIFY(this._renderPassState)) return
    if (!TF_VERIFY(this._renderPassShader)) return

    this._renderPassState!.setAovBindings([...aovBindings])
    this._updateCameraFraming(ctx)

    const oitBufferAccessor = new HdxOitBufferAccessor(ctx)
    if (!oitBufferAccessor.addOitBufferBindings(this._renderPassShader!)) {
      TF_CODING_ERROR(
        'No OIT buffers allocated but needed by OIT resolve task')
      return
    }

    this._renderPass!.Execute(this._renderPassState!, this.getRenderTags())
  }
}
