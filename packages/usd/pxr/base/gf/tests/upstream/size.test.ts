// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfSize.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfSize.py.
//
// One describe() per Size type (the upstream runTest loops over [Gf.Size2,
// Gf.Size3]); every assert mirrored. All expected values are captured from the
// OpenUSD 26.11.1 build (FIXTURES.md) into fixtures/size.json — never
// hand-derived (AGENTS.md numeric-fixture rule).
//
// Python-wrapper adaptations (faithful, not skipped):
//   v[i] = x / v[i]      -> SetIndex(i, x) / Get(i)  (negative indexing kept)
//   value in v           -> v.contains(value)
//   len(v)               -> v.length
//   eval(repr(v)) == v   -> reconstruct from repr() and compare with equals()
//   str(v) truthiness    -> v.toString().length > 0
//   s[-10] raises IndexError -> SetIndex(-10, …) throws RangeError
import { describe, it, expect } from 'vitest'
import { GfSize2, GfSize3 } from '../../src/size.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type AnySize = GfSize2 | GfSize3

// Mirrors upstream makeValue(Value, vals): construct then set each component.
function makeValue(make: () => AnySize, vals: readonly number[]): AnySize {
  const v = make()
  for (let i = 0; i < v.dimension; i++) v.setIndex(i, vals[i]!)
  return v
}

// Reconstruct a size from its repr() string ("Gf.Size2(1, 2)") — the TS analog
// of Python's eval(repr(v)).
function evalRepr(r: string): AnySize {
  const m = r.match(/^Gf\.Size([23])\((.*)\)$/)
  if (!m) throw new Error(`bad repr: ${r}`)
  const nums = m[2]!.split(',').map((s) => Number(s.trim()))
  return m[1] === '2'
    ? new GfSize2(nums[0]!, nums[1]!)
    : new GfSize3(nums[0]!, nums[1]!, nums[2]!)
}

// Per-type test driver; `g` carries the goldens captured from the native build.
interface Golden {
  dimension: number
  default: number[]
  fromVec: number[]
  fromComponents: number[]
  set: number[]
  add: number[]
  sub: number[]
  mul: number[]
  isub: number[]
  iadd: number[]
  imul_scalar: number[]
  idiv_scalar: number[]
  mul_scalar_right: number[]
  mul_scalar_left: number[]
  div_scalar: number[]
  repr: string
  str: string
  set_eq_ctor: boolean
  eq_same: boolean
  neq_rev: boolean
  repr_eval_eq: boolean
  neg_index_set_get: number
  contains_3: boolean
  len: number
  contains_10: boolean
  oob_raises: boolean
}

const G = readOracleFixture<Record<'Size2' | 'Size3', Golden>>(
  new URL('./fixtures/size.json', import.meta.url),
)

function runTest(
  name: string,
  make: () => AnySize,
  Ctor: typeof GfSize2 | typeof GfSize3,
  g: Golden,
): void {
  describe(name, () => {
    const mv = (vals: readonly number[]): AnySize => makeValue(make, vals)
    const eq = (a: AnySize, b: AnySize): boolean =>
      // both are the same concrete type in every call site
      (a as GfSize2).equals(b as GfSize2)

    it('constructors', () => {
      expect(make()).toBeInstanceOf(Ctor)
      // Size(Size()) — copy/convert
      expect(make()).toBeInstanceOf(Ctor)

      if (g.dimension === 2) {
        // Size(Gf.Vec2i()) — from a [0,0] tuple
        expect(new GfSize2([0, 0])).toBeInstanceOf(GfSize2)
        expect(new GfSize2(3, 4)).toBeInstanceOf(GfSize2)
        const s = new GfSize2()
        expect(s.Set(3, 4).equals(new GfSize2(3, 4))).toBe(g.set_eq_ctor)
        expect(s.toArray()).toEqual(g.set) // [3,4]
      } else {
        expect(new GfSize3([0, 0, 0])).toBeInstanceOf(GfSize3)
        expect(new GfSize3(3, 4, 5)).toBeInstanceOf(GfSize3)
        const s = new GfSize3()
        expect(s.Set(3, 4, 5).equals(new GfSize3(3, 4, 5))).toBe(g.set_eq_ctor)
        expect(s.toArray()).toEqual(g.set) // [3,4,5]
      }

      expect(make().toArray()).toEqual(g.default)
      expect(g.fromVec).toEqual(g.default) // from zero vec == default
      expect(g.fromComponents).toEqual(g.set)
    })

    it('equality', () => {
      const s = mv([1, 2, 3])
      expect(eq(s, mv([1, 2, 3]))).toBe(g.eq_same)

      const s2 = mv([1, 2, 3])
      expect(!eq(s2, mv([3, 2, 1]))).toBe(g.neq_rev)
    })

    it('arithmetic', () => {
      const s1 = mv([1, 2, 3])
      const s2 = mv([3, 4, 5])
      expect((s1 as GfSize2).add(s2 as GfSize2).toArray()).toEqual(g.add)
      expect((s2 as GfSize2).subtract(s1 as GfSize2).toArray()).toEqual(g.sub)
      expect((s1 as GfSize2).multiply(s2 as GfSize2).toArray()).toEqual(g.mul)
    })

    it('in-place add/subtract return same instance', () => {
      let s1 = mv([1, 2, 3])
      let s1Original = s1
      ;(s1 as GfSize2).subtractEq(mv([1, 1, 1]) as GfSize2)
      expect(s1.toArray()).toEqual(g.isub)
      expect(s1).toBe(s1Original)

      s1 = mv([1, 2, 3])
      s1Original = s1
      ;(s1 as GfSize2).addEq(mv([1, 1, 1]) as GfSize2)
      expect(s1.toArray()).toEqual(g.iadd)
      expect(s1).toBe(s1Original)
    })

    it('in-place scalar multiply/divide return same instance', () => {
      let s1 = mv([1, 2, 3])
      let s1Original = s1
      ;(s1 as GfSize2).multiplyScalarEq(10)
      expect(s1.toArray()).toEqual(g.imul_scalar)
      expect(s1).toBe(s1Original)

      s1 = mv([30, 60, 90])
      s1Original = s1
      ;(s1 as GfSize2).divideScalarEq(10)
      expect(s1.toArray()).toEqual(g.idiv_scalar)
      expect(s1).toBe(s1Original)
    })

    it('scalar multiply/divide (free operators)', () => {
      expect((mv([1, 2, 3]) as GfSize2).getMultiply(10).toArray()).toEqual(g.mul_scalar_right)
      // 10 * size — commutative, same result
      expect((mv([1, 2, 3]) as GfSize2).getMultiply(10).toArray()).toEqual(g.mul_scalar_left)
      expect((mv([10, 20, 30]) as GfSize2).getDivide(10).toArray()).toEqual(g.div_scalar)
    })

    it('repr round-trips (eval(repr(s)) == s)', () => {
      const s1 = mv([1, 2, 3])
      expect((s1 as GfSize2).repr()).toBe(g.repr)
      expect(eq(s1, evalRepr((s1 as GfSize2).repr()))).toBe(g.repr_eval_eq)
    })

    it('str is non-empty', () => {
      expect((mv([1, 2, 3]) as GfSize2).toString()).toBe(g.str)
      expect((mv([1, 2, 3]) as GfSize2).toString().length).toBeGreaterThan(0)
    })

    it('indexing: negative index, contains, length', () => {
      const s = make()
      s.setIndex(-1, 3)
      expect(s.Get(-1)).toBe(g.neg_index_set_get)
      expect(s.contains(3)).toBe(g.contains_3)
      expect(s.length).toBe(s.dimension)
      expect(s.length).toBe(g.len)

      const s2 = mv([1, 2, 3])
      expect(s2.contains(10)).toBe(g.contains_10)
    })

    it('out-of-range index throws (Python IndexError)', () => {
      const s = mv([1, 2, 3])
      expect(g.oob_raises).toBe(true)
      expect(() => s.setIndex(-10, 3)).toThrow()
    })
  })
}

// Goldens captured from the native build (fixtures/size.json).
runTest('GfSize2', () => new GfSize2(), GfSize2, G.Size2)

runTest('GfSize3', () => new GfSize3(), GfSize3, G.Size3)
