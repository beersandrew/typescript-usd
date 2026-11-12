// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLodValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdLodValidators/validatorTokens.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdLodValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-29 (USD_LOD_VALIDATOR_NAME_TOKENS). */
export const UsdLodValidatorNameTokens = Object.freeze({
  heuristicLodDomain: 'usdLodValidators:HeuristicLodDomain',
  distanceHeuristicThresholds: 'usdLodValidators:DistanceHeuristicThresholds',
  screenSizeHeuristicThresholds: 'usdLodValidators:ScreenSizeHeuristicThresholds',
  lodOverrideApiMode: 'usdLodValidators:LodOverrideApiMode',
  lodRootApiHeuristics: 'usdLodValidators:LodRootApiHeuristics',
})

/** validatorTokens.h:31 (USD_LOD_VALIDATOR_KEYWORD_TOKENS). */
export const UsdLodValidatorKeywordTokens = Object.freeze({
  UsdLodValidators: 'UsdLodValidators',
})

/** validatorTokens.h:33-57 (USD_LOD_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdLodValidationErrorNameTokens = Object.freeze({
  lodDomainEmpty: 'LodDomainEmpty',
  thresholdsNotStrictlyIncreasing: 'ThresholdsNotStrictlyIncreasing',
  thresholdsNotStrictlyDecreasing: 'ThresholdsNotStrictlyDecreasing',
  blendThresholdBelowThreshold: 'BlendThresholdBelowThreshold',
  blendThresholdAboveThreshold: 'BlendThresholdAboveThreshold',
  blendThresholdAboveNextThreshold: 'BlendThresholdAboveNextThreshold',
  blendThresholdBelowNextThreshold: 'BlendThresholdBelowNextThreshold',
  invalidProjectionMethod: 'InvalidProjectionMethod',
  invalidExtentSize: 'InvalidExtentSize',
  invalidOverrideMode: 'InvalidOverrideMode',
  unreadableOverrideIndex: 'UnreadableOverrideIndex',
  invalidHeuristicTarget: 'InvalidHeuristicTarget',
})
