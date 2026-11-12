// Ported from OpenUSD 26.11.1: pxr/base/gf/dualQuat.template.cpp,
//  pxr/base/gf/dualQuat.template.h, pxr/base/gf/dualQuatd.cpp,
//  pxr/base/gf/dualQuatd.h, pxr/base/gf/dualQuatf.cpp, pxr/base/gf/dualQuatf.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfDualQuat{d,f,h} dual-quaternion value types.
//
// Faithful port of:
//   pxr/base/gf/dualQuat.template.{h,cpp}   -> the generic dual-quat algebra
//   (instantiated as dualQuatd.{h,cpp}, dualQuatf.{h,cpp})
//
// A dual quaternion is a pair of quaternions (real, dual) that together encode a
// rigid transform (rotation + translation). The math here is ported verbatim
// from dualQuat.template.cpp (same operation order) so rounding matches the
// Pixar oracle; the quaternion product / dot / conjugate / Transform all reuse
// the already-ported GfQuat{d,f} surface in ./quaternion.ts.
//
// C++ operator -> TS method mapping (documented on each method):
//   operator* (dq, dq)    -> .GetMultiply(dq)          (dual-quat product)
//   operator* (dq, scalar)-> .GetScaled(s)
//   operator/ (dq, scalar)-> .GetDivided(s)
//   operator+ / +=        -> .Add(dq)
//   operator- (binary)    -> .Subtract(dq)
//   operator==            -> .equals(dq)
//   GfDot(dq1, dq2)       -> GfDualQuatDot(dq1, dq2)
//
// Precision: GfDualQuatd stores GfQuatd parts (double); GfDualQuatf stores
// GfQuatf parts (float32 via Math.fround inside GfQuatf). Scalar bookkeeping
// (lengths, inverse factors) is computed in JS doubles, matching the C++ where
// ScalarType arithmetic is promoted through the quaternion operations.
//
// GfDualQuath stores binary16-rounded GfQuath parts.

import { GfVec3d, GfVec3f, GfVec3h, type GfVec, type VecLike } from './vec.ts'
import { GfQuatd, GfQuatf, GfQuath, GfQuaternion, GfQuatDot, type AnyQuat } from './quaternion.ts'
import { GF_MIN_VECTOR_LENGTH } from './limits.ts'

/** A typed (precision-carrying) quaternion part of a dual quaternion. */
type Quat = GfQuatd | GfQuatf | GfQuath

/** Any dual-quaternion value type in this module. */
export type AnyDualQuat = GfDualQuatd | GfDualQuatf | GfDualQuath

function isQuat(x: unknown): x is AnyQuat {
  return x instanceof GfQuatd || x instanceof GfQuatf ||
    x instanceof GfQuath || x instanceof GfQuaternion
}

function vecData(v: VecLike): readonly number[] {
  return v instanceof GfVec3d || v instanceof GfVec3f || v instanceof GfVec3h
    ? v.data : (v as readonly number[])
}

// ---------------------------------------------------------------------------
// Shared implementation. Holds the real + dual quaternion parts and all the
// dual-quat algebra. Precision-specific factories (_convertQuat, _zeroQuat, …)
// are provided by the GfDualQuatd / GfDualQuatf subclasses.
// ---------------------------------------------------------------------------

abstract class GfDualQuatImpl {
  protected _real!: Quat // for rotation
  protected _dual!: Quat // for translation

  // ---- precision-specific factories (subclass-provided) ----

  /** Build a quaternion of this precision from a single real coefficient. */
  protected abstract _quatFromReal(real: number): Quat
  /** Build a quaternion of this precision from real + imaginary parts. */
  protected abstract _quatFromParts(real: number, im: GfVec): Quat
  /** Convert / clone any quaternion into this precision. */
  protected abstract _convertQuat(q: AnyQuat): Quat
  /** The zero quaternion (0,0,0,0) of this precision. */
  protected abstract _zeroQuat(): Quat
  /** The identity quaternion (1,0,0,0) of this precision. */
  protected abstract _identityQuat(): Quat
  /** Build a vec3 of this precision. */
  protected abstract _makeVec3(x: number, y: number, z: number): GfVec
  /** Build a new dual quaternion of this exact runtime type from parts. */
  protected abstract _create(real: Quat, dual: Quat): this

  /**
   * Constructors mirroring dualQuat.template.h:
   *   new GfDualQuat()                       -> zero (real & dual = (0,0,0,0))
   *   new GfDualQuat(realVal: number)        -> real = Quat(realVal), dual = 0
   *   new GfDualQuat(realQuat)               -> real = realQuat, dual = 0
   *   new GfDualQuat(realQuat, dualQuat)     -> explicit real + dual parts
   *   new GfDualQuat(rotation, translation)  -> real = rotation, SetTranslation
   *   new GfDualQuat(otherDualQuat)          -> copy / convert precision
   */
  protected constructor(
    a?: number | AnyQuat | AnyDualQuat,
    b?: AnyQuat | VecLike,
  ) {
    if (a === undefined) {
      this._real = this._zeroQuat()
      this._dual = this._zeroQuat()
      return
    }
    if (a instanceof GfDualQuatImpl) {
      this._real = this._convertQuat(a.GetReal())
      this._dual = this._convertQuat(a.getDual())
      return
    }
    if (isQuat(a)) {
      this._real = this._convertQuat(a)
      if (b === undefined) {
        this._dual = this._zeroQuat()
        return
      }
      if (isQuat(b)) {
        this._dual = this._convertQuat(b)
        return
      }
      // (rotation, translation)
      this._dual = this._zeroQuat()
      this.setTranslation(b)
      return
    }
    // a is a number: explicit DualQuat(realVal).
    this._real = this._quatFromReal(a)
    this._dual = this._zeroQuat()
  }

  // ---- accessors ----

  /** GetReal(): the real (rotation) part. */
  GetReal(): Quat {
    return this._real
  }

  /** GetDual(): the dual (translation) part. */
  getDual(): Quat {
    return this._dual
  }

  /** SetReal(): set the real (rotation) part. */
  setReal(real: AnyQuat): void {
    this._real = this._convertQuat(real)
  }

  /** SetDual(): set the dual (translation) part. */
  setDual(dual: AnyQuat): void {
    this._dual = this._convertQuat(dual)
  }

  // ---- translation ----

  /**
   * SetTranslation(): set the translation component.
   * _dual = Quat(0, 0.5*translation) * _real.
   */
  setTranslation(translation: VecLike): void {
    const t = vecData(translation)
    const half = this._makeVec3(0.5 * t[0]!, 0.5 * t[1]!, 0.5 * t[2]!)
    const tq = this._quatFromParts(0.0, half)
    this._dual = tq.getMultiply(this._real) as Quat
  }

  /**
   * GetTranslation(): the translation component. Assumes the dual quaternion is
   * normalized (matches the C++ TF_DEV_AXIOM). Verbatim port of the closed form
   *   translation = -2 * (r1*i2 - r2*i1 + i1 x i2)
   * where (r1,i1) = dual, (r2,i2) = real.
   */
  getTranslation(): GfVec {
    const r1 = this._dual.GetReal()
    const r2 = this._real.GetReal()
    const i1 = this._dual.GetImaginary().data
    const i2 = this._real.GetImaginary().data
    return this._makeVec3(
      -2.0 * (r1 * i2[0]! - r2 * i1[0]! + (i1[1]! * i2[2]! - i1[2]! * i2[1]!)),
      -2.0 * (r1 * i2[1]! - r2 * i1[1]! + (i1[2]! * i2[0]! - i1[0]! * i2[2]!)),
      -2.0 * (r1 * i2[2]! - r2 * i1[2]! + (i1[0]! * i2[1]! - i1[1]! * i2[0]!)),
    )
  }

  // ---- length / normalization ----

  /**
   * GetLength(): the geometric length as a [realLength, dualLength] pair.
   * realLength = |_real|; dualLength = GfDot(_real, _dual) / realLength.
   */
  GetLength(): [number, number] {
    const realLength = this._real.GetLength()
    if (realLength === 0) {
      return [0, 0]
    }
    return [realLength, GfQuatDot(this._real, this._dual) / realLength]
  }

  /**
   * GetNormalized(): unit-length copy. If the real length < eps, returns
   * identity.
   */
  GetNormalized(eps: number = GF_MIN_VECTOR_LENGTH): this {
    const dq = this._create(this._convertQuat(this._real), this._convertQuat(this._dual))
    dq.Normalize(eps)
    return dq
  }

  /**
   * Normalize(): scale to unit length in place; returns the pre-normalization
   * [realLength, dualLength] pair. If the real length < eps, sets to identity.
   */
  Normalize(eps: number = GF_MIN_VECTOR_LENGTH): [number, number] {
    const length = this.GetLength()
    const realLength = length[0]
    if (realLength < eps) {
      this._real = this._identityQuat()
      this._dual = this._zeroQuat()
    } else {
      const invRealLength = 1.0 / realLength
      this._real = this._real.getScaled(invRealLength) as Quat
      this._dual = this._dual.getScaled(invRealLength) as Quat
      // _dual -= (GfDot(_real, _dual) * _real)
      const d = GfQuatDot(this._real, this._dual)
      this._dual = this._dual.subtract(this._real.getScaled(d)) as Quat
    }
    return length
  }

  // ---- conjugate / inverse ----

  /** GetConjugate(): conjugate both parts. */
  getConjugate(): this {
    return this._create(
      this._real.getConjugate() as Quat,
      this._dual.getConjugate() as Quat,
    )
  }

  /** GetInverse(): the inverse dual quaternion (DQ * DQ.GetInverse() == identity). */
  getInverse(): this {
    const realLengthSqr = GfQuatDot(this._real, this._real)
    if (realLengthSqr <= 0.0) {
      return this._create(this._identityQuat(), this._zeroQuat())
    }
    const invRealLengthSqr = 1.0 / realLengthSqr
    const conjInvLenSqr = this.getConjugate().getScaled(invRealLengthSqr)
    const realPart = conjInvLenSqr.GetReal()
    const dualPart = conjInvLenSqr.getDual().subtract(
      conjInvLenSqr
        .GetReal()
        .getScaled(2.0 * invRealLengthSqr * GfQuatDot(this._real, this._dual)),
    ) as Quat
    return this._create(realPart, dualPart)
  }

  // ---- equality ----

  /** operator== : real and dual parts must match exactly. */
  equals(dq: GfDualQuatImpl): boolean {
    return this._real.equals(dq._real) && this._dual.equals(dq._dual)
  }

  // ---- dual-quaternion product (operator*, operator*=) ----

  /**
   * operator* (dq, dq): the dual-quaternion product.
   *   realOut = real1*real2
   *   dualOut = real1*dual2 + dual1*real2
   */
  getMultiply(dq: GfDualQuatImpl): this {
    const tempReal = this._real.getMultiply(dq._real) as Quat
    const tempDual = (this._real.getMultiply(dq._dual) as Quat).add(
      this._dual.getMultiply(dq._real) as Quat,
    ) as Quat
    return this._create(tempReal, tempDual)
  }

  // ---- scalar mul / div ----

  /** operator* (dq, scalar): scale both parts. */
  getScaled(s: number): this {
    return this._create(this._real.getScaled(s) as Quat, this._dual.getScaled(s) as Quat)
  }

  /** operator/ (dq, scalar): divide both parts (== scale by 1/s). */
  getDivided(s: number): this {
    return this.getScaled(1.0 / s)
  }

  // ---- componentwise add / subtract ----

  /** operator+ : componentwise sum. */
  add(dq: GfDualQuatImpl): this {
    return this._create(
      this._real.add(dq._real) as Quat,
      this._dual.add(dq._dual) as Quat,
    )
  }

  /** operator- (binary) : componentwise difference. */
  subtract(dq: GfDualQuatImpl): this {
    return this._create(
      this._real.subtract(dq._real) as Quat,
      this._dual.subtract(dq._dual) as Quat,
    )
  }

  // ---- transform ----

  /**
   * Transform(point): apply the rigid transform (rotation then translation).
   *   GetReal().Transform(vec) + GetTranslation()
   */
  Transform(vec: VecLike): GfVec {
    const v = vec instanceof GfVec3d || vec instanceof GfVec3f ? vec : this._makeVec3(
      (vec as readonly number[])[0]!,
      (vec as readonly number[])[1]!,
      (vec as readonly number[])[2]!,
    )
    const rotated = this._real.Transform(v).data
    const t = this.getTranslation().data
    return this._makeVec3(rotated[0]! + t[0]!, rotated[1]! + t[1]!, rotated[2]! + t[2]!)
  }

  // ---- string / hash ----

  /** ostream form: "((rw, rx, ry, rz), (dw, dx, dy, dz))". */
  toString(): string {
    return `(${this._real.toString()}, ${this._dual.toString()})`
  }

  /** Deterministic hash key (TfHash::Combine(real, dual) analogue). */
  hash(): string {
    return `${this.constructor.name}:${this._real.hash()};${this._dual.hash()}`
  }
}

// ---------------------------------------------------------------------------
// GfDualQuatd — double-precision dual quaternion (dualQuatd.h).
// ---------------------------------------------------------------------------

export class GfDualQuatd extends GfDualQuatImpl {
  constructor(a?: number | AnyQuat | AnyDualQuat, b?: AnyQuat | VecLike) {
    super(a, b)
  }

  protected override _quatFromReal(real: number): Quat {
    return new GfQuatd(real)
  }
  protected override _quatFromParts(real: number, im: GfVec): Quat {
    return new GfQuatd(real, im)
  }
  protected override _convertQuat(q: AnyQuat): Quat {
    return new GfQuatd(q)
  }
  protected override _zeroQuat(): Quat {
    return GfQuatd.getZero()
  }
  protected override _identityQuat(): Quat {
    return GfQuatd.getIdentity()
  }
  protected override _makeVec3(x: number, y: number, z: number): GfVec {
    return new GfVec3d(x, y, z)
  }
  protected override _create(real: Quat, dual: Quat): this {
    return new GfDualQuatd(real, dual) as this
  }

  override GetReal(): GfQuatd {
    return this._real as GfQuatd
  }
  override getDual(): GfQuatd {
    return this._dual as GfQuatd
  }
  override getTranslation(): GfVec3d {
    return super.getTranslation() as GfVec3d
  }
  override Transform(vec: VecLike): GfVec3d {
    return super.Transform(vec) as GfVec3d
  }

  /** GetZero(): real & dual = (0,0,0,0). */
  static getZero(): GfDualQuatd {
    return new GfDualQuatd(GfQuatd.getZero(), GfQuatd.getZero())
  }

  /** GetIdentity(): real = (1,0,0,0), dual = (0,0,0,0). */
  static getIdentity(): GfDualQuatd {
    return new GfDualQuatd(GfQuatd.getIdentity(), GfQuatd.getZero())
  }
}

// ---------------------------------------------------------------------------
// GfDualQuatf — single-precision dual quaternion (dualQuatf.h).
// ---------------------------------------------------------------------------

export class GfDualQuatf extends GfDualQuatImpl {
  constructor(a?: number | AnyQuat | AnyDualQuat, b?: AnyQuat | VecLike) {
    super(a, b)
  }

  protected override _quatFromReal(real: number): Quat {
    return new GfQuatf(real)
  }
  protected override _quatFromParts(real: number, im: GfVec): Quat {
    return new GfQuatf(real, im)
  }
  protected override _convertQuat(q: AnyQuat): Quat {
    return new GfQuatf(q)
  }
  protected override _zeroQuat(): Quat {
    return GfQuatf.getZero()
  }
  protected override _identityQuat(): Quat {
    return GfQuatf.getIdentity()
  }
  protected override _makeVec3(x: number, y: number, z: number): GfVec {
    return new GfVec3f(x, y, z)
  }
  protected override _create(real: Quat, dual: Quat): this {
    return new GfDualQuatf(real, dual) as this
  }

  override GetReal(): GfQuatf {
    return this._real as GfQuatf
  }
  override getDual(): GfQuatf {
    return this._dual as GfQuatf
  }
  override getTranslation(): GfVec3f {
    return super.getTranslation() as GfVec3f
  }
  override Transform(vec: VecLike): GfVec3f {
    return super.Transform(vec) as GfVec3f
  }

  static getZero(): GfDualQuatf {
    return new GfDualQuatf(GfQuatf.getZero(), GfQuatf.getZero())
  }

  static getIdentity(): GfDualQuatf {
    return new GfDualQuatf(GfQuatf.getIdentity(), GfQuatf.getZero())
  }
}

// GfDualQuath — OpenUSD v26.08 pxr/base/gf/dualQuath.{h,cpp}, generated
// from dualQuat.template.{h,cpp}.
export class GfDualQuath extends GfDualQuatImpl {
  constructor(a?: number | AnyQuat | AnyDualQuat, b?: AnyQuat | VecLike) {
    super(a, b)
  }
  protected override _quatFromReal(real: number): Quat { return new GfQuath(real) }
  protected override _quatFromParts(real: number, im: GfVec): Quat {
    return new GfQuath(real, im)
  }
  protected override _convertQuat(q: AnyQuat): Quat { return new GfQuath(q) }
  protected override _zeroQuat(): Quat { return GfQuath.getZero() }
  protected override _identityQuat(): Quat { return GfQuath.getIdentity() }
  protected override _makeVec3(x: number, y: number, z: number): GfVec {
    return new GfVec3h(x, y, z)
  }
  protected override _create(real: Quat, dual: Quat): this {
    return new GfDualQuath(real, dual) as this
  }
  override GetReal(): GfQuath { return this._real as GfQuath }
  override getDual(): GfQuath { return this._dual as GfQuath }
  override getTranslation(): GfVec3h {
    return super.getTranslation() as GfVec3h
  }
  override Transform(vec: VecLike): GfVec3h {
    return super.Transform(vec) as GfVec3h
  }
  static getZero(): GfDualQuath {
    return new GfDualQuath(GfQuath.getZero(), GfQuath.getZero())
  }
  static getIdentity(): GfDualQuath {
    return new GfDualQuath(GfQuath.getIdentity(), GfQuath.getZero())
  }
}

// ---------------------------------------------------------------------------
// Free functions.
// ---------------------------------------------------------------------------

/** GfDot(dq1, dq2): GfDot(real1, real2) + GfDot(dual1, dual2). */
export function GfDualQuatDot(dq1: AnyDualQuat, dq2: AnyDualQuat): number {
  return (
    GfQuatDot(dq1.GetReal(), dq2.GetReal()) +
    GfQuatDot(dq1.getDual(), dq2.getDual())
  )
}
