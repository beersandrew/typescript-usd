// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/skelGuideData.cpp,
//  pxr/usdImaging/usdSkelImaging/skelGuideData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/skelGuideData.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: VtIntArray is a plain number array and VtVec3fArray a
// VtArray<GfVec3f> (hd/src/dataSourceTypeDefs.ts); boneMeshPoints is kept as
// a plain GfVec3f array internally.

import { Matrix4d as GfMatrix4d, Vec3f as GfVec3f, type Matrix4f as GfMatrix4f } from 'typescript-usd/gf'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { _UsdSkelImagingToArray } from './dataSourceUtils.ts'
import type { UsdSkelImagingSkelData } from './skelData.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'
import { UsdSkelImagingComputePointsForSingleBone } from './utils.ts'

/** skelGuideData.h:26-60. Data to compute the skeleton guide as mesh.
 *
 *  The mesh depicts the posed skeleton by rendering each skeleton joint that
 *  has a parent joint as a pyramid-shaped bone. Some points of the bone are
 *  affected by the underlying joint and other by its parent joint. */
export interface UsdSkelImagingSkelGuideData {
  /** Path of skeleton prim - used only to emit warnings/errors. */
  primPath: string
  /** Number of joints in UsdSkelTopology to create the data. Used only to
   *  emit warnings/errors. */
  numJoints: number
  /** Indices into joints of UsdSkelTopology - one for each point of the
   *  mesh. */
  boneJointIndices: number[]
  /** The points of the mesh before applying the skinning transforms. */
  boneMeshPoints: GfVec3f[]
}

// skelGuideData.cpp:39-44
const _boneVerts = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4]
const _boneNumVerts = _boneVerts.length
const _boneNumVertsPerFace = 3
const _boneNumFaces = 4
const _boneNumPoints = 5

/** skelGuideData.cpp:48-68 */
function _NumBonesOfSkelData(skelData: UsdSkelImagingSkelData): number {
  const numJoints = skelData.topology.size

  let result = 0

  for (let joint = 0; joint < skelData.topology.size; ++joint) {
    const parent = skelData.topology.getParent(joint)
    if (parent < 0) {
      continue
    }
    if (parent >= numJoints) {
      TF_CODING_ERROR('Bad index for parent joint')
      continue
    }

    result++
  }

  return result
}

/** skelGuideData.cpp:72-137. Compute data. */
export function UsdSkelImagingComputeSkelGuideData(
  skelData: UsdSkelImagingSkelData,
): UsdSkelImagingSkelGuideData {
  const result: UsdSkelImagingSkelGuideData = {
    primPath: skelData.primPath,
    numJoints: skelData.topology.size,
    boneJointIndices: [],
    boneMeshPoints: [],
  }

  if (result.numJoints !== skelData.bindTransforms.length) {
    TF_WARN(
      'Number of bind transforms does not match number of joints for ' +
      `skeleton ${skelData.primPath}.`)
    return result
  }

  const numJoints = skelData.topology.size
  const numBones = _NumBonesOfSkelData(skelData)

  // Compute boneJointIndices and boneMeshPoints at the same time.
  //
  // From UsdSkelImagingComputeBonePoints and
  // UsdSkelImagingComputeBoneJointIndices.

  result.boneJointIndices = new Array(_boneNumPoints * numBones)
  result.boneMeshPoints = new Array(_boneNumPoints * numBones)
  let pointIndex = 0

  for (let joint = 0; joint < skelData.topology.size; ++joint) {
    const parent = skelData.topology.getParent(joint)
    if (parent < 0) {
      continue
    }
    if (parent >= numJoints) {
      // Coding error already raised above.
      continue
    }

    for (let i = 0; i < _boneNumPoints; ++i) {
      // Tip (first point) is transformed by this joint.
      // Base (remaining points) is transformed by parent joint.
      result.boneJointIndices[pointIndex + i] = (i === 0) ? joint : parent
    }

    UsdSkelImagingComputePointsForSingleBone(
      new GfMatrix4d(skelData.bindTransforms[joint]!),
      new GfMatrix4d(skelData.bindTransforms[parent]!),
      result.boneMeshPoints, pointIndex)
    pointIndex += _boneNumPoints
  }

  return result
}

/** skelGuideData.cpp:139-144 */
function _NumBones(skelGuideData: UsdSkelImagingSkelGuideData): number {
  return Math.floor(skelGuideData.boneMeshPoints.length / _boneNumPoints)
}

/** skelGuideData.cpp:146-158. Compute faceVertexCounts of mesh topology for
 *  guide. */
export function UsdSkelImagingComputeSkelGuideFaceVertexCounts(
  skelGuideData: UsdSkelImagingSkelGuideData,
): number[] {
  return new Array(_boneNumFaces * _NumBones(skelGuideData)).fill(_boneNumVertsPerFace)
}

/** skelGuideData.cpp:160-183. Compute faceVertexIndices of mesh topology
 *  for guide. */
export function UsdSkelImagingComputeSkelGuideFaceVertexIndices(
  skelGuideData: UsdSkelImagingSkelGuideData,
): number[] {
  const numBones = _NumBones(skelGuideData)
  const result: number[] = new Array(numBones * _boneNumVerts)
  let k = 0

  // numBones copies of _boneVerts, each increased by _boneNumPoints.
  for (let i = 0; i < numBones; ++i) {
    for (let j = 0; j < _boneNumVerts; ++j) {
      result[k++] = _boneVerts[j]! + i * _boneNumPoints
    }
  }

  return result
}

/** skelGuideData.cpp:185-228. Apply skinning transforms to obtain posed
 *  mesh points. */
export function UsdSkelImagingComputeSkelGuidePoints(
  skelGuideData: UsdSkelImagingSkelGuideData,
  skinningTransformsValue: VtArray<GfMatrix4f> | readonly GfMatrix4f[] | undefined,
): VtArray<GfVec3f> {
  const skinningTransforms = _UsdSkelImagingToArray<GfMatrix4f>(skinningTransformsValue)
  const numPoints = skelGuideData.boneMeshPoints.length

  const empty = () => new VtArray<GfVec3f>([], VtValueTypes.GfVec3f)

  if (skelGuideData.numJoints === 0) {
    return empty()
  }
  if (!TF_VERIFY(skelGuideData.boneJointIndices.length === numPoints)) {
    return empty()
  }

  // TODO:
  // Ignore size mismatch in the case of multiple instances for now, we will
  // see if we can deform guide points in the vertex shader as well.
  if (skelGuideData.numJoints > skinningTransforms.length ||
      skinningTransforms.length % skelGuideData.numJoints !== 0) {
    TF_WARN(
      'Number of skinning transforms did not match number of joints for ' +
      `skeleton ${skelGuideData.primPath}.`)
    return empty()
  }

  // Point i is computed by applying skinningTransforms[boneJointIndices[i]]
  // to boneMeshPoints[i].
  const result: GfVec3f[] = new Array(numPoints)
  for (let i = 0; i < numPoints; ++i) {
    const m = skinningTransforms[skelGuideData.boneJointIndices[i]!]!
    result[i] = new GfVec3f(m.transformAffine(skelGuideData.boneMeshPoints[i]!))
  }
  return new VtArray<GfVec3f>(result, VtValueTypes.GfVec3f)
}
