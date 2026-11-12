// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/rectLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/rectLightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/rectLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim.

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** rectLightAdapter.h */
export class UsdImagingRectLightAdapter extends UsdImagingLightAdapter {
  /** rectLightAdapter.cpp:29-33 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** rectLightAdapter.cpp:35-45 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.rectLight
    }

    return ''
  }
}
