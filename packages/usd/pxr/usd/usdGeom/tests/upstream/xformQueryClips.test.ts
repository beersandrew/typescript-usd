// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformOp.h,
//  pxr/usd/usdGeom/xformable.cpp, pxr/usdImaging/usdImaging/dataSourcePrim.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomXformable::XformQuery and UsdGeomXformCache on xform ops held by
// value clips, time samples and defaults: whether the transform might vary
// (TransformMightBeTimeVarying, xformable.cpp:742-794, through each op's
// MightBeTimeVarying, xformOp.h:319-320, 593-605, i.e.
// UsdStage::_ValueMightBeTimeVaryingFromResolveInfo, stage.cpp:9735-9800)
// and the local transformation. UsdImaging flags an xform as time-varying
// from this answer (dataSourcePrim.cpp:478-489), so it decides which prims a
// time change dirties. Values captured from native OpenUSD 26.11.1
// (fixtures/xformQueryClips, FIXTURES.md), not hand-derived.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { XformCache, XformQuery } from 'typescript-usd/usdGeom'
import expectedFixture from '../fixtures/xformQueryClips/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'

interface Row { path: string, transformMightBeTimeVarying: boolean, opsMightBeTimeVarying: boolean[], local: Record<string, number[][]> }
const expected = oraclePayload(expectedFixture) as { rows: Row[] }
const root = fileURLToPath(new URL('../fixtures/xformQueryClips/root.usda', import.meta.url))

describe('XformQuery over value clips', () => {
  it('answers TransformMightBeTimeVarying as native', async () => {
    const stage = (await Stage.open(root))!
    try {
      for (const row of expected.rows) {
        const prim = stage.getPrim(row.path)!
        expect(new XformQuery(prim).transformMightBeTimeVarying(), row.path).toBe(row.transformMightBeTimeVarying)
        expect(new XformCache(stage, 0).transformMightBeTimeVarying(row.path), row.path).toBe(row.transformMightBeTimeVarying)
        expect(prim.getAttr('xformOp:translate')!.valueMightBeTimeVarying(), row.path).toBe(row.opsMightBeTimeVarying[0])
      }
    } finally { stage.dispose() }
  })

  it('gives the native local transformation', async () => {
    const stage = (await Stage.open(root))!
    try {
      for (const row of expected.rows) {
        const query = new XformQuery(stage.getPrim(row.path)!)
        for (const [time, matrix] of Object.entries(row.local)) {
          expect(query.getLocalTransformation(Number(time)), `${row.path} @${time}`).toEqual(matrix.flat())
        }
      }
    } finally { stage.dispose() }
  })
})
