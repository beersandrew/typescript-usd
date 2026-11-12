// Ported from OpenVDB 10.1.0: openvdb/openvdb/tools/Dense.h,
//  openvdb/openvdb/tree/RootNode.h, openvdb/openvdb/tree/InternalNode.h,
//  openvdb/openvdb/tree/LeafNode.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This Source Code Form is subject to the terms of the Mozilla Public License,
//  v. 2.0. If a copy of the MPL was not distributed with this file, You can
//  obtain one at https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/tools/Dense.h copyToDense (CopyToDense over a
// Dense<ValueT, LayoutXYZ>) from OpenVDB 10.1.0, the version OpenUSD
// 26.11.1's reference build links, with the node methods it calls:
// RootNode::copyToDense (tree/RootNode.h:2270-2305), InternalNode::
// copyToDense (tree/InternalNode.h:2134-2170) and LeafNode::copyToDense
// (tree/LeafNode.h:1212-1236).
//
// The dense grid is a Float32Array of `tree.comps` floats per voxel in
// LayoutXYZ order (tools/Dense.h:126-167): x varies fastest, the value of
// (i, j, k) relative to bbox.min is at i + j*dimX + k*dimX*dimY. Every voxel
// of bbox is written, active or not: leaf voxels, tile values and, outside
// the tree's nodes, the background.
//
// Upstream runs CopyToDense::copy with tbb::parallel_for over sub-boxes of
// the dense bbox; the boxes do not overlap, so this serial copy writes the
// same values.

import type { CoordBBox } from '@vdb/nanovdb'
import { maskIsOn } from '../io/Compression.ts'
import { LEAF_TOTAL, LOWER_TOTAL, UPPER_LOG2DIM, VdbTree, type VdbInternalNode, type VdbLeafNode } from '../tree/Tree.ts'

interface DenseTarget {
  data: Float32Array
  comps: number
  min: [number, number, number]
  yStride: number
  zStride: number
}

/**
 * tools/Dense.h:419-428 copyToDense(sparse, dense): copy every voxel of
 * `bbox` (inclusive; an empty box gives an empty array) from `tree`.
 */
export function copyToDense(tree: VdbTree, bbox: CoordBBox): Float32Array {
  const min = bbox.min
  const max = bbox.max
  if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) return new Float32Array(0)
  const dimX = max[0] - min[0] + 1
  const dimY = max[1] - min[1] + 1
  const dimZ = max[2] - min[2] + 1
  const comps = tree.comps
  // DenseBase<ValueT, LayoutXYZ>: mY = dim[0], mZ = mY * dim[1]
  const dense: DenseTarget = {
    data: new Float32Array(dimX * dimY * dimZ * comps),
    comps,
    min: [min[0], min[1], min[2]],
    yStride: dimX,
    zStride: dimX * dimY,
  }
  rootCopyToDense(tree, min[0], min[1], min[2], max[0], max[1], max[2], dense)
  return dense.data
}

/** fill the dense voxels of an (absolute, inclusive) sub-box with one value */
function fill(
  dense: DenseTarget,
  value: ArrayLike<number>,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): void {
  const { data, comps, min, yStride, zStride } = dense
  for (let z = z0; z <= z1; ++z) {
    for (let y = y0; y <= y1; ++y) {
      const row = (x0 - min[0]) + (y - min[1]) * yStride + (z - min[2]) * zStride
      const n = x1 - x0 + 1
      if (comps === 1) {
        data.fill(value[0]!, row, row + n)
      } else {
        for (let i = 0; i < n; ++i) for (let c = 0; c < comps; ++c) data[(row + i) * comps + c] = value[c]!
      }
    }
  }
}

/** tree/RootNode.h:2270-2305: walk the bbox in root-child-sized blocks */
function rootCopyToDense(
  tree: VdbTree,
  bx0: number, by0: number, bz0: number,
  bx1: number, by1: number, bz1: number,
  dense: DenseTarget,
): void {
  const DIM = 4096
  for (let x = bx0; x <= bx1; ) {
    const nx = (x & ~(DIM - 1)) + DIM - 1
    for (let y = by0; y <= by1; ) {
      const ny = (y & ~(DIM - 1)) + DIM - 1
      for (let z = bz0; z <= bz1; ) {
        const nz = (z & ~(DIM - 1)) + DIM - 1
        const sx1 = Math.min(bx1, nx), sy1 = Math.min(by1, ny), sz1 = Math.min(bz1, nz)
        const key = VdbTree.rootKey([x, y, z])
        const entry = tree.children.get(key)
        if (entry) {
          internalCopyToDense(entry.child, x, y, z, sx1, sy1, sz1, dense)
        } else {
          const tile = tree.tiles.get(key)
          fill(dense, tile ? tile.tile.value : tree.background, x, y, z, sx1, sy1, sz1)
        }
        z = nz + 1
      }
      y = ny + 1
    }
    x = nx + 1
  }
}

/** tree/InternalNode.h:2134-2170: walk the bbox in child-sized blocks */
function internalCopyToDense(
  node: VdbInternalNode,
  bx0: number, by0: number, bz0: number,
  bx1: number, by1: number, bz1: number,
  dense: DenseTarget,
): void {
  const log2 = node.log2dim
  const childTotal = log2 === UPPER_LOG2DIM ? LOWER_TOTAL : LEAF_TOTAL
  const total = childTotal + log2
  const childDim = 1 << childTotal
  const localMask = (1 << total) - 1
  const comps = dense.comps
  for (let x = bx0; x <= bx1; ) {
    const nx = (x & ~(childDim - 1)) + childDim - 1
    for (let y = by0; y <= by1; ) {
      const ny = (y & ~(childDim - 1)) + childDim - 1
      for (let z = bz0; z <= bz1; ) {
        const nz = (z & ~(childDim - 1)) + childDim - 1
        const sx1 = Math.min(bx1, nx), sy1 = Math.min(by1, ny), sz1 = Math.min(bz1, nz)
        const n =
          (((x & localMask) >> childTotal) << (2 * log2)) |
          (((y & localMask) >> childTotal) << log2) |
          ((z & localMask) >> childTotal)
        if (maskIsOn(node.childMask, n)) {
          const child = node.children[n]!
          if ('log2dim' in child) internalCopyToDense(child, x, y, z, sx1, sy1, sz1, dense)
          else leafCopyToDense(child, x, y, z, sx1, sy1, sz1, dense)
        } else {
          fill(dense, node.values.subarray(n * comps, (n + 1) * comps), x, y, z, sx1, sy1, sz1)
        }
        z = nz + 1
      }
      y = ny + 1
    }
    x = nx + 1
  }
}

/** tree/LeafNode.h:1212-1236 */
function leafCopyToDense(
  leaf: VdbLeafNode,
  bx0: number, by0: number, bz0: number,
  bx1: number, by1: number, bz1: number,
  dense: DenseTarget,
): void {
  const { data, comps, min, yStride, zStride } = dense
  const buf = leaf.buffer
  for (let x = bx0; x <= bx1; ++x) {
    const sx = (x & 7) << 6
    const tx = x - min[0]
    for (let y = by0; y <= by1; ++y) {
      const sxy = sx | ((y & 7) << 3)
      let t = tx + (y - min[1]) * yStride + (bz0 - min[2]) * zStride
      if (comps === 1) {
        for (let z = bz0; z <= bz1; ++z, t += zStride) data[t] = buf[sxy | (z & 7)]!
      } else {
        for (let z = bz0; z <= bz1; ++z, t += zStride) {
          const s = (sxy | (z & 7)) * comps
          for (let c = 0; c < comps; ++c) data[t * comps + c] = buf[s + c]!
        }
      }
    }
  }
}
