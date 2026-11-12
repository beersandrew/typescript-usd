// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/renderSetupTask.cpp,
//  pxr/imaging/hdx/renderSetupTask.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/renderSetupTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index
//   (hd/src/renderIndex.ts); `*dirtyBits = Clean` is that.
// - HdxRenderTaskParams is a class; VtValue holds it under
//   HdxRenderTaskParamsType. Copies (the C++ value semantics of the struct)
//   are explicit: Clone(). operator== is Equals(); operator<< is not ported.
// - The dynamic_cast<HdStRenderPassState*> checks are instanceof checks.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, Type as TfType } from 'typescript-usd/tf'
import { Vec4d as GfVec4d, Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  AovTokens as HdAovTokens,
  BlendFactor as HdBlendFactor,
  BlendOp as HdBlendOp,
  ChangeTracker as HdChangeTracker,
  CompareFunction as HdCompareFunction,
  CullStyle as HdCullStyle,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderPassAovBinding as HdRenderPassAovBinding,
  RenderSettingsTokens as HdRenderSettingsTokens,
  StencilOp as HdStencilOp,
  Task as HdTask,
  Tokens as HdTokens,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type RenderPassState as HdRenderPassState,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  Framing as CameraUtilFraming,
  type ConformWindowPolicy as CameraUtilConformWindowPolicy,
} from 'typescript-usd/cameraUtil'
import { HioGlslfx } from 'typescript-usd/hio'
import {
  RenderPassShader as HdStRenderPassShader,
  RenderPassState as HdStRenderPassState,
  RenderSettingsTokens as HdStRenderSettingsTokens,
  type ResourceRegistry as HdStResourceRegistry,
} from 'typescript-usd/hdSt'
import { HdxDebugCodes } from './debugCodes.ts'
import { HdxPackageRenderPassColorShader } from './package.ts'
import { HdxTokens } from './tokens.ts'

/** hdSt/volume.cpp:42-43 (HdStVolume::defaultStepSize,
 *  defaultStepSizeLighting) */
const HdStVolume_defaultStepSize = 1.0
const HdStVolume_defaultStepSizeLighting = 10.0

function _AovBindingsEqual(a: readonly HdRenderPassAovBinding[],
  b: readonly HdRenderPassAovBinding[]): boolean {
  return a.length === b.length && a.every((binding, i) => binding.Equals(b[i]!))
}

function _CloneAovBinding(binding: HdRenderPassAovBinding): HdRenderPassAovBinding {
  const out = new HdRenderPassAovBinding()
  out.aovName = binding.aovName
  out.renderBuffer = binding.renderBuffer
  out.renderBufferId = binding.renderBufferId
  out.clearValue = binding.clearValue
  out.aovSettings = new Map(binding.aovSettings)
  return out
}

/** renderSetupTask.h:121-242. RenderTask parameters (renderpass state). */
export class HdxRenderTaskParams {
  // ---------------------------------------------------------------------- //
  // Application rendering state
  // XXX: Several of the parameters below are specific to (or work only with)
  // Storm and stem from its integration in Presto and usdview.
  // ---------------------------------------------------------------------- //
  // "Global" parameters while rendering.
  overrideColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  wireframeColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  pointColor = new GfVec4f(0, 0, 0, 1)
  pointSize = 3.0
  enableLighting = false
  alphaThreshold = 0.0
  enableSceneLights = true
  enableClipping = true

  // Selection/Masking params
  maskColor = new GfVec4f(1.0, 0.0, 0.0, 1.0)
  indicatorColor = new GfVec4f(0.0, 1.0, 0.0, 1.0)
  pointSelectedSize = 3.0

  // AOVs to render to
  // XXX: As a transitional API, if this is empty it indicates the renderer
  // should write color and depth to the GL framebuffer.
  aovBindings: HdRenderPassAovBinding[] = []
  aovInputBindings: HdRenderPassAovBinding[] = []

  // ---------------------------------------------------------------------- //
  // Render pipeline state for rasterizers.
  // XXX: These are relevant only for Storm.
  // ---------------------------------------------------------------------- //
  depthBiasUseDefault = true // inherit application GL state
  depthBiasEnable = false
  depthBiasConstantFactor = 0.0
  depthBiasSlopeFactor = 1.0

  depthFunc: HdCompareFunction = HdCompareFunction.HdCmpFuncLEqual
  depthMaskEnable = true

  // Stencil
  stencilFunc: HdCompareFunction = HdCompareFunction.HdCmpFuncAlways
  stencilRef = 0
  stencilMask = ~0
  stencilFailOp: HdStencilOp = HdStencilOp.HdStencilOpKeep
  stencilZFailOp: HdStencilOp = HdStencilOp.HdStencilOpKeep
  stencilZPassOp: HdStencilOp = HdStencilOp.HdStencilOpKeep
  stencilEnable = false

  // Blending
  blendColorOp: HdBlendOp = HdBlendOp.HdBlendOpAdd
  blendColorSrcFactor: HdBlendFactor = HdBlendFactor.HdBlendFactorOne
  blendColorDstFactor: HdBlendFactor = HdBlendFactor.HdBlendFactorZero
  blendAlphaOp: HdBlendOp = HdBlendOp.HdBlendOpAdd
  blendAlphaSrcFactor: HdBlendFactor = HdBlendFactor.HdBlendFactorOne
  blendAlphaDstFactor: HdBlendFactor = HdBlendFactor.HdBlendFactorZero
  blendConstantColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  blendEnable = false

  // AlphaToCoverage
  enableAlphaToCoverage = true

  // If true (default), render into the multi-sampled AOVs (rather than
  // the resolved AOVs).
  useAovMultiSample = true

  // If true (default), multi-sampled AOVs will be resolved at the end of a
  // render pass.
  resolveAovMultiSample = true

  // ---------------------------------------------------------------------- //
  // Viewer & Camera Framing state
  // ---------------------------------------------------------------------- //
  camera = ''
  framing = new CameraUtilFraming()
  // Only used if framing is invalid.
  viewport = new GfVec4d(0.0, 0.0, 0.0, 0.0)
  cullStyle: HdCullStyle = HdCullStyle.HdCullStyleBackUnlessDoubleSided
  overrideWindowPolicy: CameraUtilConformWindowPolicy | undefined = undefined

  /** The struct's copy. */
  Clone(): HdxRenderTaskParams {
    const p = Object.assign(new HdxRenderTaskParams(), this)
    p.aovBindings = this.aovBindings.map(_CloneAovBinding)
    p.aovInputBindings = this.aovInputBindings.map(_CloneAovBinding)
    return p
  }

  /** renderSetupTask.cpp:358-410 (operator==) */
  Equals(rhs: HdxRenderTaskParams): boolean {
    const lhs = this
    return lhs.overrideColor.equals(rhs.overrideColor) &&
      lhs.wireframeColor.equals(rhs.wireframeColor) &&
      lhs.pointColor.equals(rhs.pointColor) &&
      lhs.pointSize === rhs.pointSize &&
      lhs.enableLighting === rhs.enableLighting &&
      lhs.alphaThreshold === rhs.alphaThreshold &&
      lhs.enableSceneLights === rhs.enableSceneLights &&

      lhs.maskColor.equals(rhs.maskColor) &&
      lhs.indicatorColor.equals(rhs.indicatorColor) &&
      lhs.pointSelectedSize === rhs.pointSelectedSize &&

      _AovBindingsEqual(lhs.aovBindings, rhs.aovBindings) &&
      _AovBindingsEqual(lhs.aovInputBindings, rhs.aovInputBindings) &&

      lhs.depthBiasUseDefault === rhs.depthBiasUseDefault &&
      lhs.depthBiasEnable === rhs.depthBiasEnable &&
      lhs.depthBiasConstantFactor === rhs.depthBiasConstantFactor &&
      lhs.depthBiasSlopeFactor === rhs.depthBiasSlopeFactor &&
      lhs.depthFunc === rhs.depthFunc &&
      lhs.depthMaskEnable === rhs.depthMaskEnable &&
      lhs.stencilFunc === rhs.stencilFunc &&
      lhs.stencilRef === rhs.stencilRef &&
      lhs.stencilMask === rhs.stencilMask &&
      lhs.stencilFailOp === rhs.stencilFailOp &&
      lhs.stencilZFailOp === rhs.stencilZFailOp &&
      lhs.stencilZPassOp === rhs.stencilZPassOp &&
      lhs.stencilEnable === rhs.stencilEnable &&
      lhs.blendColorOp === rhs.blendColorOp &&
      lhs.blendColorSrcFactor === rhs.blendColorSrcFactor &&
      lhs.blendColorDstFactor === rhs.blendColorDstFactor &&
      lhs.blendAlphaOp === rhs.blendAlphaOp &&
      lhs.blendAlphaSrcFactor === rhs.blendAlphaSrcFactor &&
      lhs.blendAlphaDstFactor === rhs.blendAlphaDstFactor &&
      lhs.blendConstantColor.equals(rhs.blendConstantColor) &&
      lhs.blendEnable === rhs.blendEnable &&
      lhs.enableAlphaToCoverage === rhs.enableAlphaToCoverage &&
      lhs.useAovMultiSample === rhs.useAovMultiSample &&
      lhs.resolveAovMultiSample === rhs.resolveAovMultiSample &&

      lhs.camera === rhs.camera &&
      lhs.framing.equals(rhs.framing) &&
      lhs.viewport.equals(rhs.viewport) &&
      lhs.cullStyle === rhs.cullStyle &&
      lhs.overrideWindowPolicy === rhs.overrideWindowPolicy
  }
}
export const HdxRenderTaskParamsType = TfType.declare('HdxRenderTaskParams')

/** renderSetupTask.cpp:29-35 */
let _renderPassColorGlslfx: HioGlslfx | null = null
function _GetRenderPassColorGlslfx(): HioGlslfx {
  return (_renderPassColorGlslfx ??= new HioGlslfx(HdxPackageRenderPassColorShader()))
}

/** renderSetupTask.cpp:118-124 */
function _AovHasIdSemantic(binding: HdRenderPassAovBinding): boolean {
  // For now id render only means primId or instanceId.
  return binding.aovName === HdAovTokens.primId ||
    binding.aovName === HdAovTokens.instanceId
}

/** renderSetupTask.cpp:126-131 */
function _AovHasColorSemantic(binding: HdRenderPassAovBinding): boolean {
  return binding.aovName === HdAovTokens.color
}

/** renderSetupTask.h:41-117. A task for setting up render pass state
 *  (camera, renderpass shader, GL states).
 *
 *  HdxRenderTask depends on the output of this task. Applications can choose
 *  to create a render setup task, and pass it the HdxRenderTaskParams; or
 *  they can pass the HdxRenderTaskParams directly to the render task, which
 *  will create a render setup task internally. See the HdxRenderTask
 *  documentation for details. */
export class HdxRenderSetupTask extends HdTask {
  private _renderPassState: HdRenderPassState | null = null
  private _colorRenderPassShader: HdStRenderPassShader
  private _cameraId = ''
  private _framing = new CameraUtilFraming()
  private _overrideWindowPolicy: CameraUtilConformWindowPolicy | undefined = undefined
  // Used when client did not specify the camera framing (more expressive
  // and preferred).
  private _viewport = new GfVec4d(0, 0, 0, 0)
  private _aovBindings: HdRenderPassAovBinding[] = []
  private _aovInputBindings: HdRenderPassAovBinding[] = []

  /** renderSetupTask.cpp:37-44 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
    this._colorRenderPassShader = new HdStRenderPassShader(_GetRenderPassColorGlslfx())
  }

  /** renderSetupTask.h:71-73 */
  getRenderPassState(): HdRenderPassState | null {
    return this._renderPassState
  }

  /** renderSetupTask.cpp:48-65. Sync the render pass resources. */
  sync(delegateArg: unknown, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const delegate = delegateArg as HdSceneDelegate
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxRenderTaskParams)
      if (!params) {
        return
      }

      this.syncParams(delegate, params)
    }
  }

  /** renderSetupTask.cpp:67-101. Prepare the tasks resources. */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    this._prepareAovBindings(ctx, renderIndex)
    this.prepareCamera(renderIndex)

    const renderPassState = this._getRenderPassState(renderIndex)

    const renderDelegate = renderIndex.getRenderDelegate()
    const stepSize = renderDelegate.getRenderSetting(
      HdStRenderSettingsTokens.volumeRaymarchingStepSize,
      HdStVolume_defaultStepSize) as number
    const stepSizeLighting = renderDelegate.getRenderSetting(
      HdStRenderSettingsTokens.volumeRaymarchingStepSizeLighting,
      HdStVolume_defaultStepSizeLighting) as number
    renderPassState.setVolumeRenderingConstants(stepSize, stepSizeLighting)

    const enableExposureCompensation = renderDelegate.getRenderSetting(
      HdRenderSettingsTokens.enableExposureCompensation, true) as boolean
    renderPassState.setEnableExposureCompensation(enableExposureCompensation)

    if (renderPassState instanceof HdStRenderPassState) {
      this._setRenderpassShadersForStorm(renderPassState,
        renderIndex.getResourceRegistry() as HdStResourceRegistry)
    }

    renderPassState.Prepare(renderIndex.getResourceRegistry())
    ctx.set(HdxTokens.renderPassState, this._renderPassState)
  }

  /** renderSetupTask.cpp:103-111. Execute render pass task. */
  Execute(ctx: HdTaskContext): void {
    // set raster state to TaskContext
    ctx.set(HdxTokens.renderPassState, this._renderPassState)
  }

  /** renderSetupTask.cpp:133-152 */
  private _setRenderpassShadersForStorm(renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry): void {
    // If no aovs are bound, use pre-assembled color render pass shader.
    if (this._aovBindings.length === 0) {
      renderPassState.setRenderPassShader(this._colorRenderPassShader)
      return
    }

    renderPassState.setRenderPassShader(
      HdStRenderPassShader.createRenderPassShaderFromAovs(
        renderPassState,
        resourceRegistry,
        this._aovBindings)!)
  }

  /** renderSetupTask.cpp:154-170. Used from HdxRenderTask to manage the
   *  sync/prepare process. */
  syncParams(delegate: HdSceneDelegate, params: HdxRenderTaskParams): void {
    this._viewport = params.viewport
    this._framing = params.framing
    this._overrideWindowPolicy = params.overrideWindowPolicy
    this._cameraId = params.camera
    this._aovBindings = params.aovBindings.map(_CloneAovBinding)
    this._aovInputBindings = params.aovInputBindings.map(_CloneAovBinding)

    const renderIndex = delegate.getRenderIndex()
    const renderPassState = this._getRenderPassState(renderIndex)

    HdxRenderSetupTask.syncParamsHelper(renderPassState, params)
  }

  /** renderSetupTask.cpp:172-249 */
  static syncParamsHelper(renderPassState: HdRenderPassState, params: HdxRenderTaskParams): void {
    // Inspect AOVs to see if we're doing color or id rendering.
    const usingIdAov = params.aovBindings.some(_AovHasIdSemantic)
    const usingColorAov = params.aovBindings.some(_AovHasColorSemantic)
    const usingNoAovs = params.aovBindings.length === 0

    renderPassState.setOverrideColor(params.overrideColor)
    renderPassState.setWireframeColor(params.wireframeColor)
    renderPassState.setPointColor(params.pointColor)
    renderPassState.setPointSize(params.pointSize)
    renderPassState.setLightingEnabled(params.enableLighting)
    renderPassState.setClippingEnabled(params.enableClipping)
    renderPassState.setAlphaThreshold(params.alphaThreshold)
    renderPassState.setCullStyle(params.cullStyle)

    renderPassState.setMaskColor(params.maskColor)
    renderPassState.setIndicatorColor(params.indicatorColor)
    renderPassState.setPointSelectedSize(params.pointSelectedSize)

    // Storm render pipeline state
    {
      renderPassState.setDepthBiasUseDefault(params.depthBiasUseDefault)
      renderPassState.setDepthBiasEnabled(params.depthBiasEnable)
      renderPassState.setDepthBias(params.depthBiasConstantFactor,
        params.depthBiasSlopeFactor)
      renderPassState.setDepthFunc(params.depthFunc)
      renderPassState.setEnableDepthMask(params.depthMaskEnable)

      renderPassState.setStencilEnabled(params.stencilEnable)
      renderPassState.setStencil(params.stencilFunc, params.stencilRef,
        params.stencilMask, params.stencilFailOp, params.stencilZFailOp,
        params.stencilZPassOp)

      renderPassState.setBlendEnabled(params.blendEnable)
      renderPassState.setBlend(
        params.blendColorOp,
        params.blendColorSrcFactor, params.blendColorDstFactor,
        params.blendAlphaOp,
        params.blendAlphaSrcFactor, params.blendAlphaDstFactor)
      renderPassState.setBlendConstantColor(params.blendConstantColor)

      // Don't enable alpha to coverage for id or non-color renders.
      // XXX: If the list of aovs includes both color and an id aov (such as
      // primdId), we still disable alpha to coverage for the render pass,
      // which may result in different behavior for the color output compared
      // to if the user didn't request an id aov at the same time.
      // If this becomes an issue, we'll need to reconsider this approach.
      renderPassState.setAlphaToCoverageEnabled(
        params.enableAlphaToCoverage &&
        (usingNoAovs || usingColorAov) && !usingIdAov &&
        !TfDebug.isEnabled(HdxDebugCodes.HDX_DISABLE_ALPHA_TO_COVERAGE))

      // For id renders that use an id aov (which use an int format), it's ok
      // to have multi-sampling enabled. During the MSAA resolve for integer
      // types, a single sample will be selected.
      renderPassState.setMultiSampleEnabled(params.useAovMultiSample)

      if (renderPassState instanceof HdStRenderPassState) {
        // Don't enable multisample for id renders.
        renderPassState.setUseAovMultiSample(params.useAovMultiSample)
        renderPassState.setResolveAovMultiSample(params.resolveAovMultiSample)
      }
    }
  }

  /** renderSetupTask.cpp:251-273 */
  private _prepareAovBindings(_ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    // Walk the aov bindings, resolving the render index references as they're
    // encountered.
    //
    // This is somewhat fragile. One of the clients is _BindTexture in
    // hdSt/renderPassShader.cpp.
    for (const binding of this._aovBindings) {
      if (binding.renderBuffer == null) {
        binding.renderBuffer = renderIndex.getBprim(
          HdPrimTypeTokens.renderBuffer, binding.renderBufferId)
      }
    }

    const renderPassState = this._getRenderPassState(renderIndex)
    renderPassState.setAovBindings(this._aovBindings)
    renderPassState.setAovInputBindings(this._aovInputBindings)
  }

  /** renderSetupTask.cpp:275-299 */
  prepareCamera(renderIndex: HdRenderIndex): void {
    // If the render delegate does not support cameras, then
    // there is nothing to do here.
    if (!renderIndex.isSprimTypeSupported(HdTokens.camera)) {
      return
    }

    const camera = renderIndex.getSprim(HdPrimTypeTokens.camera, this._cameraId) ?? null

    const renderPassState = this._getRenderPassState(renderIndex)

    renderPassState.setCamera(camera as Parameters<HdRenderPassState['setCamera']>[0])
    renderPassState.setOverrideWindowPolicy(this._overrideWindowPolicy)

    if (this._framing.isValid()) {
      renderPassState.setFraming(this._framing)
    } else {
      renderPassState.setViewport(this._viewport)
    }
  }

  /** renderSetupTask.cpp:301-310 */
  private _getRenderPassState(renderIndex: HdRenderIndex): HdRenderPassState {
    if (!this._renderPassState) {
      const renderDelegate = renderIndex.getRenderDelegate()
      this._renderPassState = (renderDelegate as unknown as { createRenderPassState(): HdRenderPassState }).createRenderPassState()
    }

    return this._renderPassState
  }
}
