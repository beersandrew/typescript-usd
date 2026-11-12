// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/NanoVDB.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/NanoVDB.h (read + sample scope): grid/tree/node layouts
// and traversal for the NanoVDB 32.9.1 in-memory stream, addressed as byte
// offsets into an ArrayBuffer instead of reinterpret-cast pointers.
//
// Layout constants below are asserted against testdata/fixtures/layout.json
// (sizeof/offsetof dumped from the pinned upstream checkout by
// tools/oracle/layout_dump.cc).
//
// DIVERGENCE from upstream: 64-bit integer fields (byte offsets, voxel
// counts) surface as JS numbers via Number(BigInt); all real values are far
// below 2^53. The 64-bit checksum and root-tile keys stay as bigint.

import { fma, matMult, type Coord, type CoordBBox, type Vec3, type Vec3dBBox } from './math/Math.ts'

export const NANOVDB_MAJOR_VERSION_NUMBER = 32
export const NANOVDB_MINOR_VERSION_NUMBER = 9
export const NANOVDB_PATCH_VERSION_NUMBER = 1

export const NANOVDB_DATA_ALIGNMENT = 32

// "NanoVDB0", "NanoVDB1", "NanoVDB2" in little-endian hex
export const NANOVDB_MAGIC_NUMB = 0x304244566f6e614en
export const NANOVDB_MAGIC_GRID = 0x314244566f6e614en
export const NANOVDB_MAGIC_FILE = 0x324244566f6e614en
export const NANOVDB_MAGIC_MASK = 0x00ffffffffffffffn

export enum GridType {
  Unknown = 0,
  Float = 1,
  Double = 2,
  Int16 = 3,
  Int32 = 4,
  Int64 = 5,
  Vec3f = 6,
  Vec3d = 7,
  Mask = 8,
  Half = 9,
  UInt32 = 10,
  Boolean = 11,
  RGBA8 = 12,
  Fp4 = 13,
  Fp8 = 14,
  Fp16 = 15,
  FpN = 16,
  Vec4f = 17,
  Vec4d = 18,
  Index = 19,
  OnIndex = 20,
  PointIndex = 23,
  Vec3u8 = 24,
  Vec3u16 = 25,
  UInt8 = 26,
  End = 27,
}

export enum GridClass {
  Unknown = 0,
  LevelSet = 1,
  FogVolume = 2,
  Staggered = 3,
  PointIndex = 4,
  PointData = 5,
  Topology = 6,
  VoxelVolume = 7,
  IndexGrid = 8,
  TensorGrid = 9,
  End = 10,
}

export enum GridFlags {
  HasLongGridName = 1 << 0,
  HasBBox = 1 << 1,
  HasMinMax = 1 << 2,
  HasAverage = 1 << 3,
  HasStdDeviation = 1 << 4,
  IsBreadthFirst = 1 << 5,
  End = 1 << 6,
}

export enum GridBlindDataClass {
  Unknown = 0,
  IndexArray = 1,
  AttributeArray = 2,
  GridName = 3,
  ChannelArray = 4,
  End = 5,
}

/** Upstream nanovdb::Version: major << 21 | minor << 10 | patch, in 32 bits. */
export class Version {
  readonly data: number

  /** Either the raw 32-bit id, or (major, minor, patch); no arguments gives the library version (as upstream). */
  constructor(dataOrMajor?: number, minor?: number, patch?: number) {
    if (dataOrMajor === undefined) {
      this.data =
        (NANOVDB_MAJOR_VERSION_NUMBER << 21) | (NANOVDB_MINOR_VERSION_NUMBER << 10) | NANOVDB_PATCH_VERSION_NUMBER
    } else if (minor === undefined) {
      this.data = dataOrMajor >>> 0
    } else {
      this.data = ((dataOrMajor << 21) | (minor << 10) | (patch ?? 0)) >>> 0
    }
  }

  /** TS translation of upstream's ==/<<=/>/>= operator set: negative, zero or positive like Array.sort comparators. */
  compareTo(other: Version): number {
    return this.data - other.data
  }
  getMajor(): number {
    return (this.data >>> 21) & ((1 << 11) - 1)
  }
  getMinor(): number {
    return (this.data >>> 10) & ((1 << 11) - 1)
  }
  getPatch(): number {
    return this.data & ((1 << 10) - 1)
  }
  isCompatible(): boolean {
    return this.getMajor() === NANOVDB_MAJOR_VERSION_NUMBER
  }
  toString(): string {
    return `${this.getMajor()}.${this.getMinor()}.${this.getPatch()}`
  }
}

// ---------------------------------------------------------------------------
// Tree configuration (the fixed 5-4-3 NanoVDB tree)
//   leaf:  8^3 voxels   (LOG2DIM 3, TOTAL 3)
//   lower: 16^3 children (LOG2DIM 4, TOTAL 7)
//   upper: 32^3 children (LOG2DIM 5, TOTAL 12)
// ---------------------------------------------------------------------------

const LEAF_LOG2DIM = 3
const LEAF_TOTAL = 3
const LEAF_MASK = (1 << LEAF_TOTAL) - 1 // 7
const LOWER_LOG2DIM = 4
const LOWER_TOTAL = 7
const LOWER_MASK = (1 << LOWER_TOTAL) - 1 // 127
const UPPER_LOG2DIM = 5
const UPPER_TOTAL = 12
const UPPER_MASK = (1 << UPPER_TOTAL) - 1 // 4095

const LEAF_SIZE = 1 << (3 * LEAF_LOG2DIM) // 512
const LOWER_SIZE = 1 << (3 * LOWER_LOG2DIM) // 4096
const UPPER_SIZE = 1 << (3 * UPPER_LOG2DIM) // 32768

/** Per-value-type byte layout, from testdata/fixtures/layout.json. */
export interface GridLayout {
  rootSize: number
  rootBackground: number
  rootMinimum: number
  rootMaximum: number
  rootTileSize: number
  rootTileKey: number
  rootTileChild: number
  rootTileState: number
  rootTileValue: number
  upperSize: number
  upperValueMask: number
  upperChildMask: number
  upperMinimum: number
  upperTable: number
  upperTileSize: number
  lowerSize: number
  lowerValueMask: number
  lowerChildMask: number
  lowerMinimum: number
  lowerTable: number
  lowerTileSize: number
  leafSize: number
  leafBBoxMin: number
  leafFlags: number
  leafValueMask: number
  leafMinimum: number
  leafValues: number
}

export interface ValueTraits<V> {
  /** byte size of one value in leaf arrays and tile tables */
  valueSize: number
  layout: GridLayout
  read(dv: DataView, byteOffset: number): V
}

export const FLOAT_LAYOUT: GridLayout = {
  rootSize: 64,
  rootBackground: 28,
  rootMinimum: 32,
  rootMaximum: 36,
  rootTileSize: 32,
  rootTileKey: 0,
  rootTileChild: 8,
  rootTileState: 16,
  rootTileValue: 20,
  upperSize: 270400,
  upperValueMask: 32,
  upperChildMask: 4128,
  upperMinimum: 8224,
  upperTable: 8256,
  upperTileSize: 8,
  lowerSize: 33856,
  lowerValueMask: 32,
  lowerChildMask: 544,
  lowerMinimum: 1056,
  lowerTable: 1088,
  lowerTileSize: 8,
  leafSize: 2144,
  leafBBoxMin: 0,
  leafFlags: 15,
  leafValueMask: 16,
  leafMinimum: 80,
  leafValues: 96,
}

export const VEC3F_LAYOUT: GridLayout = {
  rootSize: 96,
  rootBackground: 28,
  rootMinimum: 40,
  rootMaximum: 52,
  rootTileSize: 32,
  rootTileKey: 0,
  rootTileChild: 8,
  rootTileState: 16,
  rootTileValue: 20,
  upperSize: 532544,
  upperValueMask: 32,
  upperChildMask: 4128,
  upperMinimum: 8224,
  upperTable: 8256,
  upperTileSize: 16,
  lowerSize: 66624,
  lowerValueMask: 32,
  lowerChildMask: 544,
  lowerMinimum: 1056,
  lowerTable: 1088,
  lowerTileSize: 16,
  leafSize: 6272,
  leafBBoxMin: 0,
  leafFlags: 15,
  leafValueMask: 16,
  leafMinimum: 80,
  leafValues: 128,
}

export const floatTraits: ValueTraits<number> = {
  valueSize: 4,
  layout: FLOAT_LAYOUT,
  read: (dv, off) => dv.getFloat32(off, true),
}

export const vec3fTraits: ValueTraits<Vec3> = {
  valueSize: 12,
  layout: VEC3F_LAYOUT,
  read: (dv, off) => [dv.getFloat32(off, true), dv.getFloat32(off + 4, true), dv.getFloat32(off + 8, true)],
}

export function traitsForGridType(gridType: GridType): ValueTraits<number> | ValueTraits<Vec3> {
  switch (gridType) {
    case GridType.Float:
      return floatTraits
    case GridType.Vec3f:
      return vec3fTraits
    default:
      throw new Error(`unsupported GridType ${GridType[gridType] ?? gridType} (V1 supports Float and Vec3f)`)
  }
}

// ---------------------------------------------------------------------------
// GridData / TreeData byte offsets (sizeof(GridData) == 672, TreeData == 64)
// ---------------------------------------------------------------------------

export const GRID_DATA_SIZE = 672
const GRID_MAGIC = 0
const GRID_CHECKSUM = 8
const GRID_VERSION = 16
const GRID_FLAGS = 20
const GRID_INDEX = 24
const GRID_COUNT = 28
const GRID_SIZE = 32
const GRID_NAME = 40
export const GRID_MAX_NAME_SIZE = 256
const GRID_MAP = 296
const GRID_WORLD_BBOX = 560
const GRID_VOXEL_SIZE = 608
const GRID_CLASS = 632
const GRID_TYPE = 636
const GRID_BLIND_METADATA_OFFSET = 640
const GRID_BLIND_METADATA_COUNT = 648

export const TREE_DATA_SIZE = 64
const TREE_NODE_OFFSET = 0 // int64[4]: leaf, lower, upper, root
const TREE_NODE_COUNT = 32 // uint32[3]
const TREE_TILE_COUNT = 44 // uint32[3]
const TREE_VOXEL_COUNT = 56 // uint64

const MAP_MAT_D = 88 // double[9], relative to Map start
const MAP_INV_MAT_D = 160 // double[9]
const MAP_VEC_D = 232 // double[3]
const MAP_TAPER_D = 256 // double

const BLIND_METADATA_SIZE = 288
const BLIND_DATA_OFFSET = 0 // int64
const BLIND_DATA_CLASS = 28 // uint32
const BLIND_NAME = 32 // char[256]

const textDecoder = new TextDecoder()

function readCString(dv: DataView, byteOffset: number, maxLen: number): string {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset + byteOffset, maxLen)
  let end = bytes.indexOf(0)
  if (end < 0) end = maxLen
  return textDecoder.decode(bytes.subarray(0, end))
}

function readCoord(dv: DataView, off: number): Coord {
  return [dv.getInt32(off, true), dv.getInt32(off + 4, true), dv.getInt32(off + 8, true)]
}

function readVec3d(dv: DataView, off: number): Vec3 {
  return [dv.getFloat64(off, true), dv.getFloat64(off + 8, true), dv.getFloat64(off + 16, true)]
}

function readDoubles(dv: DataView, off: number, n: number): number[] {
  const out = new Array<number>(n)
  for (let i = 0; i < n; ++i) out[i] = dv.getFloat64(off + 8 * i, true)
  return out
}

function readI64(dv: DataView, off: number): number {
  return Number(dv.getBigInt64(off, true))
}

function readU64(dv: DataView, off: number): number {
  return Number(dv.getBigUint64(off, true))
}

// ---------------------------------------------------------------------------
// Map (upstream nanovdb::Map, 264 bytes): affine index <-> world transform.
// Only the double-precision members are exposed; upstream's float members
// (applyMapF etc.) exist for GPU paths and can be added when V3 needs them.
// ---------------------------------------------------------------------------

export class NanoMap {
  constructor(
    private readonly dv: DataView,
    private readonly byteOffset: number,
  ) {}

  get matD(): number[] {
    return readDoubles(this.dv, this.byteOffset + MAP_MAT_D, 9)
  }
  get invMatD(): number[] {
    return readDoubles(this.dv, this.byteOffset + MAP_INV_MAT_D, 9)
  }
  get vecD(): Vec3 {
    return readVec3d(this.dv, this.byteOffset + MAP_VEC_D)
  }
  get taperD(): number {
    return this.dv.getFloat64(this.byteOffset + MAP_TAPER_D, true)
  }

  /** index -> world: mat * xyz + vec (upstream Map::applyMap) */
  applyMap(xyz: Vec3): Vec3 {
    return matMult(this.matD, this.vecD, xyz)
  }

  /** world -> index: invMat * (xyz - vec) (upstream Map::applyInverseMap) */
  applyInverseMap(xyz: Vec3): Vec3 {
    const vec = this.vecD
    return matMult(this.invMatD, [0, 0, 0], [xyz[0] - vec[0], xyz[1] - vec[1], xyz[2] - vec[2]])
  }

  getVoxelSize(): Vec3 {
    const a = this.applyMap([0, 0, 0])
    const b = this.applyMap([1, 1, 1])
    return [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]
  }
}

// ---------------------------------------------------------------------------
// Mask<LOG2DIM> bit ops over the buffer (upstream nanovdb::Mask)
// ---------------------------------------------------------------------------

function maskIsOn(dv: DataView, maskOffset: number, n: number): boolean {
  // word n>>5 of uint32 view; upstream uses uint64 words, but bit positions
  // are identical in little-endian 32-bit halves.
  const word = dv.getUint32(maskOffset + ((n >>> 5) << 2), true)
  return (word & (1 << (n & 31))) !== 0
}

function* maskOnIndices(dv: DataView, maskOffset: number, bitCount: number): Generator<number> {
  const words = bitCount >>> 5
  for (let w = 0; w < words; ++w) {
    let word = dv.getUint32(maskOffset + (w << 2), true)
    while (word !== 0) {
      const b = 31 - Math.clz32(word & -word) // index of lowest set bit
      yield (w << 5) | b
      word &= word - 1 // clear lowest set bit
    }
  }
}

/** Read-only view of an upstream nanovdb::Mask<LOG2DIM> bit mask. */
export class NanoMask {
  /** number of bits in the mask: 8^LOG2DIM */
  readonly bitCount: number

  constructor(
    readonly dv: DataView,
    readonly byteOffset: number,
    readonly log2dim: number,
  ) {
    this.bitCount = 1 << (3 * log2dim)
  }

  /** number of 64-bit machine words (upstream Mask::wordCount) */
  wordCount(): number {
    return this.bitCount >>> 6
  }

  /** 64-bit word i (upstream Mask::words()[i]) */
  word(i: number): bigint {
    return this.dv.getBigUint64(this.byteOffset + (i << 3), true)
  }

  isOn(n: number): boolean {
    return maskIsOn(this.dv, this.byteOffset, n)
  }

  isOff(n: number): boolean {
    return !this.isOn(n)
  }

  /** total number of set bits (upstream Mask::countOn) */
  countOn(): number {
    let sum = 0
    const words = this.bitCount >>> 5
    for (let w = 0; w < words; ++w) {
      let word = this.dv.getUint32(this.byteOffset + (w << 2), true)
      word = word - ((word >>> 1) & 0x55555555)
      word = (word & 0x33333333) + ((word >>> 2) & 0x33333333)
      sum += (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
    }
    return sum
  }

  /** indices of set bits, ascending (upstream Mask::Iterator<true>) */
  beginOn(): Generator<number> {
    return maskOnIndices(this.dv, this.byteOffset, this.bitCount)
  }
}

// ---------------------------------------------------------------------------
// Node coordinate math (upstream CoordToOffset / CoordToKey)
// ---------------------------------------------------------------------------

export function leafCoordToOffset(ijk: Coord): number {
  return ((ijk[0] & LEAF_MASK) << (2 * LEAF_LOG2DIM)) | ((ijk[1] & LEAF_MASK) << LEAF_LOG2DIM) | (ijk[2] & LEAF_MASK)
}

export function lowerCoordToOffset(ijk: Coord): number {
  return (
    (((ijk[0] & LOWER_MASK) >> LEAF_TOTAL) << (2 * LOWER_LOG2DIM)) |
    (((ijk[1] & LOWER_MASK) >> LEAF_TOTAL) << LOWER_LOG2DIM) |
    ((ijk[2] & LOWER_MASK) >> LEAF_TOTAL)
  )
}

export function upperCoordToOffset(ijk: Coord): number {
  return (
    (((ijk[0] & UPPER_MASK) >> LOWER_TOTAL) << (2 * UPPER_LOG2DIM)) |
    (((ijk[1] & UPPER_MASK) >> LOWER_TOTAL) << UPPER_LOG2DIM) |
    ((ijk[2] & UPPER_MASK) >> LOWER_TOTAL)
  )
}

/**
 * Root key (NANOVDB_USE_SINGLE_ROOT_KEY): 21 bits each of (x,y,z) >> 12
 * packed as `x << 42 | y << 21 | z`, with the coordinates first reinterpreted
 * as unsigned 32-bit. Returned as bigint to match the on-disk uint64.
 */
export function coordToKey(ijk: Coord): bigint {
  const x = BigInt((ijk[0] >>> 0) >>> UPPER_TOTAL)
  const y = BigInt((ijk[1] >>> 0) >>> UPPER_TOTAL)
  const z = BigInt((ijk[2] >>> 0) >>> UPPER_TOTAL)
  return (x << 42n) | (y << 21n) | z
}

// ---------------------------------------------------------------------------
// Nodes. Each class is a lightweight view: (DataView over the handle buffer,
// absolute byte offset of the node struct). Mirrors upstream class names.
// ---------------------------------------------------------------------------

export class LeafNode<V> {
  constructor(
    readonly dv: DataView,
    readonly byteOffset: number,
    readonly traits: ValueTraits<V>,
  ) {}

  static readonly LOG2DIM = LEAF_LOG2DIM
  static readonly TOTAL = LEAF_TOTAL
  static readonly DIM = 1 << LEAF_TOTAL
  static readonly SIZE = LEAF_SIZE

  origin(): Coord {
    const o = readCoord(this.dv, this.byteOffset + this.traits.layout.leafBBoxMin)
    return [o[0] & ~LEAF_MASK, o[1] & ~LEAF_MASK, o[2] & ~LEAF_MASK]
  }

  /** bbox of active values in this node (requires HasBBox; upstream LeafNode::bbox) */
  bbox(): CoordBBox {
    const L = this.traits.layout
    const min = readCoord(this.dv, this.byteOffset + L.leafBBoxMin)
    const off = this.byteOffset + L.leafBBoxMin + 12
    return {
      min,
      max: [min[0] + this.dv.getUint8(off), min[1] + this.dv.getUint8(off + 1), min[2] + this.dv.getUint8(off + 2)],
    }
  }

  flags(): number {
    return this.dv.getUint8(this.byteOffset + this.traits.layout.leafFlags)
  }

  getValue(ijk: Coord): V {
    return this.getValueAt(leafCoordToOffset(ijk))
  }

  getValueAt(n: number): V {
    const L = this.traits.layout
    return this.traits.read(this.dv, this.byteOffset + L.leafValues + n * this.traits.valueSize)
  }

  isActive(ijk: Coord): boolean {
    return this.isActiveAt(leafCoordToOffset(ijk))
  }

  isActiveAt(n: number): boolean {
    return maskIsOn(this.dv, this.byteOffset + this.traits.layout.leafValueMask, n)
  }

  valueMask(): NanoMask {
    return new NanoMask(this.dv, this.byteOffset + this.traits.layout.leafValueMask, LEAF_LOG2DIM)
  }

  minimum(): V {
    const L = this.traits.layout
    return this.traits.read(this.dv, this.byteOffset + L.leafMinimum)
  }

  maximum(): V {
    const L = this.traits.layout
    return this.traits.read(this.dv, this.byteOffset + L.leafMinimum + this.traits.valueSize)
  }

  /** Iterate active voxels of this leaf (upstream LeafNode::ValueOnIterator). */
  *beginValueOn(): Generator<{ ijk: Coord; value: V }> {
    const origin = this.origin()
    const L = this.traits.layout
    for (const n of maskOnIndices(this.dv, this.byteOffset + L.leafValueMask, LEAF_SIZE)) {
      const ijk: Coord = [
        origin[0] + (n >>> (2 * LEAF_LOG2DIM)),
        origin[1] + ((n >>> LEAF_LOG2DIM) & LEAF_MASK),
        origin[2] + (n & LEAF_MASK),
      ]
      yield { ijk, value: this.getValueAt(n) }
    }
  }
}

abstract class InternalNode<V> {
  constructor(
    readonly dv: DataView,
    readonly byteOffset: number,
    readonly traits: ValueTraits<V>,
  ) {}

  protected abstract get size(): number
  protected abstract get log2dim(): number
  protected abstract get childTotal(): number
  protected abstract valueMaskOffset(): number
  protected abstract childMaskOffset(): number
  protected abstract tableOffset(): number
  protected abstract tileSize(): number
  protected abstract coordToOffset(ijk: Coord): number
  protected abstract makeChild(byteOffset: number): LeafNode<V> | InternalNode<V>

  bbox(): CoordBBox {
    return { min: readCoord(this.dv, this.byteOffset), max: readCoord(this.dv, this.byteOffset + 12) }
  }

  isChild(n: number): boolean {
    return maskIsOn(this.dv, this.byteOffset + this.childMaskOffset(), n)
  }

  valueMask(): NanoMask {
    return new NanoMask(this.dv, this.byteOffset + this.valueMaskOffset(), this.log2dim)
  }

  childMask(): NanoMask {
    return new NanoMask(this.dv, this.byteOffset + this.childMaskOffset(), this.log2dim)
  }

  minimum(): V {
    return this.traits.read(this.dv, this.byteOffset + this.minimumOffset())
  }

  maximum(): V {
    return this.traits.read(this.dv, this.byteOffset + this.minimumOffset() + this.traits.valueSize)
  }

  protected abstract minimumOffset(): number

  /** table entry as child node byte offset (relative to this node, upstream Tile::child) */
  childOffset(n: number): number {
    return readI64(this.dv, this.byteOffset + this.tableOffset() + n * this.tileSize())
  }

  tileValue(n: number): V {
    return this.traits.read(this.dv, this.byteOffset + this.tableOffset() + n * this.tileSize())
  }

  getValue(ijk: Coord): V {
    const n = this.coordToOffset(ijk)
    if (this.isChild(n)) return this.makeChild(this.byteOffset + this.childOffset(n)).getValue(ijk)
    return this.tileValue(n)
  }

  isActive(ijk: Coord): boolean {
    const n = this.coordToOffset(ijk)
    if (this.isChild(n)) return this.makeChild(this.byteOffset + this.childOffset(n)).isActive(ijk)
    return maskIsOn(this.dv, this.byteOffset + this.valueMaskOffset(), n)
  }

  origin(): Coord {
    const o = readCoord(this.dv, this.byteOffset)
    const mask = (1 << this.childTotal + this.log2dim) - 1
    return [o[0] & ~mask, o[1] & ~mask, o[2] & ~mask]
  }

  /** Iterate active tiles of this node (upstream InternalNode::ValueOnIterator). */
  *beginValueOn(): Generator<{ ijk: Coord; value: V; dim: number }> {
    const origin = this.origin()
    const log2 = this.log2dim
    const mask = (1 << log2) - 1
    const childDim = 1 << this.childTotal
    for (const n of maskOnIndices(this.dv, this.byteOffset + this.valueMaskOffset(), 1 << (3 * log2))) {
      const ijk: Coord = [
        origin[0] + ((n >>> (2 * log2)) << this.childTotal),
        origin[1] + (((n >>> log2) & mask) << this.childTotal),
        origin[2] + ((n & mask) << this.childTotal),
      ]
      yield { ijk, value: this.tileValue(n), dim: childDim }
    }
  }

  /** Iterate child nodes of this node (upstream InternalNode::ChildIterator). */
  *beginChild(): Generator<LeafNode<V> | InternalNode<V>> {
    for (const n of maskOnIndices(this.dv, this.byteOffset + this.childMaskOffset(), 1 << (3 * this.log2dim))) {
      yield this.makeChild(this.byteOffset + this.childOffset(n))
    }
  }
}

export class LowerInternalNode<V> extends InternalNode<V> {
  static readonly LOG2DIM = LOWER_LOG2DIM
  static readonly TOTAL = LOWER_TOTAL
  static readonly DIM = 1 << LOWER_TOTAL

  protected get size(): number {
    return this.traits.layout.lowerSize
  }
  protected get log2dim(): number {
    return LOWER_LOG2DIM
  }
  protected get childTotal(): number {
    return LEAF_TOTAL
  }
  protected valueMaskOffset(): number {
    return this.traits.layout.lowerValueMask
  }
  protected childMaskOffset(): number {
    return this.traits.layout.lowerChildMask
  }
  protected tableOffset(): number {
    return this.traits.layout.lowerTable
  }
  protected tileSize(): number {
    return this.traits.layout.lowerTileSize
  }
  protected minimumOffset(): number {
    return this.traits.layout.lowerMinimum
  }
  protected coordToOffset(ijk: Coord): number {
    return lowerCoordToOffset(ijk)
  }
  protected makeChild(byteOffset: number): LeafNode<V> {
    return new LeafNode(this.dv, byteOffset, this.traits)
  }
}

export class UpperInternalNode<V> extends InternalNode<V> {
  static readonly LOG2DIM = UPPER_LOG2DIM
  static readonly TOTAL = UPPER_TOTAL
  static readonly DIM = 1 << UPPER_TOTAL

  protected get size(): number {
    return this.traits.layout.upperSize
  }
  protected get log2dim(): number {
    return UPPER_LOG2DIM
  }
  protected get childTotal(): number {
    return LOWER_TOTAL
  }
  protected valueMaskOffset(): number {
    return this.traits.layout.upperValueMask
  }
  protected childMaskOffset(): number {
    return this.traits.layout.upperChildMask
  }
  protected tableOffset(): number {
    return this.traits.layout.upperTable
  }
  protected tileSize(): number {
    return this.traits.layout.upperTileSize
  }
  protected minimumOffset(): number {
    return this.traits.layout.upperMinimum
  }
  protected coordToOffset(ijk: Coord): number {
    return upperCoordToOffset(ijk)
  }
  protected makeChild(byteOffset: number): LowerInternalNode<V> {
    return new LowerInternalNode(this.dv, byteOffset, this.traits)
  }
}

export interface RootTile<V> {
  key: bigint
  /** byte offset of the child node relative to the root, 0 for value tiles */
  child: number
  state: boolean
  value: V
}

export class RootNode<V> {
  constructor(
    readonly dv: DataView,
    readonly byteOffset: number,
    readonly traits: ValueTraits<V>,
  ) {}

  static readonly LEVEL = 3

  bbox(): CoordBBox {
    return { min: readCoord(this.dv, this.byteOffset), max: readCoord(this.dv, this.byteOffset + 12) }
  }

  tableSize(): number {
    return this.dv.getUint32(this.byteOffset + 24, true)
  }

  background(): V {
    return this.traits.read(this.dv, this.byteOffset + this.traits.layout.rootBackground)
  }

  minimum(): V {
    return this.traits.read(this.dv, this.byteOffset + this.traits.layout.rootMinimum)
  }

  maximum(): V {
    return this.traits.read(this.dv, this.byteOffset + this.traits.layout.rootMaximum)
  }

  tile(n: number): RootTile<V> {
    const L = this.traits.layout
    const off = this.byteOffset + L.rootSize + n * L.rootTileSize
    return {
      key: this.dv.getBigUint64(off + L.rootTileKey, true),
      child: readI64(this.dv, off + L.rootTileChild),
      state: this.dv.getUint32(off + L.rootTileState, true) !== 0,
      value: this.traits.read(this.dv, off + L.rootTileValue),
    }
  }

  /** Linear scan for the tile containing ijk (upstream RootData::probeTile). */
  probeTile(ijk: Coord): RootTile<V> | null {
    const key = coordToKey(ijk)
    const L = this.traits.layout
    const n = this.tableSize()
    let off = this.byteOffset + L.rootSize
    for (let i = 0; i < n; ++i, off += L.rootTileSize) {
      if (this.dv.getBigUint64(off + L.rootTileKey, true) === key) return this.tile(i)
    }
    return null
  }

  getChild(tile: RootTile<V>): UpperInternalNode<V> {
    return new UpperInternalNode(this.dv, this.byteOffset + tile.child, this.traits)
  }

  getValue(ijk: Coord): V {
    const tile = this.probeTile(ijk)
    if (tile === null) return this.background()
    if (tile.child === 0) return tile.value
    return this.getChild(tile).getValue(ijk)
  }

  isActive(ijk: Coord): boolean {
    const tile = this.probeTile(ijk)
    if (tile === null) return false
    if (tile.child === 0) return tile.state
    return this.getChild(tile).isActive(ijk)
  }

  /** true if ijk is active and sets the value (upstream probeValue). */
  probeValue(ijk: Coord): { value: V; active: boolean } {
    const tile = this.probeTile(ijk)
    if (tile === null) return { value: this.background(), active: false }
    if (tile.child === 0) return { value: tile.value, active: tile.state }
    const child = this.getChild(tile)
    return { value: child.getValue(ijk), active: child.isActive(ijk) }
  }

  /** Iterate active value tiles at the root level (upstream RootNode::ValueOnIterator). */
  *beginValueOn(): Generator<{ ijk: Coord; value: V; dim: number }> {
    const n = this.tableSize()
    for (let i = 0; i < n; ++i) {
      const tile = this.tile(i)
      if (tile.child !== 0 || !tile.state) continue
      // KeyToCoord: 21-bit components << 12, reinterpreted as int32 (the
      // components were packed as uint32 >> 12, so `<< 12 | 0` restores sign)
      const key = tile.key
      yield {
        ijk: [
          (Number((key >> 42n) & 0x1fffffn) << UPPER_TOTAL) | 0,
          (Number((key >> 21n) & 0x1fffffn) << UPPER_TOTAL) | 0,
          (Number(key & 0x1fffffn) << UPPER_TOTAL) | 0,
        ],
        value: tile.value,
        dim: 1 << UPPER_TOTAL,
      }
    }
  }

  /** Iterate child (upper) nodes (upstream RootNode::ChildIterator). */
  *beginChild(): Generator<UpperInternalNode<V>> {
    const n = this.tableSize()
    for (let i = 0; i < n; ++i) {
      const tile = this.tile(i)
      if (tile.child !== 0) yield this.getChild(tile)
    }
  }
}

// ---------------------------------------------------------------------------
// Tree (upstream nanovdb::Tree, a thin wrapper around TreeData + RootNode)
// ---------------------------------------------------------------------------

export class Tree<V> {
  constructor(
    readonly dv: DataView,
    readonly byteOffset: number,
    readonly traits: ValueTraits<V>,
  ) {}

  root(): RootNode<V> {
    const rootOffset = readI64(this.dv, this.byteOffset + TREE_NODE_OFFSET + 24)
    return new RootNode(this.dv, this.byteOffset + rootOffset, this.traits)
  }

  /** number of nodes at level 0 (leaf), 1 (lower), 2 (upper) */
  nodeCount(level: 0 | 1 | 2): number {
    return this.dv.getUint32(this.byteOffset + TREE_NODE_COUNT + 4 * level, true)
  }

  /** number of active tiles at level 1 (lower), 2 (upper), 3 (root) — upstream is 1-indexed */
  activeTileCount(level: 1 | 2 | 3): number {
    return this.dv.getUint32(this.byteOffset + TREE_TILE_COUNT + 4 * (level - 1), true)
  }

  activeVoxelCount(): number {
    return readU64(this.dv, this.byteOffset + TREE_VOXEL_COUNT)
  }

  bbox(): CoordBBox {
    return this.root().bbox()
  }

  background(): V {
    return this.root().background()
  }

  getValue(ijk: Coord): V {
    return this.root().getValue(ijk)
  }

  isActive(ijk: Coord): boolean {
    return this.root().isActive(ijk)
  }

  /**
   * First node at a level, or null if none (upstream Tree::getFirstNode).
   * Nodes of one level are contiguous; node i lives at
   * `first.byteOffset + i * sizeof(NodeData)` (breadth-first layout).
   */
  getFirstNode(level: 0): LeafNode<V> | null
  getFirstNode(level: 1): LowerInternalNode<V> | null
  getFirstNode(level: 2): UpperInternalNode<V> | null
  getFirstNode(level: 0 | 1 | 2): LeafNode<V> | LowerInternalNode<V> | UpperInternalNode<V> | null {
    const off = readI64(this.dv, this.byteOffset + TREE_NODE_OFFSET + 8 * level)
    if (off === 0 || this.nodeCount(level) === 0) return null
    const abs = this.byteOffset + off
    if (level === 0) return new LeafNode(this.dv, abs, this.traits)
    if (level === 1) return new LowerInternalNode(this.dv, abs, this.traits)
    return new UpperInternalNode(this.dv, abs, this.traits)
  }

  /** Iterate all leaf nodes via the contiguous breadth-first layout. */
  *leafNodes(): Generator<LeafNode<V>> {
    const first = this.getFirstNode(0)
    if (!first) return
    const count = this.nodeCount(0)
    const size = this.traits.layout.leafSize
    for (let i = 0; i < count; ++i) {
      yield new LeafNode(this.dv, first.byteOffset + i * size, this.traits)
    }
  }
}

// ---------------------------------------------------------------------------
// ReadAccessor (upstream nanovdb::ReadAccessor<BuildT, 0, 1, 2>): caches the
// node visited by the last lookup at each level for locality-friendly reads.
// ---------------------------------------------------------------------------

export class ReadAccessor<V> {
  private keys: [Coord, Coord, Coord] = [
    [0x7fffffff, 0, 0],
    [0x7fffffff, 0, 0],
    [0x7fffffff, 0, 0],
  ]
  private nodes: [LeafNode<V> | null, LowerInternalNode<V> | null, UpperInternalNode<V> | null] = [null, null, null]

  constructor(readonly rootNode: RootNode<V>) {}

  private isCached(level: 0 | 1 | 2, ijk: Coord): boolean {
    const key = this.keys[level]
    const mask = level === 0 ? ~LEAF_MASK : level === 1 ? ~LOWER_MASK : ~UPPER_MASK
    return (ijk[0] & mask) === key[0] && (ijk[1] & mask) === key[1] && (ijk[2] & mask) === key[2]
  }

  private insert(level: 0 | 1 | 2, ijk: Coord, node: LeafNode<V> | LowerInternalNode<V> | UpperInternalNode<V>): void {
    const mask = level === 0 ? ~LEAF_MASK : level === 1 ? ~LOWER_MASK : ~UPPER_MASK
    this.keys[level] = [ijk[0] & mask, ijk[1] & mask, ijk[2] & mask]
    this.nodes[level] = node as never
  }

  getValue(ijk: Coord): V {
    if (this.isCached(0, ijk)) return this.nodes[0]!.getValue(ijk)
    if (this.isCached(1, ijk)) return this.lowerValue(this.nodes[1]!, ijk)
    if (this.isCached(2, ijk)) return this.upperValue(this.nodes[2]!, ijk)
    const tile = this.rootNode.probeTile(ijk)
    if (tile === null) return this.rootNode.background()
    if (tile.child === 0) return tile.value
    const upper = this.rootNode.getChild(tile)
    this.insert(2, ijk, upper)
    return this.upperValue(upper, ijk)
  }

  isActive(ijk: Coord): boolean {
    if (this.isCached(0, ijk)) return this.nodes[0]!.isActive(ijk)
    // fall through the tree, caching on the way down
    const tile = this.rootNode.probeTile(ijk)
    if (tile === null) return false
    if (tile.child === 0) return tile.state
    const upper = this.rootNode.getChild(tile)
    this.insert(2, ijk, upper)
    const un = upperCoordToOffset(ijk)
    if (!upper.isChild(un)) return maskIsOn(upper.dv, upper.byteOffset + upper.traits.layout.upperValueMask, un)
    const lower = new LowerInternalNode(upper.dv, upper.byteOffset + upper.childOffset(un), upper.traits)
    this.insert(1, ijk, lower)
    const ln = lowerCoordToOffset(ijk)
    if (!lower.isChild(ln)) return maskIsOn(lower.dv, lower.byteOffset + lower.traits.layout.lowerValueMask, ln)
    const leaf = new LeafNode(lower.dv, lower.byteOffset + lower.childOffset(ln), lower.traits)
    this.insert(0, ijk, leaf)
    return leaf.isActive(ijk)
  }

  /**
   * Size (in voxels) of the node/tile containing ijk (upstream
   * ReadAccessor::getDim -> getDimAndCache): 4096 for root tiles or
   * background, 128/8 for internal tiles, and for voxels the leaf's
   * skip-render flag decides between 8 and 1.
   */
  getDim(ijk: Coord): number {
    const tile = this.rootNode.probeTile(ijk)
    if (tile === null || tile.child === 0) return 4096 // background or root tile
    const upper = this.rootNode.getChild(tile)
    this.insert(2, ijk, upper)
    if ((upper.dv.getUint32(upper.byteOffset + 24, true) & 1) !== 0) return 4096 // skip-node flag
    const un = upperCoordToOffset(ijk)
    if (!upper.isChild(un)) return 128
    const lower = new LowerInternalNode(upper.dv, upper.byteOffset + upper.childOffset(un), upper.traits)
    this.insert(1, ijk, lower)
    if ((lower.dv.getUint32(lower.byteOffset + 24, true) & 1) !== 0) return 128
    const ln = lowerCoordToOffset(ijk)
    if (!lower.isChild(ln)) return 8
    const leaf = new LeafNode(lower.dv, lower.byteOffset + lower.childOffset(ln), lower.traits)
    this.insert(0, ijk, leaf)
    return (leaf.flags() & 1) !== 0 ? 8 : 1
  }

  private upperValue(upper: UpperInternalNode<V>, ijk: Coord): V {
    const n = upperCoordToOffset(ijk)
    if (!upper.isChild(n)) return upper.tileValue(n)
    const lower = new LowerInternalNode(upper.dv, upper.byteOffset + upper.childOffset(n), upper.traits)
    this.insert(1, ijk, lower)
    return this.lowerValue(lower, ijk)
  }

  private lowerValue(lower: LowerInternalNode<V>, ijk: Coord): V {
    const n = lowerCoordToOffset(ijk)
    if (!lower.isChild(n)) return lower.tileValue(n)
    const leaf = new LeafNode(lower.dv, lower.byteOffset + lower.childOffset(n), lower.traits)
    this.insert(0, ijk, leaf)
    return leaf.getValue(ijk)
  }
}

// ---------------------------------------------------------------------------
// Grid (upstream nanovdb::Grid / GridData)
// ---------------------------------------------------------------------------

export class NanoGrid<V> {
  readonly dv: DataView

  constructor(
    buffer: ArrayBuffer,
    readonly byteOffset: number,
    readonly traits: ValueTraits<V>,
  ) {
    this.dv = new DataView(buffer)
  }

  magic(): bigint {
    return this.dv.getBigUint64(this.byteOffset + GRID_MAGIC, true)
  }

  checksum(): bigint {
    return this.dv.getBigUint64(this.byteOffset + GRID_CHECKSUM, true)
  }

  version(): Version {
    return new Version(this.dv.getUint32(this.byteOffset + GRID_VERSION, true))
  }

  flags(): number {
    return this.dv.getUint32(this.byteOffset + GRID_FLAGS, true)
  }

  gridIndex(): number {
    return this.dv.getUint32(this.byteOffset + GRID_INDEX, true)
  }

  gridCount(): number {
    return this.dv.getUint32(this.byteOffset + GRID_COUNT, true)
  }

  gridSize(): number {
    return readU64(this.dv, this.byteOffset + GRID_SIZE)
  }

  gridName(): string {
    if ((this.flags() & GridFlags.HasLongGridName) !== 0) {
      const count = this.blindMetadataCount()
      for (let i = 0; i < count; ++i) {
        const meta = this.byteOffset + this.blindMetadataOffset() + i * BLIND_METADATA_SIZE
        if (this.dv.getUint32(meta + BLIND_DATA_CLASS, true) === GridBlindDataClass.GridName) {
          const dataOffset = readI64(this.dv, meta + BLIND_DATA_OFFSET)
          // long names are NUL-terminated; valueCount bounds the read
          const valueCount = readU64(this.dv, meta + 8)
          return readCString(this.dv, meta + dataOffset, valueCount)
        }
      }
      throw new Error('HasLongGridName is set but no GridName blind data found')
    }
    return readCString(this.dv, this.byteOffset + GRID_NAME, GRID_MAX_NAME_SIZE)
  }

  map(): NanoMap {
    return new NanoMap(this.dv, this.byteOffset + GRID_MAP)
  }

  worldBBox(): Vec3dBBox {
    return {
      min: readVec3d(this.dv, this.byteOffset + GRID_WORLD_BBOX),
      max: readVec3d(this.dv, this.byteOffset + GRID_WORLD_BBOX + 24),
    }
  }

  indexBBox(): CoordBBox {
    return this.tree().bbox()
  }

  voxelSize(): Vec3 {
    return readVec3d(this.dv, this.byteOffset + GRID_VOXEL_SIZE)
  }

  gridClass(): GridClass {
    return this.dv.getUint32(this.byteOffset + GRID_CLASS, true)
  }

  gridType(): GridType {
    return this.dv.getUint32(this.byteOffset + GRID_TYPE, true)
  }

  blindMetadataOffset(): number {
    return readI64(this.dv, this.byteOffset + GRID_BLIND_METADATA_OFFSET)
  }

  blindMetadataCount(): number {
    return this.dv.getUint32(this.byteOffset + GRID_BLIND_METADATA_COUNT, true)
  }

  isLevelSet(): boolean {
    return this.gridClass() === GridClass.LevelSet
  }

  isFogVolume(): boolean {
    return this.gridClass() === GridClass.FogVolume
  }

  isStaggered(): boolean {
    return this.gridClass() === GridClass.Staggered
  }

  tree(): Tree<V> {
    return new Tree(this.dv, this.byteOffset + GRID_DATA_SIZE, this.traits)
  }

  activeVoxelCount(): number {
    return this.tree().activeVoxelCount()
  }

  getAccessor(): ReadAccessor<V> {
    return new ReadAccessor(this.tree().root())
  }

  /** index -> world transform of a position (upstream Grid::indexToWorld) */
  indexToWorld(xyz: Vec3): Vec3 {
    return this.map().applyMap(xyz)
  }

  /** world -> index transform of a position (upstream Grid::worldToIndex) */
  worldToIndex(xyz: Vec3): Vec3 {
    return this.map().applyInverseMap(xyz)
  }

  isValid(): boolean {
    const magic = this.magic()
    if (magic === NANOVDB_MAGIC_GRID) return true
    const data2 = this.dv.getBigUint64(this.byteOffset + 664, true)
    if (data2 === NANOVDB_MAGIC_GRID) return true
    if (magic !== NANOVDB_MAGIC_NUMB) return false
    return (
      this.version().isCompatible() &&
      this.gridCount() > 0 &&
      this.gridIndex() < this.gridCount() &&
      this.gridClass() < GridClass.End &&
      this.gridType() < GridType.End
    )
  }
}

export type { Coord, CoordBBox, Vec3, Vec3dBBox }
