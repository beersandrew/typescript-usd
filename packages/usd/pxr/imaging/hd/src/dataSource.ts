// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSource.cpp,
//  pxr/imaging/hd/dataSource.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/dataSource.h
// HdDataSourceBase, HdContainerDataSource, HdSampledDataSource, HdTypedSampledDataSource<T>

import type { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdGetContributingSampleTimesForInterval } from './timeSampleArray.ts'
import { TfStreamDouble, TfStreamFloat, Type as TfType } from 'typescript-usd/tf'
import {
  Value as VtValue, Array as VtArray, Dictionary as VtDictionary, ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import {
  _VecBase as GfVec, _MatrixBase as GfMatrix,
  Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath, Quaternion as GfQuaternion,
  Range1d as GfRange1d, Range1f as GfRange1f, Range2d as GfRange2d, Range2f as GfRange2f,
  Range3d as GfRange3d, Range3f as GfRange3f,
  Matrix4d as GfMatrix4d, Matrix3d as GfMatrix3d, Matrix2d as GfMatrix2d,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'

// ---- Base ----

export abstract class HdDataSourceBase {}

// ---- Container ----

export abstract class HdContainerDataSource extends HdDataSourceBase {
  abstract getNames(): string[]
  abstract Get(name: string): HdDataSourceBase | undefined

  // Hierarchical access: walks a locator path through nested containers
  static Get(
    container: HdContainerDataSource | undefined,
    locator: HdDataSourceLocator,
  ): HdDataSourceBase | undefined {
    let current: HdDataSourceBase | undefined = container
    for (let i = 0; i < locator.getElementCount(); i++) {
      if (!(current instanceof HdContainerDataSource)) return undefined
      current = current.Get(locator.getElement(i))
    }
    return current
  }
}



// ---- HdDebugPrintDataSource (dataSource.cpp:113-152) ----

/** std::ostream default floating-point formatting (precision 6, %g), used
 *  for values upstream streams without TfStreamFloat/TfStreamDouble (e.g.
 *  GfHalf, which streams as float through the half operator<<). */
function _FormatG6(x: number): string {
  if (Number.isNaN(x)) return 'nan'
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf'
  if (x === 0) return Object.is(x, -0) ? '-0' : '0'
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(6)))))
  if (exp < -4 || exp >= 6) {
    let [m, e] = x.toExponential(5).split('e') as [string, string]
    if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '')
    const en = Number(e)
    return `${m}e${en < 0 ? '-' : '+'}${String(Math.abs(en)).padStart(2, '0')}`
  }
  let f = x.toFixed(Math.max(0, 5 - exp))
  if (f.includes('.')) f = f.replace(/0+$/, '').replace(/\.$/, '')
  return f
}

/** Gf_OstreamHelperP (gf/ostreamHelpers.h:24-33) for one scalar of the given
 *  Gf scalar kind. */
function _StreamScalar(x: number, kind: string): string {
  switch (kind) {
    case 'f': return TfStreamFloat(x)
    case 'd': return TfStreamDouble(x)
    case 'h': return _FormatG6(x)
    default: return String(x)
  }
}

/** Kind of a scalar Vt type name: 'f'loat, 'd'ouble, 'h'alf, 'i'ntegral,
 *  'b'ool, or '' (unknown). */
function _KindOfTypeName(typeName: string | undefined): string {
  switch (typeName) {
    case 'float': return 'f'
    case 'double': case 'GfDuration': return 'd'
    case 'half': return 'h'
    case 'bool': return 'b'
    case 'uchar': case 'short': case 'ushort': case 'int': case 'uint':
    case 'int64': case 'uint64': case 'size_t': return 'i'
    default: return ''
  }
}

function _IsGfVec(v: unknown): v is GfVec { return v instanceof GfVec }

/**
 * The text std::ostream << VtValue writes for a value (vt/value.cpp:529-532,
 * vt/streamOut.{h,cpp}, the Gf operator<< overloads, sdf/assetPath.cpp:168-172,
 * vt/dictionary.cpp:502-516).
 *
 * `typeName` is the Vt type name when known (a VtValue's held type, or the
 * valueType of an HdRetainedTypedSampledDataSource). A JS number without a
 * type is streamed as an integer when integral, else as a float when it is
 * exactly a float32 (TfStreamFloat), else as a double (TfStreamDouble).
 * Divergence: a double that is exactly float32-representable and untyped
 * prints with float shortest-repr. Objects without a known operator<< print
 * as Vt_StreamOutGeneric (`<'TypeName' @ 0x...>`, vt/streamOut.cpp:25-32)
 * with a placeholder address; objects with their own toString use it.
 */
export function _HdStreamOutValue(value: unknown, typeName?: string): string {
  if (value instanceof VtValue) {
    if (value.IsEmpty()) return ''
    return _HdStreamOutValue(value.Get(), value.getTypeName())
  }
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    const kind = _KindOfTypeName(typeName)
    if (kind === 'b') return value ? '1' : '0'
    if (kind) return _StreamScalar(value, kind)
    if (Number.isInteger(value)) return String(value)
    return Math.fround(value) === value ? TfStreamFloat(value) : TfStreamDouble(value)
  }
  if (value instanceof VtArray) {
    const elemType = value.getElementType().getTypeName()
    return `[${value.toArray().map(e => _HdStreamOutValue(e, elemType)).join(', ')}]`
  }
  if (Array.isArray(value)) {
    const elemType = typeName?.endsWith('[]') ? typeName.slice(0, -2) : undefined
    return `[${value.map(e => _HdStreamOutValue(e, elemType)).join(', ')}]`
  }
  if (value instanceof Float32Array) {
    return `[${Array.from(value, e => TfStreamFloat(e)).join(', ')}]`
  }
  if (value instanceof Float64Array) {
    return `[${Array.from(value, e => TfStreamDouble(e)).join(', ')}]`
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return `[${Array.from(value as unknown as ArrayLike<number | bigint>, e => String(e)).join(', ')}]`
  }
  if (_IsGfVec(value)) {
    return `(${value.data.map(x => _StreamScalar(x, value.scalarKind)).join(', ')})`
  }
  if (value instanceof GfMatrix) {
    const n = value.dimension
    const m = value.GetArray()
    const rows: string[] = []
    for (let i = 0; i < n; i++) {
      rows.push(`(${m.slice(i * n, i * n + n).map(x => _StreamScalar(x, value.scalarKind)).join(', ')})`)
    }
    return `( ${rows.join(', ')} )`
  }
  if (value instanceof GfQuatd || value instanceof GfQuatf || value instanceof GfQuath) {
    // quat{d,f,h}.cpp operator<<: streams GfVec4(real, imaginary...)
    const kind = value instanceof GfQuatd ? 'd' : value instanceof GfQuatf ? 'f' : 'h'
    const im = value.GetImaginary()
    return `(${[value.GetReal(), im.get(0), im.get(1), im.get(2)]
      .map(x => _StreamScalar(x, kind)).join(', ')})`
  }
  if (value instanceof GfQuaternion) {
    // quaternion.cpp:128-133
    return `(${TfStreamDouble(value.GetReal())} + ${_HdStreamOutValue(value.GetImaginary())})`
  }
  if (value instanceof GfRange1d || value instanceof GfRange1f) {
    const kind = value instanceof GfRange1d ? 'd' : 'f'
    return `[${_StreamScalar(value.getMin(), kind)}...${_StreamScalar(value.getMax(), kind)}]`
  }
  if (value instanceof GfRange2d || value instanceof GfRange2f ||
      value instanceof GfRange3d || value instanceof GfRange3f) {
    return `[${_HdStreamOutValue(value.getMin())}...${_HdStreamOutValue(value.getMax())}]`
  }
  if (value instanceof SdfAssetPath) {
    // sdf/assetPath.cpp:168-172
    return `@${value.getAssetPath()}@`
  }
  if (value instanceof VtDictionary) {
    // vt/dictionary.cpp:502-516 (std::map order)
    const entries = [...value].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return `{${entries.map(([k, v]) => `'${k}': ${_HdStreamOutValue(v)}`).join(', ')}}`
  }
  if (typeof value === 'object' &&
      (value as object).toString !== Object.prototype.toString) {
    return String(value)
  }
  const name = (value as object).constructor?.name ?? typeof value
  return `<'${name}' @ 0x000000000000>`
}

/** Typed retained data sources carry the Vt type of their value. */
function _ValueTypeName(ds: HdSampledDataSource): string | undefined {
  if (ds instanceof HdRetainedTypedSampledDataSource) {
    const t = ds.valueType as { getTypeName?: () => string } | undefined
    return t && typeof t.getTypeName === 'function' ? t.getTypeName() : undefined
  }
  return undefined
}

/**
 * HdDebugPrintDataSource, dataSource.cpp:113-145: prints a data source to a
 * string (upstream writes to a std::ostream). Container names are printed in
 * std::set<TfToken> order; sampled values as std::ostream << VtValue
 * (_HdStreamOutValue).
 */
export function HdDebugPrintDataSource(
  dataSource: HdDataSourceBase | undefined,
  level: number = 0,
): string {
  const indent = '\t'.repeat(level)

  if (dataSource instanceof HdContainerDataSource) {
    const names = [...new Set(dataSource.getNames())]
      .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
    let s = ''
    for (const name of names) {
      // null children from a container should be treated as not present
      const child = dataSource.Get(name)
      if (child) {
        s += `${indent}[${name}]\n`
        s += HdDebugPrintDataSource(child, level + 1)
      }
    }
    return s
  } else if (dataSource instanceof HdVectorDataSource) {
    let s = ''
    const nElements = dataSource.getNumElements()
    for (let i = 0; i < nElements; ++i) {
      s += `${indent}[${i}]\n`
      s += HdDebugPrintDataSource(dataSource.getElement(i), level + 1)
    }
    return s
  } else if (dataSource instanceof HdSampledDataSource) {
    return `${indent}${_HdStreamOutValue(dataSource.GetValue(0), _ValueTypeName(dataSource))}\n`
  } else if (dataSource) {
    return `${indent}UNKNOWN\n`
  } else {
    return `${indent}NULL\n`
  }
}


// ---- Sampled (time-varying) ----

export abstract class HdSampledDataSource extends HdDataSourceBase {
  // shutterOffset=0 → current frame value
  abstract GetValue(shutterOffset: number): unknown
  abstract GetContributingSampleTimesForInterval(
    startTime: number,
    endTime: number,
    outSampleTimes: number[],
  ): boolean

  /**
   * The VtValue upstream's `GetValue(shutterOffset)` returns (dataSource.h
   * HdSampledDataSource::GetValue), for consumers that need the value's Vt
   * type, such as usdview's Hydra Scene Debugger.
   * FAITHFULNESS-DEBT(hd-sampled-get-value-vtvalue): GetValue returns the
   * typed value or a VtValue in this port (see "Data source value
   * conversion" below). Retire this when GetValue returns a VtValue, as
   * dataSource.h declares it.
   */
  static _interim_GetVtValue(ds: HdSampledDataSource, shutterOffset: number): VtValue {
    return _ToVtValue(ds, shutterOffset)
  }
}

// ---- Typed sampled ----

export abstract class HdTypedSampledDataSource<T> extends HdSampledDataSource {
  abstract getTypedValue(shutterOffset: number): T

  GetValue(shutterOffset: number): unknown {
    return this.getTypedValue(shutterOffset)
  }
}

// ---- Concrete typed aliases (mirrors hd/dataSourceTypeDefs.h) ----

export abstract class HdBoolDataSource    extends HdTypedSampledDataSource<boolean> {}
export abstract class HdIntDataSource     extends HdTypedSampledDataSource<number> {}
export abstract class HdFloatDataSource   extends HdTypedSampledDataSource<number> {}
export abstract class HdDoubleDataSource  extends HdTypedSampledDataSource<number> {}
export abstract class HdTokenDataSource   extends HdTypedSampledDataSource<string> {}
export abstract class HdStringDataSource  extends HdTypedSampledDataSource<string> {}
export abstract class HdPathDataSource    extends HdTypedSampledDataSource<string> {}

export abstract class HdIntArrayDataSource    extends HdTypedSampledDataSource<number[]> {}
export abstract class HdFloatArrayDataSource  extends HdTypedSampledDataSource<number[]> {}
export abstract class HdTokenArrayDataSource  extends HdTypedSampledDataSource<string[]> {}
export abstract class HdPathArrayDataSource   extends HdTypedSampledDataSource<string[]> {}

// Vec types (stored as flat number tuples)
export abstract class HdVec2fDataSource   extends HdTypedSampledDataSource<[number,number]> {}
export abstract class HdVec3fDataSource   extends HdTypedSampledDataSource<[number,number,number]> {}
export abstract class HdVec4fDataSource   extends HdTypedSampledDataSource<[number,number,number,number]> {}
export abstract class HdVec3dDataSource   extends HdTypedSampledDataSource<[number,number,number]> {}
export abstract class HdMatrix4dDataSource extends HdTypedSampledDataSource<number[]> {} // 16 elements row-major
export abstract class HdVec3fArrayDataSource extends HdTypedSampledDataSource<number[]> {} // flat: x0,y0,z0,x1,y1,z1,...
export abstract class HdVec2fArrayDataSource extends HdTypedSampledDataSource<number[]> {} // flat: u0,v0,u1,v1,...

// ---- Retained (static-value) implementations ----

// HdRetainedTypedSampledDataSource<T>: holds a fixed value, no time variance
export class HdRetainedTypedSampledDataSource<T> extends HdTypedSampledDataSource<T> {
  private _value: T
  /** The Vt type of the value when it was created from a VtValue
   *  (HdCreateTypedRetainedDataSource, retainedDataSource.cpp:355-401,
   *  instantiates HdRetainedTypedSampledDataSource<T> for the VtValue's
   *  held type T). A plain JS number or string does not carry float vs
   *  double or token vs string, so the type is kept with the value for
   *  consumers that turn it back into a VtValue. */
  readonly valueType: unknown
  constructor(value: T, valueType?: unknown) { super(); this._value = value; this.valueType = valueType }
  getTypedValue(_shutterOffset: number): T { return this._value }
  GetContributingSampleTimesForInterval(
    _startTime?: number,
    _endTime?: number,
    _outSampleTimes?: number[],
  ): boolean { return false }

  static new<T>(value: T): HdRetainedTypedSampledDataSource<T> {
    return new HdRetainedTypedSampledDataSource(value)
  }
}

// Convenience constructors matching USD naming
export const HdRetainedContainerDataSource = {
  new(names: string[], values: HdDataSourceBase[]): HdContainerDataSource {
    const map = new Map<string, HdDataSourceBase>()
    for (let i = 0; i < names.length; i++) map.set(names[i]!, values[i]!)
    return new _RetainedContainer(map)
  },
}

class _RetainedContainer extends HdContainerDataSource {
  constructor(private _map: Map<string, HdDataSourceBase>) { super() }
  getNames(): string[] { return [...this._map.keys()] }
  Get(name: string): HdDataSourceBase | undefined { return this._map.get(name) }
}

// ---- Vector data source (dataSource.h HdVectorDataSource; retained form
// from retainedDataSource.h HdRetainedSmallVectorDataSource) ----

export abstract class HdVectorDataSource extends HdDataSourceBase {
  abstract getNumElements(): number
  abstract getElement(index: number): HdDataSourceBase | undefined
}

export class HdRetainedSmallVectorDataSource extends HdVectorDataSource {
  constructor(private _elements: HdDataSourceBase[]) { super() }
  getNumElements(): number { return this._elements.length }
  getElement(index: number): HdDataSourceBase | undefined { return this._elements[index] }

  static new(elements: HdDataSourceBase[]): HdRetainedSmallVectorDataSource {
    return new HdRetainedSmallVectorDataSource(elements)
  }
}

/** HdGetMergedContributingSampleTimesForInterval, dataSource.cpp:57-111:
 *  merges the contributing sample times of the given data sources (sorted
 *  set union) and filters them with HdGetContributingSampleTimesForInterval.
 *  The `count` argument of upstream is the array length here. */
export function HdGetMergedContributingSampleTimesForInterval(
  inputDataSources: readonly (HdSampledDataSource | undefined)[],
  startTime: number,
  endTime: number,
  outSampleTimes: number[] | undefined,
): boolean {
  let result = false
  let sampleTimes: number[] = []

  for (const ds of inputDataSources) {
    if (!ds) continue
    const times: number[] = []
    if (!ds.GetContributingSampleTimesForInterval(startTime, endTime, times)) {
      continue
    }
    result = true
    if (!outSampleTimes) continue
    if (sampleTimes.length === 0) {
      sampleTimes = times
    } else {
      // std::set_union of two sorted ranges
      const union: number[] = []
      let i = 0, j = 0
      while (i < sampleTimes.length && j < times.length) {
        const a = sampleTimes[i]!, b = times[j]!
        if (a < b) { union.push(a); ++i }
        else if (b < a) { union.push(b); ++j }
        else { union.push(a); ++i; ++j }
      }
      while (i < sampleTimes.length) union.push(sampleTimes[i++]!)
      while (j < times.length) union.push(times[j++]!)
      sampleTimes = union
    }
  }

  if (!result) return false

  const r = HdGetContributingSampleTimesForInterval(
    sampleTimes.length, sampleTimes, startTime, endTime)
  if (outSampleTimes) outSampleTimes.splice(0, outSampleTimes.length, ...r.sampleTimes)
  return r.changing
}

// ----------------------------------------------------------------------------
// Data source value conversion (the one divergence point for values).
// Moved here from sceneIndexAdapterSceneDelegate.ts, its first user.
//
// Upstream, HdSampledDataSource::GetValue returns a VtValue and typed data
// sources return their C++ type. In this port, data sources reaching the
// adapter come from two producers:
// - faithful ones (HdDataSourceLegacyPrim, retained data sources) hold a
//   VtValue (HdRetainedSampledDataSource) for type-erased values and the
//   typed values of the conventions (GfMatrix4d, Gf vectors, number[] for
//   VtIntArray/VtFloatArray, string for TfToken/SdfPath) for typed members;
// - the pre-existing usdImaging stage scene index, whose typed data sources
//   return plain JavaScript values (flat number[] for Vec2f/Vec3f arrays,
//   number[16] row-major for Matrix4d, [x, y, z] tuples for vectors, number[]
//   for int/float arrays, strings for tokens) with the data source subclass
//   (dataSource.ts) as the only type information.
// _ToVtValue turns either into the VtValue upstream's GetValue would return;
// _GetTypedValue turns either into the value upstream's GetTypedValue would
// return (Gf types where a Gf type is requested).

type _GfCtor = new (...args: unknown[]) => unknown

interface _TypeSpec {
  // VtValue type (scalar) or element type (array).
  type: TfType
  array: boolean
  // Gf class constructed from a plain number tuple / flat chunk.
  ctor?: _GfCtor
  width?: number
}

export const _SdfPathType = TfType.declare('SdfPath')
export const _GfRange1fType = TfType.declare('GfRange1f')
const _GfRange2fType = TfType.declare('GfRange2f')
const _GfRange3dType = TfType.declare('GfRange3d')

// Gf value classes and their Vt types, for inference from held objects.
const _gfClasses: ReadonlyArray<[_GfCtor, TfType, number]> = [
  [GfMatrix4d as unknown as _GfCtor, VtValueTypes.GfMatrix4d, 16],
  [GfMatrix3d as unknown as _GfCtor, VtValueTypes.GfMatrix3d, 9],
  [GfMatrix2d as unknown as _GfCtor, VtValueTypes.GfMatrix2d, 4],
  [GfVec2f as unknown as _GfCtor, VtValueTypes.GfVec2f, 2],
  [GfVec3f as unknown as _GfCtor, VtValueTypes.GfVec3f, 3],
  [GfVec4f as unknown as _GfCtor, VtValueTypes.GfVec4f, 4],
  [GfVec2d as unknown as _GfCtor, VtValueTypes.GfVec2d, 2],
  [GfVec3d as unknown as _GfCtor, VtValueTypes.GfVec3d, 3],
  [GfVec4d as unknown as _GfCtor, VtValueTypes.GfVec4d, 4],
  [GfVec2i as unknown as _GfCtor, VtValueTypes.GfVec2i, 2],
  [GfVec3i as unknown as _GfCtor, VtValueTypes.GfVec3i, 3],
  [GfVec4i as unknown as _GfCtor, VtValueTypes.GfVec4i, 4],
  [GfRange1f as unknown as _GfCtor, _GfRange1fType, 2],
  [GfRange2f as unknown as _GfCtor, _GfRange2fType, 4],
  [GfRange3d as unknown as _GfCtor, _GfRange3dType, 6],
]

function _GfSpec(type: TfType, array: boolean): _TypeSpec {
  for (const [ctor, t, width] of _gfClasses) {
    if (t === type) return { type, array, ctor, width }
  }
  return { type, array }
}

// The value type a dataSource.ts subclass declares (dataSourceTypeDefs.h).
function _SpecFromDataSourceClass(ds: HdDataSourceBase): _TypeSpec | undefined {
  if (ds instanceof HdVec3fArrayDataSource) return _GfSpec(VtValueTypes.GfVec3f, true)
  if (ds instanceof HdVec2fArrayDataSource) return _GfSpec(VtValueTypes.GfVec2f, true)
  if (ds instanceof HdIntArrayDataSource) return { type: VtValueTypes.int, array: true }
  if (ds instanceof HdFloatArrayDataSource) return { type: VtValueTypes.float, array: true }
  if (ds instanceof HdTokenArrayDataSource) return { type: VtValueTypes.token, array: true }
  if (ds instanceof HdPathArrayDataSource) return { type: _SdfPathType, array: true }
  if (ds instanceof HdMatrix4dDataSource) return _GfSpec(VtValueTypes.GfMatrix4d, false)
  if (ds instanceof HdVec2fDataSource) return _GfSpec(VtValueTypes.GfVec2f, false)
  if (ds instanceof HdVec3fDataSource) return _GfSpec(VtValueTypes.GfVec3f, false)
  if (ds instanceof HdVec4fDataSource) return _GfSpec(VtValueTypes.GfVec4f, false)
  if (ds instanceof HdVec3dDataSource) return _GfSpec(VtValueTypes.GfVec3d, false)
  if (ds instanceof HdBoolDataSource) return { type: VtValueTypes.bool, array: false }
  if (ds instanceof HdIntDataSource) return { type: VtValueTypes.int, array: false }
  if (ds instanceof HdFloatDataSource) return { type: VtValueTypes.float, array: false }
  if (ds instanceof HdDoubleDataSource) return { type: VtValueTypes.double, array: false }
  if (ds instanceof HdTokenDataSource) return { type: VtValueTypes.token, array: false }
  if (ds instanceof HdStringDataSource) return { type: VtValueTypes.string, array: false }
  if (ds instanceof HdPathDataSource) return { type: _SdfPathType, array: false }
  return undefined
}

// The Vt type of a held JS value when nothing else declares it: Gf objects
// by class, booleans as bool, strings as TfToken, numbers as double;
// arrays by their first element (numbers as float, the common primvar type).
function _SpecFromValue(value: unknown): _TypeSpec | undefined {
  const array = Array.isArray(value)
  const sample = array ? (value as unknown[])[0] : value
  if (array && sample === undefined) return undefined
  for (const [ctor, type, width] of _gfClasses) {
    if (sample instanceof ctor) return { type, array, ctor, width }
  }
  switch (typeof sample) {
    case 'boolean': return { type: VtValueTypes.bool, array }
    case 'string': return { type: VtValueTypes.token, array }
    case 'number': return { type: array ? VtValueTypes.float : VtValueTypes.double, array }
  }
  return undefined
}

function _MakeGf(spec: _TypeSpec, value: unknown): unknown {
  if (!spec.ctor || value instanceof spec.ctor) return value
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const tuple = Array.from(value as ArrayLike<number>)
    if (spec.type === _GfRange1fType) return new GfRange1f(tuple[0]!, tuple[1]!)
    if (spec.type === _GfRange2fType) {
      return new GfRange2f(new GfVec2f(tuple[0]!, tuple[1]!), new GfVec2f(tuple[2]!, tuple[3]!))
    }
    if (spec.type === _GfRange3dType) {
      return new GfRange3d(new GfVec3d(tuple[0]!, tuple[1]!, tuple[2]!),
        new GfVec3d(tuple[3]!, tuple[4]!, tuple[5]!))
    }
    return new spec.ctor(...tuple)
  }
  return value
}

function _MakeArray(spec: _TypeSpec, value: unknown): VtArray<unknown> {
  if (value instanceof VtArray) return value as VtArray<unknown>
  const items = Array.from(value as ArrayLike<unknown>)
  if (spec.ctor && spec.width && items.length > 0 && typeof items[0] === 'number') {
    // Flat tuple layout (x0, y0, z0, x1, ...).
    const out: unknown[] = []
    for (let i = 0; i + spec.width <= items.length; i += spec.width) {
      out.push(_MakeGf(spec, items.slice(i, i + spec.width)))
    }
    return new VtArray<unknown>(out, spec.type)
  }
  return new VtArray<unknown>(items.map(item => _MakeGf(spec, item)), spec.type)
}

/** The VtValue upstream's `ds->GetValue(shutterOffset)` returns. `type`, when
 *  given, is the C++ value type the calling code knows for this member. */
export function _ToVtValue(ds: HdSampledDataSource, shutterOffset: number,
  type?: TfType): VtValue {
  const value = ds.GetValue(shutterOffset)
  if (value instanceof VtValue) return value
  if (value === undefined || value === null) return VtValue.getEmpty()
  if (value instanceof VtArray) return VtValue.createArray(value as VtArray<unknown>)
  if (value instanceof VtDictionary) return VtValue.createDictionary(value)
  // A retained data source created from a VtValue keeps its held type
  // (HdCreateTypedRetainedDataSource): float stays float.
  if (!type && ds instanceof HdRetainedTypedSampledDataSource && ds.valueType instanceof TfType) {
    // An array type (`int[]`, the VtIntArray of
    // HdRetainedTypedSampledDataSource<VtIntArray>) over a plain JS array
    // is held as the VtArray of its element type.
    const name = ds.valueType.getTypeName()
    if (name.endsWith('[]') && (Array.isArray(value) || ArrayBuffer.isView(value))) {
      return VtValue.createArray(_MakeArray(_GfSpec(TfType.declare(name.slice(0, -2)), true), value))
    }
    return VtValue.create(value, ds.valueType)
  }
  const spec = (type ? _GfSpec(type, false) : undefined)
    ?? _SpecFromDataSourceClass(ds) ?? _SpecFromValue(value)
  if (!spec) {
    // A value of a type with no Vt registration (an Hd struct, a callback):
    // held as is (VtValue::Create would copy it through its constructor).
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'
    return VtValue.take(value, TfType.declare(name))
  }
  if (spec.array) return VtValue.createArray(_MakeArray(spec, value))
  return VtValue.create(_MakeGf(spec, value), spec.type)
}

/** The value upstream's `ds->GetTypedValue(shutterOffset)` returns. VtArray
 *  values are plain arrays (VtIntArray is number[] in this port); `type`, when
 *  given, names the Gf type a plain tuple is converted to. */
export function _GetTypedValue<T>(ds: HdDataSourceBase, shutterOffset: number,
  type?: TfType): T {
  let value: unknown = ds instanceof HdSampledDataSource ? ds.GetValue(shutterOffset) : undefined
  if (value instanceof VtValue) {
    value = value.IsEmpty() ? undefined : value.UncheckedGet<unknown>()
  }
  if (type) {
    value = _MakeGf(_GfSpec(type, false), value)
  } else if (value instanceof VtArray) {
    value = (value as VtArray<unknown>).toArray()
  }
  return value as T
}
