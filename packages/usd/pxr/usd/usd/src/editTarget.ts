// Ported from OpenUSD 26.11.1: pxr/usd/usd/editTarget.cpp,
//  pxr/usd/usd/editTarget.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public UsdEditTarget counterpart (pxr/usd/usd/editTarget.{h,cpp}).

import { Layer, SDF_LAYER_OFFSET_IDENTITY, LayerOffset as SdfLayerOffset } from 'typescript-usd/sdf'
import { MapFunction as PcpMapFunction, Node as PcpNode } from 'typescript-usd/pcp'
import { SdfPath } from 'typescript-usd/sdf/path'

export class UsdEditTarget {
  readonly #layer: Layer | undefined
  #mapping: PcpMapFunction

  constructor(layer?: Layer, nodeOrOffset?: PcpNode | SdfLayerOffset) {
    this.#layer = layer
    if (!layer) {
      // Null edit targets still map paths unchanged (editTarget.h:112-113).
      this.#mapping = PcpMapFunction.identity()
    } else if (nodeOrOffset && 'mapToRoot' in nodeOrOffset) {
      const node = nodeOrOffset
      const layerOffset = node.layerStack.layers.find(entry => entry.layer === layer)?.offset
        ?? SDF_LAYER_OFFSET_IDENTITY
      this.#mapping = node.mapToRoot.evaluate().composeOffset(layerOffset)
    } else {
      const offset = nodeOrOffset ?? SDF_LAYER_OFFSET_IDENTITY
      this.#mapping = PcpMapFunction.create([['/', '/']], offset)
    }
  }

  // UsdEditTarget::ForLocalDirectVariant (editTarget.cpp:108-125): edits go
  // to the variant selection path's specs in a local layer.
  static forLocalDirectVariant(layer: Layer, varSelPath: string): UsdEditTarget {
    const path = SdfPath.fromString(varSelPath)
    if (!path.isPrimVariantSelectionPath()) {
      throw new Error(`Provided varSelPath <${varSelPath}> must be a prim variant selection path.`)
    }
    // Create a map function that represents the variant selections.
    const target = new UsdEditTarget(layer)
    target.#mapping = PcpMapFunction.create(
      [['/', '/'], [varSelPath, path.stripAllVariantSelections().pathString]],
      SDF_LAYER_OFFSET_IDENTITY)
    return target
  }

  // operator== (editTarget.cpp:127-131).
  equals(other: UsdEditTarget): boolean {
    return this.#layer === other.#layer && this.#mapping.equals(other.#mapping)
  }

  isNull(): boolean { return this.#layer === undefined }
  isValid(): boolean { return this.#layer !== undefined }
  getLayer(): Layer | undefined { return this.#layer }
  getMapFunction(): PcpMapFunction { return this.#mapping }

  mapToSpecPath(scenePath: string): string {
    return this.#mapping.mapTargetToSource(SdfPath.fromString(scenePath)).pathString
  }

  composeOver(weaker: UsdEditTarget): UsdEditTarget {
    const layer = this.#layer ?? weaker.#layer
    const result = new UsdEditTarget(layer)
    result.#mapping = this.#mapping.compose(weaker.#mapping)
    return result
  }
}
