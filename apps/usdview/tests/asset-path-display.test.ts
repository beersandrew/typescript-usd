import {it,expect} from 'vitest'
import {AssetPath} from 'typescript-usd/sdf'
import {shortStringForValue,scalarToString,arrayEntryToString,pyStr} from '../src/python-format'
import native from './fixtures/usdviewAssetPaths/expected.json'
for(const row of native.cases)it(`formats native resolved asset ${row.name} at ${row.time}`,()=>{
 const make=(path:{authored:string,evaluated:string,resolved:string})=>new AssetPath({authoredPath:path.authored,evaluatedPath:path.evaluated,resolvedPath:path.resolved})
 const value='elements' in row?row.elements!.map(make):make(row as {authored:string,evaluated:string,resolved:string})
 expect(shortStringForValue(value,row.typeName)).toBe(row.short)
 expect(pyStr(value,row.typeName)).toBe(row.copy)
 if('entries' in row)for(const [index,entry] of row.entries!.entries())expect(arrayEntryToString(index,(value as AssetPath[])[index],row.typeName)).toBe(`${index}: ${entry}`)
 else expect(scalarToString(value,row.typeName)).toBe(row.value)
})

import {Stage} from 'typescript-usd/usd'
import {fileURLToPath} from 'node:url'
import {inspectObject} from '../src/inspection'
it('shows native resolver output from actual asset attributes at the current frame',async()=>{
 const here=fileURLToPath(new URL('./fixtures/usdviewAssetPaths/',import.meta.url)).replace(/\/$/,'')
 const stage=(await Stage.open(here+'/stage.usda'))!
 try{
  for(const row of native.cases){
   const snapshot=inspectObject(stage,'/Asset',row.name,row.time)!
   const normalize=(value:string)=>value.replaceAll(here,'$FIXTURE')
   if('entries' in row)expect(snapshot.array!.entries.map(entry=>normalize(entry.value))).toEqual(row.entries)
   else expect(normalize(snapshot.valueText!)).toBe(row.value)
   expect(normalize(snapshot.copyValueText!)).toBe(row.copy)
  }
 }finally{stage.dispose()}
})
