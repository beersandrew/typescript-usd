// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/sphereLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/sphereLightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/sphereLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim.

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** sphereLightAdapter.h */
export class UsdImagingSphereLightAdapter extends UsdImagingLightAdapter {
  /** sphereLightAdapter.cpp:28-32 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** sphereLightAdapter.cpp:34-44 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.sphereLight
    }

    return ''
  }
}
