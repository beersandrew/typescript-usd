// Ported from OpenUSD 26.11.1: pxr/imaging/hd/flatNormals.cpp,
//  pxr/imaging/hd/flatNormals.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flatNormals.{h,cpp} (OpenUSD 26.11.1).
//
// Hd_FlatNormals encapsulates mesh flat normals information. It uses
// passed-in face index data and points data to compute flat per-face
// normals. It does this by breaking each face into a triangle fan centered at
// vertex 0, and averaging triangle normals.
//
// Deliberate divergences:
// - `GfVec3f const *` / `GfVec3d const *` points are a Float32Array /
//   Float64Array of packed components; the overload is chosen by the array
//   type. Float math rounds every step with Math.fround.
// - WorkParallelForN runs serially.

import {
  Array as VtArray,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import { type Vec3f as GfVec3f, type Vec3d as GfVec3d } from 'typescript-usd/gf'
import type { HdMeshTopology } from './meshTopology.ts'
import { HdTokens } from './tokens.ts'
import { HdVec4f_2_10_10_10_REV } from './types.ts'
import {
  Hd_AccumulateCross, Hd_NormalizeVec3, Hd_Vec4f_2_10_10_10_REVType,
} from './smoothNormals.ts'

/** flatNormals.cpp:17-61 _FlatNormalsWorker::Compute and
 *  flatNormals.cpp:63-89 _ComputeFlatNormals, writing each normal through
 *  `store`. */
function _ComputeFlatNormals(
  topology: HdMeshTopology,
  points: Float32Array | Float64Array,
  store: (i: number, normal: Float64Array) => void,
): number {
  const faceCounts = topology.getFaceVertexCounts()
  const numFaces = faceCounts.length

  const faceOffsets = new Int32Array(numFaces)
  let offset = 0
  for (let i = 0; i < numFaces; ++i) {
    faceOffsets[i] = offset
    offset += faceCounts[i]!
  }
  const faceIndices = topology.getFaceVertexIndices()
  const flip = topology.getOrientation() !== HdTokens.rightHanded
  const single = points instanceof Float32Array

  const normal = new Float64Array(3)
  for (let i = 0; i < numFaces; ++i) {
    normal.fill(0)
    const faceOffset = faceOffsets[i]!
    const count = faceCounts[i]!

    const v0 = faceIndices[faceOffset + 0]!
    for (let j = 2; j < count; ++j) {
      const v1 = faceIndices[faceOffset + j - 1]!
      const v2 = faceIndices[faceOffset + j]!
      Hd_AccumulateCross(normal, points, single, v1, v0, v2, v0, flip ? -1.0 : 1.0)
    }
    if (true) { // could defer normalization to shader code
      Hd_NormalizeVec3(normal, single)
    }
    store(i, normal)
  }
  return numFaces
}

/** flatNormals.h:23-56 */
export class Hd_FlatNormals {
  private constructor() {}

  /** flatNormals.cpp:91-107. Computes the flat normals result using the
   *  supplied face coord information and points data. Returns an array of
   *  the same type as the source points, one normal per face. */
  static computeFlatNormals(topology: HdMeshTopology, pointsPtr: Float32Array): VtArray<GfVec3f>
  static computeFlatNormals(topology: HdMeshTopology, pointsPtr: Float64Array): VtArray<GfVec3d>
  static computeFlatNormals(
    topology: HdMeshTopology, pointsPtr: Float32Array | Float64Array,
  ): VtArray<GfVec3f> | VtArray<GfVec3d> {
    const numFaces = topology.getFaceVertexCounts().length
    const single = pointsPtr instanceof Float32Array
    const normals = single ? new Float32Array(numFaces * 3) : new Float64Array(numFaces * 3)
    _ComputeFlatNormals(topology, pointsPtr, (i, n) => {
      normals[i * 3] = n[0]!
      normals[i * 3 + 1] = n[1]!
      normals[i * 3 + 2] = n[2]!
    })
    return normals instanceof Float32Array
      ? VtArray._adopt<GfVec3f>(VtValueTypes.GfVec3f, normals)
      : VtArray._adopt<GfVec3d>(VtValueTypes.GfVec3d, normals)
  }

  /** flatNormals.cpp:109-127. Packed (HdVec4f_2_10_10_10_REV) variant. */
  static computeFlatNormalsPacked(
    topology: HdMeshTopology, pointsPtr: Float32Array | Float64Array,
  ): VtArray<HdVec4f_2_10_10_10_REV> {
    const normals = new Array<HdVec4f_2_10_10_10_REV>(topology.getFaceVertexCounts().length)
    _ComputeFlatNormals(topology, pointsPtr, (i, n) => {
      normals[i] = new HdVec4f_2_10_10_10_REV([n[0]!, n[1]!, n[2]!])
    })
    return new VtArray<HdVec4f_2_10_10_10_REV>(normals, Hd_Vec4f_2_10_10_10_REVType)
  }
}
