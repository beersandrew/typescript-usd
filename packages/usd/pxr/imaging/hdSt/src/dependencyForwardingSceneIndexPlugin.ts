// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/dependencyForwardingSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/dependencyForwardingSceneIndexPlugin.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/dependencyForwardingSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  DependencyForwardingSceneIndex as HdDependencyForwardingSceneIndex,
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  type ContainerDataSource as HdContainerDataSource,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'

// dependencyForwardingSceneIndexPlugin.cpp:14-17
const _tokens = {
  sceneIndexPluginName: 'HdSt_DependencyForwardingSceneIndexPlugin',
} as const

// dependencyForwardingSceneIndexPlugin.cpp:19
const _pluginDisplayName = 'GL'


/** dependencyForwardingSceneIndexPlugin.h */
export class HdSt_DependencyForwardingSceneIndexPlugin extends HdSceneIndexPlugin {
  /** dependencyForwardingSceneIndexPlugin.cpp:41-47 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdDependencyForwardingSceneIndex.new(inputScene)
  }
}

// dependencyForwardingSceneIndexPlugin.cpp:21-36: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_DependencyForwardingSceneIndexPlugin)

// dependencyForwardingSceneIndexPlugin.cpp:21-36: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 1000

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtEnd)
})
