// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/renderPassPruneSceneIndexPlugin.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1
// pxr/usdImaging/usdImaging/renderPassPruneSceneIndexPlugin.cpp.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts). The plugin's plugInfo entry is in
// plugInfo.ts.

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  SceneIndexPluginRegistryTokens as HdSceneIndexPluginRegistryTokens,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { RenderPassPruneSceneIndex as HdsiRenderPassPruneSceneIndex } from 'typescript-usd/hdsi'
import { UsdImagingGetCollectionPredicateLibrary } from './collectionPredicateLibrary.ts'

// renderPassPruneSceneIndexPlugin.cpp:15-18
const _tokens = {
  sceneIndexPluginName: 'UsdImaging_RenderPassPruneSceneIndexPlugin',
} as const

/**
 * Plugin that implements pruning semantics based on the "prune" collection
 * authored on the active render pass. This plugin is registered for all
 * renderers. Because the active render pass is set via the scene globals
 * scene index (which is inserted after the scene assembly merging scene
 * index) via the plugin system, it uses the plugin system to be ordered
 * after the scene globals scene index
 * (renderPassPruneSceneIndexPlugin.cpp:20-46).
 */
export class UsdImaging_RenderPassPruneSceneIndexPlugin extends HdSceneIndexPlugin {
  /** renderPassPruneSceneIndexPlugin.cpp:34-44 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    // Only support USD predicates when evaluating expressions on
    // render pass collections that use UsdCollectionAPI.
    // Hydra predicates are not supported because USD does not know of them.
    return HdsiRenderPassPruneSceneIndex.new(
      inputScene, UsdImagingGetCollectionPredicateLibrary())
  }
}

// renderPassPruneSceneIndexPlugin.cpp:48-56: TF_REGISTRY_FUNCTION(TfType),
// provided for backwards compatibility when the HdSceneIndexPluginRegistry's
// ordering policy is set to CppRegistrationOnly.
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, UsdImaging_RenderPassPruneSceneIndexPlugin)

// renderPassPruneSceneIndexPlugin.cpp:58-71: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  // Run after the scene is assembled and scene globals are authored, but
  // before procedurals are expanded.
  // HdGpSceneIndexPlugin::GetInsertionPhase = 2.
  const insertionPhase = 1

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    HdSceneIndexPluginRegistryTokens.allRenderers,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null, // No input args.
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
