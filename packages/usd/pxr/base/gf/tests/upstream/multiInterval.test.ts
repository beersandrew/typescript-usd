// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfMultiInterval.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfMultiInterval.py.
//
// One describe()/it() per logical block of the upstream runTest, every assert
// mirrored. The upstream test asserts equality between MultiIntervals it
// constructs in-test, so most expectations are structural; the values that
// depend on the C++ merge/split algorithm (ArithmeticAdd, Remove edge cases,
// GetComplement, the open/closed merge optimization, the iterator example)
// are captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/multiInterval.json — never hand-derived (AGENTS.md numeric rule).
//
// Mapping of the Python binding onto our TS surface:
//   Gf.MultiInterval()                   -> new GfMultiInterval()
//   Gf.MultiInterval(interval)           -> new GfMultiInterval(interval)
//   Gf.MultiInterval([i0, i1, ...])      -> new GfMultiInterval([...])
//   Gf.MultiInterval(other)              -> new GfMultiInterval(other) / clone()
//   a == b / a != b                      -> a.equals(b) / !a.equals(b)
//   s.Contains(x)                        -> s.Contains(x)
//   s.bounds / s.size                    -> s.GetBounds() / s.GetSize()
//   eval(repr(s)) == s                   -> reconstruct from GetSet(), compare
//                                           (no Python eval; faithful TS equiv)
import { describe, it, expect } from 'vitest'
import { GfInterval } from '../../src/interval.ts'
import { GfMultiInterval } from '../../src/multiInterval.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// The fixture writes non-finite floats as 'inf', '-inf' and 'nan'.
type FixtureNumber = number | 'inf' | '-inf' | 'nan'
const num = (x: FixtureNumber): number =>
  x === 'inf' ? Infinity : x === '-inf' ? -Infinity : x === 'nan' ? NaN : x

interface IntervalDump {
  min: FixtureNumber
  max: FixtureNumber
  minClosed: boolean
  maxClosed: boolean
}
interface MultiDump {
  str: string
  size: number
  bounds: IntervalDump
  intervals: IntervalDump[]
}
interface MultiIntervalFixture {
  arithmeticAdd: MultiDump
  remove_a: MultiDump
  remove_b: MultiDump
  remove_c: MultiDump
  complement_empty: MultiDump
  merge: Record<string, { halfopen_lc: MultiDump; open_open: MultiDump }>
  iter: MultiDump
}

const G = readOracleFixture<MultiIntervalFixture>(
  new URL('./fixtures/multiInterval.json', import.meta.url),
)

const intervalFrom = (d: IntervalDump): GfInterval =>
  new GfInterval(num(d.min), num(d.max), d.minClosed, d.maxClosed)
const multiFrom = (d: MultiDump): GfMultiInterval =>
  new GfMultiInterval(d.intervals.map(intervalFrom))

// --- Upstream utility functions, ported ------------------------------------

function subsets<T>(l: T[]): T[][] {
  const out: T[][] = []
  for (let bits = 0; bits < 2 ** l.length; bits++) {
    const s: T[] = []
    for (let i = 0; i < l.length; i++) {
      if (bits & (2 ** i)) {
        s.push(l[i]!)
      }
    }
    out.push(s)
  }
  return out
}

function permute<T>(l: T[]): T[][] {
  if (l.length <= 1) {
    return [l.slice()]
  }
  const out: T[][] = []
  for (let i = 0; i < l.length; i++) {
    const cur = l[i]!
    const rest = l.slice(0, i).concat(l.slice(i + 1))
    for (const p of permute(rest)) {
      out.push([cur, ...p])
    }
  }
  return out
}

describe('TestGfMultiInterval', () => {
  it('utility functions subsets / permute', () => {
    expect(subsets([1, 2, 3])).toEqual([
      [],
      [1],
      [2],
      [1, 2],
      [3],
      [1, 3],
      [2, 3],
      [1, 2, 3],
    ])
    expect(permute([1, 2, 3])).toEqual([
      [1, 2, 3],
      [1, 3, 2],
      [2, 1, 3],
      [2, 3, 1],
      [3, 1, 2],
      [3, 2, 1],
    ])
  })

  // Shared interval inputs (mirrors the upstream `intervals` list).
  const makeIntervals = (): GfInterval[] => [
    new GfInterval(),
    new GfInterval(-2, -1),
    new GfInterval(1),
    new GfInterval(2, 5),
    new GfInterval(3, 4),
    new GfInterval(5, 7),
    new GfInterval(6, 8),
  ]

  it('empty multi-intervals and equality', () => {
    expect(new GfMultiInterval().equals(new GfMultiInterval())).toBe(true)
    expect(new GfMultiInterval().equals(new GfMultiInterval(new GfInterval()))).toBe(true)
    expect(new GfMultiInterval().equals(new GfMultiInterval(new GfInterval(1)))).toBe(false)
  })

  it('== and != across testSets', () => {
    const testSets = makeIntervals().map((iv) => new GfMultiInterval(iv))
    for (let i = 0; i < testSets.length; i++) {
      for (let j = i; j < testSets.length; j++) {
        expect(testSets[i]!.equals(testSets[j]!)).toBe(i === j)
        expect(!testSets[i]!.equals(testSets[j]!)).toBe(i !== j)
      }
    }
  })

  it('repr round-trip and copy ctor', () => {
    const testSets = makeIntervals().map((iv) => new GfMultiInterval(iv))
    for (const s of testSets) {
      // eval(repr(s)) == s : reconstruct from the interval set, compare.
      const reconstructed = new GfMultiInterval(s.getSet())
      expect(reconstructed.equals(s)).toBe(true)
      // Gf.MultiInterval(s) == s : copy ctor.
      expect(new GfMultiInterval(s).equals(s)).toBe(true)
    }
  })

  it('Add()ing intervals in any order yields same result', () => {
    const intervals = makeIntervals()
    let expected: GfMultiInterval | null = null
    for (const p of permute(intervals)) {
      const x = new GfMultiInterval()
      for (const i of p) {
        x.add(i)
      }
      if (expected === null) {
        expected = x
      } else {
        expect(expected.equals(x)).toBe(true)
      }
    }
  })

  it('Add() builds the full power-set of half-open intervals', () => {
    const uniqueSets = new Set<string>()
    const num = 7
    const range = Array.from({ length: num }, (_, i) => i)
    for (const s of subsets(range)) {
      for (const p of permute(s)) {
        const x = new GfMultiInterval()
        for (const i of p) {
          x.add(new GfInterval(i, i + 1.0, true, false))
        }
        // Verify membership.
        for (let i = 0; i < num; i++) {
          if (p.includes(i)) {
            expect(x.contains(i + 0.5)).toBe(true)
          } else {
            expect(x.contains(i + 0.5)).toBe(false)
          }
        }
        uniqueSets.add(x.key())
      }
    }
    // We expect 2**num unique sets (power-set of range(num)).
    expect(uniqueSets.size).toBe(2 ** num)
  })

  it('Remove() removes the right half-open intervals', () => {
    const num = 7
    const range = Array.from({ length: num }, (_, i) => i)
    for (const s of subsets(range)) {
      for (const p of permute(s)) {
        const x = new GfMultiInterval(new GfInterval(0, num))
        for (const i of p) {
          x.remove(new GfInterval(i, i + 1.0))
        }
        for (let i = 0; i < num; i++) {
          if (p.includes(i)) {
            expect(x.contains(i + 0.5)).toBe(false)
          } else {
            expect(x.contains(i + 0.5)).toBe(true)
          }
        }
      }
    }
  })

  it('Add merge optimization for open/closed boundaries', () => {
    const num = 5
    for (let r = 0; r < num; r++) {
      // Testing only on at least two intervals.
      const s = r + 2
      const range = Array.from({ length: s }, (_, i) => i)
      for (const p of permute(range)) {
        // [i, i+1) -> one merged interval [0, s).
        let x = new GfMultiInterval()
        for (const i of p) {
          x.add(new GfInterval(i, i + 1.0, true, false))
        }
        const golden = G.merge[String(s)]!
        expect(x.getBounds().equals(intervalFrom(golden.halfopen_lc.bounds))).toBe(true)
        expect(x.contains(new GfInterval(0, s, true, false))).toBe(true)
        expect(x.contains(new GfInterval(0, s, true, true))).toBe(false)
        expect(x.getSize()).toBe(golden.halfopen_lc.size)

        // (i, i+1] -> one merged interval (0, s].
        x = new GfMultiInterval()
        for (const i of p) {
          x.add(new GfInterval(i, i + 1.0, false, true))
        }
        expect(x.getBounds().equals(new GfInterval(0, s, false, true))).toBe(true)
        expect(x.contains(new GfInterval(0, s, false, true))).toBe(true)
        expect(x.contains(new GfInterval(0, s, true, true))).toBe(false)
        expect(x.getSize()).toBe(1)

        // [i, i+1] -> one merged interval [0, s].
        x = new GfMultiInterval()
        for (const i of p) {
          x.add(new GfInterval(i, i + 1.0, true, true))
        }
        expect(x.getBounds().equals(new GfInterval(0, s, true, true))).toBe(true)
        expect(x.contains(new GfInterval(0, s, true, true))).toBe(true)
        expect(x.getSize()).toBe(1)

        // (i, i+1) -> s disjoint open intervals.
        x = new GfMultiInterval()
        for (const i of p) {
          x.add(new GfInterval(i, i + 1.0, false, false))
        }
        expect(x.getBounds().equals(intervalFrom(golden.open_open.bounds))).toBe(true)
        expect(x.contains(new GfInterval(0, s, false, false))).toBe(false)
        expect(x.getSize()).toBe(golden.open_open.size)
      }
    }
  })

  it('Remove() edge cases (golden from Pixar build)', () => {
    // [0,1) minus (0,1) -> [0,0]
    let s = new GfMultiInterval(new GfInterval(0, 1, true, false))
    s.remove(new GfInterval(0, 1, false, false))
    expect(s.equals(multiFrom(G.remove_a))).toBe(true)

    // [0,1] minus (0,1) -> {[0,0], [1,1]}
    s = new GfMultiInterval(new GfInterval(0, 1, true, true))
    s.remove(new GfInterval(0, 1, false, false))
    expect(s.equals(multiFrom(G.remove_b))).toBe(true)

    // {[0,1],[3,4]} minus (0,4) -> {[0,0], [4,4]}
    s = new GfMultiInterval([new GfInterval(0, 1), new GfInterval(3, 4)])
    s.remove(new GfInterval(0, 4, false, false))
    expect(s.equals(multiFrom(G.remove_c))).toBe(true)
  })

  it('GetComplement()', () => {
    const testSets = makeIntervals().map((iv) => new GfMultiInterval(iv))
    for (const s of testSets) {
      expect(s.GetComplement().equals(s)).toBe(false)
      expect(s.GetComplement().GetComplement().equals(s)).toBe(true)
    }

    // Complement of empty is the multi-interval containing the full interval.
    const empty = new GfMultiInterval()
    expect(empty.GetComplement().equals(multiFrom(G.complement_empty))).toBe(true)
    expect(empty.GetComplement().GetComplement().equals(empty)).toBe(true)
  })

  it('Contains() with double values', () => {
    const s = new GfMultiInterval([new GfInterval(1, 2), new GfInterval(3, 4)])
    expect(s.contains(0.99)).toBe(false)
    expect(s.contains(1.0)).toBe(true)
    expect(s.contains(1.01)).toBe(true)
    expect(s.contains(1.99)).toBe(true)
    expect(s.contains(2.0)).toBe(true)
    expect(s.contains(2.01)).toBe(false)
    expect(s.contains(2.99)).toBe(false)
    expect(s.contains(3.0)).toBe(true)
    expect(s.contains(3.01)).toBe(true)
    expect(s.contains(3.99)).toBe(true)
    expect(s.contains(4.0)).toBe(true)
    expect(s.contains(4.01)).toBe(false)
  })

  it('Contains() with intervals', () => {
    const s = new GfMultiInterval([new GfInterval(1, 2), new GfInterval(3, 4)])
    expect(s.contains(new GfInterval())).toBe(false)
    expect(s.contains(new GfInterval(0.99, 2))).toBe(false) // closed but larger
    expect(s.contains(new GfInterval(1, 2, false, true))).toBe(true) // half-open
    expect(s.contains(new GfInterval(1, 2, true, false))).toBe(true) // half-open
    expect(s.contains(new GfInterval(1, 2, true, true))).toBe(true) // totally contained
  })

  it('Contains() with multi-intervals', () => {
    const s = new GfMultiInterval([new GfInterval(1, 2), new GfInterval(3, 4)])
    expect(s.contains(new GfMultiInterval())).toBe(false)
    expect(s.contains(s)).toBe(true)
    expect(s.contains(new GfMultiInterval([new GfInterval(1, 2)]))).toBe(true)
    expect(s.contains(new GfMultiInterval([new GfInterval(3, 4)]))).toBe(true)
    expect(
      s.contains(new GfMultiInterval([new GfInterval(1, 1.3), new GfInterval(1.6, 2)])),
    ).toBe(true)
    expect(s.contains(new GfMultiInterval([new GfInterval(1, 4)]))).toBe(false)
    expect(
      s.contains(new GfMultiInterval([new GfInterval(1, 2), new GfInterval(3, 5)])),
    ).toBe(false)
    expect(
      s.contains(
        new GfMultiInterval([
          new GfInterval(1, 2),
          new GfInterval(3, 4),
          new GfInterval(5, 6),
        ]),
      ),
    ).toBe(false)
  })

  it('iterator', () => {
    const multiInterval = new GfMultiInterval([
      new GfInterval(2, 4),
      new GfInterval(-1, 3),
      new GfInterval(6, 7),
    ])
    // [2,4] and [-1,3] merge to [-1,4]; [6,7] stays separate.
    const intervals = G.iter.intervals.map(intervalFrom)

    let number = 0
    const it = multiInterval[Symbol.iterator]()
    for (const i of intervals) {
      const r = it.next()
      expect(r.done).toBe(false)
      expect(r.value.equals(i)).toBe(true)
      number += 1
    }
    expect(number).toBe(intervals.length)
  })

  it('ArithmeticAdd', () => {
    const a = new GfMultiInterval([
      new GfInterval(-10, 1, true, false),
      new GfInterval(3, 4, false, true),
      new GfInterval(100, 200, false, true),
      new GfInterval(201, 300, false, true),
    ])

    a.arithmeticAdd(new GfInterval(-3, -1, false, true))

    // Golden from the native build: [(-13, 0), (0, 3], (97, 299]]
    const result = multiFrom(G.arithmeticAdd)

    expect(a.equals(result)).toBe(true)
  })
})
