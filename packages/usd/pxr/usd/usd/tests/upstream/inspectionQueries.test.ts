// Native OpenUSD26.11 queries, fixture in fixtures/inspectionQueries (FIXTURES.md).
import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {basename} from 'node:path'
import {Stage} from 'typescript-usd/usd'
import {ArcType, type PrimIndex, type NodeRef} from 'typescript-usd/pcp'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const fixture=new URL('./fixtures/inspectionQueries/',import.meta.url)
const native=readOracleFixture(new URL('expected.json',fixture))
const arcNames:Record<number,string>={[ArcType.Root]:'root',[ArcType.Inherit]:'inherit',[ArcType.Variant]:'variant',[ArcType.Reference]:'reference',[ArcType.Payload]:'payload',[ArcType.Relocate]:'relocate',[ArcType.Specialize]:'specialize'}
const open=(name='root.usda')=>Stage.open(fileURLToPath(new URL(name,fixture))).then(value => value!)
function node(n:NodeRef):unknown{return {arc:arcNames[n.getArcType()],path:n.getPath().pathString,layer:basename(n.getLayerStack().identifier.rootLayer.filePath),contributes:n.canContributeSpecs(),children:n.getChildren().map(node)}}
function snapshot(index:PrimIndex){return {valid:index.isValid(),path:index.isValid()?index.getRootNode().getPath().pathString:'',nodes:index.isValid()?index.getRootNode().getChildren().map(node):[]}}

it('exposes cached prim indices and complete variant selections for ordinary, instance and proxy prims',async()=>{
 const stage=await open()
 try{
  for(const [path,row] of Object.entries(native.rows) as [string,any][]){
   const p=stage.getPrim(path)!;expect(p).toBeDefined()
   expect(snapshot(p.getPrimIndex())).toEqual(row.cached)
   expect(p.getPrimIndex()).toBe(p.getPrimIndex())
   expect(snapshot(p.computeExpandedPrimIndex())).toEqual(row.expanded)
   expect(stage.getVariantSets(path).getAllVariantSelections()).toEqual(row.variants)
   expect(p.getInherits().getAllDirectInherits()).toEqual(row.inherits)
  }
  expect(snapshot(stage.getPrim('/World/Instance')!.getPrototype()!.getPrimIndex())).toEqual(native.prototype)
 }finally{stage.dispose()}
})
it('keeps held cached-index snapshots valid across a composition update',async()=>{
 const stage=await open()
 try{
  const held=stage.getPrim('/World/Model')!.getPrimIndex();expect(snapshot(held)).toEqual(native.change.before)
  await stage.getVariantSets('/World/Model').getVariantSet('look').setVariantSelection('B')
  expect(snapshot(held)).toEqual(native.change.retainedAfter)
  expect(snapshot(stage.getPrim('/World/Model')!.getPrimIndex())).toEqual(native.change.after)
  expect(stage.getVariantSets('/World/Model').getAllVariantSelections()).toEqual(native.change.variants)
 }finally{stage.dispose()}
})
it('enumerates native direct inherits across referenced and specialized classes, excluding ancestral inherits',async()=>{
 const stage=await open('inherits.usda')
 try{for(const [path,paths] of Object.entries(native.directInherits))expect(stage.getPrim(path)!.getInherits().getAllDirectInherits()).toEqual(paths)}finally{stage.dispose()}
})
