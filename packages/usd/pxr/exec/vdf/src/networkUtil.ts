// Ported from OpenUSD 26.11.1: pxr/exec/vdf/networkUtil.cpp,
//  pxr/exec/vdf/networkUtil.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/networkUtil.h and networkUtil.cpp.
//
// Traversal utilities.

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import type { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { VdfSparseInputTraverser } from './sparseInputTraverser.ts'

/**
 * VdfIsSpeculating (networkUtil.cpp:33-46): whether maskedOutput is computed
 * via a speculation node (an upward sparse traversal).
 */
export function VdfIsSpeculating(maskedOutput: VdfMaskedOutput): boolean {
  let isSpeculating = false

  // Vdf_NetworkUtil_IsSpeculationNode (networkUtil.cpp:18-31).
  VdfSparseInputTraverser.traverse(
    [maskedOutput],
    (node: VdfNode): boolean => {
      if (node.isSpeculationNode()) {
        isSpeculating = true
        // stop traversal
        return false
      }
      // continue traversal
      return true
    })

  return isSpeculating
}

/**
 * VdfIsTopologicalSourceNode (networkUtil.cpp:48-89): searches nodeToFind via
 * input connections from startNode, not traversing past speculation nodes.
 * Returns [found, foundSpecNode]; the out-parameter foundSpecNode
 * (networkUtil.h:50-53) is the second element, true if a speculation node
 * was encountered.
 */
export function VdfIsTopologicalSourceNode(
  startNode: VdfNode,
  nodeToFind: VdfNode): [boolean, boolean] {
  let foundNode = false
  let foundSpecNode = false

  VdfTraverseTopologicalSourceNodes(startNode, (node: VdfNode): boolean => {
    let continueTraversal = true

    if (node === nodeToFind) foundNode = true

    // Record a speculation node and stop along this path.
    if (node.isSpeculationNode()) {
      foundSpecNode = true
      continueTraversal = false
    }

    return continueTraversal && !foundNode
  })

  return [foundNode, foundSpecNode]
}

/**
 * VdfGetAssociatedSourceOutput (networkUtil.cpp:91-101): the source of the
 * associated input's single connection, or null.
 */
export function VdfGetAssociatedSourceOutput(output: VdfOutput): VdfOutput | null {
  const assocInput = output.getAssociatedInput()
  if (assocInput && assocInput.getConnections().length === 1) {
    return assocInput.Get(0).getSourceOutput()
  }
  return null
}

/** VdfEmptyNodeCallback (networkUtil.cpp:103-106): does nothing. */
export function VdfEmptyNodeCallback(_node: VdfNode): void {}

/**
 * VdfTraverseTopologicalSourceNodes (networkUtil.h:73-109): visits nodes from
 * startNode along inputs, each at most once, pushing a node's inputs only
 * when callback returns true.
 */
export function VdfTraverseTopologicalSourceNodes(
  startNode: VdfNode,
  callback: (node: VdfNode) => boolean): void {
  const visited = new TfBits(startNode.getNetwork().getNodeCapacity())

  const stack: VdfNode[] = [startNode]

  while (stack.length) {
    const top = stack.pop()!

    const idx = VdfNode.getIndexFromId(top.getId())
    if (visited.isSet(idx)) continue
    visited.Set(idx)

    if (callback(top)) {
      for (const [, input] of top.getInputsIterator()) {
        for (const c of input.getConnections()) {
          stack.push(c.getSourceNode())
        }
      }
    }
  }
}
