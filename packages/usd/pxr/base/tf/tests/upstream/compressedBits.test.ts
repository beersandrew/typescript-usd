// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/compressedBits.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/tf/testenv/compressedBits.cpp, plus a
// replay of fixtures/compressedBitsOracle.json, captured (FIXTURES.md) by
// linking the real v26.11.1
// libusd_tf. TfBits is not ported, so the TfBits comparison helper is a
// minimal dense stand-in implementing the surface TfCompressedBits converts
// to and from.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TfCompressedBits } from '../../src/index.ts'
import type { TfBitsSource, TfBitsTarget } from '../../src/compressedBits.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

class DenseBits implements TfBitsSource, TfBitsTarget {
  bits: boolean[]
  constructor(size = 0) { this.bits = new Array<boolean>(size).fill(false) }
  getSize(): number { return this.bits.length }
  isSet(index: number): boolean { return this.bits[index]! }
  findNextSet(index: number): number {
    for (let i = index; i < this.bits.length; i++) if (this.bits[i]) return i
    return this.bits.length
  }
  findNextUnset(index: number): number {
    for (let i = index; i < this.bits.length; i++) if (!this.bits[i]) return i
    return this.bits.length
  }
  resize(num: number): void { this.bits.length = num; this.bits.fill(false) }
  clearAll(): void { this.bits.fill(false) }
  assign(index: number, value: boolean): void { this.bits[index] = value }
  Set(index: number): void { this.bits[index] = true }
  complement(): void { this.bits = this.bits.map(bit => !bit) }
  setAll(): void { this.bits.fill(true) }
  getAsStringLeftToRight(): string { return this.bits.map(bit => (bit ? '1' : '0')).join('') }
}

function expectState(b: TfCompressedBits, s: string, numSet = [...s].filter(c => c === '1').length) {
  expect(b.getAsStringLeftToRight()).toBe(s)
  expect(b.getNumSet()).toBe(numSet)
}

describe('TfCompressedBits (testenv/compressedBits.cpp)', () => {
  it('basic API', () => {
    const b = new TfCompressedBits(4)
    expect(b.getSize()).toBe(4)
    expect(b.getNumSet()).toBe(0)
    expect(b.areAllSet()).toBe(false)
    expect(b.areAllUnset()).toBe(true)
    expect(b.isAnySet()).toBe(false)
    expect(b.isAnyUnset()).toBe(true)
    expect(b.areContiguouslySet()).toBe(false)
    expect(b.getFirstSet()).toBe(b.getSize())
    expect(b.getLastSet()).toBe(b.getSize())

    b.Set(0)
    expect(b.isSet(0)).toBe(true)
    expect(b.areContiguouslySet()).toBe(true)
    expect([b.getFirstSet(), b.getLastSet()]).toEqual([0, 0])
    expect(b.getAsStringLeftToRight()).toBe('1000')
    expect(b.getAsStringRightToLeft()).toBe('0001')

    b.Set(2)
    expect(b.areContiguouslySet()).toBe(false)
    expect([b.getFirstSet(), b.getLastSet()]).toEqual([0, 2])
    expect(b.getAsStringRightToLeft()).toBe('0101')

    b.assign(1, true)
    expect(b.areContiguouslySet()).toBe(true)
    expectState(b, '1110')
    expect(b.getAsStringRightToLeft()).toBe('0111')

    b.setAll()
    expect(b.areAllSet()).toBe(true)
    expect(b.isAnyUnset()).toBe(false)
    expect([b.getFirstSet(), b.getLastSet()]).toEqual([0, 3])
    expectState(b, '1111')

    b.assign(0, false)
    expect([b.getFirstSet(), b.getLastSet()]).toEqual([1, 3])
    expectState(b, '0111')
    expect(b.getAsStringRightToLeft()).toBe('1110')

    b.clear(2)
    expect(b.areContiguouslySet()).toBe(false)
    expectState(b, '0101')
    expect(b.getAsStringRightToLeft()).toBe('1010')

    b.clearAll()
    expect(b.areAllUnset()).toBe(true)
    expect(b.getFirstSet()).toBe(4)
    expectState(b, '0000')

    b.setRange(1, 3)
    expect(b.areContiguouslySet()).toBe(true)
    expectState(b, '0111')
    b.Set(1)
    expectState(b, '0111')
    b.clear(0)
    expectState(b, '0111')

    const c = new TfCompressedBits()
    expectState(c, '')
    c.append(2, false); expectState(c, '00')
    c.append(1, false); expectState(c, '000')
    c.append(2, true); expectState(c, '00011')
    c.append(1, true); expectState(c, '000111')
    c.append(3, false); expectState(c, '000111000')
    c.assign(new TfCompressedBits())
    expectState(c, '')
    c.append(3, true); expectState(c, '111')
    const d = new TfCompressedBits(3)
    d.setAll()
    expect(c.Equals(d)).toBe(true)
  })

  it('basic logic operations', () => {
    const a = new TfCompressedBits(4)
    a.setAll()
    const b = new TfCompressedBits(4)
    {
      const c = a.and(b)
      expect(c.areAllUnset()).toBe(true)
      expectState(c, '0000')
      c.Set(0); c.Set(1); expectState(c, '1100')
      c.andAssign(a); expectState(c, '1100')
      const d = new TfCompressedBits(a)
      d.clear(0); d.clear(2); expectState(d, '0101')
      c.Set(3); expectState(c, '1101')
      d.andAssign(c); expectState(d, '0101')
    }
    {
      const c = a.or(b)
      expect(c.areAllSet()).toBe(true)
      c.clear(0); c.clear(1); expectState(c, '0011')
      c.orAssign(a); expectState(c, '1111')
      const d = new TfCompressedBits(a)
      d.clear(0); d.clear(2); expectState(d, '0101')
      c.clear(0); c.clear(3); expectState(c, '0110')
      d.orAssign(c); expectState(d, '0111')
    }
    {
      const c = a.xor(b)
      expectState(c, '1111')
      c.clear(0); c.clear(1); expectState(c, '0011')
      c.xorAssign(a); expectState(c, '1100')
    }
    {
      a.complement()
      const c = new TfCompressedBits(a)
      expectState(c, '0000')
      b.complement()
      c.assign(b)
      expectState(c, '1111')
      c.clear(0); c.clear(2); expectState(c, '0101')
      c.complement(); expectState(c, '1010')
    }
    {
      const c = new TfCompressedBits(4)
      c.setAll()
      const d = new TfCompressedBits(4)
      c.subtractAssign(d); expectState(c, '1111')
      d.subtractAssign(c); expectState(d, '0000')
      d.Set(0); d.subtractAssign(c); expectState(d, '0000')
      d.Set(0); d.Set(2); d.subtractAssign(c); expectState(d, '0000')
      d.Set(0); d.Set(3); expectState(d, '1001')
      c.subtractAssign(d); expectState(c, '0110')
      d.setAll(); c.subtractAssign(d); expectState(c, '0000')
    }
  })

  it('contains and overlaps', () => {
    const a = new TfCompressedBits(4)
    a.setRange(1, 3)
    const b = new TfCompressedBits(4)
    b.Set(0); expect(b.hasNonEmptyDifference(a)).toBe(true)
    b.Set(1); expect(b.hasNonEmptyDifference(a)).toBe(true)
    b.Set(2); expect(b.hasNonEmptyDifference(a)).toBe(true)
    b.clear(0); expect(b.hasNonEmptyDifference(a)).toBe(false)
    b.clear(1); expect(b.hasNonEmptyDifference(a)).toBe(false)
    b.clear(2); expect(b.hasNonEmptyDifference(a)).toBe(false)
    a.clear(3); b.Set(3)
    expect(b.hasNonEmptyDifference(a)).toBe(true)
    expect(b.hasNonEmptyIntersection(a)).toBe(false)
    a.Set(3); expect(b.hasNonEmptyIntersection(a)).toBe(true)
    b.clear(3); expect(b.hasNonEmptyIntersection(a)).toBe(false)
    b.Set(2); expect(b.hasNonEmptyIntersection(a)).toBe(true)
    b.Set(1); expect(b.hasNonEmptyIntersection(a)).toBe(true)
    b.Set(3); expect(b.hasNonEmptyIntersection(a)).toBe(true)
    const c = new TfCompressedBits(4)
    c.Set(0)
    expect(b.hasNonEmptyIntersection(c)).toBe(false)
  })

  it('grows and shrinks platform counts across the local storage threshold', () => {
    const a = new TfCompressedBits(10)
    const platforms = () => [a.getNumPlatforms(), a.getNumSetPlatforms(), a.getNumUnsetPlatforms()]
    expect(platforms()).toEqual([1, 0, 1])
    const expected: Array<[number, string, number[]]> = [
      [0, '1000000000', [2, 1, 1]],
      [2, '1010000000', [4, 2, 2]],
      [4, '1010100000', [6, 3, 3]],
      [6, '1010101000', [8, 4, 4]],
      [8, '1010101010', [10, 5, 5]],
      [1, '1110101010', [8, 4, 4]],
      [3, '1111101010', [6, 3, 3]],
      [5, '1111111010', [4, 2, 2]],
      [7, '1111111110', [2, 1, 1]],
      [9, '1111111111', [1, 1, 0]],
    ]
    for (const [index, s, p] of expected) {
      a.Set(index)
      expectState(a, s)
      expect(platforms()).toEqual(p)
    }
  })

  it('iterators, find and find n-th', () => {
    const c = new TfCompressedBits(8)
    for (const i of [1, 2, 3, 6, 7]) c.Set(i)
    expectState(c, '01110011')
    expect([c.getFirstSet(), c.getLastSet()]).toEqual([1, 7])
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(i => c.isSet(i)))
      .toEqual([false, true, true, true, false, false, true, true])

    const walk = (view: ReturnType<TfCompressedBits['getAllView']>) => {
      let count = 0, indices = 0, values = 0
      const end = view.end()
      for (const it = view.begin(); !it.Equals(end); it.increment()) {
        count++; indices += it.Get(); values += it.isSet() ? 1 : 0
      }
      return [count, indices, values]
    }
    expect(walk(c.getAllView())).toEqual([8, 28, 5])
    expect(walk(c.getAllSetView())).toEqual([5, 19, 5])
    expect(walk(c.getAllUnsetView())).toEqual([3, 9, 0])
    expect([...c.getAllSetView()]).toEqual([1, 2, 3, 6, 7])

    let count = 0, indices = 0, values = 0, sizes = 0
    for (const p of c.getPlatformsView()) {
      count++; indices += p.index; values += p.isSet ? 1 : 0; sizes += p.size
    }
    expect([count, indices, values, sizes]).toEqual([4, 11, 2, 8])

    const d = new TfCompressedBits(8)
    expect(d.getAllSetView().begin().isAtEnd()).toBe(true)
    expect(d.getAllSetView().IsEmpty()).toBe(true)
    const e = new TfCompressedBits()
    expect(e.getAllSetView().begin().isAtEnd()).toBe(true)
    expect(e.getAllSetView().IsEmpty()).toBe(true)
    d.setAll()
    expect(d.getAllSetView().begin().isAtEnd()).toBe(false)
    expect([...d.getAllSetView()]).toHaveLength(8)
    const one = new TfCompressedBits(1)
    one.setAll()
    expect([...one.getAllSetView()]).toHaveLength(1)

    let accum = 0
    for (let i = c.getFirstSet(); i < c.getSize(); i = c.findNextSet(i + 1)) accum += i
    expect(accum).toBe(19)
    accum = 0
    for (let i = c.getLastSet(); i < c.getSize();) {
      accum += i
      if (i < 1) break
      i = c.findPrevSet(i - 1)
    }
    expect(accum).toBe(19)
    accum = 0
    for (let i = 0; i < c.getSize(); i = c.findNextUnset(i + 1)) accum += i
    expect(accum).toBe(9)

    expect([0, 1, 2, 3, 4, 5, 6, 100].map(n => c.findNthSet(n))).toEqual([1, 2, 3, 6, 7, 8, 8, 8])
    const ic = new TfCompressedBits(c, TfCompressedBits.ComplementTag)
    expect([0, 1, 2, 3, 4, 100].map(n => ic.findNthSet(n))).toEqual([0, 4, 5, 8, 8, 8])
    const ac = new TfCompressedBits(4); ac.setAll()
    expect([0, 1, 2, 3, 4, 100].map(n => ac.findNthSet(n))).toEqual([0, 1, 2, 3, 4, 4])
    const nc = new TfCompressedBits(4)
    expect([0, 1, 2, 3, 4, 100].map(n => nc.findNthSet(n))).toEqual([4, 4, 4, 4, 4, 4])
  })

  it('compresses and decompresses TfBits', () => {
    const c = new DenseBits(10)
    for (const i of [1, 2, 6, 7, 8]) c.Set(i)
    let cc = new TfCompressedBits(c)
    expectState(cc, '0110001110')
    c.complement()
    cc = new TfCompressedBits(c)
    expectState(cc, '1001110001')
    const d = new DenseBits()
    cc.decompress(d)
    expect(d.getAsStringLeftToRight()).toBe('1001110001')
    const e = new DenseBits(1)
    cc = new TfCompressedBits(e)
    expect([cc.getSize(), cc.getNumSet(), cc.isSet(0)]).toEqual([1, 0, false])
    e.setAll()
    cc = new TfCompressedBits(e)
    expect([cc.getSize(), cc.getNumSet(), cc.isSet(0)]).toEqual([1, 1, true])
    expect(new TfCompressedBits(new DenseBits(0)).getSize()).toBe(0)
  })

  it('shifts', () => {
    const c = new TfCompressedBits(8)
    for (const i of [2, 3, 4, 6]) c.Set(i)
    const right: Array<[number, string]> = [
      [0, '00111010'], [1, '00011101'], [1, '00001110'], [2, '00000011'], [5, '00000000']]
    for (const [n, s] of right) { c.shiftRight(n); expectState(c, s) }
    for (const i of [0, 1, 2, 3, 6, 7]) c.Set(i)
    expectState(c, '11110011')
    for (const [n, s] of [[3, '00011110'], [3, '00000011'], [2, '00000000']] as const) {
      c.shiftRight(n); expectState(c, s)
    }
    c.complement()
    c.shiftRight(4); expectState(c, '00001111')
    c.shiftRight(100); expectState(c, '00000000')
    c.shiftRight(100); expectState(c, '00000000')

    c.clearAll()
    for (const i of [2, 3, 4, 6]) c.Set(i)
    const left: Array<[number, string]> = [
      [0, '00111010'], [1, '01110100'], [1, '11101000'], [2, '10100000'], [5, '00000000']]
    for (const [n, s] of left) { c.shiftLeft(n); expectState(c, s) }
    for (const i of [0, 1, 2, 3, 6, 7]) c.Set(i)
    for (const [n, s] of [[3, '10011000'], [3, '11000000'], [2, '00000000']] as const) {
      c.shiftLeft(n); expectState(c, s)
    }
    c.complement()
    c.shiftLeft(4); expectState(c, '11110000')
    c.shiftLeft(100); expectState(c, '00000000')
    c.shiftLeft(100); expectState(c, '00000000')
  })

  it('resizes keeping contents', () => {
    const b = new TfCompressedBits(6)
    b.Set(0); b.Set(1); b.Set(4)
    for (const [n, s] of [[6, '110010'], [10, '1100100000'], [6, '110010'], [2, '11'], [1, '1']] as const) {
      b.resizeKeepContents(n)
      expect(b.getAsStringLeftToRight()).toBe(s)
    }
    b.resizeKeepContents(0)
    expect([b.getSize(), b.getNumSet()]).toEqual([0, 0])
  })

  it('stays API compatible with TfBits', () => {
    const verify = (a: DenseBits, b: TfCompressedBits) => {
      for (const target of [b, new TfCompressedBits(a)]) {
        expect(target.getSize()).toBe(a.getSize())
        expect(target.getAsStringLeftToRight()).toBe(a.getAsStringLeftToRight())
      }
      const d = new DenseBits()
      b.decompress(d)
      expect(d.getAsStringLeftToRight()).toBe(a.getAsStringLeftToRight())
    }
    for (const size of [0, 1, 4]) {
      const a = new DenseBits(size)
      const b = new TfCompressedBits(size)
      verify(a, b)
      a.setAll(); b.setAll(); verify(a, b)
      a.complement(); b.complement(); verify(a, b)
    }
  })

  it('never stores zero-length platforms for a nonzero size', () => {
    const a = new TfCompressedBits(4)
    a.setRange(0, 3)
    const b = new TfCompressedBits(4)
    b.setAll()
    expect(a.Equals(b)).toBe(true)
    a.clearAll(); a.setRange(2, 3)
    b.clear(0); b.clear(1)
    expect(a.Equals(b)).toBe(true)
  })

  it('builds from string representations', () => {
    for (const source of ['0x5-1x5-0x5', '  0x5 - 1x5 - 0 x 5  ', '000001111100000', '00000 11111 000 00']) {
      const c = TfCompressedBits.fromString(source)
      expect(c.getAsStringLeftToRight()).toBe('000001111100000')
      expect(c.getAsRLEString()).toBe('0x5-1x5-0x5')
    }
    expect(TfCompressedBits.fromString('0x15').getAsRLEString()).toBe('0x15')
    expect(TfCompressedBits.fromString('1x15').getAsStringLeftToRight()).toBe('1'.repeat(15))
    for (const invalid of ['3x15', '1x0', '0x5x1', '0x5-1', '0-5x1', 'foo bar', '1x15 foo', '000001111122222']) {
      expect(TfCompressedBits.fromString(invalid).getSize()).toBe(0)
    }
  })
})

interface OracleState {
  s: string, rle: string, np: number, nsp: number, nup: number, first: number, last: number
  num: number, gap: number, alloc: number, cont: number, nth: number
}
interface OracleStep { op: number, i: number, j: number, n: number, a: OracleState, b: OracleState, rel: number[] }
interface OracleCase { size: number, steps: OracleStep[], resize: number, r: OracleState, appended: OracleState }
const oracle = readOracleFixture(new URL('./fixtures/compressedBitsOracle.json', import.meta.url)) as
  { sizeof: number, cases: OracleCase[] }

function state(b: TfCompressedBits): OracleState {
  const { numSet, maxGap } = b.count()
  return {
    s: b.getAsStringLeftToRight(), rle: b.getAsRLEString(), np: b.getNumPlatforms(),
    nsp: b.getNumSetPlatforms(), nup: b.getNumUnsetPlatforms(), first: b.getFirstSet(),
    last: b.getLastSet(), num: numSet, gap: maxGap, alloc: b.getAllocatedSize(),
    cont: b.areContiguouslySet() ? 1 : 0, nth: b.findNthSet(3),
  }
}

describe('TfCompressedBits matches the v26.11.1 RLE implementation', () => {
  it('replays the captured platform, allocation and relation results', () => {
    expect(new TfCompressedBits().getAllocatedSize()).toBe(oracle.sizeof)
    // Same LCG as the capture, so the appended platform matches.
    let st = 12345
    const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st >>> 8 }
    for (const testCase of oracle.cases) {
      const sz = rnd() % 96 + 1
      expect(sz).toBe(testCase.size)
      const a = new TfCompressedBits(sz)
      let b = new TfCompressedBits(sz)
      for (const step of testCase.steps) {
        const op = rnd() % 14
        let i = rnd() % sz, j = rnd() % sz
        if (i > j) [i, j] = [j, i]
        const n = rnd() % (sz + 4)
        expect([op, i, j, n]).toEqual([step.op, step.i, step.j, step.n])
        switch (op) {
          case 0: a.Set(i); b.Set(j); break
          case 1: a.clear(i); break
          case 2: a.setRange(i, j); break
          case 3: b.setRange(i, j); break
          case 4: a.orAssign(b); break
          case 5: a.andAssign(b); break
          case 6: a.xorAssign(b); break
          case 7: a.subtractAssign(b); break
          case 8: a.complement(); break
          case 9: a.shiftLeft(n); break
          case 10: a.shiftRight(n); break
          case 11: b = new TfCompressedBits(a, TfCompressedBits.ComplementTag); break
          case 12: a.swap(b); break
          case 13: b.shiftRight(n % 5); break
        }
        expect(state(a)).toEqual(step.a)
        expect(state(b)).toEqual(step.b)
        expect([a.contains(b), a.hasNonEmptyIntersection(b), a.hasNonEmptyDifference(b), a.Equals(b)]
          .map(Number).concat([a.findNextSet(i), a.findPrevSet(j), a.findNextUnset(i), Number(a.isSet(i))]))
          .toEqual(step.rel)
      }
      const r = new TfCompressedBits(a)
      const rs = rnd() % 130
      expect(rs).toBe(testCase.resize)
      r.resizeKeepContents(rs)
      expect(state(r)).toEqual(testCase.r)
      const count = rnd() % 7 + 1
      r.append(count, (rnd() & 1) === 1)
      expect(state(r)).toEqual(testCase.appended)
    }
  })
})
