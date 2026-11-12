// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/primAdapter.cpp,
//  pxr/usdImaging/usdImaging/primAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/primAdapter.{h,cpp} (OpenUSD 26.11.1):
// the "Scene Index Support" part (primAdapter.h:60-150,
// primAdapter.cpp:81-136).
//
// The rest of UsdImagingPrimAdapter serves UsdImagingDelegate (the legacy
// scene delegate: Populate, TrackVariability, UpdateForTime,
// ProcessPropertyChange, MarkDirty, the value cache and instancing
// callbacks). This port feeds Hydra through UsdImagingStageSceneIndex only,
// so that part is not ported.

import { DataSourceLocatorSet as HdDataSourceLocatorSet, type ContainerDataSource as HdContainerDataSource } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { TF_WARN } from './tfDiagnostic.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** primAdapter.h:101-122 PopulationMode: which USD prims an adapter type is
 *  responsible for from a population and invalidation standpoint. */
export enum UsdImagingPopulationMode {
  /** The adapter is responsible only for USD prims of its registered type.
   *  Any descendent USD prims are managed independently. */
  RepresentsSelf,
  /** The adapter is responsible for USD prims of its registered type as
   *  well as any descendents of those prims. No population occurs for
   *  descendent prims. USD changes to descendent prims whose own
   *  PopulationMode is set to RepresentedByAncestor will be sent to this
   *  adapter. */
  RepresentsSelfAndDescendents,
  /** Changes to prims of this adapter's registered type are sent to the
   *  first ancestor prim whose adapter's PopulationMode value is
   *  RepresentsSelfAndDescendents. */
  RepresentedByAncestor,
}

/** primAdapter.h:52-962 (scene index API) */
export class UsdImagingPrimAdapter {
  /** PopulationMode enumerators as UsdImagingPrimAdapter::RepresentsSelf etc. */
  static readonly RepresentsSelf = UsdImagingPopulationMode.RepresentsSelf
  static readonly RepresentsSelfAndDescendents = UsdImagingPopulationMode.RepresentsSelfAndDescendents
  static readonly RepresentedByAncestor = UsdImagingPopulationMode.RepresentedByAncestor

  /** primAdapter.cpp:80-86 */
  getImagingSubprims(_prim: UsdPrim): string[] {
    TF_WARN(`Datasource support not yet added for adapter '${this.constructor.name}'`)
    return []
  }

  /** primAdapter.cpp:88-93 */
  getImagingSubprimType(_prim: UsdPrim, _subprim: string): string {
    return ''
  }

  /** primAdapter.cpp:95-102 */
  getImagingSubprimData(
    _prim: UsdPrim, _subprim: string, _stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    return undefined
  }

  /** primAdapter.cpp:104-117 */
  invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourcePrim.invalidate(prim, subprim, properties, invalidationType)
    }
    return new HdDataSourceLocatorSet()
  }

  /** primAdapter.cpp:119-123 */
  getPopulationMode(): UsdImagingPopulationMode {
    return UsdImagingPopulationMode.RepresentsSelf
  }

  /** primAdapter.cpp:125-136 */
  invalidateImagingSubprimFromDescendent(
    _prim: UsdPrim, descendentPrim: UsdPrim, subprim: string,
    properties: readonly string[], invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return this.invalidateImagingSubprim(descendentPrim, subprim, properties, invalidationType)
  }
}
