// Ported from OpenUSD 26.11.1: pxr/imaging/hd/types.cpp,
//  pxr/imaging/hd/types.h
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/types.h — HdType / HdTupleType + size helpers.
//
// HdType is the runtime element type of a buffer channel; HdTupleType pairs it
// with a count (for fixed-size array primvars). The buffer-aggregation layer
// (bufferSpec / bufferArray / the hdSt memory managers) keys layout decisions
// off these — component size and count drive stride/offset math.
//
// HdType carries upstream's full list (types.h:245-307), including bool,
// 8/16-bit integers, double, half and the packed 2_10_10_10_REV encoding.

import { HdCompareFunction } from './enums.ts'
import { _floatToHalfBits } from 'typescript-usd/gf'

/** types.h:245-307. The full upstream list; values are in upstream order. */
export enum HdType {
  HdTypeInvalid = -1,

  HdTypeBool = 0,
  HdTypeUInt8,
  HdTypeUInt16,
  HdTypeInt8,
  HdTypeInt16,

  HdTypeInt32,
  HdTypeInt32Vec2,
  HdTypeInt32Vec3,
  HdTypeInt32Vec4,

  HdTypeUInt32,
  HdTypeUInt32Vec2,
  HdTypeUInt32Vec3,
  HdTypeUInt32Vec4,

  HdTypeFloat,
  HdTypeFloatVec2,
  HdTypeFloatVec3,
  HdTypeFloatVec4,
  HdTypeFloatMat3,
  HdTypeFloatMat4,

  HdTypeDouble,
  HdTypeDoubleVec2,
  HdTypeDoubleVec3,
  HdTypeDoubleVec4,
  HdTypeDoubleMat3,
  HdTypeDoubleMat4,

  HdTypeHalfFloat,
  HdTypeHalfFloatVec2,
  HdTypeHalfFloatVec3,
  HdTypeHalfFloatVec4,

  HdTypeInt32_2_10_10_10_REV,

  HdTypeCount,
}

// pxr/imaging/hd/types.h:408-446. The numeric order is part of the public
// contract: render-buffer descriptors and AOV bindings exchange these values.
export enum HdFormat {
  HdFormatInvalid = -1,
  HdFormatUNorm8,
  HdFormatUNorm8Vec2,
  HdFormatUNorm8Vec3,
  HdFormatUNorm8Vec4,
  HdFormatSNorm8,
  HdFormatSNorm8Vec2,
  HdFormatSNorm8Vec3,
  HdFormatSNorm8Vec4,
  HdFormatFloat16,
  HdFormatFloat16Vec2,
  HdFormatFloat16Vec3,
  HdFormatFloat16Vec4,
  HdFormatFloat32,
  HdFormatFloat32Vec2,
  HdFormatFloat32Vec3,
  HdFormatFloat32Vec4,
  HdFormatInt16,
  HdFormatInt16Vec2,
  HdFormatInt16Vec3,
  HdFormatInt16Vec4,
  HdFormatUInt16,
  HdFormatUInt16Vec2,
  HdFormatUInt16Vec3,
  HdFormatUInt16Vec4,
  HdFormatInt32,
  HdFormatInt32Vec2,
  HdFormatInt32Vec3,
  HdFormatInt32Vec4,
  HdFormatFloat32UInt8,
  HdFormatCount,
}

export function HdGetComponentFormat(format: HdFormat): HdFormat {
  if (format < HdFormat.HdFormatUNorm8 || format >= HdFormat.HdFormatCount) {
    return HdFormat.HdFormatInvalid
  }
  if (format === HdFormat.HdFormatFloat32UInt8) return format
  const groupStart = format <= HdFormat.HdFormatSNorm8Vec4
    ? Math.floor(format / 4) * 4
    : format <= HdFormat.HdFormatUInt16Vec4
      ? HdFormat.HdFormatFloat16 + Math.floor((format - HdFormat.HdFormatFloat16) / 4) * 4
      : HdFormat.HdFormatInt32 + Math.floor((format - HdFormat.HdFormatInt32) / 4) * 4
  return groupStart as HdFormat
}

export function HdGetFormatComponentCount(format: HdFormat): number {
  if (format === HdFormat.HdFormatFloat32UInt8) return 2
  const component = HdGetComponentFormat(format)
  return component === HdFormat.HdFormatInvalid ? 0 : format - component + 1
}

export function HdDataSizeOfFormat(format: HdFormat): number {
  const component = HdGetComponentFormat(format)
  if (component === HdFormat.HdFormatInvalid) return 0
  if (format === HdFormat.HdFormatFloat32UInt8) return 8
  const bytes = component === HdFormat.HdFormatUNorm8 ||
    component === HdFormat.HdFormatSNorm8 ? 1 :
    component === HdFormat.HdFormatFloat16 ||
    component === HdFormat.HdFormatInt16 ||
    component === HdFormat.HdFormatUInt16 ? 2 : 4
  return bytes * HdGetFormatComponentCount(format)
}

// GL Spec 2.3.5.2 (signed case, eq 2.4): quantize a float in [-1, 1] to a signed
// b-bit fixed-point integer. Mirrors HdConvertFloatToFixed().
export function HdConvertFloatToFixed(v: number, b: number): number {
  return Math.round(Math.min(Math.max(v, -1), 1) * ((1 << (b - 1)) - 1))
}

// GL Spec 2.3.5.1 (signed case, eq 2.2): dequantize a signed b-bit fixed-point
// integer back to a float in [-1, 1]. Mirrors HdConvertFixedToFloat().
export function HdConvertFixedToFloat(v: number, b: number): number {
  return Math.max(-1, v / ((1 << (b - 1)) - 1))
}

// HdVec4f_2_10_10_10_REV is a compact representation of a 4-vector packed into a
// single 32-bit int: 10 signed-normalized bits each for x, y, z and 2 bits for
// w (the GL_INT_2_10_10_10_REV layout — x in the low bits). Mirrors the upstream
// struct of the same name; we model the C++ signed bitfields explicitly since JS
// has no bitfields. Constructed from a [x, y, z] tuple (w packs to 0), GetAsVec()
// unpacks back to a [x, y, z] tuple.
export class HdVec4f_2_10_10_10_REV {
  // Signed component values as stored in the 10/10/10/2-bit fields.
  x: number
  y: number
  z: number
  w: number

  constructor(value: [number, number, number]) {
    this.x = HdConvertFloatToFixed(value[0], 10)
    this.y = HdConvertFloatToFixed(value[1], 10)
    this.z = HdConvertFloatToFixed(value[2], 10)
    this.w = 0
  }

  // Reconstruct from a packed 32-bit int (GL_INT_2_10_10_10_REV layout),
  // sign-extending each bitfield. Mirrors the int-taking constructor.
  static fromInt(value: number): HdVec4f_2_10_10_10_REV {
    const signExtend = (bits: number, width: number): number => {
      const shift = 32 - width
      return (bits << shift) >> shift
    }
    const out = Object.create(HdVec4f_2_10_10_10_REV.prototype) as HdVec4f_2_10_10_10_REV
    out.x = signExtend(value & 0x3ff, 10)
    out.y = signExtend((value >> 10) & 0x3ff, 10)
    out.z = signExtend((value >> 20) & 0x3ff, 10)
    out.w = signExtend((value >> 30) & 0x3, 2)
    return out
  }

  // Unpack to a [x, y, z] tuple (w is dropped). Mirrors GetAsVec<Vec3Type>().
  getAsVec(): [number, number, number] {
    return [
      HdConvertFixedToFloat(this.x, 10),
      HdConvertFixedToFloat(this.y, 10),
      HdConvertFixedToFloat(this.z, 10),
    ]
  }

  // The packed 32-bit int (low 10 bits = x, then y, z, and 2 bits of w).
  // Mirrors GetAsInt().
  getAsInt(): number {
    return (
      ((this.x & 0x3ff) |
        ((this.y & 0x3ff) << 10) |
        ((this.z & 0x3ff) << 20) |
        ((this.w & 0x3) << 30)) |
      0
    )
  }
}

// HdTupleType represents one or more values of the same HdType (count > 1 is a
// fixed-size array primvar). Mirrors the upstream struct; equality + ordering
// back the bufferSpec hash/sort.
export interface HdTupleType {
  type: HdType
  count: number
}

export function HdTupleTypeEquals(a: HdTupleType, b: HdTupleType): boolean {
  return a.type === b.type && a.count === b.count
}

// Strict-weak ordering, matching HdTupleType::operator< (type, then count).
export function HdTupleTypeLess(a: HdTupleType, b: HdTupleType): boolean {
  return a.type < b.type || (a.type === b.type && a.count < b.count)
}

/** types.cpp:268-296 (HdGetComponentType) */
export function HdGetComponentType(t: HdType): HdType {
  switch (t) {
    case HdType.HdTypeUInt32Vec2:
    case HdType.HdTypeUInt32Vec3:
    case HdType.HdTypeUInt32Vec4:
      return HdType.HdTypeUInt32
    case HdType.HdTypeInt32Vec2:
    case HdType.HdTypeInt32Vec3:
    case HdType.HdTypeInt32Vec4:
      return HdType.HdTypeInt32
    case HdType.HdTypeFloatVec2:
    case HdType.HdTypeFloatVec3:
    case HdType.HdTypeFloatVec4:
    case HdType.HdTypeFloatMat3:
    case HdType.HdTypeFloatMat4:
      return HdType.HdTypeFloat
    case HdType.HdTypeDoubleVec2:
    case HdType.HdTypeDoubleVec3:
    case HdType.HdTypeDoubleVec4:
    case HdType.HdTypeDoubleMat3:
    case HdType.HdTypeDoubleMat4:
      return HdType.HdTypeDouble
    case HdType.HdTypeHalfFloatVec2:
    case HdType.HdTypeHalfFloatVec3:
    case HdType.HdTypeHalfFloatVec4:
      return HdType.HdTypeHalfFloat
    default:
      return t
  }
}

/** types.cpp:298-325 (HdGetComponentCount) */
export function HdGetComponentCount(t: HdType): number {
  switch (t) {
    case HdType.HdTypeInt32Vec2:
    case HdType.HdTypeUInt32Vec2:
    case HdType.HdTypeFloatVec2:
    case HdType.HdTypeDoubleVec2:
    case HdType.HdTypeHalfFloatVec2:
      return 2
    case HdType.HdTypeInt32Vec3:
    case HdType.HdTypeUInt32Vec3:
    case HdType.HdTypeFloatVec3:
    case HdType.HdTypeDoubleVec3:
    case HdType.HdTypeHalfFloatVec3:
      return 3
    case HdType.HdTypeInt32Vec4:
    case HdType.HdTypeUInt32Vec4:
    case HdType.HdTypeFloatVec4:
    case HdType.HdTypeDoubleVec4:
    case HdType.HdTypeHalfFloatVec4:
      return 4
    case HdType.HdTypeFloatMat3:
    case HdType.HdTypeDoubleMat3:
      return 3 * 3
    case HdType.HdTypeFloatMat4:
    case HdType.HdTypeDoubleMat4:
      return 4 * 4
    default:
      return 1
  }
}

/** types.cpp:327-397 (HdDataSizeOfType). Upstream reports a coding error for
 *  HdTypeInvalid and returns 0; this returns 0 without the diagnostic, as the
 *  callers that existed before the full port relied on. */
export function HdDataSizeOfType(t: HdType): number {
  switch (t) {
    // XXX: Currently, Hd represents bools as int32 sized values
    // (types.cpp:333-337).
    case HdType.HdTypeBool: return 4
    case HdType.HdTypeInt8: return 1
    case HdType.HdTypeUInt8: return 1
    case HdType.HdTypeInt16: return 2
    case HdType.HdTypeUInt16: return 2
    case HdType.HdTypeInt32: return 4
    case HdType.HdTypeInt32Vec2: return 4 * 2
    case HdType.HdTypeInt32Vec3: return 4 * 3
    case HdType.HdTypeInt32Vec4: return 4 * 4
    case HdType.HdTypeUInt32: return 4
    case HdType.HdTypeUInt32Vec2: return 4 * 2
    case HdType.HdTypeUInt32Vec3: return 4 * 3
    case HdType.HdTypeUInt32Vec4: return 4 * 4
    case HdType.HdTypeFloat: return 4
    case HdType.HdTypeFloatVec2: return 4 * 2
    case HdType.HdTypeFloatVec3: return 4 * 3
    case HdType.HdTypeFloatVec4: return 4 * 4
    case HdType.HdTypeFloatMat3: return 4 * 3 * 3
    case HdType.HdTypeFloatMat4: return 4 * 4 * 4
    case HdType.HdTypeDouble: return 8
    case HdType.HdTypeDoubleVec2: return 8 * 2
    case HdType.HdTypeDoubleVec3: return 8 * 3
    case HdType.HdTypeDoubleVec4: return 8 * 4
    case HdType.HdTypeDoubleMat3: return 8 * 3 * 3
    case HdType.HdTypeDoubleMat4: return 8 * 4 * 4
    case HdType.HdTypeHalfFloat: return 2
    case HdType.HdTypeHalfFloatVec2: return 2 * 2
    case HdType.HdTypeHalfFloatVec3: return 2 * 3
    case HdType.HdTypeHalfFloatVec4: return 2 * 4
    case HdType.HdTypeInt32_2_10_10_10_REV: return 4
    default: return 0
  }
}

// Size in bytes of a tuple (HdDataSizeOfType × count). Mirrors
// HdDataSizeOfTupleType().
export function HdDataSizeOfTupleType(tupleType: HdTupleType): number {
  return HdDataSizeOfType(tupleType.type) * tupleType.count
}

// ---- Sampler enums and parameters (types.h:37-128, types.cpp:105-146) ----


/** types.h:37-48 */
export enum HdWrap {
  HdWrapClamp,
  HdWrapRepeat,
  HdWrapBlack,
  HdWrapMirror,

  HdWrapNoOpinion,
  HdWrapLegacyNoOpinionFallbackRepeat, // deprecated

  HdWrapUseMetadata = HdWrapNoOpinion, // deprecated alias
  HdWrapLegacy = HdWrapLegacyNoOpinionFallbackRepeat, // deprecated alias
}

/** types.h:65-73 */
export enum HdMinFilter {
  HdMinFilterNearest,
  HdMinFilterLinear,
  HdMinFilterNearestMipmapNearest,
  HdMinFilterLinearMipmapNearest,
  HdMinFilterNearestMipmapLinear,
  HdMinFilterLinearMipmapLinear,
}

/** types.h:84-88 */
export enum HdMagFilter {
  HdMagFilterNearest,
  HdMagFilterLinear,
}

/** types.h:98-103 */
export enum HdBorderColor {
  HdBorderColorTransparentBlack,
  HdBorderColorOpaqueBlack,
  HdBorderColorOpaqueWhite,
}

/** types.h:110-138 */
export class HdSamplerParameters {
  wrapS: HdWrap
  wrapT: HdWrap
  wrapR: HdWrap
  minFilter: HdMinFilter
  magFilter: HdMagFilter
  borderColor: HdBorderColor
  enableCompare: boolean
  compareFunction: HdCompareFunction
  maxAnisotropy: number

  /** types.cpp:105-126; the no-argument form is types.cpp:105-108. */
  constructor(
    wrapS: HdWrap = HdWrap.HdWrapRepeat,
    wrapT: HdWrap = HdWrap.HdWrapRepeat,
    wrapR: HdWrap = HdWrap.HdWrapClamp,
    minFilter: HdMinFilter = HdMinFilter.HdMinFilterNearest,
    magFilter: HdMagFilter = HdMagFilter.HdMagFilterNearest,
    borderColor: HdBorderColor = HdBorderColor.HdBorderColorTransparentBlack,
    enableCompare = false,
    compareFunction: HdCompareFunction = HdCompareFunction.HdCmpFuncNever,
    maxAnisotropy = 16,
  ) {
    this.wrapS = wrapS
    this.wrapT = wrapT
    this.wrapR = wrapR
    this.minFilter = minFilter
    this.magFilter = magFilter
    this.borderColor = borderColor
    this.enableCompare = enableCompare
    this.compareFunction = compareFunction
    this.maxAnisotropy = maxAnisotropy
  }

  /** types.cpp:128-140 */
  equals(other: HdSamplerParameters): boolean {
    return this.wrapS === other.wrapS &&
      this.wrapT === other.wrapT &&
      this.wrapR === other.wrapR &&
      this.minFilter === other.minFilter &&
      this.magFilter === other.magFilter &&
      this.borderColor === other.borderColor &&
      this.enableCompare === other.enableCompare &&
      this.compareFunction === other.compareFunction &&
      this.maxAnisotropy === other.maxAnisotropy
  }
}

// ---- HdGetValueTupleType (types.cpp:212-266) ----

/** types.cpp:212-243 (_MakeTupleTypeMap), keyed by the held value's TfType
 *  name, which carries the C++ type distinctions a JS value loses. */
const _tupleTypeMap = new Map<string, HdType>([
  ['half', HdType.HdTypeHalfFloat],
  ['GfMatrix3d', HdType.HdTypeDoubleMat3],
  ['GfMatrix3f', HdType.HdTypeFloatMat3],
  ['GfMatrix4d', HdType.HdTypeDoubleMat4],
  ['GfMatrix4f', HdType.HdTypeFloatMat4],
  ['GfVec2d', HdType.HdTypeDoubleVec2],
  ['GfVec2f', HdType.HdTypeFloatVec2],
  ['GfVec2h', HdType.HdTypeHalfFloatVec2],
  ['GfVec2i', HdType.HdTypeInt32Vec2],
  ['GfVec3d', HdType.HdTypeDoubleVec3],
  ['GfVec3f', HdType.HdTypeFloatVec3],
  ['GfVec3h', HdType.HdTypeHalfFloatVec3],
  ['GfVec3i', HdType.HdTypeInt32Vec3],
  ['GfVec4d', HdType.HdTypeDoubleVec4],
  ['GfVec4f', HdType.HdTypeFloatVec4],
  ['GfVec4h', HdType.HdTypeHalfFloatVec4],
  ['GfVec4i', HdType.HdTypeInt32Vec4],
  ['GfQuath', HdType.HdTypeHalfFloatVec4],
  ['GfQuatf', HdType.HdTypeFloatVec4],
  ['GfQuatd', HdType.HdTypeDoubleVec4],
  ['HdVec4f_2_10_10_10_REV', HdType.HdTypeInt32_2_10_10_10_REV],
  ['bool', HdType.HdTypeBool],
  ['char', HdType.HdTypeInt8],
  ['double', HdType.HdTypeDouble],
  ['float', HdType.HdTypeFloat],
  ['short', HdType.HdTypeInt16],
  ['int', HdType.HdTypeInt32],
  ['ushort', HdType.HdTypeUInt16],
  ['uint', HdType.HdTypeUInt32],
  ['uchar', HdType.HdTypeUInt8],
])

/** The parts of VtValue HdGetValueTupleType reads. */
interface _HdTupleTypeValue {
  isArrayValued(): boolean
  getArraySize(): number
  getTypeName(): string
  getElementType(): { getTypeName(): string }
}

/** types.cpp:245-266 */
export function HdGetValueTupleType(value: _HdTupleTypeValue): HdTupleType {
  if (value.isArrayValued()) {
    const type = _tupleTypeMap.get(value.getElementType().getTypeName())
    if (type === undefined) {
      return { type: HdType.HdTypeInvalid, count: 0 }
    }
    return { type, count: value.getArraySize() }
  }
  const type = _tupleTypeMap.get(value.getTypeName())
  if (type === undefined) {
    return { type: HdType.HdTypeInvalid, count: 0 }
  }
  return { type, count: 1 }
}

// ---- HdGetValueData (types.cpp:167-206) ----

/** The parts of VtValue HdGetValueData reads. */
interface _HdValueDataValue extends _HdTupleTypeValue {
  UncheckedGet<T>(): T
}

/** A typed array of `n` components of the given HdType component type. */
function _HdAllocComponents(componentType: HdType, n: number): ArrayBufferView & { [i: number]: number } {
  switch (componentType) {
    case HdType.HdTypeBool:
    case HdType.HdTypeUInt8: return new Uint8Array(n)
    case HdType.HdTypeInt8: return new Int8Array(n)
    case HdType.HdTypeUInt16:
    case HdType.HdTypeHalfFloat: return new Uint16Array(n)
    case HdType.HdTypeInt16: return new Int16Array(n)
    case HdType.HdTypeUInt32: return new Uint32Array(n)
    case HdType.HdTypeFloat: return new Float32Array(n)
    case HdType.HdTypeDouble: return new Float64Array(n)
    default: return new Int32Array(n)
  }
}

/** The components of one held element in its C++ memory order: Gf vectors
 *  by component, matrices row-major, quaternions imaginary-first (quatf.h),
 *  HdVec4f_2_10_10_10_REV as its packed 32-bit word. */
function _HdComponentsOf(held: unknown, type: HdType): number[] {
  if (typeof held === 'number') return [held]
  if (typeof held === 'boolean') return [held ? 1 : 0]
  if (typeof held === 'bigint') return [Number(held)]
  if (held instanceof HdVec4f_2_10_10_10_REV) {
    return [((held.x & 0x3ff) | ((held.y & 0x3ff) << 10) |
      ((held.z & 0x3ff) << 20) | ((held.w & 0x3) << 30)) | 0]
  }
  const h = held as {
    GetArray?: () => readonly number[]
    GetReal?: () => number
    GetImaginary?: () => { data: readonly number[] }
    data?: readonly number[]
  }
  if (h.GetReal && h.GetImaginary) return [...h.GetImaginary().data, h.GetReal()]
  if (h.GetArray) return [...h.GetArray()]
  if (h.data) return [...h.data]
  void type
  return []
}

/**
 * types.cpp:167-206. Upstream returns a pointer to the value's storage; here
 * the storage is returned as a typed array of the HdType component type
 * (a view of a VtArray's contiguous numeric storage when it has one, else a
 * packed copy). Half components are their 16-bit patterns. Returns null for
 * a value whose type has no HdType (upstream's nullptr).
 */
export function HdGetValueData(value: _HdValueDataValue): ArrayBufferView | null {
  const tupleType = HdGetValueTupleType(value)
  if (tupleType.type === HdType.HdTypeInvalid) return null
  const componentType = HdGetComponentType(tupleType.type)
  const width = tupleType.type === HdType.HdTypeInt32_2_10_10_10_REV
    ? 1 : HdGetComponentCount(tupleType.type)
  const held = value.UncheckedGet<unknown>()
  const half = componentType === HdType.HdTypeHalfFloat
  if (value.isArrayValued()) {
    const array = held as { size: number, cdata(): unknown, toArray(): unknown[] }
    const n = array.size * width
    const storage = array.cdata()
    if (ArrayBuffer.isView(storage) && !(storage instanceof DataView)) {
      const typed = storage as unknown as { subarray(b: number, e: number): ArrayBufferView, BYTES_PER_ELEMENT: number }
      if (typed.BYTES_PER_ELEMENT === HdDataSizeOfType(componentType)) {
        return typed.subarray(0, n)
      }
    }
    const out = _HdAllocComponents(componentType, n)
    let o = 0
    for (const element of array.toArray()) {
      for (const c of _HdComponentsOf(element, tupleType.type)) {
        out[o++] = half ? _floatToHalfBits(c) : c
      }
    }
    return out
  }
  const components = _HdComponentsOf(held, tupleType.type)
  const out = _HdAllocComponents(componentType, width)
  for (let i = 0; i < width; ++i) {
    const c = components[i] ?? 0
    out[i] = half ? _floatToHalfBits(c) : c
  }
  return out
}
