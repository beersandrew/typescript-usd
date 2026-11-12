// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/tokens.cpp,
//  pxr/imaging/hgi/tokens.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/tokens.{h,cpp} (OpenUSD 26.11.1).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

/** HGI_TOKENS (tokens.h:17-22), TF_DEFINE_PUBLIC_TOKENS (tokens.cpp:11). */
export const HgiTokens = TfMakeTokens({
  taskDriver: 'taskDriver',
  renderDriver: 'renderDriver',
  OpenGL: 'OpenGL',
  Metal: 'Metal',
  Vulkan: 'Vulkan',
})

/** HGI_SHADER_KEYWORD_TOKENS (tokens.h:26-50), TF_DEFINE_PUBLIC_TOKENS
 *  (tokens.cpp:13). */
export const HgiShaderKeywordTokens = TfMakeTokens({
  hdPosition: 'hdPosition',
  hdPointCoord: 'hdPointCoord',
  hdClipDistance: 'hdClipDistance',
  hdCullDistance: 'hdCullDistance',
  hdVertexID: 'hdVertexID',
  hdInstanceID: 'hdInstanceID',
  hdPrimitiveID: 'hdPrimitiveID',
  hdSampleID: 'hdSampleID',
  hdSamplePosition: 'hdSamplePosition',
  hdFragCoord: 'hdFragCoord',
  hdFrontFacing: 'hdFrontFacing',
  hdLayer: 'hdLayer',
  hdBaseVertex: 'hdBaseVertex',
  hdBaseInstance: 'hdBaseInstance',
  hdViewportIndex: 'hdViewportIndex',
  hdPositionInPatch: 'hdPositionInPatch',
  hdPatchID: 'hdPatchID',
  hdGlobalInvocationID: 'hdGlobalInvocationID',
  hdBaryCoordNoPersp: 'hdBaryCoordNoPersp',
  hdSampleMaskIn: 'hdSampleMaskIn',
  hdSampleMask: 'hdSampleMask',
  hdDepthAny: 'hdDepthAny',
  hdDepthGreater: 'hdDepthGreater',
  hdDepthLess: 'hdDepthLess',
})
