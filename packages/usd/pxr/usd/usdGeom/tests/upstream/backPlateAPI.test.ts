// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomBackPlateAPI.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdGeom/testenv/testUsdGeomBackPlateAPI.py (OpenUSD
// v26.11.1). Every expected value is the upstream test's own assertion or is
// computed from the Gf.Camera values exactly as the Python test computes it
// (_GetExpectedDimension); each case cites the .py lines it ports. The
// _CheckValues / _GetSchemaProjection helpers (py:12-42) are never called by
// the upstream tests and are not ported. Usd.TimeCode(t) maps to the number
// t; Set() without a time authors the default.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { IsClose as GfIsClose, Matrix4d as GfMatrix4d, Vec2f as GfVec2f, Vec3d as GfVec3d,
  Vec3f as GfVec3f, Vec4f as GfVec4f, makeRotation } from 'typescript-usd/gf'
import { GfCamera, GfRange1f } from 'typescript-usd/gf/camera'
import { BackPlateAPI, Camera } from 'typescript-usd/usdGeom'
import { plain } from '../../src/valueUtils.ts'

// Gf.IsClose(a, b, eps) on scalars (gf/math.h GfIsClose: |a - b| < eps).
function isCloseScalar(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) < eps
}

function vec3f(v: unknown): GfVec3f {
  const p = plain(v) as number[]
  return new GfVec3f(p[0]!, p[1]!, p[2]!)
}

function vec2f(v: unknown): GfVec2f {
  const p = plain(v) as number[]
  return new GfVec2f(p[0]!, p[1]!)
}

function getAt(attr: { getValueAtTime(t: number): unknown }, time: number): unknown {
  return attr.getValueAtTime(time)
}

// _SetCamera (py:44-61).
function setCamera(usdCamera: Camera): [Camera, GfCamera] {
  const camera = new GfCamera()
  camera.setTransform(
    new GfMatrix4d().setRotate(makeRotation([1.0, 2.0, 3.0], 10.0)).getMultiply(
      new GfMatrix4d().setTranslate(new GfVec3d(4.0, 5.0, 6.0))))
  camera.setProjection(GfCamera.Perspective)
  camera.setHorizontalAperture(5.1)
  camera.setVerticalAperture(2.0)
  camera.setHorizontalApertureOffset(0.13)
  camera.setVerticalApertureOffset(-0.14)
  camera.setFocalLength(28)
  camera.setClippingRange(new GfRange1f(5, 15))
  camera.setClippingPlanes([new GfVec4f(1, 2, 3, 4), new GfVec4f(8, 7, 6, 5)])
  camera.setFStop(1.2)
  camera.setFocusDistance(300)

  usdCamera.setFromCamera(camera, 1.0)
  return [usdCamera, camera]
}

// _GetExpectedDimension (py:63-68).
function getExpectedDimension(forWidth: boolean, camera: GfCamera): number {
  const aperture = forWidth ? camera.GetHorizontalAperture() : camera.getVerticalAperture()
  return camera.getFocusDistance() * aperture / camera.getFocalLength()
}

describe('testUsdGeomBackPlateAPI', () => {
  // test_AutoFocus (py:71-127).
  it('test_AutoFocus', () => {
    const usdStage = Stage.createNew()
    let usdCamera = Camera.define(usdStage, '/camera')
    expect(BackPlateAPI.canApply(usdCamera.prim, 'test:autoFocus:backPlate')).toBe(true)

    const backPlate = BackPlateAPI.apply(usdCamera.prim, 'test:autoFocus:backPlate')

    let camera: GfCamera
    ;[usdCamera, camera] = setCamera(usdCamera)
    expect(backPlate.isValid()).toBe(true)
    let expectedW = getExpectedDimension(true, camera)
    let expectedH = getExpectedDimension(false, camera)

    // Test auto focus abilities
    let w = backPlate.computeEffectiveDimension(true, 1.0)
    let h = backPlate.computeEffectiveDimension(false, 1.0)
    const scaleFactor = 2.0
    expect(isCloseScalar(w, expectedW, 1e-6), `${w} vs ${expectedW}`).toBe(true)
    expect(isCloseScalar(h, expectedH, 1e-6), `${h} vs ${expectedH}`).toBe(true)

    // Scaling should affect the back plate size
    backPlate.getScaleTweakAttr().set(new GfVec2f(scaleFactor, scaleFactor))
    w = backPlate.computeEffectiveDimension(true, 1.0)
    h = backPlate.computeEffectiveDimension(false, 1.0)
    expect(isCloseScalar(w, expectedW * scaleFactor, 1e-6)).toBe(true)
    expect(isCloseScalar(h, expectedH * scaleFactor, 1e-6)).toBe(true)

    // Translation should not affect the back plate size
    backPlate.getTranslateTweakAttr().set(new GfVec3f(1.0, 2.0, 1.0))
    w = backPlate.computeEffectiveDimension(true, 1.0)
    h = backPlate.computeEffectiveDimension(false, 1.0)
    expect(isCloseScalar(w, expectedW * scaleFactor, 1e-6)).toBe(true)
    expect(isCloseScalar(h, expectedH * scaleFactor, 1e-6)).toBe(true)

    // Changing the focus distance should affect the back plate size
    camera.setFocusDistance(camera.getFocusDistance() * 2)
    usdCamera.setFromCamera(camera, 1.0)
    w = backPlate.computeEffectiveDimension(true, 1.0)
    h = backPlate.computeEffectiveDimension(false, 1.0)
    expectedW = getExpectedDimension(true, camera)
    expectedH = getExpectedDimension(false, camera)

    expect(isCloseScalar(w, expectedW * scaleFactor, 1e-5), `${w} vs ${expectedW * scaleFactor}`).toBe(true)
    expect(isCloseScalar(h, expectedH * scaleFactor, 1e-5), `${h} vs ${expectedH * scaleFactor}`).toBe(true)

    // Back plate dimensions should not increase with focus distance with
    // orthographic projections
    camera.setProjection(GfCamera.Orthographic)
    usdCamera.setFromCamera(camera, 1.0)
    w = backPlate.computeEffectiveDimension(true, 1.0)
    h = backPlate.computeEffectiveDimension(false, 1.0)
    expectedW = camera.GetHorizontalAperture()
    expectedH = camera.getVerticalAperture()

    expect(isCloseScalar(w, expectedW * scaleFactor, 1e-6)).toBe(true)
    expect(isCloseScalar(h, expectedH * scaleFactor, 1e-6)).toBe(true)
  })

  // test_SetPositionAPI (py:129-162).
  it('test_SetPositionAPI', () => {
    const usdStage = Stage.createNew()
    let usdCamera = Camera.define(usdStage, '/camera')
    expect(BackPlateAPI.canApply(usdCamera.prim, 'test:SetPositionAPI:backPlate')).toBe(true)
    const backPlate = BackPlateAPI.apply(usdCamera.prim, 'test:SetPositionAPI:backPlate')

    ;[usdCamera] = setCamera(usdCamera)
    expect(backPlate.isValid()).toBe(true)

    const close = (expected: [number, number, number], actual: unknown): boolean =>
      GfIsClose(new GfVec3f(...expected), vec3f(actual), 1e-6)

    expect(close([0.0, 0.0, 300], backPlate.getCameraSpacePosition(1.0))).toBe(true)
    expect(close([4.0, 5.0, 306], backPlate.getWorldSpacePosition(1.0)),
      `${backPlate.getWorldSpacePosition(1.0)}`).toBe(true)

    // set position via world space
    backPlate.setWorldSpacePosition([5.0, 7.0, 206.0], 1.0)

    expect(close([1.0, 2.0, -100.0], getAt(backPlate.getTranslateTweakAttr(), 1.0))).toBe(true)
    expect(close([1.0, 2.0, 200.0], backPlate.getCameraSpacePosition(1.0))).toBe(true)
    expect(close([5.0, 7.0, 206.0], backPlate.getWorldSpacePosition(1.0))).toBe(true)

    // set position via camera space
    backPlate.setCameraSpacePosition([3.0, 4.0, 340.0], 2.0)
    expect(close([3.0, 4.0, 40.0], getAt(backPlate.getTranslateTweakAttr(), 2.0))).toBe(true)
    expect(close([3.0, 4.0, 340.0], backPlate.getCameraSpacePosition(2.0))).toBe(true)
    expect(close([7.0, 9.0, 346.0], backPlate.getWorldSpacePosition(2.0))).toBe(true)
  })

  // test_SetAspectRatio (py:164-186).
  it('test_SetAspectRatio', () => {
    const usdStage = Stage.createNew()
    let usdCamera = Camera.define(usdStage, '/camera')
    expect(BackPlateAPI.canApply(usdCamera.prim, 'test:aspectRatio:backPlate')).toBe(true)
    const backPlate = BackPlateAPI.apply(usdCamera.prim, 'test:aspectRatio:backPlate')

    ;[usdCamera] = setCamera(usdCamera)
    expect(backPlate.isValid()).toBe(true)

    const targetW = 75.0
    const targetH = 50.0
    const w = backPlate.computeEffectiveDimension(true, 1.0)
    const h = backPlate.computeEffectiveDimension(false, 1.0)

    backPlate.setAspectRatio(targetW, targetH, 1.0)
    const newW = backPlate.computeEffectiveDimension(true, 1.0)
    const newH = backPlate.computeEffectiveDimension(false, 1.0)
    expect(isCloseScalar(newW, 75, 1e-6), `${newW}`).toBe(true)
    expect(isCloseScalar(newH, 50, 1e-6), `${newH}`).toBe(true)
    expect(vec2f(getAt(backPlate.getScaleTweakAttr(), 1.0)).equals(
      new GfVec2f(targetW / w, targetH / h))).toBe(true)
  })

  // test_SetBackPlate (py:188-254).
  it('test_SetBackPlate', () => {
    const usdStage = Stage.createNew()
    const usdCamera = Camera.define(usdStage, '/camera')
    expect(BackPlateAPI.canApply(usdCamera.prim, 'test:backPlate')).toBe(true)
    const backPlate = BackPlateAPI.apply(usdCamera.prim, 'test:backPlate')

    setCamera(usdCamera)
    expect(backPlate.isValid()).toBe(true)

    const v3 = (attr: { getValueAtTime(t: number): unknown }) => vec3f(getAt(attr, 1.0))

    // Check default values
    expect(vec2f(getAt(backPlate.getScaleTweakAttr(), 1.0)).equals(new GfVec2f(1.0, 1.0))).toBe(true)
    expect(v3(backPlate.getRotateXYZTweakAttr()).equals(new GfVec3f(0.0, 0.0, 0.0))).toBe(true)
    expect(v3(backPlate.getTranslateTweakAttr()).equals(new GfVec3f(0.0, 0.0, 0.0))).toBe(true)
    expect(v3(backPlate.getLumaSlopeAttr()).equals(new GfVec3f(1.0, 1.0, 1.0))).toBe(true)
    expect(v3(backPlate.getLumaPowerAttr()).equals(new GfVec3f(1.0, 1.0, 1.0))).toBe(true)
    expect(v3(backPlate.getLumaOffsetAttr()).equals(new GfVec3f(0.0, 0.0, 0.0))).toBe(true)
    expect(getAt(backPlate.getPlateVisibilityAttr(), 1.0)).toBe('solo')
    expect(getAt(backPlate.getDepthMinOffsetAttr(), 1.0)).toBe(0.0)
    expect(getAt(backPlate.getDepthNormalizingFactorAttr(), 1.0)).toBe(1.0)
    expect(getAt(backPlate.getDepthCameraSpaceOffsetAttr(), 1.0)).toBe(0.0)

    // Set new values
    backPlate.getScaleTweakAttr().set(new GfVec2f(2.0, 3.0))
    backPlate.getRotateXYZTweakAttr().set(new GfVec3f(2.0, 2.0, 6.0))
    backPlate.getTranslateTweakAttr().set(new GfVec3f(3.0, -2.0, -1.0))
    backPlate.getLumaSlopeAttr().set(new GfVec3f(2.0, 1.0, 0.5))
    backPlate.getLumaPowerAttr().set(new GfVec3f(3.0, 2.0, 0.5))
    backPlate.getLumaOffsetAttr().set(new GfVec3f(1.0, 0.0, 0.5))
    backPlate.getDepthMinOffsetAttr().set(2.0)
    backPlate.getDepthNormalizingFactorAttr().set(2.0)
    backPlate.getDepthCameraSpaceOffsetAttr().set(6.0)

    expect(vec2f(getAt(backPlate.getScaleTweakAttr(), 1.0)).equals(new GfVec2f(2.0, 3.0))).toBe(true)
    expect(v3(backPlate.getRotateXYZTweakAttr()).equals(new GfVec3f(2.0, 2.0, 6.0))).toBe(true)
    expect(v3(backPlate.getTranslateTweakAttr()).equals(new GfVec3f(3.0, -2.0, -1.0))).toBe(true)
    expect(v3(backPlate.getLumaSlopeAttr()).equals(new GfVec3f(2.0, 1.0, 0.5))).toBe(true)
    expect(v3(backPlate.getLumaPowerAttr()).equals(new GfVec3f(3.0, 2.0, 0.5))).toBe(true)
    expect(v3(backPlate.getLumaOffsetAttr()).equals(new GfVec3f(1.0, 0.0, 0.5))).toBe(true)
    expect(getAt(backPlate.getDepthMinOffsetAttr(), 1.0)).toBe(2.0)
    expect(getAt(backPlate.getDepthNormalizingFactorAttr(), 1.0)).toBe(2.0)
    expect(getAt(backPlate.getDepthCameraSpaceOffsetAttr(), 1.0)).toBe(6.0)

    // PlateVisibility
    expect(getAt(backPlate.getPlateVisibilityAttr(), 1.0)).toBe('solo')
    backPlate.getPlateVisibilityAttr().set('all')
    expect(getAt(backPlate.getPlateVisibilityAttr(), 1.0)).toBe('all')
    backPlate.getPlateVisibilityAttr().set('mute')
    expect(getAt(backPlate.getPlateVisibilityAttr(), 1.0)).toBe('mute')
  })
})
