// Ported from OpenUSD 26.11.1: pxr/base/gf/transform.cpp,
//  pxr/base/gf/transform.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfTransform: compound linear transformation (SRT value type).
//
// Faithful port of pxr/base/gf/transform.{h,cpp}. A GfTransform is a series of
// components — translation, rotation, scale, pivotPosition, pivotOrientation —
// that compose (in order applied to a point) as:
//   M = -P * -O * S * O * R * P * T
// (scale about the pivot in the pivot orientation, rotate about the pivot,
// translate). GetMatrix() builds that product; SetMatrix() factors a matrix
// back into the components (the SetMatrix->Factor path is the key behavior).
//
// CONVENTION (typescript-usd memory): row-vector (v·M), world = local·parentWorld,
// matrices compose by POST-multiplication (mtx *= tmp) in the order operations
// apply — mirrored verbatim from transform.cpp's GetMatrix _GF_ACCUM macro.
//
// Representation note: GfRotation is the typescript-usd/gf functional surface
// (rotation.ts: {axis, angle} + free functions), NOT a class — adapted here.
// GfVec3d / GfMatrix4d are the value-type classes (vec.ts / matrixData.ts).
// This private representation does not change GfTransform's public value
// semantics.

import { GfVec3d } from './vec.ts'
import { GfMatrix4d } from './matrixData.ts'
import {
  type Rotation,
  identityRotation,
  rotationInverse,
  rotationEqual,
  rotationRepr,
} from './rotation.ts'

function isRotation(x: unknown): x is Rotation {
  return typeof x === 'object' && x !== null && 'axis' in x && 'angle' in x
}

const cloneRotation = (r: Rotation): Rotation => ({
  axis: [r.axis[0], r.axis[1], r.axis[2]],
  angle: r.angle,
})

export class GfTransform {
  private _translation: GfVec3d = new GfVec3d(0, 0, 0)
  private _rotation: Rotation = identityRotation()
  private _scale: GfVec3d = new GfVec3d(1, 1, 1)
  private _pivotOrientation: Rotation = identityRotation()
  private _pivotPosition: GfVec3d = new GfVec3d(0, 0, 0)

  /**
   * Constructors mirroring transform.h:
   *   new GfTransform()                         -> identity
   *   new GfTransform(GfMatrix4d)               -> SetIdentity then SetMatrix
   *   new GfTransform(scale, pivotOrientation, rotation, pivotPosition, translation)  (2x form)
   *   new GfTransform(translation, rotation, scale, pivotPosition, pivotOrientation)  (3x form)
   * The two 5-arg forms are distinguished (as C++ overload resolution does) by
   * the type of the 3rd argument: a GfRotation -> 2x, a GfVec3d -> 3x.
   */
  constructor(...args: unknown[]) {
    if (args.length === 0) {
      this.setIdentity()
      return
    }
    if (args.length === 1) {
      this.setIdentity()
      this.setMatrix(args[0] as GfMatrix4d)
      return
    }
    if (args.length === 5) {
      this.Set(
        args[0] as GfVec3d,
        args[1] as Rotation,
        args[2] as GfVec3d | Rotation,
        args[3] as GfVec3d,
        args[4] as Rotation | GfVec3d,
      )
      return
    }
    throw new TypeError(
      `GfTransform: expected 0, 1, or 5 constructor arguments, got ${args.length}`,
    )
  }

  /**
   * Set from all component values. Dispatches between the 2x ordering
   * (scale, pivotOrientation, rotation, pivotPosition, translation) and the 3x
   * ordering (translation, rotation, scale, pivotPosition, pivotOrientation)
   * by the 3rd argument's type, mirroring the two C++ Set overloads.
   */
  Set(
    a: GfVec3d,
    b: Rotation,
    c: GfVec3d | Rotation,
    d: GfVec3d,
    e: Rotation | GfVec3d,
  ): this {
    if (isRotation(c)) {
      // 2x form: (scale, pivotOrientation, rotation, pivotPosition, translation)
      return this._set(a, b, c, d, e as GfVec3d)
    }
    // 3x form: (translation, rotation, scale, pivotPosition, pivotOrientation)
    //   -> Set(scale=c, pivotOrientation=e, rotation=b, pivotPosition=d, translation=a)
    return this._set(c, e as Rotation, b, d, a)
  }

  // GfTransform::Set (the canonical 2x ordering).
  private _set(
    scale: GfVec3d,
    pivotOrientation: Rotation,
    rotation: Rotation,
    pivotPosition: GfVec3d,
    translation: GfVec3d,
  ): this {
    this._scale = new GfVec3d(scale)
    this._pivotOrientation = cloneRotation(pivotOrientation)
    this._rotation = cloneRotation(rotation)
    this._pivotPosition = new GfVec3d(pivotPosition)
    this._translation = new GfVec3d(translation)
    return this
  }

  /**
   * GfTransform::SetMatrix — factor `m` into the components, trying to leave the
   * current pivotPosition unchanged. Verbatim port of transform.cpp.
   */
  setMatrix(m: GfMatrix4d): this {
    // Create [mNoPivot] such that [mPivotPosInv][mNoPivot][mPivotPos] == [m],
    // i.e. mNoPivot = [mPivotPos][m][mPivotPosInv].
    const mPivotPos = new GfMatrix4d().setTranslate(this._pivotPosition)
    const mPivotPosInv = new GfMatrix4d().setTranslate(this._pivotPosition.getNegated())
    const mNoPivot = mPivotPos.getMultiply(m).getMultiply(mPivotPosInv)

    // Factor returns success=false for singular matrices but still produces a
    // usable result (e.g. zero scales), which we use regardless.
    //   C++ Factor(&shearRotMat, &_scale, &rotMat, &_translation, &projMat)
    //   maps to: scaleOrientation=shearRotMat, scale, rotation=rotMat,
    //   translation, projection. (See matrixData.ts Factor().)
    const f = mNoPivot.factor()
    this._scale = f.scale as GfVec3d
    this._translation = f.translation as GfVec3d
    this._rotation = f.rotation.extractRotation()

    // Don't set the scale orientation if the scale is unity.
    if (!this._scale.equals(new GfVec3d(1.0, 1.0, 1.0))) {
      this._pivotOrientation = f.scaleOrientation.getTranspose().extractRotation()
    } else {
      this._pivotOrientation = identityRotation()
    }
    return this
  }

  /** GfTransform::SetIdentity. */
  setIdentity(): this {
    this._scale = new GfVec3d(1.0, 1.0, 1.0)
    this._pivotOrientation = identityRotation()
    this._rotation = identityRotation()
    this._pivotPosition = new GfVec3d(0, 0, 0)
    this._translation = new GfVec3d(0, 0, 0)
    return this
  }

  // ---- component setters (leave all others untouched) ----

  setScale(scale: GfVec3d): void {
    this._scale = new GfVec3d(scale)
  }
  setPivotOrientation(pivotOrient: Rotation): void {
    this._pivotOrientation = cloneRotation(pivotOrient)
  }
  /** Alias of SetPivotOrientation. */
  setScaleOrientation(pivotOrient: Rotation): void {
    this.setPivotOrientation(pivotOrient)
  }
  setRotation(rotation: Rotation): void {
    this._rotation = cloneRotation(rotation)
  }
  setPivotPosition(pivPos: GfVec3d): void {
    this._pivotPosition = new GfVec3d(pivPos)
  }
  /** Alias of SetPivotPosition. */
  setCenter(pivPos: GfVec3d): void {
    this.setPivotPosition(pivPos)
  }
  setTranslation(translation: GfVec3d): void {
    this._translation = new GfVec3d(translation)
  }

  // ---- component getters ----

  getScale(): GfVec3d {
    return this._scale
  }
  getPivotOrientation(): Rotation {
    return this._pivotOrientation
  }
  /** Alias of GetPivotOrientation. */
  getScaleOrientation(): Rotation {
    return this.getPivotOrientation()
  }
  getRotation(): Rotation {
    return this._rotation
  }
  getPivotPosition(): GfVec3d {
    return this._pivotPosition
  }
  /** Alias of GetPivotPosition. */
  getCenter(): GfVec3d {
    return this.getPivotPosition()
  }
  getTranslation(): GfVec3d {
    return this._translation
  }

  // ---- Python-style property accessors (mirror Gf.Transform's t.translation,
  // t.rotation, t.scale, t.pivotPosition/center, t.pivotOrientation) ----

  get translation(): GfVec3d { return this._translation }
  set translation(v: GfVec3d) { this.setTranslation(v) }
  get rotation(): Rotation { return this._rotation }
  set rotation(r: Rotation) { this.setRotation(r) }
  get scale(): GfVec3d { return this._scale }
  set scale(v: GfVec3d) { this.setScale(v) }
  get pivotPosition(): GfVec3d { return this._pivotPosition }
  set pivotPosition(v: GfVec3d) { this.setPivotPosition(v) }
  get center(): GfVec3d { return this._pivotPosition }
  set center(v: GfVec3d) { this.setPivotPosition(v) }
  get pivotOrientation(): Rotation { return this._pivotOrientation }
  set pivotOrientation(r: Rotation) { this.setPivotOrientation(r) }
  get scaleOrientation(): Rotation { return this._pivotOrientation }
  set scaleOrientation(r: Rotation) { this.setPivotOrientation(r) }

  /**
   * GfTransform::GetMatrix — the cumulative transformation as a GfMatrix4d.
   * Verbatim port of transform.cpp (the _GF_ACCUM post-multiply pattern):
   * when multiplying A*B, A's effect is more local, so operations are applied
   * by post-multiplication in the order we want them to take effect.
   */
  getMatrix(): GfMatrix4d {
    const doPivot = !this._pivotPosition.equals(new GfVec3d(0, 0, 0))
    const doScale = !this._scale.equals(new GfVec3d(1.0, 1.0, 1.0))
    const doScaleOrient = this._pivotOrientation.angle !== 0.0
    const doRotation = this._rotation.angle !== 0.0
    const doTranslation = !this._translation.equals(new GfVec3d(0, 0, 0))

    let anySet = false
    const mtx = new GfMatrix4d()

    // _GF_ACCUM(op): if anything set yet, build tmp via op and post-multiply;
    // otherwise apply op directly to mtx.
    const accum = (op: (target: GfMatrix4d) => void): void => {
      if (anySet) {
        const tmp = new GfMatrix4d()
        op(tmp)
        mtx.multiplyInPlace(tmp)
      } else {
        op(mtx)
        anySet = true
      }
    }

    if (doPivot)
      accum((t) => t.setTranslate(this._pivotPosition.getNegated()))

    if (doScale) {
      if (doScaleOrient)
        accum((t) => t.setRotate(rotationInverse(this._pivotOrientation)))

      accum((t) => t.setScale(this._scale))

      if (doScaleOrient)
        accum((t) => t.setRotate(this._pivotOrientation))
    }

    if (doRotation)
      accum((t) => t.setRotate(this._rotation))

    if (doPivot)
      accum((t) => t.setTranslate(this._pivotPosition))

    if (doTranslation)
      accum((t) => t.setTranslate(this._translation))

    if (!anySet) mtx.setIdentity()

    return mtx
  }

  /**
   * GfTransform::operator== — component-wise; ALL components must match exactly
   * (GfVec3d.equals and GfRotation's exact axis/angle equality).
   */
  equals(xf: GfTransform): boolean {
    return (
      this._scale.equals(xf._scale) &&
      rotationEqual(this._pivotOrientation, xf._pivotOrientation) &&
      rotationEqual(this._rotation, xf._rotation) &&
      this._pivotPosition.equals(xf._pivotPosition) &&
      this._translation.equals(xf._translation)
    )
  }

  /** GfTransform::operator*= — post-multiply xf into this (via GetMatrix). */
  multiplyInPlace(xf: GfTransform): this {
    return this.setMatrix(this.getMatrix().getMultiply(xf.getMatrix()))
  }

  /** friend operator* — product of xf1 and xf2 (xf1 *= xf2 on a copy). */
  static multiply(xf1: GfTransform, xf2: GfTransform): GfTransform {
    const xf = new GfTransform()
    xf._set(
      xf1._scale, xf1._pivotOrientation, xf1._rotation,
      xf1._pivotPosition, xf1._translation,
    )
    return xf.multiplyInPlace(xf2)
  }

  /**
   * Python repr — reconstructable in the 3x constructor order
   * (translation, rotation, scale, pivotPosition, pivotOrientation). Round-trips
   * exactly (JS number toString preserves doubles), mirroring upstream's
   * eval(repr(t)) == t contract.
   */
  repr(): string {
    const v = (x: GfVec3d): string =>
      `Gf.Vec3d(${x.get(0)}, ${x.get(1)}, ${x.get(2)})`
    return (
      `Gf.Transform(${v(this._translation)}, ${rotationRepr(this._rotation)}, ` +
      `${v(this._scale)}, ${v(this._pivotPosition)}, ` +
      `${rotationRepr(this._pivotOrientation)})`
    )
  }

  /** operator<< — debugging string [scale, scaleorientation, rotation, center, translation]. */
  toString(): string {
    const s = this._scale, c = this._pivotPosition, t = this._translation
    const pax = this._pivotOrientation.axis, pang = this._pivotOrientation.angle
    const rax = this._rotation.axis, rang = this._rotation.angle
    return (
      `( (${s.get(0)}, ${s.get(1)}, ${s.get(2)}, 0), ` +
      `(${pax[0]}, ${pax[1]}, ${pax[2]}, ${pang}), ` +
      `(${rax[0]}, ${rax[1]}, ${rax[2]}, ${rang}), ` +
      `(${c.get(0)}, ${c.get(1)}, ${c.get(2)}, 0), ` +
      `(${t.get(0)}, ${t.get(1)}, ${t.get(2)}, 0) )`
    )
  }
}
