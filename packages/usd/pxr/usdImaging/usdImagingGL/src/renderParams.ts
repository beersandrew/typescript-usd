// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImagingGL/renderParams.cpp,
//  pxr/usdImaging/usdImagingGL/renderParams.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImagingGL/renderParams.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - UsdTimeCode is typescript-usd/usd's TimeCode; GfBBox3d is
//   typescript-usd/gf's BBox3d.
// - operator== is Equals() (renderParams.h:139-174).

import { Vec4d as GfVec4d, Vec4f as GfVec4f, type BBox3d as GfBBox3d } from 'typescript-usd/gf'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

/** renderParams.h:24-34 */
export enum UsdImagingGLDrawMode {
  DRAW_POINTS,
  DRAW_WIREFRAME,
  DRAW_WIREFRAME_ON_SURFACE,
  DRAW_SHADED_FLAT,
  DRAW_SHADED_SMOOTH,
  DRAW_GEOM_ONLY,
  DRAW_GEOM_FLAT,
  DRAW_GEOM_SMOOTH,
}

/** renderParams.h:36-47. Some assumptions are made about the order of these
 *  enums (UsdImagingGLEngine::_MakeHydraUsdImagingGLRenderParams). */
export enum UsdImagingGLCullStyle {
  CULL_STYLE_NO_OPINION,
  CULL_STYLE_NOTHING,
  CULL_STYLE_BACK,
  CULL_STYLE_FRONT,
  CULL_STYLE_BACK_UNLESS_DOUBLE_SIDED,

  CULL_STYLE_COUNT,
}

const _vecEq = (a: { equals(o: never): boolean }, b: unknown) => a.equals(b as never)
const _arrayEq = <T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean) =>
  a.length === b.length && a.every((x, i) => eq(x, b[i]!))

/** renderParams.h:49-131: used as an arguments class for various methods in
 *  UsdImagingGLEngine. */
export class UsdImagingGLRenderParams {
  frame: UsdTimeCode = UsdTimeCode.EarliestTime()
  complexity = 1.0
  drawMode: UsdImagingGLDrawMode = UsdImagingGLDrawMode.DRAW_SHADED_SMOOTH
  showGuides = false
  showProxy = true
  showRender = false
  forceRefresh = false
  flipFrontFacing = false
  cullStyle: UsdImagingGLCullStyle = UsdImagingGLCullStyle.CULL_STYLE_NOTHING
  enableLighting = true
  enableSampleAlphaToCoverage = false
  applyRenderState = true
  gammaCorrectColors = true
  highlight = false
  overrideColor = new GfVec4f(0, 0, 0, 0)
  wireframeColor = new GfVec4f(0, 0, 0, 0)
  /** threshold < 0 implies automatic */
  alphaThreshold = -1
  clipPlanes: GfVec4d[] = []
  enableSceneMaterials = true
  enableSceneLights = true
  /** Respect USD's model:drawMode attribute... */
  enableUsdDrawModes = true
  clearColor = new GfVec4f(0, 0, 0, 1)
  colorCorrectionMode = ''
  /** Optional OCIO color setings, only valid when
   *  colorCorrectionMode==HdxColorCorrectionTokens->openColorIO */
  lut3dSizeOCIO = 65
  ocioDisplay = ''
  ocioView = ''
  ocioColorSpace = ''
  ocioLook = ''
  // BBox settings
  bboxes: GfBBox3d[] = []
  bboxLineColor = new GfVec4f(1, 1, 1, 1)
  bboxLineDashSize = 3

  /** renderParams.h:139-174 (operator==) */
  Equals(other: UsdImagingGLRenderParams): boolean {
    return this.frame.GetValue() === other.frame.GetValue()
      && this.frame.isDefault() === other.frame.isDefault()
      && this.complexity === other.complexity
      && this.drawMode === other.drawMode
      && this.showGuides === other.showGuides
      && this.showProxy === other.showProxy
      && this.showRender === other.showRender
      && this.forceRefresh === other.forceRefresh
      && this.flipFrontFacing === other.flipFrontFacing
      && this.cullStyle === other.cullStyle
      && this.enableLighting === other.enableLighting
      && this.enableSampleAlphaToCoverage === other.enableSampleAlphaToCoverage
      && this.applyRenderState === other.applyRenderState
      && this.gammaCorrectColors === other.gammaCorrectColors
      && this.highlight === other.highlight
      && _vecEq(this.overrideColor, other.overrideColor)
      && _vecEq(this.wireframeColor, other.wireframeColor)
      && this.alphaThreshold === other.alphaThreshold
      && _arrayEq(this.clipPlanes, other.clipPlanes, (a, b) => a.equals(b))
      && this.enableSceneMaterials === other.enableSceneMaterials
      && this.enableSceneLights === other.enableSceneLights
      && this.enableUsdDrawModes === other.enableUsdDrawModes
      && _vecEq(this.clearColor, other.clearColor)
      && this.colorCorrectionMode === other.colorCorrectionMode
      && this.ocioDisplay === other.ocioDisplay
      && this.ocioView === other.ocioView
      && this.ocioColorSpace === other.ocioColorSpace
      && this.ocioLook === other.ocioLook
      && this.lut3dSizeOCIO === other.lut3dSizeOCIO
      && _arrayEq(this.bboxes, other.bboxes, (a, b) => a === b || String(a) === String(b))
      && _vecEq(this.bboxLineColor, other.bboxLineColor)
      && this.bboxLineDashSize === other.bboxLineDashSize
  }
}
