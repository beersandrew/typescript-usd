// Ported from OpenUSD 26.11.1: pxr/exec/vdf/iteratorRange.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/iteratorRange.h.

/** The iterator API a VdfIteratorRange needs of its `Iterator` argument. */
export interface Vdf_RangeIterator<V> {
  /** The copy constructor; returns the iterator's own class. */
  Clone(): Vdf_RangeIterator<V>
  Equals(rhs: this): boolean
  increment(): this
  deref(): V
  advanceToEnd(): void
}

/**
 * This class allows for construction of iterable ranges (iteratorRange.h:26).
 * The range is also a JS iterable over the dereferenced values.
 */
export class VdfIteratorRange<It extends Vdf_RangeIterator<V>, V = ReturnType<It['deref']>>
implements Iterable<V> {
  // The begin iterator of this range.
  private readonly _begin: It

  // The end iterator of this range.
  private readonly _end: It

  /**
   * Constructs an iterable range from a begin iterator, whose end is a copy
   * advanced to the end (iteratorRange.h:44-50), or from `begin` and `end`
   * iterators (iteratorRange.h:54). Upstream forwards the begin iterator's
   * constructor arguments; here the caller constructs the begin iterator
   * (the subclasses do it for the forwarding form).
   */
  constructor(begin: It, end?: It) {
    // The range holds copies of the iterators, as upstream copy-constructs
    // its members.
    this._begin = begin.Clone() as It
    if (end === undefined) {
      this._end = begin.Clone() as It
      this._end.advanceToEnd()
    } else {
      this._end = end.Clone() as It
    }
  }

  /** Returns an iterator to the beginning of the iterable range (iteratorRange.h:58-60). */
  begin(): It {
    return this._begin.Clone() as It
  }

  /** Returns an iterator to the end of the iterable range (iteratorRange.h:64-66). */
  end(): It {
    return this._end.Clone() as It
  }

  /** Returns true if the range is empty (iteratorRange.h:70-72). */
  IsEmpty(): boolean {
    return this._begin.Equals(this._end)
  }

  *[Symbol.iterator](): Iterator<V> {
    for (const it = this.begin(); !it.Equals(this._end); it.increment()) {
      yield it.deref()
    }
  }
}
