// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistry.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistry.cpp with
// its testenv plugin testUsdValidationRegistry/plugInfo.json.
//
// The test binary's TF_REGISTRY_FUNCTION(UsdValidationRegistry) is a
// TfRegistryManager function added by this module, and main()'s
// PlugRegistry::RegisterPlugins(testDir) registers the plugInfo document
// below before the registry is first used. Each TF_AXIOM is an expect().
import { beforeAll, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Notice as TfNotice, TfErrorMark, TfRegistryManager } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'
import {
  Notice as UsdValidationNotice, ValidationError, ValidationErrorSite, ValidationErrorType,
  ValidationRegistry, ValidatorMetadata,
} from '../../src/index.ts'

// testUsdValidationRegistry/plugInfo.json.
const testPlugInfo = {
  Plugins: [{
    Type: 'resource',
    Name: 'testValidationPlugin',
    Info: {
      Validators: {
        keywords: ['IncludedInAll'],
        FailedValidator: {
          doc: "Won't get registered, as schemaType provided, but primTask not provided",
          schemaTypes: ['SomePrimType'],
        },
        FailedValidatorSuite: {
          doc: "Won't get registered, as contained validators will not comply",
          schemaTypes: ['SomePrimType', 'SomeAPISchema'],
        },
        FailedValidatorSuite2: {
          doc: "Won't get registered, as contained validators will not comply",
          schemaTypes: ['SomeOtherPrimType'],
        },
        TestValidator1: {
          doc: 'TestValidator1 for keywords metadata parsing',
          keywords: ['SomeKeyword1'],
          isSuite: false,
        },
        TestValidator2: {
          doc: 'TestValidator2 for schemaType metadata parsing',
          schemaTypes: ['SomePrimType', 'SomeAPISchema'],
          someBogusMetadta: "Doesn't get parsed",
        },
        TestValidator3: {
          doc: 'TestValidator3 for schemaType metadata parsing',
          schemaTypes: ['SomePrimType'],
          keywords: ['SomeKeyword1'],
        },
        TestValidatorSuite: {
          doc: 'Suite of TestValidator1 and TestValidator2',
          keywords: ['SuiteValidator'],
          isSuite: true,
        },
      },
    },
  }],
}

// The TF_AXIOMs inside the registry function, recorded to check in a test.
const registrationChecks: [string, boolean][] = []

// testUsdValidationRegistry.cpp:23-123.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()
  {
    const validatorName = 'testValidationPlugin:TestValidator1'
    // Register the validator
    const m = new TfErrorMark()
    registry.registerPluginStageValidator(validatorName, (usdStage) => {
      const validationErrorId = 'ErrorId'
      return [new ValidationError(validationErrorId, ValidationErrorType.Error,
        [new ValidationErrorSite(usdStage, '/')], 'This is an error on the stage')]
    })
    registrationChecks.push([validatorName, m.isClean()])
  }
  {
    const validatorName = 'testValidationPlugin:TestValidator2'
    const m = new TfErrorMark()
    registry.registerPluginPrimValidator(validatorName, () => [])
    registrationChecks.push([validatorName, m.isClean()])
  }
  {
    const validatorName = 'testValidationPlugin:TestValidator3'
    const m = new TfErrorMark()
    registry.registerPluginPrimValidator(validatorName, () => [])
    registrationChecks.push([validatorName, m.isClean()])
  }
  {
    const suiteName = 'testValidationPlugin:TestValidatorSuite'
    const containedValidators = registry.getOrLoadValidatorsByName([
      'testValidationPlugin:TestValidator1', 'testValidationPlugin:TestValidator2'])
    const m = new TfErrorMark()
    registry.registerPluginValidatorSuite(suiteName, containedValidators)
    registrationChecks.push([suiteName, m.isClean()])
  }
  {
    const validatorName = 'testValidationPlugin:FailedValidator'
    const m = new TfErrorMark()
    registry.registerPluginStageValidator(validatorName, () => [])
    registrationChecks.push([validatorName, !m.isClean()])
    m.clear()
  }
  {
    const suiteName = 'testValidationPlugin:FailedValidatorSuite'
    const containedValidators = registry.getOrLoadValidatorsByName([
      'testValidationPlugin:TestValidator2', 'testValidationPlugin:TestValidator1'])
    const m = new TfErrorMark()
    registry.registerPluginValidatorSuite(suiteName, containedValidators)
    registrationChecks.push([suiteName, !m.isClean()])
    m.clear()
  }
  {
    const suiteName = 'testValidationPlugin:FailedValidatorSuite2'
    const containedValidators = registry.getOrLoadValidatorsByName([
      'testValidationPlugin:TestValidator2'])
    const m = new TfErrorMark()
    registry.registerPluginValidatorSuite(suiteName, containedValidators)
    registrationChecks.push([suiteName, !m.isClean()])
    m.clear()
  }
})

// testUsdValidationRegistry.cpp:305-317 (main): register the test plugin.
beforeAll(() => {
  expect(PlugRegistry.GetInstance().RegisterPlugins(testPlugInfo)).not.toEqual([])
})

describe('testUsdValidationRegistry', () => {
  // testUsdValidationRegistry.cpp:125-233.
  it('TestUsdValidationRegistry', async () => {
    const registry = ValidationRegistry.getInstance()
    expect(registrationChecks).toEqual([
      ['testValidationPlugin:TestValidator1', true],
      ['testValidationPlugin:TestValidator2', true],
      ['testValidationPlugin:TestValidator3', true],
      ['testValidationPlugin:TestValidatorSuite', true],
      ['testValidationPlugin:FailedValidator', true],
      ['testValidationPlugin:FailedValidatorSuite', true],
      ['testValidationPlugin:FailedValidatorSuite2', true],
    ])

    {
      const metadata = registry.getValidatorMetadata('testValidationPlugin:TestValidator1')
      expect(metadata).toBeDefined()
      const expectedKeywords = ['IncludedInAll', 'SomeKeyword1']
      expect(metadata!.keywords).toEqual(expectedKeywords)
      const expectedDoc = 'TestValidator1 for keywords metadata parsing'
      expect(metadata!.doc).toBe(expectedDoc)
      expect(metadata!.isSuite).toBe(false)

      // Actually go and call validate on this and inspect the Error.
      const validator = registry.getOrLoadValidatorByName(metadata!.name)
      expect(validator).toBeDefined()
      const usdStage = Stage.createNew()
      const errors = await validator!.validate(usdStage)
      expect(errors.length).toBe(1)
      expect(errors[0]!.hasNoError()).toBe(false)
      expect(errors[0]!.getIdentifier()).toBe('testValidationPlugin:TestValidator1.ErrorId')
      expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
      expect(errors[0]!.getValidator()).toBe(validator)
      const errorSites = errors[0]!.getSites()
      expect(errorSites.length).toBe(1)
      expect(errorSites[0]!.isValidSpecInLayer()).toBe(false)
      expect(errorSites[0]!.isPrim()).toBe(true)
      expect(errorSites[0]!.isProperty()).toBe(false)

      // TestValidator1 has a StageTaskFn, try giving it a layer or a prim, it
      // must return a no error.
      expect(await validator!.validate(usdStage.getPrim('/')!)).toEqual([])
      expect(await validator!.validate(usdStage.getRootLayer())).toEqual([])
    }
    {
      const metadata = registry.getValidatorMetadataForSchemaType('SomePrimType')
      expect(metadata.length).toBe(4)
      const expectedValue = [
        'testValidationPlugin:FailedValidator',
        'testValidationPlugin:FailedValidatorSuite',
        'testValidationPlugin:TestValidator2',
        'testValidationPlugin:TestValidator3']
      expect(metadata.map(m => m.name)).toEqual(expectedValue)
    }
    {
      const metadata = registry.getValidatorMetadataForKeyword('SomeKeyword1')
      expect(metadata.length).toBe(2)
      const expectedValue = [
        'testValidationPlugin:TestValidator1',
        'testValidationPlugin:TestValidator3']
      expect(metadata.map(m => m.name)).toEqual(expectedValue)
      expect(metadata[0]!.isSuite).toBe(false)
      expect(metadata[1]!.isSuite).toBe(false)
    }
    {
      const suiteValidator = registry.getOrLoadValidatorSuiteByName(
        'testValidationPlugin:TestValidatorSuite')
      const metadata = suiteValidator!.getMetadata()
      expect(metadata.name).toBe('testValidationPlugin:TestValidatorSuite')
      expect(metadata.isSuite).toBe(true)
      expect(metadata.doc).toBe('Suite of TestValidator1 and TestValidator2')
      expect(metadata.keywords.length).toBe(2)
      expect(metadata.keywords).toEqual(['IncludedInAll', 'SuiteValidator'])
      const containedValidators = suiteValidator!.getContainedValidators()
      {
        const vm = containedValidators[0]!.getMetadata()
        expect(vm.name).toBe('testValidationPlugin:TestValidator1')
        expect(vm.keywords.length).toBe(2)
        expect(vm.keywords).toEqual(['IncludedInAll', 'SomeKeyword1'])
        expect(vm.schemaTypes).toEqual([])
      }
      {
        const vm = containedValidators[1]!.getMetadata()
        expect(vm.name).toBe('testValidationPlugin:TestValidator2')
        expect(vm.keywords.length).toBe(1)
        expect(vm.keywords[0]).toBe('IncludedInAll')
        expect(vm.schemaTypes.length).toBe(2)
        expect(vm.schemaTypes).toEqual(['SomePrimType', 'SomeAPISchema'])
      }
    }
    {
      // Try to retrieve a failed validator (stageTask for validator which
      // provides schemaTypes
      const validator = registry.getOrLoadValidatorByName('testValidationPlugin:FailedValidator')
      expect(validator).toBeUndefined()
    }
    {
      // Try to retrieve a failed validator suite (stageTask for a contained
      // validator but suite provides schemaTypes
      const suite = registry.getOrLoadValidatorSuiteByName('testValidationPlugin:FailedValidatorSuite')
      expect(suite).toBeUndefined()
    }
  })

  // testUsdValidationRegistry.cpp:235-303.
  it('TestUsdValidationRegisterValidatorDynamicallyAndListener', () => {
    // listen to new validators being registered, OnValidatorRegistered will
    // check the name of the validator being registered.
    let receivedNoticeCount = 0
    const validatorKey = TfNotice.Register(UsdValidationNotice.DidRegisterValidator, (notice) => {
      const validator = notice.getValidator()
      expect(validator).toBeDefined()
      expect(validator.getMetadata().name).toBe('dynamicallyRegisteredValidator')
      receivedNoticeCount++
    })
    const suiteKey = TfNotice.Register(UsdValidationNotice.DidRegisterValidatorSuite, (notice) => {
      const suite = notice.getValidatorSuite()
      expect(suite).toBeDefined()
      expect(suite.getMetadata().name).toBe('dynamicallyRegisteredValidatorSuite')
      receivedNoticeCount++
    })

    const registry = ValidationRegistry.getInstance()
    {
      const metadata = new ValidatorMetadata()
      metadata.name = 'dynamicallyRegisteredValidator'
      metadata.doc = 'dynamic validator: notice should be sent and received.'
      registry.registerStageValidator(metadata, () => [])
    }
    expect(receivedNoticeCount).toBe(1)

    {
      const metadata = new ValidatorMetadata()
      metadata.name = 'dynamicallyRegisteredValidatorSuite'
      metadata.isSuite = true
      metadata.doc = 'dynamic validator suite: notice should be sent and received.'
      registry.registerValidatorSuite(metadata, [])
    }
    expect(receivedNoticeCount).toBe(2)
    validatorKey.revoke()
    suiteKey.revoke()
  })
})
