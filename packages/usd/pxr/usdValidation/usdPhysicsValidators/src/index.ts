// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdPhysicsValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdPhysicsValidators: the validators
// register with UsdValidationRegistry on import; the library's public surface
// is its tokens (validatorTokens.h; the library has no Python module).
export {
  UsdPhysicsValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdPhysicsValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdPhysicsValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
