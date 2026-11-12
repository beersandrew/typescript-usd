// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLuxValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdLuxValidators/validatorTokens.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdLuxValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-21 (USD_LUX_VALIDATOR_NAME_TOKENS). */
export const UsdLuxValidatorNameTokens = Object.freeze({
  encapsulationValidator: 'usdLuxValidators:EncapsulationRulesValidator',
})

/** validatorTokens.h:23 (USD_LUX_VALIDATOR_KEYWORD_TOKENS). */
export const UsdLuxValidatorKeywordTokens = Object.freeze({
  UsdLuxValidators: 'UsdLuxValidators',
})

/** validatorTokens.h:25-29 (USD_LUX_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdLuxValidationErrorNameTokens = Object.freeze({
  lightUnderConnectable: 'LightUnderConnectable',
  lightFilterUnderLightFilter: 'LightFilterUnderLightFilter',
  connectableInNonContainer: 'ConnectableInNonContainer',
  invalidConnectableHierarchy: 'InvalidConnectableHierarchy',
})
