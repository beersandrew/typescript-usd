// tools/Dense.ts copyToDense against native OpenVDB 10.1.0
// openvdb::tools::copyToDense into a Dense<ValueT, LayoutXYZ> over each
// grid's evalActiveVoxelBoundingBox (as hioOpenVDB/vdbTextureData.cpp does),
// captured from the OpenUSD 26.11.1 reference build (FIXTURES.md). Exact: FNV-1a 64
// of the float32 bytes and sampled values' bits.

import { describe, expect, it } from 'vitest'
import { copyToDense } from '../src/index.ts'
import { bboxJson, expected, fnv1a64, readGrid, sampleBits } from './fixtureSupport.ts'

describe('copyToDense (OpenVDB 10.1.0 tools/Dense.h, LayoutXYZ)', () => {
  for (const [file, grids] of Object.entries(expected.files)) {
    for (const g of grids) {
      it(`${file} ${g.name}: active bbox, voxel count and dense copy match native`, async () => {
        const grid = await readGrid(file, g.name)
        expect(grid.getGridClass() === 1 ? 'level set' : grid.getGridClass() === 2 ? 'fog volume' : 'unknown').toBe(g.class)
        expect(grid.transform!.mapType()).toBe(g.mapType)
        expect(grid.transform!.baseMap.getAffineMap().mat4).toEqual(g.mat4)
        const bbox = grid.evalActiveVoxelBoundingBox()
        expect(bboxJson(bbox)).toEqual(g.bbox)
        expect(grid.activeVoxelCount()).toBe(g.activeVoxelCount)
        expect(grid.tree.leafCount()).toBe(g.leafCount)
        const dense = copyToDense(grid.tree, bbox)
        const d = g.dense!
        expect(dense.length).toBe(d.dim[0] * d.dim[1] * d.dim[2] * grid.tree.comps)
        expect(sampleBits(dense, grid.tree.comps, d.samples.map((s) => s.offset))).toEqual(d.samples.map((s) => s.bits))
        expect(fnv1a64(dense)).toBe(d.fnv1a64)
      })
    }
  }

  it('an empty bbox gives an empty array', async () => {
    const grid = await readGrid('densityAndHeat.vdb', 'heat')
    expect(copyToDense(grid.tree, { min: [1, 0, 0], max: [0, 0, 0] }).length).toBe(0)
  })

})
