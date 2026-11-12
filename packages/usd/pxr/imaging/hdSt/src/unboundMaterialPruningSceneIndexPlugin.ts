// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/unboundMaterialPruningSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/unboundMaterialPruningSceneIndexPlugin.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/unboundMaterialPruningSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import {
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  MaterialBindingsSchemaTokens as HdMaterialBindingsSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  Tokens as HdTokens,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
  TokenArrayDataSource as HdTokenArrayDataSource,
} from 'typescript-usd/hd'
import {
  UnboundMaterialPruningSceneIndex as HdsiUnboundMaterialPruningSceneIndex,
  UnboundMaterialPruningSceneIndexTokens as HdsiUnboundMaterialPruningSceneIndexTokens,
} from 'typescript-usd/hdsi'
import { TF_VERIFY } from './tfDiagnostic.ts'

// XXX Temporary env setting to allow scene index to be disabled if it
//     regresses performance in some cases.
// (unboundMaterialPruningSceneIndexPlugin.cpp:20-23)
export const HDST_ENABLE_UNBOUND_MATERIAL_PRUNING_SCENE_INDEX = new TfEnvSetting<boolean>(
  'HDST_ENABLE_UNBOUND_MATERIAL_PRUNING_SCENE_INDEX', true,
  'Enable scene index that prunes unbound materials.')

// unboundMaterialPruningSceneIndexPlugin.cpp:25-28
const _tokens = {
  sceneIndexPluginName: 'HdSt_UnboundMaterialPruningSceneIndexPlugin',
} as const

// unboundMaterialPruningSceneIndexPlugin.cpp:30
const _pluginDisplayName = 'GL'


let _localInputArgs: HdContainerDataSource | undefined
let _enabled: boolean | undefined

/** unboundMaterialPruningSceneIndexPlugin.h:15-31 */
export class HdSt_UnboundMaterialPruningSceneIndexPlugin extends HdSceneIndexPlugin {
  /** unboundMaterialPruningSceneIndexPlugin.cpp:54-83 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    // We don't expect this to called when the plugin is disabled.
    if (!TF_VERIFY(this._isEnabled(inputArgs))) {
      return inputScene
    }

    // Define inputArgs here instead of in the TF_REGISTRY_FUNCTION block.
    // In the future, we may consider renaming the inputArgs parameter to
    // something like "sceneIndexGraphCreateArgs" to allow the app and renderer
    // plugin to provide arguments for scene indices instantiated via the
    // scene index plugin system.
    const localInputArgs = _localInputArgs ??= (() => {
      const bindingPurposesDs: HdTokenArrayDataSource =
        HdRetainedTypedSampledDataSource.new<string[]>([
          HdTokens.preview,
          HdMaterialBindingsSchemaTokens.allPurpose,
        ])

      return HdRetainedContainerDataSource.new(
        [HdsiUnboundMaterialPruningSceneIndexTokens.materialBindingPurposes],
        [bindingPurposesDs])
    })()

    return HdsiUnboundMaterialPruningSceneIndex.new(
      inputScene, localInputArgs)
  }

  /** unboundMaterialPruningSceneIndexPlugin.cpp:85-92 */
  protected override _isEnabled(_inputArgs: HdContainerDataSource | undefined): boolean {
    const enabled = _enabled ??=
      TfGetEnvSetting(HDST_ENABLE_UNBOUND_MATERIAL_PRUNING_SCENE_INDEX)
    return enabled
  }
}

// unboundMaterialPruningSceneIndexPlugin.cpp:32-49: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_UnboundMaterialPruningSceneIndexPlugin)

// unboundMaterialPruningSceneIndexPlugin.cpp:32-49: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  // Want this as downstream as possible, but before the dependency forwarding
  // scnee index.
  const insertionPhase = 900

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
