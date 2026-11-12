// Ported from OpenUSD 26.11.1: pxr/imaging/hd/smoothNormals.cpp,
//  pxr/imaging/hd/smoothNormals.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/smoothNormals.{h,cpp} (OpenUSD 26.11.1).
//
// Hd_SmoothNormals encapsulates mesh smooth normals information. It uses
// passed-in adjacency information and points data to compute smooth
// per-vertex normals. It does this by averaging face normals of faces
// surrounding a vertex.
//
// Deliberate divergences:
// - `GfVec3f const *` / `GfVec3d const *` points are a Float32Array /
//   Float64Array of packed components; the overload is chosen by the array
//   type, as C++ chooses it by the pointer type. Float math rounds every
//   step with Math.fround to reproduce single precision.
// - WorkParallelForN runs serially.

import {
  Array as VtArray,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import { type Vec3f as GfVec3f, type Vec3d as GfVec3d } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import type { Hd_VertexAdjacency } from './vertexAdjacency.ts'
import { HdVec4f_2_10_10_10_REV } from './types.ts'

/** gf/limits.h GF_MIN_VECTOR_LENGTH */
const GF_MIN_VECTOR_LENGTH = 1e-10

/** The TfType of HdVec4f_2_10_10_10_REV, for VtArrays of packed normals. */
export const Hd_Vec4f_2_10_10_10_REVType = TfType.declare('HdVec4f_2_10_10_10_REV')

/** GfVec3{f,d}::Normalize (gf/vec3f.h:273-279): `*this /= (length > eps) ?
 *  length : eps`, where operator/= multiplies by 1.0 / s. Normalizes
 *  `n` in place. */
export function Hd_NormalizeVec3(n: Float64Array, single: boolean): void {
  const f = single ? Math.fround : (x: number) => x
  const length = f(Math.sqrt(f(f(f(n[0]! * n[0]!) + f(n[1]! * n[1]!)) + f(n[2]! * n[2]!))))
  const eps = f(GF_MIN_VECTOR_LENGTH)
  const s = 1.0 / (length > eps ? length : eps)
  n[0] = f(n[0]! * s)
  n[1] = f(n[1]! * s)
  n[2] = f(n[2]! * s)
}

/** `normal += GfCross(a1 - a0, b1 - b0) * scale` on packed components. */
export function Hd_AccumulateCross(
  normal: Float64Array, p: ArrayLike<number>, single: boolean,
  a1: number, a0: number, b1: number, b0: number, scale = 1,
): void {
  const f = single ? Math.fround : (x: number) => x
  const ax = f(p[a1 * 3]! - p[a0 * 3]!), ay = f(p[a1 * 3 + 1]! - p[a0 * 3 + 1]!), az = f(p[a1 * 3 + 2]! - p[a0 * 3 + 2]!)
  const bx = f(p[b1 * 3]! - p[b0 * 3]!), by = f(p[b1 * 3 + 1]! - p[b0 * 3 + 1]!), bz = f(p[b1 * 3 + 2]! - p[b0 * 3 + 2]!)
  // GfCross (gf/vec3f.h:353-358)
  const cx = f(f(ay * bz) - f(az * by))
  const cy = f(f(az * bx) - f(ax * bz))
  const cz = f(f(ax * by) - f(ay * bx))
  normal[0] = f(normal[0]! + f(cx * scale))
  normal[1] = f(normal[1]! + f(cy * scale))
  normal[2] = f(normal[2]! + f(cz * scale))
}

/** smoothNormals.cpp:17-57 _SmoothNormalsWorker::Compute, writing each
 *  normal through `store`. */
function _ComputeSmoothNormalsWorker(
  numPoints: number,
  pointsPtr: ArrayLike<number>,
  adjacencyTable: ArrayLike<number>,
  single: boolean,
  store: (i: number, normal: Float64Array) => void,
): void {
  const normal = new Float64Array(3)
  for (let i = 0; i < numPoints; ++i) {
    const offsetIdx = i * 2
    const offset = adjacencyTable[offsetIdx]!
    const valence = adjacencyTable[offsetIdx + 1]!

    let e = offset
    normal.fill(0)
    for (let j = 0; j < valence; ++j) {
      const prev = adjacencyTable[e++]!
      const next = adjacencyTable[e++]!
      // All meshes have all been converted to rightHanded
      Hd_AccumulateCross(normal, pointsPtr, single, next, i, prev, i)
    }
    if (true) { // Could defer normalization to shader code
      Hd_NormalizeVec3(normal, single)
    }
    store(i, normal)
  }
}

/** smoothNormals.cpp:59-83 */
function _ComputeSmoothNormals(
  numPoints: number, pointsPtr: Float32Array | Float64Array,
  adjacencyTable: ArrayLike<number>, numAdjPoints: number,
): Float32Array | Float64Array {
  // to be safe.
  // numPoints of input pointer could be different from the number of points
  // in adjacency table.
  numPoints = Math.min(numPoints, numAdjPoints)
  const single = pointsPtr instanceof Float32Array
  const normals = single ? new Float32Array(numPoints * 3) : new Float64Array(numPoints * 3)
  _ComputeSmoothNormalsWorker(numPoints, pointsPtr, adjacencyTable, single, (i, n) => {
    normals[i * 3] = n[0]!
    normals[i * 3 + 1] = n[1]!
    normals[i * 3 + 2] = n[2]!
  })
  return normals
}

/** smoothNormals.cpp:59-83 with DstType = HdVec4f_2_10_10_10_REV. */
function _ComputeSmoothNormalsPacked(
  numPoints: number, pointsPtr: Float32Array | Float64Array,
  adjacencyTable: ArrayLike<number>, numAdjPoints: number,
): HdVec4f_2_10_10_10_REV[] {
  numPoints = Math.min(numPoints, numAdjPoints)
  const single = pointsPtr instanceof Float32Array
  const normals = new Array<HdVec4f_2_10_10_10_REV>(numPoints)
  _ComputeSmoothNormalsWorker(numPoints, pointsPtr, adjacencyTable, single, (i, n) => {
    normals[i] = new HdVec4f_2_10_10_10_REV([n[0]!, n[1]!, n[2]!])
  })
  return normals
}

/** smoothNormals.h:22-59 */
export class Hd_SmoothNormals {
  private constructor() {}

  /** smoothNormals.cpp:85-105. Computes the smooth normals result using the
   *  supplied adjacency information and points data. Returns an array of the
   *  same size and type as the source points. */
  static computeSmoothNormals(
    adjacency: Hd_VertexAdjacency, numPoints: number, pointsPtr: Float32Array,
  ): VtArray<GfVec3f>
  static computeSmoothNormals(
    adjacency: Hd_VertexAdjacency, numPoints: number, pointsPtr: Float64Array,
  ): VtArray<GfVec3d>
  static computeSmoothNormals(
    adjacency: Hd_VertexAdjacency, numPoints: number, pointsPtr: Float32Array | Float64Array,
  ): VtArray<GfVec3f> | VtArray<GfVec3d> {
    const normals = _ComputeSmoothNormals(numPoints, pointsPtr,
      adjacency.getAdjacencyTable(), adjacency.getNumPoints())
    return normals instanceof Float32Array
      ? VtArray._adopt<GfVec3f>(VtValueTypes.GfVec3f, normals)
      : VtArray._adopt<GfVec3d>(VtValueTypes.GfVec3d, normals)
  }

  /** smoothNormals.cpp:107-129. Packed (HdVec4f_2_10_10_10_REV) variant. */
  static computeSmoothNormalsPacked(
    adjacency: Hd_VertexAdjacency, numPoints: number, pointsPtr: Float32Array | Float64Array,
  ): VtArray<HdVec4f_2_10_10_10_REV> {
    return new VtArray<HdVec4f_2_10_10_10_REV>(
      _ComputeSmoothNormalsPacked(numPoints, pointsPtr,
        adjacency.getAdjacencyTable(), adjacency.getNumPoints()),
      Hd_Vec4f_2_10_10_10_REVType)
  }
}
