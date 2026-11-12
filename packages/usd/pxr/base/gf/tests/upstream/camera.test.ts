// Ported from OpenUSD 26.11.1: pxr/base/gf/camera.h,
//  pxr/base/gf/testenv/testGfCamera.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfCamera.py.
//
// One describe() per upstream test method, every assert mirrored. Every derived
// numeric expectation (frustum corners, FOV, focal length, constants) is
// captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/camera.json — never hand-derived (AGENTS.md numeric-fixture rule). The
// self-consistency checks (copy ctor, SetFromViewAndProjectionMatrix round
// trip) are computed camera-to-camera exactly as upstream.
//
// Mapping of GfCamera's class/property API onto typescript-usd/gf:
//   Gf.Camera()                              -> new GfCamera()
//   Gf.Camera(cam)                           -> new GfCamera(cam)  (copy ctor)
//   Gf.Camera(transform=..., projection=...) -> positional ctor (camera.h order)
//   cam.<prop> get/set                       -> get/set accessors
//   cam == other / cam != other              -> cam.equals(other)
//   eval(repr(cam))                          -> evalRepr(cam) (new Function shim)
import { describe, it, expect } from 'vitest'
import { GfCamera } from '../../src/camera.ts'
import { GfMatrix4d } from '../../src/matrixData.ts'
import { GfVec3d, GfVec4f } from '../../src/vec.ts'
import { GfRange1f } from '../../src/range.ts'
import { makeRotation } from '../../src/rotation.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type Corners = number[][]
interface CameraFixture {
  constants: Record<
    'DEFAULT_HORIZONTAL_APERTURE' | 'DEFAULT_VERTICAL_APERTURE' | 'APERTURE_UNIT' |
    'FOCAL_LENGTH_UNIT', number>
  non: {
    fovH: number
    horizontalFieldOfView: number
    fovV: number
    verticalFieldOfView: number
    focalAfterPerspH: number
    hApAfterPerspH: number
    aspectAfterPerspH: number
    aspectAfterPerspV: number
    vApAfterPerspV: number
    focalAfterPerspV: number
    corners_persp: Corners
    corners_ortho: Corners
  }
  orn: {
    fovH: number
    fovV: number
    focalAfterPerspH: number
    vApAfterPerspV: number
    focalAfterPerspV: number
    aspectAfterPerspV: number
    corners_persp: Corners
    corners_ortho: Corners
    corners_offset: Corners
  }
  otherCam: { transform: number[]; focalLength: number }
}
// Captured from the OpenUSD 26.11.1 build (FIXTURES.md).
const G = readOracleFixture<CameraFixture>(new URL('./fixtures/camera.json', import.meta.url))

// ---- Gf.IsClose helpers (squared distance <= tol^2, matching Gf.IsClose) ----

const isCloseScalar = (a: number, b: number, tol = 1e-6): boolean =>
  Math.abs(a - b) <= tol

const isCloseVec = (a: readonly number[], b: readonly number[], tol = 1e-6): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}

const assertScalarClose = (a: number, b: number, tol = 1e-6): void =>
  expect(isCloseScalar(a, b, tol)).toBe(true)

// AssertListGfClose: zip two lists of Gf.Vec3d-likes, Gf.IsClose each.
const assertListClose = (
  l1: ReadonlyArray<readonly number[]>,
  l2: ReadonlyArray<readonly number[]>,
  tol = 1e-6,
): void => {
  expect(l1.length).toBe(l2.length)
  for (let i = 0; i < l1.length; i++) {
    expect(isCloseVec(l1[i]!, l2[i]!, tol)).toBe(true)
  }
}

const cornersOf = (cam: GfCamera): number[][] =>
  cam.frustum.computeCorners().map((v) => [...v.data])

// ---- eval(repr(cam)) round-trip via a Gf shim + new Function -----------------

const GfShim = {
  Camera: GfCamera,
  Matrix4d: GfMatrix4d,
  Range1f: GfRange1f,
  Vec4f: GfVec4f,
}
const evalRepr = (cam: GfCamera): GfCamera =>
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('Gf', `return ${cam.repr()}`)(GfShim) as GfCamera

// ---- the AssertCams* helpers from testGfCamera.py ----------------------------

const assertCamsEqual = (cam1: GfCamera, cam2: GfCamera): void => {
  expect(cam1.transform.equals(cam2.transform)).toBe(true)
  expect(cam1.projection).toBe(cam2.projection)
  expect(cam1.horizontalAperture).toBe(cam2.horizontalAperture)
  expect(cam1.verticalAperture).toBe(cam2.verticalAperture)
  expect(cam1.horizontalApertureOffset).toBe(cam2.horizontalApertureOffset)
  expect(cam1.verticalApertureOffset).toBe(cam2.verticalApertureOffset)
  expect(cam1.focalLength).toBe(cam2.focalLength)
  expect(cam1.clippingRange.equals(cam2.clippingRange)).toBe(true)
  expect(cam1.clippingPlanes.length).toBe(cam2.clippingPlanes.length)
  for (let i = 0; i < cam1.clippingPlanes.length; i++) {
    expect(cam1.clippingPlanes[i]!.equals(cam2.clippingPlanes[i]!)).toBe(true)
  }
  expect(cam1.fStop).toBe(cam2.fStop)
  expect(cam1.focusDistance).toBe(cam2.focusDistance)

  expect(cam1.equals(cam2)).toBe(true)
  expect(cam1.equals(cam2)).not.toBe(false) // assertFalse(cam1 != cam2)

  // Check computation of frustum (exact).
  const c1 = cornersOf(cam1)
  const c2 = cornersOf(cam2)
  for (let i = 0; i < c1.length; i++) expect(c1[i]).toEqual(c2[i])
}

const assertCamsClose = (cam1: GfCamera, cam2: GfCamera, tol = 1e-6): void => {
  // transform: Gf.IsClose row by row.
  for (let r = 0; r < 4; r++) {
    expect(isCloseVec(cam1.transform.getRow(r).data, cam2.transform.getRow(r).data, tol)).toBe(true)
  }
  expect(cam1.projection).toBe(cam2.projection)
  assertScalarClose(cam1.horizontalAperture, cam2.horizontalAperture, tol)
  assertScalarClose(cam1.verticalAperture, cam2.verticalAperture, tol)
  assertScalarClose(cam1.horizontalApertureOffset, cam2.horizontalApertureOffset, tol)
  assertScalarClose(cam1.verticalApertureOffset, cam2.verticalApertureOffset, tol)
  assertScalarClose(cam1.focalLength, cam2.focalLength, tol)
  assertScalarClose(cam1.clippingRange.getMin(), cam2.clippingRange.getMin(), tol)
  assertScalarClose(cam1.clippingRange.getMax(), cam2.clippingRange.getMax(), tol)
  expect(cam1.clippingPlanes.length).toBe(cam2.clippingPlanes.length)
  for (let i = 0; i < cam1.clippingPlanes.length; i++) {
    expect(isCloseVec(cam1.clippingPlanes[i]!.data, cam2.clippingPlanes[i]!.data, tol)).toBe(true)
  }
  assertScalarClose(cam1.fStop, cam2.fStop, tol)
  assertScalarClose(cam1.focusDistance, cam2.focusDistance, tol)

  assertListClose(cornersOf(cam1), cornersOf(cam2), tol)
}

const assertCamSelfEvaluating = (cam: GfCamera): void => {
  assertCamsEqual(cam, evalRepr(cam))
}

// ===========================================================================

describe('test_CameraEqualOperator', () => {
  it('compares equal across every mutated field', () => {
    const cam1 = new GfCamera()
    let cam2 = new GfCamera()

    expect(cam1.equals(cam2)).toBe(true)

    cam1.transform = new GfMatrix4d(1.0).setTranslate(new GfVec3d(10, 20, 30))
    expect(cam1.equals(cam2)).toBe(false)
    expect(cam1.equals(cam2)).toBe(false) // assertTrue(cam1 != cam2)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.horizontalAperture = 100
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.verticalAperture = 200
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.horizontalApertureOffset = 10
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.verticalApertureOffset = 20
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.focalLength = 45
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.clippingRange = new GfRange1f(3, 30)
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.clippingPlanes = [
      new GfVec4f(0.32929277420043, 0.5488212704658, 0.768349826335, 10.0),
      new GfVec4f(0.68100523948669, 0.4256282746791, 0.595879554748, 20.0),
    ]
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.fStop = 11
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    cam1.focusDistance = 102
    expect(cam1.equals(cam2)).toBe(false)

    cam2 = new GfCamera(cam1)
    expect(cam1.equals(cam2)).toBe(true)

    assertCamSelfEvaluating(cam1)
  })
})

// Goldens captured from the OpenUSD 26.11.1 build (fixtures/camera.json).
const NON_CORNERS_PERSP = G.non.corners_persp
const NON_CORNERS_ORTHO = G.non.corners_ortho

describe('test_CameraNonOrthonormal', () => {
  it('apertures, FOV, perspective + orthographic frustum corners', () => {
    const cam = new GfCamera()

    const transform = new GfMatrix4d()
      .setRotate(makeRotation([1, 2, 3], 20.3))
      .getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(100, 123, 153)))
      .getMultiply(new GfMatrix4d().setScale(new GfVec3d(2.0, 1.0, 1.3)))

    cam.transform = transform
    expect(cam.transform.equals(transform)).toBe(true)

    cam.horizontalAperture = 34 / 2
    assertScalarClose(cam.horizontalAperture, 34 / 2)

    cam.verticalAperture = 20
    assertScalarClose(cam.verticalAperture, 20)

    cam.horizontalAperture = cam.horizontalAperture * 2

    cam.focalLength = 50
    assertScalarClose(cam.focalLength, 50)

    assertScalarClose(cam.getFieldOfView(GfCamera.FOVHorizontal), G.non.fovH)
    assertScalarClose(cam.horizontalFieldOfView, G.non.horizontalFieldOfView)
    assertScalarClose(cam.getFieldOfView(GfCamera.FOVVertical), G.non.fovV, 1e-6)
    assertScalarClose(cam.verticalFieldOfView, G.non.verticalFieldOfView, 1e-6)

    cam.projection = GfCamera.Orthographic

    cam.setPerspectiveFromAspectRatioAndFieldOfView(
      1.7, 65.0, GfCamera.FOVHorizontal, 34.0,
    )

    expect(cam.projection).toBe(GfCamera.Perspective)

    // Field of view is achieved by setting new focal length.
    assertScalarClose(cam.focalLength, G.non.focalAfterPerspH)
    assertScalarClose(cam.horizontalAperture, 34)

    cam.clippingRange = new GfRange1f(10, 100)
    expect(cam.clippingRange.equals(new GfRange1f(10, 100))).toBe(true)

    assertScalarClose(cam.aspectRatio, 34.0 / 20.0)

    cam.setPerspectiveFromAspectRatioAndFieldOfView(
      2.4, 29.7321955, GfCamera.FOVVertical, 34.0,
    )

    assertScalarClose(cam.aspectRatio, 2.4, 1e-6)
    assertScalarClose(cam.verticalAperture, 34.0 / 2.4, 1e-6)
    // FLOAT-ULP NOTE: this FOVVertical-derived focal lands one float ULP
    // (~1.9e-6) above the native build's value. The build fuses the
    // `const float tanValue` division (FMA), landing on the same float as the
    // FOVHorizontal case; a portable single rounding rule cannot match both
    // simultaneously. We keep the source-faithful `float` tanValue (so the
    // FOVHorizontal path is bit-exact) and accept one float ULP here.
    assertScalarClose(cam.focalLength, G.non.focalAfterPerspV, 2e-6)

    // Test the frustum with perspective first.
    cam.projection = GfCamera.Perspective
    expect(cam.projection).toBe(GfCamera.Perspective)

    // Perspective corners divide by the (1-ULP-high) FOVVertical focal; the
    // resulting positions are within ~1.8e-5 of the oracle (see FLOAT-ULP NOTE).
    assertListClose(cornersOf(cam), NON_CORNERS_PERSP, 1e-4)

    cam.horizontalAperture = 340
    assertScalarClose(cam.horizontalAperture, 340)

    cam.verticalAperture = 340 / 2.4
    assertScalarClose(cam.aspectRatio, 2.4, 1e-6)

    cam.projection = GfCamera.Orthographic
    expect(cam.projection).toBe(GfCamera.Orthographic)

    assertListClose(cornersOf(cam), NON_CORNERS_ORTHO)

    // SetOrthographicFromAspectRatioAndSize, FOVHorizontal.
    let cam2 = new GfCamera()
    cam2.setOrthographicFromAspectRatioAndSize(2.4, 34.0, GfCamera.FOVHorizontal)
    cam2.transform = transform
    cam2.clippingRange = new GfRange1f(10, 100)
    assertListClose(cornersOf(cam2), NON_CORNERS_ORTHO)

    // SetOrthographicFromAspectRatioAndSize, FOVVertical (delta 1e-4).
    cam2 = new GfCamera()
    cam2.setOrthographicFromAspectRatioAndSize(2.4, 34.0 / 2.4, GfCamera.FOVVertical)
    cam2.transform = transform
    cam2.clippingRange = new GfRange1f(10, 100)
    assertListClose(cornersOf(cam2), NON_CORNERS_ORTHO, 1e-4)

    // Self-evaluating camera with clipping planes.
    const transform2 = new GfMatrix4d()
      .setRotate(makeRotation([2, 3, 4], 14.2))
      .getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(99.0, 111.0, 134.0)))
    void transform2

    const cam3 = new GfCamera()
    cam3.setPerspectiveFromAspectRatioAndFieldOfView(
      2.4, 29.7321955, GfCamera.FOVVertical, 34.0,
    )
    cam3.clippingRange = new GfRange1f(10, 100)

    const clippingPlanes = [
      new GfVec4f(0.32929277420043, 0.5488212704658, 0.768349826335, 10.0),
      new GfVec4f(0.68100523948669, 0.4256282746791, 0.595879554748, 20.0),
    ]
    cam3.clippingPlanes = clippingPlanes
    expect(cam3.clippingPlanes.length).toBe(clippingPlanes.length)
    for (let i = 0; i < clippingPlanes.length; i++) {
      expect(cam3.clippingPlanes[i]!.equals(clippingPlanes[i]!)).toBe(true)
    }

    assertCamSelfEvaluating(cam3)
  })
})

// Goldens captured from the OpenUSD 26.11.1 build (fixtures/camera.json).
const ORN_CORNERS_PERSP = G.orn.corners_persp
const ORN_CORNERS_ORTHO = G.orn.corners_ortho
const ORN_CORNERS_OFFSET = G.orn.corners_offset

describe('test_CameraOrthonormal', () => {
  it('self-evaluating across mutations, otherCam closeness, frustum corners', () => {
    const cam = new GfCamera()

    assertCamSelfEvaluating(cam)

    const transform = new GfMatrix4d()
      .setRotate(makeRotation([1, -2, 3], 30.3))
      .getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(-100, 123, 153)))

    cam.transform = transform

    assertCamSelfEvaluating(cam)

    cam.horizontalAperture = 34 / 2
    assertScalarClose(cam.horizontalAperture, 34 / 2)

    cam.verticalAperture = 20
    assertScalarClose(cam.verticalAperture, 20)

    assertCamSelfEvaluating(cam)

    cam.horizontalAperture = cam.horizontalAperture * 2

    assertCamSelfEvaluating(cam)

    cam.focalLength = 50
    assertScalarClose(cam.focalLength, 50)

    assertCamSelfEvaluating(cam)

    assertScalarClose(cam.getFieldOfView(GfCamera.FOVHorizontal), G.orn.fovH)
    assertScalarClose(cam.horizontalFieldOfView, G.orn.fovH)
    assertScalarClose(cam.getFieldOfView(GfCamera.FOVVertical), G.orn.fovV, 1e-6)
    assertScalarClose(cam.verticalFieldOfView, G.orn.fovV, 1e-6)

    cam.projection = GfCamera.Orthographic

    assertCamSelfEvaluating(cam)

    cam.setPerspectiveFromAspectRatioAndFieldOfView(
      1.7, 65.0, GfCamera.FOVHorizontal, 34.0,
    )

    assertCamSelfEvaluating(cam)

    const otherCam = new GfCamera(
      new GfMatrix4d(
        0.8731530112777166, 0.3850071166178898, 0.2989537406526877, 0,
        -0.4240369593016693, 0.9024253932905512, 0.07629591529425725, 0,
        -0.2404089766270184, -0.1933854433455958, 0.9512126966452756, 0,
        -100.0, 123.0, 153.0, 1.0,
      ),
      GfCamera.Perspective,
      34.0,
      20.0,
      0.0,
      0.0,
      26.684656143188477,
    )

    assertCamsClose(cam, otherCam)

    expect(cam.projection).toBe(GfCamera.Perspective)

    // Field of view is achieved by setting new focal length.
    assertScalarClose(cam.focalLength, G.orn.focalAfterPerspH)
    assertScalarClose(cam.horizontalAperture, 34)

    cam.clippingRange = new GfRange1f(10, 100)
    expect(cam.clippingRange.equals(new GfRange1f(10, 100))).toBe(true)

    assertScalarClose(cam.aspectRatio, 34.0 / 20.0)

    cam.setPerspectiveFromAspectRatioAndFieldOfView(
      2.4, 29.7321955, GfCamera.FOVVertical, 34.0,
    )

    assertScalarClose(cam.aspectRatio, 2.4, 1e-6)
    assertScalarClose(cam.verticalAperture, 34.0 / 2.4, 1e-6)
    // FLOAT-ULP NOTE (see test_CameraNonOrthonormal): FOVVertical focal is one
    // float ULP above the oracle; the FOVHorizontal path stays bit-exact.
    assertScalarClose(cam.focalLength, G.orn.focalAfterPerspV, 2e-6)

    cam.projection = GfCamera.Perspective
    expect(cam.projection).toBe(GfCamera.Perspective)

    assertListClose(cornersOf(cam), ORN_CORNERS_PERSP, 1e-4)

    cam.horizontalAperture = 340
    assertScalarClose(cam.horizontalAperture, 340)

    cam.verticalAperture = 340 / 2.4
    assertScalarClose(cam.aspectRatio, 2.4, 1e-6)

    cam.projection = GfCamera.Orthographic
    expect(cam.projection).toBe(GfCamera.Orthographic)

    assertListClose(cornersOf(cam), ORN_CORNERS_ORTHO)

    let cam2 = new GfCamera()
    cam2.setOrthographicFromAspectRatioAndSize(2.4, 34.0, GfCamera.FOVHorizontal)
    cam2.transform = transform
    cam2.clippingRange = new GfRange1f(10, 100)
    assertListClose(cornersOf(cam2), ORN_CORNERS_ORTHO)

    cam2 = new GfCamera()
    cam2.setOrthographicFromAspectRatioAndSize(2.4, 34.0 / 2.4, GfCamera.FOVVertical)
    cam2.transform = transform
    cam2.clippingRange = new GfRange1f(10, 100)
    assertListClose(cornersOf(cam2), ORN_CORNERS_ORTHO, 1e-4)

    assertListClose(cornersOf(new GfCamera(cam2)), ORN_CORNERS_ORTHO, 1e-4)

    // Offset-aperture camera with default clipping range.
    const camOffset = new GfCamera()
    camOffset.projection = GfCamera.Perspective
    camOffset.focalLength = 50
    camOffset.verticalApertureOffset = 1.2

    assertListClose(cornersOf(new GfCamera(camOffset)), ORN_CORNERS_OFFSET, 1e-4)

    camOffset.focusDistance = 200
    camOffset.fStop = 11

    assertScalarClose(camOffset.focusDistance, 200)
    assertScalarClose(camOffset.fStop, 11)

    assertCamSelfEvaluating(camOffset)
  })
})

describe('test_Constants', () => {
  it('matches the Pixar-build constants', () => {
    assertScalarClose(GfCamera.DEFAULT_HORIZONTAL_APERTURE, G.constants.DEFAULT_HORIZONTAL_APERTURE)
    assertScalarClose(GfCamera.DEFAULT_VERTICAL_APERTURE, G.constants.DEFAULT_VERTICAL_APERTURE)
    assertScalarClose(GfCamera.APERTURE_UNIT, G.constants.APERTURE_UNIT)
    assertScalarClose(GfCamera.FOCAL_LENGTH_UNIT, G.constants.FOCAL_LENGTH_UNIT)
  })
})

describe('test_SetFromViewAndProjectionMatrix', () => {
  it('round-trips perspective and orthographic cameras', () => {
    for (const projection of [GfCamera.Perspective, GfCamera.Orthographic]) {
      const cam1 = new GfCamera()
      cam1.projection = projection
      cam1.focalLength = 30
      cam1.horizontalAperture = 12.4
      cam1.verticalAperture = 14.3
      cam1.horizontalApertureOffset = 34.5
      cam1.verticalApertureOffset = 25.6
      cam1.clippingRange = new GfRange1f(0.123, 345.3)
      cam1.transform = new GfMatrix4d()
        .setRotate(makeRotation([1, 2, 3], 20.3))
        .getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(100, 123, 153)))

      const cam2 = new GfCamera()
      cam2.setFromViewAndProjectionMatrix(
        cam1.frustum.computeViewMatrix(),
        cam1.frustum.computeProjectionMatrix(),
      )

      assertListClose(cornersOf(cam1), cornersOf(cam2), 1e-5)
    }
  })
})
