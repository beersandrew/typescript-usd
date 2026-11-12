// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/sdf/crateFile.h, pxr/usd/sdf/crateData.cpp,
//  pxr/usd/sdf/fileVersion.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Crate (.usdc) binary file format reader; the writer is crateWriter.ts.
// Mirrors pxr/usd/sdf/crateFile.cpp (file structure, sections, value reps,
// integer/LZ4 compression framing) + crateData.cpp (spec/field assembly into
// the flat Scene map) + fileVersion.cpp (version gating).
// This implementation is private Sdf machinery, matching CMake's
// PRIVATE_CLASSES placement. Public binary I/O enters through SdfLayer and
// SdfUsdcFileFormat.

import { SdfAssetPath } from './assetPath.ts'
import { SdfAnimationBlock, SdfUnregisteredValue, SdfValueBlock } from './types.ts'
import { SdfPath } from './path.ts'
import { decodeUtf8Bytes } from './quotedString.ts'
import { lz4Decompress } from 'typescript-usd/tf'
import { decodeIntArray, decodeIntArray64, intArrayCompressedBufSize, MIN_COMPRESSED_ARRAY_SIZE } from './integerCoding.ts'
import {
  Error as TfError, TfDiagnosticMgr, TfDiagnosticType, Token as TfToken, TfEnvSetting, TfGetEnvSetting,
} from 'typescript-usd/tf'
import { Ts_BinaryDataAccess, type TsSplineCustomData } from 'typescript-usd/ts/binary'
import { _sdfRecordDictionaryValueTypes, _sdfIsDictionary } from './schema.ts'
import {
  _crateArrayEditFromSerialization, FLAG_ARRAY, FLAG_ARRAY_EDIT, FLAG_COMPRESSED, FLAG_INLINE, VALUE_TYPE_NAMES, VT,
} from './crateTypes.ts'
import {
  Duration as GfDuration,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2h as GfVec2h, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4h as GfVec4h, Vec4i as GfVec4i,
  Matrix2d as GfMatrix2d, Matrix3d as GfMatrix3d, Matrix4d as GfMatrix4d,
  Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath,
} from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import {
  Array as VtArray, ArrayEdit as VtArrayEdit, ValueTypes as VtValueTypes, type _TypedBuffer as VtTypedBuffer,
} from 'typescript-usd/vt'
import { sdfValueTfType } from './parserHelpers.ts'
import { ValueTypeNames as SdfValueTypeNames } from './valueTypeName.ts'

export interface ValueRep {
  typeId: number
  isArray: boolean
  isInlined: boolean
  isCompressed: boolean
  payload: number  // 48-bit offset or inlined value (low 32 bits used for inlined)
  value: unknown
}

export interface SpecData {
  form: number
  fields: Record<string, ValueRep>
  [key: string]: unknown  // allow [fieldName] indexing
}

export type Scene = Record<string, SpecData>

// ---- Reader helper ----
class BufReader {
  pos = 0
  view: DataView
  bytes: Uint8Array
  // The crate file version, set from the header; array sizes depend on it.
  version: readonly [number, number, number] = [0, 8, 0]

  constructor(data: Uint8Array) {
    this.bytes = data
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  seek(offset: number) { this.pos = offset }

  // The element count that precedes VtArray payloads. Mirrors
  // pxr/usd/sdf/crateFile.cpp:1786-1789 and :2098-2100: before 0.5.0 a
  // uint32 shape size precedes the count, and before 0.7.0 the count is a
  // uint32 rather than a uint64.
  arraySize(): number {
    const [major, minor] = this.version
    if (major === 0 && minor < 5) this.u32()
    return major === 0 && minor < 7 ? this.u32() : this.u64()
  }

  u8() { return this.view.getUint8(this.pos++) }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v }
  i32() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v }
  u64n() {
    const lo = this.view.getUint32(this.pos, true)
    const hi = this.view.getUint32(this.pos + 4, true)
    this.pos += 8
    return (BigInt(hi) << 32n) | BigInt(lo)
  }
  u64() { return Number(this.u64n()) }
  i64n() {
    const lo = this.view.getUint32(this.pos, true)
    const hi = this.view.getInt32(this.pos + 4, true)
    this.pos += 8
    return (BigInt(hi) << 32n) | BigInt(lo)
  }
  f32() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v }
  f64() { const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v }

  // `count` little-endian elements as a typed array: a view of the file's
  // bytes when they are aligned (the arrays crate memory-maps upstream,
  // crateFile.cpp _ReadUncompressedArray), else a copy.
  typed<B extends VtTypedBuffer>(
    Ctor: { new (buffer: ArrayBufferLike, offset: number, length: number): B, new (length: number): B, BYTES_PER_ELEMENT: number },
    count: number,
  ): B {
    const size = Ctor.BYTES_PER_ELEMENT * count
    const offset = this.bytes.byteOffset + this.pos
    let out: B
    if (!LITTLE_ENDIAN_HOST) {
      out = new Ctor(count)
      const get = Ctor.BYTES_PER_ELEMENT === 8 ? (o: number) => this.view.getFloat64(o, true)
        : Ctor.BYTES_PER_ELEMENT === 4 ? (o: number) => this.view.getFloat32(o, true)
          : (o: number) => this.view.getUint16(o, true)
      for (let i = 0; i < count; i++) (out as unknown as number[])[i] = get(this.pos + i * Ctor.BYTES_PER_ELEMENT)
    } else if (offset % Ctor.BYTES_PER_ELEMENT === 0) {
      out = new Ctor(this.bytes.buffer, offset, count)
    } else {
      out = new Ctor(this.bytes.slice(this.pos, this.pos + size).buffer, 0, count)
    }
    this.pos += size
    return out
  }

  bytes_n(n: number) {
    const s = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return s
  }

  ascii(n: number) {
    const b = this.bytes_n(n)
    let s = ''
    for (let i = 0; i < n; i++) {
      if (b[i] === 0) break
      s += String.fromCharCode(b[i]!)
    }
    return s
  }
}

const LITTLE_ENDIAN_HOST = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

// ---- Half-float conversion ----
// One scratch word for reinterpreting bits as float32 (no allocation per call).
const halfScratch = new DataView(new ArrayBuffer(4))
function bitsToFloat32(bits: number): number {
  halfScratch.setUint32(0, bits >>> 0, true)
  return halfScratch.getFloat32(0, true)
}
function float32ToBits(f: number): number {
  halfScratch.setFloat32(0, f, true)
  return halfScratch.getUint32(0, true)
}

function halfToFloat(h: number): number {
  const shifted_exp = 0x7c00 << 13
  let output = (h & 0x7fff) << 13
  const exponent = shifted_exp & output
  output += (127 - 15) << 23
  if (exponent === shifted_exp) {
    output += (128 - 16) << 23
  } else if (exponent === 0) {
    output += 1 << 23
    output = float32ToBits(bitsToFloat32(output) - bitsToFloat32(113 << 23))
  }
  output |= (h & 0x8000) << 16
  return bitsToFloat32(output)
}

// ---- LZ4 + integer array helpers ----
function lz4DecompressFromBuf(r: BufReader, uncompressedSize: number): Uint8Array {
  const compressedSize = r.u64()
  const data = r.bytes_n(compressedSize)
  return lz4Decompress(data, uncompressedSize)
}

function readIntArray(r: BufReader, count: number, intSize: 4 | 8 = 4): number[] {
  const uncompressedSize = intArrayCompressedBufSize(count, intSize)
  const decompressed = lz4DecompressFromBuf(r, uncompressedSize)
  return decodeIntArray(decompressed, count, intSize)
}

// ---- Value rep decoding ----
function readValueRep(r: BufReader): { typeId: number, isArray: boolean, isInlined: boolean, isCompressed: boolean, isArrayEdit: boolean, payloadLo: number, payloadOffset: number } {
  // 8 bytes: 6 payload bytes + 1 type byte + 1 flags byte
  const b0 = r.u8(), b1 = r.u8(), b2 = r.u8(), b3 = r.u8(), b4 = r.u8(), b5 = r.u8()
  const typeId = r.u8()
  const flags = r.u8()

  const isArray = !!(flags & FLAG_ARRAY)
  const isInlined = !!(flags & FLAG_INLINE)
  const isCompressed = !!(flags & FLAG_COMPRESSED)
  const isArrayEdit = !!(flags & FLAG_ARRAY_EDIT)

  // payload: little-endian 48-bit for offset, or low 32 bits for inlined
  // >>> 0 converts to unsigned 32-bit (avoids negative values when b3 high bit set)
  const payloadLo = ((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0)
  const payloadHi = b4 | (b5 << 8)
  const payloadOffset = payloadLo + payloadHi * 0x100000000

  return { typeId, isArray, isInlined, isCompressed, isArrayEdit, payloadLo, payloadOffset }
}

// ---- Parse integer value ----
function parseInteger(r: BufReader, rep: ReturnType<typeof readValueRep>, byteSize: 1 | 4 | 8, signed: boolean): unknown {
  if (rep.isInlined) {
    const lo = rep.payloadLo
    if (byteSize === 8) {
      // int64/uint64 inlined as int32/uint32
      return signed ? BigInt(lo | 0) : BigInt(lo >>> 0)
    }
    if (signed) {
      if (byteSize === 4) return lo | 0
      if (byteSize === 1) return ((lo & 0xff) << 24) >> 24
    } else {
      if (byteSize === 4) return lo >>> 0
      if (byteSize === 1) return lo & 0xff
    }
    return lo
  }

  if (!rep.payloadOffset) return []

  r.seek(rep.payloadOffset)

  if (!rep.isArray) {
    if (byteSize === 8) {
      return signed ? r.i64n() : r.u64n()
    }
    if (byteSize === 4) return signed ? r.i32() : r.u32()
    if (byteSize === 1) return r.u8()
    return signed ? r.i32() : r.u32()
  }

  const numElements = r.arraySize()
  if (byteSize === 8) {
    // Compressed int64/uint64 arrays (crateFile.cpp:2215-2235): arrays of at
    // least MIN_COMPRESSED_ARRAY_SIZE elements are integer-coded.
    if (rep.isCompressed && numElements >= MIN_COMPRESSED_ARRAY_SIZE) {
      const decoded = decodeIntArray64(
        lz4DecompressFromBuf(r, intArrayCompressedBufSize(numElements, 8)), numElements)
      return signed ? decoded : decoded.map(value => BigInt.asUintN(64, value))
    }
    const result: bigint[] = []
    for (let i = 0; i < numElements; i++) {
      result.push(signed ? r.i64n() : r.u64n())
    }
    return result
  }

  if (rep.isCompressed) {
    return readIntArray(r, numElements, byteSize as 4 | 8)
  }

  const result: number[] = []
  for (let i = 0; i < numElements; i++) {
    if (byteSize === 4) result.push(signed ? r.i32() : r.u32())
    else if (byteSize === 1) result.push(r.u8())
    else result.push(signed ? r.i32() : r.u32())
  }
  return result
}

// ---- Parse float value ----
function parseFloat_(r: BufReader, rep: ReturnType<typeof readValueRep>, typeId: number): unknown {
  const isDouble = typeId === VT.Double || typeId === VT.TimeCode || typeId === VT.Duration
  const isHalf = typeId === VT.Half
  const byteSize = isDouble ? 8 : isHalf ? 2 : 4

  if (rep.isInlined) {
    // Doubles inlined as floats
    if (isHalf) return halfToFloat(rep.payloadLo & 0xffff)
    return bitsToFloat32(rep.payloadLo)
  }

  if (!rep.payloadOffset) return isDouble ? 0.0 : 0.0

  r.seek(rep.payloadOffset)

  if (!rep.isArray) {
    if (isDouble) return r.f64()
    if (isHalf) return halfToFloat(r.u16())
    return r.f32()
  }

  const numElements = r.arraySize()
  if (!rep.isCompressed) {
    // Half arrays keep their binary16 bits, as VtArray<GfHalf> stores them.
    return isDouble ? r.typed(Float64Array, numElements)
      : isHalf ? r.typed(Uint16Array, numElements) : r.typed(Float32Array, numElements)
  }

  // Compressed floats: 1-byte encoding type ('i' or 't')
  const enc = String.fromCharCode(r.u8())
  if (enc === 'i') {
    // Compressed as integer array. Upstream crateFile.cpp _ReadPossiblyCompressedArray
    // does `std::copy(ints.begin(), ints.end(), odata)` — a VALUE conversion
    // int32 -> float/double (3 -> 3.0), NOT a bit reinterpretation. The 'i'
    // code is only emitted for arrays whose elements are all exactly integral.
    return readIntArray(r, numElements, 4)
  } else if (enc === 't') {
    // Lookup table
    const lutCount = r.u32()
    const luts: number[] = []
    for (let i = 0; i < lutCount; i++) {
      if (isDouble) luts.push(r.f64())
      else if (isHalf) luts.push(halfToFloat(r.u16()))
      else luts.push(r.f32())
    }
    const indices = readIntArray(r, numElements, 4)
    return indices.map(i => luts[i])
  }
  return []
}

// ---- Parse complex mathematical types (vec/quat/matrix) ----
// TypeEnum::Invalid and TypeEnum::NumTypes (crateDataTypes.h, crateFile.h:211).
const TYPE_INVALID = 0
const NUM_TYPES = Math.max(...Object.values(VT)) + 1
const VT_NAMES = new Map<number, string>(Object.entries(VT).map(([name, id]) => [id, name]))
function parseMathematical(r: BufReader, rep: ReturnType<typeof readValueRep>, typeId: number): unknown {
  const name = VT_NAMES.get(typeId) ?? ''
  let elementCount: number
  let diagonal = 0
  const fmt = name[name.length - 1]?.toLowerCase()  // 'd', 'f', 'h', 'i'

  if (name.startsWith('Quat')) {
    elementCount = 4
  } else if (name.startsWith('Vec')) {
    elementCount = parseInt(name.slice(3, 4))
  } else if (name.startsWith('Matrix')) {
    diagonal = parseInt(name.slice(6, 7))
    elementCount = diagonal * diagonal
  } else {
    throw new Error(`Unknown math type: ${name}`)
  }

  const isDouble = fmt === 'd'
  const isHalf = fmt === 'h'
  const isInt = fmt === 'i'
  const elemSize = isDouble ? 8 : isHalf ? 2 : 4

  function readElem(): number {
    if (isDouble) return r.f64()
    if (isHalf) return halfToFloat(r.u16())
    if (isInt) return r.i32()
    return r.f32()
  }

  function readElements(count: number): number[] {
    const els: number[] = []
    for (let i = 0; i < count; i++) els.push(readElem())
    return els
  }

  // GfQuat stores its imaginary part first (crate writes that memory
  // layout); a GfQuat is constructed real-first.
  const isQuat = name.startsWith('Quat')
  const Ctor = GF_CTORS[name]!
  const make = (els: number[]): unknown =>
    isQuat ? new Ctor(els[3]!, els[0]!, els[1]!, els[2]!) : new Ctor(...els)

  if (rep.isInlined) {
    // GfVec2h fits in four bytes, so it is always inlined as its two halves
    // (crateFile.cpp _IsAlwaysInlined). Other inline vectors and matrix
    // diagonals are one int8_t per component (crateValueInliners.h:89-150).
    const toRead = diagonal || elementCount
    const vals: number[] = []
    for (let i = 0; i < toRead; i++) {
      if (typeId === VT.Vec2h) {
        vals.push(halfToFloat((rep.payloadLo >>> (16 * i)) & 0xffff))
        continue
      }
      const byte = (rep.payloadLo >>> (8 * i)) & 0xff
      vals.push(byte >= 0x80 ? byte - 0x100 : byte)
    }
    if (diagonal) {
      const m = new Array<number>(elementCount).fill(0)
      for (let i = 0; i < diagonal; i++) m[i * diagonal + i] = vals[i]!
      return make(m)
    }
    return make(vals)
  }

  r.seek(rep.payloadOffset)

  if (rep.isArray) {
    const numElements = r.arraySize()
    const count = numElements * elementCount
    const buffer = isDouble ? r.typed(Float64Array, count)
      : isHalf ? r.typed(Uint16Array, count)
        : isInt ? r.typed(Int32Array, count) : r.typed(Float32Array, count)
    return VtArray.fromBuffer(TfType.findByName(`Gf${name}`), buffer, numElements)
  }

  return make(readElements(elementCount))
}

type GfCtor = new (...args: number[]) => unknown
const GF_CTORS: Record<string, GfCtor> = {
  Vec2d: GfVec2d, Vec2f: GfVec2f, Vec2h: GfVec2h, Vec2i: GfVec2i,
  Vec3d: GfVec3d, Vec3f: GfVec3f, Vec3h: GfVec3h, Vec3i: GfVec3i,
  Vec4d: GfVec4d, Vec4f: GfVec4f, Vec4h: GfVec4h, Vec4i: GfVec4i,
  Matrix2d: GfMatrix2d, Matrix3d: GfMatrix3d, Matrix4d: GfMatrix4d,
  Quatd: GfQuatd, Quatf: GfQuatf, Quath: GfQuath,
} as unknown as Record<string, GfCtor>

// The VtArray element type of each crate array value type.
const ARRAY_ELEMENT_TYPES = new Map<number, TfType>([
  [VT.Bool, VtValueTypes.bool], [VT.UChar, VtValueTypes.uchar],
  [VT.Int, VtValueTypes.int], [VT.UInt, VtValueTypes.uint],
  [VT.Int64, VtValueTypes.int64], [VT.UInt64, VtValueTypes.uint64],
  [VT.Half, VtValueTypes.half], [VT.Float, VtValueTypes.float], [VT.Double, VtValueTypes.double],
  [VT.TimeCode, sdfValueTfType(SdfValueTypeNames.TimeCodeArray)],
  [VT.String, VtValueTypes.string], [VT.Token, VtValueTypes.token],
  [VT.AssetPath, sdfValueTfType(SdfValueTypeNames.AssetArray)],
  [VT.PathExpression, sdfValueTfType(SdfValueTypeNames.PathExpressionArray)],
])

// An array value as a VtArray of its element type, viewing typed storage.
function toVtArray(typeId: number, values: unknown): unknown {
  const elementType = ARRAY_ELEMENT_TYPES.get(typeId)
  if (!elementType || values instanceof VtArray) return values
  if (ArrayBuffer.isView(values)) {
    try {
      return VtArray.fromBuffer(elementType, values as VtTypedBuffer)
    } catch {
      return new VtArray(Array.from(values as unknown as ArrayLike<unknown>), elementType)
    }
  }
  return new VtArray(values as unknown[], elementType)
}

// ---- Parse string ----
function parseString(r: BufReader, rep: ReturnType<typeof readValueRep>, strings: string[]): unknown {
  const idx = parseInteger(r, rep, 4, false)
  if (rep.isArray) return (idx as number[]).map(i => strings[i])
  return strings[idx as number]
}

function parseToken(r: BufReader, rep: ReturnType<typeof readValueRep>, tokens: TfToken[]): unknown {
  const idx = parseInteger(r, rep, 4, false)
  if (rep.isArray) return (idx as number[]).map(i => tokens[i])
  return tokens[idx as number]
}

function parseAssetPath(r: BufReader, rep: ReturnType<typeof readValueRep>, tokens: TfToken[], strings: string[]): unknown {
  if (rep.isArray) {
    const idx = parseInteger(r, rep, 4, false)
    return (idx as number[]).map(i => strings[i])
  }
  if (rep.isInlined) {
    return tokens[rep.payloadLo]
  }
  const idx = parseInteger(r, rep, 4, false)
  return strings[idx as number]
}

// ---- Parse dictionary ----
// A VtDictionary's entries decode to PLAIN values, matching the USDA parser's
// dict shape (`{ REF: "A" }`, not `{ REF: <ValueRep> }`). Crate stores each value
// as a recursively-typed pair; we resolve it to the same plain JS value the text
// parser produces so consumers reading dict-valued metadata (expressionVariables,
// customData, assetInfo, …) see ONE shape regardless of file format — the
// USDA-dict-vs-USDC-pairs mismatch is this repo's worst historical bug class, so
// it is normalized here at the flatten boundary.
function parseDictionary(r: BufReader, isInlined: boolean, payloadLo: number, tokens: TfToken[], strings: string[], data: Uint8Array): Record<string, unknown> {
  let numItems: number
  if (isInlined) {
    numItems = payloadLo
  } else {
    numItems = r.u64()
  }

  const dict: Record<string, unknown> = {}
  const valueTypes = new Map<string, string>()
  for (let i = 0; i < numItems; i++) {
    const keyIdx = r.u32()  // Index = 4 bytes
    const key = strings[keyIdx]!

    const seekFrom = r.pos
    const relOffset = Number(r.i64n())
    const targetPos = seekFrom + relOffset
    r.seek(targetPos)

    const inner = readValueRep(r)
    const savedPos = r.pos

    dict[key] = processValueRep(r, inner, tokens, strings, data)
    const valueType = VALUE_TYPE_NAMES[inner.typeId]
    if (valueType) valueTypes.set(key, `${valueType}${inner.isArray ? '[]' : ''}`)
    r.seek(savedPos)
  }
  _sdfRecordDictionaryValueTypes(dict, valueTypes)
  return dict
}

// ---- Parse list ops ----
interface ListOp {
  isExplicit: boolean
  explicitItems: unknown[]
  addedItems?: unknown[]
  prependedItems: unknown[]
  appendedItems: unknown[]
  deletedItems: unknown[]
  orderedItems?: unknown[]
}

function parseListOp(r: BufReader, rep: ReturnType<typeof readValueRep>, tokens: TfToken[], strings: string[], paths: string[]): ListOp {
  r.seek(rep.payloadOffset)
  const header = r.u8()

  const makeExplicit = !!(header & 0x01)
  const addExplicit = !!(header & 0x02)
  const addItems = !!(header & 0x04)
  const deleteItems = !!(header & 0x08)
  const reorderItems = !!(header & 0x10)
  const prependItems = !!(header & 0x20)
  const appendItems = !!(header & 0x40)

  let explicitItems: unknown[] | null = null
  let addedItems: unknown[] = []
  let prependedItems: unknown[] = []
  let appendedItems: unknown[] = []
  let deletedItems: unknown[] = []

  function readItems(): unknown[] {
    const count = r.u64()
    const items: unknown[] = []
    for (let i = 0; i < count; i++) {
      let item: unknown
      switch (rep.typeId) {
        case VT.TokenListOp:
          item = tokens[r.u32()]
          break
        case VT.StringListOp:
          item = strings[r.u32()]
          break
        case VT.PathListOp:
          item = paths[r.u32()] ?? ''
          break
        case VT.ReferenceListOp:
        case VT.PayloadListOp: {
          const assetIdx = r.u32()
          const primPathIdx = r.u32()
          const timeOffset = r.f64()
          const scale = r.f64()
          // A reference's custom data follows it as an inline map
          // (crateFile.cpp _Writer::Write(SdfReference)).
          const customData = rep.typeId === VT.ReferenceListOp
            ? parseDictionary(r, false, 0, tokens, strings, r.bytes) : {}
          item = {
            assetPath: strings[assetIdx] ?? '',
            primPath: paths[primPathIdx] ?? '',
            layerOffset: { offset: timeOffset, scale },
            ...(Object.keys(customData).length > 0 ? { customData } : {}),
          }
          break
        }
        case VT.IntListOp:
          item = r.i32()
          break
        case VT.UIntListOp:
          item = r.u32()
          break
        case VT.Int64ListOp:
          item = r.i64n()
          break
        case VT.UInt64ListOp:
          item = r.u64n()
          break
        case VT.UnregisteredValueListOp: {
          // Each item is an SdfUnregisteredValue read as a nested VtValue
          // (crateFile.cpp:1274-1288): a relative offset to its value rep.
          const seekFrom = r.pos
          r.seek(seekFrom + Number(r.i64n()))
          const inner = readValueRep(r)
          const resume = r.pos
          item = processValueRep(r, inner, tokens, strings, r.bytes, paths)
          r.seek(resume)
          break
        }
        default:
          r.u64() // consume 8 bytes for unknown
          item = null
      }
      items.push(item)
    }
    return items
  }

  if (addExplicit) explicitItems = readItems()
  else if (makeExplicit) explicitItems = []
  if (addItems) addedItems = readItems()
  if (prependItems) prependedItems = readItems()
  if (appendItems) appendedItems = readItems()
  if (deleteItems) deletedItems = readItems()
  const orderedItems = reorderItems ? readItems() : []

  const result: ListOp = {
    isExplicit: explicitItems !== null,
    explicitItems: explicitItems ?? [],
    ...(addedItems.length ? { addedItems } : {}),
    prependedItems,
    appendedItems,
    deletedItems,
    ...(orderedItems.length ? { orderedItems } : {}),
  }
  return result
}

// ---- Parse time samples ----
function parseTimeSamples(r: BufReader, rep: ReturnType<typeof readValueRep>, tokens: TfToken[], strings: string[], data: Uint8Array): [number, ValueRep][] {
  // Layout (spec 16.3.10.31):
  //   payloadOffset → i64 offset-to-timecodes (relative to this field's position)
  //   payloadOffset + offset-to-timecodes → 8-byte ValueRep for timecodes (DoubleVector)
  //   immediately after timecodes rep → i64 offset-to-values (relative to this field's position)
  //   that absolute position → u64 count + array of 8-byte ValueReps

  const baseOffset = rep.payloadOffset
  r.seek(baseOffset)
  const timecodesFieldPos = r.pos
  const timecodesRelOffset = Number(r.i64n())

  r.seek(timecodesFieldPos + timecodesRelOffset)
  const timecodesRep = readValueRep(r)

  // After timecodes rep: the values offset field
  const valuesFieldPos = r.pos
  const valuesRelOffset = Number(r.i64n())

  // Now process timecodes (seeks around, but we saved valuesFieldPos already)
  const times = processValueRep(r, timecodesRep, tokens, strings, data)
  const timecodes = (times instanceof VtArray ? times.toArray() : times) as number[]

  r.seek(valuesFieldPos + valuesRelOffset)
  const numValues = r.u64()
  const result: [number, ValueRep][] = []
  for (let i = 0; i < numValues; i++) {
    const innerRep = readValueRep(r)
    const afterRepPos = r.pos
    const value = processValueRep(r, innerRep, tokens, strings, data)
    r.seek(afterRepPos)
    result.push([timecodes[i]!, {
      typeId: innerRep.typeId,
      isArray: innerRep.isArray,
      isInlined: innerRep.isInlined,
      isCompressed: innerRep.isCompressed,
      payload: innerRep.payloadLo,
      value,
    }])
  }
  return result
}

// ---- Parse vector arrays ----
function parseVectorArray(r: BufReader, rep: ReturnType<typeof readValueRep>, tokens: TfToken[], strings: string[], paths: string[]): unknown {
  r.seek(rep.payloadOffset)
  // std::vector sizes are a uint64 in every crate version (crateFile.cpp
  // _Read(vector<T> *)); only VtArray sizes depend on the version.
  const numElements = r.u64()

  if (rep.typeId === VT.DoubleVector) {
    const result: number[] = []
    for (let i = 0; i < numElements; i++) result.push(r.f64())
    return result
  }
  if (rep.typeId === VT.LayerOffsetVector) {
    const result: { offset: number, scale: number }[] = []
    for (let i = 0; i < numElements; i++) {
      result.push({ offset: r.f64(), scale: r.f64() })
    }
    return result
  }

  // Index-based
  const indices: number[] = []
  for (let i = 0; i < numElements; i++) indices.push(r.u32())

  let lookup: string[]
  if (rep.typeId === VT.PathVector) lookup = paths
  else if (rep.typeId === VT.StringVector) lookup = strings
  else lookup = tokens  // TokenVector

  return indices.map(i => lookup[i] ?? '')
}

// ---- Parse VariantSelectionMap ----
function parseVariantSelectionMap(r: BufReader, rep: ReturnType<typeof readValueRep>, strings: string[]): Record<string, string> {
  r.seek(rep.payloadOffset)
  const numVariants = r.u64()
  const map: Record<string, string> = {}
  for (let i = 0; i < numVariants; i++) {
    const key = strings[r.u32()]!
    const value = strings[r.u32()]!
    map[key] = value
  }
  return map
}

// ---- Parse Relocates ----
// SdfRelocates: the (source, target) pairs in order.
function parseRelocates(r: BufReader, rep: ReturnType<typeof readValueRep>, paths: string[]): [string, string][] {
  if (!rep.payloadOffset) return []
  r.seek(rep.payloadOffset)
  const count = r.u64()
  const result: [string, string][] = []
  for (let i = 0; i < count; i++) {
    // The empty path is in the table but not the path tree (a relocate to <>).
    const k = paths[r.u32()] ?? ''
    const v = paths[r.u32()] ?? ''
    result.push([k, v])
  }
  return result
}

// OpenUSD pxr/usd/sdf/crateFile.cpp:1326-1332 delegates the byte blob to
// pxr/base/ts/binary.cpp:447-475 and decodes knot custom data as a map.
function parseSpline(
  r: BufReader,
  rep: ReturnType<typeof readValueRep>,
  tokens: TfToken[],
  strings: string[],
  data: Uint8Array,
): unknown {
  r.seek(rep.payloadOffset)
  const byteCount = r.u64()
  const splineData = r.bytes_n(byteCount)
  const customData: TsSplineCustomData = new Map()
  const customDataCount = r.u64()
  for (let i = 0; i < customDataCount; i++) {
    const time = r.f64()
    customData.set(time, parseDictionary(r, false, 0, tokens, strings, data))
  }
  return Ts_BinaryDataAccess.createSplineFromBinaryData(splineData, customData)
}

const toArrayValue = (rep: ReturnType<typeof readValueRep>, value: unknown): unknown =>
  rep.isArray ? toVtArray(rep.typeId, value) : value

// ---- Master value rep processor ----
function processValueRep(
  r: BufReader,
  rep: ReturnType<typeof readValueRep>,
  tokens: TfToken[],
  strings: string[],
  data: Uint8Array,
  paths: string[] = [],
): unknown {
  const { typeId, isArray, isInlined, isCompressed, payloadLo, payloadOffset } = rep

  // _ValueHandler::UnpackArrayEdit (crateFile.cpp:1836-1858): a zero
  // payload is the identity edit; otherwise the literals' and instruction
  // stream's reps follow, then the former 'isDense' flag.
  if (rep.isArrayEdit) {
    if (payloadOffset === 0) return new VtArrayEdit([])
    r.seek(payloadOffset)
    const valuesRep = readValueRep(r)
    const indexesRep = readValueRep(r)
    const values = processValueRep(r, valuesRep, tokens, strings, data, paths)
    const indexes = processValueRep(r, indexesRep, tokens, strings, data, paths)
    const items = (v: unknown): unknown[] => v instanceof VtArray ? v.toArray()
      : Array.isArray(v) ? v : ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<unknown>) : []
    // VtArrayEdit<SdfAssetPath> literals are asset paths.
    const literals = typeId === VT.AssetPath
      ? items(values).map(path => new SdfAssetPath(String(path)))
      : items(values)
    return _crateArrayEditFromSerialization(literals, items(indexes).map(i => BigInt(i as bigint | number)))
  }

  // An empty VtArray is written with a zero payload (crateFile.cpp
  // _ValueHandler::PackArray).
  if (isArray && !isInlined && payloadOffset === 0) {
    const math = VT_NAMES.get(typeId) ?? ''
    if (GF_CTORS[math]) return new VtArray([], TfType.findByName(`Gf${math}`))
    return toVtArray(typeId, [])
  }

  switch (typeId) {
    case VT.ValueBlock:
      return new SdfValueBlock()

    case VT.AnimationBlock:
      return new SdfAnimationBlock()

    case VT.Spline:
      return parseSpline(r, rep, tokens, strings, data)

    case VT.Bool:
      if (isInlined) return !!payloadLo
      if (!payloadOffset) return []
      r.seek(payloadOffset)
      if (!isArray) return !!r.u8()
      return toVtArray(typeId, r.typed(Uint8Array, r.arraySize()).slice())

    case VT.UChar:
      return toArrayValue(rep, parseInteger(r, rep, 1, false))

    case VT.Int:
      return toArrayValue(rep, parseInteger(r, rep, 4, true))

    case VT.UInt:
      return toArrayValue(rep, parseInteger(r, rep, 4, false))

    case VT.Int64:
      return toArrayValue(rep, parseInteger(r, rep, 8, true))

    case VT.UInt64:
      return toArrayValue(rep, parseInteger(r, rep, 8, false))

    case VT.Half:
    case VT.Float:
    case VT.Double:
    case VT.TimeCode:
      return toArrayValue(rep, parseFloat_(r, rep, typeId))

    // crateFile.cpp:1269-1273: duration is a typed double, including arrays.
    case VT.Duration: {
      const value=parseFloat_(r,rep,typeId)
      if(!rep.isArray)return new GfDuration(Number(value))
      const values=Array.from(value as ArrayLike<number>,v=>new GfDuration(v))
      return new VtArray(values,sdfValueTfType(SdfValueTypeNames.DurationArray))
    }

    case VT.String:
      return toArrayValue(rep, parseString(r, rep, strings))

    case VT.Token:
      return toArrayValue(rep, parseToken(r, rep, tokens))

    case VT.AssetPath:
    case VT.PathExpression:
      return toArrayValue(rep, parseAssetPath(r, rep, tokens, strings))

    case VT.Dictionary: {
      if (isInlined) {
        return parseDictionary(r, true, payloadLo, tokens, strings, data)
      }
      r.seek(payloadOffset)
      return parseDictionary(r, false, 0, tokens, strings, data)
    }

    case VT.Specifier:
    case VT.Permission:
    case VT.Variability:
      return parseInteger(r, rep, 4, true)

    case VT.Quatd: case VT.Quatf: case VT.Quath:
    case VT.Vec2d: case VT.Vec2f: case VT.Vec2h: case VT.Vec2i:
    case VT.Vec3d: case VT.Vec3f: case VT.Vec3h: case VT.Vec3i:
    case VT.Vec4d: case VT.Vec4f: case VT.Vec4h: case VT.Vec4i:
    case VT.Matrix2d: case VT.Matrix3d: case VT.Matrix4d:
      return parseMathematical(r, rep, typeId)

    case VT.TokenListOp:
    case VT.StringListOp:
    case VT.PathListOp:
    case VT.ReferenceListOp:
    case VT.IntListOp:
    case VT.Int64ListOp:
    case VT.UIntListOp:
    case VT.UInt64ListOp:
    case VT.PayloadListOp:
    case VT.UnregisteredValueListOp:
      return parseListOp(r, rep, tokens, strings, paths)

    case VT.TimeSamples:
      return parseTimeSamples(r, rep, tokens, strings, data)

    case VT.PathVector:
    case VT.TokenVector:
    case VT.DoubleVector:
    case VT.LayerOffsetVector:
    case VT.StringVector:
      return parseVectorArray(r, rep, tokens, strings, paths)

    case VT.VariantSelectionMap:
      return parseVariantSelectionMap(r, rep, strings)

    case VT.Relocates:
      return parseRelocates(r, rep, paths)

    case VT.Value: {
      if (!payloadOffset) return null
      r.seek(payloadOffset)
      const inner = readValueRep(r)
      return processValueRep(r, inner, tokens, strings, data, paths)
    }

    case VT.UnregisteredValue: {
      r.seek(payloadOffset)
      const relOff = Number(r.i64n())
      const target = payloadOffset + relOff
      r.seek(target)
      const inner = readValueRep(r)
      return unpackUnregisteredValue(inner, processValueRep(r, inner, tokens, strings, data, paths))
    }

    // Read<SdfPayload> (crateFile.cpp:1309-1325): asset path and prim path,
    // then a layer offset only in files of version 0.8.0 or later. The
    // payload field converts this single payload to a list op
    // (crateDataTypes.ts crateFieldValue, crateData.cpp:1075-1098).
    case VT.Payload: {
      if (!payloadOffset) return null
      r.seek(payloadOffset)
      const assetIdx = r.u32()
      const primPathIdx = r.u32()
      const [major, minor] = r.version
      const canReadLayerOffset = major > 0 || minor >= 8
      const timeOffset = canReadLayerOffset ? r.f64() : 0
      const scale = canReadLayerOffset ? r.f64() : 1
      return {
        assetPath: strings[assetIdx] ?? '',
        primPath: paths[primPathIdx] ?? '',
        layerOffset: { offset: timeOffset, scale },
      }
    }

    default:
      return null
  }
}

// Read<SdfUnregisteredValue> (OpenUSD 26.11.1 crateFile.cpp:1274-1288): the
// held value is a std::string (the text upstream's parser recorded), a
// VtDictionary or an SdfUnregisteredValueListOp; anything else is a coding
// error and an empty value. The value is kept as recorded, tagged as the USDA
// parser tags it (textFileFormatParser.ts parseMetadataValue and
// unregisteredListOp), so a crate-read field writes back unchanged.
function unpackUnregisteredValue(inner: ReturnType<typeof readValueRep>, value: unknown): SdfUnregisteredValue {
  if (!inner.isArray) {
    if (inner.typeId === VT.String && typeof value === 'string') return new SdfUnregisteredValue(value, 'unregistered')
    if (inner.typeId === VT.Dictionary) return new SdfUnregisteredValue(value, 'dictionary')
    if (inner.typeId === VT.UnregisteredValueListOp) return new SdfUnregisteredValue(value, 'unregisteredListOp')
  }
  TfDiagnosticMgr.GetInstance().postError(new TfError(
    `SdfUnregisteredValue in crate file contains invalid type enum value ${inner.typeId}; ` +
    'expected string, VtDictionary or SdfUnregisteredValueListOp; returning empty',
    TfDiagnosticType.CodingError))
  return new SdfUnregisteredValue('', 'unregistered')
}

// ---- Path building algorithm (spec 16.3.8.4.5) ----
// Converted directly from the reference Python build_decompressed_paths.
// Iterates siblings in a while-loop; recurses only for sibling branches when
// a node has both a child and siblings (so the sibling chain and child chain
// are processed independently).
function buildPaths(
  numPaths: number,
  pathIndices: number[],
  elementTokenIndices: number[],
  jumps: number[],
  tokens: TfToken[],
): string[] {
  const paths: string[] = new Array(numPaths)

  function walk(startIdx: number, parentPath: string): void {
    let idx = startIdx
    let parent = parentPath
    let hasChild = false
    let hasSibling = false
    let first = true

    while (first || hasChild || hasSibling) {
      first = false
      const pathIndex = pathIndices[idx]!

      if (!parent) {
        // Root pseudo-node
        parent = '/'
        paths[pathIndex] = '/'
      } else {
        const tokenIdx = elementTokenIndices[idx]!
        const isProp = tokenIdx < 0
        const token = tokens[Math.abs(tokenIdx)]
        // Variant selections ({set=sel}) and targets ([path]) append to their
        // parent directly, as SdfPath element strings do.
        const joiner = isProp ? '.' : token?.startsWith('{') || token?.startsWith('[') ? '' : '/'
        paths[pathIndex] = (parent === '/' && joiner === '/' ? '' : parent) + joiner + token
      }

      hasChild = jumps[idx]! > 0 || jumps[idx] === -1
      hasSibling = jumps[idx]! >= 0

      if (hasChild) {
        if (hasSibling) {
          // Recurse to handle the sibling chain (same parent)
          walk(idx + jumps[idx]!, parent)
        }
        // Advance parent to current node; main loop continues into child
        parent = paths[pathIndex]!
      }

      idx++
    }
  }

  if (numPaths > 0) {
    walk(0, '')
  }

  return paths
}

// ---- Main parser ----
export function parseCrate(data: Uint8Array): Scene {
  return readCrate(data, true).scene
}

// A crate field's value representation, decoded on demand.
export type CrateValueRep = ReturnType<typeof readValueRep>

// A spec's fields are the run of field indices starting at fieldSetStart in
// CrateContents.fieldSets, ended by a negative index (the FIELDSETS layout).
export interface CrateSpec {
  readonly path: string
  readonly form: number
  readonly fieldSetStart: number
}

export interface CrateField { readonly name: string, readonly rep: CrateValueRep }

export interface CrateContents {
  readonly specs: readonly CrateSpec[]
  readonly fields: readonly CrateField[]
  readonly fieldSets: readonly number[]
  // Decodes one field value (Sdf_CrateDataImpl unpacks values on demand);
  // valueTypeName is the recorded lexical type of an unregistered field.
  decode(rep: CrateValueRep): { value: unknown, valueTypeName?: string }
  // The bootstrap's file version (CrateFile::_boot.version).
  readonly version?: readonly [number, number, number]
}

// The crate's structure (tokens, strings, fields, field sets, paths, specs)
// with field values left undecoded until read, as upstream's crate data
// does. Prim children are still decoded and validated here.
export function parseCrateLazy(data: Uint8Array, assetPath = ''): CrateContents {
  return readCrate(data, false, assetPath).contents
}

// The software version and the oldest readable version (crateFile.cpp:
// 161-166, 415-420).
const USDC_MAJOR = 0
const USDC_MINOR = 16
const USDC_PATCH = 0
const OLDEST_SUPPORTED_VERSION = [0, 4, 0] as const
// crateFile.cpp:168: versions prior to this are deprecated.
const OLDEST_CURRENT_VERSION = [0, 8, 0] as const
// crateFile.cpp:201-204.
const PXR_USDC_EMIT_DEPRECATION_WARNINGS = new TfEnvSetting('PXR_USDC_EMIT_DEPRECATION_WARNINGS', true,
  'If set, emit warnings when reading binary USD files with deprecated ' +
  `versions prior to ${OLDEST_CURRENT_VERSION.join('.')}.`)

function readCrate(data: Uint8Array, eager: boolean, assetPath = ''): { scene: Scene, contents: CrateContents } {
  const r = new BufReader(data)

  // Header (spec 16.3.8.1)
  const magic = r.ascii(8)
  if (magic !== 'PXR-USDC') throw new Error(`Not a USDC file: ${magic}`)

  const major = r.u8()
  const minor = r.u8()
  const patch = r.u8()
  r.bytes_n(5)  // unused

  // CrateFile::_ReadStructuralSections rejects unsupported versions before
  // reading anything else (crateFile.cpp:3454-3461): the version this
  // software can read (_ReadBootStrap, crateFile.cpp:3544-3550;
  // SdfFileVersion::CanRead, fileVersion.h:76-78), then the oldest
  // supported version (_CheckFileVersion, crateFile.cpp:3562-3578).
  const fileVersion = `${major}.${minor}.${patch}`
  if (major !== USDC_MAJOR || minor > USDC_MINOR) {
    throw new TfError(`Sdf crate file version mismatch -- file is ${fileVersion}, ` +
      `software supports ${USDC_MAJOR}.${USDC_MINOR}.${USDC_PATCH}`, TfDiagnosticType.RuntimeError)
  }
  if ((major << 16 | minor << 8 | patch) < (OLDEST_SUPPORTED_VERSION[0] << 16 | OLDEST_SUPPORTED_VERSION[1] << 8 | OLDEST_SUPPORTED_VERSION[2])) {
    const oldest = OLDEST_SUPPORTED_VERSION.join('.')
    throw new TfError(
      `Cannot read asset @${assetPath}@ with obsolete version ${fileVersion}. The oldest ` +
      `version this software supports is ${oldest}. ` +
      'See the OpenUSD FAQ for information about handling obsolete ' +
      'assets. https://openusd.org/release/usdfaq.html', TfDiagnosticType.RuntimeError)
  }
  // Warn if the version is less than the deprecated version
  // (crateFile.cpp:3580-3592).
  if ((major << 16 | minor << 8 | patch) < (OLDEST_CURRENT_VERSION[0] << 16 | OLDEST_CURRENT_VERSION[1] << 8 | OLDEST_CURRENT_VERSION[2]) &&
      TfGetEnvSetting(PXR_USDC_EMIT_DEPRECATION_WARNINGS)) {
    TfDiagnosticMgr.GetInstance().postWarning(
      `Asset @${assetPath}@ has deprecated version ${fileVersion}. Future versions of USD ` +
      'will not be able to read it. See the OpenUSD FAQ for information ' +
      'about handling deprecated assets. ' +
      'https://openusd.org/release/usdfaq.html  Disable this warning by ' +
      'setting PXR_USDC_EMIT_DEPRECATION_WARNINGS=0 in the environment.')
  }
  r.version = [major, minor, patch]

  // Bootstrap (spec 16.3.8.3)
  const tocOffset = r.u64()
  r.u64()  // reserved

  // Table of contents (spec 16.3.8.4)
  r.seek(tocOffset)
  const numSections = r.u64()
  const toc: Record<string, { offset: number, size: number }> = {}
  for (let i = 0; i < numSections; i++) {
    const name = r.ascii(16)
    const offset = r.u64()
    const size = r.u64()
    toc[name] = { offset, size }
  }

  // --- TOKENS section (spec 16.3.8.4.1) ---
  // The in-memory token table is vector<TfToken> upstream (crateFile.cpp
  // _tokens); each raw string crosses into a TfToken here.
  let tokens: TfToken[] = [TfToken('')]
  if (toc['TOKENS']) {
    const { offset } = toc['TOKENS']
    r.seek(offset)
    const numTokens = r.u64()
    let tokenBytes: Uint8Array
    if (minor < 4) {
      tokenBytes = r.bytes_n(r.u64())
    } else {
      const uncompressedSize = r.u64()
      const compressedSize = r.u64()
      tokenBytes = lz4Decompress(r.bytes_n(compressedSize), uncompressedSize)
    }
    // Tokens are std::string bytes (crateFile.cpp _ReadTokens): bytes that
    // are not UTF-8 are kept, as surrogateescape code units, so they are
    // written back unchanged (quotedString.ts decodeUtf8Bytes).
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(tokenBytes)
    } catch {
      const parts: string[] = []
      for (let start = 0; start <= tokenBytes.length;) {
        let end = tokenBytes.indexOf(0, start)
        if (end < 0) end = tokenBytes.length
        parts.push(decodeUtf8Bytes(tokenBytes.subarray(start, end)))
        start = end + 1
      }
      text = parts.join('\0')
    }
    tokens = text.split('\0').slice(0, numTokens).map((s) => TfToken(s))
  }

  // --- STRINGS section (spec 16.3.8.4.2) ---
  let strings: string[] = []
  if (toc['STRINGS']) {
    const { offset } = toc['STRINGS']
    r.seek(offset)
    const numStrings = r.u64()
    for (let i = 0; i < numStrings; i++) {
      strings.push(tokens[r.u32()]!)
    }
  }

  // --- FIELDS section (spec 16.3.8.4.3) ---
  const fields: Array<{ tokenIdx: number, rep: ReturnType<typeof readValueRep> }> = []
  if (toc['FIELDS']) {
    const { offset } = toc['FIELDS']
    r.seek(offset)
    const numFields = r.u64()
    if (minor < 4) {
      for (let i = 0; i < numFields; i++) {
        // OpenUSD v26.08 pxr/usd/sdf/crateFile.h:507-522.
        r.u32()
        const tokenIdx = r.u32()
        fields.push({ tokenIdx, rep: readValueRep(r) })
      }
    } else {
      const indices = readIntArray(r, numFields, 4)
      const repDataSize = r.u64()
      const repDataCompressed = r.bytes_n(repDataSize)
      const repData = lz4Decompress(repDataCompressed, numFields * 8)
      const repReader = new BufReader(repData)
      for (let i = 0; i < numFields; i++) {
        const rep = readValueRep(repReader)
        fields.push({ tokenIdx: indices[i]!, rep })
      }
    }
  }

  // --- FIELDSETS section (spec 16.3.8.4.4) ---
  let fieldSets: number[] = []
  if (toc['FIELDSETS']) {
    const { offset } = toc['FIELDSETS']
    r.seek(offset)
    const numFieldSets = r.u64()
    fieldSets = minor < 4
      ? Array.from({ length: numFieldSets }, () => r.u32())
      : readIntArray(r, numFieldSets, 4)
  }

  // --- PATHS section (spec 16.3.8.4.5) ---
  let paths: string[] = []
  if (toc['PATHS']) {
    const { offset } = toc['PATHS']
    r.seek(offset)
    const numPaths = r.u64()
    if (minor < 4) {
      paths = new Array(numPaths)
      const walk = (parentPath: string): void => {
        let hasChild = false
        let hasSibling = false
        do {
          // OpenUSD v26.08 pxr/usd/sdf/crateFile.cpp:3852-3859.
          if (minor === 0) r.u32()
          const pathIndex = r.u32()
          const tokenIndex = r.u32()
          const bits = r.u8()
          r.bytes_n(3)
          const currentPath = parentPath === '' ? '/'
            : `${parentPath === '/' ? '' : parentPath}${bits & 4 ? '.' : '/'}${tokens[tokenIndex]}`
          paths[pathIndex] = currentPath
          hasChild = !!(bits & 1)
          hasSibling = !!(bits & 2)
          if (hasChild && hasSibling) {
            const siblingOffset = Number(r.i64n())
            walk(currentPath)
            r.seek(siblingOffset)
          } else if (hasChild) {
            parentPath = currentPath
          }
        } while (hasChild || hasSibling)
      }
      walk('')
    } else {
      const numEncoded = r.u64()
      const pathIndices = readIntArray(r, numEncoded, 4)
      const elementTokenIndices = readIntArray(r, numEncoded, 4)
      const jumps = readIntArray(r, numEncoded, 4)
      paths = buildPaths(numPaths, pathIndices, elementTokenIndices, jumps, tokens)
    }
    paths = paths.map(path => path.includes('{')
      ? path.replace(/\/\{/g, '{').replace(/\}\//g, '}') : path)
  }

  // --- SPECS section (spec 16.3.8.4.6) ---
  const crateFields: CrateField[] = fields.map(({ tokenIdx, rep }) => ({ name: tokens[tokenIdx]!, rep }))
  const scene: Scene = {}
  const specList: CrateSpec[] = []
  const decodeReader = new BufReader(data)
  decodeReader.version = r.version
  // Crate files share one field entry (and rep object) among every spec with
  // the same value, so an inline primitive decodes once.
  const inlinePrimitives = new Map<CrateValueRep, { value: unknown }>()
  const decode = (rep: CrateValueRep): { value: unknown, valueTypeName?: string } => {
    // CrateFile::_UnpackValue (crateFile.cpp:4361-4368): an Invalid or
    // out-of-range type is a coding error and an empty value.
    if (rep.typeId === TYPE_INVALID || rep.typeId >= NUM_TYPES) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Attempted to unpack unsupported type enum value ${rep.typeId}`,
        TfDiagnosticType.CodingError))
      return { value: undefined }
    }
    if (rep.isInlined && !rep.isArray) {
      const hit = inlinePrimitives.get(rep)
      if (hit) return hit
    }
    const value = processValueRep(decodeReader, rep, tokens, strings, data, paths)
    if (rep.isInlined && !rep.isArray && (value === null || typeof value !== 'object')) {
      const decoded = { value }
      inlinePrimitives.set(rep, decoded)
      return decoded
    }
    // An unregistered field keeps its recorded value and parser tag.
    if (!(value instanceof SdfUnregisteredValue)) return { value }
    return { value: value.value, valueTypeName: value.typeName }
  }
  if (toc['SPECS']) {
    const { offset } = toc['SPECS']
    r.seek(offset)
    const numSpecs = r.u64()
    let pathIndices: number[]
    let fieldSetIndices: number[]
    let forms: number[]
    if (minor < 4) {
      pathIndices = []
      fieldSetIndices = []
      forms = []
      for (let i = 0; i < numSpecs; i++) {
        // OpenUSD v26.08 pxr/usd/sdf/crateFile.cpp:3654-3658.
        if (minor === 0) r.u32()
        pathIndices.push(r.u32())
        fieldSetIndices.push(r.u32())
        forms.push(r.u32())
      }
    } else {
      pathIndices = readIntArray(r, numSpecs, 4)
      fieldSetIndices = readIntArray(r, numSpecs, 4)
      forms = readIntArray(r, numSpecs, 4)
    }

    for (let i = 0; i < numSpecs; i++) {
      specList.push({ path: paths[pathIndices[i]!]!, form: forms[i]!, fieldSetStart: fieldSetIndices[i]! })
    }

    // Decode field values: every field when eager, only prim children (for
    // validation) when lazy. A corrupt layer can fault while decoding an
    // unrelated value (e.g. a truncated array) before the primChildren check is
    // reached; catch per-field decode faults so the loop still completes and the
    // primChildren validation runs over every spec — then, if nothing was found
    // invalid, re-throw the original decode fault so genuinely-broken files
    // still fail to open.
    const SPEC_TYPE_PRIM = 6 // SdfSpecTypePrim (writer.ts FORM.Prim)
    let firstDecodeError: unknown = null
    const tryDecode = (rep: CrateValueRep): { value: unknown, valueTypeName?: string } => {
      try {
        return decode(rep)
      } catch (e) {
        if (firstDecodeError === null) firstDecodeError = e
        return { value: undefined }
      }
    }
    const childrenByPath = new Map<string, unknown>()
    const specPaths = new Set<string>()
    const specFieldsOf = (spec: CrateSpec): CrateField[] => {
      const out: CrateField[] = []
      for (let fi = spec.fieldSetStart; fi < fieldSets.length; fi++) {
        const fieldIdx = fieldSets[fi]!
        if (fieldIdx < 0 || fieldIdx === 0xffffffff) break
        out.push(crateFields[fieldIdx]!)
      }
      return out
    }
    for (const spec of specList) {
      specPaths.add(spec.path)
      if (eager) {
        const specFields: Record<string, ValueRep> = {}
        for (const { name, rep } of specFieldsOf(spec)) {
          const decoded = tryDecode(rep)
          specFields[name] = {
            typeId: rep.typeId,
            isArray: rep.isArray,
            isInlined: rep.isInlined,
            isCompressed: rep.isCompressed,
            payload: rep.payloadLo,
            value: decoded.value,
            ...(decoded.valueTypeName ? { valueTypeName: decoded.valueTypeName } : {}),
          }
        }
        // Make SpecData subscriptable both as .fields and [fieldName]
        scene[spec.path] = { form: spec.form, fields: specFields, ...specFields }
        if (spec.form === SPEC_TYPE_PRIM && specFields['primChildren']) childrenByPath.set(spec.path, specFields['primChildren'].value)
      } else if (spec.form === SPEC_TYPE_PRIM) {
        const field = specFieldsOf(spec).find(f => f.name === 'primChildren')
        if (field) childrenByPath.set(spec.path, tryDecode(field.rep).value)
      }
    }

    // Validate primChildren — mirrors Sdf_CrateDataImpl::_HasValidChildren /
    // _ValidateSpecChildren (sdf/crateData.cpp:954-1018), which upstream gates on
    // PXR_PREFER_SAFETY_OVER_SPEED; for a web-facing reader the safety check is
    // always on. Only PRIM specs are validated (the pseudo-root and variant
    // specs are exempt upstream). A child entry is invalid when it is not a
    // valid identifier or names a child spec that does not exist; it is a
    // duplicate when it repeats an earlier sibling. Every spec is validated
    // and each failure posts its errors (crateData.cpp:896-933); the read
    // fails if any did. The last error is thrown rather than posted, as the
    // failed read's error.
    // SdfPath::IsValidIdentifier (crateData.cpp:970): a UTF-8 XID identifier.
    const isValidIdentifier = (s: string): boolean => SdfPath.isValidIdentifier(s)
    const childErrors: string[] = []
    for (const [path, children] of childrenByPath) {
      if (Array.isArray(children)) {
        const seen = new Set<string>()
        let childError: string | undefined
        for (const child of children as unknown[]) {
          // An out-of-range token index decodes to undefined here where the crate
          // held the empty token ''; both are the same invalid empty-child case.
          const name = child === undefined || child === null ? '' : String(child)
          const childPath = path === '/' ? `/${name}`
            : `${path}${path.endsWith('}') ? '' : '/'}${name}`
          if (!isValidIdentifier(name) || !specPaths.has(childPath)) {
            childError = `Invalid child identifier '${name}' found on parent '${path}'`
            break
          }
          if (seen.has(name)) {
            childError = `Duplicate child identifier '${name}' found on parent '${path}'`
            break
          }
          seen.add(name)
        }
        if (childError === undefined) continue
        childErrors.push(childError)
      }
      // A primChildren value that is not a token vector (including one that
      // failed to decode) is invalid without a child error
      // (crateData.cpp:957-959).
      childErrors.push(`Invalid children found in primChildren field for path '${path}'`)
    }
    if (childErrors.length) {
      for (const message of childErrors.slice(0, -1)) {
        TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
      }
      throw new TfError(childErrors.at(-1)!, TfDiagnosticType.RuntimeError)
    }

    // No invalid primChildren, but a value failed to decode → the file is
    // genuinely unreadable; surface the original fault.
    if (firstDecodeError !== null) throw firstDecodeError
  }

  return { scene, contents: { specs: specList, fields: crateFields, fieldSets, decode, version: r.version } }
}

// Internal hooks exposed for unit tests only (not part of the package barrel —
// index.ts re-exports neither). Mirrors upstream's friend-test access to
// crateFile internals; lets tests exercise value-rep decode paths (e.g. the
// inline-quat reorder) without hand-assembling a full crate file.
export const _internalForTests = {
  BufReader,
  readValueRep,
  parseMathematical,
}

// Writing lives in crateWriter.ts.
export { serializeUsdc } from './crateWriter.ts'
