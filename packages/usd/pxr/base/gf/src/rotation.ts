// Ported from OpenUSD 26.11.1: pxr/base/gf/rotation.cpp,
//  pxr/base/gf/rotation.h, pxr/base/gf/matrix4d.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfRotation + the matrix rotation/decomposition surface.
//
// Faithful port of pxr/base/gf/rotation.{h,cpp} and the rotation-related
// methods of pxr/base/gf/matrix4{d}.{h} + matrix4.template.cpp:
//   GfRotation        SetAxisAngle, GetQuat, SetQuat, SetRotateInto,
//                     GetInverse, operator*, TransformDir, Decompose
//   GfMatrix4d        SetRotate(GfRotation), ExtractRotation,
//                     ExtractRotationQuat, SetLookAt, Factor, GetTranspose,
//                     GetDeterminant3, Orthonormalize
//
// Internal representation uses plain tuples + free functions alongside the
// public GfMatrix4d/GfVec3d/GfQuatd value-type classes. The numerics — operation
// order, sign conventions, singular/identity fallbacks — mirror upstream so
// results match the Pixar build (cross-checked in tests/upstream/rotation.test.ts).
//
// Row-vector convention throughout (v' = v · M), matching GfMatrix4d storage:
// Matrix4 is row-major number[16], _mtx[row][col] == m[row*4 + col].

import { type Matrix4, mul4, quatToMatrix } from './matrix.ts'
import { GfMatrix3d, GfMatrix4d } from './matrixData.ts'
import { GfVec3d } from './vec.ts'
import { GfDegreesToRadians } from './math.ts'

export type Vec3 = [number, number, number]
// (w, x, y, z) — real-first, the repo's USDA/internal quaternion order.
export type Quat = [number, number, number, number]

/** Axis (unit) + angle in degrees. Mirrors GfRotation's (_axis, _angle). */
export interface Rotation {
  axis: Vec3
  angle: number
}

// pxr/base/gf/limits.h
const GF_MIN_VECTOR_LENGTH = 1e-10
const GF_MIN_ORTHO_TOLERANCE = 1e-6

// pxr/base/gf/math.h
const degToRad = (d: number): number => d * (Math.PI / 180.0)
const radToDeg = (r: number): number => r * (180.0 / Math.PI)
const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

// ---------------------------------------------------------------------------
// GfVec3d free-function fragment (the ops GfRotation/Factor require).
// ---------------------------------------------------------------------------

export const dot3 = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const lengthSq3 = (a: Vec3): number => dot3(a, a)
export const length3 = (a: Vec3): number => Math.sqrt(lengthSq3(a))

// GfVec3d::GetNormalized: divides by length, or by eps when length <= eps
// (so a near-zero vector blows up rather than silently becoming zero — the
// upstream quirk, preserved deliberately). GfVec3d's operator/= multiplies
// by 1/s (vec3d.h:223-231).
export function getNormalized3(a: Vec3, eps = GF_MIN_VECTOR_LENGTH): Vec3 {
  const len = length3(a)
  const inv = 1.0 / (len > eps ? len : eps)
  return [a[0] * inv, a[1] * inv, a[2] * inv]
}

// GfIsClose(GfVec3d, GfVec3d, tol): |v1 - v2|^2 <= tol^2
const vecIsClose = (a: Vec3, b: Vec3, tol: number): boolean =>
  lengthSq3(sub3(a, b)) <= tol * tol

// ---------------------------------------------------------------------------
// Quaternion helpers (GfQuatd / GfQuaternion fragment).
// ---------------------------------------------------------------------------

const quatReal = (q: Quat): number => q[0]
const quatImag = (q: Quat): Vec3 => [q[1], q[2], q[3]]

// GfQuatd::Normalize: identity if length < eps, else divide by length
// (quatd.cpp:46-56, quatd.h:182-186: the real part divides, the GfVec3d
// imaginary part multiplies by 1/length, vec3d.h:223-227).
function normalizeQuat(q: Quat, eps = GF_MIN_VECTOR_LENGTH): Quat {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3])
  if (len < eps) return [1, 0, 0, 0]
  const inv = 1.0 / len
  return [q[0] / len, q[1] * inv, q[2] * inv, q[3] * inv]
}

// GfQuaternion product (w1,v1)*(w2,v2) = (w1 w2 - v1·v2, w1 v2 + w2 v1 + v1×v2).
function quatMul(a: Quat, b: Quat): Quat {
  const ar = quatReal(a), br = quatReal(b)
  const ai = quatImag(a), bi = quatImag(b)
  const w = ar * br - dot3(ai, bi)
  const im: Vec3 = [
    ar * bi[0] + br * ai[0] + (ai[1] * bi[2] - ai[2] * bi[1]),
    ar * bi[1] + br * ai[1] + (ai[2] * bi[0] - ai[0] * bi[2]),
    ar * bi[2] + br * ai[2] + (ai[0] * bi[1] - ai[1] * bi[0]),
  ]
  return [w, im[0], im[1], im[2]]
}

// ---------------------------------------------------------------------------
// GfRotation.
// ---------------------------------------------------------------------------

/**
 * GfRotation::SetAxisAngle — angle in degrees about axis. The axis is
 * normalized unless it is already (very near) unit length, matching upstream's
 * `if (!GfIsClose(_axis*_axis, 1.0, 1e-10)) _axis.Normalize()`.
 */
export function makeRotation(axis: Vec3, angle: number): Rotation {
  let a: Vec3 = [axis[0], axis[1], axis[2]]
  if (Math.abs(dot3(a, a) - 1.0) > 1e-10) a = getNormalized3(a)
  return { axis: a, angle }
}

export const identityRotation = (): Rotation => ({ axis: [1, 0, 0], angle: 0 })

/** GfRotation::GetQuat — (w, x, y, z), normalized. */
export function rotationToQuat(r: Rotation): Quat {
  const radians = degToRad(r.angle) / 2.0
  const sinR = Math.sin(radians), cosR = Math.cos(radians)
  const a = scale3(r.axis, sinR)
  return normalizeQuat([cosR, a[0], a[1], a[2]])
}

/** GfRotation::SetQuat — quaternion (w,x,y,z) → axis-angle. */
export function quatToRotation(q: Quat): Rotation {
  const imag = quatImag(q)
  const len = length3(imag)
  if (len > GF_MIN_VECTOR_LENGTH) {
    const x = Math.acos(clamp(quatReal(q), -1.0, 1.0))
    // quat.GetImaginary() / len multiplies by 1/len (vec3d.h:229-231).
    return makeRotation(scale3(imag, 1.0 / len), 2.0 * radToDeg(x))
  }
  return identityRotation()
}

/**
 * GfRotation::SetRotateInto — the rotation that brings `from` onto `to`.
 * Inputs need not be unit length.
 */
export function rotateInto(from: Vec3, to: Vec3): Rotation {
  const f = getNormalized3(from)
  const t = getNormalized3(to)
  const cos = dot3(f, t)

  if (cos > 0.9999999) return identityRotation()

  if (cos < -0.9999999) {
    // Opposite vectors: 180° about any axis perpendicular to `from`.
    let tmp = cross3(f, [1, 0, 0])
    if (length3(tmp) < 0.00001) tmp = cross3(f, [0, 1, 0])
    return makeRotation(getNormalized3(tmp), 180.0)
  }

  // Generic case — note upstream crosses the ORIGINAL (un-normalized) vectors.
  const axis = getNormalized3(cross3(from, to))
  return makeRotation(axis, radToDeg(Math.acos(cos)))
}

/** GfRotation::GetInverse — same axis, negated angle. */
export const rotationInverse = (r: Rotation): Rotation => ({
  axis: [r.axis[0], r.axis[1], r.axis[2]],
  angle: -r.angle,
})

/**
 * GfRotation::operator*=(double) — scales the rotation ANGLE (not the rotation)
 * by `scale`; the axis is untouched. Also backs `operator*(r, scale)` and
 * `operator*(scale, r)`.
 */
export const scaleRotationAngle = (r: Rotation, scale: number): Rotation => ({
  axis: [r.axis[0], r.axis[1], r.axis[2]],
  angle: r.angle * scale,
})

/**
 * GfRotation::operator/=(double) — divides the rotation ANGLE by `scale`.
 * Kept distinct from scaleRotationAngle(r, 1/scale) so the float result matches
 * upstream's `_angle /= scale` bit-for-bit (e.g. 900/10 == 90, not 90.0…1).
 */
export const divideRotationAngle = (r: Rotation, scale: number): Rotation => ({
  axis: [r.axis[0], r.axis[1], r.axis[2]],
  angle: r.angle / scale,
})

/**
 * GfRotation::operator== — component-wise: axes and angle must match EXACTLY.
 * (Upstream's contract; to compare the actual rotations, compare quaternions.)
 */
export const rotationEqual = (a: Rotation, b: Rotation): boolean =>
  a.axis[0] === b.axis[0] && a.axis[1] === b.axis[1] && a.axis[2] === b.axis[2] &&
  a.angle === b.angle

/**
 * GfRotation operator<< — debugging string in upstream's `[(x y z) a]` form.
 * (Float formatting is JS-native, not Gf_OstreamHelperP; used only for the
 * "str is non-empty" coverage check.)
 */
export const rotationStr = (r: Rotation): string =>
  `[(${r.axis[0]}, ${r.axis[1]}, ${r.axis[2]}) ${r.angle}]`

/**
 * GfRotation Python repr — `Gf.Rotation(Gf.Vec3d(x, y, z), angle)`. JS number
 * toString round-trips doubles exactly, so reconstructing via makeRotation and
 * comparing with rotationEqual mirrors upstream's `eval(repr(r)) == r`.
 */
export const rotationRepr = (r: Rotation): string =>
  `Gf.Rotation(Gf.Vec3d(${r.axis[0]}, ${r.axis[1]}, ${r.axis[2]}), ${r.angle})`

/**
 * GfRotation hash_value — TfHash::Combine(_axis, _angle). We don't reproduce
 * TfHash's exact integer (that needs the full Tf hashing machinery); this is a
 * deterministic structural hash, so equal rotations hash equal — the property
 * the upstream suite actually asserts.
 */
export function rotationHash(r: Rotation): number {
  // Structural FNV over the components. Hash integers are implementation
  // details; the public contract is that equal rotations hash equally.
  let h = 2166136261 >>> 0
  for (const v of [r.axis[0], r.axis[1], r.axis[2], r.angle]) {
    const buf = new Float64Array([v])
    const bytes = new Uint8Array(buf.buffer)
    for (const b of bytes) {
      h ^= b
      h = Math.imul(h, 16777619) >>> 0
    }
  }
  return h >>> 0
}

/**
 * GfRotation::RotateOntoProjected — projects v1 and v2 onto the plane normal to
 * `axis`, then returns the rotation about `axis` that brings v1 onto v2.
 * Faithful port of rotation.cpp's static method.
 */
export function rotateOntoProjected(v1: Vec3, v2: Vec3, axisParam: Vec3): Rotation {
  const axis = getNormalized3(axisParam)
  const v1Proj = getNormalized3(sub3(v1, scale3(axis, dot3(v1, axis))))
  const v2Proj = getNormalized3(sub3(v2, scale3(axis, dot3(v2, axis))))
  const crossAxis = cross3(v1Proj, v2Proj)
  const sinTheta = dot3(crossAxis, axis)
  const cosTheta = dot3(v1Proj, v2Proj)
  let theta = 0
  if (!(Math.abs(sinTheta) < 1e-6 && Math.abs(cosTheta) < 1e-6))
    theta = Math.atan2(sinTheta, cosTheta)
  return makeRotation(axis, radToDeg(theta))
}

/**
 * GfRotation r1 * r2 (operator*). Composes via quaternions; preserves r1's
 * axis when the product is an identity rotation (upstream's deliberate choice
 * so a 360°-multiple does not lose the axis). Does NOT clamp acos — matches
 * operator*= (unlike SetQuat, which does clamp).
 */
export function composeRotations(r1: Rotation, r2: Rotation): Rotation {
  const q = normalizeQuat(quatMul(rotationToQuat(r2), rotationToQuat(r1)))
  const imag = quatImag(q)
  const len = length3(imag)
  if (len > GF_MIN_VECTOR_LENGTH) {
    return {
      axis: [imag[0] / len, imag[1] / len, imag[2] / len],
      angle: 2.0 * radToDeg(Math.acos(quatReal(q))),
    }
  }
  // Identity product: keep r1's axis, zero the angle.
  return { axis: [r1.axis[0], r1.axis[1], r1.axis[2]], angle: 0 }
}

/** GfRotation::TransformDir — rotate a direction vector. */
export const transformDir = (r: Rotation, vec: Vec3): Vec3 =>
  matrixTransformDir(rotationToMatrix(r), vec)

/**
 * GfRotation::Decompose — Euler angles (degrees) about three orthogonal axes.
 * Graphics Gems IV, Ken Shoemake. Returns [r0, r1, r2] for axis0/1/2.
 * (Does not emit the upstream non-orthogonality warning.)
 */
export function decomposeRotation(r: Rotation, axis0: Vec3, axis1: Vec3, axis2: Vec3): Vec3 {
  const mat = rotationToMatrix(r)
  const n0 = getNormalized3(axis0)
  const n1 = getNormalized3(axis1)
  const n2 = getNormalized3(axis2)

  // Frame whose rows take the given axes onto x/y/z (column j = nAxis_j).
  const axes: Matrix4 = [
    n0[0], n1[0], n2[0], 0,
    n0[1], n1[1], n2[1], 0,
    n0[2], n1[2], n2[2], 0,
    0, 0, 0, 1,
  ]
  const m = mul4(mul4(transposeMatrix(axes), mat), axes)
  const e = (row: number, col: number): number => m[row * 4 + col]!

  let r0: number, r1: number, r2: number
  const cy = Math.sqrt(e(0, 0) * e(0, 0) + e(1, 0) * e(1, 0))
  if (cy > 1e-6) {
    r0 = Math.atan2(e(2, 1), e(2, 2))
    r1 = Math.atan2(-e(2, 0), cy)
    r2 = Math.atan2(e(1, 0), e(0, 0))
  } else {
    r0 = Math.atan2(-e(1, 2), e(1, 1))
    r1 = Math.atan2(-e(2, 0), cy)
    r2 = 0
  }

  // Handedness of the axis basis flips the sign of all three angles.
  if (dot3(cross3(n0, n1), n2) >= 0.0) {
    r0 = -r0; r1 = -r1; r2 = -r2
  }

  return [radToDeg(r0), radToDeg(r1), radToDeg(r2)]
}

// ---------------------------------------------------------------------------
// GfMatrix4d rotation / decomposition methods.
// ---------------------------------------------------------------------------

/**
 * GfMatrix4d::SetRotate(GfRotation) — pure rotation matrix (row-vector form).
 * Goes through GetQuaternion() then _SetRotateFromQuat, which is exactly
 * matrix.ts's quatToMatrix.
 */
export function rotationToMatrix(r: Rotation): Matrix4 {
  const q = rotationToQuat(r)
  return quatToMatrix(q[0], q[1], q[2], q[3])
}

/** GfMatrix4d::GetTranspose. */
export function transposeMatrix(m: Matrix4): Matrix4 {
  return [
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ]
}

/** GfMatrix4d::TransformDir — direction by the upper 3×3 (no translation). */
export function matrixTransformDir(m: Matrix4, v: Vec3): Vec3 {
  return [
    v[0] * m[0] + v[1] * m[4] + v[2] * m[8],
    v[0] * m[1] + v[1] * m[5] + v[2] * m[9],
    v[0] * m[2] + v[1] * m[6] + v[2] * m[10],
  ]
}

/** GfMatrix4d::GetDeterminant3 — determinant of the upper-left 3×3. */
export function getDeterminant3(m: Matrix4): number {
  const e = (r: number, c: number): number => m[r * 4 + c]!
  return (
    e(0, 0) * e(1, 1) * e(2, 2) +
    e(0, 1) * e(1, 2) * e(2, 0) +
    e(0, 2) * e(1, 0) * e(2, 1) -
    e(0, 0) * e(1, 2) * e(2, 1) -
    e(0, 1) * e(1, 0) * e(2, 2) -
    e(0, 2) * e(1, 1) * e(2, 0)
  )
}

/**
 * GfMatrix4d::ExtractRotationQuat — rotation quaternion (w,x,y,z) from the
 * matrix. Open Inventor SbRotation::SetValue, finding the largest diagonal
 * for numerical stability.
 */
export function extractRotationQuat(m: Matrix4): Quat {
  const e = (r: number, c: number): number => m[r * 4 + c]!

  // Largest diagonal element.
  let i: number
  if (e(0, 0) > e(1, 1)) i = e(0, 0) > e(2, 2) ? 0 : 2
  else i = e(1, 1) > e(2, 2) ? 1 : 2

  const im: Vec3 = [0, 0, 0]
  let r: number

  if (e(0, 0) + e(1, 1) + e(2, 2) > e(i, i)) {
    r = 0.5 * Math.sqrt(e(0, 0) + e(1, 1) + e(2, 2) + e(3, 3))
    im[0] = (e(1, 2) - e(2, 1)) / (4.0 * r)
    im[1] = (e(2, 0) - e(0, 2)) / (4.0 * r)
    im[2] = (e(0, 1) - e(1, 0)) / (4.0 * r)
  } else {
    const j = (i + 1) % 3
    const k = (i + 2) % 3
    const q = 0.5 * Math.sqrt(e(i, i) - e(j, j) - e(k, k) + e(3, 3))
    im[i] = q
    im[j] = (e(i, j) + e(j, i)) / (4 * q)
    im[k] = (e(k, i) + e(i, k)) / (4 * q)
    r = (e(j, k) - e(k, j)) / (4 * q)
  }

  return [clamp(r, -1.0, 1.0), im[0], im[1], im[2]]
}

/** GfMatrix4d::ExtractRotation. */
export const extractRotation = (m: Matrix4): Rotation =>
  quatToRotation(extractRotationQuat(m))

/**
 * GfMatrix4d::SetLookAt(eye, center, up) — world→eye view matrix.
 * Right-handed: camera looks down -view; basis lives in the COLUMNS (see the
 * row-vector LookAt convention note in repo memory).
 */
export function setLookAt(eye: Vec3, center: Vec3, up: Vec3): Matrix4 {
  const view = getNormalized3(sub3(center, eye))
  const right = getNormalized3(cross3(view, up))
  const realUp = cross3(right, view) // already unit

  return [
    right[0], realUp[0], -view[0], 0,
    right[1], realUp[1], -view[1], 0,
    right[2], realUp[2], -view[2], 0,
    -dot3(right, eye), -dot3(realUp, eye), dot3(view, eye), 1,
  ]
}

/**
 * GfVec3d::OrthogonalizeBasis — iteratively orthogonalize (and optionally
 * normalize) a 3-vector basis in place. Returns the converged basis and a
 * `converged` flag (false if input vectors are colinear or it hit MAX_ITERS).
 */
export function orthogonalizeBasis(
  tx0: Vec3, ty0: Vec3, tz0: Vec3,
  normalize: boolean,
  eps = GF_MIN_ORTHO_TOLERANCE,
): { tx: Vec3; ty: Vec3; tz: Vec3; converged: boolean } {
  let tx: Vec3 = [...tx0] as Vec3
  let ty: Vec3 = [...ty0] as Vec3
  let tz: Vec3 = [...tz0] as Vec3

  if (normalize) {
    tx = getNormalized3(tx); ty = getNormalized3(ty); tz = getNormalized3(tz)
  }
  let ax = getNormalized3(tx), ay = getNormalized3(ty), az = getNormalized3(tz)

  // Colinear quick-out (the error metric below can't distinguish colinear from
  // converged).
  if (vecIsClose(ax, ay, eps) || vecIsClose(ax, az, eps) || vecIsClose(ay, az, eps)) {
    return { tx, ty, tz, converged: false }
  }

  const MAX_ITERS = 20
  let iter = 0
  for (; iter < MAX_ITERS; ++iter) {
    let bx: Vec3 = [...tx] as Vec3
    let by: Vec3 = [...ty] as Vec3
    let bz: Vec3 = [...tz] as Vec3

    bx = sub3(bx, scale3(ay, dot3(ay, bx)))
    bx = sub3(bx, scale3(az, dot3(az, bx)))
    by = sub3(by, scale3(ax, dot3(ax, by)))
    by = sub3(by, scale3(az, dot3(az, by)))
    bz = sub3(bz, scale3(ax, dot3(ax, bz)))
    bz = sub3(bz, scale3(ay, dot3(ay, bz)))

    let cx = scale3(add3(tx, bx), 0.5)
    let cy = scale3(add3(ty, by), 0.5)
    let cz = scale3(add3(tz, bz), 0.5)

    if (normalize) {
      cx = getNormalized3(cx); cy = getNormalized3(cy); cz = getNormalized3(cz)
    }

    const xDiff = sub3(tx, cx), yDiff = sub3(ty, cy), zDiff = sub3(tz, cz)
    const error = dot3(xDiff, xDiff) + dot3(yDiff, yDiff) + dot3(zDiff, zDiff)
    if (error < eps * eps) break

    tx = cx; ty = cy; tz = cz
    ax = tx; ay = ty; az = tz
    if (!normalize) {
      ax = getNormalized3(ax); ay = getNormalized3(ay); az = getNormalized3(az)
    }
  }

  return { tx, ty, tz, converged: iter < MAX_ITERS }
}

/**
 * GfMatrix4d::Orthonormalize — orthonormalize the upper 3×3 row basis in
 * place; the translation row is preserved (homogeneous coord divided out).
 */
export function orthonormalizeMatrix(m: Matrix4): Matrix4 {
  const r0: Vec3 = [m[0], m[1], m[2]]
  const r1: Vec3 = [m[4], m[5], m[6]]
  const r2: Vec3 = [m[8], m[9], m[10]]
  const { tx, ty, tz } = orthogonalizeBasis(r0, r1, r2, true)

  const out: Matrix4 = [
    tx[0], tx[1], tx[2], m[3],
    ty[0], ty[1], ty[2], m[7],
    tz[0], tz[1], tz[2], m[11],
    m[12], m[13], m[14], m[15],
  ]

  // Divide out a non-unit homogeneous coordinate (unless it's ~0).
  if (out[15] !== 1.0 && Math.abs(out[15]) > GF_MIN_VECTOR_LENGTH) {
    out[12] /= out[15]
    out[13] /= out[15]
    out[14] /= out[15]
    out[15] = 1.0
  }
  return out
}

// Jacobi eigen-decomposition of a symmetric 3×3 (Open Inventor SbMatrix::Jacobi3).
// Operates on the upper-left 3×3 of `m`; returns eigenvalues + eigenvectors
// (eigenvectors[j] is a row triple, matching upstream's indexing).
function jacobi3(m: Matrix4): { eigenvalues: Vec3; eigenvectors: [Vec3, Vec3, Vec3] } {
  const a = [
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10],
  ]
  const eigenvalues: Vec3 = [a[0]!, a[4]!, a[8]!]
  const ev: [Vec3, Vec3, Vec3] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const b: Vec3 = [eigenvalues[0], eigenvalues[1], eigenvalues[2]]
  const z: Vec3 = [0, 0, 0]
  const A = (p: number, q: number): number => a[p * 3 + q]!
  const setA = (p: number, q: number, v: number): void => { a[p * 3 + q] = v }

  for (let i = 0; i < 50; i++) {
    let sm = 0.0
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) sm += Math.abs(A(p, q))
    if (sm === 0.0) break

    const thresh = i < 3 ? (0.2 * sm) / (3 * 3) : 0.0

    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        const g = 100.0 * Math.abs(A(p, q))
        if (
          i > 3 &&
          Math.abs(eigenvalues[p]!) + g === Math.abs(eigenvalues[p]!) &&
          Math.abs(eigenvalues[q]!) + g === Math.abs(eigenvalues[q]!)
        ) {
          setA(p, q, 0.0)
        } else if (Math.abs(A(p, q)) > thresh) {
          let h = eigenvalues[q]! - eigenvalues[p]!
          let t: number
          if (Math.abs(h) + g === Math.abs(h)) {
            t = A(p, q) / h
          } else {
            const theta = (0.5 * h) / A(p, q)
            t = 1.0 / (Math.abs(theta) + Math.sqrt(1.0 + theta * theta))
            if (theta < 0.0) t = -t
          }
          const c = 1.0 / Math.sqrt(1.0 + t * t)
          const s = t * c
          const tau = s / (1.0 + c)
          h = t * A(p, q)
          z[p]! -= h; z[q]! += h
          eigenvalues[p]! -= h; eigenvalues[q]! += h
          setA(p, q, 0.0)

          for (let j = 0; j < p; j++) {
            const gg = A(j, p), hh = A(j, q)
            setA(j, p, gg - s * (hh + gg * tau))
            setA(j, q, hh + s * (gg - hh * tau))
          }
          for (let j = p + 1; j < q; j++) {
            const gg = A(p, j), hh = A(j, q)
            setA(p, j, gg - s * (hh + gg * tau))
            setA(j, q, hh + s * (gg - hh * tau))
          }
          for (let j = q + 1; j < 3; j++) {
            const gg = A(p, j), hh = A(q, j)
            setA(p, j, gg - s * (hh + gg * tau))
            setA(q, j, hh + s * (gg - hh * tau))
          }
          for (let j = 0; j < 3; j++) {
            const gg = ev[j]![p]!, hh = ev[j]![q]!
            ev[j]![p] = gg - s * (hh + gg * tau)
            ev[j]![q] = hh + s * (gg - hh * tau)
          }
        }
      }
    }
    for (let p = 0; p < 3; p++) {
      b[p]! += z[p]!
      eigenvalues[p] = b[p]!
      z[p] = 0
    }
  }

  return { eigenvalues, eigenvectors: ev }
}

export interface MatrixFactors {
  /** Rotation (eigenvectors of A·Aᵀ). */
  rotation: Matrix4
  /** Per-axis scale (signed). */
  scale: Vec3
  /** Shear / scale-orientation. */
  shear: Matrix4
  /** Translation. */
  translation: Vec3
  /** Perspective (identity for affine matrices). */
  perspective: Matrix4
  /** True iff the matrix was non-singular (= upstream Factor's return). */
  nonSingular: boolean
}

/**
 * GfMatrix4d::Factor — factor into perspective · translation · rotation ·
 * scale · shear (Open Inventor SbMatrix::Factor). Eigen-decomposes A·Aᵀ for
 * the rotation, derives signed scale from the eigenvalues, and recovers shear
 * as U = R·S⁻¹·Rᵀ·A. `nonSingular` is upstream's bool return.
 */
export function factorMatrix(m: Matrix4, eps = 1e-10): MatrixFactors {
  const perspective: Matrix4 = [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]

  // A = upper 3×3, with translation split out.
  const a: Matrix4 = [
    m[0], m[1], m[2], 0,
    m[4], m[5], m[6], 0,
    m[8], m[9], m[10], 0,
    0, 0, 0, 1,
  ]
  const translation: Vec3 = [m[12], m[13], m[14]]

  const det = getDeterminant3(a)
  const detSign = det < 0.0 ? -1.0 : 1.0
  const nonSingular = !(det * detSign < eps)

  const b = mul4(a, transposeMatrix(a))
  const { eigenvalues, eigenvectors } = jacobi3(b)

  const rotation: Matrix4 = [
    eigenvectors[0][0], eigenvectors[0][1], eigenvectors[0][2], 0,
    eigenvectors[1][0], eigenvectors[1][1], eigenvectors[1][2], 0,
    eigenvectors[2][0], eigenvectors[2][1], eigenvectors[2][2], 0,
    0, 0, 0, 1,
  ]

  const sInv: Matrix4 = [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]
  const scale: Vec3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    scale[i] = eigenvalues[i]! < eps ? detSign * eps : detSign * Math.sqrt(eigenvalues[i]!)
    sInv[i * 4 + i] = 1.0 / scale[i]!
  }

  // U = R · S⁻¹ · Rᵀ · A
  const shear = mul4(mul4(mul4(rotation, sInv), transposeMatrix(rotation)), a)

  return { rotation, scale, shear, translation, perspective, nonSingular }
}

const M_PI = Math.PI

// Which of the four angles is being zeroed out (the nullptr output). Mirrors
// the anonymous-namespace enum _ZeroAngle in rotation.cpp.
type ZeroAngle = 'NONE' | 'TW' | 'FB' | 'LR' | 'SW'

const t3 = (v: GfVec3d): Vec3 => [v.get(0), v.get(1), v.get(2)]

// ---------------------------------------------------------------------------
// static helpers (rotation.cpp).
// ---------------------------------------------------------------------------

// _RotateOntoProjected: the rotation (as a matrix) that brings v1 onto v2 in the
// plane normal to axis, plus theta in RADIANS. Mirrors the static helper.
function _rotateOntoProjected(
  v1: GfVec3d,
  v2: GfVec3d,
  axis: GfVec3d,
): { mat: GfMatrix4d; theta: number } {
  const r = rotateOntoProjected(t3(v1), t3(v2), t3(axis))
  const mat = new GfMatrix4d().setRotate(r)
  // C++: r.GetAngle() / (180/pi). GetAngle() is in degrees.
  return { mat, theta: GfDegreesToRadians(r.angle) }
}

// _PiShift: shift each component of `attempt` by multiples of 2pi so it lands
// within [hint - pi, hint + pi]. Componentwise and independent.
function _piShift(hint: number[], attempt: number[]): number[] {
  const result = attempt.slice()
  for (let i = 0; i < 4; i++) {
    while (result[i]! > hint[i]! + M_PI) result[i]! -= 2.0 * M_PI
    while (result[i]! < hint[i]! - M_PI) result[i]! += 2.0 * M_PI
  }
  return result
}

// _ShiftGimbalLock: readjust the first and last angles when the middle angle
// collapses their axes onto each other. Returns the adjusted [first, last].
const _GET_EPSILON = 1e-6
function _shiftGimbalLock(
  middleAngle: number,
  firstAngle: number,
  lastAngle: number,
): [number, number] {
  let first = firstAngle
  let last = lastAngle
  // Middle angle is +/-PI: the axes flipped, so use the difference.
  if (Math.abs(Math.abs(middleAngle) - M_PI) < _GET_EPSILON) {
    const diff = last - first
    last = diff / 2
    first = -diff / 2
  }
  // Middle angle is 0: the two axes have the same effect, so use the sum.
  if (Math.abs(middleAngle) < _GET_EPSILON) {
    const sum = last + first
    last = sum / 2
    first = sum / 2
  }
  return [first, last]
}

// ---------------------------------------------------------------------------
// GfRotation::MatchClosestEulerRotation
// ---------------------------------------------------------------------------

/**
 * GfRotation::MatchClosestEulerRotation — replace the hint angles with the
 * closest equivalent rotation to the targets. Each non-null angle ends up
 * within Pi of its target and the sum of differences with the targets is
 * minimized. A `null` angle is treated as 0.0 and ignored (returned as 0.0),
 * exactly like passing nullptr upstream. Rotation order is Tw/FB/LR/Sw; angles
 * are in radians. Returns the 4-tuple [thetaTw, thetaFB, thetaLR, thetaSw].
 */
export function GfMatchClosestEulerRotation(
  targetTw: number,
  targetFB: number,
  targetLR: number,
  targetSw: number,
  thetaTw: number | null,
  thetaFB: number | null,
  thetaLR: number | null,
  thetaSw: number | null,
): [number, number, number, number] {
  // The binding inits each angle to its value (or 0.0 if null). A null channel
  // is never written, so it is returned as that 0.0.
  const w = [thetaTw ?? 0.0, thetaFB ?? 0.0, thetaLR ?? 0.0, thetaSw ?? 0.0]
  const isNull = [thetaTw === null, thetaFB === null, thetaLR === null, thetaSw === null]

  let zeroAngle: ZeroAngle = 'NONE'
  let numAngles = 4
  if (isNull[0]) { numAngles--; zeroAngle = 'TW' }
  if (isNull[1]) { numAngles--; zeroAngle = 'FB' }
  if (isNull[2]) { numAngles--; zeroAngle = 'LR' }
  if (isNull[3]) { numAngles--; zeroAngle = 'SW' }

  if (numAngles === 0) {
    return [0.0, 0.0, 0.0, 0.0]
  }

  const targetAngles = [targetTw, targetFB, targetLR, targetSw]

  // With fewer than 3 angles, 2*pi-shifting (per channel) is the only option.
  if (numAngles < 3) {
    const vals = _piShift(targetAngles, [w[0]!, w[1]!, w[2]!, w[3]!])
    return finalize(vals, isNull)
  }

  const numVals = numAngles === 4 ? 4 : 2

  // Each angle flipped by pi in the min-abs direction.
  const thetaTwp = w[0]! + (w[0]! > 0 ? -M_PI : M_PI)
  const thetaFBp = w[1]! + (w[1]! > 0 ? -M_PI : M_PI)
  const thetaLRp = w[2]! + (w[2]! > 0 ? -M_PI : M_PI)
  const thetaSwp = w[3]! + (w[3]! > 0 ? -M_PI : M_PI)
  const Tw = w[0]!, FB = w[1]!, LR = w[2]!, Sw = w[3]!

  const vals: number[][] = [[], [], [], []]
  // 0 - do nothing.
  vals[0] = [Tw, FB, LR, Sw]

  switch (zeroAngle) {
    case 'TW':
      // 1 - transform last 3
      vals[1] = [Tw, thetaFBp, -thetaLRp, thetaSwp]
      break
    case 'FB':
    case 'LR':
      // 1 - 1 & 3 composed
      vals[1] = [thetaTwp, -FB, -LR, thetaSwp]
      break
    case 'SW':
      // 1 - transform 1st 3
      vals[1] = [thetaTwp, -thetaFBp, thetaLRp, Sw]
      break
    case 'NONE':
      // 1 - transform 1st 3; 2 - 1 & 3 composed; 3 - transform last 3
      vals[1] = [thetaTwp, -thetaFBp, thetaLRp, Sw]
      vals[2] = [thetaTwp, -FB, -LR, thetaSwp]
      vals[3] = [Tw, thetaFBp, -thetaLRp, thetaSwp]
      break
  }

  for (let i = 0; i < numVals; i++) {
    vals[i] = _piShift(targetAngles, vals[i]!)
  }

  // Pick the candidate that minimizes the sum of abs differences with targets.
  let min = 0
  let mini = -1
  for (let i = 0; i < numVals; i++) {
    let sum = 0.0
    for (let j = 0; j < 4; j++) sum += Math.abs(vals[i]![j]! - targetAngles[j]!)
    if (i === 0 || sum < min) {
      min = sum
      mini = i
    }
  }

  return finalize(vals[mini]!, isNull)
}

// Install the answer, but a null channel is always returned as 0.0 (its
// untouched binding init value), regardless of any standin computation.
function finalize(
  vals: number[],
  isNull: boolean[],
): [number, number, number, number] {
  return [
    isNull[0] ? 0.0 : vals[0]!,
    isNull[1] ? 0.0 : vals[1]!,
    isNull[2] ? 0.0 : vals[2]!,
    isNull[3] ? 0.0 : vals[3]!,
  ]
}

// ---------------------------------------------------------------------------
// GfRotation::DecomposeRotation
// ---------------------------------------------------------------------------

/** Options for {@link GfDecomposeRotation}. A `null` hint zeroes that channel
 * (the upstream nullptr output); a number is the initial value, used as a hint
 * iff `useHint` is true. `swShift` (radians) is a Sw applied after the rotation
 * matrix for a best-fit four-angle decomposition; ignored unless decomposing
 * into all four angles. */
export interface GfDecomposeRotationOpts {
  thetaTwHint: number | null
  thetaFBHint: number | null
  thetaLRHint: number | null
  thetaSwHint: number | null
  useHint?: boolean
  swShift?: number | null
}

/**
 * GfRotation::DecomposeRotation — decompose `rot` into Tw/FB/LR/Sw angles
 * (radians) about the supplied axes. Mirrors the Python binding
 * `Gf.Rotation.DecomposeRotation`: returns the 4-tuple [thetaTw, thetaFB,
 * thetaLR, thetaSw]; a `null` hint selects the angle to zero out (only three of
 * the four are solved). Axes must be normalized. `handedness` is -1.0 or 1.0.
 */
export function GfDecomposeRotation(
  rot: GfMatrix4d,
  twAxis: GfVec3d,
  fbAxis: GfVec3d,
  lrAxis: GfVec3d,
  handedness: number,
  opts: GfDecomposeRotationOpts,
): [number, number, number, number] {
  const useHint = opts.useHint ?? false
  const swShift = opts.swShift ?? null

  // Determine the zeroed angle from which hint is null (mirrors the binding,
  // which passes nullptr for None hints). The C++ raises a coding error for
  // more than one nullptr; the suite never does that, but we keep to one.
  const isNull = [
    opts.thetaTwHint === null,
    opts.thetaFBHint === null,
    opts.thetaLRHint === null,
    opts.thetaSwHint === null,
  ]
  let zeroAngle: ZeroAngle = 'NONE'
  if (isNull[0]) zeroAngle = 'TW'
  else if (isNull[1]) zeroAngle = 'FB'
  else if (isNull[2]) zeroAngle = 'LR'
  else if (isNull[3]) zeroAngle = 'SW'

  // Working angle values; null channels start at 0.0 (the binding's init).
  let thetaTw = opts.thetaTwHint ?? 0.0
  let thetaFB = opts.thetaFBHint ?? 0.0
  let thetaLR = opts.thetaLRHint ?? 0.0
  let thetaSw = opts.thetaSwHint ?? 0.0

  // Hints are the current values iff useHint.
  const hintTw = useHint ? thetaTw : 0.0
  const hintFB = useHint ? thetaFB : 0.0
  const hintLR = useHint ? thetaLR : 0.0
  const hintSw = useHint ? thetaSw : 0.0

  // Apply the matrix to the axes.
  const FBAxisR = rot.transformDir(fbAxis) as GfVec3d
  const TwAxisR = rot.transformDir(twAxis) as GfVec3d

  // Three rotates about the euler axes, in reverse order, bringing the
  // transformed axes back onto the originals. `r` accumulates as GfMatrix4d.
  let r = new GfMatrix4d(1)
  const td = (v: GfVec3d): GfVec3d => r.transformDir(v) as GfVec3d

  switch (zeroAngle) {
    case 'SW':
    case 'NONE': {
      let step = _rotateOntoProjected(td(TwAxisR), twAxis, lrAxis)
      r = r.getMultiply(step.mat); thetaLR = step.theta
      step = _rotateOntoProjected(td(TwAxisR), twAxis, fbAxis)
      r = r.getMultiply(step.mat); thetaFB = step.theta
      step = _rotateOntoProjected(td(FBAxisR), fbAxis, twAxis)
      r = r.getMultiply(step.mat); thetaTw = step.theta
      thetaFB *= -handedness
      thetaLR *= -handedness
      thetaTw *= -handedness
      // Sw is the swing shift if provided, otherwise zeroed.
      thetaSw = swShift !== null ? swShift : 0.0
      break
    }
    case 'TW': {
      let step = _rotateOntoProjected(td(FBAxisR), fbAxis, twAxis)
      r = r.getMultiply(step.mat); thetaSw = step.theta
      step = _rotateOntoProjected(td(FBAxisR), fbAxis, lrAxis)
      r = r.getMultiply(step.mat); thetaLR = step.theta
      step = _rotateOntoProjected(td(TwAxisR), twAxis, fbAxis)
      r = r.getMultiply(step.mat); thetaFB = step.theta
      thetaSw *= -handedness
      thetaFB *= -handedness
      thetaLR *= -handedness
      break
    }
    case 'FB': {
      let step = _rotateOntoProjected(td(TwAxisR), fbAxis, twAxis)
      r = r.getMultiply(step.mat); thetaSw = step.theta
      step = _rotateOntoProjected(td(TwAxisR), twAxis, lrAxis)
      r = r.getMultiply(step.mat); thetaLR = step.theta
      step = _rotateOntoProjected(td(FBAxisR), fbAxis, twAxis)
      r = r.getMultiply(step.mat); thetaTw = step.theta
      thetaSw *= -handedness
      thetaLR *= -handedness
      thetaTw *= -handedness
      break
    }
    case 'LR': {
      let step = _rotateOntoProjected(td(TwAxisR), lrAxis, twAxis)
      r = r.getMultiply(step.mat); thetaSw = step.theta
      step = _rotateOntoProjected(td(TwAxisR), twAxis, fbAxis)
      r = r.getMultiply(step.mat); thetaFB = step.theta
      step = _rotateOntoProjected(td(FBAxisR), fbAxis, twAxis)
      r = r.getMultiply(step.mat); thetaTw = step.theta
      thetaSw *= -handedness
      thetaFB *= -handedness
      thetaTw *= -handedness
      break
    }
  }

  // The decomposition isn't unique. Find the closest rotation to the hints.
  const matched = GfMatchClosestEulerRotation(
    hintTw, hintFB, hintLR, hintSw,
    zeroAngle === 'TW' ? null : thetaTw,
    zeroAngle === 'FB' ? null : thetaFB,
    zeroAngle === 'LR' ? null : thetaLR,
    zeroAngle === 'SW' ? null : thetaSw,
  )
  thetaTw = matched[0]; thetaFB = matched[1]; thetaLR = matched[2]; thetaSw = matched[3]

  // Gimbal-lock disambiguation: when the middle angle collapses the first and
  // last axes onto each other (PI/2 etc.), only their sum or difference is
  // significant — apply the min-sum-of-abs rule again. The shift of fb/lr by
  // +/-PI/2 depends on the handedness of the (Tw,FB,LR) basis.
  const basis = new GfMatrix3d()
  basis.setRow(0, twAxis)
  basis.setRow(1, fbAxis)
  basis.setRow(2, lrAxis)
  const h = basis.getHandedness()
  switch (zeroAngle) {
    case 'NONE':
    case 'SW': {
      const [a, b] = _shiftGimbalLock(thetaFB + (M_PI / 2) * h, thetaTw, thetaLR)
      thetaTw = a; thetaLR = b
      break
    }
    case 'TW': {
      const [a, b] = _shiftGimbalLock(thetaLR + (M_PI / 2) * h, thetaFB, thetaSw)
      thetaFB = a; thetaSw = b
      break
    }
    case 'FB': {
      const [a, b] = _shiftGimbalLock(thetaLR, thetaTw, thetaSw)
      thetaTw = a; thetaSw = b
      break
    }
    case 'LR': {
      const [a, b] = _shiftGimbalLock(thetaFB, thetaTw, thetaSw)
      thetaTw = a; thetaSw = b
      break
    }
  }

  // Null channels are returned as 0.0 (their untouched binding init value).
  return [
    isNull[0] ? 0.0 : thetaTw,
    isNull[1] ? 0.0 : thetaFB,
    isNull[2] ? 0.0 : thetaLR,
    isNull[3] ? 0.0 : thetaSw,
  ]
}

/**
 * GfRotation::DecomposeRotation3 — three-angle convenience that zeroes Sw.
 * Mirrors the Python binding `DecomposeRotation3`: identical to
 * {@link GfDecomposeRotation} with `thetaSwHint = null`, returning the 3-tuple
 * [thetaTw, thetaFB, thetaLR]. Hints default to 0 and `useHint` to false.
 */
export function GfDecomposeRotation3(
  rot: GfMatrix4d,
  twAxis: GfVec3d,
  fbAxis: GfVec3d,
  lrAxis: GfVec3d,
  handedness: number,
  thetaTwHint = 0.0,
  thetaFBHint = 0.0,
  thetaLRHint = 0.0,
  useHint = false,
): [number, number, number] {
  const [tw, fb, lr] = GfDecomposeRotation(rot, twAxis, fbAxis, lrAxis, handedness, {
    thetaTwHint,
    thetaFBHint,
    thetaLRHint,
    thetaSwHint: null,
    useHint,
  })
  return [tw, fb, lr]
}
