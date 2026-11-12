// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {resolve} from 'node:path'
import {viewerStyles} from '../src/viewer-styles'
import {Stage} from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import 'typescript-usd/usdShade'
import {inspectObject} from '../src/inspection'
import {renderInspection} from '../src/inspector-view'
import expected from './fixtures/layer-stack-inspection/expected.json'

// Native SdfSchema iterates TfHashMap (schema.cpp:230-241). Dictionary
// order has no semantic contract; compare complete top-level fields while
// retaining exact strings for every key/value and every other table cell.
function metadataFields(text:string):string[]{
 let depth=0,start=1;const fields:string[]=[]
 for(let i=1;i<text.length-1;i++){
  if('{[('.includes(text[i]!))depth++
  if('}])'.includes(text[i]!))depth--
  if(text[i]===','&&depth===0){fields.push(text.slice(start,i).trim());start=i+1}
 }
 if(text.length>2)fields.push(text.slice(start,-1).trim())
 return fields.sort()
}
for(const native of expected.rows)it(`native Layer Stack: ${native.fixture} ${native.path} ${native.property??''} muted=${native.muted} samples=${native.sessionSamples} edits=${native.targetEdits}`,async()=>{
 const stage=(await Stage.open(resolve(`tests/fixtures/${native.fixture}/root.usda`)))!
 try{
  if(native.muted)await stage.muteLayer(resolve(`tests/fixtures/${native.fixture}/weak.usda`))
  if(native.sessionSamples){stage.setEditTarget(stage.getSessionLayer());for(let t=0;t<native.sessionSamples;t++)stage.getPrim('/World')!.getAttr('single')!.setTimeSample(t,t);await stage.flushChanges()}
  if(native.targetEdits){stage.getRootLayer().setField('/World.target','targetPaths',{isExplicit:false,explicitItems:[],prependedItems:['/Before'],appendedItems:['/After'],deletedItems:['/Old'],orderedItems:['/After','/Before']});await stage.flushChanges()}
  const snapshot=inspectObject(stage,native.path,native.property??undefined,native.time)!
  const view=snapshot.layerStackView!
  expect(view.headers).toEqual(native.headers)
  expect(view.hidden).toEqual(native.hidden)
  expect(view.rows.map(row=>[row.layer,row.offset,native.path==='/'?null:row.path])).toEqual(native.rows.map(row=>row.text.slice(0,3)))
  expect(view.rows.map(row=>native.path==='/'?null:view.headers[3]==='Metadata'?metadataFields(row.value):row.value)).toEqual(native.rows.map(row=>native.path==='/'?null:native.headers[3]==='Metadata'?metadataFields(row.text[3]!):row.text[3]))
  const host=document.createElement('section');renderInspection(host,snapshot,'layers')
  const grid=host.querySelector('table')!
  expect([...grid.tHead!.rows[0]!.cells].map(cell=>[cell.textContent,cell.hidden])).toEqual(native.headers.map((label,index)=>[label,native.hidden[index]]))
  expect(grid.tBodies[0]!.rows).toHaveLength(native.rows.length)
  expect([...grid.tBodies[0]!.rows].map(row=>row.classList.contains('muted'))).toEqual(native.rows.map(row=>row.colors[0]?.[0]===151))
  expect(host.querySelectorAll('p,details,summary')).toHaveLength(0)
  expect([...grid.tBodies[0]!.rows].map(row=>[...row.cells].map(cell=>cell.dataset.valueSource==='samples'?[177,207,153]:cell.dataset.valueSource==='default'?[135,206,250]:null))).toEqual(native.rows.map(row=>row.colors.map((color,index)=>index===3?color:null)))
 }finally{stage.dispose()}
})

it('uses native fixed rows, single-line contents and white key cells in the actual pane selector scope',async()=>{
 const stage=(await Stage.open(resolve('tests/fixtures/inspection-samples/root.usda')))!
 const style=document.createElement('style');style.textContent=viewerStyles;document.head.append(style)
 const host=document.createElement('section');host.className='property-content';document.body.append(host)
 try{
  renderInspection(host,inspectObject(stage,'/World','weight',12)!,'layers')
  const cells=Array.from(host.querySelectorAll('tbody tr:first-child td'))
  expect(cells.map(cell=>getComputedStyle(cell).color)).toEqual([expected.paletteText,expected.paletteText,expected.paletteText,[177,207,153]].map(rgb=>`rgb(${rgb.join(', ')})`))
  expect(cells.map(cell=>getComputedStyle(cell).whiteSpace)).toEqual(cells.map(()=>'pre'))
  expect(cells.map(cell=>getComputedStyle(cell).height)).toEqual(cells.map(()=>'30px'))
 }finally{host.remove();style.remove();stage.dispose()}
})
