// typescript-usd/gf — base/gf matrix math.
//
// Row-major 4x4 matrix math, row-vector convention (v' = v * M).
// Matches GfMatrix4d storage and composition semantics.
// Translation lives in the last row: M[12]=tx, M[13]=ty, M[14]=tz.
//
// The first-class GfMatrix/GfVec/GfQuat value types live in matrixData.ts,
// vec.ts, and quaternion.ts. These tuple helpers remain internal execution
// seams for row-vector algorithms and existing rendering consumers.

export type Matrix4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

export const IDENTITY_MATRIX: Matrix4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export function mul4(a: Matrix4, b: Matrix4): Matrix4 {
  const r = new Array(16) as Matrix4
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      r[row * 4 + col] =
        a[row * 4 + 0]! * b[col]! +
        a[row * 4 + 1]! * b[4 + col]! +
        a[row * 4 + 2]! * b[8 + col]! +
        a[row * 4 + 3]! * b[12 + col]!
    }
  }
  return r
}

export function makeTranslate(tx: number, ty: number, tz: number): Matrix4 {
  return [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  tx, ty, tz, 1]
}

export function makeScale(sx: number, sy: number, sz: number): Matrix4 {
  return [sx, 0, 0, 0,  0, sy, 0, 0,  0, 0, sz, 0,  0, 0, 0, 1]
}

export function makeRotateX(deg: number): Matrix4 {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  // Row-vector: v' = v * M, rotX gives v'y = vy*c - vz*s, v'z = vy*s + vz*c
  return [1, 0,  0, 0,   0, c,  s, 0,   0, -s, c, 0,   0, 0, 0, 1]
}

export function makeRotateY(deg: number): Matrix4 {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  // v'x = vx*c + vz*s, v'z = -vx*s + vz*c
  return [c, 0, -s, 0,   0, 1, 0, 0,   s, 0, c, 0,   0, 0, 0, 1]
}

export function makeRotateZ(deg: number): Matrix4 {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  // v'x = vx*c - vy*s, v'y = vx*s + vy*c
  return [c, s, 0, 0,   -s, c, 0, 0,   0, 0, 1, 0,   0, 0, 0, 1]
}

// Unit quaternion (w,x,y,z) → row-vector rotation matrix (= transpose of col-vec formula)
export function quatToMatrix(w: number, x: number, y: number, z: number): Matrix4 {
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return [
    1 - (yy + zz),   xy + wz,          xz - wy,          0,
    xy - wz,         1 - (xx + zz),    yz + wx,          0,
    xz + wy,         yz - wx,          1 - (xx + yy),    0,
    0,               0,                0,                 1,
  ]
}

// FLT_MAX (the 32-bit float maximum) — upstream's singular-matrix fill value.
const GF_FLT_MAX = 3.4028234663852886e38

// General 4x4 matrix inverse.
//
// Ports GfMatrix4d::GetInverse (matrix4.template.cpp) verbatim: 2x2 sub-
// determinants → 3x3 cofactors → 4x4 determinant by cofactor expansion, then
// the transposed cofactors over the determinant. Keeping the exact operation
// order (vs. a generic Gauss-Jordan) preserves upstream's floating-point
// rounding.
//
// Singularity follows upstream's invariant, not a pivot heuristic: when
// |det| <= eps (default eps=0, i.e. only an exactly-zero determinant) the
// result is GfMatrix4d::SetScale(FLT_MAX) — diagonal FLT_MAX with [3][3]=1 —
// NOT the identity. A FLT_MAX-scaled result makes a non-invertible matrix
// loudly wrong downstream; identity silently masquerades as invertible.
export function invertMatrix4(m: Matrix4, eps = 0): Matrix4 {
  // First two columns.
  const x00 = m[0], x01 = m[1]
  const x10 = m[4], x11 = m[5]
  const x20 = m[8], x21 = m[9]
  const x30 = m[12], x31 = m[13]

  // Six 2x2 determinants of the first two columns.
  let y01 = x00 * x11 - x10 * x01
  let y02 = x00 * x21 - x20 * x01
  let y03 = x00 * x31 - x30 * x01
  let y12 = x10 * x21 - x20 * x11
  let y13 = x10 * x31 - x30 * x11
  let y23 = x20 * x31 - x30 * x21

  // Second two columns.
  const x02 = m[2], x03 = m[3]
  const x12 = m[6], x13 = m[7]
  const x22 = m[10], x23 = m[11]
  const x32 = m[14], x33 = m[15]

  // 3x3 cofactors for the second two columns.
  const z33 = x02 * y12 - x12 * y02 + x22 * y01
  const z23 = x12 * y03 - x32 * y01 - x02 * y13
  const z13 = x02 * y23 - x22 * y03 + x32 * y02
  const z03 = x22 * y13 - x32 * y12 - x12 * y23
  const z32 = x13 * y02 - x23 * y01 - x03 * y12
  const z22 = x03 * y13 - x13 * y03 + x33 * y01
  const z12 = x23 * y03 - x33 * y02 - x03 * y23
  const z02 = x13 * y23 - x23 * y13 + x33 * y12

  // Six 2x2 determinants of the second two columns.
  y01 = x02 * x13 - x12 * x03
  y02 = x02 * x23 - x22 * x03
  y03 = x02 * x33 - x32 * x03
  y12 = x12 * x23 - x22 * x13
  y13 = x12 * x33 - x32 * x13
  y23 = x22 * x33 - x32 * x23

  // 3x3 cofactors for the first two columns.
  const z30 = x11 * y02 - x21 * y01 - x01 * y12
  const z20 = x01 * y13 - x11 * y03 + x31 * y01
  const z10 = x21 * y03 - x31 * y02 - x01 * y23
  const z00 = x11 * y23 - x21 * y13 + x31 * y12
  const z31 = x00 * y12 - x10 * y02 + x20 * y01
  const z21 = x10 * y03 - x30 * y01 - x00 * y13
  const z11 = x00 * y23 - x20 * y03 + x30 * y02
  const z01 = x20 * y13 - x30 * y12 - x10 * y23

  // 4x4 determinant by cofactor expansion of the first column.
  const det = x30 * z30 + x20 * z20 + x10 * z10 + x00 * z00

  if (Math.abs(det) > eps) {
    const rcp = 1.0 / det
    // Multiply all 3x3 cofactors by the reciprocal and transpose.
    return [
      z00 * rcp, z10 * rcp, z20 * rcp, z30 * rcp,
      z01 * rcp, z11 * rcp, z21 * rcp, z31 * rcp,
      z02 * rcp, z12 * rcp, z22 * rcp, z32 * rcp,
      z03 * rcp, z13 * rcp, z23 * rcp, z33 * rcp,
    ]
  }
  // Singular: SetScale(FLT_MAX) — diagonal FLT_MAX, [3][3] = 1.
  return [
    GF_FLT_MAX, 0, 0, 0,
    0, GF_FLT_MAX, 0, 0,
    0, 0, GF_FLT_MAX, 0,
    0, 0, 0, 1,
  ]
}

// Transform a point (row-vector: p' = p * M)
export function transformPoint(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  return [
    x * m[0] + y * m[4] + z * m[8]  + m[12],
    x * m[1] + y * m[5] + z * m[9]  + m[13],
    x * m[2] + y * m[6] + z * m[10] + m[14],
  ]
}
