// Ported from OpenUSD 26.11.1: pxr/exec/ef/leafNode.cpp,
//  pxr/exec/ef/leafNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/leafNode.h and
// pxr/exec/ef/leafNode.cpp.

import { TF_FATAL_ERROR, Token as TfToken, Type as TfType } from 'typescript-usd/tf'

import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'

/** EF_LEAF_TOKENS (leafNode.h:21-24, leafNode.cpp:21). */
export const EfLeafTokens = Object.freeze({
  in: TfToken('in'),
  allTokens: Object.freeze([TfToken('in')]) as readonly TfToken[],
})

/**
 * EfLeafNode (leafNode.h:35-80): a terminal node, which is never executed.
 * Leaf nodes are visited during invalidation; invalidation callbacks on them
 * send downstream invalidation notification.
 */
export class EfLeafNode extends VdfNode {
  /**
   * Returns true if the given node is an EfLeafNode (leafNode.h:40-42), an
   * accelerated alternative to IsA<EfLeafNode>().
   */
  static isALeafNode(node: VdfNode): boolean {
    return node.getNumOutputs() === 0 && node instanceof EfLeafNode
  }

  /**
   * If `node` is an EfLeafNode, returns it as an EfLeafNode; otherwise null
   * (leafNode.h:46-61).
   */
  static asALeafNode(node: VdfNode | null): EfLeafNode | null {
    if (node && node.getNumOutputs() === 0) {
      return node instanceof EfLeafNode ? node : null
    }
    return null
  }

  /**
   * Returns the single output the leaf node sources its value from, or null
   * if the leaf node is not connected (leafNode.h:85-93).
   */
  static getSourceOutput(node: VdfNode): VdfOutput | null {
    const input = _GetFirstInput(node)
    if (input && input.getNumConnections() > 0) {
      return input.Get(0).getSourceOutput()
    }
    return null
  }

  /**
   * Returns the single masked output the leaf node sources its value from,
   * or an invalid masked output if not connected (leafNode.h:95-104).
   */
  static getSourceMaskedOutput(node: VdfNode): VdfMaskedOutput {
    const input = _GetFirstInput(node)
    if (input && input.getNumConnections() > 0) {
      return input.Get(0).getSourceMaskedOutput()
    }
    return new VdfMaskedOutput()
  }

  /** Constructor (leafNode.cpp:23-33). */
  constructor(network: VdfNetwork, inputType: TfType) {
    super(
      network,
      new VdfInputSpecs()
        .readConnector(inputType, EfLeafTokens.in),
      new VdfOutputSpecs())
  }

  /**
   * Because of the way leaf nodes are used, this method should never be
   * called (leafNode.cpp:37-42).
   */
  override compute(_context: VdfContext): void {
    TF_FATAL_ERROR("This method shouldn't be called.")
  }
}

// node.GetInputsIterator().begin()->second (leafNode.h:88, 99).
function _GetFirstInput(node: VdfNode) {
  for (const [, input] of node.getInputsIterator()) {
    return input
  }
  return null
}

/** TfType::Define<EfLeafNode>() (leafNode.cpp:16-19). */
export const EfLeafNodeType: TfType = TfType.define('EfLeafNode')
