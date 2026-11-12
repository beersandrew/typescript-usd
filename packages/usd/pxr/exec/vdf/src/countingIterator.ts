// Ported from OpenUSD 26.11.1: pxr/exec/vdf/countingIterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/countingIterator.h.
//
// Random access counting iterator that operates on an underlying integer
// index (countingIterator.h:15-111). Operators per openexec-x1.md 4.1:
// Deref() (operator*), Get(n) (operator[]), Increment/Decrement (prefix
// ++/--), PostIncrement/PostDecrement (postfix), Add/AddAssign (+, +=),
// Subtract/SubtractAssign (- n, -= n), Distance (iterator - iterator),
// Equals/NotEquals/LessThan/LessEqual/GreaterThan/GreaterEqual.

/** Vdf_CountingIterator (countingIterator.h:15-111). */
export class Vdf_CountingIterator {
  _integer: number

  /** Value initializes the integer, or starts at `i` (countingIterator.h:24-26). */
  constructor(i = 0) {
    this._integer = i
  }

  /** operator* (countingIterator.h:28). */
  deref(): number { return this._integer }

  /** operator[] (countingIterator.h:31-33). */
  Get(n: number): number { return this._integer + n }

  /** operator++ (countingIterator.h:35-38). */
  increment(): this { ++this._integer; return this }

  /** operator++(int) (countingIterator.h:40-44). */
  postIncrement(): Vdf_CountingIterator {
    const r = new Vdf_CountingIterator(this._integer)
    ++this._integer
    return r
  }

  /** operator+ (countingIterator.h:46-50). */
  add(n: number): Vdf_CountingIterator { return new Vdf_CountingIterator(this._integer + n) }

  /** operator+= (countingIterator.h:52-55). */
  addAssign(n: number): this { this._integer += n; return this }

  /** operator-- (countingIterator.h:57-60). */
  decrement(): this { --this._integer; return this }

  /** operator--(int) (countingIterator.h:62-66). */
  postDecrement(): Vdf_CountingIterator {
    const r = new Vdf_CountingIterator(this._integer)
    --this._integer
    return r
  }

  /** operator-(difference_type) (countingIterator.h:68-72). */
  subtract(n: number): Vdf_CountingIterator { return new Vdf_CountingIterator(this._integer - n) }

  /** operator-= (countingIterator.h:74-77). */
  subtractAssign(n: number): this { this._integer -= n; return this }

  /** operator-(const Vdf_CountingIterator &) (countingIterator.h:79-81). */
  distance(rhs: Vdf_CountingIterator): number { return this._integer - rhs._integer }

  /** operator== (countingIterator.h:83-85). */
  Equals(rhs: Vdf_CountingIterator): boolean { return this._integer === rhs._integer }

  /** operator!= (countingIterator.h:87-89). */
  notEquals(rhs: Vdf_CountingIterator): boolean { return this._integer !== rhs._integer }

  /** operator< (countingIterator.h:91-93). */
  lessThan(rhs: Vdf_CountingIterator): boolean { return this._integer < rhs._integer }

  /** operator<= (countingIterator.h:95-97). */
  lessEqual(rhs: Vdf_CountingIterator): boolean { return this._integer <= rhs._integer }

  /** operator> (countingIterator.h:99-101). */
  greaterThan(rhs: Vdf_CountingIterator): boolean { return this._integer > rhs._integer }

  /** operator>= (countingIterator.h:103-105). */
  greaterEqual(rhs: Vdf_CountingIterator): boolean { return this._integer >= rhs._integer }
}

/** std::distance(first, last) for counting iterators. */
export function Vdf_CountingIteratorDistance(first: Vdf_CountingIterator, last: Vdf_CountingIterator): number {
  return last.distance(first)
}
