import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { HdsiLegacyDisplayStyleOverrideSceneIndex } from '../../src/legacyDisplayStyleOverrideSceneIndex.ts'
import { HdRetainedSceneIndex } from '../../../hd/src/retainedSceneIndex.ts'
import { HdContainerDataSource, HdRetainedContainerDataSource as C, HdRetainedTypedSampledDataSource as V, HdSampledDataSource } from '../../../hd/src/dataSource.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const expected = readOracleFixture(new URL('./fixtures/displayStyle/expected.json', import.meta.url))
it('matches native fallback, authored precedence and clearing', () => {
 const input = HdRetainedSceneIndex.new()
 input.addPrims([{primPath:'/Mesh',primType:'mesh',dataSource:C.new([],[])},{primPath:'/Authored',primType:'mesh',dataSource:C.new(['displayStyle'],[C.new(['refineLevel'],[V.new(0)])])}])
 const si = HdsiLegacyDisplayStyleOverrideSceneIndex.new(input)
 const get = (p:string) => ((si.getPrim(p).dataSource?.Get('displayStyle') as HdContainerDataSource)?.Get('refineLevel') as HdSampledDataSource)?.GetValue(0) ?? -1
 expect(get('/Mesh')).toBe(expected.unset)
 si.setRefineLevelFallback(2)
 expect(get('/Mesh')).toBe(expected.fallback)
 expect(get('/Authored')).toBe(expected.authoredWins)
 si.setRefineLevelFallback(undefined)
 expect(get('/Mesh')).toBe(expected.cleared)
 si.destroy()
})
