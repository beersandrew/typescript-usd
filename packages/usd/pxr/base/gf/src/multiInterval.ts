// Ported from OpenUSD 26.11.1: pxr/base/gf/multiInterval.cpp,
//  pxr/base/gf/multiInterval.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GfMultiInterval — an ordered set of non-intersecting GfIntervals.
//
// Mirrors OpenUSD pxr/base/gf/multiInterval.{h,cpp} 1:1 in name and semantics.
//
// C++ backs the set with std::set<GfInterval>, ordered by GfInterval::operator<
// (the total order GfInterval.lessThan here). We back it with a plain array
// kept sorted by that same order, with no duplicate or intersecting members.
// The merge/split logic in Add/Remove/GetComplement is ported verbatim from
// multiInterval.cpp (interval set ops are order-sensitive); std::set iterator
// arithmetic is translated to array-index arithmetic, preserving the exact
// erase/insert ordering (see the per-method comments).
//
// C++ operators map onto TS methods as:
//   operator==              -> equals
//   operator<               -> lessThan
//   begin()/end()/iter      -> [Symbol.iterator] / GetSet()
//   GetSize()               -> number of intervals (matches C++; .size in py)
//
// No FAITHFULNESS-DEBT: this is a verbatim port of the C++ algorithms.

import { GfInterval } from './interval.ts'

export class GfMultiInterval {
  // Sorted (by GfInterval.lessThan), disjoint, non-empty intervals.
  private _set: GfInterval[]

  /**
   * Constructors mirroring the C++ overloads:
   *   GfMultiInterval()                      -> empty
   *   GfMultiInterval(GfInterval)            -> the single interval
   *   GfMultiInterval(GfInterval[])          -> union of the given intervals
   *   GfMultiInterval(GfMultiInterval)       -> copy
   */
  constructor()
  constructor(i: GfInterval)
  constructor(intervals: GfInterval[])
  constructor(other: GfMultiInterval)
  constructor(arg?: GfInterval | GfInterval[] | GfMultiInterval) {
    this._set = []
    if (arg === undefined) {
      return
    }
    if (arg instanceof GfMultiInterval) {
      this._set = arg._set.map((iv) => iv.clone())
      return
    }
    if (Array.isArray(arg)) {
      for (const iv of arg) {
        this.add(iv)
      }
      return
    }
    // Single GfInterval.
    this.add(arg)
  }

  /** Copy helper (C++ copy ctor). */
  clone(): GfMultiInterval {
    return new GfMultiInterval(this)
  }

  // --- Set-ordering primitives (std::set lower_bound / upper_bound) ----------

  /** First index idx with !(_set[idx] < iv); _set.length if none. */
  private _lowerBoundIdx(iv: GfInterval): number {
    let idx = 0
    while (idx < this._set.length && this._set[idx]!.lessThan(iv)) {
      idx++
    }
    return idx
  }

  /** First index idx with iv < _set[idx]; _set.length if none. */
  private _upperBoundIdx(iv: GfInterval): number {
    let idx = 0
    while (idx < this._set.length && !iv.lessThan(this._set[idx]!)) {
      idx++
    }
    return idx
  }

  /** Insert iv into the sorted set (ignoring an exact duplicate). */
  private _insert(iv: GfInterval): void {
    const idx = this._lowerBoundIdx(iv)
    if (idx < this._set.length && this._set[idx]!.equals(iv)) {
      return
    }
    this._set.splice(idx, 0, iv)
  }

  // --- Accessors -------------------------------------------------------------

  /** True iff the multi-interval is empty. */
  IsEmpty(): boolean {
    return this._set.length === 0
  }

  /** Number of intervals in the set (mirrors C++ GetSize / py .size). */
  getSize(): number {
    return this._set.length
  }

  /** Alias for GetSize (number of intervals). */
  getNumIntervals(): number {
    return this._set.length
  }

  /** An interval bounding the entire multi-interval (empty if empty). */
  getBounds(): GfInterval {
    if (this._set.length !== 0) {
      const first = this._set[0]!
      const last = this._set[this._set.length - 1]!
      return new GfInterval(
        first.getMin(),
        last.getMax(),
        first.isMinClosed(),
        last.isMaxClosed(),
      )
    }
    return new GfInterval()
  }

  // --- lower/upper bound iterators (by double) -------------------------------

  /** Index of first interval whose min is >= x. */
  lower_bound(x: number): number {
    return this._lowerBoundIdx(new GfInterval(x))
  }

  /** Index of first interval whose min is > x. */
  upper_bound(x: number): number {
    return this._upperBoundIdx(new GfInterval(x))
  }

  // --- Containment -----------------------------------------------------------

  /** Contains(double) */
  private _containsValue(d: number): boolean {
    // Find position of first interval >= [d,d].
    let i = this.lower_bound(d)

    // Case 1: i is the first interval after d.
    if (i !== this._set.length && this._set[i]!.contains(d)) {
      return true
    }

    // Case 2: the previous interval, (i-1), contains d.
    if (i !== 0 && this._set[--i]!.contains(d)) {
      return true
    }

    return false
  }

  /** Contains(const GfInterval&) */
  private _containsInterval(a: GfInterval): boolean {
    if (a.IsEmpty()) {
      return false
    }

    // Find position of first interval >= a.
    let i = this._lowerBoundIdx(a)

    // Case 1: i is the first interval at-or-after a and contains a.
    if (i !== this._set.length && this._set[i]!.contains(a)) {
      return true
    }

    // Case 2: the previous interval, (i-1), contains a.
    if (i !== 0 && this._set[--i]!.contains(a)) {
      return true
    }

    return false
  }

  /** Contains(const GfMultiInterval&) */
  private _containsMulti(s: GfMultiInterval): boolean {
    if (s.IsEmpty()) {
      return false
    }
    for (const i of s._set) {
      if (!this._containsInterval(i)) {
        return false
      }
    }
    return true
  }

  /** Overloaded Contains mirroring the three C++ overloads. */
  contains(d: number): boolean
  contains(i: GfInterval): boolean
  contains(s: GfMultiInterval): boolean
  contains(arg: number | GfInterval | GfMultiInterval): boolean {
    if (typeof arg === 'number') {
      return this._containsValue(arg)
    }
    if (arg instanceof GfMultiInterval) {
      return this._containsMulti(arg)
    }
    return this._containsInterval(arg)
  }

  // --- Mutation --------------------------------------------------------------

  /** Clear the multi-interval. */
  clear(): void {
    this._set = []
  }

  /** Add an interval, or the union with another multi-interval. */
  add(i: GfInterval): void
  add(s: GfMultiInterval): void
  add(arg: GfInterval | GfMultiInterval): void {
    if (arg instanceof GfMultiInterval) {
      for (const i of arg._set) {
        this._addInterval(i)
      }
      return
    }
    this._addInterval(arg)
  }

  private _addInterval(interval: GfInterval): void {
    if (interval.IsEmpty()) {
      return
    }

    // Merge interval with neighboring overlapping intervals.
    const merged = interval.clone()
    let i = this._lowerBoundIdx(merged)

    // Merge with subsequent intervals.
    while (i !== this._set.length && merged.intersects(this._set[i]!)) {
      merged.unionWith(this._set[i]!)
      this._set.splice(i, 1) // erase(i++): element after now sits at i
    }
    // Intersection doesn't account for when the min of the next interval
    // matches the max of the merged interval if either of these intervals
    // has that boundary open.  So we need to merge in the next interval if our
    // end points match up and either of these end points is closed.
    if (
      i !== this._set.length &&
      merged.getMax() === this._set[i]!.getMin() &&
      !(merged.isMaxOpen() && this._set[i]!.isMinOpen())
    ) {
      merged.unionWith(this._set[i]!)
      this._set.splice(i, 1)
    }
    // Merge with the preceding interval.
    if (i !== 0) {
      --i
      // If our merged interval intersects the previous interval or its min
      // matches the previous interval's max with either one of the ends being
      // closed, then merge the previous interval in.
      if (
        merged.intersects(this._set[i]!) ||
        (merged.getMin() === this._set[i]!.getMax() &&
          !(merged.isMinOpen() && this._set[i]!.isMaxOpen()))
      ) {
        merged.unionWith(this._set[i]!)
        this._set.splice(i, 1)
      }
    }

    // Insert final merged result.
    this._insert(merged)
  }

  /**
   * Uses the given interval to extend the multi-interval in the interval
   * arithmetic sense.
   */
  arithmeticAdd(i: GfInterval): void {
    const result = new GfMultiInterval()
    for (const it of this._set) {
      result._addInterval(it.getSum(i))
    }
    this._set = result._set
  }

  /**
   * Remove interval j from the interval at index idx, replacing it in place
   * with the (up to two) leftover pieces. Returns the number of replacement
   * intervals inserted (0, 1, or 2). Mirrors the static _RemoveInterval.
   */
  private _removeIntervalAt(idx: number, j: GfInterval): number {
    const cur = this._set[idx]!
    if (!cur.intersects(j)) {
      return 0
    }

    const lo = new GfInterval(cur.getMin(), j.getMin(), cur.isMinClosed(), !j.isMinClosed())
    const hi = new GfInterval(j.getMax(), cur.getMax(), !j.isMaxClosed(), cur.isMaxClosed())

    const replacement: GfInterval[] = []
    if (!lo.IsEmpty()) {
      replacement.push(lo)
    }
    if (!hi.IsEmpty()) {
      replacement.push(hi)
    }
    this._set.splice(idx, 1, ...replacement)
    return replacement.length
  }

  /** Remove an interval, or another multi-interval, from this one. */
  remove(i: GfInterval): void
  remove(s: GfMultiInterval): void
  remove(arg: GfInterval | GfMultiInterval): void {
    if (arg instanceof GfMultiInterval) {
      for (const i of arg._set) {
        this._removeInterval(i)
      }
      return
    }
    this._removeInterval(arg)
  }

  private _removeInterval(intervalToRemove: GfInterval): void {
    if (intervalToRemove.IsEmpty()) {
      return
    }

    // Remove from subsequent intersecting intervals.
    let i = this._lowerBoundIdx(intervalToRemove)
    while (i !== this._set.length && intervalToRemove.intersects(this._set[i]!)) {
      // _RemoveInterval(i++, ...): leftover pieces land at/behind i; the next
      // original interval ends up at i + (#replacements). Advance past them.
      const inserted = this._removeIntervalAt(i, intervalToRemove)
      i += inserted
    }

    // Remove from prior interval.  Need to handle at most one.
    i = this._upperBoundIdx(intervalToRemove)
    if (i !== 0) {
      this._removeIntervalAt(--i, intervalToRemove)
    }
  }

  // --- Set algebra -----------------------------------------------------------

  /** Return the complement of this set. */
  GetComplement(): GfMultiInterval {
    const r = new GfMultiInterval()
    let workingInterval = GfInterval.getFullInterval()
    for (const i of this._set) {
      // Insert interval prior to *i.
      workingInterval.setMax(i.getMin(), !i.isMinClosed())
      if (!workingInterval.IsEmpty()) {
        r._set.push(workingInterval)
      }

      // Set up next interval.
      workingInterval = GfInterval.getFullInterval()
      workingInterval.setMin(i.getMax(), !i.isMaxClosed())
    }
    if (!workingInterval.IsEmpty()) {
      r._set.push(workingInterval)
    }
    return r
  }

  /** Intersect with an interval or another multi-interval. */
  intersect(i: GfInterval): void
  intersect(s: GfMultiInterval): void
  intersect(arg: GfInterval | GfMultiInterval): void {
    if (arg instanceof GfMultiInterval) {
      this.remove(arg.GetComplement())
      return
    }
    this.intersect(new GfMultiInterval(arg))
  }

  /** Returns the full interval (-inf, inf). */
  static getFullInterval(): GfMultiInterval {
    return new GfMultiInterval(GfInterval.getFullInterval())
  }

  // --- Iteration / access ----------------------------------------------------

  /** Returns a copy of the underlying sorted interval array. */
  getSet(): GfInterval[] {
    return this._set.map((iv) => iv.clone())
  }

  /** const_iterator begin()/end(): iterate the intervals in order. */
  [Symbol.iterator](): Iterator<GfInterval> {
    let idx = 0
    const set = this._set
    return {
      next(): IteratorResult<GfInterval> {
        if (idx < set.length) {
          return { value: set[idx++]!, done: false }
        }
        return { value: undefined as unknown as GfInterval, done: true }
      },
    }
  }

  // --- Comparison ------------------------------------------------------------

  /** operator== : set equality. */
  equals(that: GfMultiInterval): boolean {
    if (this._set.length !== that._set.length) {
      return false
    }
    for (let k = 0; k < this._set.length; k++) {
      if (!this._set[k]!.equals(that._set[k]!)) {
        return false
      }
    }
    return true
  }

  /** operator< : lexicographic compare of the sorted sets (std::set operator<). */
  lessThan(that: GfMultiInterval): boolean {
    const n = Math.min(this._set.length, that._set.length)
    for (let k = 0; k < n; k++) {
      const a = this._set[k]!
      const b = that._set[k]!
      if (a.lessThan(b)) {
        return true
      }
      if (b.lessThan(a)) {
        return false
      }
    }
    return this._set.length < that._set.length
  }

  /** Canonical key (for hashing/dedup in tests). */
  key(): string {
    return this._set.map((iv) => iv.toString()).join('|')
  }

  /** String form matching the C++ operator<< : "[i0, i1, ...]". */
  toString(): string {
    return `[${this._set.map((iv) => iv.toString()).join(', ')}]`
  }
}
