// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textFileFormatParser.cpp,
//  pxr/usd/sdf/textFileFormatParser.h, pxr/usd/sdf/textParserHelpers.cpp
// Copyright 2023, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native OpenUSD 26.11.1 expectations in fixtures/parserCorrectness (FIXTURES.md).
// Grammar: pxr/usd/sdf/textFileFormatParser.h:786-1029; semantic actions in
// textFileFormatParser.cpp and typed-value construction in textParserHelpers.cpp.
import { describe, expect, it } from 'vitest'
// Native Sdf discovers installed usdGeom plugin metadata; register it explicitly here.
import 'typescript-usd/usdGeom'
import { Layer } from 'typescript-usd/sdf'
import { TsExtrapMode } from 'typescript-usd/ts'
import expectedFixture from './fixtures/parserCorrectness/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

function normalize(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  if (Symbol.iterator in value) return Array.from(value as Iterable<unknown>, normalize)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
}

describe('USDA parser native differential cases', () => {
  for (const row of expected.cases) {
    it(`${row.name}: matches native acceptance and retained values`, () => {
      if (!row.accepted) {
        expect(() => Layer.createInMemory(`${row.name}.usda`, row.text)).toThrow()
        return
      }
      const layer = Layer.createInMemory(`${row.name}.usda`, row.text)
      // Test the reader and the reader/writer boundary independently: accepting
      // syntax while losing its meaning on export is not a successful roundtrip.
      for (const candidate of [layer, Layer.createInMemory(`${row.name}-roundtrip.usda`, layer.exportToString())]) {
        for (const observation of row.observations ?? []) {
          expect(normalize(candidate.getField(observation.path, observation.field))).toEqual(observation.value)
        }
        if (row.spline) {
          const attribute = candidate.getAttributeAtPath(row.spline.path)!
          expect(attribute.hasInfo('spline')).toBe(row.spline.authored)
          const spline = attribute.getSpline()
          expect(spline.GetValueTypeName()).toBe(row.spline.valueType)
          expect(spline.getCurveType()).toBe(row.spline.curveType)
          const pre = spline.getPreExtrapolation(), post = spline.getPostExtrapolation()
          for (const [actual, captured] of [[pre, row.spline.preExtrapolation], [post, row.spline.postExtrapolation]] as const) {
            expect(actual.mode).toBe(captured.mode)
            // Sdf's action scratch state can retain an inactive slope. Only
            // Sloped extrapolation gives that field meaning (ts/types.h).
            if (actual.mode === TsExtrapMode.Sloped) expect(actual.slope).toBe(captured.slope)
            if (actual.mode >= TsExtrapMode.LoopRepeat) {
              expect(actual.loopBoundaryTime ?? null).toBe(captured.loopBoundaryTime)
            }
          }
          expect(Array.from(spline.getKnots(), knot => ({
            time: knot.getTime(), value: knot.GetValue(), interpolation: knot.getNextInterpolation(),
            preWidth: knot.getPreTanWidth(), postWidth: knot.getPostTanWidth(),
            preSlope: knot.getPreTanSlope(), postSlope: knot.getPostTanSlope(),
          }))).toEqual(row.spline.knots)
        }
      }
    })
  }
})
