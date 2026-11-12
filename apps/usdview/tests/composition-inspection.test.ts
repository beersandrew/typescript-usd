// @vitest-environment jsdom
import { expect,it } from 'vitest'
import { resolve } from 'node:path'
import { Stage } from 'typescript-usd/usd'
import { inspectCompositionTree,renderCompositionTree,type CompositionNode,type CompositionLayer } from '../src/composition-inspection'
import expected from './fixtures/composition-inspection/expected-cached.json'
import nativeView from './fixtures/composition-inspection/expected-view.json'
const open=()=>Stage.open(resolve('tests/fixtures/composition-inspection/root.usda')).then(value => value!)
function comparableLayer(layer:CompositionLayer|null):unknown {
 return layer?{label:layer.label,hasSpec:layer.hasSpec,offset:layer.offset,scale:layer.scale,children:layer.children.map(comparableLayer)}:null
}
function comparable(node:CompositionNode):unknown {
 return {...node,layerTree:comparableLayer(node.layerTree),children:node.children.map(comparable)}
}
it('matches native26.11 cached hierarchy, nested sublayer/spec presence and offsets for reference, variant and instance proxy paths',async()=>{
 const stage=await open()
 try {for(const [path,row] of Object.entries(expected.rows))expect(comparable(inspectCompositionTree(stage,path).root!)).toEqual(row)}finally{stage.dispose()}
})
it('renders the actual native composition tree columns, hierarchy, expansion and spec colours',async()=>{
 const stage=await open()
 try {for(const [path,rows]of Object.entries(nativeView.rows)){
  const host=document.createElement('div');renderCompositionTree(host,inspectCompositionTree(stage,path))
  expect([...host.querySelectorAll('th')].map(cell=>cell.textContent)).toEqual(nativeView.headers)
  const actual=[...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(row=>({text:[...row.cells].map(cell=>cell.textContent),depth:Number(row.dataset.depth),expanded:row.dataset.expanded==='true',dimmed:row.classList.contains('dimmed'),layer:row.cells[0]!.textContent,path:row.dataset.specPath??null}))
  expect(actual).toEqual(rows)
  expect(host.querySelector('details,summary,p,h3,.composition-spec-details')).toBeNull()
  expect(host.querySelectorAll('tbody tr[hidden]')).toHaveLength(0)
 }}finally{stage.dispose()}
})
it('matches native tree keyboard navigation and keeps source selection local and read-only',async()=>{
 const stage=await open()
 try {
  const before=stage.getSessionLayer().exportToString(),host=document.createElement('div');document.body.append(host)
  renderCompositionTree(host,inspectCompositionTree(stage,'/World/Model'))
  const table=host.querySelector<HTMLTableElement>('table')!;host.querySelector<HTMLTableRowElement>('tbody tr')!.click()
  for(const step of nativeView.keys){
   table.dispatchEvent(new KeyboardEvent('keydown',{key:'Arrow'+step.key,bubbles:true,cancelable:true}))
   const row=host.querySelector<HTMLTableRowElement>('tr.selected')!
   expect([...row.cells].map(cell=>cell.textContent)).toEqual(step.text)
   expect(row.dataset.expanded==='true').toBe(step.expanded)
   expect(row.cells[0]!.textContent).toBe(step.currentLayer)
   expect(row.dataset.specPath??null).toBe(step.currentSpec)
  }
  const reference=[...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].find(row=>row.cells[1]!.textContent==='reference')!
  reference.click();expect(reference.getAttribute('aria-selected')).toBe('true')
  expect(host.querySelector('[data-target-prim]')).toBeNull();expect(host.querySelector('.composition-spec-details')).toBeNull()
  expect(stage.getSessionLayer().exportToString()).toBe(before);expect(inspectCompositionTree(stage,'/Missing').root).toBeNull();host.remove()
 }finally{stage.dispose()}
})
it('collapses only descendants and leaves the empty native tree headers available',async()=>{
 const stage=await open()
 try {
  const host=document.createElement('div');renderCompositionTree(host,inspectCompositionTree(stage,'/World/Model'))
  const toggle=host.querySelector<HTMLButtonElement>('.composition-toggle')!;toggle.click()
  const rows=[...host.querySelectorAll<HTMLTableRowElement>('tbody tr')]
  expect(rows[0]!.hidden).toBe(false);expect(rows.slice(1).every(row=>row.hidden)).toBe(true)
  toggle.click();expect(rows.every(row=>!row.hidden)).toBe(true)
  host.replaceChildren();renderCompositionTree(host,inspectCompositionTree(stage,'/Missing'))
  expect([...host.querySelectorAll('th')].map(cell=>cell.textContent)).toEqual(nativeView.headers);expect(host.querySelector('tbody tr')).toBeNull()
 }finally{stage.dispose()}
})
