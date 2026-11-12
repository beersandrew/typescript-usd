// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBasicDrawing.cpp,
//  pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp,
//  pxr/imaging/hdSt/testenv/testHdStCurvePrimvarInterpolation.cpp,
//  pxr/imaging/hdSt/unitTestGLDrawing.cpp,
//  pxr/imaging/hdSt/unitTestGLDrawing.h
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/unitTestGLDrawing.{h,cpp} (OpenUSD 26.11.1):
// the camera and window size of HdSt_UnitTestGLDrawing that the Storm image
// tests (testHdStCurveDrawing, testHdStCurvePrimvarInterpolation,
// testHdStBasicDrawing) inherit, for their 640x480 offscreen runs.
//
// Divergences: no window (HdSt_UnitTestWindow) and no interactive mode;
// RunTest's argument parsing is the caller's (ParseArgs takes the argv
// list). _rotate and _translate are floats upstream (unitTestGLDrawing.h:
// 105-106); they are rounded with Math.fround where they are assigned.

import {
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  makeRotation as GfMakeRotation,
} from 'typescript-usd/gf'

/** unitTestGLDrawing.h:30-110 */
export abstract class HdSt_UnitTestGLDrawing {
  private _rotate: [number, number] = [0, 0]
  private _translate: [number, number, number] = [0, 0, 0]

  constructor(private readonly _width = 640, private readonly _height = 480) {}

  /** unitTestGLDrawing.cpp:166-176 (the 640x480 window of :193) */
  getWidth(): number { return this._width }
  getHeight(): number { return this._height }

  /** unitTestGLDrawing.h:69-71 */
  setCameraRotate(rx: number, ry: number): void {
    this._rotate = [Math.fround(rx), Math.fround(ry)]
  }
  /** unitTestGLDrawing.h:72-74 */
  setCameraTranslate(t: GfVec3f): void {
    this._translate = [Math.fround(t.get(0)), Math.fround(t.get(1)), Math.fround(t.get(2))]
  }
  /** unitTestGLDrawing.h:75-77 */
  getCameraTranslate(): GfVec3f {
    return new GfVec3f(this._translate[0], this._translate[1], this._translate[2])
  }

  /** unitTestGLDrawing.cpp:275-288 */
  getViewMatrix(): GfMatrix4d {
    let viewMatrix = new GfMatrix4d().setIdentity()
    // rotate from z-up to y-up
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1.0, 0.0, 0.0], -90.0)))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([0, 1, 0], this._rotate[1])))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1, 0, 0], this._rotate[0])))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(
      this._translate[0], this._translate[1], this._translate[2])))
    return viewMatrix
  }

  /** unitTestGLDrawing.cpp:296-306 */
  getFrustum(): GfFrustum {
    const width = this.getWidth()
    const height = this.getHeight()
    const aspectRatio = width / height

    const frustum = new GfFrustum()
    frustum.setPerspective(45.0, aspectRatio, 1, 100000.0)
    return frustum
  }

  /** unitTestGLDrawing.cpp:290-305 */
  getProjectionMatrix(): GfMatrix4d {
    const aspectRatio = this.getWidth() / this.getHeight()
    const frustum = new GfFrustum()
    frustum.setPerspective(45.0, aspectRatio, 1, 100000.0)
    return frustum.computeProjectionMatrix()
  }

  /** unitTestGLDrawing.h:85 */
  abstract initTest(): void
  /** unitTestGLDrawing.h:88 */
  abstract drawTest(): void
  /** unitTestGLDrawing.cpp:222-226 (ParseArgs is called by RunTest) */
  parseArgs(_args: readonly string[]): void {}
}
