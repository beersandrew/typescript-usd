// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/distantLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/distantLightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/distantLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim.

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** distantLightAdapter.h */
export class UsdImagingDistantLightAdapter extends UsdImagingLightAdapter {
  /** distantLightAdapter.cpp:28-32 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** distantLightAdapter.cpp:34-43 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.distantLight
    }

    return ''
  }
}
