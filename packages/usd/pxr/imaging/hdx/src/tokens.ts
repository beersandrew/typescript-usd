// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/tokens.cpp,
//  pxr/imaging/hdx/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/tokens.{h,cpp} (OpenUSD 26.11.1).
//
// TF_DEFINE_PUBLIC_TOKENS tables are frozen objects of TfTokens.

import { Token as TfToken } from 'typescript-usd/tf'

function _Tokens<const K extends string>(names: readonly K[]): Readonly<Record<K, TfToken>> {
  const out = {} as Record<K, TfToken>
  for (const name of names) out[name] = TfToken(name)
  return Object.freeze(out)
}

/** tokens.h:17-52 (HDX_TOKENS) */
export const HdxTokens = _Tokens([
  'hdxOitCounterBuffer',
  'hdxOitColorBuffer',
  'hdxOitDataBuffer',
  'hdxOitDepthBuffer',
  'hdxOitTransmissionDepthBuffer',
  'hdxOitIndexBuffer',
  'hdxOitJointBuffer',
  'hdxSelectionBuffer',
  'imagerVersion',
  'lightingContext',
  'lightingShader',
  'occludedSelectionOpacity',
  'oitCounter',
  'oitJointBuffer',
  'oitData',
  'oitUniforms',
  'oitCounterBufferBar',
  'oitDataBufferBar',
  'oitJointBufferBar',
  'oitUniformBar',
  'oitRenderPassState',
  'oitScreenSize',
  'oitRequestFlag',
  'oitClearedFlag',
  'renderPassState',
  'renderIndexVersion',
  'selection',
  'selectionState',
  'selectionOffsets',
  'selectionUniforms',
  'selColor',
  'selLocateColor',
  'selectionPointColors',
  'drawTargetRenderPasses',
] as const)

/** tokens.h:56-77 (HDX_PRIMITIVE_TOKENS) */
export const HdxPrimitiveTokens = _Tokens([
  'lightTypePositional',
  'lightTypeDirectional',
  'lightTypeSpot',
  'aovInputTask',
  'boundingBoxTask',
  'colorCorrectionTask',
  'colorizeSelectionTask',
  'drawTargetTask',
  'drawTargetResolveTask',
  'oitRenderTask',
  'oitResolveTask',
  'oitVolumeRenderTask',
  'pickTask',
  'pickFromRenderBufferTask',
  'presentTask',
  'renderTask',
  'renderSetupTask',
  'simpleLightTask',
  'shadowTask',
] as const)

/** tokens.h:82-91 (HDX_RENDERTAG_TOKENS) */
export const HdxRenderTagTokens = _Tokens([
  'renderingGuide',
  'label',
  'cameraGuide',
  'inCameraGuide',
  'streamline',
  'interactiveOnlyGeom',
  'path',
] as const)

/** tokens.h:93-99 (HDX_COLOR_CORRECTION_TOKENS) */
export const HdxColorCorrectionTokens = _Tokens([
  'disabled',
  'sRGB',
  'openColorIO',
] as const)

/** tokens.h:101-111 (HDX_COLOR_CHANNEL_TOKENS) */
export const HdxColorChannelTokens = _Tokens([
  'color',
  'red',
  'green',
  'blue',
  'alpha',
  'luminance',
] as const)

/** tokens.h:113-124 (HDX_AOV_TOKENS) */
export const HdxAovTokens = _Tokens([
  // colorIntermediate->colorIntermediate is used to ping-pong between two
  // color targets when a task wishes to read from the color target and also
  // write into it.
  'colorIntermediate',
  // depthIntermediate functions analogously for depth targets.
  'depthIntermediate',
] as const)
