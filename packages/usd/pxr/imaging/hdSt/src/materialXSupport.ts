// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialNetwork.cpp,
//  pxr/imaging/hdSt/renderDelegate.cpp
// Copyright 2017, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Storm's optional MaterialX support, chosen at runtime.
//
// OpenUSD 26.11.1 compiles Storm's MaterialX code only with
// PXR_ENABLE_MATERIALX_SUPPORT (hdSt/CMakeLists.txt:16-34), which also links
// hdMtlx and the MaterialX libraries: the HdSt_ApplyMaterialXFilter call in
// materialNetwork.cpp:1182-1188 and the "mtlx" material render context in
// renderDelegate.cpp:111-116,723-727 are compiled under
// PXR_MATERIALX_SUPPORT_ENABLED. Here the same choice is made when the
// program runs: importing `typescript-usd/hdSt/materialx` (materialx.ts)
// installs materialXFilter, so bundles of hd/hdSt/usdImaging hold no
// MaterialX modules unless that entry is imported. This module has no
// MaterialX dependency.

import type { MaterialNetwork2 as HdMaterialNetwork2, MaterialNode2 as HdMaterialNode2 } from 'typescript-usd/hd'
import type { HdSt_MaterialParam } from './materialParam.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'

/** The MaterialX entry points materialNetwork.cpp and renderDelegate.cpp
 *  call when PXR_MATERIALX_SUPPORT_ENABLED is set. */
export interface HdSt_MaterialXSupport {
  /** HdSt_ApplyMaterialXFilter (materialXFilter.h:38-46). Returns the
   *  generated MaterialX::ShaderPtr (opaque here), or null. */
  applyMaterialXFilter(
    hdNetwork: HdMaterialNetwork2,
    materialPath: string,
    terminalNode: HdMaterialNode2,
    terminalNodePath: string,
    materialParams: HdSt_MaterialParam[],
    resourceRegistry: HdStResourceRegistry,
  ): object | null
}

let _support: HdSt_MaterialXSupport | null = null

/** Installs (or with null removes) Storm's MaterialX support. */
export function HdSt_SetMaterialXSupport(support: HdSt_MaterialXSupport | null): void {
  _support = support
}

/** The installed MaterialX support: non-null is PXR_MATERIALX_SUPPORT_ENABLED. */
export function HdSt_GetMaterialXSupport(): HdSt_MaterialXSupport | null {
  return _support
}
