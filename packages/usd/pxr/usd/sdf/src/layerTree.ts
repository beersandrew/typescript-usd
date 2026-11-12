// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layerTree.cpp,
//  pxr/usd/sdf/layerTree.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { Layer } from './layer.ts'
import { SDF_LAYER_OFFSET_IDENTITY, type SdfLayerOffset } from './layerOffset.ts'

/** Immutable recursive sublayer structure. OpenUSD v26.11.1
 * sdf/layerTree.h:26-77 and layerTree.cpp:20-60. Tree handles retain their
 * structure across layer-stack recomputation. Layer handles are weak, as in
 * SdfLayerHandle; retaining a tree must not retain an otherwise unused layer.
 * The handle parameter accommodates the structural Sdf layer interface used by Pcp.
 */
export class SdfLayerTree<TLayer extends object = Layer> {
  private readonly children: readonly SdfLayerTree<TLayer>[]
  private readonly layer: WeakRef<TLayer> | undefined
  private readonly offset: SdfLayerOffset
  private constructor(layer: TLayer | undefined, childTrees: readonly SdfLayerTree<TLayer>[], cumulativeOffset: SdfLayerOffset) {
    this.layer = layer ? new WeakRef(layer) : undefined
    this.children = Object.freeze([...childTrees])
    this.offset = Object.freeze({...cumulativeOffset})
    Object.freeze(this)
  }
  static new<TLayer extends object = Layer>(layer: TLayer | undefined, childTrees: readonly SdfLayerTree<TLayer>[], cumulativeOffset: SdfLayerOffset = SDF_LAYER_OFFSET_IDENTITY): SdfLayerTree<TLayer> {
    return new SdfLayerTree(layer, childTrees, cumulativeOffset)
  }
  getLayer(): TLayer | undefined { return this.layer?.deref() }
  getOffset(): SdfLayerOffset { return this.offset }
  getChildTrees(): readonly SdfLayerTree<TLayer>[] { return this.children }
}
