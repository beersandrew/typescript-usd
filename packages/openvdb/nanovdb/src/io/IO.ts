// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/io/IO.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/io/IO.h: .nvdb file parsing. A file is a sequence of
// segments, each: FileHeader (16B) + per-grid [FileMetaData (176B) + grid
// name] + the grid buffers (each individually compressed when the segment
// codec is ZIP/BLOSC).
//
// DIVERGENCE from upstream: readGrids/readGrid are async because the ZIP
// codec decompresses through the platform's DecompressionStream. BLOSC is
// not implemented (documented gap — nanovdb_convert's -b output; the
// sample corpus covers NONE and ZIP).

import { GridHandle } from '../GridHandle.ts'
import {
  GridClass,
  GridType,
  NANOVDB_MAGIC_FILE,
  NANOVDB_MAGIC_GRID,
  NANOVDB_MAGIC_NUMB,
  Version,
} from '../NanoVDB.ts'
import type { Coord, CoordBBox, Vec3, Vec3dBBox } from '../math/Math.ts'

export enum Codec {
  NONE = 0,
  ZIP = 1,
  BLOSC = 2,
}

export interface FileHeader {
  magic: bigint
  version: Version
  gridCount: number
  codec: Codec
}

/** Upstream io::FileGridMetaData: FileMetaData (176B) + the grid name. */
export interface FileGridMetaData {
  gridSize: number
  fileSize: number
  nameKey: bigint
  voxelCount: number
  gridType: GridType
  gridClass: GridClass
  worldBBox: Vec3dBBox
  indexBBox: CoordBBox
  voxelSize: Vec3
  nodeCount: [number, number, number, number]
  tileCount: [number, number, number]
  codec: Codec
  blindDataCount: number
  version: Version
  gridName: string
}

export interface Segment {
  header: FileHeader
  meta: FileGridMetaData[]
  /** absolute byte offset of the first grid blob in the file */
  dataOffset: number
}

const FILE_HEADER_SIZE = 16
const FILE_META_DATA_SIZE = 176

const textDecoder = new TextDecoder()

function toU8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

function readFileHeader(dv: DataView, off: number): FileHeader {
  return {
    magic: dv.getBigUint64(off, true),
    version: new Version(dv.getUint32(off + 8, true)),
    gridCount: dv.getUint16(off + 12, true),
    codec: dv.getUint16(off + 14, true) as Codec,
  }
}

function readFileMetaData(dv: DataView, off: number, name: string): FileGridMetaData {
  const coord = (o: number): Coord => [dv.getInt32(o, true), dv.getInt32(o + 4, true), dv.getInt32(o + 8, true)]
  const vec3d = (o: number): Vec3 => [dv.getFloat64(o, true), dv.getFloat64(o + 8, true), dv.getFloat64(o + 16, true)]
  return {
    gridSize: Number(dv.getBigUint64(off, true)),
    fileSize: Number(dv.getBigUint64(off + 8, true)),
    nameKey: dv.getBigUint64(off + 16, true),
    voxelCount: Number(dv.getBigUint64(off + 24, true)),
    gridType: dv.getUint32(off + 32, true),
    gridClass: dv.getUint32(off + 36, true),
    worldBBox: { min: vec3d(off + 40), max: vec3d(off + 64) },
    indexBBox: { min: coord(off + 88), max: coord(off + 100) },
    voxelSize: vec3d(off + 112),
    nodeCount: [
      dv.getUint32(off + 140, true),
      dv.getUint32(off + 144, true),
      dv.getUint32(off + 148, true),
      dv.getUint32(off + 152, true),
    ],
    tileCount: [dv.getUint32(off + 156, true), dv.getUint32(off + 160, true), dv.getUint32(off + 164, true)],
    codec: dv.getUint16(off + 168, true) as Codec,
    blindDataCount: dv.getUint16(off + 170, true),
    version: new Version(dv.getUint32(off + 172, true)),
    gridName: name,
  }
}

/**
 * Parse a segment's header + metadata block starting at `off`.
 * Returns null at end of data (upstream Segment::read returning false).
 */
function readSegmentMeta(dv: DataView, bytes: Uint8Array, off: number): Segment | null {
  if (off + FILE_HEADER_SIZE > bytes.byteLength) return null
  const header = readFileHeader(dv, off)
  if (header.magic !== NANOVDB_MAGIC_FILE && header.magic !== NANOVDB_MAGIC_NUMB) {
    throw new Error(`invalid file magic at byte offset ${off}`)
  }
  if (!header.version.isCompatible()) {
    throw new Error(`incompatible file version ${header.version.toString()}`)
  }
  let pos = off + FILE_HEADER_SIZE
  const meta: FileGridMetaData[] = []
  for (let i = 0; i < header.gridCount; ++i) {
    const nameSize = dv.getUint32(pos + 136, true)
    const nameBytes = bytes.subarray(pos + FILE_META_DATA_SIZE, pos + FILE_META_DATA_SIZE + nameSize)
    let end = nameBytes.indexOf(0)
    if (end < 0) end = nameBytes.length
    meta.push(readFileMetaData(dv, pos, textDecoder.decode(nameBytes.subarray(0, end))))
    pos += FILE_META_DATA_SIZE + nameSize
  }
  return { header, meta, dataOffset: pos }
}

async function unzip(compressed: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  // upstream uses zlib compress()/uncompress(); 'deflate' is the matching
  // zlib-wrapped format in the web DecompressionStream
  const stream = new Blob([compressed as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))
  const out = new Uint8Array(await new Response(stream).arrayBuffer())
  if (out.byteLength !== expectedSize) {
    throw new Error(`UNZIP failed on byte size: got ${out.byteLength}, expected ${expectedSize}`)
  }
  return out
}

/** GridData::isValid() of the buffer head, for raw-vs-file detection. */
function isValidRawGrid(dv: DataView): boolean {
  const magic = dv.getBigUint64(0, true)
  if (magic === NANOVDB_MAGIC_GRID) return true
  if (dv.getBigUint64(664, true) === NANOVDB_MAGIC_GRID) return true // mData2, v32.6.0 grids
  if (magic !== NANOVDB_MAGIC_NUMB) return false
  const version = new Version(dv.getUint32(16, true))
  const gridIndex = dv.getUint32(24, true)
  const gridCount = dv.getUint32(28, true)
  return (
    version.isCompatible() &&
    gridCount > 0 &&
    gridIndex < gridCount &&
    dv.getUint32(632, true) < GridClass.End &&
    dv.getUint32(636, true) < GridType.End
  )
}

/** Set mGridIndex/mGridCount on a grid copied out of a multi-grid file (upstream tools::updateGridCount). */
function updateGridCount(dv: DataView, gridOffset: number, gridIndex: number, gridCount: number): void {
  dv.setUint32(gridOffset + 24, gridIndex, true)
  dv.setUint32(gridOffset + 28, gridCount, true)
}

/**
 * Read all grids from a .nvdb file buffer — one GridHandle per segment, the
 * segment's grids back-to-back in the handle's buffer (upstream io::readGrids).
 * Also accepts a raw grid buffer (a GridHandle dump without file framing).
 */
export async function readGrids(data: ArrayBuffer | Uint8Array): Promise<GridHandle[]> {
  const bytes = toU8(data)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // raw grid buffer? (upstream first tries GridHandle::read, which accepts
  // the buffer iff GridData::isValid(); NANOVDB_MAGIC_NUMB is shared by
  // pre-32.6 grids and FileHeaders, so isValid's version/class/type checks
  // are what disambiguate)
  if (bytes.byteLength >= 672 && isValidRawGrid(dv)) {
    return [new GridHandle(bytes.slice().buffer)]
  }

  const handles: GridHandle[] = []
  let off = 0
  for (;;) {
    const seg = readSegmentMeta(dv, bytes, off)
    if (seg === null) break
    const codec = seg.header.codec
    if (codec === Codec.BLOSC) {
      throw new Error('BLOSC codec is not supported (documented gap; use nanovdb_convert without -b)')
    }
    let bufferSize = 0
    for (const m of seg.meta) bufferSize += m.gridSize
    const buffer = new ArrayBuffer(bufferSize)
    const out = new Uint8Array(buffer)
    const outDv = new DataView(buffer)
    let pos = seg.dataOffset
    let outPos = 0
    for (let i = 0; i < seg.meta.length; ++i) {
      const m = seg.meta[i]!
      if (codec === Codec.ZIP) {
        const zipSize = Number(dv.getBigUint64(pos, true))
        out.set(await unzip(bytes.subarray(pos + 8, pos + 8 + zipSize), m.gridSize), outPos)
        pos += 8 + zipSize
      } else {
        out.set(bytes.subarray(pos, pos + m.gridSize), outPos)
        pos += m.gridSize
      }
      updateGridCount(outDv, outPos, i, seg.meta.length)
      outPos += m.gridSize
    }
    handles.push(new GridHandle(buffer))
    off = pos
  }
  if (handles.length === 0) throw new Error('no segments found in stream')
  return handles
}

/** Read the n'th grid of a .nvdb file buffer (upstream io::readGrid(fileName, n)). */
export async function readGrid(data: ArrayBuffer | Uint8Array, n = 0): Promise<GridHandle> {
  const handles = await readGrids(data)
  let counter = 0
  for (const h of handles) {
    for (let i = 0; i < h.gridCount(); ++i, ++counter) {
      if (counter !== n) continue
      if (handles.length === 1 && h.gridCount() === 1) return h
      const off = i === 0 ? 0 : sumGridSizes(h, i)
      const copy = h.buffer.slice(off, off + h.gridSize(i))
      updateGridCount(new DataView(copy), 0, 0, 1)
      return new GridHandle(copy)
    }
  }
  throw new Error(`stream does not contain a #${n} grid`)
}

function sumGridSizes(h: GridHandle, upTo: number): number {
  let sum = 0
  for (let i = 0; i < upTo; ++i) sum += h.gridSize(i)
  return sum
}

/** Read only the segment/grid metadata of a .nvdb file buffer (upstream io::readGridMetaData). */
export function readGridMetaData(data: ArrayBuffer | Uint8Array): FileGridMetaData[] {
  const bytes = toU8(data)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: FileGridMetaData[] = []
  let off = 0
  for (;;) {
    const seg = readSegmentMeta(dv, bytes, off)
    if (seg === null) break
    out.push(...seg.meta)
    let pos = seg.dataOffset
    for (const m of seg.meta) pos += m.fileSize
    off = pos
  }
  return out
}
