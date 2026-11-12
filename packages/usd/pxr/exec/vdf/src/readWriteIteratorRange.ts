// Ported from OpenUSD 26.11.1: pxr/exec/vdf/readWriteIteratorRange.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/readWriteIteratorRange.h.

import type { Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import { VdfIteratorRange } from './iteratorRange.ts'
import { VdfReadWriteIterator } from './readWriteIterator.ts'

/**
 * This class allows for construction of iterable ranges of input/output
 * values. The underlying iterator used is VdfReadWriteIterator
 * (readWriteIteratorRange.h:21-52: `VdfReadWriteIteratorRange<T> =
 * VdfIteratorRange<VdfReadWriteIterator<T>>`).
 *
 * `VdfReadWriteIteratorRange<T> range(context[, name])` is
 * `new VdfReadWriteIteratorRange<T>(type, context[, name])`; the two-iterator
 * constructors are `new VdfReadWriteIteratorRange<T>(begin, end)` and
 * `new VdfReadWriteIteratorRange<T>(begin)`, whose end is a copy of `begin` advanced to the
 * end (the forwarding constructor given an iterator to copy).
 */
export class VdfReadWriteIteratorRange<T> extends VdfIteratorRange<VdfReadWriteIterator<T>, T> {
  constructor(type: TfType, context: VdfContext, name?: string)
  constructor(begin: VdfReadWriteIterator<T>, end?: VdfReadWriteIterator<T>)
  constructor(
    a: TfType | VdfReadWriteIterator<T>,
    b?: VdfContext | VdfReadWriteIterator<T>,
    name?: string,
  ) {
    if (a instanceof VdfReadWriteIterator) {
      super(a, b as VdfReadWriteIterator<T> | undefined)
    } else {
      super(new VdfReadWriteIterator<T>(a, b as VdfContext, name))
    }
  }
}
