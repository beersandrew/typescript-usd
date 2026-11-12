// Ported from OpenUSD 26.11.1: pxr/exec/vdf/rootNode.cpp,
//  pxr/exec/vdf/rootNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/rootNode.h and rootNode.cpp.
//
// Base class for root nodes: nodes without inputs whose outputs are
// initialized manually. Root nodes cannot be computed.

import { TF_CODING_ERROR } from 'typescript-usd/tf'

import { VdfInputSpecs, type VdfOutputSpecs } from './connectorSpecs.ts'
import type { VdfContext } from './context.ts'
import type { VdfNetwork } from './network.ts'
import { VdfNode } from './node.ts'

export abstract class VdfRootNode extends VdfNode {
  /**
   * IsARootNode (rootNode.h:36): an accelerated IsA<VdfRootNode>().
   */
  static isARootNode(node: VdfNode): boolean {
    return node.getNumInputs() === 0 && node instanceof VdfRootNode
  }

  /** VdfRootNode(network, outputSpecs) (rootNode.h:44): no inputs. */
  protected constructor(network: VdfNetwork, outputSpecs: VdfOutputSpecs) {
    super(network, new VdfInputSpecs(), outputSpecs)
  }

  /** Compute (rootNode.cpp:16-22): root nodes can't be computed. */
  override compute(_context: VdfContext): void {
    TF_CODING_ERROR(
      `The Compute() method can't be called on VdfRootNode '${this.getDebugName()}'.`)
  }
}
