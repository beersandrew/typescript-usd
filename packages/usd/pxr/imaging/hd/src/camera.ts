// Ported from OpenUSD 26.11.1: pxr/imaging/hd/camera.cpp,
//  pxr/imaging/hd/camera.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/camera.{h,cpp} — HdCamera.
// Sprim for UsdGeomCamera prims. Computes the VP matrix for the renderer.

import { HdSprim } from './sprim.ts'
import { HdChangeTracker, type HdDirtyBits } from './changeTracker.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import type { HdContainerDataSource } from './dataSource.ts'
import type { HdTypedSampledDataSource } from './dataSource.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'
import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  Camera as GfCamera,
  Matrix4d as GfMatrix4d,
  Range1f as GfRange1f,
  type Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import { ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** HD_CAMERA_TOKENS (camera.h:27-80) */
export const HdCameraTokens = TfMakeTokens({
  projection: 'projection',
  horizontalAperture: 'horizontalAperture',
  verticalAperture: 'verticalAperture',
  horizontalApertureOffset: 'horizontalApertureOffset',
  verticalApertureOffset: 'verticalApertureOffset',
  focalLength: 'focalLength',
  clippingRange: 'clippingRange',
  clipPlanes: 'clipPlanes',
  fStop: 'fStop',
  focusDistance: 'focusDistance',
  focusOn: 'focusOn',
  dofAspect: 'dofAspect',
  splitDiopterCount: 'splitDiopter:count',
  splitDiopterAngle: 'splitDiopter:angle',
  splitDiopterOffset1: 'splitDiopter:offset1',
  splitDiopterWidth1: 'splitDiopter:width1',
  splitDiopterFocusDistance1: 'splitDiopter:focusDistance1',
  splitDiopterOffset2: 'splitDiopter:offset2',
  splitDiopterWidth2: 'splitDiopter:width2',
  splitDiopterFocusDistance2: 'splitDiopter:focusDistance2',
  shutterOpen: 'shutterOpen',
  shutterClose: 'shutterClose',
  exposure: 'exposure',
  exposureTime: 'exposureTime',
  exposureIso: 'exposureIso',
  exposureFStop: 'exposureFStop',
  exposureResponsivity: 'exposureResponsivity',
  linearExposureScale: 'linearExposureScale',
  windowPolicy: 'windowPolicy',
  standard: 'standard',
  fisheye: 'fisheye',
  lensDistortionType: 'lensDistortion:type',
  lensDistortionK1: 'lensDistortion:k1',
  lensDistortionK2: 'lensDistortion:k2',
  lensDistortionCenter: 'lensDistortion:center',
  lensDistortionAnaSq: 'lensDistortion:anaSq',
  lensDistortionAsym: 'lensDistortion:asym',
  lensDistortionScale: 'lensDistortion:scale',
  lensDistortionIor: 'lensDistortion:ior',
})

/** camera.cpp:56-283: the parameters Sync reads with GetCameraParamValue
 *  under DirtyParams, in upstream order, with their constructor defaults
 *  (camera.cpp:13-50). */
const _paramDefaults: readonly [string, unknown][] = [
  [HdCameraTokens.fStop, 0.0],
  [HdCameraTokens.focusDistance, 0.0],
  [HdCameraTokens.focusOn, false],
  [HdCameraTokens.dofAspect, 1.0],
  [HdCameraTokens.splitDiopterCount, 0],
  [HdCameraTokens.splitDiopterAngle, 0.0],
  [HdCameraTokens.splitDiopterOffset1, 0.0],
  [HdCameraTokens.splitDiopterWidth1, 0.0],
  [HdCameraTokens.splitDiopterFocusDistance1, 0.0],
  [HdCameraTokens.splitDiopterOffset2, 0.0],
  [HdCameraTokens.splitDiopterWidth2, 0.0],
  [HdCameraTokens.splitDiopterFocusDistance2, 0.0],
  [HdCameraTokens.shutterOpen, 0.0],
  [HdCameraTokens.shutterClose, 0.0],
  [HdCameraTokens.exposure, 0.0],
  [HdCameraTokens.exposureTime, 1.0],
  [HdCameraTokens.exposureIso, 100.0],
  [HdCameraTokens.exposureFStop, 1.0],
  [HdCameraTokens.exposureResponsivity, 1.0],
  [HdCameraTokens.linearExposureScale, 1.0],
  [HdCameraTokens.lensDistortionType, HdCameraTokens.standard],
  [HdCameraTokens.lensDistortionK1, 0.0],
  [HdCameraTokens.lensDistortionK2, 0.0],
  [HdCameraTokens.lensDistortionCenter, undefined],
  [HdCameraTokens.lensDistortionAnaSq, 1.0],
  [HdCameraTokens.lensDistortionAsym, undefined],
  [HdCameraTokens.lensDistortionScale, 1.0],
  [HdCameraTokens.lensDistortionIor, 0.0],
]

/** VtValue::IsEmpty / Get for a value a scene delegate returns (a VtValue
 *  or a plain value; undefined is empty). */
function _held(v: unknown): unknown {
  if (v === undefined || v === null) return undefined
  const value = v as { IsEmpty?: () => boolean, UncheckedGet?: () => unknown }
  if (typeof value.IsEmpty === 'function') {
    return value.IsEmpty() ? undefined : value.UncheckedGet!()
  }
  return v
}

// Invert a row-major rigid-body (rotation + translation, no scale) 4×4 matrix.
// Camera xforms are always rigid-body, so this is exact and avoids a full
// inverse. Row-vector convention: M = [R; t] → M⁻¹ = [Rᵀ; −t·Rᵀ], where
// (t·Rᵀ)_j = t · (row j of R).
function invertRigid(m: number[]): number[] {
  const [r00,r01,r02,,r10,r11,r12,,r20,r21,r22,,tx,ty,tz] = m
  const itx = -((tx??0)*r00! + (ty??0)*r01! + (tz??0)*r02!)
  const ity = -((tx??0)*r10! + (ty??0)*r11! + (tz??0)*r12!)
  const itz = -((tx??0)*r20! + (ty??0)*r21! + (tz??0)*r22!)
  return [
    r00!, r10!, r20!, 0,
    r01!, r11!, r21!, 0,
    r02!, r12!, r22!, 0,
    itx,  ity,  itz,  1,
  ]
}

function mul4(a: number[], b: number[]): number[] {
  const r = new Array<number>(16).fill(0)
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++)
      for (let k = 0; k < 4; k++)
        r[row*4+col]! += (a[row*4+k] ?? 0) * (b[k*4+col] ?? 0)
  return r
}

function transpose(m: number[]): number[] {
  return [m[0]!,m[4]!,m[8]!,m[12]!, m[1]!,m[5]!,m[9]!,m[13]!, m[2]!,m[6]!,m[10]!,m[14]!, m[3]!,m[7]!,m[11]!,m[15]!]
}

// GfCamera::APERTURE_UNIT (pxr/base/gf/camera.cpp): apertures are authored in
// tenths of a mm, so a window extent in world units is aperture * 0.1.
const APERTURE_UNIT = 0.1

// The upstream HdCamera API below (camera.h:82-366, camera.cpp) serves the
// scene-delegate path (Sync(sceneDelegate, renderParam, dirtyBits)); its
// members are separate from the scene-index fields above, which keep USD
// authoring units for the hand-written renderer. Apertures and focal length
// are in scene units (1/10 of USD's), as upstream stores them.
export class HdCamera extends HdSprim {
  /** camera.h:102-113 */
  static readonly Clean = 0
  static readonly DirtyTransform = 1 << 0
  static readonly DirtyParams = 1 << 1
  static readonly DirtyClipPlanes = 1 << 2
  static readonly DirtyWindowPolicy = 1 << 3
  static readonly AllDirty = HdCamera.DirtyTransform | HdCamera.DirtyParams |
    HdCamera.DirtyClipPlanes | HdCamera.DirtyWindowPolicy

  /** camera.h:115-118 */
  static readonly Perspective = 0
  static readonly Orthographic = 1

  // camera.cpp:13-50 (constructor defaults)
  private _transform = new GfMatrix4d(1.0)
  private _projection = HdCamera.Perspective
  private _hdHorizontalAperture = 0.0
  private _hdVerticalAperture = 0.0
  private _hdHorizontalApertureOffset = 0.0
  private _hdVerticalApertureOffset = 0.0
  private _hdFocalLength = 0.0
  private _clippingRange = new GfRange1f()
  private _clipPlanes: GfVec4d[] = []
  private _windowPolicy = CameraUtilConformWindowPolicy.CameraUtilFit
  private _params = new Map<string, unknown>(_paramDefaults)

  // USD physical lens params (millimetres)
  focalLength        = 50.0
  horizontalAperture = 20.955
  verticalAperture   = 15.2908
  // GfCamera::Projection — 'perspective' (default) or 'orthographic'.
  projection: 'perspective' | 'orthographic' = 'perspective'
  // Aperture offsets shift the projection window off-center (GfCamera::
  // GetFrustum). Default 0 = centered. Authored in the same mm units as
  // the apertures; the unit scale cancels against focalLength in perspective.
  horizontalApertureOffset = 0
  verticalApertureOffset   = 0
  clippingRange: [number, number] = [0.1, 10000]
  // camera-to-world, row-major
  worldMatrix: number[] = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]

  /** camera.cpp:325-330: HdCamera::AllDirty (the camera's own bits; the
   *  change tracker's AllDirty excludes bit 1, which is DirtyParams here). */
  getInitialDirtyBitsMask(): HdDirtyBits { return HdCamera.AllDirty }

  sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrDirtyBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void {
    if (dirtyBits !== undefined) {
      this._syncFromSceneDelegate(sceneDelegateOrPrim as HdSceneDelegate, dirtyBits)
      return
    }
    const sceneIndexPrim = sceneDelegateOrPrim as HdSceneIndexPrim
    void renderParamOrDirtyBits
    // The 'camera' container of the prim (the data source keys of
    // hd/cameraSchema.h), read directly.
    const camera = sceneIndexPrim.dataSource?.Get('camera') as HdContainerDataSource | undefined
    if (!camera) return
    const get = <T,>(name: string) => (camera.Get(name) as HdTypedSampledDataSource<T> | undefined)?.getTypedValue(0)

    const wm  = get<number[]>('worldMatrix')
    if (wm) this.worldMatrix = wm

    const fl  = get<number>('focalLength')
    if (fl !== undefined) this.focalLength = fl

    const ha  = get<number>('horizontalAperture')
    if (ha !== undefined) this.horizontalAperture = ha

    const va  = get<number>('verticalAperture')
    if (va !== undefined) this.verticalAperture = va

    const cr  = get<number[]>('clippingRange')
    if (cr && cr.length >= 2) this.clippingRange = [cr[0]!, cr[1]!]

    const proj = get<string>('projection')
    if (proj === 'orthographic' || proj === 'perspective') this.projection = proj

    // Aperture offsets, if the scene authored them. Absent = 0
    // (centered), matching the common case and the field defaults.
    const camDs = sceneIndexPrim.dataSource?.Get('camera') as HdContainerDataSource | undefined
    const hao = (camDs?.Get('horizontalApertureOffset') as HdTypedSampledDataSource<number> | undefined)?.getTypedValue(0)
    if (hao !== undefined) this.horizontalApertureOffset = hao
    const vao = (camDs?.Get('verticalApertureOffset') as HdTypedSampledDataSource<number> | undefined)?.getTypedValue(0)
    if (vao !== undefined) this.verticalApertureOffset = vao
  }

  // World-space view direction: cameras look down -Z, so -row2 of the
  // camera-to-world matrix in the row-vector convention.
  getViewDirection(): [number, number, number] {
    const m = this.worldMatrix
    return [-m[8]!, -m[9]!, -m[10]!]
  }

  // World-space camera position (the translation row).
  getPosition(): [number, number, number] {
    const m = this.worldMatrix
    return [m[12]!, m[13]!, m[14]!]
  }

  // Returns transposed VP matrix ready for WGSL upload (column-major convention).
  //
  // Faithful to GfCamera::GetFrustum() + GfFrustum::ComputeProjectionMatrix()
  // (pxr/base/gf/camera.cpp, pxr/base/gf/frustum.cpp), with TWO deliberate
  // re-expressions that match the rest of this renderer:
  //
  //  1. Depth (z) maps clip-space z to [0,1] rather than OpenGL's [-1,1].
  //     This port renders through WebGPU, whose WGSL clip space requires
  //     z ∈ [0,1]; every projection here is authored in this [0,1] form
  //     (see typescript-usd/usdGeom computeProjectionMatrix, typescript-usd/usdviewq camera.ts).
  //
  //  2. The display window is conformed to the viewport aspect by MATCHING
  //     the VERTICAL aperture (CameraUtilMatchVertical): vertical FOV comes
  //     from verticalAperture; the horizontal extent is verticalAperture
  //     scaled by the viewport aspect. This is the conformance the free
  //     camera (typescript-usd/usdviewq camera.ts) and the goldens use, so a scene
  //     camera frames identically to a free camera at the same pose.
  //
  // GfCamera::GetFrustum builds the reference window (near=1) from aperture
  // and aperture offset: l/r = (∓hAp/2 + hOff)/focalLength, b/t similarly.
  // GfFrustum::ComputeProjectionMatrix puts the window-center shift in
  // matrix[2][0..1] = (r+l)/rl, (t+b)/tb. Vertically that is 2*vOff/vAp.
  // Horizontally, under MatchVertical the half-window is (vAp/2)*aspect/fl
  // and the offset shifts it by hOff/fl, so (r+l)/rl = 2*hOff/(vAp*aspect).
  // Offsets default to 0 → ox=oy=0 → the centered projection is unchanged.
  getViewProjection(aspect: number): Float32Array<ArrayBuffer> {
    const view = invertRigid(this.worldMatrix)

    const [near, far] = this.clippingRange

    if (this.projection === 'orthographic') {
      // Faithful to GfFrustum::Orthographic (pxr/base/gf/frustum.cpp), with the
      // same two re-expressions as the perspective path: WGSL [0,1] depth and a
      // MatchVertical conform to the viewport aspect.
      //
      // GfCamera::GetFrustum sizes the ORTHO window directly from the aperture
      // (no focal-length divide): half-extent = aperture/2 * APERTURE_UNIT, in
      // world units. The vertical half-window drives 2/tb; the horizontal extent
      // is conformed to the viewport aspect off the vertical, matching the free
      // camera and the perspective path so a scene camera frames identically.
      const sy = 2 / (this.verticalAperture * APERTURE_UNIT)
      const sx = sy / aspect
      // Window-center shift from the aperture offsets, against the conformed
      // window. (t+b)/tb = 2*vOff/vAp; (r+l)/rl = 2*hOff/(vAp*aspect). Default 0.
      const ox = (2 * this.horizontalApertureOffset) / (this.verticalAperture * aspect)
      const oy = (2 * this.verticalApertureOffset)    /  this.verticalAperture
      // Depth: GfFrustum ortho maps z=-near→-1, z=-far→+1 (OpenGL); the [0,1]
      // re-expression gives clipZ = -z/(far-near) - near/(far-near).
      const fn = far - near
      const proj = [
        sx,  0,   0,        0,
        0,   sy,  0,        0,
        0,   0,  -1 / fn,   0,
        -ox, -oy, -near/fn, 1,
      ]
      return new Float32Array(transpose(mul4(view, proj)))
    }

    // 2/tb from the vertical aperture; horizontal is conformed via aspect.
    const sy = (2 * this.focalLength) / this.verticalAperture
    const sx = sy / aspect
    // Window-center shift (r+l)/rl, (t+b)/tb against the conformed window.
    const ox = (2 * this.horizontalApertureOffset) / (this.verticalAperture * aspect)
    const oy = (2 * this.verticalApertureOffset)    /  this.verticalAperture
    // Depth: GfFrustum perspective is z → [-1,1]; the [0,1] re-expression maps
    // z=-near→0, z=-far→1 after perspective divide.
    const zScale = far / (near - far)
    const proj = [
      sx, 0,  0,            0,
      0,  sy, 0,            0,
      ox, oy, zScale,      -1,
      0,  0,  near*zScale,  0,
    ]

    return new Float32Array(transpose(mul4(view, proj)))
  }

  /** camera.cpp:52-293 (Sync with a scene delegate). */
  private _syncFromSceneDelegate(sceneDelegate: HdSceneDelegate, dirtyBits: HdDirtyBitsRef): void {
    const id = this.getId()
    if (!TF_VERIFY(sceneDelegate != null)) {
      return
    }

    const bits = dirtyBits.value
    if (bits & HdCamera.DirtyTransform) {
      this._transform = sceneDelegate.getTransform(id) as GfMatrix4d
    }

    if (bits & HdCamera.DirtyParams) {
      const get = (key: string): unknown => _held(sceneDelegate.getCameraParamValue(id, key))
      const vProjection = get(HdCameraTokens.projection)
      if (vProjection !== undefined) this._projection = vProjection as number
      const vHorizontalAperture = get(HdCameraTokens.horizontalAperture)
      if (vHorizontalAperture !== undefined) this._hdHorizontalAperture = Math.fround(vHorizontalAperture as number)
      const vVerticalAperture = get(HdCameraTokens.verticalAperture)
      if (vVerticalAperture !== undefined) this._hdVerticalAperture = Math.fround(vVerticalAperture as number)
      const vHorizontalApertureOffset = get(HdCameraTokens.horizontalApertureOffset)
      if (vHorizontalApertureOffset !== undefined) {
        this._hdHorizontalApertureOffset = Math.fround(vHorizontalApertureOffset as number)
      }
      const vVerticalApertureOffset = get(HdCameraTokens.verticalApertureOffset)
      if (vVerticalApertureOffset !== undefined) {
        this._hdVerticalApertureOffset = Math.fround(vVerticalApertureOffset as number)
      }
      const vFocalLength = get(HdCameraTokens.focalLength)
      if (vFocalLength !== undefined) this._hdFocalLength = Math.fround(vFocalLength as number)
      const vClippingRange = get(HdCameraTokens.clippingRange)
      if (vClippingRange !== undefined) this._clippingRange = vClippingRange as GfRange1f
      for (const [key] of _paramDefaults) {
        const v = get(key)
        if (v !== undefined) this._params.set(key, v)
      }
    }

    if (bits & HdCamera.DirtyWindowPolicy) {
      // treat window policy as an optional parameter
      const vPolicy = _held(sceneDelegate.getCameraParamValue(id, HdCameraTokens.windowPolicy))
      if (vPolicy !== undefined) {
        this._windowPolicy = vPolicy as CameraUtilConformWindowPolicy
      }
    }

    if (bits & HdCamera.DirtyClipPlanes) {
      // treat clip planes as an optional parameter
      const vClipPlanes = _held(sceneDelegate.getCameraParamValue(id, HdCameraTokens.clipPlanes))
      if (vClipPlanes !== undefined) {
        this._clipPlanes = [...(vClipPlanes as GfVec4d[])]
      }
    }

    // Clear all the dirty bits. This ensures that the sprim doesn't
    // remain in the dirty list always.
    dirtyBits.value = HdCamera.Clean
  }

  /** camera.h:146-148 */
  getTransform(): GfMatrix4d { return this._transform }
  /** camera.h:151-153 */
  GetProjection(): number { return this._projection }
  /** camera.h:156-178 */
  GetHorizontalAperture(): number { return this._hdHorizontalAperture }
  getVerticalAperture(): number { return this._hdVerticalAperture }
  getHorizontalApertureOffset(): number { return this._hdHorizontalApertureOffset }
  getVerticalApertureOffset(): number { return this._hdVerticalApertureOffset }
  getFocalLength(): number { return this._hdFocalLength }
  /** camera.h:181-183 */
  getClippingRange(): GfRange1f { return this._clippingRange }
  /** camera.h:186-188 */
  getClipPlanes(): readonly GfVec4d[] { return this._clipPlanes }
  /** camera.h:232-234 */
  getLinearExposureScale(): number { return this._params.get(HdCameraTokens.linearExposureScale) as number }
  /** camera.h:268-270 */
  getWindowPolicy(): CameraUtilConformWindowPolicy { return this._windowPolicy }
  /** The remaining DirtyParams values (fStop, focus, split diopter,
   *  shutter, exposure, lens distortion) by token (camera.h:190-266). */
  getParam(key: string): unknown { return this._params.get(key) }

  /** camera.cpp:295-323 */
  computeProjectionMatrix(): GfMatrix4d {
    const cam = new GfCamera()
    // Only set the values needed to compute projection matrix.
    cam.setProjection(this.GetProjection() === HdCamera.Orthographic
      ? GfCamera.Orthographic : GfCamera.Perspective)
    cam.setHorizontalAperture(this.GetHorizontalAperture() / GfCamera.APERTURE_UNIT)
    cam.setVerticalAperture(this.getVerticalAperture() / GfCamera.APERTURE_UNIT)
    cam.setHorizontalApertureOffset(this.getHorizontalApertureOffset() / GfCamera.APERTURE_UNIT)
    cam.setVerticalApertureOffset(this.getVerticalApertureOffset() / GfCamera.APERTURE_UNIT)
    cam.setFocalLength(this.getFocalLength() / GfCamera.FOCAL_LENGTH_UNIT)
    cam.setClippingRange(this.getClippingRange())
    return cam.getFrustum().computeProjectionMatrix()
  }
}
