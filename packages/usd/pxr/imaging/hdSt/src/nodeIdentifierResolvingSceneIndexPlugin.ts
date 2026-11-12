// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/nodeIdentifierResolvingSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/nodeIdentifierResolvingSceneIndexPlugin.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/nodeIdentifierResolvingSceneIndexPlugin.{h,cpp}.
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
import { NodeIdentifierResolvingSceneIndex as HdSiNodeIdentifierResolvingSceneIndex } from 'typescript-usd/hdsi'

// nodeIdentifierResolvingSceneIndexPlugin.cpp:14-18
const _tokens = {
  glslfx: 'glslfx',
  sceneIndexPluginName: 'HdSt_NodeIdentifierResolvingSceneIndexPlugin',
} as const

// nodeIdentifierResolvingSceneIndexPlugin.cpp:20
const _pluginDisplayName = 'GL'


/** nodeIdentifierResolvingSceneIndexPlugin.h:15-28 */
export class HdSt_NodeIdentifierResolvingSceneIndexPlugin extends HdSceneIndexPlugin {
  /** nodeIdentifierResolvingSceneIndexPlugin.cpp:45-53 */
  protected override _appendSceneIndex(
    inputSceneIndex: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdSiNodeIdentifierResolvingSceneIndex.new(inputSceneIndex,
      /* sourceType */_tokens.glslfx)
  }
}

// nodeIdentifierResolvingSceneIndexPlugin.cpp:22-35: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_NodeIdentifierResolvingSceneIndexPlugin)

// nodeIdentifierResolvingSceneIndexPlugin.cpp:22-35: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName, _tokens.sceneIndexPluginName, null,
    insertionPhase, HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
