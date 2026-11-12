// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/tetMeshConversionSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/tetMeshConversionSceneIndexPlugin.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/tetMeshConversionSceneIndexPlugin.{h,cpp}.
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
import { TetMeshConversionSceneIndex as HdsiTetMeshConversionSceneIndex } from 'typescript-usd/hdsi'

// tetMeshConversionSceneIndexPlugin.cpp:16-19
const _tokens = {
  sceneIndexPluginName: 'HdSt_TetMeshConversionSceneIndexPlugin',
} as const

// tetMeshConversionSceneIndexPlugin.cpp:21
const _pluginDisplayName = 'GL'


/** tetMeshConversionSceneIndexPlugin.h:16-32
 *
 * Storm scene index plugin that configures the Tet Mesh Conversion scene index
 * to generate meshes for Tet Meshes.
 * \note Storm does _not_ natively support Tet Meshes, so they need to
 * be transformed into meshes. */
export class HdSt_TetMeshConversionSceneIndexPlugin extends HdSceneIndexPlugin {
  /** tetMeshConversionSceneIndexPlugin.cpp:48-54 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return HdsiTetMeshConversionSceneIndex.new(inputScene)
  }
}

// tetMeshConversionSceneIndexPlugin.cpp:23-38: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_TetMeshConversionSceneIndexPlugin)

// tetMeshConversionSceneIndexPlugin.cpp:23-38: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null, // no argument data necessary
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
