// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/bboxCache.cpp,
//  pxr/usd/usdGeom/capsule.cpp, pxr/usd/usdGeom/capsule_1.cpp,
//  pxr/usd/usdGeom/cone.cpp, pxr/usd/usdGeom/cube.cpp,
//  pxr/usd/usdGeom/cylinder.cpp, and 2 more cited below
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/gprimExtents (FIXTURES.md). The intrinsic
// gprims' ComputeExtent plugins (usdGeom/capsule_1.cpp:224-379,
// cylinder_1.cpp:224-326, sphere.cpp:170-226, cube.cpp:170-226,
// cylinder.cpp and cone.cpp:206-300, capsule.cpp:206-304) and the
// UsdGeomBBoxCache bounds built on them (usdGeom/bboxCache.cpp:1260-1290):
// tapered Capsule_1 end spheres tangent to the frustum, and a plugin that
// fails when an attribute has no value at the queried time (a blocked time
// sample), which leaves the bound empty.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import { Boundable, type Extent } from 'typescript-usd/usdGeom'
import type { Matrix4 } from 'typescript-usd/gf'
import { BBoxCache } from '../../src/bboxCache.ts'

const fixture = fileURLToPath(new URL('../fixtures/gprimExtents/', import.meta.url))
type Pair = [number[], number[]] | null
const expected = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as {
  transform: number[]
  gprims: Record<string, { time: number | null; extent: Pair; transformed: Pair }[]>
  bounds: Record<string, { time: number | null; world: Pair; untransformed: Pair }[]>
}
const transform = expected.transform as Matrix4

function expectPair(actual: Pair | Extent, want: Pair, label: string, digits: number): void {
  if (want === null) {
    expect(actual, label).toBeNull()
    return
  }
  expect(actual, label).not.toBeNull()
  for (let bound = 0; bound < 2; bound++) {
    for (let axis = 0; axis < 3; axis++) {
      expect(actual![bound]![axis], `${label} [${bound}][${axis}]`).toBeCloseTo(want[bound]![axis]!, digits)
    }
  }
}

function rangePair(range: { IsEmpty(): boolean; getMin(): { data: ArrayLike<number> }; getMax(): { data: ArrayLike<number> } }): Pair {
  if (range.IsEmpty()) return null
  return [Array.from(range.getMin().data), Array.from(range.getMax().data)]
}

describe('intrinsic gprim extents and bounds match OpenUSD', async () => {
  const stage = (await Stage.open(fixture + 'stage.usda'))!
  for (const [path, rows] of Object.entries(expected.gprims)) {
    it(`${path}: ComputeExtentFromPlugins`, () => {
      const prim = stage.getPrim(path)!
      for (const row of rows) {
        const time = row.time ?? undefined
        expectPair(Boundable.computeExtentFromPlugins(prim, time), row.extent, `t=${row.time}`, 6)
        expectPair(Boundable.computeExtentFromPlugins(prim, time, transform), row.transformed,
          `t=${row.time} transformed`, 5)
      }
    })
  }
  for (const [path, rows] of Object.entries(expected.bounds)) {
    it(`${path}: BBoxCache world and untransformed bounds`, () => {
      const prim = stage.getPrim(path)!
      for (const row of rows) {
        const cache = new BBoxCache(row.time ?? undefined, ['default'])
        expectPair(rangePair(cache.computeWorldBound(prim).ComputeAlignedRange()), row.world,
          `t=${row.time} world`, 6)
        expectPair(rangePair(cache.computeUntransformedBound(prim).getRange()), row.untransformed,
          `t=${row.time} untransformed`, 6)
      }
    })
  }
})
