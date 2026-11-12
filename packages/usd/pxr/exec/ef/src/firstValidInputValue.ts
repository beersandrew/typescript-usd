// Ported from OpenUSD 26.11.1: pxr/exec/ef/firstValidInputValue.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/firstValidInputValue.h.

import type { Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from 'typescript-usd/vdf'
import { VdfExecutionTypeRegistry } from 'typescript-usd/vdf'
import { VdfIterator } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

// Grants access to the node of a VdfContext (firstValidInputValue.h:29-33).
class _ContextAccess extends VdfIterator {
  getNode(context: VdfContext): VdfNode {
    return this._getNode(context)
  }
}

/**
 * EfGetFirstValidInputValue<Type> (firstValidInputValue.h:26-48): iterates
 * the inputs in registration order and returns the value of the first input
 * that provides one. If there is none, returns the fallback value for `type`.
 */
export function EfGetFirstValidInputValue<T>(type: TfType, context: VdfContext): T {
  // Iterate over all inputs, and return the first valid input value.
  const node = new _ContextAccess().getNode(context)
  for (const [name] of node.getInputsIterator()) {
    const value = context.getInputValuePtr<T>(type, name)
    if (value !== null) {
      return value
    }
  }

  // Ask the type registry for the fallback value to use.
  return VdfExecutionTypeRegistry.GetInstance().getFallback<T>(type)
}
