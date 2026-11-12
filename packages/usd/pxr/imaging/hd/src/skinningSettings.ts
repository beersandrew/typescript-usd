// Ported from OpenUSD 26.11.1: pxr/imaging/hd/skinningSettings.cpp,
//  pxr/imaging/hd/skinningSettings.h, pxr/imaging/hd/tokens.h
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/skinningSettings.{h,cpp} (OpenUSD 26.11.1).
//
// HdSkinningInputTokens / HdSkinningSkelInputTokens are declared in
// pxr/imaging/hd/tokens.h:500-537 upstream; tokens.ts does not have them, so
// they are declared here.

import {
  TfEnvSetting,
  TfGetEnvSetting,
  MakeTokens as TfMakeTokens,
} from 'typescript-usd/tf'

/** HD_SKINNING_INPUT_TOKENS, tokens.h:500-522 */
export const HdSkinningInputTokens = TfMakeTokens({
  skinningXforms: 'hydra:skinningXforms',
  skinningDualQuats: 'hydra:skinningDualQuats',
  skinningScaleXforms: 'hydra:skinningScaleXforms',
  blendShapeWeights: 'hydra:blendShapeWeights',
  skelLocalToCommonSpace: 'hydra:skelLocalToWorld',
  commonSpaceToPrimLocal: 'hydra:primWorldToLocal',
  blendShapeOffsets: 'hydra:blendShapeOffsets',
  blendShapeOffsetRanges: 'hydra:blendShapeOffsetRanges',
  numBlendShapeOffsetRanges: 'hydra:numBlendShapeOffsetRanges',

  hasConstantInfluences: 'hydra:hasConstantInfluences',
  numInfluencesPerComponent: 'hydra:numInfluencesPerComponent',
  influences: 'hydra:influences',
  // skinningMethod primvar on the skel schema is a token, we provide a
  // numeric alternative to pass to storm's vertex shader.
  numSkinningMethod: 'hydra:numSkinningMethod',
  // Extra primvars for computing instance/vertex offsets to index into
  // concatenated skinningXForms/blendShapeWeights constant primvars.
  numJoints: 'hydra:numJoints',
  numBlendShapeWeights: 'hydra:numBlendShapeWeights',
})

/** HD_SKINNING_SKEL_INPUT_TOKENS, tokens.h:524-537 */
export const HdSkinningSkelInputTokens = TfMakeTokens({
  geomBindTransform: 'skel:geomBindTransform',
})

/** skinningSettings.cpp:14-23 */
const HD_ENABLE_DEFERRED_SKINNING = new TfEnvSetting('HD_ENABLE_DEFERRED_SKINNING', false,
  'Instead of creating skinning extComputations, emit all the skinning ' +
  'inputs as primvars and defer skinning to the renderer because renderers ' +
  'like storm might have special optimization like vertex shaders ' +
  'implementation. Caveat is current implementation requires modifying ' +
  'sceneIndices in usdImaging and usdSkelImaging and the graph doesn\'t have ' +
  'any renderer knowledge so we can not dynamically change the behavior. ' +
  'When this is true, renderers that don\'t support this feature will lose ' +
  'skinning. It would be better to make this renderer configurable in the ' +
  'future.')

/** namespace HdSkinningSettings, skinningSettings.{h,cpp} */
export const HdSkinningSettings = {
  /** skinningSettings.cpp:27-34 */
  isSkinningDeferred(): boolean {
    // HYD-3475
    // Currently deferred skinning doesn't work in GL so need to
    // setenv HGI_ENABLE_VULKAN=1 as well.
    return TfGetEnvSetting(HD_ENABLE_DEFERRED_SKINNING)
  },

  /** skinningSettings.cpp:36-56 */
  getSkinningInputNames(extraInputNames: readonly string[] = []): string[] {
    const inputNames: string[] = []
    for (const input of HdSkinningInputTokens.allTokens) {
      // HYD-3533
      // need to investigate why skinningScaleXforms is corrupting primvar
      // inputs in the shader, this is working in compute shader code path.
      if (input !== HdSkinningInputTokens.skinningScaleXforms) {
        inputNames.push(input)
      }
    }
    for (const skelInput of HdSkinningSkelInputTokens.allTokens) {
      inputNames.push(skelInput)
    }
    for (const extraInput of extraInputNames) {
      inputNames.push(extraInput)
    }
    return inputNames
  },
}
