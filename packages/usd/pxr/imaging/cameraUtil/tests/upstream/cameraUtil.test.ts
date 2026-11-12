// Ported from OpenUSD 26.11.1:
//  pxr/imaging/cameraUtil/testenv/testCameraUtil.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/cameraUtil/testenv/testCameraUtil.py (OpenUSD 26.11.1).

import { describe, expect, it } from 'vitest'
import {
  Camera as GfCamera,
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Range2d as GfRange2d,
  Vec2d as GfVec2d,
  Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import {
  ConformWindow as CameraUtilConformWindow,
  ConformWindowPolicy,
  ConformedWindow as CameraUtilConformedWindow,
  ScreenWindowParameters as CameraUtilScreenWindowParameters,
} from '../../src/index.ts'

const { CameraUtilMatchVertically: MatchVertically, CameraUtilMatchHorizontally: MatchHorizontally,
  CameraUtilFit: Fit, CameraUtilCrop: Crop, CameraUtilDontConform: DontConform } = ConformWindowPolicy

// testCameraUtil.py:12-21 (_IsClose, eps 1e-5)
const eps = 1e-5
function isCloseNumbers(a: readonly number[], b: readonly number[]): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(eps)
}
const vec = (v: { get(i: number): number, dimension: number }): number[] =>
  Array.from({ length: v.dimension }, (_, i) => v.get(i))
const mat = (m: GfMatrix4d): number[] =>
  Array.from({ length: 16 }, (_, k) => m.getElement(Math.floor(k / 4), k % 4))
const range = (r: GfRange2d): number[] => [...vec(r.getMin()), ...vec(r.getMax())]

describe('TestCameraUtil', () => {
  it('test_ScreenWindowParameters', () => {
    const cam = new GfCamera()
    cam.setProjection(GfCamera.Perspective)
    cam.setHorizontalAperture(184.5)
    cam.setHorizontalApertureOffset(15.45)
    cam.setVerticalAperture(20.6)
    cam.setFocalLength(10.8)
    cam.setTransform(new GfMatrix4d(
      0.890425533492, 0.433328071165, -0.13917310100, 0.0,
      -0.373912364534, 0.870830610429, 0.31912942765, 0.0,
      0.259483935801, -0.232122447617, 0.93743653457, 0.0,
      6.533573569142, 9.880622442086, 1.89848943302, 1.0))

    isCloseNumbers(vec(new CameraUtilScreenWindowParameters(cam).getScreenWindow()),
      [-0.8325203582, 1.167479724, -0.1116531185, 0.1116531185])
    isCloseNumbers([new CameraUtilScreenWindowParameters(cam).getFieldOfView()],
      [166.645202637])
    isCloseNumbers(mat(new CameraUtilScreenWindowParameters(cam).getZFacingViewMatrix()),
      mat(new GfMatrix4d(
        0.8904255335028, -0.3739123645233, -0.259483935838, 0,
        0.4333280711640, 0.8708306104262, 0.232122447596, 0,
        -0.1391731009620, 0.3191294276581, -0.937436534593, 0,
        -9.8349931341753, -6.7672283767831, 1.181556474823, 1)))

    cam.setProjection(GfCamera.Orthographic)

    isCloseNumbers(vec(new CameraUtilScreenWindowParameters(cam).getScreenWindow()),
      [-7.6800003051, 10.770000457, -1.0300000190, 1.0300000190])
  })

  it('test_ConformedWindowGfVec2d', () => {
    const c = (w: [number, number], policy: ConformWindowPolicy, targetAspect: number) =>
      vec(CameraUtilConformedWindow(new GfVec2d(...w), policy, targetAspect))
    isCloseNumbers(c([1.0, 2.0], Fit, 3.0), [6.0, 2.0])
    isCloseNumbers(c([9.0, 2.0], Fit, 3.0), [9.0, 3.0])
    isCloseNumbers(c([3.3, 4.0], Crop, 1.5), [3.3, 2.2])
    isCloseNumbers(c([10.0, 2.0], Crop, 4), [8.0, 2.0])
    isCloseNumbers(c([0.1, 2.0], Crop, 0.1), [0.1, 1.0])
    isCloseNumbers(c([2.0, 1.9], MatchVertically, 2.0), [3.8, 1.9])
    isCloseNumbers(c([2.1, 1.9], MatchHorizontally, 1.0), [2.1, 2.1])
    isCloseNumbers(c([2.1, 1.9], DontConform, 1.0), [2.1, 1.9])
  })

  it('test_ConformedWindowGfRange2d', () => {
    const r = (a: [number, number], b: [number, number]) =>
      new GfRange2d(new GfVec2d(...a), new GfVec2d(...b))
    isCloseNumbers(range(CameraUtilConformedWindow(r([-8, -6], [-4, -2]), Fit, 3.0)),
      range(r([-12, -6], [0, -2])))
    isCloseNumbers(range(CameraUtilConformedWindow(r([-10, -11], [-1, -1]), MatchHorizontally, 1.5)),
      range(r([-10, -9], [-1, -3])))
    isCloseNumbers(range(CameraUtilConformedWindow(r([-10, -11], [-1, -1]), MatchVertically, 1.5)),
      range(r([-13, -11], [2, -1])))
    isCloseNumbers(range(CameraUtilConformedWindow(r([-10, -11], [-1, -1]), DontConform, 1.5)),
      range(r([-10, -11], [-1, -1])))
  })

  it('test_ConformedWindowGfVec4d', () => {
    isCloseNumbers(vec(CameraUtilConformedWindow(new GfVec4d(-10, -1, -11, -1), MatchHorizontally, 1.5)),
      [-10, -1, -9, -3])
  })

  it('test_ConformProjectionMatrix', () => {
    for (const projection of [GfCamera.Perspective, GfCamera.Orthographic]) {
      for (const policy of [MatchVertically, MatchHorizontally, Fit, Crop, DontConform]) {
        for (const targetAspect of [0.5, 1.0, 2.0]) {
          for (const xMirror of [-1, 1]) {
            for (const yMirror of [-1, 1]) {
              const mirrorMatrix = new GfMatrix4d(
                xMirror, 0, 0, 0,
                0, yMirror, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1)

              const cam = new GfCamera(new GfMatrix4d(), projection, 100.0, 75.0, 11.0, 12.0)

              const originalMatrix = cam.getFrustum().computeProjectionMatrix()

              CameraUtilConformWindow(cam, policy, targetAspect)

              isCloseNumbers(
                mat(cam.getFrustum().computeProjectionMatrix().getMultiply(mirrorMatrix)),
                mat(CameraUtilConformedWindow(
                  originalMatrix.getMultiply(mirrorMatrix), policy, targetAspect)))
            }
          }
        }
      }
    }
  })

  it('test_ConformWindow', () => {
    const cam = new GfCamera()
    cam.setHorizontalAperture(100.0)
    cam.setVerticalAperture(75.0)
    cam.setHorizontalApertureOffset(11.0)
    cam.setVerticalApertureOffset(12.0)

    CameraUtilConformWindow(cam, Fit, 2.0)

    isCloseNumbers([cam.GetHorizontalAperture(), cam.getVerticalAperture(),
      cam.getHorizontalApertureOffset(), cam.getVerticalApertureOffset()], [150.0, 75.0, 11.0, 12.0])

    CameraUtilConformWindow(cam, Fit, 1.5)

    isCloseNumbers([cam.GetHorizontalAperture(), cam.getVerticalAperture(),
      cam.getHorizontalApertureOffset(), cam.getVerticalApertureOffset()], [150.0, 100.0, 11.0, 12.0])
  })

  it('test_ConformFrustum', () => {
    const frustum = new GfFrustum()
    frustum.setWindow(new GfRange2d(new GfVec2d(-1.2, -1.0), new GfVec2d(1.0, 1.5)))

    CameraUtilConformWindow(frustum, Crop, 1.3333)

    isCloseNumbers(vec(frustum.getWindow().getMin()), [-1.2, -0.575020625515638])
    isCloseNumbers(vec(frustum.getWindow().getMax()), [1.0, 1.075020625515638])

    frustum.setWindow(new GfRange2d(new GfVec2d(-1.2, -1.0), new GfVec2d(1.0, 1.5)))
    CameraUtilConformWindow(frustum, DontConform, 1.3333)
    isCloseNumbers(vec(frustum.getWindow().getMin()), [-1.2, -1.0])
    isCloseNumbers(vec(frustum.getWindow().getMax()), [1.0, 1.5])
  })
})
