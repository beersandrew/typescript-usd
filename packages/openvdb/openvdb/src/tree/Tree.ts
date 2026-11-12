// Ported from OpenVDB 13.0.1: openvdb/openvdb/tree/Tree.h,
//  openvdb/openvdb/tree/RootNode.h, openvdb/openvdb/tree/InternalNode.h,
//  openvdb/openvdb/tree/LeafNode.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// With additions ported from OpenVDB 10.1.0: openvdb/openvdb/tree/Tree.h,
//  openvdb/openvdb/tree/RootNode.h, openvdb/openvdb/tree/InternalNode.h,
//  openvdb/openvdb/tree/LeafNode.h, openvdb/openvdb/tree/TreeIterator.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This file contains code ported from OpenVDB 10.1.0 and is licensed under the
//  Mozilla Public License 2.0 as a whole. This Source Code Form is subject to
//  the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was
//  not distributed with this file, You can obtain one at
//  https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of the openvdb 5-4-3 tree read path (tree/Tree.h, RootNode.h,
// InternalNode.h, LeafNode.h) for Float and Vec3f grids.
//
// The write path (setValueOn/setValueOff/isValueOn/probeValue, node
// creation, setBackground, copy, in-order leaf and tile iteration) is ported
// from OpenVDB 10.1.0, the version OpenUSD 26.11.1's reference build links;
// the ValueAccessor that caches nodes for it is tree/ValueAccessor.ts.
//
// Nodes deserialize into plain objects holding typed arrays. Values are
// stored as flat Float32Arrays of `comps` components per voxel (comps = 1
// for float, 3 for Vec3f) — the TS translation of the ValueT template
// parameter. Coordinate-to-offset math matches NanoVDB's (same tree).

import type { Coord, CoordBBox } from '@vdb/nanovdb'
import {
  COMPRESS_ACTIVE_MASK,
  maskIsOn,
  readCompressedValues,
  readMask,
} from '../io/Compression.ts'
import type { Stream } from '../io/Stream.ts'

export const LEAF_LOG2DIM = 3
export const LOWER_LOG2DIM = 4
export const UPPER_LOG2DIM = 5
export const LEAF_TOTAL = 3 // leaf node: 8^3 voxels
export const LOWER_TOTAL = 7 // lower internal: covers 128^3
export const UPPER_TOTAL = 12 // upper internal: covers 4096^3

const LEAF_SIZE = 512
const LOWER_SIZE = 4096
const UPPER_SIZE = 32768

export interface VdbLeafNode {
  origin: Coord
  valueMask: Uint32Array // 512 bits
  buffer: Float32Array // 512 * comps
}

export interface VdbInternalNode {
  origin: Coord
  log2dim: number // 4 (lower) or 5 (upper)
  childMask: Uint32Array
  valueMask: Uint32Array
  values: Float32Array // NUM_VALUES * comps (tile values; child slots unused)
  children: (VdbInternalNode | VdbLeafNode | null)[]
}

export interface RootTileEntry {
  value: Float32Array // comps
  active: boolean
}

export class VdbTree {
  background: Float32Array // comps
  readonly tiles = new Map<string, { origin: Coord; tile: RootTileEntry }>()
  readonly children = new Map<string, { origin: Coord; child: VdbInternalNode }>()
  /** leaves in depth-first read order (the buffer order on disk) */
  readonly leaves: VdbLeafNode[] = []

  constructor(readonly comps: number) {
    this.background = new Float32Array(comps)
  }

  static rootKey(ijk: Coord): string {
    return `${ijk[0] & ~4095},${ijk[1] & ~4095},${ijk[2] & ~4095}`
  }

  /**
   * Tree::readTopology: int32 buffer count (always 1 now), then the root
   * (background, tiles, child subtrees with masks and tile values).
   */
  async readTopology(s: Stream, compression: number, fromHalf: boolean): Promise<void> {
    const bufferCount = s.int32()
    if (bufferCount !== 1) throw new Error('multi-buffer trees are no longer supported')

    // RootNode::readTopology
    for (let c = 0; c < this.comps; ++c) this.background[c] = s.float32()
    const numTiles = s.uint32()
    const numChildren = s.uint32()
    for (let n = 0; n < numTiles; ++n) {
      const origin = s.coord()
      const value = new Float32Array(this.comps)
      for (let c = 0; c < this.comps; ++c) value[c] = s.float32()
      const active = s.bool()
      this.tiles.set(VdbTree.rootKey(origin), { origin, tile: { value, active } })
    }
    for (let n = 0; n < numChildren; ++n) {
      const origin = s.coord()
      const child = await this.readInternalTopology(s, origin, UPPER_LOG2DIM, compression, fromHalf)
      this.children.set(VdbTree.rootKey(origin), { origin, child })
    }
  }

  /** InternalNode::readTopology: childMask, valueMask, compressed tile values, recursive children. */
  private async readInternalTopology(
    s: Stream,
    origin: Coord,
    log2dim: number,
    compression: number,
    fromHalf: boolean,
  ): Promise<VdbInternalNode> {
    const numValues = log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
    const childMask = readMask(s, numValues)
    const valueMask = readMask(s, numValues)
    const values = await readCompressedValues(
      s,
      numValues,
      this.comps,
      valueMask,
      this.background,
      compression,
      fromHalf,
    )
    const node: VdbInternalNode = {
      origin,
      log2dim,
      childMask,
      valueMask,
      values,
      children: new Array<VdbInternalNode | VdbLeafNode | null>(numValues).fill(null),
    }
    const childTotal = log2dim === UPPER_LOG2DIM ? LOWER_TOTAL : LEAF_TOTAL
    for (let n = 0; n < numValues; ++n) {
      if (!maskIsOn(childMask, n)) continue
      const childOrigin = offsetToGlobalCoord(node, n, childTotal)
      if (log2dim === UPPER_LOG2DIM) {
        node.children[n] = await this.readInternalTopology(s, childOrigin, LOWER_LOG2DIM, compression, fromHalf)
      } else {
        // LeafNode::readTopology: just the value mask
        const leaf: VdbLeafNode = {
          origin: childOrigin,
          valueMask: readMask(s, LEAF_SIZE),
          buffer: new Float32Array(LEAF_SIZE * this.comps),
        }
        this.leaves.push(leaf)
        node.children[n] = leaf
      }
    }
    return node
  }

  /**
   * Tree::readBuffers: every leaf, in topology (depth-first) order, re-reads
   * its value mask and then its compressed voxel buffer.
   */
  async readBuffers(s: Stream, compression: number, fromHalf: boolean): Promise<void> {
    for (const leaf of this.leaves) {
      leaf.valueMask = readMask(s, LEAF_SIZE)
      leaf.buffer = await readCompressedValues(
        s,
        LEAF_SIZE,
        this.comps,
        leaf.valueMask,
        this.background,
        compression,
        fromHalf,
      )
      // Fog-volume leaf buffers under active-mask compression leave
      // inactive voxels at the reconstruction value, matching upstream.
    }
  }

  // ---- sampling (mirrors RootNode/InternalNode/LeafNode getValue) ----

  /** flat component offset of ijk's value; the value is `comps` floats */
  getValue(ijk: Coord): Float32Array {
    const entry = this.children.get(VdbTree.rootKey(ijk))
    if (entry) return internalGetValue(entry.child, ijk, this.comps)
    const tile = this.tiles.get(VdbTree.rootKey(ijk))
    if (tile) return tile.tile.value
    return this.background
  }

  isActive(ijk: Coord): boolean {
    const entry = this.children.get(VdbTree.rootKey(ijk))
    if (entry) return internalIsActive(entry.child, ijk)
    const tile = this.tiles.get(VdbTree.rootKey(ijk))
    if (tile) return tile.tile.active
    return false
  }

  leafCount(): number {
    return this.leaves.length
  }

  activeVoxelCount(): number {
    let count = 0
    for (const leaf of this.leaves) count += popcount(leaf.valueMask)
    for (const { child } of this.children.values()) count += internalActiveTileVoxels(child)
    for (const { tile } of this.tiles.values()) if (tile.active) count += 4096 ** 3
    return count
  }

  // ---- write path (OpenVDB 10.1.0 tree/RootNode.h, InternalNode.h, LeafNode.h) ----

  /** tree/RootNode.h:1709-1725 isValueOn */
  isValueOn(ijk: Coord): boolean {
    return this.isActive(ijk)
  }

  /**
   * tree/RootNode.h:2104-2117 probeValue: copy the value at ijk into
   * out[offset .. offset + comps) and return its active state.
   */
  probeValue(ijk: Coord, out: Float32Array, offset = 0): boolean {
    const key = VdbTree.rootKey(ijk)
    const entry = this.children.get(key)
    if (entry) return internalProbeValue(entry.child, ijk, this.comps, out, offset)
    const tile = this.tiles.get(key)
    if (tile) {
      out.set(tile.tile.value, offset)
      return tile.tile.active
    }
    out.set(this.background, offset)
    return false
  }

  /**
   * tree/RootNode.h:1895-1910 setValueOn: a missing entry gets a new upper
   * internal node filled with the background; a tile that is inactive or has
   * another value is replaced by a child filled with the tile.
   */
  setValueOn(ijk: Coord, value: ArrayLike<number>): void {
    const upper = this.rootChildForWrite(ijk, value, true)
    if (upper) internalSetValue(this, upper, ijk, value, true, null)
  }

  /**
   * tree/RootNode.h:1850-1866 setValueOff: a missing entry gets a child only
   * if value is not the background; a tile only if it is active or has
   * another value.
   */
  setValueOff(ijk: Coord, value: ArrayLike<number>): void {
    const upper = this.rootChildForWrite(ijk, value, false)
    if (upper) internalSetValue(this, upper, ijk, value, false, null)
  }

  /** the root-level part of setValueOn / setValueOff (RootNode.h:1850-1910) */
  rootChildForWrite(ijk: Coord, value: ArrayLike<number>, on: boolean): VdbInternalNode | null {
    const key = VdbTree.rootKey(ijk)
    const entry = this.children.get(key)
    if (entry) return entry.child
    const tile = this.tiles.get(key)
    if (!tile) {
      if (!on && valuesExactlyEqual(this.background, value, this.comps)) return null
      const child = newInternalNode(ijk, UPPER_LOG2DIM, this.background, false, this.comps)
      this.children.set(key, { origin: child.origin, child })
      return child
    }
    const t = tile.tile
    const needsChild = on
      ? !t.active || !valuesExactlyEqual(t.value, value, this.comps)
      : t.active || !valuesExactlyEqual(t.value, value, this.comps)
    if (!needsChild) return null
    const child = newInternalNode(ijk, UPPER_LOG2DIM, t.value, t.active, this.comps)
    this.tiles.delete(key)
    this.children.set(key, { origin: child.origin, child })
    return child
  }

  /** tree/RootNode.h:1243-1266 setBackground(background, updateChildNodes = false) */
  setBackground(background: ArrayLike<number>): void {
    this.background = Float32Array.from(background)
  }

  /** root children and tiles in upstream mTable order (std::map<Coord>: x, then y, then z) */
  rootEntries(): ({ origin: Coord; child: VdbInternalNode } | { origin: Coord; tile: RootTileEntry })[] {
    const all: ({ origin: Coord; child: VdbInternalNode } | { origin: Coord; tile: RootTileEntry })[] = [
      ...this.children.values(),
      ...this.tiles.values(),
    ]
    return all.sort((a, b) => a.origin[0] - b.origin[0] || a.origin[1] - b.origin[1] || a.origin[2] - b.origin[2])
  }

  /** leaf nodes in upstream LeafCIter order (depth-first, mTable then offset order) */
  leafNodesInOrder(): VdbLeafNode[] {
    const out: VdbLeafNode[] = []
    const visit = (node: VdbInternalNode): void => {
      const numValues = node.log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
      for (let n = 0; n < numValues; ++n) {
        if (!maskIsOn(node.childMask, n)) continue
        const child = node.children[n]!
        if ('log2dim' in child) visit(child)
        else out.push(child)
      }
    }
    for (const e of this.rootEntries()) if ('child' in e) visit(e.child)
    return out
  }

  /**
   * Tiles (root and internal-node values, not leaf voxels) in the order of
   * upstream's ValueAllCIter with setMaxDepth(getLeafDepth() - 1)
   * (tree/TreeIterator.h:805-850: values and children of a node are visited
   * by position, descending into a child before the values after it).
   * `dim` is the tile's edge length in voxels.
   */
  forEachTile(cb: (origin: Coord, dim: number, value: Float32Array, active: boolean) => void): void {
    const comps = this.comps
    const visit = (node: VdbInternalNode): void => {
      const childTotal = node.log2dim === UPPER_LOG2DIM ? LOWER_TOTAL : LEAF_TOTAL
      const numValues = node.log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
      for (let n = 0; n < numValues; ++n) {
        if (maskIsOn(node.childMask, n)) {
          const child = node.children[n]!
          if ('log2dim' in child) visit(child)
        } else {
          cb(
            offsetToGlobalCoord(node, n, childTotal),
            1 << childTotal,
            node.values.subarray(n * comps, (n + 1) * comps),
            maskIsOn(node.valueMask, n),
          )
        }
      }
    }
    for (const e of this.rootEntries()) {
      if ('child' in e) visit(e.child)
      else cb(e.origin, 4096, e.tile.value, e.tile.active)
    }
  }

  /** tree/Tree.h Tree::copy: a deep copy */
  copy(): VdbTree {
    const out = new VdbTree(this.comps)
    out.background = Float32Array.from(this.background)
    const copyNode = (node: VdbInternalNode): VdbInternalNode => ({
      origin: [...node.origin],
      log2dim: node.log2dim,
      childMask: Uint32Array.from(node.childMask),
      valueMask: Uint32Array.from(node.valueMask),
      values: Float32Array.from(node.values),
      children: node.children.map((c) => {
        if (!c) return null
        if ('log2dim' in c) return copyNode(c)
        const leaf: VdbLeafNode = {
          origin: [...c.origin],
          valueMask: Uint32Array.from(c.valueMask),
          buffer: Float32Array.from(c.buffer),
        }
        out.leaves.push(leaf)
        return leaf
      }),
    })
    for (const e of this.rootEntries()) {
      const key = VdbTree.rootKey(e.origin)
      if ('child' in e) out.children.set(key, { origin: [...e.origin], child: copyNode(e.child) })
      else out.tiles.set(key, { origin: [...e.origin], tile: { value: Float32Array.from(e.tile.value), active: e.tile.active } })
    }
    return out
  }

  /** index-space bbox of active voxels (upstream evalActiveVoxelBoundingBox, exact) */
  evalActiveVoxelBoundingBox(): CoordBBox {
    const bbox: CoordBBox = {
      min: [Infinity, Infinity, Infinity] as unknown as Coord,
      max: [-Infinity, -Infinity, -Infinity] as unknown as Coord,
    }
    for (const leaf of this.leaves) {
      for (let n = 0; n < LEAF_SIZE; ++n) {
        if (!maskIsOn(leaf.valueMask, n)) continue
        const x = leaf.origin[0] + (n >> 6)
        const y = leaf.origin[1] + ((n >> 3) & 7)
        const z = leaf.origin[2] + (n & 7)
        expand(bbox, x, y, z, x, y, z)
      }
    }
    const expandTiles = (node: VdbInternalNode): void => {
      const childTotal = node.log2dim === UPPER_LOG2DIM ? LOWER_TOTAL : LEAF_TOTAL
      const numValues = node.log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
      const dim = 1 << childTotal
      for (let n = 0; n < numValues; ++n) {
        if (maskIsOn(node.childMask, n)) {
          const child = node.children[n]!
          if ('log2dim' in child) expandTiles(child)
        } else if (maskIsOn(node.valueMask, n)) {
          const o = offsetToGlobalCoord(node, n, childTotal)
          expand(bbox, o[0], o[1], o[2], o[0] + dim - 1, o[1] + dim - 1, o[2] + dim - 1)
        }
      }
    }
    for (const { child } of this.children.values()) expandTiles(child)
    for (const { origin, tile } of this.tiles.values()) {
      if (tile.active) expand(bbox, origin[0], origin[1], origin[2], origin[0] + 4095, origin[1] + 4095, origin[2] + 4095)
    }
    return bbox
  }
}

function expand(bbox: CoordBBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  if (x0 < bbox.min[0]) bbox.min[0] = x0
  if (y0 < bbox.min[1]) bbox.min[1] = y0
  if (z0 < bbox.min[2]) bbox.min[2] = z0
  if (x1 > bbox.max[0]) bbox.max[0] = x1
  if (y1 > bbox.max[1]) bbox.max[1] = y1
  if (z1 > bbox.max[2]) bbox.max[2] = z1
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

function internalActiveTileVoxels(node: VdbInternalNode): number {
  const childTotal = node.log2dim === UPPER_LOG2DIM ? LOWER_TOTAL : LEAF_TOTAL
  const numValues = node.log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
  let count = 0
  for (let n = 0; n < numValues; ++n) {
    if (maskIsOn(node.childMask, n)) {
      const child = node.children[n]!
      if ('log2dim' in child) count += internalActiveTileVoxels(child)
    } else if (maskIsOn(node.valueMask, n)) {
      count += (1 << childTotal) ** 3
    }
  }
  return count
}

function internalCoordToOffset(node: VdbInternalNode, ijk: Coord): number {
  if (node.log2dim === UPPER_LOG2DIM) {
    return (
      ((((ijk[0] & 4095) >> LOWER_TOTAL) << (2 * UPPER_LOG2DIM)) |
        (((ijk[1] & 4095) >> LOWER_TOTAL) << UPPER_LOG2DIM) |
        ((ijk[2] & 4095) >> LOWER_TOTAL)) >>>
      0
    )
  }
  return (
    ((((ijk[0] & 127) >> LEAF_TOTAL) << (2 * LOWER_LOG2DIM)) |
      (((ijk[1] & 127) >> LEAF_TOTAL) << LOWER_LOG2DIM) |
      ((ijk[2] & 127) >> LEAF_TOTAL)) >>>
    0
  )
}

function offsetToGlobalCoord(node: VdbInternalNode, n: number, childTotal: number): Coord {
  const log2 = node.log2dim
  const mask = (1 << log2) - 1
  const x = (n >> (2 * log2)) << childTotal
  const y = ((n >> log2) & mask) << childTotal
  const z = (n & mask) << childTotal
  const originMask = ~((1 << (childTotal + log2)) - 1)
  return [(node.origin[0] & originMask) + x, (node.origin[1] & originMask) + y, (node.origin[2] & originMask) + z]
}

function leafCoordToOffset(ijk: Coord): number {
  return (((ijk[0] & 7) << 6) | ((ijk[1] & 7) << 3) | (ijk[2] & 7)) >>> 0
}

function internalGetValue(node: VdbInternalNode, ijk: Coord, comps: number): Float32Array {
  const n = internalCoordToOffset(node, ijk)
  if (maskIsOn(node.childMask, n)) {
    const child = node.children[n]!
    if ('log2dim' in child) return internalGetValue(child, ijk, comps)
    return child.buffer.subarray(leafCoordToOffset(ijk) * comps, (leafCoordToOffset(ijk) + 1) * comps)
  }
  return node.values.subarray(n * comps, (n + 1) * comps)
}

function internalIsActive(node: VdbInternalNode, ijk: Coord): boolean {
  const n = internalCoordToOffset(node, ijk)
  if (maskIsOn(node.childMask, n)) {
    const child = node.children[n]!
    if ('log2dim' in child) return internalIsActive(child, ijk)
    return maskIsOn(child.valueMask, leafCoordToOffset(ijk))
  }
  return maskIsOn(node.valueMask, n)
}

// ---- write-path helpers (OpenVDB 10.1.0) ----

/** math/Math.h:443-448 isExactlyEqual, component-wise for Vec3f */
export function valuesExactlyEqual(a: ArrayLike<number>, b: ArrayLike<number>, comps: number): boolean {
  for (let c = 0; c < comps; ++c) if (!(a[c] === b[c])) return false
  return true
}

/**
 * tree/InternalNode.h:836-843 InternalNode(origin, value, active): origin
 * rounded down to the node size, every tile `value`, all active or not.
 */
export function newInternalNode(
  ijk: Coord,
  log2dim: number,
  value: ArrayLike<number>,
  active: boolean,
  comps: number,
): VdbInternalNode {
  const total = log2dim === UPPER_LOG2DIM ? UPPER_TOTAL : LOWER_TOTAL
  const numValues = log2dim === UPPER_LOG2DIM ? UPPER_SIZE : LOWER_SIZE
  const mask = ~((1 << total) - 1)
  const values = new Float32Array(numValues * comps)
  for (let n = 0; n < numValues; ++n) for (let c = 0; c < comps; ++c) values[n * comps + c] = value[c]!
  const valueMask = new Uint32Array(numValues >>> 5)
  if (active) valueMask.fill(0xffffffff)
  return {
    origin: [ijk[0] & mask, ijk[1] & mask, ijk[2] & mask],
    log2dim,
    childMask: new Uint32Array(numValues >>> 5),
    valueMask,
    values,
    children: new Array<VdbInternalNode | VdbLeafNode | null>(numValues).fill(null),
  }
}

/** tree/LeafNode.h:915-920 LeafNode(xyz, value, active) */
export function newLeafNode(ijk: Coord, value: ArrayLike<number>, active: boolean, comps: number): VdbLeafNode {
  const buffer = new Float32Array(LEAF_SIZE * comps)
  if (comps === 1) buffer.fill(value[0]!)
  else for (let n = 0; n < LEAF_SIZE; ++n) for (let c = 0; c < comps; ++c) buffer[n * comps + c] = value[c]!
  const valueMask = new Uint32Array(LEAF_SIZE >>> 5)
  if (active) valueMask.fill(0xffffffff)
  return { origin: [ijk[0] & ~7, ijk[1] & ~7, ijk[2] & ~7], valueMask, buffer }
}

/** node offset of ijk in an internal node (InternalNode::coordToOffset) */
export function internalOffset(node: VdbInternalNode, ijk: Coord): number {
  return internalCoordToOffset(node, ijk)
}

/** LeafNode::coordToOffset */
export function leafOffset(ijk: Coord): number {
  return leafCoordToOffset(ijk)
}

export function setMaskOn(mask: Uint32Array, n: number): void {
  mask[n >>> 5] = mask[n >>> 5]! | (1 << (n & 31))
}

export function setMaskOff(mask: Uint32Array, n: number): void {
  mask[n >>> 5] = mask[n >>> 5]! & ~(1 << (n & 31))
}

/** Records nodes visited by a write (ValueAccessor::insert). */
export interface NodeCache {
  insertInternal(node: VdbInternalNode): void
  insertLeaf(leaf: VdbLeafNode): void
}

/**
 * tree/InternalNode.h:1687-1703 setValueOff and 1732-1747 setValueOn (and
 * their AndCache variants, 1707-1729 and 1751-1771), then
 * LeafNode::setValueOn/setValueOff (LeafNode.h:423-431, 1090-1101). A tile
 * becomes a child (setChildNode, 3071-3078) unless it already has the
 * requested state and exactly the value.
 */
export function internalSetValue(
  tree: VdbTree,
  node: VdbInternalNode,
  ijk: Coord,
  value: ArrayLike<number>,
  on: boolean,
  cache: NodeCache | null,
): void {
  const comps = tree.comps
  for (;;) {
    const n = internalCoordToOffset(node, ijk)
    let child = node.children[n] ?? null
    if (!maskIsOn(node.childMask, n)) {
      const active = maskIsOn(node.valueMask, n)
      const tileValue = node.values.subarray(n * comps, (n + 1) * comps)
      const needsChild = on ? !active || !valuesExactlyEqual(tileValue, value, comps) : active || !valuesExactlyEqual(tileValue, value, comps)
      if (!needsChild) return
      if (node.log2dim === UPPER_LOG2DIM) {
        child = newInternalNode(ijk, LOWER_LOG2DIM, tileValue, active, comps)
      } else {
        child = newLeafNode(ijk, tileValue, active, comps)
        tree.leaves.push(child)
      }
      setMaskOn(node.childMask, n)
      setMaskOff(node.valueMask, n)
      node.children[n] = child
    }
    if ('log2dim' in child!) {
      cache?.insertInternal(child)
      node = child
      continue
    }
    const leaf = child!
    cache?.insertLeaf(leaf)
    leafSetValue(leaf, ijk, value, on, comps)
    return
  }
}

/** LeafNode::setValueOn / setValueOff (LeafNode.h:423-431, 1090-1101) */
export function leafSetValue(leaf: VdbLeafNode, ijk: Coord, value: ArrayLike<number>, on: boolean, comps: number): void {
  const n = leafCoordToOffset(ijk)
  if (comps === 1) leaf.buffer[n] = value[0]!
  else for (let c = 0; c < comps; ++c) leaf.buffer[n * comps + c] = value[c]!
  if (on) setMaskOn(leaf.valueMask, n)
  else setMaskOff(leaf.valueMask, n)
}

/** tree/InternalNode.h:1627-1653 probeValue(AndCache) */
export function internalProbeValue(
  node: VdbInternalNode,
  ijk: Coord,
  comps: number,
  out: Float32Array,
  offset: number,
  cache: NodeCache | null = null,
): boolean {
  for (;;) {
    const n = internalCoordToOffset(node, ijk)
    if (maskIsOn(node.childMask, n)) {
      const child = node.children[n]!
      if ('log2dim' in child) {
        cache?.insertInternal(child)
        node = child
        continue
      }
      cache?.insertLeaf(child)
      const m = leafCoordToOffset(ijk)
      if (comps === 1) out[offset] = child.buffer[m]!
      else for (let c = 0; c < comps; ++c) out[offset + c] = child.buffer[m * comps + c]!
      return maskIsOn(child.valueMask, m)
    }
    if (comps === 1) out[offset] = node.values[n]!
    else for (let c = 0; c < comps; ++c) out[offset + c] = node.values[n * comps + c]!
    return maskIsOn(node.valueMask, n)
  }
}

/** tree/InternalNode.h:1561-1588 isValueOn(AndCache) */
export function internalIsValueOn(node: VdbInternalNode, ijk: Coord, cache: NodeCache | null = null): boolean {
  for (;;) {
    const n = internalCoordToOffset(node, ijk)
    if (!maskIsOn(node.childMask, n)) return maskIsOn(node.valueMask, n)
    const child = node.children[n]!
    if ('log2dim' in child) {
      cache?.insertInternal(child)
      node = child
      continue
    }
    cache?.insertLeaf(child)
    return maskIsOn(child.valueMask, leafCoordToOffset(ijk))
  }
}
