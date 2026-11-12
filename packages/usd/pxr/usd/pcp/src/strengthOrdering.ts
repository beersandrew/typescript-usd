// Ported from OpenUSD 26.11.1: pxr/usd/pcp/strengthOrdering.cpp,
//  pxr/usd/pcp/strengthOrdering.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Node strength ordering. Port of OpenUSD v26.08
// pxr/usd/pcp/strengthOrdering.{h,cpp}.

import { PcpArcType, pcpIsSpecializeArc } from './arc.ts'
import type { PcpNodeRef } from './node.ts'
import { pcpFindStartingNodeOfClassHierarchy, pcpIsPropagatedSpecializesNode } from './utils.ts'

// _OriginIsStronger (strengthOrdering.cpp:17-34): walk the graph under `node`
// in strength order looking for a or b.
function originIsStronger(node: PcpNodeRef, a: PcpNodeRef, b: PcpNodeRef): number {
  if (node === a) return -1
  if (node === b) return 1
  for (let child = node._firstChild(); child; child = child._nextSibling()) {
    const result = originIsStronger(child, a, b)
    if (result !== 0) return result
  }
  return 0
}

// _GetOriginRootNode (strengthOrdering.cpp:39-48).
function getOriginRootNode(node: PcpNodeRef): [PcpNodeRef, number] {
  let cur = node
  let dist = 0
  while (cur.getOriginNode() !== cur.getParentNode()) {
    cur = cur.getOriginNode()!
    ++dist
  }
  return [cur, dist]
}

// _OriginsAreNestedArcs (strengthOrdering.cpp:51-68).
function originsAreNestedArcs(a: PcpNodeRef, b: PcpNodeRef): boolean {
  const isNestedUnder = (x: PcpNodeRef, y: PcpNodeRef): boolean => {
    for (let n: PcpNodeRef | null = x; n;) {
      if (n === y) return true
      n = pcpIsPropagatedSpecializesNode(n) ? n.getOriginNode() : n.getParentNode()
    }
    return false
  }
  return isNestedUnder(a, b) || isNestedUnder(b, a)
}

// _GetNamespaceDepthForClassHierarchy (strengthOrdering.cpp:72-85).
function namespaceDepthForClassHierarchy(n: PcpNodeRef): number {
  let [instanceNode] = pcpFindStartingNodeOfClassHierarchy(n)
  while (instanceNode.getArcType() === PcpArcType.Relocate) {
    instanceNode = instanceNode.getParentNode()!
  }
  return instanceNode.getNamespaceDepth()
}

const sameSite = (a: PcpNodeRef, b: PcpNodeRef): boolean =>
  a.getLayerStack() === b.getLayerStack() &&
  a.getPath().pathString === b.getPath().pathString

// PcpCompareSiblingNodeStrength (strengthOrdering.cpp:87-302). Returns -1 if
// a is stronger than b, 1 if weaker, 0 if equivalent.
export function pcpCompareSiblingNodeStrength(a: PcpNodeRef, b: PcpNodeRef): number {
  if (a.getParentNode() !== b.getParentNode()) return 0
  if (a === b) return 0

  if (a.getArcType() < b.getArcType()) return -1
  if (a.getArcType() > b.getArcType()) return 1

  if (pcpIsSpecializeArc(a.getArcType())) {
    const [aOriginRoot, aOriginRootDist] = getOriginRootNode(a)
    const [bOriginRoot, bOriginRootDist] = getOriginRootNode(b)

    if (!originsAreNestedArcs(aOriginRoot, bOriginRoot)) {
      if (a.getNamespaceDepth() > b.getNamespaceDepth()) return -1
      if (a.getNamespaceDepth() < b.getNamespaceDepth()) return 1
    }

    const aOrigin = a.getOriginNode()!
    const bOrigin = b.getOriginNode()!
    const aIsAuthoredArc = aOrigin === a.getParentNode()
    const bIsAuthoredArc = bOrigin === b.getParentNode()

    if (aOrigin === bOrigin) {
      if (!aIsAuthoredArc && !bIsAuthoredArc) {
        const aIsImplied = !sameSite(a, aOrigin)
        const bIsImplied = !sameSite(b, bOrigin)
        if (aIsImplied && !bIsImplied) return -1
        if (!aIsImplied && bIsImplied) return 1
        return 0
      }
    } else {
      if (aOriginRoot !== bOriginRoot) {
        return originIsStronger(a.getRootNode(), aOriginRoot, bOriginRoot)
      }

      const aDepth = aIsAuthoredArc ? 0 : namespaceDepthForClassHierarchy(aOrigin)
      const bDepth = bIsAuthoredArc ? 0 : namespaceDepthForClassHierarchy(bOrigin)
      if (aDepth < bDepth) return -1
      if (bDepth < aDepth) return 1

      if (aOriginRootDist > bOriginRootDist) return -1
      if (bOriginRootDist > aOriginRootDist) return 1

      const rootLayerStack = a.getRootNode().getLayerStack()
      if (a.getLayerStack() === rootLayerStack && b.getLayerStack() === rootLayerStack &&
          !aIsAuthoredArc && !bIsAuthoredArc) {
        const aIsImplied = !sameSite(a, aOrigin)
        const bIsImplied = !sameSite(b, bOrigin)
        if (aIsImplied && !bIsImplied) return -1
        if (!aIsImplied && bIsImplied) return 1
      }

      return originIsStronger(a.getRootNode(), aOrigin, bOrigin)
    }
  } else {
    if (a.getNamespaceDepth() > b.getNamespaceDepth()) return -1
    if (a.getNamespaceDepth() < b.getNamespaceDepth()) return 1

    const aOrigin = a.getOriginNode()
    const bOrigin = b.getOriginNode()
    if (aOrigin !== bOrigin && aOrigin && bOrigin) {
      const result = originIsStronger(a.getRootNode(), aOrigin, bOrigin)
      if (result < 0) return -1
      if (result > 0) return 1
    }
  }

  if (a.getSiblingNumAtOrigin() < b.getSiblingNumAtOrigin()) return -1
  if (a.getSiblingNumAtOrigin() > b.getSiblingNumAtOrigin()) return 1
  return 0
}

function collectNodesFromNodeToRoot(node: PcpNodeRef): PcpNodeRef[] {
  const nodes: PcpNodeRef[] = []
  for (let n: PcpNodeRef | null = node; n; n = n.getParentNode()) nodes.push(n)
  return nodes
}

// _CompareNodeStrength (strengthOrdering.cpp:316-352).
function compareNodeStrength(
  a: PcpNodeRef, aNodes: PcpNodeRef[], b: PcpNodeRef, bNodes: PcpNodeRef[],
): number {
  if (bNodes.length < aNodes.length) return -compareNodeStrength(b, bNodes, a, aNodes)
  let ai = aNodes.length - 1
  let bi = bNodes.length - 1
  while (ai >= 0 && aNodes[ai] === bNodes[bi]) { ai--; bi-- }
  if (ai < 0) return -1
  return pcpCompareSiblingNodeStrength(aNodes[ai]!, bNodes[bi]!)
}

// PcpCompareNodeStrength (strengthOrdering.cpp:354-371).
export function pcpCompareNodeStrength(a: PcpNodeRef, b: PcpNodeRef): number {
  if (a.getRootNode() !== b.getRootNode()) return 0
  if (a === b) return 0
  return compareNodeStrength(
    a, collectNodesFromNodeToRoot(a), b, collectNodesFromNodeToRoot(b))
}

// PcpCompareSiblingPayloadNodeStrength (strengthOrdering.cpp:379-410): the
// strength of a payload arc that has not been added yet, relative to an
// existing child of the would-be parent.
export function pcpCompareSiblingPayloadNodeStrength(
  payloadParent: PcpNodeRef, payloadArcNum: number, siblingNode: PcpNodeRef,
): number {
  if (payloadParent !== siblingNode.getParentNode()) return 0
  if (PcpArcType.Payload < siblingNode.getArcType()) return -1
  if (PcpArcType.Payload > siblingNode.getArcType()) return 1
  if (payloadParent.getNamespaceDepth() > siblingNode.getNamespaceDepth()) return -1
  if (payloadParent.getNamespaceDepth() < siblingNode.getNamespaceDepth()) return 1
  if (payloadArcNum < siblingNode.getSiblingNumAtOrigin()) return -1
  if (payloadArcNum > siblingNode.getSiblingNumAtOrigin()) return 1
  return 0
}
