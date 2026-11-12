// Ported from OpenUSD 26.11.1: pxr/base/gf/matrixData.cpp,
//  pxr/base/gf/matrixData.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfMatrix{2,3,4}{d,f} value types.
//
// Mirrors OpenUSD pxr/base/gf/matrix{2,3,4}{d,f}.{h,cpp}, all generated from
// matrix.template.{h,cpp} + matrix{2,3,4}.template.{h,cpp}. This is the
// first-class value-type matrix surface (a sibling of vec.ts's GfVec), distinct
// from the functional Matrix4 = number[16] shim in matrix.ts (which this file
// reuses internally for the heavy 4x4 algorithms — inverse, lookAt, factor).
//
// C++ operator -> TS method mapping (documented on each method):
//   operator[i][j]        -> .GetElement(i, j) / .SetElement(i, j, v)
//   operator[i] (row)     -> .GetRow(i) / .SetRow(i, v)  (returns/takes a GfVec)
//   operator==            -> .equals(other)   (exact, element-wise, cross-precision)
//   operator* (mat, mat)  -> .GetMultiply(m) / .MultiplyInPlace(m)  (post-multiply)
//   operator* (mat, s)    -> .GetScalarMultiply(s) / .ScalarMultiplyInPlace(s)
//   operator+ / +=        -> .GetAdd(m) / .AddInPlace(m)
//   operator- (binary)    -> .GetSubtract(m) / .SubtractInPlace(m)
//   operator- (unary)     -> .GetNegated()
//   operator/ (mat, mat)  -> .GetDivide(m)   (= m1 * m2.GetInverse())
//   operator* (mat, vec)  -> .MultMatrixVec(v)   (v as column: result_r = Σ v_i M[r][i])
//   operator* (vec, mat)  -> .MultVecMatrix(v)   (v as row, the v·M convention)
//
// ROW-VECTOR convention (v' = v·M), row-major storage; translation lives in the
// last row (M[3][0..2]). Matches GfMatrix4d storage + matrix.ts/rotation.ts.
//
// Precision: 'f' types round every stored component through Math.fround to match
// float32 semantics in the Pixar oracle; 'd' stores doubles verbatim. The 4x4
// transform algorithms (Orthonormalize, Factor) use double internally exactly as
// upstream does (Matrix4f::Orthonormalize/Factor compute in GfMatrix4d), then
// round the result to the matrix's kind.

import {
  GfVec,
  GfVec2d, GfVec2f,
  GfVec3d, GfVec3f,
  GfVec4d, GfVec4f,
  type VecLike,
} from './vec.ts'
import {
  type Matrix4,
  invertMatrix4,
} from './matrix.ts'
import {
  type Rotation,
  type Quat,
  type Vec3,
  rotationToQuat,
  extractRotation as extractRotation4,
  extractRotationQuat as extractRotationQuat4,
  setLookAt as setLookAt4,
  factorMatrix,
} from './rotation.ts'

// Ported from OpenUSD v26.08 pxr/base/gf/matrixData.h:15-45.
export class GfMatrixDataStorage {
  readonly #rows: number
  readonly #columns: number
  readonly #data: number[]

  constructor(rows: number, columns: number, initial = 0) {
    this.#rows = rows
    this.#columns = columns
    this.#data = new Array(rows * columns).fill(initial)
  }
  Get(row: number, column: number): number {
    return this.#data[row * this.#columns + column]!
  }
  Set(row: number, column: number, value: number): void {
    this.#data[row * this.#columns + column] = value
  }
  getRow(row: number): number[] {
    return this.#data.slice(row * this.#columns, (row + 1) * this.#columns)
  }
  getData(): readonly number[] { return this.#data }
  getNumRows(): number { return this.#rows }
  getNumColumns(): number { return this.#columns }
}

// FLT_MAX (the 32-bit float maximum) — upstream's singular-matrix fill value.
const GF_FLT_MAX = 3.4028234663852886e38
const GF_MIN_VECTOR_LENGTH = 1e-10

type ScalarKind = 'd' | 'f'

/** GfSgn: 1 if positive, -1 if negative, 0 if zero. */
const gfSgn = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0)

// Vec constructor lookup by dimension + scalar kind. GetRow/GetColumn and the
// matrix*vec products return the GfVec of matching precision.
type VecCtor = new (...args: Array<number | VecLike>) => GfVec
const VEC_CTORS: Record<string, VecCtor> = {
  '2d': GfVec2d as unknown as VecCtor, '2f': GfVec2f as unknown as VecCtor,
  '3d': GfVec3d as unknown as VecCtor, '3f': GfVec3f as unknown as VecCtor,
  '4d': GfVec4d as unknown as VecCtor, '4f': GfVec4f as unknown as VecCtor,
}

const VEC3_CTORS: Record<ScalarKind, new (...a: Array<number | VecLike>) => GfVec> = {
  d: GfVec3d as unknown as new (...a: Array<number | VecLike>) => GfVec,
  f: GfVec3f as unknown as new (...a: Array<number | VecLike>) => GfVec,
}

function isRotation(x: unknown): x is Rotation {
  return typeof x === 'object' && x !== null && 'axis' in x && 'angle' in x
}
function isQuat(x: unknown): x is Quat {
  return Array.isArray(x) && x.length === 4 && x.every((n) => typeof n === 'number')
}
// ---------------------------------------------------------------------------
// Base: storage + dimension-agnostic surface.
// ---------------------------------------------------------------------------

export abstract class GfMatrix {
  abstract readonly dimension: number
  abstract readonly scalarKind: ScalarKind
  /** Flat row-major storage; length = dimension*dimension. */
  protected _m: number[] = []

  protected _round(x: number): number {
    return this.scalarKind === 'f' ? Math.fround(x) : x
  }
  protected _alloc(): void {
    // Array literals: packed storage, much cheaper to make than fill().
    const N = this.dimension
    this._m = N === 4 ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      : N === 3 ? [0, 0, 0, 0, 0, 0, 0, 0, 0]
        : N === 2 ? [0, 0, 0, 0]
          : new Array<number>(N * N).fill(0)
  }
  protected _idx(i: number, j: number): number {
    return i * this.dimension + j
  }
  protected _wrap(i: number): number {
    return i < 0 ? i + this.dimension : i
  }
  /** New default-constructed (identity) instance of the same runtime type. */
  protected _new(): this {
    return new (this.constructor as new () => this)()
  }
  /** Same-type matrix from a flat row-major array (rounded to scalar kind). */
  protected _fromFlat(data: readonly number[]): this {
    const r = this._new()
    for (let k = 0; k < this._m.length; k++) r._m[k] = r._round(data[k]!)
    return r
  }

  /** Common constructor dispatch shared by all dimensions. Returns true if
   * the argument list was handled here (dimension-specific ctors handle the
   * rest first). */
  protected _constructCommon(args: ReadonlyArray<unknown>): void {
    const N = this.dimension
    if (args.length === 0) {
      this.setIdentity()
      return
    }
    if (args.length === 1) {
      const a = args[0]
      if (typeof a === 'number') {
        this.setDiagonal(a)
        return
      }
      if (a instanceof GfMatrix) {
        for (let i = 0; i < N; i++)
          for (let j = 0; j < N; j++)
            this._m[this._idx(i, j)] = this._round(a.getElement(i, j))
        return
      }
      if (a instanceof GfVec) {
        this.setDiagonal(a)
        return
      }
      throw new TypeError('GfMatrix: unsupported single constructor argument')
    }
    if (args.length === N * N) {
      this.Set(...(args as number[]))
      return
    }
    throw new TypeError(
      `GfMatrix: expected 0, 1, or ${N * N} arguments, got ${args.length}`,
    )
  }

  // ---- element / row / column access ----

  /** operator[i][j] (const). Supports negative indices (Python-style). */
  getElement(i: number, j: number): number {
    return this._m[this._idx(this._wrap(i), this._wrap(j))]!
  }
  /** operator[i][j] = v. Rounds to scalar kind. */
  SetElement(i: number, j: number, v: number): this {
    this._m[this._idx(this._wrap(i), this._wrap(j))] = this._round(v)
    return this
  }

  /** GetRow(i): row i as a GfVec of matching precision. */
  getRow(i: number): GfVec {
    const r = this._wrap(i)
    const N = this.dimension
    const comps: number[] = []
    for (let j = 0; j < N; j++) comps.push(this._m[this._idx(r, j)]!)
    return new VEC_CTORS[`${N}${this.scalarKind}`]!(...comps)
  }
  /** SetRow(i, v). */
  setRow(i: number, v: VecLike): this {
    const r = this._wrap(i)
    const N = this.dimension
    const o = v instanceof GfVec ? v.data : v
    for (let j = 0; j < N; j++) this._m[this._idx(r, j)] = this._round(o[j]!)
    return this
  }
  /** GetColumn(j): column j as a GfVec of matching precision. */
  getColumn(j: number): GfVec {
    const c = this._wrap(j)
    const N = this.dimension
    const comps: number[] = []
    for (let i = 0; i < N; i++) comps.push(this._m[this._idx(i, c)]!)
    return new VEC_CTORS[`${N}${this.scalarKind}`]!(...comps)
  }
  /** SetColumn(j, v). */
  setColumn(j: number, v: VecLike): this {
    const c = this._wrap(j)
    const N = this.dimension
    const o = v instanceof GfVec ? v.data : v
    for (let i = 0; i < N; i++) this._m[this._idx(i, c)] = this._round(o[i]!)
    return this
  }

  /** Raw flat row-major access. Mirrors data()/GetArray(). */
  GetArray(): readonly number[] {
    return this._m
  }

  // ---- setters ----

  /** Set(...) from dimension*dimension scalars in row-major order. */
  Set(...values: number[]): this {
    const n = this.dimension * this.dimension
    if (values.length !== n) {
      throw new TypeError(`Set: expected ${n} values, got ${values.length}`)
    }
    for (let k = 0; k < n; k++) this._m[k] = this._round(values[k]!)
    return this
  }
  setIdentity(): this {
    return this.setDiagonal(1)
  }
  setZero(): this {
    return this.setDiagonal(0)
  }
  /** SetDiagonal(scalar): s times the identity. SetDiagonal(vec): per-axis. */
  setDiagonal(s: number | VecLike): this {
    const N = this.dimension
    const vec = typeof s === 'number' ? null : s instanceof GfVec ? s.data : s
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        this._m[this._idx(i, j)] =
          i === j ? this._round(vec ? vec[i]! : (s as number)) : 0
      }
    }
    return this
  }

  // ---- transpose / equality ----

  getTranspose(): this {
    const N = this.dimension
    const r = this._new()
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        r._m[r._idx(j, i)] = this._m[this._idx(i, j)]!
    return r
  }

  /** operator== — exact element-wise (works across precision: 2d == 2f). */
  equals(other: GfMatrix): boolean {
    if (other.dimension !== this.dimension) return false
    for (let k = 0; k < this._m.length; k++) {
      if (this._m[k] !== other._m[k]) return false
    }
    return true
  }

  // ---- arithmetic ----

  /** operator*(m1, m2) — post-multiply (this * m). result[r][c]=Σ a[r][k] b[k][c]. */
  getMultiply(m: GfMatrix): this {
    const N = this.dimension
    const out: number[] = new Array<number>(N * N).fill(0)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let s = 0
        for (let k = 0; k < N; k++) s += this._m[this._idx(i, k)]! * m._m[m._idx(k, j)]!
        out[this._idx(i, j)] = s
      }
    }
    return this._fromFlat(out)
  }
  /** operator*= (matrix). Mutates this; returns this. */
  multiplyInPlace(m: GfMatrix): this {
    const res = this.getMultiply(m)
    this._m = res._m
    return this
  }

  /** operator*(m, scalar). */
  getScalarMultiply(d: number): this {
    return this._fromFlat(this._m.map((x) => x * d))
  }
  /** operator*= (scalar). */
  scalarMultiplyInPlace(d: number): this {
    for (let k = 0; k < this._m.length; k++) this._m[k] = this._round(this._m[k]! * d)
    return this
  }

  /** operator+(m1, m2). */
  getAdd(m: GfMatrix): this {
    return this._fromFlat(this._m.map((x, k) => x + m._m[k]!))
  }
  /** operator+= */
  addInPlace(m: GfMatrix): this {
    for (let k = 0; k < this._m.length; k++) this._m[k] = this._round(this._m[k]! + m._m[k]!)
    return this
  }
  /** operator-(m1, m2). */
  getSubtract(m: GfMatrix): this {
    return this._fromFlat(this._m.map((x, k) => x - m._m[k]!))
  }
  /** operator-= */
  subtractInPlace(m: GfMatrix): this {
    for (let k = 0; k < this._m.length; k++) this._m[k] = this._round(this._m[k]! - m._m[k]!)
    return this
  }
  /** operator- (unary). */
  getNegated(): this {
    return this._fromFlat(this._m.map((x) => -x))
  }
  /** operator/(m1, m2) = m1 * m2.GetInverse(). */
  getDivide(m: GfMatrix): this {
    return this.getMultiply(m.getInverse())
  }

  // ---- matrix * vector ----

  /** operator*(m, vec) — vec as column: result_r = Σ_i vec_i M[r][i]. */
  multMatrixVec(v: VecLike): GfVec {
    const N = this.dimension
    const o = v instanceof GfVec ? v.data : v
    const comps: number[] = []
    for (let r = 0; r < N; r++) {
      let s = 0
      for (let i = 0; i < N; i++) s += o[i]! * this._m[this._idx(r, i)]!
      comps.push(s)
    }
    return new VEC_CTORS[`${N}${this.scalarKind}`]!(...comps)
  }
  /** operator*(vec, m) — vec as row (the v·M convention): result_c = Σ_i vec_i M[i][c]. */
  multVecMatrix(v: VecLike): GfVec {
    const N = this.dimension
    const o = v instanceof GfVec ? v.data : v
    const comps: number[] = []
    for (let c = 0; c < N; c++) {
      let s = 0
      for (let i = 0; i < N; i++) s += o[i]! * this._m[this._idx(i, c)]!
      comps.push(s)
    }
    return new VEC_CTORS[`${N}${this.scalarKind}`]!(...comps)
  }

  // ---- misc ----

  /** `value in matrix` — true if any element equals value. */
  contains(value: number): boolean {
    return this._m.includes(value)
  }
  /** Deterministic hash key; equal matrices (and copies) hash equal. */
  hash(): string {
    return `${this.dimension}:${this._m.join(',')}`
  }
  toString(): string {
    const N = this.dimension
    const rows: string[] = []
    for (let i = 0; i < N; i++) {
      const row: number[] = []
      for (let j = 0; j < N; j++) row.push(this._m[this._idx(i, j)]!)
      rows.push(`(${row.join(', ')})`)
    }
    return `( ${rows.join(', ')} )`
  }
  /** repr-style, constructor-round-trippable string. */
  repr(): string {
    return `Gf.${this.constructor.name}(${this._m.join(', ')})`
  }

  abstract getDeterminant(): number
  abstract getInverse(eps?: number): this
}

/** GfIsClose(m1, m2, tol): element-wise |a-b| <= tolerance. */
export function GfIsCloseMatrix(m1: GfMatrix, m2: GfMatrix, tolerance: number): boolean {
  const a = m1.GetArray()
  const b = m2.GetArray()
  if (a.length !== b.length) return false
  for (let k = 0; k < a.length; k++) {
    if (Math.abs(a[k]! - b[k]!) > tolerance) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Dimension 2.
// ---------------------------------------------------------------------------

export abstract class GfMatrix2Base extends GfMatrix {
  readonly dimension = 2

  protected _construct(args: ReadonlyArray<unknown>): void {
    this._constructCommon(args)
  }

  getDeterminant(): number {
    // matrix2.template.cpp
    return this._m[0]! * this._m[3]! - this._m[1]! * this._m[2]!
  }
  getInverse(eps = 0): this {
    const det = this.getDeterminant()
    const r = this._new()
    if (Math.abs(det) > eps) {
      const rcp = 1.0 / det
      r._m[0] = r._round(this._m[3]! * rcp)
      r._m[1] = r._round(this._m[1]! * -rcp)
      r._m[2] = r._round(this._m[2]! * -rcp)
      r._m[3] = r._round(this._m[0]! * rcp)
    } else {
      // matrix2: singular -> SetDiagonal(FLT_MAX) (NOT SetScale).
      r.setDiagonal(GF_FLT_MAX)
    }
    return r
  }
}

export class GfMatrix2d extends GfMatrix2Base {
  readonly scalarKind: ScalarKind = 'd'
  constructor(...args: unknown[]) {
    super()
    this._alloc()
    this._construct(args)
  }
}
export class GfMatrix2f extends GfMatrix2Base {
  readonly scalarKind: ScalarKind = 'f'
  constructor(...args: unknown[]) {
    super()
    this._alloc()
    this._construct(args)
  }
}

// ---------------------------------------------------------------------------
// Dimension 3 (adds the rotation/scale transform surface).
// ---------------------------------------------------------------------------

export abstract class GfMatrix3Base extends GfMatrix {
  readonly dimension = 3

  protected _construct(args: ReadonlyArray<unknown>): void {
    if (args.length === 1) {
      const a = args[0]
      if (isRotation(a)) {
        this.setRotate(a)
        return
      }
      if (isQuat(a)) {
        this.setRotate(a)
        return
      }
    }
    this._constructCommon(args)
  }

  getDeterminant(): number {
    const m = this._m
    return (
      m[0]! * m[4]! * m[8]! +
      m[1]! * m[5]! * m[6]! +
      m[2]! * m[3]! * m[7]! -
      m[0]! * m[5]! * m[7]! -
      m[1]! * m[3]! * m[8]! -
      m[2]! * m[4]! * m[6]!
    )
  }
  getInverse(eps = 0): this {
    const m = this._m
    const a00 = m[0]!, a01 = m[1]!, a02 = m[2]!
    const a10 = m[3]!, a11 = m[4]!, a12 = m[5]!
    const a20 = m[6]!, a21 = m[7]!, a22 = m[8]!
    const det =
      -(a02 * a11 * a20) + a01 * a12 * a20 + a02 * a10 * a21 -
      a00 * a12 * a21 - a01 * a10 * a22 + a00 * a11 * a22
    const r = this._new()
    if (Math.abs(det) > eps) {
      const rcp = 1.0 / det
      r._m[0] = r._round((-(a12 * a21) + a11 * a22) * rcp)
      r._m[1] = r._round((a02 * a21 - a01 * a22) * rcp)
      r._m[2] = r._round((-(a02 * a11) + a01 * a12) * rcp)
      r._m[3] = r._round((a12 * a20 - a10 * a22) * rcp)
      r._m[4] = r._round((-(a02 * a20) + a00 * a22) * rcp)
      r._m[5] = r._round((a02 * a10 - a00 * a12) * rcp)
      r._m[6] = r._round((-(a11 * a20) + a10 * a21) * rcp)
      r._m[7] = r._round((a01 * a20 - a00 * a21) * rcp)
      r._m[8] = r._round((-(a01 * a10) + a00 * a11) * rcp)
    } else {
      r.setScale(GF_FLT_MAX)
    }
    return r
  }

  // ---- transforms ----

  /** SetScale(scalar) or SetScale(vec3). */
  setScale(s: number | VecLike): this {
    const m = this._m
    if (typeof s === 'number') {
      m[0] = this._round(s); m[1] = 0; m[2] = 0
      m[3] = 0; m[4] = this._round(s); m[5] = 0
      m[6] = 0; m[7] = 0; m[8] = this._round(s)
    } else {
      const v = s instanceof GfVec ? s.data : s
      m[0] = this._round(v[0]!); m[1] = 0; m[2] = 0
      m[3] = 0; m[4] = this._round(v[1]!); m[5] = 0
      m[6] = 0; m[7] = 0; m[8] = this._round(v[2]!)
    }
    return this
  }

  /** _SetRotateFromQuat: writes the 3x3 rotation from quaternion (real, imag). */
  protected _setRotateFromQuat(r: number, ix: number, iy: number, iz: number): void {
    const m = this._m
    m[0] = this._round(1.0 - 2.0 * (iy * iy + iz * iz))
    m[1] = this._round(2.0 * (ix * iy + iz * r))
    m[2] = this._round(2.0 * (iz * ix - iy * r))
    m[3] = this._round(2.0 * (ix * iy - iz * r))
    m[4] = this._round(1.0 - 2.0 * (iz * iz + ix * ix))
    m[5] = this._round(2.0 * (iy * iz + ix * r))
    m[6] = this._round(2.0 * (iz * ix + iy * r))
    m[7] = this._round(2.0 * (iy * iz - ix * r))
    m[8] = this._round(1.0 - 2.0 * (iy * iy + ix * ix))
  }

  /** SetRotate(Rotation | Quat[w,x,y,z]). */
  setRotate(rot: Rotation | Quat): this {
    const q = isQuat(rot) ? rot : rotationToQuat(rot)
    this._setRotateFromQuat(q[0]!, q[1]!, q[2]!, q[3]!)
    return this
  }

  /** ExtractRotation — via the embedded-4x4 quaternion extraction. */
  extractRotation(): Rotation {
    return extractRotation4(this._embed4())
  }
  /** ExtractRotationQuaternion — quaternion [w,x,y,z]. */
  extractRotationQuaternion(): Quat {
    return extractRotationQuat4(this._embed4())
  }
  /** Embed the upper 3x3 into a 4x4 (with [3][3]=1) for reuse of the 4x4 algos. */
  protected _embed4(): Matrix4 {
    const m = this._m
    return [
      m[0]!, m[1]!, m[2]!, 0,
      m[3]!, m[4]!, m[5]!, 0,
      m[6]!, m[7]!, m[8]!, 0,
      0, 0, 0, 1,
    ]
  }

  getHandedness(): number {
    return gfSgn(this.getDeterminant())
  }
  isRightHanded(): boolean {
    return this.getHandedness() === 1.0
  }
  isLeftHanded(): boolean {
    return this.getHandedness() === -1.0
  }

  /** Orthonormalize the row basis in place (iterative, double-precision). */
  orthonormalize(): this {
    orthonormalize3InPlace(this._m, this._round.bind(this))
    return this
  }
  getOrthonormalized(): this {
    const r = this._fromFlat(this._m)
    r.orthonormalize()
    return r
  }
}

export class GfMatrix3d extends GfMatrix3Base {
  readonly scalarKind: ScalarKind = 'd'
  constructor(...args: unknown[]) {
    super()
    this._alloc()
    this._construct(args)
  }
}
export class GfMatrix3f extends GfMatrix3Base {
  readonly scalarKind: ScalarKind = 'f'
  constructor(...args: unknown[]) {
    super()
    this._alloc()
    this._construct(args)
  }
}

// ---------------------------------------------------------------------------
// Dimension 4 (full 3D transform surface).
// ---------------------------------------------------------------------------

export abstract class GfMatrix4Base extends GfMatrix {
  readonly dimension = 4

  protected _construct(args: ReadonlyArray<unknown>): void {
    if (args.length === 1 && args[0] instanceof GfMatrix4Base) {
      // The copy (and precision-converting) constructor, element by element
      // as _constructCommon copies, rounded to this scalar kind.
      const src = args[0]._m, m = this._m
      if (this.scalarKind === 'f') {
        for (let k = 0; k < 16; k++) m[k] = Math.fround(src[k]!)
      } else {
        for (let k = 0; k < 16; k++) m[k] = src[k]!
      }
      return
    }
    if (args.length === 16) {
      // Sixteen scalars, row-major: Set(...), without spreading them again.
      const m = this._m
      const f = this.scalarKind === 'f'
      for (let k = 0; k < 16; k++) {
        const v = args[k] as number
        m[k] = f ? Math.fround(v) : v
      }
      return
    }
    if (args.length === 2) {
      const [a, t] = args
      if (isRotation(a) || a instanceof GfMatrix3Base) {
        this.setTransform(a as Rotation | GfMatrix3Base, t as VecLike)
        return
      }
    }
    this._constructCommon(args)
  }

  getDeterminant3(): number {
    return this._det3(0, 1, 2, 0, 1, 2)
  }
  protected _det3(
    r1: number, r2: number, r3: number,
    c1: number, c2: number, c3: number,
  ): number {
    const e = (r: number, c: number): number => this._m[this._idx(r, c)]!
    return (
      e(r1, c1) * e(r2, c2) * e(r3, c3) +
      e(r1, c2) * e(r2, c3) * e(r3, c1) +
      e(r1, c3) * e(r2, c1) * e(r3, c2) -
      e(r1, c1) * e(r2, c3) * e(r3, c2) -
      e(r1, c2) * e(r2, c1) * e(r3, c3) -
      e(r1, c3) * e(r2, c2) * e(r3, c1)
    )
  }
  getDeterminant(): number {
    const e = (r: number, c: number): number => this._m[this._idx(r, c)]!
    return (
      -e(0, 3) * this._det3(1, 2, 3, 0, 1, 2) +
      e(1, 3) * this._det3(0, 2, 3, 0, 1, 2) -
      e(2, 3) * this._det3(0, 1, 3, 0, 1, 2) +
      e(3, 3) * this._det3(0, 1, 2, 0, 1, 2)
    )
  }
  getInverse(eps = 0): this {
    // Reuse the verbatim functional 4x4 inverse (matrix.ts); it already returns
    // SetScale(FLT_MAX) for singular matrices.
    return this._fromFlat(invertMatrix4(this._m as unknown as Matrix4, eps))
  }

  // ---- row3 helpers ----

  getRow3(i: number): GfVec {
    const r = this._wrap(i)
    return new VEC3_CTORS[this.scalarKind](
      this._m[this._idx(r, 0)]!, this._m[this._idx(r, 1)]!, this._m[this._idx(r, 2)]!,
    )
  }
  setRow3(i: number, v: VecLike): this {
    const r = this._wrap(i)
    const o = v instanceof GfVec ? v.data : v
    this._m[this._idx(r, 0)] = this._round(o[0]!)
    this._m[this._idx(r, 1)] = this._round(o[1]!)
    this._m[this._idx(r, 2)] = this._round(o[2]!)
    return this
  }

  // ---- scale / translate ----

  setScale(s: number | VecLike): this {
    const m = this._m
    m.fill(0)
    if (typeof s === 'number') {
      m[0] = this._round(s); m[5] = this._round(s); m[10] = this._round(s)
    } else {
      const v = s instanceof GfVec ? s.data : s
      m[0] = this._round(v[0]!); m[5] = this._round(v[1]!); m[10] = this._round(v[2]!)
    }
    m[15] = 1
    return this
  }
  setTranslate(t: VecLike): this {
    const o = t instanceof GfVec ? t.data : t
    this.setIdentity()
    this._m[12] = this._round(o[0]!)
    this._m[13] = this._round(o[1]!)
    this._m[14] = this._round(o[2]!)
    return this
  }
  setTranslateOnly(t: VecLike): this {
    const o = t instanceof GfVec ? t.data : t
    this._m[12] = this._round(o[0]!)
    this._m[13] = this._round(o[1]!)
    this._m[14] = this._round(o[2]!)
    this._m[15] = 1
    return this
  }
  extractTranslation(): GfVec {
    return new VEC3_CTORS[this.scalarKind](this._m[12]!, this._m[13]!, this._m[14]!)
  }

  // ---- rotation ----

  protected _setRotateFromQuat(r: number, ix: number, iy: number, iz: number): void {
    const m = this._m
    m[0] = this._round(1.0 - 2.0 * (iy * iy + iz * iz))
    m[1] = this._round(2.0 * (ix * iy + iz * r))
    m[2] = this._round(2.0 * (iz * ix - iy * r))
    m[4] = this._round(2.0 * (ix * iy - iz * r))
    m[5] = this._round(1.0 - 2.0 * (iz * iz + ix * ix))
    m[6] = this._round(2.0 * (iy * iz + ix * r))
    m[8] = this._round(2.0 * (iz * ix + iy * r))
    m[9] = this._round(2.0 * (iy * iz - ix * r))
    m[10] = this._round(1.0 - 2.0 * (iy * iy + ix * ix))
  }
  /** SetRotateOnly(Rotation | Quat | GfMatrix3) — sets 3x3, leaves translation. */
  setRotateOnly(rot: Rotation | Quat | GfMatrix3Base): this {
    if (rot instanceof GfMatrix3Base) {
      const m = this._m
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          m[this._idx(i, j)] = this._round(rot.getElement(i, j))
      return this
    }
    const q = isQuat(rot) ? rot : rotationToQuat(rot)
    this._setRotateFromQuat(q[0]!, q[1]!, q[2]!, q[3]!)
    return this
  }
  /** SetRotate — like SetRotateOnly but clears the translation/4th col+row. */
  setRotate(rot: Rotation | Quat | GfMatrix3Base): this {
    this.setRotateOnly(rot)
    const m = this._m
    m[3] = 0; m[7] = 0; m[11] = 0
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1
    return this
  }
  setTransform(rot: Rotation | GfMatrix3Base, translate: VecLike): this {
    this.setRotate(rot)
    return this.setTranslateOnly(translate)
  }

  extractRotation(): Rotation {
    return extractRotation4(this._m as unknown as Matrix4)
  }
  extractRotationQuat(): Quat {
    return extractRotationQuat4(this._m as unknown as Matrix4)
  }
  /** ExtractRotationMatrix — upper 3x3 as a GfMatrix3 of matching precision. */
  extractRotationMatrix(): GfMatrix {
    const m = this._m
    const Ctor = this.scalarKind === 'f' ? GfMatrix3f : GfMatrix3d
    return new Ctor(
      m[0]!, m[1]!, m[2]!,
      m[4]!, m[5]!, m[6]!,
      m[8]!, m[9]!, m[10]!,
    )
  }

  // ---- lookAt ----

  setLookAt(eye: VecLike, center: VecLike, up: VecLike): this {
    const e = asVec3(eye), c = asVec3(center), u = asVec3(up)
    const flat = setLookAt4(e, c, u)
    for (let k = 0; k < 16; k++) this._m[k] = this._round(flat[k]!)
    return this
  }

  // ---- handedness ----

  getHandedness(): number {
    return gfSgn(this.getDeterminant3())
  }
  isRightHanded(): boolean {
    return this.getHandedness() === 1.0
  }
  isLeftHanded(): boolean {
    return this.getHandedness() === -1.0
  }

  // ---- orthonormalize ----

  orthonormalize(): this {
    // Upstream divides out a non-unit homogeneous coordinate after the basis
    // orthogonalization; the translation row is otherwise preserved.
    orthonormalize3InPlace(this._m, this._round.bind(this), 4)
    const m = this._m
    if (m[15] !== 1.0 && Math.abs(m[15]!) > GF_MIN_VECTOR_LENGTH) {
      m[12] = this._round(m[12]! / m[15]!)
      m[13] = this._round(m[13]! / m[15]!)
      m[14] = this._round(m[14]! / m[15]!)
      m[15] = 1.0
    }
    return this
  }
  getOrthonormalized(): this {
    const r = this._fromFlat(this._m)
    r.orthonormalize()
    return r
  }

  // ---- factor / removeScaleShear ----

  /** Factor into (success, scaleOrientation r, scale s, rotation u, translation t,
   * projection p) such that M = r·Scale(s)·rᵀ·u·Translate(t)·p. eps defaults to
   * 1e-10 (double) / 1e-5 (float), matching upstream. */
  factor(eps?: number): {
    success: boolean
    scaleOrientation: GfMatrix4Base
    scale: GfVec
    rotation: GfMatrix4Base
    translation: GfVec
    projection: GfMatrix4Base
  } {
    const e = eps ?? (this.scalarKind === 'f' ? 1e-5 : 1e-10)
    const f = factorMatrix(this._m as unknown as Matrix4, e)
    return {
      success: f.nonSingular,
      scaleOrientation: this._fromFlat(f.rotation),
      scale: new VEC3_CTORS[this.scalarKind](f.scale[0], f.scale[1], f.scale[2]),
      rotation: this._fromFlat(f.shear),
      translation: new VEC3_CTORS[this.scalarKind](
        f.translation[0], f.translation[1], f.translation[2],
      ),
      projection: this._fromFlat(f.perspective),
    }
  }

  removeScaleShear(): GfMatrix4Base {
    const f = this.factor()
    if (!f.success) return this._fromFlat(this._m)
    // Remove shear: orthonormalize the rotation (u) part, then compose with
    // the translation.
    const rot = f.rotation.orthonormalize()
    const t = this._new().setTranslate(f.translation)
    return rot.getMultiply(t)
  }

  // ---- transform points/dirs ----

  /** Transform(vec3): GfProject(vec4), which scales by 1/w and leaves the
   * point unprojected when w is 0 (pxr/base/gf/homogeneous.h:55-58). Result
   * kind = f only if both this and the input are float. */
  Transform(v: GfVec): GfVec {
    const o = v.data
    const c0 = this._comp(o, 0) + this._m[12]!
    const c1 = this._comp(o, 1) + this._m[13]!
    const c2 = this._comp(o, 2) + this._m[14]!
    const w = this._comp(o, 3) + this._m[15]!
    const inv = w !== 0 ? 1 / w : 1
    return this._mkVec3(v, inv * c0, inv * c1, inv * c2)
  }
  /** TransformDir(vec3): upper 3x3 only (translation ignored). */
  transformDir(v: GfVec): GfVec {
    const o = v.data
    return this._mkVec3(v, this._comp(o, 0), this._comp(o, 1), this._comp(o, 2))
  }
  /** TransformAffine(vec3): like Transform but assumes 4th column (0,0,0,1). */
  transformAffine(v: GfVec): GfVec {
    const o = v.data
    return this._mkVec3(
      v,
      this._comp(o, 0) + this._m[12]!,
      this._comp(o, 1) + this._m[13]!,
      this._comp(o, 2) + this._m[14]!,
    )
  }
  protected _comp(o: readonly number[], col: number): number {
    return o[0]! * this._m[this._idx(0, col)]! +
      o[1]! * this._m[this._idx(1, col)]! +
      o[2]! * this._m[this._idx(2, col)]!
  }
  protected _mkVec3(input: GfVec, x: number, y: number, z: number): GfVec {
    const kind: ScalarKind =
      this.scalarKind === 'f' && input.scalarKind === 'f' ? 'f' : 'd'
    return new VEC3_CTORS[kind](x, y, z)
  }
}

export class GfMatrix4d extends GfMatrix4Base {
  readonly scalarKind: ScalarKind = 'd'
  constructor(...args: unknown[]) {
    super()
    this._alloc()
    this._construct(args)
  }
}
export class GfMatrix4f extends GfMatrix4Base {
  readonly scalarKind: ScalarKind = 'f'
  constructor(...args: unknown[]) {
    super()
    this._alloc()
    this._construct(args)
  }
}

// ---------------------------------------------------------------------------
// Shared helper: orthonormalize the upper 3x3 row basis in place, using
// double-precision GfVec3d exactly as upstream (Matrix3/4f also use GfVec3d).
// ---------------------------------------------------------------------------

function orthonormalize3InPlace(
  m: number[],
  round: (x: number) => number,
  stride = 3,
): void {
  const idx = (i: number, j: number): number => i * stride + j
  const r0 = new GfVec3d(m[idx(0, 0)]!, m[idx(0, 1)]!, m[idx(0, 2)]!)
  const r1 = new GfVec3d(m[idx(1, 0)]!, m[idx(1, 1)]!, m[idx(1, 2)]!)
  const r2 = new GfVec3d(m[idx(2, 0)]!, m[idx(2, 1)]!, m[idx(2, 2)]!)
  GfVec3d.orthogonalizeBasis(r0, r1, r2, true)
  const rows = [r0, r1, r2]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      m[idx(i, j)] = round(rows[i]!.get(j))
    }
  }
}

function asVec3(v: VecLike): Vec3 {
  const o = v instanceof GfVec ? v.data : v
  return [o[0]!, o[1]!, o[2]!]
}
