// Ported from OpenUSD 26.11.1: pxr/exec/vdf/boxedContainer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/boxedContainer.h.
//
// Vdf_BoxedContainer<T> stores multiple values that flow through the network
// as a single data flow element. The element type is a TfType argument
// (openexec-x1.md 4.1 "Value-type template parameters"):
// `Vdf_BoxedContainer<int> b(n)` is `new Vdf_BoxedContainer<number>(intType, n)`.
// The TfSmallVector local-capacity tuning (boxedContainer.h:94-104) is a
// storage trick with no TS counterpart; the elements are a JS array.

import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'
import { Vdf_NewTypedArray } from './defaultInitAllocator.ts'
import { Vdf_Equals } from './traits.ts'
import { Vdf_CopyElement } from './vectorImpl_Dispatch.ts'

/** A range of data elements as denoted by [ begin, end ) indices (boxedContainer.h:28-32). */
export interface Vdf_BoxedRangesRange {
  begin: number
  end: number
}

/**
 * Each range represents a logical group of elements stored in a
 * Vdf_BoxedContainer (boxedContainer.h:19-73).
 */
export class Vdf_BoxedRanges {
  // The individual ranges stored in this vector (boxedContainer.h:69-71).
  _ranges: Vdf_BoxedRangesRange[]

  /**
   * Constructs an empty set of boxed ranges, or a set with one range
   * containing all `n` elements (boxedContainer.h:34-42).
   */
  constructor(n?: number) {
    this._ranges = n === undefined ? [] : [{ begin: 0, end: n }]
  }

  /** Returns the number of individual ranges stored in this container (boxedContainer.h:44-48). */
  getNumRanges(): number {
    return this._ranges.length
  }

  /** Returns the range at index `i` (boxedContainer.h:50-55). */
  getRange(i: number): Vdf_BoxedRangesRange {
    const range = this._ranges[i]!
    return { begin: range.begin, end: range.end }
  }

  /** Appends a new group (boxedContainer.h:57-61). */
  appendRange(begin: number, end: number): void {
    this._ranges.push({ begin, end })
  }

  /** Copy. */
  Clone(): Vdf_BoxedRanges {
    const copy = new Vdf_BoxedRanges()
    copy._ranges = this._ranges.map((r) => ({ begin: r.begin, end: r.end }))
    return copy
  }

  /** swap (boxedContainer.h:63-66). */
  swap(rhs: Vdf_BoxedRanges): void {
    const tmp = this._ranges
    this._ranges = rhs._ranges
    rhs._ranges = tmp
  }
}

/**
 * Stores multiple values that flow through the network as a single data
 * flow element (boxedContainer.h:76-186).
 */
export class Vdf_BoxedContainer<T> {
  readonly _type: TfType
  // The elements stored in this container (boxedContainer.h:181).
  _data: T[]
  // The individual ranges stored in this vector (boxedContainer.h:185).
  _ranges: Vdf_BoxedRanges

  /**
   * Constructs an empty container with no elements and no ranges, or a
   * container with `n` default initialized elements and one range containing
   * all elements (boxedContainer.h:108-118).
   */
  constructor(type: TfType, n?: number) {
    this._type = type
    if (n === undefined) {
      this._data = []
      this._ranges = new Vdf_BoxedRanges()
    } else {
      this._data = Vdf_NewTypedArray<T>(type, n)
      this._ranges = new Vdf_BoxedRanges(n)
    }
  }

  /** The element type T. */
  getType(): TfType {
    return this._type
  }

  /** The copy constructor: copies each element and the ranges. */
  Clone(): Vdf_BoxedContainer<T> {
    const copy = new Vdf_BoxedContainer<T>(this._type)
    copy._data = this._data.map(Vdf_CopyElement)
    copy._ranges = this._ranges.Clone()
    return copy
  }

  /**
   * The move constructor: takes this container's elements and ranges and
   * leaves this container empty.
   */
  moveOut(): Vdf_BoxedContainer<T> {
    const moved = new Vdf_BoxedContainer<T>(this._type)
    moved.swap(this)
    return moved
  }

  /** Returns true if `rhs` compares equal with this container (boxedContainer.h:120-124). */
  Equals(rhs: Vdf_BoxedContainer<T>): boolean {
    return Vdf_Equals(this._data, rhs._data)
  }

  /** operator!= (boxedContainer.h:126-130). */
  notEquals(rhs: Vdf_BoxedContainer<T>): boolean {
    return !this.Equals(rhs)
  }

  /** Returns true if the container does not hold any elements (boxedContainer.h:132-136). */
  empty(): boolean {
    return this._data.length === 0
  }

  /** Returns the number of elements stored in this container (boxedContainer.h:138-142). */
  size(): number {
    return this._data.length
  }

  /**
   * Reserves storage for `n` elements (boxedContainer.h:144-148). JS arrays
   * grow on demand; nothing to reserve.
   */
  reserve(_n: number): void {}

  /** operator[] const (boxedContainer.h:150-154). */
  Get(i: number): T {
    return this._data[i]!
  }

  /** operator[] (boxedContainer.h:156-160): assign the element at index `i`. */
  Set(i: number, value: T): void {
    if (i >= this._data.length) {
      TF_CODING_ERROR(`Vdf_BoxedContainer index ${i} out of range (size ${this._data.length})`)
      throw new RangeError(`Vdf_BoxedContainer index ${i} out of range`)
    }
    this._data[i] = value
  }

  /**
   * data() (boxedContainer.h:162-172): the element storage. A pointer to the
   * first element is the array with offset 0.
   */
  data(): T[] {
    return this._data
  }

  /** Returns the subranges of boxed data (boxedContainer.h:174-178). */
  getRanges(): Vdf_BoxedRanges {
    return this._ranges
  }

  /**
   * Appends the data elements of `values` to the end of the container, and
   * adds a new group containing those same data elements
   * (boxedContainer.h:180-183, 191-200).
   */
  appendRange(values: Iterable<T>): void {
    const previousSize = this._data.length
    for (const value of values) {
      this._data.push(value)
    }
    this._ranges.appendRange(previousSize, this._data.length)
  }

  /** swap (boxedContainer.h:173-178). */
  swap(rhs: Vdf_BoxedContainer<T>): void {
    const tmp = this._data
    this._data = rhs._data
    rhs._data = tmp
    this._ranges.swap(rhs._ranges)
  }

  *[Symbol.iterator](): Iterator<T> {
    yield* this._data
  }
}
