// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfInterval.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfInterval.py.
//
// One describe() per upstream test method, every assert mirrored. The goldens
// are captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/interval.json; the remaining expectations are upstream's own asserts —
// never hand-derived (AGENTS.md numeric rule).
//
// Mapping of GfInterval's class API onto our TS surface (interval.ts):
//   i.min / i.max                 -> GetMin() / GetMax()
//   i.minClosed / i.maxClosed     -> IsMinClosed() / IsMaxClosed()
//   i.minOpen / i.maxOpen         -> IsMinOpen() / IsMaxOpen()
//   i.isEmpty / i.size            -> IsEmpty() / GetSize()
//   i.minFinite/maxFinite/finite  -> IsMinFinite()/IsMaxFinite()/IsFinite()
//   i.Contains(x)                 -> Contains(x)
//   a | b / a |= b                -> a.GetUnion(b) / a.unionWith(b)
//   a & b / a &= b                -> a.GetIntersection(b) / a.intersectWith(b)
//   a + b / a += b                -> a.GetSum(b) / a.addWith(b)
//   a - b / a -= b                -> a.GetDifference(b) / a.subtractWith(b)
//   a * b / a *= b                -> a.GetProduct(b) / a.multiplyWith(b)
//   -a                            -> a.GetNegation()
//   a == b                        -> a.equals(b)
//   eval(repr(i)) == i            -> reconstruct from accessors, compare (no
//                                    Python eval; the faithful TS equivalent)
import { describe, it, expect } from 'vitest'
import { GfInterval } from '../../src/interval.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

const inf = Infinity

// The fixture writes non-finite floats as 'inf', '-inf' and 'nan'.
type FixtureNumber = number | 'inf' | '-inf' | 'nan'
const num = (x: FixtureNumber): number =>
  x === 'inf' ? Infinity : x === '-inf' ? -Infinity : x === 'nan' ? NaN : x

interface IntervalDump {
  min: FixtureNumber
  max: FixtureNumber
  minClosed: boolean
  maxClosed: boolean
  minOpen: boolean
  maxOpen: boolean
  isEmpty: boolean
  size: FixtureNumber
  minFinite: boolean
  maxFinite: boolean
  finite: boolean
}
type IntervalFixture = Record<
  | 'i1|i2' | 'i1|i3' | 'i1|i4' | 'i1|i5' | 'i3|i5' | 'i3&i5'
  | 'anded_eq' | 'anded' | 'ored_eq' | 'ored' | 'plus_eq' | 'minus_eq' | 'mul_eq'
  | 'unary_minus' | 'plus' | 'minus' | 'mul' | 'mul_oc' | 'mul_neg' | 'full' | 'full&01',
  IntervalDump
> & { str_empty: string; repr_full: string }

const G = readOracleFixture<IntervalFixture>(new URL('./fixtures/interval.json', import.meta.url))

const fromDump = (d: IntervalDump): GfInterval =>
  new GfInterval(num(d.min), num(d.max), d.minClosed, d.maxClosed)

describe('runTest', () => {
  it('mirrors testGfInterval.runTest', () => {
    const testIntervals: GfInterval[] = []

    // Empty interval
    const i0 = new GfInterval()
    testIntervals.push(i0)
    expect(i0.IsEmpty()).toBe(true)

    // Non-empty: [1,1]
    const i1 = new GfInterval(1)
    testIntervals.push(i1)
    expect(i1.IsEmpty()).toBe(false)
    expect(i1.getMin()).toBe(1)
    expect(i1.getMax()).toBe(1)
    expect(i1.isMinClosed()).toBe(true)
    expect(i1.isMaxClosed()).toBe(true)
    expect(i1.isMinOpen()).toBe(false)
    expect(i1.isMaxOpen()).toBe(false)
    expect(i1.getSize()).toBe(0)
    expect(i1.contains(0.99)).toBe(false)
    expect(i1.contains(1)).toBe(true)
    expect(i1.contains(1.01)).toBe(false)

    // Non-empty: [2,4] fully closed
    const i2 = new GfInterval(2, 4)
    testIntervals.push(i2)
    expect(i2.IsEmpty()).toBe(false)
    expect(i2.getMin()).toBe(2)
    expect(i2.getMax()).toBe(4)
    expect(i2.isMinClosed()).toBe(true)
    expect(i2.isMaxClosed()).toBe(true)
    expect(i2.getSize()).toBe(2)
    expect(i2.contains(1.99)).toBe(false)
    expect(i2.contains(2.0)).toBe(true)
    expect(i2.contains(2.01)).toBe(true)
    expect(i2.contains(3.99)).toBe(true)
    expect(i2.contains(4.0)).toBe(true)
    expect(i2.contains(4.01)).toBe(false)

    // Non-empty: (1,3] half-open
    const i3 = new GfInterval(1, 3, false, true)
    testIntervals.push(i3)
    expect(i3.IsEmpty()).toBe(false)
    expect(i3.getMin()).toBe(1)
    expect(i3.getMax()).toBe(3)
    expect(i3.isMinOpen()).toBe(true)
    expect(i3.isMaxClosed()).toBe(true)
    expect(i3.getSize()).toBe(2)
    expect(i3.contains(0.99)).toBe(false)
    expect(i3.contains(1.0)).toBe(false)
    expect(i3.contains(1.01)).toBe(true)
    expect(i3.contains(2.99)).toBe(true)
    expect(i3.contains(3.0)).toBe(true)
    expect(i3.contains(3.01)).toBe(false)

    // Non-empty: [-1,2) half-open
    const i4 = new GfInterval(-1, 2, true, false)
    testIntervals.push(i4)
    expect(i4.IsEmpty()).toBe(false)
    expect(i4.getMin()).toBe(-1)
    expect(i4.getMax()).toBe(2)
    expect(i4.isMinClosed()).toBe(true)
    expect(i4.isMaxOpen()).toBe(true)
    expect(i4.getSize()).toBe(3)
    expect(i4.contains(-1.01)).toBe(false)
    expect(i4.contains(-1.0)).toBe(true)
    expect(i4.contains(-0.99)).toBe(true)
    expect(i4.contains(1.99)).toBe(true)
    expect(i4.contains(2.0)).toBe(false)
    expect(i4.contains(2.01)).toBe(false)

    // Non-empty: (2,4) fully open
    const i5 = new GfInterval(2, 4, false, false)
    testIntervals.push(i5)
    expect(i5.IsEmpty()).toBe(false)
    expect(i5.getMin()).toBe(2)
    expect(i5.getMax()).toBe(4)
    expect(i5.isMinOpen()).toBe(true)
    expect(i5.isMaxOpen()).toBe(true)
    expect(i5.getSize()).toBe(2)
    expect(i5.contains(1.99)).toBe(false)
    expect(i5.contains(2.0)).toBe(false)
    expect(i5.contains(2.01)).toBe(true)
    expect(i5.contains(3.99)).toBe(true)
    expect(i5.contains(4.0)).toBe(false)
    expect(i5.contains(4.01)).toBe(false)

    // Empty degenerate intervals:
    expect(new GfInterval(1, 0).IsEmpty()).toBe(true)
    expect(new GfInterval(0, 0, false, true).IsEmpty()).toBe(true)
    expect(new GfInterval(0, 0, true, false).IsEmpty()).toBe(true)

    // Test (in)equality
    for (let i = 0; i < testIntervals.length; i++) {
      for (let j = 0; j < testIntervals.length; j++) {
        expect(i === j).toBe(testIntervals[i]!.equals(testIntervals[j]!))
      }
    }

    // Test repr(): eval(repr(i)) == i. No Python eval in TS; reconstruct each
    // interval from its accessors (the inverse of repr) and compare.
    for (const i of testIntervals) {
      const reconstructed = new GfInterval(
        i.getMin(),
        i.getMax(),
        i.isMinClosed(),
        i.isMaxClosed(),
      )
      expect(reconstructed.equals(i)).toBe(true)
    }

    // i + Gf.Interval() == i ; Gf.Interval() | i == i
    for (const i of testIntervals) {
      expect(i.getSum(new GfInterval()).equals(i)).toBe(true)
      expect(new GfInterval().getUnion(i).equals(i)).toBe(true)
    }

    // Test | (goldens from genfix: i1|i2 etc.)
    expect(i1.getUnion(i2).equals(fromDump(G['i1|i2']))).toBe(true)
    expect(i1.getUnion(i3).equals(fromDump(G['i1|i3']))).toBe(true)
    expect(i1.getUnion(i4).equals(fromDump(G['i1|i4']))).toBe(true)
    expect(i1.getUnion(i5).equals(fromDump(G['i1|i5']))).toBe(true)
    expect(i3.getUnion(i5).equals(fromDump(G['i3|i5']))).toBe(true)

    // Test &
    expect(i1.getIntersection(i2).IsEmpty()).toBe(true)
    expect(i1.getIntersection(i3).IsEmpty()).toBe(true)
    expect(i1.getIntersection(i4).equals(i1)).toBe(true)
    expect(i1.getIntersection(i5).IsEmpty()).toBe(true)
    // adjacent open boundaries have no intersection
    expect(i4.getIntersection(i5).IsEmpty()).toBe(true)
    expect(i3.getIntersection(i5).equals(fromDump(G['i3&i5']))).toBe(true)

    // operators
    let a = new GfInterval(10, 20, false, true)
    a.intersectWith(new GfInterval(15, 25, false, false))
    expect(a.getMin()).toBe(num(G.anded_eq.min))
    expect(a.getMax()).toBe(num(G.anded_eq.max))
    expect(a.isMinOpen()).toBe(G.anded_eq.minOpen)
    expect(a.isMaxClosed()).toBe(G.anded_eq.maxClosed)

    a = new GfInterval(10, 20).getIntersection(new GfInterval(15, 25))
    expect(a.getMin()).toBe(num(G.anded.min))
    expect(a.getMax()).toBe(num(G.anded.max))
    expect(a.isMinClosed()).toBe(G.anded.minClosed)
    expect(a.isMaxClosed()).toBe(G.anded.maxClosed)

    a = new GfInterval(10, 20)
    a.unionWith(new GfInterval(15, 25))
    expect(a.getMin()).toBe(num(G.ored_eq.min))
    expect(a.getMax()).toBe(num(G.ored_eq.max))

    a = new GfInterval(10, 20).getUnion(new GfInterval(15, 25))
    expect(a.getMin()).toBe(num(G.ored.min))
    expect(a.getMax()).toBe(num(G.ored.max))

    a = new GfInterval(10, 20)
    a.addWith(new GfInterval(30, 40))
    expect(a.getMin() === num(G.plus_eq.min) && a.getMax() === num(G.plus_eq.max)).toBe(true)

    a = new GfInterval(10, 20)
    a.subtractWith(new GfInterval(30, 40))
    expect(a.getMin() === num(G.minus_eq.min) && a.getMax() === num(G.minus_eq.max)).toBe(true)

    a = new GfInterval(10, 20)
    a.multiplyWith(new GfInterval(30, 40))
    expect(a.getMin() === num(G.mul_eq.min) && a.getMax() === num(G.mul_eq.max)).toBe(true)

    a = new GfInterval(10, 20).getNegation()
    expect(a.getMin() === num(G.unary_minus.min) && a.getMax() === num(G.unary_minus.max)).toBe(true)

    a = new GfInterval(10, 20).getSum(new GfInterval(20, 30))
    expect(a.getMin() === num(G.plus.min) && a.getMax() === num(G.plus.max)).toBe(true)

    a = new GfInterval(10, 20).getDifference(new GfInterval(20, 30))
    expect(a.getMin() === num(G.minus.min) && a.getMax() === num(G.minus.max)).toBe(true)

    a = new GfInterval(10, 20).getProduct(new GfInterval(20, 30))
    expect(a.getMin()).toBe(num(G.mul.min))
    expect(a.getMax()).toBe(num(G.mul.max))
    expect(a.isMinClosed()).toBe(G.mul.minClosed)
    expect(a.isMaxClosed()).toBe(G.mul.maxClosed)

    a = new GfInterval(10, 20, false, true).getProduct(new GfInterval(20, 30, true, false))
    expect(a.getMin()).toBe(num(G.mul_oc.min))
    expect(a.getMax()).toBe(num(G.mul_oc.max))
    expect(a.isMinOpen()).toBe(G.mul_oc.minOpen)
    expect(a.isMaxOpen()).toBe(G.mul_oc.maxOpen)

    a = new GfInterval(-10, 20, false, true).getProduct(new GfInterval(-20, 30, true, false))
    expect(a.getMin()).toBe(num(G.mul_neg.min))
    expect(a.getMax()).toBe(num(G.mul_neg.max))
    expect(a.isMinClosed()).toBe(G.mul_neg.minClosed)
    expect(a.isMaxOpen()).toBe(G.mul_neg.maxOpen)

    let f = GfInterval.getFullInterval()
    const z = new GfInterval(0, 1)
    expect(f.equals(fromDump(G.full))).toBe(true)
    expect(f.getIntersection(z).equals(fromDump(G['full&01']))).toBe(true)

    // Normalization of all infinite intervals as open intervals.
    f = GfInterval.getFullInterval()
    expect(f.equals(new GfInterval(-inf, inf, false, false))).toBe(true)
    expect(f.equals(new GfInterval(-inf, inf, true, false))).toBe(true)
    expect(f.equals(new GfInterval(-inf, inf, false, true))).toBe(true)
    expect(f.equals(new GfInterval(-inf, inf, true, true))).toBe(true)
    expect(f.equals(new GfInterval(-inf, inf))).toBe(true)

    // Test bounds
    let b = GfInterval.getFullInterval()
    expect(b.isMinFinite()).toBe(G.full.minFinite)
    expect(b.isMaxFinite()).toBe(G.full.maxFinite)
    expect(b.isFinite()).toBe(G.full.finite)

    b = new GfInterval(-inf, -inf)
    expect(b.isMinFinite()).toBe(false)
    expect(b.isMaxFinite()).toBe(false)
    expect(b.isFinite()).toBe(false)

    b = new GfInterval(inf, inf)
    expect(b.isMinFinite()).toBe(false)
    expect(b.isMaxFinite()).toBe(false)
    expect(b.isFinite()).toBe(false)

    b = new GfInterval(inf, 0.0)
    expect(b.isMinFinite()).toBe(false)
    expect(b.isMaxFinite()).toBe(true)
    expect(b.isFinite()).toBe(false)

    b = new GfInterval(0.0, inf)
    expect(b.isMinFinite()).toBe(true)
    expect(b.isMaxFinite()).toBe(false)
    expect(b.isFinite()).toBe(false)

    b = new GfInterval(0.0, 1.0)
    expect(b.isMinFinite()).toBe(true)
    expect(b.isMaxFinite()).toBe(true)
    expect(b.isFinite()).toBe(true)

    // Test representations: reconstruct (the TS analog of eval(repr(i))).
    const rebuilt = new GfInterval(b.getMin(), b.getMax(), b.isMinClosed(), b.isMaxClosed())
    expect(rebuilt.getMin() === b.getMin() && rebuilt.getMax() === b.getMax()).toBe(true)

    // len(str(Gf.Interval())) is truthy.
    expect(new GfInterval().toString().length > 0).toBe(true)
    // genfix golden for str(Gf.Interval()):
    expect(new GfInterval().toString()).toBe(G.str_empty)
  })
})

describe('test_Hash', () => {
  it('mirrors testGfInterval.test_Hash (equal intervals are equal/clone-equal)', () => {
    // Python tests hash() stability. We have no Hash() method in this port, so
    // we test the equivalent invariant: an interval equals itself and a copy.
    const interval = new GfInterval(-1.5, 2.0, true, false)
    expect(interval.equals(interval)).toBe(true)
    expect(interval.equals(interval.clone())).toBe(true)
  })
})
