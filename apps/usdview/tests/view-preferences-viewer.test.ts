// @vitest-environment jsdom
// Component/storage integration with a fake runtime; native preference semantics
// are independently captured in fixtures/viewPreferences, not inferred here.
import {afterEach,beforeAll,expect,it,vi} from 'vitest'
import {defineUsdViewer,UsdViewerElement} from '../src/usd-viewer'
import {defaultViewPreferences,type ViewPreferences} from '../src/view-preferences'
import {defaultPrimTreeSettings} from '../src/prim-tree-settings'
import {defaultDisplaySettings} from '../src/display-settings'
import type {ViewerRuntime,ViewerCameraState,RuntimeCallbacks} from '../src/contracts'
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
beforeAll(()=>{defineUsdViewer();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})})
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks()})
function setup(preferences:ViewPreferences|string){
 let saved=typeof preferences==='string'?preferences:JSON.stringify({'1':preferences}),settings=defaultDisplaySettings(),callbacks!:RuntimeCallbacks
 const state:ViewerCameraState={cameras:[],activeCameraPath:null,free:{fovDegrees:60,aspectRatio:null,nearOverride:null,farOverride:null},effectiveNear:.1,effectiveFar:1000}
 const storage={getItem:vi.fn(()=>saved),setItem:vi.fn((_key:string,value:string)=>{saved=value})}
 const runtime:ViewerRuntime={open:vi.fn(async()=>[]),select:vi.fn(path=>({path,properties:[]})),resize:vi.fn(),dispose:vi.fn(),frameSelection:vi.fn(),getDisplaySettings:()=>settings,setDisplaySettings:vi.fn(async patch=>(settings={...settings,...patch})),getCameraState:()=>state,setCameraSettings:vi.fn(patch=>{Object.assign(state.free,patch);return state}),setCameraPresentation:vi.fn(presentation=>{state.presentation={...defaultViewPreferences({...defaultPrimTreeSettings()}).presentation,...presentation};return state}),getPickMode:()=> 'prims',setPickMode:vi.fn(),setAxesVisible:vi.fn(),getDiagnostics:()=>[]}
 const viewer=document.createElement('usd-viewer') as UsdViewerElement;viewer.preferencesStorageKey='test-prefs';viewer.preferencesStorage=storage;viewer.runtimeFactory=async(_canvas,cb)=>{callbacks=cb;return runtime};viewer.src='/fixture.usda'
 return {viewer,runtime,state,storage,callbacks:()=>callbacks,saved:()=>JSON.parse(saved),raw:()=>saved,append:()=>document.body.append(viewer)}
}
it('restores view settings before open, then restores clipping before scene-loaded',async()=>{
 const p=defaultViewPreferences({...defaultPrimTreeSettings()});p.display.renderMode='Flat Shaded';p.camera={fovDegrees:45,aspectRatio:2,nearOverride:.001,farOverride:.01};p.presentation.cameraMaskMode='partial';p.ui.fontSize=18;p.ui.showHUD=false;p.ui.axesVisible=false;p.ui.viewerMode=true;p.tree.showInactivePrims=false;p.pickMode='models'
 const s=setup(p);vi.mocked(s.runtime.open).mockImplementation(async()=>{expect(s.runtime.getDisplaySettings!().renderMode).toBe('Flat Shaded');expect(s.runtime.getDisplaySettings!().complexity).toBe('low');expect(s.state.free.fovDegrees).toBe(45);expect(s.state.free.nearOverride).toBeNull();return []})
 s.viewer.addEventListener('scene-loaded',()=>expect(s.state.free.nearOverride).toBe(.001));s.append();await tick()
 expect(s.runtime.open).toHaveBeenCalledOnce();expect(s.state.free.farOverride).toBe(.01);expect(s.runtime.setPickMode).toHaveBeenCalledWith('models');expect(s.runtime.setAxesVisible).toHaveBeenCalledWith(false)
 expect(s.viewer.style.getPropertyValue('--usd-base-font')).toBe('18px');expect(s.viewer.shadowRoot!.querySelector<HTMLElement>('.viewport-hud')!.hidden).toBe(true);expect(s.viewer.shadowRoot!.querySelector('.shell')!.hasAttribute('data-viewer-only')).toBe(true);expect(s.viewer.getPrimTreeSettings().showInactivePrims).toBe(false)
})
it('autosaves committed display changes but excludes selection, active camera and complexity',async()=>{
 const s=setup(defaultViewPreferences({...defaultPrimTreeSettings()}));s.append();await tick();const before=s.storage.setItem.mock.calls.length
 await s.runtime.setDisplaySettings!({background:'White',complexity:'high'});s.viewer.dispatchEvent(new CustomEvent('display-settings-changed'));await tick()
 expect(s.saved()['1'].display.background).toBe('White');expect(s.saved()['1'].display.complexity).toBeUndefined()
 const writes=s.storage.setItem.mock.calls.length;s.state.activeCameraPath='/World/Camera';s.callbacks().cameraChanged!(s.state);s.callbacks().selectionChanged({path:'/World',properties:[]});await tick()
 expect(s.storage.setItem.mock.calls.length).toBe(writes);expect(writes).toBeGreaterThan(before);expect(s.saved()['1'].camera.activeCameraPath).toBeUndefined();expect(s.saved()['1'].selection).toBeUndefined()
})
it('logs invalid JSON and leaves it unchanged while allowing the scene to open',async()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});const s=setup('corrupt');s.append();await tick();expect(s.runtime.open).toHaveBeenCalledOnce();expect(warning).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));expect(s.raw()).toBe('corrupt')
})
it('does not open or restore through a disconnected runtime after asynchronous preference work',async()=>{
 const s=setup(defaultViewPreferences({...defaultPrimTreeSettings()}));let resolve!:(value:ReturnType<typeof defaultDisplaySettings>)=>void
 vi.mocked(s.runtime.setDisplaySettings!).mockImplementation(()=>new Promise(r=>{resolve=r}));s.append();await tick();s.viewer.remove();resolve(defaultDisplaySettings());await tick();expect(s.runtime.dispose).toHaveBeenCalledOnce();expect(s.runtime.open).not.toHaveBeenCalled()
})

it('saves keyboard viewer-only mode and splitter changes as view preferences',async()=>{
 const s=setup(defaultViewPreferences({...defaultPrimTreeSettings()}));s.append();await tick()
 document.dispatchEvent(new KeyboardEvent('keydown',{code:'F11',key:'F11',bubbles:true,cancelable:true}));await tick()
 expect(s.saved()['1'].ui.viewerMode).toBe(true)
 const split=s.viewer.shadowRoot!.querySelector<HTMLElement>('[data-split=top]')!;split.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick()
 expect(s.saved()['1'].ui.splits.top).toBeGreaterThan(46)
})

it('applies explicit startup options after saved preferences and retains initial selection',async()=>{
 const p=defaultViewPreferences({...defaultPrimTreeSettings()});p.display.renderMode='Flat Shaded'
 const s=setup(p);s.viewer.startupOptions={complexity:'high',select:'/World/Mesh',camera:'/World/Camera'}
 s.runtime.setStartupOptions=vi.fn(options=>{void s.runtime.setDisplaySettings!({complexity:options.complexity!});return []})
 s.runtime.getSelectionState=()=>({selections:[{path:'/World/Mesh'}],focusPath:'/World/Mesh',lcdPaths:['/World/Mesh']})
 vi.mocked(s.runtime.open).mockImplementation(async()=>{expect(s.runtime.getDisplaySettings!().complexity).toBe('high');return [{path:'/World',name:'World',typeName:'Xform',children:[{path:'/World/Mesh',name:'Mesh',typeName:'Mesh',children:[]}]}]})
 s.append();await tick();expect(s.runtime.setStartupOptions).toHaveBeenCalledWith(s.viewer.startupOptions);expect(s.runtime.select).toHaveBeenLastCalledWith('/World/Mesh');expect(s.saved()['1'].display.complexity).toBeUndefined();expect(s.saved()['1'].selection).toBeUndefined()
})
it('logs invalid URL option diagnostics without blocking the scene',async()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});const s=setup(defaultViewPreferences({...defaultPrimTreeSettings()}));s.viewer.startupWarnings=['Invalid startup cf: bad. Expected an integer frame.'];s.append();await tick()
 expect(s.runtime.open).toHaveBeenCalledOnce();expect(warning).toHaveBeenCalledWith(expect.stringContaining('Invalid startup cf'))
})
