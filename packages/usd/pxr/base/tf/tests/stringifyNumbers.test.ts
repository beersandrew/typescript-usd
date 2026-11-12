// Ported from OpenUSD 26.11.1: pxr/base/tf/stringUtils.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 capture: fixtures/stringifyNumbers (FIXTURES.md).
// TfStringify(float/double), TfStreamFloat and TfStreamDouble share one
// double-conversion converter (tf/stringUtils.cpp:917-1015): shortest
// round-trip digits (ToShortestSingle for float), decimal notation for
// exponents in [-6, 15), `1e300`-style exponents otherwise.
import { describe, expect, it } from 'vitest'
import { TfDoubleToString, TfStreamDouble, TfStreamFloat } from 'typescript-usd/tf'
import expectedFixture from './fixtures/stringifyNumbers/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture) as { float: [string, string][], double: [string, string][] }

const floatOf = (hex: string) => new Float32Array(new Uint32Array([parseInt(hex, 16)]).buffer)[0]!
const doubleOf = (hex: string) => new Float64Array(new BigUint64Array([BigInt(`0x${hex}`)]).buffer)[0]!

function mismatches(rows: [string, string][], of: (hex: string) => number, text: (value: number) => string) {
  return rows.filter(([hex, want]) => text(of(hex)) !== want).map(([hex, want]) => [hex, want, text(of(hex))])
}

describe('TfStringify of floating-point values', () => {
  it('floats print the shortest single-precision digits OpenUSD prints', () => {
    expect(expected.float.length).toBeGreaterThan(9000)
    expect(mismatches(expected.float, floatOf, TfStreamFloat)).toEqual([])
  })

  it('doubles print the shortest double digits OpenUSD prints', () => {
    expect(expected.double.length).toBeGreaterThan(9000)
    expect(mismatches(expected.double, doubleOf, TfStreamDouble)).toEqual([])
    expect(mismatches(expected.double, doubleOf, v => TfDoubleToString(v))).toEqual([])
  })
})
