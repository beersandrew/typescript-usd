// HdCamera view-projection regression tests. The rigid inverse must
// satisfy M · M⁻¹ = I — the original implementation built the inverse
// translation from R's columns instead of rows, which renders nothing for
// any camera that combines rotation + translation.

import { describe, expect, it } from 'vitest'
import { HdCamera } from '../../src/camera.ts'

// Row-vector point transform through the (transposed-for-WGSL) VP matrix.
function projectPoint(vpT: Float32Array, p: [number, number, number]): [number, number, number] {
  const vp = new Array<number>(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) vp[r * 4 + c] = vpT[c * 4 + r]!
  const out = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    out[c] = p[0] * vp[c]! + p[1] * vp[4 + c]! + p[2] * vp[8 + c]! + vp[12 + c]!
  }
  return [out[0]! / out[3]!, out[1]! / out[3]!, out[2]! / out[3]!]
}

function makeCamera(worldMatrix: number[]): HdCamera {
  const cam = new HdCamera('/Cam')
  cam.worldMatrix = worldMatrix
  cam.focalLength = 35
  cam.verticalAperture = 15.2908
  cam.horizontalAperture = 20.955
  return cam
}

describe('HdCamera.GetViewProjection', () => {
  it('a translated camera centers the point it faces', () => {
    // Camera at (0, 0, 10) looking down −Z at the origin (identity rotation)
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,10,1])
    const ndc = projectPoint(cam.getViewProjection(1), [0, 0, 0])
    expect(ndc[0]).toBeCloseTo(0, 4)
    expect(ndc[1]).toBeCloseTo(0, 4)
  })

  it('rotation + translation: a tilted camera still centers its target', () => {
    // Camera at (0, 55, 150) pitched −20° about X — its view axis passes
    // (almost exactly) through the world origin.
    const a = -20 * Math.PI / 180
    const c = Math.cos(a), s = Math.sin(a)
    // rotX(−20°) row-vector matrix with translation in the last row
    const world = [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,55,150,1]
    const cam = makeCamera(world)
    const ndc = projectPoint(cam.getViewProjection(2), [0, 0, 0])
    expect(Math.abs(ndc[0])).toBeLessThan(0.05)
    expect(Math.abs(ndc[1])).toBeLessThan(0.05)
  })

  it('points left/right of the view axis land on the correct NDC side', () => {
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,10,1])
    const vp = cam.getViewProjection(1)
    expect(projectPoint(vp, [-2, 0, 0])[0]).toBeLessThan(0)
    expect(projectPoint(vp, [2, 0, 0])[0]).toBeGreaterThan(0)
    expect(projectPoint(vp, [0, 2, 0])[1]).toBeGreaterThan(0)
  })

  it('points behind the camera project outside the frustum direction', () => {
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,10,1])
    const vp = cam.getViewProjection(1)
    // In front: z_view < 0 → w > 0; behind: w < 0 flips the projected signs
    const front = projectPoint(vp, [1, 0, 0])
    const behind = projectPoint(vp, [1, 0, 20])
    expect(front[0]).toBeGreaterThan(0)
    expect(behind[0]).toBeLessThan(0)
  })

  // GfCamera::GetFrustum applies horizontal/verticalApertureOffset by shifting
  // the projection window off-center (GfFrustum matrix[2][0..1]). Under this
  // renderer's MatchVertical conformance the shift is 2*hOff/(vAp*aspect) in X
  // and 2*vOff/vAp in Y. Offsets default to 0, so centered cameras are intact.
  it('zero aperture offset leaves the on-axis point centered', () => {
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,10,1])
    const ndc = projectPoint(cam.getViewProjection(1.6), [0, 0, 0])
    expect(ndc[0]).toBeCloseTo(0, 4)
    expect(ndc[1]).toBeCloseTo(0, 4)
  })

  it('a horizontal aperture offset shifts the on-axis point off-center', () => {
    const aspect = 1.6
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,10,1])
    // +X offset shifts the window right → the same on-axis point moves to −X NDC.
    cam.horizontalApertureOffset = 5
    const shifted = projectPoint(cam.getViewProjection(aspect), [0, 0, 0])
    expect(shifted[0]).toBeCloseTo(-(2 * 5) / (cam.verticalAperture * aspect), 4)
    expect(shifted[1]).toBeCloseTo(0, 4)
  })

  it('a vertical aperture offset shifts the on-axis point in Y', () => {
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,10,1])
    cam.verticalApertureOffset = 3
    const shifted = projectPoint(cam.getViewProjection(1.6), [0, 0, 0])
    expect(shifted[1]).toBeCloseTo(-(2 * 3) / cam.verticalAperture, 4)
    expect(shifted[0]).toBeCloseTo(0, 4)
  })
})

// GfCamera orthographic (GfFrustum::Orthographic): the window comes straight
// from the aperture (no focal divide) and points project with NO perspective
// divide, so screen position is independent of depth. Drives the 6-axis
// render-conformance cameras (conformance_cube.usda).
describe('HdCamera.GetViewProjection — orthographic', () => {
  function orthoCamera(): HdCamera {
    // Eye at (0,0,5) looking −Z. Window half-extents: hAp/2*0.1 = 1.0 (x),
    // vAp/2*0.1 = 0.5 (y); aperture aspect 2.0 (= the test's output aspect, so
    // no MatchVertical distortion). Clip [1,9] brackets the view-space depths.
    const cam = makeCamera([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,5,1])
    cam.projection = 'orthographic'
    cam.horizontalAperture = 20
    cam.verticalAperture = 10
    cam.clippingRange = [1, 9]
    return cam
  }

  it('maps the aperture window edges to NDC ±1', () => {
    const vp = orthoCamera().getViewProjection(2.0)
    // World x = ±1.0 is the window half-width → NDC ±1; y = ±0.5 → NDC ±1.
    expect(projectPoint(vp, [1, 0, 0])[0]).toBeCloseTo(1, 4)
    expect(projectPoint(vp, [-1, 0, 0])[0]).toBeCloseTo(-1, 4)
    expect(projectPoint(vp, [0, 0.5, 0])[1]).toBeCloseTo(1, 4)
  })

  it('projects without perspective divide — screen position is depth-independent', () => {
    const vp = orthoCamera().getViewProjection(2.0)
    // Two world points with the same x but different depth land on the same
    // NDC x (the defining orthographic property; perspective would diverge).
    const near = projectPoint(vp, [1, 0, 2])
    const far  = projectPoint(vp, [1, 0, -3])
    expect(near[0]).toBeCloseTo(1, 4)
    expect(far[0]).toBeCloseTo(near[0]!, 6)
  })

  it('maps the near plane to z=0 and the far plane to z=1', () => {
    const vp = orthoCamera().getViewProjection(2.0)
    // Eye at z=5: world z=4 is view depth −1 (near), z=−4 is −9 (far).
    expect(projectPoint(vp, [0, 0, 4])[2]).toBeCloseTo(0, 4)
    expect(projectPoint(vp, [0, 0, -4])[2]).toBeCloseTo(1, 4)
    expect(projectPoint(vp, [0, 0, 0])[2]).toBeCloseTo(0.5, 4)
  })
})
