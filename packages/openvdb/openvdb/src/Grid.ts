// Ported from OpenVDB 13.0.1: openvdb/openvdb/Grid.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// With additions ported from OpenVDB 10.1.0: openvdb/openvdb/Grid.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This file contains code ported from OpenVDB 10.1.0 and is licensed under the
//  Mozilla Public License 2.0 as a whole. This Source Code Form is subject to
//  the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was
//  not distributed with this file, You can obtain one at
//  https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/Grid.h (read side): a tree + transform + grid metadata.
// Value access goes through the tree; the class surfaces the GridBase API
// the read scope needs (getName, getGridClass, transform, etc.).

import type { Coord, CoordBBox, Vec3 } from '@vdb/nanovdb'
import { MetaMap } from './MetaMap.ts'
import { Transform } from './math/Transform.ts'
import { VdbTree } from './tree/Tree.ts'

export enum GridClass {
  Unknown = 0,
  LevelSet = 1,
  FogVolume = 2,
  Staggered = 3,
}

export const GRID_CLASS_STRINGS: Record<GridClass, string> = {
  [GridClass.Unknown]: 'unknown',
  [GridClass.LevelSet]: 'level set',
  [GridClass.FogVolume]: 'fog volume',
  [GridClass.Staggered]: 'staggered',
}

export class VdbGrid extends MetaMap {
  tree: VdbTree
  transform: Transform | null = null
  saveFloatAsHalf = false

  constructor(
    /** tree type string from the descriptor, e.g. "Tree_float_5_4_3" */
    readonly type: string,
    comps: number,
  ) {
    super()
    this.tree = new VdbTree(comps)
  }

  /**
   * Grid<TreeT>::create(background) (openvdb/Grid.h, OpenVDB 10.1.0): an
   * empty grid with the given background and, if given, transform (as
   * setTransform; upstream's default is the identity linear transform).
   */
  static create(type: string, comps: number, background?: ArrayLike<number>, transform?: Transform): VdbGrid {
    const grid = new VdbGrid(type, comps)
    if (background) grid.tree.setBackground(background)
    if (transform) grid.transform = transform
    return grid
  }

  /** "float" or "vec3s" (upstream GridBase::valueType) */
  valueType(): string {
    const m = /^Tree_([^_]+)_/.exec(this.type)
    return m ? m[1]! : this.type
  }

  getName(): string {
    const meta = this.getMetadata('name')
    return meta && typeof meta.value === 'string' ? meta.value : ''
  }

  getGridClass(): GridClass {
    const meta = this.getMetadata('class')
    const str = meta && typeof meta.value === 'string' ? meta.value : ''
    for (const [k, v] of Object.entries(GRID_CLASS_STRINGS)) {
      if (v === str) return Number(k) as GridClass
    }
    return GridClass.Unknown
  }

  voxelSize(): Vec3 {
    if (!this.transform) throw new Error('grid transform has not been read')
    return this.transform.voxelSize()
  }

  indexToWorld(xyz: Vec3): Vec3 {
    if (!this.transform) throw new Error('grid transform has not been read')
    return this.transform.indexToWorld(xyz)
  }

  worldToIndex(xyz: Vec3): Vec3 {
    if (!this.transform) throw new Error('grid transform has not been read')
    return this.transform.worldToIndex(xyz)
  }

  activeVoxelCount(): number {
    return this.tree.activeVoxelCount()
  }

  evalActiveVoxelBoundingBox(): CoordBBox {
    return this.tree.evalActiveVoxelBoundingBox()
  }

  /** scalar value at ijk (float grids) */
  getValue(ijk: Coord): number {
    return this.tree.getValue(ijk)[0]!
  }

  /** vector value at ijk (Vec3f grids) */
  getVec3(ijk: Coord): Vec3 {
    const v = this.tree.getValue(ijk)
    return [v[0]!, v[1]!, v[2]!]
  }

  isActive(ijk: Coord): boolean {
    return this.tree.isActive(ijk)
  }

  background(): Float32Array {
    return this.tree.background
  }
}

/** tree-type string -> component count; the V2 read scope supports these */
export function compsForGridType(gridType: string): number {
  if (gridType === 'Tree_float_5_4_3') return 1
  if (gridType === 'Tree_vec3s_5_4_3') return 3
  throw new Error(`grid type ${gridType} is not supported (V2 supports float and vec3s 5-4-3 trees)`)
}
