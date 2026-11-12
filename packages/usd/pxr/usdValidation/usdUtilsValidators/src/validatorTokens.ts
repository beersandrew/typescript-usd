// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdUtilsValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdUtilsValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdUtilsValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-27 (USD_UTILS_VALIDATOR_NAME_TOKENS). */
export const UsdUtilsValidatorNameTokens = Object.freeze({
  packageEncapsulationValidator: 'usdUtilsValidators:PackageEncapsulationValidator',
  fileExtensionValidator: 'usdUtilsValidators:FileExtensionValidator',
  missingReferenceValidator: 'usdUtilsValidators:MissingReferenceValidator',
  rootPackageValidator: 'usdUtilsValidators:RootPackageValidator',
  usdzPackageValidator: 'usdUtilsValidators:UsdzPackageValidator',
})

/** validatorTokens.h:29-31 (USD_UTILS_VALIDATOR_KEYWORD_TOKENS). */
export const UsdUtilsValidatorKeywordTokens = Object.freeze({
  UsdUtilsValidators: 'UsdUtilsValidators',
  UsdzValidators: 'UsdzValidators',
})

/** validatorTokens.h:33-42 (USD_UTILS_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdUtilsValidationErrorNameTokens = Object.freeze({
  layerNotInPackage: 'LayerNotInPackage',
  assetNotInPackage: 'AssetNotInPackage',
  invalidLayerInPackage: 'InvalidLayerInPackage',
  unsupportedFileExtensionInPackage: 'UnsupportedFileExtensionInPackage',
  unresolvableDependency: 'UnresolvableDependency',
  compressionDetected: 'CompressionDetected',
  byteMisalignment: 'ByteMisalignment',
  containsPmcFile: 'ContainsPmcFile',
})
