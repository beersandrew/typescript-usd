// Ported from OpenUSD 26.11.1: pxr/usd/usd/resolveTarget.cpp,
//  pxr/usd/usd/resolveTarget.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdResolveTarget: OpenUSD v26.11.1 pxr/usd/usd/resolveTarget.{h,cpp}.
// Like upstream, targets retain an expanded prim index and do not subscribe
// to changes. Consumers must recreate targets after a prim resync.
import type { Node as PcpNode, PrimIndex as PcpPrimIndex } from 'typescript-usd/pcp'
import type { Layer } from 'typescript-usd/sdf'

interface ResolveRange {
  index: PcpPrimIndex
  nodes: readonly PcpNode[]
  startNode: number
  startLayer: number
  stopNode: number
  stopLayer: number
}
const ranges = new WeakMap<UsdResolveTarget, ResolveRange>()

export class UsdResolveTarget {
  isNull(): boolean { return !ranges.has(this) }
  getPrimIndex(): PcpPrimIndex | null { return ranges.get(this)?.index ?? null }
  getStartNode(): PcpNode | null {
    const range = ranges.get(this)
    return range?.nodes[range.startNode] ?? null
  }
  getStopNode(): PcpNode | null {
    const range = ranges.get(this)
    return range?.nodes[range.stopNode] ?? null
  }
  getStartLayer(): Layer | null {
    const range = ranges.get(this)
    return (range?.nodes[range.startNode]?.layerStack.layers[range.startLayer]?.layer as Layer | undefined) ?? null
  }
  getStopLayer(): Layer | null {
    const range = ranges.get(this)
    return (range?.nodes[range.stopNode]?.layerStack.layers[range.stopLayer]?.layer as Layer | undefined) ?? null
  }
}

// Counterpart of the private constructors, called only by Prim and composition
// arcs. Start is inclusive; stop is exclusive, even within one layer stack.
export function _makeUsdResolveTarget(
  index: PcpPrimIndex, startNode: PcpNode, startLayer?: Layer | null,
  stopNode?: PcpNode | null, stopLayer?: Layer | null,
): UsdResolveTarget {
  const target = new UsdResolveTarget()
  const nodes = [...index.getNodeRange()]
  ranges.set(target, {
    index, nodes,
    startNode: nodes.findIndex(node => node.equals(startNode)),
    startLayer: startLayer ? startNode.layerStack.layers.findIndex(entry => entry.layer === startLayer) : 0,
    stopNode: stopNode ? nodes.findIndex(node => node.equals(stopNode)) : nodes.length,
    stopLayer: stopNode && stopLayer ? stopNode.layerStack.layers.findIndex(entry => entry.layer === stopLayer) : 0,
  })
  return target
}

/** @internal Usd_Resolver's bounded site traversal (resolver.cpp:54-140). */
export function _usdResolveTargetIncludes(
  target: UsdResolveTarget | undefined, node: number, layer: number,
): boolean {
  const range = target && ranges.get(target)
  return !range || ((node > range.startNode || node === range.startNode && layer >= range.startLayer) &&
    (node < range.stopNode || node === range.stopNode && layer < range.stopLayer))
}
