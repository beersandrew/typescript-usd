// Captured from OpenUSD v26.11.1 into fixtures/metadataInspection (FIXTURES.md).
// Source revision, schema hash and fixture hashes are committed in expected.json.
import {it,expect} from 'vitest'
import {Stage} from '../../src/index.ts'
import '../../../usdGeom/src/index.ts'
import '../../../usdShade/src/index.ts'
import {fileURLToPath} from 'node:url'
import expectedFixture from './metadataInspection/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)
function plain(value:unknown):unknown {
 if(value===undefined)return null
 if(Array.isArray(value))return value.map(plain)
 if(value&&typeof value==='object'){
  const v=value as Record<string,any>
  if('isExplicit' in v&&'prependedItems' in v)return {explicit:v.isExplicit,items:(v.isExplicit?v.explicitItems:[...v.prependedItems,...v.appendedItems]).map(plain)}
  if('assetPath' in v&&'primPath' in v)return {assetPath:v.assetPath,primPath:v.primPath,offset:v.layerOffset.offset,scale:v.layerOffset.scale}
  if(v.toArray)return v.toArray()
  return Object.fromEntries(Object.entries(v).map(([k,v])=>[k,plain(v)]))
 }
 return value
}
it('matches native metadata enumeration, private-field direct queries and schema fallback dictionaries',async()=>{
 const s=(await Stage.open(fileURLToPath(new URL('./metadataInspection/root.usda',import.meta.url))))!
 try{
  for(const row of expected.rows){
   const p=s.getPrim(row.path)!,o=row.property?p.getAttr(row.property)!:p
   if('sessionTargetHasAuthoredDocumentation' in row){s.setEditTarget(s.getSessionLayer());expect(o.hasAuthoredMetadata('documentation')).toBe(row.sessionTargetHasAuthoredDocumentation);continue}
   expect(plain(o.getAllMetadata()),row.path+'.'+row.property+' all').toEqual(row.all)
   expect(plain(o.getAllAuthoredMetadata()),row.path+'.'+row.property+' authored').toEqual(row.authored)
   for(const [field,values] of Object.entries(row.fields!)){
    expect(plain(o.getMetadata(field)),row.path+'.'+row.property+' '+field).toEqual(values.value)
    expect(o.hasAuthoredMetadata(field),row.path+'.'+row.property+' authored '+field).toBe(values.hasAuthored)
   }
  }
 }finally{s.dispose()}
})
