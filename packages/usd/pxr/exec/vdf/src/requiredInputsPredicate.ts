// Ported from OpenUSD 26.11.1: pxr/exec/vdf/requiredInputsPredicate.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/requiredInputsPredicate.h.
//
// Determines whether a given input value is needed to fulfill the input
// dependencies required by a node.

import type { VdfInput } from './input.ts'
import type { VdfNode } from './node.ts'

// _Selector (requiredInputsPredicate.h:74-78).
enum _Selector {
  NoReads,
  AllReads,
  OneRead,
}

export class VdfRequiredInputsPredicate {
  private readonly _selector: _Selector
  private readonly _node: VdfNode
  private readonly _oneRead: VdfInput | null

  private constructor(selector: _Selector, node: VdfNode, oneRead: VdfInput | null) {
    this._selector = selector
    this._node = node
    this._oneRead = oneRead
  }

  /** AllReads (requiredInputsPredicate.h:30): all read inputs are required. */
  static allReads(node: VdfNode): VdfRequiredInputsPredicate {
    return new VdfRequiredInputsPredicate(_Selector.AllReads, node, null)
  }

  /** NoReads (requiredInputsPredicate.h:36): no read input is required. */
  static noReads(node: VdfNode): VdfRequiredInputsPredicate {
    return new VdfRequiredInputsPredicate(_Selector.NoReads, node, null)
  }

  /** OneRead (requiredInputsPredicate.h:42): one specific read input is required. */
  static oneRead(node: VdfNode, input: VdfInput): VdfRequiredInputsPredicate {
    return new VdfRequiredInputsPredicate(_Selector.OneRead, node, input)
  }

  /**
   * IsRequiredRead (requiredInputsPredicate.h:51-58). Read/writes and
   * prerequisite inputs are not required reads.
   */
  isRequiredRead(input: VdfInput): boolean {
    return this._selector !== _Selector.NoReads &&
      !input.getAssociatedOutput() &&
      !input.getSpec().isPrerequisite() &&
      (this._selector === _Selector.AllReads ||
        (this._oneRead === input && input.getNode() === this._node))
  }

  /** HasRequiredReads (requiredInputsPredicate.h:62). */
  hasRequiredReads(): boolean {
    return this._selector !== _Selector.NoReads
  }

  /** RequiresAllReads (requiredInputsPredicate.h:68). */
  requiresAllReads(): boolean {
    return this._selector === _Selector.AllReads
  }
}
