// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/implicitSurfaceSceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/implicitSurfaceSceneIndexPlugin.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/implicitSurfaceSceneIndexPlugin.{h,cpp}.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
} from 'typescript-usd/hd'
import type {
  ContainerDataSource as HdContainerDataSource,
  DataSourceBase as HdDataSourceBase,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import {
  ImplicitSurfaceSceneIndex as HdsiImplicitSurfaceSceneIndex,
  ImplicitSurfaceSceneIndexTokens as HdsiImplicitSurfaceSceneIndexTokens,
} from 'typescript-usd/hdsi'
import { HdStRenderDelegate } from './renderDelegate.ts'

// implicitSurfaceSceneIndexPlugin.cpp:17-20
const _tokens = {
  sceneIndexPluginName: 'HdSt_ImplicitSurfaceSceneIndexPlugin',
} as const

// implicitSurfaceSceneIndexPlugin.cpp:22
const _pluginDisplayName = 'GL'


/** implicitSurfaceSceneIndexPlugin.cpp:50-78 */
function _LocalInputArgs(): HdContainerDataSource {
  // Configure the scene index to generate meshes for implicit primitives
  // that are not natively supported by Storm. With
  // HDST_ENABLE_NATIVE_IMPLICITS enabled, spheres, cones, and cylinders
  // can be rendered natively, so we avoid converting them to meshes here.
  const toMeshSrc: HdDataSourceBase =
    HdRetainedTypedSampledDataSource.new<string>(
      HdsiImplicitSurfaceSceneIndexTokens.toMesh)

  const names: string[] = [
    HdPrimTypeTokens.cube,
    HdPrimTypeTokens.plane,
  ]

  if (!HdStRenderDelegate.isEnabledNativeImplicitsRenderingSupport()) {
    names.push(HdPrimTypeTokens.sphere)
    names.push(HdPrimTypeTokens.cone)
    names.push(HdPrimTypeTokens.cylinder)
    names.push(HdPrimTypeTokens.capsule)
  }

  const values: HdDataSourceBase[] = names.map(() => toMeshSrc)

  return HdRetainedContainerDataSource.new(names, values)
}

let _localInputArgs: HdContainerDataSource | undefined

/** implicitSurfaceSceneIndexPlugin.h:16-31 */
export class HdSt_ImplicitSurfaceSceneIndexPlugin extends HdSceneIndexPlugin {
  /** implicitSurfaceSceneIndexPlugin.cpp:80-94 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    // Define inputArgs here instead of in the TF_REGISTRY_FUNCTION block.
    // In the future, we may consider renaming the inputArgs parameter to
    // something like "sceneIndexGraphCreateArgs" to allow the app and renderer
    // plugin to provide arguments for scene indices instantiated via the
    // scene index plugin system.

    const localInputArgs = _localInputArgs ??= _LocalInputArgs()

    return HdsiImplicitSurfaceSceneIndex.new(inputScene, localInputArgs)
  }
}

// implicitSurfaceSceneIndexPlugin.cpp:24-40: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_ImplicitSurfaceSceneIndexPlugin)

// implicitSurfaceSceneIndexPlugin.cpp:24-40: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  const insertionPhase = 0

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
