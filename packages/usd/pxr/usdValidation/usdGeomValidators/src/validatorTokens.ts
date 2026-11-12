// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdGeomValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdGeomValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdGeomValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-23 (USD_GEOM_VALIDATOR_NAME_TOKENS). */
export const UsdGeomValidatorNameTokens = Object.freeze({
  stageMetadataChecker: 'usdGeomValidators:StageMetadataChecker',
  subsetFamilies: 'usdGeomValidators:SubsetFamilies',
  subsetParentIsImageable: 'usdGeomValidators:SubsetParentIsImageable',
  encapsulationChecker: 'usdGeomValidators:EncapsulationChecker',
})

/** validatorTokens.h:25-27 (USD_GEOM_VALIDATOR_KEYWORD_TOKENS). */
export const UsdGeomValidatorKeywordTokens = Object.freeze({
  UsdGeomSubset: 'UsdGeomSubset',
  UsdGeomValidators: 'UsdGeomValidators',
})

/** validatorTokens.h:29-34 (USD_GEOM_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdGeomValidationErrorNameTokens = Object.freeze({
  missingMetersPerUnitMetadata: 'MissingMetersPerUnitMetadata',
  missingUpAxisMetadata: 'MissingUpAxisMetadata',
  invalidSubsetFamily: 'InvalidSubsetFamily',
  notImageableSubsetParent: 'NotImageableSubsetParent',
  invalidNestedGprims: 'InvalidNestedGprims',
})
