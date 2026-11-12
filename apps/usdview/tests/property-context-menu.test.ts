import {it,expect} from 'vitest'
import {propertyContextMenuItems,targetSelection} from '../src/property-context-menu'
import type {PropertyRole} from '../src/contracts'
import native from './fixtures/usdviewPropertyMenu/expected.json'
const roles:Record<string,PropertyRole>={ATTRIBUTE:'attribute',RELATIONSHIP_WITH_TARGETS:'relationshipWithTargets',ATTRIBUTE_WITH_CONNNECTIONS:'attributeWithConnections'}
for(const row of native.rows)it(`matches native ${row.role} property actions`,()=>{
 const child=row.role==='TARGET'||row.role==='CONNECTION'
 const copied=row.actions.find(action=>action.text==='Copy Property Value')?.copied??row.value
 const items=propertyContextMenuItems({name:row.name,value:row.value,typeName:'double',role:roles[row.role]??'attribute',targets:row.targets},copied,child?[row.name]:undefined)
 expect(items.map(item=>({text:item.text,enabled:item.enabled}))).toEqual(row.actions.map(({text,enabled})=>({text,enabled})))
 for(const [index,action] of row.actions.entries()){
  if('copied' in action)expect(items[index]!.run).toEqual({kind:'copy',text:action.copied})
  if('error' in action)expect(items[index]!.run.kind).toBe('propertyError')
 }
})
it('validates every target before changing native prim/property selection',()=>{
 const objects=new Set(['/A','/A.number','/B','/B.input'])
 const runtime={inspect:(path:string,name?:string)=>objects.has(path+(name?'.'+name:''))?{objectPath:path,metadata:[],layers:[],composition:[],targets:[]}:null}
 for(const row of native.selections){
  if(row.error)expect(()=>targetSelection(runtime,row.paths)).toThrow()
  else expect(targetSelection(runtime,row.paths)).toEqual({prims:row.prims.map(path=>({path})),properties:row.properties})
 }
})
