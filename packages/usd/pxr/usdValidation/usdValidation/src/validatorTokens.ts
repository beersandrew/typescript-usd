// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/validatorTokens.cpp,
//  pxr/usdValidation/usdValidation/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-22 (USD_VALIDATOR_NAME_TOKENS). */
export const UsdValidatorNameTokens = Object.freeze({
  compositionErrorTest: 'usdValidation:CompositionErrorTest',
  stageMetadataChecker: 'usdValidation:StageMetadataChecker',
  attributeTypeMismatch: 'usdValidation:AttributeTypeMismatch',
})

/** validatorTokens.h:24-25 (USD_VALIDATOR_KEYWORD_TOKENS). */
export const UsdValidatorKeywordTokens = Object.freeze({
  UsdCoreValidators: 'UsdCoreValidators',
})

/** validatorTokens.h:27-30 (USD_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdValidationErrorNameTokens = Object.freeze({
  compositionError: 'CompositionError',
  missingDefaultPrim: 'MissingDefaultPrim',
  attributeTypeMismatch: 'AttributeTypeMismatch',
})
