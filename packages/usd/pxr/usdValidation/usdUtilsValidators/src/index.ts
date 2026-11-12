// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdUtilsValidators/validators.cpp,
//  pxr/usdValidation/usdUtilsValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdUtilsValidators: the validators
// registered for usdUtils (validators.cpp) and their tokens
// (validatorTokens.h). The library has no Python module; the tokens drop the
// library prefix as the other entries' names do.
export {
  UsdUtilsValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdUtilsValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdUtilsValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
