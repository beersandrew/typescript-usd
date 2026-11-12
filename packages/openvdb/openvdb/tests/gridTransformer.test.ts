// tools/GridTransformer.ts resampleToMatchBox against native OpenVDB 10.1.0
// openvdb::tools::resampleToMatch<BoxSampler>, captured from the OpenUSD
// 26.11.1 reference build (FIXTURES.md). The output grid is built as
// hioOpenVDB/vdbTextureData.cpp:544-560 builds it: transform
// createLinearTransform(diag(s, s, s, 1) * A), A the input grid's affine
// matrix. Expectations are the native serial run (TBB limited to one
// thread); native threaded runs keep the same active topology but vary from
// run to run in voxel values where input leaves overlap (see the divergence
// notes in src/tools/GridTransformer.ts).

import { describe, expect, it } from 'vitest'
import { Transform, VdbGrid, copyToDense, mat4Mul, resampleToMatchBox } from '../src/index.ts'
import { bboxJson, expected, fnv1a64, readGrid, sampleBits } from './fixtureSupport.ts'

describe('resampleToMatch<BoxSampler> (OpenVDB 10.1.0 tools/GridTransformer.h)', () => {
  for (const [file, grids] of Object.entries(expected.files)) {
    for (const g of grids) {
      for (const r of g.resampled) {
        const gap = g.class === 'level set' ? ' (known gap: level-set rebuild, tools/LevelSetRebuild.h, is not ported)' : ''
        it(`${file} ${g.name} scaled by ${r.scale}: transform, topology and dense values match native${gap}`, async () => {
          const grid = await readGrid(file, g.name)
          const A = grid.transform!.baseMap.getAffineMap().mat4
          const s = r.scale
          const M = mat4Mul([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1], A)
          expect(M).toEqual(r.matrix)

          const transform = Transform.createLinearTransform(M)
          expect(transform.mapType()).toBe(r.mapType)
          expect(transform.baseMap.getAffineMap().mat4).toEqual(r.mat4)

          const out = VdbGrid.create(grid.type, grid.tree.comps, undefined, transform)
          resampleToMatchBox(grid, out)

          const bbox = out.evalActiveVoxelBoundingBox()
          expect(bboxJson(bbox)).toEqual(r.bbox)
          expect(out.activeVoxelCount()).toBe(r.activeVoxelCount)
          expect(out.tree.leafCount()).toBe(r.leafCount)
          const dense = copyToDense(out.tree, bbox)
          const d = r.dense!
          expect(sampleBits(dense, out.tree.comps, d.samples.map((x) => x.offset))).toEqual(d.samples.map((x) => x.bits))
          expect(fnv1a64(dense)).toBe(d.fnv1a64)
        })
      }
    }
  }
})
