// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/utils.cpp,
//  pxr/usdImaging/usdSkelImaging/utils.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/utils.{h,cpp} (OpenUSD 26.11.1):
// the bone mesh utilities.
//
// Divergences:
// - Out-parameters are return values: UsdSkelImagingComputeBoneTopology
//   returns { meshTopology, numPoints } (undefined where upstream returns
//   false); the point/joint-index overloads taking raw pointers write into a
//   caller-provided array at an offset.
// - VtIntArray is a plain number array (hd/src/dataSourceTypeDefs.ts).
// - _ParallelForN is serial.

import { Vec3d as GfVec3d, Vec3f as GfVec3f, GfDot, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as HdMeshTopology, Tokens as HdTokens } from 'typescript-usd/hd'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import type { Topology as UsdSkelTopology } from 'typescript-usd/usdSkel'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'

/*
  utils.cpp:25-42.
  Bones are constructed from child to parent as a pyramid-shaped
  object with square base at the parent and tip at the child.
*/
const _boneVerts = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4]
const _boneNumVerts = 12
const _boneNumVertsPerFace = 3
const _boneNumFaces = 4
const _boneNumPoints = 5

/** utils.cpp:44-55 */
function _ComputeBoneCount(topology: UsdSkelTopology): number {
  const numJoints = topology.getNumJoints()
  let numBones = 0
  for (let i = 0; i < topology.getNumJoints(); ++i) {
    const parent = topology.getParent(i)
    numBones += (parent >= 0 && parent < numJoints) ? 1 : 0
  }
  return numBones
}

/** utils.h:33-40, utils.cpp:59-93. Compute mesh topology for imaging
 *  `skelTopology`. The number of points that the mesh is expected to have
 *  are returned in numPoints. */
export function UsdSkelImagingComputeBoneTopology(
  skelTopology: UsdSkelTopology,
): { meshTopology: HdMeshTopology, numPoints: number } {
  const numBones = _ComputeBoneCount(skelTopology)

  const faceVertexCounts: number[] = new Array(numBones * _boneNumFaces).fill(_boneNumVertsPerFace)
  const faceVertexIndices: number[] = new Array(numBones * _boneNumVerts)

  for (let i = 0; i < numBones; ++i) {
    for (let j = 0; j < _boneNumVerts; ++j) {
      faceVertexIndices[i * _boneNumVerts + j] = _boneVerts[j]! + i * _boneNumPoints
    }
  }

  const meshTopology = new HdMeshTopology(PxOsdOpenSubdivTokens.none,
    HdTokens.rightHanded,
    faceVertexCounts,
    faceVertexIndices)
  return { meshTopology, numPoints: numBones * _boneNumPoints }
}

/** utils.cpp:114-129. Return the index of the basis of `mx` that is best
 *  aligned with `dir`. This assumes that `mx` is orthogonal. */
function _FindBestAlignedBasis(mx: GfMatrix4d, dir: GfVec3d): number {
  const PI_4 = Math.fround(Math.fround(Math.PI) / 4.0)
  for (let i = 0; i < 2; ++i) {
    // If the transform is orthogonal, the best aligned
    // basis has an absolute dot product > PI/4.
    if (Math.abs(GfDot(mx.getRow3(i), dir)) > PI_4) {
      return i
    }
  }
  // Assume it's the last basis...
  return 2
}

/** utils.h:80-88, utils.cpp:133-169. Compute mesh points for imaging a
 *  single bone of a skeleton: the 5 points written to `points` at `offset`.
 *
 *  A bone corresponds to a joint that has a parent joint. The input to this
 *  function is the transform of that joint and parent joint. */
export function UsdSkelImagingComputePointsForSingleBone(
  xform: GfMatrix4d,
  parentXform: GfMatrix4d,
  points: GfVec3f[],
  offset = 0,
): void {
  const end = new GfVec3f(xform.extractTranslation())
  const start = new GfVec3f(parentXform.extractTranslation())

  // Need local basis vectors along which to displace the
  // base of the bone. Use whichever basis vectors of the
  // target xform are best aligned with the direction of the bone.
  const boneDir = end.subtract(start)

  const iAxis = [1, 0, 0]
  const jAxis = [2, 2, 1]

  // XXX: This is pretty expensive at scale. Alternatives?
  const principleAxis =
    _FindBestAlignedBasis(parentXform, new GfVec3d(boneDir.GetNormalized()))

  let i = new GfVec3f(parentXform.getRow3(iAxis[principleAxis]!)).GetNormalized()
  let j = new GfVec3f(parentXform.getRow3(jAxis[principleAxis]!)).GetNormalized()

  // Determine a size (thickness) of bones in proportion to their length.
  // TODO: Later, may be worth considering allowing a UsdSkelSkeleton
  // to provide per-bone size information.
  const size = Math.fround(boneDir.GetLength() * 0.1)
  i = i.getScaled(size)
  j = j.getScaled(size)

  points[offset + 0] = end
  points[offset + 1] = start.add(i).add(j)
  points[offset + 2] = start.add(i).subtract(j)
  points[offset + 3] = start.subtract(i).subtract(j)
  points[offset + 4] = start.subtract(i).add(j)
}

/** utils.h:43-52, utils.cpp:171-191. Compute mesh points for imaging a
 *  skeleton, given the `topology` of the skeleton and `jointSkelXforms`.
 *  Returns undefined where upstream returns false. */
export function UsdSkelImagingComputeBonePoints(
  topology: UsdSkelTopology,
  jointSkelXforms: readonly GfMatrix4d[],
  numPoints: number,
): VtArray<GfVec3f> | undefined {
  if (jointSkelXforms.length === topology.getNumJoints()) {
    const points: GfVec3f[] = Array.from({ length: numPoints }, () => new GfVec3f())
    if (!_UsdSkelImagingComputeBonePoints(topology, jointSkelXforms, points, numPoints)) {
      return undefined
    }
    return new VtArray<GfVec3f>(points, VtValueTypes.GfVec3f)
  } else {
    TF_WARN(`jointSkelXforms.size() [${jointSkelXforms.length}] != number of joints ` +
      `[${topology.getNumJoints()}].`)
    return undefined
  }
}

/** utils.h:54-59, utils.cpp:193-243 (the pointer overload). */
export function _UsdSkelImagingComputeBonePoints(
  topology: UsdSkelTopology,
  jointSkelXforms: readonly GfMatrix4d[],
  points: GfVec3f[],
  numPoints: number,
): boolean {
  const numJoints = topology.getNumJoints()

  // Compute bone indices per joint.
  const boneIndices: number[] = new Array(topology.getNumJoints()).fill(-1)
  let boneIndex = 0
  let actualNumPoints = 0
  for (let i = 0; i < topology.getNumJoints(); ++i) {
    const parent = topology.getParent(i)
    if (parent >= 0 && parent < numJoints) {
      boneIndices[i] = boneIndex++
      actualNumPoints += _boneNumPoints
    }
  }

  if (actualNumPoints !== numPoints) {
    TF_WARN(`number of points [${actualNumPoints}] does not match the size of ` +
      `the input point array [${numPoints}].`)
    return false
  }

  for (let i = 0; i < topology.getNumJoints(); ++i) {
    const bi = boneIndices[i]!
    if (bi >= 0) {
      const offset = bi * _boneNumPoints
      const parent = topology.getParent(i)
      UsdSkelImagingComputePointsForSingleBone(
        jointSkelXforms[i]!,
        jointSkelXforms[parent]!,
        points, offset)
    }
  }
  return true
}

/** utils.h:62-72, utils.cpp:245-257. Compute joint indices corresponding to
 *  each point in a bone mesh. Returns undefined where upstream returns
 *  false. */
export function UsdSkelImagingComputeBoneJointIndices(
  topology: UsdSkelTopology,
  numPoints: number,
): number[] | undefined {
  const jointIndices: number[] = new Array(numPoints).fill(0)
  if (!_UsdSkelImagingComputeBoneJointIndices(topology, jointIndices, numPoints)) {
    return undefined
  }
  return jointIndices
}

/** utils.h:74-78, utils.cpp:259-295 (the pointer overload). */
export function _UsdSkelImagingComputeBoneJointIndices(
  topology: UsdSkelTopology,
  jointIndices: number[],
  numPoints: number,
): boolean {
  if (numPoints > 0 && !jointIndices) {
    TF_CODING_ERROR('\'jointIndices\' pointer is null.')
    return false
  }

  const numJoints = topology.getNumJoints()

  let offset = 0
  for (let i = 0; i < topology.getNumJoints(); ++i) {
    const parent = topology.getParent(i)
    if (parent >= 0 && parent < numJoints) {
      if ((offset + _boneNumPoints) <= numPoints) {
        // Each bone is defined as a pyramid shaped object,
        // with the tip at a joint, and a square base at
        // the parent.
        // First point (tip) belongs to this joint.
        jointIndices[offset] = i
        // The rest of the points (the base) belong to the parent.
        for (let j = 1; j < _boneNumPoints; ++j) {
          jointIndices[offset + j] = parent
        }
        offset += _boneNumPoints
      } else {
        TF_WARN(`Incorrect number of points for bone mesh [${numPoints}].`)
        return false
      }
    }
  }
  return true
}
