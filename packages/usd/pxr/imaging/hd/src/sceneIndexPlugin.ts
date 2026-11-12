// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sceneIndexPlugin.cpp,
//  pxr/imaging/hd/sceneIndexPlugin.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hd/sceneIndexPlugin.{h,cpp}.
//
// Upstream HdSceneIndexPlugin derives from HfPluginBase and is instantiated by
// HdSceneIndexPluginRegistry from the factory of its TfType
// (HdSceneIndexPluginRegistry.Define, sceneIndexPluginRegistry.ts). HfPluginBase
// has no behavior a scene index plugin uses and is not ported.

import { Type as TfType } from 'typescript-usd/tf'
import type { HdContainerDataSource } from './dataSource.ts'
import type { HdSceneIndexBase } from './sceneIndex.ts'

// sceneIndexPlugin.cpp:13-16 (TF_REGISTRY_FUNCTION(TfType)).
const _sceneIndexPluginType = TfType.define('HdSceneIndexPlugin')

/** TfType::Find<HdSceneIndexPlugin>(): the base type of every scene index
 *  plugin type, which plugInfo "Types" entries name in their "bases". */
export function HdSceneIndexPlugin_GetTfType(): TfType {
  return _sceneIndexPluginType
}

/** sceneIndexPlugin.h:76-140 */
export abstract class HdSceneIndexPlugin {
  /** sceneIndexPlugin.cpp:60-70 */
  appendSceneIndex(
    renderInstanceId: string,
    inputScene: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    if (this.isEnabled(inputArgs)) {
      return this._appendSceneIndexForRenderInstance(renderInstanceId, inputScene, inputArgs)
    }
    return inputScene
  }

  /** Returns true if the plugin is enabled, in the sense that it should be
   * consulted for its contribution to the scene index chain via
   * AppendSceneIndex. (sceneIndexPlugin.cpp:72-77) */
  isEnabled(inputArgs: HdContainerDataSource | undefined): boolean {
    return this._isEnabled(inputArgs)
  }

  /** Subclasses implement this to instantiate one or more scene indicies
   * which take the provided scene as input. The return value should be
   * the final scene created -- or the inputScene itself if nothing is
   * created. (sceneIndexPlugin.cpp:45-51: base implementation returns the
   * input.) */
  protected _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return inputScene
  }

  /** The renderInstanceId overload of _AppendSceneIndex
   * (sceneIndexPlugin.cpp:36-43). Divergence: TypeScript has no overloading
   * of virtual methods, so this overload has its own name. Base
   * implementation calls _AppendSceneIndex without the renderInstanceId. */
  protected _appendSceneIndexForRenderInstance(
    _renderInstanceId: string,
    inputScene: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return this._appendSceneIndex(inputScene, inputArgs)
  }

  /** Subclasses implement this to indicate whether the plugin is enabled.
   * Base implementation returns true. (sceneIndexPlugin.cpp:53-58) */
  protected _isEnabled(_inputArgs: HdContainerDataSource | undefined): boolean {
    return true
  }
}
