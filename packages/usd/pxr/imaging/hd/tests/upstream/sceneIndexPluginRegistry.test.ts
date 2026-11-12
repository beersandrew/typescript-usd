// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdSceneIndexPluginRegistry.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of testHdSceneIndexPluginRegistry.cpp (pxr/imaging/hd/testenv).
//
// The C++ test discovers the 10 test plugins from coffee/omelette/clean
// plugInfo.json files via PlugRegistry + TfType, then registers each with an
// (insertionPhase, insertionOrder) via the TF_REGISTRY_FUNCTION block and
// asserts LoadAndGetSceneIndexPluginIds() returns them in the sorted order, for
// each of the three PluginOrderingPolicy values.
//
// The test's plugInfo.json files (fixtures/testHdSceneIndexPluginRegistry,
// copied from the testenv) are registered with PlugRegistry as the test's
// PXR_PLUGINPATH_NAME registers them upstream.

import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach } from 'vitest'
import { MakeTokens as TfMakeTokens, TfRegistryManager } from 'typescript-usd/tf'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import {
  HdSceneIndexPluginRegistry,
  HdSceneIndexPluginRegistryTokens,
  InsertionOrder,
  PluginOrderingPolicy,
  type InsertionPhase,
} from '../../src/sceneIndexPluginRegistry.ts'
import { HdSceneIndexPlugin } from '../../src/sceneIndexPlugin.ts'
import type { HdContainerDataSource } from '../../src/dataSource.ts'
import type { HdSceneIndexBase } from '../../src/sceneIndex.ts'

for (const name of ['coffee', 'omelette', 'clean']) {
  const text = readFileSync(
    new URL(`./fixtures/testHdSceneIndexPluginRegistry/${name}/plugInfo.json`, import.meta.url), 'utf8')
  // '#' starts a comment line (plug/info.cpp:150-170).
  PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(
    text.split('\n').map(line => /^[ \t]*#/.test(line) ? '' : line).join('\n')) as PlugInfo)
}

// Mirrors the test's _testTokens.
const _testTokens = TfMakeTokens({
  TestHdSip_GrindBeans: 'TestHdSip_GrindBeans',
  TestHdSip_BoilWater: 'TestHdSip_BoilWater',
  TestHdSip_PourOver: 'TestHdSip_PourOver',
  TestHdSip_DrinkCoffee: 'TestHdSip_DrinkCoffee',

  TestHdSip_BreakEggs: 'TestHdSip_BreakEggs',
  TestHdSip_CutVeggies: 'TestHdSip_CutVeggies',
  TestHdSip_HeatPan: 'TestHdSip_HeatPan',
  TestHdSip_MakeOmelette: 'TestHdSip_MakeOmelette',
  TestHdSip_EatOmelette: 'TestHdSip_EatOmelette',

  TestHdSip_TidyUp: 'TestHdSip_TidyUp',
})

const prepPhase: InsertionPhase = 0
const makePhase: InsertionPhase = 2
const enjoyPhase: InsertionPhase = 4
const tidyUpPhase: InsertionPhase = 8

const orderAtStart = InsertionOrder.InsertionOrderAtStart
const orderAtEnd = InsertionOrder.InsertionOrderAtEnd

type _TokenPhaseOrder = [string, InsertionPhase, InsertionOrder]

// The idAndPhases table, exactly as registered in the .cpp's
// TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
const idAndPhases: _TokenPhaseOrder[] = [
  // "coffee" plugins
  [_testTokens.TestHdSip_GrindBeans, prepPhase, orderAtStart],
  [_testTokens.TestHdSip_BoilWater, prepPhase, orderAtStart],
  [_testTokens.TestHdSip_PourOver, makePhase, orderAtStart],
  [_testTokens.TestHdSip_DrinkCoffee, enjoyPhase, orderAtStart],

  // "omelette" plugins
  [_testTokens.TestHdSip_BreakEggs, prepPhase, orderAtStart],
  [_testTokens.TestHdSip_CutVeggies, prepPhase, orderAtStart],
  // HeatPan in the "make" phase so we don't overheat while prepping.
  [_testTokens.TestHdSip_HeatPan, makePhase, orderAtStart],
  // MakeOmelette needs to be after HeatPan.
  [_testTokens.TestHdSip_MakeOmelette, makePhase, orderAtEnd],
  [_testTokens.TestHdSip_EatOmelette, enjoyPhase, orderAtStart],

  // "clean" plugins
  [_testTokens.TestHdSip_TidyUp, tidyUpPhase, orderAtEnd],
]

// expectedPluginOrder from the .cpp.
const expectedPluginOrder: string[] = [
  // Plugins with the same (phase, order) are sorted lexicographically.
  // "prep" phase plugins:
  _testTokens.TestHdSip_BoilWater,
  _testTokens.TestHdSip_BreakEggs,
  _testTokens.TestHdSip_CutVeggies,
  _testTokens.TestHdSip_GrindBeans,

  // "make" phase plugins:
  _testTokens.TestHdSip_HeatPan,
  _testTokens.TestHdSip_PourOver,
  _testTokens.TestHdSip_MakeOmelette,

  // "enjoy" phase plugins:
  _testTokens.TestHdSip_DrinkCoffee,
  _testTokens.TestHdSip_EatOmelette,

  // "tidy up" phase plugins:
  _testTokens.TestHdSip_TidyUp,
]

/** testHdSceneIndexPluginRegistry.cpp:40-55 */
class _TestBaseSceneIndexPlugin extends HdSceneIndexPlugin {
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    // This test doesn't exercise the actual scene index creation, so just
    // return the input scene.
    return inputScene
  }
}

// TF_REGISTRY_FUNCTION(TfType): HdSceneIndexPluginRegistry::Define<T>() of
// each test plugin class (testHdSceneIndexPluginRegistry.cpp:57-84).
for (const [id] of idAndPhases) {
  HdSceneIndexPluginRegistry.define(id, class extends _TestBaseSceneIndexPlugin {})
}

// TF_REGISTRY_FUNCTION(HdSceneIndexPlugin): register plugins with
// insertion/phase based ordering.
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  for (const [id, phase, order] of idAndPhases) {
    HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
      HdSceneIndexPluginRegistryTokens.allRenderers,
      id,
      null,
      phase,
      order,
    )
  }
})

describe('HdSceneIndexPluginRegistry', () => {
  beforeEach(() => {
    // Fresh singleton per assertion so registrations don't accrete.
    HdSceneIndexPluginRegistry._resetInstance()
  })

  // _TestValidOrdering(policy), run for every PluginOrderingPolicy value.
  const policies: [string, PluginOrderingPolicy][] = [
    ['CppRegistrationOnly', PluginOrderingPolicy.CppRegistrationOnly],
    ['JsonMetadataOnly', PluginOrderingPolicy.JsonMetadataOnly],
    ['Hybrid', PluginOrderingPolicy.Hybrid],
  ]

  for (const [name, policy] of policies) {
    it(`orders plugins by (phase, order, id) with policy '${name}'`, () => {
      const registry = HdSceneIndexPluginRegistry.GetInstance()
      registry.setPluginOrderingPolicy(policy)

      const pluginIds = registry.loadAndGetSceneIndexPluginIds(
        HdSceneIndexPluginRegistryTokens.allRenderers,
        '' /* empty app name */,
      )

      expect(pluginIds).toEqual(expectedPluginOrder)
    })
  }
})
