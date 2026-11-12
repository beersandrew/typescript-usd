// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPyRegister.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPyRegister.py,
// with its test plugin's plugInfo in ./registryPyValidators.ts (the plugin's
// library is not loaded by this test, so its registry function is not added).
//
// Tests for registering validators implemented in script. Two registration
// paths are exercised:
// 1. Explicit registration (RegisterLayerValidator, etc.) -- the caller
//    provides full ValidatorMetadata.
// 2. Plugin registration (RegisterPluginLayerValidator, etc.) -- the caller
//    provides only a name; metadata comes from the plugin's plugInfo.json.
//
// unittest runs test methods in name order, and test_RegisterValidatorSuite
// and test_RegisterPluginValidatorSuite use validators earlier tests
// register, so the it()s are in that order here.
import { beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Stage, type Prim } from 'typescript-usd/usd'
import {
  Notice as UsdValidationNotice, ValidationContext, ValidationError, ValidationErrorSite, ValidationErrorType,
  ValidationRegistry, ValidatorMetadata, type ValidateLayerTaskFn,
} from '../../src/index.ts'
import { registerRegistryPyPlugin } from './registryPyValidators.ts'

const PLUGIN_NAME = 'testValidationRegistryPyPlugin'

// testUsdValidationRegistryPyRegister.py:23-34 (setUpClass).
beforeAll(() => {
  expect(registerRegistryPyPlugin()).toEqual([PLUGIN_NAME])
})

const primError = (name: string, message: string) => (prim: Prim): ValidationError[] => {
  if (prim.isPseudoRoot()) return []
  return [new ValidationError(name, ValidationErrorType.Error,
    [new ValidationErrorSite(prim.getStage(), prim.path)], `${message} ${prim.path}`)]
}

const stageError = (name: string, message: string) => (stage: Stage): ValidationError[] => [
  new ValidationError(name, ValidationErrorType.Error, [new ValidationErrorSite(stage, '/')], message)]

describe('TestUsdValidationRegistryPyRegister', () => {
  it('test_NoticeOnRegisterValidator', () => {
    const receivedValidatorNotices: string[] = []
    const key = TfNotice.registerGlobally(UsdValidationNotice.DidRegisterValidator,
      notice => receivedValidatorNotices.push(notice.getValidator().getMetadata().name))
    const registry = ValidationRegistry.getInstance()
    const metadata = new ValidatorMetadata({
      name: 'testPyStageValidatorForNotice',
      doc: 'A validator used to test DidRegisterValidator notice',
    })
    registry.registerStageValidator(metadata, () => [])
    expect(receivedValidatorNotices.length).toBe(1)
    expect(receivedValidatorNotices[0]).toBe('testPyStageValidatorForNotice')
    key.revoke()
  })

  it('test_NoticeOnRegisterValidatorSuite', () => {
    const receivedSuiteNotices: string[] = []
    const key = TfNotice.registerGlobally(UsdValidationNotice.DidRegisterValidatorSuite,
      notice => receivedSuiteNotices.push(notice.getValidatorSuite().getMetadata().name))
    const registry = ValidationRegistry.getInstance()
    const suiteMetadata = new ValidatorMetadata({
      name: 'testPyValidatorSuiteForNotice',
      doc: 'A validator suite used to test DidRegisterValidatorSuite notice',
      isSuite: true,
    })
    registry.registerValidatorSuite(suiteMetadata, [])
    expect(receivedSuiteNotices.length).toBe(1)
    expect(receivedSuiteNotices[0]).toBe('testPyValidatorSuiteForNotice')
    key.revoke()
  })

  // Run a script-registered validator through ValidationContext.
  it('test_PythonValidatorInContext', async () => {
    const registry = ValidationRegistry.getInstance()
    const metadata = new ValidatorMetadata({
      name: 'testPyRegister:ContextStageValidator',
      doc: 'Stage validator used for context test',
      keywords: ['testPyRegister'],
    })
    registry.registerStageValidator(metadata,
      stageError('ContextStageError', 'Context stage validator ran'))
    const validator = registry.getOrLoadValidatorByName('testPyRegister:ContextStageValidator')
    expect(validator).toBeDefined()
    const context = new ValidationContext([validator!])
    const stage = Stage.createNew()
    const errors = await context.validate(stage)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ContextStageError')
  })

  // A script validator that returns no errors.
  it('test_PythonValidatorReturnsEmpty', async () => {
    const registry = ValidationRegistry.getInstance()
    const metadata = new ValidatorMetadata({
      name: 'testPyRegister:NoOpStageValidator',
      doc: 'A Python stage validator that always passes',
      keywords: ['testPyRegister'],
    })
    registry.registerStageValidator(metadata, () => [])
    const validator = registry.getOrLoadValidatorByName('testPyRegister:NoOpStageValidator')
    const stage = Stage.createNew()
    const errors = await validator!.validate(stage)
    expect(errors.length).toBe(0)
  })

  it('test_RegisterLayerValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const metadata = new ValidatorMetadata({
      name: 'testPyRegister:LayerValidator',
      doc: 'A Python-implemented layer validator',
      keywords: ['testPyRegister'],
    })
    const calledWith: Layer[] = []
    const layerTask: ValidateLayerTaskFn = (layer) => {
      calledWith.push(layer)
      return [new ValidationError('LayerError', ValidationErrorType.Warn,
        [new ValidationErrorSite(layer, '/')], 'Python layer validator ran')]
    }
    registry.registerLayerValidator(metadata, layerTask)
    expect(registry.hasValidator('testPyRegister:LayerValidator')).toBe(true)
    const validator = registry.getOrLoadValidatorByName('testPyRegister:LayerValidator')
    expect(validator).toBeDefined()
    const layer = Layer.createAnonymous('.usda')
    const errors = await validator!.validate(layer)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('LayerError')
    expect(errors[0]!.getType()).toBe(ValidationErrorType.Warn)
    expect(calledWith.length).toBe(1)
  })

  // Register a layer validator using plugin metadata.
  it('test_RegisterPluginLayerValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const name = PLUGIN_NAME + ':PyPluginLayerValidator'
    const calledWith: Layer[] = []
    registry.registerPluginLayerValidator(name, (layer) => {
      calledWith.push(layer)
      return [new ValidationError('PluginLayerError', ValidationErrorType.Warn,
        [new ValidationErrorSite(layer, '/')], 'Plugin layer validator ran')]
    })
    expect(registry.hasValidator(name)).toBe(true)
    const validator = registry.getOrLoadValidatorByName(name)
    expect(validator).toBeDefined()
    const metadata = validator!.getMetadata()
    expect(metadata.doc).toBe('Layer validator registered from Python.')
    expect(metadata.getKeywords()).toContain('testPyPlugin')
    const layer = Layer.createAnonymous('.usda')
    const errors = await validator!.validate(layer)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('PluginLayerError')
    expect(calledWith.length).toBe(1)
  })

  // Register a prim validator using plugin metadata.
  it('test_RegisterPluginPrimValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const name = PLUGIN_NAME + ':PyPluginPrimValidator'
    registry.registerPluginPrimValidator(name, primError('PluginPrimError', 'Plugin prim validator ran on'))
    expect(registry.hasValidator(name)).toBe(true)
    const validator = registry.getOrLoadValidatorByName(name)
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestPrim')
    const errors = await validator!.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('PluginPrimError')
  })

  // Register a stage validator using plugin metadata.
  it('test_RegisterPluginStageValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const name = PLUGIN_NAME + ':PyPluginStageValidator'
    registry.registerPluginStageValidator(name, stageError('PluginStageError', 'Plugin stage validator ran'))
    expect(registry.hasValidator(name)).toBe(true)
    const validator = registry.getOrLoadValidatorByName(name)
    const stage = Stage.createNew()
    const errors = await validator!.validate(stage)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('PluginStageError')
  })

  // Register a validator suite using plugin metadata.
  it('test_RegisterPluginValidatorSuite', () => {
    const registry = ValidationRegistry.getInstance()
    const suiteName = PLUGIN_NAME + ':PyPluginSuite'
    const stageValidator = registry.getOrLoadValidatorByName(PLUGIN_NAME + ':PyPluginStageValidator')
    const primValidator = registry.getOrLoadValidatorByName(PLUGIN_NAME + ':PyPluginPrimValidator')
    expect(stageValidator).toBeDefined()
    expect(primValidator).toBeDefined()
    registry.registerPluginValidatorSuite(suiteName, [stageValidator, primValidator])
    expect(registry.hasValidatorSuite(suiteName)).toBe(true)
    const suite = registry.getOrLoadValidatorSuiteByName(suiteName)
    expect(suite).toBeDefined()
    const contained = suite!.getContainedValidators()
    expect(contained.length).toBe(2)
    expect(contained).toContain(stageValidator)
    expect(contained).toContain(primValidator)
  })

  it('test_RegisterPrimValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const metadata = new ValidatorMetadata({
      name: 'testPyRegister:PrimValidator',
      doc: 'A Python-implemented prim validator',
      keywords: ['testPyRegister'],
    })
    registry.registerPrimValidator(metadata, primError('PrimError', 'Python prim validator ran on'))
    expect(registry.hasValidator('testPyRegister:PrimValidator')).toBe(true)
    const validator = registry.getOrLoadValidatorByName('testPyRegister:PrimValidator')
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestPrim')
    const errors = await validator!.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('PrimError')
  })

  it('test_RegisterStageValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const metadata = new ValidatorMetadata({
      name: 'testPyRegister:StageValidator',
      doc: 'A Python-implemented stage validator',
      keywords: ['testPyRegister'],
    })
    registry.registerStageValidator(metadata, stageError('StageError', 'Python stage validator ran'))
    expect(registry.hasValidator('testPyRegister:StageValidator')).toBe(true)
    const validator = registry.getOrLoadValidatorByName('testPyRegister:StageValidator')
    const stage = Stage.createNew()
    const errors = await validator!.validate(stage)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('StageError')
  })

  it('test_RegisterValidatorRequiresCallableFunctions', () => {
    const registry = ValidationRegistry.getInstance()
    const notCallable = {} as never
    const layerMetadata = new ValidatorMetadata({
      name: 'testPyRegister:LayerValidatorNonCallable',
      doc: 'Layer validator with non-callable task function',
      keywords: ['testPyRegister'],
    })
    expect(() => registry.registerLayerValidator(layerMetadata, notCallable))
      .toThrow(new TypeError('layerTaskFn must be callable'))
    const stageMetadata = new ValidatorMetadata({
      name: 'testPyRegister:StageValidatorNonCallable',
      doc: 'Stage validator with non-callable task function',
      keywords: ['testPyRegister'],
    })
    expect(() => registry.registerStageValidator(stageMetadata, notCallable))
      .toThrow(new TypeError('stageTaskFn must be callable'))
    const primMetadata = new ValidatorMetadata({
      name: 'testPyRegister:PrimValidatorNonCallable',
      doc: 'Prim validator with non-callable task function',
      keywords: ['testPyRegister'],
    })
    expect(() => registry.registerPrimValidator(primMetadata, notCallable))
      .toThrow(new TypeError('primTaskFn must be callable'))
    expect(() => registry.registerPluginLayerValidator('bogus:doesntMatter', notCallable))
      .toThrow(new TypeError('layerTaskFn must be callable'))
    expect(() => registry.registerPluginStageValidator('bogus:doesntMatter', notCallable))
      .toThrow(new TypeError('stageTaskFn must be callable'))
    expect(() => registry.registerPluginPrimValidator('bogus:doesntMatter', notCallable))
      .toThrow(new TypeError('primTaskFn must be callable'))
  })

  it('test_RegisterValidatorSuite', () => {
    const registry = ValidationRegistry.getInstance()
    const stageValidator = registry.getOrLoadValidatorByName('testPyRegister:StageValidator')
    const primValidator = registry.getOrLoadValidatorByName('testPyRegister:PrimValidator')
    expect(stageValidator).toBeDefined()
    expect(primValidator).toBeDefined()
    const suiteMetadata = new ValidatorMetadata({
      name: 'testPyRegister:Suite',
      doc: 'A Python-registered validator suite',
      keywords: ['testPyRegister'],
      isSuite: true,
    })
    registry.registerValidatorSuite(suiteMetadata, [stageValidator, primValidator])
    expect(registry.hasValidatorSuite('testPyRegister:Suite')).toBe(true)
    const suite = registry.getOrLoadValidatorSuiteByName('testPyRegister:Suite')
    expect(suite).toBeDefined()
    const contained = suite!.getContainedValidators()
    expect(contained.length).toBe(2)
    expect(contained).toContain(stageValidator)
    expect(contained).toContain(primValidator)
  })
})
