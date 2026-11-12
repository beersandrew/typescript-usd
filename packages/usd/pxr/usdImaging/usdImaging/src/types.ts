// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/types.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/types.h (OpenUSD 26.11.1).

/** types.h:14-21: given to an invalidation call to indicate whether the
 *  property was added or removed or whether one of its fields changed. */
export enum UsdImagingPropertyInvalidationType {
  Update,
  Resync,
}
