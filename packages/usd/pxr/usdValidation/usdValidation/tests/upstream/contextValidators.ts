// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationContext.cpp,
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationContextPy.py,
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationContextValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationContextValidators.cpp
// with TestUsdValidationContextValidators_plugInfo.json and the test schema
// plugin testUsdValidationContext/resources (plugInfo.json and
// generatedSchema.usda): the test plugins testUsdValidationContext.cpp and
// testUsdValidationContextPy.py register.
//
// The test plugin library is this module: its TF_REGISTRY_FUNCTION
// (UsdValidationRegistry) is a TfRegistryManager function added on import,
// and its plugInfo is registered as part of this build (no plugInfo URL, so
// nothing to load). The registry function's TF_AXIOM(m.IsClean()) checks are
// recorded in registrationChecks for the tests to assert.
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { TfErrorMark, TfRegistryManager } from 'typescript-usd/tf'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationFixer, ValidationRegistry,
} from '../../src/index.ts'

// TestUsdValidationContextValidators_plugInfo.json.
export const contextValidatorsPlugInfo = {
  Plugins: [{
    Type: 'library',
    Name: 'testUsdValidationContextValidatorsPlugin',
    Root: '@TEST_PLUG_INFO_ROOT@',
    ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
    LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
    Info: {
      Validators: {
        Test1: { doc: 'Stage Validator', keywords: ['Keyword1'] },
        Test2: { doc: 'Layer Validator', keywords: ['Keyword2'] },
        Test3: { doc: 'A generic prim validator', keywords: ['Keyword1'], isTimeDependent: true },
        Test4: { doc: 'validator for testBaseType', keywords: ['Keyword2'], schemaTypes: ['testBaseType'] },
        Test5: { doc: 'validator for testDerivedType', keywords: ['Keyword1'], schemaTypes: ['testDerivedType'] },
        Test6: {
          doc: 'validator for testNestedDerivedType', keywords: ['Keyword2'],
          schemaTypes: ['testNestedDerivedType'],
        },
        Test7: { doc: 'validator for testAPISchema', keywords: ['Keyword1'], schemaTypes: ['testAPISchemaAPI'] },
        TestSuite: {
          doc: 'A suite of validators for Test1, Test2 and Test3', isSuite: true, keywords: ['Keyword2'],
        },
      },
    },
  }],
}

// testUsdValidationContext/resources/plugInfo.json.
export const contextSchemaPlugInfo = {
  Plugins: [{
    Type: 'resource',
    ResourcePath: '.',
    Name: 'testUsdValidationContext',
    Info: {
      Types: {
        testBaseType: {
          bases: ['UsdTyped'], alias: { UsdSchemaBase: 'BaseTypeTest' }, schemaKind: 'concreteTyped',
        },
        testDerivedType: {
          bases: ['testBaseType'], alias: { UsdSchemaBase: 'DerivedTypeTest' }, schemaKind: 'concreteTyped',
        },
        testNestedDerivedType: {
          bases: ['testDerivedType'], alias: { UsdSchemaBase: 'NestedDerivedTypeTest' },
          schemaKind: 'concreteTyped',
        },
        testAPISchemaAPI: {
          schemaKind: 'singleApplyAPI', alias: { UsdSchemaBase: 'APISchemaTestAPI' }, bases: ['UsdAPISchemaBase'],
        },
      },
    },
  }],
}

// testUsdValidationContext/resources/generatedSchema.usda.
export const contextGeneratedSchema = `#usda 1.0
class testBaseType "BaseTypeTest"
{
}

class testDerivedType "DerivedTypeTest"
{
}

class testNestedDerivedType "NestedDerivedTypeTest"
{
}

class "APISchemaTestAPI"
{
}
`

/** Registers both test plugins (testUsdValidationContext.cpp:446-466). */
export function registerContextTestPlugins(): number {
  const registry = PlugRegistry.GetInstance()
  return registry.RegisterPlugins(contextSchemaPlugInfo,
    { testUsdValidationContext: { 'generatedSchema.usda': contextGeneratedSchema } }).length
    + registry.RegisterPlugins(contextValidatorsPlugInfo).length
}

export const registrationChecks: [string, boolean][] = []

const plugin = 'testUsdValidationContextValidatorsPlugin'

// testUsdValidationContextValidators.cpp:19-233.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()

  // Register test plugin validators here
  // Test validators simply just return errors, we need to make sure various
  // UsdValidationContext APIs work and get the expected errors back, when
  // Validate is called in various scenarios on a validation context instance.
  {
    const validatorName = `${plugin}:Test1`
    const validationErrorId = 'Test1Error'
    const m = new TfErrorMark()
    const canApply = (error: ValidationError): boolean => {
      if (error.getData() !== 'ErrorMetadata') throw new Error('TF_AXIOM failed: error.GetData()')
      return true
    }
    const fixers = [
      new ValidationFixer('TestFixer1', 'A test fixer which caters to all errors',
        () => true, canApply, [], ''),
      new ValidationFixer('TestFixer2', 'A test fixer which caters to error named Test1Error',
        () => true, canApply, [], validationErrorId),
      new ValidationFixer('TestFixer3', 'A test fixer which caters to error named SomeOtherError',
        () => true, canApply, [], 'SomeOtherError'),
    ]
    registry.registerPluginStageValidator(validatorName, (usdStage) => [new ValidationError(
      validationErrorId, ValidationErrorType.Error, [new ValidationErrorSite(usdStage, '/')],
      'A stage validator error', 'ErrorMetadata')], fixers)
    registrationChecks.push([validatorName, m.isClean()])
  }
  {
    const validatorName = `${plugin}:Test2`
    const m = new TfErrorMark()
    registry.registerPluginLayerValidator(validatorName, (layer) => [new ValidationError(
      'Test2Error', ValidationErrorType.Error, [new ValidationErrorSite(layer, '/')],
      'A layer validator error')])
    registrationChecks.push([validatorName, m.isClean()])
  }
  {
    const validatorName = `${plugin}:Test3`
    const m = new TfErrorMark()
    registry.registerPluginPrimValidator(validatorName, (prim, timeRange) => {
      const validationErrorId = 'Test3Error'
      const errors: ValidationError[] = []
      if (timeRange.includesTimeCodeDefault()) {
        const errStr = 'default time checker within a time dependent validator'
        errors.push(new ValidationError(validationErrorId, ValidationErrorType.Error,
          [new ValidationErrorSite(prim.getStage(), prim.path)], errStr))
      }
      for (const attr of prim.getAttributes()) {
        for (const timeCode of attr.getTimeSamplesInInterval(timeRange.getInterval())) {
          // std::to_string(double) prints six decimals.
          const errStr = `A prim validator error at timeCode: ${timeCode.toFixed(6)}`
          errors.push(new ValidationError(validationErrorId, ValidationErrorType.Error,
            [new ValidationErrorSite(prim.getStage(), prim.path)], errStr))
        }
      }
      return errors
    })
    registrationChecks.push([validatorName, m.isClean()])
  }
  const schemaTypeValidator = (index: number, message: string): void => {
    const validatorName = `${plugin}:Test${index}`
    const m = new TfErrorMark()
    registry.registerPluginPrimValidator(validatorName, (prim) => [new ValidationError(
      `Test${index}Error`, ValidationErrorType.Error,
      [new ValidationErrorSite(prim.getStage(), prim.path)], message)])
    registrationChecks.push([validatorName, m.isClean()])
  }
  schemaTypeValidator(4, 'A testBaseType prim type validator error')
  schemaTypeValidator(5, 'A testDerivedType prim type validator error')
  schemaTypeValidator(6, 'A testNestedDerivedType prim type validator error')
  schemaTypeValidator(7, 'A testAPISchema prim type validator error')
  {
    const suiteName = `${plugin}:TestSuite`
    const containedValidators = registry.getOrLoadValidatorsByName(
      [`${plugin}:Test1`, `${plugin}:Test2`, `${plugin}:Test3`])
    const m = new TfErrorMark()
    registry.registerPluginValidatorSuite(suiteName, containedValidators)
    registrationChecks.push([suiteName, m.isClean()])
  }
})
