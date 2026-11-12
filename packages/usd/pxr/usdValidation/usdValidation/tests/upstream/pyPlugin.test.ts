// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/registry.cpp,
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationPyPlugin.py
// Copyright 2024, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationPyPlugin.py.
//
// End-to-end test for a validator plugin loaded on demand:
// 1. plugInfo.json declares validator metadata.
// 2. PlugRegistry.RegisterPlugins() registers the plugin; the
//    ValidationRegistry parses its Validators metadata.
// 3. Loading the plugin imports its module.
// 4. The module's top-level code calls RegisterPluginStageValidator and
//    RegisterPluginLayerValidator.
// 5. The validators are returned and can be invoked.
//
// Adaptations:
// - The plugin (testUsdValidationPyPlugin/testPyValidatorPlugin) is an ES
//   module under fixtures/, registered from its plugInfo.json with Type
//   "library" and LibraryPath naming the module, in place of Type "python"
//   (the module's import is the analog of TfPyRunSimpleString("import ...")).
// - Upstream GetOrLoadValidatorByName loads the plugin synchronously
//   (registry.cpp:414, PlugPlugin::Load). PlugPlugin.Load() is synchronous
//   only for loaded plugins (decision D4, docs/openexec-x1.md), so the test
//   awaits the plugin's LoadAsync() where upstream's lookup loads it, as
//   testExecComputationRegistration.test.ts does.
// - unittest runs test methods in name order (test_LazyLoadLayerValidator's
//   comment relies on it), so the it()s are in that order here.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { ValidationRegistry } from '../../src/index.ts'

const PLUGIN_NAME = 'testPyValidatorPlugin'

// The plugin load GetOrLoadValidatorByName performs upstream (see above).
async function _loadPlugin(): Promise<void> {
  const plugin = PlugRegistry.GetInstance().GetPluginWithName(PLUGIN_NAME)
  expect(plugin).toBeTruthy()
  expect(await plugin!.loadAsync()).toBe(true)
}

// testUsdValidationPyPlugin.py:28-53 (setUpClass).
beforeAll(() => {
  const plugInfoUrl = new URL(`../fixtures/${PLUGIN_NAME}/plugInfo.json`, import.meta.url)
  PlugRegistry.GetInstance().RegisterPlugins(
    JSON.parse(readFileSync(plugInfoUrl, 'utf8')) as PlugInfo, undefined, { plugInfoUrl: plugInfoUrl.href })
  expect(PlugRegistry.GetInstance().GetPluginWithName(PLUGIN_NAME),
    `Plugin ${PLUGIN_NAME} not found after registering ${plugInfoUrl.href}`).toBeTruthy()
})

describe('TestUsdValidationPyPlugin', () => {
  // Plugin validators appear in keyword queries.
  it('test_DiscoverableByKeyword', () => {
    const registry = ValidationRegistry.getInstance()
    const metadatas = registry.getValidatorMetadataForKeyword('testPyValidatorPlugin')
    const names = metadatas.map(m => m.name)
    expect(names).toContain(PLUGIN_NAME + ':PyStageValidator')
    expect(names).toContain(PLUGIN_NAME + ':PyLayerValidator')
  })

  // Layer validator from the same plugin is also available.
  it('test_LazyLoadLayerValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    // The module registers both validators, so the layer validator is
    // available even though this test runs before test_LazyLoadStageValidator.
    await _loadPlugin()
    const validator = registry.getOrLoadValidatorByName(PLUGIN_NAME + ':PyLayerValidator')
    expect(validator).toBeDefined()
    const layer = Layer.createAnonymous('.usda')
    const errors = await validator!.validate(layer)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('PyPluginLayerError')
  })

  // GetOrLoadValidatorByName triggers plugin load and registration.
  it('test_LazyLoadStageValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    await _loadPlugin()
    const validator = registry.getOrLoadValidatorByName(PLUGIN_NAME + ':PyStageValidator')
    expect(validator).toBeDefined()
    const stage = Stage.createNew()
    const errors = await validator!.validate(stage)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('PyPluginStageError')
  })

  // Validator metadata from plugInfo.json is available before the plugin
  // module is imported.
  it('test_MetadataDiscoverableBeforeLoad', () => {
    const registry = ValidationRegistry.getInstance()
    const meta = registry.getValidatorMetadata(PLUGIN_NAME + ':PyStageValidator')
    expect(meta).toBeDefined()
    expect(meta!.doc).toBe('Stage validator implemented in a Python plugin.')
    expect(meta!.getKeywords()).toContain('testPyValidatorPlugin')
  })
})
