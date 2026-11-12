// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdSkelValidators/validators.cpp,
//  pxr/usdValidation/usdSkelValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdSkelValidators: the validators
// registered for usdSkel (validators.cpp) and their tokens
// (validatorTokens.h). The library has no Python module; the tokens drop the
// library prefix as the other entries' names do.
export {
  UsdSkelValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdSkelValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdSkelValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
