// Ported from OpenUSD 26.11.1: pxr/exec/vdf/inputValuesPointer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/inputValuesPointer.h.
//
// `VdfInputValuesPointer<T>(context, inputName)` is
// `new VdfInputValuesPointer<T>(type, context, inputName)`, the TfType
// standing in for the template argument. The raw `const T *` data pointer
// becomes a VdfInputValuesPointer_Data view with Get(i) (`GetData()[i]`):
// either a view into the output buffer at the first index of the contiguous
// connection mask, or a view of the copy.

import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import { VdfIterator } from './iterator.ts'
import { VdfReadIterator } from './readIterator.ts'
import type { VdfVectorReadAccessor } from './vector.ts'

/** The contiguous data of a VdfInputValuesPointer: `GetData()[i]` is Get(i). */
export class VdfInputValuesPointer_Data<T> {
  constructor(
    private readonly _get: (index: number) => T,
  ) {}

  /** `data[index]`. */
  Get(index: number): T {
    return this._get(index)
  }
}

/**
 * VdfInputValuesPointer is a smart pointer object that guarantees contiguous
 * memory access to the requested input values, regardless of the actual
 * memory layout in the output buffers (inputValuesPointer.h:71).
 *
 * If the memory layout of input values is not contiguous in the output
 * buffers, this class makes a copy of the input values at construction.
 * Accessing data through iterators (e.g. VdfReadIterator) or the VdfContext
 * is generally a better choice.
 */
export class VdfInputValuesPointer<T> extends VdfIterator {
  // A view of the data.
  private _data: VdfInputValuesPointer_Data<T> | null = null

  // The number of elements in data.
  private _size = 0

  // Is this a copy of the data? Upstream's destructor frees the copy
  // (inputValuesPointer.h:215-223); here it is garbage collected.
  private _isCopy = false

  /**
   * Construct a new instance of this class with access to the input values
   * provided by the input named `inputName`. If the data provided by
   * `inputName` is not contiguous in memory, the constructor will make a copy
   * of the input values (inputValuesPointer.h:139-186).
   */
  constructor(type: TfType, context: VdfContext, inputName: string) {
    super()

    // Get the requested input.
    const input = this._getNode(context).getInput(inputName)

    // Bail out if the input is not available or if it has no connections.
    if (!input || input.getNumConnections() === 0) {
      return
    }

    // If there is only one connection targeting the requested input, and that
    // connection has a contiguous mask, we do not need to make a copy. This is
    // the fast path.
    if (input.getNumConnections() === 1) {
      const connection = input.getConnections()[0]!
      const mask = connection.GetMask()

      // Bail out if the single connection mask is all zeros.
      if (mask.isAllZeros()) {
        return
      }

      // If the connection mask is contiguous, we can retain a pointer to the
      // data stored in the output buffer.
      if (mask.isContiguous()) {
        const v = this._getInputValue(context, connection, mask)
        if (v) {
          const a: VdfVectorReadAccessor<T> = v.getReadAccessor<T>(type)

          // If the VdfVector is empty, we have no data, so don't set the data
          // pointer.
          if (!a.IsEmpty()) {
            this._size = a.isBoxed() ? a.getNumValues() : mask.getNumSet()
            const first = mask.getFirstSet()
            this._data = new VdfInputValuesPointer_Data<T>((i) => a.Get(first + i))
          }
        }
        return
      }
    }

    // If we were not able to retain a pointer pointing directly at the output
    // buffer, we need to fall back to making a copy of the input values. This
    // is the slow path.
    this._copyInputValues(type, context, inputName)
  }

  /**
   * Returns the data, or null without data. Accessing data outside the bounds
   * established by GetSize() is invalid (inputValuesPointer.h:93-95).
   */
  getData(): VdfInputValuesPointer_Data<T> | null {
    return this._data
  }

  /** Returns the size of the data in number of elements stored (inputValuesPointer.h:99-101). */
  getSize(): number {
    return this._size
  }

  /**
   * Construct a read-only TfSpan viewing this object's data
   * (inputValuesPointer.h:109-111, operator TfSpan<const T>).
   */
  asTfSpan(): never {
    // FAITHFULNESS-DEBT(openexec-tfspan): the TfSpan<const T> conversion
    // (inputValuesPointer.h:109-111) needs tf/span.h, which is not ported ->
    // port TfSpan and return TfSpan(GetData(), GetSize()).
    const message =
      'VdfInputValuesPointer::operator TfSpan<const T> ' +
      '(inputValuesPointer.h:109) needs TfSpan, which is not ported (openexec-tfspan)'
    TF_CODING_ERROR(message)
    throw new Error(message)
  }

  // Make a copy of the input values (inputValuesPointer.h:188-213).
  private _copyInputValues(type: TfType, context: VdfContext, inputName: string): void {
    // Get a read iterator to the input values.
    const it = new VdfReadIterator<T>(type, context, inputName)

    // Compute the size from the read iterator, and allocate an array large
    // enough to accommodate our copy of the input values.
    this._isCopy = true
    this._size = it.computeSize()
    const copy = new Array<T>(this._size)

    // Iterate over the input values and copy them into our array, such that
    // the data is guaranteed to be laid out contiguously in memory.
    for (let i = 0; !it.isAtEnd(); ++i, it.increment()) {
      copy[i] = it.deref()
    }

    // Assign the pointer to the copy to data.
    this._data = new VdfInputValuesPointer_Data<T>((i) => copy[i]!)
  }
}
