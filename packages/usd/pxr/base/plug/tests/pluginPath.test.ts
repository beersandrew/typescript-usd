// Ported from OpenUSD 26.11.1: pxr/base/plug/initConfig.cpp,
//  pxr/base/plug/registry.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Plugins on the plugin search path (PXR_PLUGINPATH_NAME): Plug_InitConfig
// (initConfig.cpp:64-122) reads the environment, PlugPlugin::_RegisterAllPlugins
// (registry.cpp:311-338) registers the plugInfo documents found there on the
// first registry query, and UsdStage's global variant fallbacks are then
// seeded from their UsdVariantFallbacks (stage.cpp, Usd_GetGlobalVariantFallbacks).
// This is how usdview and usdrecord receive
// plugInfo.json variant fallbacks.
//
// Expected values from the OpenUSD 26.11.1 reference build
// (FIXTURES.md) with PXR_PLUGINPATH_NAME=<testenv/pluginPath>:
//   Plug.Registry().GetAllPlugins() names: testPlugPathIncluded, testPlugPathVariantFallbacks
//   Usd.Stage.GetGlobalVariantFallbacks() == {'displayColor': ['green'], 'wrap': ['checks']}
//   testAPI_var.usda /Sarah: displayColor selection 'green', color (0, 1, 0)
import { describe, expect, it, vi } from 'vitest'

// The environment must be set before the registry's first query, which module
// imports can make: hoisted above the imports.
const fixtureDirectory = vi.hoisted(() => {
  const directory = decodeURIComponent(new URL('./testenv/pluginPath', import.meta.url).pathname)
  process.env.PXR_PLUGINPATH_NAME = directory   // a directory, without a trailing '/'
  return directory
})

import { Registry as PlugRegistry } from '../src/index.ts'
import { Stage } from 'typescript-usd/usd'

describe('the plugin search path (PXR_PLUGINPATH_NAME)', () => {
  it('registers the plugInfo documents on the path and their Includes', () => {
    const names = PlugRegistry.GetInstance().getAllPlugins().map(plugin => plugin.getName())
      .filter(name => name.startsWith('testPlugPath')).sort()
    expect(names).toEqual(['testPlugPathIncluded', 'testPlugPathVariantFallbacks'])
  })

  it('seeds the global variant fallbacks from their UsdVariantFallbacks', async () => {
    expect(Stage.getGlobalVariantFallbacks()).toEqual({ displayColor: ['green'], wrap: ['checks'] })
    const stage = (await Stage.open(`${fixtureDirectory}/testAPI_var.usda`))!
    expect(stage.getVariantSets('/Sarah').getVariantSet('displayColor').getVariantSelection()).toBe('green')
    expect(stage.getPrim('/Sarah')?.getAttr('color')?.getValue()).toEqual([0, 1, 0])
  })
})
