// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/tokens.cpp,
//  pxr/usdImaging/usdSkelImaging/tokens.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** tokens.h:16-22 USD_SKEL_IMAGING_EXT_COMPUTATION_TYPE_TOKENS */
export const UsdSkelImagingExtComputationTypeTokens = TfMakeTokens({
  points: 'points',
  normals: 'normals',
})

/** tokens.h:24-31 USD_SKEL_IMAGING_PRIM_TYPE_TOKENS */
export const UsdSkelImagingPrimTypeTokens = TfMakeTokens({
  skeleton: 'skeleton',
  skelAnimation: 'skelAnimation',
  skelBlendShape: 'skelBlendShape',
})

/** tokens.h:33-41 USD_SKEL_IMAGING_EXT_COMPUTATION_NAME_TOKENS */
export const UsdSkelImagingExtComputationNameTokens = TfMakeTokens({
  pointsAggregatorComputation: 'skinningPointsInputAggregatorComputation',
  pointsComputation: 'skinningPointsComputation',
  normalsAggregatorComputation: 'skinningNormalsInputAggregatorComputation',
  normalsComputation: 'skinningNormalsComputation',
})

/** tokens.h:43-58 USD_SKEL_IMAGING_EXT_AGGREGATOR_COMPUTATION_INPUT_NAME_TOKENS */
export const UsdSkelImagingExtAggregatorComputationInputNameTokens = TfMakeTokens({
  restPoints: 'restPoints',
  geomBindXform: 'geomBindXform',
  influences: 'influences',
  numInfluencesPerComponent: 'numInfluencesPerComponent',
  hasConstantInfluences: 'hasConstantInfluences',
  blendShapeOffsets: 'blendShapeOffsets',
  blendShapeOffsetRanges: 'blendShapeOffsetRanges',
  numBlendShapeOffsetRanges: 'numBlendShapeOffsetRanges',
  restNormals: 'restNormals',
  faceVertexIndices: 'faceVertexIndices',
  hasFaceVaryingNormals: 'hasFaceVaryingNormals',
})

/** tokens.h:60-70 USD_SKEL_IMAGING_EXT_COMPUTATION_INPUT_NAME_TOKENS */
export const UsdSkelImagingExtComputationInputNameTokens = TfMakeTokens({
  blendShapeWeights: 'blendShapeWeights',
  skinningXforms: 'skinningXforms',
  skinningScaleXforms: 'skinningScaleXforms',
  skinningDualQuats: 'skinningDualQuats',
  skelLocalToCommonSpace: 'skelLocalToWorld',
  commonSpaceToPrimLocal: 'primWorldToLocal',
})

/** tokens.h:72-78 USD_SKEL_IMAGING_EXT_COMPUTATION_LEGACY_INPUT_NAME_TOKENS */
export const UsdSkelImagingExtComputationLegacyInputNameTokens = TfMakeTokens({
  skelLocalToWorld: 'skelLocalToWorld',
  primWorldToLocal: 'primWorldToLocal',
})

/** tokens.h:81-87 USD_SKEL_IMAGING_EXT_COMPUTATION_OUTPUT_NAME_TOKENS */
export const UsdSkelImagingExtComputationOutputNameTokens = TfMakeTokens({
  skinnedPoints: 'skinnedPoints',
  skinnedNormals: 'skinnedNormals',
})
