// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/gprimAdapter.cpp,
//  pxr/usdImaging/usdImaging/gprimAdapter.h,
//  pxr/usdImaging/usdImaging/instanceablePrimAdapter.h
// Copyright 2016, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/gprimAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API (gprimAdapter.h:35-45,
// gprimAdapter.cpp:67-77).
//
// Divergence: upstream UsdImagingGprimAdapter derives from
// UsdImagingInstanceablePrimAdapter (instanceablePrimAdapter.h:19-50), which
// only adds UsdImagingDelegate instancing utilities (ResolveCachePath,
// ResolveProxyPrimPath, ...) and no scene index API, so it is not ported and
// this class derives from UsdImagingPrimAdapter directly.
//
// Not ported (UsdImagingDelegate side, see primAdapter.ts): _AddRprim,
// TrackVariability, UpdateForTime, ProcessPropertyChange, MarkDirty,
// GetPoints/GetPrimvar/GetMaterialId and the static helpers used by the
// legacy value getters (GetColor, GetOpacity, GetImplicitBasis, ...).

import type { DataSourceLocatorSet as HdDataSourceLocatorSet } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** gprimAdapter.h:22-222: delegate support for UsdGeomGrims.
 *
 *  This adapter is provided as a base class for all adapters that want basic
 *  Gprim data support, such as visibility, doubleSided, extent, displayColor,
 *  displayOpacity, purpose, and transform. */
export class UsdImagingGprimAdapter extends UsdImagingPrimAdapter {
  /** gprimAdapter.cpp:67-77 */
  override invalidateImagingSubprim(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return UsdImagingDataSourceGprim.invalidate(
      prim, subprim, properties, invalidationType)
  }
}
