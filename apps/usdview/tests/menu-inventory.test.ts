// @vitest-environment jsdom
import {describe,it,expect} from 'vitest'
import native from './fixtures/menu-parity/native/menus.json' with {type:'json'}
import {shortcutLabel} from '../src/shortcuts'
import {UsdViewerElement} from '../src/usd-viewer'
// The actual Qt QAction tree is the expected inventory, including dynamically
// inserted Show/Columns and Hydra options. File is an explicit web exception.
type Row={text:string,separator?:boolean,children?:Row[],shortcuts?:string[]}
function expected(rows:Row[]):Row[]{return rows.map(r=>r.separator?{text:'',separator:true}:{text:r.text,...(r.children?.length?{children:expected(r.children)}:{})})}
function text(element:Element):string{const clone=element.cloneNode(true) as Element;clone.querySelectorAll('kbd,input').forEach(x=>x.remove());return clone.textContent!.trim()}
function actual(popup:Element):Row[]{return [...popup.children].filter(x=>!x.hasAttribute('hidden')).map(x=>{
 if(x.tagName==='HR')return {text:'',separator:true}
 if(x.tagName==='DETAILS'){const children=actual(x.querySelector(':scope>.menu-popup')!);return {text:text(x.querySelector(':scope>summary')!),...(children.length?{children}:{})}}
 return {text:text(x)}
})}
const menus={menuEdit:'.edit-menu',menuWindow:'.window-menu',menuNavigation:'.navigation-menu',menuShow:'.hierarchy .panel-menubar>.menu:last-child',menuRender:'.renderer-menu',menuViewer:'.display-menu',menuPick:'.select-menu',menuCamera:'.camera-menu',menuLights:'.lights-menu'} as const
if(!customElements.get('usd-viewer'))customElements.define('usd-viewer',UsdViewerElement)
describe('complete pinned native menu inventory and hierarchy',()=>{
 for(const [key,selector] of Object.entries(menus))it(`${native.menus[key as keyof typeof native.menus].title}: exact action order, separators and nesting`,()=>{
  const viewer=document.createElement('usd-viewer'),root=viewer.shadowRoot!
  expect(actual(root.querySelector(selector+'>.menu-popup')!)).toEqual(expected(native.menus[key as keyof typeof native.menus].items))
 })
 it('matches every native primary shortcut label in the non-File menus',()=>{
  const root=document.createElement('usd-viewer').shadowRoot!
  const check=(rows:Row[],popup:Element)=>{
   const elements=[...popup.children].filter(x=>!x.hasAttribute('hidden'))
   for(const [i,row]of rows.entries()){
    const element=elements[i]!
    if(row.shortcuts?.length)expect(element.querySelector('kbd')?.textContent).toBe(shortcutLabel(row.shortcuts[0]!))
    if(row.children?.length)check(row.children,element.querySelector(':scope>.menu-popup')!)
   }
  }
  for(const [key,selector]of Object.entries(menus))check(native.menus[key as keyof typeof native.menus].items,root.querySelector(selector+'>.menu-popup')!)
 })
 it('retains only the explicit File/web adaptation and removes the extra Show action',()=>{
  const root=document.createElement('usd-viewer').shadowRoot!
  expect(actual(root.querySelector('.file-popup')!).map(x=>x.text)).toEqual(['Open','Reopen Stage','Reload All Layers','Close Stage','','Save Overrides As...','Save Flattened As...'])
  expect(root.querySelector('.hierarchy .composition-open')).toBeNull()
  expect(root.querySelector('.display-menu .show-axes')).toBeNull()
 })
 it('keeps unavailable renderer features visibly disabled with a reason',()=>{
  const root=document.createElement('usd-viewer').shadowRoot!
  for(const label of ['GPU stats','Auto Compute Clipping Planes','disabled','openColorIO']){
   const control=[...root.querySelectorAll('label')].find(x=>text(x)===label)!
   expect(control.querySelector('input')!.disabled).toBe(true)
   expect(control.title||control.querySelector('input')!.title).not.toBe('')
  }
 })
})
