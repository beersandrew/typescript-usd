// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdMediaValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdMediaValidators/validatorTokens.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdMediaValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-23 (USD_MEDIA_VALIDATOR_NAME_TOKENS). */
export const UsdMediaValidatorNameTokens = Object.freeze({
  shadowedOrDuplicateAuthorship: 'usdMediaValidators:ShadowedOrDuplicateAuthorship',
  authorshipInputsPaired: 'usdMediaValidators:AuthorshipInputsPaired',
})

/** validatorTokens.h:25 (USD_MEDIA_VALIDATOR_KEYWORD_TOKENS). */
export const UsdMediaValidatorKeywordTokens = Object.freeze({
  UsdMediaValidators: 'UsdMediaValidators',
})

/** validatorTokens.h:27-30 (USD_MEDIA_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdMediaValidationErrorNameTokens = Object.freeze({
  shadowedAuthorshipApplication: 'ShadowedAuthorshipApplication',
  duplicateAuthorshipApplication: 'DuplicateAuthorshipApplication',
  unpairedAuthorshipInputs: 'UnpairedAuthorshipInputs',
})
