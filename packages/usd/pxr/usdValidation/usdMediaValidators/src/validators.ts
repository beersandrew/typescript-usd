// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdMediaValidators/validators.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdMediaValidators/validators.cpp.
import type { Prim } from 'typescript-usd/usd'
import { AuthorshipAPI as UsdMediaAuthorshipAPI } from 'typescript-usd/usdMedia'
import { TfRegistryManager } from 'typescript-usd/tf'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry, type ValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdMediaValidationErrorNameTokens, UsdMediaValidatorNameTokens } from './validatorTokens.ts'

// validators.cpp:21-57 (_ShadowedOrDuplicateAuthorshipValidator).
function _shadowedOrDuplicateAuthorshipValidator(prim: Prim,
  _timeRange: ValidationTimeRange): ValidationError[] {
  const errors: ValidationError[] = []
  const site = (): ValidationErrorSite[] => [new ValidationErrorSite(prim.getStage(), prim.path)]

  for (const record of UsdMediaAuthorshipAPI.getShadowed(prim)) {
    errors.push(new ValidationError(UsdMediaValidationErrorNameTokens.shadowedAuthorshipApplication,
      ValidationErrorType.Warn, site(),
      `AuthorshipAPI:${record.getName()} on <${prim.path}> is shadowed by a stronger, `
      + 'explicit apiSchemas list and is not applied on the composed prim.'))
  }

  for (const record of UsdMediaAuthorshipAPI.getDuplicates(prim)) {
    errors.push(new ValidationError(UsdMediaValidationErrorNameTokens.duplicateAuthorshipApplication,
      ValidationErrorType.Warn, site(),
      `AuthorshipAPI:${record.getName()} on <${prim.path}> is applied in more than one prim `
      + 'spec; only the strongest opinion for each field survives composition.'))
  }

  return errors
}

// validators.cpp:59-95 (_AuthorshipInputsPairedValidator): the array length
// must be a multiple of the tuple-length that the schema's
// arraySizeConstraint declares for inputs.
function _authorshipInputsPairedValidator(prim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  const errors: ValidationError[] = []

  for (const record of UsdMediaAuthorshipAPI.getAll(prim)) {
    const attr = record.getInputsAttr()
    if (!attr?.isValid() || !attr.hasAuthoredValue()) continue

    const tupleLength = -attr.getArraySizeConstraint()
    // UsdAttribute::Get(VtArray<std::string>*) fails unless the attribute
    // holds a string array (a VtArray here).
    const inputs = attr.typeName === 'string[]' ? attr.getValue() as { length: number } | undefined : undefined
    if (tupleLength <= 0 || inputs === undefined || inputs.length % tupleLength === 0) continue

    const attrPath = `${attr.primPath}.${attr.name}`
    errors.push(new ValidationError(UsdMediaValidationErrorNameTokens.unpairedAuthorshipInputs,
      ValidationErrorType.Error, [new ValidationErrorSite(prim.getStage(), attrPath)],
      `<${attrPath}> has ${inputs.length} element(s), which is not a multiple of its `
      + `tuple-length ${tupleLength}.`))
  }

  return errors
}

// validators.cpp:97-106.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()
  registry.registerPluginPrimValidator(UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship,
    _shadowedOrDuplicateAuthorshipValidator)
  registry.registerPluginPrimValidator(UsdMediaValidatorNameTokens.authorshipInputsPaired,
    _authorshipInputsPairedValidator)
})
