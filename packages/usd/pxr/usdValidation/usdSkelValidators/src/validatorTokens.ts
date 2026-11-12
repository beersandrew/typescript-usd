// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdSkelValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdSkelValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdSkelValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:16-19 (USD_SKEL_VALIDATOR_NAME_TOKENS). */
export const UsdSkelValidatorNameTokens = Object.freeze({
  skelBindingApiAppliedValidator: 'usdSkelValidators:SkelBindingApiAppliedValidator',
  skelBindingApiValidator: 'usdSkelValidators:SkelBindingApiValidator',
})

/** validatorTokens.h:21-22 (USD_SKEL_VALIDATOR_KEYWORD_TOKENS). */
export const UsdSkelValidatorKeywordTokens = Object.freeze({
  UsdSkelValidators: 'UsdSkelValidators',
})

/** validatorTokens.h:24-26 (USD_SKEL_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdSkelValidationErrorNameTokens = Object.freeze({
  missingSkelBindingAPI: 'MissingSkelBindingAPI',
  invalidSkelBindingAPIApply: 'InvalidSkelBindingAPIApply',
})
