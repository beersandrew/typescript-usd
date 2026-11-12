// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textFileFormatParser.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: textFileFormatParser.h:69,239-246,793-838,925-938.
// `pre` (knot tangent), `post` (knot shaping) and the extrapolation `loop`
// keyword are followed by TokenSeparator, which needs a space or tab.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/splineTokenSeparator/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

describe('Sdf usda spline TokenSeparator', () => {
  for (const row of expected.cases) it(`${row.name} ${row.accepted ? 'accepted' : 'rejected'}`, () => {
    if (!row.accepted) {
      expect(() => Layer.createInMemory(`${row.name}.usda`, row.text)).toThrow()
      return
    }
    const layer = Layer.createInMemory(`${row.name}.usda`, row.text)
    const spline = layer.getAttributeAtPath('/P.a')!.getSpline()
    const pre = spline.getPreExtrapolation(), post = spline.getPostExtrapolation()
    expect({
      preMode: pre.mode, postMode: post.mode, preSlope: pre.slope, postSlope: post.slope,
      preBoundary: pre.loopBoundaryTime ?? null, postBoundary: post.loopBoundaryTime ?? null,
      knots: spline.getKnots().map(knot => ({
        time: knot.getTime(), value: knot.GetValue(),
        preTanWidth: knot.getPreTanWidth(), preTanSlope: knot.getPreTanSlope(),
        postTanWidth: knot.getPostTanWidth(), postTanSlope: knot.getPostTanSlope(),
        nextInterp: knot.getNextInterpolation(),
      })),
    }).toEqual(row.spline)
  })
})
