import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {it,expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {Layer} from 'typescript-usd/sdf'
import {TfErrorMark} from 'typescript-usd/tf'
import native from '../fixtures/openAsAnonymous/expected.json' with {type:'json'}
// A native Tf.ErrorException is the C++ open yielding nothing with the
// errors it posted.
async function posted(open:()=>Promise<Layer|undefined>):Promise<{layer:Layer|undefined,errors:string[]}>{
 const mark=new TfErrorMark()
 try{const layer=await open();const errors=mark.getErrors().map(e=>e.getCommentary());mark.clear();return {layer,errors}}
 finally{mark.dispose()}
}
const source=(name:string)=>fileURLToPath(new URL(`../fixtures/openAsAnonymous/${name}`,import.meta.url))
it.each(native.rows)('matches native OpenAsAnonymous $file metadataOnly=$metadataOnly',async row=>{
 const layer=await Layer.openAsAnonymous(source(row.file),row.metadataOnly,'review.usda')
 expect(layer).toBeDefined()
 expect({anonymous:layer!.isAnonymous(),realPath:layer!.realPath,displayName:layer!.getDisplayName(),format:layer!.getFileFormat()?.formatId,dirty:layer!.isDirty(),streamsData:layer!.streamsData(),rootPrims:[...layer!.getRootPrims()].map(p=>p.getName()),export:layer!.exportToString()}).toEqual(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='file'&&k!=='metadataOnly')))
 expect(Layer.find(layer!.identifier)).toBe(layer)
})
it('matches native absence/errors for empty, missing and anonymous source identities',async()=>{
 expect(await Layer.findOrOpen('')===undefined).toBe(native.emptyIdentifier)
 expect(await Layer.openAsAnonymous(source('missing.usda'))===undefined).toBe(native.missing)
 const anonymous=Layer.createAnonymous()
 const anonymousOpen=await posted(()=>Layer.openAsAnonymous(anonymous.identifier))
 expect(native.anonymousIdentifier.raised).toBe(true)
 expect(anonymousOpen).toEqual({layer:undefined,errors:[native.anonymousIdentifier.commentary!.replace('<anonymous>',anonymous.identifier)]})
})
it.each(native.invalid)('reads only the requested metadata before invalid prim body: $metadataOnly',async row=>{
 if(row.raised){
  const opened=await posted(()=>Layer.openAsAnonymous(source('invalid-body.usda'),row.metadataOnly))
  expect(opened.layer).toBeUndefined();expect(opened.errors.length).toBeGreaterThan(0)
 }
 else {
  const layer=await Layer.openAsAnonymous(source('invalid-body.usda'),row.metadataOnly)
  expect(!!layer).toBe(row.opened);expect(layer?.exportToString()).toBe(row.export)
 }
})
it('reads fresh anonymous layers rather than aliasing the registered source or its unsaved edits',async()=>{
 const sourceLayer=(await Layer.findOrOpen(source('root.usda')))!
 sourceLayer.getPseudoRoot().setInfo('documentation','unsaved source opinion')
 const a=await Layer.openAsAnonymous(source('root.usda')),b=await Layer.openAsAnonymous(source('root.usda'))
 expect(a!.getField('/','documentation')).toBe(native.isolation.documentation)
 expect(sourceLayer.getField('/','documentation')).toBe(native.isolation.sourceDocumentation)
 expect(a!==b).toBe(native.isolation.distinctAnonymous)
 expect(Layer.find(sourceLayer.identifier)===sourceLayer).toBe(native.isolation.sourceStillRegistered)
})

it('uses native empty anonymous format arguments and coding errors for unknown formats',async()=>{
 const layer=await Layer.openAsAnonymous(source('root.usda')+':SDF_FORMAT_ARGS:a=b')
 expect(Object.fromEntries(layer!.getFileFormatArguments())).toEqual(native.formatArguments)
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'anon-format-')),unknown=path.join(directory,'unknown.layer')
 try{
  fs.copyFileSync(source('root.usda'),unknown)
  expect(native.unknownFormat.raised).toBe(true)
  expect(await posted(()=>Layer.openAsAnonymous(unknown))).toEqual({layer:undefined,errors:[native.unknownFormat.commentary!.replace('<unknown>',unknown)]})
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
})
