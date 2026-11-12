// UsdGeomXformable::XformQuery and UsdAttributeQuery, each built once, read
// again after authoring edits: the query reads through its resolve info,
// which re-reads the default (or the samples) from the resolve info's layer
// on every Get (UsdStage::_GetValueFromResolveInfoImpl, stage.cpp:8014-8030),
// so a value edit that is not a resync is seen without rebuilding the query.
// Values captured from native OpenUSD 26.11.1
// (fixtures/xformQueryEdits, FIXTURES.md), not hand-derived.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AttributeQuery, Stage } from 'typescript-usd/usd'
import { XformQuery } from 'typescript-usd/usdGeom'
import expectedFixture from '../fixtures/xformQueryEdits/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
import { _sdfPlainValue } from 'typescript-usd/sdf/_internal'

interface Row {
  step: string
  local: Record<string, Record<string, number[]>>
  translateDefault: number[]
  translateAt5: number[]
}
const expected = oraclePayload(expectedFixture) as { rows: Row[] }
const root = fileURLToPath(new URL('../fixtures/xformQueryEdits/root.usda', import.meta.url))

describe('XformQuery and UsdAttributeQuery after authoring edits', () => {
  it('read the edited values without being rebuilt, as native', async () => {
    const stage = (await Stage.open(root))!
    try {
      const paths = ['/Default', '/Sampled']
      const queries = new Map(paths.map(path => [path, new XformQuery(stage.getPrim(path)!)]))
      const attrQuery = new AttributeQuery(stage.getPrim('/Default')!.getAttr('xformOp:translate')!)
      const edits: Array<() => void> = [
        () => {},
        () => stage.getPrim('/Default')!.getAttr('xformOp:translate')!.set([4, 5, 6]),
        () => stage.getPrim('/Default')!.getAttr('xformOp:rotateZ')!.set(90),
        () => stage.getPrim('/Sampled')!.getAttr('xformOp:translate')!.setTimeSample(10, [0, 20, 0]),
      ]
      expect(expected.rows.length).toBe(edits.length)
      for (const [i, row] of expected.rows.entries()) {
        edits[i]!()
        for (const path of paths) {
          for (const [time, matrix] of Object.entries(row.local[path]!)) {
            const local = queries.get(path)!.getLocalTransformation(Number(time))
            for (let k = 0; k < 16; k++) {
              expect(local[k], `${row.step} ${path} @${time} [${k}]`).toBeCloseTo(matrix[k]!, 12)
            }
          }
        }
        expect(_sdfPlainValue(attrQuery.get()), row.step).toEqual(row.translateDefault)
        expect(_sdfPlainValue(attrQuery.get(5)), row.step).toEqual(row.translateAt5)
      }
    } finally { stage.dispose() }
  })
})
