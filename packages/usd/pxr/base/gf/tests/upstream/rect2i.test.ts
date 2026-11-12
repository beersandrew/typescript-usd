// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfRect2i.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfRect2i.py.
//
// One describe() per upstream test method, every assert mirrored. Every
// expected value is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/rect2i.json — never hand-derived (AGENTS.md
// numeric-fixture rule). GfRect2i is an integer raster rect; all goldens are
// integers, so exact equality is used (no tolerance needed).
//
// Python property accessors map onto the TS class API:
//   r.min / r.max            -> GetMin()/SetMin(), GetMax()/SetMax()
//   r.minX / r.maxX / ...    -> GetMinX()/SetMinX(), GetMaxX()/SetMaxX(), ...
//   r == r2                  -> r.equals(r2)
//   r != r2                  -> !r.equals(r2)
//   tmp += r2                -> tmp.UnionWith(r2)
//   eval(repr(r))            -> reconstruct via constructor (see test_Properties)
//   hash(r)                  -> N/A (no Python hashing); structural equality used
import { describe, it, expect } from 'vitest'
import { GfRect2i } from '../../src/rect2i.ts'
import { GfVec2i } from '../../src/vec.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type V2 = [number, number]
type Rect = { min: V2; max: V2 }
const G = readOracleFixture<{
  null_isNull: boolean
  null_isEmpty: boolean
  null_isValid: boolean
  null_minmax: Rect
  empty_notnull_isNull: boolean
  empty_notnull_isEmpty: boolean
  norm_input: Rect
  norm_result: Rect
  ctor_wh: Rect
  center: V2
  area: number
  height: number
  width: number
  size: V2
  translated: Rect
  intersection: Rect
  union: Rect
  iadd: Rect
  contains_3_3: boolean
  contains_11_11: boolean
  r1_ne_r2: boolean
  repr_r1: string
  str_null: string
}>(new URL('./fixtures/rect2i.json', import.meta.url))
const v2 = (p: V2) => new GfVec2i(p[0], p[1])
const rect = (r: Rect) => new GfRect2i(v2(r.min), v2(r.max))

describe('GfRect2i test_Constructor', () => {
  it('constructs and reports null/empty/valid', () => {
    expect(new GfRect2i()).toBeInstanceOf(GfRect2i)
    expect(new GfRect2i(new GfVec2i(), new GfVec2i())).toBeInstanceOf(GfRect2i)
    expect(new GfRect2i(new GfVec2i(), 1, 1)).toBeInstanceOf(GfRect2i)

    // Default (empty) rectangle: min(0,0) max(-1,-1).
    const def = new GfRect2i()
    expect(def.getMin().data).toEqual(G.null_minmax.min)
    expect(def.getMax().data).toEqual(G.null_minmax.max)
    expect(def.isNull()).toBe(G.null_isNull)
    expect(def.IsEmpty()).toBe(G.null_isEmpty)
    expect(def.isValid()).toBe(G.null_isValid)

    // A rect that is empty but not null.
    const r = new GfRect2i(new GfVec2i(), new GfVec2i(-1, 0))
    expect(r.isNull()).toBe(G.empty_notnull_isNull)
    expect(r.IsEmpty()).toBe(G.empty_notnull_isEmpty)

    // GetNormalized swaps corners.
    const norm = rect(G.norm_input).GetNormalized()
    expect(norm.equals(rect(G.norm_result))).toBe(true)

    // Constructor from corner + width/height (1,1) -> max == min.
    const wh = new GfRect2i(new GfVec2i(), 1, 1)
    expect(wh.getMin().data).toEqual(G.ctor_wh.min)
    expect(wh.getMax().data).toEqual(G.ctor_wh.max)
  })
})

describe('GfRect2i test_Properties', () => {
  it('exercises accessors, geometry, intersection/union, containment, equality', () => {
    // Property mutation + GetNormalized smoke (mirrors upstream lines 33-39).
    let r = new GfRect2i()
    r.setMax(new GfVec2i())
    r.setMin(new GfVec2i(1, 1))
    r.GetNormalized()
    r.setMax(new GfVec2i(1, 1))
    r.setMin(new GfVec2i())
    r.GetNormalized()

    r.setMin(new GfVec2i(3, 1))
    expect(r.getMin().equals(new GfVec2i(3, 1))).toBe(true)

    r.setMax(new GfVec2i(4, 5))
    expect(r.getMax().equals(new GfVec2i(4, 5))).toBe(true)

    r.setMinX(10)
    expect(r.getMinX()).toBe(10)

    r.setMaxX(20)
    expect(r.getMaxX()).toBe(20)

    r.setMinY(30)
    expect(r.getMinY()).toBe(30)

    r.setMaxY(40)
    expect(r.getMaxY()).toBe(40)

    r = new GfRect2i(new GfVec2i(), new GfVec2i(10, 10))
    expect(r.getCenter().equals(v2(G.center))).toBe(true)
    expect(r.getArea()).toBe(G.area)
    expect(r.getHeight()).toBe(G.height)
    expect(r.getWidth()).toBe(G.width)
    expect(r.getSize().equals(v2(G.size))).toBe(true)

    r.Translate(new GfVec2i(10, 10))
    expect(r.equals(rect(G.translated))).toBe(true)

    // Intersection / union smoke with empty rects (mirrors lines 70-79).
    let r1 = new GfRect2i()
    let r2 = new GfRect2i(new GfVec2i(), new GfVec2i(1, 1))
    r1.getIntersection(r2)
    r2.getIntersection(r1)
    r1.getIntersection(r1)
    r1.getUnion(r2)
    r2.getUnion(r1)
    r1.getUnion(r1)

    r1 = new GfRect2i(new GfVec2i(0, 0), new GfVec2i(10, 10))
    r2 = new GfRect2i(new GfVec2i(5, 5), new GfVec2i(15, 15))
    expect(r1.getIntersection(r2).equals(rect(G.intersection))).toBe(true)
    expect(r1.getUnion(r2).equals(rect(G.union))).toBe(true)

    const tmp = r1.Clone()
    tmp.unionWith(r2)
    expect(tmp.equals(rect(G.iadd))).toBe(true)

    expect(r1.contains(new GfVec2i(3, 3))).toBe(G.contains_3_3)
    expect(r1.contains(new GfVec2i(11, 11))).toBe(G.contains_11_11)

    expect(r1.equals(new GfRect2i(new GfVec2i(0, 0), new GfVec2i(10, 10)))).toBe(true)
    expect(!r1.equals(r2)).toBe(G.r1_ne_r2)

    // eval(repr(r1)) round-trip: reconstruct from min/max and compare.
    const reconstructed = new GfRect2i(
      new GfVec2i(r1.getMin()),
      new GfVec2i(r1.getMax()),
    )
    expect(r1.equals(reconstructed)).toBe(true)

    // len(str(Gf.Rect2i())) is truthy -> our toString is non-empty.
    expect(new GfRect2i().toString().length).toBeGreaterThan(0)
    expect(new GfRect2i().toString()).toBe(G.str_null)
  })
})

describe('GfRect2i test_Hash', () => {
  it('equal rectangles are structurally equal (TS has no Python hash)', () => {
    const r = new GfRect2i(new GfVec2i(1, 2), new GfVec2i(10, 20))
    // hash(r) == hash(r) and hash(r) == hash(Gf.Rect2i(r)): mirror via equals
    // of a copy, since there is no value-hashing surface in TS.
    expect(r.equals(r)).toBe(true)
    expect(r.equals(r.Clone())).toBe(true)
  })
})
