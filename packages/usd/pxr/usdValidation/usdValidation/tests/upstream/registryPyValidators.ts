// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPy.cpp,
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPy.py,
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPyRegister.py
// Copyright 2024, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationRegistryPy.cpp with
// TestUsdValidationRegistryPy_plugInfo.json: the test plugin
// testUsdValidationRegistryPy.py and testUsdValidationRegistryPyRegister.py
// register.
//
// The test plugin library is this module, as in contextValidators.ts: its
// plugInfo is registered as part of this build (no plugInfo URL, so nothing
// to load), and addRegistryPyRegistryFunction() adds its
// TF_REGISTRY_FUNCTION(UsdValidationRegistry). The registry function's
// TF_AXIOM(m.IsClean()) checks are recorded in registrationChecks.
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { TfErrorMark, TfRegistryManager } from 'typescript-usd/tf'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry, ValidatorMetadata,
} from '../../src/index.ts'

// TestUsdValidationRegistryPy_plugInfo.json.
export const registryPyPlugInfo = {
  Plugins: [{
    Type: 'library',
    Name: 'testValidationRegistryPyPlugin',
    Root: '@TEST_PLUG_INFO_ROOT@',
    ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
    LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
    Info: {
      Validators: {
        PyPluginLayerValidator: {
          doc: 'Layer validator registered from Python.', keywords: ['testPyPlugin'], isSuite: false,
        },
        PyPluginStageValidator: {
          doc: 'Stage validator registered from Python.', keywords: ['testPyPlugin'], isSuite: false,
        },
        PyPluginPrimValidator: {
          doc: 'Prim validator registered from Python.', keywords: ['testPyPlugin'], isSuite: false,
        },
        PyPluginSuite: {
          doc: 'Validator suite registered from Python.', keywords: ['testPyPlugin'], isSuite: true,
        },
      },
    },
  }],
}

/** PlugRegistry::RegisterPlugins of the test plugin; the registered plugins. */
export function registerRegistryPyPlugin(): string[] {
  return PlugRegistry.GetInstance().RegisterPlugins(registryPyPlugInfo).map(plugin => plugin.getName())
}

export const registrationChecks: [string, boolean][] = []

/** testUsdValidationRegistryPy.cpp:19-80 (TF_REGISTRY_FUNCTION). */
export function addRegistryPyRegistryFunction(): void {
  TfRegistryManager.add(ValidationRegistry, () => {
    const registry = ValidationRegistry.getInstance()
    {
      // Register the validator
      const m = new TfErrorMark()
      const metadata = new ValidatorMetadata({
        name: 'TestValidator1',
        pluginPtr: null,
        keywords: ['IncludedInAll', 'SomeKeyword1'],
        doc: 'TestValidator1 for keywords metadata parsing',
        schemaTypes: [],
      })
      registry.registerStageValidator(metadata, (usdStage) => [new ValidationError(
        'TestValidator1', ValidationErrorType.Error, [new ValidationErrorSite(usdStage, '/')],
        'This is an error on the stage')])
      registrationChecks.push(['TestValidator1', m.isClean()])
    }
    {
      // Register the validator
      const m = new TfErrorMark()
      const metadata = new ValidatorMetadata({
        name: 'TestValidator2',
        pluginPtr: null,
        keywords: ['IncludedInAll'],
        doc: 'TestValidator2 for schemaType metadata parsing',
        schemaTypes: ['SomePrimType', 'SomeAPISchema'],
      })
      registry.registerPrimValidator(metadata, () => [])
      registrationChecks.push(['TestValidator2', m.isClean()])
    }
    {
      const containedValidators = registry.getOrLoadValidatorsByName(['TestValidator1', 'TestValidator2'])
      const m = new TfErrorMark()
      const metadata = new ValidatorMetadata({
        name: 'TestValidatorSuite',
        pluginPtr: null,
        keywords: ['IncludedInAll', 'SuiteValidator'],
        doc: 'Suite of TestValidator1 and TestValidator2',
        schemaTypes: [],
        isTimeDependent: false,
        isSuite: true,
      })
      registry.registerValidatorSuite(metadata, containedValidators)
      registrationChecks.push(['TestValidatorSuite', m.isClean()])
    }
  })
}
