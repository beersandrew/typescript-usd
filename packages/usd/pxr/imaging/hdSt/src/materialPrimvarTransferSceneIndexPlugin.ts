// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/materialPrimvarTransferSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/materialPrimvarTransferSceneIndexPlugin.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/materialPrimvarTransferSceneIndexPlugin.{h,cpp}.
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
import { MaterialPrimvarTransferSceneIndex as HdsiMaterialPrimvarTransferSceneIndex } from 'typescript-usd/hdsi'

// materialPrimvarTransferSceneIndexPlugin.cpp:14-17
const _tokens = {
  sceneIndexPluginName: 'HdSt_MaterialPrimvarTransferSceneIndexPlugin',
} as const

////////////////////////////////////////////////////////////////////////////////
// Plugin registrations
////////////////////////////////////////////////////////////////////////////////

// materialPrimvarTransferSceneIndexPlugin.cpp:23
const _pluginDisplayName = 'GL'


////////////////////////////////////////////////////////////////////////////////
// Scene Index Implementations
////////////////////////////////////////////////////////////////////////////////

/** materialPrimvarTransferSceneIndexPlugin.h:15-27 */
export class HdSt_MaterialPrimvarTransferSceneIndexPlugin extends HdSceneIndexPlugin {
  /** materialPrimvarTransferSceneIndexPlugin.cpp:56-63 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdsiMaterialPrimvarTransferSceneIndex.new(inputScene)
  }
}

// materialPrimvarTransferSceneIndexPlugin.cpp:25-47: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_MaterialPrimvarTransferSceneIndexPlugin)

// materialPrimvarTransferSceneIndexPlugin.cpp:25-47: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  // Should be chained *after* the extComputationPrimvarPruningSceneIndex and
  // procedural expansion.
  // Avoiding an additional dependency on hdGp in hdSt and hardcoding it
  // for now.
  const insertionPhase = 3 // HdGpSceneIndexPlugin()::GetInsertionPhase() + 1;

  // Register the plugins conditionally.
  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    null, // no argument data necessary
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
