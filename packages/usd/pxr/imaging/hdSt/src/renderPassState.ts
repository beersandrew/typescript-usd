// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderPassState.cpp,
//  pxr/imaging/hdSt/renderPassState.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderPassState.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Bind / Unbind / ApplyStateFromGeometricShader set OpenGL state directly
//   (renderPassState.cpp:545-818); there is no OpenGL here and Storm's Hgi
//   path never calls them, so they record nothing (each says so at its site).
// - Hashes are TfHashCombine's bigint (upstream size_t / uint64_t).
// - An AOV binding's clearValue is a VtValue or undefined (empty).

import {
  Matrix4d as GfMatrix4d,
  Range2f as GfRange2f,
  Vec2f as GfVec2f,
  Vec4f as GfVec4f,
  Vec4i as GfVec4i,
  type Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import { Debug as TfDebug, HashCombine as TfHashCombine, Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
  DebugCodes as HdDebugCodes,
  PolygonMode as HdPolygonMode,
  RenderPassState as HdRenderPassState,
  RenderPassStateColorMask,
  ShaderTokens as HdShaderTokens,
  Tokens as HdTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpecT,
  type RenderPassAovBinding as HdRenderPassAovBinding,
  type RenderPassStateCamera as HdRenderPassStateCamera,
} from 'typescript-usd/hd'
import {
  HgiAttachmentDesc,
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiColorMaskBits,
  HgiDeviceCapabilitiesBits,
  HgiGraphicsCmdsDesc,
  HgiPolygonMode,
  HgiPrimitiveType,
  HgiSampleCount,
  HgiTessellationStatePatchType,
  HgiTessellationStateTessFactorMode,
  HgiTextureUsageBits,
  type HgiBlendFactor,
  type HgiBlendOp,
  type HgiCapabilities,
  type HgiColorMask,
  type HgiDepthStencilState,
  type HgiGraphicsPipelineDesc,
  type HgiMultiSampleState,
  type HgiRasterizationState,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdStBinding, HdStBindingRequest } from './binding.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdSt_FallbackLightingShader } from './fallbackLightingShader.ts'
import type { HdSt_GeometricShader } from './geometricShader.ts'
import { HdStHgiConversions } from './hgiConversions.ts'
import type { HdStLightingShader } from './lightingShader.ts'
import type { HdStRenderBuffer } from './renderBuffer.ts'
import { HdStRenderPassShader } from './renderPassShader.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** renderPassState.cpp:42-45 */
const _tokens = { renderPassState: TfToken('renderPassState') }

/** The HdCamera members HdStRenderPassState reads beyond
 *  HdRenderPassState's (hd/camera.h). */
export interface HdStRenderPassStateCamera extends HdRenderPassStateCamera {
  GetHorizontalAperture(): number
  getVerticalAperture(): number
  getLinearExposureScale(): number
}

/** The parts of HdRenderIndex MakeGraphicsCmdsDesc reads. */
export interface HdStRenderPassStateRenderIndex {
  getBprim(typeId: TfToken, id: unknown): unknown
}

type ClipPlanesVector = readonly GfVec4d[]

/** renderPassState.cpp:47-55 */
function _SafeDiv(a: number, b: number): number {
  if (b === 0.0) {
    return 1.0
  }
  return a / b
}

/** renderPassState.cpp:91-101 */
function _CameraAspectRatio(camera: HdStRenderPassStateCamera | null): number {
  if (!camera) {
    return 1.0
  }
  const v = camera.getVerticalAperture()
  const h = camera.GetHorizontalAperture()
  return Math.fround(Math.abs(_SafeDiv(h, v)))
}

/** renderPassState.cpp:103-121 */
function _FlipWindow(window: GfRange2f, framebufferHeight: number): GfRange2f {
  if (framebufferHeight > 0) {
    const min = window.getMin()
    const max = window.getMax()

    const minX = min.get(0)
    const minY = Math.fround(framebufferHeight - max.get(1))
    const maxX = max.get(0)
    const maxY = Math.fround(framebufferHeight - min.get(1))
    return new GfRange2f(new GfVec2f(minX, minY), new GfVec2f(maxX, maxY))
  } else {
    return window
  }
}

/** renderPassState.cpp:166-182 */
function _ComputeDataWindow(
  framing: ReturnType<HdRenderPassState['getFraming']>,
  fallbackViewport: GfVec4f,
): GfVec4f {
  if (framing.isValid()) {
    const dataWindow = framing.dataWindow
    return new GfVec4f(
      dataWindow.getMinX(),
      dataWindow.getMinY(),
      dataWindow.getWidth(),
      dataWindow.getHeight())
  }
  return fallbackViewport
}

/** renderPassState.cpp:184-189 */
function _ToVec4i(v: GfVec4f): GfVec4i {
  return new GfVec4i(Math.trunc(v.get(0)), Math.trunc(v.get(1)),
    Math.trunc(v.get(2)), Math.trunc(v.get(3)))
}

/** renderPassState.cpp:191-205 */
function _ComputeViewport(
  dataWindow: ReturnType<HdRenderPassState['getFraming']>['dataWindow'],
  framebufferHeight: number,
): GfVec4i {
  if (framebufferHeight > 0) {
    return new GfVec4i(
      dataWindow.getMinX(),
      framebufferHeight - (dataWindow.getMinY() + dataWindow.getHeight()),
      dataWindow.getWidth(),
      dataWindow.getHeight())
  } else {
    return new GfVec4i(dataWindow.getMinX(), dataWindow.getMinY(),
      dataWindow.getWidth(), dataWindow.getHeight())
  }
}

/** renderPassState.cpp:612-631 */
function _GetColorMask(mask: RenderPassStateColorMask): HgiColorMask {
  switch (mask) {
    default:
    case RenderPassStateColorMask.ColorMaskNone:
      return 0
    case RenderPassStateColorMask.ColorMaskRGB:
      return HgiColorMaskBits.HgiColorMaskRed |
        HgiColorMaskBits.HgiColorMaskGreen |
        HgiColorMaskBits.HgiColorMaskBlue
    case RenderPassStateColorMask.ColorMaskRGBA:
      return HgiColorMaskBits.HgiColorMaskRed |
        HgiColorMaskBits.HgiColorMaskGreen |
        HgiColorMaskBits.HgiColorMaskBlue |
        HgiColorMaskBits.HgiColorMaskAlpha
  }
}

/** An AOV binding's clear value is empty (VtValue::IsEmpty). */
function _IsEmptyClearValue(v: unknown): boolean {
  return v === undefined || v === null || (v instanceof VtValue && v.IsEmpty())
}

/** renderPassState.cpp:857-871 */
function _GetRenderBuffer(aov: HdRenderPassAovBinding,
  renderIndex: HdStRenderPassStateRenderIndex | null): HdStRenderBuffer | null {
  if (aov.renderBuffer) {
    return aov.renderBuffer as HdStRenderBuffer
  }
  return (renderIndex?.getBprim(HdPrimTypeTokens.renderBuffer as TfToken, aov.renderBufferId) ??
    null) as HdStRenderBuffer | null
}

/** renderPassState.cpp:874-918 */
function _ToVec4f(v: unknown): GfVec4f {
  const value = v as VtValue
  const name = value.getTypeName()
  const held = value.UncheckedGet<unknown>()
  const comps = (x: unknown, n: number): number[] => {
    const g = x as { get(i: number): number }
    return Array.from({ length: n }, (_, i) => g.get(i))
  }
  switch (name) {
    case 'float': return new GfVec4f(held as number, 0, 0, 0)
    case 'double':
    case 'int': return new GfVec4f(held as number, held as number, held as number, held as number)
    case 'GfVec2f':
    case 'GfVec2d': { const c = comps(held, 2); return new GfVec4f(c[0]!, c[1]!, 0.0, 1.0) }
    case 'GfVec3f':
    case 'GfVec3d': { const c = comps(held, 3); return new GfVec4f(c[0]!, c[1]!, c[2]!, 1.0) }
    case 'GfVec4f':
    case 'GfVec4d': { const c = comps(held, 4); return new GfVec4f(c[0]!, c[1]!, c[2]!, c[3]!) }
    case 'HdDepthStencilType': {
      const pair = held as [number, number]
      return new GfVec4f(pair[0], pair[1], 0.0, 0.0)
    }
  }
  TF_CODING_ERROR('Unsupported clear value for draw target attachment.')
  return new GfVec4f(0.0, 0.0, 0.0, 0.0)
}

/** renderPassState.h:42-245. A set of rendering parameters used among
 *  render passes, expressed as Hgi state, uniforms or shaders. */
export class HdStRenderPassState extends HdRenderPassState {
  // Camera state used when no HdCamera available
  private _worldToViewMatrix = new GfMatrix4d(1)
  private _projectionMatrix = new GfMatrix4d(1)
  private _clipPlanes: GfVec4d[] = []
  private _cullMatrix = new GfMatrix4d(1.0) // updated during Prepare(..)

  // Shader Objects
  private _renderPassShader: HdStRenderPassShader
  private _fallbackLightingShader: HdSt_FallbackLightingShader
  private _lightingShader: HdStLightingShader
  private _renderPassStateBar: HdBufferArrayRange | null = null
  private _clipPlanesBufferSize = 0
  private _resolveMultiSampleAov = true

  /** renderPassState.cpp:57-74 */
  constructor(renderPassShader: HdStRenderPassShader = new HdStRenderPassShader()) {
    super()
    this._renderPassShader = renderPassShader
    this._fallbackLightingShader = new HdSt_FallbackLightingShader()
    this._lightingShader = this._fallbackLightingShader
  }

  private _stCamera(): HdStRenderPassStateCamera | null {
    return this._camera as HdStRenderPassStateCamera | null
  }

  /** renderPassState.cpp:78-89 */
  private _getFramebufferHeight(): number {
    for (const aov of this.getAovBindings()) {
      const renderBuffer = aov.renderBuffer as HdStRenderBuffer | undefined
      if (renderBuffer) {
        if (renderBuffer.getHeight() > 0) {
          return renderBuffer.getHeight()
        }
      }
    }
    return 0
  }

  /** renderPassState.cpp:123-138 */
  private _computeFlippedFilmbackWindow(): GfRange2f {
    if (this._framing.isValid()) {
      return _FlipWindow(
        this._framing.computeFilmbackWindow(
          _CameraAspectRatio(this._stCamera()),
          this.getWindowPolicy()),
        this._getFramebufferHeight())
    } else {
      const origin = new GfVec2f(this._viewport.get(0), this._viewport.get(1))
      const max = new GfVec2f(
        this._viewport.get(0) + this._viewport.get(2),
        this._viewport.get(1) + this._viewport.get(3))
      return new GfRange2f(origin, max)
    }
  }

  /** renderPassState.cpp:140-164 */
  computeImageToHorizontallyNormalizedFilmback(): GfVec4f {
    const window = this._computeFlippedFilmbackWindow()
    const size0 = Math.fround(window.getMax().get(0) - window.getMin().get(0))

    // To achieve 1., we need x to change by 2 when moving from the
    // left to the right edge of window.
    const xScale = Math.fround(_SafeDiv(2.0, size0))

    // To achieve 3., we need to take the pixel aspect ratio into account.
    const yScale = this._framing.isValid()
      ? Math.fround(_SafeDiv(xScale, this._framing.pixelAspectRatio))
      : xScale

    // We need the midpoint of window to go to (0,0) for 2.
    const mid0 = Math.fround(0.5 * Math.fround(window.getMin().get(0) + window.getMax().get(0)))
    const mid1 = Math.fround(0.5 * Math.fround(window.getMin().get(1) + window.getMax().get(1)))

    return new GfVec4f(xScale, yScale, -mid0 * xScale, -mid1 * yScale)
  }

  /** renderPassState.cpp:207-219 */
  computeViewport(): GfVec4i {
    const framing = this.getFraming()
    // Use data window for clients using the new camera framing API.
    if (framing.isValid()) {
      return _ComputeViewport(framing.dataWindow, this._getFramebufferHeight())
    }

    // For clients not using the new camera framing API, fallback
    // to the viewport they specified.
    return _ToVec4i(this.getViewport())
  }

  /** renderPassState.cpp:221-496 */
  override Prepare(resourceRegistry: unknown): void {
    super.Prepare(resourceRegistry)

    if (!TfDebug.isEnabled(HdDebugCodes.HD_FREEZE_CULL_FRUSTUM)) {
      this._cullMatrix = this.getWorldToViewMatrix().getMultiply(this.getProjectionMatrix())
    }

    const hdStResourceRegistry = resourceRegistry as HdStResourceRegistry

    const clipPlanes: GfVec4f[] = []
    for (const plane of this.getClipPlanes()) {
      clipPlanes.push(new GfVec4f(plane.get(0), plane.get(1), plane.get(2), plane.get(3)))
    }
    const maxClipPlanes = hdStResourceRegistry.getHgi().getCapabilities()!.getMaxClipDistances()
    if (clipPlanes.length >= maxClipPlanes) {
      clipPlanes.length = maxClipPlanes
    }

    // allocate bar if it does not exist
    if (!this._renderPassStateBar || this._clipPlanesBufferSize < clipPlanes.length) {
      const bufferSpecs: HdBufferSpecT[] = []

      // note: InterleavedMemoryManager computes the offsets in the packed
      // struct of following entries, which CodeGen generates the struct
      // definition into GLSL source in accordance with.
      const matType = HdVtBufferSource.getDefaultMatrixType()

      const spec = (name: string, type: HdType, count = 1): void => {
        bufferSpecs.push({ name: name as TfToken, tupleType: { type, count } })
      }
      spec(HdShaderTokens.worldToViewMatrix, matType)
      spec(HdShaderTokens.worldToViewInverseMatrix, matType)
      spec(HdShaderTokens.projectionMatrix, matType)
      spec(HdShaderTokens.projectionInverseMatrix, matType)
      spec(HdShaderTokens.imageToWorldMatrix, matType)
      spec(HdShaderTokens.imageToHorizontallyNormalizedFilmback, HdType.HdTypeFloatVec4)
      spec(HdShaderTokens.overrideColor, HdType.HdTypeFloatVec4)
      spec(HdShaderTokens.wireframeColor, HdType.HdTypeFloatVec4)
      spec(HdShaderTokens.maskColor, HdType.HdTypeFloatVec4)
      spec(HdShaderTokens.indicatorColor, HdType.HdTypeFloatVec4)
      spec(HdShaderTokens.pointColor, HdType.HdTypeFloatVec4)
      spec(HdShaderTokens.pointSize, HdType.HdTypeFloat)
      spec(HdShaderTokens.pointSelectedSize, HdType.HdTypeFloat)
      spec(HdShaderTokens.lightingBlendAmount, HdType.HdTypeFloat)
      spec(HdShaderTokens.linearExposure, HdType.HdTypeFloat)
      spec(HdShaderTokens.stepSize, HdType.HdTypeFloat)
      spec(HdShaderTokens.stepSizeLighting, HdType.HdTypeFloat)
      spec(HdShaderTokens.multisampleCount, HdType.HdTypeUInt32)

      spec(HdShaderTokens.alphaThreshold, HdType.HdTypeFloat)

      spec(HdShaderTokens.tessLevel, HdType.HdTypeFloat)
      spec(HdShaderTokens.viewport, HdType.HdTypeFloatVec4)

      if (maxClipPlanes > 0) {
        // We allocate for clip planes based on whether clip planes are
        // supported, not whether they are enabled, to avoid costly shader
        // recompilation when toggling clip planes on and off. When clip
        // planes are supported (maxClipPlanes > 0), we allocate storage for
        // up to four clip planes, limited by maxClipPlanes.
        const minNumClipPlanes = Math.min(maxClipPlanes, 4)
        this._clipPlanesBufferSize = Math.max(clipPlanes.length, minNumClipPlanes)

        spec(HdShaderTokens.numClipPlanes, HdType.HdTypeUInt32)
        spec(HdShaderTokens.clipPlanes, HdType.HdTypeFloatVec4, this._clipPlanesBufferSize)
      }
      // allocate interleaved buffer
      this._renderPassStateBar = hdStResourceRegistry.allocateUniformBufferArrayRange(
        HdTokens.drawingShader as TfToken, bufferSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform)

      const renderPassStateBar = this._renderPassStateBar as HdStBufferArrayRange

      // add buffer binding request
      this._renderPassShader.addBufferBinding(
        new HdStBindingRequest(HdStBinding.UBO, _tokens.renderPassState,
          renderPassStateBar, /*interleaved=*/true))
    }

    // Lighting hack supports different blending amounts, but we are currently
    // only using the feature to turn lighting on and off.
    const lightingBlendAmount = this._lightingEnabled ? 1.0 : 0.0

    // Camera exposure (linear-encoded)
    const camera = this._stCamera()
    const linearExposure = (camera && this._enableExposureCompensation)
      ? camera.getLinearExposureScale() : 1.0

    const worldToViewMatrix = this.getWorldToViewMatrix()
    let projMatrix = this.getProjectionMatrix()

    const capabilities = hdStResourceRegistry.getHgi().getCapabilities()!
    if (!capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne)) {
      // Different backends use different clip space depth ranges. The
      // codebase generally assumes an OpenGL-style depth of [-1, 1] when
      // computing projection matrices, so we must add an additional
      // conversion when the Hgi backend expects a [0, 1] depth range.
      const depthAdjustmentMat = new GfMatrix4d(1)
      depthAdjustmentMat.SetElement(2, 2, 0.5)
      depthAdjustmentMat.SetElement(3, 2, 0.5)
      projMatrix = projMatrix.getMultiply(depthAdjustmentMat)
    }
    const doublesSupported = capabilities.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

    const f = (x: number): VtValue => VtValue.create(Math.fround(x), VtValueTypes.float)
    const v4 = (x: GfVec4f): VtValue => VtValue.create(x, VtValueTypes.GfVec4f)
    const sources: HdBufferSource[] = [
      new HdVtBufferSource(HdShaderTokens.worldToViewMatrix, worldToViewMatrix, doublesSupported),
      new HdVtBufferSource(HdShaderTokens.worldToViewInverseMatrix,
        worldToViewMatrix.getInverse(), doublesSupported),
      new HdVtBufferSource(HdShaderTokens.projectionMatrix, projMatrix, doublesSupported),
      new HdVtBufferSource(HdShaderTokens.projectionInverseMatrix,
        projMatrix.getInverse(), doublesSupported),
      new HdVtBufferSource(HdShaderTokens.imageToWorldMatrix,
        this.getImageToWorldMatrix(), doublesSupported),
      new HdVtBufferSource(HdShaderTokens.imageToHorizontallyNormalizedFilmback,
        v4(this.computeImageToHorizontallyNormalizedFilmback())),
      // Override color alpha component is used as the amount to blend in the
      // override color over the top of the regular fragment color.
      new HdVtBufferSource(HdShaderTokens.overrideColor, v4(this._overrideColor)),
      new HdVtBufferSource(HdShaderTokens.wireframeColor, v4(this._wireframeColor)),
      new HdVtBufferSource(HdShaderTokens.maskColor, v4(this._maskColor)),
      new HdVtBufferSource(HdShaderTokens.indicatorColor, v4(this._indicatorColor)),
      new HdVtBufferSource(HdShaderTokens.pointColor, v4(this._pointColor)),
      new HdVtBufferSource(HdShaderTokens.pointSize, f(this._pointSize)),
      new HdVtBufferSource(HdShaderTokens.pointSelectedSize, f(this._pointSelectedSize)),
      new HdVtBufferSource(HdShaderTokens.lightingBlendAmount, f(lightingBlendAmount)),
      new HdVtBufferSource(HdShaderTokens.linearExposure, f(linearExposure)),
      new HdVtBufferSource(HdShaderTokens.stepSize, f(this._stepSize)),
      new HdVtBufferSource(HdShaderTokens.stepSizeLighting, f(this._stepSizeLighting)),
    ]

    let multisampleCount = 1
    const aovBindings = this.getAovBindings()
    if (aovBindings.length > 0 && this.getUseAovMultiSample()) {
      const renderBuffer = aovBindings[0]!.renderBuffer as HdStRenderBuffer | undefined
      if (renderBuffer && typeof renderBuffer.isMultiSampled === 'function') {
        multisampleCount = renderBuffer.isMultiSampled()
          ? renderBuffer.getMSAASampleCount() : 1
      }
    }

    sources.push(new HdVtBufferSource(HdShaderTokens.multisampleCount,
      VtValue.create(multisampleCount >>> 0, VtValueTypes.uint)))

    sources.push(new HdVtBufferSource(HdShaderTokens.alphaThreshold, f(this._alphaThreshold)))

    sources.push(new HdVtBufferSource(HdShaderTokens.tessLevel, f(this._tessLevel)))
    sources.push(new HdVtBufferSource(HdShaderTokens.viewport,
      v4(_ComputeDataWindow(this._framing, this._viewport))))
    if (maxClipPlanes > 0) {
      sources.push(new HdVtBufferSource(HdShaderTokens.numClipPlanes,
        VtValue.create(clipPlanes.length >>> 0, VtValueTypes.uint)))

      if (clipPlanes.length > 0) {
        sources.push(new HdVtBufferSource(HdShaderTokens.clipPlanes,
          VtValue.createArray(new VtArray(clipPlanes, VtValueTypes.GfVec4f)),
          clipPlanes.length))
      }
    }

    hdStResourceRegistry.addSources(this._renderPassStateBar!, sources)

    // notify view-transform to the lighting shader to update its uniform block
    this._lightingShader.setCamera(worldToViewMatrix, projMatrix)
  }

  /** renderPassState.cpp:655-775. Sets OpenGL state; not used by Storm's Hgi
   *  path, so nothing is recorded here. */
  bind(_hgiCapabilities: HgiCapabilities): void {}

  /** renderPassState.cpp:777-818. Restores OpenGL state; see Bind. */
  unbind(_hgiCapabilities: HgiCapabilities): void {}

  /** renderPassState.cpp:498-502 */
  setResolveAovMultiSample(state: boolean): void {
    this._resolveMultiSampleAov = state
  }

  /** renderPassState.cpp:504-508 */
  getResolveAovMultiSample(): boolean {
    return this._resolveMultiSampleAov
  }

  /** renderPassState.cpp:510-518 */
  setLightingShader(lightingShader: HdStLightingShader | null): void {
    if (lightingShader) {
      this._lightingShader = lightingShader
    } else {
      this._lightingShader = this._fallbackLightingShader
    }
  }

  /** renderPassState.h:87-89 */
  getLightingShader(): HdStLightingShader {
    return this._lightingShader
  }

  /** renderPassState.cpp:520-533 */
  setRenderPassShader(renderPassShader: HdStRenderPassShader): void {
    this._renderPassShader = renderPassShader
    if (this._renderPassStateBar) {
      const renderPassStateBar = this._renderPassStateBar as HdStBufferArrayRange
      this._renderPassShader.addBufferBinding(
        new HdStBindingRequest(HdStBinding.UBO, _tokens.renderPassState,
          renderPassStateBar, /*interleaved=*/true))
    }
  }

  /** renderPassState.h:95-97 */
  getRenderPassShader(): HdStRenderPassShader {
    return this._renderPassShader
  }

  /** renderPassState.cpp:635-642. Sets OpenGL cull and polygon state; see
   *  Bind. */
  applyStateFromGeometricShader(_binder: HdSt_ResourceBinder,
    _geometricShader: HdSt_GeometricShader): void {}

  /** renderPassState.cpp:644-653 */
  applyStateFromCamera(): void {
    // notify view-transform to the lighting shader to update its uniform block
    // this needs to be done in execute as a multi camera setup may have been
    // synced with a different view matrix baked in for shadows.
    // SetCamera will no-op if the transforms are the same as before.
    this._lightingShader.setCamera(this.getWorldToViewMatrix(), this.getProjectionMatrix())
  }

  /** renderPassState.cpp:535-543 */
  getShaders(): HdStShaderCode[] {
    return [this._lightingShader, this._renderPassShader]
  }

  /** renderPassState.cpp:838-855 */
  getShaderHash(): bigint {
    let hash: bigint = 0n
    if (this._lightingShader) {
      hash = TfHashCombine(hash, this._lightingShader.computeHash())
    }
    if (this._renderPassShader) {
      hash = TfHashCombine(hash, this._renderPassShader.computeHash())
    }
    return TfHashCombine(hash, this._clipPlanesBufferSize)
  }

  /** renderPassState.cpp:820-836 */
  setCameraFramingState(worldToViewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d,
    viewport: GfVec4d, clipPlanes: ClipPlanesVector): void {
    if (this._camera) {
      // If a camera handle was set, reset it.
      this._camera = null
    }

    this._worldToViewMatrix = worldToViewMatrix
    this._projectionMatrix = projectionMatrix
    this._viewport = new GfVec4f(viewport.get(0), viewport.get(1), viewport.get(2), viewport.get(3))
    this._clipPlanes = [...clipPlanes]
  }

  /** renderPassState.h:129 */
  getCullMatrix(): GfMatrix4d { return this._cullMatrix }

  /** renderPassState.cpp:1060-1068 */
  override getWorldToViewMatrix(): GfMatrix4d {
    if (this._camera) {
      return super.getWorldToViewMatrix()
    }
    return this._worldToViewMatrix
  }

  /** renderPassState.cpp:1070-1077 */
  override getProjectionMatrix(): GfMatrix4d {
    if (this._camera) {
      return super.getProjectionMatrix()
    }
    return this._projectionMatrix
  }

  /** renderPassState.cpp:1079-1092 */
  override getClipPlanes(): ClipPlanesVector {
    if (!this._camera) {
      if (this._clippingEnabled) {
        return this._clipPlanes
      } else {
        return []
      }
    }
    return super.getClipPlanes()
  }

  /** renderPassState.cpp:920-984 */
  private _initAttachmentDesc(
    attachmentDesc: HgiAttachmentDesc,
    binding: HdRenderPassAovBinding,
    renderBuffer: HdStRenderBuffer | null,
    aovIndex: number,
  ): void {
    if (TF_VERIFY(renderBuffer, 'Invalid render buffer')) {
      attachmentDesc.format = HdStHgiConversions.getHgiFormat(renderBuffer!.GetFormat())
    }

    if (HdAovHasDepthSemantic(binding.aovName)) {
      attachmentDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget
    } else if (HdAovHasDepthStencilSemantic(binding.aovName)) {
      attachmentDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsStencilTarget |
        HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget
    } else {
      attachmentDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget

      // Apply blend state settings to the color attachment.
      attachmentDesc.blendEnabled = this._blendEnabled
      attachmentDesc.srcColorBlendFactor = this._blendColorSrcFactor as number as HgiBlendFactor
      attachmentDesc.dstColorBlendFactor = this._blendColorDstFactor as number as HgiBlendFactor
      attachmentDesc.colorBlendOp = this._blendColorOp as number as HgiBlendOp
      attachmentDesc.srcAlphaBlendFactor = this._blendAlphaSrcFactor as number as HgiBlendFactor
      attachmentDesc.dstAlphaBlendFactor = this._blendAlphaDstFactor as number as HgiBlendFactor
      attachmentDesc.alphaBlendOp = this._blendAlphaOp as number as HgiBlendOp
      attachmentDesc.blendConstantColor = this._blendConstantColor

      if (!this._colorMaskUseDefault) {
        if (aovIndex > 0 && aovIndex < this._colorMasks.length) {
          attachmentDesc.colorMask = _GetColorMask(this._colorMasks[aovIndex]!)
        } else if (this._colorMasks.length === 1) {
          attachmentDesc.colorMask = _GetColorMask(this._colorMasks[0]!)
        }
      }
    }

    // Don't use the clear value if the AOV has no clear value (e.g. AOV is
    // used as input to a second pass).
    const loadOp = _IsEmptyClearValue(binding.clearValue)
      ? HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
      : HgiAttachmentLoadOp.HgiAttachmentLoadOpClear
    attachmentDesc.loadOp = loadOp

    attachmentDesc.storeOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore

    if (!_IsEmptyClearValue(binding.clearValue)) {
      attachmentDesc.clearValue = _ToVec4f(binding.clearValue)
    }
  }

  /** renderPassState.cpp:986-1058 */
  makeGraphicsCmdsDesc(renderIndex: HdStRenderPassStateRenderIndex | null): HgiGraphicsCmdsDesc {
    const aovBindings = this.getAovBindings()

    const maxColorTex = 8
    const useMultiSample = this.getUseAovMultiSample()
    const resolveMultiSample = this.getResolveAovMultiSample()

    const desc = new HgiGraphicsCmdsDesc()

    for (let aovIndex = 0; aovIndex < aovBindings.length; ++aovIndex) {
      const aov = aovBindings[aovIndex]!
      const renderBuffer = _GetRenderBuffer(aov, renderIndex)

      if (!TF_VERIFY(renderBuffer, 'Invalid render buffer')) {
        continue
      }

      const multiSampled = useMultiSample && renderBuffer!.isMultiSampled()
      const rv = renderBuffer!.getResource(multiSampled)

      if (!TF_VERIFY(rv, 'Invalid render buffer texture')) {
        continue
      }

      // The texture handle we have is the handle of the multisample texture.
      const hgiTexHandle = rv as HgiTextureHandle

      // The resolve texture, if any.
      let hgiResolveHandle: HgiTextureHandle | null = null
      if (multiSampled && resolveMultiSample) {
        const resolveRes = renderBuffer!.getResource(/*ms*/false)
        if (!TF_VERIFY(resolveRes)) {
          continue
        }
        hgiResolveHandle = resolveRes as HgiTextureHandle
      }

      const attachmentDesc = new HgiAttachmentDesc()
      this._initAttachmentDesc(attachmentDesc, aov, renderBuffer, aovIndex)

      if (HdAovHasDepthSemantic(aov.aovName) || HdAovHasDepthStencilSemantic(aov.aovName)) {
        if (this._depthTestEnabled || this._depthMaskEnabled) {
          desc.depthAttachmentDesc = attachmentDesc
          desc.depthTexture = hgiTexHandle
          if (hgiResolveHandle) {
            desc.depthResolveTexture = hgiResolveHandle
          }
        }
      } else if (TF_VERIFY(desc.colorAttachmentDescs.length < maxColorTex,
        'Too many aov bindings for color attachments')) {
        desc.colorAttachmentDescs.push(attachmentDesc)
        desc.colorTextures.push(hgiTexHandle)
        if (hgiResolveHandle) {
          desc.colorResolveTextures.push(hgiResolveHandle)
        }
      }
    }

    return desc
  }

  /** renderPassState.cpp:1094-1116 */
  private _initPrimitiveState(pipeDesc: HgiGraphicsPipelineDesc,
    geometricShader: HdSt_GeometricShader): void {
    pipeDesc.primitiveType = geometricShader.getHgiPrimitiveType()

    if (pipeDesc.primitiveType === HgiPrimitiveType.HgiPrimitiveTypePatchList) {
      pipeDesc.tessellationState.primitiveIndexSize = geometricShader.getPrimitiveIndexSize()

      if (geometricShader.getUseMetalTessellation()) {
        pipeDesc.tessellationState.patchType = geometricShader.isPrimTypeTriangles()
          ? HgiTessellationStatePatchType.Triangle
          : HgiTessellationStatePatchType.Quad
        pipeDesc.tessellationState.tessFactorMode = geometricShader.isPrimTypePatches()
          ? HgiTessellationStateTessFactorMode.TessVertex
          : HgiTessellationStateTessFactorMode.Constant
      }
    }
  }

  /** renderPassState.cpp:1118-1172 */
  private _initAttachmentState(pipeDesc: HgiGraphicsPipelineDesc, firstDrawBatch: boolean): void {
    // For the time being we use the same attachment desc for every draw
    // batch and only the first draw batch clears.
    const aovBindings = this.getAovBindings()

    for (let aovIndex = 0; aovIndex < aovBindings.length; ++aovIndex) {
      const binding = aovBindings[aovIndex]!
      const attachment = new HgiAttachmentDesc()
      this._initAttachmentDesc(attachment, binding,
        (binding.renderBuffer ?? null) as HdStRenderBuffer | null, aovIndex)

      // Only the first draw batch should clear the attachments.
      if (!firstDrawBatch) {
        attachment.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
        attachment.clearValue = new GfVec4f(0, 0, 0, 0)
      }

      if (HdAovHasDepthSemantic(binding.aovName) || HdAovHasDepthStencilSemantic(binding.aovName)) {
        if (this._depthTestEnabled || this._depthMaskEnabled) {
          pipeDesc.depthAttachmentDesc = attachment
        }
      } else {
        pipeDesc.colorAttachmentDescs.push(attachment)
      }
    }

    // Allow MSAA if requested and the render buffers support it.
    let sampleCount = HgiSampleCount.HgiSampleCount1
    if (aovBindings.length > 0 && this.getUseAovMultiSample()) {
      const firstRenderBuffer = aovBindings[0]!.renderBuffer as HdStRenderBuffer

      if (firstRenderBuffer.isMultiSampled()) {
        sampleCount = firstRenderBuffer.getMSAASampleCount() as HgiSampleCount

        if (this.getResolveAovMultiSample()) {
          const resolveRes = firstRenderBuffer.getResource(/*ms*/false)
          if (TF_VERIFY(resolveRes)) {
            pipeDesc.resolveAttachments = true
          }
        }
      }
    }

    pipeDesc.multiSampleState.sampleCount = sampleCount
  }

  /** renderPassState.cpp:1174-1208 */
  private _initDepthStencilState(depthState: HgiDepthStencilState): void {
    if (this.getEnableDepthTest()) {
      depthState.depthTestEnabled = true
      depthState.depthCompareFn = HdStHgiConversions.getHgiCompareFunction(this._depthFunc)
      depthState.depthWriteEnabled = this.getEnableDepthMask()
    } else {
      depthState.depthTestEnabled = false
      depthState.depthWriteEnabled = false
    }

    if (!this.getDepthBiasUseDefault() && this.getDepthBiasEnabled()) {
      depthState.depthBiasEnabled = true
      depthState.depthBiasConstantFactor = this._depthBiasConstantFactor
      depthState.depthBiasSlopeFactor = this._depthBiasSlopeFactor
    }

    if (this.getStencilEnabled()) {
      depthState.stencilTestEnabled = true
      depthState.stencilFront.compareFn = HdStHgiConversions.getHgiCompareFunction(this._stencilFunc)
      depthState.stencilFront.referenceValue = this._stencilRef
      depthState.stencilFront.stencilFailOp = HdStHgiConversions.getHgiStencilOp(this._stencilFailOp)
      depthState.stencilFront.depthFailOp = HdStHgiConversions.getHgiStencilOp(this._stencilZFailOp)
      depthState.stencilFront.depthStencilPassOp = HdStHgiConversions.getHgiStencilOp(this._stencilZPassOp)
      depthState.stencilFront.readMask = this._stencilMask >>> 0
      Object.assign(depthState.stencilBack, depthState.stencilFront)
    }
  }

  /** renderPassState.cpp:1210-1220 */
  private _initMultiSampleState(multiSampleState: HgiMultiSampleState): void {
    multiSampleState.multiSampleEnable = this._multiSampleEnabled

    if (this._alphaToCoverageEnabled) {
      multiSampleState.alphaToCoverageEnable = true
      multiSampleState.alphaToOneEnable = true
    }
  }

  /** renderPassState.cpp:1222-1250 */
  private _initRasterizationState(rasterizationState: HgiRasterizationState,
    geometricShader: HdSt_GeometricShader): void {
    if (geometricShader.getPolygonMode() === HdPolygonMode.HdPolygonModeLine) {
      rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeLine
      const gsLineWidth = geometricShader.getLineWidth()
      if (gsLineWidth > 0) {
        rasterizationState.lineWidth = gsLineWidth
      }
    } else {
      rasterizationState.polygonMode = HgiPolygonMode.HgiPolygonModeFill
    }

    rasterizationState.cullMode = geometricShader.resolveCullMode(this._cullStyle)

    if (this.getEnableDepthClamp()) {
      rasterizationState.depthClampEnabled = true
    }
    rasterizationState.depthRange = this.getDepthRange()

    rasterizationState.conservativeRaster = this._conservativeRasterizationEnabled

    rasterizationState.numClipDistances =
      geometricShader.getUseHardwareClipPlanes() ? this.getClipPlanes().length : 0
  }

  /** renderPassState.cpp:1252-1263 */
  initGraphicsPipelineDesc(pipeDesc: HgiGraphicsPipelineDesc,
    geometricShader: HdSt_GeometricShader, firstDrawBatch: boolean): void {
    this._initPrimitiveState(pipeDesc, geometricShader)
    this._initDepthStencilState(pipeDesc.depthState)
    this._initMultiSampleState(pipeDesc.multiSampleState)
    this._initRasterizationState(pipeDesc.rasterizationState, geometricShader)
    this._initAttachmentState(pipeDesc, firstDrawBatch)
  }

  /** renderPassState.cpp:1265-1328 */
  getGraphicsPipelineHash(geometricShader: HdSt_GeometricShader, firstDrawBatch: boolean): bigint {
    // Hash all of the state that is captured in the pipeline state object.
    let hash = TfHashCombine(
      this._depthBiasUseDefault,
      this._depthBiasEnabled,
      this._depthBiasConstantFactor,
      this._depthBiasSlopeFactor,
      this._depthFunc,
      this._depthMaskEnabled,
      this._depthTestEnabled,
      this._depthClampEnabled,
      this._depthRange.get(0), this._depthRange.get(1),
      this._stencilFunc,
      this._stencilRef,
      this._stencilMask,
      this._stencilFailOp,
      this._stencilZFailOp,
      this._stencilZPassOp,
      this._stencilEnabled,
      this._lineWidth,
      this._blendColorOp,
      this._blendColorSrcFactor,
      this._blendColorDstFactor,
      this._blendAlphaOp,
      this._blendAlphaSrcFactor,
      this._blendAlphaDstFactor,
      this._blendAlphaDstFactor,
      this._blendConstantColor.get(0), this._blendConstantColor.get(1),
      this._blendConstantColor.get(2), this._blendConstantColor.get(3),
      this._blendEnabled,
      this._alphaToCoverageEnabled,
      this._colorMaskUseDefault,
      this._useMultiSampleAov,
      this._conservativeRasterizationEnabled,
      this.getClipPlanes().length,
      this._multiSampleEnabled,
      geometricShader.getPolygonMode(),
      geometricShader.getLineWidth(),
      geometricShader.resolveCullMode(this._cullStyle),
      geometricShader.getHgiPrimitiveType(),
      geometricShader.getPrimitiveIndexSize())

    // Hash the aov bindings by name and format.
    for (const binding of this.getAovBindings()) {
      const renderBuffer = binding.renderBuffer as HdStRenderBuffer

      const msaaCount = renderBuffer.isMultiSampled() ? renderBuffer.getMSAASampleCount() : 1
      const clear = firstDrawBatch ? !_IsEmptyClearValue(binding.clearValue) : false

      hash = TfHashCombine(hash, binding.aovName, renderBuffer.GetFormat(), msaaCount, clear)
    }

    return hash
  }

  /** renderPassState.cpp:1330-1400 */
  copyAllExceptShaderFrom(other: HdStRenderPassState): void {
    this._camera = other._camera
    this._viewport = other._viewport
    this._framing = other._framing
    this._overrideWindowPolicy = other._overrideWindowPolicy
    this._overrideColor = other._overrideColor
    this._wireframeColor = other._wireframeColor
    this._pointColor = other._pointColor
    this._pointSize = other._pointSize
    this._lightingEnabled = other._lightingEnabled
    this._clippingEnabled = other._clippingEnabled
    this._maskColor = other._maskColor
    this._indicatorColor = other._indicatorColor
    this._pointSelectedSize = other._pointSelectedSize
    this._alphaThreshold = other._alphaThreshold
    this._tessLevel = other._tessLevel
    this._drawRange = other._drawRange
    this._depthBiasUseDefault = other._depthBiasUseDefault
    this._depthBiasEnabled = other._depthBiasEnabled
    this._depthBiasConstantFactor = other._depthBiasConstantFactor
    this._depthBiasSlopeFactor = other._depthBiasSlopeFactor
    this._depthFunc = other._depthFunc
    this._depthMaskEnabled = other._depthMaskEnabled
    this._depthTestEnabled = other._depthTestEnabled
    this._depthClampEnabled = other._depthClampEnabled
    this._depthRange = other._depthRange
    this._cullStyle = other._cullStyle
    this._stencilFunc = other._stencilFunc
    this._stencilRef = other._stencilRef
    this._stencilMask = other._stencilMask
    this._stencilFailOp = other._stencilFailOp
    this._stencilZFailOp = other._stencilZFailOp
    this._stencilZPassOp = other._stencilZPassOp
    this._stencilEnabled = other._stencilEnabled
    this._lineWidth = other._lineWidth
    this._blendColorOp = other._blendColorOp
    this._blendColorSrcFactor = other._blendColorSrcFactor
    this._blendColorDstFactor = other._blendColorDstFactor
    this._blendAlphaOp = other._blendAlphaOp
    this._blendAlphaSrcFactor = other._blendAlphaSrcFactor
    this._blendAlphaDstFactor = other._blendAlphaDstFactor
    this._blendConstantColor = other._blendConstantColor
    this._blendEnabled = other._blendEnabled
    this._alphaToCoverageEnabled = other._alphaToCoverageEnabled
    this._colorMaskUseDefault = other._colorMaskUseDefault
    this._colorMasks = [...other._colorMasks]
    this._aovBindings = [...other._aovBindings]
    this._aovInputBindings = [...other._aovInputBindings]
    this._useMultiSampleAov = other._useMultiSampleAov
    this._conservativeRasterizationEnabled = other._conservativeRasterizationEnabled
    this._stepSize = other._stepSize
    this._stepSizeLighting = other._stepSizeLighting
    this._multiSampleEnabled = other._multiSampleEnabled
    this._worldToViewMatrix = other._worldToViewMatrix
    this._projectionMatrix = other._projectionMatrix
    this._clipPlanes = [...other._clipPlanes]
    this._cullMatrix = other._cullMatrix
    this._fallbackLightingShader = other._fallbackLightingShader
    this._lightingShader = other._lightingShader
    this._renderPassStateBar = other._renderPassStateBar
    this._clipPlanesBufferSize = other._clipPlanesBufferSize
    this._resolveMultiSampleAov = other._resolveMultiSampleAov
  }
}
