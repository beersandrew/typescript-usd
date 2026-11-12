import {beforeAll,afterAll,it,expect} from 'vitest'
import {Stage} from 'typescript-usd/usd'
import {fileURLToPath} from 'node:url'
import {primTree} from '../src/prim-tree'
import {defaultPrimTreeSettings,filterPrimTree,removeCategorySelection} from '../src/prim-tree-settings'
import {initialExpansion} from '../src/prim-tree-view'
import {primLabel} from '../src/usdview-style'
import type {PrimSummary} from '../src/contracts'
import native from './fixtures/usdviewPrimTree/expected.json'
let stage:Stage
beforeAll(async()=>{stage=(await Stage.open(fileURLToPath(new URL('./fixtures/usdviewPrimTree/stage.usda',import.meta.url))))!})
afterAll(()=>stage.dispose())
it('uses native Show menu defaults',()=>expect(defaultPrimTreeSettings()).toEqual(native.defaults))
for(const [index,row] of native.cases.entries())it(`filters native prim categories and display names ${index}`,()=>{
 const root=filterPrimTree(primTree(stage,0,true),row.settings)
 const flatten=(prim:PrimSummary):{path:string,label:string}[]=>[{path:prim.path,label:row.settings.showPrimDisplayNames?primLabel(prim):prim.name},...prim.children.flatMap(flatten)]
 expect(flatten(root)).toEqual(row.rows)
 // Filtering the view must leave hidden prims available in the actual stage.
 expect(stage.getPrim('/World/Undefined')).toBeTruthy()
 expect(stage.getPrim('/World/Abstract')).toBeTruthy()
})
for(const row of native.removals)it(`native ${row.key}=${row.checked} removes that category from selection`,()=>{
 expect(removeCategorySelection(primTree(stage,0,true),row.initial,row.key as keyof ReturnType<typeof defaultPrimTreeSettings>)).toEqual(row.selected)
})
const root:PrimSummary={path:'/',name:'root',typeName:'',children:[]}
let parent=root
for(let level=1;level<=10;level++){
 const node:PrimSummary={path:parent.path.replace(/\/$/,'')+'/L'+level,name:'L'+level,typeName:'Scope',children:[]}
 parent.children.push(node);parent=node
}
for(const row of native.depths)it(`uses native Qt expansion for depth ${row.depth}`,()=>{
 expect([...initialExpansion(root,row.depth)]).toEqual(row.expanded)
})
