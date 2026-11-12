// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPy.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPy.py, with
// its test plugin in ./registryPyValidators.ts.
//
// Left out: `eval(repr(validator)) == validator` (Python repr round trip).
import { beforeAll, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ValidationRegistry } from '../../src/index.ts'
import {
  addRegistryPyRegistryFunction, registerRegistryPyPlugin, registrationChecks,
} from './registryPyValidators.ts'

const VALIDATOR1_NAME = 'TestValidator1'
const VALIDATOR2_NAME = 'TestValidator2'
const VALIDATOR_SUITE_NAME = 'TestValidatorSuite'

addRegistryPyRegistryFunction()

// testUsdValidationRegistryPy.py:23-39 (setUpClass).
beforeAll(() => {
  // Register TestUsdValidationRegistryPy plugin.
  expect(registerRegistryPyPlugin()).toEqual(['testValidationRegistryPyPlugin'])
  const validationRegistry = ValidationRegistry.getInstance()
  validationRegistry.getOrLoadAllValidators()
  expect(registrationChecks.length).toBe(3)
  for (const [name, clean] of registrationChecks) expect(clean, name).toBe(true)
})

describe('TestUsdValidationRegistryPy', () => {
  it('test_QueryValidatorsAndSuites', () => {
    const validationRegistry = ValidationRegistry.getInstance()
    expect(validationRegistry.hasValidator('invalid_validator')).toBe(false)
    const allValidators = validationRegistry.getOrLoadAllValidators()
    expect(allValidators.length).toBeGreaterThan(0)
    const validator = validationRegistry.getOrLoadValidatorByName(VALIDATOR1_NAME)
    expect(validator).toBeTruthy()
    const validators = validationRegistry.getOrLoadValidatorsByName([VALIDATOR1_NAME, VALIDATOR2_NAME])
    expect(validators.length).toBe(2)
    const allSuites = validationRegistry.getOrLoadAllValidatorSuites()
    expect(allSuites.length).toBeGreaterThan(0)
    const validatorSuite = validationRegistry.getOrLoadValidatorSuiteByName(VALIDATOR_SUITE_NAME)
    expect(validatorSuite).toBeTruthy()
    expect(allSuites).toContain(validatorSuite)
    const validatorSuites = validationRegistry.getOrLoadValidatorSuitesByName([VALIDATOR_SUITE_NAME])
    expect(validatorSuites.length).toBeGreaterThan(0)
    for (const suite of validatorSuites) expect(allSuites).toContain(suite)
  })

  it('test_QueryMetadata', () => {
    const validationRegistry = ValidationRegistry.getInstance()
    const invalidMetadata = validationRegistry.getValidatorMetadata('invalid_validator')
    expect(invalidMetadata).toBeFalsy()
    const metadata = validationRegistry.getValidatorMetadata(VALIDATOR1_NAME)!
    const expectedKeywords = ['IncludedInAll', 'SomeKeyword1']
    expect(metadata.getKeywords()).toEqual(expectedKeywords)
    const allMetadatas = validationRegistry.getAllValidatorMetadata()
    expect(allMetadatas.length).toBeGreaterThan(0)
    let metadatas = validationRegistry.getValidatorMetadataForPlugin('InvalidPlugin')
    expect(metadatas).toEqual([])
    metadatas = validationRegistry.getValidatorMetadataForKeyword('InvalidKeyword')
    expect(metadatas).toEqual([])
    metadatas = validationRegistry.getValidatorMetadataForKeyword('SomeKeyword1')
    expect(metadatas.length).toBeGreaterThan(0)
    metadatas = validationRegistry.getValidatorMetadataForKeywords(expectedKeywords)
    expect(metadatas.length).toBeGreaterThan(0)
    metadatas = validationRegistry.getValidatorMetadataForSchemaType('InvalidSchemaType')
    expect(metadatas).toEqual([])
    metadatas = validationRegistry.getValidatorMetadataForSchemaType('SomePrimType')
    expect(metadatas.length).toBeGreaterThan(0)
    metadatas = validationRegistry.getValidatorMetadataForSchemaTypes(['SomePrimType'])
    expect(metadatas.length).toBeGreaterThan(0)
  })

  // We put tests for UsdValidation.Validator and UsdValidation.ValidatorSuite
  // here as we cannot construct validator directly but only through registry.
  it('test_ValidatorAndSuite', async () => {
    const validationRegistry = ValidationRegistry.getInstance()
    const validator = validationRegistry.getOrLoadValidatorByName(VALIDATOR1_NAME)
    expect(validator).toBeTruthy()
    expect(validator!.getMetadata().getKeywords()).toEqual(['IncludedInAll', 'SomeKeyword1'])
    const stage = Stage.createNew()
    const prim = stage.definePrim('/test')
    let errors = await validator!.validate(prim)
    expect(errors).toEqual([])
    errors = await validator!.validate(stage.getRootLayer())
    expect(errors).toEqual([])
    errors = await validator!.validate(stage)
    expect(errors.length).toBeGreaterThan(0)
    const validatorSuite = validationRegistry.getOrLoadValidatorSuiteByName(VALIDATOR_SUITE_NAME)!
    expect(validatorSuite.getMetadata().getKeywords()).toEqual(['IncludedInAll', 'SuiteValidator'])
    const validators = validatorSuite.getContainedValidators()
    expect(validators.length).toBe(2)
    expect(validators).toContain(validator)
  })
})
