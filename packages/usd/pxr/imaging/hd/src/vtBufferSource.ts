// Ported from OpenUSD 26.11.1: pxr/imaging/hd/vtBufferSource.cpp,
//  pxr/imaging/hd/vtBufferSource.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/vtBufferSource.{h,cpp} (OpenUSD 26.11.1).
//
// A resolved buffer source over a VtValue: its tuple type comes from
// HdGetValueTupleType and its bytes from HdGetValueData.
//
// Divergences:
// - The three upstream constructors (VtValue, GfMatrix4d, VtArray<GfMatrix4d>)
//   are one constructor that dispatches on the argument, as JS has no
//   overloads.
// - CreateEmpty is kept for existing callers; it is the VtValue() case.
// - GetData caches HdGetValueData's view; operator<< is GetDebugString.

import {
  Value as VtValue,
  ValueTypes as VtValueTypes,
  Array as VtArray,
} from 'typescript-usd/vt'
import {
  Matrix2f as GfMatrix2f,
  Matrix3f as GfMatrix3f,
  Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f,
  Vec2f as GfVec2f, Vec3f as GfVec3f, Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import {
  TfDiagnosticMgr, TfDiagnosticType, Error as TfError,
  TfEnvSetting, TfGetEnvSetting, Type as TfType,
} from 'typescript-usd/tf'
import { HdResolvedBufferSource } from './bufferSource.ts'
import type { HdBufferSpec } from './bufferSpec.ts'
import {
  type HdTupleType, HdDataSizeOfTupleType, HdType,
  HdGetValueTupleType, HdGetValueData,
} from './types.ts'

/** vtBufferSource.cpp:196-197 */
const HD_ENABLE_DOUBLE_MATRIX = new TfEnvSetting<boolean>('HD_ENABLE_DOUBLE_MATRIX', false, '')

const _emptyData = new Uint8Array(0)

type _Conversion = { from: string, to: TfType, make: (v: unknown) => unknown }

/** vtBufferSource.cpp:89-133 conversions applied when !allowDoubles (built
 *  once: they are the same for every buffer source). */
let _doubleToFloatConversions: _Conversion[] | undefined
function _DoubleToFloatConversions(): _Conversion[] {
  return _doubleToFloatConversions ??= _MakeDoubleToFloatConversions()
}
function _MakeDoubleToFloatConversions(): _Conversion[] {
  const flt = (x: number) => Math.fround(x)
  const comps = (v: unknown) => (v as { data: readonly number[] }).data
  const mat = (v: unknown) => (v as { GetArray(): readonly number[] }).GetArray()
  return [
    { from: 'double', to: VtValueTypes.float, make: v => flt(v as number) },
    { from: 'GfVec2d', to: VtValueTypes.GfVec2f, make: v => new GfVec2f(...comps(v)) },
    { from: 'GfVec3d', to: VtValueTypes.GfVec3f, make: v => new GfVec3f(...comps(v)) },
    { from: 'GfVec4d', to: VtValueTypes.GfVec4f, make: v => new GfVec4f(...comps(v)) },
    { from: 'GfMatrix2d', to: TfType.declare('GfMatrix2f'), make: v => new GfMatrix2f(...mat(v)) },
    { from: 'GfMatrix3d', to: TfType.declare('GfMatrix3f'), make: v => new GfMatrix3f(...mat(v)) },
    { from: 'GfMatrix4d', to: TfType.declare('GfMatrix4f'), make: v => new GfMatrix4f(v as GfMatrix4d) },
  ]
}

/** vtBufferSource.h:32-140 */
export class HdVtBufferSource extends HdResolvedBufferSource {
  private _name: string
  private _value: VtValue = VtValue.getEmpty()
  private _data: ArrayBufferView | null = null
  private _tupleType: HdTupleType = { type: HdType.HdTypeInvalid, count: 0 }
  private _numElements = 0

  /**
   * vtBufferSource.cpp:146-172.
   *   (name, VtValue, arraySize = 1, allowDoubles = true)
   *   (name, GfMatrix4d, allowDoubles = true)
   *   (name, VtArray<GfMatrix4d>, arraySize = 1, allowDoubles = true)
   */
  constructor(name: string, value: VtValue | GfMatrix4d | VtArray<GfMatrix4d>,
    arraySize?: number | boolean, allowDoubles?: boolean)
  constructor(
    name: string,
    value: VtValue | GfMatrix4d | VtArray<GfMatrix4d>,
    arg2?: number | boolean,
    arg3?: boolean,
  ) {
    super()
    this._name = name
    if (value instanceof GfMatrix4d) {
      // vtBufferSource.cpp:153-161
      const allowDoubles = (arg2 as boolean | undefined) ?? true
      const resolvedAllowDoubles = allowDoubles &&
        HdVtBufferSource.getDefaultMatrixType() === HdType.HdTypeDoubleMat4
      this._setValue(VtValue.create(value, VtValueTypes.GfMatrix4d), 1, resolvedAllowDoubles)
      return
    }
    if (value instanceof VtArray) {
      // vtBufferSource.cpp:163-172
      const allowDoubles = arg3 ?? true
      const resolvedAllowDoubles = allowDoubles &&
        HdVtBufferSource.getDefaultMatrixType() === HdType.HdTypeDoubleMat4
      this._setValue(VtValue.createArray(value), (arg2 as number | undefined) ?? 1,
        resolvedAllowDoubles)
      return
    }
    this._setValue(value, (arg2 as number | undefined) ?? 1, arg3 ?? true)
  }

  /** The VtValue() case (kept for existing callers). */
  static createEmpty(name: string): HdVtBufferSource {
    return new HdVtBufferSource(name, VtValue.getEmpty())
  }

  /** vtBufferSource.cpp:55-144 */
  private _setValue(v: VtValue, arraySize: number, allowDoubles: boolean): void {
    this._value = v
    this._tupleType = HdGetValueTupleType(this._value)

    // For the common case of a default value of an empty array, the
    // tuple type is the element type with count 1 and there are no
    // elements (vtBufferSource.cpp:60-68).
    if (this._value.isArrayValued() && this._value.getArraySize() === 0) {
      this._tupleType = { type: this._tupleType.type, count: 1 }
      this._numElements = 0
      this._data = HdGetValueData(this._value)
      return
    }

    const typeName = this._value.getTypeName()
    const elementTypeName = this._value.getElementType().getTypeName()
    if (typeName === 'bool') {
      // vtBufferSource.cpp:78-81
      const intValue = this._value.UncheckedGet<boolean>() ? 1 : 0
      this._value = VtValue.create(intValue, VtValueTypes.int)
      // _tupleType is not updated upstream (HdTypeBool, 1).
    } else if (this._value.isArrayValued() && elementTypeName === 'bool') {
      // vtBufferSource.cpp:82-88
      const boolValues = this._value.UncheckedGet<VtArray<boolean>>()
      const intValues = new VtArray<number>(
        boolValues.toArray().map(b => (b ? 1 : 0)), VtValueTypes.int)
      this._value = VtValue.createArray(intValues)
    } else if (!allowDoubles) {
      // vtBufferSource.cpp:89-134
      for (const c of _DoubleToFloatConversions()) {
        if (this._value.isArrayValued() ? elementTypeName === c.from : typeName === c.from) {
          if (this._value.isArrayValued()) {
            const dblArray = this._value.UncheckedGet<VtArray<unknown>>()
            const fltArray = new VtArray<unknown>(dblArray.toArray().map(c.make), c.to)
            this._value = VtValue.createArray(fltArray)
          } else {
            this._value = VtValue.create(c.make(this._value.UncheckedGet<unknown>()), c.to)
          }
          this._tupleType = HdGetValueTupleType(this._value)
          break
        }
      }
    }

    // vtBufferSource.cpp:136-143: the element count and per-element array size.
    this._numElements = Math.floor(this._tupleType.count / arraySize)
    this._tupleType = { type: this._tupleType.type, count: arraySize }
    this._data = HdGetValueData(this._value)
  }

  /** vtBufferSource.cpp:178-189 */
  truncate(numElements: number): void {
    if (numElements > this._numElements) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Buffer '${this._name}', cannot truncate from length ` +
        `${this._numElements} to length ${numElements}`,
        TfDiagnosticType.CodingError))
      return
    }
    this._numElements = numElements
  }

  /** vtBufferSource.cpp:191-199 */
  static getDefaultMatrixType(): HdType {
    return TfGetEnvSetting(HD_ENABLE_DOUBLE_MATRIX)
      ? HdType.HdTypeDoubleMat4 : HdType.HdTypeFloatMat4
  }

  /** vtBufferSource.h:87-89 */
  getName(): string {
    return this._name
  }

  /** vtBufferSource.h:92-94 */
  getData(): ArrayBufferView {
    return this._data ?? _emptyData
  }

  /** vtBufferSource.h:97-99 */
  getTupleType(): HdTupleType {
    return this._tupleType
  }

  /** vtBufferSource.cpp:201-206 */
  getNumElements(): number {
    return this._numElements
  }

  /** vtBufferSource.h:107-109 */
  getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._name, tupleType: this._tupleType }]
  }

  /** vtBufferSource.h:112-118 */
  override resolve(): boolean {
    if (!this._tryLock()) {
      return false
    }
    // nothing. just marks as resolved, and returns _data in GetData()
    this._setResolved()
    return true
  }

  /** The held value (not upstream API; the value GetData views). */
  GetValue(): VtValue {
    return this._value
  }

  /** vtBufferSource.cpp:208-212 */
  protected _checkValid(): boolean {
    return this._tupleType.type !== HdType.HdTypeInvalid
  }

  /** vtBufferSource.cpp:214-225 operator<< */
  getDebugString(): string {
    const t = this.getTupleType()
    return 'Buffer Source:\n' +
      `    Name:      ${this.getName()}\n` +
      `    Size:      ${HdDataSizeOfTupleType(t)}\n` +
      `    Type:      ${HdType[t.type]}\n` +
      `    Count:     ${t.count}\n` +
      `    Num elems: ${this.getNumElements()}\n`
  }
}

