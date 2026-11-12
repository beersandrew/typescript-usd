// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdShadeValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdShadeValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdShadeValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-36 (USD_SHADE_VALIDATOR_NAME_TOKENS). */
export const UsdShadeValidatorNameTokens = Object.freeze({
  encapsulationValidator: 'usdShadeValidators:EncapsulationRulesValidator',
  encapsulationMaterialValidator: 'usdShadeValidators:EncapsulationMaterialValidator',
  materialBindingApiAppliedValidator: 'usdShadeValidators:MaterialBindingApiAppliedValidator',
  materialBindingRelationships: 'usdShadeValidators:MaterialBindingRelationships',
  materialBindingCollectionValidator: 'usdShadeValidators:MaterialBindingCollectionValidator',
  normalMapTextureValidator: 'usdShadeValidators:NormalMapTextureValidator',
  shaderSdrCompliance: 'usdShadeValidators:ShaderSdrCompliance',
  subsetMaterialBindFamilyName: 'usdShadeValidators:SubsetMaterialBindFamilyName',
  subsetsMaterialBindFamily: 'usdShadeValidators:SubsetsMaterialBindFamily',
})

/** validatorTokens.h:38 (USD_SHADE_VALIDATOR_KEYWORD_TOKENS). */
export const UsdShadeValidatorKeywordTokens = Object.freeze({
  UsdShadeValidators: 'UsdShadeValidators',
})

/** validatorTokens.h:40-63 (USD_SHADE_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdShadeValidationErrorNameTokens = Object.freeze({
  connectableInNonContainer: 'ConnectableInNonContainer',
  invalidConnectableHierarchy: 'InvalidConnectableHierarchy',
  invalidConnectableInMaterial: 'InvalidConnectableInMaterial',
  invalidImageableInMaterial: 'InvalidImageableInMaterial',
  missingMaterialBindingAPI: 'MissingMaterialBindingAPI',
  materialBindingPropNotARel: 'MaterialBindingPropNotARel',
  invalidMaterialCollection: 'InvalidMaterialCollection',
  invalidResourcePath: 'InvalidResourcePath',
  invalidImplSource: 'InvalidImplementationSrc',
  missingSourceType: 'MissingSourceType',
  missingShaderIdInRegistry: 'MissingShaderIdInRegistry',
  missingSourceTypeInRegistry: 'MissingSourceTypeInRegistry',
  incompatShaderPropertyWarning: 'IncompatShaderPropertyWarning',
  mismatchPropertyType: 'MismatchedPropertyType',
  missingFamilyNameOnGeomSubset: 'MissingFamilyNameOnGeomSubset',
  nonShaderConnection: 'NonShaderConnection',
  invalidFile: 'InvalidFile',
  invalidShaderPrim: 'InvalidShaderPrim',
  invalidSourceColorSpace: 'InvalidSourceColorSpace',
  nonCompliantBiasAndScale: 'NonCompliantBiasAndScale',
  nonCompliantScale: 'NonCompliantScaleValues',
  nonCompliantBias: 'NonCompliantBiasValues',
  invalidFamilyType: 'InvalidFamilyType',
})
