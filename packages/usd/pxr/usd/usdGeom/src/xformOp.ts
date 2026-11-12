// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformOp.cpp,
//  pxr/usd/usdGeom/xformOp.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomXformOp — schema wrapper for a UsdAttribute that is an xform op.
// Port of OpenUSD 26.11.1 pxr/usd/usdGeom/xformOp.{h,cpp}.
//
// An op holds its attribute, or, when built by UsdGeomXformable::XformQuery,
// a UsdAttributeQuery over it (xformOp.h:591, the std::variant _attr), its
// op type parsed from the attribute name, and whether it is an inverse op
// ("!invert!" in xformOpOrder).

import { AttributeQuery as UsdAttributeQuery } from 'typescript-usd/usd'
import type { Attribute, Prim, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { TF_CODING_ERROR } from 'typescript-usd/tf'
import {
  type Interval as GfInterval,
  type Matrix4,
  IDENTITY_MATRIX,
  Matrix4d as GfMatrix4d,
  invertMatrix4,
  makeRotation,
  makeScale,
  makeTranslate,
  mul4,
  quatToRotation,
  rotationInverse,
} from 'typescript-usd/gf'
import { asMatrix4Flat, asQuat, asScalar, asVec3 } from './valueUtils.ts'

// UsdGeomXformOpTypes (xformOp.h:41-63, TF_DECLARE_PUBLIC_TOKENS).
export const UsdGeomXformOpTypes = Object.freeze({
  translateX: 'translateX',
  translateY: 'translateY',
  translateZ: 'translateZ',
  translate: 'translate',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  scaleZ: 'scaleZ',
  scale: 'scale',
  rotateX: 'rotateX',
  rotateY: 'rotateY',
  rotateZ: 'rotateZ',
  rotateXYZ: 'rotateXYZ',
  rotateXZY: 'rotateXZY',
  rotateYXZ: 'rotateYXZ',
  rotateYZX: 'rotateYZX',
  rotateZXY: 'rotateZXY',
  rotateZYX: 'rotateZYX',
  orient: 'orient',
  transform: 'transform',
  resetXformStack: '!resetXformStack!',
})

// xformOp.cpp:56-81 (_tokens).
const XFORM_OP_PREFIX = 'xformOp:'
const INVERSE_XFORM_OP_PREFIX = '!invert!xformOp:'
const INVERT_PREFIX = '!invert!'

// UsdGeomXformOp::Type (xformOp.h:116-146), in declaration order, with the
// TfEnum names of xformOp.cpp:30-49.
const TYPE_TOKENS = [
  '', 'translateX', 'translateY', 'translateZ', 'translate',
  'scaleX', 'scaleY', 'scaleZ', 'scale',
  'rotateX', 'rotateY', 'rotateZ',
  'rotateXYZ', 'rotateXZY', 'rotateYXZ', 'rotateYZX', 'rotateZXY', 'rotateZYX',
  'orient', 'transform',
] as const
// UsdGeomXformOp::Precision (xformOp.h:149-153), TfEnum names of
// xformOp.cpp:51-53.
const PRECISION_NAMES = ['Double', 'Float', 'Half'] as const

// _IsNamespaced (xformOp.cpp:83-90).
function isNamespaced(opName: string): boolean {
  return opName.startsWith(XFORM_OP_PREFIX)
}

// _MakeNamespaced (xformOp.cpp:92-99).
function makeNamespaced(name: string): string {
  return isNamespaced(name) ? name : XFORM_OP_PREFIX + name
}

// _IsInverseOp (xformOp.cpp:101-108).
function isInverseOpName(opName: string): boolean {
  return opName.startsWith(INVERSE_XFORM_OP_PREFIX)
}

export class XformOp {
  // ---- Type (xformOp.h:116-146) ----
  static readonly TypeInvalid = 0
  static readonly TypeTranslateX = 1
  static readonly TypeTranslateY = 2
  static readonly TypeTranslateZ = 3
  static readonly TypeTranslate = 4
  static readonly TypeScaleX = 5
  static readonly TypeScaleY = 6
  static readonly TypeScaleZ = 7
  static readonly TypeScale = 8
  static readonly TypeRotateX = 9
  static readonly TypeRotateY = 10
  static readonly TypeRotateZ = 11
  static readonly TypeRotateXYZ = 12
  static readonly TypeRotateXZY = 13
  static readonly TypeRotateYXZ = 14
  static readonly TypeRotateYZX = 15
  static readonly TypeRotateZXY = 16
  static readonly TypeRotateZYX = 17
  static readonly TypeOrient = 18
  static readonly TypeTransform = 19

  // ---- Precision (xformOp.h:149-153) ----
  static readonly PrecisionDouble = 0
  static readonly PrecisionFloat = 1
  static readonly PrecisionHalf = 2

  #attr: Attribute | undefined
  #query: UsdAttributeQuery | undefined
  #opType: XformOp.Type
  readonly #isInverseOp: boolean

  // UsdGeomXformOp(attr, isInverseOp) (xformOp.cpp:110-130). Legal with an
  // invalid attribute, which makes an op that is not defined; an attribute
  // outside the xformOp namespace is a coding error.
  constructor(attr?: Attribute, isInverseOp = false) {
    this.#attr = attr
    this.#opType = XformOp.TypeInvalid
    this.#isInverseOp = isInverseOp
    if (!attr?.isValid()) return
    const name = attr.name
    if (isNamespaced(name)) {
      this.#opType = XformOp.getOpTypeEnum(attr.splitName()[1] ?? '')
    } else {
      TF_CODING_ERROR(`Invalid xform op: <${attr.getPath()}>.`)
    }
  }

  // UsdGeomXformOp(attr, isInverseOp, _ValidAttributeTagType) and the
  // UsdAttributeQuery overload (xformOp.cpp:132-174): an op over an
  // attribute already known to be valid, typed by _Init.
  static _fromValidAttribute(attr: Attribute, isInverseOp: boolean): XformOp {
    const op = new XformOp(undefined, isInverseOp)
    op.#attr = attr
    op.#init()
    return op
  }

  static _fromAttributeQuery(query: UsdAttributeQuery, isInverseOp: boolean): XformOp {
    const op = new XformOp(undefined, isInverseOp)
    op.#attr = query.getAttribute()
    op.#query = query
    op.#init()
    return op
  }

  // UsdGeomXformOp(prim, opType, precision, opSuffix, inverse)
  // (xformOp.cpp:449-482): creates the op's attribute in the xformOp
  // namespace with the type for the op type and precision.
  static _create(
    prim: Prim, opType: XformOp.Type, precision: XformOp.Precision, opSuffix = '', isInverseOp = false,
  ): XformOp {
    const op = new XformOp(undefined, isInverseOp)
    op.#opType = opType
    // Determine the typeName of the xformOp attribute to be created.
    const typeName = XformOp.getValueTypeName(opType, precision)
    if (!typeName) {
      TF_CODING_ERROR('Invalid xform-op: incompatible combination of '
        + `opType (${TYPE_ENUM_NAMES[opType]}) and precision (${PRECISION_NAMES[precision]}).`)
      return op
    }
    // isInverseOp is handled by the op, not the attribute name.
    const attrName = XformOp.getOpName(opType, opSuffix, false)
    // Create an attribute in the xformOp: namespace with the computed
    // typeName. If a problem occurred, an error should already have been
    // issued, and the attribute will be invalid, which is what we want.
    op.#attr = prim.createAttribute(attrName, typeName, /* custom */ false)
    return op
  }

  // _Init (xformOp.cpp:132-156): the op type is the second namespace
  // component of the attribute name.
  #init(): void {
    const name = this.getName()
    const start = name.indexOf(':')
    if (start < 0) {
      TF_CODING_ERROR(`Invalid xform op: <${this.getAttr().getPath()}>.`)
      return
    }
    const end = name.indexOf(':', start + 1)
    const opTypeToken = name.slice(start + 1, end < 0 ? undefined : end)
    this.#opType = getOpTypeEnumFromString(opTypeToken)
    if (this.#opType === XformOp.TypeInvalid) {
      TF_CODING_ERROR(`Invalid xform opType token '${opTypeToken}'.`)
    }
  }

  // ---- Static helpers ----

  // IsXformOp (xformOp.cpp:184-199): an attribute (or attribute name) in the
  // xformOp namespace.
  static isXformOp(attrOrName: Attribute | string | undefined): boolean {
    if (typeof attrOrName === 'string') return isNamespaced(attrOrName)
    if (!attrOrName?.isValid()) return false
    return isNamespaced(attrOrName.name)
  }

  // _GetXformOpAttr (xformOp.cpp:201-215): the attribute an xformOpOrder
  // entry names, with "!invert!" stripped.
  static _getXformOpAttr(prim: Prim, opName: string): { attr: Attribute; isInverseOp: boolean } {
    const isInverseOp = isInverseOpName(opName)
    const attr = prim.getAttr(isInverseOp ? opName.slice(INVERT_PREFIX.length) : opName)!
    return { attr, isInverseOp }
  }

  // GetPrecisionFromValueTypeName (xformOp.cpp:217-245).
  static getPrecisionFromValueTypeName(typeName: string): XformOp.Precision {
    switch (typeName) {
      case 'matrix4d': case 'double3': case 'double': case 'quatd': return XformOp.PrecisionDouble
      case 'float3': case 'float': case 'quatf': return XformOp.PrecisionFloat
      case 'half3': case 'half': case 'quath': return XformOp.PrecisionHalf
    }
    TF_CODING_ERROR(`Invalid typeName '${typeName}' specified.`)
    // Return default precision, which is double.
    return XformOp.PrecisionDouble
  }

  // GetOpTypeToken (xformOp.cpp:247-276).
  static getOpTypeToken(opType: XformOp.Type): string {
    return TYPE_TOKENS[opType] ?? ''
  }

  // GetOpTypeEnum (xformOp.cpp:278-327).
  static getOpTypeEnum(opTypeToken: string): XformOp.Type {
    const opType = getOpTypeEnumFromString(opTypeToken)
    if (opType === XformOp.TypeInvalid && opTypeToken !== '') {
      TF_CODING_ERROR(`Invalid xform opType token '${opTypeToken}'.`)
    }
    return opType
  }

  // GetValueTypeName (xformOp.cpp:382-447); '' for an invalid op type.
  static getValueTypeName(opType: XformOp.Type, precision: XformOp.Precision): string {
    switch (opType) {
      case XformOp.TypeTransform:
        // Regardless of the requested precision, this must be Matrix4d,
        // because Matrix4f values are not supported in Sdf.
        if (precision !== XformOp.PrecisionDouble) {
          TF_CODING_ERROR('Matrix transformations can only be encoded in '
            + 'double precision. Overriding precision to double.')
        }
        return 'matrix4d'
      case XformOp.TypeTranslate: case XformOp.TypeScale:
      case XformOp.TypeRotateXYZ: case XformOp.TypeRotateXZY: case XformOp.TypeRotateYXZ:
      case XformOp.TypeRotateYZX: case XformOp.TypeRotateZXY: case XformOp.TypeRotateZYX:
        return precision === XformOp.PrecisionFloat ? 'float3'
          : precision === XformOp.PrecisionHalf ? 'half3' : 'double3'
      case XformOp.TypeTranslateX: case XformOp.TypeTranslateY: case XformOp.TypeTranslateZ:
      case XformOp.TypeScaleX: case XformOp.TypeScaleY: case XformOp.TypeScaleZ:
      case XformOp.TypeRotateX: case XformOp.TypeRotateY: case XformOp.TypeRotateZ:
        return precision === XformOp.PrecisionFloat ? 'float'
          : precision === XformOp.PrecisionHalf ? 'half' : 'double'
      case XformOp.TypeOrient:
        return precision === XformOp.PrecisionFloat ? 'quatf'
          : precision === XformOp.PrecisionHalf ? 'quath' : 'quatd'
      default:
        return ''
    }
  }

  // GetOpName(opType, opSuffix, inverse) (xformOp.cpp:490-506).
  static getOpName(opType: XformOp.Type, opSuffix = '', inverse = false): string {
    let opName = makeNamespaced(XformOp.getOpTypeToken(opType))
    if (opSuffix) opName = `${opName}:${opSuffix}`
    if (inverse) opName = INVERT_PREFIX + opName
    return opName
  }

  // GetOpTransform(opType, opVal, isInverseOp) (xformOp.cpp:514-694).
  static getOpTransform(opType: XformOp.Type, opVal: unknown, isInverseOp = false): GfMatrix4d {
    return new GfMatrix4d(...opMatrix(XformOp.getOpTypeToken(opType), opVal, isInverseOp))
  }

  // ---- Instance API ----

  // GetOpType (xformOp.h:238-240).
  getOpType(): XformOp.Type { return this.#opType }

  // GetPrecision (xformOp.cpp:484-488).
  getPrecision(): XformOp.Precision {
    return XformOp.getPrecisionFromValueTypeName(this.getTypeName())
  }

  // IsInverseOp (xformOp.h:247-249).
  isInverseOp(): boolean { return this.#isInverseOp }

  // HasSuffix (xformOp.cpp:508-512).
  hasSuffix(suffix: string): boolean { return this.getName().endsWith(suffix) }

  // GetOpName() (xformOp.cpp:176-182).
  getOpName(): string {
    return this.#isInverseOp ? INVERT_PREFIX + this.getName() : this.getName()
  }

  // GetOpTransform(time) (xformOp.cpp:696-708): the op's value at time, or
  // identity when it has none.
  getOpTransform(time?: number | UsdTimeCode): GfMatrix4d {
    const opVal = this.get(time)
    if (opVal === undefined) return new GfMatrix4d(1)
    return XformOp.getOpTransform(this.#opType, opVal, this.#isInverseOp)
  }

  // MightBeTimeVarying (xformOp.h:315-321).
  mightBeTimeVarying(): boolean {
    return this.#query ? this.#query.valueMightBeTimeVarying()
      : this.#attr?.valueMightBeTimeVarying() ?? false
  }

  // GetAttr (xformOp.h:327-330); also the implicit UsdAttribute conversion.
  getAttr(): Attribute { return this.#attr! }

  // IsDefined (xformOp.h:337) and explicit operator bool (xformOp.h:341-344).
  isDefined(): boolean { return XformOp.isXformOp(this.#attr) }

  // operator== (xformOp.h:348-357): ops are equal when their attributes are.
  equals(other: XformOp): boolean {
    const a = this.#attr
    const b = other.#attr
    if (!a?.isValid() || !b?.isValid()) return !a?.isValid() && !b?.isValid()
    return a.getPath() === b.getPath() && a.getStage() === b.getStage()
  }

  // UsdAttribute forwarding (xformOp.h:362-379).
  getName(): string { return this.getAttr().name }
  getBaseName(): string { return this.getAttr().getBaseName() }
  getNamespace(): string { return this.getAttr().getNamespace() }
  splitName(): string[] { return this.getAttr().splitName() }
  getTypeName(): string { return this.getAttr().typeName }

  // Get(value, time) (xformOp.h:386-389): the op's value at time, through
  // its attribute query when it has one; undefined when there is none.
  get(time?: number | UsdTimeCode): unknown {
    if (this.#query) return this.#query.get(time ?? 'default')
    return this.#attr?.get(time)
  }

  // Set(value, time) (xformOp.h:396-405): inverse ops take no value.
  set(value: unknown, time?: number | UsdTimeCode): boolean {
    if (this.#isInverseOp) {
      TF_CODING_ERROR(`Cannot set a value on the inverse xformOp '${this.getOpName()}'. `
        + 'Please set value on the paired non-inverse xformOp instead.')
      return false
    }
    const attr = this.#attr
    if (!attr?.isValid()) return false
    attr.set(value, time)
    return true
  }

  // GetTimeSamples (xformOp.h:411-413).
  getTimeSamples(): number[] {
    return this.#query ? this.#query.getTimeSamples() : this.#attr?.getTimeSampleKeys() ?? []
  }

  // GetTimeSamplesInInterval (xformOp.h:421-425).
  getTimeSamplesInInterval(interval: GfInterval): number[] {
    return this.#query ? this.#query.getTimeSamplesInInterval(interval)
      : this.#attr?.getTimeSamplesInInterval(interval) ?? []
  }

  // GetNumTimeSamples (xformOp.h:430-432).
  getNumTimeSamples(): number {
    return this.#query ? this.#query.getNumTimeSamples() : this.#attr?.getTimeSampleKeys().length ?? 0
  }

  // _GetAttributeQuery: the query XformQuery's ops hold
  // (xformable.cpp:870-878).
  _getAttributeQuery(): UsdAttributeQuery | undefined { return this.#query }
}

export declare namespace XformOp {
  /** UsdGeomXformOp::Type (xformOp.h:116-146). */
  type Type = number
  /** UsdGeomXformOp::Precision (xformOp.h:149-153). */
  type Precision = number
}

// TfEnum::GetName of a Type value (xformOp.cpp:30-49).
const TYPE_ENUM_NAMES = [
  'TypeInvalid', 'TypeTranslateX', 'TypeTranslateY', 'TypeTranslateZ', 'TypeTranslate',
  'TypeScaleX', 'TypeScaleY', 'TypeScaleZ', 'TypeScale', 'TypeRotateX', 'TypeRotateY',
  'TypeRotateZ', 'TypeRotateXYZ', 'TypeRotateXZY', 'TypeRotateYXZ', 'TypeRotateYZX',
  'TypeRotateZXY', 'TypeRotateZYX', 'TypeOrient', 'TypeTransform',
]

// _GetOpTypeEnumFromCString (xformOp.cpp:329-380).
function getOpTypeEnumFromString(token: string): XformOp.Type {
  const index = (TYPE_TOKENS as readonly string[]).indexOf(token)
  return index < 0 ? XformOp.TypeInvalid : index
}

// ---- Single-op matrix (row-vector convention) ----
// GetOpTransform (xformOp.cpp:514-694), with GfMatrix4d's row-vector
// products. Values arrive in any shape attribute reads produce (GfVec,
// tuples, quaternions, flat or nested matrices).

// GfMatrix(GfRotation(axis, degrees)): rotate ops build their per-axis
// rotations through GfRotation's quaternion (xformOp.cpp:579-587,628-630),
// so the matrix entries round exactly as GfMatrix4d::SetRotate does.
function makeRotateX(deg: number): Matrix4 { return axisRotation([1, 0, 0], deg) }
function makeRotateY(deg: number): Matrix4 { return axisRotation([0, 1, 0], deg) }
function makeRotateZ(deg: number): Matrix4 { return axisRotation([0, 0, 1], deg) }
function axisRotation(axis: [number, number, number], deg: number): Matrix4 {
  return [...new GfMatrix4d(1).setRotate(makeRotation(axis, deg)).GetArray()] as unknown as Matrix4
}

/** The op transform of an op type token as a flat row-major matrix. */
export function opMatrix(type: string, value: unknown, isInverse: boolean): Matrix4 {
  switch (type) {
    case 'translate': {
      const [tx, ty, tz] = asVec3(value)
      return makeTranslate(isInverse ? -tx : tx, isInverse ? -ty : ty, isInverse ? -tz : tz)
    }
    case 'translateX': return makeTranslate(asScalar(value) * (isInverse ? -1 : 1), 0, 0)
    case 'translateY': return makeTranslate(0, asScalar(value) * (isInverse ? -1 : 1), 0)
    case 'translateZ': return makeTranslate(0, 0, asScalar(value) * (isInverse ? -1 : 1))
    case 'scale': {
      const [sx, sy, sz] = asVec3(value)
      return isInverse ? makeScale(1 / sx, 1 / sy, 1 / sz) : makeScale(sx, sy, sz)
    }
    // Deliberate divergence (upstream bug, upstream-issues UI-4739): an
    // inverse single-axis scale scales by 1/v. Upstream negates every scalar op value for an inverse op
    // (xformOp.cpp:562-578), so its inverse scaleX of 2 scales by -2 (native
    // 26.11.1 GetOpTransform gives -2), which is not the inverse; the
    // three-component scale op inverts (xformOp.cpp:615-622).
    case 'scaleX': { const v = asScalar(value); return makeScale(isInverse ? 1 / v : v, 1, 1) }
    case 'scaleY': { const v = asScalar(value); return makeScale(1, isInverse ? 1 / v : v, 1) }
    case 'scaleZ': { const v = asScalar(value); return makeScale(1, 1, isInverse ? 1 / v : v) }
    case 'rotateX': return makeRotateX(asScalar(value) * (isInverse ? -1 : 1))
    case 'rotateY': return makeRotateY(asScalar(value) * (isInverse ? -1 : 1))
    case 'rotateZ': return makeRotateZ(asScalar(value) * (isInverse ? -1 : 1))
    // Packed Euler triples. GfMatrix uses row vectors, so the products below
    // directly mirror xformOp.cpp:624-652, associating left to right as C++
    // evaluates `xRot * yRot * zRot`. Inverse ops negate angles and reverse
    // the product.
    case 'rotateXYZ': {
      const [x, y, z] = asVec3(value)
      return !isInverse
        ? mul4(mul4(makeRotateX(x), makeRotateY(y)), makeRotateZ(z))
        : mul4(mul4(makeRotateZ(-z), makeRotateY(-y)), makeRotateX(-x))
    }
    case 'rotateXZY': {
      const [x, y, z] = asVec3(value)
      return !isInverse
        ? mul4(mul4(makeRotateX(x), makeRotateZ(z)), makeRotateY(y))
        : mul4(mul4(makeRotateY(-y), makeRotateZ(-z)), makeRotateX(-x))
    }
    case 'rotateYXZ': {
      const [x, y, z] = asVec3(value)
      return !isInverse
        ? mul4(mul4(makeRotateY(y), makeRotateX(x)), makeRotateZ(z))
        : mul4(mul4(makeRotateZ(-z), makeRotateX(-x)), makeRotateY(-y))
    }
    case 'rotateYZX': {
      const [x, y, z] = asVec3(value)
      return !isInverse
        ? mul4(mul4(makeRotateY(y), makeRotateZ(z)), makeRotateX(x))
        : mul4(mul4(makeRotateX(-x), makeRotateZ(-z)), makeRotateY(-y))
    }
    case 'rotateZXY': {
      const [x, y, z] = asVec3(value)
      return !isInverse
        ? mul4(mul4(makeRotateZ(z), makeRotateX(x)), makeRotateY(y))
        : mul4(mul4(makeRotateY(-y), makeRotateX(-x)), makeRotateZ(-z))
    }
    case 'rotateZYX': {
      const [x, y, z] = asVec3(value)
      return !isInverse
        ? mul4(mul4(makeRotateZ(z), makeRotateY(y)), makeRotateX(x))
        : mul4(mul4(makeRotateX(-x), makeRotateY(-y)), makeRotateZ(-z))
    }
    // xformOp.cpp:670-687: the quaternion, widened to GfQuatd, becomes a
    // GfRotation (which normalizes it through its axis and angle), inverted
    // for an inverse op, and the matrix is GfMatrix4d(rotation, 0).
    case 'orient': {
      let rotation = quatToRotation(asQuat(value))
      if (isInverse) rotation = rotationInverse(rotation)
      return [...new GfMatrix4d(1).setRotate(rotation).GetArray()] as unknown as Matrix4
    }
    case 'transform': {
      const flat = asMatrix4Flat(value)
      const mat = flat ? (flat as unknown as Matrix4) : ([...IDENTITY_MATRIX] as Matrix4)
      if (!isInverse) return mat
      // xformOp.cpp:537-545: inverting a singular matrix is a coding error.
      const determinant = new GfMatrix4d(...mat).getDeterminant()
      if (Math.abs(determinant) <= 1e-9) {
        TF_CODING_ERROR(`Cannot invert singular transform op with value ${new GfMatrix4d(...mat)}.`)
      }
      return invertMatrix4(mat)
    }
    default:
      return [...IDENTITY_MATRIX] as Matrix4
  }
}
