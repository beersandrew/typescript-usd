// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/utils.cpp,
//  pxr/usd/usdSkel/utils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors OpenUSD v26.08 pxr/usd/usdSkel/utils.{h,cpp} — transform
// composition + LBS/DQS skinning.
// FAITHFULNESS-DEBT(usdskel-transform-dispatch-utilities): OpenUSD v26.08
// pxr/usd/usdSkel/utils.cpp:1270-1710 also expose token-dispatched point,
// normal, face-varying-normal, and transform skinning; port those remaining
// overloads.
// Row-vector convention throughout (matches GfMatrix4d):
// child-to-skel = local · parentSkel; point transform p' = p · M.

import {
  type Matrix4, IDENTITY_MATRIX, mul4, invertMatrix4, quatToMatrix, transformPoint,
  orthonormalizeMatrix, extractRotationQuat,
  Quatd as GfQuatd, QuatDot as GfQuatDot, DualQuatd as GfDualQuatd, Vec3d as GfVec3d,
  factorMatrix, orthogonalizeBasis, GfHalf,
  Matrix3d as GfMatrix3d, Matrix4d as GfMatrix4d,
} from 'typescript-usd/gf'
import { RaiseWarning as TfWarn } from 'typescript-usd/tf'
import { Array as VtArray } from 'typescript-usd/vt'
import type { Prim } from 'typescript-usd/usd'
import type { UsdSkelTopology } from './topology.ts'

export type Vec3 = [number, number, number]

// std::numeric_limits<float>::epsilon(), NormalizeWeights' default eps
// (wrapUtils.cpp:436).
const FLT_EPSILON = 2 ** -23

// OpenUSD v26.08 pxr/usd/usdSkel/utils.cpp:47-61.
export function isSkelAnimationPrim(prim: Prim): boolean {
  return prim.isA('SkelAnimation')
}

export function isSkinnablePrim(prim: Prim): boolean {
  return prim.isA('Boundable') &&
    !prim.isA('Skeleton') &&
    !prim.isA('SkelRoot')
}

// OpenUSD v26.08 pxr/usd/usdSkel/utils.cpp:1171-1192.
export function interleaveInfluences(
  indices: readonly number[],
  weights: readonly number[],
  interleavedInfluences: Array<[number, number]>,
): boolean {
  if (indices.length !== weights.length ||
      interleavedInfluences.length !== indices.length) return false
  for (let index = 0; index < indices.length; index++) {
    interleavedInfluences[index] = [indices[index]!, weights[index]!]
  }
  return true
}

// UsdSkelMakeTransform(translate, rotate(quat wxyz), scale):
// M = S · R with the translation in the last row (GfMatrix4d semantics —
// scale applies to points first, then rotation, then translation).
export function makeTransform(
  translate: readonly number[],
  rotate: readonly [number, number, number, number] | readonly number[],
  scale: readonly number[],
): Matrix4 {
  const r = quatToMatrix(rotate[0]!, rotate[1]!, rotate[2]!, rotate[3]!)
  const m = [...r] as Matrix4
  // Scale rows (S · R scales each basis row)
  for (let c = 0; c < 3; c++) {
    m[0 + c] = m[0 + c]! * (scale[0] ?? 1)
    m[4 + c] = m[4 + c]! * (scale[1] ?? 1)
    m[8 + c] = m[8 + c]! * (scale[2] ?? 1)
  }
  m[12] = translate[0] ?? 0
  m[13] = translate[1] ?? 0
  m[14] = translate[2] ?? 0
  return m
}

// UsdSkelMakeTransforms (utils.cpp:710-797): one transform per
// (translation, rotation, scale) triple. Mismatched sizes warn and fail.
export function makeTransforms(
  translations: readonly (readonly number[])[],
  rotations: readonly (readonly number[])[],
  scales: readonly (readonly number[])[],
): Matrix4[] | undefined {
  const count = translations.length
  if (rotations.length !== count) {
    TfWarn(`Size of rotations [${rotations.length}] != size of xforms [${count}]`)
    return undefined
  }
  if (scales.length !== count) {
    TfWarn(`Size of scales [${scales.length}] != size of xforms [${count}]`)
    return undefined
  }
  return translations.map((t, i) => makeTransform(t, rotations[i]!, scales[i]!))
}

export interface UsdSkelTransformComponents {
  /** GfVec3f translation. */
  translate: Vec3
  /** GfQuatf rotation, real-first [w, x, y, z]. */
  rotate: [number, number, number, number]
  /** GfVec3h scale. */
  scale: Vec3
}

// _DecomposeTransform (utils.cpp:400-428) with the GfQuatf rotation of
// UsdSkelDecomposeTransform (utils.cpp:488-519): GfMatrix4d::Factor, whose
// `u` factor (rotation after accounting for handedness changes due to
// negative scales) is orthonormalized. Undefined when the transform is
// singular or orthonormalization fails.
export function decomposeTransform(xform: Matrix4): UsdSkelTransformComponents | undefined {
  const factors = factorMatrix(xform)
  if (!factors.nonSingular) return undefined
  const u = factors.shear
  // GfMatrix4d::Orthonormalize (matrix4d.cpp:450-481), which fails when the basis
  // does not converge.
  const { tx, ty, tz, converged } = orthogonalizeBasis(
    [u[0], u[1], u[2]], [u[4], u[5], u[6]], [u[8], u[9], u[10]], true)
  if (!converged) {
    TfWarn('OrthogonalizeBasis did not converge, matrix may not be orthonormal.')
    return undefined
  }
  const rotateMx: Matrix4 = [
    tx[0], tx[1], tx[2], 0,
    ty[0], ty[1], ty[2], 0,
    tz[0], tz[1], tz[2], 0,
    0, 0, 0, 1,
  ]
  const q = extractRotationQuat(rotateMx)
  return {
    translate: factors.translation.map(Math.fround) as Vec3,
    rotate: q.map(Math.fround) as [number, number, number, number],
    scale: factors.scale.map(x => new GfHalf(x).GetValue()) as Vec3,
  }
}

// UsdSkelDecomposeTransforms (utils.cpp:530-649; the wrapper is wrapUtils.cpp:96-108): undefined (with a
// warning) when any transform fails to decompose.
export function decomposeTransforms(xforms: readonly Matrix4[]): {
  translations: Vec3[], rotations: [number, number, number, number][], scales: Vec3[],
} | undefined {
  const translations: Vec3[] = []
  const rotations: [number, number, number, number][] = []
  const scales: Vec3[] = []
  for (let i = 0; i < xforms.length; ++i) {
    const components = decomposeTransform(xforms[i]!)
    if (!components) {
      TfWarn(`Failed decomposing transform ${i}. The source transform may be singular.`)
      return undefined
    }
    translations.push(components.translate)
    rotations.push(components.rotate)
    scales.push(components.scale)
  }
  return { translations, rotations, scales }
}

// UsdSkelConcatJointTransforms: joint-local → skel-space transforms.
// xforms[i] = local[i] · xforms[parent[i]] (parents are ordered first).
export function concatJointTransforms(
  topology: UsdSkelTopology,
  jointLocalXforms: readonly Matrix4[],
  rootXform?: Matrix4,
): Matrix4[] {
  if (jointLocalXforms.length !== topology.size) {
    throw new Error(
      `Size of jointLocalXforms [${jointLocalXforms.length}] != number of joints [${topology.size}]`)
  }
  const xforms: Matrix4[] = new Array(topology.size)
  for (let i = 0; i < topology.size; i++) {
    const parent = topology.getParent(i)
    if (parent >= 0) {
      if (parent >= i) throw new Error(`Joint ${i} has mis-ordered parent ${parent}.`)
      xforms[i] = mul4(jointLocalXforms[i]!, xforms[parent]!)
    } else {
      xforms[i] = rootXform ? mul4(jointLocalXforms[i]!, rootXform) : jointLocalXforms[i]!
    }
  }
  return xforms
}

// UsdSkelComputeJointLocalTransforms: skel-space transforms back to local
// joint transforms. Upstream utils.cpp:228-315.
export function computeJointLocalTransforms(
  topology: UsdSkelTopology,
  jointSkelXforms: readonly Matrix4[],
  rootInverseXform?: Matrix4,
): Matrix4[] {
  if (jointSkelXforms.length !== topology.size) {
    throw new Error(
      `Size of xforms [${jointSkelXforms.length}] != number of joints [${topology.size}]`)
  }
  const inverse = jointSkelXforms.map(xform => invertMatrix4(xform))
  return jointSkelXforms.map((xform, i) => {
    const parent = topology.getParent(i)
    if (parent >= i) throw new Error(`Joint ${i} has mis-ordered parent ${parent}.`)
    if (parent >= 0) return mul4(xform, inverse[parent]!)
    return rootInverseXform ? mul4(xform, rootInverseXform) : [...xform] as Matrix4
  })
}

// Joints are represented by their skel-space translations. The extent is the
// range of those points expanded by padding (utils.cpp:803-826).
export function computeJointsExtent(
  jointSkelXforms: readonly (readonly number[])[], padding = 0,
): [Vec3, Vec3] | [] {
  if (jointSkelXforms.length === 0) return []
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const xform of jointSkelXforms) {
    for (let axis = 0; axis < 3; axis++) {
      const value = xform[12 + axis] ?? 0
      min[axis] = Math.min(min[axis]!, value - padding)
      max[axis] = Math.max(max[axis]!, value + padding)
    }
  }
  return [min, max]
}

// _ValidateArrayShape (utils.cpp:883-900).
function _validateArrayShape(size: number, numInfluencesPerComponent: number): boolean {
  if (numInfluencesPerComponent > 0) {
    if (size % numInfluencesPerComponent === 0) {
      return true
    } else {
      TfWarn(`Unexpected array size [${size}]: Size must be a multiple of ` +
        `the number of influences per component [${numInfluencesPerComponent}].`)
    }
  } else {
    TfWarn(`Invalid number of influences per component (${numInfluencesPerComponent}): ` +
      `number of influences must be greater than zero.`)
  }
  return false
}

// Influence arrays: a plain array or typed array is a TfSpan (mutated in
// place, fixed size); a VtArray is the VtArray* overloads' array, which the
// resizing utilities may resize.
export type UsdSkelInfluenceArray = number[] | Float32Array | Int32Array | VtArray<number>

// Runs `fn` over a mutable span of `array`'s values, writing the result back
// into a VtArray (whose float/int storage rounds the values).
function _withSpan<R>(array: UsdSkelInfluenceArray, fn: (span: number[] | Float32Array | Int32Array) => R): R {
  if (!(array instanceof VtArray)) return fn(array)
  const span = array.toArray()
  const result = fn(span)
  array.assign(span)
  return result
}

const _isFloatStorage = (array: UsdSkelInfluenceArray): boolean =>
  array instanceof Float32Array ||
  (array instanceof VtArray && array.getElementType().getTypeName() === 'float')

// UsdSkelNormalizeWeights (utils.cpp:905-957). Float spans accumulate in
// float, as upstream's TfSpan<float> does.
export function normalizeWeights(
  weights: UsdSkelInfluenceArray, numInfluencesPerComponent: number,
  eps = FLT_EPSILON,
): boolean {
  if (!_validateArrayShape(weights.length, numInfluencesPerComponent)) {
    return false
  }
  const round = _isFloatStorage(weights) ? Math.fround : (x: number) => x
  return _withSpan(weights, span => {
    for (let start = 0; start < span.length; start += numInfluencesPerComponent) {
      let sum = 0
      for (let j = 0; j < numInfluencesPerComponent; ++j) sum = round(sum + span[start + j]!)
      if (Math.abs(sum) > eps) {
        for (let j = 0; j < numInfluencesPerComponent; ++j) span[start + j] = span[start + j]! / sum
      } else {
        for (let j = 0; j < numInfluencesPerComponent; ++j) span[start + j] = 0
      }
    }
    return true
  })
}

// UsdSkelSortInfluences (utils.cpp:959-1028): each component's influences
// sorted by descending (weight, index) pairs (std::greater).
export function sortInfluences(
  indices: UsdSkelInfluenceArray, weights: UsdSkelInfluenceArray,
  numInfluencesPerComponent: number,
): boolean {
  if (indices.length !== weights.length) {
    TfWarn(`Size of 'indices' [${indices.length}] != size of 'weights' [${weights.length}].`)
    return false
  }
  if (!_validateArrayShape(indices.length, numInfluencesPerComponent)) {
    return false
  }
  if (numInfluencesPerComponent < 2) {
    // Nothing to do.
    return true
  }
  return _withSpan(indices, indexSpan => _withSpan(weights, weightSpan => {
    for (let start = 0; start < indexSpan.length; start += numInfluencesPerComponent) {
      const influences = Array.from({ length: numInfluencesPerComponent }, (_, j) =>
        [weightSpan[start + j]!, indexSpan[start + j]!] as const)
        .sort((a, b) => b[0] - a[0] || b[1] - a[1])
      for (let j = 0; j < numInfluencesPerComponent; ++j) {
        weightSpan[start + j] = influences[j]![0]
        indexSpan[start + j] = influences[j]![1]
      }
    }
    return true
  }))
}

// UsdSkelExpandConstantInfluencesToVarying (utils.cpp:1031-1071).
export function expandConstantInfluencesToVarying<T>(array: T[] | VtArray<T>, size: number): boolean {
  if (size < 0) return false
  const source = array instanceof VtArray ? array.toArray() : [...array]
  const expanded: T[] = []
  for (let i = 0; i < size; i++) expanded.push(...source)
  if (array instanceof VtArray) array.assign(expanded)
  else array.splice(0, array.length, ...expanded)
  return true
}

// UsdSkelResizeInfluences (utils.cpp:1074-1165). Resizing float weights to
// fewer influences renormalizes them (the VtFloatArray overload); for plain
// arrays, pass `normalize` to select that overload.
export function resizeInfluences(
  array: number[] | VtArray<number>, srcNumInfluencesPerComponent: number,
  newNumInfluencesPerComponent: number, normalize = _isFloatStorage(array),
): boolean {
  if (srcNumInfluencesPerComponent === newNumInfluencesPerComponent) return true
  if (!_validateArrayShape(array.length, srcNumInfluencesPerComponent)) return false
  const numComponents = array.length / srcNumInfluencesPerComponent
  if (numComponents === 0) return true
  const values = array instanceof VtArray ? array.toArray() : array
  const resized: number[] = []
  for (let component = 0; component < numComponents; component++) {
    const start = component * srcNumInfluencesPerComponent
    for (let i = 0; i < newNumInfluencesPerComponent; i++) {
      resized.push(i < srcNumInfluencesPerComponent ? values[start + i]! : 0)
    }
  }
  if (array instanceof VtArray) array.assign(resized)
  else array.splice(0, array.length, ...resized)
  if (normalize && newNumInfluencesPerComponent < srcNumInfluencesPerComponent) {
    // Some weights have been stripped off. Need to renormalize.
    return normalizeWeights(array, newNumInfluencesPerComponent)
  }
  return true
}

// UsdSkelSkinPointsLBS (classic linear blend skinning):
//   initialP = p · geomBindTransform
//   p' = Σ_j w_j · (initialP · skinningXforms[jointIndex_j])
// points: flat xyz; jointIndices/jointWeights: numInfluencesPerPoint per
// point (or exactly numInfluencesPerPoint TOTAL for constant/rigid
// deformation, where every point shares the same influences).
export function skinPointsLBS(
  geomBindTransform: Matrix4,
  skinningXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>,
  jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number,
  points: ArrayLike<number>,
): Float32Array {
  const numPoints = Math.floor(points.length / 3)
  const out = new Float32Array(numPoints * 3)
  const constantInfluences = jointIndices.length === numInfluencesPerPoint &&
    numPoints * numInfluencesPerPoint !== numInfluencesPerPoint

  for (let pi = 0; pi < numPoints; pi++) {
    const [ix, iy, iz] = transformPoint(
      geomBindTransform, points[pi * 3]!, points[pi * 3 + 1]!, points[pi * 3 + 2]!)

    let px = 0, py = 0, pz = 0
    for (let wi = 0; wi < numInfluencesPerPoint; wi++) {
      const influenceIdx = constantInfluences ? wi : pi * numInfluencesPerPoint + wi
      const jointIdx = jointIndices[influenceIdx]!
      if (jointIdx < 0 || jointIdx >= skinningXforms.length) {
        throw new Error(
          `Out of range joint index ${jointIdx} at index ${influenceIdx}` +
          ` (num joints = ${skinningXforms.length}).`)
      }
      const w = jointWeights[influenceIdx]!
      if (w === 0) continue
      const [tx, ty, tz] = transformPoint(skinningXforms[jointIdx]!, ix, iy, iz)
      px += tx * w; py += ty * w; pz += tz * w
    }
    out[pi * 3] = px; out[pi * 3 + 1] = py; out[pi * 3 + 2] = pz
  }
  return out
}

interface DualQuatJoint {
  dualQuat: GfDualQuatd
  scale: readonly number[]
  hasScale: boolean
}

// utils.cpp:1255-1295. Split each joint transform into the rigid dual-quat
// component and the residual 3x3 scale/shear component.
function jointDualQuat(xform: Matrix4): DualQuatJoint {
  // _ConvertToDualQuaternions removes scale/shear from Factor's rotation
  // component before constructing the dual quaternion. Orthonormalizing the
  // affine row basis is the equivalent polar step and avoids feeding the
  // eigenvector ordering of Factor back into a second decomposition.
  const rotation = orthonormalizeMatrix(xform)
  const q = extractRotationQuat(rotation)
  const dualQuat = new GfDualQuatd(
    new GfQuatd(q[0], q[1], q[2], q[3]), [xform[12], xform[13], xform[14]])
  const rigid: Matrix4 = [...rotation] as Matrix4
  rigid[12] = xform[12]
  rigid[13] = xform[13]
  rigid[14] = xform[14]
  const scale = mul4(xform, invertMatrix4(rigid))
  const hasScale = [0,1,2,4,5,6,8,9,10].some(index =>
    Math.abs(scale[index]! - (index === 0 || index === 5 || index === 10 ? 1 : 0)) > 1e-6)
  return { dualQuat, scale, hasScale }
}

// UsdSkelSkinPoints(... dualQuaternion ...), utils.cpp:1418-1523.
export function skinPointsDQS(
  geomBindTransform: Matrix4,
  skinningXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>,
  jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number,
  points: ArrayLike<number>,
): Float32Array {
  const numPoints = Math.floor(points.length / 3)
  const out = new Float32Array(numPoints * 3)
  const constantInfluences = jointIndices.length === numInfluencesPerPoint && numPoints > 1
  if (jointIndices.length !== jointWeights.length ||
      (!constantInfluences && jointIndices.length !== numPoints * numInfluencesPerPoint)) {
    throw new Error('Joint influence array size does not match points')
  }
  const joints = skinningXforms.map(jointDualQuat)
  const anyScale = joints.some(joint => joint.hasScale)

  for (let pi = 0; pi < numPoints; pi++) {
    const initial = transformPoint(
      geomBindTransform, points[pi*3]!, points[pi*3+1]!, points[pi*3+2]!)
    let pivot = -1
    let maxWeight = -Infinity
    for (let wi = 0; wi < numInfluencesPerPoint; wi++) {
      const ii = constantInfluences ? wi : pi*numInfluencesPerPoint + wi
      const jointIndex = jointIndices[ii]!
      if (jointIndex < 0 || jointIndex >= joints.length) {
        throw new Error(`Out of range joint index ${jointIndex} at index ${ii}`)
      }
      const weight = jointWeights[ii]!
      if (weight > maxWeight) { maxWeight = weight; pivot = jointIndex }
    }
    const pivotQuat = joints[pivot]!.dualQuat.GetReal()
    let sum = GfDualQuatd.getZero()
    const scaled = [0, 0, 0]
    for (let wi = 0; wi < numInfluencesPerPoint; wi++) {
      const ii = constantInfluences ? wi : pi*numInfluencesPerPoint + wi
      const joint = joints[jointIndices[ii]!]!
      let weight = jointWeights[ii]!
      if (weight === 0) continue
      if (anyScale) {
        const p = transformPoint(joint.scale as Matrix4, initial[0], initial[1], initial[2])
        scaled[0]! += p[0] * weight
        scaled[1]! += p[1] * weight
        scaled[2]! += p[2] * weight
      }
      if (GfQuatDot(joint.dualQuat.GetReal(), pivotQuat) < 0) weight = -weight
      sum = sum.add(joint.dualQuat.getScaled(weight))
    }
    sum.Normalize()
    const transformed = sum.Transform(anyScale ? scaled : initial).data
    out[pi*3] = transformed[0]!
    out[pi*3+1] = transformed[1]!
    out[pi*3+2] = transformed[2]!
  }
  return out
}

function transformNormal(matrix: Matrix4, x: number, y: number, z: number): Vec3 {
  const inverse = invertMatrix4(matrix)
  const nx = x*inverse[0]! + y*inverse[1]! + z*inverse[2]!
  const ny = x*inverse[4]! + y*inverse[5]! + z*inverse[6]!
  const nz = x*inverse[8]! + y*inverse[9]! + z*inverse[10]!
  const length = Math.hypot(nx, ny, nz)
  return length > 0 ? [nx/length, ny/length, nz/length] : [0, 0, 0]
}

function normalMatrix(matrix: Matrix4): Matrix4 {
  const inverse = invertMatrix4(matrix)
  return [
    inverse[0], inverse[4], inverse[8], 0,
    inverse[1], inverse[5], inverse[9], 0,
    inverse[2], inverse[6], inverse[10], 0,
    0, 0, 0, 1,
  ]
}

function transformDirection(matrix: Matrix4, point: Vec3): Vec3 {
  return [
    point[0] * matrix[0]! + point[1] * matrix[4]! + point[2] * matrix[8]!,
    point[0] * matrix[1]! + point[1] * matrix[5]! + point[2] * matrix[9]!,
    point[0] * matrix[2]! + point[1] * matrix[6]! + point[2] * matrix[10]!,
  ]
}

export function skinNormalsDQS(
  geomBindTransform: Matrix4, skinningXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, normals: ArrayLike<number>,
  pointIndices?: ArrayLike<number>,
): Float32Array {
  const geomNormal = normalMatrix(geomBindTransform)
  const joints = skinningXforms.map(xform => {
    const matrix = normalMatrix(xform)
    const rotation = orthonormalizeMatrix(matrix)
    const quat = extractRotationQuat(rotation)
    const scale = mul4(matrix, invertMatrix4(rotation))
    const hasScale = [0,1,2,4,5,6,8,9,10].some(index =>
      Math.abs(scale[index]! -
        (index === 0 || index === 5 || index === 10 ? 1 : 0)) > 1e-6)
    return { quat: new GfQuatd(quat[0], quat[1], quat[2], quat[3]), scale, hasScale }
  })
  const anyScale = joints.some(joint => joint.hasScale)
  const count = Math.floor(normals.length / 3)
  const constant = jointIndices.length === numInfluencesPerPoint
  const output = new Float32Array(count * 3)
  for (let normalIndex = 0; normalIndex < count; normalIndex++) {
    const pointIndex = pointIndices ? pointIndices[normalIndex]! : normalIndex
    const initial = transformDirection(geomNormal, [
      normals[normalIndex * 3]!, normals[normalIndex * 3 + 1]!,
      normals[normalIndex * 3 + 2]!,
    ])
    let pivot = -1
    let maxWeight = -Infinity
    for (let influence = 0; influence < numInfluencesPerPoint; influence++) {
      const index = constant ? influence : pointIndex * numInfluencesPerPoint + influence
      const weight = jointWeights[index]!
      if (weight > maxWeight) {
        maxWeight = weight
        pivot = jointIndices[index]!
      }
    }
    const pivotQuat = joints[pivot]!.quat
    let sum = GfQuatd.getZero()
    const scaled: Vec3 = [0, 0, 0]
    for (let influence = 0; influence < numInfluencesPerPoint; influence++) {
      const index = constant ? influence : pointIndex * numInfluencesPerPoint + influence
      const joint = joints[jointIndices[index]!]!
      let weight = jointWeights[index]!
      if (weight === 0) continue
      if (anyScale) {
        const value = transformDirection(joint.scale, initial)
        scaled[0] += value[0] * weight
        scaled[1] += value[1] * weight
        scaled[2] += value[2] * weight
      }
      if (GfQuatDot(joint.quat, pivotQuat) < 0) weight = -weight
      sum = sum.add(joint.quat.getScaled(weight))
    }
    sum.Normalize()
    const value = sum.Transform(new GfVec3d(...(anyScale ? scaled : initial))).data
    const length = Math.hypot(value[0]!, value[1]!, value[2]!)
    if (length > 0) {
      output[normalIndex * 3] = value[0]! / length
      output[normalIndex * 3 + 1] = value[1]! / length
      output[normalIndex * 3 + 2] = value[2]! / length
    }
  }
  return output
}

// UsdSkelSkinFaceVaryingNormals / UsdSkelSkinNormals, utils.cpp:1548-1710.
export function skinNormals(
  geomBindTransform: Matrix4, skinningXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, normals: ArrayLike<number>,
  pointIndices?: ArrayLike<number>,
): Float32Array {
  const count = Math.floor(normals.length / 3)
  const out = new Float32Array(count * 3)
  const constant = jointIndices.length === numInfluencesPerPoint
  for (let ni = 0; ni < count; ni++) {
    const pi = pointIndices ? pointIndices[ni]! : ni
    const initial = transformNormal(
      geomBindTransform, normals[ni*3]!, normals[ni*3+1]!, normals[ni*3+2]!)
    let nx = 0, ny = 0, nz = 0
    for (let wi = 0; wi < numInfluencesPerPoint; wi++) {
      const ii = constant ? wi : pi*numInfluencesPerPoint + wi
      const ji = jointIndices[ii]!
      if (ji < 0 || ji >= skinningXforms.length) {
        throw new Error(`Out of range joint index ${ji} at index ${ii}`)
      }
      const transformed = transformNormal(skinningXforms[ji]!, ...initial)
      const weight = jointWeights[ii]!
      nx += transformed[0]*weight; ny += transformed[1]*weight; nz += transformed[2]*weight
    }
    const length = Math.hypot(nx, ny, nz)
    if (length > 0) { nx /= length; ny /= length; nz /= length }
    out[ni*3] = nx; out[ni*3+1] = ny; out[ni*3+2] = nz
  }
  return out
}

// UsdSkelApplyBlendShape: add weighted point offsets onto `points` (flat xyz,
// mutated in place). When `indices` is empty the offsets are dense (one per
// point); otherwise offsets[j] applies to point indices[j]. Mirrors
// pxr/usd/usdSkel/utils.cpp UsdSkelApplyBlendShape (+ the indexed/non-indexed
// helpers). Returns false on a size mismatch.
export function applyBlendShape(
  weight: number,
  offsets: readonly number[][],
  indices: readonly number[],
  points: Float32Array | number[],
): boolean {
  // Early out for zero weight (matches GfIsClose(weight, 0, 1e-6)).
  if (Math.abs(weight) <= 1e-6) return true
  // The weight is a float, and `points[index] += offsets[i]*weight` is
  // GfVec3f arithmetic (utils.cpp:2856-2908): round as upstream does.
  weight = Math.fround(weight)
  const f = Math.fround

  const numPoints = Math.floor(points.length / 3)

  if (indices.length === 0) {
    if (offsets.length !== numPoints) return false
    for (let i = 0; i < numPoints; i++) {
      const o = offsets[i]!
      points[i * 3] = f((points[i * 3] ?? 0) + f(o[0]! * weight))
      points[i * 3 + 1] = f((points[i * 3 + 1] ?? 0) + f(o[1]! * weight))
      points[i * 3 + 2] = f((points[i * 3 + 2] ?? 0) + f(o[2]! * weight))
    }
    return true
  }

  if (offsets.length !== indices.length) return false
  for (let j = 0; j < indices.length; j++) {
    const pi = indices[j]!
    if (pi < 0 || pi >= numPoints) {
      // A bad index means the asset is out of sync; bail out (matches upstream).
      return false
    }
    const o = offsets[j]!
    points[pi * 3] = f((points[pi * 3] ?? 0) + f(o[0]! * weight))
    points[pi * 3 + 1] = f((points[pi * 3 + 1] ?? 0) + f(o[1]! * weight))
    points[pi * 3 + 2] = f((points[pi * 3 + 2] ?? 0) + f(o[2]! * weight))
  }
  return true
}

// ---------------------------------------------------------------------------
// Token-dispatched skinning: UsdSkelSkinPoints, UsdSkelSkinNormals,
// UsdSkelSkinFaceVaryingNormals and UsdSkelSkinTransform with non-interleaved
// influences (OpenUSD v26.11.1 pxr/usd/usdSkel/utils.cpp:1195-2695).
//
// Values upstream holds as GfVec3f / GfMatrix3f are rounded to float32 at the
// same points (Math.fround); GfMatrix4d / GfMatrix3d / GfDualQuatd / GfQuatd
// arithmetic stays in double. The points and transform functions are
// templated on the matrix type upstream; `matrixType` 'float' selects the
// GfMatrix4f instantiation (UsdSkelImaging's skinning computations pass
// GfMatrix4f, usdSkelImaging/extComputations.cpp:91-231), whose
// Transform/TransformAffine and products are float arithmetic
// (gf/matrix4f.h:655-707, matrix4f.cpp:568-650): each float operation is
// rounded to float32, in the order the C++ source writes it (no FMA
// contraction). Points and normals are flat xyz Float32Arrays
// (TfSpan<GfVec3f>), deformed in place. Matrix4 and Matrix3 values are flat
// row-major arrays (GfMatrix4d / GfMatrix3d storage order).
// ---------------------------------------------------------------------------

const _f = Math.fround

// GF_MIN_VECTOR_LENGTH (pxr/base/gf/limits.h).
const _GF_MIN_VECTOR_LENGTH = 1e-10

const _IDENTITY3: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

// GfVec3f::Normalize / GetNormalized (pxr/base/gf/vec3f.h:256-285): float
// length, then `*this *= (1.0 / length)` with each component rounded.
function _normalizeVec3f(x: number, y: number, z: number): [number, number, number] {
  const lengthSq = _f(_f(_f(x * x) + _f(y * y)) + _f(z * z))
  const length = _f(Math.sqrt(lengthSq))
  const s = 1.0 / (length > _GF_MIN_VECTOR_LENGTH ? length : _GF_MIN_VECTOR_LENGTH)
  return [_f(x * s), _f(y * s), _f(z * s)]
}

// GfIsClose(GfMatrix3, GfMatrix3, tolerance) (pxr/base/gf/matrix3d.h).
function _isCloseToIdentity3(m: readonly number[], tolerance: number): boolean {
  for (let i = 0; i < 9; ++i) {
    if (!(Math.abs(m[i]! - _IDENTITY3[i]!) <= tolerance)) return false
  }
  return true
}

// _GetPivotJointIndex (utils.cpp:1307-1333): the joint with the largest
// weight among the in-range influences of a point.
function _getPivotJointIndex(
  pointIdx: number, jointArraySize: number,
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number,
): number {
  let pivotIdx = -1
  let maxw = -1
  for (let wi = 0; wi < numInfluencesPerPoint; ++wi) {
    const influenceIdx = pointIdx * numInfluencesPerPoint + wi
    const jointIdx = jointIndices[influenceIdx]!
    if (jointIdx >= 0 && jointIdx < jointArraySize) {
      const w = jointWeights[influenceIdx]!
      if (pivotIdx < 0 || maxw < w) {
        maxw = w
        pivotIdx = jointIdx
      }
    }
  }
  return pivotIdx
}

interface _JointDualQuats {
  dualQuats: GfDualQuatd[]
  // GfMatrix3f per joint (float-rounded, flat row-major).
  scales: number[][]
  hasJointScale: boolean
}

// _ConvertToDualQuaternions (utils.cpp:1252-1305): GfMatrix4d::Factor, the
// orthonormalized rotation factor and the translation make the rigid dual
// quaternion; the residual upper 3x3 is the joint's scale (a GfMatrix3f).
function _convertToDualQuaternions(jointXforms: readonly Matrix4[]): _JointDualQuats {
  const dualQuats: GfDualQuatd[] = []
  const scales: number[][] = []
  let hasJointScale = false
  for (const xform of jointXforms) {
    const matrix = new GfMatrix4d(...xform)
    const factors = matrix.factor()
    if (!factors.success) {
      // unable to decompose, set to zero
      dualQuats.push(GfDualQuatd.getZero())
      scales.push([..._IDENTITY3])
      continue
    }
    // Remove shear & extract rotation
    const factoredRotMat = factors.rotation
    factoredRotMat.orthonormalize()
    const rotationQ = (factoredRotMat.extractRotationMatrix() as GfMatrix3d)
      .extractRotationQuaternion()
    const translation = factors.translation.data
    // Construct dual quaternion from rotation & translation
    dualQuats.push(new GfDualQuatd(
      new GfQuatd(rotationQ[0], rotationQ[1], rotationQ[2], rotationQ[3]),
      [translation[0]!, translation[1]!, translation[2]!]))
    // Calculate jointScales by removing jointDualQuats from jointXforms
    const tmpNonScaleXform = factoredRotMat.getMultiply(
      new GfMatrix4d(1.0).setTranslate([translation[0]!, translation[1]!, translation[2]!]))
    // Extract the upper-left 3x3 matrix;
    const scale = (matrix.getMultiply(tmpNonScaleXform.getInverse()).extractRotationMatrix())
      .GetArray().map(_f)
    scales.push(scale)
    // If jointScales[ji] is not an identity matrix, need to set the flag
    if (!hasJointScale && !_isCloseToIdentity3(scale, 1e-6)) hasJointScale = true
  }
  return { dualQuats, scales, hasJointScale }
}

/** The Matrix4 instantiation of the templated skinning functions. */
export type SkinningMatrixType = 'double' | 'float'

// GfMatrix4f::Transform(GfVec3f) (gf/matrix4f.h:655-661) with GfProject
// (gf/homogeneous.h:48-51), in float arithmetic.
function _transformPointFloat(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  const row = (c: number): number =>
    _f(_f(_f(_f(x * m[c]!) + _f(y * m[4 + c]!)) + _f(z * m[8 + c]!)) + m[12 + c]!)
  const v0 = row(0), v1 = row(1), v2 = row(2), v3 = row(3)
  const inv = v3 !== 0 ? _f(1 / v3) : 1
  return [_f(inv * v0), _f(inv * v1), _f(inv * v2)]
}

// GfMatrix4f::TransformAffine(GfVec3f) (gf/matrix4f.h:702-707), in float
// arithmetic.
function _transformAffineFloat(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  const row = (c: number): number =>
    _f(_f(_f(_f(x * m[c]!) + _f(y * m[4 + c]!)) + _f(z * m[8 + c]!)) + m[12 + c]!)
  return [row(0), row(1), row(2)]
}

// GfMatrix4f * GfMatrix4f (matrix4f.cpp:568-650), in float arithmetic.
function _mul4Float(a: Matrix4, b: Matrix4): Matrix4 {
  const r = new Array<number>(16)
  for (let i = 0; i < 4; ++i) {
    for (let j = 0; j < 4; ++j) {
      r[i * 4 + j] = _f(_f(_f(_f(a[i * 4]! * b[j]!) + _f(a[i * 4 + 1]! * b[4 + j]!)) +
        _f(a[i * 4 + 2]! * b[8 + j]!)) + _f(a[i * 4 + 3]! * b[12 + j]!))
    }
  }
  return r as unknown as Matrix4
}

// GfMatrix4d::Transform(GfVec3f) rounded to a GfVec3f
// (pxr/base/gf/matrix4d.h:643-649, GfProject).
function _transformPointf(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  const w = x * m[3] + y * m[7] + z * m[11] + m[15]
  const inv = w !== 0 ? 1 / w : 1
  return [
    _f((x * m[0] + y * m[4] + z * m[8] + m[12]) * inv),
    _f((x * m[1] + y * m[5] + z * m[9] + m[13]) * inv),
    _f((x * m[2] + y * m[6] + z * m[10] + m[14]) * inv),
  ]
}

// GfMatrix4d::TransformAffine(GfVec3f), not yet rounded
// (pxr/base/gf/matrix4d.h:666-671).
function _transformAffine(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  return [
    x * m[0] + y * m[4] + z * m[8] + m[12],
    x * m[1] + y * m[5] + z * m[9] + m[13],
    x * m[2] + y * m[6] + z * m[10] + m[14],
  ]
}

// Row vector times a flat row-major 3x3, not yet rounded.
function _vecTimesMatrix3(x: number, y: number, z: number, m: readonly number[]): [number, number, number] {
  return [
    x * m[0]! + y * m[3]! + z * m[6]!,
    x * m[1]! + y * m[4]! + z * m[7]!,
    x * m[2]! + y * m[5]! + z * m[8]!,
  ]
}

function _warnOutOfRange(jointIdx: number, influenceIdx: number, numJoints: number): void {
  TfWarn(`Out of range joint index ${jointIdx} at index ${influenceIdx} (num joints = ${numJoints}).`)
}

// _SkinPointsLBS (utils.cpp:1335-1413).
function _skinPointsLBS(
  geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, points: Float32Array, matrixType: SkinningMatrixType,
): boolean {
  const transformPoint = matrixType === 'float' ? _transformPointFloat : _transformPointf
  const transformAffine = matrixType === 'float' ? _transformAffineFloat : _transformAffine
  const numPoints = points.length / 3
  for (let pi = 0; pi < numPoints; ++pi) {
    const initialP = transformPoint(
      geomBindTransform, points[pi * 3]!, points[pi * 3 + 1]!, points[pi * 3 + 2]!)
    let px = 0, py = 0, pz = 0
    for (let wi = 0; wi < numInfluencesPerPoint; ++wi) {
      const influenceIdx = pi * numInfluencesPerPoint + wi
      const jointIdx = jointIndices[influenceIdx]!
      if (jointIdx >= 0 && jointIdx < jointXforms.length) {
        const w = jointWeights[influenceIdx]!
        if (w !== 0) {
          const t = transformAffine(jointXforms[jointIdx]!, initialP[0], initialP[1], initialP[2])
          px = _f(px + _f(_f(t[0]) * w))
          py = _f(py + _f(_f(t[1]) * w))
          pz = _f(pz + _f(_f(t[2]) * w))
        }
      } else {
        // Bail out early: an out of range index means the asset is out of sync.
        _warnOutOfRange(jointIdx, influenceIdx, jointXforms.length)
        return false
      }
    }
    points[pi * 3] = px; points[pi * 3 + 1] = py; points[pi * 3 + 2] = pz
  }
  return true
}

// _SkinPointsDQS (utils.cpp:1415-1526).
function _skinPointsDQS(
  geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, points: Float32Array, matrixType: SkinningMatrixType,
): boolean {
  const transformPoint = matrixType === 'float' ? _transformPointFloat : _transformPointf
  // Convert joint transformation matrices to dual quaternions
  const { dualQuats, scales, hasJointScale } = _convertToDualQuaternions(jointXforms)
  const numPoints = points.length / 3
  for (let pi = 0; pi < numPoints; ++pi) {
    const initialP = transformPoint(
      geomBindTransform, points[pi * 3]!, points[pi * 3 + 1]!, points[pi * 3 + 2]!)
    let scaledP: [number, number, number] = [0, 0, 0]

    let pivotQuat = new GfQuatd(0.0)
    const pivotIdx = _getPivotJointIndex(
      pi, dualQuats.length, jointIndices, jointWeights, numInfluencesPerPoint)
    if (pivotIdx >= 0) pivotQuat = dualQuats[pivotIdx]!.GetReal()

    let weightedSumDQ = GfDualQuatd.getZero()
    for (let wi = 0; wi < numInfluencesPerPoint; ++wi) {
      const influenceIdx = pi * numInfluencesPerPoint + wi
      const jointIdx = jointIndices[influenceIdx]!
      if (jointIdx >= 0 && jointIdx < dualQuats.length) {
        let w = jointWeights[influenceIdx]!
        if (w !== 0) {
          // Apply scale using LBS, if any of jointScales is not identity
          if (hasJointScale) {
            const s = _vecTimesMatrix3(initialP[0], initialP[1], initialP[2], scales[jointIdx]!)
            scaledP = [
              _f(scaledP[0] + _f(_f(s[0]) * w)),
              _f(scaledP[1] + _f(_f(s[1]) * w)),
              _f(scaledP[2] + _f(_f(s[2]) * w)),
            ]
          }
          // Apply rotation & translation using DQS
          const jointDQ = dualQuats[jointIdx]!
          // Flip the dual quaternion, if necessary, to make it
          // on the same hemisphere as the pivotQuat.
          if (GfQuatDot(jointDQ.GetReal(), pivotQuat) < 0.0) w = -w
          weightedSumDQ = weightedSumDQ.add(jointDQ.getScaled(w))
        }
      } else {
        _warnOutOfRange(jointIdx, influenceIdx, dualQuats.length)
        return false
      }
    }
    if (!hasJointScale) scaledP = initialP

    weightedSumDQ.Normalize()
    const p = weightedSumDQ.Transform(scaledP).data
    points[pi * 3] = p[0]!; points[pi * 3 + 1] = p[1]!; points[pi * 3 + 2] = p[2]!
  }
  return true
}

// UsdSkelSkinPoints(skinningMethod, ..., jointIndices, jointWeights, ...)
// (utils.cpp:1600-1615) through _NonInterleavedSkinPoints
// (utils.cpp:1559-1595).
export function skinPointsWithMethod(
  skinningMethod: string, geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, points: Float32Array, matrixType: SkinningMatrixType = 'double',
): boolean {
  if (jointIndices.length !== jointWeights.length) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] != size of jointWeights ` +
      `[${jointWeights.length}]`)
    return false
  }
  if (jointIndices.length !== (points.length / 3) * numInfluencesPerPoint) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] != (points.size() ` +
      `[${points.length / 3}] * numInfluencesPerPoint [${numInfluencesPerPoint}]).`)
    return false
  }
  if (skinningMethod === 'classicLinear') {
    return _skinPointsLBS(geomBindTransform, jointXforms, jointIndices, jointWeights,
      numInfluencesPerPoint, points, matrixType)
  } else if (skinningMethod === 'dualQuaternion') {
    return _skinPointsDQS(geomBindTransform, jointXforms, jointIndices, jointWeights,
      numInfluencesPerPoint, points, matrixType)
  }
  TfWarn(`Unknown skinning method: '${skinningMethod}' `)
  return false
}

// _ConvertToQuaternions (utils.cpp:1836-1866).
function _convertToQuaternions(jointXforms: readonly (readonly number[])[]): {
  quats: GfQuatd[], scales: number[][], hasJointScale: boolean,
} {
  const quats: GfQuatd[] = []
  const scales: number[][] = []
  let hasJointScale = false
  for (const xform of jointXforms) {
    const matrix = new GfMatrix3d(...xform)
    const rotationMat = matrix.getOrthonormalized()
    const rotationQ = rotationMat.extractRotationQuaternion()
    quats.push(new GfQuatd(rotationQ[0], rotationQ[1], rotationQ[2], rotationQ[3]))
    const scale = [...matrix.getMultiply(rotationMat.getInverse()).GetArray()]
    scales.push(scale)
    if (!hasJointScale && !_isCloseToIdentity3(scale, 1e-6)) hasJointScale = true
  }
  return { quats, scales, hasJointScale }
}

// _FaceVaryingPointIndexFn / _IdentityPointIndexFn (utils.cpp:1226-1251).
type _PointIndexFn = (index: number) => number

// _SkinNormalsLBS (utils.cpp:1868-1938).
function _skinNormalsLBS(
  geomBindTransform: readonly number[], jointXforms: readonly (readonly number[])[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  pointIndexFn: _PointIndexFn, numInfluencesPerPoint: number, normals: Float32Array,
): boolean {
  const numNormals = normals.length / 3
  for (let ni = 0; ni < numNormals; ++ni) {
    const n0 = _vecTimesMatrix3(normals[ni * 3]!, normals[ni * 3 + 1]!, normals[ni * 3 + 2]!,
      geomBindTransform)
    const initialN = [_f(n0[0]), _f(n0[1]), _f(n0[2])] as const
    // Determine the point to read the influences from. This is not
    // the same as the normal's index if there is faceVarying
    // interpolation.
    const pi = pointIndexFn(ni)
    let nx = 0, ny = 0, nz = 0
    for (let wi = 0; wi < numInfluencesPerPoint; ++wi) {
      const influenceIdx = pi * numInfluencesPerPoint + wi
      const jointIdx = jointIndices[influenceIdx]!
      if (jointIdx >= 0 && jointIdx < jointXforms.length) {
        const w = jointWeights[influenceIdx]!
        if (w !== 0) {
          const t = _vecTimesMatrix3(initialN[0], initialN[1], initialN[2], jointXforms[jointIdx]!)
          nx = _f(nx + _f(_f(t[0]) * w))
          ny = _f(ny + _f(_f(t[1]) * w))
          nz = _f(nz + _f(_f(t[2]) * w))
        }
      } else {
        _warnOutOfRange(jointIdx, influenceIdx, jointXforms.length)
        return false
      }
    }
    const n = _normalizeVec3f(nx, ny, nz)
    normals[ni * 3] = n[0]; normals[ni * 3 + 1] = n[1]; normals[ni * 3 + 2] = n[2]
  }
  return true
}

// _SkinNormalsDQS (utils.cpp:1940-2045).
function _skinNormalsDQS(
  geomBindTransform: readonly number[], jointXforms: readonly (readonly number[])[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  pointIndexFn: _PointIndexFn, numInfluencesPerPoint: number, normals: Float32Array,
): boolean {
  // Convert joint rotation matrices to quaternions
  const { quats, scales, hasJointScale } = _convertToQuaternions(jointXforms)
  const numNormals = normals.length / 3
  for (let ni = 0; ni < numNormals; ++ni) {
    const n0 = _vecTimesMatrix3(normals[ni * 3]!, normals[ni * 3 + 1]!, normals[ni * 3 + 2]!,
      geomBindTransform)
    const initialN: [number, number, number] = [_f(n0[0]), _f(n0[1]), _f(n0[2])]
    const pi = pointIndexFn(ni)

    // Find pivot quaternion (with max influence)
    let pivotQuat = new GfQuatd(0.0)
    const pivotIdx = _getPivotJointIndex(
      pi, quats.length, jointIndices, jointWeights, numInfluencesPerPoint)
    if (pivotIdx >= 0) pivotQuat = quats[pivotIdx]!

    let scaledN: [number, number, number] = [0, 0, 0]
    let weightedSumQuat = GfQuatd.getZero()
    for (let wi = 0; wi < numInfluencesPerPoint; ++wi) {
      const influenceIdx = pi * numInfluencesPerPoint + wi
      const jointIdx = jointIndices[influenceIdx]!
      if (jointIdx >= 0 && jointIdx < quats.length) {
        let w = jointWeights[influenceIdx]!
        if (w !== 0) {
          // Apply scale using LBS, if any of jointScales is not identity
          if (hasJointScale) {
            const s = _vecTimesMatrix3(initialN[0], initialN[1], initialN[2], scales[jointIdx]!)
            scaledN = [
              _f(scaledN[0] + _f(_f(s[0]) * w)),
              _f(scaledN[1] + _f(_f(s[1]) * w)),
              _f(scaledN[2] + _f(_f(s[2]) * w)),
            ]
          }
          // Apply rotation using DQS
          const jointQuat = quats[jointIdx]!
          // Flip the quaternion, if necessary, to make it
          // on the same hemisphere as the pivotQuat.
          if (GfQuatDot(jointQuat, pivotQuat) < 0.0) w = -w
          weightedSumQuat = weightedSumQuat.add(jointQuat.getScaled(w))
        }
      } else {
        _warnOutOfRange(jointIdx, influenceIdx, quats.length)
        return false
      }
    }
    if (!hasJointScale) scaledN = initialN

    weightedSumQuat.Normalize()
    const v = weightedSumQuat.Transform(new GfVec3d(scaledN[0], scaledN[1], scaledN[2])).data
    // GfVec3d::GetNormalized, then GfVec3f.
    const length = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!)
    const s = 1.0 / (length > _GF_MIN_VECTOR_LENGTH ? length : _GF_MIN_VECTOR_LENGTH)
    normals[ni * 3] = v[0]! * s; normals[ni * 3 + 1] = v[1]! * s; normals[ni * 3 + 2] = v[2]! * s
  }
  return true
}

function _dispatchSkinNormals(
  skinningMethod: string, geomBindTransform: readonly number[],
  jointXforms: readonly (readonly number[])[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  pointIndexFn: _PointIndexFn, numInfluencesPerPoint: number, normals: Float32Array,
): boolean {
  if (skinningMethod === 'classicLinear') {
    return _skinNormalsLBS(geomBindTransform, jointXforms, jointIndices, jointWeights,
      pointIndexFn, numInfluencesPerPoint, normals)
  } else if (skinningMethod === 'dualQuaternion') {
    return _skinNormalsDQS(geomBindTransform, jointXforms, jointIndices, jointWeights,
      pointIndexFn, numInfluencesPerPoint, normals)
  }
  TfWarn(`Unknown skinning method: '${skinningMethod}' `)
  return false
}

// UsdSkelSkinNormals(skinningMethod, geomBindTransform (GfMatrix3d),
// jointXforms (GfMatrix3d), jointIndices, jointWeights, ...)
// (utils.cpp:2208-2223) through _NonInterleavedSkinNormals
// (utils.cpp:2080-2119). Matrix3 values are flat row-major arrays of 9.
export function skinNormalsWithMethod(
  skinningMethod: string, geomBindTransform: readonly number[],
  jointXforms: readonly (readonly number[])[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, normals: Float32Array,
): boolean {
  if (jointIndices.length !== jointWeights.length) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] != size of jointWeights ` +
      `[${jointWeights.length}]`)
    return false
  }
  if (jointIndices.length !== (normals.length / 3) * numInfluencesPerPoint) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] != (normals.size() ` +
      `[${normals.length / 3}] * numInfluencesPerPoint [${numInfluencesPerPoint}]).`)
    return false
  }
  return _dispatchSkinNormals(skinningMethod, geomBindTransform, jointXforms, jointIndices,
    jointWeights, index => index, numInfluencesPerPoint, normals)
}

// UsdSkelSkinFaceVaryingNormals(skinningMethod, ..., jointIndices,
// jointWeights, ..., faceVertexIndices, normals) (utils.cpp:2272-2287)
// through _SkinFaceVaryingNormals (utils.cpp:2121-2168).
export function skinFaceVaryingNormalsWithMethod(
  skinningMethod: string, geomBindTransform: readonly number[],
  jointXforms: readonly (readonly number[])[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  numInfluencesPerPoint: number, faceVertexIndices: ArrayLike<number>, normals: Float32Array,
): boolean {
  if (jointIndices.length !== jointWeights.length) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] != size of jointWeights ` +
      `[${jointWeights.length}]`)
    return false
  }
  if (jointIndices.length % numInfluencesPerPoint !== 0) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] is not a multiple of ` +
      `numInfluencesPerPoint [${numInfluencesPerPoint}]`)
    return false
  }
  if (faceVertexIndices.length !== normals.length / 3) {
    TfWarn(`Size of faceVertexIndices [${faceVertexIndices.length}] != size of normals ` +
      `[${normals.length / 3}]`)
    return false
  }
  const numPoints = Math.trunc(jointIndices.length / numInfluencesPerPoint)
  // _FaceVaryingPointIndexFn (utils.cpp:1233-1251).
  const indexFn = (index: number): number => {
    const pointIndex = faceVertexIndices[index]!
    if (pointIndex < 0 || pointIndex >= numPoints) {
      TfWarn(`faceVertexIndices is out of range [${pointIndex}] at index [${index}]`)
      return 0
    }
    return pointIndex
  }
  return _dispatchSkinNormals(skinningMethod, geomBindTransform, jointXforms, jointIndices,
    jointWeights, indexFn, numInfluencesPerPoint, normals)
}

// The 4-point frame of UsdSkel_SkinTransformLBS/DQS (utils.cpp:2489-2499):
// the pivot and pivot + each basis row, as GfVec3f.
function _framePoints(geomBindTransform: Matrix4): [number, number, number][] {
  const pivot: [number, number, number] =
    [_f(geomBindTransform[12]), _f(geomBindTransform[13]), _f(geomBindTransform[14])]
  const row = (i: number): [number, number, number] => [
    _f(pivot[0] + _f(geomBindTransform[i * 4]!)),
    _f(pivot[1] + _f(geomBindTransform[i * 4 + 1]!)),
    _f(pivot[2] + _f(geomBindTransform[i * 4 + 2]!)),
  ]
  return [row(0), row(1), row(2), pivot]
}

// xform->SetTranslate(skinnedPivot); SetRow3(i, framePoints[i]-skinnedPivot)
// (utils.cpp:2527-2531).
function _frameToXform(framePoints: [number, number, number][]): Matrix4 {
  const p = framePoints[3]!
  const r = (i: number): [number, number, number] => [
    _f(framePoints[i]![0] - p[0]), _f(framePoints[i]![1] - p[1]), _f(framePoints[i]![2] - p[2]),
  ]
  const [r0, r1, r2] = [r(0), r(1), r(2)]
  return [
    r0[0], r0[1], r0[2], 0,
    r1[0], r1[1], r1[2], 0,
    r2[0], r2[1], r2[2], 0,
    p[0], p[1], p[2], 1,
  ]
}

// Early-out of UsdSkel_SkinTransformLBS/DQS for an object rigidly bound to
// a single joint (utils.cpp:2464-2477).
function _skinTransformSingleJoint(
  geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>, matrixType: SkinningMatrixType,
): Matrix4 | undefined | null {
  if (jointIndices.length === 1 && Math.abs(jointWeights[0]! - 1.0) <= 1e-6) {
    const jointIdx = jointIndices[0]!
    if (jointIdx >= 0 && jointIdx < jointXforms.length) {
      return matrixType === 'float'
        ? _mul4Float(geomBindTransform, jointXforms[jointIdx]!)
        : mul4(geomBindTransform, jointXforms[jointIdx]!)
    }
    TfWarn(`Out of range joint index ${jointIdx} at index 0 (num joints = ${jointXforms.length}).`)
    return null
  }
  return undefined
}

// UsdSkel_SkinTransformLBS (utils.cpp:2449-2533).
function _skinTransformLBS(
  geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>, matrixType: SkinningMatrixType,
): Matrix4 | undefined {
  const single = _skinTransformSingleJoint(
    geomBindTransform, jointXforms, jointIndices, jointWeights, matrixType)
  if (single !== undefined) return single ?? undefined

  const framePoints = _framePoints(geomBindTransform)
  for (let pi = 0; pi < 4; ++pi) {
    const initialP = framePoints[pi]!
    let px = 0, py = 0, pz = 0
    for (let wi = 0; wi < jointIndices.length; ++wi) {
      const jointIdx = jointIndices[wi]!
      if (jointIdx >= 0 && jointIdx < jointXforms.length) {
        const w = jointWeights[wi]!
        if (w !== 0) {
          const t = (matrixType === 'float' ? _transformAffineFloat : _transformAffine)(
            jointXforms[jointIdx]!, initialP[0], initialP[1], initialP[2])
          px = _f(px + _f(_f(t[0]) * w))
          py = _f(py + _f(_f(t[1]) * w))
          pz = _f(pz + _f(_f(t[2]) * w))
        }
      } else {
        _warnOutOfRange(jointIdx, wi, jointXforms.length)
        return undefined
      }
    }
    framePoints[pi] = [px, py, pz]
  }
  return _frameToXform(framePoints)
}

// UsdSkel_SkinTransformDQS (utils.cpp:2535-2650).
function _skinTransformDQS(
  geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>, matrixType: SkinningMatrixType,
): Matrix4 | undefined {
  const single = _skinTransformSingleJoint(
    geomBindTransform, jointXforms, jointIndices, jointWeights, matrixType)
  if (single !== undefined) return single ?? undefined

  // Convert joint transformation matrices to dual quaternions
  const { dualQuats, scales, hasJointScale } = _convertToDualQuaternions(jointXforms)
  const framePoints = _framePoints(geomBindTransform)

  let pivotQuat = new GfQuatd(0.0)
  const pivotIdx = _getPivotJointIndex(0, dualQuats.length, jointIndices, jointWeights,
    jointIndices.length)
  if (pivotIdx >= 0) pivotQuat = dualQuats[pivotIdx]!.GetReal()

  const scaledPoints: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]
  let weightedSumDQ = GfDualQuatd.getZero()
  for (let wi = 0; wi < jointIndices.length; ++wi) {
    const jointIdx = jointIndices[wi]!
    if (jointIdx >= 0 && jointIdx < dualQuats.length) {
      let w = jointWeights[wi]!
      if (w !== 0) {
        // Apply scale using LBS, if any of jointScales is not identity
        if (hasJointScale) {
          for (let pi = 0; pi < 4; ++pi) {
            const initialP = framePoints[pi]!
            const s = _vecTimesMatrix3(initialP[0], initialP[1], initialP[2], scales[jointIdx]!)
            const acc = scaledPoints[pi]!
            scaledPoints[pi] = [
              _f(acc[0] + _f(_f(s[0]) * w)), _f(acc[1] + _f(_f(s[1]) * w)),
              _f(acc[2] + _f(_f(s[2]) * w)),
            ]
          }
        }
        // Apply rotation & translation using DQS
        const jointDQ = dualQuats[jointIdx]!
        if (GfQuatDot(jointDQ.GetReal(), pivotQuat) < 0.0) w = -w
        weightedSumDQ = weightedSumDQ.add(jointDQ.getScaled(w))
      }
    } else {
      _warnOutOfRange(jointIdx, wi, dualQuats.length)
      return undefined
    }
  }

  weightedSumDQ.Normalize()
  for (let pi = 0; pi < 4; ++pi) {
    const scaledP = hasJointScale ? scaledPoints[pi]! : framePoints[pi]!
    const p = weightedSumDQ.Transform(scaledP).data
    framePoints[pi] = [_f(p[0]!), _f(p[1]!), _f(p[2]!)]
  }
  return _frameToXform(framePoints)
}

// UsdSkelSkinTransform(skinningMethod, geomBindTransform, jointXforms,
// jointIndices, jointWeights, xform) (utils.cpp:2684-2695) through
// UsdSkel_NonInterleavedSkinTransform (utils.cpp:2652-2679). Returns the
// skinned transform, or undefined where upstream returns false.
export function skinTransformWithMethod(
  skinningMethod: string, geomBindTransform: Matrix4, jointXforms: readonly Matrix4[],
  jointIndices: ArrayLike<number>, jointWeights: ArrayLike<number>,
  matrixType: SkinningMatrixType = 'double',
): Matrix4 | undefined {
  if (jointIndices.length !== jointWeights.length) {
    TfWarn(`Size of jointIndices [${jointIndices.length}] != size of jointWeights ` +
      `[${jointWeights.length}]`)
    return undefined
  }
  if (skinningMethod === 'classicLinear') {
    return _skinTransformLBS(geomBindTransform, jointXforms, jointIndices, jointWeights, matrixType)
  } else if (skinningMethod === 'dualQuaternion') {
    return _skinTransformDQS(geomBindTransform, jointXforms, jointIndices, jointWeights, matrixType)
  }
  TfWarn(`Unknown skinning method: '${skinningMethod}' `)
  return undefined
}

export { IDENTITY_MATRIX }
