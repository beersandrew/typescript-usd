// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/pluginLightFilterAdapter.cpp,
//  pxr/usdImaging/usdImaging/pluginLightFilterAdapter.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/pluginLightFilterAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// The upstream adapter overrides only UsdImagingDelegate methods
// (IsSupported, Populate, _RemovePrim; pluginLightFilterAdapter.cpp:29-53),
// which are not ported (see primAdapter.ts). Its scene index behavior is
// UsdImagingLightFilterAdapter's.

import { UsdImagingLightFilterAdapter } from './lightFilterAdapter.ts'

/** pluginLightFilterAdapter.h:25-49 */
export class UsdImagingPluginLightFilterAdapter extends UsdImagingLightFilterAdapter {
}
