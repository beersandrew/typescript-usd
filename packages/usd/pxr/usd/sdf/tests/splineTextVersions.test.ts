// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileIO.cpp,
//  pxr/usd/sdf/fileIO_Common.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fileIO_Common.cpp:605-637,728-760; fileIO.cpp:80-104.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/splineTextVersions/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

describe('Sdf content-driven spline text versions', () => {
  for (const row of expected.cases) it(row.name, () => {
    const layer = Layer.createInMemory(`${row.name}.usda`, row.text)
    const exported = layer.exportToString()
    expect(exported.split('\n')[0]).toBe(row.header)
    const reopened = Layer.createInMemory(`${row.name}-reopened.usda`, exported)
    expect(reopened.exportToString().split('\n')[0]).toBe(row.header)
    if ('spline' in row && row.spline) {
      for (const candidate of [layer, reopened]) {
        const spline = candidate.getAttributeAtPath('/World.value')!.getSpline()
        const pre = spline.getPreExtrapolation(), post = spline.getPostExtrapolation()
        expect({
          curveType: spline.getCurveType(), preMode: pre.mode, postMode: post.mode,
          preBoundary: pre.loopBoundaryTime ?? null, postBoundary: post.loopBoundaryTime ?? null,
          knots: spline.getKnots().map(knot => ({ time: knot.getTime(), value: knot.GetValue(),
            preAlgorithm: knot.getPreTanAlgorithm(), postAlgorithm: knot.getPostTanAlgorithm() })),
        }).toEqual(row.spline)
      }
    }
  })
  it('starts each independent export at the native minimum version', () => {
    const high = expected.cases.find(row => row.name === 'loop-boundary')!
    const plain = expected.cases.find(row => row.name === 'plain')!
    expect(Layer.createInMemory('high.usda', high.text).exportToString().split('\n')[0]).toBe(high.header)
    expect(Layer.createInMemory('plain.usda', plain.text).exportToString().split('\n')[0]).toBe(plain.header)
  })
})
