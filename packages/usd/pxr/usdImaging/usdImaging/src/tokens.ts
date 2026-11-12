// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/tokens.cpp,
//  pxr/usdImaging/usdImaging/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** tokens.h:16-46 USDIMAGING_TOKENS */
export const UsdImagingTokens = TfMakeTokens({
  collectionLightLink: 'collection:lightLink',
  collectionShadowLink: 'collection:shadowLink',
  configPrefix: 'config:',
  faceIndexPrimvar: 'faceIndexPrimvar',
  faceOffsetPrimvar: 'faceOffsetPrimvar',
  primvarsNormals: 'primvars:normals',
  primvarsWidths: 'primvars:widths',
  ptexFaceIndex: 'ptexFaceIndex',
  ptexFaceOffset: 'ptexFaceOffset',
  usdPopulatedPrimCount: 'usdPopulatedPrimCount',
  usdVaryingExtent: 'usdVaryingExtent',
  usdVaryingPrimvar: 'usdVaryingPrimvar',
  usdVaryingTopology: 'usdVaryingTopology',
  usdVaryingVisibility: 'usdVaryingVisibility',
  usdVaryingWidths: 'usdVaryingWidths',
  usdVaryingNormals: 'usdVaryingNormals',
  usdVaryingXform: 'usdVaryingXform',
  usdVaryingTexture: 'usdVaryingTexture',
  uvPrimvar: 'uvPrimvar',
  UsdPreviewSurface: 'UsdPreviewSurface',
  UsdUVTexture: 'UsdUVTexture',
  UsdPrimvarReader_float: 'UsdPrimvarReader_float',
  UsdPrimvarReader_float2: 'UsdPrimvarReader_float2',
  UsdPrimvarReader_float3: 'UsdPrimvarReader_float3',
  UsdPrimvarReader_float4: 'UsdPrimvarReader_float4',
  UsdPrimvarReader_int: 'UsdPrimvarReader_int',
  UsdTransform2d: 'UsdTransform2d',
  stageSceneIndexRepopulate: '__usdStageSceneIndexRepopulate',
  niPropagatedPrototypesScope: 'UsdNiPropagatedPrototypes',
})
