// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdGeomValidators/validators.cpp,
//  pxr/usdValidation/usdGeomValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdGeomValidators: the validators
// registered for usdGeom (validators.cpp) and their tokens
// (validatorTokens.h). The library has no Python module; the tokens drop the
// library prefix as the other entries' names do.
export {
  UsdGeomValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdGeomValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdGeomValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
