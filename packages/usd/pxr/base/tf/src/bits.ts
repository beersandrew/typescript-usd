// Ported from OpenUSD 26.11.1: pxr/base/tf/bits.cpp, pxr/base/tf/bits.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfBits — port of OpenUSD v26.11.1 pxr/base/tf/bits.h and bits.cpp.
//
// A fast, fixed-size bit array. Upstream stores 64-bit words and caches the
// number of set bits and the first and last set index (bits.h:85-1079,
// bits.cpp:20-460). This port stores one 32-bit word per 32 bits and computes
// the same queries; the caches are an upstream optimization with no
// observable effect and are dropped.
//
// Resize (bits.h:185) leaves the bits "uninitialized" upstream: callers
// always follow it with ClearAll() or SetAll(). A JS allocation is zeroed,
// which is one valid value of the uninitialized bits.
//
// FAITHFULNESS-DEBT(tf-bits-hash): GetHash (bits.cpp:121-137) is
// ArchHash over the 64-bit words between the first and last set bit, seeded
// with the first set index. Here it is TfHashCombine over (first set index,
// set indices); equal bit arrays still hash alike, but the value differs
// from native. Faithful replacement: ArchHash64 over the 64-bit word layout.

import { TfHashCombine } from './hash.ts'
import { TF_AXIOM, TF_VERIFY } from './diagnostic.ts'

/** TfBits::View modes (bits.h:774-777). */
export enum TfBitsMode { All, AllSet, AllUnset }

export class TfBits {
  #num = 0
  #words: Uint32Array = new Uint32Array(0)

  /** TfBits(size_t num = 0) (bits.h:85), TfBits(num, first, last) (bits.h:95), TfBits(const TfBits &) (bits.h:114). */
  constructor(num?: number)
  constructor(num: number, first: number, last: number)
  constructor(rhs: TfBits)
  constructor(arg: number | TfBits = 0, first?: number, last?: number) {
    if (arg instanceof TfBits) {
      this.#num = arg.#num
      this.#words = arg.#words.slice()
      return
    }
    this.resize(arg)
    this.clearAll()
    if (first !== undefined && last !== undefined) {
      // bits.h:95-111
      if (arg === 0) return
      if (first === 0 && last === arg - 1) {
        this.setAll()
      } else {
        for (let i = first; i <= last; ++i) this.Set(i)
      }
    }
  }

  /** operator= (bits.h:144), and Assign(index, val) (bits.h:402). */
  assign(rhs: TfBits): this
  assign(index: number, val: boolean): this
  assign(arg: TfBits | number, val?: boolean): this {
    if (typeof arg === 'number') {
      if (val) this.Set(arg)
      else this.clear(arg)
      return this
    }
    if (this === arg) return this
    this.#num = arg.#num
    this.#words = arg.#words.slice()
    return this
  }

  /** Move assignment (bits.h:172). */
  moveAssign(rhs: TfBits): this {
    this.swap(rhs)
    return this
  }

  /** Resize (bits.h:185): contents are unspecified after a size change. */
  resize(num: number): void {
    if (this.#num === num && this.#words.length === (num + 31) >>> 5) return
    this.#num = num
    this.#words = new Uint32Array((num + 31) >>> 5)
  }

  /** ResizeKeepContent (bits.h:208). */
  resizeKeepContent(num: number): void {
    if (num === this.#num) return
    const temp = new TfBits(num)
    const n = Math.min(temp.#words.length, this.#words.length)
    for (let i = 0; i < n; ++i) temp.#words[i] = this.#words[i]!
    if (num < this.#num) temp.#clearTrailingBits()
    this.swap(temp)
  }

  /** OrSubset (bits.cpp:252): Or with a smaller or equally sized rhs. */
  orSubset(rhs: TfBits): void {
    if (TF_VERIFY(this.#num >= rhs.#num, '_num >= rhs._num')) this.#or(rhs)
  }

  /** Swap (bits.h:261). */
  swap(rhs: TfBits): void {
    if (this === rhs) return
    const num = this.#num
    const words = this.#words
    this.#num = rhs.#num
    this.#words = rhs.#words
    rhs.#num = num
    rhs.#words = words
  }

  /** ClearAll (bits.h:330). */
  clearAll(): void { this.#words.fill(0) }

  /** SetAll (bits.h:340). */
  setAll(): void {
    this.#words.fill(0xffffffff)
    this.#clearTrailingBits()
  }

  /** Clear (bits.h:353). */
  clear(index: number): void {
    TF_AXIOM(index < this.#num, 'index < _num')
    this.#words[index >>> 5]! &= ~(1 << (index & 31))
  }

  /** Set (bits.h:377). */
  Set(index: number): void {
    TF_AXIOM(index < this.#num, 'index < _num')
    this.#words[index >>> 5]! |= (1 << (index & 31))
  }

  /** IsSet (bits.h:412). */
  isSet(index: number): boolean {
    TF_AXIOM(index < this.#num, 'index < _num')
    return (this.#words[index >>> 5]! & (1 << (index & 31))) !== 0
  }

  /** FindNextSet (bits.h:422): GetSize() if none. */
  findNextSet(index: number): number {
    for (let i = index; i < this.#num; ++i) {
      const w = this.#words[i >>> 5]!
      if (w === 0) { i = ((i >>> 5) << 5) + 31; continue }
      if (w & (1 << (i & 31))) return i
    }
    return this.#num
  }

  /** FindPrevSet (bits.h:440): GetSize() if none. */
  findPrevSet(index: number): number {
    if (index >= this.#num) return this.#num
    for (let i = index; i >= 0; --i) {
      if (this.#words[i >>> 5]! & (1 << (i & 31))) return i
    }
    return this.#num
  }

  /** FindNextUnset (bits.h:458): GetSize() if none. */
  findNextUnset(index: number): number {
    for (let i = index; i < this.#num; ++i) {
      if (!(this.#words[i >>> 5]! & (1 << (i & 31)))) return i
    }
    return this.#num
  }

  /** GetSize (bits.h:475). */
  getSize(): number { return this.#num }

  /** IsEmpty (bits.h:482): size zero. */
  IsEmpty(): boolean { return this.#num === 0 }

  /** GetFirstSet (bits.h:490). */
  getFirstSet(): number { return this.findNextSet(0) }

  /** GetLastSet (bits.h:505). */
  getLastSet(): number { return this.findPrevSet(this.#num - 1) }

  /** GetNumSet (bits.h:520). */
  getNumSet(): number {
    let n = 0
    for (const w of this.#words) {
      let v = w - ((w >>> 1) & 0x55555555)
      v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
      n += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
    }
    return n
  }

  /** AreAllSet (bits.h:534). */
  areAllSet(): boolean { return this.getNumSet() === this.getSize() }

  /** AreAllUnset (bits.h:543). */
  areAllUnset(): boolean { return !this.isAnySet() }

  /** IsAnySet (bits.h:550). */
  isAnySet(): boolean { return this.getFirstSet() < this.getSize() }

  /** IsAnyUnset (bits.h:557). */
  isAnyUnset(): boolean { return !this.areAllSet() }

  /** AreContiguouslySet (bits.h:566). */
  areContiguouslySet(): boolean {
    return this.getNumSet() === this.getLastSet() - this.getFirstSet() + 1
  }

  /** GetHash (bits.cpp:121); see FAITHFULNESS-DEBT(tf-bits-hash) above. */
  getHash(): number {
    const firstSet = this.getFirstSet()
    if (firstSet === this.#num) return firstSet
    const set: number[] = []
    for (const i of this.getAllSetView()) set.push(i)
    return Number(BigInt.asUintN(53, TfHashCombine(firstSet, set)))
  }

  /** GetAsStringLeftToRight (bits.cpp:415). */
  getAsStringLeftToRight(): string {
    let res = ''
    for (let i = 0; i < this.#num; ++i) res += this.isSet(i) ? '1' : '0'
    return res
  }

  /** GetAsStringRightToLeft (bits.cpp:428). */
  getAsStringRightToLeft(): string {
    let res = ''
    for (let i = this.#num - 1; i >= 0; --i) res += this.isSet(i) ? '1' : '0'
    return res
  }

  /** operator== (bits.cpp:139). */
  Equals(rhs: TfBits): boolean {
    if (this === rhs) return true
    if (this.#num !== rhs.#num) return false
    for (let i = 0; i < this.#words.length; ++i) {
      if (this.#words[i] !== rhs.#words[i]) return false
    }
    return true
  }

  /** operator!= (bits.h:611). */
  notEquals(rhs: TfBits): boolean { return !this.Equals(rhs) }

  /** operator&= (bits.cpp:198): sizes must match (TF_AXIOM). */
  andAssign(rhs: TfBits): this {
    if (this === rhs) return this
    TF_AXIOM(this.#num === rhs.#num, '_num == rhs._num')
    for (let i = 0; i < this.#words.length; ++i) this.#words[i]! &= rhs.#words[i]!
    return this
  }

  /** operator& (bits.h:625). */
  and(rhs: TfBits): TfBits { return new TfBits(this).andAssign(rhs) }

  /** operator|= (bits.cpp:229): sizes must match (TF_VERIFY). */
  orAssign(rhs: TfBits): this {
    if (TF_VERIFY(this.#num === rhs.#num, '_num == rhs._num')) this.#or(rhs)
    return this
  }

  /** operator| (bits.h:641). */
  or(rhs: TfBits): TfBits { return new TfBits(this).orAssign(rhs) }

  /** operator^= (bits.cpp:259): sizes must match (TF_AXIOM). */
  xorAssign(rhs: TfBits): this {
    TF_AXIOM(this.#num === rhs.#num, '_num == rhs._num')
    for (let i = 0; i < this.#words.length; ++i) this.#words[i]! ^= rhs.#words[i]!
    return this
  }

  /** operator^ (bits.h:658). */
  xor(rhs: TfBits): TfBits { return new TfBits(this).xorAssign(rhs) }

  /** operator-= (bits.cpp:292): removes the bits set in rhs (TF_AXIOM sizes). */
  subtractAssign(rhs: TfBits): this {
    TF_AXIOM(this.#num === rhs.#num, '_num == rhs._num')
    for (let i = 0; i < this.#words.length; ++i) this.#words[i]! &= ~rhs.#words[i]!
    return this
  }

  /** Complement (bits.cpp:330). */
  complement(): this {
    for (let i = 0; i < this.#words.length; ++i) this.#words[i] = ~this.#words[i]!
    this.#clearTrailingBits()
    return this
  }

  /** operator[] (bits.h:682). */
  Get(index: number): boolean { return this.isSet(index) }

  /** HasNonEmptyIntersection (bits.h:696). */
  hasNonEmptyIntersection(rhs: TfBits): boolean {
    TF_AXIOM(this.#num === rhs.#num, '_num == rhs._num')
    for (let i = 0; i < this.#words.length; ++i) {
      if (this.#words[i]! & rhs.#words[i]!) return true
    }
    return false
  }

  /** HasNonEmptyDifference (bits.h:740): bits set here that are unset in rhs. */
  hasNonEmptyDifference(rhs: TfBits): boolean {
    TF_AXIOM(this.#num === rhs.#num, '_num == rhs._num')
    for (let i = 0; i < this.#words.length; ++i) {
      if (this.#words[i]! & ~rhs.#words[i]!) return true
    }
    return false
  }

  /** Contains (bits.h:787): every bit set in rhs is set here. */
  contains(rhs: TfBits): boolean { return !rhs.hasNonEmptyDifference(this) }

  /** GetAllView (bits.h:1050). */
  getAllView(): Iterable<number> { return this.#view(TfBitsMode.All) }

  /** GetAllSetView (bits.h:1055). */
  getAllSetView(): Iterable<number> { return this.#view(TfBitsMode.AllSet) }

  /** GetAllUnsetView (bits.h:1060). */
  getAllUnsetView(): Iterable<number> { return this.#view(TfBitsMode.AllUnset) }

  /** Iterates the set bits (TfBits::View<AllSet>). */
  [Symbol.iterator](): Iterator<number> { return this.getAllSetView()[Symbol.iterator]() }

  // TfBits::View::const_iterator (bits.h:786-870): the index stays valid
  // across mutations of the bit array, as upstream's does.
  #view(mode: TfBitsMode): Iterable<number> {
    const bits = this
    const find = (i: number): number =>
      mode === TfBitsMode.AllSet ? bits.findNextSet(i)
        : mode === TfBitsMode.AllUnset ? bits.findNextUnset(i)
          : i
    return {
      *[Symbol.iterator]() {
        for (let i = find(0); i < bits.getSize(); i = find(i + 1)) yield i
      },
    }
  }

  // _Or (bits.cpp:236).
  #or(rhs: TfBits): void {
    if (this === rhs) return
    for (let i = 0; i < rhs.#words.length; ++i) this.#words[i]! |= rhs.#words[i]!
  }

  // _ClearTrailingBits (bits.h:1068).
  #clearTrailingBits(): void {
    const rem = this.#num & 31
    if (rem && this.#words.length) {
      this.#words[this.#words.length - 1]! &= (1 << rem) - 1
    }
  }
}
