// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomCamera.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usdGeom/testenv/testUsdGeomCamera.py
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Camera, CAMERA_DEFAULTS, computeProjectionMatrix, Mesh } from 'typescript-usd/usdGeom'
import type { GfCamera } from 'typescript-usd/usdGeom'

function makeCamera() {
  const stage = Stage.createNew()
  const cam = Camera.define(stage, '/Cam')
  return { stage, cam, prim: () => stage.getPrim('/Cam')! }
}

describe('UsdGeomCamera', () => {
  it('authors the OpenUSD v26.08 clipping, stereo, and exposure surface', () => {
    const stage = Stage.createNew()
    const camera = Camera.define(stage, '/Camera')
    camera.getClippingPlanesAttr().set([[0, 1, 0, 2]])
    camera.getStereoRoleAttr().set('left')
    camera.getExposureAttr().set(1)
    camera.getExposureTimeAttr().set(0.5)
    camera.getExposureIsoAttr().set(200)
    camera.getExposureFStopAttr().set(2)
    camera.getExposureResponsivityAttr().set(3)
    expect(Camera.getStereoRole(stage.getPrim('/Camera')!)).toBe('left')
    expect(camera.computeLinearExposureScale()).toBeCloseTo(1.5)
    expect(stage.exportToUsda()).toContain('float4[] clippingPlanes')
  })

  describe('Projection', () => {
    it('default projection is perspective', () => {
      const { prim } = makeCamera()
      expect(Camera.getProjection(prim())).toBe('perspective')
    })

    it('SetProjection(orthographic) round-trips through GetProjection()', () => {
      const { cam, prim } = makeCamera()
      cam.getProjectionAttr().set('orthographic')
      expect(Camera.getProjection(prim())).toBe('orthographic')
    })
  })

  describe('Frustum parameters', () => {
    it('horizontalAperture and verticalAperture default to 35mm values', () => {
      const { prim } = makeCamera()
      const c = Camera.getCamera(prim())
      expect(c.horizontalAperture).toBeCloseTo(20.955, 4)
      expect(c.verticalAperture).toBeCloseTo(15.2908, 4)
    })

    it('focalLength default is 50mm', () => {
      const { prim } = makeCamera()
      expect(Camera.getCamera(prim()).focalLength).toBe(50)
    })

    it('clippingRange default is (1, 1000000)', () => {
      const { prim } = makeCamera()
      expect(Camera.getCamera(prim()).clippingRange).toEqual([1, 1000000])
    })

    it('authored focalLength round-trips through GetFocalLengthAttr()', () => {
      const { cam, prim } = makeCamera()
      cam.getFocalLengthAttr().set(85)
      expect(Camera.getCamera(prim()).focalLength).toBe(85)
    })

    it('authored clippingRange round-trips through GetClippingRangeAttr()', () => {
      const { cam, prim } = makeCamera()
      cam.getClippingRangeAttr().set([0.5, 5000])
      expect(Camera.getCamera(prim()).clippingRange).toEqual([0.5, 5000])
    })
  })

  describe('GetCamera / SetFromCamera', () => {
    it('GetCamera returns a GfCamera with correct projection matrix for perspective', () => {
      const { prim } = makeCamera()
      const c = Camera.getCamera(prim())
      const m = computeProjectionMatrix(c)
      // x/y scale follow tan(fov/2) = aperture / (2 * focalLength)
      expect(m[0]).toBeCloseTo((2 * 50) / 20.955, 5)
      expect(m[5]).toBeCloseTo((2 * 50) / 15.2908, 4)
      // No aperture offset → frustum is centered (matrix[2][0..1] == 0).
      expect(m[8]).toBe(0)
      expect(m[9]).toBe(0)
      // Perspective divide: w' = -z
      expect(m[11]).toBe(-1)
      expect(m[15]).toBe(0)
      // Depth convention is WebGPU/WGSL [0,1] (idiomatic platform choice — see
      // camera.ts: every typescript-usd renderer authors projection in this same form;
      // GfFrustum's GL [-1,1] would be inconsistent with WGSL clip space).
      // x/y/offset structure is byte-for-byte GfFrustum. A point at z=-near
      // maps to clip 0, z=-far maps to clip 1 (after the perspective divide).
      const [near, far] = c.clippingRange
      const zAtNear = -near * m[10]! + m[14]!
      expect(zAtNear / near).toBeCloseTo(0, 5)
      const zAtFar = -far * m[10]! + m[14]!
      expect(zAtFar / far).toBeCloseTo(1, 5)
    })

    it('applies aperture offset to an off-center perspective frustum', () => {
      // Faithful to GfCamera::GetFrustum: the offset shifts the reference
      // window, surfacing in matrix[2][0..1] as 2*offset/aperture.
      const { cam, prim } = makeCamera()
      cam.getHorizontalApertureOffsetAttr().set(2.0955)  // 10% of hAp (20.955)
      cam.getVerticalApertureOffsetAttr().set(1.52908)   // 10% of vAp (15.2908)
      const c = Camera.getCamera(prim())
      const m = computeProjectionMatrix(c)
      // 2 * offset / aperture
      expect(m[8]).toBeCloseTo((2 * 2.0955) / 20.955, 5)   // -> 0.2
      expect(m[9]).toBeCloseTo((2 * 1.52908) / 15.2908, 5) // -> 0.2
      // Offsets must not perturb the x/y scale.
      expect(m[0]).toBeCloseTo((2 * 50) / 20.955, 5)
      expect(m[5]).toBeCloseTo((2 * 50) / 15.2908, 4)
    })

    it('GetCamera returns a GfCamera with correct projection matrix for orthographic', () => {
      const { cam, prim } = makeCamera()
      cam.getProjectionAttr().set('orthographic')
      cam.getHorizontalApertureAttr().set(40)  // world width = 4.0
      cam.getVerticalApertureAttr().set(20)    // world height = 2.0
      const c = Camera.getCamera(prim())
      const m = computeProjectionMatrix(c)
      expect(m[0]).toBeCloseTo(2 / 4.0, 5)
      expect(m[5]).toBeCloseTo(2 / 2.0, 5)
      // Centered: no offset terms in matrix[3][0..1].
      expect(m[12]).toBeCloseTo(0, 10)
      expect(m[13]).toBeCloseTo(0, 10)
      expect(m[11]).toBe(0)
      expect(m[15]).toBe(1)
    })

    it('applies aperture offset to an off-center orthographic frustum', () => {
      // GfFrustum ortho puts -(r+l)/rl, -(t+b)/tb in matrix[3][0..1].
      const { cam, prim } = makeCamera()
      cam.getProjectionAttr().set('orthographic')
      cam.getHorizontalApertureAttr().set(40)
      cam.getVerticalApertureAttr().set(20)
      cam.getHorizontalApertureOffsetAttr().set(4)  // 10% of hAp
      cam.getVerticalApertureOffsetAttr().set(2)    // 10% of vAp
      const c = Camera.getCamera(prim())
      const m = computeProjectionMatrix(c)
      expect(m[12]).toBeCloseTo(-(2 * 4) / 40, 5)  // -> -0.2
      expect(m[13]).toBeCloseTo(-(2 * 2) / 20, 5)  // -> -0.2
    })

    it('SetFromCamera round-trips a GfCamera back to USD attributes', () => {
      const { cam, prim } = makeCamera()
      const src: GfCamera = {
        ...CAMERA_DEFAULTS,
        projection: 'orthographic',
        focalLength: 100,
        horizontalAperture: 36,
        verticalAperture: 24,
        clippingRange: [2, 2000],
        fStop: 8,
        focusDistance: 350,
      }
      cam.setFromCamera(src)
      expect(Camera.getCamera(prim())).toEqual(src)
    })
  })

  describe('Shutter', () => {
    it('shutterOpen and shutterClose default to 0 and 0', () => {
      const { prim } = makeCamera()
      expect(Camera.getShutterOpen(prim())).toBe(0)
      expect(Camera.getShutterClose(prim())).toBe(0)
    })

    it('authored shutter values round-trip correctly', () => {
      const { cam, prim } = makeCamera()
      cam.getShutterOpenAttr().set(-0.25)
      cam.getShutterCloseAttr().set(0.25)
      expect(Camera.getShutterOpen(prim())).toBe(-0.25)
      expect(Camera.getShutterClose(prim())).toBe(0.25)
    })
  })

  describe('IsA', () => {
    it('Camera.is(prim) returns true for a Camera prim', () => {
      const { prim } = makeCamera()
      expect(Camera.is(prim())).toBe(true)
    })

    it('Camera.is(prim) returns false for a Mesh prim', () => {
      const stage = Stage.createNew()
      Mesh.define(stage, '/M')
      expect(Camera.is(stage.getPrim('/M')!)).toBe(false)
    })
  })
})
