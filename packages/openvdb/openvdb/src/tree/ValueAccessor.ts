// Ported from OpenVDB 10.1.0: openvdb/openvdb/tree/ValueAccessor.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This Source Code Form is subject to the terms of the Mozilla Public License,
//  v. 2.0. If a copy of the MPL was not distributed with this file, You can
//  obtain one at https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/tree/ValueAccessor.h (ValueAccessor3 for a 5-4-3 tree)
// from OpenVDB 10.1.0, the version OpenUSD 26.11.1's reference build links.
//
// The accessor caches the last leaf, lower and upper internal node visited
// (ValueAccessor3::insert) and starts a lookup at the lowest cached node
// containing the voxel; results are those of the uncached tree methods.

import type { Coord } from '@vdb/nanovdb'
import { maskIsOn } from '../io/Compression.ts'
import {
  UPPER_LOG2DIM,
  VdbTree,
  internalIsValueOn,
  internalProbeValue,
  internalSetValue,
  leafOffset,
  leafSetValue,
  type NodeCache,
  type VdbInternalNode,
  type VdbLeafNode,
} from './Tree.ts'

export class ValueAccessor implements NodeCache {
  private leaf: VdbLeafNode | null = null
  private lower: VdbInternalNode | null = null
  private upper: VdbInternalNode | null = null

  constructor(readonly tree: VdbTree) {}

  /** ValueAccessor::clear */
  clear(): void {
    this.leaf = this.lower = this.upper = null
  }

  insertInternal(node: VdbInternalNode): void {
    if (node.log2dim === UPPER_LOG2DIM) this.upper = node
    else this.lower = node
  }

  insertLeaf(leaf: VdbLeafNode): void {
    this.leaf = leaf
  }

  private cachedLeaf(ijk: Coord): VdbLeafNode | null {
    const l = this.leaf
    return l && (ijk[0] & ~7) === l.origin[0] && (ijk[1] & ~7) === l.origin[1] && (ijk[2] & ~7) === l.origin[2]
      ? l
      : null
  }

  private cachedInternal(ijk: Coord): VdbInternalNode | null {
    const lo = this.lower
    if (lo && (ijk[0] & ~127) === lo.origin[0] && (ijk[1] & ~127) === lo.origin[1] && (ijk[2] & ~127) === lo.origin[2]) {
      return lo
    }
    const up = this.upper
    if (up && (ijk[0] & ~4095) === up.origin[0] && (ijk[1] & ~4095) === up.origin[1] && (ijk[2] & ~4095) === up.origin[2]) {
      return up
    }
    return null
  }

  private rootChild(ijk: Coord): VdbInternalNode | null {
    const entry = this.tree.children.get(VdbTree.rootKey(ijk))
    if (!entry) return null
    this.upper = entry.child
    return entry.child
  }

  /** ValueAccessor::probeValue: value into out[offset ..], returns the active state */
  probeValue(ijk: Coord, out: Float32Array, offset = 0): boolean {
    const comps = this.tree.comps
    const leaf = this.cachedLeaf(ijk)
    if (leaf) {
      const n = leafOffset(ijk)
      if (comps === 1) out[offset] = leaf.buffer[n]!
      else for (let c = 0; c < comps; ++c) out[offset + c] = leaf.buffer[n * comps + c]!
      return maskIsOn(leaf.valueMask, n)
    }
    const node = this.cachedInternal(ijk) ?? this.rootChild(ijk)
    if (node) return internalProbeValue(node, ijk, comps, out, offset, this)
    return this.tree.probeValue(ijk, out, offset)
  }

  /** ValueAccessor::isValueOn */
  isValueOn(ijk: Coord): boolean {
    const leaf = this.cachedLeaf(ijk)
    if (leaf) return maskIsOn(leaf.valueMask, leafOffset(ijk))
    const node = this.cachedInternal(ijk) ?? this.rootChild(ijk)
    if (node) return internalIsValueOn(node, ijk, this)
    return this.tree.isValueOn(ijk)
  }

  /** ValueAccessor::setValue (= setValueOn) */
  setValueOn(ijk: Coord, value: ArrayLike<number>): void {
    this.setValue(ijk, value, true)
  }

  /** ValueAccessor::setValueOff */
  setValueOff(ijk: Coord, value: ArrayLike<number>): void {
    this.setValue(ijk, value, false)
  }

  private setValue(ijk: Coord, value: ArrayLike<number>, on: boolean): void {
    const leaf = this.cachedLeaf(ijk)
    if (leaf) {
      leafSetValue(leaf, ijk, value, on, this.tree.comps)
      return
    }
    let node = this.cachedInternal(ijk)
    if (!node) {
      node = this.tree.rootChildForWrite(ijk, value, on)
      if (!node) return
      this.upper = node
    }
    internalSetValue(this.tree, node, ijk, value, on, this)
  }
}
