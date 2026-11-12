// Ported from OpenUSD 26.11.1: pxr/exec/vdf/mask.cpp, pxr/exec/vdf/mask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/mask.h and mask.cpp.
//
// A VdfMask is placed on connections to specify the data flowing through
// them. Masks wrap interned TfCompressedBits (see maskRegistry.ts): equal
// masks share one VdfMask_BitsImpl, so equality and hashing are by identity
// (mask.h:262-264, 559-562).
//
// Value semantics (openexec-x1.md 4.1): VdfMask is a C++ value type whose
// mutators (SetIndex, operator|=, ...) rebind the mask to new interned bits.
// The TS mutators do the same on the object they are called on, so where C++
// copies a mask and then mutates the copy, TS callers Clone() (or construct
// with `new VdfMask(rhs)`) first. Operators follow the TfCompressedBits
// spelling: Equals, NotEquals, And/AndAssign, Or/OrAssign, Xor/XorAssign,
// Subtract/SubtractAssign, Complement (mutating, as upstream's).

import {
  TF_DEV_AXIOM, TF_VERIFY, TfCompressedBits, type TfCompressedBitsViewIterator,
} from 'typescript-usd/tf'
import { Vdf_GetMaskRegistry, VdfMask_BitsImpl } from './maskRegistry.ts'

/**
 * VdfMask::iterator (mask.h:379-458): iterates through the set elements of
 * the mask.
 */
export class VdfMaskIterator {
  // The wrapped VdfMask::Bits iterator (mask.h:457).
  _it: TfCompressedBitsViewIterator

  /**
   * Constructs a null iterator that is already at end (mask.h:388-390). Only
   * a mask passes `bits` (mask.h:446-451).
   */
  constructor(bits?: TfCompressedBits) {
    this._it = (bits ?? TfCompressedBits.getEmpty()).getAllSetView().begin()
  }

  /** operator== (mask.h:392-396). */
  Equals(rhs: VdfMaskIterator): boolean {
    return this._it.Equals(rhs._it)
  }

  /** operator!= (mask.h:398-402). */
  notEquals(rhs: VdfMaskIterator): boolean {
    return !this.Equals(rhs)
  }

  /** Returns the index of the current element (mask.h:404-408). */
  deref(): number {
    return this._it.Get()
  }

  /** Increment the iterator to the next element (mask.h:410-415). */
  increment(): this {
    this._it.increment()
    return this
  }

  /** Returns true if the iteration is finished (mask.h:417-421). */
  isAtEnd(): boolean {
    return this._it.isAtEnd()
  }

  /** Advance the iterator to the end (mask.h:423-427). */
  advanceToEnd(): void {
    this._it = TfCompressedBits.getEmpty().getAllSetView().begin()
  }

  /**
   * Advance the iterator to the first index that is set in the mask located
   * at or after `index` (mask.h:429-443).
   */
  advanceTo(index: number): number {
    if (this._it.isAtEnd()) {
      return 0
    }
    // The index must be ahead of the current iterator position.
    TF_DEV_AXIOM(index >= this._it.Get(), 'index >= *_it')
    while (!this._it.isAtEnd() && this._it.Get() < index) {
      this._it.increment()
    }
    return this._it.Get()
  }
}

/** A VdfMask is placed on connections to specify the data flowing through them. */
export class VdfMask implements Iterable<number> {
  /** Typedef on the internal bitset implementation used (mask.h:38-40). */
  static readonly Bits = TfCompressedBits

  /** VdfMask::iterator (mask.h:379). */
  static readonly iterator = VdfMaskIterator

  // Default constructed / empty masks are represented as null
  // (mask.h:676-678).
  _bits: VdfMask_BitsImpl | null = null

  /** Constructs an empty mask (mask.h:44-46). */
  constructor()
  /** Constructs a mask of size `size` (mask.h:48-58). */
  constructor(size: number)
  /** Constructs a mask from VdfMask::Bits (mask.h:60-77). */
  constructor(bits: TfCompressedBits)
  /** Copy constructor. */
  constructor(rhs: VdfMask)
  constructor(arg?: number | TfCompressedBits | VdfMask) {
    if (arg === undefined) {
      return
    }
    if (typeof arg === 'number') {
      // If size == 0, leave _bits null: the sentinel for a zero size mask.
      if (arg !== 0) {
        this._bits = VdfMask._findOrEmplace(new TfCompressedBits(arg))
      }
      return
    }
    if (arg instanceof VdfMask) {
      this._bits = arg._bits
      return
    }
    // If the bits denote a 1x1 mask, use the static 1x1 mask.
    if (arg.getSize() === 1 && arg.areAllSet()) {
      this._bits = VdfMask._getAllOnes1()._bits
    } else if (arg.getSize() !== 0) {
      this._bits = VdfMask._findOrInsert(arg)
    }
  }

  /**
   * Constructs a mask by moving the contents of `bits` into the mask
   * (mask.h:79-89). `bits` may not be used after passing it here.
   */
  static fromMovedBits(bits: TfCompressedBits): VdfMask {
    const mask = new VdfMask()
    if (bits.getSize() !== 0) {
      mask._bits = VdfMask._findOrEmplace(bits)
    }
    return mask
  }

  /** Copy (the C++ copy constructor). */
  Clone(): VdfMask {
    return new VdfMask(this)
  }

  /** Copy assignment. */
  assign(rhs: VdfMask): this {
    this._bits = rhs._bits
    return this
  }

  /** Swap this mask's bits with `rhs` (mask.h:91-96). */
  swap(rhs: VdfMask): void {
    const tmp = this._bits
    this._bits = rhs._bits
    rhs._bits = tmp
  }

  /** Enables all the bits in the mask (mask.h:104-115). */
  setAll(): void {
    if (!this._bits) {
      return
    }
    const bits = new TfCompressedBits(this._bits.Get().getSize())
    bits.complement()
    this._bits = VdfMask._findOrInsert(bits)
  }

  /** Adds the given `index` to the mask (mask.h:117-130). */
  setIndex(index: number): void {
    if (!TF_VERIFY(this._bits, '_bits')) {
      return
    }
    const copy = new TfCompressedBits(this._bits!.Get())
    copy.Set(index)
    this._bits = VdfMask._findOrEmplace(copy)
  }

  /** Returns true if mask at index is set (mask.h:132-140). */
  isSet(index: number): boolean {
    if (!TF_VERIFY(this._bits, '_bits')) {
      return false
    }
    return this._bits!.Get().isSet(index)
  }

  /** Removes the given `index` from the mask (mask.h:142-155). */
  clearIndex(index: number): void {
    if (!TF_VERIFY(this._bits, '_bits')) {
      return
    }
    const copy = new TfCompressedBits(this._bits!.Get())
    copy.clear(index)
    this._bits = VdfMask._findOrEmplace(copy)
  }

  /** Returns the size of the mask (mask.h:157-168). */
  getSize(): number {
    if (!this._bits) {
      return 0
    }
    return this._bits.Get().getSize()
  }

  /** Returns true if this mask is empty, i.e. of size zero (mask.h:170-175). */
  IsEmpty(): boolean {
    return !this._bits
  }

  /** Returns true if this mask and `mask` have any set entries in common (mask.h:177-186). */
  overlaps(mask: VdfMask): boolean {
    if (this._bits === mask._bits) {
      return this.isAnySet()
    }
    return this.getBits().hasNonEmptyIntersection(mask.getBits())
  }

  /** Returns true if `mask` is a subset-of or equal to this mask (mask.h:188-197). */
  contains(mask: VdfMask): boolean {
    if (this._bits === mask._bits) {
      return true
    }
    return !mask.getBits().hasNonEmptyDifference(this.getBits())
  }

  /** Returns true if this mask has all entries set (mask.h:199-207). */
  isAllOnes(): boolean {
    if (!this._bits) {
      return true
    }
    return this._bits.Get().areAllSet()
  }

  /** Returns true if this mask has all entries unset (mask.h:209-217). */
  isAllZeros(): boolean {
    if (!this._bits) {
      return true
    }
    return this._bits.Get().areAllUnset()
  }

  /** Returns true, if there is at least a single set entry (mask.h:219-227). */
  isAnySet(): boolean {
    if (!this._bits) {
      return false
    }
    return this._bits.Get().isAnySet()
  }

  /** Returns the first set bit in the mask (mask.h:229-237). */
  getFirstSet(): number {
    if (!this._bits) {
      return 0
    }
    return this._bits.Get().getFirstSet()
  }

  /** Returns the last set bit in the mask (mask.h:239-247). */
  getLastSet(): number {
    if (!this._bits) {
      return 0
    }
    return this._bits.Get().getLastSet()
  }

  /** Returns the number of set bits in the mask (mask.h:249-257). */
  getNumSet(): number {
    if (!this._bits) {
      return 0
    }
    return this._bits.Get().getNumSet()
  }

  /**
   * Returns true if the set bits in the mask are contiguous; false if there
   * are no set bits (mask.h:259-270).
   */
  isContiguous(): boolean {
    if (!this._bits) {
      return false
    }
    return this._bits.Get().areContiguouslySet()
  }

  /** operator== (mask.h:276-280). */
  Equals(rhs: VdfMask): boolean {
    return this._bits === rhs._bits
  }

  /** operator!= (mask.h:282-284). */
  notEquals(rhs: VdfMask): boolean {
    return !this.Equals(rhs)
  }

  /**
   * Arbitrary total ordering of masks (mask.h:286-296). The order does not
   * depend on the mask values and may change from run to run.
   */
  static arbitraryLessThan(lhs: VdfMask, rhs: VdfMask): boolean {
    return (lhs._bits?._id ?? 0) < (rhs._bits?._id ?? 0)
  }

  /** operator&= (mask.h:298-310). */
  andAssign(rhs: VdfMask): this {
    if (this._bits === rhs._bits) {
      return this
    }
    this._bits = VdfMask._findOrEmplace(this.getBits().and(rhs.getBits()))
    return this
  }

  /** operator& (mask.h:312-316). */
  and(rhs: VdfMask): VdfMask {
    return new VdfMask(this).andAssign(rhs)
  }

  /** operator|= (mask.h:318-330). */
  orAssign(rhs: VdfMask): this {
    if (this._bits === rhs._bits) {
      return this
    }
    this._bits = VdfMask._findOrEmplace(this.getBits().or(rhs.getBits()))
    return this
  }

  /** operator| (mask.h:332-336). */
  or(rhs: VdfMask): VdfMask {
    return new VdfMask(this).orAssign(rhs)
  }

  /** operator^= (mask.h:338-351). */
  xorAssign(rhs: VdfMask): this {
    if (!this._bits && TF_VERIFY(!rhs._bits, '!rhs._bits')) {
      return this
    }
    this._bits = VdfMask._findOrEmplace(this.getBits().xor(rhs.getBits()))
    return this
  }

  /** operator^ (mask.h:353-357). */
  xor(rhs: VdfMask): VdfMask {
    return new VdfMask(this).xorAssign(rhs)
  }

  /** operator-= (mask.h:359-374): turns off the bits set in both this and `rhs`. */
  subtractAssign(rhs: VdfMask): this {
    if (!this._bits && TF_VERIFY(!rhs._bits, '!rhs._bits')) {
      return this
    }
    const copy = new TfCompressedBits(this.getBits())
    copy.subtractAssign(rhs.getBits())
    this._bits = VdfMask._findOrEmplace(copy)
    return this
  }

  /** operator- (mask.h:376-380). */
  subtract(rhs: VdfMask): VdfMask {
    return new VdfMask(this).subtractAssign(rhs)
  }

  /** Complement. Flips all the bits in the mask (mask.h:382-393). */
  complement(): this {
    if (!this._bits) {
      return this
    }
    this._bits = VdfMask._findOrEmplace(
      new TfCompressedBits(this._bits.Get(), TfCompressedBits.ComplementTag))
    return this
  }

  /**
   * Sets this mask to `rhs` if this mask is of zero size. Otherwise, ors
   * `rhs` into this mask (mask.h:395-406).
   */
  setOrAppend(rhs: VdfMask): this {
    if (!this._bits) {
      this._bits = rhs._bits
    } else {
      this.orAssign(rhs)
    }
    return this
  }

  /** Returns an iterator over the set elements of the mask (mask.h:463-471). */
  begin(): VdfMaskIterator {
    if (!this._bits) {
      return new VdfMaskIterator(TfCompressedBits.getEmpty())
    }
    return new VdfMaskIterator(this._bits.Get())
  }

  /** JS iteration over the set indices. */
  *[Symbol.iterator](): Iterator<number> {
    for (const it = this.begin(); !it.isAtEnd(); it.increment()) {
      yield it.deref()
    }
  }

  /** Returns a mask of the requested size with all elements set (mask.h:473-488). */
  static allOnes(size: number): VdfMask {
    // special-case all-ones of size 1 and 0
    if (size === 0) {
      return new VdfMask()
    } else if (size === 1) {
      return VdfMask._getAllOnes1()
    }
    const bits = new TfCompressedBits(size)
    bits.setAll()
    return new VdfMask(bits)
  }

  /** Returns a mask of the requested size where no element is set (mask.h:490-499). */
  static allZeros(size: number): VdfMask {
    if (size === 0) {
      return new VdfMask()
    }
    return new VdfMask(size)
  }

  /**
   * Returns the mask in an RLE format, e.g. 110001111 is 1x2-0x3-1x4
   * (mask.h:505-520).
   */
  getRLEString(): string {
    if (!this._bits) {
      return ''
    }
    return this._bits.Get().getAsRLEString()
  }

  /** Returns the amount of memory in bytes used by this mask (mask.h:522-531). */
  getMemoryUsage(): number {
    if (!this._bits) {
      return 0
    }
    return this._bits.Get().getAllocatedSize()
  }

  /** Get this mask's content as compressed bits (mask.h:540-548). */
  getBits(): TfCompressedBits {
    if (!this._bits) {
      return TfCompressedBits.getEmpty()
    }
    return this._bits.Get()
  }

  /**
   * Returns a hash for the mask (mask.h:550-553): the identity of the
   * interned bits, 0 for the empty mask. It is also the canonical key of a
   * mask in JS Maps (openexec-x1.md 4.1 "Value semantics").
   */
  getHash(): number {
    return this._bits?._id ?? 0
  }

  /** Hash functor (mask.h:555-562). */
  static hashFunctor(mask: VdfMask): number {
    return mask.getHash()
  }

  /** Output stream operator (mask.cpp:79-87). */
  toString(): string {
    if (!this._bits) {
      return ''
    }
    return this._bits.Get().toString()
  }

  // AllOnes mask of size 1 optimization (mask.h:566-583, 680-681).
  static #allOnes1: VdfMask | undefined

  static _getAllOnes1(): VdfMask {
    if (!VdfMask.#allOnes1) {
      const allOnes1Bits = new TfCompressedBits(1)
      allOnes1Bits.setAll()
      const mask = new VdfMask()
      mask._bits = VdfMask._findOrInsert(allOnes1Bits)
      VdfMask.#allOnes1 = mask
    }
    return new VdfMask(VdfMask.#allOnes1)
  }

  /**
   * Return the interned bits for `bits`, adopting `bits` into a new entry if
   * none is found (mask.cpp:41-52). Do not use `bits` afterwards.
   */
  static _findOrEmplace(bits: TfCompressedBits): VdfMask_BitsImpl {
    const hash = bits.getFastHash()
    return Vdf_GetMaskRegistry(hash).findOrEmplace(bits, hash)
  }

  /** Return the interned bits for `bits`, copying `bits` if needed (mask.cpp:54-65). */
  static _findOrInsert(bits: TfCompressedBits): VdfMask_BitsImpl {
    const hash = bits.getFastHash()
    return Vdf_GetMaskRegistry(hash).findOrInsert(bits, hash)
  }

  /** Erase the interned `bits` (mask.cpp:67-72). */
  static _eraseBits(bits: VdfMask_BitsImpl): void {
    const hash = bits.getHash()
    Vdf_GetMaskRegistry(hash).erase(bits, hash)
  }
}

// Type-level names nested in VdfMask (mask.h:38-40, 379).
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace VdfMask {
  type Bits = TfCompressedBits
  type iterator = VdfMaskIterator
}
