// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/flattenLayerStack.cpp,
//  pxr/usd/usdUtils/flattenLayerStack.h, pxr/usd/usd/flattenUtils.cpp
// Copyright 2017, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/flattenLayerStack.{h,cpp} (OpenUSD 26.11.1).
//
// UsdUtilsFlattenLayerStack: flatten the root layer stack of a stage into a
// single anonymous layer. Upstream is a thin layer over UsdFlattenLayerStack
// (pxr/usd/usd/flattenUtils.cpp), which merges the layers of a PcpLayerStack
// field by field (flattenLayerStack.cpp:11-26).

import type { Layer } from 'typescript-usd/sdf'
import {
  FlattenLayerStack as UsdFlattenLayerStack,
  FlattenLayerStackResolveAssetPath as UsdFlattenLayerStackResolveAssetPath,
  type Stage as UsdStage,
} from 'typescript-usd/usd'

/**
 * UsdUtilsResolveAssetPathFn (flattenLayerStack.h:71-73): maps an asset path
 * authored in `sourceLayer` to the asset path written to the flattened layer.
 */
export type UsdUtilsResolveAssetPathFn = (sourceLayer: Layer, assetPath: string) => string

/**
 * UsdUtilsFlattenLayerStack (flattenLayerStack.cpp:28-46; Python
 * UsdUtils.FlattenLayerStack(stage, resolveAssetPathFn=, tag=)).
 *
 * The root layer stack of `stage` flattened into a new anonymous layer
 * whose tag is `tag`. Without `resolveAssetPathFn` (the overload of
 * flattenLayerStack.cpp:28-33) asset paths are anchored by
 * UsdUtilsFlattenLayerStackResolveAssetPath.
 */
export function UsdUtilsFlattenLayerStack(
  stage: UsdStage,
  options: { resolveAssetPathFn?: UsdUtilsResolveAssetPathFn, tag?: string } = {},
): Layer {
  // flattenLayerStack.cpp:28-33
  const resolveAssetPathFn = options.resolveAssetPathFn ?? UsdUtilsFlattenLayerStackResolveAssetPath
  const tag = options.tag ?? ''

  // flattenLayerStack.cpp:35-46: the layer stack of the pseudo-root's prim
  // index root node.
  const index = stage.getPrim('/')!.getPrimIndex()
  return UsdFlattenLayerStack(index.getRootNode().getLayerStack(), { resolveAssetPathFn, tag })
}

/**
 * UsdUtilsFlattenLayerStackResolveAssetPath (flattenLayerStack.cpp:48-54):
 * `assetPath` anchored to `sourceLayer`, or unchanged when anchoring has no
 * effect (UsdFlattenLayerStackResolveAssetPath).
 */
export function UsdUtilsFlattenLayerStackResolveAssetPath(sourceLayer: Layer, assetPath: string): string {
  return UsdFlattenLayerStackResolveAssetPath(sourceLayer, assetPath)
}
