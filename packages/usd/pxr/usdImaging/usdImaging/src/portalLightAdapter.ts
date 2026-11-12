// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/portalLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/portalLightAdapter.h
// Copyright 2017, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/portalLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim. The portal light is not supported by
// UsdImagingDelegate (IsSupported returns false, portalLightAdapter.cpp:29-33).

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** portalLightAdapter.h */
export class UsdImagingPortalLightAdapter extends UsdImagingLightAdapter {
  /** portalLightAdapter.cpp:35-39 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** portalLightAdapter.cpp:41-49 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.light
    }

    return ''
  }
}
