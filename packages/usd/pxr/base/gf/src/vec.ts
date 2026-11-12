// typescript-usd/gf — GfVec{2,3,4}{d,f,h,i} value types.
//
// Mirrors OpenUSD pxr/base/gf/vec{2,3,4}{d,f,i}.{h,cpp} (all generated from
// vec.template.h / vec.template.cpp). This is the foundational gf value type;
// other gf classes build on it. It is a first-class value-type surface
// (unlike the functional Matrix4 shim in matrix.ts) so the names/semantics
// match upstream 1:1.
//
// C++ operator -> TS method mapping (documented on each method):
//   operator[]            -> .get(i) / .data
//   operator==            -> .equals(other)
//   operator+ / +=        -> .Add(other) / .AddInPlace(other)
//   operator- (binary)    -> .Subtract(other) / .SubtractInPlace(other)
//   operator- (unary)     -> .GetNegated()
//   operator* (scalar)    -> .GetScaled(s) / .ScaleInPlace(s)
//   operator/ (scalar)    -> .GetDivided(s) / .DivideInPlace(s)
//   operator* (vec, dot)  -> .Dot(other)  (alias .GetDot for 2x compat)
//   operator^ (vec3)      -> .Cross(other) (alias .GetCross for 2x compat)
//
// Precision: 'f' types round through Math.fround, 'h' through IEEE binary16,
// 'i' truncates toward zero, and 'd' stores doubles verbatim.
//
// Minor surface note (not FAITHFULNESS-DEBT): the axis helpers XAxis/YAxis are
// inherited and ZAxis/WAxis are declared only on the dimensions that have them,
// matching upstream's per-dimension generation.

import { roundToHalf } from './half.ts'
import { GF_MIN_VECTOR_LENGTH, GF_MIN_ORTHO_TOLERANCE } from './limits.ts'

export type ScalarKind = 'd' | 'f' | 'h' | 'i'

/** Anything readable as a fixed-length numeric vector. */
export type VecLike = GfVec | readonly number[]

function asArray(v: VecLike): readonly number[] {
  return v instanceof GfVec ? v.data : v
}

/**
 * Common base for all GfVec value types. Stores components in `_data` already
 * rounded to the scalar kind. Subclasses declare `dimension` and `scalarKind`.
 */
export abstract class GfVec {
  abstract readonly dimension: number
  abstract readonly scalarKind: ScalarKind
  protected readonly _data: number[]

  /**
   * Constructs from: nothing (zero vector), a single number (fill all),
   * another GfVec / number[] (copy + convert), or exactly `dimension`
   * numbers (explicit). Mirrors GfVec's value/explicit/copy/pointer ctors.
   */
  protected constructor(dimension: number, args: ReadonlyArray<number | VecLike>) {
    // Array literals: packed storage, much cheaper to make than fill().
    this._data = dimension === 3 ? [0, 0, 0] : dimension === 2 ? [0, 0]
      : dimension === 4 ? [0, 0, 0, 0] : new Array<number>(dimension).fill(0)
    if (args.length === 0) {
      return
    }
    if (args.length === 1) {
      const a = args[0]!
      if (typeof a === 'number') {
        // GfVec(value): initialize all elements to a single value.
        for (let i = 0; i < dimension; i++) this._data[i] = a
        return
      }
      // GfVec(other) / GfVec(array): copy/convert componentwise.
      const arr = asArray(a)
      if (arr.length !== dimension) {
        throw new TypeError(
          `GfVec: expected ${dimension} components, got ${arr.length}`,
        )
      }
      for (let i = 0; i < dimension; i++) this._data[i] = arr[i]!
      return
    }
    // GfVec(s0, s1, ...): explicit per-component arguments.
    if (args.length !== dimension) {
      throw new TypeError(
        `GfVec: expected ${dimension} arguments, got ${args.length}`,
      )
    }
    for (let i = 0; i < dimension; i++) {
      const a = args[i]!
      if (typeof a !== 'number') {
        throw new TypeError('GfVec: explicit constructor takes numbers')
      }
      this._data[i] = a
    }
  }

  /** Round a value to this vec's scalar kind (fround for f, trunc for i). */
  protected _round(x: number): number {
    if (this.scalarKind === 'f') return Math.fround(x)
    if (this.scalarKind === 'h') return roundToHalf(x)
    if (this.scalarKind === 'i') return Math.trunc(x)
    return x
  }

  /** Build a new instance of the SAME runtime type, rounding components. */
  protected _sameType(data: readonly number[]): this {
    const Ctor = this.constructor as new () => this
    const v = new Ctor()
    for (let i = 0; i < this.dimension; i++) {
      v._data[i] = v._round(data[i]!)
    }
    return v
  }

  /** Direct (readonly) data access. Mirrors data()/GetArray(). */
  get data(): readonly number[] {
    return this._data
  }

  /** Indexing: operator[] const. */
  get(i: number): number {
    if (i < 0) i += this.dimension
    if (i < 0 || i >= this.dimension) {
      throw new RangeError(`GfVec index ${i} out of range`)
    }
    return this._data[i]!
  }

  /** Mutating indexed write: operator[] non-const. Rounds to scalar kind. */
  setComponent(i: number, value: number): this {
    if (i < 0) i += this.dimension
    if (i < 0 || i >= this.dimension) {
      throw new RangeError(`GfVec index ${i} out of range`)
    }
    this._data[i] = this._round(value)
    return this
  }

  /** Set all elements (in place). Mirrors GfVec::Set. */
  Set(...values: number[]): this {
    if (values.length !== this.dimension) {
      throw new TypeError(
        `Set: expected ${this.dimension} values, got ${values.length}`,
      )
    }
    for (let i = 0; i < this.dimension; i++) {
      this._data[i] = this._round(values[i]!)
    }
    return this
  }

  /** operator== (componentwise, exact). Cross-type compares promoted values. */
  equals(other: VecLike): boolean {
    const o = asArray(other)
    if (o.length !== this.dimension) return false
    for (let i = 0; i < this.dimension; i++) {
      if (this._data[i] !== o[i]) return false
    }
    return true
  }

  // ---- arithmetic (returning new vectors) ----

  /** operator+ : componentwise addition. */
  add(other: VecLike): this {
    const o = asArray(other)
    return this._sameType(this._data.map((x, i) => x + o[i]!))
  }

  /** operator- (binary) : componentwise subtraction. */
  subtract(other: VecLike): this {
    const o = asArray(other)
    return this._sameType(this._data.map((x, i) => x - o[i]!))
  }

  /** operator* (scalar) : scale by a double. */
  getScaled(s: number): this {
    return this._sameType(this._data.map((x) => x * s))
  }

  /**
   * operator/ (scalar). Floating types multiply by 1/s (matching upstream's
   * `*this *= (1.0/s)`); integer types do integer division by the scalar.
   */
  getDivided(s: number): this {
    if (this.scalarKind === 'i') {
      // Integer division truncates toward zero (Math.trunc via _round).
      return this._sameType(this._data.map((x) => x / s))
    }
    return this.getScaled(1.0 / s)
  }

  /** operator- (unary) : negated copy. */
  getNegated(): this {
    return this._sameType(this._data.map((x) => -x))
  }

  // ---- arithmetic (in place, mutating; return this) ----

  /** operator+= */
  addInPlace(other: VecLike): this {
    const o = asArray(other)
    for (let i = 0; i < this.dimension; i++) {
      this._data[i] = this._round(this._data[i]! + o[i]!)
    }
    return this
  }

  /** operator-= */
  subtractInPlace(other: VecLike): this {
    const o = asArray(other)
    for (let i = 0; i < this.dimension; i++) {
      this._data[i] = this._round(this._data[i]! - o[i]!)
    }
    return this
  }

  /** operator*= (scalar) */
  scaleInPlace(s: number): this {
    for (let i = 0; i < this.dimension; i++) {
      this._data[i] = this._round(this._data[i]! * s)
    }
    return this
  }

  /** operator/= (scalar) */
  divideInPlace(s: number): this {
    if (this.scalarKind === 'i') {
      for (let i = 0; i < this.dimension; i++) {
        this._data[i] = this._round(this._data[i]! / s)
      }
      return this
    }
    return this.scaleInPlace(1.0 / s)
  }

  // ---- products / geometry ----

  /** operator* (vec) : dot (inner) product. See GfDot(). */
  dot(other: VecLike): number {
    const o = asArray(other)
    let s = 0
    for (let i = 0; i < this.dimension; i++) s += this._data[i]! * o[i]!
    return this._round(s)
  }

  /** GetDot: 2x compatibility alias for Dot. */
  getDot(other: VecLike): number {
    return this.dot(other)
  }

  /** GetProjection: v * (*this * v). */
  GetProjection(v: this): this {
    return v.getScaled(this.dot(v))
  }

  /** GetComplement: *this - this->GetProjection(b). */
  GetComplement(b: this): this {
    return this.subtract(this.GetProjection(b))
  }

  /** GetLengthSq: *this * *this. */
  getLengthSq(): number {
    return this.dot(this)
  }

  /** GetLength: sqrt(GetLengthSq()). (Defined for floating types upstream.) */
  GetLength(): number {
    return this._round(Math.sqrt(this.getLengthSq()))
  }

  /**
   * Normalize in place to unit length; returns the pre-normalization length.
   * If length <= eps, divides by eps instead (upstream behavior). Mirrors
   * GfVec*::Normalize exactly: `*this /= (length > eps) ? length : eps`.
   */
  Normalize(eps: number = GF_MIN_VECTOR_LENGTH): number {
    const length = this.GetLength()
    this.divideInPlace(length > eps ? length : eps)
    return length
  }

  /** GetNormalized: normalized copy. */
  GetNormalized(eps: number = GF_MIN_VECTOR_LENGTH): this {
    const normalized = this._sameType(this._data)
    normalized.Normalize(eps)
    return normalized
  }

  // ---- string / hash ----

  /** ostream form: "(x, y, z)". */
  toString(): string {
    return `(${this._data.join(', ')})`
  }

  /** repr form: "Gf.<Type>(x, y, z)" round-trippable to the constructor. */
  repr(): string {
    return `Gf.${this.constructor.name}(${this._data.join(', ')})`
  }

  /** Deterministic hash key (TfHash::Combine analogue). */
  hash(): string {
    return `${this.constructor.name}:${this._data.join(',')}`
  }

  // ---- inherited axis helpers (all dims have X and Y) ----

  static xAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(0)
  }
  static yAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(1)
  }
  static Axis<T extends GfVec>(this: new () => T, i: number): T {
    const v = new this()
    if (i < v.dimension) v.setComponent(i, 1)
    return v
  }
}

// ============================ dimension 2 ============================

export class GfVec2d extends GfVec {
  readonly dimension = 2
  readonly scalarKind: ScalarKind = 'd'
  constructor(...args: Array<number | VecLike>) {
    super(2, args)
  }
}

export class GfVec2f extends GfVec {
  readonly dimension = 2
  readonly scalarKind: ScalarKind = 'f'
  constructor(...args: Array<number | VecLike>) {
    super(2, args)
    for (let i = 0; i < 2; i++) this._data[i] = Math.fround(this._data[i]!)
  }
}

export class GfVec2h extends GfVec {
  readonly dimension = 2
  readonly scalarKind: ScalarKind = 'h'
  constructor(...args: Array<number | VecLike>) {
    super(2, args)
    for (let i = 0; i < 2; i++) this._data[i] = roundToHalf(this._data[i]!)
  }
}

export class GfVec2i extends GfVec {
  readonly dimension = 2
  readonly scalarKind: ScalarKind = 'i'
  constructor(...args: Array<number | VecLike>) {
    super(2, args)
    for (let i = 0; i < 2; i++) this._data[i] = Math.trunc(this._data[i]!)
  }
}

// ============================ dimension 3 ============================

/**
 * Shared dimension-3 floating-point surface: cross product, basis
 * orthogonalization, and orthonormal-frame construction (upstream gates these
 * on IS_FLOATING_POINT && DIM==3, so GfVec3i does NOT get them).
 */
abstract class GfVec3Float extends GfVec {
  readonly dimension = 3

  static zAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(2)
  }

  /** operator^ / GfCross : cross product. */
  Cross(v: this): this {
    const a = this._data
    const b = v.data
    return this._sameType([
      a[1]! * b[2]! - a[2]! * b[1]!,
      a[2]! * b[0]! - a[0]! * b[2]!,
      a[0]! * b[1]! - a[1]! * b[0]!,
    ])
  }

  /** GetCross: 2x compatibility alias for Cross. */
  GetCross(v: this): this {
    return this.Cross(v)
  }

  /**
   * Orthogonalize (and optionally normalize) a basis in place. Returns whether
   * the iteration converged. Verbatim port of GfOrthogonalizeBasis.
   */
  static orthogonalizeBasis(
    tx: GfVec3Float,
    ty: GfVec3Float,
    tz: GfVec3Float,
    normalize: boolean,
    eps: number = GF_MIN_ORTHO_TOLERANCE,
  ): boolean {
    let ax: GfVec3Float, ay: GfVec3Float, az: GfVec3Float
    if (normalize) {
      tx.Normalize()
      ty.Normalize()
      tz.Normalize()
      ax = tx.clone()
      ay = ty.clone()
      az = tz.clone()
    } else {
      ax = tx.clone()
      ay = ty.clone()
      az = tz.clone()
      ax.Normalize()
      ay.Normalize()
      az.Normalize()
    }

    // Colinear check (also guards the error metric below from false zeros).
    if (
      gfIsCloseVec(ax, ay, eps) ||
      gfIsCloseVec(ax, az, eps) ||
      gfIsCloseVec(ay, az, eps)
    ) {
      return false
    }

    const MAX_ITERS = 20
    let iter = 0
    for (; iter < MAX_ITERS; ++iter) {
      let bx = tx.clone()
      let by = ty.clone()
      let bz = tz.clone()

      bx = bx.subtract(ay.getScaled(ay.dot(bx)))
      bx = bx.subtract(az.getScaled(az.dot(bx)))

      by = by.subtract(ax.getScaled(ax.dot(by)))
      by = by.subtract(az.getScaled(az.dot(by)))

      bz = bz.subtract(ax.getScaled(ax.dot(bz)))
      bz = bz.subtract(ay.getScaled(ay.dot(bz)))

      const cx = tx.add(bx).getScaled(0.5)
      const cy = ty.add(by).getScaled(0.5)
      const cz = tz.add(bz).getScaled(0.5)

      if (normalize) {
        cx.Normalize()
        cy.Normalize()
        cz.Normalize()
      }

      const xDiff = tx.subtract(cx)
      const yDiff = ty.subtract(cy)
      const zDiff = tz.subtract(cz)

      const error = xDiff.dot(xDiff) + yDiff.dot(yDiff) + zDiff.dot(zDiff)

      // error is squared, so compare to squared tolerance
      if (error < eps * eps) break

      tx.copyFrom(cx)
      ty.copyFrom(cy)
      tz.copyFrom(cz)

      ax = tx.clone()
      ay = ty.clone()
      az = tz.clone()

      if (!normalize) {
        ax.Normalize()
        ay.Normalize()
        az.Normalize()
      }
    }

    return iter < MAX_ITERS
  }

  /**
   * Build two unit vectors [v1, v2] such that v1, v2, *this are mutually
   * orthogonal. Verbatim port of GfBuildOrthonormalFrame.
   */
  BuildOrthonormalFrame(eps: number = GF_MIN_VECTOR_LENGTH): [this, this] {
    const len = this.GetLength()
    if (len === 0) {
      return [this._sameType([0, 0, 0]), this._sameType([0, 0, 0])]
    }
    const unitDir = this.getDivided(len)
    // *v1 = XAxis() ^ unitDir; degenerate fallback to YAxis() ^ unitDir.
    let r1 = this._sameType([1, 0, 0]).Cross(unitDir)
    if (r1.getLengthSq() < 1e-4 * 1e-4) {
      r1 = this._sameType([0, 1, 0]).Cross(unitDir)
    }
    r1.Normalize()
    const r2 = unitDir.Cross(r1) // this is of unit length
    if (len < eps) {
      const desiredLen = len / eps
      r1 = r1.getScaled(desiredLen)
      return [r1, r2.getScaled(desiredLen)]
    }
    return [r1, r2]
  }

  /** Copy components from another same-dimension vec (in place, rounded). */
  copyFrom(other: GfVec): this {
    for (let i = 0; i < this.dimension; i++) {
      this._data[i] = this._round(other.get(i))
    }
    return this
  }

  /** Same-type clone. */
  clone(): this {
    return this._sameType(this._data)
  }
}

export class GfVec3d extends GfVec3Float {
  readonly scalarKind: ScalarKind = 'd'
  constructor(...args: Array<number | VecLike>) {
    super(3, args)
  }
}

export class GfVec3f extends GfVec3Float {
  readonly scalarKind: ScalarKind = 'f'
  constructor(...args: Array<number | VecLike>) {
    super(3, args)
    for (let i = 0; i < 3; i++) this._data[i] = Math.fround(this._data[i]!)
  }
}

export class GfVec3h extends GfVec3Float {
  readonly scalarKind: ScalarKind = 'h'
  constructor(...args: Array<number | VecLike>) {
    super(3, args)
    for (let i = 0; i < 3; i++) this._data[i] = roundToHalf(this._data[i]!)
  }
}

export class GfVec3i extends GfVec {
  readonly dimension = 3
  readonly scalarKind: ScalarKind = 'i'
  constructor(...args: Array<number | VecLike>) {
    super(3, args)
    for (let i = 0; i < 3; i++) this._data[i] = Math.trunc(this._data[i]!)
  }
  static zAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(2)
  }
}

// ============================ dimension 4 ============================

export class GfVec4d extends GfVec {
  readonly dimension = 4
  readonly scalarKind: ScalarKind = 'd'
  constructor(...args: Array<number | VecLike>) {
    super(4, args)
  }
  static zAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(2)
  }
  static wAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(3)
  }
}

export class GfVec4f extends GfVec {
  readonly dimension = 4
  readonly scalarKind: ScalarKind = 'f'
  constructor(...args: Array<number | VecLike>) {
    super(4, args)
    for (let i = 0; i < 4; i++) this._data[i] = Math.fround(this._data[i]!)
  }
  static zAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(2)
  }
  static wAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(3)
  }
}

export class GfVec4h extends GfVec {
  readonly dimension = 4
  readonly scalarKind: ScalarKind = 'h'
  constructor(...args: Array<number | VecLike>) {
    super(4, args)
    for (let i = 0; i < 4; i++) this._data[i] = roundToHalf(this._data[i]!)
  }
  static zAxis(): GfVec4h { return GfVec4h.Axis(2) }
  static wAxis(): GfVec4h { return GfVec4h.Axis(3) }
}

export class GfVec4i extends GfVec {
  readonly dimension = 4
  readonly scalarKind: ScalarKind = 'i'
  constructor(...args: Array<number | VecLike>) {
    super(4, args)
    for (let i = 0; i < 4; i++) this._data[i] = Math.trunc(this._data[i]!)
  }
  static zAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(2)
  }
  static wAxis<T extends GfVec>(this: new () => T): T {
    return (this as unknown as { Axis(i: number): T }).Axis(3)
  }
}

// ============================ free functions ============================

/** GfCompMult: component-wise multiplication. */
export function GfCompMult<T extends GfVec>(v1: T, v2: T): T {
  const Ctor = v1.constructor as new (o: VecLike) => T
  const r = new Ctor(v1)
  for (let i = 0; i < r.dimension; i++) r.setComponent(i, v1.get(i) * v2.get(i))
  return r
}

/** GfCompDiv: component-wise quotient. */
export function GfCompDiv<T extends GfVec>(v1: T, v2: T): T {
  const Ctor = v1.constructor as new (o: VecLike) => T
  const r = new Ctor(v1)
  for (let i = 0; i < r.dimension; i++) r.setComponent(i, v1.get(i) / v2.get(i))
  return r
}

function validateNumericVec(v: VecLike, label: string): readonly number[] {
  if (v instanceof GfVec) return v.data
  if (!Array.isArray(v)) {
    throw new TypeError(`GfDot: ${label} is not a vector`)
  }
  for (const x of v) {
    if (typeof x !== 'number' || Number.isNaN(x)) {
      throw new TypeError(`GfDot: ${label} has non-numeric component`)
    }
  }
  return v
}

/** GfDot: dot product. Accepts GfVec, arrays or tuples (test_TupleToVec). */
export function GfDot(v1: VecLike, v2: VecLike): number {
  const a = validateNumericVec(v1, 'v1')
  const b = validateNumericVec(v2, 'v2')
  if (a.length !== b.length) {
    throw new TypeError(
      `GfDot: dimension mismatch ${a.length} vs ${b.length}`,
    )
  }
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/** GfGetLength */
export function GfGetLength(v: GfVec): number {
  return v.GetLength()
}

/** GfNormalize: in-place; returns pre-normalization length. */
export function GfNormalize(v: GfVec, eps: number = GF_MIN_VECTOR_LENGTH): number {
  return v.Normalize(eps)
}

/** GfGetNormalized */
export function GfGetNormalized<T extends GfVec>(
  v: T,
  eps: number = GF_MIN_VECTOR_LENGTH,
): T {
  return v.GetNormalized(eps) as T
}

/** GfGetProjection */
export function GfGetProjection<T extends GfVec>(a: T, b: T): T {
  return a.GetProjection(b as unknown as T & GfVec) as T
}

/** GfGetComplement */
export function GfGetComplement<T extends GfVec>(a: T, b: T): T {
  return a.GetComplement(b as unknown as T & GfVec) as T
}

/** GfIsClose: |v1 - v2|^2 <= tolerance^2. */
export function GfIsClose(v1: GfVec, v2: GfVec, tolerance: number): boolean {
  return gfIsCloseVec(v1, v2, tolerance)
}

function gfIsCloseVec(v1: GfVec, v2: GfVec, tolerance: number): boolean {
  const a = v1.data
  const b = v2.data
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tolerance * tolerance
}

/** GfCross (vec3 floating). */
export function GfCross<T extends GfVec3Float>(v1: T, v2: T): T {
  return v1.Cross(v2) as T
}

/** GfGetCross alias. */
export function GfGetCross<T extends GfVec3Float>(v1: T, v2: T): T {
  return v1.Cross(v2) as T
}

/** GfOrthogonalizeBasis (free-function form). */
export function GfOrthogonalizeBasis(
  tx: GfVec3Float,
  ty: GfVec3Float,
  tz: GfVec3Float,
  normalize: boolean,
  eps: number = GF_MIN_ORTHO_TOLERANCE,
): boolean {
  return GfVec3d.orthogonalizeBasis(tx, ty, tz, normalize, eps)
}

/** GfBuildOrthonormalFrame (free-function form). */
export function GfBuildOrthonormalFrame<T extends GfVec3Float>(
  v0: T,
  eps: number = GF_MIN_VECTOR_LENGTH,
): [T, T] {
  return v0.BuildOrthonormalFrame(eps) as [T, T]
}

/**
 * GfSlerp: spherical linear interpolation in three dimensions. Verbatim port
 * of GfSlerp (vec3.cpp): lerp for tiny angle, orthonormal-frame interpolation
 * for opposing vectors, else the sin-weighted blend.
 */
export function GfSlerp<T extends GfVec3Float>(alpha: number, v0: T, v1: T): T {
  const dot = Math.max(-1.0, Math.min(1.0, v0.dot(v1)))
  const angle = Math.acos(dot)

  // Very small angle: just lerp.
  if (Math.abs(angle) < 0.001) {
    // GfLerp: (1-alpha)*v0 + alpha*v1
    return v0.getScaled(1 - alpha).add(v1.getScaled(alpha)) as T
  }

  const sinAngle = Math.sin(angle)

  // Nearly opposing: interpolate across an arbitrary orthogonal vector.
  if (Math.abs(sinAngle) < 0.00001) {
    const [vX] = v0.BuildOrthonormalFrame()
    return v0
      .getScaled(Math.cos(alpha * Math.PI))
      .add(vX.getScaled(Math.sin(alpha * Math.PI))) as T
  }

  const oneOverSinAngle = 1.0 / sinAngle
  return v0
    .getScaled(Math.sin((1.0 - alpha) * angle) * oneOverSinAngle)
    .add(v1.getScaled(Math.sin(alpha * angle) * oneOverSinAngle)) as T
}
