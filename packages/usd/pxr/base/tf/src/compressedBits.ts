// Ported from OpenUSD 26.11.1: pxr/base/tf/compressedBits.cpp,
//  pxr/base/tf/compressedBits.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfCompressedBits: run-length encoded bit array, ported from OpenUSD v26.08
// pxr/base/tf/compressedBits.h:30-1962 and compressedBits.cpp:19-292.
//
// The bit array is stored as alternating "platforms" (compressedBits.h:36-50):
// a running bit gives the value of the first platform, and every following
// platform toggles the value. All sizes are uint32 as upstream (_WordType and
// _num, compressedBits.h:63, 1380).

import { TfDiagnosticMgr, TfDiagnosticType, TfError } from './diagnostic.ts'
import { ArchHash64 } from 'typescript-usd/arch'
import { TfHashCombine, Tf_HashState } from './hash.ts'

// compressedBits.h:1634-1641 on a 64-bit ABI: _WordArray is a pointer, six
// local words and two uint32 counts (40 bytes), followed by uint32 _num and
// uint8 _runningBit, padded to pointer alignment.
const SIZEOF_TF_COMPRESSED_BITS = 48
const WORD_SIZE = 4

// TF_VERIFY posts a coding error and yields the condition (diagnostic.h).
function tfVerify(condition: boolean, expression: string): boolean {
  if (!condition) {
    TfDiagnosticMgr.GetInstance().postError(new TfError(
      `Failed verification: ' ${expression} '`, TfDiagnosticType.CodingError))
  }
  return condition
}

// compressedBits.h:72-268: re-allocating word array with a six-word local
// storage optimization that doubles its capacity when full.
class _WordArray {
  static readonly LOCAL_SIZE = 6
  data = new Uint32Array(_WordArray.LOCAL_SIZE)
  numAllocated = _WordArray.LOCAL_SIZE
  num = 0

  // compressedBits.h:104-127
  clear(): void { this.num = 0 }
  pushBack(value: number): void {
    if (this.num >= this.numAllocated) this.#reallocate()
    this.data[this.num] = value
    ++this.num
  }
  popBack(): void { --this.num }
  popBackNum(popNum: number): void { this.num -= popNum }

  // compressedBits.h:131-155: the moved-from array reverts to local storage.
  moveInto(rhs: _WordArray): void {
    rhs.data = this.data
    rhs.numAllocated = this.numAllocated
    rhs.num = this.num
    this.data = new Uint32Array(_WordArray.LOCAL_SIZE)
    this.numAllocated = _WordArray.LOCAL_SIZE
  }

  // compressedBits.h:158-167
  swap(rhs: _WordArray): void {
    if (!this.#isStoredLocally() && !rhs.#isStoredLocally()) {
      const data = this.data, numAllocated = this.numAllocated, num = this.num
      this.data = rhs.data; this.numAllocated = rhs.numAllocated; this.num = rhs.num
      rhs.data = data; rhs.numAllocated = numAllocated; rhs.num = num
      return
    }
    // std::swap through the copy constructor and copy assignment.
    const tmp = this.Clone()
    this.assign(rhs)
    rhs.assign(tmp)
  }

  #isStoredLocally(): boolean { return this.numAllocated === _WordArray.LOCAL_SIZE }

  // compressedBits.h:228-247: grows to rhs's allocation only when needed.
  assign(rhs: _WordArray): void {
    if (rhs === this) return
    if (rhs.num > 0 && this.numAllocated < rhs.num) {
      this.data = new Uint32Array(rhs.numAllocated)
      this.numAllocated = rhs.numAllocated
    }
    this.data.set(rhs.data.subarray(0, rhs.num))
    this.num = rhs.num
  }

  Clone(): _WordArray {
    const result = new _WordArray()
    result.assign(this)
    return result
  }

  get(index: number): number { return this.data[index]! }
  set(index: number, value: number): void { this.data[index] = value }
  getNum(): number { return this.num }
  getNumAllocated(): number { return this.numAllocated }
  Front(): number { return this.data[0]! }
  Back(): number { return this.data[this.num - 1]! }
  setFront(value: number): void { this.data[0] = value }
  setBack(value: number): void { this.data[this.num - 1] = value }

  // compressedBits.h:250-256
  #reallocate(): void {
    this.numAllocated *= 2
    const next = new Uint32Array(this.numAllocated)
    next.set(this.data.subarray(0, this.num))
    this.data = next
  }
}

/** Mode of a TfCompressedBits view (compressedBits.h:275). */
export enum TfCompressedBitsMode { All, AllSet, AllUnset, Platforms }

/** The TfBits surface TfCompressedBits converts from (compressedBits.cpp:19-41). */
export interface TfBitsSource {
  getSize(): number
  isSet(index: number): boolean
  findNextSet(index: number): number
  findNextUnset(index: number): number
}

/** The TfBits surface TfCompressedBits decompresses into (compressedBits.cpp:270-285). */
export interface TfBitsTarget {
  resize(num: number): void
  clearAll(): void
  assign(index: number, value: boolean): void
}

type LogicalOp = (a: number, b: number) => number
// compressedBits.h:1419-1438
const _And: LogicalOp = (a, b) => a & b
const _Or: LogicalOp = (a, b) => a | b
const _Xor: LogicalOp = (a, b) => a ^ b

export class TfCompressedBits {
  #platforms = new _WordArray()
  #num = 0
  #runningBit = 0

  static readonly ComplementTag = Symbol('TfCompressedBits.ComplementTag')

  /**
   * compressedBits.h:321-388:
   * - `new TfCompressedBits(num = 0)` clears all bits;
   * - `new TfCompressedBits(num, first, last)` sets a range;
   * - `new TfCompressedBits(rhs)` copies;
   * - `new TfCompressedBits(rhs, TfCompressedBits.ComplementTag)` copies the complement;
   * - `new TfCompressedBits(bits)` compresses a TfBits.
   */
  constructor(num?: number)
  constructor(num: number, first: number, last: number)
  constructor(rhs: TfCompressedBits, tag?: typeof TfCompressedBits.ComplementTag)
  constructor(bits: TfBitsSource)
  constructor(
    arg: number | TfCompressedBits | TfBitsSource = 0,
    first?: number | typeof TfCompressedBits.ComplementTag,
    last?: number,
  ) {
    if (arg instanceof TfCompressedBits) {
      this.#platforms.assign(arg.#platforms)
      this.#num = arg.#num
      this.#runningBit = arg.#runningBit
      if (first === TfCompressedBits.ComplementTag) {
        // compressedBits.h:376-382
        this.#runningBit = 1 - arg.#runningBit
        if (this.#num === 0) this.#runningBit = 0
      }
      return
    }
    if (typeof arg !== 'number') { this.#fromBits(arg); return }
    const num = arg >>> 0
    this.#num = num
    if (typeof first !== 'number' || last === undefined) {
      // compressedBits.h:321-325
      this.#platforms.pushBack(num)
      return
    }
    // compressedBits.h:329-370
    if (num === 0) { this.#platforms.pushBack(0); return }
    if (!tfVerify(first < num && last < num && first <= last,
      'first < num && last < num && first <= last')) {
      this.#platforms.pushBack(num)
      return
    }
    let trailingZeroes = 0
    const range = last - first + 1
    if (first === 0) {
      this.#runningBit = 1
      this.#platforms.pushBack(range)
      trailingZeroes = num - range
    } else {
      this.#platforms.pushBack(first)
      this.#platforms.pushBack(range)
      trailingZeroes = num - last - 1
    }
    if (trailingZeroes !== 0) this.#platforms.pushBack(trailingZeroes)
  }

  // compressedBits.cpp:19-41
  #fromBits(bits: TfBitsSource): void {
    this.#num = bits.getSize()
    if (bits.getSize() === 0) {
      this.#runningBit = 0
      this.#platforms.pushBack(0)
      return
    }
    let set = bits.isSet(0)
    this.#runningBit = set ? 1 : 0
    let i = 0
    while (i < bits.getSize()) {
      const next = set ? bits.findNextUnset(i + 1) : bits.findNextSet(i + 1)
      this.#platforms.pushBack(next - i)
      set = !set
      i = next
    }
  }

  /** Copy assignment (compressedBits.h:407-417). */
  assign(rhs: TfCompressedBits): this
  /** Assigns `value` to bit `index` (compressedBits.h:571-577). */
  assign(index: number, value: boolean): this
  assign(arg: TfCompressedBits | number, value?: boolean): this {
    if (arg instanceof TfCompressedBits) {
      if (arg === this) return this
      this.#platforms.assign(arg.#platforms)
      this.#num = arg.#num
      this.#runningBit = arg.#runningBit
      return this
    }
    if (value) this.Set(arg)
    else this.clear(arg)
    return this
  }

  /** Move assignment (compressedBits.h:421-435): `rhs` becomes empty. */
  moveAssign(rhs: TfCompressedBits): this {
    if (rhs === this) return this
    this.#num = rhs.#num
    this.#runningBit = rhs.#runningBit
    rhs.#platforms.moveInto(this.#platforms)
    rhs.#platforms.clear()
    rhs.#num = 0
    rhs.#runningBit = 0
    return this
  }

  // compressedBits.h:438-473
  resizeKeepContents(num: number): void {
    num >>>= 0
    if (this.#num === num) return
    const platforms = this.#platforms
    if (num === 0) {
      platforms.clear()
      platforms.pushBack(0)
      this.#runningBit = 0
      this.#num = 0
      return
    }
    if (this.#num < num) {
      if ((1 - this.#runningBit) === (platforms.getNum() & 1)) {
        platforms.setBack(platforms.Back() + (num - this.#num))
      } else {
        platforms.pushBack(num - this.#num)
      }
    } else if (this.#num > num) {
      let diff = this.#num - num
      while (platforms.Back() <= diff) {
        diff -= platforms.Back()
        platforms.popBack()
      }
      platforms.setBack(platforms.Back() - diff)
    }
    this.#num = num
  }

  // compressedBits.h:477-481
  swap(rhs: TfCompressedBits): void {
    const num = this.#num, runningBit = this.#runningBit
    this.#num = rhs.#num; this.#runningBit = rhs.#runningBit
    rhs.#num = num; rhs.#runningBit = runningBit
    this.#platforms.swap(rhs.#platforms)
  }

  // compressedBits.h:485-493
  clearAll(): void {
    if (this.#num <= 0 || (this.#runningBit === 0 && this.#platforms.getNum() === 1)) return
    this.#runningBit = 0
    this.#platforms.clear()
    this.#platforms.pushBack(this.#num)
  }

  // compressedBits.h:497-505
  setAll(): void {
    if (this.#num <= 0 || (this.#runningBit === 1 && this.#platforms.getNum() === 1)) return
    this.#runningBit = 1
    this.#platforms.clear()
    this.#platforms.pushBack(this.#num)
  }

  // compressedBits.h:511-519
  clear(index: number): void {
    if (!tfVerify(index < this.#num, 'index < _num')) return
    const tmp = new TfCompressedBits(this.#num, index, index)
    tmp.complement()
    this.andAssign(tmp)
  }

  // compressedBits.h:525-532
  Set(index: number): void {
    if (!tfVerify(index < this.#num, 'index < _num')) return
    this.orAssign(new TfCompressedBits(this.#num, index, index))
  }

  // compressedBits.h:538-542
  setRange(first: number, last: number): void {
    this.orAssign(new TfCompressedBits(this.#num, first, last))
  }

  // compressedBits.h:547-566
  append(num: number, value: boolean): void {
    if (num === 0) return
    const platforms = this.#platforms
    if (this.#num === 0) {
      platforms.set(0, num)
      this.#runningBit = value ? 1 : 0
      this.#num = num
      return
    }
    const lastValue = this.#runningBit === (platforms.getNum() & 1)
    if (value === lastValue) platforms.setBack(platforms.Back() + num)
    else platforms.pushBack(num)
    this.#num += num
  }

  // compressedBits.h:582-609
  shiftRight(bits: number): void {
    if (this.#num === 0 || bits === 0) return
    const platforms = this.#platforms
    if (this.#runningBit === 0) {
      platforms.setFront(platforms.Front() + bits)
    } else {
      this.#runningBit = 0
      platforms.pushBack(0)
      for (let i = platforms.getNum() - 1; i > 0; --i) platforms.set(i, platforms.get(i - 1))
      platforms.set(0, bits)
    }
    while (platforms.Back() <= bits) {
      bits -= platforms.Back()
      platforms.popBack()
    }
    platforms.setBack(platforms.Back() - bits)
  }

  // compressedBits.h:615-664
  shiftLeft(bits: number): void {
    if (this.#num === 0 || bits === 0) return
    const platforms = this.#platforms
    let trimBits = bits
    let platformIndex = 0
    while (platformIndex < platforms.getNum() && platforms.get(platformIndex) <= trimBits) {
      trimBits -= platforms.get(platformIndex)
      ++platformIndex
    }
    if (platformIndex < platforms.getNum()) {
      platforms.set(platformIndex, platforms.get(platformIndex) - trimBits)
    } else {
      platforms.clear()
      this.#runningBit = 0
      platformIndex = 0
    }
    if (platformIndex > 0) {
      const last = platforms.getNum() - platformIndex
      for (let i = 0; i < last; ++i) platforms.set(i, platforms.get(i + platformIndex))
      platforms.popBackNum(platformIndex)
      if (platformIndex & 1) this.#runningBit = 1 - this.#runningBit
    }
    if ((1 - this.#runningBit) === (platforms.getNum() & 1)) {
      platforms.setBack(platforms.Back() + bits)
      return
    }
    platforms.pushBack(Math.min(this.#num, bits))
  }

  // compressedBits.h:673-680
  isSet(index: number): boolean {
    if (!tfVerify(index < this.#num, 'index < _num')) return false
    return this.#linearSearch(index).bit === 1
  }

  // compressedBits.h:691-716
  findNthSet(nth: number): number {
    let index = 0
    let count = 0
    let bit = this.#runningBit
    for (let i = 0; i < this.#platforms.getNum(); ++i) {
      const platform = this.#platforms.get(i)
      if ((count + platform) * bit > nth) return index + (nth - count)
      index += platform
      count += platform * bit
      bit = 1 - bit
    }
    return this.#num
  }

  // compressedBits.h:725-738
  findNextSet(index: number): number {
    if (index >= this.#num) return this.#num
    const { bit, bitCount } = this.#linearSearch(index)
    return bit === 1 ? index : bitCount
  }

  // compressedBits.h:747-766
  findPrevSet(index: number): number {
    if (index >= this.#num) return this.#num
    const { bit, platformIndex, bitCount } = this.#linearSearch(index)
    if (bit === 1) return index
    const first = bitCount - this.#platforms.get(platformIndex)
    return first > 0 ? first - 1 : this.#num
  }

  // compressedBits.h:774-788
  findNextUnset(index: number): number {
    if (index >= this.#num) return this.#num
    const { bit, bitCount } = this.#linearSearch(index)
    return bit === 0 ? index : bitCount
  }

  // compressedBits.h:792-810: the set bit count and the largest interior gap.
  count(): { numSet: number, maxGap: number } {
    const lastIndex = this.#platforms.getNum() - 1
    let num = 0
    let max = 0
    let bit = this.#runningBit
    for (let i = 0; i < this.#platforms.getNum(); ++i) {
      if (bit === 1) num += this.#platforms.get(i)
      else if (i > 0 && i < lastIndex) max = Math.max(max, this.#platforms.get(i))
      bit = 1 - bit
    }
    return { numSet: num, maxGap: max }
  }

  // compressedBits.h:814-822
  getSize(): number { return this.#num }
  IsEmpty(): boolean { return this.#num === 0 }

  // compressedBits.h:827-833
  getFirstSet(): number {
    if (this.#num === 0 || this.#runningBit === 1) return 0
    return this.#platforms.Front()
  }

  // compressedBits.h:838-851
  getLastSet(): number {
    if (this.#num === 0 || (this.#runningBit === 0 && this.#platforms.getNum() === 1)) {
      return this.#num
    }
    if (this.#runningBit === (this.#platforms.getNum() & 1)) return this.#num - 1
    return this.#num - 1 - this.#platforms.Back()
  }

  // compressedBits.h:855-861
  getNumSet(): number {
    let numSet = 0
    for (let i = 1 - this.#runningBit; i < this.#platforms.getNum(); i += 2) {
      numSet += this.#platforms.get(i)
    }
    return numSet
  }

  // compressedBits.h:865-893
  getNumPlatforms(): number {
    return this.#num === 0 ? 0 : this.#platforms.getNum()
  }
  getNumSetPlatforms(): number {
    if (this.#num === 0) return 0
    const numP = this.#platforms.getNum()
    return Math.floor(numP / 2) + (numP & this.#runningBit)
  }
  getNumUnsetPlatforms(): number {
    if (this.#num === 0) return 0
    const numP = this.#platforms.getNum()
    return Math.floor(numP / 2) + (numP & (1 - this.#runningBit))
  }

  // compressedBits.h:897-917
  areAllSet(): boolean {
    return this.#num === 0 || (this.#runningBit === 1 && this.#platforms.getNum() === 1)
  }
  areAllUnset(): boolean { return !this.isAnySet() }
  isAnySet(): boolean {
    return this.#num > 0 && (this.#runningBit === 1 || this.#platforms.getNum() > 1)
  }
  isAnyUnset(): boolean {
    return this.#num > 0 && (this.#runningBit === 0 || this.#platforms.getNum() > 1)
  }

  // compressedBits.h:923-930
  areContiguouslySet(): boolean {
    const numP = this.#platforms.getNum()
    return this.#num > 0 && numP <= 3 &&
      (numP === 2 ||
        (this.#runningBit === 1 && numP === 1) ||
        (this.#runningBit === 0 && numP === 3))
  }

  // compressedBits.h:934-941
  getAllocatedSize(): number {
    let size = SIZEOF_TF_COMPRESSED_BITS
    if (this.#platforms.getNumAllocated() > _WordArray.LOCAL_SIZE) {
      size += WORD_SIZE * this.#platforms.getNumAllocated()
    }
    return size
  }

  // compressedBits.cpp:43-60: TfHash::Combine(uint8 running bit, uint32
  // platform count) seeds ArchHash64 over the platform words.
  getHash(): bigint {
    if (this.#num === 0) return 0n
    const seed = new Tf_HashState()
    seed._appendU64(0, this.#runningBit)
    seed._appendU64(0, this.#platforms.getNum())
    const words = this.#platforms.data
    return ArchHash64(
      new Uint8Array(words.buffer, words.byteOffset, this.#platforms.getNum() * WORD_SIZE),
      this.#platforms.getNum() * WORD_SIZE, seed.getCode())
  }

  // compressedBits.h:295-316 (FastHash): only the first cache line of words,
  // each combined with the running hash code.
  getFastHash(): bigint {
    if (this.getSize() === 0) return 0n
    let hash = TfHashCombine(BigInt(this.getSize()), BigInt(this.#runningBit),
      BigInt(this.#platforms.getNum()))
    const n = Math.min(this.#platforms.getNum(), 64 / WORD_SIZE)
    for (let i = 0; i < n; ++i) {
      hash = TfHashCombine(hash, BigInt(this.#platforms.get(i)))
    }
    return hash
  }

  // compressedBits.cpp:62-76
  getAsStringLeftToRight(): string {
    let res = ''
    let bit = this.#runningBit
    for (let i = 0; i < this.#platforms.getNum(); ++i) {
      res += String(bit).repeat(this.#platforms.get(i))
      bit = 1 - bit
    }
    return res
  }

  // compressedBits.cpp:78-96
  getAsStringRightToLeft(): string {
    let res = ''
    let bit = this.#runningBit
    if ((this.#platforms.getNum() & 1) === 0) bit = 1 - bit
    for (let i = this.#platforms.getNum() - 1; i >= 0; --i) {
      res += String(bit).repeat(this.#platforms.get(i))
      bit = 1 - bit
    }
    return res
  }

  // compressedBits.cpp:98-125
  getAsRLEString(): string {
    if (this.#num === 0) return ''
    if (this.#num <= 4) return this.getAsStringLeftToRight()
    let bit = this.#runningBit
    let res = `${bit}x${this.#platforms.get(0)}`
    bit = 1 - bit
    for (let i = 1; i < this.#platforms.getNum(); ++i) {
      res += `-${bit}x${this.#platforms.get(i)}`
      bit = 1 - bit
    }
    return res
  }

  // compressedBits.cpp:235-262
  static fromString(source: string): TfCompressedBits {
    const tokens = _TokenizeRLEString(source)
    if (tokens.length === 0) return new TfCompressedBits()
    let result = _FromRLETokens(tokens)
    if (result.getSize() === 0) result = _FromBinaryRepresentation(source)
    return result
  }

  // compressedBits.h:1382-1385: a shared empty bit array.
  static getEmpty(): TfCompressedBits { return EMPTY }

  // compressedBits.h:987-1010
  Equals(rhs: TfCompressedBits): boolean {
    if (this === rhs || (this.#num === 0 && rhs.#num === 0)) return true
    if (this.#num === rhs.#num &&
      this.#runningBit === rhs.#runningBit &&
      this.#platforms.getNum() === rhs.#platforms.getNum()) {
      for (let i = 0; i < this.#platforms.getNum(); ++i) {
        if (this.#platforms.get(i) !== rhs.#platforms.get(i)) return false
      }
      return true
    }
    return false
  }
  notEquals(rhs: TfCompressedBits): boolean { return !this.Equals(rhs) }

  // compressedBits.h:1023-1062 (operator&=)
  andAssign(rhs: TfCompressedBits): this {
    if (!tfVerify(this.#num === rhs.#num, '_num == rhs._num') ||
      this.#num === 0 || rhs.#num === 0) return this
    const numA = this.#platforms.getNum()
    const numB = rhs.#platforms.getNum()
    const bitA = this.#runningBit
    const bitB = rhs.#runningBit
    if (numA === 1) {
      if (bitA === 0) return this
      this.#runningBit = bitB
      this.#platforms.assign(rhs.#platforms)
      return this
    }
    if (numB === 1) {
      if (bitB === 1) return this
      this.clearAll()
      return this
    }
    if (this.#areBoundsDisjoint(rhs)) {
      this.clearAll()
      return this
    }
    return this.#logical(_And, bitB, rhs.#platforms)
  }
  // compressedBits.h:1066-1070 (operator&)
  and(rhs: TfCompressedBits): TfCompressedBits { return new TfCompressedBits(this).andAssign(rhs) }

  // compressedBits.h:1076-1119 (operator|=)
  orAssign(rhs: TfCompressedBits): this {
    if (!tfVerify(this.#num === rhs.#num, '_num == rhs._num') ||
      this.#num === 0 || rhs.#num === 0) return this
    const numA = this.#platforms.getNum()
    const numB = rhs.#platforms.getNum()
    const bitA = this.#runningBit
    const bitB = rhs.#runningBit
    if (numA === 1) {
      if (bitA === 1) return this
      this.#runningBit = bitB
      this.#platforms.assign(rhs.#platforms)
      return this
    }
    if (numB === 1) {
      if (bitB === 0) return this
      this.setAll()
      return this
    }
    if (this.contains(rhs)) return this
    return this.#logical(_Or, bitB, rhs.#platforms)
  }
  // compressedBits.h:1123-1127 (operator|)
  or(rhs: TfCompressedBits): TfCompressedBits { return new TfCompressedBits(this).orAssign(rhs) }

  // compressedBits.h:1134-1152 (operator^=)
  xorAssign(rhs: TfCompressedBits): this {
    if (!tfVerify(this.#num === rhs.#num, '_num == rhs._num') ||
      this.#num === 0 || rhs.#num === 0) return this
    if (this.areAllUnset()) return this.assign(rhs)
    if (rhs.areAllUnset()) return this
    return this.#logical(_Xor, rhs.#runningBit, rhs.#platforms)
  }
  // compressedBits.h:1156-1160 (operator^)
  xor(rhs: TfCompressedBits): TfCompressedBits { return new TfCompressedBits(this).xorAssign(rhs) }

  // compressedBits.h:1167-1209 (operator-=)
  subtractAssign(rhs: TfCompressedBits): this {
    if (!tfVerify(this.#num === rhs.#num, '_num == rhs._num') ||
      this.#num === 0 || rhs.#num === 0) return this
    const numA = this.#platforms.getNum()
    const numB = rhs.#platforms.getNum()
    const bitA = this.#runningBit
    const bitB = rhs.#runningBit
    if (numA === 1) {
      if (bitA === 0) return this
      this.#runningBit = 1 - bitB
      this.#platforms.assign(rhs.#platforms)
      return this
    }
    if (numB === 1) {
      if (bitB === 0) return this
      this.clearAll()
      return this
    }
    if (this.#areBoundsDisjoint(rhs) || !this.hasNonEmptyIntersection(rhs)) return this
    return this.#logical(_And, 1 - bitB, rhs.#platforms)
  }
  // compressedBits.h:1213-1217 (operator-)
  subtract(rhs: TfCompressedBits): TfCompressedBits {
    return new TfCompressedBits(this).subtractAssign(rhs)
  }

  // compressedBits.h:1223-1228
  complement(): this {
    if (this.#num !== 0) this.#runningBit = 1 - this.#runningBit
    return this
  }

  // compressedBits.h:1247-1266 (operator>>, operator<<)
  shiftedRight(bits: number): TfCompressedBits {
    const r = new TfCompressedBits(this); r.shiftRight(bits); return r
  }
  shiftedLeft(bits: number): TfCompressedBits {
    const r = new TfCompressedBits(this); r.shiftLeft(bits); return r
  }

  // compressedBits.h:1277-1313
  hasNonEmptyIntersection(rhs: TfCompressedBits): boolean {
    if (!tfVerify(this.#num === rhs.#num, '_num == rhs._num') ||
      this.#num === 0 || rhs.#num === 0) return false
    const bitA = this.#runningBit
    const bitB = rhs.#runningBit
    if (bitA & bitB) return true
    const numA = this.#platforms.getNum()
    const numB = rhs.#platforms.getNum()
    if (numA === 1) {
      if (bitA === 0) return false
      return rhs.isAnySet()
    }
    if (numB === 1) {
      if (bitB === 0) return false
      return this.isAnySet()
    }
    if (this.#areBoundsDisjoint(rhs)) return false
    return this.#hasLogical(_And, bitB, rhs.#platforms)
  }

  // compressedBits.h:1320-1370
  hasNonEmptyDifference(rhs: TfCompressedBits): boolean {
    if (!tfVerify(this.#num === rhs.#num, '_num == rhs._num') ||
      this.#num === 0 || rhs.#num === 0) return false
    const bitA = this.#runningBit
    const bitB = rhs.#runningBit
    if (bitA && !bitB) return true
    const numA = this.#platforms.getNum()
    const numB = rhs.#platforms.getNum()
    if (numA === 1) {
      if (bitA === 0) return false
      return rhs.isAnyUnset()
    }
    if (numB === 1) {
      if (bitB === 0) return this.isAnySet()
      return false
    }
    const firstSet = this.getFirstSet()
    const rhsFirstSet = rhs.getFirstSet()
    if (firstSet < rhsFirstSet) return true
    const lastSet = this.getLastSet()
    const rhsLastSet = rhs.getLastSet()
    if (lastSet > rhsLastSet || firstSet > rhsLastSet || lastSet < rhsFirstSet) return true
    return this.#hasLogical(_And, 1 - bitB, rhs.#platforms)
  }

  // compressedBits.h:1376-1378
  contains(rhs: TfCompressedBits): boolean { return !rhs.hasNonEmptyDifference(this) }

  // compressedBits.cpp:264-279
  decompress(bits: TfBitsTarget): void {
    bits.resize(this.#num)
    bits.clearAll()
    let bitIndex = 0
    let bitValue = this.#runningBit === 1
    for (let i = 0; i < this.#platforms.getNum(); ++i) {
      const numBits = this.#platforms.get(i)
      for (let j = 0; j < numBits; ++j) {
        bits.assign(bitIndex, bitValue)
        ++bitIndex
      }
      bitValue = !bitValue
    }
  }

  // compressedBits.h:1393-1415, 1924-1946
  getAllView(): TfCompressedBitsView { return new TfCompressedBitsView(this, TfCompressedBitsMode.All) }
  getAllSetView(): TfCompressedBitsView { return new TfCompressedBitsView(this, TfCompressedBitsMode.AllSet) }
  getAllUnsetView(): TfCompressedBitsView { return new TfCompressedBitsView(this, TfCompressedBitsMode.AllUnset) }
  getPlatformsView(): TfCompressedBitsPlatformsView { return new TfCompressedBitsPlatformsView(this) }

  /** @internal Platform words for views (friend access, compressedBits.h:1802). */
  static _getPlatform(bits: TfCompressedBits, index: number): number { return bits.#platforms.get(index) }
  /** @internal */
  static _getNumPlatformWords(bits: TfCompressedBits): number { return bits.#platforms.getNum() }
  /** @internal */
  static _getRunningBit(bits: TfCompressedBits): number { return bits.#runningBit }

  // operator<< (compressedBits.cpp:287-292)
  toString(): string { return this.getAsStringLeftToRight() }

  // compressedBits.h:1443-1545 (_Logical)
  #logical(op: LogicalOp, rhsRunningBit: number, rhsPlatforms: _WordArray): this {
    const platforms = this.#platforms
    const num = this.#num
    const numA = platforms.getNum()
    const numB = rhsPlatforms.getNum()
    let bitA = this.#runningBit
    let bitB = rhsRunningBit
    let b = op(bitA, bitB)
    const result = new _WordArray()
    this.#runningBit = b

    let indexA = 0
    let indexB = 0
    let platformA = platforms.get(indexA)
    let platformB = rhsPlatforms.get(indexB)
    let newTotal = 0
    let newPlatform = 0

    for (;;) {
      if (platformA < platformB) {
        newTotal += platformA
        newPlatform += platformA
        bitA = 1 - bitA
        const newBit = op(bitA, bitB)
        if (newBit !== b) { result.pushBack(newPlatform); newPlatform = 0; b = newBit }
        ++indexA
        platformB = platformB - platformA
        if (indexA === numA) platformA = num - newTotal
        else if (indexA < numA) platformA = platforms.get(indexA)
      } else if (platformA > platformB) {
        newTotal += platformB
        newPlatform += platformB
        bitB = 1 - bitB
        const newBit = op(bitA, bitB)
        if (newBit !== b) { result.pushBack(newPlatform); newPlatform = 0; b = newBit }
        ++indexB
        platformA = platformA - platformB
        if (indexB === numB) platformB = num - newTotal
        else if (indexB < numB) platformB = rhsPlatforms.get(indexB)
      } else {
        newTotal += platformA
        newPlatform += platformA
        bitA = 1 - bitA
        bitB = 1 - bitB
        const newBit = op(bitA, bitB)
        if (newBit !== b || newTotal >= num) {
          result.pushBack(newPlatform); newPlatform = 0; b = newBit
        }
        if (newTotal >= num) break
        ++indexA
        if (indexA === numA) platformA = num - newTotal
        else if (indexA < numA) platformA = platforms.get(indexA)
        ++indexB
        if (indexB === numB) platformB = num - newTotal
        else if (indexB < numB) platformB = rhsPlatforms.get(indexB)
      }
    }
    result.moveInto(this.#platforms)
    return this
  }

  // compressedBits.h:1550-1594 (_HasLogical)
  #hasLogical(op: LogicalOp, rhsRunningBit: number, rhsPlatforms: _WordArray): boolean {
    const platforms = this.#platforms
    let bitA = this.#runningBit
    let bitB = rhsRunningBit
    const numA = platforms.getNum()
    const numB = rhsPlatforms.getNum()
    let indexA = 0
    let indexB = 0
    let sumPlatformA = platforms.get(indexA)
    let sumPlatformB = rhsPlatforms.get(indexB)
    while (indexA < numA && indexB < numB) {
      if (op(bitA, bitB)) return true
      if (sumPlatformA < sumPlatformB) {
        bitA = 1 - bitA
        ++indexA
        sumPlatformA += platforms.data[indexA] ?? 0
      } else if (sumPlatformA > sumPlatformB) {
        bitB = 1 - bitB
        ++indexB
        sumPlatformB += rhsPlatforms.data[indexB] ?? 0
      } else {
        bitA = 1 - bitA
        bitB = 1 - bitB
        ++indexA
        ++indexB
        if (indexA >= numA || indexB >= numB) return false
        sumPlatformA += platforms.get(indexA)
        sumPlatformB += rhsPlatforms.get(indexB)
      }
    }
    return false
  }

  // compressedBits.h:1600-1618 (_LinearSearch)
  #linearSearch(index: number): { bit: number, platformIndex: number, bitCount: number } {
    let bit = this.#runningBit
    let count = 0
    let i: number
    for (i = 0; i < this.#platforms.getNum(); ++i) {
      count += this.#platforms.get(i)
      if (count > index) break
      bit = 1 - bit
    }
    return { bit, platformIndex: i, bitCount: count }
  }

  // compressedBits.h:1627-1631 (_AreBoundsDisjoint)
  #areBoundsDisjoint(rhs: TfCompressedBits): boolean {
    return this.getLastSet() < rhs.getFirstSet() || this.getFirstSet() > rhs.getLastSet()
  }
}

/** Iterator over a TfCompressedBits view (compressedBits.h:1648-1766). */
export class TfCompressedBitsViewIterator {
  constructor(
    private readonly bits: TfCompressedBits | null = null,
    private readonly mode: TfCompressedBitsMode = TfCompressedBitsMode.All,
    private platformIndex = 0,
    private bitIndex = 0,
    private value = 0,
    private bitCounter = 0,
  ) {}

  /** The current bit index (operator*). */
  Get(): number { return this.bitIndex }
  isSet(): boolean { return this.value === 1 }
  isAtEnd(): boolean {
    if (!this.bits) return true
    return this.bitIndex >= this.bits.getSize()
  }
  Equals(rhs: TfCompressedBitsViewIterator): boolean {
    return this.bits === rhs.bits && this.bitIndex === rhs.bitIndex
  }

  // compressedBits.h:1718-1753
  increment(): void {
    const bits = this.bits
    if (!bits) return
    ++this.bitIndex
    ++this.bitCounter
    if (this.bitCounter >= TfCompressedBits._getPlatform(bits, this.platformIndex)) {
      const numP = TfCompressedBits._getNumPlatformWords(bits)
      if ((this.mode === TfCompressedBitsMode.AllSet || this.mode === TfCompressedBitsMode.AllUnset) &&
        this.platformIndex + 1 < numP) {
        this.bitIndex += TfCompressedBits._getPlatform(bits, this.platformIndex + 1)
        this.platformIndex += 2
      } else {
        ++this.platformIndex
        this.value = 1 - this.value
      }
      this.bitCounter = 0
    }
  }
}

/** A per-bit view: All, AllSet or AllUnset (compressedBits.h:1645-1805). */
export class TfCompressedBitsView implements Iterable<number> {
  constructor(private readonly bits: TfCompressedBits, readonly mode: TfCompressedBitsMode) {}

  // compressedBits.h:1771-1782
  begin(): TfCompressedBitsViewIterator {
    const bit = TfCompressedBits._getRunningBit(this.bits)
    if ((this.mode === TfCompressedBitsMode.AllSet && bit === 0) ||
      (this.mode === TfCompressedBitsMode.AllUnset && bit === 1)) {
      return new TfCompressedBitsViewIterator(this.bits, this.mode, 1,
        TfCompressedBits._getPlatform(this.bits, 0), 1 - bit)
    }
    return new TfCompressedBitsViewIterator(this.bits, this.mode, 0, 0, bit)
  }
  // compressedBits.h:1784-1786
  end(): TfCompressedBitsViewIterator {
    return new TfCompressedBitsViewIterator(this.bits, this.mode, 0, this.bits.getSize(), 0)
  }
  // compressedBits.h:1790-1792
  IsEmpty(): boolean { return this.begin().Equals(this.end()) }

  *[Symbol.iterator](): Iterator<number> {
    const end = this.end()
    for (const it = this.begin(); !it.Equals(end); it.increment()) yield it.Get()
  }
}

/** Iterator over platforms (compressedBits.h:1812-1885). */
export class TfCompressedBitsPlatformsIterator {
  constructor(
    private readonly bits: TfCompressedBits,
    private platform: number,
    private value: number,
    private bitIndex = 0,
  ) {}
  /** The first bit index of the current platform (operator*). */
  Get(): number { return this.bitIndex }
  isSet(): boolean { return this.value === 1 }
  getPlatformSize(): number { return TfCompressedBits._getPlatform(this.bits, this.platform) }
  Equals(rhs: TfCompressedBitsPlatformsIterator): boolean {
    return this.bits === rhs.bits && this.platform === rhs.platform
  }
  // compressedBits.h:1873-1877
  increment(): void {
    this.bitIndex += TfCompressedBits._getPlatform(this.bits, this.platform)
    ++this.platform
    this.value = 1 - this.value
  }
}

/** The platforms view (compressedBits.h:1810-1915). */
export class TfCompressedBitsPlatformsView
implements Iterable<{ index: number, isSet: boolean, size: number }> {
  constructor(private readonly bits: TfCompressedBits) {}
  begin(): TfCompressedBitsPlatformsIterator {
    return new TfCompressedBitsPlatformsIterator(this.bits, 0, TfCompressedBits._getRunningBit(this.bits))
  }
  end(): TfCompressedBitsPlatformsIterator {
    return new TfCompressedBitsPlatformsIterator(this.bits,
      TfCompressedBits._getNumPlatformWords(this.bits), 0)
  }
  IsEmpty(): boolean { return this.begin().Equals(this.end()) }
  *[Symbol.iterator](): Iterator<{ index: number, isSet: boolean, size: number }> {
    const end = this.end()
    for (const it = this.begin(); !it.Equals(end); it.increment()) {
      yield { index: it.Get(), isSet: it.isSet(), size: it.getPlatformSize() }
    }
  }
}

// compressedBits.cpp:129-135
function _IsWhiteSpace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t'
}

// compressedBits.cpp:137-180
function _TokenizeRLEString(source: string): number[] {
  const delimiters = ['x', '-']
  let nextDelimiterIdx = 0
  const tokens = [0]
  for (const c of source) {
    if (c >= '0' && c <= '9') {
      tokens[tokens.length - 1] = (tokens.at(-1)! * 10 + (c.charCodeAt(0) - 48)) >>> 0
    } else if (_IsWhiteSpace(c)) {
      continue
    } else if (c === delimiters[nextDelimiterIdx]) {
      nextDelimiterIdx = (nextDelimiterIdx + 1) % delimiters.length
      tokens.push(0)
    } else {
      tokens.length = 0
      break
    }
  }
  return tokens
}

// compressedBits.cpp:182-207
function _FromRLETokens(tokens: number[]): TfCompressedBits {
  if (tokens.length & 1) return new TfCompressedBits()
  const result = new TfCompressedBits()
  for (let i = 0; i < tokens.length; i += 2) {
    const bit = tokens[i]!
    const length = tokens[i + 1]!
    if (bit > 1 || length === 0) return new TfCompressedBits()
    result.append(length, bit === 1)
  }
  return result
}

// compressedBits.cpp:209-233
function _FromBinaryRepresentation(source: string): TfCompressedBits {
  const result = new TfCompressedBits()
  for (const c of source) {
    if (c === '0' || c === '1') result.append(1, c === '1')
    else if (_IsWhiteSpace(c)) continue
    else return new TfCompressedBits()
  }
  return result
}

const EMPTY = new TfCompressedBits()
