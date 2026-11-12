// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/geometryLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/geometryLightAdapter.h
// Copyright 2017, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/geometryLightAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// The upstream adapter overrides only UsdImagingDelegate methods
// (IsSupported returns false, Populate, _RemovePrim;
// geometryLightAdapter.cpp:29-50), which are not ported (see primAdapter.ts).
// Its scene index behavior is UsdImagingLightAdapter's.

import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** geometryLightAdapter.h:25-48 */
export class UsdImagingGeometryLightAdapter extends UsdImagingLightAdapter {
}
