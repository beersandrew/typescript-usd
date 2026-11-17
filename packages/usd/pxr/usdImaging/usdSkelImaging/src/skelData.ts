// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/skelData.cpp,
//  pxr/usdImaging/usdSkelImaging/skelData.h, pxr/usd/usdSkel/utils.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/skelData.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - VtArray<GfMatrix4f> values are VtArrays of GfMatrix4f
//   (TfType.Declare('GfMatrix4f')).
// - The usdSkel port (typescript-usd/usdSkel) computes UsdSkelMakeTransforms
//   and UsdSkelConcatJointTransforms on flat row-major number[16] matrices in
//   double precision; upstream instantiates them for GfMatrix4f
//   (usdSkel/utils.cpp:652-760, 99-140). The results are converted to
//   GfMatrix4f (rounded to float) at the boundary, so a joint's skel-space
//   transform is rounded once instead of after every float multiply.
//   The skinning transforms stay flat row-major number[16] through
//   UsdSkelMakeTransforms, the anim mapper and UsdSkelConcatJointTransforms,
//   rounded to float where a GfMatrix4f would be (the joint-local and the
//   skel-space transforms), and become GfMatrix4f once, after the
//   inverse-bind multiply, which sums as GfMatrix4f.getMultiply does.
// - UsdSkelConcatJointTransforms of the usdSkel port throws where upstream
//   warns and returns false (mis-ordered parent); the exception is turned into
//   the warning/false result.
// - WorkParallelForN loops are serial.

import { Matrix4f as GfMatrix4f, type Matrix4d as GfMatrix4d, type Matrix4 as GfMatrix4Tuple } from 'typescript-usd/gf'
import type { SceneIndexBase as HdSceneIndexBase, SceneIndexPrim as HdSceneIndexPrim, TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import {
  AnimMapper as UsdSkelAnimMapper, Topology as UsdSkelTopology,
  concatJointTransforms as UsdSkelConcatJointTransforms, makeTransforms as UsdSkelMakeTransforms,
} from 'typescript-usd/usdSkel'
import { Array as VtArray } from 'typescript-usd/vt'
import type { UsdSkelImagingAnimationSchema } from './animationSchema.ts'
import { _UsdSkelImagingGetArray } from './dataSourceUtils.ts'
import { UsdSkelImagingSkeletonSchema } from './skeletonSchema.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** TfType of GfMatrix4f, the element type of VtArray<GfMatrix4f>. */
export const _UsdSkelImagingMatrix4fType = TfType.declare('GfMatrix4f')

/** HdMatrix4fArrayDataSource (hd/dataSourceTypeDefs.h). */
export type HdMatrix4fArrayDataSource = HdTypedSampledDataSource<VtArray<GfMatrix4f>>

/** A VtArray<GfMatrix4f> holding `matrices`. */
export function _UsdSkelImagingMatrix4fArray(matrices: readonly GfMatrix4f[]): VtArray<GfMatrix4f> {
  return new VtArray<GfMatrix4f>(matrices, _UsdSkelImagingMatrix4fType)
}

/** The float row-major elements of a GfMatrix4f (read only), as the usdSkel
 *  port's Matrix4. */
function _AsTuple(m: GfMatrix4f): GfMatrix4Tuple {
  return m.GetArray() as GfMatrix4Tuple
}

/** Rounds a double row-major matrix to float in place: the elements a
 *  GfMatrix4f made from it holds. */
function _RoundToFloat(m: number[]): GfMatrix4Tuple {
  for (let k = 0; k < 16; ++k) m[k] = Math.fround(m[k]!)
  return m as GfMatrix4Tuple
}

/** A GfMatrix4f holding the float elements of `m`. */
function _FromFloatTuple(m: GfMatrix4Tuple): GfMatrix4f {
  return new GfMatrix4f(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
    m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15])
}

const _identity: GfMatrix4Tuple = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** skelData.h:30-48. Some of the data necessary to compute the skinning
 *  transforms of a skeleton. These data come from the skeleton and the
 *  skelAnimation's joints. */
export class UsdSkelImagingSkelData {
  /** From skeleton. */
  bindTransforms: GfMatrix4f[] = []
  inverseBindTransforms: GfMatrix4f[] = []
  /** From skeleton's joints. */
  readonly topology: UsdSkelTopology

  /** skelData.cpp:76-81 */
  constructor(
    /** Path of deformable prim. Used only for warnings/error messages. */
    readonly primPath: string,
    readonly skeletonSchema: UsdSkelImagingSkeletonSchema,
  ) {
    this.topology = new UsdSkelTopology(
      _UsdSkelImagingGetArray<string>(skeletonSchema.getJoints()))
  }
}

/** skelData.cpp:22-35. Wrapper for HdSceneIndexBase::GetPrim. */
function _GetPrim(sceneIndex: HdSceneIndexBase, primPath: string): HdSceneIndexPrim {
  return sceneIndex.getPrim(primPath)
}

/** skelData.cpp:37-52 */
function _Convert(matrices: readonly GfMatrix4d[]): GfMatrix4f[] {
  return matrices.map(m => new GfMatrix4f(m))
}

/** skelData.cpp:54-69 */
function _Invert(matrices: readonly GfMatrix4f[]): GfMatrix4f[] {
  return matrices.map(m => m.getInverse())
}

/** skelData.cpp:83-100. Compute data for prim in scene index. */
export function UsdSkelImagingComputeSkelData(
  sceneIndex: HdSceneIndexBase,
  primPath: string,
): UsdSkelImagingSkelData {
  const prim = _GetPrim(sceneIndex, primPath)
  const data = new UsdSkelImagingSkelData(primPath,
    UsdSkelImagingSkeletonSchema.getFromParent(prim.dataSource))

  data.bindTransforms = _Convert(_UsdSkelImagingGetArray<GfMatrix4d>(
    data.skeletonSchema.getBindTransforms()))

  data.inverseBindTransforms = _Invert(data.bindTransforms)

  return data
}

/** skelData.cpp:102-123: result[i] = matrices[i] * result[i], as
 *  GfMatrix4f.getMultiply computes it (double sums over k in order, each
 *  rounded to float). `result` holds float-rounded row-major matrices. */
function _MultiplyInPlace(matrices: readonly GfMatrix4f[], result: GfMatrix4Tuple[]): boolean {
  const n = result.length
  if (matrices.length !== n) {
    return false
  }
  for (let i = 0; i < n; ++i) {
    const a = matrices[i]!.GetArray(), b = result[i]!
    const out = new Array<number>(16) as GfMatrix4Tuple
    for (let r = 0; r < 4; ++r) {
      for (let c = 0; c < 4; ++c) {
        let s = 0
        for (let k = 0; k < 4; ++k) s += a[r * 4 + k]! * b[k * 4 + c]!
        out[r * 4 + c] = Math.fround(s)
      }
    }
    result[i] = out
  }
  return true
}

/** skelData.cpp:125-195 */
function _ComputeJointLocalTransforms(
  data: UsdSkelImagingSkelData,
  animationSchema: UsdSkelImagingAnimationSchema,
  animationSource: string,
  restTransforms: HdMatrix4fArrayDataSource | undefined,
  shutterOffset: number,
): GfMatrix4Tuple[] {
  const rest = (t: number) => _UsdSkelImagingGetArray<GfMatrix4f>(restTransforms, t).map(_AsTuple)

  // Remapping of skelAnimation's data to skeleton's hierarchy.
  const animMapper = new UsdSkelAnimMapper(
    _UsdSkelImagingGetArray<string>(animationSchema.getJoints()),
    _UsdSkelImagingGetArray<string>(data.skeletonSchema.getJoints()))
  if (animMapper.isNull()) {
    // No skelAnimation, simply return the restTransforms.
    return rest(shutterOffset)
  }

  const translations = _UsdSkelImagingGetArray<{ data: readonly number[] }>(
    animationSchema.getTranslations(), shutterOffset)
  const rotations = _UsdSkelImagingGetArray<{ GetReal(): number, GetImaginary(): { data: readonly number[] } }>(
    animationSchema.getRotations(), shutterOffset)
  const scales = _UsdSkelImagingGetArray<{ data: readonly number[] }>(
    animationSchema.getScales(), shutterOffset)

  // usdSkel port: quaternions are (w, x, y, z) number tuples.
  const t = new Array<readonly number[]>(translations.length)
  for (let i = 0; i < translations.length; ++i) t[i] = translations[i]!.data
  const r = new Array<readonly number[]>(rotations.length)
  for (let i = 0; i < rotations.length; ++i) {
    const q = rotations[i]!, im = q.GetImaginary().data
    r[i] = [q.GetReal(), im[0]!, im[1]!, im[2]!]
  }
  const s = new Array<readonly number[]>(scales.length)
  for (let i = 0; i < scales.length; ++i) s[i] = scales[i]!.data
  const tuples = UsdSkelMakeTransforms(t, r, s)
  if (!tuples) {
    TF_WARN(`Could not compute transforms for skelAnimation ${animationSource}.\n`)
    return rest(shutterOffset)
  }
  // The VtArray<GfMatrix4f> of upstream: rounded to float.
  const animTransforms = tuples.map(_RoundToFloat)

  // If all transform components were empty, that could mean:
  // - the attributes were never authored
  // - the attributes were blocked
  // - the attributes were authored with empty arrays (possibly intentionally)
  // In many of these cases, we should expect the animation to be silently
  // ignored, so throw no warning.
  if (animTransforms.length === 0) {
    return rest(0.0)
  }

  if (animMapper.isIdentity()) {
    return animTransforms
  }

  let result: GfMatrix4Tuple[]

  if (animMapper.isSparse()) {
    result = rest(shutterOffset)
  } else {
    result = new Array<GfMatrix4Tuple>(data.topology.getNumJoints()).fill(_identity)
  }

  // UsdSkelAnimMapper::RemapTransforms (usdSkel/animMapper.cpp:218-224):
  // Remap with identity as the default value. (The matrices are only read
  // from here on, so the identity is shared.)
  let remapped: GfMatrix4Tuple[]
  try {
    remapped = animMapper.remap(animTransforms, result, 1, _identity)
  } catch {
    TF_WARN(`Could not remap transforms from skelAnimation ${animationSource} for ` +
      `skeleton ${data.primPath}.\n`)
    return rest(shutterOffset)
  }
  return remapped
}

/** skelData.cpp:197-210 */
function _ConcatJointTransforms(
  topology: UsdSkelTopology,
  localTransforms: readonly GfMatrix4Tuple[],
  primPath: string,
): GfMatrix4Tuple[] {
  const n = topology.size
  const warn = () => TF_WARN(
    `Could not concat local joint transforms for skeleton ${primPath}.\n`)
  // UsdSkelConcatJointTransforms leaves `result` value-initialized on
  // failure (usdSkel/utils.cpp:106-115).
  const empty = () => Array.from({ length: n }, () => new Array<number>(16).fill(0) as GfMatrix4Tuple)
  if (localTransforms.length !== n) {
    TF_WARN(`Size of jointLocalXforms [${localTransforms.length}] != number of joints [${n}]`)
    warn()
    return empty()
  }
  try {
    // The VtArray<GfMatrix4f> of upstream: rounded to float. A root joint's
    // entry is its local transform itself, already rounded; the others are
    // new double products.
    const xforms = UsdSkelConcatJointTransforms(topology, localTransforms)
    for (let i = 0; i < n; ++i) {
      if (xforms[i] !== localTransforms[i]) _RoundToFloat(xforms[i]!)
      else xforms[i] = [...xforms[i]!] as GfMatrix4Tuple
    }
    return xforms
  } catch (e) {
    TF_WARN(String((e as Error).message ?? e))
    warn()
    return empty()
  }
}

/** skelData.cpp:212-268. Compute skinning transforms for extComputation. */
export function UsdSkelImagingComputeSkinningTransforms(
  data: UsdSkelImagingSkelData,
  /** From skeleton (might not be needed). */
  restTransforms: HdMatrix4fArrayDataSource | undefined,
  animationSchemas: readonly UsdSkelImagingAnimationSchema[],
  animationSources: readonly string[],
  shutterOffset: number,
): VtArray<GfMatrix4f> {
  // Compute and fill the concatenated skinning transforms.
  // Since all the animationSources/Schemas share the same resolved skeleton
  // that calls this method, they should all have the same size which is the
  // number of joints in the topology.
  const numJoints = data.topology.size
  const result: GfMatrix4f[] = new Array(animationSchemas.length * numJoints)

  for (let i = 0; i < animationSchemas.length; ++i) {
    const xforms = _ConcatJointTransforms(
      data.topology,
      _ComputeJointLocalTransforms(
        data, animationSchemas[i]!, animationSources[i] ?? '',
        restTransforms, shutterOffset),
      data.primPath)

    if (!_MultiplyInPlace(data.inverseBindTransforms, xforms)) {
      TF_WARN(`Length (${data.inverseBindTransforms.length}) of bind transforms does not ` +
        `match number (${numJoints}) of joints for ` +
        `skelAnimation ${animationSources[i] ?? ''}.\n`)
    }
    // XXX
    // xforms.size() should equal to numJoints
    // do we need a TF_VERIFY here?
    for (let j = 0; j < numJoints; ++j) {
      const m = xforms[j]
      result[i * numJoints + j] = m ? _FromFloatTuple(m) : new GfMatrix4f(0)
    }
  }

  return _UsdSkelImagingMatrix4fArray(result)
}
