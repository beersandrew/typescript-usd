// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsVarSelsSessionLayer.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsVarSelsSessionLayer.py
// (registered as testUsdUtilsVarSelsSessionLayer; no testenv directory).
//
// API mapping: UsdUtils.StageCache.GetSessionLayerForVariantSelections(
// 'model', [(set, sel), ...]) is StageCache.GetSessionLayerForVariantSelections(
// 'model', [[set, sel], ...]) (a string is the TfToken modelName overload);
// primSpec.variantSelections[k] is getVariantSelections().get(k). Layer
// equality (==) is object identity.
import { describe, expect, it } from 'vitest'
import { StageCache } from 'typescript-usd/usdUtils'

describe('TestUsdUtilsVarSelsSessionLayer', () => {
  // testUsdUtilsVarSelsSessionLayer.py:11-30
  it('test_Basic', () => {
    // Verify contents of session layer for the requested variant selections.
    const lyr1 = StageCache.GetSessionLayerForVariantSelections(
      'model', [['modelingVariant', 'RockA'], ['shadingVariant', 'Mossy'], ['lodVariant', 'Low']])
    expect(lyr1.getPrimAtPath('/model')!.getVariantSelections().get('modelingVariant')).toBe('RockA')
    expect(lyr1.getPrimAtPath('/model')!.getVariantSelections().get('shadingVariant')).toBe('Mossy')
    expect(lyr1.getPrimAtPath('/model')!.getVariantSelections().get('lodVariant')).toBe('Low')

    // Specifying variants in a different order should still give a cache hit.
    const lyr2 = StageCache.GetSessionLayerForVariantSelections(
      'model', [['shadingVariant', 'Mossy'], ['lodVariant', 'Low'], ['modelingVariant', 'RockA']])
    expect(lyr1).toBe(lyr2)

    // Different variant selection should produce a new layer.
    const lyr3 = StageCache.GetSessionLayerForVariantSelections(
      'model', [['shadingVariant', 'Mossy'], ['lodVariant', 'Low'], ['modelingVariant', 'RockB']])
    expect(lyr2).not.toBe(lyr3)
  })
})
