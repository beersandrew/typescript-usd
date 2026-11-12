// @vitest-environment jsdom
// Controller/DOM checks; native action text/order comes from the pinned UI capture.
import {afterEach,beforeAll,expect,it,vi} from 'vitest'
import {defineUsdViewer,type UsdViewerElement} from '../src/usd-viewer'
import type {ViewerRuntime} from '../src/contracts'
import native from './fixtures/file-menu/expected.json'
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const tree=[{path:'/World',name:'World',typeName:'Xform',children:[]}]
const adapter=():ViewerRuntime=>({open:vi.fn().mockResolvedValue(tree),openFile:vi.fn().mockResolvedValue(tree),openFiles:vi.fn().mockResolvedValue(tree),frameSelection:vi.fn(),select:vi.fn(path=>({path,properties:[]})),resize:vi.fn(),dispose:vi.fn(),refreshScene:vi.fn().mockResolvedValue({tree,selection:{path:null,properties:[]}})})
function setup(runtime=adapter()){
 const viewer=document.createElement('usd-viewer') as UsdViewerElement;viewer.runtimeFactory=async()=>runtime;viewer.src='/fixture.usda';document.body.append(viewer)
 return {viewer,runtime,root:viewer.shadowRoot!}
}
const q=<T extends Element=HTMLElement>(root:ShadowRoot,selector:string)=>root.querySelector<T>(selector)!
const show=(root:ShadowRoot)=>q<HTMLButtonElement>(root,'.open-scene').click()
const escape=(root:ShadowRoot)=>q(root,'.open-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true,cancelable:true}))
beforeAll(()=>{defineUsdViewer();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})})
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks()})
// File > Close Stage is the one web-only File action (back to the welcome page);
// it follows Reload All Layers. Everything else is usdview's.
const withCloseStage=(items:unknown[])=>{const i=items.findIndex(x=>(x as {text?:string}).text==='Reload All Layers');return [...items.slice(0,i+1),{text:'Close Stage',shortcut:null},...items.slice(i+1)]}
it('shows exactly the five pinned native File actions in native order, plus Close Stage',async()=>{
 const {root}=setup();await tick()
 expect([...root.querySelectorAll('.file-popup>button,.file-popup>hr')].map(e=>e.tagName==='HR'?{separator:true}:{text:e.firstChild!.textContent,shortcut:({Open:'Ctrl+O','Reopen Stage':'Ctrl+Shift+R','Reload All Layers':'Ctrl+R'} as Record<string,string>)[e.firstChild!.textContent!]??null})).toEqual(withCloseStage(native.items))
 expect(root.querySelector('.file-popup input,.file-popup form,.file-popup p,.file-popup select')).toBeNull()
 expect(q<HTMLButtonElement>(root,'.save-session').hidden).toBe(true)
})
it('opens from File, focuses an available chooser, and Escape restores the File summary',async()=>{
 const {root}=setup();await tick();const menu=q<HTMLDetailsElement>(root,'.file-menu');menu.open=true;q(root,'.open-scene').focus();show(root)
 expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(true);expect(menu.open).toBe(false);expect(root.activeElement).toBe(q(root,'.local-file'))
 escape(root);expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(false);expect(root.activeElement).toBe(q(root,'.file-menu>summary'))
})
it('keyboard Open reaches the same dialog, keeps typing local, and restores canvas focus',async()=>{
 const {root}=setup();await tick();const canvas=q(root,'canvas');canvas.focus()
 const open=new KeyboardEvent('keydown',{key:'o',code:'KeyO',ctrlKey:true,bubbles:true,composed:true,cancelable:true});canvas.dispatchEvent(open)
 expect(open.defaultPrevented).toBe(true);expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(true)
 const url=q<HTMLInputElement>(root,'.url');url.focus();url.dispatchEvent(new KeyboardEvent('keydown',{key:'f',code:'KeyF',bubbles:true,composed:true}));expect(root.activeElement).toBe(url)
 escape(root);expect(root.activeElement).toBe(canvas)
})
it('retains disabled local capabilities and falls back to the URL field',async()=>{
 const runtime=adapter();delete runtime.openFile;delete runtime.openFiles
 const {root}=setup(runtime);await tick();show(root)
 for(const selector of ['.local-file','.local-files','.local-folder'])expect(q<HTMLInputElement>(root,selector).disabled).toBe(true)
 expect(root.activeElement).toBe(q(root,'.url'))
})
it('keeps multi-root selection in the dialog and clears it on Escape',async()=>{
 const {root,runtime}=setup();await tick();show(root)
 const input=q<HTMLInputElement>(root,'.local-files');Object.defineProperty(input,'files',{value:[new File([''],'a.usda'),new File([''],'b.usda')]});input.dispatchEvent(new Event('change',{bubbles:true}));await tick()
 expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(true);expect(q<HTMLElement>(root,'.local-root-form').hidden).toBe(false);expect(root.activeElement).toBe(q(root,'.local-root'));expect(q<HTMLButtonElement>(root,'.open-local-root').disabled).toBe(true)
 escape(root);expect(q<HTMLElement>(root,'.local-root-form').hidden).toBe(true);expect(runtime.openFiles).not.toHaveBeenCalled();show(root);expect(q<HTMLElement>(root,'.local-root-form').hidden).toBe(true)
})
it('URL and example choices load unchanged and close the same opening dialog',async()=>{
 const {root,runtime,viewer}=setup();await tick();show(root);q<HTMLInputElement>(root,'.url').value='/other.usda';q(root,'.url-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick()
 expect(runtime.open).toHaveBeenLastCalledWith('/other.usda',expect.any(AbortSignal));expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(false)
 viewer.scenes=[{label:'Fixture',url:'/example.usda'}];show(root);const examples=q<HTMLSelectElement>(root,'.scene-select');examples.value='/example.usda';examples.dispatchEvent(new Event('change',{bubbles:true}));await tick()
 expect(runtime.open).toHaveBeenLastCalledWith('/example.usda',expect.any(AbortSignal));expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(false)
})

it('wraps Tab only at the opening dialog boundaries so Escape continues reaching the viewer',async()=>{
 const {root}=setup();await tick();show(root)
 const first=q(root,'.local-file'),last=q(root,'.close-open')
 last.focus();const forward=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});last.dispatchEvent(forward)
 expect(forward.defaultPrevented).toBe(true);expect(root.activeElement).toBe(first)
 const backward=new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});first.dispatchEvent(backward)
 expect(backward.defaultPrevented).toBe(true);expect(root.activeElement).toBe(last)
 escape(root);expect(q<HTMLDialogElement>(root,'.open-dialog').open).toBe(false)
})
