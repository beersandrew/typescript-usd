// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/primIdSceneIndexPlugin.cpp,
//  pxr/imaging/hdsi/primIdSceneIndexPlugin.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/primIdSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts). The plugin's plugInfo entry is in
// shaderResources.ts.

import { TfEnvSetting, TfGetEnvSetting, TfRegistryManager } from 'typescript-usd/tf'
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
import { HdsiPrimIdSceneIndex } from './primIdSceneIndex.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

// primIdSceneIndexPlugin.cpp:21-24
const HDSI_ENABLE_PRIM_ID_SCENE_INDEX = new TfEnvSetting<boolean>(
  'HDSI_ENABLE_PRIM_ID_SCENE_INDEX', true,
  'Append the HdsiPrimIdSceneIndex as one of the last filtering scene ' +
  'indices for every renderer.')

// primIdSceneIndexPlugin.cpp:26-28
const _tokens = {
  sceneIndexPluginName: 'HdsiPrimIdSceneIndexPlugin',
} as const

// primIdSceneIndexPlugin.cpp:30-34: broad insertion phase chosen so the prim
// id scene index runs near the very end of the filtering graph, after the
// renderable prims have been finalized. The ordering is expressed in JSON
// metadata too (see plugInfo.json); the two are reconciled by the Hybrid
// plugin ordering policy.
const _insertionPhase = 1000

/** primIdSceneIndexPlugin.h:16-31 */
export class HdsiPrimIdSceneIndexPlugin extends HdSceneIndexPlugin {
  /** primIdSceneIndexPlugin.cpp:55-65 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    // This function shouldn't be called if the plugin isn't enabled.
    if (!TF_VERIFY(this._isEnabled(inputArgs))) {
      return inputScene
    }

    return HdsiPrimIdSceneIndex.new(inputScene)
  }

  /** primIdSceneIndexPlugin.cpp:67-72 */
  protected override _isEnabled(_inputArgs: HdContainerDataSource | undefined): boolean {
    return TfGetEnvSetting(HDSI_ENABLE_PRIM_ID_SCENE_INDEX)
  }
}

// primIdSceneIndexPlugin.cpp:36-39: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdsiPrimIdSceneIndexPlugin)

// primIdSceneIndexPlugin.cpp:41-49: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    HdSceneIndexPluginRegistryTokens.allRenderers,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    _insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtEnd)
})
