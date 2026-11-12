// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdUtilsValidators/validators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdUtilsValidators/validators.cpp.
//
// The tasks are asynchronous: UsdUtilsComputeAllDependencies opens layers and
// resolves assets, and SdfZipFile::Open reads an asset, asynchronously here
// (PLATFORM-DIVERGENCE(usdValidation-async-validate), usdValidation/src/validator.ts).
import {
  GetResolver as ArGetResolver, IsPackageRelativePath as ArIsPackageRelativePath,
  SplitPackageRelativePathOuter as ArSplitPackageRelativePathOuter,
} from 'typescript-usd/ar'
import { AssetPath as SdfAssetPath, Layer, UsdZipFile as SdfZipFile } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfRegistryManager, TfStringToLowerAscii } from 'typescript-usd/tf'
import type { Stage } from 'typescript-usd/usd'
import { UsdUtilsComputeAllDependencies } from 'typescript-usd/usdUtils'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry,
  type ValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdUtilsValidationErrorNameTokens, UsdUtilsValidatorNameTokens } from './validatorTokens.ts'

// Upstream bug (validators.cpp:75,90; upstream-issues UI-4734): upstream tests
// membership with TfStringStartsWith(path, packagePath), so a sibling such as
// "<dir>/pkg.usdz_extra/layer.usda" passes as inside "<dir>/pkg.usdz". A path is
// in the package when it is the package itself or a package-relative path whose
// outermost package is it ("<dir>/pkg.usdz[layer.usda]").
function _isInPackage(path: string, packagePath: string): boolean {
  return ArSplitPackageRelativePathOuter(path)[0] === packagePath
}

// validators.cpp:24-105.
async function _packageEncapsulationValidator(usdStage: Stage,
  _timeRange: ValidationTimeRange): Promise<ValidationError[]> {
  const errors: ValidationError[] = []

  const rootLayer = usdStage.getRootLayer()
  const isPackage = ((layer: Layer) => {
    return (layer.getFileFormat()?.isPackage() ?? false)
      || ArIsPackageRelativePath(layer.identifier)
  })(rootLayer)

  if (!isPackage) {
    return errors
  }

  const layers: Layer[] = [], assets: string[] = [], unresolvedPaths: string[] = []
  const path = new SdfAssetPath(rootLayer.identifier)

  await UsdUtilsComputeAllDependencies(path, layers, assets, unresolvedPaths, undefined)

  const realPath = rootLayer.realPath
  const packagePath = ArIsPackageRelativePath(rootLayer.identifier)
    ? ArSplitPackageRelativePathOuter(realPath)[0]
    : realPath

  if (packagePath) {
    for (const referencedLayer of layers) {
      if (!referencedLayer) {
        errors.push(new ValidationError(
          UsdUtilsValidationErrorNameTokens.invalidLayerInPackage,
          ValidationErrorType.Error,
          [new ValidationErrorSite(rootLayer, SdfPath.emptyPath)],
          'Found invalid layer reference in package. This could be '
          + 'due to a layer that failed to load or a layer that is not '
          + 'a valid layer to be bundled in a package.'))
        continue
      }
      const refRealPath = referencedLayer.realPath

      // We don't want to validate in-memory or session layers
      // since these layers will not have a real path, we skip here
      if (!refRealPath) {
        continue
      }

      if (!_isInPackage(refRealPath, packagePath)) {
        errors.push(new ValidationError(
          UsdUtilsValidationErrorNameTokens.layerNotInPackage,
          ValidationErrorType.Warn,
          [new ValidationErrorSite(rootLayer, referencedLayer.getDefaultPrimAsPath())],
          `Found referenced layer '${referencedLayer.identifier}' that does not belong to `
          + `the package '${packagePath}'.`))
      }
    }

    for (const asset of assets) {
      if (!_isInPackage(asset, packagePath)) {
        errors.push(new ValidationError(
          UsdUtilsValidationErrorNameTokens.assetNotInPackage,
          ValidationErrorType.Warn,
          [new ValidationErrorSite(rootLayer, SdfPath.fromString(asset))],
          `Found asset reference '${asset}' that does not belong to `
          + `the package '${packagePath}'.`))
      }
    }
  }

  return errors
}

// validators.cpp:107-171.
async function _fileExtensionValidator(usdStage: Stage,
  _timeRange: ValidationTimeRange): Promise<ValidationError[]> {
  const errors: ValidationError[] = []

  const validExtensions = new Set(['usda', 'usdc', 'usd', 'usdz', 'png', 'jpg', 'jpeg', 'exr',
    'avif', 'm4a', 'mp3', 'wav'])

  const rootLayer = usdStage.getRootLayer()
  const zipFile = await SdfZipFile.open(rootLayer.realPath)

  const fileNames = zipFile ? zipFile.getFileNames() : []

  let didWarnAboutUsdPmc = false

  for (const fileName of fileNames) {
    const extension = ArGetResolver().getExtension(fileName)
    // Upstream bug (validators.cpp:113-116,130,149-150; upstream-issues
    // UI-4733): upstream compares the extension case-sensitively, so
    // "sound.MP3" or "tex.PNG" is reported although plugInfo.json's doc lists
    // ".M4A, .MP3, .WAV". Both checks here ignore ASCII case; the message keeps
    // the extension as written.
    const lowerExtension = TfStringToLowerAscii(extension)

    if (lowerExtension === 'pmc') {
      if (didWarnAboutUsdPmc) {
        continue
      }

      errors.push(new ValidationError(
        UsdUtilsValidationErrorNameTokens.containsPmcFile,
        ValidationErrorType.Warn,
        [new ValidationErrorSite(rootLayer, SdfPath.fromString(rootLayer.identifier))],
        "This package contains a file with the 'pmc' extension. "
        + 'The UsdPmc plugin is required in order to read files of '
        + 'this type. This plugin is not part of the default USD '
        + 'build and therefore a client may not be able to read it.'))
      didWarnAboutUsdPmc = true
    } else if (!validExtensions.has(lowerExtension)) {
      errors.push(new ValidationError(
        UsdUtilsValidationErrorNameTokens.unsupportedFileExtensionInPackage,
        ValidationErrorType.Error,
        [new ValidationErrorSite(rootLayer, SdfPath.fromString(rootLayer.identifier))],
        `File '${fileName}' in package '${rootLayer.identifier}' has an unknown `
        + `unsupported extension '${extension}'.`))
    }
  }

  return errors
}

// validators.cpp:173-204.
async function _missingReferenceValidator(usdStage: Stage,
  _timeRange: ValidationTimeRange): Promise<ValidationError[]> {
  const rootLayer = usdStage.getRootLayer()

  const layers: Layer[] = [], unresolvedPaths: string[] = []
  const path = new SdfAssetPath(rootLayer.identifier)

  await UsdUtilsComputeAllDependencies(path, layers, undefined /*assets*/,
    unresolvedPaths, undefined)

  const errors: ValidationError[] = []
  for (const unresolvedPath of unresolvedPaths) {
    errors.push(new ValidationError(
      UsdUtilsValidationErrorNameTokens.unresolvableDependency,
      ValidationErrorType.Error,
      [new ValidationErrorSite(rootLayer, SdfPath.fromString(unresolvedPath))],
      `Found unresolvable external dependency '${unresolvedPath}'.`))
  }

  return errors
}

// validators.cpp:206-259.
async function _getUsdzPackageErrors(rootLayer: Layer): Promise<ValidationError[]> {
  const zipFile = await SdfZipFile.open(rootLayer.realPath)
  if (!zipFile) {
    return []
  }

  const packagePath = ArSplitPackageRelativePathOuter(rootLayer.identifier)[0]

  const errors: ValidationError[] = []
  for (const fileName of zipFile.getFileNames()) {
    const fileInfo = zipFile.getFileInfo(fileName)!
    if (fileInfo.compressionMethod !== 0) {
      errors.push(new ValidationError(
        UsdUtilsValidationErrorNameTokens.compressionDetected,
        ValidationErrorType.Error,
        [new ValidationErrorSite(rootLayer, SdfPath.fromString(fileName))],
        `File '${fileName}' in package '${packagePath}' has compression. Compression `
        + `method is '${fileInfo.compressionMethod}', actual size is ${fileInfo.size}. `
        + `Uncompressed size is ${fileInfo.uncompressedSize}.`))
    }

    if (fileInfo.dataOffset % 64 !== 0) {
      errors.push(new ValidationError(
        UsdUtilsValidationErrorNameTokens.byteMisalignment,
        ValidationErrorType.Error,
        [new ValidationErrorSite(rootLayer, SdfPath.fromString(fileName))],
        `File '${fileName}' in package '${packagePath}' has an invalid `
        + `offset ${fileInfo.dataOffset}.`))
    }
  }

  return errors
}

// validators.cpp:261-271.
async function _rootPackageValidator(usdStage: Stage,
  _timeRange: ValidationTimeRange): Promise<ValidationError[]> {
  const rootLayer = usdStage.getRootLayer()
  if (!rootLayer.getFileFormat()?.isPackage()) {
    return []
  }
  return _getUsdzPackageErrors(rootLayer)
}

// validators.cpp:273-312.
async function _usdzPackageValidator(usdStage: Stage,
  _timeRange: ValidationTimeRange): Promise<ValidationError[]> {
  const layers: Layer[] = []
  const rootLayer = usdStage.getRootLayer()
  const path = new SdfAssetPath(rootLayer.identifier)

  await UsdUtilsComputeAllDependencies(path, layers, undefined /*assets*/,
    undefined /*unresolvedPaths*/, undefined /*processingFunc*/)

  const realPath = rootLayer.realPath
  const packagePath = ArIsPackageRelativePath(rootLayer.identifier)
    ? ArSplitPackageRelativePathOuter(realPath)[0]
    : realPath

  const errors: ValidationError[] = []

  if (packagePath) {
    for (const referencedLayer of layers) {
      if (!referencedLayer) {
        // Invalid reference layer found; PackageEncapsulationValidator
        // will catch this, so we can skip this layer here.
        continue
      }
      const layerErrors = await _getUsdzPackageErrors(referencedLayer)
      errors.push(...layerErrors)
    }
  }

  return errors
}

// validators.cpp:314-337.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()

  registry.registerPluginStageValidator(
    UsdUtilsValidatorNameTokens.packageEncapsulationValidator,
    _packageEncapsulationValidator)

  registry.registerPluginStageValidator(
    UsdUtilsValidatorNameTokens.fileExtensionValidator,
    _fileExtensionValidator)

  registry.registerPluginStageValidator(
    UsdUtilsValidatorNameTokens.missingReferenceValidator,
    _missingReferenceValidator)

  registry.registerPluginStageValidator(
    UsdUtilsValidatorNameTokens.rootPackageValidator,
    _rootPackageValidator)

  registry.registerPluginStageValidator(
    UsdUtilsValidatorNameTokens.usdzPackageValidator,
    _usdzPackageValidator)
})
