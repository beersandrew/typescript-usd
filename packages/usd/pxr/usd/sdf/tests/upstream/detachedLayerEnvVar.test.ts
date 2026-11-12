// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp,
//  pxr/usd/sdf/testenv/testSdfDetachedLayer.py
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfDetachedLayer.py (OpenUSD 26.11.1)
// for its environment-variable registrations in pxr/usd/sdf/CMakeLists.txt:
//   testSdfDetachedLayerEnvVar1  SDF_LAYER_INCLUDE_IN_MEMORY=*,
//                                SDF_LAYER_EXCLUDE_IN_MEMORY=foo,bar (:546-552)
//   testSdfDetachedLayerEnvVar2  SDF_LAYER_INCLUDE_IN_MEMORY=foo,bar,
//                                SDF_LAYER_EXCLUDE_IN_MEMORY=baz,garply (:554-560)
// (testSdfDetachedLayer, without an environment, is detachedLayer.test.ts.)
//
// layer.cpp:82-91 reads SDF_LAYER_INCLUDE_DETACHED / SDF_LAYER_EXCLUDE_DETACHED,
// not the *_IN_MEMORY names these registrations set, so under them
// DetachedLayerRulesEnvVarIsSet() (testSdfDetachedLayer.py:12-14) is false:
// the initial rules are empty, test_DetachedLayerRules runs, and
// test_InitializingRulesWithEnvVar is skipped. Both registrations are ported
// as that. test_SettingRulesAffectsNewLayers / OpenLayers run unchanged by the
// environment and are ported in detachedLayer.test.ts.
//
// test_InitializingRulesWithEnvVar (:118-145) is also run with the variables
// layer.cpp reads, set to each registration's values, which is the case that
// test is written for. The rules are static data initialized on first use
// (layer.cpp:178-196), so each case loads a fresh module after setting the
// environment (a slow import, hence the longer timeouts).
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function freshSdf(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  return import('typescript-usd/sdf')
}

const detachedLayerRulesEnvVarIsSet = () =>
  process.env.SDF_LAYER_INCLUDE_DETACHED !== undefined ||
  process.env.SDF_LAYER_EXCLUDE_DETACHED !== undefined

// test_DetachedLayerRules (testSdfDetachedLayer.py:24-52).
function testDetachedLayerRules(Layer: Awaited<ReturnType<typeof freshSdf>>['Layer']) {
  const rules = new Layer.DetachedLayerRules()
  expect(rules.isIncluded('some_layer.usda')).toBe(false)
  expect(rules.isIncluded('some_layer_2.usda')).toBe(false)
  expect(rules.isIncluded('other_layer.usda')).toBe(false)

  rules.include(['some_layer'])
  expect(rules.includedAll()).toBe(false)
  expect(rules.getIncluded()).toEqual(['some_layer'])
  expect(rules.getExcluded()).toEqual([])
  expect(rules.isIncluded('some_layer.usda')).toBe(true)
  expect(rules.isIncluded('some_layer_2.usda')).toBe(true)
  expect(rules.isIncluded('other_layer.usda')).toBe(false)

  rules.exclude(['some_layer_2'])
  expect(rules.includedAll()).toBe(false)
  expect(rules.getIncluded()).toEqual(['some_layer'])
  expect(rules.getExcluded()).toEqual(['some_layer_2'])
  expect(rules.isIncluded('some_layer.usda')).toBe(true)
  expect(rules.isIncluded('some_layer_2.usda')).toBe(false)
  expect(rules.isIncluded('other_layer.usda')).toBe(false)

  rules.includeAll()
  expect(rules.includedAll()).toBe(true)
  expect(rules.getIncluded()).toEqual([])
  expect(rules.getExcluded()).toEqual(['some_layer_2'])
  expect(rules.isIncluded('some_layer.usda')).toBe(true)
  expect(rules.isIncluded('some_layer_2.usda')).toBe(false)
  expect(rules.isIncluded('other_layer.usda')).toBe(true)
}

// test_InitializingRulesWithEnvVar (testSdfDetachedLayer.py:118-145).
function testInitializingRulesWithEnvVar(Layer: Awaited<ReturnType<typeof freshSdf>>['Layer']) {
  const includedEnv = process.env.SDF_LAYER_INCLUDE_DETACHED
  const included = includedEnv ? includedEnv.split(',') : []
  const excludedEnv = process.env.SDF_LAYER_EXCLUDE_DETACHED
  const excluded = excludedEnv ? excludedEnv.split(',') : []

  const rules = Layer.getDetachedLayerRules()
  if (included.includes('*')) {
    expect(rules.includedAll()).toBe(true)
    expect(rules.getIncluded()).toEqual([])
  } else {
    expect(new Set(rules.getIncluded())).toEqual(new Set(included))
  }
  expect(new Set(rules.getExcluded())).toEqual(new Set(excluded))
}

const registrations: [string, Record<string, string>][] = [
  ['testSdfDetachedLayerEnvVar1', { INCLUDE: '*', EXCLUDE: 'foo,bar' }],
  ['testSdfDetachedLayerEnvVar2', { INCLUDE: 'foo,bar', EXCLUDE: 'baz,garply' }],
]

for (const [registration, { INCLUDE, EXCLUDE }] of registrations) {
  describe(registration, () => {
    const registeredEnv = {
      SDF_LAYER_INCLUDE_IN_MEMORY: INCLUDE!, SDF_LAYER_EXCLUDE_IN_MEMORY: EXCLUDE!,
    }

    it('starts with empty detached layer rules (the *_IN_MEMORY names are not read)', async () => {
      const { Layer } = await freshSdf(registeredEnv)
      expect(detachedLayerRulesEnvVarIsSet()).toBe(false)
      const rules = Layer.getDetachedLayerRules()
      expect(rules.includedAll()).toBe(false)
      expect(rules.getIncluded()).toEqual([])
      expect(rules.getExcluded()).toEqual([])
    }, 60_000)

    it('test_DetachedLayerRules', async () => {
      const { Layer } = await freshSdf(registeredEnv)
      expect(detachedLayerRulesEnvVarIsSet()).toBe(false)
      testDetachedLayerRules(Layer)
    }, 60_000)

    it('test_InitializingRulesWithEnvVar with SDF_LAYER_{INCLUDE,EXCLUDE}_DETACHED', async () => {
      const { Layer } = await freshSdf({
        SDF_LAYER_INCLUDE_DETACHED: INCLUDE!, SDF_LAYER_EXCLUDE_DETACHED: EXCLUDE!,
      })
      expect(detachedLayerRulesEnvVarIsSet()).toBe(true)
      testInitializingRulesWithEnvVar(Layer)
    }, 60_000)
  })
}
