// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/coordSysAdapter.cpp,
//  pxr/usdImaging/usdImaging/coordSysAdapter.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/coordSysAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// Upstream UsdImagingCoordSysAdapter only overrides the UsdImagingDelegate
// side of UsdImagingPrimAdapter (IsSupported, Populate, TrackVariability,
// ProcessPrimResync, UpdateForTime, ProcessPropertyChange, MarkDirty,
// MarkTransformDirty, _RemovePrim; coordSysAdapter.cpp:30-129), none of the
// scene index API. Those overrides are not ported (see primAdapter.ts), so
// this class has the base class's scene index behavior, as upstream.
// Coordinate systems reach the scene index through
// UsdImagingCoordSysAPIAdapter (coordSysAPIAdapter.ts).

import { UsdImagingPrimAdapter } from './primAdapter.ts'

/** coordSysAdapter.h:22-96 */
export class UsdImagingCoordSysAdapter extends UsdImagingPrimAdapter {}
