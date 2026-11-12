// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidator.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidator.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, Validator, ValidatorMetadata, ValidatorSuite,
  type ValidateLayerTaskFn, type ValidatePrimTaskFn, type ValidateStageTaskFn,
} from '../../src/index.ts'

describe('testUsdValidator', () => {
  // testUsdValidator.cpp:18-145.
  it('TestSimpleValidator', async () => {
    // Note that these are just to test the validator -> taskFn -> Error
    // pipeline, validators should ideally be registered with the
    // UsdValidationRegistry.
    //
    // Simple LayerValidator
    const validateLayerTaskFn: ValidateLayerTaskFn = () => [new ValidationError()]
    const metadata = new ValidatorMetadata()
    metadata.name = 'TestSimpleLayerValidator'
    metadata.doc = 'This is a test.'
    metadata.isSuite = false
    const layerValidator = new Validator(metadata, { layer: validateLayerTaskFn })
    const testLayer = Layer.createAnonymous()
    {
      const errors = await layerValidator.validate(testLayer)
      expect(errors.length).toBe(1)
      // Since no ErrorName is provided error identifier is same as the
      // validator name.
      expect(errors[0]!.getIdentifier()).toBe(metadata.name)
      expect(errors[0]!.hasNoError()).toBe(true)
      expect(errors[0]!.getSites()).toEqual([])
      expect(errors[0]!.getValidator()).toBe(layerValidator)
    }
    // Use the LayerValidator to validate a prim!!
    // Note that this validator has no UsdValidatePrimTaskFn!
    const usdStage2 = Stage.createNew()
    const prim = usdStage2.getPrim('/')!
    {
      expect(await layerValidator.validate(prim)).toEqual([])
    }

    const errorName = 'ErrorOnStage'
    const expectedErrorIdentifier = 'TestSimpleStageValidator.ErrorOnStage'
    // Simple StageValidator
    const validateStageTaskFn: ValidateStageTaskFn = (usdStage) => [new ValidationError(
      errorName, ValidationErrorType.Error, [new ValidationErrorSite(usdStage, '/')],
      'This is an error on the stage')]
    metadata.name = 'TestSimpleStageValidator'
    const stageValidator = new Validator(metadata, { stage: validateStageTaskFn })
    const usdStage = Stage.createNew()
    {
      const errors = await stageValidator.validate(usdStage)
      expect(errors.length).toBe(1)
      expect(errors[0]!.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(errors[0]!.hasNoError()).toBe(false)
      expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
      expect(errors[0]!.getValidator()).toBe(stageValidator)
      const errorSites = errors[0]!.getSites()
      expect(errorSites.length).toBe(1)
      expect(errorSites[0]!.isValidSpecInLayer()).toBe(false)
      expect(errorSites[0]!.isPrim()).toBe(true)
      expect(errorSites[0]!.isProperty()).toBe(false)
    }
    // Use the StageValidator to validate a layer
    // Note that this validator has no UsdValidateLayerTaskFn
    {
      expect(await stageValidator.validate(testLayer)).toEqual([])
    }
    // Create a stage using the layer and validate the stage now!
    const usdStageFromLayer = await Stage.open(testLayer)
    {
      const errors = await stageValidator.validate(usdStageFromLayer)
      expect(errors.length).toBe(1)
      expect(errors[0]!.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(errors[0]!.hasNoError()).toBe(false)
      expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
      expect(errors[0]!.getValidator()).toBe(stageValidator)
      const errorSites = errors[0]!.getSites()
      expect(errorSites.length).toBe(1)
      expect(errorSites[0]!.isValidSpecInLayer()).toBe(false)
      expect(errorSites[0]!.isPrim()).toBe(true)
      expect(errorSites[0]!.isProperty()).toBe(false)
    }

    // Simple SchemaTypeValidator
    const errorName2 = 'ErrorOnSchemaType'
    const validatePrimTaskFn: ValidatePrimTaskFn = (usdPrim) => [new ValidationError(
      errorName2, ValidationErrorType.Error,
      [new ValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
      'This is an error on the stage')]
    metadata.name = 'TestSimplePrimValidator'
    metadata.schemaTypes = ['MadeUpPrimType']
    const expectedErrorIdentifier2 = 'TestSimplePrimValidator.ErrorOnSchemaType'
    const schemaTypeValidator = new Validator(metadata, { prim: validatePrimTaskFn })
    {
      const errors = await schemaTypeValidator.validate(prim)
      expect(errors.length).toBe(1)
      expect(errors[0]!.getIdentifier()).toBe(expectedErrorIdentifier2)
      expect(errors[0]!.hasNoError()).toBe(false)
      expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
      expect(errors[0]!.getValidator()).toBe(schemaTypeValidator)
      const errorSites = errors[0]!.getSites()
      expect(errorSites.length).toBe(1)
      expect(errorSites[0]!.isValidSpecInLayer()).toBe(false)
      expect(errorSites[0]!.isPrim()).toBe(true)
      expect(errorSites[0]!.isProperty()).toBe(false)
    }

    // Simple ValidatorSuite
    metadata.name = 'TestValidatorSuite'
    metadata.doc = 'This is a test.'
    metadata.schemaTypes = []
    metadata.isSuite = true
    const validatorSuite = new ValidatorSuite(
      metadata, [layerValidator, stageValidator, schemaTypeValidator])
    expect(validatorSuite.getContainedValidators().length).toBe(3)
  })
})
