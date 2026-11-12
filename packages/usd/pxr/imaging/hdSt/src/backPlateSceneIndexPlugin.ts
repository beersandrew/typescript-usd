// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/backPlateSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/backPlateSceneIndexPlugin.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/backPlateSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { BackPlateSceneIndex as HdsiBackPlateSceneIndex } from 'typescript-usd/hdsi'

// backPlateSceneIndexPlugin.cpp:14-17
const _tokens = {
  sceneIndexPluginName: 'HdSt_BackPlateSceneIndexPlugin',
} as const

// backPlateSceneIndexPlugin.cpp:19
const _pluginDisplayName = 'GL'

/** backPlateSceneIndexPlugin.h */
export class HdSt_BackPlateSceneIndexPlugin extends HdSceneIndexPlugin {
  /** backPlateSceneIndexPlugin.cpp:37-44 */
  protected override _appendSceneIndex(
    inputSceneIndex: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdsiBackPlateSceneIndex.new(inputSceneIndex)
  }
}

// backPlateSceneIndexPlugin.cpp:21-24: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_BackPlateSceneIndexPlugin)

// backPlateSceneIndexPlugin.cpp:26-33: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName, _tokens.sceneIndexPluginName, null,
    insertionPhase, HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
