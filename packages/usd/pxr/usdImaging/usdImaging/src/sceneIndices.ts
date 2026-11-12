// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/sceneIndices.cpp,
//  pxr/usdImaging/usdImaging/sceneIndices.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/sceneIndices.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - USDIMAGING_SET_STAGE_AFTER_CHAINING_SCENE_INDICES is read at its
//   default (true): the stage is set after the graph is built, so added
//   notices flow through every scene index (sceneIndices.cpp:21-41).
// - HD_USE_ENCAPSULATING_SCENE_INDICES is off (its default): HdMakeEncapsulatingSceneIndex
//   is not ported.

import {
  ContainerDataSource as HdContainerDataSourceClass,
  DataSourceLocator as HdDataSourceLocator, NoticeBatchingSceneIndex as HdNoticeBatchingSceneIndex,
  PrimTypeTokens as HdPrimTypeTokens, PurposeSchema as HdPurposeSchema,
  RenderTagTokens as HdRenderTagTokens, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, OverlayContainerDataSource as HdOverlayContainerDataSource,
  type ContainerDataSource as HdContainerDataSource, type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { LocatorCachingSceneIndex as HdsiLocatorCachingSceneIndex } from 'typescript-usd/hdsi'
import type { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingDrawModeSceneIndex } from './drawModeSceneIndex.ts'
import { UsdImagingExtentResolvingSceneIndex, UsdImagingExtentResolvingSceneIndexTokens } from './extentResolvingSceneIndex.ts'
import { UsdImagingGeomModelSchema } from './geomModelSchema.ts'
import { UsdImaging_InstanceProxyPathTranslationSceneIndex } from './instanceProxyPathTranslationSceneIndex.ts'
import { UsdImagingMaterialBindingsResolvingSceneIndex } from './materialBindingsResolvingSceneIndex.ts'
import { UsdImagingMaterialBindingsSchema } from './materialBindingsSchema.ts'
import { UsdImagingModelSchema } from './modelSchema.ts'
import { UsdImagingNiPrototypePropagatingSceneIndex } from './niPrototypePropagatingSceneIndex.ts'
import { UsdImagingPiPrototypePropagatingSceneIndex } from './piPrototypePropagatingSceneIndex.ts'
import { UsdImagingRenderSettingsFlatteningSceneIndex } from './renderSettingsFlatteningSceneIndex.ts'
import { UsdImagingSceneIndexCreateArgsSchema } from './sceneIndexCreateArgsSchema.ts'
import { UsdImagingSceneIndexPlugin } from './sceneIndexPlugin.ts'
import { UsdImagingSelectionSceneIndex } from './selectionSceneIndex.ts'
import { UsdImagingStageSceneIndex } from './stageSceneIndex.ts'
import { UsdImagingUnloadedDrawModeSceneIndex } from './unloadedDrawModeSceneIndex.ts'
import { UsdImagingUsdUpAxisSchema } from './usdUpAxisSchema.ts'

/** sceneIndices.h:24-26 */
export type UsdImagingSceneIndexAppendCallback = (inputSceneIndex: HdSceneIndexBase) => HdSceneIndexBase

/** sceneIndices.h:30-40 */
export interface UsdImagingCreateSceneIndicesInfo {
  stage?: UsdStage
  stageSceneIndexInputArgs?: HdContainerDataSource
  /** Default true. */
  addDrawModeSceneIndex?: boolean
  /** Default false. */
  displayUnloadedPrimsWithBounds?: boolean
  overridesSceneIndexCallback?: UsdImagingSceneIndexAppendCallback
}

/** sceneIndices.h:44-50 */
export interface UsdImagingSceneIndices {
  stageSceneIndex: UsdImagingStageSceneIndex
  postInstancingNoticeBatchingSceneIndex: HdNoticeBatchingSceneIndex
  selectionSceneIndex: UsdImagingSelectionSceneIndex
  finalSceneIndex: HdSceneIndexBase
}

/** sceneIndices.cpp:43-55 */
function _AddPluginSceneIndices(sceneIndex: HdSceneIndexBase): HdSceneIndexBase {
  for (const sceneIndexPlugin of UsdImagingSceneIndexPlugin.getAllSceneIndexPlugins()) {
    sceneIndex = sceneIndexPlugin.appendSceneIndex(sceneIndex)
  }
  return sceneIndex
}

/** sceneIndices.cpp:57-76 */
function _AdditionalStageSceneIndexCreateArgs(displayUnloadedPrimsWithBounds: boolean): HdContainerDataSource | undefined {
  if (!displayUnloadedPrimsWithBounds) {
    return undefined
  }
  return HdRetainedContainerDataSource.new(
    [UsdImagingSceneIndexCreateArgsSchema.getSchemaToken()],
    [new UsdImagingSceneIndexCreateArgsSchema.Builder()
      .setIncludeUnloadedPrims(HdRetainedTypedSampledDataSource.new(true))
      .build()])
}

/** sceneIndices.cpp:78-101. Use extentsHint (of models) for purpose
 *  geometry, render and proxy. Used by the draw mode scene index. Aligns
 *  with arguments to UsdGeomBBoxCache in
 *  UsdImagingDrawModeAdapter::_ComputeExtent in UsdImaging 1.0. */
function _ExtentResolvingSceneIndexCreateArgs(): HdContainerDataSource {
  const purposeDataSources = [
    HdRetainedTypedSampledDataSource.new(HdRenderTagTokens.geometry),
    HdRetainedTypedSampledDataSource.new(HdRenderTagTokens.render),
    HdRetainedTypedSampledDataSource.new(HdRenderTagTokens.proxy),
  ]
  return HdRetainedContainerDataSource.new(
    [UsdImagingExtentResolvingSceneIndexTokens.purposes],
    [HdRetainedSmallVectorDataSource.new(purposeDataSources)])
}

/** sceneIndices.cpp:117-148 */
function _InstanceDataSourceNames(): string[] {
  // In order for USD instances to share a prototype they must share the
  // following Hydra schemas, which are used for Hydra-side instance
  // aggregation. Due to their inheritance semantics these schemas may
  // require different aggregation of prototypes in Hydra as compared to the
  // underlying USD stage prototypes.
  const result: string[] = [
    UsdImagingMaterialBindingsSchema.getSchemaToken(),
    HdPurposeSchema.getSchemaToken(),
    UsdImagingGeomModelSchema.getSchemaToken(),
    // We include the model schema in order to aggregate scene indices by
    // assetInfo, which may be used in material networks for texture asset
    // resolution. See HdDataSourceMaterialNetworkInterface::
    // GetModelAssetName().
    UsdImagingModelSchema.getSchemaToken(),
    UsdImagingUsdUpAxisSchema.getSchemaToken(),
  ]
  for (const plugin of UsdImagingSceneIndexPlugin.getAllSceneIndexPlugins()) {
    result.push(...plugin.instanceDataSourceNames())
  }
  return result
}

/** sceneIndices.cpp:150-169 */
function _ProxyPathTranslationDataSourceNames(): string[] {
  const result: string[] = [
    // Translate material bindings to instance proxies.
    UsdImagingMaterialBindingsSchema.getSchemaToken(),
  ]
  for (const plugin of UsdImagingSceneIndexPlugin.getAllSceneIndexPlugins()) {
    result.push(...plugin.proxyPathTranslationDataSourceNames())
  }
  return result
}

/** HdMaterialSchema::GetDefaultLocator() (hd/materialSchema.cpp) */
const _materialLocator = new HdDataSourceLocator('material')

/** sceneIndices.cpp:190-317 */
export function UsdImagingCreateSceneIndices(
  createInfo?: UsdImagingCreateSceneIndicesInfo,
): UsdImagingSceneIndices
/** sceneIndices.h:58-61. The createArgs form is told apart from the info
 *  form by being an HdContainerDataSource (or undefined with a second
 *  argument). */
export function UsdImagingCreateSceneIndices(
  createArgs: HdContainerDataSource | undefined,
  overridesSceneIndexCallback: UsdImagingSceneIndexAppendCallback | undefined,
): UsdImagingSceneIndices
export function UsdImagingCreateSceneIndices(
  createInfoOrArgs?: UsdImagingCreateSceneIndicesInfo | HdContainerDataSource,
  ...overridesSceneIndexCallback: [UsdImagingSceneIndexAppendCallback | undefined] | []
): UsdImagingSceneIndices {
  if (createInfoOrArgs instanceof HdContainerDataSourceClass || overridesSceneIndexCallback.length > 0) {
    return _CreateSceneIndicesFromCreateArgs(
      createInfoOrArgs as HdContainerDataSource | undefined, overridesSceneIndexCallback[0])
  }
  const createInfo: UsdImagingCreateSceneIndicesInfo =
    (createInfoOrArgs as UsdImagingCreateSceneIndicesInfo | undefined) ?? {}
  const addDrawModeSceneIndex = createInfo.addDrawModeSceneIndex ?? true
  const displayUnloadedPrimsWithBounds = createInfo.displayUnloadedPrimsWithBounds ?? false

  let sceneIndex: HdSceneIndexBase
  const stageSceneIndex = UsdImagingStageSceneIndex.new(
    HdOverlayContainerDataSource.overlayedContainerDataSources(
      _AdditionalStageSceneIndexCreateArgs(displayUnloadedPrimsWithBounds),
      createInfo.stageSceneIndexInputArgs))
  sceneIndex = stageSceneIndex

  // Cache materials to avoid repeated queries back to UsdShade, ex: for
  // traversing node connections. Do this after the stage scene index so we
  // don't need to rely on any extra dependency invalidation.
  sceneIndex = HdsiLocatorCachingSceneIndex.new(sceneIndex, _materialLocator, HdPrimTypeTokens.material) ?? sceneIndex

  if (createInfo.overridesSceneIndexCallback) {
    sceneIndex = createInfo.overridesSceneIndexCallback(sceneIndex)
  }

  if (displayUnloadedPrimsWithBounds) {
    sceneIndex = UsdImagingUnloadedDrawModeSceneIndex.new(sceneIndex)
  }

  sceneIndex = UsdImagingExtentResolvingSceneIndex.new(sceneIndex, _ExtentResolvingSceneIndexCreateArgs())

  sceneIndex = UsdImagingPiPrototypePropagatingSceneIndex.new(sceneIndex)

  {
    // Names of data sources that need to have the same values across native
    // instances for the instances be aggregated together.
    const instanceDataSourceNames = _InstanceDataSourceNames()

    // The draw mode scene index needs to be inserted multiple times during
    // prototype propagation because:
    // - A native instance can be grouped under a prim with non-trivial draw
    //   mode. In this case, the draw mode scene index needs to filter out the
    //   native instance before instance aggregation.
    // - A native instance itself can have a non-trivial draw mode. In this
    //   case, we want to aggregate the native instances with the same draw
    //   mode, so we need to run instance aggregation first.
    // - Advanced scenarios such as native instances in USD prototypes and the
    //   composition semantics of draw mode: the draw mode is inherited but
    //   apply draw mode is not and the draw mode is only applied when it is
    //   non-trivial and apply draw mode is true.
    //
    // Thus, we give the prototype propagating scene index a callback.
    let callback: UsdImagingSceneIndexAppendCallback | undefined
    if (addDrawModeSceneIndex) {
      callback = (inputSceneIndex: HdSceneIndexBase) =>
        UsdImagingDrawModeSceneIndex.new(inputSceneIndex, /* inputArgs = */ undefined)
    }

    sceneIndex = UsdImagingNiPrototypePropagatingSceneIndex.new(sceneIndex, instanceDataSourceNames, callback)
  }

  const postInstancingNoticeBatchingSceneIndex = HdNoticeBatchingSceneIndex.new(sceneIndex)
  sceneIndex = postInstancingNoticeBatchingSceneIndex

  // Names of data sources that contain SdfPath-valued data sources that may
  // target instance proxies, and which require translation to corresponding
  // prototype paths.
  sceneIndex = UsdImaging_InstanceProxyPathTranslationSceneIndex.new(
    sceneIndex, _ProxyPathTranslationDataSourceNames())

  sceneIndex = UsdImagingMaterialBindingsResolvingSceneIndex.new(sceneIndex, /* inputArgs = */ undefined)

  sceneIndex = _AddPluginSceneIndices(sceneIndex)

  const selectionSceneIndex = UsdImagingSelectionSceneIndex.new(sceneIndex)
  sceneIndex = selectionSceneIndex

  sceneIndex = UsdImagingRenderSettingsFlatteningSceneIndex.new(sceneIndex)

  const result: UsdImagingSceneIndices = {
    stageSceneIndex, postInstancingNoticeBatchingSceneIndex, selectionSceneIndex, finalSceneIndex: sceneIndex,
  }

  // Setting the stage populates the scene index and results in added
  // notices flowing downstream.
  result.stageSceneIndex.SetStage(createInfo.stage)

  return result
}

/** sceneIndices.cpp:319-355 */
function _CreateSceneIndicesFromCreateArgs(
  createArgs: HdContainerDataSource | undefined,
  overridesSceneIndexCallback: UsdImagingSceneIndexAppendCallback | undefined,
): UsdImagingSceneIndices {
  const schema =
    UsdImagingSceneIndexCreateArgsSchema.getFromParent(createArgs)

  const info: UsdImagingCreateSceneIndicesInfo = {}

  const stageDs = schema.getStage()
  if (stageDs) {
    info.stage = stageDs.getTypedValue(0.0)
  }

  const stageSceneIndexInputArgs = schema.getContainer()
  if (stageSceneIndexInputArgs) {
    info.stageSceneIndexInputArgs = stageSceneIndexInputArgs
  }

  const addDrawModeDs = schema.getAddDrawModeSceneIndex()
  if (addDrawModeDs) {
    info.addDrawModeSceneIndex = addDrawModeDs.getTypedValue(0.0)
  }

  const displayUnloadedDs = schema.getDisplayUnloadedPrimsWithBounds()
  if (displayUnloadedDs) {
    info.displayUnloadedPrimsWithBounds = displayUnloadedDs.getTypedValue(0.0)
  }

  if (overridesSceneIndexCallback) {
    info.overridesSceneIndexCallback = overridesSceneIndexCallback
  }

  return UsdImagingCreateSceneIndices(info)
}
