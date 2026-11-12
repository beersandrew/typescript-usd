// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/pluginLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/pluginLightAdapter.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/pluginLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim.

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingLightAdapter } from './lightAdapter.ts'

/** pluginLightAdapter.h */
export class UsdImagingPluginLightAdapter extends UsdImagingLightAdapter {
  /** pluginLightAdapter.cpp:28-32 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** pluginLightAdapter.cpp:34-44 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.pluginLight
    }

    return ''
  }
}
