// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/freeCameraPrimDataSource.cpp,
//  pxr/imaging/hdx/freeCameraPrimDataSource.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/freeCameraPrimDataSource.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergences:
// - The shared _Info (std::shared_ptr) is an object shared by the prim data
//   source and the camera schema data sources it hands out.
// - The two private constructors are New() overloads.
// - The optional HdDataSourceLocatorSet* out parameters are optional
//   arguments.

import {
  ContainerDataSource as HdContainerDataSource, CameraSchema as HdCameraSchema,
  CameraSchemaTokens as HdCameraSchemaTokens, XformSchema as HdXformSchema,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase, type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import {
  Camera as GfCamera, Vec2f as GfVec2f, Vec4d as GfVec4d, type Vec4f as GfVec4f, type Matrix4d as GfMatrix4d,
} from 'typescript-usd/gf'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'

/** freeCameraPrimDataSource.cpp:17-20 */
const _tokens = { windowPolicy: 'windowPolicy' }

/** freeCameraPrimDataSource.cpp:24-28 */
interface _Info {
  camera: GfCamera
  policy: CameraUtilConformWindowPolicy
}

const _float = (x: number) => new HdRetainedTypedSampledDataSource(Math.fround(x), VtValueTypes.float)

/** freeCameraPrimDataSource.cpp:30-43 */
function _ToDataSource(p: number): HdDataSourceBase | undefined {
  switch (p) {
    case GfCamera.Perspective:
      return HdCameraSchema.buildProjectionDataSource(HdCameraSchemaTokens.perspective)
    case GfCamera.Orthographic:
      return HdCameraSchema.buildProjectionDataSource(HdCameraSchemaTokens.orthographic)
  }
  return undefined
}

/** freeCameraPrimDataSource.cpp:45-134 */
class _CameraSchemaDataSource extends HdContainerDataSource {
  constructor(private readonly _info: _Info) { super() }

  private _camera(): GfCamera { return this._info.camera }

  Get(name: string): HdDataSourceBase | undefined {
    const T = HdCameraSchemaTokens
    if (name === T.projection) {
      return _ToDataSource(this._camera().GetProjection())
    }
    if (name === T.horizontalAperture) {
      return _float(this._camera().GetHorizontalAperture() * GfCamera.APERTURE_UNIT)
    }
    if (name === T.verticalAperture) {
      return _float(this._camera().getVerticalAperture() * GfCamera.APERTURE_UNIT)
    }
    if (name === T.horizontalApertureOffset) {
      return _float(this._camera().getHorizontalApertureOffset() * GfCamera.APERTURE_UNIT)
    }
    if (name === T.verticalApertureOffset) {
      return _float(this._camera().getVerticalApertureOffset() * GfCamera.APERTURE_UNIT)
    }
    if (name === T.focalLength) {
      return _float(this._camera().getFocalLength() * GfCamera.FOCAL_LENGTH_UNIT)
    }
    if (name === T.clippingRange) {
      const clippingRange = this._camera().getClippingRange()
      return new HdRetainedTypedSampledDataSource(
        new GfVec2f(clippingRange.getMin(), clippingRange.getMax()), VtValueTypes.GfVec2f)
    }
    if (name === T.clippingPlanes) {
      const clippingPlanes = this._camera().getClippingPlanes()
      if (clippingPlanes.length === 0) {
        return undefined
      }
      return new HdRetainedTypedSampledDataSource(
        new VtArray(clippingPlanes.map(p => new GfVec4d(p.get(0), p.get(1), p.get(2), p.get(3))),
          VtValueTypes.GfVec4d))
    }
    if (name === T.fStop) {
      return _float(this._camera().getFStop())
    }
    if (name === T.focusDistance) {
      return _float(this._camera().getFocusDistance())
    }
    if (name === _tokens.windowPolicy) {
      return new HdRetainedTypedSampledDataSource(this._info.policy, VtValueTypes.int)
    }
    return undefined
  }

  getNames(): string[] {
    const T = HdCameraSchemaTokens
    return [T.projection, T.horizontalAperture, T.verticalAperture,
      T.horizontalApertureOffset, T.verticalApertureOffset, T.focalLength,
      T.clippingRange, T.clippingPlanes, T.fStop, T.focusDistance, _tokens.windowPolicy]
  }
}

/** freeCameraPrimDataSource.cpp:138-146 */
function _CameraFromViewAndProjectionMatrix(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d): GfCamera {
  const cam = new GfCamera()
  cam.setFromViewAndProjectionMatrix(viewMatrix, projectionMatrix)
  return cam
}

const _loc = (name: string) => HdCameraSchema.getDefaultLocator().append(name)

/** freeCameraPrimDataSource.h:24-90: a data source for a camera prim (with
 *  camera and xform schemas) given by a GfCamera, or view and projection
 *  matrices, and a window policy. */
export class HdxFreeCameraPrimDataSource extends HdContainerDataSource {
  private readonly _info: _Info

  /** freeCameraPrimDataSource.cpp:152-159 */
  private constructor(camera: GfCamera = new GfCamera(),
    policy: CameraUtilConformWindowPolicy = CameraUtilConformWindowPolicy.CameraUtilFit) {
    super()
    this._info = { camera, policy }
  }

  /** HD_DECLARE_DATASOURCE New(), and the (viewMatrix, projectionMatrix,
   *  policy) constructor (freeCameraPrimDataSource.cpp:161-170). */
  static new(): HdxFreeCameraPrimDataSource
  static new(camera: GfCamera, policy?: CameraUtilConformWindowPolicy): HdxFreeCameraPrimDataSource
  static new(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d, policy?: CameraUtilConformWindowPolicy): HdxFreeCameraPrimDataSource
  static new(a?: GfCamera | GfMatrix4d, b?: GfMatrix4d | CameraUtilConformWindowPolicy,
    c?: CameraUtilConformWindowPolicy): HdxFreeCameraPrimDataSource {
    if (a === undefined) return new HdxFreeCameraPrimDataSource()
    if (a instanceof GfCamera) return new HdxFreeCameraPrimDataSource(a, b as CameraUtilConformWindowPolicy | undefined)
    return new HdxFreeCameraPrimDataSource(_CameraFromViewAndProjectionMatrix(a, b as GfMatrix4d), c)
  }

  /** HD_DECLARE_DATASOURCE Cast */
  static cast(ds: unknown): HdxFreeCameraPrimDataSource | undefined {
    return ds instanceof HdxFreeCameraPrimDataSource ? ds : undefined
  }

  /** freeCameraPrimDataSource.cpp:174-284 */
  setCamera(camera: GfCamera, dirtyLocators?: HdDataSourceLocatorSet): void {
    const cam = this._info.camera
    const T = HdCameraSchemaTokens
    if (!cam.getTransform().equals(camera.getTransform())) {
      cam.setTransform(camera.getTransform())
      dirtyLocators?.insert(HdXformSchema.getDefaultLocator())
    }
    if (cam.GetProjection() !== camera.GetProjection()) {
      cam.setProjection(camera.GetProjection())
      dirtyLocators?.insert(_loc(T.projection))
    }
    if (cam.GetHorizontalAperture() !== camera.GetHorizontalAperture()) {
      cam.setHorizontalAperture(camera.GetHorizontalAperture())
      dirtyLocators?.insert(_loc(T.horizontalAperture))
    }
    if (cam.getVerticalAperture() !== camera.getVerticalAperture()) {
      cam.setVerticalAperture(camera.getVerticalAperture())
      dirtyLocators?.insert(_loc(T.verticalAperture))
    }
    if (cam.getHorizontalApertureOffset() !== camera.getHorizontalApertureOffset()) {
      cam.setHorizontalApertureOffset(camera.getHorizontalApertureOffset())
      dirtyLocators?.insert(_loc(T.horizontalApertureOffset))
    }
    if (cam.getVerticalApertureOffset() !== camera.getVerticalApertureOffset()) {
      cam.setVerticalApertureOffset(camera.getVerticalApertureOffset())
      dirtyLocators?.insert(_loc(T.verticalApertureOffset))
    }
    if (cam.getFocalLength() !== camera.getFocalLength()) {
      cam.setFocalLength(camera.getFocalLength())
      dirtyLocators?.insert(_loc(T.focalLength))
    }
    if (!cam.getClippingRange().equals(camera.getClippingRange())) {
      cam.setClippingRange(camera.getClippingRange())
      dirtyLocators?.insert(_loc(T.clippingRange))
    }
    if (!_planesEqual(cam.getClippingPlanes(), camera.getClippingPlanes())) {
      cam.setClippingPlanes(camera.getClippingPlanes())
      dirtyLocators?.insert(_loc(T.clippingPlanes))
    }
    if (cam.getFStop() !== camera.getFStop()) {
      cam.setFStop(camera.getFStop())
      dirtyLocators?.insert(_loc(T.fStop))
    }
    if (cam.getFocusDistance() !== camera.getFocusDistance()) {
      cam.setFocusDistance(camera.getFocusDistance())
      dirtyLocators?.insert(_loc(T.focusDistance))
    }
  }

  /** freeCameraPrimDataSource.cpp:286-303 */
  setWindowPolicy(policy: CameraUtilConformWindowPolicy, dirtyLocators?: HdDataSourceLocatorSet): void {
    if (this._info.policy === policy) {
      return
    }
    this._info.policy = policy
    dirtyLocators?.insert(_loc(_tokens.windowPolicy))
  }

  /** freeCameraPrimDataSource.cpp:305-316 */
  setViewAndProjectionMatrix(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d,
    dirtyLocators?: HdDataSourceLocatorSet): void {
    const cam = _CameraFromViewAndProjectionMatrix(viewMatrix, projectionMatrix)
    cam.setClippingPlanes(this._info.camera.getClippingPlanes())
    this.setCamera(cam, dirtyLocators)
  }

  /** freeCameraPrimDataSource.cpp:318-334 */
  setClippingPlanes(clippingPlanes: readonly GfVec4f[], dirtyLocators?: HdDataSourceLocatorSet): void {
    if (_planesEqual(this._info.camera.getClippingPlanes(), clippingPlanes)) {
      return
    }
    this._info.camera.setClippingPlanes([...clippingPlanes])
    dirtyLocators?.insert(_loc(HdCameraSchemaTokens.clippingPlanes))
  }

  /** freeCameraPrimDataSource.cpp:336-353 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdCameraSchema.getSchemaToken()) {
      return new _CameraSchemaDataSource(this._info)
    }
    if (name === HdXformSchema.getSchemaToken()) {
      return new HdXformSchema.Builder()
        .setResetXformStack(new HdRetainedTypedSampledDataSource(true, VtValueTypes.bool))
        .setMatrix(new HdRetainedTypedSampledDataSource(this._info.camera.getTransform(), VtValueTypes.GfMatrix4d))
        .build()
    }
    return undefined
  }

  /** freeCameraPrimDataSource.cpp:355-362 */
  getNames(): string[] {
    return [HdCameraSchema.getSchemaToken(), HdXformSchema.getSchemaToken()]
  }
}

function _planesEqual(a: readonly GfVec4f[], b: readonly GfVec4f[]): boolean {
  return a.length === b.length && a.every((p, i) => p.equals(b[i]!))
}
