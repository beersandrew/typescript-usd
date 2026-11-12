// Ported from OpenUSD 26.11.1:
//  pxr/imaging/cameraUtil/screenWindowParameters.cpp,
//  pxr/imaging/cameraUtil/screenWindowParameters.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/cameraUtil/screenWindowParameters.{h,cpp}
// (OpenUSD 26.11.1).

import {
  Camera as GfCamera,
  Matrix4d as GfMatrix4d,
  Vec4d as GfVec4d,
} from 'typescript-usd/gf'

/** screenWindowParameters.h:23-59. Given a camera object, compute
 *  parameters suitable for setting up RenderMan. */
export class CameraUtilScreenWindowParameters {
  private _screenWindow: GfVec4d
  private _fieldOfView: number
  private _zFacingViewMatrix: GfMatrix4d

  /** screenWindowParameters.cpp:13-38 */
  constructor(camera: GfCamera, fitDirection = GfCamera.FOVHorizontal) {
    const w = [
      -camera.GetHorizontalAperture() + 2 * camera.getHorizontalApertureOffset(),
      +camera.GetHorizontalAperture() + 2 * camera.getHorizontalApertureOffset(),
      -camera.getVerticalAperture() + 2 * camera.getVerticalApertureOffset(),
      +camera.getVerticalAperture() + 2 * camera.getVerticalApertureOffset(),
    ]
    this._fieldOfView = camera.getFieldOfView(fitDirection)

    if (camera.GetProjection() === GfCamera.Perspective) {
      const denom = fitDirection === GfCamera.FOVHorizontal
        ? camera.GetHorizontalAperture() : camera.getVerticalAperture()
      if (denom !== 0.0) {
        for (let i = 0; i < 4; i++) w[i] = w[i]! / denom
      }
    } else {
      for (let i = 0; i < 4; i++) w[i] = w[i]! * (GfCamera.APERTURE_UNIT / 2.0)
    }
    this._screenWindow = new GfVec4d(w[0]!, w[1]!, w[2]!, w[3]!)

    const zFlip = new GfMatrix4d(new GfVec4d(1, 1, -1, 1))
    this._zFacingViewMatrix = zFlip.getMultiply(camera.getTransform()).getInverse()
  }

  /** screenWindowParameters.h:37 */
  getScreenWindow(): GfVec4d { return this._screenWindow }

  /** screenWindowParameters.h:41 */
  getFieldOfView(): number { return this._fieldOfView }

  /** screenWindowParameters.h:46-48 */
  getZFacingViewMatrix(): GfMatrix4d { return this._zFacingViewMatrix }
}
