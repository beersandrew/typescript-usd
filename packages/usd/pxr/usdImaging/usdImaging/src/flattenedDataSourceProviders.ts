// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/flattenedDataSourceProviders.cpp,
//  pxr/usdImaging/usdImaging/flattenedDataSourceProviders.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/flattenedDataSourceProviders.{h,cpp}
// (OpenUSD 26.11.1).

import {
  FlattenedDataSourceProviders as HdFlattenedDataSourceProviders,
  FlattenedOverlayDataSourceProvider as HdFlattenedOverlayDataSourceProvider,
  MakeDataSourceContainingFlattenedDataSourceProvider as HdMakeDataSourceContainingFlattenedDataSourceProvider,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import { UsdImagingFlattenedGeomModelDataSourceProvider } from './flattenedGeomModelDataSourceProvider.ts'
import { UsdImagingFlattenedMaterialBindingsDataSourceProvider } from './flattenedMaterialBindingsDataSourceProvider.ts'
import { UsdImagingGeomModelSchema } from './geomModelSchema.ts'
import { UsdImagingMaterialBindingsSchema } from './materialBindingsSchema.ts'
import { UsdImagingModelSchema } from './modelSchema.ts'
import { UsdImagingSceneIndexPlugin } from './sceneIndexPlugin.ts'
import { UsdImagingUsdUpAxisSchema } from './usdUpAxisSchema.ts'

/** flattenedDataSourceProviders.cpp:25-44 */
function _UsdFlattenedDataSourceProviders(): HdContainerDataSource {
  const { Make } = HdMakeDataSourceContainingFlattenedDataSourceProvider

  return HdRetainedContainerDataSource.new(
    [
      UsdImagingMaterialBindingsSchema.getSchemaToken(),
      UsdImagingGeomModelSchema.getSchemaToken(),
      UsdImagingModelSchema.getSchemaToken(),
      UsdImagingUsdUpAxisSchema.getSchemaToken(),
    ],
    [
      Make(UsdImagingFlattenedMaterialBindingsDataSourceProvider),
      Make(UsdImagingFlattenedGeomModelDataSourceProvider),
      Make(HdFlattenedOverlayDataSourceProvider),
      Make(HdFlattenedOverlayDataSourceProvider),
    ])
}

/** flattenedDataSourceProviders.cpp:46-70 */
function _FlattenedDataSourceProviders(): HdContainerDataSource {
  const result: HdContainerDataSource[] = []

  // Usd-specific flattening
  result.push(_UsdFlattenedDataSourceProviders())

  // Flattening from UsdImaging scene index plugins.
  for (const sceneIndexPlugin of UsdImagingSceneIndexPlugin.getAllSceneIndexPlugins()) {
    const ds = sceneIndexPlugin.FlattenedDataSourceProviders()
    if (ds) {
      result.push(ds)
    }
  }

  // Basic flattening from Hydra.
  result.push(HdFlattenedDataSourceProviders())

  return HdOverlayContainerDataSource.new(...result)
}

let _result: HdContainerDataSource | undefined

/** flattenedDataSourceProviders.h:16-23, .cpp:73-79.
 *
 * Contains all HdFlattenedDataSourceProviders needed for flattening
 * the output of UsdImagingStageSceneIndex.
 *
 * Can be given as inputArgs to HdFlatteningSceneIndex. */
export function UsdImagingFlattenedDataSourceProviders(): HdContainerDataSource {
  _result ??= _FlattenedDataSourceProviders()
  return _result
}
