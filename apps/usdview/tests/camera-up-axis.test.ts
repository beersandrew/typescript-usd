// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/freeCamera.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Expected values: native OpenUSD 26.11.1 Usdviewq.FreeCamera, captured by
// the capture tooling kept outside this repository into tests/fixtures/freeCameraUpAxis
// (FIXTURES.md; freeCamera.py:41-74,104-162,319-337,362-367).
import { describe, it, expect } from 'vitest'
import { defaultCamera, fitCameraToBounds, getCameraBasis, getEyePosition, pullFromCameraTransform, tumble, type OrbitCamera } from '../src/camera'
import expected from './fixtures/freeCameraUpAxis/expected.json' with { type: 'json' }

const DEG = Math.PI / 180
function expectTransform(cam: OrbitCamera, m: number[]) {
  const { right, up, forward } = getCameraBasis(cam), eye = getEyePosition(cam)
  const rows = [right, up, forward.map(v => -v), eye]
  rows.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(m[i * 4 + j]!, 9)))
}

describe('free camera up axis (native usdviewq FreeCamera)', () => {
  it('is captured from the pinned native build', () => {
    expect(expected.native).toBe('0.26.11')
  })
  for (const row of expected.pushes) {
    it(`${row.isZUp ? 'Z' : 'Y'}-up theta ${row.rotTheta} phi ${row.rotPhi.toFixed(2)} matches the native camera transform`, () => {
      const cam = { ...defaultCamera(), zUp: row.isZUp, azimuth: -row.rotTheta * DEG, elevation: row.rotPhi * DEG,
        target: row.center as [number, number, number], radius: row.dist }
      expectTransform(cam, row.transform)
    })
  }
  for (const row of expected.pulls) {
    it(`${row.isZUp ? 'Z' : 'Y'}-up authored camera with roll becomes a free camera without changing the view`, () => {
      const cam = { ...defaultCamera(), zUp: row.isZUp }
      pullFromCameraTransform(cam, row.authored, row.focusDistance)
      expectTransform(cam, row.transform)
      cam.target.forEach((v, i) => expect(v).toBeCloseTo(row.center[i]!, 9))
      expect(cam.radius).toBeCloseTo(row.dist, 12)
      expect(-cam.azimuth / DEG).toBeCloseTo(row.rotTheta, 9)
      expect(cam.elevation / DEG).toBeCloseTo(row.rotPhi, 9)
      expect(cam.roll! / DEG).toBeCloseTo(row.rotPsi, 9)
    })
    it(`${row.isZUp ? 'Z' : 'Y'}-up tumbling after the pull keeps the decomposed roll`, () => {
      const cam = { ...defaultCamera(), zUp: row.isZUp }
      pullFromCameraTransform(cam, row.authored, row.focusDistance)
      // FreeCamera.Tumble(dTheta, dPhi) in degrees; tumble() takes 0.25° per pixel
      // with azimuth = -theta.
      tumble(cam, row.tumble.dTheta / 0.25, row.tumble.dPhi / 0.25)
      expectTransform(cam, row.tumble.transform)
    })
  }
  for (const row of expected.frames) {
    it(`frames ${JSON.stringify(row.min)}..${JSON.stringify(row.max)} ${row.orthographic ? 'orthographic' : 'perspective'} like frameSelection`, () => {
      const cam: OrbitCamera = { ...defaultCamera(), ...(row.orthographic ? { orthographicHeight: 1 } : {}) }
      fitCameraToBounds(cam, row.min as [number, number, number], row.max as [number, number, number])
      cam.target.forEach((v, i) => expect(v).toBeCloseTo(row.center[i]!, 12))
      expect(cam.radius).toBeCloseTo(row.dist, 10)
      if (row.orthographic) expect(cam.orthographicHeight).toBeCloseTo(row.fov, 12)
    })
  }
})
