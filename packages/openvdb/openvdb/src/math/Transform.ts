// Ported from OpenVDB 13.0.1: openvdb/openvdb/math/Transform.h,
//  openvdb/openvdb/math/Transform.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// With additions ported from OpenVDB 10.1.0: openvdb/openvdb/math/Transform.h,
//  openvdb/openvdb/math/Transform.cc
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This file contains code ported from OpenVDB 10.1.0 and is licensed under the
//  Mozilla Public License 2.0 as a whole. This Source Code Form is subject to
//  the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was
//  not distributed with this file, You can obtain one at
//  https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/math/Transform.h/.cc (read side): a thin wrapper holding
// the grid's map. Serialized as the map type name followed by the map data.
//
// createLinearTransform, isLinear and equals are ported from OpenVDB 10.1.0
// (the version OpenUSD 26.11.1's reference build links), math/Transform.cc.

import { AffineMap, readMap, simplify, type MapBase } from './Maps.ts'
import { vec3Eq } from './Mat4.ts'
import type { Stream } from '../io/Stream.ts'
import type { Vec3 } from '@vdb/nanovdb'

export class Transform {
  constructor(readonly baseMap: MapBase) {}

  static read(s: Stream): Transform {
    return new Transform(readMap(s))
  }

  /**
   * math/Transform.cc:49-53 createLinearTransform(const Mat4R&): an AffineMap
   * of `mat4` (16 doubles, row-major, row-vector convention: translation in
   * elements 12..14), simplified by the Transform constructor
   * (Transform.cc:21-29) to a (Uniform)Scale(Translate)Map when it is one.
   */
  static createLinearTransform(mat4: number[]): Transform {
    return new Transform(simplify(AffineMap.fromMat4(mat4)))
  }

  mapType(): string {
    return this.baseMap.type
  }

  /** math/Transform.h isLinear: baseMap()->isLinear() */
  isLinear(): boolean {
    return this.baseMap.isLinear()
  }

  /** math/Transform.cc:430-446 operator== */
  equals(other: Transform): boolean {
    if (!vec3Eq(this.voxelSize(), other.voxelSize())) return false
    if (this.mapType() === other.mapType()) return this.baseMap.isEqual(other.baseMap)
    if (this.isLinear() && other.isLinear()) {
      // promote both maps to mat4 form and compare
      return this.baseMap.getAffineMap().isEqual(other.baseMap.getAffineMap())
    }
    return this.baseMap.isEqual(other.baseMap)
  }

  indexToWorld(xyz: Vec3): Vec3 {
    return this.baseMap.applyMap(xyz)
  }

  worldToIndex(xyz: Vec3): Vec3 {
    return this.baseMap.applyInverseMap(xyz)
  }

  voxelSize(): Vec3 {
    return this.baseMap.voxelSize()
  }
}
