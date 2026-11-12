// Ported from OpenUSD 26.11.1: pxr/exec/ef/timeInputNode.cpp,
//  pxr/exec/ef/timeInputNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/timeInputNode.h and
// pxr/exec/ef/timeInputNode.cpp.

import { Token as TfToken } from 'typescript-usd/tf'

import { VdfOutputSpecs } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfRootNode } from 'typescript-usd/vdf'
import { VdfTokens } from 'typescript-usd/vdf'
import { EfTimeType } from './time.ts'

/**
 * EfTimeInputNode (timeInputNode.h:20-40): a root node which supplies a value
 * for time.
 */
export class EfTimeInputNode extends VdfRootNode {
  /** Constructor (timeInputNode.cpp:13-18). */
  constructor(network: VdfNetwork) {
    super(
      network,
      // TfToken(): vdf's VdfTokens holds plain strings.
      new VdfOutputSpecs().connector(EfTimeType, TfToken(VdfTokens.out)))
  }

  /**
   * Returns true if the given node is an EfTimeInputNode
   * (timeInputNode.h:30-32), an accelerated alternative to
   * IsA<EfTimeInputNode>().
   */
  static isATimeInputNode(node: VdfNode): boolean {
    return node.getNumInputs() === 0 && node instanceof EfTimeInputNode
  }
}
