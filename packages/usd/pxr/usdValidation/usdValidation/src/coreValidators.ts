// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/coreValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/coreValidators.cpp.
import { Layer, findValueTypeName } from 'typescript-usd/sdf'
import type { Prim, Stage } from 'typescript-usd/usd'
import { TfRegistryManager } from 'typescript-usd/tf'
import { UsdValidationError, UsdValidationErrorSite, UsdValidationErrorType } from './error.ts'
import { UsdValidationRegistry } from './registry.ts'
import type { UsdValidationTimeRange } from './timeRange.ts'
import { UsdValidationErrorNameTokens, UsdValidatorNameTokens } from './validatorTokens.ts'

// coreValidators.cpp:17-33.
function _getCompositionErrors(usdStage: Stage, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  for (const pcpError of usdStage.getCompositionErrors()) {
    const errorSites = [new UsdValidationErrorSite(usdStage, pcpError.rootSite.path)]
    errors.push(new UsdValidationError(UsdValidationErrorNameTokens.compositionError,
      UsdValidationErrorType.Error, errorSites, pcpError.toString()))
  }
  return errors
}

// coreValidators.cpp:35-51.
function _getStageMetadataErrors(usdStage: Stage, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  if (!usdStage.getDefaultPrim()) {
    errors.push(new UsdValidationError(UsdValidationErrorNameTokens.missingDefaultPrim,
      UsdValidationErrorType.Error, [new UsdValidationErrorSite(usdStage, '/')],
      `Stage with root layer <${usdStage.getRootLayer().identifier}> has an invalid or `
      + 'missing defaultPrim.'))
  }
  return errors
}

// The layer a property stack entry names (UsdAttribute::GetPropertyStack
// returns spec handles, whose GetLayer() coreValidators.cpp:61 reads).
function _layerOfEntry(stage: Stage, layerIdentifier: string): Layer | undefined {
  return stage.getUsedLayers().find(layer => layer.identifier === layerIdentifier)
    ?? Layer.find(layerIdentifier)
}

// coreValidators.cpp:53-79.
function _getAttributeTypeMismatchErrors(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  const stage = usdPrim.getStage()
  for (const attr of usdPrim.getAttributes()) {
    const attrTypeName = attr.typeName
    const attrType = findValueTypeName(attrTypeName)
    for (const entry of attr.getPropertyStack()) {
      const layer = _layerOfEntry(stage, entry.layerIdentifier)
      const specTypeName = layer?.getPropertyAtPath(entry.specPath)?.getTypeName()
      if (specTypeName === attrType) continue
      const attrPath = `${attr.primPath}.${attr.name}`
      const errorSites = [new UsdValidationErrorSite(layer!, attrPath)]
      errors.push(new UsdValidationError(UsdValidationErrorNameTokens.attributeTypeMismatch,
        UsdValidationErrorType.Error, errorSites,
        `Type mismatch for attribute <${attrPath}>. Expected attribute type is `
        + `'${attrType?.name ?? attrTypeName}' but defined as '${specTypeName?.name ?? ''}' in layer `
        + `<${layer?.identifier ?? entry.layerIdentifier}>.`))
    }
  }
  return errors
}

// coreValidators.cpp:81-91.
TfRegistryManager.add(UsdValidationRegistry, () => {
  const registry = UsdValidationRegistry.getInstance()
  registry.registerPluginStageValidator(UsdValidatorNameTokens.compositionErrorTest, _getCompositionErrors)
  registry.registerPluginStageValidator(UsdValidatorNameTokens.stageMetadataChecker, _getStageMetadataErrors)
  registry.registerPluginPrimValidator(UsdValidatorNameTokens.attributeTypeMismatch,
    _getAttributeTypeMismatchErrors)
})
