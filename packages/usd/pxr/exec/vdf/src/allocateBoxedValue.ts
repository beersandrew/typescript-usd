// Ported from OpenUSD 26.11.1: pxr/exec/vdf/allocateBoxedValue.cpp,
//  pxr/exec/vdf/allocateBoxedValue.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/allocateBoxedValue.h and
// allocateBoxedValue.cpp.
//
// `Vdf_AllocateBoxedValue<T>(context, name, args...)` is
// `Vdf_AllocateBoxedValue<T>(type, context, name, ...args)`, the TfType
// standing in for the template argument; `args` are the Vdf_BoxedContainer
// constructor arguments after its type.

import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'

import { Vdf_BoxedContainer } from './boxedContainer.ts'
import type { VdfContext } from './context.ts'
import { VdfIterator } from './iterator.ts'
import type { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

// An accessor class for retrieving the current node, request mask, and output
// value (allocateBoxedValue.cpp:20-46).
class _ContextAccess extends VdfIterator {
  // Returns the request mask for the given output.
  getRequestMask(context: VdfContext, output: VdfOutput): VdfMask | null {
    return this._getRequestMask(context, output)
  }

  // Returns the required output to write to.
  getRequiredOutputForWriting(context: VdfContext, name: string): VdfOutput | null {
    return this._getRequiredOutputForWriting(context, name)
  }

  // Returns the output value to write into.
  getOutputValueForWriting(context: VdfContext, output: VdfOutput): VdfVector | null {
    return this._getOutputValueForWriting(context, output)
  }
}

/**
 * Allocate a new VdfVector as backing store for a boxed value
 * (allocateBoxedValue.cpp:50-80).
 */
export function Vdf_AllocateBoxedValueVector(context: VdfContext, name: string): VdfVector | null {
  // Get the required output and issue a coding error if it is not available.
  // We expect the required output to always be available.
  const output = new _ContextAccess().getRequiredOutputForWriting(context, name)
  if (!output) {
    return null
  }

  // Retrieve the request mask at the output. If the output is not requested,
  // we can bail out. This is not an error, but we do not need to allocate
  // anything in this case.
  const requestMask = new _ContextAccess().getRequestMask(context, output)
  if (!requestMask || requestMask.isAllZeros()) {
    return null
  }

  // We expect the request mask to be of size 1, meaning we expect the output
  // to always store a scalar or boxed value. We cannot allocate boxed value
  // storage for an output that carries a vectorized value.
  if (requestMask.getSize() !== 1) {
    TF_CODING_ERROR(`Output '${output.getName()}' cannot hold a boxed value.`)
    return null
  }

  // Return the vector to write into.
  return new _ContextAccess().getOutputValueForWriting(context, output)
}

/**
 * Allocate a new VdfVector as backing store for a boxed value, then construct
 * a boxed value inside that newly allocated VdfVector
 * (allocateBoxedValue.h:29-52).
 */
export function Vdf_AllocateBoxedValue<T>(
  type: TfType,
  context: VdfContext,
  name: string,
  ...args: [n?: number]
): boolean {
  // Allocate a new VdfVector for storing a boxed value. This function will
  // return null if the output is not requested, or if an error occurred. The
  // function will emit a coding error in the latter case.
  const v = Vdf_AllocateBoxedValueVector(context, name)
  if (!v) {
    return false
  }

  // Store a new Vdf_BoxedContainer at the output (moved, as upstream moves
  // the temporary).
  v.Set(type, new Vdf_BoxedContainer<T>(type, ...args).moveOut())

  // Success!
  return true
}
