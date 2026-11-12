// Ported from OpenUSD 26.11.1: pxr/usd/pcp/instancing.cpp,
//  pxr/usd/pcp/instancing.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Instancing helpers. Port of OpenUSD v26.08 pxr/usd/pcp/instancing.{h,cpp}.

import { pcpComposeSiteHasSpecs } from './composeSite.ts'
import { pcpReadField } from './layerStackIdentifier.ts'
import { type PcpNodeRef, pcpGetSubtreeRange } from './node.ts'
import type { PcpPrimIndex } from './primIndex.ts'

export interface PcpInstanceableVisitor {
  visit(node: PcpNodeRef, nodeIsInstanceable: boolean): boolean | void
}

// Pcp_InstancingIsEnabled (instancing.cpp:43-57): USD mode only (the
// PCP_OVERRIDE_INSTANCEABLE default).
export function pcpInstancingIsEnabled(primIndex: PcpPrimIndex): boolean {
  return primIndex.isUsd()
}

// Pcp_ChildNodeIsInstanceable (instancing.h).
export function pcpChildNodeIsInstanceable(node: PcpNodeRef): boolean {
  return node.hasTransitiveDirectDependency() && node.canContributeSpecs() && node.hasSpecs
}

// Pcp_ChildNodeIsDirectOrInDirectArcSubtree (instancing.h).
export function pcpChildNodeIsDirectOrInDirectArcSubtree(node: PcpNodeRef): boolean {
  return node.isRootNode() || node.hasTransitiveDirectDependency()
}

// Pcp_ChildNodeInstanceableChanged (instancing.h).
export function pcpChildNodeInstanceableChanged(node: PcpNodeRef): boolean {
  return pcpChildNodeIsDirectOrInDirectArcSubtree(node) &&
    pcpComposeSiteHasSpecs(node.getLayerStack(), node.getPath()) !== node.hasSpecs
}

function traverseStrongToWeakHelper(node: PcpNodeRef, visitor: PcpInstanceableVisitor): void {
  if (node.isCulled) return
  if (!visitor.visit(node, pcpChildNodeIsInstanceable(node))) return
  for (let child = node._firstChild(); child; child = child._nextSibling()) {
    traverseStrongToWeakHelper(child, visitor)
  }
}

// Pcp_TraverseInstanceableStrongToWeak (instancing.h). The visitor returns
// true to continue into a node's children.
export function pcpTraverseInstanceableStrongToWeak(
  primIndex: PcpPrimIndex, visitor: PcpInstanceableVisitor,
): void {
  const root = primIndex.getRootNode()
  if (!visitor.visit(root, false)) return
  for (let child = root._firstChild(); child; child = child._nextSibling()) {
    traverseStrongToWeakHelper(child, visitor)
  }
}

function traverseWeakToStrongHelper(node: PcpNodeRef, visitor: PcpInstanceableVisitor): void {
  if (node.isCulled) return
  const isInstanceable = pcpChildNodeIsInstanceable(node)
  for (let child = node._lastChild(); child; child = child._prevSibling()) {
    traverseWeakToStrongHelper(child, visitor)
  }
  visitor.visit(node, isInstanceable)
}

// Pcp_TraverseInstanceableWeakToStrong (instancing.h).
export function pcpTraverseInstanceableWeakToStrong(
  subtreeRoot: PcpNodeRef, visitor: PcpInstanceableVisitor,
): void {
  if (subtreeRoot.isRootNode()) {
    for (let child = subtreeRoot._lastChild(); child; child = child._prevSibling()) {
      traverseWeakToStrongHelper(child, visitor)
    }
    visitor.visit(subtreeRoot, false)
  } else {
    traverseWeakToStrongHelper(subtreeRoot, visitor)
  }
}

// Pcp_PrimIndexIsInstanceable (instancing.cpp:59-97).
export function pcpPrimIndexIsInstanceable(primIndex: PcpPrimIndex): boolean {
  if (!pcpInstancingIsEnabled(primIndex)) return false
  let hasInstanceableData = false
  pcpTraverseInstanceableStrongToWeak(primIndex, {
    visit(_node, nodeIsInstanceable) {
      if (nodeIsInstanceable) hasInstanceableData = true
      return !hasInstanceableData
    },
  })
  if (!hasInstanceableData) return false
  for (const node of pcpGetSubtreeRange(primIndex.getRootNode())) {
    if (!node.canContributeSpecs()) continue
    const path = node.getPath().pathString
    for (const { layer } of node.getLayerStack().layers) {
      const value = pcpReadField(layer, path, 'instanceable')
      if (value !== undefined && value !== null) return value === true
    }
  }
  return false
}
