// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdGeomValidators/validators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdGeomValidators/validators.cpp.
import { dictionaryLessThan, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import type { Prim, Stage } from 'typescript-usd/usd'
import { Subset as GeomSubset, type ElementType } from 'typescript-usd/usdGeom'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry,
  type ValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdGeomValidationErrorNameTokens, UsdGeomValidatorNameTokens } from './validatorTokens.ts'

// UsdGeomTokens (usdGeom/tokens.h) this file reads.
const UsdGeomTokens = { metersPerUnit: 'metersPerUnit', upAxis: 'upAxis' } as const

// The UsdGeom schema types these validators test, by TfType name.
const _imageableType = (): TfType => TfType.findByName('UsdGeomImageable')
const _subsetType = (): TfType => TfType.findByName('UsdGeomSubset')
const _boundableType = (): TfType => TfType.findByName('UsdGeomBoundable')
const _gprimType = (): TfType => TfType.findByName('UsdGeomGprim')

// validators.cpp:28-55.
function _getStageMetadataErrors(usdStage: Stage, _timeRange: ValidationTimeRange): ValidationError[] {
  const errors: ValidationError[] = []
  if (!usdStage.hasMetadata(UsdGeomTokens.metersPerUnit)) {
    errors.push(new ValidationError(
      UsdGeomValidationErrorNameTokens.missingMetersPerUnitMetadata, ValidationErrorType.Error,
      [new ValidationErrorSite(usdStage, '/')],
      `Stage with root layer <${usdStage.getRootLayer().identifier}> does not specify its `
      + 'linear scale in metersPerUnit.'))
  }
  if (!usdStage.hasMetadata(UsdGeomTokens.upAxis)) {
    errors.push(new ValidationError(
      UsdGeomValidationErrorNameTokens.missingUpAxisMetadata, ValidationErrorType.Error,
      [new ValidationErrorSite(usdStage, '/')],
      `Stage with root layer <${usdStage.getRootLayer().identifier}> does not specify an `
      + 'upAxis.'))
  }
  return errors
}

// validators.cpp:57-114.
function _subsetFamilies(usdPrim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  if (!(usdPrim?.isValid() && usdPrim.isInFamily(_imageableType(), 'all'))) return []

  // UsdGeomImageable(usdPrim) is valid when the prim IsA Imageable.
  if (!usdPrim.isA(_imageableType())) return []

  const stage = usdPrim.getStage()
  // Sort the family names so that they are in dictionary order, making
  // the order in which they are validated more predictable.
  const subsetFamilyNamesVec = [...GeomSubset.getAllGeomSubsetFamilyNames(stage, usdPrim.path)]
    .sort((a, b) => dictionaryLessThan(a, b) ? -1 : dictionaryLessThan(b, a) ? 1 : 0)

  const errors: ValidationError[] = []
  for (const subsetFamilyName of subsetFamilyNamesVec) {
    const familySubsets = GeomSubset.getGeomSubsets(stage, usdPrim.path, '', subsetFamilyName)

    // Determine the element type of the family by looking at the
    // first subset.
    const elementType = GeomSubset.getElementType(familySubsets[0]!)

    const { valid, reason } = GeomSubset.validateFamily(stage, usdPrim.path,
      elementType as ElementType, subsetFamilyName)
    if (!valid) {
      errors.push(new ValidationError(
        UsdGeomValidationErrorNameTokens.invalidSubsetFamily, ValidationErrorType.Error,
        [new ValidationErrorSite(stage, usdPrim.path)],
        `Imageable prim <${usdPrim.path}> has invalid subset family '${subsetFamilyName}': ${reason}`))
    }
  }
  return errors
}

// validators.cpp:116-147.
function _subsetParentIsImageable(usdPrim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  if (!(usdPrim?.isValid() && usdPrim.isInFamily(_subsetType(), 'all'))) return []

  // UsdGeomSubset(usdPrim) is valid when the prim IsA GeomSubset.
  if (!usdPrim.isA(_subsetType())) return []

  const parentPrim = usdPrim.getParent()
  // UsdGeomImageable(parentPrim) is valid when the parent IsA Imageable.
  if (parentPrim?.isA(_imageableType())) return []

  return [new ValidationError(
    UsdGeomValidationErrorNameTokens.notImageableSubsetParent, ValidationErrorType.Error,
    [new ValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
    `GeomSubset <${usdPrim.path}> has direct parent prim <${parentPrim?.path ?? ''}> that is not `
    + 'Imageable.')]
}

// validators.cpp:149-191.
function _hasValidEncapsulation(usdPrim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  const errors: ValidationError[] = []
  const primErrorSites = [new ValidationErrorSite(usdPrim.getStage(), usdPrim.path)]

  const parentPrim = usdPrim.getParent()

  if (usdPrim.isA(_boundableType())) {
    if (parentPrim) {
      // Of course we must allow Boundables under other Boundables, so that
      // schemas like UsdGeom.Pointinstancer can nest their prototypes.
      // But we disallow a PointInstancer under a Mesh just as we disallow
      // a Mesh under a Mesh, for the same reason: we cannot then
      // independently adjust visibility for the two objects, nor can we
      // reasonably compute the parent Mesh's extent.
      const verifyGprimAncestor = (currentAncestor: Prim | undefined): void => {
        if (!currentAncestor || currentAncestor.isPseudoRoot()) return

        if (currentAncestor.isA(_gprimType())) {
          errors.push(new ValidationError(
            UsdGeomValidationErrorNameTokens.invalidNestedGprims, ValidationErrorType.Error,
            primErrorSites,
            `Gprim <${usdPrim.path}> has an ancestor prim that is also a Gprim, which is not allowed.`))
          return
        }
        verifyGprimAncestor(currentAncestor.getParent())
      }
      verifyGprimAncestor(parentPrim)
    }
  }
  return errors
}

// validators.cpp:193-211.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()

  registry.registerPluginStageValidator(UsdGeomValidatorNameTokens.stageMetadataChecker,
    _getStageMetadataErrors)

  registry.registerPluginPrimValidator(UsdGeomValidatorNameTokens.subsetFamilies, _subsetFamilies)

  registry.registerPluginPrimValidator(UsdGeomValidatorNameTokens.subsetParentIsImageable,
    _subsetParentIsImageable)

  registry.registerPluginPrimValidator(UsdGeomValidatorNameTokens.encapsulationChecker,
    _hasValidEncapsulation)
})
