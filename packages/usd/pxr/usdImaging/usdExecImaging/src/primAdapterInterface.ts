// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/primAdapterInterface.cpp,
//  pxr/usdImaging/usdExecImaging/primAdapterInterface.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/primAdapterInterface.{h,cpp}
// (OpenUSD 26.11.1). SdfPath is a path string, as in hd.

import type { ContainerDataSource as HdContainerDataSource, DataSourceLocatorSet as HdDataSourceLocatorSet } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import type { UsdExecImagingRequestAccessorInterfaceSharedPtr } from './requestAccessorInterface.ts'
import type { UsdExecImagingRequestBuilderInterface } from './requestBuilderInterface.ts'
import type { UsdExecImagingValueKey } from './valueKey.ts'

/**
 * Interface to be implemented by all exec imaging prim adapters
 * (primAdapterInterface.h:26-86).
 *
 * Plugins implement and register classes derived from
 * UsdExecImagingPrimAdapterInterface to customize the imaging of prims that
 * depend on exec-computed values.
 */
export abstract class UsdExecImagingPrimAdapterInterface {
  /**
   * Invoked by UsdExecImaging when building its exec request.
   *
   * Implementations use this method to register that the imaging of prim
   * depends on one or more computed values. Each required computed value is
   * registered by invoking AddValueKey on the provided requestBuilder.
   * The value keys may be provided by prim, any of its attributes, or any
   * other object in the scene.
   */
  abstract buildRequest(prim: UsdPrim, requestBuilder: UsdExecImagingRequestBuilderInterface): void

  /**
   * Invoked by UsdExecImaging to insert computed values into the hydra scene.
   *
   * Implementations use this method to produce data sources for the prim
   * located at primPath. This implementation should only produce data
   * sources for exec-computed values. The data sources produced by this
   * method sparsely override data sources produced by the
   * UsdImagingStageSceneIndex.
   *
   * Any sampled data sources that depend on computed values should be
   * provided from either UsdExecImagingComputedSampledDataSource or
   * UsdExecImagingComputedTypedSampledDataSource<T>. These data sources
   * are constructible from the provided requestAccessor.
   */
  abstract getPrimData(
    primPath: string,
    requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
  ): HdContainerDataSource | undefined

  /**
   * Invoked by UsdExecImaging when a computed value is invalidated by
   * authoring or by a time change.
   *
   * This method is invoked when the computed value for valueKey has
   * changed. To be notified of a change to valueKey, it must have been
   * added to the request during BuildRequest. primPath holds the path
   * to the prim that was being adapted when valueKey was added to the
   * request.
   *
   * Implementations of this method add data source locators to
   * invalidLocators corresponding to data sources that depend on the
   * invalidated valueKey.
   */
  abstract invalidatePrimData(
    primPath: string,
    valueKey: UsdExecImagingValueKey,
    invalidLocators: HdDataSourceLocatorSet,
  ): void
}
