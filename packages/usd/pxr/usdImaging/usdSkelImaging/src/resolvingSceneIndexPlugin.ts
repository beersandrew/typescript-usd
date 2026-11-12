// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/resolvingSceneIndexPlugin.cpp,
//  pxr/usdImaging/usdSkelImaging/resolvingSceneIndexPlugin.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/resolvingSceneIndexPlugin.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream defines the plugin type in
// TF_REGISTRY_FUNCTION(UsdImagingSceneIndexPlugin) and declares it in
// plugInfo.json (resolvingSceneIndexPlugin.cpp:22-26, plugInfo.json:44-49).
// Here loading this module calls UsdImagingSceneIndexPlugin.Define, as
// packages/usd/pxr/usdImaging/usdImaging/src/sceneIndexPlugin.ts describes.

import {
  FlattenedOverlayDataSourceProvider as HdFlattenedOverlayDataSourceProvider,
  MakeDataSourceContainingFlattenedDataSourceProvider as HdMakeDataSourceContainingFlattenedDataSourceProvider,
  PrimvarsSchema as HdPrimvarsSchema, RetainedContainerDataSource as HdRetainedContainerDataSource,
  SkinningSettings as HdSkinningSettings,
  type ContainerDataSource as HdContainerDataSource, type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { UsdImagingSceneIndexPlugin } from 'typescript-usd/usdImaging'
import { UsdSkelImagingBindingSchema } from './bindingSchema.ts'
import { UsdSkelImagingPointsResolvingSceneIndex } from './pointsResolvingSceneIndex.ts'
import { UsdSkelImagingSkeletonResolvingSceneIndex } from './skeletonResolvingSceneIndex.ts'

/** resolvingSceneIndexPlugin.h:18-38. Adds the scene indices resolving the
 *  UsdSkel behaviors to the UsdImaging scene index graph. */
export class UsdSkelImagingResolvingSceneIndexPlugin extends UsdImagingSceneIndexPlugin {
  /** resolvingSceneIndexPlugin.cpp:28-41 */
  appendSceneIndex(inputScene: HdSceneIndexBase): HdSceneIndexBase {
    let sceneIndex = inputScene

    sceneIndex =
      UsdSkelImagingSkeletonResolvingSceneIndex.new(sceneIndex)

    sceneIndex =
      UsdSkelImagingPointsResolvingSceneIndex.new(sceneIndex)

    return sceneIndex
  }

  /** resolvingSceneIndexPlugin.cpp:43-51 */
  FlattenedDataSourceProviders(): HdContainerDataSource | undefined {
    return HdRetainedContainerDataSource.new(
      [UsdSkelImagingBindingSchema.getSchemaToken()],
      [HdMakeDataSourceContainingFlattenedDataSourceProvider.Make(
        HdFlattenedOverlayDataSourceProvider)])
  }

  /** resolvingSceneIndexPlugin.cpp:53-59 */
  instanceDataSourceNames(): string[] {
    return [
      UsdSkelImagingBindingSchema.getSchemaToken(),
    ]
  }

  /** resolvingSceneIndexPlugin.cpp:61-81 */
  proxyPathTranslationDataSourceNames(): string[] {
    const bindingSchemaToken = [
      UsdSkelImagingBindingSchema.getSchemaToken(),
    ]
    if (!HdSkinningSettings.isSkinningDeferred()) {
      return bindingSchemaToken
    }

    // skelBinding:animationSource is relocated and aggregated as an instance
    // primvar on the instancer when skinning is deferred so we will need to
    // translate that. We should revisit if scanning through all the primvars
    // becomes a performance bottleneck. We can then maybe add a new
    // ProxyPathTranslationPrimvarNames() method.
    return [
      UsdSkelImagingBindingSchema.getSchemaToken(),
      HdPrimvarsSchema.getSchemaToken(),
    ]
  }
}

/** resolvingSceneIndexPlugin.cpp:22-26 */
UsdImagingSceneIndexPlugin.define(
  'UsdSkelImagingResolvingSceneIndexPlugin',
  () => new UsdSkelImagingResolvingSceneIndexPlugin())
