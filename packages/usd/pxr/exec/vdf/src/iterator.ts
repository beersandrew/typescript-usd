// Ported from OpenUSD 26.11.1: pxr/exec/vdf/iterator.cpp,
//  pxr/exec/vdf/iterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/iterator.h and iterator.cpp.

import { TF_CODING_ERROR } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfContext } from './context.ts'
import { VDF_FATAL_ERROR } from './error.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import type { VdfScheduledOutputCallback } from './types.ts'
import type { VdfVector } from './vector.ts'

/**
 * Base class for libVdf iterators. Iterators can derive from this class to
 * have access to restricted API from the VdfContext (iterator.h:33).
 *
 * The protected helpers are also used by the composing iterators
 * (VdfMaskedIterator, VdfWeightedIterator), which hold another iterator.
 */
export abstract class VdfIterator {
  /** Returns the current node being run (iterator.h:43-45). */
  protected _getNode(context: VdfContext): VdfNode {
    return context._getNode()
  }

  /** Returns the executor for the given context (iterator.h:49-51). */
  protected _getExecutor(context: VdfContext): VdfExecutorInterface {
    return context._getExecutor()
  }

  /**
   * Returns a vector for reading an input value, or null if no value is
   * flowing across the given `connection`, or if the data requested with
   * `mask` is unavailable (iterator.cpp:18-25).
   */
  protected _getInputValue(
    context: VdfContext,
    connection: VdfConnection,
    mask: VdfMask,
  ): VdfVector | null {
    return this._getExecutor(context)._getInputValue(connection, mask)
  }

  /**
   * Returns the cached output value for a given connection, or issues an
   * error message if a cache value is not available (iterator.cpp:27-43).
   */
  protected _getRequiredInputValue(
    context: VdfContext,
    connection: VdfConnection,
    mask: VdfMask,
  ): VdfVector {
    const value = this._getInputValue(context, connection, mask)
    if (!value) {
      VDF_FATAL_ERROR(connection.getTargetInput().getNode(),
        'No input cache available for ' +
        connection.getDebugName() +
        ', requested with mask ' +
        mask.getRLEString())
    }

    return value
  }

  /**
   * Returns the output for writing based on the `name` provided: the
   * associated output of the input named `name`, if it exists, otherwise the
   * output named `name`. If `name` is the empty token, returns the single
   * output on the current node. Issues a coding error if the required output
   * does not exist (iterator.cpp:45-75).
   */
  protected _getRequiredOutputForWriting(context: VdfContext, name: string): VdfOutput | null {
    const node = this._getNode(context)

    // If no input name has been provided, find the only output on the current
    // node.
    let output: VdfOutput | null = null
    if (name === '') {
      output = node.GetOutput()
    }

    // Find the named input on the current node, and use its associated output.
    // If there is no associated output, move on to finding the named output
    // instead.
    else {
      const input = node.getInput(name)
      output = input && input.getAssociatedOutput()
        ? input.getAssociatedOutput()
        : node.getOptionalOutput(name)
    }

    // Issue a coding error if the output has not been found.
    if (!output) {
      TF_CODING_ERROR('No output available to write to.')
    }

    return output
  }

  /**
   * Returns a vector for writing an output value into. Null means that a data
   * entry has not been created for the given `output`, which is not
   * necessarily an error (iterator.cpp:77-83).
   */
  protected _getOutputValueForWriting(context: VdfContext, output: VdfOutput): VdfVector | null {
    return this._getExecutor(context)._getOutputValueForWriting(output)
  }

  /**
   * Retrieves the request and affects masks of the given `output`, which must
   * be an output on the current node (iterator.cpp:85-93). Returns
   * [isScheduled, requestMask, affectsMask]; upstream returns the masks
   * through pointer out-parameters.
   */
  protected _getOutputMasks(
    context: VdfContext,
    output: VdfOutput,
  ): [boolean, VdfMask | null, VdfMask | null] {
    return context._getOutputMasks(output)
  }

  /**
   * Returns true when the `connection` is scheduled and required, and false
   * otherwise (iterator.cpp:95-101).
   */
  protected _isRequiredInput(context: VdfContext, connection: VdfConnection): boolean {
    return context._isRequiredOutput(connection.getSourceOutput())
  }

  /**
   * Returns the request mask of `output`, if the output has been scheduled
   * and null otherwise (iterator.cpp:103-109).
   */
  protected _getRequestMask(context: VdfContext, output: VdfOutput): VdfMask | null {
    return context._getRequestMask(output)
  }

  /**
   * Loops over each scheduled output of `node` and calls `callback` with the
   * output and request mask (iterator.cpp:111-118).
   */
  protected _forEachScheduledOutput(
    context: VdfContext,
    node: VdfNode,
    callback: VdfScheduledOutputCallback,
  ): void {
    context._getSchedule().forEachScheduledOutput(node, callback)
  }
}

/**
 * The iterator protocol of the libVdf iterators that the composing iterators
 * (VdfMaskedIterator, VdfWeightedIterator) wrap: upstream's template
 * parameter `IteratorType` requirements. `_GetIteratorIndex` stands in for
 * the `Vdf_GetIteratorIndex` friend function each iterator defines.
 */
export interface Vdf_IndexedIterator<V> {
  isAtEnd(): boolean
  increment(): this
  deref(): V
  advanceToEnd(): void
  /** @internal Vdf_GetIteratorIndex(it). */
  _getIteratorIndex(): number
}

/**
 * Returns the current index into the data source (the `Vdf_GetIteratorIndex`
 * friend functions of readIterator.h:124, readWriteIterator.h:186,
 * maskedIterator.h:79, weightedIterator.h:303).
 */
export function Vdf_GetIteratorIndex(it: { _getIteratorIndex(): number }): number {
  return it._getIteratorIndex()
}

/**
 * `*it = value` through the reference the underlying iterator's operator*
 * returns. Only read/write underlying iterators have one; upstream, assigning
 * through a read iterator does not compile.
 */
export function Vdf_DerefAssignUnderlying<V>(iterator: unknown, value: V, site: string): void {
  const derefAssign = (iterator as { derefAssign?: (value: V) => void }).derefAssign
  if (typeof derefAssign !== 'function') {
    const message =
      `${site}: the underlying iterator returns a const reference; ` +
      'assigning through it does not compile upstream'
    TF_CODING_ERROR(message)
    throw new Error(message)
  }
  derefAssign.call(iterator, value)
}
