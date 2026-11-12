// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/sceneIndexPlugin.cpp,
//  pxr/usdImaging/usdImaging/sceneIndexPlugin.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/sceneIndexPlugin.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream discovers subclasses through PlugRegistry (every TfType
// derived from UsdImagingSceneIndexPlugin declared in a plugInfo.json) and
// manufactures them through the TfType factory installed by
// UsdImagingSceneIndexPlugin::Define<T>() inside
// TF_REGISTRY_FUNCTION(UsdImagingSceneIndexPlugin)
// (sceneIndexPlugin.h:109-121, sceneIndexPlugin.cpp:39-84). Here a plugin
// module calls UsdImagingSceneIndexPlugin.Define(typeName, factory) when it
// is loaded (the counterpart of both its plugInfo.json "Types" entry and its
// registry function), as UsdImagingAdapterRegistry.RegisterTypes does for
// adapters. GetAllSceneIndexPlugins creates one instance per defined type in
// definition order (upstream iterates a std::set<TfType>, whose order is not
// specified).

import type {
  ContainerDataSource as HdContainerDataSource,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** sceneIndexPlugin.h:21-22 UsdImagingSceneIndexPluginUniquePtr */
export type UsdImagingSceneIndexPluginUniquePtr = UsdImagingSceneIndexPlugin

interface _DefinedType {
  typeName: string
  create: () => UsdImagingSceneIndexPlugin | undefined
}

const _definedTypes: _DefinedType[] = []

/** sceneIndexPlugin.h:24-128: a base class for scene index plugins that can
 *  insert filtering scene indices into UsdImaging, see sceneIndices.cpp for
 *  details.
 *
 *  This is intended for UsdSkelImaging inserting scene indices implementing
 *  the UsdSkel behaviors.
 *
 *  Usage:
 *
 *    class MyPlugin extends UsdImagingSceneIndexPlugin {
 *      AppendSceneIndex(inputScene) { ... }
 *    }
 *    // Upstream: TF_REGISTRY_FUNCTION(UsdImagingSceneIndexPlugin) plus a
 *    // plugInfo.json entry.
 *    UsdImagingSceneIndexPlugin.Define('MyPlugin', () => new MyPlugin())
 */
export abstract class UsdImagingSceneIndexPlugin {
  /** sceneIndexPlugin.h:48-50. Override by client. Similar to
   *  HdSceneIndexPlugin::AppendSceneIndex. */
  abstract appendSceneIndex(inputScene: HdSceneIndexBase): HdSceneIndexBase

  /** sceneIndexPlugin.h:52-61, sceneIndexPlugin.cpp:21-25. Clients can
   *  register additional HdFlattenedDataSourceProvider's that
   *  UsdImagingCreateSceneIndices will pass to the flattening scene index.
   *
   *  Clients can use
   *  HdMakeDataSourceContainingFlattenedDataSourceProvider::Make
   *  to create the values of the container data source. */
  FlattenedDataSourceProviders(): HdContainerDataSource | undefined {
    return undefined
  }

  /** sceneIndexPlugin.h:63-76, sceneIndexPlugin.cpp:27-31. Clients can
   *  register additional names used by the (native) instance aggregation
   *  scene index when grouping instances.
   *
   *  For example, two instances with different material bindings cannot be
   *  aggregated together and instantiated by the same instancer.
   *
   *  UsdImagingCreateSceneIndices knows about several such bindings already.
   *  Here, clients can add additional data sources that should be expected
   *  by the aggregation scene index. These data sources are identified by
   *  their name in the prim-level container data source. */
  instanceDataSourceNames(): string[] {
    return []
  }

  /** sceneIndexPlugin.h:78-85, sceneIndexPlugin.cpp:33-37. Clients can
   *  register additional names of prim-level data sources that should
   *  receive path-translation for any path-valued data sources that point at
   *  instance proxies to point to corresponding prototypes. */
  proxyPathTranslationDataSourceNames(): string[] {
    return []
  }

  /** sceneIndexPlugin.h:109-121 Define<T>(): call when the plugin module is
   *  loaded to ensure that UsdImaging can instantiate the client's subclass
   *  of UsdImagingSceneIndexPlugin (see the file header). */
  static define(typeName: string, create: () => UsdImagingSceneIndexPlugin | undefined): void {
    if (_definedTypes.some(t => t.typeName === typeName)) {
      TF_CODING_ERROR(`UsdImagingSceneIndexPlugin ${typeName} is already defined.`)
      return
    }
    _definedTypes.push({ typeName, create })
  }

  /** sceneIndexPlugin.cpp:39-84: get an instance of each registered
   *  UsdImagingSceneIndexPlugin. */
  static getAllSceneIndexPlugins(): UsdImagingSceneIndexPluginUniquePtr[] {
    const result: UsdImagingSceneIndexPluginUniquePtr[] = []

    for (const pluginType of _definedTypes) {
      const sceneIndexPlugin = pluginType.create()
      if (!sceneIndexPlugin) {
        TF_CODING_ERROR(
          `Could not create UsdImagingSceneIndexPlugin ${pluginType.typeName}.`)
        continue
      }

      result.push(sceneIndexPlugin)
    }
    return result
  }
}
