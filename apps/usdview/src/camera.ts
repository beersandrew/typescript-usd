// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/freeCamera.py, pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { decomposeRotation, extractRotation, orthonormalizeMatrix, type Matrix4 } from 'typescript-usd/gf'

// Free camera — mirrors usdview's freeCamera.py FreeCamera semantics with
// row-major row-vector matrices (v * M), matching the @pxr/hdSt shaders.
//
// Upstream's camera-to-world transform is
//   T(0,0,dist) · Rz(-psi) · Rx(-phi) · Ry(-theta) · T(center)
// with TUMBLE = unclamped increments to theta/phi (0.25° per pixel), so the
// camera rolls smoothly over the poles instead of clamping at them. We store
// azimuth = -theta, elevation = phi and roll = psi (radians).
//
// Z-up stages: freeCamera.py:67-74,120-127 appends _YZUpInvMatrix (a +90°
// rotation about X, the inverse of Gf.Camera.Y_UP_TO_Z_UP_MATRIX) after the
// tumble rotations, so theta/phi = 0 looks along +Y with +Z up and tumbling
// yaws about world Z. stageView.py:800-815 picks it from UsdGeomGetStageUpAxis.

export interface OrbitCamera {
  /** FreeCamera._rotPsi in radians: roll decomposed from an authored camera
   * (freeCamera.py:157-160); tumbling never changes it. */
  roll?: number
  /** FreeCamera isZUp: the stage's upAxis is Z (freeCamera.py:41,67-74). */
  zUp?: boolean
  orthographicHeight?: number
  apertureOffset?: [number, number]
  target: [number, number, number]   // FreeCamera.center
  radius: number                     // FreeCamera.dist
  azimuth: number                    // radians; -rotTheta
  elevation: number                  // radians; rotPhi — UNCLAMPED (tumbles over poles)
  fovY: number                       // radians
  near: number
  far: number
  // FreeCamera._selSize analog — drives the small-distance zoom escape so
  // you can't get "stuck" zoomed all the way in. Set by fitCameraToStage.
  selSize: number
}

// usdview defaults: the free camera starts at rotTheta = rotPhi = 0 —
// looking straight down -Z (+Y for Z-up stages) — with a 60° FOV
// (viewSettings.freeCameraFOV).
export function defaultCamera(): OrbitCamera {
  // usdviewq/freeCamera.py:58-60. Zero-size bounds retain these defaults.
  return {
    target: [0, 0, 0],
    radius: 100,
    azimuth: 0,
    elevation: 0,
    fovY: Math.PI / 3,
    near: DEFAULT_NEAR,
    far: DEFAULT_FAR,
    selSize: 10,
  }
}

// Row-major matrix multiply: C = A * B
function mul(a: number[], b: number[]): number[] {
  const r = new Array<number>(16).fill(0)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      for (let k = 0; k < 4; k++) {
        r[row*4+col]! += (a[row*4+k] ?? 0) * (b[k*4+col] ?? 0)
      }
    }
  }
  return r
}

// Row-vector rotation about X by `a` radians.
function rotX(a: number): number[] {
  const c = Math.cos(a), s = Math.sin(a)
  return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]
}

// Row-vector rotation about Z by `a` radians.
function rotZ(a: number): number[] {
  const c = Math.cos(a), s = Math.sin(a)
  return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]
}

// Row-vector rotation about Y by `a` radians.
function rotY(a: number): number[] {
  const c = Math.cos(a), s = Math.sin(a)
  return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]
}

function translate(x: number, y: number, z: number): number[] {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]
}

// Gf.Camera.Y_UP_TO_Z_UP_MATRIX (freeCamera.py:69-71) and its inverse.
const Y_UP_TO_Z_UP = rotX(-Math.PI / 2)
const Z_UP_TO_Y_UP = rotX(Math.PI / 2)

// The camera-to-world ROTATION (no translation): Rz(-psi) · Rx(-phi) ·
// Ry(-theta) · YZUpInv (freeCamera.py:120-127), theta = -azimuth,
// phi = elevation, psi = roll.
function cameraRotation(cam: OrbitCamera): number[] {
  const rotation = mul(mul(rotZ(-(cam.roll ?? 0)), rotX(-cam.elevation)), rotY(cam.azimuth))
  return cam.zUp ? mul(rotation, Z_UP_TO_Y_UP) : rotation
}

/** Switch to a free camera that reproduces an authored camera-to-world
 * transform `m` (row-major, row-vector) without changing the view, as
 * FreeCamera._pullFromCameraTransform does (freeCamera.py:135-162): center
 * = position + focusDistance · viewDirection; the rotation, taken after
 * multiplying by _YZUpMatrix and orthonormalizing, is decomposed about
 * Y, X, Z into -theta, -phi, -psi. */
export function pullFromCameraTransform(cam: OrbitCamera, m: readonly number[], focusDistance: number): void {
  const authored = [m[0]!,m[1]!,m[2]!,0, m[4]!,m[5]!,m[6]!,0, m[8]!,m[9]!,m[10]!,0, 0,0,0,1]
  const transform = orthonormalizeMatrix((cam.zUp ? mul(authored, Y_UP_TO_Z_UP) : authored) as Matrix4)
  const [y, x, z] = decomposeRotation(extractRotation(transform), [0,1,0], [1,0,0], [0,0,1])
  // rotTheta = -y, rotPhi = -x, rotPsi = -z (degrees); azimuth = -rotTheta.
  cam.azimuth = y * Math.PI / 180; cam.elevation = -x * Math.PI / 180; cam.roll = -z * Math.PI / 180
  cam.radius = focusDistance
  cam.target = [m[12]!-focusDistance*m[8]!, m[13]!-focusDistance*m[9]!, m[14]!-focusDistance*m[10]!]
}

// World-space camera basis vectors (rows of the camera-to-world rotation).
export function getCameraBasis(cam: OrbitCamera): {
  right: [number, number, number]
  up: [number, number, number]
  forward: [number, number, number]   // view direction (-Z of the camera)
} {
  const r = cameraRotation(cam)
  return {
    right:   [r[0]!, r[1]!, r[2]!],
    up:      [r[4]!, r[5]!, r[6]!],
    forward: [-r[8]!, -r[9]!, -r[10]!],
  }
}

export function getEyePosition(cam: OrbitCamera): [number, number, number] {
  // (0,0,dist) through the camera rotation, offset from the center.
  const r = cameraRotation(cam)
  return [
    cam.target[0] + cam.radius * r[8]!,
    cam.target[1] + cam.radius * r[9]!,
    cam.target[2] + cam.radius * r[10]!,
  ]
}

// World-to-camera (view) matrix in this codebase's row-vector convention —
// the rigid inverse of the camera-to-world transform, mirroring
// GfMatrix4d::SetLookAt: the rotation block carries the camera basis
// (right, up, back) as COLUMNS (the inverse of the camera-to-world
// rotation, whose rows are the basis) and the translation row is
// -dot(eye, basisRow) per axis.
export function getViewMatrix(cam: OrbitCamera): number[] {
  const eye = getEyePosition(cam)
  const m = cameraRotation(cam)
  return [
    m[0]!, m[4]!,  m[8]!,  0,
    m[1]!, m[5]!,  m[9]!,  0,
    m[2]!, m[6]!,  m[10]!, 0,
    -(m[0]!*eye[0] + m[1]!*eye[1] + m[2]!*eye[2]),
    -(m[4]!*eye[0] + m[5]!*eye[1] + m[6]!*eye[2]),
    -(m[8]!*eye[0] + m[9]!*eye[1] + m[10]!*eye[2]),
    1,
  ]
}

// Row-major perspective projection (WebGPU NDC: z in [0,1]).
function perspective(fovY: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovY / 2)
  const rangeInv = 1 / (near - far)
  return [
    f/aspect, 0, 0,                       0,
    0,        f, 0,                       0,
    0,        0, far*rangeInv,            -1,
    0,        0, near*far*rangeInv,        0,
  ]
}

function transpose(m: number[]): number[] {
  return [
    m[0]!, m[4]!, m[8]!,  m[12]!,
    m[1]!, m[5]!, m[9]!,  m[13]!,
    m[2]!, m[6]!, m[10]!, m[14]!,
    m[3]!, m[7]!, m[11]!, m[15]!,
  ]
}

// Returns the combined VP matrix as Float32Array.
// Transposed for WGSL upload: WGSL mat4x4f is column-major, so uploading
// the transpose of our row-major VP means the shader's (v * M) correctly
// computes v * VP instead of v * VP^T.
export function getViewProjection(cam: OrbitCamera, aspect: number): Float32Array<ArrayBuffer> {
  const view = getViewMatrix(cam)
  const proj = perspective(cam.fovY, aspect, cam.near, cam.far)
  return new Float32Array(transpose(mul(view, proj)))
}

// ---- Pointer interaction (usdview stageView.py factors) ----

// Tumble: 0.25 degrees per pixel, both axes, no clamping. Drag right orbits
// the view rightward; drag down pitches the camera up over the model
// (rotPhi += dy in upstream terms).
const TUMBLE_RAD_PER_PIXEL = 0.25 * Math.PI / 180

export function tumble(cam: OrbitCamera, dxPixels: number, dyPixels: number): void {
  cam.azimuth   -= dxPixels * TUMBLE_RAD_PER_PIXEL
  cam.elevation += dyPixels * TUMBLE_RAD_PER_PIXEL
}

// FreeCamera.AdjustDistance: multiplicative dolly with the small-distance
// additive escape so zooming all the way in never gets stuck.
export function adjustDistance(cam: OrbitCamera, scaleFactor: number): void {
  if (cam.orthographicHeight !== undefined) { cam.orthographicHeight *= Math.max(scaleFactor,0.01); return }
  if (scaleFactor > 1 && cam.radius < 2) {
    const selBasedIncr = cam.selSize / 25
    cam.radius += Math.min(selBasedIncr, scaleFactor - 1)
  } else {
    cam.radius *= scaleFactor
  }
}

// Mouse wheel: usdview maps a Qt angle delta (±120/notch, + = away) through
// AdjustDistance(1 - clamp(delta/1000, ±0.5)). Browser deltaY is inverted
// (+ = toward the user) and ~100/notch.
export function applyZoom(cam: OrbitCamera, browserDeltaY: number): void {
  const qtDelta = -browserDeltaY * 1.2
  adjustDistance(cam, 1 - Math.max(-0.5, Math.min(0.5, qtDelta / 1000)))
}

// Zoom-drag (usdview right-mouse): dolly by -0.002 per pixel of (dx + dy).
export function zoomDrag(cam: OrbitCamera, dxPixels: number, dyPixels: number): void {
  adjustDistance(cam, 1 - 0.002 * (dxPixels + dyPixels))
}

// Truck (usdview middle-mouse): pans the center along the camera's
// right/up axes, scaled so the scene tracks the cursor 1:1.
export function truck(
  cam: OrbitCamera,
  dxPixels: number,
  dyPixels: number,
  viewportHeightPixels: number,
): void {
  // ComputePixelsToWorldFactor: frustum height at the focus distance over
  // the viewport height.
  const worldHeight = cam.orthographicHeight ?? 2 * cam.radius * Math.tan(cam.fovY / 2)
  const pixelsToWorld = worldHeight / viewportHeightPixels
  const { right, up } = getCameraBasis(cam)
  const dRight = -dxPixels * pixelsToWorld
  const dUp = dyPixels * pixelsToWorld
  cam.target = [
    cam.target[0] + dRight * right[0] + dUp * up[0],
    cam.target[1] + dRight * right[1] + dUp * up[1],
    cam.target[2] + dRight * right[2] + dUp * up[2],
  ]
}

// Back-compat alias for the old drag entry point (tumble semantics).
export function applyDrag(cam: OrbitCamera, dx: number, dy: number): void {
  tumble(cam, dx, dy)
}

// ---- Fit to scene ----

// FreeCamera.frameSelection(selBBox, frameFit) (freeCamera.py:319-337), with
// stageView.resetCam's frameFit = 1.1 (stageView.py:1047-1055): center on the
// box centroid; fit the largest box extent to the vertical field of view
// (upstream divides by atan, not tan, of the half angle). Orthographic
// cameras set the aperture height instead. Native AutoClip=false keeps the
// default/override clipping planes (freeCamera.py:300-315).
export const FRAME_FIT = 1.1
export const DEFAULT_NEAR = 1  // FreeCamera.defaultNear
export const DEFAULT_FAR = 2000000  // FreeCamera.defaultFar
export function fitCameraToBounds(
  cam: OrbitCamera,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  frameFit = FRAME_FIT,
): void {
  const dx = max[0]-min[0], dy = max[1]-min[1], dz = max[2]-min[2]
  // usdviewq/stageView.py:1047-1055: resetCam ignores empty and point ranges.
  if (dx < 0 || dy < 0 || dz < 0 || (dx === 0 && dy === 0 && dz === 0)) return
  const selSize = Math.max(dx, dy, dz)
  cam.target = [(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2]
  cam.selSize = selSize
  if (cam.orthographicHeight !== undefined) {
    cam.orthographicHeight = selSize*frameFit
    cam.radius = selSize + DEFAULT_NEAR
  } else {
    const halfFov = (cam.fovY*90/Math.PI) || 0.5  // degrees; don't divide by zero
    const lengthToFit = selSize*frameFit*0.5
    cam.radius = lengthToFit/Math.atan(halfFov*Math.PI/180)
    // Very small objects may pierce the default near plane (freeCamera.py:333-337).
    if (cam.radius < DEFAULT_NEAR + selSize*0.5) cam.radius = DEFAULT_NEAR + lengthToFit
  }
  // Framing does not enable automatic clipping or rewrite its preferences.
}
