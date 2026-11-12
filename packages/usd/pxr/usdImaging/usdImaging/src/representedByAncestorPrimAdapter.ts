// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/representedByAncestorPrimAdapter.cpp,
//  pxr/usdImaging/usdImaging/representedByAncestorPrimAdapter.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/representedByAncestorPrimAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API (the UsdImagingDelegate overrides
// are not ported, see primAdapter.ts).

import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingPopulationMode, UsdImagingPrimAdapter } from './primAdapter.ts'

/** representedByAncestorPrimAdapter.h:22-100: base class for all prim
 *  adapters which only want to indicate that an ancestor prim is
 *  responsible for them. */
export class UsdImagingRepresentedByAncestorPrimAdapter extends UsdImagingPrimAdapter {
  /** representedByAncestorPrimAdapter.cpp:20-25 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return []
  }

  /** representedByAncestorPrimAdapter.cpp:26-30 */
  override getPopulationMode(): UsdImagingPopulationMode {
    return UsdImagingPopulationMode.RepresentedByAncestor
  }
}
