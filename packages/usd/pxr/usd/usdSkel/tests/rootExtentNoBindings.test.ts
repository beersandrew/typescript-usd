// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/root.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdSkelRoot's extent plugin (usdSkel/root.cpp:140-247) for a SkelRoot
// whose subtree binds no skinnable prim: the extent is that of the
// descendant skeletons' joint pivots (root.cpp:211-226). Expected values:
// native UsdGeomBoundable::ComputeExtentFromPlugins from the pinned build
// (fixtures/rootExtentNoBindings, FIXTURES.md) on the testUsdImagingGLSkeleton
// scene (skeleton.usda, copied unmodified).
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Boundable } from 'typescript-usd/usdGeom'
import '../src/index.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

const base = new URL('./fixtures/rootExtentNoBindings/', import.meta.url)
const expected = readOracleFixture<{ prim: string, extents: { time: number | null, extent: number[][] }[] }>(
  new URL('expected.json', base))

describe('UsdSkelRoot extent without skinned prims', () => {
  for (const { time, extent } of expected.extents) {
    it(`${expected.prim} at ${time ?? 'default'}`, async () => {
      const stage = (await Stage.open(fileURLToPath(new URL('skeleton.usda', base))))!
      const computed = Boundable.computeExtentFromPlugins(stage.getPrim(expected.prim)!, time ?? undefined)
      expect(computed).not.toBeNull()
      for (let corner = 0; corner < 2; corner++) {
        for (let axis = 0; axis < 3; axis++) {
          // GfVec3f values: float32 relative precision.
          expect(computed![corner]![axis]!).toBeCloseTo(extent[corner]![axis]!, 4)
        }
      }
    })
  }
})
