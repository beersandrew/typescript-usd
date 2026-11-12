// Ported from OpenUSD 26.11.1: pxr/usd/sdf/parserHelpers.cpp,
//  pxr/usd/sdf/parserHelpers.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {Duration as GfDuration} from 'typescript-usd/gf'
// Typed values from declared Sdf value types — the value factory the text
// parser and authoring share.
//
// Upstream mirror: pxr/usd/sdf/parserHelpers.cpp (MakeScalarValueImpl /
// MakeShapedValueImpl) + valueTypeName.cpp. The text parser first lexes each
// literal into an untyped list of "vars", then the declared Sdf value type
// drives how many vars are consumed and how they are reshaped:
//   - a scalar consumes 1 var,
//   - a GfVecN consumes N (flat),
//   - a GfMatrixNd consumes N*N row-major,
//   - a GfQuat consumes 4 in (re, i, j, k) = real-first order,
//   - an array applies the per-element rule repeatedly.
// The tuple parens in USDA — `(1, 2, 3)`, `((..),(..))` — are cosmetic grouping
// upstream flattens away (parserHelpers reads a flat var stream), so coercion
// flattens nested tuples and reshapes from the declared dimensions.
//
// VALUES (shared with the USDC crate reader in sdf/src/crateFile.ts):
//   bool                                     -> boolean
//   uchar/int/uint, half/float/double, timecode -> number (rounded to the type)
//   int64/uint64                             -> bigint
//   token/string/asset                       -> string
//   floatN, point/normal/vector/color/texCoord -> GfVecN{d,f,h,i}
//   matrixNd, frame4d                        -> GfMatrixNd
//   quatf/quatd/quath                        -> GfQuat{f,d,h}
//   <type>[]                                 -> VtArray of the element type
// Authoring accepts plain JS shapes ([x, y, z], rows of numbers, real-first
// quaternion lists, arrays, typed arrays) and converts them the same way, as
// OpenUSD's Python bindings convert sequences to the attribute's value type.

import {
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2h as GfVec2h, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4h as GfVec4h, Vec4i as GfVec4i,
  Matrix2d as GfMatrix2d, Matrix3d as GfMatrix3d, Matrix4d as GfMatrix4d,
  Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath, GfHalf,
  _floatToHalfBits, _halfBitsToFloat,
} from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, ArrayEdit as VtArrayEdit, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { SdfAssetPath } from './assetPath.ts'
import { findValueTypeName, ValueTypeNames, type SdfValueTypeName } from './valueTypeName.ts'

// OpenUSD 26.11.1 parserHelpers.cpp:511-620 and schema.cpp:544-596:
// legacy text spellings share the standard value factories, not new types.
export function sdfCanonicalTextTypeName(name:string):string {
 const array=name.endsWith('[]'),scalar=array?name.slice(0,-2):name
 const legacy:Record<string,string>={Point:'point3d',PointFloat:'point3f',Normal:'normal3d',NormalFloat:'normal3f',Vector:'vector3d',VectorFloat:'vector3f',Color:'color3d',ColorFloat:'color3f',Frame:'frame4d',Transform:'matrix4d',PointIndex:'int',EdgeIndex:'int',FaceIndex:'int'}
 const vec=/^Vec([234])([ifdh])$/.exec(scalar)
 const target=legacy[scalar]??(vec?({i:'int',f:'float',d:'double',h:'half'}[vec[2]!]!+vec[1]):/^Matrix[234]d$/.test(scalar)||/^Quat[dfh]$/.test(scalar)?scalar.toLowerCase():scalar)
 return target+(array?'[]':'')
}

// --- raw integer literal carrier ---
//
// The lexer emits integer literals as a RawInt so the exact decimal text
// survives to coercion. JS doubles only hold integers exactly up to 2^53, so a
// big int64/uint64 (e.g. 9223372036854775807) parsed as a double is already
// rounded. Carrying the raw digit string lets the int64 coercion do
// BigInt(raw) for an exact value; non-int64 targets fall back to the (lossy but
// adequate) double the lexer already computed. valueOf() makes a stray RawInt
// behave like its numeric value if it ever escapes coercion.
export class RawInt {
  constructor(
    readonly raw: string,
    readonly value: number,
  ) {}
  valueOf(): number {
    return this.value
  }
}

export function isRawInt(v: unknown): v is RawInt {
  return v instanceof RawInt
}

// Unwrap any RawInt (recursively, through arrays) back to a plain number. Used
// at the parse sites that bypass typed coercion (metadata fields) so the wrapper
// never leaks into the scene record.
export function unwrapRawInt(v: unknown): unknown {
  if (v instanceof RawInt) return v.value
  if (Array.isArray(v)) return v.map(unwrapRawInt)
  return v
}

// --- element types ---

// The TfType of each Sdf value type's C++ type (SdfValueTypeName::GetType).
const SDF_TF_TYPES: Record<string, TfType> = {
  ...(VtValueTypes as Record<string, TfType>),
  timecode: TfType.define('SdfTimeCode'),
  asset: TfType.define('SdfAssetPath'),
  pathExpression: TfType.define('SdfPathExpression'),
  opaque: TfType.define('SdfOpaqueValue'),
}

/** The element TfType of an array value type name, or of a scalar one. */
export function sdfValueTfType(type: SdfValueTypeName): TfType {
  const scalar = type.scalarType ?? type
  return SDF_TF_TYPES[scalar.type] ?? TfType.findByName(scalar.type)
}

// The role-free value type name of each element TfType ("float3" for
// GfVec3f) — the name a VtValue's held type serializes as.
const TYPE_NAME_OF_TF_TYPE = new Map<TfType, SdfValueTypeName>()
for (const type of Object.values(ValueTypeNames)) {
  if (type.isArray || type.role !== '') continue
  const tfType = sdfValueTfType(type)
  if (!TYPE_NAME_OF_TF_TYPE.has(tfType)) TYPE_NAME_OF_TF_TYPE.set(tfType, type)
}

/**
 * The value type name a Gf value or VtArray holds ("float3", "matrix4d[]"),
 * or undefined for other values, whose JS type does not identify one.
 */
export function sdfValueTypeNameOfValue(value: unknown): string | undefined {
  if (value instanceof VtArray) {
    const scalar = TYPE_NAME_OF_TF_TYPE.get(value.getElementType())
    return scalar?.arrayType?.name
  }
  if (value === null || typeof value !== 'object') return undefined
  const ctorName = (value.constructor as { name?: string }).name
  if (!ctorName || !(ctorName in GF_CTORS)) return undefined
  return TYPE_NAME_OF_TF_TYPE.get(TfType.findByName(ctorName))?.name
}

type GfCtor = new (...args: number[]) => unknown
const GF_CTORS: Record<string, GfCtor> = {
  GfDuration,
  GfVec2d, GfVec2f, GfVec2h, GfVec2i, GfVec3d, GfVec3f, GfVec3h, GfVec3i,
  GfVec4d, GfVec4f, GfVec4h, GfVec4i, GfMatrix2d, GfMatrix3d, GfMatrix4d,
  GfQuatd, GfQuatf, GfQuath,
} as unknown as Record<string, GfCtor>

// --- per-component coercion ---

function toNumber(v: unknown): unknown {
  if (v instanceof RawInt) return v.value
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof GfHalf) return v.GetValue()
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) || v === 'inf' || v === '-inf' || v === 'nan' ? n : v
  }
  return v
}

// _GetImpl<T> for integral T (parserHelpers.h:50-89): GfNumericCast fails
// for a literal outside T's range, which fails the read.
const INTEGRAL_RANGE: Record<string, readonly [bigint, bigint]> = {
  uchar: [0n, 255n],
  int: [-(2n ** 31n), 2n ** 31n - 1n],
  uint: [0n, 2n ** 32n - 1n],
  int64: [-(2n ** 63n), 2n ** 63n - 1n],
  uint64: [0n, 2n ** 64n - 1n],
}
function integerOf(v: RawInt): bigint {
  try { return BigInt(v.raw) } catch { return BigInt(Math.trunc(v.value)) }
}
function checkIntegralRange(value: bigint, type: string): bigint {
  const range = INTEGRAL_RANGE[type]
  if (range && (value < range[0] || value > range[1])) {
    throw new Error(`Value ${value} is out of range for type '${type}'`)
  }
  return value
}

function coerceScalar(v: unknown, type: string): unknown {
  if (v === null || v === undefined) return v
  switch (type) {
    case 'bool':
      if (v instanceof RawInt) return v.value !== 0
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      // parserHelpers.h:158-183,350-355 uses Sdf_BoolFromString, which
      // accepts only these case-insensitive spellings (parserHelpers.cpp:651-677).
      if(typeof v==='string'&&/^(yes|true|1)$/i.test(v))return true
      if(typeof v==='string'&&/^(no|false|0)$/i.test(v))return false
      return v
    case 'uchar':
    case 'int':
    case 'uint': {
      const n = toNumber(v)
      if (typeof n !== 'number') return n
      if (Number.isFinite(n)) checkIntegralRange(v instanceof RawInt ? integerOf(v) : BigInt(Math.trunc(n)), type)
      return Math.trunc(n)
    }
    case 'int64':
    case 'uint64':
      // Exact: BigInt the raw decimal text so values beyond 2^53 survive.
      // An authored value outside the range fails the cast to the value
      // type, as a parsed literal does (parserHelpers.h:50-89).
      if (v instanceof RawInt) return checkIntegralRange(integerOf(v), type)
      if (typeof v === 'bigint') return checkIntegralRange(v, type)
      if (typeof v === 'number') return checkIntegralRange(BigInt(Math.trunc(v)), type)
      if (typeof v === 'string') {
        try {
          return BigInt(v)
        } catch {
          return v
        }
      }
      return v
    case 'half': {
      const n = toNumber(v)
      return typeof n === 'number' ? _halfBitsToFloat(_floatToHalfBits(n)) : n
    }
    case 'float': {
      const n = toNumber(v)
      return typeof n === 'number' ? Math.fround(n) : n
    }
    case 'double':
    case 'timecode':
      return toNumber(v)
    case 'GfDuration':
      return new GfDuration(toNumber(v) as number)
    // string / token / asset all surface as JS strings (matches the crate reader)
    default:
      return v
  }
}

// Flatten nested tuple/array grouping into a flat component list. USDA groups
// vec/matrix components with parens which the parser turns into nested arrays;
// upstream's parser reads them as one flat var stream, so we flatten before
// reshaping. (Bare scalars and strings are wrapped into a 1-element list.)
function flattenComponents(v: unknown): unknown[] {
  if (!Array.isArray(v)) return [v]
  const out: unknown[] = []
  for (const el of v) {
    if (Array.isArray(el)) out.push(...flattenComponents(el))
    else out.push(el)
  }
  return out
}

const isGfVec = (v: unknown): v is { readonly data: readonly number[] } =>
  typeof v === 'object' && v !== null && 'dimension' in v && 'data' in v
const isGfMatrix = (v: unknown): v is { GetArray(): readonly number[] } =>
  typeof v === 'object' && v !== null && typeof (v as { GetArray?: unknown }).GetArray === 'function'
const isGfQuat = (v: unknown): v is { GetReal(): number, GetImaginary(): { readonly data: readonly number[] } } =>
  typeof v === 'object' && v !== null && typeof (v as { GetReal?: unknown }).GetReal === 'function'

// Coerce one element to a (non-array) value type.
function coerceElement(v: unknown, type: SdfValueTypeName): unknown {
  if (v === null || v === undefined) return v
  if (type.type==='GfDuration') return coerceScalar(v,type.type)
  const Ctor = GF_CTORS[type.type]
  if (!Ctor) return coerceScalar(v, type.type)
  if (v instanceof Ctor) return v
  let flat: unknown[]
  if (isGfQuat(v)) flat = [v.GetReal(), ...v.GetImaginary().data]
  else if (isGfMatrix(v)) flat = [...v.GetArray()]
  else if (isGfVec(v)) flat = [...v.data]
  else if (Array.isArray(v)) flat = flattenComponents(v).map(toNumber)
  else return v
  const count = type.dimensions.reduce((a, b) => a * b, 1)
  // A malformed literal (wrong component count) is kept as written rather
  // than fabricating components.
  if (flat.length !== count || flat.some(c => typeof c !== 'number')) return v
  return new Ctor(...(flat as number[]))
}

// Whether `v` can be written into numeric element storage without conversion:
// a number for a scalar type, or a flat list of `width` numbers for a vector
// or quaternion.
function isPlainComponents(v: unknown, width: number): boolean {
  if (width === 1) return typeof v === 'number'
  if (!Array.isArray(v) || v.length !== width) return false
  for (let i = 0; i < width; i++) if (typeof v[i] !== 'number' && !(v[i] instanceof RawInt)) return false
  return true
}

const FAST_SCALARS = new Set(['uchar', 'int', 'uint', 'half', 'float', 'double'])

// The element storage of numeric value types, by scalar type or by a Gf
// type's component suffix (GfVec3f -> 'f').
type NumericBuffer = Float32Array | Float64Array | Int32Array | Uint32Array | Uint8Array
const STORAGE: Record<string, new (n: number) => NumericBuffer> = {
  f: Float32Array, d: Float64Array, i: Int32Array,
  float: Float32Array, double: Float64Array, int: Int32Array, uint: Uint32Array, uchar: Uint8Array,
}

function coerceArray(value: unknown, type: SdfValueTypeName): unknown {
  const scalar = type.scalarType!
  const elementType = sdfValueTfType(type)
  if (value instanceof VtArray) {
    if (value.getElementType() === elementType) return value.Clone()
    return new VtArray(value.toArray().map(el => coerceElement(el, scalar)), elementType)
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const buffer = value as unknown as ArrayLike<number> & { slice(): never }
    try {
      return VtArray.fromBuffer(elementType, buffer.slice())
    } catch {
      // A buffer of another numeric type: convert its components below.
    }
    const width = scalar.dimensions.reduce((a, b) => a * b, 1)
    const elements: unknown[] = []
    for (let i = 0; i + width <= buffer.length; i += width) {
      elements.push(width === 1 ? buffer[i] : Array.from({ length: width }, (_, k) => buffer[i + k]))
    }
    value = elements
  }
  if (value instanceof VtArrayEdit) {
    // A VtArrayEdit of the array's element type: its literals are elements.
    // Asset literals are SdfAssetPath values (VtArrayEdit<SdfAssetPath>).
    return value._transformLiterals(el => scalar.type === 'asset' && typeof el === 'string'
      ? new SdfAssetPath(el) : coerceElement(el, scalar))
  }
  if (!Array.isArray(value)) {
    // A block or another non-list value is kept as is; a
    // single bare value of a scalar-typed array (rare) is wrapped.
    if (value !== null && typeof value === 'object' && !(value instanceof RawInt)) return value
    return new VtArray([coerceElement(value, scalar)], elementType)
  }
  const width = scalar.type.startsWith('GfMatrix') ? 0
    : scalar.type.startsWith('GfQuat') ? 4 : scalar.dimensions[0] ?? (FAST_SCALARS.has(scalar.type) ? 1 : 0)
  if (width > 0 && !scalar.type.endsWith('h') && scalar.type !== 'half') {
    // Write plain components straight into a fresh element buffer; anything
    // else goes through element coercion.
    const buffer = new (STORAGE[scalar.type.slice(-1)] ?? STORAGE[scalar.type]!)(value.length * width)
    let plain = true
    for (let i = 0, o = 0; i < value.length && plain; i++, o += width) {
      const el = value[i]
      if (width === 1) {
        if (typeof el === 'number') buffer[o] = el
        else if (el instanceof RawInt) buffer[o] = el.value
        else plain = false
      } else if (isPlainComponents(el, width)) {
        const c = el as number[]
        for (let k = 0; k < width; k++) buffer[o + k] = +c[k]!
      } else {
        plain = false
      }
    }
    if (plain) {
      // GfQuat storage is imaginary-first; literals are real-first.
      if (width === 4 && scalar.type.startsWith('GfQuat')) {
        for (let o = 0; o < buffer.length; o += 4) {
          const real = buffer[o]!
          buffer[o] = buffer[o + 1]!; buffer[o + 1] = buffer[o + 2]!; buffer[o + 2] = buffer[o + 3]!
          buffer[o + 3] = real
        }
      }
      return VtArray._adopt(elementType, buffer as never)
    }
  }
  if (width > 0) {
    const array = VtArray.ofSize<unknown>(value.length, elementType)
    for (let i = 0; i < value.length; i++) {
      const el = value[i]
      array.set(i, isPlainComponents(el, width) ? el : coerceElement(el, scalar))
    }
    return array
  }
  return new VtArray(value.map(el => coerceElement(el, scalar)), elementType)
}

/**
 * Coerce a raw parsed or authored value to its declared value type.
 *
 * `typeName` is the declared Sdf type, possibly with a trailing `[]` (array) and
 * possibly prefixed with `uniform `/`varying ` (variability — ignored here).
 * Values of types this module does not know (dictionary, legacy types,
 * relationships) are returned as-is.
 */
export function coerceValueToType(value: unknown, typeName: string | undefined): unknown {
  if (value === null || value === undefined || !typeName) return value

  // Strip variability prefix.
  let t = typeName
  if (t.startsWith('uniform ')) t = t.slice(8)
  else if (t.startsWith('varying ')) t = t.slice(8)

  const type = findValueTypeName(sdfCanonicalTextTypeName(t))
  // Uncoerced types pass through, but any RawInt carrier must collapse to its
  // plain number so it never leaks.
  if (!type || type.type === 'opaque') return unwrapRawInt(value)
  return type.isArray ? coerceArray(value, type) : coerceElement(value, type)
}
