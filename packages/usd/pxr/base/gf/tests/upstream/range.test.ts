// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfRange.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfRange.py.
//
// Covers GfRange{1,2,3}{d,f}. Upstream's suite has two test methods: a single
// big `runTest()` that loops over all six range types (then specialised
// GetCorner/GetQuadrant/GetOctant and cross-precision blocks) and `test_Hash`.
// Here the per-type loop body is factored into `runRangeTests(spec)` (called
// once per type) so the assertions stay typed; the specialised blocks follow.
//
// The goldens are captured from the OpenUSD 26.11.1 build (FIXTURES.md)
// into fixtures/range.json; the remaining expectations are upstream's own
// asserts — never hand-derived (AGENTS.md numeric-fixture rule). The
// integer-valued expectations are exact; the division goldens are compared with
// Gf.IsClose tol 0.00001, matching upstream.
//
// Python `eval(repr(r)) == r` and `len(str(...))` are adapted faithfully:
// repr() must round-trip through GetMin()/GetMax() back to an equal range, and
// toString() must be non-empty (TS has no Python eval()).
import { describe, it, expect } from 'vitest'
import {
  GfRange1d,
  GfRange1f,
  GfRange2d,
  GfRange2f,
  GfRange3d,
  GfRange3f,
} from '../../src/range.ts'
import { GfVec2d, GfVec2f, GfVec3d, GfVec3f, GfIsClose } from '../../src/vec.ts'
import type { GfVec } from '../../src/vec.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// ---- goldens captured from the OpenUSD 26.11.1 build ----
// A scalar for Range1{d,f}, a component list otherwise.
type Value = number | number[]
interface RangeGolden {
  size: Value
  midpoint: Value
  midpoint_empty: Value
  dsqr_pos: number
  dsqr_neg: number
  div_min: Value
  div_max: Value
}
type Box = [number[], number[]]
type RangeFixture = Record<
  'Range1d' | 'Range2d' | 'Range3d' | 'Range1f' | 'Range2f' | 'Range3f',
  RangeGolden
> &
  Record<'Range2f_corners' | 'Range2d_corners' | 'Range3f_corners' | 'Range3d_corners', number[][]> &
  Record<'Range2f_quadrants' | 'Range2d_quadrants' | 'Range3f_octants' | 'Range3d_octants', Box[]>

const G = readOracleFixture<RangeFixture>(new URL('./fixtures/range.json', import.meta.url))

// ---- the structural surface the generic test body needs ----
interface IRange<V, Self> {
  getMin(): V
  getMax(): V
  setMin(v: V): void
  setMax(v: V): void
  setEmpty(): void
  IsEmpty(): boolean
  getSize(): V
  getMidpoint(): V
  contains(arg: V | Self): boolean
  unionWith(arg: V | Self): Self
  intersectWith(b: Self): Self
  getDistanceSquared(p: V): number
  getSum(b: Self): Self
  getDifference(b: Self): Self
  getMultiplied(m: number): Self
  getDivided(m: number): Self
  addInPlace(b: Self): Self
  subtractInPlace(b: Self): Self
  multiplyInPlace(m: number): Self
  divideInPlace(m: number): Self
  extendBy(arg: V | Self): Self
  equals(b: Self): boolean
  toString(): string
  repr(): string
}

interface Spec<V, R extends IRange<V, R>> {
  name: string
  dim: number
  Range: { new (min: V, max: V): R; new (): R }
  getUnion(a: R, b: R): R
  getIntersection(a: R, b: R): R
  makeValue(vals: number[]): V
  valueEquals(a: V, b: V): boolean
  valueSub(a: V, b: V): V
  valueIsClose(a: V, b: V, tol: number): boolean
  // captured from the OpenUSD 26.11.1 build
  golden: RangeGolden
}

function runRangeTests<V, R extends IRange<V, R>>(spec: Spec<V, R>): void {
  const { name, Range, makeValue, valueEquals, getUnion: GetUnion, getIntersection: GetIntersection } = spec
  const eqV = (a: V, b: V): void => expect(valueEquals(a, b)).toBe(true)
  const eqR = (a: R, b: R): void => expect(a.equals(b)).toBe(true)
  const golden = (x: Value): V => makeValue(Array.isArray(x) ? x : [x])

  describe(`${name}`, () => {
    it('constructors and min/max accessors', () => {
      expect(new Range()).toBeInstanceOf(Range)
      expect(new Range(makeValue([0, 0, 0, 0]), makeValue([0, 0, 0, 0]))).toBeInstanceOf(Range)

      const v = makeValue([1, 2, 3, 4])
      const r = new Range()
      r.setMin(v)
      eqV(r.getMin(), v)
      r.setMax(v)
      eqV(r.getMax(), v)
    })

    it('IsEmpty / SetEmpty', () => {
      expect(new Range().IsEmpty()).toBe(true)

      const v1 = makeValue([-1, -2, -3, -4])
      const v2 = makeValue([1, 2, 3, 4])
      expect(new Range(v2, v1).IsEmpty()).toBe(true)
      const r = new Range(v1, v2)
      expect(r.IsEmpty()).toBe(false)
      r.setEmpty()
      expect(r.IsEmpty()).toBe(true)
    })

    it('GetSize', () => {
      const v1 = makeValue([-1, -2, -3, -4])
      const v2 = makeValue([1, 2, 3, 4])
      const r = new Range(v1, v2)
      eqV(r.getSize(), golden(spec.golden.size))
    })

    it('GetMidpoint', () => {
      const v1 = makeValue([-1, 1, -11, 2])
      const v2 = makeValue([1, 3, -10, 2])
      const v3 = golden(spec.golden.midpoint)
      const v4 = golden(spec.golden.midpoint_empty)
      const r1 = new Range(v1, v2)
      eqV(r1.getMidpoint(), v3)
      r1.setEmpty()
      const r2 = new Range()
      eqV(r1.getMidpoint(), v4)
      eqV(r2.getMidpoint(), v4)
    })

    it('Contains(point)', () => {
      const r = new Range(makeValue([-1, -2, -3, -4]), makeValue([1, 2, 3, 4]))
      expect(r.contains(makeValue([0, 0, 0, 0]))).toBe(true)
      expect(r.contains(makeValue([2, 3, 4, 5]))).toBe(false)
    })

    it('Contains(range)', () => {
      const r1 = new Range(makeValue([-2, -4, -6, -8]), makeValue([2, 4, 6, 8]))
      const r2 = new Range(makeValue([-1, -2, -3, -4]), makeValue([1, 2, 3, 4]))
      expect(r1.contains(r2)).toBe(true)
      expect(r2.contains(r1)).toBe(false)
    })

    it('GetUnion / GetIntersection (static)', () => {
      const v1 = makeValue([-1, -2, -3, -4])
      const v2 = makeValue([2, 4, 6, 8])
      const v3 = makeValue([-2, -4, -6, -8])
      const v4 = makeValue([1, 2, 3, 4])
      const r1 = new Range(v1, v2)
      const r2 = new Range(v3, v4)
      eqR(GetUnion(r1, r2), new Range(v3, v2))
      eqR(GetIntersection(r1, r2), new Range(v1, v4))
    })

    it('UnionWith / IntersectWith', () => {
      const v1 = makeValue([-1, -2, -3, -4])
      const v2 = makeValue([2, 4, 6, 8])
      const v3 = makeValue([-2, -4, -6, -8])
      const v4 = makeValue([1, 2, 3, 4])
      const r2 = new Range(v3, v4)

      let r1 = new Range(v1, v2)
      eqR(r1.unionWith(r2), new Range(v3, v2))
      r1 = new Range(v1, v2)
      eqR(r1.unionWith(v3), new Range(v3, v2))
      r1 = new Range(v1, v2)
      eqR(r1.intersectWith(r2), new Range(v1, v4))
    })

    it('GetDistanceSquared', () => {
      const v1 = makeValue([-1, -2, -3, -4])
      const v2 = makeValue([2, 4, 6, 8])
      const r1 = new Range(v1, v2)
      expect(r1.getDistanceSquared(makeValue([100, 100, 100, 100]))).toBe(spec.golden.dsqr_pos)
      expect(r1.getDistanceSquared(makeValue([-100, -100, -100, -100]))).toBe(spec.golden.dsqr_neg)
    })

    it('binary arithmetic (+, -, * scalar, / scalar) and equality', () => {
      const v1 = makeValue([1, 2, 3, 4])
      const v2 = makeValue([2, 3, 4, 5])
      const v3 = makeValue([3, 4, 5, 6])
      const r1 = new Range(v1, v2)
      const r2 = new Range(v2, v3)

      // r1 + r2
      eqR(r1.getSum(r2), new Range(makeValue([3, 5, 7, 9]), makeValue([5, 7, 9, 11])))
      // r1 - r2
      eqR(
        r1.getDifference(r2),
        new Range(makeValue([-2, -2, -2, -2]), makeValue([0, 0, 0, 0])),
      )
      // r1 * 10 and 10 * r1 (operator* is symmetric)
      const scaled = new Range(makeValue([10, 20, 30, 40]), makeValue([20, 30, 40, 50]))
      eqR(r1.getMultiplied(10), scaled)
      eqR(r1.getMultiplied(10), scaled) // mirrors "10 * r1"
      // r1 / 10
      const tmp = r1.getDivided(10)
      expect(spec.valueIsClose(tmp.getMin(), golden(spec.golden.div_min), 0.00001)).toBe(true)
      expect(spec.valueIsClose(tmp.getMax(), golden(spec.golden.div_max), 0.00001)).toBe(true)

      // equality / inequality
      eqR(r1, new Range(makeValue([1, 2, 3, 4]), makeValue([2, 3, 4, 5])))
      expect(r1.equals(new Range(makeValue([1, 2, 3, 4]), makeValue([2, 3, 4, 5])))).toBe(true)
    })

    it('in-place arithmetic (+=, -=, *=, /=) returns the same object', () => {
      const v1 = makeValue([1, 2, 3, 4])
      const v2 = makeValue([2, 3, 4, 5])
      const v3 = makeValue([3, 4, 5, 6])
      const r2 = new Range(v2, v3)

      let r1 = new Range(v1, v2)
      let r1Original = r1
      expect(r1.addInPlace(r2)).toBe(r1Original)
      eqR(r1, new Range(makeValue([3, 5, 7, 9]), makeValue([5, 7, 9, 11])))

      r1 = new Range(v1, v2)
      r1Original = r1
      expect(r1.subtractInPlace(r2)).toBe(r1Original)
      eqR(r1, new Range(makeValue([-2, -2, -2, -2]), makeValue([0, 0, 0, 0])))

      r1 = new Range(v1, v2)
      r1Original = r1
      expect(r1.multiplyInPlace(10)).toBe(r1Original)
      eqR(r1, new Range(makeValue([10, 20, 30, 40]), makeValue([20, 30, 40, 50])))

      r1 = new Range(v1, v2)
      r1Original = r1
      expect(r1.multiplyInPlace(-10)).toBe(r1Original)
      eqR(r1, new Range(makeValue([-20, -30, -40, -50]), makeValue([-10, -20, -30, -40])))

      r1 = new Range(v1, v2)
      r1Original = r1
      expect(r1.divideInPlace(10)).toBe(r1Original)
      expect(spec.valueIsClose(r1.getMin(), makeValue([0.1, 0.2, 0.3, 0.4]), 0.00001)).toBe(true)
      expect(spec.valueIsClose(r1.getMax(), makeValue([0.2, 0.3, 0.4, 0.5]), 0.00001)).toBe(true)
    })

    it('repr round-trips and str is non-empty (adapted from eval(repr)/str)', () => {
      const r1 = new Range(makeValue([1, 2, 3, 4]), makeValue([2, 3, 4, 5]))
      // eval(repr(r1)) == r1 -> reconstruct from min/max yields an equal range.
      eqR(new Range(r1.getMin(), r1.getMax()), r1)
      expect(r1.repr().length).toBeGreaterThan(0)
      expect(new Range().toString().length).toBeGreaterThan(0)
    })
  })
}

// ---- value helpers ----
const scalarD = {
  makeValue: (vals: number[]): number => vals[0]!,
  valueEquals: (a: number, b: number): boolean => a === b,
  valueSub: (a: number, b: number): number => a - b,
  valueIsClose: (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol,
}
const scalarF = {
  makeValue: (vals: number[]): number => Math.fround(vals[0]!),
  valueEquals: (a: number, b: number): boolean => a === b,
  valueSub: (a: number, b: number): number => a - b,
  valueIsClose: (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol,
}
const vecEquals = (a: GfVec, b: GfVec): boolean => a.equals(b)
const vecSub = <V extends GfVec>(a: V, b: V): V => a.subtract(b) as V
const vecIsClose = (a: GfVec, b: GfVec, tol: number): boolean => GfIsClose(a, b, tol)

// ---- run the shared body for all six range types ----
runRangeTests<number, GfRange1d>({
  name: 'GfRange1d',
  dim: 1,
  Range: GfRange1d,
  getUnion: (a, b) => GfRange1d.getUnion(a, b),
  getIntersection: (a, b) => GfRange1d.getIntersection(a, b),
  ...scalarD,
  golden: G.Range1d,
})
runRangeTests<number, GfRange1f>({
  name: 'GfRange1f',
  dim: 1,
  Range: GfRange1f,
  getUnion: (a, b) => GfRange1f.getUnion(a, b),
  getIntersection: (a, b) => GfRange1f.getIntersection(a, b),
  ...scalarF,
  golden: G.Range1f,
})
runRangeTests<GfVec2d, GfRange2d>({
  name: 'GfRange2d',
  dim: 2,
  Range: GfRange2d,
  getUnion: (a, b) => GfRange2d.getUnion<GfVec2d, GfRange2d>(a, b),
  getIntersection: (a, b) => GfRange2d.getIntersection<GfVec2d, GfRange2d>(a, b),
  makeValue: (vals) => new GfVec2d(vals[0]!, vals[1]!),
  valueEquals: vecEquals,
  valueSub: vecSub,
  valueIsClose: vecIsClose,
  golden: G.Range2d,
})
runRangeTests<GfVec2f, GfRange2f>({
  name: 'GfRange2f',
  dim: 2,
  Range: GfRange2f,
  getUnion: (a, b) => GfRange2f.getUnion<GfVec2f, GfRange2f>(a, b),
  getIntersection: (a, b) => GfRange2f.getIntersection<GfVec2f, GfRange2f>(a, b),
  makeValue: (vals) => new GfVec2f(vals[0]!, vals[1]!),
  valueEquals: vecEquals,
  valueSub: vecSub,
  valueIsClose: vecIsClose,
  golden: G.Range2f,
})
runRangeTests<GfVec3d, GfRange3d>({
  name: 'GfRange3d',
  dim: 3,
  Range: GfRange3d,
  getUnion: (a, b) => GfRange3d.getUnion<GfVec3d, GfRange3d>(a, b),
  getIntersection: (a, b) => GfRange3d.getIntersection<GfVec3d, GfRange3d>(a, b),
  makeValue: (vals) => new GfVec3d(vals[0]!, vals[1]!, vals[2]!),
  valueEquals: vecEquals,
  valueSub: vecSub,
  valueIsClose: vecIsClose,
  golden: G.Range3d,
})
runRangeTests<GfVec3f, GfRange3f>({
  name: 'GfRange3f',
  dim: 3,
  Range: GfRange3f,
  getUnion: (a, b) => GfRange3f.getUnion<GfVec3f, GfRange3f>(a, b),
  getIntersection: (a, b) => GfRange3f.getIntersection<GfVec3f, GfRange3f>(a, b),
  makeValue: (vals) => new GfVec3f(vals[0]!, vals[1]!, vals[2]!),
  valueEquals: vecEquals,
  valueSub: vecSub,
  valueIsClose: vecIsClose,
  golden: G.Range3f,
})

// ---- GetCorner / GetQuadrant for Range2{f,d} ----
describe('GfRange2 GetCorner / GetQuadrant', () => {
  for (const [name, Range, V] of [
    ['GfRange2f', GfRange2f, GfVec2f],
    ['GfRange2d', GfRange2d, GfVec2d],
  ] as const) {
    it(`${name} corners (SW, SE, NW, NE) of the unit square`, () => {
      const rf = (Range as typeof GfRange2f).unitSquare
      const corners = G[`${name.slice(2) as 'Range2f' | 'Range2d'}_corners`]
      for (let i = 0; i < 4; i++) {
        expect(rf.getCorner(i).equals(new V(corners[i]![0]!, corners[i]![1]!))).toBe(true)
      }
      // bogus corner raises (upstream: Tf.ErrorException)
      expect(() => rf.getCorner(4)).toThrow()
    })

    it(`${name} quadrants of the unit square`, () => {
      const rf = (Range as typeof GfRange2f).unitSquare
      const quadrants = G[`${name.slice(2) as 'Range2f' | 'Range2d'}_quadrants`]
      for (let i = 0; i < 4; i++) {
        const [mn, mx] = quadrants[i]!
        expect(
          rf.getQuadrant(i).equals(new Range(new V(mn[0]!, mn[1]!), new V(mx[0]!, mx[1]!))),
        ).toBe(true)
      }
      expect(() => rf.getQuadrant(4)).toThrow()
    })
  }
})

// ---- GetCorner / GetOctant for Range3{f,d} ----
describe('GfRange3 GetCorner / GetOctant', () => {
  for (const [name, Range, V] of [
    ['GfRange3f', GfRange3f, GfVec3f],
    ['GfRange3d', GfRange3d, GfVec3d],
  ] as const) {
    it(`${name} corners (LDB..RUF) of the unit cube`, () => {
      const rf = (Range as typeof GfRange3f).unitCube
      const corners = G[`${name.slice(2) as 'Range3f' | 'Range3d'}_corners`]
      for (let i = 0; i < 8; i++) {
        const [x, y, z] = corners[i]!
        expect(rf.getCorner(i).equals(new V(x!, y!, z!))).toBe(true)
      }
      expect(() => rf.getCorner(8)).toThrow()
    })

    it(`${name} octants of the unit cube`, () => {
      const rf = (Range as typeof GfRange3f).unitCube
      const vals = G[`${name.slice(2) as 'Range3f' | 'Range3d'}_octants`]
      for (let i = 0; i < 8; i++) {
        const [mn, mx] = vals[i]!
        expect(
          rf.getOctant(i).equals(
            new Range(new V(mn[0]!, mn[1]!, mn[2]!), new V(mx[0]!, mx[1]!, mx[2]!)),
          ),
        ).toBe(true)
      }
      // upstream: OverflowError for -1, Tf.ErrorException for 8
      expect(() => rf.getOctant(-1)).toThrow()
      expect(() => rf.getOctant(8)).toThrow()
    })
  }
})

// ---- cross-precision comparisons and converting constructors ----
describe('cross-precision comparisons and converting constructors', () => {
  it('GfRange1f <-> GfRange1d', () => {
    const r1f = new GfRange1f(-1, 2)
    const r2f = new GfRange1f(-2, 1)
    const r1d = new GfRange1d(-1, 2)
    const r2d = new GfRange1d(-2, 1)
    // GetUnion(r1,(v1,v2),(v3,v4)) where v1=-1,v2=2,v3=-2,v4=1 -> (-2, 2)
    expect(GfRange1f.getUnion(r1f, r2f).equals(new GfRange1d(-2, 2))).toBe(true)
    expect(GfRange1d.getUnion(r1d, r2d).equals(new GfRange1f(-2, 2))).toBe(true)
    expect(GfRange1f.getIntersection(r1f, r2f).equals(new GfRange1d(-1, 1))).toBe(true)
    expect(GfRange1d.getIntersection(r1d, r2d).equals(new GfRange1f(-1, 1))).toBe(true)
    // converting constructors
    expect(new GfRange1d(r1f).equals(r1d)).toBe(true)
    expect(new GfRange1f(r1d).equals(r1f)).toBe(true)
  })

  for (const [Rf, Vf, Rd, Vd] of [
    [GfRange2f, GfVec2f, GfRange2d, GfVec2d],
    [GfRange3f, GfVec3f, GfRange3d, GfVec3d],
  ] as const) {
    it(`${Rf.name} <-> ${Rd.name}`, () => {
      const v = (Vc: typeof GfVec2f | typeof GfVec3f, n: number[]): GfVec =>
        Vc === GfVec2f || Vc === GfVec2d
          ? new (Vc as typeof GfVec2f)(n[0]!, n[1]!)
          : new (Vc as unknown as typeof GfVec3f)(n[0]!, n[1]!, n[2]!)
      // values: v1=[-1,-2,-3], v2=[2,4,6], v3=[-2,-4,-6], v4=[1,2,3]
      const v1f = v(Vf, [-1, -2, -3])
      const v2f = v(Vf, [2, 4, 6])
      const v3f = v(Vf, [-2, -4, -6])
      const v4f = v(Vf, [1, 2, 3])
      const v1d = v(Vd, [-1, -2, -3])
      const v2d = v(Vd, [2, 4, 6])
      const v3d = v(Vd, [-2, -4, -6])
      const v4d = v(Vd, [1, 2, 3])

      // Build via `unknown` casts: each concrete ctor matches its own vec type.
      const mk = <R>(R: new (a: GfVec, b: GfVec) => R, a: GfVec, b: GfVec): R => new R(a, b)
      const r1f = mk(Rf as unknown as new (a: GfVec, b: GfVec) => GfRange2f, v1f, v2f)
      const r2f = mk(Rf as unknown as new (a: GfVec, b: GfVec) => GfRange2f, v3f, v4f)
      const r1d = mk(Rd as unknown as new (a: GfVec, b: GfVec) => GfRange2d, v1d, v2d)
      const r2d = mk(Rd as unknown as new (a: GfVec, b: GfVec) => GfRange2d, v3d, v4d)

      expect(
        (Rf as typeof GfRange2f).getUnion(r1f as GfRange2f, r2f as GfRange2f).equals(
          mk(Rd as unknown as new (a: GfVec, b: GfVec) => GfRange2d, v3d, v2d) as GfRange2d,
        ),
      ).toBe(true)
      expect(
        (Rd as typeof GfRange2d).getUnion(r1d as GfRange2d, r2d as GfRange2d).equals(
          mk(Rf as unknown as new (a: GfVec, b: GfVec) => GfRange2f, v3f, v2f) as GfRange2f,
        ),
      ).toBe(true)
      expect(
        (Rf as typeof GfRange2f).getIntersection(r1f as GfRange2f, r2f as GfRange2f).equals(
          mk(Rd as unknown as new (a: GfVec, b: GfVec) => GfRange2d, v1d, v4d) as GfRange2d,
        ),
      ).toBe(true)
      expect(
        (Rd as typeof GfRange2d).getIntersection(r1d as GfRange2d, r2d as GfRange2d).equals(
          mk(Rf as unknown as new (a: GfVec, b: GfVec) => GfRange2f, v1f, v4f) as GfRange2f,
        ),
      ).toBe(true)

      // converting constructors: Ranged(rf) == rd ; Rangef(rd) == rf
      const Rd2 = Rd as unknown as new (other: GfRange2f) => GfRange2d
      const Rf2 = Rf as unknown as new (other: GfRange2d) => GfRange2f
      expect(new Rd2(r1f as GfRange2f).equals(r1d as GfRange2d)).toBe(true)
      expect(new Rf2(r1d as GfRange2d).equals(r1f as GfRange2f)).toBe(true)
    })
  }
})

// ---- test_Hash ----
describe('test_Hash', () => {
  it('GfRange1d', () => {
    const r = new GfRange1d(-1, 4)
    expect(r.hash()).toBe(r.hash())
    expect(r.hash()).toBe(new GfRange1d(r).hash())
  })
  it('GfRange1f', () => {
    const r = new GfRange1f(-1, 4)
    expect(r.hash()).toBe(new GfRange1f(r).hash())
  })
  for (const [name, Range, V] of [
    ['GfRange2d', GfRange2d, GfVec2d],
    ['GfRange3d', GfRange3d, GfVec3d],
    ['GfRange2f', GfRange2f, GfVec2f],
    ['GfRange3f', GfRange3f, GfVec3f],
  ] as const) {
    it(name, () => {
      const dim = new V(0).dimension
      const lo = dim === 2 ? new V(-1, -2) : new V(-1, -2, -3)
      const hi = dim === 2 ? new V(4, 3) : new V(4, 3, 2)
      const r = new (Range as unknown as new (a: GfVec, b: GfVec) => { hash(): string })(lo, hi)
      const copy = new (Range as unknown as new (o: typeof r) => { hash(): string })(r)
      expect(r.hash()).toBe(copy.hash())
    })
  }
})
