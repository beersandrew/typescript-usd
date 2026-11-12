// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/testenv/testUsdSkelRoot.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelRoot.py
// (registered as testUsdSkelRoot, DIFF_COMPARE root.computedExtents.usda).
// The testenv input root.usda and baseline/root.computedExtents.usda are
// copied unmodified into fixtures/testUsdSkelRoot (Copyright Pixar,
// TOST 1.0, https://openusd.org/license).
//
// Upstream computes the SkelRoot extent from plugins at every frame and then
// exports the root layer, which must match the baseline (computing extents
// authors nothing). The fixtures/testUsdSkelRoot capture also records the
// extents the pinned native build computes, which the port checks.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { Boundable } from 'typescript-usd/usdGeom'
import '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

const base = new URL('./fixtures/testUsdSkelRoot/', import.meta.url)
const expected = readOracleFixture<{ extents: { time: number, extent: number[][] }[] }>(
  new URL('expected.json', base))

describe('testUsdSkelRoot', () => {
  it('test_ComputeExtentPlugin', async () => {
    const stage = (await Stage.open(fileURLToPath(new URL('root.usda', base))))!
    const root = stage.getPrim('/Root')!

    const computed: { time: number, extent: number[][] | null }[] = []
    for (let time = Math.trunc(stage.startTimeCode!); time <= Math.trunc(stage.endTimeCode!); time++) {
      computed.push({ time, extent: Boundable.computeExtentFromPlugins(root, time) })
    }

    // DIFF_COMPARE: the exported root layer matches the baseline.
    const baseline = Layer.createAnonymous('.usda')
    baseline.importFromString(readFileSync(new URL('baseline/root.computedExtents.usda', base), 'utf8'))
    expect(stage.getRootLayer().exportToString()).toBe(baseline.exportToString())

    // The native extents.
    expect(computed.map(c => c.time)).toEqual(expected.extents.map(e => e.time))
    for (let i = 0; i < computed.length; i++) {
      const extent = computed[i]!.extent
      expect(extent, `time ${computed[i]!.time}`).not.toBeNull()
      for (let corner = 0; corner < 2; corner++) {
        for (let axis = 0; axis < 3; axis++) {
          expect(extent![corner]![axis]!, `time ${computed[i]!.time}`)
            .toBeCloseTo(expected.extents[i]!.extent[corner]![axis]!, 4)
        }
      }
    }
  })
})
