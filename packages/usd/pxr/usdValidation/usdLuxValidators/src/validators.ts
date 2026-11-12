// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLuxValidators/validators.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdLuxValidators/validators.cpp.
import type { Prim } from 'typescript-usd/usd'
import { LightAPI as UsdLuxLightAPI } from 'typescript-usd/usdLux'
import { ConnectableAPI as UsdShadeConnectableAPI } from 'typescript-usd/usdShade'
import { TfRegistryManager } from 'typescript-usd/tf'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry, type ValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdLuxValidationErrorNameTokens, UsdLuxValidatorNameTokens } from './validatorTokens.ts'

// UsdPrim::GetName: the last element of the prim path.
function _primName(prim: Prim): string {
  return prim.path.slice(prim.path.lastIndexOf('/') + 1)
}

function _error(name: string, prim: Prim, message: string): ValidationError {
  return new ValidationError(name, ValidationErrorType.Error,
    [new ValidationErrorSite(prim.getStage(), prim.path)], message)
}

// validators.cpp:23-141 (_EncapsulationValidator).
function _encapsulationValidator(usdPrim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  // Encapsulation rules for connections are only relevant for UsdLuxLight and
  // UsdLuxLightFilter prims, so we only need to run this validator for those
  // prims.
  const hasLightAPI = usdPrim.hasAPI(UsdLuxLightAPI.typeName)
  if (!(hasLightAPI || usdPrim.isA('LightFilter'))) return []

  const connectable = new UsdShadeConnectableAPI(usdPrim)
  if (!connectable.isValid()) return []

  const parentPrim = usdPrim.getParent()
  if (!parentPrim || parentPrim.isPseudoRoot()) return []

  const parentConnectable = new UsdShadeConnectableAPI(parentPrim)
  const parentIsConnectable = parentConnectable.isValid()

  const errors: ValidationError[] = []

  // validators.cpp:51-71: If usdPrim is a light, that is, it has a LightAPI
  // applied, then it must not have a connectable parent, lights can not be
  // scoped within a UsdShadeNodeGraph, or other Connectable / container
  // prims. Except Light themselves, that is parent prims with LightAPI
  // applied! For example, we expect PortalLight prims to be parented inside
  // DomeLight prims.
  if (hasLightAPI && parentIsConnectable && !parentPrim.hasAPI(UsdLuxLightAPI.typeName)) {
    errors.push(_error(UsdLuxValidationErrorNameTokens.lightUnderConnectable, usdPrim,
      `Light ${usdPrim.typeName} <${usdPrim.path}> cannot have a connectable parent `
      + `${parentPrim.typeName} <${parentPrim.path}>.`))
  }

  // validators.cpp:73-88: LightFilter is a connectable container prim, but
  // can not contain lights. Note that lights within a light filter will be
  // caught by the above check. Also note that other non-usdLux connectable
  // prims like UsdShadeMaterial, must be checked here, as UsdShadeMaterial
  // validator can not control downsteam schemas like UsdLuxLightFilter.
  if (usdPrim.isA('LightFilter') && parentPrim.isA('Material')) {
    errors.push(_error(UsdLuxValidationErrorNameTokens.lightFilterUnderLightFilter, usdPrim,
      `LightFilter <${usdPrim.path}> cannot have a parent <${parentPrim.path}> that `
      + 'is a UsdShadeMaterial.'))
  }

  // validators.cpp:89-138: Generic UsdLux (mimics UsdShade) connectable
  // encapsulation rules:
  if (parentIsConnectable && !parentConnectable.isContainer()) {
    // It is a violation of the encapsulation rule which enforces
    // encapsulation of connectable prims under a Container-type
    // connectable prim.
    errors.push(_error(UsdLuxValidationErrorNameTokens.connectableInNonContainer, usdPrim,
      `Connectable ${usdPrim.typeName} <${usdPrim.path}> cannot reside `
      + `under a non-Container Connectable ${parentPrim.typeName}`))
  } else if (!parentIsConnectable) {
    const verifyValidAncestor = (currentAncestor: Prim | undefined): void => {
      if (!currentAncestor || currentAncestor.isPseudoRoot()) return
      if (new UsdShadeConnectableAPI(currentAncestor).isValid()) {
        // it's only OK to have a non-connectable parent if all
        // the rest of your ancestors are also non-connectable.
        // The error message we give is targeted at the most common
        // infraction, using Scope or other grouping prims inside
        // a Container like a Material
        errors.push(_error(UsdLuxValidationErrorNameTokens.invalidConnectableHierarchy, usdPrim,
          `Connectable ${usdPrim.typeName} <${usdPrim.path}> can only have `
          + `Connectable Container ancestors up to ${currentAncestor.typeName} `
          + `ancestor <${currentAncestor.path}>, but its parent ${_primName(parentPrim)} `
          + `is a ${parentPrim.typeName}.`))
        return
      }
      verifyValidAncestor(currentAncestor.getParent())
    }
    verifyValidAncestor(parentPrim.getParent())
  }

  return errors
}

// validators.cpp:143-150.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()
  registry.registerPluginPrimValidator(UsdLuxValidatorNameTokens.encapsulationValidator,
    _encapsulationValidator)
})
