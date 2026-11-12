// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {resolve} from 'node:path'
import {Stage} from 'typescript-usd/usd'
import {inspectObject} from '../src/inspection'
import {renderInspection} from '../src/inspector-view'
import native from './fixtures/usdviewMetadataUi/expected.json'
it('matches the pinned native root metadata table without extra heading, prose or source columns',async()=>{
 const stage=(await Stage.open(resolve('tests/fixtures/usdviewMetadataUi/root.usda')))!
 try {
  const host=document.createElement('section')
  renderInspection(host,inspectObject(stage,'/',undefined,0,{includeMetadataDetails:true})!,'metadata')
  expect([...host.querySelectorAll('thead th')].map(e=>e.textContent)).toEqual(native.columns)
  expect([...host.querySelectorAll('tbody tr')].map(row=>[...row.children].map(e=>e.textContent))).toEqual(native.rows)
  expect(host.querySelector('.inspection-path')).toBeNull()
  expect(host.querySelector('p')).toBeNull()
  expect(host.querySelector('table')!.classList.contains('metadata-table')).toBe(true)
 }finally{stage.dispose()}
})
