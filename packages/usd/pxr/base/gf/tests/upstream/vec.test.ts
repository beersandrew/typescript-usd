// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfVec.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfVec.py.
//
// One describe() per upstream test method / per-type sub-test. Every numeric
// expectation that is not a literal already present in the upstream test is
// captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/vec.json — never hand-derived (AGENTS.md numeric-fixture rule).
//
// EXCLUSION: half-precision Gf.Vec*h is the documented precision-twin
// exclusion (typescript-usd memory gf-math-classification: "precision twins vec*f/h/i
// are excluded from coverage"). The upstream test loops over d/f/h/i; this
// port covers d/f/i fully and the few h-only sub-cases are skipped with a
// comment (not silently). Nothing is it.skip'd.
import { describe, it, expect } from 'vitest'
import {
  GfVec,
  GfVec2d, GfVec2f, GfVec2i,
  GfVec3d, GfVec3f, GfVec3i,
  GfVec4d, GfVec4f, GfVec4i,
  GfDot, GfGetLength, GfNormalize, GfGetNormalized,
  GfGetProjection, GfGetComplement, GfIsClose,
  GfCompMult, GfCompDiv, GfCross, GfSlerp,
  type VecLike,
} from '../../src/vec.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// ---------- captured goldens (fixtures/vec.json) ----------
interface VecGolden {
  dimension: number
  add: number[]
  sub: number[]
  mul: number[]
  dot: number
  divInput: number[]
  div: number[]
  neg: number[]
  compMult?: number[]
  length?: number
  normalized?: number[]
  proj?: number[]
  comp?: number[]
  compDiv?: number[]
  cross?: number[]
  slerp?: Record<string, number[]>
}
const GOLDEN: Record<string, VecGolden> = readOracleFixture<Record<string, VecGolden>>(
  new URL('./fixtures/vec.json', import.meta.url),
)
// Slerp goldens (vec3 d/f).
const SLERP: Record<string, Record<string, number[]>> = {
  Vec3d: GOLDEN.Vec3d!.slerp!,
  Vec3f: GOLDEN.Vec3f!.slerp!,
}

// ---------- type descriptors ----------
type Kind = 'd' | 'f' | 'i'
interface VecType {
  name: string
  Ctor: new (...a: Array<number | VecLike>) => GfVec
  dim: number
  kind: Kind
}
// indexed [dim][kind]
const BY: Record<number, Record<Kind, VecType>> = {
  2: {
    d: { name: 'Vec2d', Ctor: GfVec2d, dim: 2, kind: 'd' },
    f: { name: 'Vec2f', Ctor: GfVec2f, dim: 2, kind: 'f' },
    i: { name: 'Vec2i', Ctor: GfVec2i, dim: 2, kind: 'i' },
  },
  3: {
    d: { name: 'Vec3d', Ctor: GfVec3d, dim: 3, kind: 'd' },
    f: { name: 'Vec3f', Ctor: GfVec3f, dim: 3, kind: 'f' },
    i: { name: 'Vec3i', Ctor: GfVec3i, dim: 3, kind: 'i' },
  },
  4: {
    d: { name: 'Vec4d', Ctor: GfVec4d, dim: 4, kind: 'd' },
    f: { name: 'Vec4f', Ctor: GfVec4f, dim: 4, kind: 'f' },
    i: { name: 'Vec4i', Ctor: GfVec4i, dim: 4, kind: 'i' },
  },
}
const ALL: VecType[] = [2, 3, 4].flatMap((d) => (['d', 'f', 'i'] as Kind[]).map((k) => BY[d]![k]))

const isFloat = (t: VecType): boolean => t.kind !== 'i'
// getEps: rank d=3 -> 1e-4, f=2 -> 1e-3 (h excluded).
const getEps = (t: VecType): number => (t.kind === 'd' ? 1e-4 : 1e-3)
const rank = (t: VecType): number => (t.kind === 'd' ? 3 : t.kind === 'f' ? 2 : 0)

// ---------- helpers mirroring the .py module helpers ----------
const SetVec = (v: GfVec, values: number[]): void => {
  for (let i = 0; i < v.dimension; i++) v.setComponent(i, values[i]!)
}
const checkVec = (v: GfVec, values: number[]): boolean => {
  for (let i = 0; i < v.dimension; i++) if (v.get(i) !== values[i]) return false
  return true
}
const checkVecDot = (v1: GfVec, v2: GfVec, dp: number): boolean => {
  if (v1.dimension !== v2.dimension) return false
  let s = 0
  for (let i = 0; i < v1.dimension; i++) s += v1.get(i) * v2.get(i)
  return s === dp
}
// Gf.IsClose for raw scalars (used by upstream with floats).
const isCloseScalar = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol
const expectVecClose = (v: GfVec, arr: readonly number[], tol: number): void => {
  let s = 0
  for (let i = 0; i < v.dimension; i++) s += (v.get(i) - arr[i]!) ** 2
  expect(s).toBeLessThanOrEqual(tol * tol)
}

// ============================================================
describe('ConstructorsTest', () => {
  for (const t of ALL) {
    it(t.name, () => {
      const { Ctor, dim } = t
      // no arg constructor
      expect(new Ctor()).toBeInstanceOf(Ctor)
      // default constructor -> all zero
      const z = new Ctor()
      for (let i = 0; i < dim; i++) expect(z.get(i)).toBe(0)
      // copy constructor
      const v = new Ctor()
      for (let i = 0; i < dim; i++) v.setComponent(i, i)
      const v2 = new Ctor(v)
      for (let i = 0; i < dim; i++) expect(v2.get(i)).toBe(v.get(i))
      // explicit constructor
      const values = [3, 1, 4, 1]
      if (dim === 2) expect(checkVec(new Ctor(3, 1), values)).toBe(true)
      else if (dim === 3) expect(checkVec(new Ctor(3, 1, 4), values)).toBe(true)
      else expect(checkVec(new Ctor(3, 1, 4, 1), values)).toBe(true)
      // single scalar fill
      for (const fill of [0, 1, 2]) {
        const f = new Ctor(fill)
        for (let i = 0; i < dim; i++) expect(f.get(i)).toBe(fill)
      }
      // conversion from other types (floating only); 'h' excluded.
      if (isFloat(t)) {
        for (const k of ['d', 'f', 'i'] as Kind[]) {
          const V = BY[dim]![k]
          expect(new Ctor(new V.Ctor())).toBeInstanceOf(Ctor)
        }
      }
      // comparison to int type (all types)
      const vi = new (BY[dim]!.i.Ctor)()
      SetVec(vi, [3, 1, 4, 1])
      expect(new Ctor(vi).equals(vi)).toBe(true)
      // comparison to float types (floating only); 'h' excluded.
      if (isFloat(t)) {
        for (const k of ['d', 'f'] as Kind[]) {
          const V = BY[dim]![k]
          const fv = new V.Ctor()
          SetVec(fv, [0.3, 0.1, 0.4, 0.1])
          if (rank(t) >= rank(V)) expect(new Ctor(fv).equals(fv)).toBe(true)
          else expect(new Ctor(fv).equals(fv)).toBe(false)
        }
      }
    })
  }
})

// ============================================================
describe('OperatorsTest', () => {
  for (const t of ALL) {
    it(t.name, () => {
      const { Ctor, dim } = t
      const g = GOLDEN[t.name]!
      let v1 = new Ctor()
      const v1Original = v1
      let v2 = new Ctor()

      // equality
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [3, 1, 4, 1])
      expect(v1.equals(v2)).toBe(true)
      // inequality
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      expect(v1.equals(v2)).toBe(false)

      // component-wise addition (Add returns new; AddInPlace mutates -> +=)
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      const v3add = v1.add(v2)
      v1.addInPlace(v2)
      expect(checkVec(v1, g.add)).toBe(true)
      expect(checkVec(v3add, g.add)).toBe(true)
      expect(v1 === v1Original).toBe(true) // += mutates in place

      // component-wise subtraction
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      const v3sub = v1.subtract(v2)
      v1.subtractInPlace(v2)
      expect(checkVec(v1, g.sub)).toBe(true)
      expect(checkVec(v3sub, g.sub)).toBe(true)
      expect(v1 === v1Original).toBe(true)

      // component-wise multiplication (v*10, 10*v, *=)
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      const v4 = v1.getScaled(10)
      const v5 = v1.getScaled(10) // 10 * v1
      v1.scaleInPlace(10)
      expect(checkVec(v1, g.mul)).toBe(true)
      expect(checkVec(v4, g.mul)).toBe(true)
      expect(checkVec(v5, g.mul)).toBe(true)
      expect(v1 === v1Original).toBe(true)

      // component-wise division
      SetVec(v1, g.divInput)
      const v3div = v1.getDivided(3)
      v1.divideInPlace(3)
      expect(checkVec(v1, g.div)).toBe(true)
      expect(checkVec(v3div, g.div)).toBe(true)
      expect(v1 === v1Original).toBe(true)

      // dot product: v1*v2 / Gf.Dot / v1.GetDot
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      const dp = v1.dot(v2)
      const dp2 = GfDot(v1, v2)
      const dp3 = v1.getDot(v2)
      expect(checkVecDot(v1, v2, dp)).toBe(true)
      expect(checkVecDot(v1, v2, dp2)).toBe(true)
      expect(checkVecDot(v1, v2, dp3)).toBe(true)
      expect(dp).toBe(g.dot)

      // unary minus (negation)
      SetVec(v1, [3, 1, 4, 1])
      expect(checkVec(v1.getNegated(), g.neg)).toBe(true)

      // repr round-trips through the constructor.
      SetVec(v1, [3, 1, 4, 1])
      expect(v1.repr()).toContain(t.name)
      expect(new Ctor(...v1.data).equals(v1)).toBe(true)

      // string
      expect(new Ctor().toString().length).toBeGreaterThan(0)

      // indexing
      v1 = new Ctor()
      for (let i = 0; i < dim; i++) v1.setComponent(i, i + 1)
      expect(v1.get(-1)).toBe(v1.get(dim - 1))
      expect(v1.get(0)).toBe(1)
      // membership: components are 1..dim
      const contains = (val: number): boolean => v1.data.includes(val)
      expect(contains(dim)).toBe(true)
      expect(contains(dim + 1)).toBe(false)
      // out-of-range write raises
      expect(() => v1.setComponent(dim + 1, dim + 1)).toThrow()

      // slicing: Python slice reads map to data.slice; the slice-assignment
      // validation cases (wrong length / float indices / None) are
      // Python-binding specific and have no TS analogue.
      v2 = new Ctor(); SetVec(v2, [3, 1, 4, 1])
      const value = v2.data.slice(0, dim)
      expect(v2.data.slice()).toEqual(value)
      expect(v2.data.slice(0, 2)).toEqual(value.slice(0, 2))
      expect(v2.data.slice(-2)).toEqual(value.slice(-2))
      expect(v2.data.slice(1, 1)).toEqual([])
    })
  }
})

// ============================================================
describe('MethodsTest', () => {
  for (const t of ALL.filter(isFloat)) {
    it(t.name, () => {
      const { Ctor, dim } = t
      const eps = getEps(t)
      const g = GOLDEN[t.name]!
      let v1 = new Ctor()
      let v2 = new Ctor()

      // length
      SetVec(v1, [3, 1, 4, 1])
      const l = GfGetLength(v1)
      const l2 = v1.GetLength()
      expect(isCloseScalar(l, l2, eps)).toBe(true)
      expect(isCloseScalar(l, Math.sqrt(GfDot(v1, v1)), eps)).toBe(true)
      expect(isCloseScalar(l, g.length as number, eps)).toBe(true)

      // Normalize / GetNormalized / GfGetNormalized
      SetVec(v1, [3, 1, 4, 1])
      v2 = new Ctor(v1)
      v2.Normalize()
      const nv = GfGetNormalized(v1)
      const nv2 = v1.GetNormalized()
      const nvcheck = v1.getDivided(GfGetLength(v1))
      expect(GfIsClose(nv, nvcheck, eps)).toBe(true)
      expect(GfIsClose(nv2, nvcheck, eps)).toBe(true)
      expect(GfIsClose(v2, nvcheck, eps)).toBe(true)
      expectVecClose(v2, g.normalized as number[], eps)

      // GetNormalized exactly equals v1 / GetLength(v1)
      SetVec(v1, [3, 1, 4, 1])
      const nvExact = v1.GetNormalized()
      const nvExactCheck = v1.getDivided(GfGetLength(v1))
      expect(nvExact.equals(nvExactCheck)).toBe(true)

      // zero stays zero
      SetVec(v1, [0, 0, 0, 0]); v1.Normalize()
      expect(checkVec(v1, [0, 0, 0, 0])).toBe(true)

      // [2,0,0,0] -> [1,0,0,0]
      SetVec(v1, [2, 0, 0, 0]); GfNormalize(v1)
      expect(checkVec(v1, [1, 0, 0, 0])).toBe(true)

      // projection
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      const p1 = GfGetProjection(v1, v2)
      const p2 = v1.GetProjection(v2 as never)
      const projCheck = v2.getScaled(v1.dot(v2))
      expect(p1.equals(projCheck) && p2.equals(projCheck)).toBe(true)
      expectVecClose(p1, g.proj as number[], eps)

      // complement
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      const c1 = GfGetComplement(v1, v2)
      const c2 = v1.GetComplement(v2 as never)
      const compCheck = v1.subtract(v2.getScaled(v1.dot(v2)))
      expect(c1.equals(compCheck) && c2.equals(compCheck)).toBe(true)
      expectVecClose(c1, g.comp as number[], eps)

      // component-wise multiplication
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      expect(checkVec(GfCompMult(v1, v2), g.compMult!)).toBe(true)

      // component-wise division
      SetVec(v1, [3, 9, 18, 21]); SetVec(v2, [3, 3, 9, 7])
      expect(checkVec(GfCompDiv(v1, v2), g.compDiv!)).toBe(true)

      // is close
      SetVec(v1, [3, 1, 4, 1]); SetVec(v2, [5, 9, 2, 6])
      expect(GfIsClose(v1, v1, 0.1)).toBe(true)
      expect(GfIsClose(v1, v2, 0.1)).toBe(false)

      // static Axis methods
      for (let i = 0; i < dim; i++) {
        const a = (Ctor as unknown as { Axis(i: number): GfVec }).Axis(i)
        const b = new Ctor(); b.setComponent(i, 1)
        expect(a.equals(b)).toBe(true)
      }
      expect(checkVec((Ctor as unknown as { xAxis(): GfVec }).xAxis(), [1, 0, 0, 0])).toBe(true)
      expect(checkVec((Ctor as unknown as { yAxis(): GfVec }).yAxis(), [0, 1, 0, 0])).toBe(true)
      if (dim !== 2) {
        expect(checkVec((Ctor as unknown as { zAxis(): GfVec }).zAxis(), [0, 0, 1, 0])).toBe(true)
      }

      if (dim === 3) {
        const C = Ctor as unknown as (new (...a: Array<number | VecLike>) => GfVec3d)
        // cross product: Cross, GfCross, GetCross
        const c = new C(); SetVec(c, [3, 1, 4])
        const d = new C(); SetVec(d, [5, 9, 2])
        const x3 = new C(GfCross(c, d))
        const x4 = c.Cross(d)
        const x5 = c.GetCross(d)
        const crossCheck = new C()
        SetVec(crossCheck, [1 * 2 - 4 * 9, 4 * 5 - 3 * 2, 3 * 9 - 1 * 5])
        expect(x3.equals(crossCheck) && x4.equals(crossCheck) && x5.equals(crossCheck)).toBe(true)
        expect(checkVec(x3, g.cross as number[])).toBe(true)

        // orthogonalize basis — case 1: close to orthogonal, no normalize
        let a1 = new C(); SetVec(a1, [1, 0, 0.1])
        let a2 = new C(); SetVec(a2, [0.1, 1, 0])
        let a3 = new C(); SetVec(a3, [0, 0.1, 1])
        expect(GfVec3d.orthogonalizeBasis(a1, a2, a3, false)).toBe(true)
        expect(isCloseScalar(GfDot(a2, a1), 0, eps)).toBe(true)
        expect(isCloseScalar(GfDot(a3, a1), 0, eps)).toBe(true)
        expect(isCloseScalar(GfDot(a2, a3), 0, eps)).toBe(true)

        // case 2: far from orthogonal, normalize
        a1 = new C(); SetVec(a1, [1, 2, 3])
        a2 = new C(); SetVec(a2, [-1, 2, 3])
        a3 = new C(); SetVec(a3, [-1, -2, 3])
        expect(GfVec3d.orthogonalizeBasis(a1, a2, a3, true)).toBe(true)
        expect(isCloseScalar(GfDot(a2, a1), 0, eps)).toBe(true)
        expect(isCloseScalar(GfDot(a3, a1), 0, eps)).toBe(true)
        expect(isCloseScalar(GfDot(a2, a3), 0, eps)).toBe(true)
        expect(isCloseScalar(a1.GetLength(), 1, eps)).toBe(true)
        expect(isCloseScalar(a2.GetLength(), 1, eps)).toBe(true)
        expect(isCloseScalar(a3.GetLength(), 1, eps)).toBe(true)

        // case 3: already orthogonal — unchanged, even with large tolerance
        a1 = new C(); SetVec(a1, [1, 0, 0])
        a2 = new C(); SetVec(a2, [0, 1, 0])
        a3 = new C(); SetVec(a3, [0, 0, 1])
        const t1 = new C(a1), t2 = new C(a2), t3 = new C(a3)
        expect(GfVec3d.orthogonalizeBasis(a1, a2, a3, false, 1.0)).toBe(true)
        expect(a1.equals(t1) && a2.equals(t2) && a3.equals(t3)).toBe(true)

        // case 4: co-linear input — does nothing, returns false
        a1 = new C(); SetVec(a1, [1, 0, 0])
        a2 = new C(); SetVec(a2, [1, 0, 0])
        a3 = new C(); SetVec(a3, [0, 0, 1])
        const u1 = new C(a1), u2 = new C(a2), u3 = new C(a3)
        expect(GfVec3d.orthogonalizeBasis(a1, a2, a3, false, 1.0)).toBe(false)
        expect(a1.equals(u1) && a2.equals(u2) && a3.equals(u3)).toBe(true)

        // build orthonormal frame
        const frameCheck = (src: number[], expectZero = false): void => {
          const w = new C(); SetVec(w, src)
          const [f2, f3] = w.BuildOrthonormalFrame()
          if (expectZero) {
            expect(GfIsClose(f2, new C(), eps)).toBe(true)
            expect(GfIsClose(f3, new C(), eps)).toBe(true)
          } else {
            expect(isCloseScalar(GfDot(f2, w), 0, eps)).toBe(true)
            expect(isCloseScalar(GfDot(f3, w), 0, eps)).toBe(true)
            expect(isCloseScalar(GfDot(f2, f3), 0, eps)).toBe(true)
          }
        }
        frameCheck([1, 1, 1])
        frameCheck([0, 0, 0], true)
        frameCheck([1, 0, 0])
        // with explicit eps argument
        const w = new C(); SetVec(w, [1, 0, 0])
        const [wf2, wf3] = w.BuildOrthonormalFrame(2)
        expect(isCloseScalar(GfDot(wf2, w), 0, eps)).toBe(true)
        expect(isCloseScalar(GfDot(wf3, w), 0, eps)).toBe(true)
        expect(isCloseScalar(GfDot(wf2, wf3), 0, eps)).toBe(true)

        // Slerp — orthogonal vectors
        const sg = SLERP[t.name]!
        let s1 = new C(); SetVec(s1, [1, 0, 0])
        let s2 = new C(); SetVec(s2, [0, 1, 0])
        expect(GfIsClose(GfSlerp(0, s1, s2), s1, eps)).toBe(true)
        expectVecClose(GfSlerp(0, s1, s2), sg.orth_0!, eps)
        expectVecClose(GfSlerp(0.5, s1, s2), sg.orth_half!, eps)
        expect(GfIsClose(GfSlerp(0.5, s1, s2), new C(0.7071, 0.7071, 0), eps)).toBe(true)

        // Slerp — nearly parallel vectors
        s1 = new C(); SetVec(s1, [1, 0, 0])
        s2 = new C(); SetVec(s2, [1.001, 0.0001, 0]); s2.Normalize()
        expect(GfIsClose(GfSlerp(0, s1, s2), s1, eps)).toBe(true)
        expect(GfIsClose(GfSlerp(0.5, s1, s2), s1, eps)).toBe(true)
        expect(GfIsClose(GfSlerp(0.5, s1, s2), s2, eps)).toBe(true)

        // Slerp — opposing vectors (x)
        s1 = new C(); SetVec(s1, [1, 0, 0])
        s2 = new C(); SetVec(s2, [-1, 0, 0])
        expect(GfIsClose(GfSlerp(0, s1, s2), s1, eps)).toBe(true)
        expectVecClose(GfSlerp(0.25, s1, s2), sg.opp_25!, eps)
        expect(GfIsClose(GfSlerp(0.25, s1, s2), new C(0.70711, 0, -0.70711), eps)).toBe(true)
        expectVecClose(GfSlerp(0.5, s1, s2), sg.opp_half!, eps)
        expect(GfIsClose(GfSlerp(0.5, s1, s2), new C(0, 0, -1), eps)).toBe(true)
        expectVecClose(GfSlerp(0.75, s1, s2), sg.opp_75!, eps)
        expect(GfIsClose(GfSlerp(0.75, s1, s2), new C(-0.70711, 0, -0.70711), eps)).toBe(true)
        expect(GfIsClose(GfSlerp(1, s1, s2), s2, eps)).toBe(true)

        // Slerp — opposing vectors (y)
        s1 = new C(); SetVec(s1, [0, 1, 0])
        s2 = new C(); SetVec(s2, [0, -1, 0])
        expect(GfIsClose(GfSlerp(0, s1, s2), s1, eps)).toBe(true)
        expectVecClose(GfSlerp(0.25, s1, s2), sg.oppY_25!, eps)
        expect(GfIsClose(GfSlerp(0.25, s1, s2), new C(0, 0.70711, 0.70711), eps)).toBe(true)
        expectVecClose(GfSlerp(0.5, s1, s2), sg.oppY_half!, eps)
        expect(GfIsClose(GfSlerp(0.5, s1, s2), new C(0, 0, 1), eps)).toBe(true)
        expectVecClose(GfSlerp(0.75, s1, s2), sg.oppY_75!, eps)
        expect(GfIsClose(GfSlerp(0.75, s1, s2), new C(0, -0.70711, 0.70711), eps)).toBe(true)
        expect(GfIsClose(GfSlerp(1, s1, s2), s2, eps)).toBe(true)
      }
    })
  }
})

// ============================================================
describe('HashTest', () => {
  for (const t of ALL) {
    it(t.name, () => {
      const v1 = new t.Ctor()
      SetVec(v1, [12, 1, 2, -4])
      expect(v1.hash()).toBe(v1.hash())
      expect(v1.hash()).toBe(new t.Ctor(v1).hash())
    })
  }
})

// ============================================================
describe('test_TupleToVec', () => {
  it('GfDot accepts tuples and arrays', () => {
    expect(GfDot([1, 1], [1, 1])).toBe(2)
    expect(GfDot([1, 1, 1], [1, 1, 1])).toBe(3)
    expect(GfDot([1, 1, 1, 1], [1, 1, 1, 1])).toBe(4)
    expect(GfDot([1.0, 1.0], [1.0, 1.0])).toBe(2.0)
    expect(GfDot([1.0, 1.0, 1.0], [1.0, 1.0, 1.0])).toBe(3.0)
    expect(GfDot([1.0, 1.0, 1.0, 1.0], [1.0, 1.0, 1.0, 1.0])).toBe(4.0)
  })
  it('construct vec from array equals explicit', () => {
    expect(new GfVec2f([1, 1]).equals(new GfVec2f(1, 1))).toBe(true)
    expect(new GfVec3f([1, 1, 1]).equals(new GfVec3f(1, 1, 1))).toBe(true)
    expect(new GfVec4f([1, 1, 1, 1]).equals(new GfVec4f(1, 1, 1, 1))).toBe(true)
  })
})

// ============================================================
describe('test_Exceptions', () => {
  it('GfDot rejects non-vector / non-numeric / mismatched args', () => {
    // 'monkey' (a string) is not a vector.
    expect(() => GfDot('monkey' as unknown as VecLike, [1, 1])).toThrow(TypeError)
    expect(() => GfDot('monkey' as unknown as VecLike, [1, 1, 1])).toThrow(TypeError)
    // dimension mismatch
    expect(() => GfDot([1, 1, 1, 1, 1, 1], [1, 1])).toThrow(TypeError)
    expect(() => GfDot([1, 1, 1, 1, 1, 1], [1, 1, 1])).toThrow(TypeError)
    // non-numeric components
    expect(() => GfDot(['a', 'b'] as unknown as VecLike, [1, 1])).toThrow(TypeError)
    expect(() => GfDot(['a', 'b', 'c'] as unknown as VecLike, [1, 1, 1])).toThrow(TypeError)
  })
  // int(Gf.Vec3d(...)) raising is a Python numeric-coercion case with no TS
  // analogue (there is no implicit int() coercion of a vector); N/A.
})
