// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/tools/CreateNanoGrid.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/tools/CreateNanoGrid.h (the openvdb -> nanovdb
// direction): serializes a parsed VdbGrid into a NanoVDB 32.9.1 in-memory
// grid buffer that @vdb/nanovdb's GridHandle consumes unchanged.
//
// DIVERGENCE from upstream: lives in @vdb/openvdb (upstream's header sits
// in nanovdb/tools but includes openvdb headers; here that direction would
// be a circular package dependency). Further deviations, all unobservable
// through the read/sample API:
//  - checksum stays disabled (upstream computes a CRC by default)
//  - per-node average/stdDeviation stats are not computed (HasAverage /
//    HasStdDeviation flags stay off; min/max ARE computed)
//  - the double-precision inverse map matrix comes from an adjugate/det
//    3x3 inversion rather than openvdb's Mat4::inverse (LSB-level only)

import {
  FLOAT_LAYOUT,
  GRID_DATA_SIZE,
  GridHandle,
  GridType,
  NANOVDB_MAGIC_GRID,
  TREE_DATA_SIZE,
  VEC3F_LAYOUT,
  coordToKey,
  type Coord,
  type GridLayout,
} from '@vdb/nanovdb'
import { GridClass as VdbGridClass, type VdbGrid } from '../Grid.ts'
import {
  LEAF_TOTAL,
  LOWER_TOTAL,
  UPPER_LOG2DIM,
  type VdbInternalNode,
  type VdbLeafNode,
} from '../tree/Tree.ts'

const LEAF_SIZE = 512
const LOWER_SIZE = 4096
const UPPER_SIZE = 32768

// GridFlags (NanoVDB.h)
const HAS_BBOX = 1 << 1
const HAS_MIN_MAX = 1 << 2
const IS_BREADTH_FIRST = 1 << 5

interface BuildContext {
  dv: DataView
  comps: number
  layout: GridLayout
  background: Float32Array
}

function maskIsOn(mask: Uint32Array, n: number): boolean {
  return (mask[n >>> 5]! & (1 << (n & 31))) !== 0
}

function popcount(mask: Uint32Array): number {
  let sum = 0
  for (let i = 0; i < mask.length; ++i) {
    let w = mask[i]!
    w = w - ((w >>> 1) & 0x55555555)
    w = (w & 0x33333333) + ((w >>> 2) & 0x33333333)
    sum += (((w + (w >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
  }
  return sum
}

/** Convert a parsed .vdb grid into a raw NanoVDB grid buffer wrapped in a GridHandle. */
export function createNanoGrid(grid: VdbGrid): GridHandle {
  const comps = grid.tree.comps
  const layout = comps === 1 ? FLOAT_LAYOUT : VEC3F_LAYOUT
  const tree = grid.tree

  // ---- collect nodes: uppers in root-map order (sorted by coord, like
  // openvdb's std::map), lowers/leaves in bit order beneath them ----
  const rootEntries = [...tree.children.values()].sort((a, b) =>
    a.origin[0] - b.origin[0] || a.origin[1] - b.origin[1] || a.origin[2] - b.origin[2],
  )
  const rootTiles = [...tree.tiles.values()].sort((a, b) =>
    a.origin[0] - b.origin[0] || a.origin[1] - b.origin[1] || a.origin[2] - b.origin[2],
  )
  const uppers: VdbInternalNode[] = rootEntries.map((e) => e.child)
  const lowers: VdbInternalNode[] = []
  const leaves: VdbLeafNode[] = []
  for (const upper of uppers) {
    for (let n = 0; n < UPPER_SIZE; ++n) {
      if (!maskIsOn(upper.childMask, n)) continue
      const lower = upper.children[n] as VdbInternalNode
      lowers.push(lower)
    }
  }
  for (const lower of lowers) {
    for (let n = 0; n < LOWER_SIZE; ++n) {
      if (!maskIsOn(lower.childMask, n)) continue
      leaves.push(lower.children[n] as VdbLeafNode)
    }
  }

  // ---- compute layout offsets (everything is already 32B-aligned) ----
  const rootOffset = GRID_DATA_SIZE + TREE_DATA_SIZE
  const tableSize = rootEntries.length + rootTiles.length
  const upperOffset = rootOffset + layout.rootSize + tableSize * layout.rootTileSize
  const lowerOffset = upperOffset + uppers.length * layout.upperSize
  const leafOffset = lowerOffset + lowers.length * layout.lowerSize
  const gridSize = leafOffset + leaves.length * layout.leafSize

  const buffer = new ArrayBuffer(gridSize)
  const dv = new DataView(buffer)
  const ctx: BuildContext = { dv, comps, layout, background: tree.background }

  // ---- leaves (also computes per-leaf active bbox + min/max) ----
  const leafByRef = new Map<VdbLeafNode, number>()
  for (let i = 0; i < leaves.length; ++i) {
    const off = leafOffset + i * layout.leafSize
    leafByRef.set(leaves[i]!, off)
    writeLeaf(ctx, leaves[i]!, off)
  }

  // ---- lowers ----
  const lowerByRef = new Map<VdbInternalNode, number>()
  for (let i = 0; i < lowers.length; ++i) {
    const off = lowerOffset + i * layout.lowerSize
    lowerByRef.set(lowers[i]!, off)
    writeInternal(ctx, lowers[i]!, off, false, leafByRef)
  }

  // ---- uppers ----
  const upperByRef = new Map<VdbInternalNode, number>()
  for (let i = 0; i < uppers.length; ++i) {
    const off = upperOffset + i * layout.upperSize
    upperByRef.set(uppers[i]!, off)
    writeInternal(ctx, uppers[i]!, off, true, lowerByRef)
  }

  // ---- root ----
  const indexBBox = tree.evalActiveVoxelBoundingBox()
  const L = layout
  dv.setInt32(rootOffset, indexBBox.min[0], true)
  dv.setInt32(rootOffset + 4, indexBBox.min[1], true)
  dv.setInt32(rootOffset + 8, indexBBox.min[2], true)
  dv.setInt32(rootOffset + 12, indexBBox.max[0], true)
  dv.setInt32(rootOffset + 16, indexBBox.max[1], true)
  dv.setInt32(rootOffset + 20, indexBBox.max[2], true)
  dv.setUint32(rootOffset + 24, tableSize, true)
  for (let c = 0; c < comps; ++c) {
    dv.setFloat32(rootOffset + L.rootBackground + 4 * c, tree.background[c]!, true)
  }
  const globalMinMax = computeGlobalMinMax(ctx, leaves, uppers)
  for (let c = 0; c < comps; ++c) {
    dv.setFloat32(rootOffset + L.rootMinimum + 4 * c, globalMinMax.min[c]!, true)
    dv.setFloat32(rootOffset + L.rootMaximum + 4 * c, globalMinMax.max[c]!, true)
  }
  // root tile table: child entries + value tiles, root-map order
  let tileOff = rootOffset + L.rootSize
  const entries: { origin: Coord; child: VdbInternalNode | null; value: Float32Array | null; state: boolean }[] = [
    ...rootEntries.map((e) => ({ origin: e.origin, child: e.child as VdbInternalNode | null, value: null, state: false })),
    ...rootTiles.map((t) => ({ origin: t.origin, child: null, value: t.tile.value as Float32Array | null, state: t.tile.active })),
  ].sort((a, b) => a.origin[0] - b.origin[0] || a.origin[1] - b.origin[1] || a.origin[2] - b.origin[2])
  for (const entry of entries) {
    dv.setBigUint64(tileOff + L.rootTileKey, coordToKey(entry.origin), true)
    if (entry.child) {
      dv.setBigInt64(tileOff + L.rootTileChild, BigInt(upperByRef.get(entry.child)! - rootOffset), true)
      dv.setUint32(tileOff + L.rootTileState, 0, true)
    } else {
      dv.setBigInt64(tileOff + L.rootTileChild, 0n, true)
      dv.setUint32(tileOff + L.rootTileState, entry.state ? 1 : 0, true)
      for (let c = 0; c < comps; ++c) {
        dv.setFloat32(tileOff + L.rootTileValue + 4 * c, entry.value![c]!, true)
      }
    }
    tileOff += L.rootTileSize
  }

  // ---- TreeData ----
  const treeOffset = GRID_DATA_SIZE
  const nodeOffsets = [leafOffset, lowerOffset, upperOffset, rootOffset]
  for (let level = 0; level < 4; ++level) {
    dv.setBigInt64(treeOffset + 8 * level, BigInt(nodeOffsets[level]! - treeOffset), true)
  }
  dv.setUint32(treeOffset + 32, leaves.length, true)
  dv.setUint32(treeOffset + 36, lowers.length, true)
  dv.setUint32(treeOffset + 40, uppers.length, true)
  let lowerTiles = 0
  let upperTiles = 0
  for (const n of lowers) lowerTiles += popcount(n.valueMask)
  for (const n of uppers) upperTiles += popcount(n.valueMask)
  dv.setUint32(treeOffset + 44, lowerTiles, true)
  dv.setUint32(treeOffset + 48, upperTiles, true)
  dv.setUint32(treeOffset + 52, rootTiles.filter((t) => t.tile.active).length, true)
  dv.setBigUint64(treeOffset + 56, BigInt(tree.activeVoxelCount()), true)

  // ---- GridData ----
  dv.setBigUint64(0, NANOVDB_MAGIC_GRID, true)
  dv.setBigUint64(8, 0xffffffffffffffffn, true) // checksum disabled
  dv.setUint32(16, (32 << 21) | (9 << 10) | 1, true) // version 32.9.1
  dv.setUint32(20, HAS_BBOX | HAS_MIN_MAX | IS_BREADTH_FIRST, true)
  dv.setUint32(24, 0, true) // gridIndex
  dv.setUint32(28, 1, true) // gridCount
  dv.setBigUint64(32, BigInt(gridSize), true)
  const nameBytes = new TextEncoder().encode(grid.getName())
  if (nameBytes.length > 255) throw new Error('long grid names (>255 bytes) are not supported yet')
  new Uint8Array(buffer, 40, nameBytes.length).set(nameBytes)

  // Map (offset 296): float mirrors, then double mat/invMat/translation.
  // The 3x3s are the TRANSPOSED upper-left of the openvdb Mat4 (row-vector
  // -> row-major matrix-vector convention change), translation is row 3.
  const mat4 = grid.transform!.baseMap.getAffineMat4()
  const mat3: number[] = []
  for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) mat3.push(mat4[j * 4 + i]!)
  const inv3 = invert3x3(mat3)
  const vec = [mat4[12]!, mat4[13]!, mat4[14]!]
  const MAP = 296
  for (let i = 0; i < 9; ++i) {
    dv.setFloat32(MAP + 4 * i, Math.fround(mat3[i]!), true)
    dv.setFloat32(MAP + 36 + 4 * i, Math.fround(inv3[i]!), true)
    dv.setFloat64(MAP + 88 + 8 * i, mat3[i]!, true)
    dv.setFloat64(MAP + 160 + 8 * i, inv3[i]!, true)
  }
  for (let i = 0; i < 3; ++i) {
    dv.setFloat32(MAP + 72 + 4 * i, Math.fround(vec[i]!), true)
    dv.setFloat64(MAP + 232 + 8 * i, vec[i]!, true)
  }
  dv.setFloat32(MAP + 84, 1, true) // taperF
  dv.setFloat64(MAP + 256, 1, true) // taperD

  // worldBBox (offset 560): CoordBBox(min, max+1) through the map, all 8 corners
  const wb = worldBBox(grid, indexBBox)
  for (let i = 0; i < 3; ++i) {
    dv.setFloat64(560 + 8 * i, wb.min[i]!, true)
    dv.setFloat64(584 + 8 * i, wb.max[i]!, true)
  }
  const vs = grid.voxelSize()
  for (let i = 0; i < 3; ++i) dv.setFloat64(608 + 8 * i, vs[i]!, true)
  dv.setUint32(632, toNanoGridClass(grid.getGridClass()), true)
  dv.setUint32(636, comps === 1 ? GridType.Float : GridType.Vec3f, true)
  dv.setBigInt64(640, BigInt(gridSize), true) // blindMetadataOffset (none)
  dv.setUint32(648, 0, true) // blindMetadataCount

  return new GridHandle(buffer)
}

function toNanoGridClass(c: VdbGridClass): number {
  // VdbGridClass values coincide with nanovdb GridClass for the read scope
  return c as number
}

function worldBBox(grid: VdbGrid, bbox: { min: Coord; max: Coord }): { min: number[]; max: number[] } {
  const lo = bbox.min
  const hi: Coord = [bbox.max[0] + 1, bbox.max[1] + 1, bbox.max[2] + 1]
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const x of [lo[0], hi[0]]) {
    for (const y of [lo[1], hi[1]]) {
      for (const z of [lo[2], hi[2]]) {
        const w = grid.indexToWorld([x, y, z])
        for (let i = 0; i < 3; ++i) {
          if (w[i]! < min[i]!) min[i] = w[i]!
          if (w[i]! > max[i]!) max[i] = w[i]!
        }
      }
    }
  }
  return { min, max }
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number]
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (det === 0) throw new Error('grid transform is singular')
  const r = 1 / det
  return [
    (e * i - f * h) * r,
    (c * h - b * i) * r,
    (b * f - c * e) * r,
    (f * g - d * i) * r,
    (a * i - c * g) * r,
    (c * d - a * f) * r,
    (d * h - e * g) * r,
    (b * g - a * h) * r,
    (a * e - b * d) * r,
  ]
}

function writeLeaf(ctx: BuildContext, leaf: VdbLeafNode, off: number): void {
  const { dv, comps, layout: L } = ctx
  // active bbox within the leaf
  let minX = 8,
    minY = 8,
    minZ = 8,
    maxX = -1,
    maxY = -1,
    maxZ = -1
  for (let n = 0; n < LEAF_SIZE; ++n) {
    if (!maskIsOn(leaf.valueMask, n)) continue
    const x = n >> 6
    const y = (n >> 3) & 7
    const z = n & 7
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const hasActive = maxX >= 0
  dv.setInt32(off + L.leafBBoxMin, leaf.origin[0] + (hasActive ? minX : 0), true)
  dv.setInt32(off + L.leafBBoxMin + 4, leaf.origin[1] + (hasActive ? minY : 0), true)
  dv.setInt32(off + L.leafBBoxMin + 8, leaf.origin[2] + (hasActive ? minZ : 0), true)
  dv.setUint8(off + L.leafBBoxMin + 12, hasActive ? maxX - minX : 0)
  dv.setUint8(off + L.leafBBoxMin + 13, hasActive ? maxY - minY : 0)
  dv.setUint8(off + L.leafBBoxMin + 14, hasActive ? maxZ - minZ : 0)
  dv.setUint8(off + L.leafFlags, 2) // bit 1: has bbox
  for (let w = 0; w < 16; ++w) {
    dv.setUint32(off + L.leafValueMask + 4 * w, leaf.valueMask[w]!, true)
  }
  const { min, max } = activeMinMax(ctx, leaf.buffer, leaf.valueMask, LEAF_SIZE)
  for (let c = 0; c < comps; ++c) {
    dv.setFloat32(off + L.leafMinimum + 4 * c, min[c]!, true)
    dv.setFloat32(off + L.leafMinimum + comps * 4 + 4 * c, max[c]!, true)
  }
  for (let i = 0; i < leaf.buffer.length; ++i) {
    dv.setFloat32(off + L.leafValues + 4 * i, leaf.buffer[i]!, true)
  }
}

function writeInternal(
  ctx: BuildContext,
  node: VdbInternalNode,
  off: number,
  isUpper: boolean,
  childOffsets: Map<VdbInternalNode | VdbLeafNode, number>,
): void {
  const { dv, comps, layout: L } = ctx
  const numValues = isUpper ? UPPER_SIZE : LOWER_SIZE
  const maskOff = isUpper ? L.upperValueMask : L.lowerValueMask
  const childMaskOff = isUpper ? L.upperChildMask : L.lowerChildMask
  const tableOff = isUpper ? L.upperTable : L.lowerTable
  const tileSize = isUpper ? L.upperTileSize : L.lowerTileSize
  const minOff = isUpper ? L.upperMinimum : L.lowerMinimum
  const childTotal = isUpper ? LOWER_TOTAL : LEAF_TOTAL

  // bbox: union of child bboxes and active tile extents
  let bbox: { min: Coord; max: Coord } | null = null
  const expand = (lo: Coord, hi: Coord): void => {
    if (!bbox) {
      bbox = { min: [...lo] as Coord, max: [...hi] as Coord }
      return
    }
    for (let i = 0; i < 3; ++i) {
      if (lo[i]! < bbox.min[i]!) bbox.min[i] = lo[i]!
      if (hi[i]! > bbox.max[i]!) bbox.max[i] = hi[i]!
    }
  }

  for (let w = 0; w < numValues >>> 5; ++w) {
    dv.setUint32(off + maskOff + 4 * w, node.valueMask[w]!, true)
    dv.setUint32(off + childMaskOff + 4 * w, node.childMask[w]!, true)
  }

  const log2 = node.log2dim
  const mask = (1 << log2) - 1
  const originMask = ~((1 << (childTotal + log2)) - 1)
  const origin: Coord = [node.origin[0] & originMask, node.origin[1] & originMask, node.origin[2] & originMask]
  const childDim = 1 << childTotal

  for (let n = 0; n < numValues; ++n) {
    const entry = off + tableOff + n * tileSize
    if (maskIsOn(node.childMask, n)) {
      const child = node.children[n]!
      const childOff = childOffsets.get(child)
      if (childOff === undefined) throw new Error('child node missing from layout')
      dv.setBigInt64(entry, BigInt(childOff - off), true)
      const childBBox = readChildBBox(ctx, child, childOff, !isUpper)
      if (childBBox) expand(childBBox.min, childBBox.max)
    } else {
      for (let c = 0; c < comps; ++c) {
        dv.setFloat32(entry + 4 * c, node.values[n * comps + c]!, true)
      }
      if (maskIsOn(node.valueMask, n)) {
        const lo: Coord = [
          origin[0] + ((n >> (2 * log2)) << childTotal),
          origin[1] + (((n >> log2) & mask) << childTotal),
          origin[2] + ((n & mask) << childTotal),
        ]
        expand(lo, [lo[0] + childDim - 1, lo[1] + childDim - 1, lo[2] + childDim - 1])
      }
    }
  }

  const finalBBox = bbox ?? { min: [0, 0, 0] as Coord, max: [-1, -1, -1] as Coord }
  for (let i = 0; i < 3; ++i) {
    dv.setInt32(off + 4 * i, (finalBBox as { min: Coord }).min[i]!, true)
    dv.setInt32(off + 12 + 4 * i, (finalBBox as { max: Coord }).max[i]!, true)
  }
  // mFlags (u64 at offset 24): bit 1 = node or descendants contain active values
  const hasActive = bbox !== null
  dv.setBigUint64(off + 24, hasActive ? 2n : 0n, true)

  const mm = internalActiveMinMax(ctx, node)
  for (let c = 0; c < comps; ++c) {
    dv.setFloat32(off + minOff + 4 * c, mm.min[c]!, true)
    dv.setFloat32(off + minOff + comps * 4 + 4 * c, mm.max[c]!, true)
  }
}

function readChildBBox(
  ctx: BuildContext,
  child: VdbInternalNode | VdbLeafNode,
  childOff: number,
  childIsLeaf: boolean,
): { min: Coord; max: Coord } | null {
  const { dv, layout: L } = ctx
  if (childIsLeaf) {
    // leaf: mBBoxMin + mBBoxDif, valid only when it has active voxels
    if (popcount((child as VdbLeafNode).valueMask) === 0) return null
    const min: Coord = [
      dv.getInt32(childOff + L.leafBBoxMin, true),
      dv.getInt32(childOff + L.leafBBoxMin + 4, true),
      dv.getInt32(childOff + L.leafBBoxMin + 8, true),
    ]
    return {
      min,
      max: [
        min[0] + dv.getUint8(childOff + L.leafBBoxMin + 12),
        min[1] + dv.getUint8(childOff + L.leafBBoxMin + 13),
        min[2] + dv.getUint8(childOff + L.leafBBoxMin + 14),
      ],
    }
  }
  const hasActive = dv.getBigUint64(childOff + 24, true) & 2n
  if (!hasActive) return null
  return {
    min: [dv.getInt32(childOff, true), dv.getInt32(childOff + 4, true), dv.getInt32(childOff + 8, true)],
    max: [dv.getInt32(childOff + 12, true), dv.getInt32(childOff + 16, true), dv.getInt32(childOff + 20, true)],
  }
}

interface MinMax {
  min: Float32Array
  max: Float32Array
}

function newMinMax(comps: number): MinMax {
  const min = new Float32Array(comps).fill(Infinity)
  const max = new Float32Array(comps).fill(-Infinity)
  return { min, max }
}

function mergeValue(mm: MinMax, values: ArrayLike<number>, idx: number, comps: number): void {
  if (comps === 1) {
    const v = values[idx]!
    if (v < mm.min[0]!) mm.min[0] = v
    if (v > mm.max[0]!) mm.max[0] = v
    return
  }
  // Vec3f extrema are magnitude-based upstream (Extrema<Vec3f>)
  const x = values[idx * 3]!
  const y = values[idx * 3 + 1]!
  const z = values[idx * 3 + 2]!
  const m2 = x * x + y * y + z * z
  const minM = mm.min[0]! * mm.min[0]! + mm.min[1]! * mm.min[1]! + mm.min[2]! * mm.min[2]!
  const maxM = mm.max[0]! * mm.max[0]! + mm.max[1]! * mm.max[1]! + mm.max[2]! * mm.max[2]!
  if (!Number.isFinite(minM) || m2 < minM) {
    mm.min[0] = x
    mm.min[1] = y
    mm.min[2] = z
  }
  if (!Number.isFinite(maxM) || m2 > maxM) {
    mm.max[0] = x
    mm.max[1] = y
    mm.max[2] = z
  }
}

function activeMinMax(ctx: BuildContext, buffer: Float32Array, valueMask: Uint32Array, count: number): MinMax {
  const mm = newMinMax(ctx.comps)
  for (let n = 0; n < count; ++n) {
    if (maskIsOn(valueMask, n)) mergeValue(mm, buffer, n, ctx.comps)
  }
  finalize(mm, ctx)
  return mm
}

function internalActiveMinMax(ctx: BuildContext, node: VdbInternalNode): MinMax {
  const mm = newMinMax(ctx.comps)
  const numValues = node.log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
  for (let n = 0; n < numValues; ++n) {
    if (maskIsOn(node.childMask, n)) {
      const child = node.children[n]!
      const childMM =
        'log2dim' in child
          ? internalActiveMinMax(ctx, child)
          : activeMinMax(ctx, child.buffer, child.valueMask, LEAF_SIZE)
      if (Number.isFinite(childMM.min[0]!)) {
        mergeValue(mm, childMM.min, 0, ctx.comps)
        mergeValue(mm, childMM.max, 0, ctx.comps)
      }
    } else if (maskIsOn(node.valueMask, n)) {
      mergeValue(mm, node.values, n, ctx.comps)
    }
  }
  finalize(mm, ctx)
  return mm
}

function computeGlobalMinMax(ctx: BuildContext, leaves: VdbLeafNode[], uppers: VdbInternalNode[]): MinMax {
  const mm = newMinMax(ctx.comps)
  for (const upper of uppers) {
    const u = internalActiveMinMax(ctx, upper)
    if (Number.isFinite(u.min[0]!)) {
      mergeValue(mm, u.min, 0, ctx.comps)
      mergeValue(mm, u.max, 0, ctx.comps)
    }
  }
  finalize(mm, ctx)
  return mm
}

function finalize(mm: MinMax, ctx: BuildContext): void {
  // empty extrema collapse to the background, like an empty Extrema upstream
  if (!Number.isFinite(mm.min[0]!) || !Number.isFinite(mm.max[0]!)) {
    mm.min.set(ctx.background)
    mm.max.set(ctx.background)
  }
}
