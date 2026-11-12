// Far::internal::EvaluatePatchBasis for every patch type, against the native
// OpenSubdiv 3.6.1 float and double instantiations (fixtures/patchBasis.json,
// capture/farPatchBasis.cpp). Covers the adaptive patch bases (B-spline with
// boundary masks, Loop box-spline, Gregory quad and triangle) that uniform
// patch tables never reach.
//
// The native library is built with FMA contraction (arm64 clang), so even
// the double results are compared within a few ulps rather than exactly.

import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EvaluatePatchBasis, PatchParam, PatchType } from '../../src/far/index.ts'
import { readFixture, decodeF32, compareFloats } from './shapeUtils.ts'

const here = dirname(fileURLToPath(import.meta.url))

interface BasisCase {
  type: PatchType
  field0: number
  field1: number
  s: number
  t: number
  n: number
  double: number[]
  floatF32: string
}

const { cases } = readFixture<{ cases: BasisCase[] }>(join(here, 'fixtures', 'patchBasis.json'))

function evaluate(c: BasisCase, make: (n: number) => Float32Array | Float64Array): number[] {
  const w = [make(20), make(20), make(20), make(20), make(20), make(20)] as const
  const param = PatchParam.fromFields(c.field0, c.field1)
  const n = EvaluatePatchBasis(c.type, param, c.s, c.t, w[0], w[1], w[2], w[3], w[4], w[5])
  expect(n).toBe(c.n)
  return w.flatMap((a) => Array.from(a.subarray(0, n)))
}

describe('far patch basis', () => {
  const byType = new Map<PatchType, BasisCase[]>()
  for (const c of cases) byType.set(c.type, [...(byType.get(c.type) ?? []), c])

  for (const [type, list] of byType) {
    it(`${PatchType[type]} double basis matches native (${list.length} cases)`, () => {
      for (const c of list) {
        const actual = evaluate(c, (n) => new Float64Array(n))
        for (let i = 0; i < actual.length; ++i) {
          const e = c.double[i]!
          // a few double ulps of the largest term (FMA in the native build)
          expect(Math.abs(actual[i]! - e)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(e)))
        }
      }
    })

    it(`${PatchType[type]} float basis matches native (${list.length} cases)`, () => {
      for (const c of list) {
        const actual = evaluate(c, (n) => new Float32Array(n))
        // Weights that are float cancellations of the case's largest terms
        // are compared against an absolute floor scaled by those terms.
        const scale = Math.max(1, ...c.double.map(Math.abs))
        const cmp = compareFloats(actual, decodeF32(c.floatF32), 2 ** -20 * scale)
        expect(cmp.length).toBe(actual.length)
        expect(cmp.maxUlps).toBeLessThanOrEqual(16)
      }
    })
  }
})

