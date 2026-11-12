// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/jointInfluencesData.cpp,
//  pxr/usdImaging/usdSkelImaging/jointInfluencesData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/jointInfluencesData.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: UsdSkelInterleaveInfluences of the usdSkel port fills
// [index, weight] pairs; they are stored as the GfVec2f elements of a
// VtArray<GfVec2f> as upstream (jointInfluencesData.h:33).

import { Vec2f as GfVec2f } from 'typescript-usd/gf'
import {
  PrimvarsSchema as HdPrimvarsSchema, PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import { AnimMapper as UsdSkelAnimMapper, InterleaveInfluences as UsdSkelInterleaveInfluences } from 'typescript-usd/usdSkel'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdSkelImagingBindingSchema, UsdSkelImagingBindingSchemaTokens } from './bindingSchema.ts'
import { _UsdSkelImagingGetArray, UsdSkelImagingGetTypedValue } from './dataSourceUtils.ts'
import { UsdSkelImagingSkeletonSchema } from './skeletonSchema.ts'

/** jointInfluencesData.h:20-39. Some of the data feeding into the ext
 *  computations to skin a prim. They are related to which points are
 *  influenced by what skinning transform. These data come from the
 *  SkelBindingAPI primvars. */
export interface UsdSkelImagingJointInfluencesData {
  /** Each vec2f is a pair of a joint index and weight.
   *
   *  If hasConstantInfluences is false, then the array contains
   *  numInfluencesPerComponent elements for each point of the skinned prim.
   *
   *  Otherwise, the array just contains numInfluencesPerComponent and every
   *  point is affected the same way. */
  influences: VtArray<GfVec2f>
  hasConstantInfluences: boolean
  numInfluencesPerComponent: number

  /** Remapping of joints in skeleton to joints used for skinning. */
  jointMapper: UsdSkelAnimMapper
}

/** jointInfluencesData.cpp:21-90. Compute data from SkelBindingAPI prim data
 *  source and bound Skeleton prim data source. */
export function UsdSkelImagingComputeJointInfluencesData(
  primSource: HdContainerDataSource | undefined,
  skeletonPrimSource: HdContainerDataSource | undefined,
): UsdSkelImagingJointInfluencesData {
  // UsdSkelImagingJointInfluencesData data{};
  const data: UsdSkelImagingJointInfluencesData = {
    influences: new VtArray<GfVec2f>([], VtValueTypes.GfVec2f),
    hasConstantInfluences: false,
    numInfluencesPerComponent: 0,
    jointMapper: new UsdSkelAnimMapper(),
  }

  const primvars = HdPrimvarsSchema.getFromParent(primSource)

  // joint indices primvar. Also determines hasConstantInterpolation
  // through primvar interpolation.
  const jointIndicesPrimvar = primvars.getPrimvar(
    UsdSkelImagingBindingSchemaTokens.jointIndicesPrimvar)

  const interpolation =
    UsdSkelImagingGetTypedValue(jointIndicesPrimvar.getInterpolation()) ?? ''

  data.hasConstantInfluences =
    interpolation === HdPrimvarSchemaTokens.constant

  const jointIndices = _UsdSkelImagingGetArray<number>(
    jointIndicesPrimvar.getPrimvarValue())
  if (jointIndices.length === 0) {
    return data
  }

  // joint weights primvar. Also determines numInfluencesPerComponent
  // through element size.
  const jointWeightsPrimvar = primvars.getPrimvar(
    UsdSkelImagingBindingSchemaTokens.jointWeightsPrimvar)

  const jointWeights = _UsdSkelImagingGetArray<number>(
    jointWeightsPrimvar.getPrimvarValue())
  if (jointWeights.length === 0) {
    return data
  }

  const elementSizeDs = jointWeightsPrimvar.getElementSize()
  if (elementSizeDs) {
    data.numInfluencesPerComponent = elementSizeDs.getTypedValue(0.0)
  } else {
    data.numInfluencesPerComponent = 1
  }

  // data.influences.resize(jointIndices.size());
  const interleaved: Array<[number, number]> = new Array(jointIndices.length)
    .fill(undefined).map(() => [0, 0])
  UsdSkelInterleaveInfluences(jointIndices, jointWeights, interleaved)
  data.influences = new VtArray<GfVec2f>(
    interleaved.map(([index, weight]) => new GfVec2f(index, weight)),
    VtValueTypes.GfVec2f)

  // Compute jointMapper.
  const joints = _UsdSkelImagingGetArray<string>(
    UsdSkelImagingBindingSchema.getFromParent(primSource).getJoints())
  if (joints.length > 0) {
    data.jointMapper = new UsdSkelAnimMapper(
      _UsdSkelImagingGetArray<string>(
        UsdSkelImagingSkeletonSchema.getFromParent(skeletonPrimSource).getJoints()),
      joints)
  }

  return data
}
