// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdValidation/module.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
import './coreValidators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdValidation, with the Python module's
// names (UsdValidation.ValidationRegistry, ...; module.cpp).
export { UsdValidationContext as ValidationContext } from './context.ts'
export {
  UsdValidationError as ValidationError, UsdValidationErrorSite as ValidationErrorSite,
  UsdValidationErrorType as ValidationErrorType,
} from './error.ts'
export { UsdValidationFixer as ValidationFixer } from './fixer.ts'
export type {
  UsdValidationFixerCanApplyFn as ValidationFixerCanApplyFn, UsdValidationFixerImplFn as ValidationFixerImplFn,
} from './fixer.ts'
export { UsdValidationNotice as Notice } from './notice.ts'
export { UsdValidationRegistry as ValidationRegistry } from './registry.ts'
export { UsdValidationTimeRange as ValidationTimeRange } from './timeRange.ts'
export {
  UsdValidationValidator as Validator, UsdValidationValidatorMetadata as ValidatorMetadata,
  UsdValidationValidatorSuite as ValidatorSuite,
} from './validator.ts'
export type {
  UsdValidateLayerTaskFn as ValidateLayerTaskFn, UsdValidatePrimTaskFn as ValidatePrimTaskFn,
  UsdValidateStageTaskFn as ValidateStageTaskFn, UsdValidationValidatorMetadataInit as ValidatorMetadataInit,
  UsdValidationValidatorTask as ValidatorTask, UsdValidationTaskResult as ValidationTaskResult,
} from './validator.ts'
export {
  UsdValidationErrorNameTokens as ValidationErrorNameTokens, UsdValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
