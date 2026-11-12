// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/tokens.cpp,
//  pxr/imaging/hdSt/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** HDST_GLSL_PROGRAM_TOKENS (tokens.h:16-34), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStGLSLProgramTokens = TfMakeTokens({
  smoothNormalsFloatToFloat: 'smoothNormalsFloatToFloat',
  smoothNormalsFloatToPacked: 'smoothNormalsFloatToPacked',
  smoothNormalsDoubleToDouble: 'smoothNormalsDoubleToDouble',
  smoothNormalsDoubleToPacked: 'smoothNormalsDoubleToPacked',
  flatNormalsTriFloatToFloat: 'flatNormalsTriFloatToFloat',
  flatNormalsTriFloatToPacked: 'flatNormalsTriFloatToPacked',
  flatNormalsTriDoubleToDouble: 'flatNormalsTriDoubleToDouble',
  flatNormalsTriDoubleToPacked: 'flatNormalsTriDoubleToPacked',
  flatNormalsQuadFloatToFloat: 'flatNormalsQuadFloatToFloat',
  flatNormalsQuadFloatToPacked: 'flatNormalsQuadFloatToPacked',
  flatNormalsQuadDoubleToDouble: 'flatNormalsQuadDoubleToDouble',
  flatNormalsQuadDoubleToPacked: 'flatNormalsQuadDoubleToPacked',
  flatNormalsTriQuadFloatToFloat: 'flatNormalsTriQuadFloatToFloat',
  flatNormalsTriQuadFloatToPacked: 'flatNormalsTriQuadFloatToPacked',
  flatNormalsTriQuadDoubleToDouble: 'flatNormalsTriQuadDoubleToDouble',
  flatNormalsTriQuadDoubleToPacked: 'flatNormalsTriQuadDoubleToPacked',
  quadrangulateFloat: 'quadrangulateFloat',
  quadrangulateDouble: 'quadrangulateDouble',
})

/** HDST_TOKENS (tokens.h:36-62), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStTokens = TfMakeTokens({
  constantLighting: 'constantLighting',
  packedSmoothNormals: 'packedSmoothNormals',
  smoothNormals: 'smoothNormals',
  packedFlatNormals: 'packedFlatNormals',
  flatNormals: 'flatNormals',
  scale: 'scale',
  bias: 'bias',
  rotation: 'rotation',
  translation: 'translation',
  sRGB: 'sRGB',
  raw: 'raw',
  _double: 'double',
  _float: 'float',
  _int: 'int',
  colorSpaceAuto: 'auto',
  fvarIndices: 'fvarIndices',
  fvarPatchParam: 'fvarPatchParam',
  coarseFaceIndex: 'coarseFaceIndex',
  processedFaceCounts: 'processedFaceCounts',
  processedFaceIndices: 'processedFaceIndices',
  geomSubsetFaceIndices: 'geomSubsetFaceIndices',
  pointSizeScale: 'pointSizeScale',
  screenSpaceWidths: 'screenSpaceWidths',
  minScreenSpaceWidths: 'minScreenSpaceWidths',
  shadowCompareTextures: 'shadowCompareTextures',
  storm: 'storm',
})

/** HDST_TEXTURE_TOKENS (tokens.h:64-80), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStTextureTokens = TfMakeTokens({
  wrapS: 'wrapS',
  wrapT: 'wrapT',
  wrapR: 'wrapR',
  black: 'black',
  clamp: 'clamp',
  mirror: 'mirror',
  repeat: 'repeat',
  useMetadata: 'useMetadata',
  minFilter: 'minFilter',
  magFilter: 'magFilter',
  linear: 'linear',
  nearest: 'nearest',
  linearMipmapLinear: 'linearMipmapLinear',
  linearMipmapNearest: 'linearMipmapNearest',
  nearestMipmapLinear: 'nearestMipmapLinear',
  nearestMipmapNearest: 'nearestMipmapNearest',
})

/** HDST_RENDER_BUFFER_TOKENS (tokens.h:82-83), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStRenderBufferTokens = TfMakeTokens({
  stormMsaaSampleCount: 'storm:msaaSampleCount',
})

/** HDST_RENDER_SETTINGS_TOKENS (tokens.h:85-92), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStRenderSettingsTokens = TfMakeTokens({
  defaultTransparencyMode: 'defaultTransparencyMode',
  enableTinyPrimCulling: 'enableTinyPrimCulling',
  volumeRaymarchingStepSize: 'volumeRaymarchingStepSize',
  volumeRaymarchingStepSizeLighting: 'volumeRaymarchingStepSizeLighting',
  volumeMaxTextureMemoryPerField: 'volumeMaxTextureMemoryPerField',
  maxLights: 'maxLights',
  domeLightCubemapTargetMemory: 'domeLightCubemapTargetMemory',
})

/** HDST_DEFAULT_TRANSPARENCY_MODE_TOKENS (tokens.h:94-97), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStDefaultTransparencyModeTokens = TfMakeTokens({
  screenDoor: 'screenDoor',
  additive: 'additive',
  oit: 'oit',
})

/** HDST_MATERIAL_TAG_TOKENS (tokens.h:109-116), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStMaterialTagTokens = TfMakeTokens({
  defaultMaterialTag: 'defaultMaterialTag',
  masked: 'masked',
  displayInOverlay: 'displayInOverlay',
  translucentToSelection: 'translucentToSelection',
  additive: 'additive',
  translucent: 'translucent',
  volume: 'volume',
})

/** HDST_SDR_METADATA_TOKENS (tokens.h:118-119), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStSdrMetadataTokens = TfMakeTokens({
  swizzle: 'swizzle',
})

/** HDST_PERF_TOKENS (tokens.h:121-127), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStPerfTokens = TfMakeTokens({
  copyBufferGpuToGpu: 'copyBufferGpuToGpu',
  copyBufferCpuToGpu: 'copyBufferCpuToGpu',
  drawItemsCacheHit: 'drawItemsCacheHit',
  drawItemsCacheMiss: 'drawItemsCacheMiss',
  drawItemsCacheStale: 'drawItemsCacheStale',
  drawItemsFetched: 'drawItemsFetched',
})

/** HDST_NATIVE_IMPLICITS_TOKENS (tokens.h:129-141), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp). */
export const HdStNativeImplicitsTokens = TfMakeTokens({
  sphere: 'sphere',
  sphereRadius: 'sphereRadius',
  conicalFrustum: 'conicalFrustum',
  conicalFrustumRadiusTop: 'conicalFrustumRadiusTop',
  conicalFrustumRadiusBot: 'conicalFrustumRadiusBot',
  conicalFrustumHeight: 'conicalFrustumHeight',
  conicalFrustumAxis: 'conicalFrustumAxis',
  capsule: 'capsule',
  capsuleRadiusTop: 'capsuleRadiusTop',
  capsuleRadiusBot: 'capsuleRadiusBot',
  capsuleHeight: 'capsuleHeight',
  capsuleAxis: 'capsuleAxis',
})

