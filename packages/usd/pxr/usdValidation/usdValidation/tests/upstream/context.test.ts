// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationContext.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationContext.cpp, with
// its test plugins in ./contextValidators.ts.
//
// Each TF_AXIOM is an expect() here, in upstream order.
import { beforeAll, describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Layer } from 'typescript-usd/sdf'
import { TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import { EditTarget as UsdEditTarget, Stage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import {
  ValidationContext, ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry,
  ValidationTimeRange, ValidatorMetadata,
} from '../../src/index.ts'
import { registerContextTestPlugins, registrationChecks } from './contextValidators.ts'

// testUsdValidationContext.cpp:21-48.
function _layerContents(): string {
  return `#usda 1.0
        def "World"
        {
            def BaseTypeTest "baseType"
            {
            }
            def DerivedTypeTest "derivedType"
            {
            }
            def NestedDerivedTypeTest "nestedDerivedType"
            {
            }
            def "somePrim" (
                prepend apiSchemas = ["APISchemaTestAPI"]
            )
            {
            }
        }
    `
}

// testUsdValidationContext.cpp:50-56.
function _createTestLayer(): Layer {
  const testLayer = Layer.createAnonymous('.usda')
  testLayer.importFromString(_layerContents())
  return testLayer
}

const P = 'testUsdValidationContextValidatorsPlugin'

// testUsdValidationContext.cpp:58-146.
function _testError1(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test1`)
  expect(error.getSites().length).toBe(1)
  expect(error.getSites()[0]!.isPrim()).toBe(true)
  expect(error.getSites()[0]!.getPrim()!.path).toBe('/')
}

function _testError2(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test2`)
  expect(error.getSites().length).toBe(1)
  expect(error.getSites()[0]!.isValidSpecInLayer()).toBe(true)
}

function _testError3(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test3`)
  const expectedPrimPaths = ['/World', '/World/baseType', '/World/derivedType',
    '/World/nestedDerivedType', '/World/somePrim']
  expect(expectedPrimPaths).toContain(error.getSites()[0]!.getPrim()!.path)
}

function _testError4(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test4`)
  const expectedPrimPaths = ['/World/baseType', '/World/derivedType', '/World/nestedDerivedType']
  expect(expectedPrimPaths).toContain(error.getSites()[0]!.getPrim()!.path)
}

function _testError5(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test5`)
  const expectedPrimPaths = ['/World/derivedType', '/World/nestedDerivedType']
  expect(expectedPrimPaths).toContain(error.getSites()[0]!.getPrim()!.path)
}

function _testError6(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test6`)
  expect(error.getSites().length).toBe(1)
  expect(error.getSites()[0]!.isPrim()).toBe(true)
  expect(error.getSites()[0]!.getPrim()!.path.split('/').pop()).toBe('nestedDerivedType')
}

function _testError7(error: ValidationError): void {
  expect(error.getName()).toBe('Test7Error')
  expect(error.getValidator()!.getMetadata().name).toBe(`${P}:Test7`)
  expect(error.getSites().length).toBe(1)
  expect(error.getSites()[0]!.isPrim()).toBe(true)
  expect(error.getSites()[0]!.getPrim()!.path.split('/').pop()).toBe('somePrim')
}

function _testNonPluginError(error: ValidationError): void {
  expect(error.getValidator()!.getMetadata().name).toBe('nonPluginValidator')
  expect(error.getSites()[0]!.getPrim()!.path).toBe('/')
}

function _dispatch(errors: ValidationError[], checks: Record<string, (error: ValidationError) => void>): void {
  for (const error of errors) {
    const check = checks[error.getName()]
    expect(check, `unexpected error ${error.getName()}`).toBeDefined()
    check!(error)
  }
}

// testUsdValidationContext.cpp:442-539 (main).
beforeAll(() => {
  // Register the test plugins
  // Plugin which provides test usd schema types, and plugin which provides
  // test validators
  expect(registerContextTestPlugins()).toBe(2)

  // Add a non-plugin based validator here.
  const metadata = new ValidatorMetadata()
  metadata.name = 'nonPluginValidator'
  metadata.keywords = ['Keyword2']
  metadata.pluginPtr = null
  metadata.doc = 'This is a non-plugin based validator.'
  metadata.isTimeDependent = false
  metadata.isSuite = false

  // Register the validator
  const m = new TfErrorMark()
  ValidationRegistry.getInstance().registerPrimValidator(metadata, (prim) => [new ValidationError(
    'nonPluginError', ValidationErrorType.Error, [new ValidationErrorSite(prim.getStage(), '/')],
    'A non-plugin based validator error')])
  expect(m.isClean()).toBe(true)
})

describe('testUsdValidationContext', () => {
  it('registers the test plugin validators cleanly (testUsdValidationContextValidators.cpp)', () => {
    ValidationRegistry.getInstance()
    expect(registrationChecks.length).toBe(8)
    for (const [name, clean] of registrationChecks) expect(clean, name).toBe(true)
  })

  // testUsdValidationContext.cpp:148-440 (_TestUsdValidationContext).
  it('_TestUsdValidationContext', async () => {
    {
      // Create a ValidationContext with a suite
      const suite = ValidationRegistry.getInstance().getOrLoadValidatorSuiteByName(`${P}:TestSuite`)
      const context = new ValidationContext([suite])
      const testLayer = _createTestLayer()
      // Run Validate(layer)
      let errors = await context.validate(testLayer)
      // 1 error for Test2 validator - root layer of the stage
      expect(errors.length).toBe(1)
      _testError2(errors[0]!)

      // Run Validate(stage)
      const stage = await Stage.open(testLayer)
      errors = await context.validate(stage)
      // 1 error for Test1 validator (stage)
      // 2 error for Test2 validator - root layer and session layer
      // 5 errors for Test3 generic prim validator which runs on all 5 prims
      expect(errors.length).toBe(8)
      for (const error of errors) {
        if (error.getName() === 'Test1Error') {
          // validator corresponding to this error has fixer too, so lets
          // test that
          const fixers = error.getFixers()
          expect(fixers.length).toBe(3)
          expect(fixers[0]!.getName()).toBe('TestFixer1')
          expect(fixers[1]!.getName()).toBe('TestFixer2')
          expect(fixers[2]!.getName()).toBe('TestFixer3')
          expect(fixers[0]!.isAssociatedWithErrorName('Test1Error')).toBe(true)
          expect(fixers[1]!.isAssociatedWithErrorName('Test1Error')).toBe(true)
          expect(fixers[2]!.isAssociatedWithErrorName('Test1Error')).toBe(false)
          // No edit target provided
          expect(fixers[0]!.canApplyFix(error, new UsdEditTarget(), UsdTimeCode.Default())).toBe(false)
          expect(fixers[0]!.canApplyFix(error, stage.getEditTarget(), UsdTimeCode.Default())).toBe(true)
          expect(fixers[1]!.canApplyFix(error, stage.getEditTarget(), UsdTimeCode.Default())).toBe(true)
          expect(fixers[2]!.canApplyFix(error, stage.getEditTarget(), UsdTimeCode.Default())).toBe(false)
          _testError1(error)
        } else if (error.getName() === 'Test2Error') {
          _testError2(error)
        } else if (error.getName() === 'Test3Error') {
          _testError3(error)
        } else {
          expect.fail(`unexpected error ${error.getName()}`)
        }
      }
    }
    {
      // Create a ValidationContext with explicit schemaTypes
      const context = new ValidationContext([TfType.findByName('testBaseType')])
      const testLayer = _createTestLayer()
      // Run Validate(layer)
      let errors = await context.validate(testLayer)
      // 0 errors as we do not have any layer validators selected in this
      // context.
      expect(errors).toEqual([])

      // Run Validate(stage)
      const stage = await Stage.open(testLayer)
      errors = await context.validate(stage)
      // 3 errors for Test4 testBaseType prim type validator which runs on
      // the baseType, derivedType and nestedDerivedType prims
      expect(errors.length).toBe(3)
      for (const error of errors) _testError4(error)
    }
    {
      // Create a ValidationContext with explicit schemaType - apiSchema
      const context = new ValidationContext([TfType.findByName('testAPISchemaAPI')])
      const testLayer = _createTestLayer()
      // Run Validate(layer)
      let errors = await context.validate(testLayer)
      // 0 errors as we do not have any layer validators selected in this
      // context.
      expect(errors).toEqual([])

      // Run Validate(stage)
      const stage = await Stage.open(testLayer)
      errors = await context.validate(stage)
      // 1 error for Test7 testAPISchema prim type validator which runs on
      // the somePrim prim
      expect(errors.length).toBe(1)
      _testError7(errors[0]!)
    }
    {
      // Create a ValidationContext with keywords API and have
      // includeAllAncestors set to default (true)
      const context = new ValidationContext(['Keyword1'])
      const testLayer = _createTestLayer()
      // Run Validate(layer)
      let errors = await context.validate(testLayer)
      // 0 errors as we do not have any layer validators selected in this
      // context.
      expect(errors).toEqual([])

      // Run Validate(stage)
      const stage = await Stage.open(testLayer)
      errors = await context.validate(stage)
      // 1 error for Test1 validator
      // 5 errors for Test3 generic prim validator which runs on all 5 prims
      // 2 errors for Test5 testDerivedType prim type validator which runs on
      //   the derivedType and nestedDerivedType prims
      // 3 errors for Test4 testBaseType prim type validator which runs on
      // the baseType, derivedType and nestedDerivedType prims (This gets
      // includes as an ancestor type of derivedType)
      // 1 error for Test7 testAPISchema prim type validator which runs on
      //  the somePrim prim
      expect(errors.length).toBe(12)
      _dispatch(errors, {
        Test1Error: _testError1, Test3Error: _testError3, Test4Error: _testError4,
        Test5Error: _testError5, Test7Error: _testError7,
      })
    }
    {
      // Create a ValidationContext with keywords API and have
      // includeAllAncestors set to false.
      const context = new ValidationContext(['Keyword2'], false)
      const testLayer = _createTestLayer()
      // Run Validate(layer)
      let errors = await context.validate(testLayer)
      // 1 error for Test2 validator - root layer of the stage
      expect(errors.length).toBe(1)
      _testError2(errors[0]!)

      // Run Validate(prims)
      const stage = await Stage.open(testLayer)
      errors = await context.validate([...stage.traverse()].map(path => stage.getPrim(path)!))
      // 3 errors for Test4 testBaseType prim type validator which runs on
      //  the baseType, derivedType and nestedDerivedType prims
      // 1 error for Test6 testNestedDerivedType prim type validator which
      //  runs on the nestedDerivedType prim
      // 5 errors for testNonPluginValidator which runs on all prims
      // Because of TestSuite:
      // 5 errors for Test3 generic prim validator which runs on all 5 prims
      expect(errors.length).toBe(14)
      _dispatch(errors, {
        Test3Error: _testError3, Test4Error: _testError4, Test6Error: _testError6,
        nonPluginError: _testNonPluginError,
      })

      // Run Validate(stage)
      errors = await context.validate(stage)
      // 2 error for Test2 validator - root layer and session layer
      // 3 errors for Test4 testBaseType prim type validator which runs on
      //  the baseType, derivedType and nestedDerivedType prims
      // 1 error for Test6 testNestedDerivedType prim type validator which
      //  runs on the nestedDerivedType prim
      // 5 errors for testNonPluginValidator which runs on all prims
      // Because of TestSuite:
      // 1 error for Test1 validator
      // 5 errors for Test3 generic prim validator which runs on all 5 prims
      expect(errors.length).toBe(17)
      _dispatch(errors, {
        Test1Error: _testError1, Test2Error: _testError2, Test3Error: _testError3,
        Test4Error: _testError4, Test6Error: _testError6, nonPluginError: _testNonPluginError,
      })
    }
    {
      // Create a ValidationContext with plugins
      const context = new ValidationContext(
        [PlugRegistry.GetInstance().GetPluginWithName('testUsdValidationContextValidatorsPlugin')])
      const testLayer = _createTestLayer()
      const stage = await Stage.open(testLayer)
      const errors = await context.validate(stage)
      // 1 error for Test1 validator
      // 2 error for Test2 validator - root layer and session layer
      // 5 errors for Test3 generic prim validator which runs on all 5 prims
      // 3 errors for Test4 testBaseType prim type validator which runs on
      //  the baseType, derivedType and nestedDerivedType prims
      // 2 error for Test5 testDerivedType prim type validator which runs on
      //   the derivedType and nestedDerivedType prims
      // 1 error for Test6 testNestedDerivedType prim type validator which
      //  runs on the nestedDerivedType prim
      // 1 error for Test7 testAPISchema prim type validator which runs on
      //  the somePrim prim
      expect(errors.length).toBe(15)
      _dispatch(errors, {
        Test1Error: _testError1, Test2Error: _testError2, Test3Error: _testError3,
        Test4Error: _testError4, Test5Error: _testError5, Test6Error: _testError6,
        Test7Error: _testError7,
      })
    }
    {
      const layerWithTimeCodes = `#usda 1.0
            def "World"
            {
                def BaseTypeTest "baseType"
                {
                    float attr = 3
                    float attr.timeSamples = {
                        1: 1,
                        2: 2,
                        3: 3
                    }
                }
            }
        `

      // Create a ValidationContext with Test3 and Test4 validators
      const validators = ValidationRegistry.getInstance().getOrLoadValidatorsByName(
        [`${P}:Test3`, `${P}:Test4`])
      const context = new ValidationContext(validators)

      const testLayer = Layer.createAnonymous('.usda')
      testLayer.importFromString(layerWithTimeCodes)
      const stage = await Stage.open(testLayer)

      // Validate Stage with ProxyPrim traversal predicate and default
      // UsdValidationTimeRange which is full interval.
      let errors = await context.validate(stage)
      // 1 - error for Test4 testBaseType prim type validator which runs on
      //   the baseType prim. (This is not a time dependent validator).
      // 1 - error for Test3 generic prim validator which runs on the /World
      //   prim with full interval + default but since no attributes on
      //   /World, an error is reported for that in the implementation.
      // 1 - error for Test3 generic prim validator emulating handling of
      //   uniform attribute validation at default time.
      // 3 - errors for Test3 generic prim validator which runs on the
      //   /World/baseType prim with full interval, that is 1 error for each
      //   time sample on the attr attribute.
      expect(errors.length).toBe(6)

      // Also Validate the same stage but with only
      // GfInterval::GetFullInterval, which does not include
      // UsdTimeCode::Default
      errors = await context.validate(stage, new ValidationTimeRange(GfInterval.getFullInterval(), false))
      // 1 - error for Test4 testBaseType prim type validator which runs on
      //   the baseType prim. (This is not a time dependent validator).
      // 3 - errors for Test3 generic prim validator which runs on the
      //   /World/baseType prim with full interval, that is 1 error for each
      //   time sample on the attr attribute.
      expect(errors.length).toBe(4)

      // Also Validate the /World/baseType prim which has attributes with
      // timeSamples but with a TimeRange which has an empty interval but
      // includes UsdTimeCode::Default.
      const prims = [stage.getPrim('/World/baseType')!]
      errors = await context.validate(prims, new ValidationTimeRange(new GfInterval(), true))
      // 1 error for Test4 testBaseType prim type validator which runs on
      //   the baseType prim. (This is not a time dependent validator).
      // 1 error for Test3 generic prim validator which runs on the
      //   /World/baseType prim with empty interval but includes
      //   UsdTimeCode::Default.
      expect(errors.length).toBe(2)

      // Also Validate a specific prim at a specific timeCode
      const timeCodes = [new UsdTimeCode(1), new UsdTimeCode(2)]
      // Validate specific /World/baseType prim at times 1 and 2.
      errors = await context.validate(prims, timeCodes)
      // 1 error for Test4 (non time dependent validator) testBaseType prim
      // type validator which runs on the baseType prim.
      // 2 errors for Test3 generic prim validator which runs on the
      //  /World/baseType prim at timeCode 1 and 2, specified times.
      expect(errors.length).toBe(3)
    }
  })
})
