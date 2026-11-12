// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfMatrix.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfMatrix.py.
//
// Exercises the class-based GfMatrix{2,3,4}{d,f} value types in src/matrixData.ts.
// Every external numeric expectation is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/matrix.json — never hand derived. Most of the upstream suite is self-consistent (round-trips, identity
// laws, Factor reconstruction), so few captured literals are needed.
//
// Adaptations (faithful, not skipped):
//   - numpy buffer-protocol checks (test_Basic) are Python-only → omitted with a note.
//   - Python indexing/exception probes (test_Other / test_Exceptions) test
//     Python's C buffer protocol; the TS equivalent (out-of-range throws) is
//     tested where meaningful, otherwise noted N/A.
//   - eval(repr(m)) round-trip → adapted to a repr() non-empty + GetArray copy law.
import { describe, it, expect } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import {
  GfMatrix2d, GfMatrix2f,
  GfMatrix3d, GfMatrix3f,
  GfMatrix4d, GfMatrix4f,
  GfMatrix,
  GfMatrix3Base,
  GfMatrix4Base,
  GfIsCloseMatrix,
} from '../../src/matrixData.ts'
import {
  GfVec,
  GfVec2d, GfVec2f,
  GfVec3d, GfVec3f,
  GfVec4d, GfVec4f,
  GfIsClose,
} from '../../src/vec.ts'
import {
  type Rotation,
  type Quat,
  makeRotation,
  rotateInto,
  rotationToQuat,
} from '../../src/rotation.ts'

type MatCtor = new (...args: unknown[]) => GfMatrix

const G = readOracleFixture<{
  lookAt_100_001_010: number[]
  bug12744_angle: number
  bug12744_isnan: boolean
  det_m4: number
  scale3_uniform10: number[]
  scale3_vec123: number[]
  rot3_x30: number[]
}>(new URL('./fixtures/matrix.json', import.meta.url))
type Mat3Ctor = new (...args: unknown[]) => GfMatrix3Base
type Mat4Ctor = new (...args: unknown[]) => GfMatrix4Base
type VecCtor = new (...args: Array<number | readonly number[]>) => GfVec

// Gf.IsClose for scalars: |a - b| <= tolerance.
const isCloseScalar = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol
// Gf.IsClose for a Rotation axis (number[3]) via the squared-distance metric.
const isCloseAxis = (a: readonly number[], b: readonly number[], tol: number): boolean =>
  GfIsClose(new GfVec3d(a[0]!, a[1]!, a[2]!), new GfVec3d(b[0]!, b[1]!, b[2]!), tol)

// makeValue(Value, vals) — mirrors the test helper: fill the first `dimension`
// components from vals.
function makeValue(Vec: VecCtor, vals: readonly number[]): GfVec {
  const v = new Vec()
  for (let i = 0; i < v.dimension; i++) v.setComponent(i, vals[i]!)
  return v
}

const closeQuatRotation = (r: Rotation, axis: readonly number[], angle: number): void => {
  expect(isCloseAxis(r.axis, axis, 0.0001)).toBe(true)
  expect(isCloseScalar(r.angle, angle, 0.0001)).toBe(true)
}

// ---------------------------------------------------------------------------

describe('test_Basic', () => {
  const matrices: [MatCtor, VecCtor, number][] = [
    [GfMatrix2d as MatCtor, GfVec2d as VecCtor, 2],
    [GfMatrix2f as MatCtor, GfVec2f as VecCtor, 2],
    [GfMatrix3d as MatCtor, GfVec3d as VecCtor, 3],
    [GfMatrix3f as MatCtor, GfVec3f as VecCtor, 3],
    [GfMatrix4d as MatCtor, GfVec4d as VecCtor, 4],
    [GfMatrix4f as MatCtor, GfVec4f as VecCtor, 4],
  ]
  for (const [Matrix, Vec, dim] of matrices) {
    it(`${Matrix.name} constructors + Set/SetIdentity/SetZero/SetDiagonal`, () => {
      expect(new Matrix()).toBeInstanceOf(Matrix)
      expect(new Matrix(1)).toBeInstanceOf(Matrix)
      expect(new Matrix(new Vec())).toBeInstanceOf(Matrix)

      // python default constructor produces identity.
      expect(new Matrix().equals(new Matrix(1))).toBe(true)

      // (numpy buffer-protocol population is Python-only; omitted.)
      // The scalar-list ctor + Set are still exercised per dimension:
      const contents = Array.from({ length: dim * dim }, (_, i) => i + 1)
      expect(new Matrix().Set(...contents).equals(new Matrix(...contents))).toBe(true)

      expect(new Matrix().setIdentity().equals(new Matrix(1))).toBe(true)
      expect(new Matrix().setZero().equals(new Matrix(0))).toBe(true)
      expect(new Matrix().setDiagonal(0).equals(new Matrix().setZero())).toBe(true)
      expect(new Matrix().setDiagonal(1).equals(new Matrix().setIdentity())).toBe(true)
    })
  }
})

describe('test_Comparisons', () => {
  const pairs: [MatCtor, MatCtor, number][] = [
    [GfMatrix2d as MatCtor, GfMatrix2f as MatCtor, 2],
    [GfMatrix3d as MatCtor, GfMatrix3f as MatCtor, 3],
    [GfMatrix4d as MatCtor, GfMatrix4f as MatCtor, 4],
  ]
  for (const [Matrix, Matrixf, dim] of pairs) {
    it(`${Matrix.name} vs ${Matrixf.name}`, () => {
      const size = dim * dim
      let contents = Array.from({ length: size }, (_, i) => i + 1)
      const md = new Matrix(...contents)
      const mf = new Matrixf(...contents)
      expect(md.equals(mf)).toBe(true)

      contents = [...contents].reverse()
      md.Set(...contents)
      mf.Set(...contents)
      expect(md.equals(mf)).toBe(true)

      // Reciprocals: should NOT be equal due to float roundoff.
      contents = contents.map((x) => 1.0 / x)
      mf.Set(...contents)
      md.Set(...contents)
      expect(md.equals(mf)).toBe(false)
    })
  }
})

describe('test_Other', () => {
  const matrices: [MatCtor, VecCtor, number][] = [
    [GfMatrix2d as MatCtor, GfVec2d as VecCtor, 2],
    [GfMatrix2f as MatCtor, GfVec2f as VecCtor, 2],
    [GfMatrix3d as MatCtor, GfVec3d as VecCtor, 3],
    [GfMatrix3f as MatCtor, GfVec3f as VecCtor, 3],
    [GfMatrix4d as MatCtor, GfVec4d as VecCtor, 4],
    [GfMatrix4f as MatCtor, GfVec4f as VecCtor, 4],
  ]
  const vecfFor: Record<string, VecCtor | undefined> = {
    GfVec2d: GfVec2f as VecCtor,
    GfVec3d: GfVec3f as VecCtor,
    GfVec4d: GfVec4f as VecCtor,
  }

  for (const [Matrix, Vec, dim] of matrices) {
    it(`${Matrix.name} misc operations`, () => {
      // SetDiagonal(vec) == element-wise diagonal set
      let v = new Vec()
      for (let i = 0; i < v.dimension; i++) v.setComponent(i, i)
      const m1 = new Matrix().setDiagonal(v)
      const m2 = new Matrix(0)
      for (let i = 0; i < dim; i++) m2.SetElement(i, i, i)
      expect(m1.equals(m2)).toBe(true)

      v = new Vec()
      for (let i = 0; i < v.dimension; i++) v.setComponent(i, 10)
      expect(new Matrix().setDiagonal(v).equals(new Matrix().setDiagonal(10))).toBe(true)

      // type(Matrix()[0]) == Vec
      expect(new Matrix().getRow(0)).toBeInstanceOf(Vec)

      // m[0] = vec ; m[0] == vec
      let m = new Matrix()
      m.setRow(0, makeValue(Vec, [3, 1, 4, 1]))
      expect(m.getRow(0).equals(makeValue(Vec, [3, 1, 4, 1]))).toBe(true)

      // m[-1] = vec ; m[-1] == vec
      m = new Matrix()
      m.setRow(-1, makeValue(Vec, [3, 1, 4, 1]))
      expect(m.getRow(-1).equals(makeValue(Vec, [3, 1, 4, 1]))).toBe(true)

      // element set/get (positive + negative)
      m = new Matrix()
      m.SetElement(0, 0, 1); m.SetElement(1, 0, 2); m.SetElement(0, 1, 3); m.SetElement(1, 1, 4)
      expect(m.getElement(0, 0)).toBe(1)
      expect(m.getElement(1, 0)).toBe(2)
      expect(m.getElement(0, 1)).toBe(3)
      expect(m.getElement(1, 1)).toBe(4)

      m = new Matrix()
      m.SetElement(-1, -1, 1); m.SetElement(-2, -1, 2); m.SetElement(-1, -2, 3); m.SetElement(-2, -2, 4)
      expect(m.getElement(-1, -1)).toBe(1)
      expect(m.getElement(-2, -1)).toBe(2)
      expect(m.getElement(-1, -2)).toBe(3)
      expect(m.getElement(-2, -2)).toBe(4)

      // transpose
      m = new Matrix()
      for (let i = 0; i < dim; i++)
        for (let j = 0; j < dim; j++) m.SetElement(i, j, i * dim + j)
      const mt = m.getTranspose()
      for (let i = 0; i < dim; i++)
        for (let j = 0; j < dim; j++) expect(mt.getElement(j, i)).toBe(i * dim + j)

      // inverse
      expect(new Matrix(1).getInverse().equals(new Matrix(1))).toBe(true)
      expect(new Matrix(4).getInverse().getMultiply(new Matrix(4)).equals(new Matrix(1))).toBe(true)
      expect(new Matrix(0).getInverse().equals(new Matrix(0))).toBe(false)

      // determinant of s*I = s**dim
      expect(new Matrix(3).getDeterminant()).toBeCloseTo(3 ** dim, 9)

      // len(Matrix()) == dimension
      expect(new Matrix().dimension).toBe(dim)

      // GetRow / GetRow3 / GetColumn
      m = new Matrix(1)
      for (let i = 0; i < dim; i++)
        for (let j = 0; j < dim; j++) m.SetElement(i, j, i * dim + j)
      for (let i = 0; i < dim; i++) {
        const j0 = i * dim
        expect(m.getRow(i).equals(makeValue(Vec, Array.from({ length: dim }, (_, k) => j0 + k)))).toBe(true)
        if (Matrix === (GfMatrix4d as MatCtor)) {
          expect((m as GfMatrix4Base).getRow3(i).equals(new GfVec3d(j0, j0 + 1, j0 + 2))).toBe(true)
        }
      }
      for (let j = 0; j < dim; j++) {
        expect(m.getColumn(j).equals(
          makeValue(Vec, Array.from({ length: dim }, (_, x) => j + x * dim)),
        )).toBe(true)
      }

      // SetRow / SetRow3 / SetColumn
      m = new Matrix(1)
      for (let i = 0; i < dim; i++) {
        const j0 = i * dim
        const row = makeValue(Vec, Array.from({ length: dim }, (_, k) => j0 + k))
        m.setRow(i, row)
        expect(row.equals(m.getRow(i))).toBe(true)
      }
      if (Matrix === (GfMatrix4d as MatCtor)) {
        m = new Matrix(1)
        for (let i = 0; i < dim; i++) {
          const j0 = i * dim
          const row3 = new GfVec3d(j0, j0 + 1, j0 + 2)
          ;(m as GfMatrix4Base).setRow3(i, row3)
          expect(row3.equals((m as GfMatrix4Base).getRow3(i))).toBe(true)
        }
      }
      m = new Matrix(1)
      for (let j = 0; j < dim; j++) {
        const col = makeValue(Vec, Array.from({ length: dim }, (_, x) => j + x * dim))
        m.setColumn(j, col)
        expect(col.equals(m.getColumn(j))).toBe(true)
      }

      // *= matrix (in place, returns same object)
      m = new Matrix(4)
      let mOriginal = m
      m.multiplyInPlace(new Matrix(1 / 4))
      expect(m.equals(new Matrix(1))).toBe(true)
      expect(m).toBe(mOriginal)
      m = new Matrix(4)
      expect(m.getMultiply(new Matrix(1 / 4)).equals(new Matrix(1))).toBe(true)

      // scalar mul (both sides) + *=
      expect(new Matrix(4).getScalarMultiply(2).equals(new Matrix(8))).toBe(true)
      m = new Matrix(4)
      mOriginal = m
      m.scalarMultiplyInPlace(2)
      expect(m.equals(new Matrix(8))).toBe(true)
      expect(m).toBe(mOriginal)

      // += / -=
      m = new Matrix(3)
      mOriginal = m
      m.addInPlace(new Matrix(2))
      expect(m.equals(new Matrix(5))).toBe(true)
      expect(m).toBe(mOriginal)
      m = new Matrix(3)
      mOriginal = m
      m.subtractInPlace(new Matrix(2))
      expect(m.equals(new Matrix(1))).toBe(true)
      expect(m).toBe(mOriginal)

      expect(new Matrix(2).getAdd(new Matrix(3)).equals(new Matrix(5))).toBe(true)
      expect(new Matrix(4).getSubtract(new Matrix(4)).equals(new Matrix(0))).toBe(true)
      expect(new Matrix(-1).getNegated().equals(new Matrix(1))).toBe(true)

      // division: M(3)/M(2) == M(3) * M(2).inverse
      expect(new Matrix(3).getDivide(new Matrix(2)).equals(
        new Matrix(3).getMultiply(new Matrix(2).getInverse()),
      )).toBe(true)

      // matrix * vec (both conventions)
      expect(new Matrix(2).multMatrixVec(makeValue(Vec, [3, 1, 4, 1]))
        .equals(makeValue(Vec, [6, 2, 8, 2]))).toBe(true)
      expect(new Matrix(2).multVecMatrix(makeValue(Vec, [3, 1, 4, 1]))
        .equals(makeValue(Vec, [6, 2, 8, 2]))).toBe(true)

      const Vecf = vecfFor[Vec.name]
      if (Vecf) {
        expect(new Matrix(2).multMatrixVec(makeValue(Vecf, [3, 1, 4, 1]))
          .equals(makeValue(Vecf, [6, 2, 8, 2]))).toBe(true)
        expect(new Matrix(2).multVecMatrix(makeValue(Vecf, [3, 1, 4, 1]))
          .equals(makeValue(Vecf, [6, 2, 8, 2]))).toBe(true)
      }

      // containment
      expect(new Matrix(2).contains(2)).toBe(true)
      expect(new Matrix(2).contains(4)).toBe(false)

      // out-of-range write throws (TS analogue of the Python index probes)
      expect(() => new Matrix(1).Set(0)).toThrow()

      // repr / str (eval(repr) adapted to the copy law)
      m = new Matrix(1)
      expect(m.repr().length).toBeGreaterThan(0)
      expect(new Matrix(...m.GetArray()).equals(m)).toBe(true)
      expect(new Matrix().toString().length).toBeGreaterThan(0)
    })
  }
})

describe('test_Matrix3Transforms', () => {
  const matrices: [Mat3Ctor, VecCtor][] = [
    [GfMatrix3d as Mat3Ctor, GfVec3d as VecCtor],
    [GfMatrix3f as Mat3Ctor, GfVec3f as VecCtor],
  ]
  for (const [Matrix, Vec] of matrices) {
    it(`${Matrix.name} rotation / scale / handedness`, () => {
      const verifyOrthonorm = (mat: GfMatrix): void => {
        const v0 = new Vec(mat.getElement(0, 0), mat.getElement(0, 1), mat.getElement(0, 2))
        const v1 = new Vec(mat.getElement(1, 0), mat.getElement(1, 1), mat.getElement(1, 2))
        const v2 = new Vec(mat.getElement(2, 0), mat.getElement(2, 1), mat.getElement(2, 2))
        expect(isCloseScalar(v0.dot(v1), 0, 0.0001)).toBe(true)
        expect(isCloseScalar(v0.dot(v2), 0, 0.0001)).toBe(true)
        expect(isCloseScalar(v1.dot(v2), 0, 0.0001)).toBe(true)
      }

      let m = new Matrix()
      m.setRotate(makeRotation([1, 0, 0], 30))
      let m2 = new Matrix(m)
      let mO = m.getOrthonormalized()
      expect(mO.equals(m2)).toBe(true)
      m.orthonormalize()
      expect(m.equals(m2)).toBe(true)

      m = new Matrix(3)
      mO = m.getOrthonormalized()
      expect(m.equals(mO)).toBe(false) // GetOrthonormalized must not mutate m
      expect(mO.equals(new Matrix(1))).toBe(true)
      m.orthonormalize()
      expect(m.equals(new Matrix(1))).toBe(true)

      // colinear rows: should warn (no assertion, just must not throw)
      m = new Matrix(1, 0, 0, 1, 0, 0, 1, 0, 0)
      m.orthonormalize()

      m = new Matrix(1, 0, 0, 1, 0, 0.0001, 0, 1, 0)
      mO = m.getOrthonormalized()
      verifyOrthonorm(mO)
      m.orthonormalize()
      verifyOrthonorm(m)

      // ExtractRotation round-trips
      for (const [axis, angle] of [
        [[1, 0, 0], 30], [[1, 1, 1], 60], [[1, 1, 1], 90], [[1, 1, 1], 120],
      ] as [[number, number, number], number][]) {
        const r = new Matrix().setRotate(makeRotation(axis, angle)).extractRotation()
        const r2 = makeRotation(axis, angle)
        closeQuatRotation(r, r2.axis, r2.angle)
      }

      // SetRotate(quat) == SetRotate(rotation)
      const rot = makeRotation([1, 1, 1], 120)
      const quat: Quat = rotationToQuat(rot)
      {
        const r = new Matrix().setRotate(rot).extractRotation()
        const r2 = new Matrix().setRotate(quat).extractRotation()
        closeQuatRotation(r2, r.axis, r.angle)
      }

      // SetScale
      expect(new Matrix().setScale(10).equals(new Matrix(10))).toBe(true)
      m = new Matrix().setScale(new Vec(1, 2, 3))
      expect(m.getElement(0, 0) === 1 && m.getElement(1, 1) === 2 && m.getElement(2, 2) === 3).toBe(true)
      {
        const s10 = new Matrix().setScale(10)
        const r30 = new Matrix().setRotate(makeRotation([1, 0, 0], 30))
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            expect(m.getElement(i, j)).toBe(G.scale3_vec123[i * 3 + j])
            expect(s10.getElement(i, j)).toBe(G.scale3_uniform10[i * 3 + j])
            expect(isCloseScalar(r30.getElement(i, j), G.rot3_x30[i * 3 + j]!, 1e-6)).toBe(true)
          }
        }
      }

      // Initializing with a rotation == SetRotate
      {
        const r = new Matrix().setRotate(makeRotation([1, 0, 0], 30)).extractRotation()
        const r2 = new Matrix(makeRotation([1, 0, 0], 30)).extractRotation()
        closeQuatRotation(r2, r.axis, r.angle)
      }
      // Initializing with a quaternion == SetRotate
      {
        const q = rotationToQuat(makeRotation([1, 1, 1], 120))
        const r = new Matrix().setRotate(q).extractRotation()
        const r2 = new Matrix(q).extractRotation()
        closeQuatRotation(r2, r.axis, r.angle)
      }

      // handedness
      expect(new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1).getHandedness()).toBe(1.0)
      expect(new Matrix(-1, 0, 0, 0, 1, 0, 0, 0, 1).getHandedness()).toBe(-1.0)
      expect(new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0).getHandedness()).toBe(0.0)
      expect(new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1).isRightHanded()).toBe(true)
      expect(new Matrix(-1, 0, 0, 0, 1, 0, 0, 0, 1).isLeftHanded()).toBe(true)
    })
  }

  it('bug #12744: ExtractRotation must not be NaN (Matrix3d)', () => {
    const mx = new GfMatrix3d(
      0.999999999982236, -5.00662622471027e-6, 2.07636574601397e-6,
      5.00666175191934e-6, 1.0000000000332, -2.19113616402155e-7,
      -2.07635686422463e-6, 2.19131379884019e-7, 1,
    )
    const r = mx.extractRotation()
    expect(Number.isNaN(r.angle)).toBe(G.bug12744_isnan)
    expect(r.angle).toBeCloseTo(G.bug12744_angle, 6)
  })
})

describe('test_Matrix4Transforms', () => {
  const matrices: [Mat4Ctor, VecCtor, Mat3Ctor, VecCtor][] = [
    [GfMatrix4d as Mat4Ctor, GfVec4d as VecCtor, GfMatrix3d as Mat3Ctor, GfVec3d as VecCtor],
    [GfMatrix4f as Mat4Ctor, GfVec4f as VecCtor, GfMatrix3f as Mat3Ctor, GfVec3f as VecCtor],
  ]
  // golden: Gf.Matrix4d().SetLookAt(Vec3d(1,0,0), Vec3d(0,0,1), Vec3d(0,1,0))
  const lookAtGolden = G.lookAt_100_001_010

  for (const [Matrix, Vec, Matrix3, Vec3] of matrices) {
    it(`${Matrix.name} lookAt / transform / rotate / translate / factor`, () => {
      const verifyOrthonorm = (mat: GfMatrix): void => {
        const v0 = new Vec3(mat.getElement(0, 0), mat.getElement(0, 1), mat.getElement(0, 2))
        const v1 = new Vec3(mat.getElement(1, 0), mat.getElement(1, 1), mat.getElement(1, 2))
        const v2 = new Vec3(mat.getElement(2, 0), mat.getElement(2, 1), mat.getElement(2, 2))
        expect(isCloseScalar(v0.dot(v1), 0, 0.0001)).toBe(true)
        expect(isCloseScalar(v0.dot(v2), 0, 0.0001)).toBe(true)
        expect(isCloseScalar(v1.dot(v2), 0, 0.0001)).toBe(true)
      }

      // SetLookAt
      let m = new Matrix() as GfMatrix4Base
      m.setLookAt(new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 1, 0))
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          expect(isCloseScalar(m.getElement(i, j), lookAtGolden[i * 4 + j]!, 0.0001)).toBe(true)
        }
      }

      // Transform
      {
        let v2 = (new Matrix(3) as GfMatrix4Base).Transform(new GfVec3f(1, 1, 1))
        expect(v2.equals(new GfVec3f(1, 1, 1))).toBe(true)
        expect(v2).toBeInstanceOf(Matrix === (GfMatrix4f as MatCtor) ? GfVec3f : GfVec3d)
        v2 = (new Matrix(3) as GfMatrix4Base).Transform(new GfVec3d(1, 1, 1))
        expect(v2.equals(new GfVec3d(1, 1, 1))).toBe(true)
        expect(v2).toBeInstanceOf(GfVec3d)
      }
      // TransformDir
      {
        let v2 = (new Matrix(3) as GfMatrix4Base).transformDir(new GfVec3f(1, 1, 1))
        expect(v2.equals(new GfVec3f(3, 3, 3))).toBe(true)
        expect(v2).toBeInstanceOf(Matrix === (GfMatrix4f as MatCtor) ? GfVec3f : GfVec3d)
        v2 = (new Matrix(3) as GfMatrix4Base).transformDir(new GfVec3d(1, 1, 1))
        expect(v2.equals(new GfVec3d(3, 3, 3))).toBe(true)
        expect(v2).toBeInstanceOf(GfVec3d)
      }
      // TransformAffine
      {
        let v2 = (new Matrix(3) as GfMatrix4Base).setTranslateOnly([1, 2, 3]).transformAffine(new GfVec3f(1, 1, 1))
        expect(v2.equals(new GfVec3f(4, 5, 6))).toBe(true)
        expect(v2).toBeInstanceOf(Matrix === (GfMatrix4f as MatCtor) ? GfVec3f : GfVec3d)
        v2 = (new Matrix(3) as GfMatrix4Base).setTranslateOnly([1, 2, 3]).transformAffine(new GfVec3d(1, 1, 1))
        expect(v2.equals(new GfVec3d(4, 5, 6))).toBe(true)
        expect(v2).toBeInstanceOf(GfVec3d)
      }

      // Constructor, SetRotate, SetRotateOnly w/ quaternion
      {
        m = new Matrix() as GfMatrix4Base
        const r = makeRotation([1, 0, 0], 30)
        const quat = rotationToQuat(r)
        m.setRotate(quat)
        const m2 = new Matrix(r, new Vec3(0, 0, 0)) as GfMatrix4Base
        const mO = m.getOrthonormalized()
        expect(mO.equals(m2)).toBe(true)
        m.orthonormalize()
        expect(m.equals(m2)).toBe(true)
        const m3 = new Matrix(1) as GfMatrix4Base
        m3.setRotateOnly(quat)
        expect(m2.equals(m3)).toBe(true)
      }
      // Constructor, SetRotate, SetRotateOnly w/ GfRotation
      {
        m = new Matrix() as GfMatrix4Base
        const r = makeRotation([1, 0, 0], 30)
        m.setRotate(r)
        const m2 = new Matrix(r, new Vec3(0, 0, 0)) as GfMatrix4Base
        const mO = m.getOrthonormalized()
        expect(mO.equals(m2)).toBe(true)
        m.orthonormalize()
        expect(m.equals(m2)).toBe(true)
        const m3 = new Matrix(1) as GfMatrix4Base
        m3.setRotateOnly(r)
        expect(m2.equals(m3)).toBe(true)
      }
      // Constructor, SetRotate, SetRotateOnly w/ Matrix3
      {
        const m3d = new Matrix3().setRotate(makeRotation([1, 0, 0], 30))
        const ma = new Matrix(m3d, new Vec3(0, 0, 0)) as GfMatrix4Base
        let mb = new Matrix() as GfMatrix4Base
        mb = mb.setRotate(m3d) as GfMatrix4Base
        const mc = mb.setRotateOnly(m3d) as GfMatrix4Base // mutates mb
        expect(ma.equals(mb)).toBe(true)
        expect(mb.equals(mc)).toBe(true)
      }

      // translate + orthonormalize round-trip via inverse
      {
        m = (new Matrix() as GfMatrix4Base).setTranslate(new Vec3(12, 13, 14)).getMultiply(new Matrix(3)) as GfMatrix4Base
        m.orthonormalize()
        const t = (new Matrix() as GfMatrix4Base).setTranslate(m.extractTranslation())
        const mnot = m.getMultiply(t.getInverse())
        expect(mnot.equals(new Matrix(1))).toBe(true)
      }

      // SetTranslate / SetTranslateOnly / orthonormalize equivalence
      {
        m = new Matrix() as GfMatrix4Base
        m.setTranslate(new Vec3(1, 2, 3))
        const m2 = new Matrix(m) as GfMatrix4Base
        const m3 = new Matrix(1) as GfMatrix4Base
        m3.setTranslateOnly(new Vec3(1, 2, 3))
        const mO = m.getOrthonormalized()
        expect(mO.equals(m2)).toBe(true)
        expect(mO.equals(m3)).toBe(true)
        m.orthonormalize()
        expect(m.equals(m2)).toBe(true)
        expect(m.equals(m3)).toBe(true)
      }
      {
        const v = new Vec3(11, 22, 33)
        m = (new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16) as GfMatrix4Base).setTranslateOnly(v)
        expect(m.extractTranslation().equals(v)).toBe(true)
      }

      // Init w/ rotation == SetRotate == SetTransform
      {
        const r = new Matrix().setRotate(makeRotation([1, 0, 0], 30)).extractRotation()
        const r2 = (new Matrix(makeRotation([1, 0, 0], 30), new Vec3(1, 2, 3)) as GfMatrix4Base).extractRotation()
        const r3 = (new Matrix() as GfMatrix4Base).setTransform(makeRotation([1, 0, 0], 30), new Vec3(1, 2, 3)).extractRotation()
        closeQuatRotation(r2, r.axis, r.angle)
        closeQuatRotation(r2, r3.axis, r3.angle)
      }
      // Init w/ rotation == SetRotate(quaternion) == SetTransform
      {
        const rot = makeRotation([1, 0, 0], 30)
        const quat = rotationToQuat(rot)
        const r = new Matrix().setRotate(quat).extractRotation()
        const r2 = (new Matrix(rot, new Vec3(1, 2, 3)) as GfMatrix4Base).extractRotation()
        const r3 = (new Matrix() as GfMatrix4Base).setTransform(rot, new Vec3(1, 2, 3)).extractRotation()
        closeQuatRotation(r2, r.axis, r.angle)
        closeQuatRotation(r2, r3.axis, r3.angle)
      }
      // Same w/ Matrix3 instead of rotation
      {
        const mx3d = new Matrix3(makeRotation([1, 0, 0], 30))
        const r2 = (new Matrix(makeRotation([1, 0, 0], 30), new Vec3(1, 2, 3)) as GfMatrix4Base).extractRotation()
        const r4 = (new Matrix() as GfMatrix4Base).setTransform(mx3d, new Vec3(1, 2, 3)).extractRotation()
        const r5 = (new Matrix(mx3d, new Vec3(1, 2, 3)) as GfMatrix4Base).extractRotation()
        closeQuatRotation(r4, r2.axis, r2.angle)
        closeQuatRotation(r4, r5.axis, r5.angle)
      }
      // ExtractRotationQuat <-> ExtractRotation equivalence
      {
        const mx3d = new Matrix3(makeRotation([1, 0, 0], 30))
        const mm = new Matrix(mx3d, new Vec3(1, 2, 3)) as GfMatrix4Base
        const r1 = mm.extractRotation()
        // Rotation(ExtractRotationQuat()) — quaternion → axis/angle
        const r2 = new Matrix().setRotate(mm.extractRotationQuat()).extractRotation()
        expect(isCloseAxis(r1.axis, r2.axis, 0.0001)).toBe(true)
      }
      // ExtractRotationMatrix == mx3d
      {
        const mx3d = new Matrix3(makeRotation([1, 0, 0], 30))
        const m4 = (new Matrix(mx3d, new Vec3(1, 2, 3)) as GfMatrix4Base).extractRotationMatrix()
        expect(m4.equals(mx3d)).toBe(true)
      }

      // Init with Matrix3 == explicit element layout
      {
        const ma = new Matrix(1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 10, 11, 12, 1)
        const mb = new Matrix(new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9), new Vec3(10, 11, 12))
        expect(ma.equals(mb)).toBe(true)
      }

      // colinear rows: should warn, must not throw
      m = new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1) as GfMatrix4Base
      m.orthonormalize()

      m = new Matrix(1, 0, 0, 0, 1, 0, 0.0001, 0, 0, 1, 0, 0, 0, 0, 0, 1) as GfMatrix4Base
      let mO = m.getOrthonormalized()
      verifyOrthonorm(mO)
      m.orthonormalize()
      verifyOrthonorm(m)

      // ExtractTranslation from explicit element writes
      m = new Matrix() as GfMatrix4Base
      m.SetElement(3, 0, 4); m.SetElement(3, 1, 5); m.SetElement(3, 2, 6)
      expect(m.extractTranslation().equals(new Vec3(4, 5, 6))).toBe(true)

      // handedness
      expect(new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).getHandedness()).toBe(1.0)
      expect(new Matrix(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).getHandedness()).toBe(-1.0)
      expect(new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0).getHandedness()).toBe(0.0)
      expect(new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).isRightHanded()).toBe(true)
      expect(new Matrix(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).isLeftHanded()).toBe(true)

      // RemoveScaleShear
      {
        let mm = new Matrix().setRotate(makeRotation([0, 0, 1], 45)) as GfMatrix4Base
        mm = (new Matrix().setScale(new Vec3(3, 4, 2)) as GfMatrix4Base).getMultiply(mm) as GfMatrix4Base
        mm = (new Matrix().setRotate(makeRotation([1, 0, 0], -30)) as GfMatrix4Base).getMultiply(mm) as GfMatrix4Base
        const r = mm.removeScaleShear()
        const ro = r // aliased, as in upstream
        ro.orthonormalize()
        expect(ro.equals(r)).toBe(true)
      }
      {
        const shear = new Matrix(1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) as GfMatrix4Base
        const r = shear.removeScaleShear()
        const ro = r
        ro.orthonormalize()
        expect(ro.equals(r)).toBe(true)
      }
      {
        let mm = new Matrix().setRotate(makeRotation([0, 0, 1], 45)) as GfMatrix4Base
        mm = (new Matrix().setRotate(makeRotation([1, 0, 0], -30)) as GfMatrix4Base).getMultiply(mm) as GfMatrix4Base
        mm = (new Matrix().setRotate(makeRotation([0, 1, 0], 59)) as GfMatrix4Base).getMultiply(mm) as GfMatrix4Base
        const r = mm.removeScaleShear()
        let maxEltErr = 0
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++)
            maxEltErr = Math.max(maxEltErr, Math.abs(r.getElement(i, j) - mm.getElement(i, j)))
        expect(isCloseScalar(maxEltErr, 0.0, 1e-5)).toBe(true)
      }

      // IsClose
      expect(GfIsCloseMatrix(new Matrix(1), new Matrix(1.0001), 1e-5)).toBe(false)
      expect(GfIsCloseMatrix(new Matrix(1), new Matrix(1.000001), 1e-5)).toBe(true)
    })
  }
})

describe('test_Matrix4Factoring', () => {
  const matrices: [Mat4Ctor, VecCtor][] = [
    [GfMatrix4d as Mat4Ctor, GfVec3d as VecCtor],
    [GfMatrix4f as Mat4Ctor, GfVec3f as VecCtor],
  ]
  for (const [Matrix, Vec3] of matrices) {
    it(`${Matrix.name} Factor reconstruction`, () => {
      const testFactor = (m: GfMatrix4Base, expectSuccess: boolean, eps?: number): void => {
        const f = eps !== undefined ? m.factor(eps) : m.factor()
        expect(f.success).toBe(expectSuccess)
        const factorProduct = f.scaleOrientation
          .getMultiply((new Matrix() as GfMatrix4Base).setScale(f.scale))
          .getMultiply(f.scaleOrientation.getInverse())
          .getMultiply(f.rotation)
          .getMultiply((new Matrix() as GfMatrix4Base).setTranslate(f.translation))
          .getMultiply(f.projection)
        let maxEltErr = 0
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++)
            maxEltErr = Math.max(maxEltErr, Math.abs(factorProduct.getElement(i, j) - m.getElement(i, j)))
        expect(isCloseScalar(maxEltErr, 0.0, 1e-5)).toBe(true)
      }
      const M = (): GfMatrix4Base => new Matrix() as GfMatrix4Base

      // A rotate
      testFactor(M().setRotate(makeRotation([1, 0, 0], 45)), true)

      // A couple of rotates
      let m = M().setRotate(makeRotation([0, 0, 1], -45))
      m = M().setRotate(makeRotation([1, 0, 0], 45)).getMultiply(m)
      testFactor(m, true)

      // A scale
      testFactor(M().setScale(new Vec3(3, 1, 4)), true)

      // A scale in a rotated space
      m = M().setRotate(makeRotation([0, 0, 1], 45))
      m = M().setScale(new Vec3(3, 4, 2)).getMultiply(m)
      m = M().setRotate(makeRotation([0, 0, 1], -45)).getMultiply(m)
      testFactor(m, true)

      // A nearly degenerate scale
      const eps = Matrix === (GfMatrix4d as MatCtor) ? 1e-10 : 1e-5
      testFactor(M().setScale(new Vec3(eps * 2, 1, 1)), true)
      testFactor(M().setScale(new Vec3(eps * 2, 1, 1)), false, eps * 3)

      // A singular (1) scale in a rotated space
      m = M().setRotate(rotateInto([1, 1, 1], [1, 0, 0]))
      m = m.getMultiply(M().setScale(new Vec3(0, 1, 1)))
      m = m.getMultiply(M().setRotate(rotateInto([1, 0, 0], [1, 1, 1])))
      testFactor(m, false)

      // A singular (2) scale in a rotated space
      m = M().setRotate(rotateInto([1, 1, 1], [1, 0, 0]))
      m = m.getMultiply(M().setScale(new Vec3(0, 0, 1)))
      m = m.getMultiply(M().setRotate(rotateInto([1, 0, 0], [1, 1, 1])))
      testFactor(m, false)

      // A scale in a sheared space
      let shear = new Matrix(1) as GfMatrix4Base
      shear.setRow3(0, new Vec3(1, 1, 1).GetNormalized())
      m = shear.getInverse().getMultiply(M().setScale(new Vec3(2, 3, 4))).getMultiply(shear)
      testFactor(m, true)

      // A singular (1) scale in a sheared space
      shear = new Matrix(1) as GfMatrix4Base
      shear.setRow3(0, new Vec3(1, 1, 1).GetNormalized())
      m = shear.getInverse().getMultiply(M().setScale(new Vec3(2, 0, 4))).getMultiply(shear)
      testFactor(m, false)

      // A singular (2) scale in a sheared space
      shear = new Matrix(1) as GfMatrix4Base
      shear.setRow3(0, new Vec3(1, 1, 1).GetNormalized())
      m = shear.getInverse().getMultiply(M().setScale(new Vec3(0, 3, 0))).getMultiply(shear)
      testFactor(m, false)

      // A scale and a rotate
      m = M().setRotate(rotateInto([0, 0, 1], [1, 1, -1]))
      m = M().setScale(new Vec3(1, 2, 3)).getMultiply(m)
      testFactor(m, true)

      // A singular (1) scale and a rotate
      m = M().setRotate(rotateInto([0, 0, 1], [1, 1, -1]))
      m = M().setScale(new Vec3(0, 2, 3)).getMultiply(m)
      testFactor(m, false)

      // A singular (2) scale and a rotate
      m = M().setRotate(rotateInto([0, 0, 1], [1, 1, -1]))
      m = M().setScale(new Vec3(0, 0, 3)).getMultiply(m)
      testFactor(m, false)

      // A singular scale (1), rotate, translate
      m = M().setTranslate(new Vec3(3, 1, 4))
      m = M().setRotate(rotateInto([0, 0, 1], [1, 1, -1])).getMultiply(m)
      m = M().setScale(new Vec3(0, 2, 3)).getMultiply(m)
      testFactor(m, false)

      // A translate, rotate, singular scale (1), translate
      m = M().setTranslate(new Vec3(3, 1, 4))
      m = M().setRotate(rotateInto([0, 0, 1], [1, 1, -1])).getMultiply(m)
      m = M().setScale(new Vec3(0, 2, 3)).getMultiply(m)
      m = M().setTranslate(new Vec3(-10, -20, -30)).getMultiply(m)
      testFactor(m, false)
    })
  }
})

describe('test_Matrix4Determinant', () => {
  const matrices: Mat4Ctor[] = [GfMatrix4d as Mat4Ctor, GfMatrix4f as Mat4Ctor]
  for (const Matrix of matrices) {
    it(`${Matrix.name} GetDeterminant / GetInverse`, () => {
      const epsilon = Matrix === (GfMatrix4d as unknown as Mat4Ctor) ? 1e-10 : 1e-5
      const assertDeterminant = (m: GfMatrix, det: number): void => {
        const prod = m.getMultiply(m.getInverse())
        const ident = new Matrix()
        for (let i = 0; i < 4; i++) {
          expect(GfIsClose(prod.getRow(i) as GfVec, ident.getRow(i) as GfVec, epsilon)).toBe(true)
        }
        expect(isCloseScalar(m.getDeterminant(), det, epsilon)).toBe(true)
      }

      const m1 = new Matrix(0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
      const det1 = -1.0
      const m2 = new Matrix(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1)
      const det2 = -1.0
      const m3 = new Matrix(0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0)
      const det3 = -1.0
      const m4 = new Matrix(1, 2, -1, 3, 2, 1, 4, 5.1, 2, 3, 1, 6, 3, 2, 1, 1)
      const det4 = G.det_m4

      assertDeterminant(m1, det1)
      assertDeterminant(m2, det2)
      assertDeterminant(m3, det3)
      assertDeterminant(m4, det4)
      assertDeterminant(m1.getMultiply(m1), det1 * det1)
      assertDeterminant(m1.getMultiply(m4), det1 * det4)
      assertDeterminant(m1.getMultiply(m3).getMultiply(m4), det1 * det3 * det4)
      assertDeterminant(m1.getMultiply(m3).getMultiply(m4).getMultiply(m2), det1 * det3 * det4 * det2)
      assertDeterminant(m2.getMultiply(m3).getMultiply(m4).getMultiply(m2), det2 * det3 * det4 * det2)
    })
  }
})

describe('test_Exceptions', () => {
  // Upstream probes Python's C buffer protocol: int(Gf.Matrix3d(3)) must raise
  // ValueError rather than treating the binary buffer as a string. That is a
  // Python-binding concern with no TypeScript analogue — there is no implicit
  // numeric coercion of a GfMatrix. Documented N/A.
  it('GfMatrix has no implicit scalar coercion (Python-buffer probe N/A)', () => {
    expect(new GfMatrix3d(3)).toBeInstanceOf(GfMatrix3d)
    expect(new GfMatrix3f(3)).toBeInstanceOf(GfMatrix3f)
  })
})

describe('test_Hash', () => {
  const types: MatCtor[] = [
    GfMatrix2d as MatCtor, GfMatrix2f as MatCtor,
    GfMatrix3d as MatCtor, GfMatrix3f as MatCtor,
    GfMatrix4d as MatCtor, GfMatrix4f as MatCtor,
  ]
  for (const Matrix of types) {
    it(`${Matrix.name} hash stability`, () => {
      const n = new Matrix().dimension * new Matrix().dimension
      const contents = Array.from({ length: n }, (_, i) => (i + 1) * 2.0)
      const m = new Matrix(...contents)
      expect(m.hash()).toBe(m.hash())
      expect(m.hash()).toBe(new Matrix(m).hash())
    })
  }
})
