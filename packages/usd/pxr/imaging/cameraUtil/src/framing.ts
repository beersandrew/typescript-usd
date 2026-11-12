// Ported from OpenUSD 26.11.1: pxr/imaging/cameraUtil/framing.cpp,
//  pxr/imaging/cameraUtil/framing.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/cameraUtil/framing.{h,cpp} (OpenUSD 26.11.1).
//
// GfVec2f arithmetic is single precision upstream; Math.fround reproduces
// each float rounding (framing.cpp:73-76, 92-95).

import {
  Matrix4d as GfMatrix4d,
  Range2d as GfRange2d,
  Range2f as GfRange2f,
  Rect2i as GfRect2i,
  Vec2d as GfVec2d,
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import { CameraUtilConformWindowPolicy, CameraUtilConformedWindow } from './conformWindow.ts'

const f = Math.fround

/** framing.cpp:71-76. Returns the center in single precision. */
function _ComputeCenter(min: readonly [number, number], size: readonly [number, number]): [number, number] {
  return [f(f(min[0]) + f(0.5 * f(size[0]))), f(f(min[1]) + f(0.5 * f(size[1])))]
}

/** framing.cpp:78-84 */
function _SafeDiv(a: number, b: number): number {
  if (b === 0.0) {
    return 1.0
  }
  return a / b
}

/** framing.cpp:113-125 */
function _InvertPolicy(windowPolicy: CameraUtilConformWindowPolicy): CameraUtilConformWindowPolicy {
  switch (windowPolicy) {
    case CameraUtilConformWindowPolicy.CameraUtilFit:
      return CameraUtilConformWindowPolicy.CameraUtilCrop
    case CameraUtilConformWindowPolicy.CameraUtilCrop:
      return CameraUtilConformWindowPolicy.CameraUtilFit
    default:
      return windowPolicy
  }
}

/** framing.h:21-139. Framing information: display window, data window and
 *  pixel aspect ratio. */
export class CameraUtilFraming {
  displayWindow: GfRange2f
  dataWindow: GfRect2i
  pixelAspectRatio: number

  /** framing.cpp:12-38: (), (displayWindow, dataWindow, pixelAspectRatio=1)
   *  and (dataWindow). */
  constructor()
  constructor(dataWindow: GfRect2i)
  constructor(displayWindow: GfRange2f, dataWindow: GfRect2i, pixelAspectRatio?: number)
  constructor(a?: GfRange2f | GfRect2i, dataWindow?: GfRect2i, pixelAspectRatio = 1.0) {
    if (a === undefined) {
      this.displayWindow = new GfRange2f()
      this.dataWindow = new GfRect2i()
      this.pixelAspectRatio = 1.0
    } else if (a instanceof GfRect2i) {
      this.displayWindow = new GfRange2f(
        new GfVec2f(a.getMinX(), a.getMinY()),
        new GfVec2f(a.getMaxX() + 1, a.getMaxY() + 1))
      this.dataWindow = a
      this.pixelAspectRatio = 1.0
    } else {
      this.displayWindow = a
      this.dataWindow = dataWindow!
      this.pixelAspectRatio = f(pixelAspectRatio)
    }
  }

  /** framing.cpp:40-47 */
  isValid(): boolean {
    return !this.dataWindow.IsEmpty() &&
      !this.displayWindow.IsEmpty() &&
      this.pixelAspectRatio !== 0.0
  }

  /** framing.cpp:49-56 */
  equals(other: CameraUtilFraming): boolean {
    return this.displayWindow.equals(other.displayWindow) &&
      this.dataWindow.equals(other.dataWindow) &&
      this.pixelAspectRatio === other.pixelAspectRatio
  }

  /** framing.cpp:86-111 */
  applyToProjectionMatrix(
    projectionMatrix: GfMatrix4d,
    windowPolicy: CameraUtilConformWindowPolicy,
  ): GfMatrix4d {
    const dispMin = this.displayWindow.getMin()
    const dispMax = this.displayWindow.getMax()
    const dispSize: [number, number] = [
      f(dispMax.get(0) - dispMin.get(0)), f(dispMax.get(1) - dispMin.get(1))]
    const dataSizeI: GfVec2i = this.dataWindow.getSize()
    const dataSize: [number, number] = [f(dataSizeI.get(0)), f(dataSizeI.get(1))]
    const aspect = this.pixelAspectRatio * _SafeDiv(dispSize[0], dispSize[1])
    const dispCenter = _ComputeCenter([dispMin.get(0), dispMin.get(1)], dispSize)
    const dataCenter = _ComputeCenter(
      [this.dataWindow.getMinX(), this.dataWindow.getMinY()], dataSize)
    const t: [number, number] = [
      f(2.0 * f(dispCenter[0] - dataCenter[0])),
      f(2.0 * f(dispCenter[1] - dataCenter[1]))]

    return CameraUtilConformedWindow(projectionMatrix, windowPolicy, aspect)
      // Transform NDC with respect to conformed frustum to space
      // where unit is two pixels.
      .getMultiply(new GfMatrix4d(new GfVec4d(dispSize[0], dispSize[1], 1.0, 1.0)))
      // Apply appropriate translation.
      // Note that the coordinate system of eye space is y-Up but
      // for the data and display window is y-Down.
      .getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(t[0], -t[1], 0.0)))
      // From pixel to NDC with respect to the data window.
      .getMultiply(new GfMatrix4d(new GfVec4d(1.0 / dataSize[0], 1.0 / dataSize[1], 1.0, 1.0)))
  }

  /** framing.cpp:127-137 */
  computeFilmbackWindow(
    cameraAspectRatio: number,
    windowPolicy: CameraUtilConformWindowPolicy,
  ): GfRange2f {
    const display = new GfRange2d(
      new GfVec2d(this.displayWindow.getMin().get(0), this.displayWindow.getMin().get(1)),
      new GfVec2d(this.displayWindow.getMax().get(0), this.displayWindow.getMax().get(1)))
    const conformed = CameraUtilConformedWindow(
      display, _InvertPolicy(windowPolicy),
      _SafeDiv(cameraAspectRatio, this.pixelAspectRatio))
    return new GfRange2f(
      new GfVec2f(conformed.getMin().get(0), conformed.getMin().get(1)),
      new GfVec2f(conformed.getMax().get(0), conformed.getMax().get(1)))
  }
}
