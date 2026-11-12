// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomPoints.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomPoints.py — GetPointCount across
// unset / blocked / empty / time-sampled / time-sampled-and-default points.
// The upstream test reads a points.usda fixture; here the same five cases are
// authored programmatically. Counts are structural (array lengths), not
// numeric fixtures.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Points } from 'typescript-usd/usdGeom'

const EARLIEST = Number.NEGATIVE_INFINITY // UsdTimeCode.EarliestTime()

describe('UsdGeomPoints.GetPointCount', () => {
  it('counts points at EarliestTime and Default for every authoring shape', () => {
    const stage = Stage.createNew()

    // Unset: no points authored.
    Points.define(stage, '/UnsetPoints')

    // Blocked: points authored as a value block (null) — resolves to nothing.
    const blocked = Points.define(stage, '/BlockedPoints')
    blocked.getPointsAttr().set(null)

    // Empty: an explicitly empty array.
    const empty = Points.define(stage, '/EmptyPoints')
    empty.getPointsAttr().set([])

    // Time-sampled only (no default): earliest sample has 3 points.
    const ts = Points.define(stage, '/TimeSampledPoints')
    ts.getPointsAttr().setTimeSample(1, [[0, 0, 0], [1, 0, 0], [2, 0, 0]])
    ts.getPointsAttr().setTimeSample(2, [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]])

    // Time-sampled with a default: default has 4, earliest sample has 5.
    const tsd = Points.define(stage, '/TimeSampledAndDefaultPoints')
    tsd.getPointsAttr().set([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])
    tsd.getPointsAttr().setTimeSample(1, [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]])

    const cases: Array<[string, number, number]> = [
      // [path, earliestCount, defaultCount]
      ['/UnsetPoints', 0, 0],
      ['/BlockedPoints', 0, 0],
      ['/EmptyPoints', 0, 0],
      ['/TimeSampledPoints', 3, 0],
      ['/TimeSampledAndDefaultPoints', 5, 4],
    ]

    for (const [path, earliest, def] of cases) {
      const prim = stage.getPrim(path)!
      expect(prim, path).toBeTruthy()
      expect(Points.getPointCount(prim, EARLIEST), `${path} @ earliest`).toBe(earliest)
      expect(Points.getPointCount(prim), `${path} @ default`).toBe(def)
    }
  })
})
