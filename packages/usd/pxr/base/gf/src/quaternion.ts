// Ported from OpenUSD 26.11.1: pxr/base/gf/quaternion.cpp,
//  pxr/base/gf/quaternion.h, pxr/base/gf/quat.template.cpp,
//  pxr/base/gf/quat.template.h, pxr/base/gf/quatd.cpp, pxr/base/gf/quatd.h,
//  and 2 more cited below
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfQuaternion + the GfQuat{d,f,h} value types.
//
// Faithful port of:
//   pxr/base/gf/quaternion.{h,cpp}          -> GfQuaternion (generic, double)
//   pxr/base/gf/quat.template.{h,cpp}        -> GfQuatd / GfQuatf
//   (instantiated as quatd.{h,cpp}, quatf.{h,cpp})
//
// Internal convention (typescript-usd memory usdc-quat-component-order): the value-type
// API is w-FIRST — Gf.Quaternion(real, Gf.Vec3d(i, j, k)). Crate's
// imaginary-first DISK order is a serialization detail handled at the
// parse/write boundary and does NOT apply to this surface.
//
// C++ operator -> TS method mapping (documented on each method):
//   operator* (quat,  quat)  -> .GetMultiply(q)        (quaternion product / compose)
//   operator*= (quat)        -> .MultiplyInPlace(q)
//   operator* (quat, scalar) -> .GetScaled(s)
//   operator*= (scalar)      -> .ScaleInPlace(s)
//   operator/ (quat, scalar) -> .GetDivided(s)
//   operator/= (scalar)      -> .DivideInPlace(s)
//   operator+ / +=           -> .Add(q) / .AddInPlace(q)
//   operator- (binary) / -=  -> .Subtract(q) / .SubtractInPlace(q)
//   operator- (unary)        -> .GetNegated()           (GfQuat{d,f} only)
//   operator==               -> .equals(q)
//   GfDot(q1, q2)            -> GfQuatDot(q1, q2)
//   GfSlerp(alpha, q0, q1)  -> GfSlerp(alpha, q0, q1)
//
// Precision: GfQuaternion and GfQuatd store doubles + a GfVec3d imaginary part.
// GfQuatf rounds through float32; GfQuath rounds through IEEE binary16.

import { roundToHalf } from './half.ts'
import { GfSlerp as GfVecSlerp, GfVec, GfVec3d, GfVec3f, GfVec3h, type VecLike } from './vec.ts'
import { GF_MIN_VECTOR_LENGTH } from './limits.ts'

/** Any quaternion value type in this module. */
export type AnyQuat = GfQuaternion | GfQuatd | GfQuatf | GfQuath

// ---------------------------------------------------------------------------
// Shared implementation. Holds the real scalar + a GfVec3{d,f} imaginary part
// and all the math that GfQuaternion / GfQuatd / GfQuatf have in common.
// ---------------------------------------------------------------------------

export abstract class GfQuatImpl {
  protected _real: number
  protected _imaginary: GfVec

  protected constructor(real: number, imaginary: GfVec) {
    this._real = real
    this._imaginary = imaginary
  }

  /** Round a scalar to this quaternion's precision (fround for 'f'). */
  protected abstract _round(x: number): number
  /** @internal The scalar type's rounding, for GfSlerp below. */
  _roundScalar(x: number): number { return this._round(x) }
  /** Build an imaginary vector of this quaternion's precision. */
  protected abstract _makeVec(x: number, y: number, z: number): GfVec
  /** Build a new quaternion of this exact runtime type. */
  protected abstract _create(real: number, imaginary: GfVec): this

  // ---- accessors ----

  /** GetReal(): the real coefficient. */
  GetReal(): number {
    return this._real
  }

  /** SetReal(): set the real coefficient. */
  setReal(real: number): void {
    this._real = this._round(real)
  }

  /** GetImaginary(): the imaginary coefficients (GfVec3{d,f}). */
  GetImaginary(): GfVec {
    return this._imaginary
  }

  /** SetImaginary(): set the imaginary coefficients from a vec or [i,j,k]. */
  setImaginary(imaginary: VecLike): void {
    const a = imaginary instanceof GfVec
      ? imaginary.data
      : (imaginary as readonly number[])
    this._imaginary = this._makeVec(a[0]!, a[1]!, a[2]!)
  }

  // ---- length / normalization ----

  /** Square of the length: GfDot(*this, *this). */
  protected _getLengthSquared(): number {
    return this._round(
      this._real * this._real + this._imaginary.dot(this._imaginary),
    )
  }

  /** GetLength(): geometric length sqrt(_GetLengthSquared()). */
  GetLength(): number {
    return this._round(Math.sqrt(this._getLengthSquared()))
  }

  /**
   * GetNormalized(): unit-length copy. If length < eps, returns identity.
   * (GfQuaternion divides by length directly; GfQuat template normalizes a
   * copy in place — numerically identical, ported per-subclass.)
   */
  GetNormalized(eps: number = GF_MIN_VECTOR_LENGTH): this {
    const ret = this._create(this._real, this._cloneVec())
    ret.Normalize(eps)
    return ret
  }

  /**
   * Normalize(): scale to unit length in place; returns the pre-normalization
   * length. If length < eps, sets this quaternion to identity.
   */
  Normalize(eps: number = GF_MIN_VECTOR_LENGTH): number {
    const length = this.GetLength()
    if (length < eps) {
      this._real = this._round(1.0)
      this._imaginary = this._makeVec(0, 0, 0)
    } else {
      this.divideInPlace(length)
    }
    return length
  }

  /**
   * GetInverse(): reciprocal = conjugate / lengthSquared. Shared formula
   * (GfQuaternion has no GetConjugate method but computes the same thing).
   */
  getInverse(): this {
    const lenSq = this._getLengthSquared()
    const conj = this._create(this._real, this._imaginary.getNegated())
    return conj.getDivided(lenSq)
  }

  // ---- equality ----

  /** operator== : real and imaginary parts must match exactly. */
  equals(q: GfQuatImpl): boolean {
    return this._real === q._real && this._imaginary.equals(q._imaginary)
  }

  // ---- quaternion product (operator*, operator*=) ----

  /**
   * operator*= : post-multiply (Hamilton product) q into this, in place.
   * (Ar,Ai)*(Br,Bi) = (Ar*Br - Ai.Bi, Ar*Bi + Br*Ai + Ai x Bi).
   */
  multiplyInPlace(q: GfQuatImpl): this {
    const r1 = this._real
    const r2 = q._real
    const i1 = this._imaginary
    const i2 = q._imaginary

    const r = r1 * r2 - i1.dot(i2)
    const a1 = i1.data
    const a2 = i2.data
    const i = this._makeVec(
      r1 * a2[0]! + r2 * a1[0]! + (a1[1]! * a2[2]! - a1[2]! * a2[1]!),
      r1 * a2[1]! + r2 * a1[1]! + (a1[2]! * a2[0]! - a1[0]! * a2[2]!),
      r1 * a2[2]! + r2 * a1[2]! + (a1[0]! * a2[1]! - a1[1]! * a2[0]!),
    )

    this._real = this._round(r)
    this._imaginary = i
    return this
  }

  /** operator* (quat, quat): the quaternion product (compose). */
  getMultiply(q: GfQuatImpl): this {
    return this._create(this._real, this._cloneVec()).multiplyInPlace(q)
  }

  // ---- scalar mul / div ----

  /** operator*= (scalar): scale coefficients in place. */
  scaleInPlace(s: number): this {
    this._real = this._round(this._real * s)
    this._imaginary = this._makeVec(
      this._imaginary.get(0) * s,
      this._imaginary.get(1) * s,
      this._imaginary.get(2) * s,
    )
    return this
  }

  /** operator* (quat, scalar) / (scalar, quat): scaled copy. */
  getScaled(s: number): this {
    return this._create(this._real, this._cloneVec()).scaleInPlace(s)
  }

  /** operator/= (scalar): divide coefficients in place. */
  divideInPlace(s: number): this {
    this._real = this._round(this._real / s)
    this._imaginary = this._makeVec(
      this._imaginary.get(0) / s,
      this._imaginary.get(1) / s,
      this._imaginary.get(2) / s,
    )
    return this
  }

  /** operator/ (quat, scalar): divided copy. */
  getDivided(s: number): this {
    return this._create(this._real, this._cloneVec()).divideInPlace(s)
  }

  // ---- componentwise add / subtract ----

  /** operator+= : componentwise add in place. */
  addInPlace(q: GfQuatImpl): this {
    this._real = this._round(this._real + q._real)
    this._imaginary = this._makeVec(
      this._imaginary.get(0) + q._imaginary.get(0),
      this._imaginary.get(1) + q._imaginary.get(1),
      this._imaginary.get(2) + q._imaginary.get(2),
    )
    return this
  }

  /** operator+ : componentwise sum. */
  add(q: GfQuatImpl): this {
    return this._create(this._real, this._cloneVec()).addInPlace(q)
  }

  /** operator-= : componentwise subtract in place. */
  subtractInPlace(q: GfQuatImpl): this {
    this._real = this._round(this._real - q._real)
    this._imaginary = this._makeVec(
      this._imaginary.get(0) - q._imaginary.get(0),
      this._imaginary.get(1) - q._imaginary.get(1),
      this._imaginary.get(2) - q._imaginary.get(2),
    )
    return this
  }

  /** operator- (binary) : componentwise difference. */
  subtract(q: GfQuatImpl): this {
    return this._create(this._real, this._cloneVec()).subtractInPlace(q)
  }

  // ---- string / hash ----

  /** ostream form for GfQuaternion: "(r + (x, y, z))". Overridden by GfQuat. */
  toString(): string {
    return `(${this._real} + ${this._imaginary.toString()})`
  }

  /** Deterministic hash key (TfHash::Combine analogue). */
  hash(): string {
    return `${this.constructor.name}:${this._real};${this._imaginary.data.join(',')}`
  }

  /** Same-precision clone of the imaginary vector. */
  protected _cloneVec(): GfVec {
    const d = this._imaginary.data
    return this._makeVec(d[0]!, d[1]!, d[2]!)
  }
}

// ---------------------------------------------------------------------------
// GfQuaternion — the generic quaternion (pxr/base/gf/quaternion.h).
//
// Always double precision with a GfVec3d imaginary part. NOTE: this class has
// NO 4-coefficient constructor, NO GetConjugate(), NO Transform(), and NO unary
// negation — those exist only on GfQuat{d,f} (the test exercises them only for
// the non-generic types).
// ---------------------------------------------------------------------------

export class GfQuaternion extends GfQuatImpl {
  /**
   * Constructors mirroring quaternion.h:
   *   new GfQuaternion()                 -> zero (real 0, imaginary (0,0,0))
   *   new GfQuaternion(realVal)          -> real = realVal, imaginary (0,0,0)
   *   new GfQuaternion(real, imaginary)  -> real + GfVec3d/[i,j,k] imaginary
   *   new GfQuaternion(otherQuat)        -> copy/convert from any quaternion
   */
  constructor(real?: number | AnyQuat, imaginary?: VecLike) {
    if (real === undefined) {
      super(0, new GfVec3d(0, 0, 0))
      return
    }
    if (real instanceof GfQuatImpl) {
      super(real.GetReal(), new GfVec3d(real.GetImaginary()))
      return
    }
    if (imaginary === undefined) {
      super(real, new GfVec3d(0, 0, 0))
      return
    }
    const a = imaginary instanceof GfVec
      ? imaginary.data
      : (imaginary as readonly number[])
    super(real, new GfVec3d(a[0]!, a[1]!, a[2]!))
  }

  protected override _round(x: number): number {
    return x
  }
  protected override _makeVec(x: number, y: number, z: number): GfVec {
    return new GfVec3d(x, y, z)
  }
  protected override _create(real: number, imaginary: GfVec): this {
    const q = new GfQuaternion()
    q._real = real
    q._imaginary = imaginary
    return q as this
  }

  override GetImaginary(): GfVec3d {
    return this._imaginary as GfVec3d
  }

  /** GetZero(): real 0, imaginary (0,0,0). */
  static getZero(): GfQuaternion {
    return new GfQuaternion(0, new GfVec3d(0, 0, 0))
  }

  /** GetIdentity(): real 1, imaginary (0,0,0). */
  static getIdentity(): GfQuaternion {
    return new GfQuaternion(1, new GfVec3d(0, 0, 0))
  }
}

// ---------------------------------------------------------------------------
// GfQuat — shared base for the typed quaternions GfQuatd / GfQuatf. Adds the
// surface that the generic GfQuaternion lacks: the 4-coefficient constructor,
// GetConjugate(), Transform(), unary negation, and cross-precision conversion.
// ---------------------------------------------------------------------------

abstract class GfQuat extends GfQuatImpl {
  /** GetConjugate(): same real, negated imaginary. */
  getConjugate(): this {
    return this._create(this._real, this._imaginary.getNegated())
  }

  /** operator- (unary): negate real and imaginary. */
  getNegated(): this {
    return this._create(-this._real, this._imaginary.getNegated())
  }

  /**
   * Transform(point): rotate `point` by this quaternion. Equivalent to
   *   (q * GfQuat(0, point) * q.GetInverse()).GetImaginary()
   * but uses the closed-form
   *   (2*(Qi.P)*Qi + (Qr^2 - Qi.Qi)*P + 2*Qr*(Qi x P)) / (Qr^2 + Qi.Qi).
   */
  Transform(point: GfVec): GfVec {
    const tmpDot = this._imaginary.dot(this._imaginary)
    const tmpSqr = this._real * this._real
    const Qi = this._imaginary
    const QiDotP = Qi.dot(point)
    const di = Qi.data
    const dp = point.data
    // Qi x P
    const cross = this._makeVec(
      di[1]! * dp[2]! - di[2]! * dp[1]!,
      di[2]! * dp[0]! - di[0]! * dp[2]!,
      di[0]! * dp[1]! - di[1]! * dp[0]!,
    )
    const denom = tmpSqr + tmpDot
    const cd = cross.data
    return this._makeVec(
      (2 * QiDotP * di[0]! + (tmpSqr - tmpDot) * dp[0]! + 2 * this._real * cd[0]!) / denom,
      (2 * QiDotP * di[1]! + (tmpSqr - tmpDot) * dp[1]! + 2 * this._real * cd[1]!) / denom,
      (2 * QiDotP * di[2]! + (tmpSqr - tmpDot) * dp[2]! + 2 * this._real * cd[2]!) / denom,
    )
  }

  /** ostream form for GfQuat{d,f}: "(re, i, j, k)". */
  override toString(): string {
    const d = this._imaginary.data
    return `(${this._real}, ${d[0]}, ${d[1]}, ${d[2]})`
  }
}

// ---------------------------------------------------------------------------
// GfQuatd — double-precision quaternion (quatd.h).
// ---------------------------------------------------------------------------

export class GfQuatd extends GfQuat {
  /**
   *   new GfQuatd()                    -> zero
   *   new GfQuatd(realVal)             -> real = realVal, imaginary (0,0,0)
   *   new GfQuatd(real, i, j, k)       -> explicit coefficients
   *   new GfQuatd(real, imaginary)     -> real + GfVec3/[i,j,k] imaginary
   *   new GfQuatd(otherQuat)           -> copy/convert from any quaternion
   */
  constructor(
    real?: number | AnyQuat,
    imaginary?: VecLike | number,
    j?: number,
    k?: number,
  ) {
    if (real === undefined) {
      super(0, new GfVec3d(0, 0, 0))
      return
    }
    if (real instanceof GfQuatImpl) {
      super(real.GetReal(), new GfVec3d(real.GetImaginary()))
      return
    }
    if (imaginary === undefined) {
      super(real, new GfVec3d(0, 0, 0))
      return
    }
    if (typeof imaginary === 'number') {
      // (real, i, j, k)
      super(real, new GfVec3d(imaginary, j!, k!))
      return
    }
    const a = imaginary instanceof GfVec
      ? imaginary.data
      : (imaginary as readonly number[])
    super(real, new GfVec3d(a[0]!, a[1]!, a[2]!))
  }

  protected override _round(x: number): number {
    return x
  }
  protected override _makeVec(x: number, y: number, z: number): GfVec {
    return new GfVec3d(x, y, z)
  }
  protected override _create(real: number, imaginary: GfVec): this {
    const q = new GfQuatd()
    q._real = real
    q._imaginary = imaginary
    return q as this
  }

  override GetImaginary(): GfVec3d {
    return this._imaginary as GfVec3d
  }

  static getZero(): GfQuatd {
    return new GfQuatd(0)
  }
  static getIdentity(): GfQuatd {
    return new GfQuatd(1)
  }
}

// ---------------------------------------------------------------------------
// GfQuatf — single-precision quaternion (quatf.h).
// ---------------------------------------------------------------------------

export class GfQuatf extends GfQuat {
  constructor(
    real?: number | AnyQuat,
    imaginary?: VecLike | number,
    j?: number,
    k?: number,
  ) {
    if (real === undefined) {
      super(0, new GfVec3f(0, 0, 0))
      return
    }
    if (real instanceof GfQuatImpl) {
      super(Math.fround(real.GetReal()), new GfVec3f(real.GetImaginary()))
      return
    }
    if (imaginary === undefined) {
      super(Math.fround(real), new GfVec3f(0, 0, 0))
      return
    }
    if (typeof imaginary === 'number') {
      super(Math.fround(real), new GfVec3f(imaginary, j!, k!))
      return
    }
    const a = imaginary instanceof GfVec
      ? imaginary.data
      : (imaginary as readonly number[])
    super(Math.fround(real), new GfVec3f(a[0]!, a[1]!, a[2]!))
  }

  protected override _round(x: number): number {
    return Math.fround(x)
  }
  protected override _makeVec(x: number, y: number, z: number): GfVec {
    return new GfVec3f(x, y, z)
  }
  protected override _create(real: number, imaginary: GfVec): this {
    const q = new GfQuatf()
    q._real = Math.fround(real)
    q._imaginary = imaginary
    return q as this
  }

  override GetImaginary(): GfVec3f {
    return this._imaginary as GfVec3f
  }

  static getZero(): GfQuatf {
    return new GfQuatf(0)
  }
  static getIdentity(): GfQuatf {
    return new GfQuatf(1)
  }
}

// GfQuath — OpenUSD v26.08 pxr/base/gf/quath.{h,cpp}, generated from
// quat.template.{h,cpp}. Arithmetic rounds through IEEE binary16.
export class GfQuath extends GfQuat {
  constructor(
    real?: number | AnyQuat,
    imaginary?: VecLike | number,
    j?: number,
    k?: number,
  ) {
    if (real === undefined) {
      super(0, new GfVec3h(0, 0, 0))
      return
    }
    if (real instanceof GfQuatImpl) {
      super(roundToHalf(real.GetReal()), new GfVec3h(real.GetImaginary()))
      return
    }
    if (imaginary === undefined) {
      super(roundToHalf(real), new GfVec3h(0, 0, 0))
      return
    }
    if (typeof imaginary === 'number') {
      super(roundToHalf(real), new GfVec3h(imaginary, j!, k!))
      return
    }
    const a = imaginary instanceof GfVec ? imaginary.data : imaginary
    super(roundToHalf(real), new GfVec3h(a[0]!, a[1]!, a[2]!))
  }

  protected override _round(x: number): number { return roundToHalf(x) }
  protected override _makeVec(x: number, y: number, z: number): GfVec {
    return new GfVec3h(x, y, z)
  }
  protected override _create(real: number, imaginary: GfVec): this {
    const q = new GfQuath()
    q._real = roundToHalf(real)
    q._imaginary = new GfVec3h(imaginary)
    return q as this
  }
  override GetImaginary(): GfVec3h { return this._imaginary as GfVec3h }
  static getZero(): GfQuath { return new GfQuath(0) }
  static getIdentity(): GfQuath { return new GfQuath(1) }
}

// ---------------------------------------------------------------------------
// Free functions.
// ---------------------------------------------------------------------------

/** GfDot(q1, q2): GfDot(imaginary1, imaginary2) + real1*real2. */
export function GfQuatDot(q1: GfQuatImpl, q2: GfQuatImpl): number {
  return q1.GetImaginary().dot(q2.GetImaginary()) + q1.GetReal() * q2.GetReal()
}

/**
 * GfSlerp(alpha, q0, q1): spherically interpolate. alpha 0 yields q0, alpha 1
 * yields q1. Verbatim port (quaternion.cpp / quat.template.cpp).
 */
function quatSlerp<T extends AnyQuat>(alpha: number, q0: T, q1: T): T {
  // quatd.cpp / quatf.cpp / quath.cpp / quaternion.cpp GfSlerp: the dot
  // product is the quaternion's scalar type, theta and sinTheta are held in
  // it, and the scales multiply the coefficients as that type.
  const scalar = (x: number): number => q0._roundScalar(x)
  let cosTheta = scalar(scalar(q0.GetImaginary().dot(q1.GetImaginary())) +
    scalar(q0.GetReal() * q1.GetReal()))
  let flip1 = false

  if (cosTheta < 0.0) {
    cosTheta = -cosTheta
    flip1 = true
  }

  let scale0: number
  let scale1: number

  if (1.0 - cosTheta > 0.00001) {
    // standard case
    const theta = scalar(Math.acos(cosTheta))
    const sinTheta = scalar(Math.sin(theta))
    scale0 = Math.sin((1.0 - alpha) * theta) / sinTheta
    scale1 = Math.sin(alpha * theta) / sinTheta
  } else {
    // q0 and q1 very close - just do linear interp and renormalize.
    scale0 = 1.0 - alpha
    scale1 = alpha
  }

  if (flip1) {
    scale1 = -scale1
  }

  return (q0.getScaled(scalar(scale0)) as T).add(q1.getScaled(scalar(scale1))) as unknown as T
}

/**
 * GfSlerp, overloaded as upstream declares it for quaternions (quatd.h,
 * quatf.h, quath.h, quaternion.h) and three-dimensional vectors (vec3d.h,
 * vec3f.h, vec3h.h).
 */
export function GfSlerp<T extends AnyQuat>(alpha: number, q0: T, q1: T): T
export function GfSlerp<T extends GfVec3d | GfVec3f | GfVec3h>(alpha: number, v0: T, v1: T): T
export function GfSlerp(alpha: number, a: AnyQuat | GfVec3d | GfVec3f | GfVec3h,
  b: AnyQuat | GfVec3d | GfVec3f | GfVec3h): AnyQuat | GfVec3d | GfVec3f | GfVec3h {
  if (a instanceof GfVec) return GfVecSlerp(alpha, a as GfVec3d, b as GfVec3d)
  return quatSlerp(alpha, a as AnyQuat, b as AnyQuat)
}
