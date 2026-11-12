// Ported from OpenUSD 26.11.1: pxr/exec/vdf/rawValueAccessor.cpp,
//  pxr/exec/vdf/rawValueAccessor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/rawValueAccessor.h and
// rawValueAccessor.cpp.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import type { VdfInput } from './input.ts'
import { VdfIterator } from './iterator.ts'
import type { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

/**
 * This class grants special access to the raw VdfVector data associated with
 * inputs and outputs on a VdfNode (rawValueAccessor.h:36).
 *
 * Inputs and outputs are referred to using VdfInput and VdfOutput instances,
 * rather than name tokens, so that only classes derived from VdfNode will
 * typically have access to these objects.
 */
export class VdfRawValueAccessor extends VdfIterator {
  // The context used to access the input/output data.
  private readonly _context: VdfContext

  /** Constructs a VdfRawValueAccessor from a VdfContext (rawValueAccessor.h:42). */
  constructor(context: VdfContext) {
    super()
    this._context = context
  }

  /**
   * Returns the first VdfVector at the input for `input`, or null if there is
   * no connection on the supplied input (rawValueAccessor.cpp:18-46). The
   * optional `mask` out-parameter becomes the second element of the returned
   * tuple: the first connection's mask, or null without a connection.
   */
  getInputVector(input: VdfInput): [VdfVector | null, VdfMask | null] {
    if (input.getNumConnections() === 0) {
      return [null, null]
    }

    const connection = input.getConnections()[0]!

    const mask = connection.GetMask()

    // Regardless of where we actually read the input value from, the request
    // mask contains what is requested at the output we are sourcing the value
    // from.
    let requestMask = this._getRequestMask(this._context, connection.getSourceOutput())

    // We should never fail this verify. In fact, if this ever fails, it is
    // most definitely an error condition to ask for the cached value of an
    // output, which has never been requested in the current schedule.
    if (!TF_VERIFY(requestMask, 'requestMask')) {
      requestMask = connection.GetMask()
    }

    return [this._getInputValue(this._context, connection, requestMask!), mask]
  }

  /**
   * Sets the `output` value to the given `value` using the passed in `mask`
   * (rawValueAccessor.cpp:48-62 and 64-91). The copy and move overloads are
   * the same here.
   */
  setOutputVector(output: VdfOutput, mask: VdfMask, value: VdfVector): void {
    const out = this._getOutputValueForWriting(this._context, output)

    if (!TF_VERIFY(out, 'out')) {
      return
    }

    // If the request mask is all ones, copy the vector, otherwise do a sparse
    // copy of only the requested elements.
    if (mask.isAllOnes()) {
      out!.assign(value)
    } else {
      out!.copy(value, mask)
    }
  }
}
