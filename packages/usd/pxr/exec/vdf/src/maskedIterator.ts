// Ported from OpenUSD 26.11.1: pxr/exec/vdf/maskedIterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/maskedIterator.h.
//
// `VdfMaskedIterator<IteratorType, mode>(context, visitMask, args...)`
// constructs the underlying IteratorType from (context, args...). Here the
// caller constructs the underlying iterator and passes it last:
// `new VdfMaskedIterator(mode, context, visitMask, iterator)`. The order of
// construction is upstream's: the underlying iterator, then the visit mask
// iterator.

import type { VdfContext } from './context.ts'
import {
  Vdf_DerefAssignUnderlying, Vdf_GetIteratorIndex, VdfIterator, type Vdf_IndexedIterator,
} from './iterator.ts'
import type { VdfMask, VdfMaskIterator } from './mask.ts'

/**
 * Enum to specify the behavior of VdfMaskedIterator as template parameter
 * (maskedIterator.h:24-34).
 */
export enum VdfMaskedIteratorMode {
  /** The elements in the visitMask are skipped (default). */
  VisitUnset = 0,

  /** Visit the elements in the visitMask instead of skipping them. */
  VisitSet,
}

/**
 * An iterator that can be used to refine the given iterator `IteratorType` to
 * iterate over a given mask by either visiting or skipping over set bits in
 * the mask (maskedIterator.h:44).
 */
export class VdfMaskedIterator<V, I extends Vdf_IndexedIterator<V> = Vdf_IndexedIterator<V>>
  extends VdfIterator implements Vdf_IndexedIterator<V> {
  // The template parameter `mode`.
  private readonly _mode: VdfMaskedIteratorMode

  // The underlying iterator.
  private readonly _iterator: I

  // Mask of elements that are skipped during iteration.
  private readonly _visitMaskIterator: VdfMaskIterator

  /**
   * Constructor. Creates a masked iterator using `visitMask` over `iterator`
   * (maskedIterator.h:103-116).
   */
  constructor(mode: VdfMaskedIteratorMode, _context: VdfContext, visitMask: VdfMask, iterator: I) {
    super()
    this._mode = mode
    this._iterator = iterator
    this._visitMaskIterator = visitMask.begin()

    // If we get an empty mask passed in, advance the iterator to the end.
    if (visitMask.getSize() === 0) {
      this._iterator.advanceToEnd()
    }

    this._advanceToIndexWithVisitMask()
  }

  /** Increment operator to point to the next element (maskedIterator.h:118-125). */
  increment(): this {
    this._iterator.increment()
    this._advanceToIndexWithVisitMask()
    return this
  }

  /** Returns the current element (maskedIterator.h:62-64). */
  deref(): V {
    return this._iterator.deref()
  }

  /**
   * Assigns `value` to the current element (`*it = value` through the
   * reference operator* returns, maskedIterator.h:62-64).
   */
  derefAssign(value: V): void {
    Vdf_DerefAssignUnderlying(this._iterator, value,
      'VdfMaskedIterator::operator* (maskedIterator.h:62)')
  }

  /** Returns true if the iterator is done iterating (maskedIterator.h:68-70). */
  isAtEnd(): boolean {
    return this._iterator.isAtEnd()
  }

  /** Advance the iterator to the end (maskedIterator.h:74-76). */
  advanceToEnd(): void {
    this._iterator.advanceToEnd()
  }

  /** Vdf_GetIteratorIndex (maskedIterator.h:79-81). @internal */
  _getIteratorIndex(): number {
    return Vdf_GetIteratorIndex(this._iterator)
  }

  // Advance the underlying iterator as needed (maskedIterator.h:127-167).
  private _advanceToIndexWithVisitMask(): void {
    // XXX: this could be more efficient by
    // - exposing a method to advance to the next element after a given index
    //   in the base iterator.
    // - using those functions in the below while loop so that we skip one
    //   contiguous block of elements in visitMask at a time.
    // - this scheme also makes it hard to set the masked iterator to
    //   "IsAtEnd" in the constructor, because advancing the mask iterator to
    //   the end (none set) doesn't mean that this iterator is at end due to
    //   the logic below. That in turn makes it hard to check if the mask size
    //   and iterator data matches up.
    while (!this._iterator.isAtEnd()) {
      // Pull the visit mask iterator forward.
      const idx = Vdf_GetIteratorIndex(this._iterator)
      if (this._visitMaskIterator.deref() < idx) {
        this._visitMaskIterator.advanceTo(idx)
      }

      const visitIdx = this._visitMaskIterator.deref()

      if (this._mode === VdfMaskedIteratorMode.VisitUnset) {
        // If we hit an element we don't want to skip, stop. Also stop, if we
        // were unable to pull the visit mask forward (invalid visit mask
        // case).
        if (visitIdx > idx || visitIdx < idx) {
          break
        }
      } else {
        // If we hit an element we want to visit, stop. Also stop, if we were
        // unable to pull the visit mask forward (invalid visit mask case).
        if (visitIdx === idx || visitIdx < idx) {
          break
        }
      }

      // Otherwise continue iterating.
      this._iterator.increment()
    }
  }
}
