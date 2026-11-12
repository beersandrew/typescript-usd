// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSourceLocator.cpp,
//  pxr/imaging/hd/dataSourceLocator.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/dataSourceLocator.{h,cpp}
// HdDataSourceLocator — hierarchical path into a prim's data source tree
// HdDataSourceLocatorSet — a set of locators closed under descendancy, used
// for dirty notification.
//
// Divergences:
// - TfToken is a string; TfToken::operator< is a lexicographic string
//   comparison, so JS string comparison (UTF-16 code units) is used (identical
//   for the ASCII tokens Hydra uses).
// - The variadic TS constructor stands in for the 1..6 token constructors
//   and HdDataSourceLocator(count, tokens).
// - HdDataSourceLocatorSet keeps the pre-existing TS spellings Add (=insert)
//   and the array constructor (= initializer-list constructor, normalized as
//   upstream). Intersection returns an iterable over the same elements the
//   upstream IntersectionView yields.
// - Not ported: Hash/TfHashAppend (JS Map keys use GetString where needed).

/** HdDataSourceLocatorSentinelTokens, dataSourceLocator.h:22-50. */
export const HdDataSourceLocatorSentinelTokens = {
  container: '__containerDataSource',
} as const

/** dataSourceLocator.h:52-232, dataSourceLocator.cpp:15-283. */
export class HdDataSourceLocator {
  private _elements: string[]

  /** dataSourceLocator.cpp:24-75. A single empty token is ignored
   *  (dataSourceLocator.cpp:26-32). */
  constructor(...elements: string[]) {
    this._elements = elements.length === 1 && elements[0] === '' ? [] : elements
  }

  static readonly EmptyLocator = new HdDataSourceLocator()

  /** dataSourceLocator.cpp:77-80 */
  getElementCount(): number { return this._elements.length }
  /** dataSourceLocator.cpp:82-85 */
  getElement(i: number): string { return this._elements[i] ?? '' }
  /** dataSourceLocator.cpp:99-108 */
  getFirstElement(): string { return this._elements[0] ?? '' }
  /** dataSourceLocator.cpp:87-97 */
  getLastElement(): string { return this._elements[this._elements.length - 1] ?? '' }

  /** dataSourceLocator.h:203-206 */
  IsEmpty(): boolean { return this._elements.length === 0 }

  /** dataSourceLocator.cpp:139-153: Append(token...) and Append(locator). */
  append(...elements: (string | HdDataSourceLocator)[]): HdDataSourceLocator {
    return new HdDataSourceLocator(...this._elements, ..._Flatten(elements))
  }

  /** dataSourceLocator.cpp:155-170: Prepend(token...) and Prepend(locator). */
  prepend(...elements: (string | HdDataSourceLocator)[]): HdDataSourceLocator {
    return new HdDataSourceLocator(..._Flatten(elements), ...this._elements)
  }

  /** dataSourceLocator.cpp:110-121 */
  replaceLastElement(element: string): HdDataSourceLocator {
    if (this._elements.length === 0) return this
    return new HdDataSourceLocator(...this._elements.slice(0, -1), element)
  }

  /** dataSourceLocator.cpp:131-137 */
  removeFirstElement(): HdDataSourceLocator {
    return new HdDataSourceLocator(...this._elements.slice(1))
  }

  /** dataSourceLocator.cpp:123-129 */
  removeLastElement(): HdDataSourceLocator {
    return new HdDataSourceLocator(...this._elements.slice(0, -1))
  }

  /** dataSourceLocator.cpp:172-191 */
  hasPrefix(other: HdDataSourceLocator): boolean {
    if (other._elements.length > this._elements.length) return false
    for (let i = 0; i < other._elements.length; i++) {
      if (this._elements[i] !== other._elements[i]) return false
    }
    return true
  }

  /** dataSourceLocator.cpp:194-205 */
  getCommonPrefix(other: HdDataSourceLocator): HdDataSourceLocator {
    const maxPossibleLen = Math.min(this._elements.length, other._elements.length)
    let i = 0
    for (; i < maxPossibleLen; ++i) {
      if (this._elements[i] !== other._elements[i]) break
    }
    return new HdDataSourceLocator(...this._elements.slice(0, i))
  }

  /** dataSourceLocator.cpp:219-235 */
  replacePrefix(oldPrefix: HdDataSourceLocator,
    newPrefix: HdDataSourceLocator): HdDataSourceLocator {
    if (!this.hasPrefix(oldPrefix)) return this
    return new HdDataSourceLocator(...newPrefix._elements,
      ...this._elements.slice(oldPrefix.getElementCount()))
  }

  /** dataSourceLocator.cpp:207-217 */
  intersects(other: HdDataSourceLocator): boolean {
    return this.hasPrefix(other) || other.hasPrefix(this)
  }

  /** dataSourceLocator.cpp:238-253 */
  GetString(delimiter = '/'): string { return this._elements.join(delimiter) }

  /** operator==, dataSourceLocator.h:191-193 */
  Equals(other: HdDataSourceLocator): boolean {
    if (this._elements.length !== other._elements.length) return false
    return this._elements.every((e, i) => e === other._elements[i])
  }

  /** operator<, dataSourceLocator.cpp:255-274 */
  lessThan(rhs: HdDataSourceLocator): boolean {
    const lhslen = this._elements.length
    const rhslen = rhs._elements.length
    const len = Math.min(lhslen, rhslen)
    for (let i = 0; i < len; ++i) {
      const a = this._elements[i]!, b = rhs._elements[i]!
      if (a < b) return true
      if (a > b) return false
    }
    // If we end up here, one of *this and rhs is a prefix of the other,
    // or they're equal.
    return lhslen < rhslen
  }

  /** operator<<, dataSourceLocator.cpp:277-281 */
  toString(): string { return this.GetString() }
}

function _Flatten(elements: (string | HdDataSourceLocator)[]): string[] {
  const out: string[] = []
  for (const e of elements) {
    if (typeof e === 'string') out.push(e)
    else for (let i = 0; i < e.getElementCount(); i++) out.push(e.getElement(i))
  }
  return out
}

/** _LessThanNotPrefix, dataSourceLocator.cpp:331-360.
 *  Long-form version of "return (a < b) && (!b.HasPrefix(a));" */
function _LessThanNotPrefix(a: HdDataSourceLocator, b: HdDataSourceLocator): boolean {
  if (a.IsEmpty()) return false
  const len = Math.min(a.getElementCount(), b.getElementCount())
  for (let i = 0; i < len; ++i) {
    const ae = a.getElement(i), be = b.getElement(i)
    if (ae < be) {
      // e.g. /foo/a < /foo/b
      return true
    } else if (ae > be) {
      // e.g. /foo/b !< /foo/a
      return false
    }
  }
  // If we end up here, one of a and b is a prefix of the other, or they're
  // equal. if lhslen <= rhslen, a is a prefix of b, so return false.
  // ... otherwise, a > b, so return false.
  return false
}

/** std::lower_bound over a sorted array with a less-than predicate. */
function _LowerBound<T, V>(arr: T[], begin: number, value: V,
  less: (elem: T, value: V) => boolean): number {
  let lo = begin, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (less(arr[mid]!, value)) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** HdDataSourceLocatorSet, dataSourceLocator.h:234-412,
 *  dataSourceLocator.cpp:285-759. The generators are kept as the
 *  lexicographically sorted minimal list, as upstream. */
export class HdDataSourceLocatorSet {
  private _locators: HdDataSourceLocator[] = []

  /** dataSourceLocator.cpp:304-310 */
  static readonly UniversalSet = new HdDataSourceLocatorSet(
    [HdDataSourceLocator.EmptyLocator]
  )

  /** Empty set (dataSourceLocator.h:258), single locator
   *  (dataSourceLocator.cpp:312-316), initializer list, sorted and
   *  uniquified (dataSourceLocator.cpp:318-326), or copy. */
  constructor(locators: HdDataSourceLocator | Iterable<HdDataSourceLocator> = []) {
    if (locators instanceof HdDataSourceLocator) {
      this._locators = [locators]
    } else if (locators instanceof HdDataSourceLocatorSet) {
      this._locators = [...locators._locators]
    } else {
      this._locators = [...locators]
      this._normalize()
    }
  }

  /** _Normalize, dataSourceLocator.cpp:287-302: sort and uniquify. */
  private _normalize(): void {
    if (this._locators.length < 2) return
    this._locators.sort((a, b) => a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0)
    for (let i = 1; i < this._locators.length;) {
      if (this._locators[i]!.intersects(this._locators[i - 1]!)) {
        this._locators.splice(i, 1)
      } else {
        ++i
      }
    }
  }

  /** _InsertAndDeleteSuffixes, dataSourceLocator.cpp:362-379. Returns the
   *  new position. */
  private _insertAndDeleteSuffixes(position: number, locator: HdDataSourceLocator): number {
    this._locators.splice(position, 0, locator)
    // If we inserted anything, we need to walk forward and delete any
    // suffixes of the inserted item.
    const deleteStart = position + 1
    let deleteEnd = deleteStart
    while (deleteEnd < this._locators.length &&
           this._locators[deleteEnd]!.hasPrefix(this._locators[position]!)) {
      deleteEnd++
    }
    if (deleteEnd !== deleteStart) {
      this._locators.splice(deleteStart, deleteEnd - deleteStart)
    }
    return position
  }

  /** insert(locator), dataSourceLocator.cpp:381-405, and
   *  insert(locatorSet), dataSourceLocator.cpp:407-447. */
  insert(locatorOrSet: HdDataSourceLocator | HdDataSourceLocatorSet): void {
    if (locatorOrSet instanceof HdDataSourceLocatorSet) {
      this._insertSet(locatorOrSet)
      return
    }
    const locator = locatorOrSet
    if (this._locators.length === 0) {
      this._locators.push(locator)
      return
    }
    // Binary search for locators of interest already in the set.
    // Locators already in the set can be split into 3 disjoint ranges:
    //  { e < locator }, { locator.HasPrefix(e) }, { e > locator }
    // (... in that order, where the first range fails the prefix check).
    // Searching for "locator":
    // 1.) If we find e with locator.HasPrefix(e), no-op since locator is
    //     already in the set.
    // 2.) Otherwise, we look for the first index where e > locator, and
    //     insert locator there.
    const it = _LowerBound(this._locators, 0, locator, _LessThanNotPrefix)
    if (it < this._locators.length && locator.hasPrefix(this._locators[it]!)) {
      return
    }
    // Otherwise, we need to add it.
    this._insertAndDeleteSuffixes(it, locator)
  }

  /** Pre-existing TS spelling of insert(). */
  add(locator: HdDataSourceLocator | HdDataSourceLocatorSet): void {
    this.insert(locator)
  }

  private _insertSet(locatorSet: HdDataSourceLocatorSet): void {
    if (locatorSet._locators.length === 0) return
    if (this._locators.length === 0) {
      this._locators = [...locatorSet._locators]
      return
    }
    // Like with single-insert, both sets are sorted, so that for any element
    // L in locatorSet, _locators is partitioned into the disjoint ranges:
    //  { e < locator }, { locator.HasPrefix(e) }, { e > locator }
    // This monotonicity lets us do the set insert with one pass through
    // _locators.
    let thisIt = 0
    const other = locatorSet._locators
    for (let otherIt = 0; otherIt < other.length; ++otherIt) {
      while (thisIt < this._locators.length &&
             _LessThanNotPrefix(this._locators[thisIt]!, other[otherIt]!)) {
        ++thisIt
      }
      if (thisIt === this._locators.length) {
        // If we've reached the end of _locators, append the rest of
        // locatorSet to the end.
        this._locators.push(...other.slice(otherIt))
        return
      }
      if (other[otherIt]!.hasPrefix(this._locators[thisIt]!)) {
        // otherIt is already in the set.
        continue
      }
      // Otherwise, we need to add it.
      thisIt = this._insertAndDeleteSuffixes(thisIt, other[otherIt]!)
    }
  }

  /** append, dataSourceLocator.cpp:466-475 */
  append(locator: HdDataSourceLocator): void {
    if (this._locators.length === 0 ||
        _LessThanNotPrefix(this._locators[this._locators.length - 1]!, locator)) {
      this._locators.push(locator)
    } else {
      this.insert(locator)
    }
  }

  /** operator==, dataSourceLocator.h:303-305 */
  Equals(rhs: HdDataSourceLocatorSet): boolean {
    if (this._locators.length !== rhs._locators.length) return false
    return this._locators.every((l, i) => l.Equals(rhs._locators[i]!))
  }

  /** _FirstIntersection, dataSourceLocator.cpp:489-525. Returns an index or
   *  _locators.length. The small-set linear scan and the binary search
   *  give the same answer, so only the latter's result rule is needed when
   *  the set is normalized; both are kept for fidelity. */
  private _firstIntersection(locator: HdDataSourceLocator): number {
    const binarySearchCutoff = 5
    if (this._locators.length < binarySearchCutoff) {
      for (let i = 0; i < this._locators.length; ++i) {
        if (this._locators[i]!.intersects(locator)) return i
      }
      return this._locators.length
    }
    const it = _LowerBound(this._locators, 0, locator, _LessThanNotPrefix)
    if (it < this._locators.length &&
        (locator.hasPrefix(this._locators[it]!) || this._locators[it]!.hasPrefix(locator))) {
      return it
    }
    return this._locators.length
  }

  /** True if and only if the given locator or any of its descendants is in
   *  the set (closed under descendancy). dataSourceLocator.cpp:527-531
   *  (locator) and 533-595 (locator set; the pairwise comparison, which
   *  upstream uses below its zipper cutoff, gives the same result for
   *  every size). */
  intersects(locatorOrSet: HdDataSourceLocator | HdDataSourceLocatorSet): boolean {
    if (locatorOrSet instanceof HdDataSourceLocatorSet) {
      const lhs = this._locators, rhs = locatorOrSet._locators
      for (let i = 0; i < lhs.length; i++) {
        for (let j = 0; j < rhs.length; j++) {
          if (lhs[i]!.intersects(rhs[j]!)) return true
        }
      }
      return false
    }
    return this._firstIntersection(locatorOrSet) !== this._locators.length
  }

  /** True if the set (closed under descendancy) contains the given locator,
   *  i.e. a prefix of the locator is a generator of the set.
   *  dataSourceLocator.cpp:597-618.
   *
   *  Earlier versions of this port answered Intersects() here (a set
   *  holding only a descendant of the locator also "contained" it); the
   *  upstream semantics are used now. */
  contains(locator: HdDataSourceLocator): boolean {
    const binarySearchCutoff = 5
    if (this._locators.length < binarySearchCutoff) {
      for (const l of this._locators) {
        if (locator.hasPrefix(l)) return true
      }
      return false
    }
    const it = _LowerBound(this._locators, 0, locator, _LessThanNotPrefix)
    return it < this._locators.length && locator.hasPrefix(this._locators[it]!)
  }

  /** dataSourceLocator.cpp:620-624 */
  IsEmpty(): boolean { return this._locators.length === 0 }

  /** ReplacePrefix, dataSourceLocator.cpp:626-702. Returns a sorted locator
   *  set wherein locators that have oldPrefix as a prefix use newPrefix
   *  instead. (The upstream binary-search path for large sets computes the
   *  same result as the small-set path used here for every size.) */
  replacePrefix(oldPrefix: HdDataSourceLocator,
    newPrefix: HdDataSourceLocator): HdDataSourceLocatorSet {
    if (this.IsEmpty() || oldPrefix.Equals(newPrefix)) return new HdDataSourceLocatorSet(this)
    const result = new HdDataSourceLocatorSet()
    result._locators = this._locators.map(l => l.replacePrefix(oldPrefix, newPrefix))
    result._normalize()
    return result
  }

  /** Intersection, dataSourceLocator.cpp:704-743 (IntersectionIterator and
   *  IntersectionView). Every element in the intersection has locator as a
   *  prefix.
   *
   *  Examples:
   *  Intersection of { primvars:color } with primvars is
   *                  { primvars:color }.
   *  Intersection of { primvars:color } with primvars:color:interpolation is
   *                  { primvars:color:interpolation }. */
  *intersection(locator: HdDataSourceLocator): IterableIterator<HdDataSourceLocator> {
    const end = this._locators.length
    let it = this._firstIntersection(locator)
    let isFirst = true
    while (it !== end) {
      const cur = this._locators[it]!
      yield (isFirst && locator.hasPrefix(cur)) ? locator : cur
      isFirst = false
      ++it
      if (it !== end && !this._locators[it]!.hasPrefix(locator)) {
        it = end
      }
    }
  }

  /** operator<<, dataSourceLocator.cpp:745-759 */
  toString(): string {
    return `{ ${this._locators.map(l => l.GetString()).join(', ')} }`
  }

  /** Iterates through the minimal, lexicographically sorted list of
   *  locators generating this set (dataSourceLocator.cpp:477-487). */
  [Symbol.iterator](): Iterator<HdDataSourceLocator> {
    return this._locators[Symbol.iterator]()
  }
}
