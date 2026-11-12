// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/blendShapeData.cpp,
//  pxr/usdImaging/usdSkelImaging/blendShapeData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/blendShapeData.{h,cpp}
// (OpenUSD 26.11.1).

import { Vec2i as GfVec2i, Vec4f as GfVec4f, type Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { SceneIndexBase as HdSceneIndexBase, SceneIndexPrim as HdSceneIndexPrim } from 'typescript-usd/hd'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdSkelImagingBindingSchema } from './bindingSchema.ts'
import { UsdSkelImagingBlendShapeSchema } from './blendShapeSchema.ts'
import { _UsdSkelImagingGetArray } from './dataSourceUtils.ts'

function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** gf/math.h GfIsClose(double, double, double) */
function _GfIsClose(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) < epsilon
}

/** blendShapeData.h:39-51. Data to determine sub shape contributions.
 *
 *  A sub shape consists of offsets for a subset of points or all points of a
 *  deformable prim with SkelBindingAPI. The offsets ultimately applied to the
 *  prim are computed as linear combination of the sub shapes. Sub shapes come
 *  from the BlendShape prim's targeted by the deformable prim. Each
 *  BlendShape can provide several subshapes: one from BlendShape.offsets and
 *  several from BlendShape.inbetweens:BETWEEN_NAME:offsets. */
export interface UsdSkelImagingWeightAndSubShapeIndex {
  /** Weight authored for BlendShape.inbetweens:BETWEEN_NAME.
   *
   *  weight = 1.0 for the sub shape corresponding to a BlendShape.offsets.
   *
   *  If weight = 0.0, this pair does not correspond to any sub shape and
   *  subShapeIndex = -1. */
  weight: number
  /** Index to sub shape. -1 if this pair does not correspond to a sub shape. */
  subShapeIndex: number
}

/** blendShapeData.h:53-54 */
export type UsdSkelImagingWeightsAndSubShapeIndices = UsdSkelImagingWeightAndSubShapeIndex[]

/** blendShapeData.h:56-83. Data for skinned prim to compute the skel ext
 *  computation inputs related to blend shapes. These data come from the
 *  skeleton and the skelBinding, but not from the skelAnimation. */
export interface UsdSkelImagingBlendShapeData {
  /** Path of deformable prim. Used only for warnings/error messages. */
  primPath: string

  /** List of (offset, subShapeIndex) */
  blendShapeOffsets: VtArray<GfVec4f>
  /** For each point, pair of indices into blendShapeOffsets. */
  blendShapeOffsetRanges: VtArray<GfVec2i>

  numSubShapes: number

  /** For each blend shape name in SkelBindingAPI.skel:blendShapes, a list of
   *  (weight, subShapeIndex).
   *
   *  Includes (0.0, -1) to indicate that weight zero in
   *  SkelAnimation.blendShapeWeights corresponds to applying any sub shape
   *  from that BlendShape.
   *
   *  Includes (1.0, sub shape index) for the BlendShape.offsets and (weight,
   *  sub shape index) for the BlendShape.inbetweens:BETWEEN_NAME. */
  blendShapeNameToWeightsAndSubShapeIndices: Map<string, UsdSkelImagingWeightsAndSubShapeIndices>
}

// Same as usdSkel/blendShapeQuery.cpp (blendShapeData.cpp:25-26)
const EPS = Math.fround(1e-6)

/** blendShapeData.cpp:28 */
type _PointIndexAndOffset = [number, GfVec4f]

/** blendShapeData.cpp:30-41. Wrapper for HdSceneIndexBase::GetPrim. */
function _GetPrim(sceneIndex: HdSceneIndexBase, primPath: string): HdSceneIndexPrim {
  return sceneIndex.getPrim(primPath)
}

/** blendShapeData.cpp:43-48. Pack offset and index of subshape for one
 *  point. */
function _ToVec4f(a: GfVec3f, b: number): GfVec4f {
  const d = a.data
  return new GfVec4f(d[0]!, d[1]!, d[2]!, b)
}

/** blendShapeData.cpp:50-62 */
function _FillPointIndicesAndOffsetsDense(
  offsets: readonly GfVec3f[],
  subShape: number,
  pointIndicesAndOffsets: _PointIndexAndOffset[],
): void {
  for (let i = 0; i < offsets.length; ++i) {
    pointIndicesAndOffsets.push([i, _ToVec4f(offsets[i]!, subShape)])
  }
}

/** blendShapeData.cpp:64-103 */
function _FillPointIndicesAndOffsetsSparse(
  blendShapePrimPath: string /* only for warnings/error messages */,
  inbetweenName: string /* only used for warnings/error message */,
  indices: readonly number[],
  offsets: readonly GfVec3f[],
  subShape: number,
  pointIndicesAndOffsets: _PointIndexAndOffset[],
): boolean {
  if (offsets.length !== indices.length) {
    TF_WARN(
      `Length (${offsets.length}) of offsets${inbetweenName === '' ? '' : ' for inbetween '}` +
      `${inbetweenName} on BlendShape prim ${blendShapePrimPath} does not ` +
      `match length (${indices.length}) of indices.\n`)
  }

  const n = Math.min(offsets.length, indices.length)

  let warningEmitted = false

  for (let i = 0; i < n; ++i) {
    if (indices[i]! < 0) {
      if (!warningEmitted) {
        TF_WARN(
          `The indices on BlendShape prim ${blendShapePrimPath} has negative numbers.\n`)
        warningEmitted = true
      }
      continue
    }
    pointIndicesAndOffsets.push([indices[i]!, _ToVec4f(offsets[i]!, subShape)])
  }

  return true
}

/** blendShapeData.cpp:105-130 */
function _FillPointIndicesAndOffsets(
  blendShapePrimPath: string,
  inbetweenName: string,
  indices: readonly number[],
  offsets: readonly GfVec3f[],
  subShape: number,
  pointIndicesAndOffsets: _PointIndexAndOffset[],
): void {
  if (indices.length === 0) {
    _FillPointIndicesAndOffsetsDense(offsets, subShape, pointIndicesAndOffsets)
  } else {
    _FillPointIndicesAndOffsetsSparse(
      blendShapePrimPath, inbetweenName, indices, offsets, subShape,
      pointIndicesAndOffsets)
  }
}

/** blendShapeData.cpp:132-238 */
function _ProcessBlendShapePrim(
  sceneIndex: HdSceneIndexBase,
  primPath: string /* only for warnings/error messages */,
  blendShapePrimPath: string,
  numSubShapes: { value: number },
  weightsAndSubShapeIndices: UsdSkelImagingWeightsAndSubShapeIndices,
  pointIndicesAndOffsets: _PointIndexAndOffset[],
): void {
  const blendShapePrim = _GetPrim(sceneIndex, blendShapePrimPath)
  const blendShapeSchema = UsdSkelImagingBlendShapeSchema.getFromParent(
    blendShapePrim.dataSource)
  if (!blendShapeSchema.isDefined()) {
    TF_WARN(
      `No valid blend shape prim at ${blendShapePrimPath} which is among the ` +
      `blendShapeTargets of prim ${primPath}.\n`)
    return
  }

  const indices = _UsdSkelImagingGetArray<number>(blendShapeSchema.getPointIndices())

  interface WeightAndOffsets {
    // See UsdSkelImagingWeightAndSubShapeIndex::weight
    weight: number
    offsetsDataSource: ReturnType<UsdSkelImagingBlendShapeSchema['getOffsets']>
    // Empty if not inbetween
    inbetweenName: string
  }

  const weightsAndOffsets: WeightAndOffsets[] = []

  weightsAndOffsets.push({ weight: 0.0, offsetsDataSource: undefined, inbetweenName: '' })
  weightsAndOffsets.push({ weight: 1.0, offsetsDataSource: blendShapeSchema.getOffsets(), inbetweenName: '' })

  const containerSchema = blendShapeSchema.getInbetweenShapes()
  for (const name of containerSchema.getNames()) {
    const inbetweenSchema = containerSchema.Get(name)
    const weightDs = inbetweenSchema.getWeight()
    if (!weightDs) {
      TF_WARN(
        `Inbetween ${name} on BlendShape prim ${blendShapePrimPath} has no weight.\n`)
      continue
    }
    const weight = Math.fround(weightDs.getTypedValue(0.0))
    if (_GfIsClose(weight, 0.0, EPS) || _GfIsClose(weight, 1.0, EPS)) {
      TF_WARN(
        `BlendShape prim ${blendShapePrimPath} has inbetween ${name} with invalid weight.\n`)
      continue
    }

    weightsAndOffsets.push({ weight, offsetsDataSource: inbetweenSchema.getOffsets(), inbetweenName: name })
  }

  // Sorting weights
  weightsAndOffsets.sort((a, b) => a.weight - b.weight)

  // Filling
  let prevWeight = -Infinity

  for (const weightAndOffsets of weightsAndOffsets) {
    const weight = weightAndOffsets.weight

    if (weight === 0.0) {
      weightsAndSubShapeIndices.push({ weight, subShapeIndex: -1 })
    } else {
      if (_GfIsClose(prevWeight, weight, EPS)) {
        TF_WARN(
          `BlendShape prim ${blendShapePrimPath} has two inbetweens with the ` +
          `same weight ${weight.toFixed(6)}.\n`)
        continue
      }
      prevWeight = weight

      const subShape = numSubShapes.value

      weightsAndSubShapeIndices.push({ weight, subShapeIndex: subShape })

      _FillPointIndicesAndOffsets(
        blendShapePrimPath,
        weightAndOffsets.inbetweenName,
        indices,
        _UsdSkelImagingGetArray<GfVec3f>(weightAndOffsets.offsetsDataSource),
        subShape,
        pointIndicesAndOffsets)

      numSubShapes.value++
    }
  }
}

/** blendShapeData.cpp:240-256. Simply take the GfVec4f offset from each
 *  _PointIndexAndOffset. */
function _ComputeBlendShapeOffsets(
  pointIndicesAndOffsets: readonly _PointIndexAndOffset[],
): VtArray<GfVec4f> {
  return new VtArray<GfVec4f>(
    pointIndicesAndOffsets.map(([, offset]) => offset), VtValueTypes.GfVec4f)
}

/** blendShapeData.cpp:258-306. Compute for each point index the range in
 *  pointIndicesAndOffsets with that given index - assuming
 *  pointIndicesAndOffsets are sorted by point index. */
function _ComputeBlendShapeOffsetRanges(
  pointIndicesAndOffsets: readonly _PointIndexAndOffset[],
): VtArray<GfVec2i> {
  const numOffsets = pointIndicesAndOffsets.length
  if (numOffsets === 0) {
    return new VtArray<GfVec2i>([], VtValueTypes.GfVec2i)
  }

  const numOffsetRanges = pointIndicesAndOffsets[numOffsets - 1]![0] + 1

  // _FillBlendShapeOffsetRanges (blendShapeData.cpp:258-283): ranges are
  // [begin, end) pairs.
  const ranges: [number, number][] = []
  // Points to the range corresponding to the pointIndex we are currently
  // processing. We haven't seen a point yet, so point to just before the
  // beginning.
  let current = -1
  for (let i = 0; i < numOffsets; i++) {
    while (current < pointIndicesAndOffsets[i]![0]) {
      if (current >= 0) {
        ranges[current]![1] = i
      }
      current++
      ranges[current] = [i, i]
    }
  }

  // pointIndicesAndOffsets non-empty, so this is safe to call.
  ranges[current]![1] = numOffsets

  return new VtArray<GfVec2i>(
    ranges.slice(0, numOffsetRanges).map(([a, b]) => new GfVec2i(a, b)),
    VtValueTypes.GfVec2i)
}

/** blendShapeData.cpp:310-399. Computed blend shape for deformable prim with
 *  skelBindingAPI. */
export function UsdSkelImagingComputeBlendShapeData(
  sceneIndex: HdSceneIndexBase,
  primPath: string,
): UsdSkelImagingBlendShapeData {
  const data: UsdSkelImagingBlendShapeData = {
    primPath,
    blendShapeOffsets: new VtArray<GfVec4f>([], VtValueTypes.GfVec4f),
    blendShapeOffsetRanges: new VtArray<GfVec2i>([], VtValueTypes.GfVec2i),
    numSubShapes: 0,
    blendShapeNameToWeightsAndSubShapeIndices: new Map(),
  }

  const prim = _GetPrim(sceneIndex, primPath)

  const bindingSchema = UsdSkelImagingBindingSchema.getFromParent(prim.dataSource)

  const blendShapeNames = _UsdSkelImagingGetArray<string>(bindingSchema.getBlendShapes())

  const blendShapePrimPaths = _UsdSkelImagingGetArray<string>(bindingSchema.getBlendShapeTargets())

  data.numSubShapes = 0

  if (blendShapeNames.length !== blendShapePrimPaths.length) {
    TF_WARN(
      `Length (${blendShapeNames.length}) of blend shapes and length ` +
      `(${blendShapePrimPaths.length}) of blend shape targets on prim ` +
      `${primPath} are not matching.\n`)
  }

  // Re-implements UsdSkelBlendShapeQuery::ComputePackedShapeTable.

  const pointIndicesAndOffsets: _PointIndexAndOffset[] = []
  const numSubShapes = { value: data.numSubShapes }
  {
    const n = Math.min(blendShapeNames.length, blendShapePrimPaths.length)

    for (let i = 0; i < n; ++i) {
      const blendShapeName = blendShapeNames[i]!
      const blendShapePrimPath = blendShapePrimPaths[i]!

      let weightsAndSubShapeIndices =
        data.blendShapeNameToWeightsAndSubShapeIndices.get(blendShapeName)
      if (!weightsAndSubShapeIndices) {
        weightsAndSubShapeIndices = []
        data.blendShapeNameToWeightsAndSubShapeIndices.set(
          blendShapeName, weightsAndSubShapeIndices)
      }

      if (weightsAndSubShapeIndices.length > 0) {
        TF_WARN(`Duplicate blend shape ${blendShapeName} on prim ${primPath}.\n`)
        continue
      }

      _ProcessBlendShapePrim(
        sceneIndex,
        primPath,
        blendShapePrimPath,
        numSubShapes,
        weightsAndSubShapeIndices,
        pointIndicesAndOffsets)
    }
  }
  data.numSubShapes = numSubShapes.value

  // Sorting
  //
  // Note that UsdSkelBlendShapeQuery avoids the sorting by computing a
  // std::vector<unsigned> numOffsetsPerPoints first.
  pointIndicesAndOffsets.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0]
    return a[1].data[3]! - b[1].data[3]!
  })

  data.blendShapeOffsets = _ComputeBlendShapeOffsets(pointIndicesAndOffsets)
  data.blendShapeOffsetRanges = _ComputeBlendShapeOffsetRanges(pointIndicesAndOffsets)

  return data
}

/** blendShapeData.cpp:401-509. Re-implements
 *  UsdSkelBlendShapeQuery::ComputeSubShapeWeights. blendShapeWeights for
 *  skel ext computation inputs: one weight for each sub shape. */
export function UsdSkelImagingComputeBlendShapeWeights(
  data: UsdSkelImagingBlendShapeData,
  // from skel animation
  blendShapeNames: readonly string[],
  // from skel animation
  blendShapeWeights: ArrayLike<number>,
): Float32Array {
  // VtFloatArray result(data.numSubShapes, 0.0f);
  const result = new Float32Array(data.numSubShapes)

  if (blendShapeNames.length !== blendShapeWeights.length) {
    TF_WARN(
      `Length (${blendShapeNames.length}) of blendShapes and length ` +
      `(${blendShapeWeights.length}) of blendShapeWeights do not match on ` +
      `animation for prim ${data.primPath}.\n`)
  }

  const n = Math.min(blendShapeNames.length, blendShapeWeights.length)

  for (let i = 0; i < n; i++) {
    const blendShapeName = blendShapeNames[i]!
    const blendShapeWeight = Math.fround(blendShapeWeights[i]!)

    const weightsAndIndices =
      data.blendShapeNameToWeightsAndSubShapeIndices.get(blendShapeName)
    if (!weightsAndIndices) {
      continue
    }

    if (weightsAndIndices.length < 2) {
      TF_CODING_ERROR(
        'UsdSkelImagingBlendShapeData is supposed to have a weight for 0.0 and 1.0.\n')
      continue
    }

    if (weightsAndIndices.length === 2) {
      // No inbetweens. Simply use the one weight.
      const subShapeIndex = weightsAndIndices[1]!.subShapeIndex
      result[subShapeIndex] = blendShapeWeight
      continue
    }

    // Find the pair of adjacent weights such that the given weight is
    // inbetween - in a best effort way: if the given weight is smaller or
    // larger than all weights, pick the pair of the two smallest or largest
    // weights.
    //
    // std::upper_bound over [begin + 1, end - 1).
    let upperIndex = 1
    const last = weightsAndIndices.length - 1
    while (upperIndex < last && !(blendShapeWeight < weightsAndIndices[upperIndex]!.weight)) {
      ++upperIndex
    }
    const upper = weightsAndIndices[upperIndex]!
    const lower = weightsAndIndices[upperIndex - 1]!

    const weightDelta = Math.fround(upper.weight - lower.weight)

    if (!(weightDelta > EPS)) {
      // Note that we should have already enforced this in
      // _ProcessBlendShapePrim.
      TF_CODING_ERROR(
        'UsdSkelImagingBlendShapeData is supposed to have unique weights.\n')
      continue
    }

    // Blending factor for interpolation (or extrapolation if given weight is
    // smaller or larger than all weights.
    const alpha = Math.fround(Math.fround(blendShapeWeight - lower.weight) / weightDelta)

    {
      const subShapeIndex = lower.subShapeIndex
      if (subShapeIndex >= 0 && !_GfIsClose(alpha, 1.0, EPS)) {
        result[subShapeIndex] = 1.0 - alpha
      }
    }

    {
      const subShapeIndex = upper.subShapeIndex
      if (subShapeIndex >= 0 && !_GfIsClose(alpha, 0.0, EPS)) {
        result[subShapeIndex] = alpha
      }
    }
  }

  return result
}
