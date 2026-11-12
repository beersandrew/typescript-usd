// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/nurbsApproximatingSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/nurbsApproximatingSceneIndexPlugin.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/nurbsApproximatingSceneIndexPlugin.{h,cpp}.
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
import { NurbsApproximatingSceneIndex as HdsiNurbsApproximatingSceneIndex } from 'typescript-usd/hdsi'

// nurbsApproximatingSceneIndexPlugin.cpp:14-16
const _tokens = {
  sceneIndexPluginName: 'HdSt_NurbsApproximatingSceneIndexPlugin',
} as const

// nurbsApproximatingSceneIndexPlugin.cpp:18
const _pluginDisplayName = 'GL'


/** nurbsApproximatingSceneIndexPlugin.h:14-24 */
export class HdSt_NurbsApproximatingSceneIndexPlugin extends HdSceneIndexPlugin {
  /** nurbsApproximatingSceneIndexPlugin.cpp:41-49 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdsiNurbsApproximatingSceneIndex.new(inputScene)
  }
}

// nurbsApproximatingSceneIndexPlugin.cpp:20-33: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_NurbsApproximatingSceneIndexPlugin)

// nurbsApproximatingSceneIndexPlugin.cpp:20-33: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
