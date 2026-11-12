// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdCoreValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdCoreValidators.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order. Upstream finds the
// usdGeom schemas (Xform, Sphere) through Plug at run time; here the usdGeom
// module registers them.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import {
  ValidationErrorNameTokens, ValidationErrorType, ValidationRegistry, ValidatorNameTokens,
} from '../../src/index.ts'

// testUsdCoreValidators.cpp:17-19.
const _tokens = { usdValidationPlugin: 'usdValidation' }

describe('testUsdCoreValidators', () => {
  // testUsdCoreValidators.cpp:21-45.
  it('TestUsdValidators', () => {
    const registry = ValidationRegistry.getInstance()

    // The following test keeps track of all the available validators within
    // UsdCoreValidators keyword, hence as new validators are added under
    // this keyword this unit test will have to be updated.
    const coreValidatorMetadata = registry.getValidatorMetadataForPlugin(_tokens.usdValidationPlugin)
    expect(coreValidatorMetadata.length).toBe(3)

    const validatorMetadataNameSet = new Set(coreValidatorMetadata.map(metadata => metadata.name))
    const expectedValidatorNames = new Set([
      ValidatorNameTokens.compositionErrorTest,
      ValidatorNameTokens.stageMetadataChecker,
      ValidatorNameTokens.attributeTypeMismatch])
    expect(validatorMetadataNameSet).toEqual(expectedValidatorNames)
  })

  // testUsdCoreValidators.cpp:47-89.
  it('TestCoreUsdStageMetadata', async () => {
    // Get stageMetadataChecker
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(ValidatorNameTokens.stageMetadataChecker)
    expect(validator).toBeDefined()

    // Create an empty stage
    const rootLayer = Layer.createAnonymous()
    const usdStage = await Stage.open(rootLayer)
    const prim = usdStage.definePrim('/test', 'Xform')

    // Validate knowing there is no default prim
    let errors = await validator!.validate(usdStage)

    // Verify the correct error is returned
    expect(errors.length).toBe(1)
    const expectedErrorIdentifier = ValidatorNameTokens.stageMetadataChecker + '.'
      + ValidationErrorNameTokens.missingDefaultPrim
    expect(errors[0]!.getValidator()).toBe(validator)
    expect(errors[0]!.getIdentifier()).toBe(expectedErrorIdentifier)
    expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
    expect(errors[0]!.getSites().length).toBe(1)
    expect(errors[0]!.getSites()[0]!.isValid()).toBe(true)
    const expectedErrorMsg = `Stage with root layer <${rootLayer.identifier}> has an invalid or missing `
      + 'defaultPrim.'
    expect(errors[0]!.getMessage()).toBe(expectedErrorMsg)

    // Set a default prim
    usdStage.setDefaultPrim(prim)

    errors = await validator!.validate(usdStage)

    // Verify the error is gone
    expect(errors).toEqual([])
  })

  // testUsdCoreValidators.cpp:91-170.
  it('TestUsdCompositionErrorTest', async () => {
    const registry = ValidationRegistry.getInstance()

    // test to make sure CompositionErrorTest validator provided in the core
    // usd plugin works correctly by reporting all the composition errors,
    // error sites and appropriate messages pertaining to these errors.
    const compositionErrorValidator = registry.getOrLoadValidatorByName(
      ValidatorNameTokens.compositionErrorTest)
    expect(compositionErrorValidator).toBeDefined()

    const layerContents = `#usda 1.0
        (
        subLayers = [
        @missingLayer.usda@
        ]
        )
        def "World"
        {
        def "Inst1" (
        instanceable = true
        prepend references = </Main>
        )
        {
        }
        def "Inst2" (
        instanceable = true
        prepend references = </Main>
        )
        {
        }
        }
        def "Main"
        {
        def "First" (
        add references = </Main/Second>
        )
        {
        }
        def "Second" (
        add references = </Main/First>
        )
        {
        }
        }
    `
    const layer = Layer.createAnonymous('.usda')
    layer.importFromString(layerContents)
    const usdStage = await Stage.open(layer)

    // Get expected list of composition errors from the stage.
    const expectedPcpErrors = usdStage.getCompositionErrors()
    expect(expectedPcpErrors.length).toBe(5)

    // Get wrapped validation errors from our compositionErrorValidator
    const errors = await compositionErrorValidator!.validate(usdStage)
    expect(errors.length).toBe(5)

    // Lets make sure pcpErrors and validationErrors match
    const expectedErrorIdentifier = ValidatorNameTokens.compositionErrorTest + '.'
      + ValidationErrorNameTokens.compositionError
    errors.forEach((error, index) => {
      expect(error.getValidator()).toBe(compositionErrorValidator)
      expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(error.getMessage()).toBe(expectedPcpErrors[index]!.toString())
      expect(error.getSites().length).toBe(1)
      expect(error.getSites()[0]!.isValid()).toBe(true)
      expect(error.getSites()[0]!.isPrim()).toBe(true)
      expect(error.getSites()[0]!.getPrim()!.path).toBe(expectedPcpErrors[index]!.rootSite.path)
    })
  })

  // testUsdCoreValidators.cpp:172-239.
  it('TestUsdAttributeTypeMismatch', async () => {
    const registry = ValidationRegistry.getInstance()
    const attributeTypeMismatchValidator = registry.getOrLoadValidatorByName(
      ValidatorNameTokens.attributeTypeMismatch)
    expect(attributeTypeMismatchValidator).toBeDefined()

    const layer = Layer.createAnonymous('.usda')
    layer.importFromString(`#usda 1.0
        def Sphere "Sphere" {
            int radius = 1
        }
    `)

    const mainLayer = Layer.createAnonymous('.usda')
    mainLayer.importFromString(`#usda 1.0
            def Sphere "Sphere" (
                append references = @${layer.identifier}@</Sphere>
            )
            {
                float radius = 2.0
            }
        `)

    const usdStage = await Stage.open(mainLayer)
    const spherePrim = usdStage.getPrim('/Sphere')
    expect(spherePrim).toBeDefined()

    const errors = await attributeTypeMismatchValidator!.validate(spherePrim!)
    expect(errors.length).toBe(2)
    const expectedErrorIdentifier = ValidatorNameTokens.attributeTypeMismatch + '.'
      + ValidationErrorNameTokens.attributeTypeMismatch
    const expectedMessages = [
      'Type mismatch for attribute </Sphere.radius>. Expected attribute type is \'double\' but '
        + `defined as 'int' in layer <${layer.identifier}>.`,
      'Type mismatch for attribute </Sphere.radius>. Expected attribute type is \'double\' but '
        + `defined as 'float' in layer <${mainLayer.identifier}>.`,
    ]
    const expectedLayerIdentifiers = [layer.identifier, mainLayer.identifier]
    for (const error of errors) {
      expect(error.getValidator()).toBe(attributeTypeMismatchValidator)
      expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(error.getType()).toBe(ValidationErrorType.Error)
      expect(error.getSites().length).toBe(1)
      expect(error.getSites()[0]!.isValid()).toBe(true)
      expect(error.getSites()[0]!.isValidSpecInLayer()).toBe(true)
      expect(expectedLayerIdentifiers).toContain(error.getSites()[0]!.getLayer()!.identifier)
      expect(expectedMessages).toContain(error.getMessage())
    }
  })
})
