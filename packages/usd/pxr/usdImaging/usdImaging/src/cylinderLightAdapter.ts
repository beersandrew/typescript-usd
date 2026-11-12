// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/cylinderLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/cylinderLightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/cylinderLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim.

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** cylinderLightAdapter.h */
export class UsdImagingCylinderLightAdapter extends UsdImagingLightAdapter {
  /** cylinderLightAdapter.cpp:28-32 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** cylinderLightAdapter.cpp:34-44 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.cylinderLight
    }

    return ''
  }
}
