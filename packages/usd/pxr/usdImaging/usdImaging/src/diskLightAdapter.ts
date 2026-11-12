// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/diskLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/diskLightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/diskLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim.

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** diskLightAdapter.h */
export class UsdImagingDiskLightAdapter extends UsdImagingLightAdapter {
  /** diskLightAdapter.cpp:28-32 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** diskLightAdapter.cpp:34-43 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.diskLight
    }

    return ''
  }
}
