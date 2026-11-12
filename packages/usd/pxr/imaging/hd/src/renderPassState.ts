// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderPassState.cpp,
//  pxr/imaging/hd/renderPassState.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderPassState.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The camera is typed by the HdCamera members used here
//   (HdRenderPassStateCamera): GetTransform, GetWindowPolicy,
//   ComputeProjectionMatrix, GetClipPlanes.
// - std::optional<CameraUtilConformWindowPolicy> is `policy | undefined`.

import {
  Matrix4d as GfMatrix4d,
  Rect2i as GfRect2i,
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec4f as GfVec4f,
  type Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import {
  ConformWindowPolicy as CameraUtilConformWindowPolicy,
  ConformedWindow as CameraUtilConformedWindow,
  Framing as CameraUtilFraming,
} from 'typescript-usd/cameraUtil'
import type { HdRenderPassAovBinding } from './aov.ts'
import { HdCullStyle } from './displayStyle.ts'
import {
  HdBlendFactor,
  HdBlendOp,
  HdCompareFunction,
  HdStencilOp,
} from './enums.ts'

/** The HdCamera members HdRenderPassState reads (hd/camera.h). */
export interface HdRenderPassStateCamera {
  getTransform(): GfMatrix4d
  getWindowPolicy(): CameraUtilConformWindowPolicy
  computeProjectionMatrix(): GfMatrix4d
  getClipPlanes(): readonly GfVec4d[]
}

/** renderPassState.h:338-344 */
export enum HdRenderPassStateColorMask {
  ColorMaskNone,
  ColorMaskRGB,
  ColorMaskRGBA,
}

const _emptyClipPlanes: readonly GfVec4d[] = []

/** renderPassState.h:40-429. A set of rendering parameters used among render
 *  passes. Parameters are expressed as GL states, uniforms or shaders. */
export class HdRenderPassState {
  static readonly ColorMaskNone = HdRenderPassStateColorMask.ColorMaskNone
  static readonly ColorMaskRGB = HdRenderPassStateColorMask.ColorMaskRGB
  static readonly ColorMaskRGBA = HdRenderPassStateColorMask.ColorMaskRGBA

  // ---------------------------------------------------------------------- //
  // Camera and framing state (renderPassState.cpp:20-73)
  // ---------------------------------------------------------------------- //
  protected _camera: HdRenderPassStateCamera | null = null
  protected _viewport = new GfVec4f(0, 0, 1, 1)
  protected _framing = new CameraUtilFraming()
  protected _overrideWindowPolicy: CameraUtilConformWindowPolicy | undefined = undefined

  // ---------------------------------------------------------------------- //
  // Application rendering state
  // ---------------------------------------------------------------------- //
  protected _overrideColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  protected _wireframeColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  protected _pointColor = new GfVec4f(0.0, 0.0, 0.0, 1.0)
  protected _pointSize = 3.0
  protected _lightingEnabled = true
  protected _clippingEnabled = true
  protected _enableExposureCompensation = true

  protected _maskColor = new GfVec4f(1.0, 0.0, 0.0, 1.0)
  protected _indicatorColor = new GfVec4f(0.0, 1.0, 0.0, 1.0)
  protected _pointSelectedSize = 3.0

  // ---------------------------------------------------------------------- //
  // Render pipeline state
  // ---------------------------------------------------------------------- //
  protected _alphaThreshold = 0.5
  protected _tessLevel = 32.0
  protected _drawRange = new GfVec2f(0.9, -1.0)

  protected _depthBiasUseDefault = true // inherit existing state, ignore values below.
  protected _depthBiasEnabled = false
  protected _depthBiasConstantFactor = 0.0
  protected _depthBiasSlopeFactor = 1.0
  protected _depthFunc = HdCompareFunction.HdCmpFuncLEqual
  protected _depthMaskEnabled = true
  protected _depthTestEnabled = true
  protected _depthClampEnabled = false
  protected _depthRange = new GfVec2f(0, 1)
  protected _cullStyle = HdCullStyle.HdCullStyleNothing

  // Stencil RenderPassState
  protected _stencilFunc = HdCompareFunction.HdCmpFuncAlways
  protected _stencilRef = 0
  protected _stencilMask = ~0
  protected _stencilFailOp = HdStencilOp.HdStencilOpKeep
  protected _stencilZFailOp = HdStencilOp.HdStencilOpKeep
  protected _stencilZPassOp = HdStencilOp.HdStencilOpKeep
  protected _stencilEnabled = false

  // Line width
  protected _lineWidth = 1.0

  // Blending
  protected _blendColorOp = HdBlendOp.HdBlendOpAdd
  protected _blendColorSrcFactor = HdBlendFactor.HdBlendFactorOne
  protected _blendColorDstFactor = HdBlendFactor.HdBlendFactorZero
  protected _blendAlphaOp = HdBlendOp.HdBlendOpAdd
  protected _blendAlphaSrcFactor = HdBlendFactor.HdBlendFactorOne
  protected _blendAlphaDstFactor = HdBlendFactor.HdBlendFactorZero
  protected _blendConstantColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  protected _blendEnabled = false

  // alpha to coverage
  protected _alphaToCoverageEnabled = false

  protected _colorMaskUseDefault = true
  protected _colorMasks: HdRenderPassStateColorMask[] = []

  protected _aovBindings: HdRenderPassAovBinding[] = []
  protected _aovInputBindings: HdRenderPassAovBinding[] = []
  protected _useMultiSampleAov = true

  protected _conservativeRasterizationEnabled = false

  protected _stepSize = 0.0
  protected _stepSizeLighting = 0.0

  protected _multiSampleEnabled = true

  /** renderPassState.cpp:77-81. Schedule to update renderPassState
   *  parameters, e.g. camera matrix, override color, id blend factor. */
  Prepare(_resourceRegistry?: unknown): void {}

  // ---------------------------------------------------------------------- //
  // Camera and framing state
  // ---------------------------------------------------------------------- //

  /** renderPassState.cpp:83-87 */
  setCamera(camera: HdRenderPassStateCamera | null): void {
    this._camera = camera
  }

  /** renderPassState.cpp:89-94 */
  setOverrideWindowPolicy(overrideWindowPolicy: CameraUtilConformWindowPolicy | undefined): void {
    this._overrideWindowPolicy = overrideWindowPolicy
  }

  /** renderPassState.cpp:106-110 */
  setFraming(framing: CameraUtilFraming): void {
    this._framing = framing
  }

  /** renderPassState.cpp:96-104 */
  setViewport(viewport: GfVec4d | GfVec4f | readonly [number, number, number, number]): void {
    const v = (i: number): number =>
      Array.isArray(viewport) ? (viewport as readonly number[])[i]! : (viewport as GfVec4f).get(i)
    this._viewport = new GfVec4f(v(0), v(1), v(2), v(3))

    // Invalidate framing so that it isn't used by GetProjectionMatrix().
    this._framing = new CameraUtilFraming()
  }

  /** renderPassState.h:86 */
  getCamera(): HdRenderPassStateCamera | null { return this._camera }

  /** renderPassState.h:90 */
  getFraming(): CameraUtilFraming { return this._framing }

  /** renderPassState.h:93-94 */
  getOverrideWindowPolicy(): CameraUtilConformWindowPolicy | undefined {
    return this._overrideWindowPolicy
  }

  /** renderPassState.cpp:122-133 */
  getWindowPolicy(): CameraUtilConformWindowPolicy {
    if (this._overrideWindowPolicy !== undefined) {
      return this._overrideWindowPolicy
    }
    if (this._camera) {
      return this._camera.getWindowPolicy()
    }
    return CameraUtilConformWindowPolicy.CameraUtilFit
  }

  /** renderPassState.cpp:112-120 */
  getWorldToViewMatrix(): GfMatrix4d {
    if (!this._camera) {
      return new GfMatrix4d(1.0)
    }
    return this._camera.getTransform().getInverse()
  }

  /** renderPassState.cpp:135-155 */
  getProjectionMatrix(): GfMatrix4d {
    if (!this._camera) {
      return new GfMatrix4d(1.0)
    }

    if (this._framing.isValid()) {
      return this._framing.applyToProjectionMatrix(
        this._camera.computeProjectionMatrix(),
        this.getWindowPolicy())
    }

    const aspect = this._viewport.get(3) !== 0.0
      ? this._viewport.get(2) / this._viewport.get(3) : 1.0

    // Adjust the camera frustum based on the window policy.
    return CameraUtilConformedWindow(
      this._camera.computeProjectionMatrix(), this.getWindowPolicy(), aspect)
  }

  /** renderPassState.h:112 */
  getViewport(): GfVec4f { return this._viewport }

  /** renderPassState.cpp:157-195 */
  getImageToWorldMatrix(): GfMatrix4d {
    // Resolve the user-specified framing over the fallback viewport.
    let vpRect: GfRect2i
    if (this._framing.isValid()) {
      const dw = this._framing.dataWindow
      vpRect = new GfRect2i(new GfVec2i(dw.getMinX(), dw.getMinY()),
        dw.getWidth(), dw.getHeight())
    } else {
      // GfVec2i / GfRect2i from float components truncate (C++ conversion).
      vpRect = new GfRect2i(
        new GfVec2i(Math.trunc(this._viewport.get(0)), Math.trunc(this._viewport.get(1))),
        Math.trunc(this._viewport.get(2)), Math.trunc(this._viewport.get(3)))
    }

    // Tranform that maps NDC [-1,+1]x[-1,+1] to viewport
    // Note that z-coordinate is also transformed to map from [-1,+1]
    // and [0,+1]

    const viewportScale = new GfVec3d(
      vpRect.getWidth() / 2.0,
      vpRect.getHeight() / 2.0,
      0.5)

    const viewportTranslate = new GfVec3d(
      vpRect.getMinX() + vpRect.getWidth() / 2.0,
      vpRect.getMinY() + vpRect.getHeight() / 2.0,
      0.5)

    const viewportTransform = new GfMatrix4d().setScale(viewportScale)
      .getMultiply(new GfMatrix4d().setTranslate(viewportTranslate))

    const worldToImage = this.getWorldToViewMatrix()
      .getMultiply(this.getProjectionMatrix())
      .getMultiply(viewportTransform)

    return worldToImage.getInverse()
  }

  /** renderPassState.cpp:197-206 */
  getClipPlanes(): readonly GfVec4d[] {
    if (!(this._clippingEnabled && this._camera)) {
      return _emptyClipPlanes
    }
    return this._camera.getClipPlanes()
  }

  // ---------------------------------------------------------------------- //
  // Application rendering state
  // ---------------------------------------------------------------------- //

  /** renderPassState.cpp:208-212 */
  setOverrideColor(color: GfVec4f): void { this._overrideColor = color }
  getOverrideColor(): GfVec4f { return this._overrideColor }

  /** renderPassState.cpp:214-218 */
  setWireframeColor(color: GfVec4f): void { this._wireframeColor = color }
  getWireframeColor(): GfVec4f { return this._wireframeColor }

  /** renderPassState.cpp:220-224 */
  setMaskColor(color: GfVec4f): void { this._maskColor = color }
  getMaskColor(): GfVec4f { return this._maskColor }

  /** renderPassState.cpp:226-230 */
  setIndicatorColor(color: GfVec4f): void { this._indicatorColor = color }
  getIndicatorColor(): GfVec4f { return this._indicatorColor }

  /** renderPassState.cpp:232-236 */
  setPointColor(color: GfVec4f): void { this._pointColor = color }
  getPointColor(): GfVec4f { return this._pointColor }

  /** renderPassState.cpp:238-242 */
  setPointSize(size: number): void { this._pointSize = Math.fround(size) }
  getPointSize(): number { return this._pointSize }

  /** renderPassState.cpp:244-248 */
  setPointSelectedSize(size: number): void { this._pointSelectedSize = Math.fround(size) }
  getPointSelectedSize(): number { return this._pointSelectedSize }

  /** renderPassState.cpp:274-278 */
  setLightingEnabled(enabled: boolean): void { this._lightingEnabled = enabled }
  getLightingEnabled(): boolean { return this._lightingEnabled }

  /** renderPassState.cpp:280-284 */
  setClippingEnabled(enabled: boolean): void { this._clippingEnabled = enabled }
  getClippingEnabled(): boolean { return this._clippingEnabled }

  /** renderPassState.cpp:286-290 */
  setEnableExposureCompensation(enabled: boolean): void { this._enableExposureCompensation = enabled }
  getEnableExposureCompensation(): boolean { return this._enableExposureCompensation }

  // ---------------------------------------------------------------------- //
  // Render pipeline state
  // ---------------------------------------------------------------------- //

  /** renderPassState.cpp:292-303 */
  setAovBindings(aovBindings: readonly HdRenderPassAovBinding[]): void {
    this._aovBindings = [...aovBindings]
  }
  getAovBindings(): readonly HdRenderPassAovBinding[] { return this._aovBindings }

  /** renderPassState.cpp:305-316 */
  setAovInputBindings(aovBindings: readonly HdRenderPassAovBinding[]): void {
    this._aovInputBindings = [...aovBindings]
  }
  getAovInputBindings(): readonly HdRenderPassAovBinding[] { return this._aovInputBindings }

  /** renderPassState.cpp:318-328 */
  setUseAovMultiSample(state: boolean): void { this._useMultiSampleAov = state }
  getUseAovMultiSample(): boolean { return this._useMultiSampleAov }

  /** renderPassState.cpp:250-254 */
  setCullStyle(cullStyle: HdCullStyle): void { this._cullStyle = cullStyle }
  getCullStyle(): HdCullStyle { return this._cullStyle }

  /** renderPassState.cpp:256-260 */
  setAlphaThreshold(alphaThreshold: number): void { this._alphaThreshold = Math.fround(alphaThreshold) }
  getAlphaThreshold(): number { return this._alphaThreshold }

  /** renderPassState.cpp:262-266 */
  setTessLevel(level: number): void { this._tessLevel = Math.fround(level) }
  getTessLevel(): number { return this._tessLevel }

  /** renderPassState.cpp:268-272 */
  setDrawingRange(drawRange: GfVec2f): void { this._drawRange = drawRange }
  /** renderPassState.h:176 (in pixel) */
  getDrawingRange(): GfVec2f { return this._drawRange }

  /** renderPassState.cpp:501-516 (in ndc) */
  getDrawingRangeNDC(): GfVec2f {
    let width: number
    let height: number
    if (this._framing.isValid()) {
      width = this._framing.dataWindow.getWidth()
      height = this._framing.dataWindow.getHeight()
    } else {
      // `int width = _viewport[2]` truncates.
      width = Math.trunc(this._viewport.get(2))
      height = Math.trunc(this._viewport.get(3))
    }
    return new GfVec2f(2 * this._drawRange.get(0) / width,
      2 * this._drawRange.get(1) / height)
  }

  /** renderPassState.cpp:330-334 */
  setDepthBiasUseDefault(useDefault: boolean): void { this._depthBiasUseDefault = useDefault }
  getDepthBiasUseDefault(): boolean { return this._depthBiasUseDefault }

  /** renderPassState.cpp:336-340 */
  setDepthBiasEnabled(enabled: boolean): void { this._depthBiasEnabled = enabled }
  getDepthBiasEnabled(): boolean { return this._depthBiasEnabled }

  /** renderPassState.cpp:342-347 */
  setDepthBias(constantFactor: number, slopeFactor: number): void {
    this._depthBiasConstantFactor = Math.fround(constantFactor)
    this._depthBiasSlopeFactor = Math.fround(slopeFactor)
  }

  /** renderPassState.cpp:349-353 */
  setDepthFunc(depthFunc: HdCompareFunction): void { this._depthFunc = depthFunc }
  getDepthFunc(): HdCompareFunction { return this._depthFunc }

  /** renderPassState.cpp:355-365 */
  setEnableDepthMask(state: boolean): void { this._depthMaskEnabled = state }
  getEnableDepthMask(): boolean { return this._depthMaskEnabled }

  /** renderPassState.cpp:367-377 */
  setEnableDepthTest(enabled: boolean): void { this._depthTestEnabled = enabled }
  getEnableDepthTest(): boolean { return this._depthTestEnabled }

  /** renderPassState.cpp:379-389 */
  setEnableDepthClamp(enabled: boolean): void { this._depthClampEnabled = enabled }
  getEnableDepthClamp(): boolean { return this._depthClampEnabled }

  /** renderPassState.cpp:391-401 */
  setDepthRange(depthRange: GfVec2f): void { this._depthRange = depthRange }
  getDepthRange(): GfVec2f { return this._depthRange }

  /** renderPassState.cpp:403-414 */
  setStencil(func: HdCompareFunction, ref: number, mask: number,
    fail: HdStencilOp, zfail: HdStencilOp, zpass: HdStencilOp): void {
    this._stencilFunc = func
    this._stencilRef = ref
    this._stencilMask = mask
    this._stencilFailOp = fail
    this._stencilZFailOp = zfail
    this._stencilZPassOp = zpass
  }
  getStencilFunc(): HdCompareFunction { return this._stencilFunc }
  getStencilRef(): number { return this._stencilRef }
  getStencilMask(): number { return this._stencilMask }
  getStencilFailOp(): HdStencilOp { return this._stencilFailOp }
  getStencilDepthFailOp(): HdStencilOp { return this._stencilZFailOp }
  getStencilDepthPassOp(): HdStencilOp { return this._stencilZPassOp }

  /** renderPassState.cpp:416-426 */
  setStencilEnabled(enabled: boolean): void { this._stencilEnabled = enabled }
  getStencilEnabled(): boolean { return this._stencilEnabled }

  /** renderPassState.cpp:428-432 */
  setLineWidth(width: number): void { this._lineWidth = Math.fround(width) }
  getLineWidth(): number { return this._lineWidth }

  /** renderPassState.cpp:434-448 */
  setBlend(colorOp: HdBlendOp, colorSrcFactor: HdBlendFactor, colorDstFactor: HdBlendFactor,
    alphaOp: HdBlendOp, alphaSrcFactor: HdBlendFactor, alphaDstFactor: HdBlendFactor): void {
    this._blendColorOp = colorOp
    this._blendColorSrcFactor = colorSrcFactor
    this._blendColorDstFactor = colorDstFactor
    this._blendAlphaOp = alphaOp
    this._blendAlphaSrcFactor = alphaSrcFactor
    this._blendAlphaDstFactor = alphaDstFactor
  }
  getBlendColorOp(): HdBlendOp { return this._blendColorOp }
  getBlendColorSrcFactor(): HdBlendFactor { return this._blendColorSrcFactor }
  getBlendColorDstFactor(): HdBlendFactor { return this._blendColorDstFactor }
  getBlendAlphaOp(): HdBlendOp { return this._blendAlphaOp }
  getBlendAlphaSrcFactor(): HdBlendFactor { return this._blendAlphaSrcFactor }
  getBlendAlphaDstFactor(): HdBlendFactor { return this._blendAlphaDstFactor }

  /** renderPassState.cpp:450-454 */
  setBlendConstantColor(color: GfVec4f): void { this._blendConstantColor = color }
  getBlendConstantColor(): GfVec4f { return this._blendConstantColor }

  /** renderPassState.cpp:456-460. (There is no GetBlendEnabled upstream;
   *  the subclasses read _blendEnabled.) */
  setBlendEnabled(enabled: boolean): void { this._blendEnabled = enabled }

  /** renderPassState.cpp:462-466 */
  setAlphaToCoverageEnabled(enabled: boolean): void { this._alphaToCoverageEnabled = enabled }
  getAlphaToCoverageEnabled(): boolean { return this._alphaToCoverageEnabled }

  /** renderPassState.cpp:468-472 */
  setColorMaskUseDefault(useDefault: boolean): void { this._colorMaskUseDefault = useDefault }
  getColorMaskUseDefault(): boolean { return this._colorMaskUseDefault }

  /** renderPassState.cpp:474-478 */
  setConservativeRasterizationEnabled(enabled: boolean): void {
    this._conservativeRasterizationEnabled = enabled
  }
  getConservativeRasterizationEnabled(): boolean {
    return this._conservativeRasterizationEnabled
  }

  /** renderPassState.cpp:480-486 */
  setVolumeRenderingConstants(stepSize: number, stepSizeLighting: number): void {
    this._stepSize = Math.fround(stepSize)
    this._stepSizeLighting = Math.fround(stepSizeLighting)
  }

  /** renderPassState.cpp:488-493 */
  setColorMasks(masks: readonly HdRenderPassStateColorMask[]): void {
    this._colorMasks = [...masks]
  }
  getColorMasks(): readonly HdRenderPassStateColorMask[] { return this._colorMasks }

  /** renderPassState.cpp:495-499 */
  setMultiSampleEnabled(enabled: boolean): void { this._multiSampleEnabled = enabled }
  getMultiSampleEnabled(): boolean { return this._multiSampleEnabled }
}
