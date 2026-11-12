// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/prototypeSceneIndexUtils.cpp,
//  pxr/usdImaging/usdImaging/prototypeSceneIndexUtils.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/prototypeSceneIndexUtils.{h,cpp}
// (OpenUSD 26.11.1).

import { PrimTypeTokens as HdPrimTypeTokens } from 'typescript-usd/hd'

/** prototypeSceneIndexUtils.cpp:14-16 */
const nonRenderablePrimTypes = new Set<string>([
  HdPrimTypeTokens.material,
])

/** prototypeSceneIndexUtils.h / .cpp:18-31 namespace
 *  UsdImaging_PrototypeSceneIndexUtils. */
export const UsdImaging_PrototypeSceneIndexUtils = {
  /** prototypeSceneIndexUtils.cpp:21-28. Returns true if the prim type
   *  is renderable (non-empty and not a material). */
  isRenderablePrimType(primType: string): boolean {
    if (!primType) {
      return false
    }
    return !nonRenderablePrimTypes.has(primType)
  },
}
