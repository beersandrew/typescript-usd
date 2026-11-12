// Ported from OpenVDB 10.1.0: openvdb/openvdb/math/Mat4.h,
//  openvdb/openvdb/math/Mat3.h, openvdb/openvdb/math/Mat.h,
//  openvdb/openvdb/math/Vec3.h, openvdb/openvdb/math/Math.h,
//  openvdb/openvdb/math/BBox.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This Source Code Form is subject to the terms of the Mozilla Public License,
//  v. 2.0. If a copy of the MPL was not distributed with this file, You can
//  obtain one at https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of the parts of openvdb/math/Mat4.h, Mat3.h, Mat.h, Vec3.h and
// Math.h that tools/GridTransformer.h and math/Maps.h use, from OpenVDB
// 10.1.0 (the version OpenUSD 26.11.1's reference build links).
//
// Matrices are row-major arrays of doubles (Mat4d: 16, Mat3d: 9) in
// OpenVDB's row-vector convention (v' = v * M, translation in elements
// 12..14). Every expression keeps upstream's operation order and rounds
// each operation to double. The native library is compiled by clang with
// its default -ffp-contract=on, which may fuse a multiply and an add into
// one fma; for scale/translate (diagonal) matrices every fused product is
// exact or added to zero, so results agree bit for bit, but for matrices
// with rotation a fused sum can differ from this port in the last bit.

import type { Vec3 } from '@vdb/nanovdb'

export type Mat4d = number[]
export type Mat3d = number[]

// math/Math.h:148-150 Tolerance<float> = 1e-8f, Tolerance<double> = 1e-15
export const TOLERANCE_DOUBLE = 1e-15
export const TOLERANCE_FLOAT = Math.fround(1e-8)

/** math/Math.h:406-409 isApproxEqual(a, b, tolerance): !(|a - b| > tolerance) */
export function isApproxEqual(a: number, b: number, tolerance: number): boolean {
  return !(Math.abs(a - b) > tolerance)
}

/** math/Math.h:453-468 isRelOrApproxEqual */
export function isRelOrApproxEqual(a: number, b: number, absTol: number, relTol: number): boolean {
  if (!(Math.abs(a - b) > absTol)) return true
  let relError: number
  if (Math.abs(b) > Math.abs(a)) {
    relError = Math.abs((a - b) / b)
  } else {
    relError = Math.abs((a - b) / a)
  }
  return relError <= relTol
}

/** math/Vec3.h:133-138 Vec3::eq(v, eps = 1e-7) */
export function vec3Eq(a: Vec3, b: Vec3, eps = 1.0e-7): boolean {
  return (
    isRelOrApproxEqual(a[0], b[0], eps, eps) &&
    isRelOrApproxEqual(a[1], b[1], eps, eps) &&
    isRelOrApproxEqual(a[2], b[2], eps, eps)
  )
}

/** math/Vec3.h:200-206 Vec3::length */
export function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}

export function mat4Identity(): Mat4d {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

/** math/Mat.h:615-627 scale<Mat4d>(s) */
export function mat4Scale(s: Vec3): Mat4d {
  const m = mat4Identity()
  m[0] = s[0]
  m[5] = s[1]
  m[10] = s[2]
  return m
}

/** math/Mat4.h:667-674 Mat4::translation(v) */
export function mat4Translation(v: Vec3): Mat4d {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1]
}

/** math/Mat4.h:439-469 Mat4::operator*= (m0 * m1) */
export function mat4Mul(s0: Mat4d, s1: Mat4d): Mat4d {
  const out = new Array<number>(16)
  for (let i = 0; i < 4; i++) {
    const i4 = 4 * i
    const a0 = s0[i4]!, a1 = s0[i4 + 1]!, a2 = s0[i4 + 2]!, a3 = s0[i4 + 3]!
    out[i4] = a0 * s1[0]! + a1 * s1[4]! + a2 * s1[8]! + a3 * s1[12]!
    out[i4 + 1] = a0 * s1[1]! + a1 * s1[5]! + a2 * s1[9]! + a3 * s1[13]!
    out[i4 + 2] = a0 * s1[2]! + a1 * s1[6]! + a2 * s1[10]! + a3 * s1[14]!
    out[i4 + 3] = a0 * s1[3]! + a1 * s1[7]! + a2 * s1[11]! + a3 * s1[15]!
  }
  return out
}

/** math/Mat4.h:297-306 getMat3 */
export function mat4GetMat3(m: Mat4d): Mat3d {
  return [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!]
}

/** math/Mat4.h:309-312 getTranslation */
export function mat4GetTranslation(m: Mat4d): Vec3 {
  return [m[12]!, m[13]!, m[14]!]
}

/** math/Mat4.h:314-319 setTranslation (in place) */
export function mat4SetTranslation(m: Mat4d, t: Vec3): void {
  m[12] = t[0]
  m[13] = t[1]
  m[14] = t[2]
}

/** math/Mat4.h:333-340 Mat4::eq(m, eps = 1e-8) */
export function mat4Eq(a: Mat4d, b: Mat4d, eps = 1.0e-8): boolean {
  for (let i = 0; i < 16; i++) if (!isApproxEqual(a[i]!, b[i]!, eps)) return false
  return true
}

/** math/Mat4.h:1304-1306 isAffine: column 3 == (0, 0, 0, 1) exactly */
export function mat4IsAffine(m: Mat4d): boolean {
  return m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1
}

/** math/Mat.h:900-914 isDiagonal (Mat3 or Mat4, by size) */
export function isDiagonal(m: number[]): boolean {
  const n = m.length === 16 ? 4 : 3
  let temp = 0
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < n; ++j) {
      if (i !== j) temp += Math.abs(m[i * n + j]!)
    }
  }
  return isApproxEqual(temp, 0.0, TOLERANCE_DOUBLE)
}

/** math/Mat.h:858-863 isIdentity: m.eq(identity) */
export function mat4IsIdentity(m: Mat4d): boolean {
  return mat4Eq(m, mat4Identity())
}

/** math/Mat4.h:1177-1186 operator*(Vec3, Mat4): v * M (applies translation) */
export function vec3MulMat4(v: Vec3, m: Mat4d): Vec3 {
  return [
    v[0] * m[0]! + v[1] * m[4]! + v[2] * m[8]! + m[12]!,
    v[0] * m[1]! + v[1] * m[5]! + v[2] * m[9]! + m[13]!,
    v[0] * m[2]! + v[1] * m[6]! + v[2] * m[10]! + m[14]!,
  ]
}

/** math/Mat4.h:1025-1043 Mat4::transformH (homogeneous divide) */
export function mat4TransformH(m: Mat4d, p: Vec3): Vec3 {
  const w = p[0] * m[3]! + p[1] * m[7]! + p[2] * m[11]! + m[15]!
  if (w !== 0) {
    return [
      (p[0] * m[0]! + p[1] * m[4]! + p[2] * m[8]! + m[12]!) / w,
      (p[0] * m[1]! + p[1] * m[5]! + p[2] * m[9]! + m[13]!) / w,
      (p[0] * m[2]! + p[1] * m[6]! + p[2] * m[10]! + m[14]!) / w,
    ]
  }
  return [0, 0, 0]
}

/** math/Mat4.h:701-709 preTranslate: m = Translation(tr) * m */
export function mat4PreTranslate(m: Mat4d, tr: Vec3): Mat4d {
  return mat4Mul(mat4Translation(tr), m)
}

/** math/Mat4.h:734-753 preScale (in place): rows 0..2 scaled by v */
export function mat4PreScale(m: Mat4d, v: Vec3): void {
  for (let i = 0; i < 4; i++) {
    m[i] = m[i]! * v[0]
    m[4 + i] = m[4 + i]! * v[1]
    m[8 + i] = m[8 + i]! * v[2]
  }
}

export enum Axis {
  X = 0,
  Y = 1,
  Z = 2,
}

/** math/Mat4.h:798-871 preRotate (in place), clockwise about axis */
export function mat4PreRotate(m: Mat4d, axis: Axis, angle: number): void {
  const c = Math.cos(angle)
  const s = -Math.sin(angle) // the "-" makes it clockwise
  switch (axis) {
    case Axis.X: {
      const a4 = c * m[4]! - s * m[8]!
      const a5 = c * m[5]! - s * m[9]!
      const a6 = c * m[6]! - s * m[10]!
      const a7 = c * m[7]! - s * m[11]!
      m[8] = s * m[4]! + c * m[8]!
      m[9] = s * m[5]! + c * m[9]!
      m[10] = s * m[6]! + c * m[10]!
      m[11] = s * m[7]! + c * m[11]!
      m[4] = a4
      m[5] = a5
      m[6] = a6
      m[7] = a7
      break
    }
    case Axis.Y: {
      const a0 = c * m[0]! + s * m[8]!
      const a1 = c * m[1]! + s * m[9]!
      const a2 = c * m[2]! + s * m[10]!
      const a3 = c * m[3]! + s * m[11]!
      m[8] = -s * m[0]! + c * m[8]!
      m[9] = -s * m[1]! + c * m[9]!
      m[10] = -s * m[2]! + c * m[10]!
      m[11] = -s * m[3]! + c * m[11]!
      m[0] = a0
      m[1] = a1
      m[2] = a2
      m[3] = a3
      break
    }
    case Axis.Z: {
      const a0 = c * m[0]! - s * m[4]!
      const a1 = c * m[1]! - s * m[5]!
      const a2 = c * m[2]! - s * m[6]!
      const a3 = c * m[3]! - s * m[7]!
      m[4] = s * m[0]! + c * m[4]!
      m[5] = s * m[1]! + c * m[5]!
      m[6] = s * m[2]! + c * m[6]!
      m[7] = s * m[3]! + c * m[7]!
      m[0] = a0
      m[1] = a1
      m[2] = a2
      m[3] = a3
      break
    }
  }
}

/**
 * math/Mat4.h:485-604 Mat4::inverse(tolerance = 0). The perspective branch
 * (column 3 != (0, 0, 0, 1)) is not ported: every matrix inverted here is
 * affine (AffineMap rejects others), and it throws instead.
 */
export function mat4Inverse(mm: Mat4d, tolerance = 0): Mat4d {
  const m = (i: number, j: number): number => mm[i * 4 + j]!
  const m0011 = m(0, 0) * m(1, 1)
  const m0012 = m(0, 0) * m(1, 2)
  const m0110 = m(0, 1) * m(1, 0)
  const m0210 = m(0, 2) * m(1, 0)
  const m0120 = m(0, 1) * m(2, 0)
  const m0220 = m(0, 2) * m(2, 0)

  let detA =
    m0011 * m(2, 2) - m0012 * m(2, 1) - m0110 * m(2, 2) + m0210 * m(2, 1) + m0120 * m(1, 2) - m0220 * m(1, 1)

  const hasPerspective = m(0, 3) !== 0 || m(1, 3) !== 0 || m(2, 3) !== 0 || m(3, 3) !== 1
  if (hasPerspective) throw new Error('Mat4 inverse of a perspective matrix is not ported')
  const det = detA * m(3, 3)

  if (isApproxEqual(det, 0.0, tolerance)) throw new Error('Inversion of singular 4x4 matrix')
  if (isApproxEqual(detA, 0.0, 1e-8)) {
    // det is too small to rely on inversion by subblocks
    const inv = mat4Identity()
    if (!mat4Invert(mm, inv, tolerance)) throw new Error('Inversion of singular 4x4 matrix')
    return inv
  }
  detA = 1.0 / detA
  const inv = new Array<number>(16).fill(0)
  inv[0] = detA * (m(1, 1) * m(2, 2) - m(1, 2) * m(2, 1))
  inv[1] = detA * (-m(0, 1) * m(2, 2) + m(0, 2) * m(2, 1))
  inv[2] = detA * (m(0, 1) * m(1, 2) - m(0, 2) * m(1, 1))

  inv[4] = detA * (-m(1, 0) * m(2, 2) + m(1, 2) * m(2, 0))
  inv[5] = detA * (m(0, 0) * m(2, 2) - m0220)
  inv[6] = detA * (m0210 - m0012)

  inv[8] = detA * (m(1, 0) * m(2, 1) - m(1, 1) * m(2, 0))
  inv[9] = detA * (m0120 - m(0, 0) * m(2, 1))
  inv[10] = detA * (m0011 - m0110)

  // Equations are much simpler in the non-perspective case
  inv[12] = -(m(3, 0) * inv[0]! + m(3, 1) * inv[4]! + m(3, 2) * inv[8]!)
  inv[13] = -(m(3, 0) * inv[1]! + m(3, 1) * inv[5]! + m(3, 2) * inv[9]!)
  inv[14] = -(m(3, 0) * inv[2]! + m(3, 1) * inv[6]! + m(3, 2) * inv[10]!)
  inv[3] = 0.0
  inv[7] = 0.0
  inv[11] = 0.0
  inv[15] = 1.0
  return inv
}

/** math/Mat4.h:1236-1300 Mat4::invert: Gauss-Jordan elimination into `inverse` */
export function mat4Invert(mm: Mat4d, inverse: Mat4d, tolerance: number): boolean {
  const temp = [...mm]
  for (let i = 0; i < 16; i++) inverse[i] = i % 5 === 0 ? 1 : 0
  let det = 1.0
  for (let i = 0; i < 4; ++i) {
    let row = i
    let max = Math.abs(temp[i * 4 + i]!)
    for (let k = i + 1; k < 4; ++k) {
      if (Math.abs(temp[k * 4 + i]!) > max) {
        row = k
        max = Math.abs(temp[k * 4 + i]!)
      }
    }
    if (max === 0.0) return false
    // must move pivot to row i
    if (row !== i) {
      det = -det
      for (let k = 0; k < 4; ++k) {
        let t = temp[row * 4 + k]!
        temp[row * 4 + k] = temp[i * 4 + k]!
        temp[i * 4 + k] = t
        t = inverse[row * 4 + k]!
        inverse[row * 4 + k] = inverse[i * 4 + k]!
        inverse[i * 4 + k] = t
      }
    }
    const pivot = temp[i * 4 + i]!
    det *= pivot
    // scale row i
    for (let k = 0; k < 4; ++k) {
      temp[i * 4 + k] = temp[i * 4 + k]! / pivot
      inverse[i * 4 + k] = inverse[i * 4 + k]! / pivot
    }
    // eliminate in rows below i
    for (let j = i + 1; j < 4; ++j) {
      const t = temp[j * 4 + i]!
      if (t !== 0.0) {
        for (let k = 0; k < 4; ++k) {
          temp[j * 4 + k] = temp[j * 4 + k]! - temp[i * 4 + k]! * t
          inverse[j * 4 + k] = inverse[j * 4 + k]! - inverse[i * 4 + k]! * t
        }
      }
    }
  }
  // Backward elimination step
  for (let i = 3; i > 0; --i) {
    for (let j = 0; j < i; ++j) {
      const t = temp[j * 4 + i]!
      if (t !== 0.0) {
        for (let k = 0; k < 4; ++k) {
          inverse[j * 4 + k] = inverse[j * 4 + k]! - inverse[i * 4 + k]! * t
        }
      }
    }
  }
  return det * det >= tolerance * tolerance
}

// ---- Mat3d ----

/** math/Mat.h:615-627 scale<Mat3d>(s) */
export function mat3Scale(s: Vec3): Mat3d {
  return [s[0], 0, 0, 0, s[1], 0, 0, 0, s[2]]
}

/** math/Mat3.h:383-420 Mat3::operator*= (m0 * m1) */
export function mat3Mul(s0: Mat3d, s1: Mat3d): Mat3d {
  const out = new Array<number>(9)
  for (let i = 0; i < 3; i++) {
    const i3 = 3 * i
    for (let j = 0; j < 3; j++) {
      out[i3 + j] = s0[i3]! * s1[j]! + s0[i3 + 1]! * s1[3 + j]! + s0[i3 + 2]! * s1[6 + j]!
    }
  }
  return out
}

/** math/Mat3.h:438-451 adjoint */
function mat3Adjoint(m: Mat3d): Mat3d {
  return [
    m[4]! * m[8]! - m[5]! * m[7]!,
    m[2]! * m[7]! - m[1]! * m[8]!,
    m[1]! * m[5]! - m[2]! * m[4]!,
    m[5]! * m[6]! - m[3]! * m[8]!,
    m[0]! * m[8]! - m[2]! * m[6]!,
    m[2]! * m[3]! - m[0]! * m[5]!,
    m[3]! * m[7]! - m[4]! * m[6]!,
    m[1]! * m[6]! - m[0]! * m[7]!,
    m[0]! * m[4]! - m[1]! * m[3]!,
  ]
}

/** math/Mat3.h:465-476 Mat3::inverse(tolerance = 0): adjoint * (1 / det) */
export function mat3Inverse(m: Mat3d, tolerance = 0): Mat3d {
  const inv = mat3Adjoint(m)
  const det = inv[0]! * m[0]! + inv[1]! * m[3]! + inv[2]! * m[6]!
  if (isApproxEqual(det, 0.0, tolerance)) throw new Error('Inversion of singular 3x3 matrix')
  const r = 1 / det
  return inv.map((v) => v * r)
}

/** math/Mat3.h:479-485 Mat3::det */
export function mat3Det(m: Mat3d): number {
  const co00 = m[4]! * m[8]! - m[5]! * m[7]!
  const co10 = m[5]! * m[6]! - m[3]! * m[8]!
  const co20 = m[3]! * m[7]! - m[4]! * m[6]!
  return m[0]! * co00 + m[1]! * co10 + m[2]! * co20
}

/** math/Mat3.h:301-312 Mat3::eq(m, eps = 1e-8) */
export function mat3Eq(a: Mat3d, b: Mat3d, eps = 1.0e-8): boolean {
  for (let i = 0; i < 9; i++) if (!isApproxEqual(a[i]!, b[i]!, eps)) return false
  return true
}

/** math/Mat3.h:619-627 operator*(Vec3, Mat3): v * M */
export function vec3MulMat3(v: Vec3, m: Mat3d): Vec3 {
  return [
    v[0] * m[0]! + v[1] * m[3]! + v[2] * m[6]!,
    v[0] * m[1]! + v[1] * m[4]! + v[2] * m[7]!,
    v[0] * m[2]! + v[1] * m[5]! + v[2] * m[8]!,
  ]
}

/** math/Mat.h:249-291 rotation<Mat3d>(axis, angle) about an arbitrary axis */
export function mat3RotationAxis(axisIn: Vec3, angle: number): Mat3d {
  // Vec3::unit (math/Vec3.h:374-388)
  const len = vec3Length(axisIn)
  if (isApproxEqual(len, 0, 0)) throw new Error('Normalizing null 3-vector')
  const axis: Vec3 = [axisIn[0] / len, axisIn[1] / len, axisIn[2] / len]
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  const r = new Array<number>(9)
  r[0] = axis[0] * axis[0] * t + c
  r[4] = axis[1] * axis[1] * t + c
  r[8] = axis[2] * axis[2] * t + c
  const txy = axis[0] * axis[1] * t
  const sz = axis[2] * s
  const txz = axis[0] * axis[2] * t
  const sy = axis[1] * s
  const tyz = axis[1] * axis[2] * t
  const sx = axis[0] * s
  r[1] = txy + sz
  r[3] = txy - sz
  r[2] = txz - sy
  r[6] = txz + sy
  r[5] = tyz + sx
  r[7] = tyz - sx
  return r
}

/** math/Mat.h:333-360 eulerAngles(mat, XYZ_ROTATION, eps = 1e-8) */
export function eulerAnglesXYZ(m: Mat3d, eps = 1.0e-8): Vec3 {
  const at = (i: number, j: number): number => m[i * 3 + j]!
  let phi: number, theta: number, psi: number
  if (isApproxEqual(at(2, 0), 1.0, eps)) {
    theta = Math.PI / 2.0
    phi = 0.5 * Math.atan2(at(1, 2), at(1, 1))
    psi = phi
  } else if (isApproxEqual(at(2, 0), -1.0, eps)) {
    theta = -Math.PI / 2.0
    phi = 0.5 * Math.atan2(at(1, 2), at(1, 1))
    psi = -phi
  } else {
    psi = Math.atan2(-at(1, 0), at(0, 0))
    phi = Math.atan2(-at(2, 1), at(2, 2))
    theta = Math.atan2(at(2, 0), Math.sqrt(at(2, 1) * at(2, 1) + at(2, 2) * at(2, 2)))
  }
  return [phi, theta, psi]
}
