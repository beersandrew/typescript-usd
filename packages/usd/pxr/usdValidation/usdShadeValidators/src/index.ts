// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdShadeValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdShadeValidators: its public tokens
// (validatorTokens.h). The library has no Python module; the names drop the
// UsdShade prefix the library entry already carries.
export {
  UsdShadeValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdShadeValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdShadeValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
