// Ported from OpenUSD 26.11.1: pxr/imaging/hd/light.cpp,
//  pxr/imaging/hd/light.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/light.{h,cpp} (OpenUSD 26.11.1): HdLight's
// dirty bits and HdLightTokens.
//
// Divergences:
// - Tokens are strings (TfToken), as elsewhere in this repository's hd.
// - StringifyDirtyBits (light.cpp:35-60) and the scene-index Sync overload
//   (light.h:104-107) are not ported.

import { Token as TfToken } from 'typescript-usd/tf'
import type { HdDirtyBits } from './changeTracker.ts'
import { HdSprim } from './sprim.ts'

/** light.h:23-56 (HD_LIGHT_TOKENS) */
export const HdLightTokens = {
  angle: TfToken('angle'),
  color: TfToken('color'),
  colorTemperature: TfToken('colorTemperature'),
  enableColorTemperature: TfToken('enableColorTemperature'),
  domeOffset: TfToken('domeOffset'),
  exposure: TfToken('exposure'),
  height: TfToken('height'),
  intensity: TfToken('intensity'),
  radius: TfToken('radius'),
  length: TfToken('length'),
  textureFile: TfToken('texture:file'),
  textureFormat: TfToken('texture:format'),
  width: TfToken('width'),
  ambient: TfToken('ambient'),
  diffuse: TfToken('diffuse'),
  specular: TfToken('specular'),
  normalize: TfToken('normalize'),
  hasShadow: TfToken('hasShadow'),
  shapingFocus: TfToken('shaping:focus'),
  shapingFocusTint: TfToken('shaping:focusTint'),
  shapingConeAngle: TfToken('shaping:cone:angle'),
  shapingConeSoftness: TfToken('shaping:cone:softness'),
  shapingIesFile: TfToken('shaping:ies:file'),
  shapingIesAngleScale: TfToken('shaping:ies:angleScale'),
  shapingIesNormalize: TfToken('shaping:ies:normalize'),
  shadowEnable: TfToken('shadow:enable'),
  shadowColor: TfToken('shadow:color'),
  shadowDistance: TfToken('shadow:distance'),
  shadowFalloff: TfToken('shadow:falloff'),
  shadowFalloffGamma: TfToken('shadow:falloffGamma'),

  params: TfToken('params'),
  shadowCollection: TfToken('shadowCollection'),
  shadowParams: TfToken('shadowParams'),
} as const

/** light.h:62-110. A light model, used in conjunction with HdRenderPass. */
export abstract class HdLight extends HdSprim {
  // Change tracking for HdLight (light.h:75-94)
  static readonly Clean = 0
  static readonly DirtyTransform = 1 << 0
  // Note: Because DirtyVisibility wasn't added, DirtyParams does double
  // duty for visibility changes.
  static readonly DirtyParams = 1 << 1
  static readonly DirtyShadowParams = 1 << 2
  static readonly DirtyCollection = 1 << 3
  static readonly DirtyResource = 1 << 4
  static readonly DirtyInstancer = 1 << 16
  static readonly AllDirty: HdDirtyBits = (HdLight.DirtyTransform
    | HdLight.DirtyParams
    | HdLight.DirtyShadowParams
    | HdLight.DirtyCollection
    | HdLight.DirtyResource
    | HdLight.DirtyInstancer)
}
