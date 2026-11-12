// Ported from OpenVDB 13.0.1: openvdb/openvdb/io/Archive.cc,
//  openvdb/openvdb/io/File.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of openvdb/io/Archive.cc + File.cc (read side): the .vdb container.
//
// Layout (file versions >= 222, the oldest this port accepts — matching
// the pinned OpenVDB 13, which dropped pre-221, and 221 files carry an
// inter-version compression byte v13 itself no longer reads):
//   int64 magic ' BDV\0\0\0\0', uint32 fileVersion, uint32 libMajor,
//   uint32 libMinor, byte hasGridOffsets, char[36] uuid,
//   file-level MetaMap, int32 gridCount,
//   then per grid: GridDescriptor + grid block, where a grid block is
//   uint32 compressionFlags, grid MetaMap, Transform, topology, buffers.
//
// DIVERGENCE from upstream: File wraps an in-memory buffer, not a
// filename, and open()/readGrid()/getGrids() are async (zip inflation
// streams through DecompressionStream). Delayed loading of leaf buffers does
// not exist here. As upstream (File.cc File::open, readGridDescriptors,
// readGridByName), a file with grid offsets is opened by reading only its
// grid descriptors and each grid is read when it is requested, so grids of
// types this port cannot read (compsForGridType) fail only when they are
// themselves read; a file without grid offsets is read whole at open().
// Upstream's GridDescriptor::read LookupError for a type not in the grid
// registry is not reproduced: such grids also fail when read.

import { MetaMap } from '../MetaMap.ts'
import { Transform } from '../math/Transform.ts'
import { VdbGrid, compsForGridType } from '../Grid.ts'
import { GridDescriptor } from './GridDescriptor.ts'
import { Stream } from './Stream.ts'
import { COMPRESS_ZIP, COMPRESS_ACTIVE_MASK, compressionToString } from './Compression.ts'

export const OPENVDB_MAGIC = 0x56444220 // int64 ' BDV' (little endian)
export const OPENVDB_FILE_VERSION = 225 // version the pinned library writes
const MIN_SUPPORTED_FILE_VERSION = 222 // OPENVDB_FILE_VERSION_BLOSC_COMPRESSION

export interface ArchiveHeader {
  fileVersion: number
  libraryVersion: { major: number; minor: number }
  hasGridOffsets: boolean
  uuid: string
}

export class File {
  private stream: Stream
  private header: ArchiveHeader | null = null
  private metadata = new MetaMap()
  private descriptors: GridDescriptor[] = []
  private gridsByUniqueName = new Map<string, VdbGrid>()
  private opened = false

  constructor(data: ArrayBuffer | Uint8Array) {
    this.stream = new Stream(data)
  }

  /**
   * Parse the header, file metadata and grid descriptors (upstream
   * File::open). Only a file without grid offsets has its grids read here.
   */
  async open(): Promise<void> {
    const s = this.stream
    s.seek(0)
    this.header = readHeader(s)
    this.metadata.readMeta(s)

    const gridCount = s.int32()
    this.descriptors = []
    this.gridsByUniqueName.clear()
    if (this.header.hasGridOffsets) {
      // File::readGridDescriptors: skip to the end of each grid.
      for (let i = 0; i < gridCount; ++i) {
        const gd = GridDescriptor.read(s)
        this.descriptors.push(gd)
        s.seek(gd.endPos)
      }
      this.opened = true
      return
    }
    for (let i = 0; i < gridCount; ++i) {
      const gd = GridDescriptor.read(s)
      this.descriptors.push(gd)
      s.seek(gd.gridPos)
      const grid = await readGridBlock(s, gd, this.header.fileVersion)
      this.gridsByUniqueName.set(gd.uniqueName, grid)
      s.seek(gd.endPos)
    }

    // connect instances (grids that share trees with other grids)
    for (const gd of this.descriptors) {
      if (!gd.isInstance()) continue
      const parent = this.gridsByUniqueName.get(gd.instanceParentName)
      const grid = this.gridsByUniqueName.get(gd.uniqueName)
      if (!parent || !grid) throw new Error(`missing instance parent "${gd.instanceParentName}"`)
      grid.tree = parent.tree
    }
    this.opened = true
  }

  archiveHeader(): ArchiveHeader {
    this.assertOpen()
    return this.header!
  }

  /** file-level metadata (upstream File::getMetadata) */
  getMetadata(): MetaMap {
    this.assertOpen()
    return this.metadata
  }

  gridDescriptors(): readonly GridDescriptor[] {
    this.assertOpen()
    return this.descriptors
  }

  /** all grids in file order (upstream File::getGrids) */
  async getGrids(): Promise<VdbGrid[]> {
    this.assertOpen()
    const grids: VdbGrid[] = []
    for (const gd of this.descriptors) grids.push(await this.readGridDescriptor(gd))
    return grids
  }

  hasGrid(name: string): boolean {
    this.assertOpen()
    return this.descriptors.some((gd) => gd.gridName === name || gd.uniqueName === name)
  }

  /** grid by (unique) name (upstream File::readGrid / readGridByName) */
  async readGrid(name: string): Promise<VdbGrid> {
    this.assertOpen()
    const gd = this.descriptors.find((d) => d.gridName === name || d.uniqueName === name)
    if (!gd) throw new Error(`file has no grid named "${name}"`)
    return this.readGridDescriptor(gd)
  }

  // Upstream File::readGrid(const GridDescriptor&) and, for an instance,
  // its parent's tree (File::readGridByName). Grids of a file with grid
  // offsets are read on demand and not cached (File::retrieveCachedGrid);
  // each read has its own stream position so reads may overlap.
  private async readGridDescriptor(gd: GridDescriptor): Promise<VdbGrid> {
    const cached = this.gridsByUniqueName.get(gd.uniqueName)
    if (cached) return cached
    const s = new Stream(this.stream.bytes)
    s.seek(gd.gridPos)
    const grid = await readGridBlock(s, gd, this.header!.fileVersion)
    if (gd.isInstance()) {
      const parentGd = this.descriptors.find((d) => d.uniqueName === gd.instanceParentName)
      if (!parentGd) throw new Error(`missing instance parent "${gd.instanceParentName}"`)
      grid.tree = (await this.readGridDescriptor(parentGd)).tree
    }
    return grid
  }

  private assertOpen(): void {
    if (!this.opened) throw new Error('file is not open (call await file.open() first)')
  }
}

export function readHeader(s: Stream): ArchiveHeader {
  const magic = s.int64()
  if (magic !== OPENVDB_MAGIC) throw new Error('not a VDB file')
  const fileVersion = s.uint32()
  if (fileVersion < MIN_SUPPORTED_FILE_VERSION) {
    throw new Error(`VDB file version ${fileVersion} < 222 is not supported`)
  }
  const major = s.uint32()
  const minor = s.uint32()
  const hasGridOffsets = s.bool()
  // 16-byte uuid stored as 32 hex chars + 4 hyphens (always ASCII on disk)
  const uuid = new TextDecoder().decode(s.raw(36))
  return { fileVersion, libraryVersion: { major, minor }, hasGridOffsets, uuid }
}

/** Upstream Archive::readGrid + doReadGrid for one grid block. */
async function readGridBlock(s: Stream, gd: GridDescriptor, fileVersion: number): Promise<VdbGrid> {
  // per-grid compression flags (Archive::readGridCompression)
  const compression = s.uint32()

  const grid = new VdbGrid(gd.gridType, compsForGridType(gd.gridType))
  grid.saveFloatAsHalf = gd.saveFloatAsHalf
  grid.readMeta(s)
  grid.transform = Transform.read(s)

  if (!gd.isInstance()) {
    await grid.tree.readTopology(s, compression, gd.saveFloatAsHalf)
    if (s.pos !== gd.blockPos) {
      // topology must land exactly at the leaf-buffer block position
      throw new Error(`topology parse ended at byte ${s.pos}, expected ${gd.blockPos} (${compressionToString(compression)})`)
    }
    await grid.tree.readBuffers(s, compression, gd.saveFloatAsHalf)
  }
  return grid
}

export { COMPRESS_ZIP, COMPRESS_ACTIVE_MASK }
