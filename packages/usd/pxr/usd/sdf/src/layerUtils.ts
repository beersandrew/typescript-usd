// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layerUtils.cpp,
//  pxr/usd/sdf/layerUtils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfComputeAssetPathRelativeToLayer, ported from OpenUSD 26.11.1
// pxr/usd/sdf/layerUtils.{h,cpp}.

import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { TF_CODING_ERROR } from 'typescript-usd/tf'
import type { Layer } from './layer.ts'
import { createLayerIdentifier, splitLayerIdentifier } from './layerRegistry.ts'

/**
 * SdfComputeAssetPathRelativeToLayer (layerUtils.h:22-41;
 * layerUtils.cpp:64-194): the asset path anchored to the layer, keeping any
 * file format arguments. Relative paths anchor inside a package or packaged
 * layer; an anonymous layer identifier is returned as is; against an
 * anonymous layer the path is not anchored; otherwise it is the resolver's
 * identifier anchored to the layer's resolved path.
 */
export function SdfComputeAssetPathRelativeToLayer(anchor: Layer | undefined, assetPath: string): string {
  if (!anchor) {
    TF_CODING_ERROR('Invalid anchor layer')
    return ''
  }
  if (assetPath === '') {
    TF_CODING_ERROR('Layer path is empty')
    return ''
  }

  // Strip file format arguments, if present
  const { assetPath: strippedAssetPath, args: layerArgs } = splitLayerIdentifier(assetPath)
  if (strippedAssetPath === '') return ''

  if (strippedAssetPath.startsWith('anon:')) {
    return createLayerIdentifier(strippedAssetPath, layerArgs)
  }

  if (anchor.isAnonymous()) {
    return createLayerIdentifier(ArGetResolver().createIdentifier(strippedAssetPath), layerArgs)
  }

  // The package branch (layerUtils.cpp:117-183) and the anchored
  // identifier (layerUtils.cpp:193) are SdfLayer.resolveAsset's.
  return createLayerIdentifier(anchor.resolveAsset(strippedAssetPath), layerArgs)
}
