// Ported from OpenUSD 26.11.1: pxr/exec/vdf/readIteratorRange.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/readIteratorRange.h.

import type { Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import { VdfIteratorRange } from './iteratorRange.ts'
import { VdfReadIterator } from './readIterator.ts'

/**
 * This class allows for construction of iterable ranges of input values. The
 * underlying iterator used is VdfReadIterator (readIteratorRange.h:21-52:
 * `VdfReadIteratorRange<T> = VdfIteratorRange<VdfReadIterator<T>>`).
 *
 * `VdfReadIteratorRange<T> range(context, name)` is
 * `new VdfReadIteratorRange<T>(type, context, name)`; the two-iterator
 * constructors are `new VdfReadIteratorRange<T>(begin, end)` and
 * `new VdfReadIteratorRange<T>(begin)`, whose end is a copy of `begin` advanced to the
 * end (the forwarding constructor given an iterator to copy).
 *
 * Note that determining the number of input values in a range has linear
 * complexity; VdfReadIterator.ComputeSize() is cheaper.
 */
export class VdfReadIteratorRange<T> extends VdfIteratorRange<VdfReadIterator<T>, T> {
  constructor(type: TfType, context: VdfContext, inputName: string)
  constructor(begin: VdfReadIterator<T>, end?: VdfReadIterator<T>)
  constructor(
    a: TfType | VdfReadIterator<T>,
    b?: VdfContext | VdfReadIterator<T>,
    inputName?: string,
  ) {
    if (a instanceof VdfReadIterator) {
      super(a, b as VdfReadIterator<T> | undefined)
    } else {
      super(new VdfReadIterator<T>(a, b as VdfContext, inputName!))
    }
  }
}
