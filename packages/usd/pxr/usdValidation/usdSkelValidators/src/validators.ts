// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdSkelValidators/validators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdSkelValidators/validators.cpp.
import { TfRegistryManager } from 'typescript-usd/tf'
import { SchemaRegistry as UsdSchemaRegistry, type Prim } from 'typescript-usd/usd'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry,
  type ValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdSkelValidationErrorNameTokens, UsdSkelValidatorNameTokens } from './validatorTokens.ts'

// UsdSkelTokens (usdSkel/tokens.h) this file reads.
const UsdSkelTokens = { SkelBindingAPI: 'SkelBindingAPI', SkelRoot: 'SkelRoot' } as const

// validators.cpp:31-43: the property names of the SkelBindingAPI, built once.
let _skelPropertyNames: Set<string> | undefined
function _getSkelPropertyNames(): Set<string> {
  return _skelPropertyNames ??= new Set(UsdSchemaRegistry.getInstance()
    .buildComposedPrimDefinition('', [UsdSkelTokens.SkelBindingAPI]).getPropertyNames())
}

// validators.cpp:23-66.
function _skelBindingApiAppliedValidator(usdPrim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  const errors: ValidationError[] = []

  if (!usdPrim.hasAPI(UsdSkelTokens.SkelBindingAPI)) {
    const skelPropertyNames = _getSkelPropertyNames()
    for (const primToken of usdPrim.getPropertyNames()) {
      if (!skelPropertyNames.has(primToken)) continue
      errors.push(new ValidationError(
        UsdSkelValidationErrorNameTokens.missingSkelBindingAPI, ValidationErrorType.Error,
        [new ValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
        `Found a UsdSkelBinding property (${primToken}), but no SkelBindingAPI applied on the prim `
        + `<${usdPrim.path}>.`))
      break
    }
  }
  return errors
}

// validators.cpp:68-99.
function _skelBindingApiValidator(usdPrim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  const errors: ValidationError[] = []

  if (!usdPrim.hasAPIInFamily(UsdSkelTokens.SkelBindingAPI)) return []

  if (usdPrim.typeName !== UsdSkelTokens.SkelRoot) {
    let parentPrim = usdPrim.getParent()
    while (parentPrim && !parentPrim.isPseudoRoot()) {
      if (parentPrim.typeName !== UsdSkelTokens.SkelRoot) {
        parentPrim = parentPrim.getParent()
      } else {
        return errors
      }
    }
    errors.push(new ValidationError(
      UsdSkelValidationErrorNameTokens.invalidSkelBindingAPIApply, ValidationErrorType.Error,
      [new ValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
      `UsdSkelBindingAPI applied on prim: <${usdPrim.path}>, which is not of type SkelRoot or is `
      + 'not rooted at a prim of type SkelRoot, as required by the UsdSkel schema.'))
  }
  return errors
}

// validators.cpp:101-112.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()

  registry.registerPluginPrimValidator(UsdSkelValidatorNameTokens.skelBindingApiAppliedValidator,
    _skelBindingApiAppliedValidator)

  registry.registerPluginPrimValidator(UsdSkelValidatorNameTokens.skelBindingApiValidator,
    _skelBindingApiValidator)
})
