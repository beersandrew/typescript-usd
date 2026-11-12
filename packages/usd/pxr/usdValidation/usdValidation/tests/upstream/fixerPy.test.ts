// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationFixerPy.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationFixerPy.py, with
// its test plugin testUsdValidationFixerPy/testValidationFixerPyPlugin/
// plugInfo.json.
//
// Tests for validation fixers implemented in script. Exercises:
// 1. Creating ValidationFixer objects with callable fixerImplFn and
//    canApplyFn.
// 2. Passing fixers to explicit validator registration methods.
// 3. Retrieving fixers from validators and errors.
// 4. Invoking CanApplyFix and ApplyFix with script-backed fixers.
//
// mock.Mock is vi.fn(). ApplyFix resolves asynchronously here
// (PLATFORM-DIVERGENCE(usdValidation-fixer-async-save), fixer.ts), so its
// results are awaited. An exception a fixer function raises propagates, as
// the Python binding restores it at the boundary.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Layer } from 'typescript-usd/sdf'
import { EditTarget as UsdEditTarget, Stage, type Prim } from 'typescript-usd/usd'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationFixer, ValidationRegistry,
  ValidatorMetadata,
} from '../../src/index.ts'

const PLUGIN_NAME = 'testValidationFixerPyPlugin'

// testUsdValidationFixerPy/testValidationFixerPyPlugin/plugInfo.json.
const fixerPyPlugInfo = {
  Plugins: [{
    Type: 'resource',
    Name: 'testValidationFixerPyPlugin',
    Info: {
      Validators: {
        PyPluginLayerValidatorWithFixer: {
          doc: 'Layer validator with Python fixer.', keywords: ['testPyFixer'], isSuite: false,
        },
        PyPluginStageValidatorWithFixer: {
          doc: 'Stage validator with Python fixer.', keywords: ['testPyFixer'], isSuite: false,
        },
        PyPluginPrimValidatorWithFixer: {
          doc: 'Prim validator with Python fixer.', keywords: ['testPyFixer'], isSuite: false,
        },
      },
    },
  }],
}

// testUsdValidationFixerPy.py:28-47 (setUpClass).
beforeAll(() => {
  const plugins = PlugRegistry.GetInstance().RegisterPlugins(fixerPyPlugInfo)
  expect(plugins.length).toBe(1)
  expect(plugins[0]!.getName()).toBe(PLUGIN_NAME)
})

// testUsdValidationFixerPy.py:49-87.
const _layerTask = (layer: Layer): ValidationError[] => [new ValidationError('LayerFixerError',
  ValidationErrorType.Warn, [new ValidationErrorSite(layer, '/')], 'Fixable layer error')]

const _stageTask = (stage: Stage): ValidationError[] => [new ValidationError('StageFixerError',
  ValidationErrorType.Error, [new ValidationErrorSite(stage, '/')], 'Fixable stage error')]

const _primTask = (prim: Prim): ValidationError[] => {
  if (prim.isPseudoRoot()) return []
  return [new ValidationError('PrimFixerError', ValidationErrorType.Error,
    [new ValidationErrorSite(prim.getStage(), prim.path)], `Fixable prim error on ${prim.path}`)]
}

const _implFn = (): boolean => true
const _canApplyFn = (): boolean => true

describe('TestUsdValidationFixerPy', () => {
  // A fixer can be constructed with name, description, and callables.
  it('test_BasicConstruction', () => {
    const fixer = new ValidationFixer('testFixer', 'A test fixer', _implFn, _canApplyFn)
    expect(fixer.getName()).toBe('testFixer')
    expect(fixer.getDescription()).toBe('A test fixer')
    expect(fixer.getErrorName()).toBe('')
    expect(fixer.getKeywords()).toEqual([])
  })

  // A fixer can be constructed with optional keywords and errorName.
  it('test_ConstructionWithKeywordsAndErrorName', () => {
    const fixer = new ValidationFixer('testFixer2', 'Another test fixer', _implFn, _canApplyFn,
      ['studio', 'lighting'], 'SomeError')
    expect(fixer.getName()).toBe('testFixer2')
    expect(fixer.getErrorName()).toBe('SomeError')
    expect(fixer.getKeywords()).toContain('studio')
    expect(fixer.getKeywords()).toContain('lighting')
    expect(fixer.hasKeyword('studio')).toBe(true)
    expect(fixer.hasKeyword('fx')).toBe(false)
    expect(fixer.isAssociatedWithErrorName('SomeError')).toBe(true)
  })

  // A fixer requires callable fixerImplFn and canApplyFn.
  it('test_ConstructionRequiresCallableFunctions', () => {
    const notCallable = {} as never
    expect(() => new ValidationFixer('badImplFnFixer', 'Fixer with non-callable fixerImplFn',
      notCallable, _canApplyFn)).toThrow(new TypeError('fixerImplFn and canApplyFn must be callable'))
    expect(() => new ValidationFixer('badCanApplyFnFixer', 'Fixer with non-callable canApplyFn',
      _implFn, notCallable)).toThrow(new TypeError('fixerImplFn and canApplyFn must be callable'))
  })

  // Exceptions from canApplyFn are restored at the boundary.
  it('test_ConstructionCanApplyRaises', () => {
    class AttributeError extends Error {}
    const canApplyFn = vi.fn(() => { throw new AttributeError() })
    const fixer = new ValidationFixer('canApplyRaisesFixer', 'Fixer with raising canApplyFn',
      _implFn, canApplyFn)
    const layer = Layer.createAnonymous('.usda')
    const error = _layerTask(layer)[0]!
    const editTarget = new UsdEditTarget(layer)
    expect(() => fixer.canApplyFix(error, editTarget)).toThrow(AttributeError)
  })

  // Exceptions from fixerImplFn are restored at the boundary.
  it('test_ConstructionFixerImplRaises', async () => {
    class AttributeError extends Error {}
    const implFn = vi.fn(() => { throw new AttributeError() })
    const fixer = new ValidationFixer('fixerImplRaisesFixer', 'Fixer with raising fixerImplFn',
      implFn, _canApplyFn)
    const layer = Layer.createAnonymous('.usda')
    const error = _layerTask(layer)[0]!
    const editTarget = new UsdEditTarget(layer)
    await expect(fixer.applyFix(error, editTarget)).rejects.toThrow(AttributeError)
  })

  // Validator and error fixer lookup APIs return matching fixers.
  it('test_FixerLookupFromValidatorAndError', async () => {
    const registry = ValidationRegistry.getInstance()
    const fixerA = new ValidationFixer('fixerA', 'First fixer', _implFn, _canApplyFn, ['teamA'])
    const fixerB = new ValidationFixer('fixerB', 'Second fixer', _implFn, _canApplyFn, ['teamB'],
      'LayerFixerError')
    const metadata = new ValidatorMetadata({
      name: 'testPyFixer:MultiFixerValidator',
      doc: 'Validator with multiple fixers',
      keywords: ['testPyFixer'],
    })
    registry.registerLayerValidator(metadata, _layerTask, [fixerA, fixerB])
    const validator = registry.getOrLoadValidatorByName('testPyFixer:MultiFixerValidator')!
    let fixers = validator.getFixers()
    expect(fixers.length).toBe(2)
    const found = validator.getFixerByName('fixerA')
    expect(found).toBeDefined()
    expect(found!.getName()).toBe('fixerA')
    const byKeyword = validator.getFixersByKeywords(['teamA'])
    expect(byKeyword.length).toBe(1)
    expect(byKeyword[0]!.getName()).toBe('fixerA')
    const byError = validator.getFixersByErrorName('LayerFixerError')
    expect(byError.length).toBe(2)
    const layer = Layer.createAnonymous('.usda')
    const errors = await validator.validate(layer)
    expect(errors.length).toBe(1)
    fixers = errors[0]!.getFixersByErrorName()
    expect(fixers.length).toBe(2)
  })

  // ------------------------------------------------------------------
  // Manual registration tests
  // ------------------------------------------------------------------

  // Register a layer validator with a fixer.
  it('test_LayerValidatorWithFixer', async () => {
    const registry = ValidationRegistry.getInstance()
    const canApplyFn = vi.fn(() => true)
    const implFn = vi.fn(() => false)
    const fixer = new ValidationFixer('layerFixer', 'Fixes layer errors', implFn, canApplyFn, [],
      'LayerFixerError')
    const metadata = new ValidatorMetadata({
      name: 'testPyFixer:LayerValidatorWithFixer',
      doc: 'Layer validator with a Python fixer',
      keywords: ['testPyFixer'],
    })
    registry.registerLayerValidator(metadata, _layerTask, [fixer])
    const validator = registry.getOrLoadValidatorByName('testPyFixer:LayerValidatorWithFixer')
    expect(validator).toBeDefined()
    const fixers = validator!.getFixers()
    expect(fixers.length).toBe(1)
    expect(fixers[0]!.getName()).toBe('layerFixer')
    const layer = Layer.createAnonymous('.usda')
    const errors = await validator!.validate(layer)
    expect(errors.length).toBe(1)
    const editTarget = new UsdEditTarget(layer)
    expect(fixers[0]!.canApplyFix(errors[0]!, editTarget)).toBe(true)
    expect(await fixers[0]!.applyFix(errors[0]!, editTarget)).toBe(false)
    expect(canApplyFn).toHaveBeenCalledOnce()
    expect(implFn).toHaveBeenCalledOnce()
  })

  // Register a stage validator with a fixer.
  it('test_StageValidatorWithFixer', async () => {
    const registry = ValidationRegistry.getInstance()
    const canApplyFn = vi.fn(() => true)
    const implFn = vi.fn(() => false)
    const fixer = new ValidationFixer('stageFixer', 'Fixes stage errors', implFn, canApplyFn)
    const metadata = new ValidatorMetadata({
      name: 'testPyFixer:StageValidatorWithFixer',
      doc: 'Stage validator with a Python fixer',
      keywords: ['testPyFixer'],
    })
    registry.registerStageValidator(metadata, _stageTask, [fixer])
    const validator = registry.getOrLoadValidatorByName('testPyFixer:StageValidatorWithFixer')
    const fixers = validator!.getFixers()
    expect(fixers.length).toBe(1)
    expect(fixers[0]!.getName()).toBe('stageFixer')
    const stage = Stage.createNew()
    const errors = await validator!.validate(stage)
    expect(errors.length).toBe(1)
    const editTarget = new UsdEditTarget(stage.getRootLayer())
    expect(fixers[0]!.canApplyFix(errors[0]!, editTarget)).toBe(true)
    expect(await fixers[0]!.applyFix(errors[0]!, editTarget)).toBe(false)
    expect(canApplyFn).toHaveBeenCalledOnce()
    expect(implFn).toHaveBeenCalledOnce()
  })

  // Register a prim validator with a fixer.
  it('test_PrimValidatorWithFixer', async () => {
    const registry = ValidationRegistry.getInstance()
    const canApplyFn = vi.fn(() => true)
    const implFn = vi.fn(() => false)
    const fixer = new ValidationFixer('primFixer', 'Fixes prim errors', implFn, canApplyFn)
    const metadata = new ValidatorMetadata({
      name: 'testPyFixer:PrimValidatorWithFixer',
      doc: 'Prim validator with a Python fixer',
      keywords: ['testPyFixer'],
    })
    registry.registerPrimValidator(metadata, _primTask, [fixer])
    const validator = registry.getOrLoadValidatorByName('testPyFixer:PrimValidatorWithFixer')
    const fixers = validator!.getFixers()
    expect(fixers.length).toBe(1)
    expect(fixers[0]!.getName()).toBe('primFixer')
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestPrim')
    const errors = await validator!.validate(prim)
    expect(errors.length).toBe(1)
    const editTarget = new UsdEditTarget(stage.getRootLayer())
    expect(fixers[0]!.canApplyFix(errors[0]!, editTarget)).toBe(true)
    expect(await fixers[0]!.applyFix(errors[0]!, editTarget)).toBe(false)
    expect(canApplyFn).toHaveBeenCalledOnce()
    expect(implFn).toHaveBeenCalledOnce()
  })

  // ------------------------------------------------------------------
  // Plugin registration tests
  // ------------------------------------------------------------------

  // Register a plugin layer validator with a fixer.
  it('test_RegisterPluginLayerValidatorWithFixer', async () => {
    const registry = ValidationRegistry.getInstance()
    const name = PLUGIN_NAME + ':PyPluginLayerValidatorWithFixer'
    const canApplyFn = vi.fn(() => true)
    const implFn = vi.fn(() => false)
    const fixer = new ValidationFixer('pluginLayerFixer', 'Plugin layer fixer', implFn, canApplyFn)
    registry.registerPluginLayerValidator(name, _layerTask, [fixer])
    const validator = registry.getOrLoadValidatorByName(name)
    expect(validator).toBeDefined()
    const fixers = validator!.getFixers()
    expect(fixers.length).toBe(1)
    expect(fixers[0]!.getName()).toBe('pluginLayerFixer')
    const layer = Layer.createAnonymous('.usda')
    const errors = await validator!.validate(layer)
    expect(errors.length).toBe(1)
    const editTarget = new UsdEditTarget(layer)
    expect(fixers[0]!.canApplyFix(errors[0]!, editTarget)).toBe(true)
    expect(await fixers[0]!.applyFix(errors[0]!, editTarget)).toBe(false)
    expect(canApplyFn).toHaveBeenCalledOnce()
    expect(implFn).toHaveBeenCalledOnce()
  })

  // Register a plugin stage validator with a fixer.
  it('test_RegisterPluginStageValidatorWithFixer', async () => {
    const registry = ValidationRegistry.getInstance()
    const name = PLUGIN_NAME + ':PyPluginStageValidatorWithFixer'
    const canApplyFn = vi.fn(() => true)
    const implFn = vi.fn(() => false)
    const fixer = new ValidationFixer('pluginStageFixer', 'Plugin stage fixer', implFn, canApplyFn)
    registry.registerPluginStageValidator(name, _stageTask, [fixer])
    const validator = registry.getOrLoadValidatorByName(name)
    expect(validator).toBeDefined()
    const fixers = validator!.getFixers()
    expect(fixers.length).toBe(1)
    expect(fixers[0]!.getName()).toBe('pluginStageFixer')
    const stage = Stage.createNew()
    const errors = await validator!.validate(stage)
    expect(errors.length).toBe(1)
    const editTarget = new UsdEditTarget(stage.getRootLayer())
    expect(fixers[0]!.canApplyFix(errors[0]!, editTarget)).toBe(true)
    expect(await fixers[0]!.applyFix(errors[0]!, editTarget)).toBe(false)
    expect(canApplyFn).toHaveBeenCalledOnce()
    expect(implFn).toHaveBeenCalledOnce()
  })

  // Register a plugin prim validator with a fixer.
  it('test_RegisterPluginPrimValidatorWithFixer', async () => {
    const registry = ValidationRegistry.getInstance()
    const name = PLUGIN_NAME + ':PyPluginPrimValidatorWithFixer'
    const canApplyFn = vi.fn(() => true)
    const implFn = vi.fn(() => false)
    const fixer = new ValidationFixer('pluginPrimFixer', 'Plugin prim fixer', implFn, canApplyFn)
    registry.registerPluginPrimValidator(name, _primTask, [fixer])
    const validator = registry.getOrLoadValidatorByName(name)
    expect(validator).toBeDefined()
    const fixers = validator!.getFixers()
    expect(fixers.length).toBe(1)
    expect(fixers[0]!.getName()).toBe('pluginPrimFixer')
    const stage = Stage.createNew()
    const prim = stage.definePrim('/PluginPrim')
    const errors = await validator!.validate(prim)
    expect(errors.length).toBe(1)
    const editTarget = new UsdEditTarget(stage.getRootLayer())
    expect(fixers[0]!.canApplyFix(errors[0]!, editTarget)).toBe(true)
    expect(await fixers[0]!.applyFix(errors[0]!, editTarget)).toBe(false)
    expect(canApplyFn).toHaveBeenCalledOnce()
    expect(implFn).toHaveBeenCalledOnce()
  })
})
