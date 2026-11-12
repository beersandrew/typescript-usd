// Portions ported from OpenUSD 26.11.1, including: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/sdf/schema.cpp, pxr/usd/sdf/crateValueInliners.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {Duration as GfDuration} from 'typescript-usd/gf'
// USDC (crate) writer. Mirrors the packing side of OpenUSD v26.08
// pxr/usd/sdf/crateFile.cpp: every field of every spec is packed by its value
// type (CrateFile::_PackValue with the per-type _ValueHandler::Pack and
// _Writer::Write overloads), with the same inlining (crateValueInliners.h),
// array compression, value/field/field-set deduplication, path table, section
// layout and version upgrades. Spec order follows crateData.cpp
// Sdf_CrateDataImpl::Save.
//
// JavaScript values do not carry their VtValue type, so each field's crate
// type comes from where upstream's would: the Sdf schema's field type for
// metadata (schema.cpp _RegisterStandardFields and the plugin SdfMetadata),
// the attribute's value type for default and timeSamples, and the recorded
// entry types for dictionary values.

import { GfHalf } from 'typescript-usd/gf'
import {
  Error as TfError, lz4Compress, TfDiagnosticMgr, TfDiagnosticType, Type as TfType,
} from 'typescript-usd/tf'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { Ts_BinaryDataAccess } from 'typescript-usd/ts/binary'
import { Array as VtArray, ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import { sdfValueTypeNameOfValue } from './parserHelpers.ts'
import { _sdfIsGfValue } from './schema.ts'
import { _halfBitsToFloat } from 'typescript-usd/gf'
import type { SdfSpecType } from './abstractData.ts'
import { SdfAssetPath } from './assetPath.ts'
import {
  _crateArrayEditSerialization, CRATE_SPEC_FORMS, FLAG_ARRAY, FLAG_ARRAY_EDIT, FLAG_COMPRESSED, FLAG_INLINE, VT,
} from './crateTypes.ts'
import {
  encodeIntArray64Compressed, encodeIntArrayCompressed, MIN_COMPRESSED_ARRAY_SIZE,
} from './integerCoding.ts'
import { SdfPath } from './path.ts'
import { sdfNormalizeListOp } from './listOp.ts'
import { _SdfPathExpressionValue } from './pathExpression.ts'
import { encodeUtf8Bytes } from './quotedString.ts'
import {
  _sdfGetDictionaryValueTypes, _sdfGetMetadataFieldType, _sdfGetSplineKnotCustomDataValueTypes,
  _sdfIsDictionary,
} from './schema.ts'
import { SdfAnimationBlock, SdfUnregisteredValue, SdfValueBlock } from './types.ts'
import { quoteString, type SdfLayerForWrite } from './usdaFileFormat.ts'

// The layer view the writer reads. Spec types and parser-recorded field
// types are used when the layer provides them.
export interface SdfLayerForCrateWrite extends SdfLayerForWrite {
  getSpecType?(specPath: string): SdfSpecType
  _getFieldValueTypeName?(specPath: string, fieldName: string): string | undefined
}

// A crate value type: a TypeEnum and whether the value is a VtArray of it.
interface CrateType { readonly id: number, readonly array: boolean }
const scalar = (id: number): CrateType => ({ id, array: false })
const arrayOf = (id: number): CrateType => ({ id, array: true })

// Sdf value type names (valueTypeName.cpp, roles included) to crate types.
const SCALAR_VALUE_TYPES: Readonly<Record<string, number>> = {
  bool: VT.Bool, uchar: VT.UChar, int: VT.Int, uint: VT.UInt, int64: VT.Int64,
  uint64: VT.UInt64, half: VT.Half, float: VT.Float, double: VT.Double,
  duration: VT.Duration, timecode: VT.TimeCode, string: VT.String, token: VT.Token, asset: VT.AssetPath,
  pathExpression: VT.PathExpression,
  matrix2d: VT.Matrix2d, matrix3d: VT.Matrix3d, matrix4d: VT.Matrix4d, frame4d: VT.Matrix4d,
  quatd: VT.Quatd, quatf: VT.Quatf, quath: VT.Quath,
  double2: VT.Vec2d, float2: VT.Vec2f, half2: VT.Vec2h, int2: VT.Vec2i,
  double3: VT.Vec3d, float3: VT.Vec3f, half3: VT.Vec3h, int3: VT.Vec3i,
  double4: VT.Vec4d, float4: VT.Vec4f, half4: VT.Vec4h, int4: VT.Vec4i,
  dictionary: VT.Dictionary,
}

export function crateTypeForValueTypeName(typeName: string): CrateType | undefined {
  const isArray = typeName.endsWith('[]')
  let base = isArray ? typeName.slice(0, -2) : typeName
  // Roles store their underlying type: point3f is a GfVec3f, color4d a GfVec4d.
  const role = /^(?:point|normal|vector|color|texCoord)([234])([dfh])$/.exec(base)
  if (role) base = `${{ d: 'double', f: 'float', h: 'half' }[role[2]!]}${role[1]}`
  const id = SCALAR_VALUE_TYPES[base]
  if (id === undefined || (isArray && id === VT.Dictionary)) return undefined
  return { id, array: isArray }
}

// Field types: SdfSchema's registered fields (schema.cpp:700-832) and the
// plugin SdfMetadata of the usd, usdGeom, usdShade, usdRender, usdPhysics,
// usdSkel, usdUI and usdImaging plugInfo.json files.
const FIELD_TYPES: Readonly<Record<string, CrateType>> = {
  active: scalar(VT.Bool), allowedTokens: arrayOf(VT.Token),
  arraySizeConstraint: scalar(VT.Int64), assetInfo: scalar(VT.Dictionary),
  clips: scalar(VT.Dictionary), clipSets: scalar(VT.StringListOp),
  colorConfiguration: scalar(VT.AssetPath), colorManagementSystem: scalar(VT.Token),
  colorSpace: scalar(VT.Token), comment: scalar(VT.String),
  connectionPaths: scalar(VT.PathListOp), custom: scalar(VT.Bool),
  customData: scalar(VT.Dictionary), customLayerData: scalar(VT.Dictionary),
  displayGroup: scalar(VT.String), displayGroupOrder: arrayOf(VT.String),
  displayName: scalar(VT.String),
  documentation: scalar(VT.String), defaultPrim: scalar(VT.Token),
  endFrame: scalar(VT.Double), endTimeCode: scalar(VT.Double),
  expressionVariables: scalar(VT.Dictionary), framePrecision: scalar(VT.Int),
  framesPerSecond: scalar(VT.Double), hidden: scalar(VT.Bool),
  hasOwnedSubLayers: scalar(VT.Bool), instanceable: scalar(VT.Bool),
  inheritPaths: scalar(VT.PathListOp), kind: scalar(VT.Token),
  limits: scalar(VT.Dictionary), owner: scalar(VT.String),
  primOrder: scalar(VT.TokenVector), noLoadHint: scalar(VT.Bool),
  payload: scalar(VT.PayloadListOp), permission: scalar(VT.Permission),
  prefix: scalar(VT.String), prefixSubstitutions: scalar(VT.Dictionary),
  propertyOrder: scalar(VT.TokenVector), references: scalar(VT.ReferenceListOp),
  sessionOwner: scalar(VT.String), specializes: scalar(VT.PathListOp),
  spline: scalar(VT.Spline), suffix: scalar(VT.String),
  suffixSubstitutions: scalar(VT.Dictionary), targetPaths: scalar(VT.PathListOp),
  layerRelocates: scalar(VT.Relocates), relocates: scalar(VT.Relocates),
  specifier: scalar(VT.Specifier), startFrame: scalar(VT.Double),
  startTimeCode: scalar(VT.Double), subLayers: scalar(VT.StringVector),
  subLayerOffsets: scalar(VT.LayerOffsetVector), symmetricPeer: scalar(VT.String),
  symmetryArgs: scalar(VT.Dictionary), symmetryArguments: scalar(VT.Dictionary),
  symmetryFunction: scalar(VT.Token), timeCodesPerSecond: scalar(VT.Double),
  typeName: scalar(VT.Token), variantSetNames: scalar(VT.StringListOp),
  variantSelection: scalar(VT.VariantSelectionMap), variability: scalar(VT.Variability),
  connectionChildren: scalar(VT.PathVector), expressionChildren: scalar(VT.TokenVector),
  mapperArgChildren: scalar(VT.TokenVector), mapperChildren: scalar(VT.PathVector),
  primChildren: scalar(VT.TokenVector), properties: scalar(VT.TokenVector),
  targetChildren: scalar(VT.PathVector), variantChildren: scalar(VT.TokenVector),
  variantSetChildren: scalar(VT.TokenVector),
  // Plugin metadata.
  apiSchemas: scalar(VT.TokenListOp), fallbackPrimTypes: scalar(VT.Dictionary),
  payloadAssetDependencies: arrayOf(VT.AssetPath),
  constraintTargetIdentifier: scalar(VT.Token), elementSize: scalar(VT.Int),
  inactiveIds: scalar(VT.Int64ListOp), interpolation: scalar(VT.Token),
  metersPerUnit: scalar(VT.Double), unauthoredValuesIndex: scalar(VT.Int),
  upAxis: scalar(VT.Token), bindMaterialAs: scalar(VT.Token),
  connectability: scalar(VT.Token), outputName: scalar(VT.Token),
  renderType: scalar(VT.Token), sdrMetadata: scalar(VT.Dictionary),
  renderSettingsPrimPath: scalar(VT.String), kilogramsPerUnit: scalar(VT.Double),
  weight: scalar(VT.Float), uiHints: scalar(VT.Dictionary),
  faceIndexPrimvar: scalar(VT.Token), faceOffsetPrimvar: scalar(VT.Token),
  uvPrimvar: scalar(VT.Token),
}

const SPECIFIERS: Readonly<Record<string, number>> = { def: 0, over: 1, class: 2 }
const PERMISSIONS: Readonly<Record<string, number>> = { public: 0, private: 1 }
const VARIABILITIES: Readonly<Record<string, number>> = { varying: 0, uniform: 1 }

const BOOTSTRAP_SIZE = 88 // ident[8], version[8], tocOffset, _reserved[8]

// SdfListOp header bits (crateFile.cpp _ListOpHeader).
const LISTOP_IS_EXPLICIT = 1 << 0
const LISTOP_HAS_EXPLICIT = 1 << 1
const LISTOP_HAS_ADDED = 1 << 2
const LISTOP_HAS_DELETED = 1 << 3
const LISTOP_HAS_ORDERED = 1 << 4
const LISTOP_HAS_PREPENDED = 1 << 5
const LISTOP_HAS_APPENDED = 1 << 6

// ---- Byte output ----

class ByteWriter {
  private _bytes = new Uint8Array(4096)
  private _view = new DataView(this._bytes.buffer)
  private _length = 0
  get pos(): number { return this._length }
  private _reserve(n: number): number {
    const at = this._length
    const needed = at + n
    if (needed > this._bytes.length) {
      let capacity = this._bytes.length * 2
      while (capacity < needed) capacity *= 2
      const grown = new Uint8Array(capacity)
      grown.set(this._bytes.subarray(0, at))
      this._bytes = grown
      this._view = new DataView(grown.buffer)
    }
    this._length = needed
    return at
  }
  // Reserve before touching _view/_bytes: growing replaces both.
  u8(v: number): void { const at = this._reserve(1); this._bytes[at] = v & 0xff }
  i8(v: number): void { const at = this._reserve(1); this._view.setInt8(at, v) }
  u16(v: number): void { const at = this._reserve(2); this._view.setUint16(at, v & 0xffff, true) }
  u32(v: number): void { const at = this._reserve(4); this._view.setUint32(at, v >>> 0, true) }
  i32(v: number): void { const at = this._reserve(4); this._view.setInt32(at, v | 0, true) }
  u64(v: number): void {
    const at = this._reserve(8)
    this._view.setUint32(at, v >>> 0, true)
    this._view.setUint32(at + 4, Math.floor(v / 0x100000000) >>> 0, true)
  }
  i64(v: number): void { const at = this._reserve(8); this._view.setBigInt64(at, BigInt(v), true) }
  big64(v: bigint): void { const at = this._reserve(8); this._view.setBigUint64(at, BigInt.asUintN(64, v), true) }
  f32(v: number): void { const at = this._reserve(4); this._view.setFloat32(at, v, true) }
  f64(v: number): void { const at = this._reserve(8); this._view.setFloat64(at, v, true) }
  bytes(data: Uint8Array): void { const at = this._reserve(data.length); this._bytes.set(data, at) }
  ascii(s: string, n: number): void {
    const at = this._reserve(n)
    for (let i = 0; i < n; i++) this._bytes[at + i] = i < s.length ? s.charCodeAt(i) & 0xff : 0
  }
  align(n: number): number {
    while (this._length % n !== 0) this.u8(0)
    return this._length
  }
  patchI64(pos: number, v: number): void { this._view.setBigInt64(pos, BigInt(v), true) }
  patchU64(pos: number, v: number): void {
    this._view.setUint32(pos, v >>> 0, true)
    this._view.setUint32(pos + 4, Math.floor(v / 0x100000000) >>> 0, true)
  }
  patchU8(pos: number, v: number): void { this._bytes[pos] = v & 0xff }
  toUint8Array(): Uint8Array { return this._bytes.slice(0, this._length) }
}

// A ValueRep: 48-bit payload, type byte, flags byte.
type Rep = bigint
function makeRep(type: CrateType, payload: number, inlined = false, compressed = false): Rep {
  const flags = (type.array ? FLAG_ARRAY : 0) | (inlined ? FLAG_INLINE : 0) |
    (compressed ? FLAG_COMPRESSED : 0)
  return (BigInt(flags) << 56n) | (BigInt(type.id) << 48n) | BigInt(payload)
}
function repWithCompression(rep: Rep): Rep { return rep | (BigInt(FLAG_COMPRESSED) << 56n) }

// ---- Value normalization helpers ----

function numbersOf(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number)
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>, Number)
  if (value !== null && typeof value === 'object' && typeof (value as ArrayLike<number>).length === 'number') {
    return Array.from(value as ArrayLike<number>, Number)
  }
  return []
}

function itemsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<unknown>)
  return []
}

function matrixRows(value: unknown, dim: number): number[] {
  const rows = itemsOf(value)
  const flat = rows.length > 0 && (Array.isArray(rows[0]) || ArrayBuffer.isView(rows[0]))
    ? rows.flatMap(row => numbersOf(row)) : numbersOf(value)
  const out: number[] = []
  for (let i = 0; i < dim * dim; i++) out.push(flat[i] ?? (i % (dim + 1) === 0 ? 1 : 0))
  return out
}

// A Gf value as the plain components the scalar packers take: [x, y, z],
// real-first [w, x, y, z] for a quaternion, row-major numbers for a matrix.
function gfComponents(value: unknown): number[] {
  const gf = value as { GetReal?: () => number, GetImaginary?: () => { data: readonly number[] },
    GetArray?: () => readonly number[], data?: readonly number[] }
  if (gf.GetReal) return [gf.GetReal(), ...gf.GetImaginary!().data]
  if (gf.GetArray) return [...gf.GetArray()]
  return [...gf.data!]
}

// A VtArray's elements in the shapes the array packers take.
function arrayItems(array: VtArray<unknown>): unknown[] {
  const data = array.cdata()
  if (ArrayBuffer.isView(data)) {
    const type = array.getElementType().getTypeName()
    if (type === 'half') return Array.from(data as Uint16Array, _halfBitsToFloat)
    if (type === 'bool') return Array.from(data as Uint8Array, b => b !== 0)
    if (data.length === array.size) return Array.from(data as unknown as ArrayLike<unknown>)
  }
  return array.toArray().map(item => _sdfIsGfValue(item) ? gfComponents(item) : item)
}

function int8Exact(n: number): boolean { return Number.isInteger(n) && n >= -128 && n <= 127 && !Object.is(n, -0) }

function bigintOf(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  const n = Number(value)
  return BigInt(Number.isFinite(n) ? Math.trunc(n) : 0)
}

function assetPathText(value: unknown): string {
  return value instanceof SdfAssetPath ? value.getAuthoredPath() : String(value ?? '')
}

function stringOf(value: unknown): string {
  if (value instanceof _SdfPathExpressionValue) return value.text
  if (value instanceof SdfAssetPath) return value.getAuthoredPath()
  return String(value ?? '')
}

interface ListOpLike {
  isExplicit?: boolean
  explicitItems?: unknown[]
  prependedItems?: unknown[]
  appendedItems?: unknown[]
  deletedItems?: unknown[]
  orderedItems?: unknown[]
  addedItems?: unknown[]
}

interface RefLike {
  assetPath?: string
  primPath?: string
  layerOffset?: { offset?: number, scale?: number }
  customData?: Record<string, unknown>
}

// Infers a crate type for a value that has no declared type, as the USDA
// writer infers a dictionary entry's type name.
function inferValueType(value: unknown): CrateType {
  const held = sdfValueTypeNameOfValue(value)
  if (held) return crateTypeForValueTypeName(held)!
  if (value instanceof SdfValueBlock || value === null) return scalar(VT.ValueBlock)
  if (value instanceof SdfAnimationBlock) return scalar(VT.AnimationBlock)
  if (value instanceof SdfAssetPath) return scalar(VT.AssetPath)
  if (value instanceof _SdfPathExpressionValue) return scalar(VT.PathExpression)
  if (value instanceof GfDuration) return scalar(VT.Duration)
  if (value instanceof TsSpline) return scalar(VT.Spline)
  if (typeof value === 'boolean') return scalar(VT.Bool)
  if (typeof value === 'bigint') return scalar(VT.Int64)
  if (typeof value === 'number') return scalar(Number.isInteger(value) ? VT.Int : VT.Double)
  if (typeof value === 'string') return scalar(VT.String)
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(item => typeof item === 'string')) return arrayOf(VT.Token)
    if (value.length > 0 && value.every(item => item instanceof SdfAssetPath)) return arrayOf(VT.AssetPath)
    if (value.every(item => typeof item === 'number')) {
      return arrayOf(value.every(item => Number.isInteger(item)) ? VT.Int : VT.Double)
    }
    if (value.every(item => typeof item === 'boolean')) return arrayOf(VT.Bool)
    if (value.length > 0 && value.every(item => Array.isArray(item) && item.length === 2 &&
        item.every(n => typeof n === 'number'))) return arrayOf(VT.Vec2d)
    if (value.length > 0 && value.every(item => Array.isArray(item) && item.length === 3)) return arrayOf(VT.Vec3d)
    return arrayOf(VT.Token)
  }
  if (_sdfIsDictionary(value)) return scalar(VT.Dictionary)
  // No crate type holds this value (e.g. a single SdfPath); pack() reports it.
  if (value !== null && typeof value === 'object') return scalar(TYPE_INVALID)
  return scalar(VT.String)
}

// TfStringify of a unit TfEnum: its full name, `SdfLengthUnit::SdfLengthUnitMillimeter`
// for mm. The unit names and enumerants are sdf/types.h:203-220.
const UNIT_ENUMS: Readonly<Record<string, readonly [string, string]>> = {
  mm: ['Length', 'Millimeter'], cm: ['Length', 'Centimeter'], dm: ['Length', 'Decimeter'],
  m: ['Length', 'Meter'], km: ['Length', 'Kilometer'], in: ['Length', 'Inch'],
  ft: ['Length', 'Foot'], yd: ['Length', 'Yard'], mi: ['Length', 'Mile'],
  deg: ['Angular', 'Degrees'], rad: ['Angular', 'Radians'],
  '%': ['Dimensionless', 'Percent'], default: ['Dimensionless', 'Default'],
}
function displayUnitEnumText(unit: unknown): string {
  const entry = UNIT_ENUMS[String(unit)]
  return entry ? `Sdf${entry[0]}Unit::Sdf${entry[0]}Unit${entry[1]}` : String(unit)
}

// TypeEnum::Invalid (crateDataTypes.h).
const TYPE_INVALID = 0

// ---- The writer ----

class CrateWriter {
  readonly out = new ByteWriter()
  private readonly tokens: string[] = []
  private readonly tokenIndex = new Map<string, number>()
  private readonly strings: number[] = []
  private readonly stringIndex = new Map<string, number>()
  private readonly paths: string[] = []
  private readonly pathIndex = new Map<string, number>()
  private readonly fields: Array<{ token: number, rep: Rep }> = []
  private readonly fieldIndex = new Map<string, number>()
  private readonly fieldSets: number[] = []
  private readonly fieldSetIndex = new Map<string, number>()
  private readonly specs: Array<{ path: number, fieldSet: number, form: number }> = []
  private readonly valueDedup = new Map<string, Rep>()
  // _PackingContext::writeVersion (crateFile.cpp:993-999): the backing
  // file's version when saving in place, else the version for new files
  // (USD_WRITE_NEW_USDC_FILES_AS_VERSION, default 0.8.0), raised by
  // RequestWriteVersionUpgrade as the data requires (crateFile.cpp:1072-1088).
  minorVersion = 8
  patchVersion = 0

  constructor(initialVersion?: readonly [number, number, number]) {
    this.out.bytes(new Uint8Array(BOOTSTRAP_SIZE))
    if (initialVersion) [, this.minorVersion, this.patchVersion] = initialVersion
  }

  requireVersion(minor: number): void {
    if (minor > this.minorVersion) { this.minorVersion = minor; this.patchVersion = 0 }
  }

  token(t: string): number {
    let index = this.tokenIndex.get(t)
    if (index === undefined) {
      index = this.tokens.length
      this.tokens.push(t)
      this.tokenIndex.set(t, index)
    }
    return index
  }

  string(s: string): number {
    let index = this.stringIndex.get(s)
    if (index === undefined) {
      index = this.strings.length
      this.strings.push(this.token(s))
      this.stringIndex.set(s, index)
    }
    return index
  }

  // The prim path of the spec being written; relative path values resolve
  // against it.
  anchor = '/'

  // CrateFile::_AddPath: a path's target and parent are added first, and each
  // path contributes its element token (the name, for prim property paths).
  path(authored: string): number {
    const p = makeAbsolutePath(authored, this.anchor)
    const existing = this.pathIndex.get(p)
    if (existing !== undefined) return existing
    this.pathIndex.set(p, -1)
    const { parent, element, target } = splitPath(p)
    if (target !== undefined) this.path(target)
    if (parent !== undefined) this.path(parent)
    this.token(element)
    const index = this.paths.length
    this.paths.push(p)
    this.pathIndex.set(p, index)
    return index
  }

  // _ValueHandler::Pack dedup: identical non-inlined values share one copy.
  private dedup(key: string | undefined, write: () => Rep): Rep {
    if (key === undefined) return write()
    const hit = this.valueDedup.get(key)
    if (hit !== undefined) return hit
    const rep = write()
    this.valueDedup.set(key, rep)
    return rep
  }

  // _Writer::_RecursiveWrite + Write(VtValue): a forward offset to the rep,
  // the nested value's data, then the rep itself.
  writeNestedValue(type: CrateType, value: unknown): void {
    const offsetPos = this.out.pos
    this.out.i64(0)
    const rep = this.pack(type, value)
    this.out.patchI64(offsetPos, this.out.pos - offsetPos)
    this.out.big64(rep)
  }

  // crateFile.cpp:4303-4307: a value of a type the crate cannot hold is a
  // coding error, and an invalid (zero) rep.
  packUnsupported(typeName: string, text: string): Rep {
    TfDiagnosticMgr.GetInstance().postError(new TfError(
      `Attempted to pack unsupported type '${typeName}' (${text})`,
      TfDiagnosticType.CodingError))
    return 0n
  }

  // CrateFile::_PackValue.
  pack(type: CrateType, value: unknown): Rep {
    if (value instanceof SdfValueBlock || value === null) return makeRep(scalar(VT.ValueBlock), 0, true)
    if (value instanceof SdfAnimationBlock) return makeRep(scalar(VT.AnimationBlock), 0, true)
    if (value instanceof VtArrayEdit) return this.packArrayEdit(type, value)
    if (value instanceof SdfUnregisteredValue) return this.packUnregistered(value.value, value.typeName)
    if (type.id === TYPE_INVALID) {
      const typeName = value instanceof SdfPath ? 'SdfPath'
        : (value as object | undefined)?.constructor?.name ?? typeof value
      return this.packUnsupported(typeName, String(value))
    }
    if (type.array) return this.packArray(type, value)
    return this.packScalar(type, _sdfIsGfValue(value) ? gfComponents(value) : value)
  }

  // _ValueHandler::PackArrayEdit (crateFile.cpp:1793-1834): the literals and
  // the instruction stream are packed as arrays, followed by their reps and
  // the former 'isDense' flag. An identity edit is a zero payload.
  private packArrayEdit(type: CrateType, edit: VtArrayEdit<unknown>): Rep {
    this.requireVersion(14)
    const editType: CrateType = { id: type.id, array: false }
    const arrayEditRep = (payload: number): Rep =>
      makeRep(editType, payload) | (BigInt(FLAG_ARRAY_EDIT) << 56n)
    if (edit.isIdentity()) return arrayEditRep(0)
    const { literals, indexes } = _crateArrayEditSerialization(edit)
    const arrayType: CrateType = { id: type.id, array: true }
    const first = literals[0]
    const values = _sdfIsGfValue(first)
      ? new VtArray(literals, TfType.findByName((first.constructor as { name: string }).name))
      : literals.map(literal => literal instanceof SdfAssetPath ? literal.getAuthoredPath() : literal)
    const valuesRep = this.pack(arrayType, values)
    const indexesRep = this.pack({ id: VT.Int64, array: true }, indexes)
    const rep = arrayEditRep(this.out.pos)
    this.out.big64(valuesRep)
    this.out.big64(indexesRep)
    this.out.u8(0)
    return rep
  }

  private packScalar(type: CrateType, value: unknown): Rep {
    const out = this.out
    switch (type.id) {
      case VT.Bool: return makeRep(type, value ? 1 : 0, true)
      case VT.UChar: return makeRep(type, Number(value) & 0xff, true)
      case VT.Int: return makeRep(type, (Number(value) | 0) >>> 0, true)
      case VT.UInt: return makeRep(type, Number(value) >>> 0, true)
      case VT.Specifier:
        return makeRep(type, typeof value === 'number' ? value : SPECIFIERS[String(value)] ?? 1, true)
      case VT.Permission:
        return makeRep(type, typeof value === 'number' ? value : PERMISSIONS[String(value)] ?? 0, true)
      case VT.Variability:
        return makeRep(type, typeof value === 'number' ? value : VARIABILITIES[String(value)] ?? 0, true)
      case VT.Half: return makeRep(type, new GfHalf(Number(value)).bits(), true)
      case VT.Float: return makeRep(type, float32Bits(Number(value)), true)
      case VT.Int64: case VT.UInt64: {
        const n = bigintOf(value)
        const signed = type.id === VT.Int64
        const fits = signed ? n >= -2147483648n && n <= 2147483647n : n >= 0n && n <= 4294967295n
        if (fits) return makeRep(type, Number(BigInt.asUintN(32, n)), true)
        return this.dedup(`${type.id}:${n}`, () => {
          const rep = makeRep(type, out.pos)
          out.big64(n)
          return rep
        })
      }
      case VT.Double: {
        const n = Number(value)
        if (Math.fround(n) === n) return makeRep(type, float32Bits(n), true)
        return this.dedup(`${type.id}:${n}`, () => {
          const rep = makeRep(type, out.pos)
          out.f64(n)
          return rep
        })
      }
      case VT.Duration:
      case VT.TimeCode: {
        this.requireVersion(type.id===VT.Duration?16:9)
        const n = Number(value)
        return this.dedup(`${type.id}:${n}`, () => {
          const rep = makeRep(type, out.pos)
          out.f64(n)
          return rep
        })
      }
      case VT.String: return makeRep(type, this.string(stringOf(value)), true)
      case VT.Token: return makeRep(type, this.token(stringOf(value)), true)
      case VT.AssetPath: return makeRep(type, this.token(assetPathText(value)), true)
      case VT.PathExpression: {
        this.requireVersion(10)
        const index = this.string(stringOf(value))
        return this.dedup(`${type.id}:${index}`, () => {
          const rep = makeRep(type, out.pos)
          out.u32(index)
          return rep
        })
      }
      case VT.Matrix2d: case VT.Matrix3d: case VT.Matrix4d: {
        const dim = type.id === VT.Matrix2d ? 2 : type.id === VT.Matrix3d ? 3 : 4
        const m = matrixRows(value, dim)
        let inline = true
        let diag = 0
        for (let i = 0; i < dim && inline; i++) {
          for (let j = 0; j < dim; j++) {
            const v = m[i * dim + j]!
            if (i !== j ? v !== 0 : !int8Exact(v)) { inline = false; break }
            if (i === j) diag |= (v & 0xff) << (8 * i)
          }
        }
        if (inline) return makeRep(type, diag >>> 0, true)
        return this.dedup(`${type.id}:${m.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          for (const v of m) out.f64(v)
          return rep
        })
      }
      case VT.Quatd: case VT.Quatf: case VT.Quath: {
        const q = numbersOf(value)
        return this.dedup(`${type.id}:${q.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          this.writeQuat(type.id, q)
          return rep
        })
      }
      case VT.Vec2d: case VT.Vec2f: case VT.Vec2h: case VT.Vec2i:
      case VT.Vec3d: case VT.Vec3f: case VT.Vec3h: case VT.Vec3i:
      case VT.Vec4d: case VT.Vec4f: case VT.Vec4h: case VT.Vec4i: {
        const dim = vecDimension(type.id)
        const v = numbersOf(value).slice(0, dim)
        while (v.length < dim) v.push(0)
        // GfVec2h is four bytes, so always inlined as its two halves
        // (_IsAlwaysInlined); other vectors inline when every component is an
        // exact int8_t (crateValueInliners.h).
        if (type.id === VT.Vec2h) {
          return makeRep(type, (new GfHalf(v[0]!).bits() | (new GfHalf(v[1]!).bits() << 16)) >>> 0, true)
        }
        if (v.every(int8Exact)) {
          let bits = 0
          v.forEach((c, i) => { bits |= (c & 0xff) << (8 * i) })
          return makeRep(type, bits >>> 0, true)
        }
        return this.dedup(`${type.id}:${v.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          this.writeVec(type.id, v)
          return rep
        })
      }
      case VT.Dictionary: return this.packDictionary(value)
      case VT.TokenListOp: case VT.StringListOp: case VT.PathListOp:
      case VT.ReferenceListOp: case VT.PayloadListOp: case VT.IntListOp:
      case VT.Int64ListOp: case VT.UIntListOp: case VT.UInt64ListOp:
      case VT.UnregisteredValueListOp:
        // Write(SdfPayloadListOp) requires 0.8.0 (crateFile.cpp:1589-1596).
        if (type.id === VT.PayloadListOp) this.requireVersion(8)
        return this.packListOp(type, value)
      case VT.PathVector: case VT.TokenVector: case VT.StringVector: {
        const items = itemsOf(value).map(item => String(item))
        const indexes = items.map(item => type.id === VT.PathVector ? this.path(item)
          : type.id === VT.TokenVector ? this.token(item) : this.string(item))
        return this.dedup(`${type.id}:${indexes.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(indexes.length)
          for (const index of indexes) out.u32(index)
          return rep
        })
      }
      case VT.DoubleVector: {
        const items = numbersOf(value)
        return this.dedup(`${type.id}:${items.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(items.length)
          for (const item of items) out.f64(item)
          return rep
        })
      }
      case VT.LayerOffsetVector: {
        const items = itemsOf(value).map(item => layerOffsetOf(item))
        return this.dedup(`${type.id}:${items.map(o => `${o.offset}/${o.scale}`).join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(items.length)
          for (const { offset, scale } of items) { out.f64(offset); out.f64(scale) }
          return rep
        })
      }
      case VT.VariantSelectionMap: {
        const entries = Object.entries((value ?? {}) as Record<string, unknown>)
          .map(([set, selection]): [string, string] =>
            [set, String(Array.isArray(selection) ? selection[0] ?? '' : selection ?? '')])
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        const indexes = entries.map(([set, selection]) => [this.string(set), this.string(selection)] as const)
        return this.dedup(`${type.id}:${indexes.map(([k, v]) => `${k}=${v}`).join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(indexes.length)
          for (const [k, v] of indexes) { out.u32(k); out.u32(v) }
          return rep
        })
      }
      case VT.Relocates: {
        this.requireVersion(11)
        const pairs: Array<readonly [string, string]> = Array.isArray(value)
          ? value.filter((entry): entry is [string, string] => Array.isArray(entry) && entry.length === 2)
            .map(([source, target]) => [String(source), String(target)] as const)
          : Object.entries((value ?? {}) as Record<string, unknown>)
            .map(([source, target]) => [source, String(target)] as const)
        const indexes = pairs.map(([source, target]) => [this.path(source), this.path(target)] as const)
        return this.dedup(`${type.id}:${indexes.map(([s, t]) => `${s}>${t}`).join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(indexes.length)
          for (const [s, t] of indexes) { out.u32(s); out.u32(t) }
          return rep
        })
      }
      case VT.Payload: {
        // Write(SdfPayload) (crateFile.cpp:1554-1570): a non-identity layer
        // offset requires 0.8.0, and only 0.8.0 and later store the offset.
        const item = (value ?? {}) as RefLike
        const { offset, scale } = layerOffsetOf(item.layerOffset)
        if (offset !== 0 || scale !== 1) this.requireVersion(8)
        const asset = this.string(item.assetPath ?? '')
        const prim = this.path(item.primPath ?? '')
        const rep = makeRep(type, out.pos)
        out.u32(asset); out.u32(prim)
        if (this.minorVersion >= 8) { out.f64(offset); out.f64(scale) }
        return rep
      }
      case VT.Spline: return this.packSpline(value)
      case VT.ValueBlock: case VT.AnimationBlock: return makeRep(type, 0, true)
      case VT.TimeSamples: throw new Error('time samples are packed with their value type')
      default:
        throw new Error(`The USDC writer has no encoding for crate type ${type.id}`)
    }
  }

  private writeQuat(id: number, q: number[]): void {
    // Values follow USDA order (real, i, j, k); GfQuat stores imaginary first.
    const stored = [q[1] ?? 0, q[2] ?? 0, q[3] ?? 0, q[0] ?? 0]
    for (const c of stored) this.writeComponent(id === VT.Quatd ? 'd' : id === VT.Quatf ? 'f' : 'h', c)
  }

  private writeVec(id: number, v: number[]): void {
    const kind = vecKind(id)
    for (const c of v) this.writeComponent(kind, c)
  }

  private writeComponent(kind: 'd' | 'f' | 'h' | 'i', c: number): void {
    if (kind === 'd') this.out.f64(c)
    else if (kind === 'f') this.out.f32(c)
    else if (kind === 'h') this.out.u16(new GfHalf(c).bits())
    else this.out.i32(c)
  }

  // _ValueHandler::PackArray: empty arrays have a zero payload; others are
  // written (possibly compressed) once and deduplicated.
  private packArray(type: CrateType, value: unknown): Rep {
    if (value instanceof VtArray) {
      const raw = this.packRawArray(type, value)
      if (raw !== undefined) return raw
      value = arrayItems(value)
    }
    const items = itemsOf(value)
    if (items.length === 0) return makeRep(type, 0)
    const out = this.out
    switch (type.id) {
      case VT.Int: case VT.UInt: {
        const ints = items.map(item => Number(item))
        return this.dedup(`a${type.id}:${ints.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(ints.length)
          if (ints.length < MIN_COMPRESSED_ARRAY_SIZE) {
            for (const n of ints) type.id === VT.Int ? out.i32(n) : out.u32(n)
            return rep
          }
          const comp = encodeIntArrayCompressed(ints.map(n => n | 0))
          out.u64(comp.length); out.bytes(comp)
          return repWithCompression(rep)
        })
      }
      case VT.Int64: case VT.UInt64: {
        const ints = items.map(bigintOf)
        return this.dedup(`a${type.id}:${ints.join(',')}`, () => {
          const rep = makeRep(type, out.pos)
          out.u64(ints.length)
          if (ints.length < MIN_COMPRESSED_ARRAY_SIZE) {
            for (const n of ints) out.big64(n)
            return rep
          }
          const comp = encodeIntArray64Compressed(ints.map(n => BigInt.asIntN(64, n)))
          out.u64(comp.length); out.bytes(comp)
          return repWithCompression(rep)
        })
      }
      case VT.Half: case VT.Float: case VT.Double: {
        const floats = items.map(item => Number(item))
        return this.dedup(floats.length <= 4096 ? `a${type.id}:${floats.join(',')}` : undefined,
          () => this.writeFloatArray(type, floats))
      }
      default: break
    }
    return this.dedup(items.length <= 256 ? `a${type.id}:${JSON.stringify(items, jsonSafe)}` : undefined, () => {
      const indexes = type.id === VT.String || type.id === VT.PathExpression
        ? items.map(item => this.string(stringOf(item)))
        : type.id === VT.Token ? items.map(item => this.token(stringOf(item)))
          : type.id === VT.AssetPath ? items.map(item => this.string(assetPathText(item)))
            : undefined
      if (type.id === VT.PathExpression) this.requireVersion(10)
      if (type.id === VT.TimeCode) this.requireVersion(9)
      if (type.id === VT.Duration) this.requireVersion(16)
      const rep = makeRep(type, out.align(8))
      out.u64(items.length)
      if (indexes) { for (const index of indexes) out.u32(index); return rep }
      switch (type.id) {
        case VT.Bool: for (const item of items) out.u8(item ? 1 : 0); break
        case VT.UChar: for (const item of items) out.u8(Number(item)); break
        case VT.Duration:
        case VT.TimeCode: for (const item of items) out.f64(Number(item)); break
        case VT.Matrix2d: case VT.Matrix3d: case VT.Matrix4d: {
          const dim = type.id === VT.Matrix2d ? 2 : type.id === VT.Matrix3d ? 3 : 4
          for (const item of items) for (const v of matrixRows(item, dim)) out.f64(v)
          break
        }
        case VT.Quatd: case VT.Quatf: case VT.Quath:
          for (const item of items) this.writeQuat(type.id, numbersOf(item))
          break
        case VT.Dictionary:
          throw new Error('Dictionary arrays are not a crate value type')
        default: {
          const dim = vecDimension(type.id)
          if (!dim) throw new Error(`The USDC writer has no array encoding for crate type ${type.id}`)
          const kind = vecKind(type.id)
          for (const item of items) {
            const v = Array.isArray(item) ? item : numbersOf(item)
            for (let i = 0; i < dim; i++) this.writeComponent(kind, Number(v[i] ?? 0))
          }
        }
      }
      return rep
    })
  }

  // A Gf-element VtArray whose storage is the crate's element layout is
  // written as its raw bytes (_WriteUncompressedArray).
  private packRawArray(type: CrateType, array: VtArray<unknown>): Rep | undefined {
    const data = array.cdata()
    const n = array.size
    if (n === 0 || !ArrayBuffer.isView(data)) return undefined
    const kind = type.id === VT.Quatd ? 'd' : type.id === VT.Quatf ? 'f' : type.id === VT.Quath ? 'h'
      : type.id === VT.Matrix2d || type.id === VT.Matrix3d || type.id === VT.Matrix4d ? 'd'
        : vecDimension(type.id) ? vecKind(type.id) : undefined
    const storage = { d: Float64Array, f: Float32Array, h: Uint16Array, i: Int32Array }
    if (kind === undefined || !(data instanceof storage[kind])) return undefined
    const width = data.length / n
    const expected = type.id === VT.Matrix2d ? 4 : type.id === VT.Matrix3d ? 9 : type.id === VT.Matrix4d ? 16
      : vecDimension(type.id) || 4
    if (width !== expected) return undefined
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const out = this.out
    return this.dedup(n <= 256 ? `a${type.id}:${Array.from(data).join(',')}` : undefined, () => {
      const rep = makeRep(type, out.align(8))
      out.u64(n)
      out.bytes(bytes)
      return rep
    })
  }

  // _WritePossiblyCompressedArray for GfHalf, float and double.
  private writeFloatArray(type: CrateType, floats: number[]): Rep {
    const out = this.out
    const writeElement = (v: number) => {
      if (type.id === VT.Double) out.f64(v)
      else if (type.id === VT.Float) out.f32(v)
      else out.u16(new GfHalf(v).bits())
    }
    if (floats.length >= MIN_COMPRESSED_ARRAY_SIZE) {
      // Compare in the element type's precision, as upstream compares Ts.
      const stored = type.id === VT.Double ? floats
        : type.id === VT.Float ? floats.map(Math.fround)
          : floats.map(v => new GfHalf(v).GetValue())
      const integral = stored.every(v => v >= -2147483648 && v <= 2147483647 && (v | 0) === v)
      if (integral) {
        const rep = repWithCompression(makeRep(type, out.pos))
        out.u64(floats.length)
        out.i8(0x69) // 'i'
        const comp = encodeIntArrayCompressed(stored.map(v => v | 0))
        out.u64(comp.length); out.bytes(comp)
        return rep
      }
      const maxLutSize = Math.min(Math.floor(stored.length / 4), 1024)
      const lut: number[] = []
      const lutIndex = new Map<number, number>()
      const indexes: number[] = []
      let abandoned = false
      for (const v of stored) {
        let index = lutIndex.get(v)
        if (index === undefined && !Number.isNaN(v)) {
          if (lut.length === maxLutSize) { abandoned = true; break }
          index = lut.length
          lut.push(v)
          lutIndex.set(v, index)
        }
        if (index === undefined) { abandoned = true; break }
        indexes.push(index)
      }
      if (!abandoned && lut.length > 0) {
        const rep = repWithCompression(makeRep(type, out.pos))
        out.u64(floats.length)
        out.i8(0x74) // 't'
        out.u32(lut.length)
        for (const v of lut) writeElement(v)
        const comp = encodeIntArrayCompressed(indexes)
        out.u64(comp.length); out.bytes(comp)
        return rep
      }
    }
    const rep = makeRep(type, out.align(8))
    out.u64(floats.length)
    for (const v of floats) writeElement(v)
    return rep
  }

  // Write(VtDictionary): a std::map, so entries are written in key order.
  private packDictionary(value: unknown): Rep {
    const dict = (value !== null && typeof value === 'object' ? value : {}) as Record<string, unknown>
    const keys = Object.keys(dict).filter(key => dict[key] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    if (keys.length === 0) return makeRep(scalar(VT.Dictionary), 0, true)
    const types = _sdfGetDictionaryValueTypes(dict)
    const rep = makeRep(scalar(VT.Dictionary), this.out.pos)
    this.writeDictionaryBody(dict, keys, types)
    return rep
  }

  private writeDictionaryBody(
    dict: Record<string, unknown>, keys: readonly string[], types: ReadonlyMap<string, string> | undefined,
  ): void {
    this.out.u64(keys.length)
    for (const key of keys) {
      this.out.u32(this.string(key))
      const entry = dict[key]
      const declared = types?.get(key)
      // A Gf value or VtArray is written as the type it holds.
      const held = sdfValueTypeNameOfValue(entry)
      const type = (held ?? declared ? crateTypeForValueTypeName(held ?? declared!) : undefined) ??
        inferValueType(entry)
      this.writeNestedValue(type, entry)
    }
  }

  // Write(SdfListOp<T>): the header, then each present item list.
  private packListOp(type: CrateType, value: unknown): Rep {
    const op = (value ?? {}) as ListOpLike
    const explicit = op.explicitItems ?? []
    const added = op.addedItems ?? []
    const prepended = op.prependedItems ?? []
    const appended = op.appendedItems ?? []
    const deleted = op.deletedItems ?? []
    const ordered = op.orderedItems ?? []
    let header = 0
    if (op.isExplicit) header |= LISTOP_IS_EXPLICIT
    if (explicit.length) header |= LISTOP_HAS_EXPLICIT
    if (added.length) header |= LISTOP_HAS_ADDED
    if (deleted.length) header |= LISTOP_HAS_DELETED
    if (ordered.length) header |= LISTOP_HAS_ORDERED
    if (prepended.length) header |= LISTOP_HAS_PREPENDED
    if (appended.length) header |= LISTOP_HAS_APPENDED
    // Reference custom data and item paths are added to the tables first, so
    // the list op's own bytes stay contiguous.
    const lists = [explicit, added, prepended, appended, deleted, ordered]
      .filter(list => list.length > 0)
    const rep = makeRep(type, this.out.pos)
    this.out.u8(header)
    for (const list of lists) {
      this.out.u64(list.length)
      for (const item of list) this.writeListOpItem(type.id, item)
    }
    return rep
  }

  private writeListOpItem(id: number, item: unknown): void {
    const out = this.out
    switch (id) {
      case VT.TokenListOp: out.u32(this.token(String(item))); break
      case VT.StringListOp: out.u32(this.string(String(item))); break
      case VT.PathListOp: out.u32(this.path(String(item))); break
      case VT.IntListOp: out.i32(Number(item)); break
      case VT.UIntListOp: out.u32(Number(item)); break
      case VT.Int64ListOp: case VT.UInt64ListOp: out.big64(bigintOf(item)); break
      case VT.UnregisteredValueListOp: this.writeNestedValue(scalar(VT.String), String(item)); break
      case VT.ReferenceListOp: case VT.PayloadListOp: {
        const ref = (item ?? {}) as RefLike
        out.u32(this.string(ref.assetPath ?? ''))
        out.u32(this.path(ref.primPath ?? ''))
        const { offset, scale } = layerOffsetOf(ref.layerOffset)
        out.f64(offset); out.f64(scale)
        if (id === VT.ReferenceListOp) {
          const customData = (ref.customData ?? {}) as Record<string, unknown>
          const keys = Object.keys(customData).filter(key => customData[key] !== undefined)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
          this.writeDictionaryBody(customData, keys, _sdfGetDictionaryValueTypes(customData))
        }
        break
      }
      default: throw new Error(`Unknown list op type ${id}`)
    }
  }

  // Write(TimeSamples): the times and the values, each behind a forward
  // offset, then the value reps.
  packTimeSamples(samples: ReadonlyArray<readonly [number, unknown]>, valueType: CrateType): Rep {
    const out = this.out
    const rep = makeRep(scalar(VT.TimeSamples), out.pos)
    const timesOffset = out.pos
    out.i64(0)
    const timesRep = this.pack(scalar(VT.DoubleVector), samples.map(([time]) => time))
    out.patchI64(timesOffset, out.pos - timesOffset)
    out.big64(timesRep)
    const valuesOffset = out.pos
    out.i64(0)
    const reps = samples.map(([, value]) => this.pack(valueType, value))
    out.patchI64(valuesOffset, out.pos - valuesOffset)
    out.u64(reps.length)
    for (const r of reps) out.big64(r)
    return rep
  }

  // Write(TsSpline): the binary blob, then the knot custom data as a map from
  // time to dictionary.
  private packSpline(value: unknown): Rep {
    if (!(value instanceof TsSpline)) throw new Error('spline field does not hold a TsSpline')
    const version = Ts_BinaryDataAccess.getBinaryFormatVersion(value)
    this.requireVersion(version === 1 ? 12 : version === 2 ? 13 : version === 3 ? 15 : 16)
    const { data, customData } = Ts_BinaryDataAccess.getBinaryData(value)
    const knotTypes = _sdfGetSplineKnotCustomDataValueTypes(value)
    const out = this.out
    const rep = makeRep(scalar(VT.Spline), out.pos)
    out.u64(data.length)
    out.bytes(data)
    out.u64(customData.size)
    for (const [time, dict] of customData) {
      out.f64(time)
      const keys = Object.keys(dict).filter(key => dict[key] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      this.writeDictionaryBody(dict, keys, knotTypes?.get(time) ?? _sdfGetDictionaryValueTypes(dict))
    }
    return rep
  }

  // An unregistered field keeps its value as upstream's text parser recorded
  // it: a dictionary or an SdfUnregisteredValueListOp as itself, anything
  // else as its text (crateFile.cpp:1543 writes the held VtValue).
  packUnregistered(value: unknown, lexicalType: string): Rep {
    const out = this.out
    const rep = makeRep(scalar(VT.UnregisteredValue), out.pos)
    if (lexicalType === 'dictionary' && _sdfIsDictionary(value)) {
      this.writeNestedValue(scalar(VT.Dictionary), value)
    } else if (lexicalType === 'unregisteredListOp' && value !== null && typeof value === 'object') {
      this.writeNestedValue(scalar(VT.UnregisteredValueListOp), value)
    } else {
      this.writeNestedValue(scalar(VT.String), unregisteredText(value, lexicalType))
    }
    return rep
  }

  // CrateFile::_AddField / _AddFieldSet / _AddSpec.
  addSpec(path: string, form: number, fieldReps: Array<[string, Rep]>): void {
    const indexes = fieldReps.map(([name, rep]) => {
      const token = this.token(name)
      const key = `${token}:${rep}`
      let index = this.fieldIndex.get(key)
      if (index === undefined) {
        index = this.fields.length
        this.fields.push({ token, rep })
        this.fieldIndex.set(key, index)
      }
      return index
    })
    const setKey = indexes.join(',')
    let fieldSet = this.fieldSetIndex.get(setKey)
    if (fieldSet === undefined) {
      fieldSet = this.fieldSets.length
      this.fieldSets.push(...indexes, -1)
      this.fieldSetIndex.set(setKey, fieldSet)
    }
    this.specs.push({ path: this.path(path), fieldSet, form })
  }

  // CrateFile::_Write: structural sections, the table of contents, then the
  // bootstrap at the start of the file.
  finish(): Uint8Array {
    const out = this.out
    const sections: Array<[string, number, number]> = []
    const section = (name: string, write: () => void) => {
      const start = out.pos
      write()
      sections.push([name, start, out.pos - start])
    }
    section('TOKENS', () => {
      // Strings are written as the bytes they hold (quotedString.ts
      // encodeUtf8Bytes), so a string read with non-UTF-8 bytes keeps them.
      const parts = this.tokens.map(t => encodeUtf8Bytes(t))
      const raw = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0))
      let at = 0
      for (const p of parts) { raw.set(p, at); at += p.length + 1 }
      const comp = lz4Compress(raw)
      out.u64(this.tokens.length); out.u64(raw.length); out.u64(comp.length); out.bytes(comp)
    })
    section('STRINGS', () => {
      out.u64(this.strings.length)
      for (const index of this.strings) out.u32(index)
    })
    section('FIELDS', () => {
      out.u64(this.fields.length)
      const tokenComp = encodeIntArrayCompressed(this.fields.map(f => f.token))
      out.u64(tokenComp.length); out.bytes(tokenComp)
      const reps = new Uint8Array(this.fields.length * 8)
      const view = new DataView(reps.buffer)
      this.fields.forEach((f, i) => view.setBigUint64(i * 8, f.rep, true))
      const repComp = lz4Compress(reps)
      out.u64(repComp.length); out.bytes(repComp)
    })
    section('FIELDSETS', () => {
      out.u64(this.fieldSets.length)
      const comp = encodeIntArrayCompressed(this.fieldSets)
      out.u64(comp.length); out.bytes(comp)
    })
    section('PATHS', () => this.writePaths())
    section('SPECS', () => {
      out.u64(this.specs.length)
      for (const values of [this.specs.map(s => s.path), this.specs.map(s => s.fieldSet), this.specs.map(s => s.form)]) {
        const comp = encodeIntArrayCompressed(values)
        out.u64(comp.length); out.bytes(comp)
      }
    })
    const tocOffset = out.pos
    out.u64(sections.length)
    for (const [name, start, size] of sections) { out.ascii(name, 16); out.u64(start); out.u64(size) }
    // Bootstrap: "PXR-USDC", version bytes, the TOC offset.
    const ident = 'PXR-USDC'
    for (let i = 0; i < 8; i++) out.patchU8(i, ident.charCodeAt(i))
    out.patchU8(8, 0); out.patchU8(9, this.minorVersion); out.patchU8(10, this.patchVersion)
    out.patchU64(16, tocOffset)
    return out.toUint8Array()
  }

  // _WritePaths / _WriteCompressedPathData: the non-empty paths sorted so each
  // subtree is contiguous, encoded as path indexes, element tokens (negative
  // for prim property names) and sibling jumps.
  private writePaths(): void {
    const out = this.out
    const children = new Map<string, string[]>()
    for (const p of this.paths) {
      if (p === '' || p === '/') continue
      const { parent } = splitPath(p)
      const key = parent ?? '/'
      let list = children.get(key)
      if (!list) children.set(key, list = [])
      list.push(p)
    }
    for (const list of children.values()) sortByKey(list, pathElementKey)
    const pathIndexes: number[] = []
    const elementTokens: number[] = []
    const jumps: number[] = []
    const visit = (p: string, isLast: boolean): void => {
      const at = pathIndexes.length
      pathIndexes.push(this.pathIndex.get(p)!)
      if (p === '/') {
        elementTokens.push(0)
      } else {
        const { element, isPrimProperty } = splitPath(p)
        const token = this.tokenIndex.get(element)!
        elementTokens.push(isPrimProperty ? -token : token)
      }
      jumps.push(0)
      const kids = children.get(p) ?? []
      kids.forEach((kid, i) => visit(kid, i === kids.length - 1))
      const hasChild = kids.length > 0
      const hasSibling = !isLast
      jumps[at] = hasSibling && hasChild ? pathIndexes.length - at
        : hasSibling ? 0 : hasChild ? -1 : -2
    }
    const encoded = this.pathIndex.has('/') ? 1 : 0
    out.u64(this.paths.length)
    if (encoded) visit('/', true)
    out.u64(pathIndexes.length)
    for (const values of [pathIndexes, elementTokens, jumps]) {
      const comp = encodeIntArrayCompressed(values)
      out.u64(comp.length); out.bytes(comp)
    }
  }
}

function float32Bits(n: number): number {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, n, true)
  return view.getUint32(0, true)
}

function vecDimension(id: number): number {
  if (id >= VT.Vec2d && id <= VT.Vec2i) return 2
  if (id >= VT.Vec3d && id <= VT.Vec3i) return 3
  if (id >= VT.Vec4d && id <= VT.Vec4i) return 4
  return 0
}

function vecKind(id: number): 'd' | 'f' | 'h' | 'i' {
  return (['d', 'f', 'h', 'i'] as const)[(id - VT.Vec2d) % 4]!
}

function layerOffsetOf(value: unknown): { offset: number, scale: number } {
  const o = (value ?? {}) as { offset?: number, scale?: number }
  return { offset: Number(o.offset ?? 0), scale: Number(o.scale ?? 1) }
}

function jsonSafe(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`
  if (value instanceof GfDuration) return {duration:value.GetValue()}
  if (value instanceof SdfAssetPath) return `@${value.getAuthoredPath()}@`
  return value
}

function unregisteredText(value: unknown, lexicalType: string): string {
  const one = (item: unknown): string => {
    if (lexicalType === 'string') return quoteString(String(item))
    if (lexicalType === 'asset') return `@${assetPathText(item)}@`
    if (lexicalType === 'path') return `<${String(item)}>`
    return String(item)
  }
  return Array.isArray(value) ? `[${value.map(one).join(', ')}]` : one(value)
}

// SdfPath::MakeAbsolutePath. Upstream's text parser anchors relative paths in
// list ops and relocates to the owning prim when it reads them, so only
// absolute paths reach its crate writer; the typescript-usd layer may still hold the
// relative form.
function makeAbsolutePath(p: string, anchor: string): string {
  if (p === '' || p.startsWith('/')) return p
  let base = anchor
  let rest = p
  for (;;) {
    if (rest === '..' || rest.startsWith('../')) {
      base = splitPath(base).parent ?? '/'
      rest = rest.slice(rest === '..' ? 2 : 3)
    } else if (rest === '.' || rest.startsWith('./')) {
      rest = rest.slice(rest === '.' ? 1 : 2)
    } else break
  }
  if (rest === '') return base
  if (rest.startsWith('.')) return `${base}${rest}`
  return base === '/' ? `/${rest}` : `${base}/${rest}`
}

// Splits a path into its parent and last element, as SdfPath's
// GetParentPath and GetElementToken (or GetNameToken for prim properties).
function splitPath(p: string): {
  parent: string | undefined, element: string, isPrimProperty: boolean, target?: string
} {
  if (p === '' || p === '/') return { parent: undefined, element: '', isPrimProperty: false }
  if (p.endsWith(']')) {
    let depth = 0
    for (let i = p.length - 1; i >= 0; i--) {
      if (p[i] === ']') depth++
      else if (p[i] === '[' && --depth === 0) {
        return { parent: p.slice(0, i), element: p.slice(i), isPrimProperty: false, target: p.slice(i + 1, -1) }
      }
    }
  }
  if (p.endsWith('}')) {
    const open = p.lastIndexOf('{')
    return { parent: p.slice(0, open) || '/', element: p.slice(open), isPrimProperty: false }
  }
  const lastSlash = p.lastIndexOf('/')
  const lastBrace = p.lastIndexOf('}')
  const lastBracket = p.lastIndexOf(']')
  const lastDot = p.lastIndexOf('.')
  if (lastDot > lastSlash && lastDot > lastBrace && lastDot > lastBracket) {
    const parent = p.slice(0, lastDot) || '/'
    const isPrimProperty = lastBracket < 0
    return { parent, element: isPrimProperty ? p.slice(lastDot + 1) : p.slice(lastDot), isPrimProperty }
  }
  if (lastBrace > lastSlash) {
    return { parent: p.slice(0, lastBrace + 1), element: p.slice(lastBrace + 1), isPrimProperty: false }
  }
  return { parent: lastSlash <= 0 ? '/' : p.slice(0, lastSlash), element: p.slice(lastSlash + 1), isPrimProperty: false }
}

// Sibling order in the path tree. Any order that keeps subtrees contiguous is
// valid; prims, variant selections, then properties, each by name.
function pathElementKey(p: string): string {
  const { element, isPrimProperty } = splitPath(p)
  const rank = isPrimProperty || element.startsWith('.') ? 2 : element.startsWith('{') ? 1 : 0
  return `${rank}${p}`
}

// Sorts by a precomputed key, so the key is derived once per item.
function sortByKey(items: string[], key: (item: string) => string): void {
  const keyed = items.map(item => [key(item), item] as const)
  keyed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  keyed.forEach(([, item], i) => { items[i] = item })
}

function specTypeForPath(path: string, layer: SdfLayerForCrateWrite): SdfSpecType {
  const declared = layer.getSpecType?.(path)
  if (declared && declared !== 'unknown') return declared
  if (path === '/') return 'pseudoRoot'
  if (/\{[^}=]+=\}$/.test(path)) return 'variantSet'
  if (/\{[^}=]+=[^}]*\}$/.test(path)) return 'variant'
  const { isPrimProperty } = splitPath(path)
  if (isPrimProperty) {
    return layer.getField(path, 'targetPaths') !== undefined ? 'relationship' : 'attribute'
  }
  return 'prim'
}

// Sdf_CrateDataImpl::Save: prim paths before property paths, properties
// grouped by name, otherwise SdfPath order.
function specPathKey(p: string): string {
  if (!splitPath(p).isPrimProperty) return `0${p}`
  return `1${p.slice(p.lastIndexOf('.') + 1)}\u0000${p}`
}

// The crate type of one field, or undefined when its type must be inferred.
function fieldType(
  layer: SdfLayerForCrateWrite, path: string, specType: SdfSpecType, name: string, value: unknown,
): CrateType {
  const known = FIELD_TYPES[name]
  if (known) return known
  const kind = specType === 'pseudoRoot' ? 'layer'
    : specType === 'attribute' ? 'attribute'
      : specType === 'relationship' ? 'relationship'
        : specType === 'variant' ? 'variant' : 'prim'
  const registered = _sdfGetMetadataFieldType(name, kind)
  const fromSchema = registered ? crateTypeForValueTypeName(registered) : undefined
  if (fromSchema) return fromSchema
  return inferValueType(value)
}

function attributeValueType(typeName: unknown, sample: unknown): CrateType {
  if (typeof typeName === 'string') {
    const t = crateTypeForValueTypeName(typeName.replace(/^uniform /, ''))
    if (t) return t
  }
  return inferValueType(sample)
}

// _FromPayloadListOpValue (crateData.cpp:1100-1129): an explicit payload
// list op of no items, or of one item with an asset path, is stored as a
// single SdfPayload, which crate files before 0.8.0 can hold.
function singlePayloadOf(value: unknown): RefLike | undefined {
  const op = sdfNormalizeListOp<RefLike>(value)
  if (!op?.isExplicit) return undefined
  if (op.explicitItems.length === 0) return {}
  const item = op.explicitItems[0]
  return op.explicitItems.length === 1 && item?.assetPath ? item : undefined
}

const isIdentityOffset = (payload: RefLike): boolean => {
  const { offset, scale } = layerOffsetOf(payload.layerOffset)
  return offset === 0 && scale === 1
}

/** Packs a layer as a crate file. `writeVersion` is the version of the file
 * the layer is saved over in place (crateFile.cpp:993-999); new files start
 * at 0.8.0. */
export function serializeUsdc(layer: SdfLayerForCrateWrite,
  writeVersion?: readonly [number, number, number]): Uint8Array {
  const w = new CrateWriter(writeVersion)
  // CrateFile::_AddSpec (crateFile.cpp:2958-3021): while the file is older
  // than 0.8.0, a spec whose payload a pre-0.8.0 file can hold is deferred
  // to the end, so that every payload is written in the final version's form.
  const deferred: Array<{ path: string, form: number, reps: Array<[string, Rep]>, payload: RefLike }> = []
  const specPaths = layer.getSpecPaths().slice()
  sortByKey(specPaths, specPathKey)
  for (const path of specPaths) {
    const specType = specTypeForPath(path, layer)
    const form = CRATE_SPEC_FORMS[specType as keyof typeof CRATE_SPEC_FORMS]
    if (form === undefined) continue
    const names = layer.getFieldNames(path)
    w.anchor = splitPath(path).isPrimProperty ? splitPath(path).parent ?? '/' : path
    const storedTypeName = layer.getField(path, 'typeName')
    // Crate-style attribute type names carry variability as a "uniform "
    // prefix; split them back into typeName and variability.
    const uniformPrefix = specType === 'attribute' && typeof storedTypeName === 'string' &&
      storedTypeName.startsWith('uniform ')
    const reps: Array<[string, Rep]> = []
    let pendingPayload: RefLike | undefined
    for (const authoredName of names) {
      // The USDA keyword doc names the documentation field.
      const name = authoredName === 'doc' ? 'documentation' : authoredName
      let value = layer.getField(path, authoredName)
      if (value === undefined) continue
      if (name === 'typeName') {
        if (specType === 'relationship') continue
        if (uniformPrefix) value = (value as string).slice('uniform '.length)
      }
      // Plain target/connection values are explicit list ops: a path list, a
      // single path, or None (null) for an explicitly empty list.
      if (name === 'targetPaths' || name === 'connectionPaths') {
        if (Array.isArray(value)) value = { isExplicit: true, explicitItems: value }
        else if (typeof value === 'string') value = { isExplicit: true, explicitItems: [value] }
        else if (value === null) value = { isExplicit: true, explicitItems: [] }
      }
      // CrateFile::_AddField adds the field's token before packing its value,
      // so token 0 is always a field name and never a property element, whose
      // index is stored negated in the path tree.
      w.token(name)
      let rep: Rep
      if (name === 'displayUnit') {
        // displayUnit holds a TfEnum (schema.cpp:768-769), which the crate
        // has no type for (crateFile.cpp:4303-4307).
        rep = w.packUnsupported('TfEnum', displayUnitEnumText(value))
      } else if (name === 'default') {
        rep = w.pack(attributeValueType(storedTypeName, value), value)
      } else if (name === 'payload' && singlePayloadOf(value) !== undefined) {
        const payload = singlePayloadOf(value)!
        if (w.minorVersion < 8 && isIdentityOffset(payload)) { pendingPayload = payload; continue }
        rep = w.pack(scalar(VT.Payload), payload)
      } else if (name === 'timeSamples') {
        const samples = normalizeSamples(value)
        rep = w.packTimeSamples(samples, attributeValueType(storedTypeName, samples[0]?.[1]))
      } else {
        const lexicalType = layer._getFieldValueTypeName?.(path, authoredName)
        if (lexicalType && !FIELD_TYPES[name]) {
          rep = w.packUnregistered(value, lexicalType)
        } else {
          rep = w.pack(fieldType(layer, path, specType, name, value), value)
        }
      }
      reps.push([name, rep])
    }
    // SdfLayer keeps one offset per sublayer; pad to identity offsets.
    if (specType === 'pseudoRoot' && names.includes('subLayers')) {
      const count = itemsOf(layer.getField(path, 'subLayers')).length
      const authored = itemsOf(layer.getField(path, 'subLayerOffsets'))
      const offsets = Array.from({ length: count }, (_, i) => authored[i] ?? { offset: 0, scale: 1 })
      const at = reps.findIndex(([name]) => name === 'subLayerOffsets')
      const rep = w.pack(scalar(VT.LayerOffsetVector), offsets)
      if (at >= 0) reps[at] = ['subLayerOffsets', rep]
      else reps.push(['subLayerOffsets', rep])
    }
    if (uniformPrefix && !names.includes('variability')) {
      reps.push(['variability', w.pack(scalar(VT.Variability), 'uniform')])
    }
    w.anchor = '/'
    if (pendingPayload) deferred.push({ path, form, reps, payload: pendingPayload })
    else w.addSpec(path, form, reps)
  }
  for (const { path, form, reps, payload } of deferred) {
    w.anchor = path
    reps.push(['payload', w.pack(scalar(VT.Payload), payload)])
    w.anchor = '/'
    w.addSpec(path, form, reps)
  }
  return w.finish()
}

function normalizeSamples(value: unknown): Array<readonly [number, unknown]> {
  const entries = value instanceof Map ? [...value]
    : Array.isArray(value) ? value.filter((entry): entry is [unknown, unknown] =>
      Array.isArray(entry) && entry.length >= 2)
      : value !== null && typeof value === 'object' ? Object.entries(value) : []
  return entries.map(([time, sample]) => [Number(time), sample] as const)
    .filter(([time]) => Number.isFinite(time))
    .sort(([a], [b]) => a - b)
}
