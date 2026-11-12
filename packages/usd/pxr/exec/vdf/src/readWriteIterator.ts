// Ported from OpenUSD 26.11.1: pxr/exec/vdf/readWriteIterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/readWriteIterator.h.
//
// `VdfReadWriteIterator<T>(context, name)` is
// `new VdfReadWriteIterator<T>(type, context, name)`, the TfType standing in
// for the template argument. `*it` reads with Deref(); `*it = v` writes with
// DerefAssign(v).

import {
  TF_DEV_AXIOM,
  TF_VERIFY,
  TfCompressedBits,
  TfCompressedBitsViewIterator,
  type Type as TfType,
} from 'typescript-usd/tf'

import { Vdf_AllocateBoxedValue } from './allocateBoxedValue.ts'
import type { VdfContext } from './context.ts'
import { VdfIterator, type Vdf_IndexedIterator } from './iterator.ts'
import type { VdfOutput } from './output.ts'
import { VdfVectorReadWriteAccessor } from './vector.ts'

/** Copies a TfCompressedBits AllSetView iterator (a C++ value copy). */
function _CloneBitsIterator(it: TfCompressedBitsViewIterator): TfCompressedBitsViewIterator {
  return Object.assign(
    Object.create(Object.getPrototypeOf(it) as object) as TfCompressedBitsViewIterator, it)
}

/**
 * This iterator provides read access to input values, and write access to
 * the associated output values. If the output does not have an associated
 * input, read/write access is provided to the output values
 * (readWriteIterator.h:50).
 *
 * For outputs with an affects mask, the data elements visited by the iterator
 * will be limited to those set in the affects mask. All data elements will be
 * visited for outputs without an affects mask.
 */
export class VdfReadWriteIterator<T> extends VdfIterator implements Vdf_IndexedIterator<T> {
  // The value type (the template argument).
  private readonly _type: TfType

  // The output data accessor.
  private _accessor: VdfVectorReadWriteAccessor<T> = new VdfVectorReadWriteAccessor<T>()

  // The mask iterator. Will iterate over the affects mask or the optional
  // bitset. The default iterator is at end.
  private _iterator: TfCompressedBitsViewIterator = new TfCompressedBitsViewIterator()

  // The optional bitset used for iteration over values with an empty affects
  // mask. A bitset is used instead of a mask, in order to avoid contention on
  // the mask registry lock (a shared_ptr upstream).
  private _bits: TfCompressedBits | null = null

  // The source output.
  private _output: VdfOutput | null = null

  /**
   * Constructs a read/write iterator for the given input or output
   * (readWriteIterator.h:219-232), or, with `name` omitted or empty, for the
   * only output on the current node (readWriteIterator.h:97-100). Emits a
   * coding error if `name` does not name an input or an output.
   */
  constructor(type: TfType, context: VdfContext, name?: string)
  /** @internal Default (at-end) construction and copy construction. */
  constructor(type: TfType, context: null, name: undefined, copyFrom?: VdfReadWriteIterator<T>)
  constructor(
    type: TfType,
    context: VdfContext | null,
    name: string | undefined = '',
    copyFrom?: VdfReadWriteIterator<T>,
  ) {
    super()
    this._type = type

    // Copy construction.
    if (copyFrom) {
      this._accessor = copyFrom._accessor
      this._iterator = _CloneBitsIterator(copyFrom._iterator)
      this._bits = copyFrom._bits
      this._output = copyFrom._output
      return
    }

    // Default constructs a read/write iterator that is at end
    // (readWriteIterator.h:180).
    if (context === null) {
      return
    }

    // Get the required output, if available. This will issue a coding error
    // if the output is not available.
    this._output = this._getRequiredOutputForWriting(context, name ?? '')

    // Initialize with the required output.
    if (this._output) {
      this._initialize(context)
    }
  }

  /**
   * Allocates storage for `count` elements at the given input or output and
   * returns a read/write iterator at the beginning of that newly allocated
   * storage (readWriteIterator.h:234-245), or, without `name`, at the only
   * output on the current node (readWriteIterator.h:247-257). The elements in
   * the storage will be default initialized.
   */
  static allocate<T>(type: TfType, context: VdfContext, count: number): VdfReadWriteIterator<T>
  static allocate<T>(type: TfType, context: VdfContext, name: string, count: number): VdfReadWriteIterator<T>
  static allocate<T>(
    type: TfType,
    context: VdfContext,
    nameOrCount: string | number,
    count?: number,
  ): VdfReadWriteIterator<T> {
    if (typeof nameOrCount === 'number') {
      return Vdf_AllocateBoxedValue<T>(type, context, '', nameOrCount)
        ? new VdfReadWriteIterator<T>(type, context)
        : new VdfReadWriteIterator<T>(type, null, undefined)
    }
    return Vdf_AllocateBoxedValue<T>(type, context, nameOrCount, count)
      ? new VdfReadWriteIterator<T>(type, context, nameOrCount)
      : new VdfReadWriteIterator<T>(type, null, undefined)
  }

  /** Copy constructor. */
  Clone(): VdfReadWriteIterator<T> {
    return new VdfReadWriteIterator<T>(this._type, null, undefined, this)
  }

  /** Returns true if this iterator and `rhs` compare equal (readWriteIterator.h:259-279). */
  Equals(rhs: VdfReadWriteIterator<T>): boolean {
    // The source outputs must match.
    if (this._output !== rhs._output) {
      return false
    }

    // If either one iterate is at-end, the other one must be at-end too.
    const atEnd = this.isAtEnd()
    const rhsAtEnd = rhs.isAtEnd()
    if (atEnd || rhsAtEnd) {
      return atEnd === rhsAtEnd
    }

    // If neither iterator is at-end, we can dereference the mask iterators and
    // compare the resulting indices.
    return this._iterator.Get() === rhs._iterator.Get()
  }

  /** readWriteIterator.h:133-135 */
  notEquals(rhs: VdfReadWriteIterator<T>): boolean {
    return !this.Equals(rhs)
  }

  /** Increment operator to point to the next element (readWriteIterator.h:281-287). */
  increment(): this {
    this._iterator.increment()
    return this
  }

  /**
   * Returns the current element (readWriteIterator.h:145-149 operator*,
   * 153-157 operator->). Calling this on an iterator that IsAtEnd() is
   * invalid.
   */
  deref(): T {
    TF_DEV_AXIOM(!this.isAtEnd(), '!IsAtEnd()')
    TF_DEV_AXIOM(this._iterator.Get() < this._accessor.getNumValues(),
      '*_iterator < _accessor.GetNumValues()')
    return this._accessor.Get(this._iterator.Get())
  }

  /**
   * Assigns `value` to the current element (`*it = value` through the
   * reference operator* returns, readWriteIterator.h:145-149).
   */
  derefAssign(value: T): void {
    TF_DEV_AXIOM(!this.isAtEnd(), '!IsAtEnd()')
    TF_DEV_AXIOM(this._iterator.Get() < this._accessor.getNumValues(),
      '*_iterator < _accessor.GetNumValues()')
    this._accessor.Set(this._iterator.Get(), value)
  }

  /** Returns true if the iterator is done iterating (readWriteIterator.h:161-163). */
  isAtEnd(): boolean {
    return this._iterator.isAtEnd()
  }

  /** Advance the iterator to the end (readWriteIterator.h:167-169). */
  advanceToEnd(): void {
    this._iterator = new TfCompressedBitsViewIterator()
  }

  /** Vdf_GetIteratorIndex (readWriteIterator.h:186-188). @internal */
  _getIteratorIndex(): number {
    return this._iterator.Get()
  }

  // Initialize the iterator (readWriteIterator.h:289-337).
  private _initialize(context: VdfContext): void {
    const output = this._output!

    // Retrieve the affects and request masks.
    const [isScheduled, , affectsMask] = this._getOutputMasks(context, output)
    if (!isScheduled) {
      return
    }

    // Get the output value for writing. We always expect there to be one. It
    // should have been prepared by the executor engine.
    const v = this._getOutputValueForWriting(context, output)
    if (!TF_VERIFY(v, 'v', `Output '${output.getName()}' is missing buffer.`)) {
      return
    }

    // Get the accessor to the data, and bail out if there is no data to
    // iterate over.
    this._accessor = v!.getReadWriteAccessor<T>(this._type)
    if (this._accessor.IsEmpty()) {
      return
    }

    // If the affects mask size mismatches the number of data elements,
    // iterate over all of the available data. This includes the case where
    // the affects mask is empty (output does not have an affects mask) and
    // where the value is boxed.
    if (affectsMask!.getSize() !== this._accessor.getNumValues()) {
      TF_DEV_AXIOM(
        (affectsMask!.IsEmpty()) ||
        (affectsMask!.getSize() === 1 && this._accessor.isBoxed()),
        '(affectsMask->IsEmpty()) || ' +
        '(affectsMask->GetSize() == 1 && _accessor.IsBoxed())')
      this._bits = new TfCompressedBits(this._accessor.getNumValues())
      this._bits.complement()
      this._iterator = this._bits.getAllSetView().begin()
    }

    // If there is a valid affects mask, let's use it for iteration.
    else {
      this._iterator = affectsMask!.getBits().getAllSetView().begin()
    }
  }
}
