// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdUtilsValidators/testenv/testUsdUtilsValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdUtilsValidators/testenv/testUsdUtilsValidators.cpp.
//
// Fixtures: fixtures/testUsdUtilsValidators is a verbatim copy of the
// upstream testenv directory (Copyright Pixar, TOST 1.0,
// https://openusd.org/license), the test's working directory (its TESTENV,
// usdUtilsValidators/CMakeLists.txt:43-47); relative paths in the test are
// read from it. Upstream's main() runs the tests in one process in the order
// below; each TF_AXIOM is an expect() here, in upstream order.
//
// API mapping: UsdStage::Open(path) is Stage.open(path); UsdStage::
// CreateInMemory is Stage.createNew(); Validate resolves to the errors
// (PLATFORM-DIVERGENCE(usdValidation-async-validate)). UsdEditContext over
// GetVariantEditContext() is getVariantEditContext() ... close(). ArchGetCwd
// is process.cwd(); TfAbsPath is path.resolve.
// SdfFileFormat::FindAllFileFormatExtensions().count("pmc") is whether a file
// format is registered for the extension (SdfFileFormat.findByExtension).
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { AssetPath as SdfAssetPath, FileFormat as SdfFileFormat } from 'typescript-usd/sdf'
import { TfGetPathName, TfStringCatPaths } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'
import { Shader as UsdShadeShader } from 'typescript-usd/usdShade'
import {
  ValidationErrorType as UsdValidationErrorType, ValidationRegistry as UsdValidationRegistry,
  type ValidationError as UsdValidationError,
} from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdUtilsValidatorNameTokens } from '../../src/index.ts'

const testenv = path.join(import.meta.dirname, 'fixtures/testUsdUtilsValidators')
let cwd = ''
beforeAll(() => {
  cwd = process.cwd()
  process.chdir(testenv)
})
afterAll(() => process.chdir(cwd))
// Each upstream test function drops its stages, and with them their layers,
// when it returns; replacing the resolver clears the layer registry to the
// same effect (JavaScript holds no reference counts). Otherwise the next
// test's dependency walk finds the layer an earlier test opened by a relative
// path under that identifier instead of opening it by its absolute path.
beforeEach(() => _resetResolverForTest())

// testUsdUtilsValidators.cpp:25-27.
const _tokens = { usdUtilsValidatorsPlugin: 'usdUtilsValidators' }

// testUsdUtilsValidators.cpp:58-71.
function validateError(error: UsdValidationError, expectedErrorMsg: string,
  expectedErrorIdentifier: string,
  expectedErrorType: UsdValidationErrorType = UsdValidationErrorType.Error): void {
  expect(error.getMessage()).toBe(expectedErrorMsg)
  expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
  expect(error.getType()).toBe(expectedErrorType)
  expect(error.getSites().length).toBe(1)
  const errorSite = error.getSites()[0]!
  expect(errorSite.getLayer()).toBeDefined()
}

describe('testUsdUtilsValidators', () => {
  // testUsdUtilsValidators.cpp:29-55.
  it('TestSdfUsdzValidators', () => {
    // This should be updated with every new validator added with
    // UsdUtilsValidators keyword.
    const registry = UsdValidationRegistry.getInstance()
    const metadata = registry.getValidatorMetadataForPlugin(_tokens.usdUtilsValidatorsPlugin)
    expect(metadata.length).toBe(5)
    // Since other validators can be registered with a UsdUtilsValidators
    // keyword, our validators registered in usd are a subset of the entire
    // set.
    const validatorMetadataNameSet = new Set(metadata.map(m => m.name))

    const expectedValidatorNames = new Set([
      UsdUtilsValidatorNameTokens.packageEncapsulationValidator,
      UsdUtilsValidatorNameTokens.fileExtensionValidator,
      UsdUtilsValidatorNameTokens.missingReferenceValidator,
      UsdUtilsValidatorNameTokens.rootPackageValidator,
      UsdUtilsValidatorNameTokens.usdzPackageValidator,
    ])

    expect(validatorMetadataNameSet).toEqual(expectedValidatorNames)
  })

  // testUsdUtilsValidators.cpp:73-139.
  it('TestPackageEncapsulationValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()

    // Verify the validator exists
    const validator = registry.getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.packageEncapsulationValidator)

    expect(validator).toBeDefined()

    // Load the pre-created usdz stage with paths to a layer and asset
    // that are not included in the package, but exist
    const stage = (await Stage.open('fail.usdz'))!

    {
      const errors = await validator!.validate(stage)

      // Verify both the layer & asset errors are present
      expect(errors.length).toBe(2)

      // Note that we keep the referenced layer in normalized path to represent
      // the layer identifier, whereas the asset path is platform specific path,
      // as returned by UsdUtilsComputeAllDependencies
      const rootLayer = stage.getRootLayer()
      const rootLayerIdentifier = rootLayer.identifier
      const realUsdzPath = rootLayer.realPath
      const errorLayer = TfStringCatPaths(TfGetPathName(path.resolve(rootLayerIdentifier)),
        'excludedDirectory/layer.usda')

      const parentDir = path.dirname(realUsdzPath)
      const errorAsset = path.join(parentDir, 'excludedDirectory', 'image.jpg')

      const expectedErrorMessages = [
        `Found referenced layer '${errorLayer}' that does not `
        + `belong to the package '${realUsdzPath}'.`,
        `Found asset reference '${errorAsset}' that does not belong`
        + ` to the package '${realUsdzPath}'.`,
      ]

      const expectedErrorIdentifiers = [
        'usdUtilsValidators:PackageEncapsulationValidator.LayerNotInPackage',
        'usdUtilsValidators:PackageEncapsulationValidator.AssetNotInPackage',
      ]

      for (let i = 0; i < errors.length; ++i) {
        validateError(errors[i]!, expectedErrorMessages[i]!,
          expectedErrorIdentifiers[i]!, UsdValidationErrorType.Warn)
      }
    }

    // Load the pre-created usdz stage with relative paths to both a reference
    // and an asset that are included in the package.
    const passStage = (await Stage.open('pass.usdz'))!
    {
      const errors = await validator!.validate(passStage)

      // Verify the errors are gone
      expect(errors).toEqual([])
    }
  })

  // testUsdUtilsValidators.cpp:141-196.
  it('TestFileExtensionValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()

    // Verify the validator exists
    const validator = registry.getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.fileExtensionValidator)

    expect(validator).toBeDefined()

    const stage = (await Stage.open('failFileExtension.usdz'))!
    let errors = await validator!.validate(stage)
    expect(errors.length).toBe(1)
    const expectedErrorMsg =
      "File 'cube.invalid' in package 'failFileExtension.usdz' has an "
      + "unknown unsupported extension 'invalid'."
    const expectedErrorIdentifier =
      'usdUtilsValidators:FileExtensionValidator.UnsupportedFileExtensionInPackage'
    // Verify error occurs.
    validateError(errors[0]!, expectedErrorMsg, expectedErrorIdentifier)

    // Load a passing stage
    const passStage = (await Stage.open('allSupportedFiles.usdz'))!

    errors = await validator!.validate(passStage)

    // Verify no errors occur with all valid extensions included
    expect(errors).toEqual([])

    // XXX: This portion of the test is gated on whether we can find the UsdPmc
    // plugin.  We would like to rework this validator such that it is able to
    // perform the validation when the plugin is not present

    // Test that files requiring optional plugins produce a warning
    if (SdfFileFormat.findByExtension('pmc')) {
      const pmcStage = (await Stage.open('pmcwarning.usdz'))!
      errors = await validator!.validate(pmcStage)
      expect(errors.length).toBe(1)

      const expectedWarningMsg =
        "This package contains a file with the 'pmc' extension. The UsdPmc "
        + 'plugin is required in order to read files of this type. This '
        + 'plugin is not part of the default USD build and therefore a '
        + 'client may not be able to read it.'

      const expectedWarningIdentifier =
        'usdUtilsValidators:FileExtensionValidator.ContainsPmcFile'

      validateError(errors[0]!, expectedWarningMsg, expectedWarningIdentifier,
        UsdValidationErrorType.Warn)
    }
  })

  // testUsdUtilsValidators.cpp:198-297.
  it('TestMissingReferenceValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()

    // Verify the validator exists
    const validator = registry.getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.missingReferenceValidator)

    expect(validator).toBeDefined()

    const stage = Stage.createNew()

    const xform = stage.definePrim('/Prim', 'Xform')
    const badLayerReference = 'doesNotExist.usd'
    await xform.getReferences().addReference(badLayerReference)

    // Validate an error occurs for a missing layer reference
    {
      const errors = await validator!.validate(stage)
      expect(errors.length).toBe(1)
      const expectedErrorMessage = 'Found unresolvable external '
        + "dependency 'doesNotExist.usd'."
      const expectedIdentifier =
        'usdUtilsValidators:MissingReferenceValidator.UnresolvableDependency'

      validateError(errors[0]!, expectedErrorMessage, expectedIdentifier)
    }

    // Remove the bad layer reference and add a shader prim for the next test
    await xform.getReferences().removeReference(badLayerReference)
    const shader = UsdShadeShader.define(stage, '/Prim/Shader')
    const notFoundAsset = 'notFoundAsset'
    const notFoundAssetInput = shader.createInput(notFoundAsset, 'asset')
    notFoundAssetInput.set(new SdfAssetPath('doesNotExist.jpg'))

    // Validate an error occurs for a missing asset reference
    {
      const errors = await validator!.validate(stage)
      expect(errors.length).toBe(1)
      const expectedErrorMessage = 'Found unresolvable external '
        + "dependency 'doesNotExist.jpg'."
      const expectedIdentifier =
        'usdUtilsValidators:MissingReferenceValidator.UnresolvableDependency'

      validateError(errors[0]!, expectedErrorMessage, expectedIdentifier)
    }

    // Remove shader prim and add a variant set for the next test
    stage.removePrim(shader.prim.path)
    const variantSets = xform.getVariantSets()
    const testVariantSet = await variantSets.addVariantSet('testVariantSet')

    await testVariantSet.addVariant('invalid')
    await testVariantSet.addVariant('valid')

    await testVariantSet.setVariantSelection('invalid')

    {
      const context = testVariantSet.getVariantEditContext()
      const s = UsdShadeShader.define(stage, `${xform.path}/Shader`)
      const invalidAssetInput = s.createInput('invalidAsset', 'asset')
      invalidAssetInput.set(new SdfAssetPath('doesNotExistOnVariant.jpg'))
      context.close()
    }
    await testVariantSet.setVariantSelection('valid')

    // Validate an error occurs on a nonexistent asset on an inactive variant
    {
      const errors = await validator!.validate(stage)
      expect(errors.length).toBe(1)
      const expectedErrorMessage =
        'Found unresolvable external dependency '
        + "'doesNotExistOnVariant.jpg'."
      const expectedIdentifier =
        'usdUtilsValidators:MissingReferenceValidator.UnresolvableDependency'

      validateError(errors[0]!, expectedErrorMessage, expectedIdentifier)
    }

    // Remove the variant set and add a valid reference
    const primSpec = stage.getRootLayer().getPrimAtPath(xform.path)!
    primSpec.removeVariantSet('testVariantSet')
    await xform.getReferences().addReference('pass.usdz')

    const errors = await validator!.validate(stage)

    expect(errors).toEqual([])
  })

  // testUsdUtilsValidators.cpp:299-350.
  it('TestRootPackageValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()

    // Verify the validator exists
    const validator = registry.getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.rootPackageValidator)

    expect(validator).toBeDefined()

    // Load the pre-created usdz stage with a compressed file in the root layer
    {
      const stage = (await Stage.open('packageWithCompressionAndByteAlignmentErrors.usdz'))!
      const errors = await validator!.validate(stage)

      // Verify compression error occurs
      expect(errors.length).toBe(3)

      const expectedErrorMessages = [
        "File 'test.usda' in package "
          + "'packageWithCompressionAndByteAlignmentErrors.usdz' has an "
          + 'invalid offset 39.',
        "File 'texture.jpg' in package "
          + "'packageWithCompressionAndByteAlignmentErrors.usdz' has "
          + "compression. Compression method is '8', actual size is 14. "
          + 'Uncompressed size is 1028.',
        "File 'texture.jpg' in package "
          + "'packageWithCompressionAndByteAlignmentErrors.usdz' has an "
          + 'invalid offset 131.']
      const expectedErrorTokens = [
        'usdUtilsValidators:RootPackageValidator.ByteMisalignment',
        'usdUtilsValidators:RootPackageValidator.CompressionDetected',
        'usdUtilsValidators:RootPackageValidator.ByteMisalignment']

      for (let i = 0; i < errors.length; ++i) {
        validateError(errors[i]!, expectedErrorMessages[i]!,
          expectedErrorTokens[i]!)
      }
    }

    // Load the pre-created usdz stage with valid files
    {
      const stage = (await Stage.open('pass.usdz'))!
      const errors = await validator!.validate(stage)

      // Verify there are no errors
      expect(errors).toEqual([])
    }
  })

  // testUsdUtilsValidators.cpp:352-404.
  it('TestUsdzPackageValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()

    // Verify the validator exists
    const validator = registry.getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.usdzPackageValidator)

    expect(validator).toBeDefined()

    // Load the pre-created usdz stage with a compressed file in a sub package
    {
      const stage = (await Stage.open('sceneWithInvalidPackage.usda'))!

      const errors = await validator!.validate(stage)

      // Verify internal compression and byte misalignment errors occur
      expect(errors.length).toBe(3)

      const fullErrorPath = TfStringCatPaths(process.cwd(),
        'packageWithCompressionAndByteAlignmentErrors.usdz')

      const expectedErrorMessages = [
        `File 'test.usda' in package '${fullErrorPath}' has an `
          + 'invalid offset 39.',
        `File 'texture.jpg' in package '${fullErrorPath}' has `
          + "compression. Compression method is '8', actual size is 14. "
          + 'Uncompressed size is 1028.',
        `File 'texture.jpg' in package '${fullErrorPath}' has an `
          + 'invalid offset 131.',
      ]

      const expectedErrorTokens = [
        'usdUtilsValidators:UsdzPackageValidator.ByteMisalignment',
        'usdUtilsValidators:UsdzPackageValidator.CompressionDetected',
        'usdUtilsValidators:UsdzPackageValidator.ByteMisalignment']

      for (let i = 0; i < errors.length; ++i) {
        validateError(errors[i]!, expectedErrorMessages[i]!,
          expectedErrorTokens[i]!)
      }
    }

    // Load the pre-created usda stage with a valid package.
    {
      const stage = (await Stage.open('sceneWithValidPackage.usda'))!
      const errors = await validator!.validate(stage)
      expect(errors).toEqual([])
    }
  })
})
