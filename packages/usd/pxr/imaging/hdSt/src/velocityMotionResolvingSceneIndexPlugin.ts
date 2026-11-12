// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/velocityMotionResolvingSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/velocityMotionResolvingSceneIndexPlugin.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/velocityMotionResolvingSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { VelocityMotionResolvingSceneIndex as HdsiVelocityMotionResolvingSceneIndex } from 'typescript-usd/hdsi'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

// velocityMotionResolvingSceneIndexPlugin.cpp:23-26
const _tokens = {
  fps: 'fps',
  sceneIndexPluginName: 'HdSt_VelocityMotionResolvingSceneIndexPlugin',
} as const

// velocityMotionResolvingSceneIndexPlugin.cpp:28
const _pluginDisplayName = 'GL'


/** velocityMotionResolvingSceneIndexPlugin.h:16-29 */
export class HdSt_VelocityMotionResolvingSceneIndexPlugin extends HdSceneIndexPlugin {
  /** velocityMotionResolvingSceneIndexPlugin.cpp:51-70 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    // Define inputArgs here instead of in the TF_REGISTRY_FUNCTION block.
    // In the future, we may consider renaming the inputArgs parameter to
    // something like "sceneIndexGraphCreateArgs" to allow the app and
    // renderer plugin to provide arguments for scene indices instantiated
    // via the scene index plugin system.
    const localInputArgs = HdRetainedContainerDataSource.new(
      [_tokens.fps],
      // TODO: Get real framerate!
      [new HdRetainedTypedSampledDataSource<number>(24.0, VtValueTypes.float)])

    return HdsiVelocityMotionResolvingSceneIndex.new(
      inputScene, localInputArgs)
  }
}

// velocityMotionResolvingSceneIndexPlugin.cpp:30-46: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_VelocityMotionResolvingSceneIndexPlugin)

// velocityMotionResolvingSceneIndexPlugin.cpp:30-46: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  // This one should go after implicit surface conversion
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtEnd)
})
