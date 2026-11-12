// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/materialBindingResolvingSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/materialBindingResolvingSceneIndexPlugin.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/materialBindingResolvingSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  MaterialBindingsSchemaTokens as HdMaterialBindingsSchemaTokens,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  Tokens as HdTokens,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { MaterialBindingResolvingSceneIndex as HdsiMaterialBindingResolvingSceneIndex } from 'typescript-usd/hdsi'

// materialBindingResolvingSceneIndexPlugin.cpp:16-18
const _tokens = {
  sceneIndexPluginName: 'HdSt_MaterialBindingResolvingSceneIndexPlugin',
} as const

// materialBindingResolvingSceneIndexPlugin.cpp:20
const _pluginDisplayName = 'GL'


/** materialBindingResolvingSceneIndexPlugin.h:15-28 */
export class HdSt_MaterialBindingResolvingSceneIndexPlugin extends HdSceneIndexPlugin {
  /** materialBindingResolvingSceneIndexPlugin.cpp:45-58 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdsiMaterialBindingResolvingSceneIndex.new(
      inputScene,
      [
        HdTokens.preview,
        HdMaterialBindingsSchemaTokens.allPurpose,
      ],
      HdMaterialBindingsSchemaTokens.allPurpose)
  }
}

// materialBindingResolvingSceneIndexPlugin.cpp:22-35: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_MaterialBindingResolvingSceneIndexPlugin)

// materialBindingResolvingSceneIndexPlugin.cpp:22-35: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName, _tokens.sceneIndexPluginName, null,
    insertionPhase, HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
