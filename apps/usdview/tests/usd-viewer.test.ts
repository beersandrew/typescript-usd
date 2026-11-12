// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/primTreeWidget.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { defaultDisplaySettings } from '../src/display-settings'
// @vitest-environment jsdom
// These are DOM/controller-contract tests with a fake adapter, not rendering tests.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import selectionNative from './fixtures/usdviewSelection/expected.json'
import {PrimSelectionModel} from '../src/selection-model'
import type { PrimSummary, RuntimeCallbacks, ViewerRuntime } from '../src/contracts'
import { ViewerBusyError } from '../src/contracts'
import { defineUsdViewer, UsdViewerElement } from '../src/usd-viewer'

const tree: PrimSummary[] = [{ path: '/World', name: 'World', typeName: 'Xform', children: [
  { path: '/World/Mesh', name: 'Mesh', typeName: 'Mesh', children: [] },
] }]
const selected = { path: '/World/Mesh', properties: [{ name: 'points', typeName: 'point3f[]', value: '[(0, 1, 2)]' }] }
const tick = async () => { for (let n = 0; n < 5; n++) await Promise.resolve() }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
function adapter(): ViewerRuntime {
  return { open: vi.fn().mockResolvedValue(tree), select: vi.fn(path=>path===null?{path:null,properties:[]}:selected),
    frameSelection: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
}
function setup(runtime = adapter()) {
  let callbacks!: RuntimeCallbacks
  const viewer = document.createElement('usd-viewer') as UsdViewerElement
  viewer.runtimeFactory = vi.fn(async (_canvas, cb) => { callbacks = cb; return runtime })
  viewer.src = '/fixture.usda'
  document.body.append(viewer)
  return { viewer, runtime, callbacks: () => callbacks, root: viewer.shadowRoot! }
}

beforeAll(() => {
  defineUsdViewer()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe('viewer presentation and lifecycle', () => {
  // usdviewq appController.py:3955-3986 and primTreeWidget.py:355-361.
  it('starts on root with no selected property and toggles both native legends',async()=>{
    const runtime=adapter();runtime.inspect=vi.fn(path=>({objectPath:path,metadata:[],layers:[],composition:[],targets:[]}))
    const {root}=setup(runtime);await tick()
    expect([...root.querySelectorAll('.tree-columns span')].map(e=>e.textContent)).toEqual(['Prim Name','Type','Vis','Guides','Draw Mode'])
    expect(root.querySelector('[data-path="/"] .prim-name')!.textContent).toBe('root')
    expect(root.querySelector('[data-path="/"]')!.getAttribute('aria-selected')).toBe('true')
    expect(root.querySelector('.property-table tr.selected')).toBeNull()
    expect(root.querySelector('.inspector-content')!.textContent).toBe('')
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="metadata"]')!.click()
    expect(runtime.inspect).toHaveBeenLastCalledWith('/',undefined,expect.any(Object))
    for(const kind of ['prim','property']){
      const button=root.querySelector<HTMLButtonElement>(`[data-legend="${kind}"]`)!
      const legend=root.querySelector<HTMLElement>(`.${kind}-legend`)!
      expect(legend.hidden).toBe(true);button.click();expect(legend.hidden).toBe(false)
      expect(button.getAttribute('aria-expanded')).toBe('true');button.click();expect(legend.hidden).toBe(true)
    }
  })
  it('keeps native selected-set focus for tree Ctrl toggles and Shift ranges',async()=>{
    const runtime=adapter(),model=new PrimSelectionModel()
    const children=['A','B','C'].map(name=>({path:'/World/'+name,name,typeName:'Cube',children:[]}))
    vi.mocked(runtime.open).mockResolvedValue([{...tree[0]!,children}])
    const detail=()=>{const state=model.snapshot();return {path:state.focusPath==='/'?null:state.focusPath,properties:[],selections:state.selections}}
    runtime.select=vi.fn((path,options)=>{model.update(path,options?.operation,options?.instanceIndex);return detail()})
    runtime.selectPrims=vi.fn(entries=>{model.replace(entries);return detail()})
    const {root}=setup(runtime);await tick()
    const click=(name:string,modifiers:MouseEventInit={})=>root.querySelector(`[data-path="/World/${name}"]`)!.dispatchEvent(new MouseEvent('click',{bubbles:true,...modifiers}))
    click('A');click('C',{shiftKey:true})
    expect(model.snapshot().selections.map(s=>s.path)).toEqual(['/World/A','/World/B','/World/C'])
    expect(root.querySelector('[data-path="/World/A"]')!.getAttribute('aria-selected')).toBe('true')
    expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toBe('/World/A, /World/B, /World/C')
    click('B',{ctrlKey:true});expect(model.snapshot().selections.map(s=>s.path)).toEqual(['/World/A','/World/C'])
    expect(model.snapshot().focusPath).toBe('/World/A')
    click('B',{ctrlKey:true});expect(model.snapshot().selections.map(s=>s.path)).toEqual(['/World/A','/World/C','/World/B'])
    click('A')
    let current=root.querySelector<HTMLButtonElement>('[data-path="/World/A"]')!
    for(const row of selectionNative.keys){
      current.dispatchEvent(new KeyboardEvent('keydown',{key:row.key,bubbles:true,shiftKey:row.modifier==='shift',ctrlKey:row.modifier==='ctrl'}))
      current=root.activeElement as HTMLButtonElement
      expect(current.dataset.path).toBe(row.current)
      expect(model.snapshot().selections.map(s=>s.path)).toEqual(row.state.paths)
      expect(model.snapshot().focusPath).toBe(row.state.focus)
    }
  })
  it('copies native property values and selects validated relationship targets from the context menu',async()=>{
    const runtime=adapter(),model=new PrimSelectionModel()
    const property={name:'targets',typeName:'rel',role:'relationshipWithTargets' as const,value:'/A, /B.input',targets:['/A','/B.input']}
    const initial={path:'/World/Mesh',properties:[property]}
    runtime.selectPrims=vi.fn(entries=>{model.replace(entries);return {path:model.snapshot().focusPath,properties:[],selections:model.snapshot().selections}})
    runtime.inspect=vi.fn((path,name)=>({objectPath:path+(name?'.'+name:''),metadata:[],layers:[],composition:[],targets:[],copyValueText:"[Sdf.Path('/A'), Sdf.Path('/B.input')]"}))
    const write=vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator,'clipboard',{value:{writeText:write},configurable:true})
    const {root,callbacks}=setup(runtime);await tick();callbacks().selectionChanged(initial)
    const openMenu=()=>root.querySelector('[data-property-row="targets"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:10,clientY:20}))
    const action=(text:string)=>[...root.querySelectorAll<HTMLButtonElement>('.context-menu button')].find(button=>button.textContent===text)!
    openMenu();expect(root.querySelector('.context-menu')!.getAttribute('aria-label')).toBe('Property actions')
    action('Copy Property Value').click();await tick();expect(write).toHaveBeenLastCalledWith("[Sdf.Path('/A'), Sdf.Path('/B.input')]")
    openMenu();write.mockClear();action('Copy Target Path(s) As Text').click();await tick();expect(write).not.toHaveBeenCalled()
    expect(root.querySelector('.status')!.textContent).toContain('TypeError')
    openMenu();action('Select Target Path(s)').click();await tick()
    expect(runtime.selectPrims).toHaveBeenLastCalledWith([{path:'/A'},{path:'/B'}])
    callbacks().selectionChanged(initial)
    root.querySelector<HTMLButtonElement>('[data-property-toggle="targets"]')!.click()
    const target=root.querySelector('[data-target-path="/B.input"]')!
    target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))
    action('Copy Target Path As Text').click();await tick();expect(write).toHaveBeenLastCalledWith('/B.input')
  })
  it('toggles Vis without selecting the clicked prim or expanding its ancestors',async()=>{
    const runtime=adapter()
    const mesh={...tree[0]!.children[0]!,info:{hasArcs:false,active:true,imageable:true,defined:true,abstract:false,inPrototype:false,instance:false,supportsGuides:false,visibilityInherited:true,guidesVisible:false,displayName:''}}
    const roots=[{...tree[0]!,children:[mesh]}]
    vi.mocked(runtime.open).mockResolvedValue(roots)
    runtime.applyCompositionCommand=vi.fn(async()=>({tree:roots,selection:{path:null,properties:[]}}))
    const {root,callbacks}=setup(runtime);await tick()
    root.querySelector<HTMLElement>('[data-vis="/World/Mesh"]')!.click();await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenCalledWith({kind:'visibility',path:'/World/Mesh',action:'toggle'})
    expect(runtime.select).not.toHaveBeenCalledWith('/World/Mesh')
    root.querySelector<HTMLButtonElement>('[data-toggle="/World"]')!.click()
    callbacks().selectionChanged(selected)
    expect(root.querySelector('[data-path="/World"]')!.getAttribute('aria-expanded')).toBe('false')
    expect(root.querySelector('[data-path="/World"]')!.closest('.prim-row')!.classList.contains('ancestor')).toBe(true)
  })

  it('opens geometry-free stages for inspection and restores the notice after a failed replacement', async () => {
    const runtime = adapter()
    runtime.getGeometryState = vi.fn(() => ({drawableCount:0,canFrameSelection:false}))
    runtime.openFile = vi.fn().mockRejectedValue(new Error('Unsupported geometry'))
    runtime.inspect = vi.fn(path => ({objectPath:path,metadata:[],layers:[],composition:[],targets:[]}))
    runtime.refreshScene = vi.fn()
    const {root} = setup(runtime); await tick()
    expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(false)
    expect(root.querySelector('.overlay')!.textContent).toContain('No drawable geometry')
    expect(root.querySelector('.status')!.getAttribute('data-error')).toBe('false')
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.reload-scene')!.disabled).toBe(false)
    root.querySelector<HTMLButtonElement>('[data-path="/World/Mesh"]')!.click()
    expect(runtime.select).toHaveBeenCalledWith('/World/Mesh')
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="layers"]')!.click()
    expect(runtime.inspect).toHaveBeenCalled()
    const input = root.querySelector<HTMLInputElement>('.local-file')!
    Object.defineProperty(input,'files',{value:[new File(['#usda 1.0'],'unsupported.usda')]})
    input.dispatchEvent(new Event('change',{bubbles:true})); await tick()
    expect(root.querySelector('.status')!.textContent).toContain('Unsupported geometry')
    expect(root.querySelector('.overlay')!.textContent).toContain('No drawable geometry')
    expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(false)
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(true)
    expect(root.querySelector('[data-path="/World/Mesh"]')!.getAttribute('aria-selected')).toBe('true')
  })

  it('refreshes geometry-free presentation when drawable targets change without closing inspection', async () => {
    const runtime = adapter()
    let state={drawableCount:0,canFrameSelection:false}
    runtime.getGeometryState=()=>state
    const {root,callbacks}=setup(runtime); await tick()
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(true)
    state={drawableCount:1,canFrameSelection:true}; callbacks().geometryChanged?.(state)
    expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(false)
    state={drawableCount:1,canFrameSelection:false}; callbacks().geometryChanged?.(state)
    expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(true)
    state={drawableCount:0,canFrameSelection:false}; callbacks().geometryChanged?.(state)
    expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(false)
    expect(root.querySelector('[data-path="/World/Mesh"]')).not.toBeNull()
  })

  it('keeps overlay visibility independent and ignores timing callbacks after disconnect', async () => {
    const runtime = adapter(); runtime.setAxesVisible = vi.fn()
    const { viewer, root, callbacks } = setup(runtime); await tick()
    callbacks().frameRendered?.({cpuMilliseconds:2.5,framesPerSecond:400})
    expect(root.querySelector('.render-timing')!.textContent).toContain('2.50 ms CPU (400.00 FPS)')
    callbacks().frameRendered?.({cpuMilliseconds:0,framesPerSecond:null})
    expect(root.querySelector('.render-timing')!.textContent).toContain('<1 ms CPU (— FPS)')
    callbacks().frameRendered?.({cpuMilliseconds:2.5,framesPerSecond:400})
    const axes = root.querySelector<HTMLInputElement>('.show-axes')!
    axes.click(); expect(runtime.setAxesVisible).toHaveBeenLastCalledWith(false)
    expect((root.querySelector('.viewport-hud') as HTMLElement).hidden).toBe(false)
    root.querySelector<HTMLInputElement>('.show-hud')!.click()
    expect((root.querySelector('.viewport-hud') as HTMLElement).hidden).toBe(true)
    viewer.remove(); callbacks().frameRendered?.({cpuMilliseconds:99,framesPerSecond:1})
    expect(root.querySelector('.render-timing')!.textContent).toContain('2.50 ms CPU')
  })

  it('switches read-only inspection panels and follows property targets without interpreting scene markup', async () => {
    const runtime = adapter()
    runtime.inspect = vi.fn((path, propertyName) => ({ objectPath: propertyName ? `${path}.${propertyName}` : path,
      metadata: [{name:'documentation',value:'<img src=x onerror=alert(1)>'}],
      layers: [{layer:'root.usda',specPath:path,arc:'local',offset:0,scale:1,value:'3'}],
      composition: [{arc:'reference',targetLayer:'reference.usda',targetPath:'/Source',introducingLayer:'root.usda',introducingPath:path,ancestral:false,hasSpecs:true}],
      targets: [{kind:'connection' as const,path:'/World.output',primPath:'/World',propertyName:'output',exists:true},
        {kind:'relationship' as const,path:'/Missing',primPath:'/Missing',exists:false}] }))
    vi.mocked(runtime.select).mockImplementation(path => path === '/World' ? {path,properties:[{name:'output',typeName:'float',value:'7'}]} : selected)
    const { root, callbacks } = setup(runtime); await tick(); callbacks().selectionChanged(selected)
    expect(root.querySelector('.inspector-content')!.textContent).toBe('')
    expect(root.querySelector('.inspect-prim')).toBeNull()
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="metadata"]')!.click()
    expect(runtime.inspect).toHaveBeenLastCalledWith('/World/Mesh', undefined, {arrayStart:0,includeMetadataDetails:true,includeCompositionTree:false})
    expect(root.querySelector('.inspector-content')!.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(root.querySelector('.inspector-content img')).toBeNull()
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="layers"]')!.click()
    expect(root.querySelector('.inspector-content')!.textContent).toContain('root.usda')
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="composition"]')!.click()
    expect(runtime.inspect).toHaveBeenLastCalledWith('/World/Mesh', undefined, {arrayStart:0,includeMetadataDetails:false,includeCompositionTree:true})
    expect(root.querySelector('.inspector-content')!.textContent).toContain('reference.usda')
    root.querySelector<HTMLButtonElement>('[data-property="points"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="metadata"]')!.click()
    expect(runtime.inspect).toHaveBeenLastCalledWith('/World/Mesh', 'points', {arrayStart:0,includeMetadataDetails:true,includeCompositionTree:false})
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="value"]')!.click()
    expect(root.querySelector<HTMLButtonElement>('[data-target-prim="/Missing"]')!.disabled).toBe(true)
    root.querySelector<HTMLButtonElement>('[data-target-prim="/World"]')!.click()
    expect(runtime.select).toHaveBeenLastCalledWith('/World')
    expect(runtime.inspect).toHaveBeenLastCalledWith('/World', 'output', {arrayStart:0,includeMetadataDetails:false,includeCompositionTree:false})
    expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toBe('/World.output')
    expect(root.querySelector('.value-text')!.textContent).toBe('7')
  })


  it('cycles Find Property matches and preserves selection for missing typed paths', async () => {
    const runtime=adapter()
    runtime.inspect=vi.fn((path,name)=>path==='/Missing'||name==='missing'?null:{objectPath:name?`${path}.${name}`:path,metadata:[],layers:[],composition:[],targets:[]})
    const detail={path:'/World/Mesh',properties:[{name:'primvars:a',typeName:'float',value:'1'},{name:'primvars:b',typeName:'float',value:'2'}]}
    vi.mocked(runtime.select).mockReturnValue(detail)
    const {root,callbacks}=setup(runtime);await tick();callbacks().selectionChanged(detail)
    const search=root.querySelector<HTMLInputElement>('.property-search')!
    search.value='PRIMVARS';const form=root.querySelector('.find-property-form')!
    form.dispatchEvent(new Event('submit',{cancelable:true}));expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toBe('/World/Mesh.primvars:a')
    form.dispatchEvent(new Event('submit',{cancelable:true}));expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toBe('/World/Mesh.primvars:b')
    const path=root.querySelector<HTMLInputElement>('.current-path')!
    expect(path.getAttribute('aria-label')).toBe('Current prim or property path')
    expect(root.querySelectorAll('.path-form button')).toHaveLength(0)
    path.value='/Missing';root.querySelector('.path-form')!.dispatchEvent(new Event('submit',{cancelable:true}))
    expect(runtime.select).not.toHaveBeenCalledWith('/Missing');expect(path.getAttribute('aria-invalid')).toBe('true')
    path.value='/World/Mesh.primvars:a';root.querySelector('.path-form')!.dispatchEvent(new Event('submit',{cancelable:true}))
    expect(runtime.select).toHaveBeenCalledWith('/World/Mesh');expect(path.hasAttribute('aria-invalid')).toBe(false)
    expect(path.value).toBe('/World/Mesh.primvars:a')
  })

  it('pages indexed arrays without rendering the entire value and copies unresolved targets', async () => {
    const runtime=adapter(),writeText=vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
    runtime.inspect=vi.fn((path,name,options)=>{
      const start=options?.arrayStart??0
      return {objectPath:`${path}.${name}`,metadata:[],layers:[],composition:[],targets:[{kind:'relationship' as const,path:'/Missing',primPath:'/Missing',exists:false}],
        array:{typeName:'point3f[]',length:1000,start,entries:Array.from({length:100},(_,i)=>({index:start+i,value:`[${start+i}, 1, 2]`}))}}
    })
    const {root,callbacks}=setup(runtime);await tick();callbacks().selectionChanged(selected)
    root.querySelector<HTMLButtonElement>('[data-property="points"]')!.click()
    expect(root.querySelectorAll('.array-value-table tbody tr')).toHaveLength(100)
    root.querySelector<HTMLButtonElement>('[data-array-start="100"]')!.click()
    expect(runtime.inspect).toHaveBeenLastCalledWith('/World/Mesh','points',{arrayStart:100,includeMetadataDetails:false,includeCompositionTree:false})
    expect(root.querySelector('.array-value-table tbody tr')!.textContent).toContain('100')
    root.querySelector<HTMLButtonElement>('[data-copy-value="/Missing"]')!.click();await tick()
    expect(writeText).toHaveBeenCalledWith('/Missing')
    writeText.mockRejectedValueOnce(new Error('denied'))
    root.querySelector<HTMLButtonElement>('[data-copy-value="/Missing"]')!.click();await tick()
    expect(root.querySelector('.status')!.textContent).toContain('Copy failed: Error: denied')
    const index=root.querySelector<HTMLInputElement>('.array-start')!;index.value='400'
    root.querySelector('.array-page-controls')!.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))
    expect(runtime.inspect).toHaveBeenLastCalledWith('/World/Mesh','points',{arrayStart:400,includeMetadataDetails:false,includeCompositionTree:false})
  })

  it('applies display settings, disables pending controls and restores values on failure', async () => {
    const runtime = adapter(), pending = deferred<import('../src/display-settings').DisplaySettings>()
    const settings = defaultDisplaySettings()
    runtime.getDisplaySettings = () => settings
    runtime.setDisplaySettings = vi.fn().mockReturnValue(pending.promise)
    const s = setup(runtime);await tick()
    const control = s.root.querySelector<HTMLInputElement>('[data-display="complexity"][value="veryhigh"]')!
    expect(control.disabled).toBe(false)
    control.checked = true;control.dispatchEvent(new Event('change'))
    expect(control.disabled).toBe(true)
    expect(runtime.setDisplaySettings).toHaveBeenCalledWith({complexity:'veryhigh'})
    pending.reject(new Error('unsupported refinement level 3'));await tick()
    expect(control.checked).toBe(false);expect(s.root.querySelector<HTMLInputElement>('[data-display="complexity"][value="low"]')!.checked).toBe(true);expect(control.disabled).toBe(false)
    expect(s.root.querySelector('.status')!.textContent).toContain('Display unchanged: unsupported refinement level 3')
    expect((s.root.querySelector('.overlay') as HTMLElement).hidden).toBe(true)
  })

  it('while following: the HUD shows leader, shown and behind frames; the leader complexity is applied between seeks', async () => {
    const runtime = adapter(), settings = defaultDisplaySettings();let current = 0
    const seeks:ReturnType<typeof deferred<void>>[] = []
    runtime.getTimeState = () => ({ start: 0, end: 100, current, framesPerSecond: 24, timeCodesPerSecond: 24 })
    runtime.setTime = vi.fn((time: number) => { const d = deferred<void>(); seeks.push(d); return d.promise.then(() => { current = time; return runtime.getTimeState!()! }) })
    runtime.setPlaybackActive = vi.fn()
    runtime.getDisplaySettings = () => settings
    runtime.setDisplaySettings = vi.fn(async (patch: Partial<typeof settings>) => Object.assign(settings, patch))
    const s = setup(runtime);await tick()
    const lag = s.root.querySelector<HTMLElement>('.follow-lag')!
    expect(lag.hidden).toBe(true)
    s.viewer.following = true
    expect(lag.hidden).toBe(false)
    s.viewer.followTime(5, true);s.viewer.followTime(6, true);s.viewer.followComplexity('high');s.viewer.followTime(7, true);await tick()
    expect(runtime.setTime).toHaveBeenCalledTimes(1)
    expect(lag.textContent).toBe('     Follow: leader 7.0 · shown — · behind — frames · render — ms')
    seeks[0]!.resolve();await tick();await tick()
    expect(runtime.setDisplaySettings).toHaveBeenCalledWith({complexity:'high'})
    expect(s.root.querySelector('.complexity-caption')!.textContent).toBe('High')
    expect(runtime.setTime).toHaveBeenCalledTimes(2);expect(runtime.setTime).toHaveBeenLastCalledWith(7)
    expect(lag.textContent).toMatch(/^     Follow: leader 7\.0 · shown 5\.0 · behind 2\.0 frames · render \d+\.\d\d ms$/)
    seeks[1]!.resolve();await tick();await tick()
    expect(lag.textContent).toMatch(/leader 7\.0 · shown 7\.0 · behind 0\.0 frames/)
    expect(s.root.querySelector('.playback-timing')!.textContent).toMatch(/^   Playback: (\.\.\.|\d+\.\d\d ms \([\d.]+ FPS\))$/)
    s.viewer.following = false
    expect(lag.hidden).toBe(true);expect(s.root.querySelector('.playback-timing')!.textContent).toBe('   Playback: N/A')
  })

  it('shows instance identity and emits selection changes between instances of one prototype', async () => {
    const s = setup(), listener = vi.fn()
    s.viewer.addEventListener('prim-selected', listener)
    await tick()
    s.callbacks().selectionChanged({ ...selected, instanceIndex: 2, instancerPath: '/World/Instances' })
    s.callbacks().selectionChanged({ ...selected, instanceIndex: 5, instancerPath: '/World/Instances' })
    expect(s.root.querySelector('.status')!.textContent).toContain('Selected instance 5 of /World/Instances')
    expect(listener).toHaveBeenCalledTimes(2)
    s.callbacks().selectionChanged(selected)
    expect(s.root.querySelector('.property-heading')).toBeNull()
  })

  it('opens a selected local file and reloads it after reconnect without object URLs', async () => {
    const runtime = adapter()
    runtime.openFile = vi.fn().mockResolvedValue(tree)
    const { viewer, root } = setup(runtime)
    await tick()
    const input = root.querySelector<HTMLInputElement>('.local-file')!
    expect(input.disabled).toBe(false)
    const file = new File(['#usda 1.0'], 'local.usda')
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(runtime.openFile).toHaveBeenCalledWith(file, expect.any(AbortSignal))
    expect(root.querySelector('#local-file-help')!.textContent).toContain('External layers')
    viewer.remove()
    document.body.append(viewer)
    await tick()
    expect(runtime.openFile).toHaveBeenCalledTimes(2)
    // Choosing the original URL must work even though the src attribute did not change.
    root.querySelector<HTMLInputElement>('.url')!.value = '/fixture.usda'
    root.querySelector('.url-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick()
    expect(runtime.open).toHaveBeenCalledTimes(2)
  })

  it('disables local loading for adapters without file support', async () => {
    const { root } = setup()
    await tick()
    expect(root.querySelector<HTMLInputElement>('.local-file')!.disabled).toBe(true)
  })

  it('preserves the previous scene and inspection when a replacement file fails', async () => {
    const runtime = adapter()
    runtime.openFile = vi.fn().mockRejectedValue(new Error('Missing dependency: geometry.usda'))
    const { root } = setup(runtime)
    await tick()
    root.querySelector<HTMLButtonElement>('[data-path="/World/Mesh"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-property="points"]')!.click()
    const input = root.querySelector<HTMLInputElement>('.local-file')!
    Object.defineProperty(input, 'files', { value: [new File(['#usda 1.0'], 'broken.usda')] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(root.querySelector('.status')!.textContent).toContain('Missing dependency: geometry.usda')
    expect(root.querySelector('[data-path="/World/Mesh"]')!.getAttribute('aria-selected')).toBe('true')
    expect(root.querySelector('.value-text')!.textContent).toBe('[(0, 1, 2)]')
    expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(false)
  })

  it('cancels a local file load when a URL replaces it and ignores the late file result', async () => {
    const runtime = adapter(), pending = deferred<PrimSummary[]>()
    runtime.openFile = vi.fn().mockReturnValue(pending.promise)
    const { viewer, root } = setup(runtime)
    await tick()
    const input = root.querySelector<HTMLInputElement>('.local-file')!
    Object.defineProperty(input, 'files', { value: [new File(['#usda 1.0'], 'slow.usda')] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    viewer.src = '/replacement.usda'
    await tick()
    expect(vi.mocked(runtime.openFile).mock.calls[0]![1]!.aborted).toBe(true)
    pending.resolve([{ path: '/Late', name: 'Late', typeName: 'Mesh', children: [] }])
    await tick()
    expect(root.querySelector('[data-path="/Late"]')).toBeNull()
    expect(root.querySelector('[data-path="/World"]')).not.toBeNull()
  })

  it('uses the classic property/value split and changes the detail when a property is chosen', async () => {
    const runtime = adapter()
    vi.mocked(runtime.select).mockReturnValue({ path: '/World/Mesh', properties: [
      { name: 'points', typeName: 'point3f[]', value: '[(0, 1, 2)]' },
      { name: 'subdivisionScheme', typeName: 'token', value: 'none' },
    ] })
    const { root } = setup(runtime)
    await tick()
    root.querySelector<HTMLButtonElement>('[data-path="/World/Mesh"]')!.click()
    expect(root.querySelector('.top-row .hierarchy')).not.toBeNull()
    expect(root.querySelector('.top-row .render-panel')).not.toBeNull()
    expect(root.querySelector('.bottom-row .property-panel')).not.toBeNull()
    expect(root.querySelector('.bottom-row .inspector')).not.toBeNull()
    root.querySelector<HTMLButtonElement>('[data-property="subdivisionScheme"]')!.click()
    expect(root.querySelector('.value-text')!.textContent).toBe('none')
    expect(root.querySelector('.inspector-content')!.textContent).toContain('none')
    expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toBe('/World/Mesh.subdivisionScheme')
    expect(root.querySelector<HTMLButtonElement>('.playback-current button')!.disabled).toBe(true)
    expect(root.querySelectorAll('.tabs button:disabled')).toHaveLength(3)
  })

  it('finds a prim by name through the compact hierarchy search', async () => {
    const { root, runtime } = setup()
    await tick()
    root.querySelector<HTMLInputElement>('.prim-search')!.value = 'mesh'
    root.querySelector('.find-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(runtime.select).toHaveBeenCalledWith('/World/Mesh')
  })

  it('loads the requested source and synchronizes row and viewport selection', async () => {
    const { viewer, runtime, root, callbacks } = setup()
    const listener = vi.fn()
    viewer.addEventListener('prim-selected', listener)
    await tick()
    expect(runtime.open).toHaveBeenCalledWith('/fixture.usda', expect.any(AbortSignal))
    const row = root.querySelector<HTMLButtonElement>('[data-path="/World/Mesh"]')!
    row.click()
    expect(runtime.select).toHaveBeenCalledWith('/World/Mesh')
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(root.querySelector('.inspector-content')!.textContent).toBe('')
    root.querySelector<HTMLButtonElement>('[data-property="points"]')!.click()
    expect(root.querySelector('.value-text')!.textContent).toBe('[(0, 1, 2)]')
    callbacks().selectionChanged({ path: '/World', properties: [] })
    expect(row.getAttribute('aria-selected')).toBe('false')
    expect(root.querySelector('[data-path="/World"]')!.getAttribute('aria-selected')).toBe('true')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('aborts superseded loads and ignores their late results', async () => {
    const first = deferred<PrimSummary[]>(), second = deferred<PrimSummary[]>()
    const runtime = adapter()
    vi.mocked(runtime.open).mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { viewer, root } = setup(runtime)
    await tick()
    viewer.src = '/second.usda'
    expect(vi.mocked(runtime.open).mock.calls[0]![1]!.aborted).toBe(true)
    second.resolve([{ path: '/Second', name: 'Second', typeName: 'Mesh', children: [] }])
    await tick()
    first.resolve(tree)
    await tick()
    expect(root.querySelector('[data-path="/Second"]')).not.toBeNull()
    expect(root.querySelector('[data-path="/World"]')).toBeNull()
  })

  it('disposes an initialization completed after disconnect and initializes again on reconnect', async () => {
    const pending = deferred<ViewerRuntime>()
    const first = adapter(), second = adapter()
    const viewer = document.createElement('usd-viewer')
    viewer.runtimeFactory = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(second)
    viewer.src = '/fixture.usda'
    document.body.append(viewer)
    viewer.remove()
    pending.resolve(first)
    await tick()
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(first.open).not.toHaveBeenCalled()
    document.body.append(viewer)
    await tick()
    expect(second.open).toHaveBeenCalledTimes(1)
    viewer.remove()
    expect(second.dispose).toHaveBeenCalledTimes(1)
  })

  it('aborts loading on disconnect and ignores old callbacks after reconnect', async () => {
    const pending = deferred<PrimSummary[]>()
    const runtime = adapter()
    vi.mocked(runtime.open).mockReturnValueOnce(pending.promise)
    const { viewer, root, callbacks } = setup(runtime)
    await tick()
    const oldCallbacks = callbacks()
    viewer.remove()
    expect(vi.mocked(runtime.open).mock.calls[0]![1]!.aborted).toBe(true)
    expect(runtime.dispose).toHaveBeenCalledTimes(1)
    document.body.append(viewer)
    await tick()
    oldCallbacks.statusChanged('Old renderer failed')
    expect(root.querySelector('.status')!.textContent).not.toBe('Old renderer failed')
    pending.resolve(tree)
    await tick()
  })

  it('has no Auto Test menu; menus follow native usdview', async () => {
    const { viewer, root } = setup()
    await tick()
    expect(root.querySelector('.autotest-menu, .auto-test')).toBeNull()
    expect([...root.querySelectorAll('.menubar > details.menu > summary')].map(s => s.textContent!.trim())).toEqual(['File', 'Edit', 'Window'])
    // Layout follows mainWindowUI.ui; a stray closing tag once collapsed everything below the menu bar.
    expect([...root.querySelector('.shell')!.children].map(e => e.className.split(' ')[0])).toEqual(expect.arrayContaining(['menubar', 'path-form', 'workbench']))
    expect(root.querySelector('.menubar .workbench, .menubar canvas')).toBeNull()
    expect([...root.querySelectorAll('.render-menus > details.menu > summary')].map(s => s.textContent!.trim())).toEqual(expect.arrayContaining(['Renderer', 'Display', 'Select', 'Camera', 'Lights']))
    viewer.remove()
  })

  it('expires transient feedback without removing live status', async () => {
    vi.useFakeTimers()
    try {
      const { viewer, root, callbacks } = setup(); await tick()
      const feedback = root.querySelector<HTMLElement>('.statusbar')!
      const status = root.querySelector<HTMLElement>('[role=status].status')!
      expect(root.querySelector('.controls')).toBeNull()
      callbacks().diagnosticsChanged!([{severity:'error',message:'Missing texture'}])
      callbacks().statusChanged('Copied to clipboard.')
      expect(feedback.hasAttribute('data-feedback')).toBe(true)
      vi.advanceTimersByTime(5000)
      expect(feedback.hasAttribute('data-feedback')).toBe(false)
      expect(status.textContent).toBe('Copied to clipboard.')
      expect(status.getAttribute('aria-live')).toBe('polite')
      expect(root.querySelector('.diagnostics')).toBeNull()
      viewer.remove()
    } finally { vi.useRealTimers() }
  })

  it('keeps load failures available after transient feedback expires', async () => {
    vi.useFakeTimers()
    try {
      const runtime=adapter();vi.mocked(runtime.open).mockRejectedValue(new Error('Invalid scene'))
      const { viewer, root }=setup(runtime);await tick()
      vi.advanceTimersByTime(5000)
      expect(root.querySelector('.status')!.getAttribute('data-error')).toBe('true')
      expect(root.querySelector('.status')!.textContent).toBe('Invalid scene')
      expect(root.querySelector<HTMLElement>('.overlay')!.hidden).toBe(false)
      viewer.remove()
    } finally { vi.useRealTimers() }
  })

  it('retains diagnostic events without adding a warning badge or popup', async () => {
    const { viewer, root, callbacks } = setup()
    await tick()
    const changed = vi.fn()
    viewer.addEventListener('diagnostics-changed', changed)
    const diagnostics = [{severity:'warning' as const,message:'Could not open asset @missing.usda@'}]
    callbacks().diagnosticsChanged!(diagnostics)
    expect(root.querySelector('.diagnostics')).toBeNull()
    expect(root.querySelector('.diagnostics-count,.diagnostics-list')).toBeNull()
    expect(changed.mock.calls[0]![0].detail).toEqual(diagnostics)
    callbacks().diagnosticsChanged!([])
    expect(changed.mock.calls[1]![0].detail).toEqual([])
    viewer.remove()
  })

  it('reports runtime failure instead of displaying a fake successful viewport', async () => {
    const runtime = adapter()
    vi.mocked(runtime.open).mockRejectedValue(new Error('Unsupported subdivision scheme'))
    const { viewer, root } = setup(runtime)
    const failure = vi.fn()
    viewer.addEventListener('viewer-error', failure)
    await tick()
    expect(root.querySelector('.overlay')!.textContent).toContain('Unsupported subdivision scheme')
    expect(root.querySelector<HTMLButtonElement>('.frame')!.disabled).toBe(true)
    expect(failure).toHaveBeenCalledTimes(1)
  })

  it('renders stage names and values as text, never markup', async () => {
    const runtime = adapter()
    vi.mocked(runtime.open).mockResolvedValue([{ path: '/P', name: '<img src=x onerror=alert(1)>', typeName: 'Mesh', children: [] }])
    vi.mocked(runtime.select).mockReturnValue({ path: '/P', properties: [{ name: '<script>', typeName: 'string', value: '<img src=x>' }] })
    const { root } = setup(runtime)
    await tick()
    root.querySelector<HTMLButtonElement>('[data-path="/P"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-property]')!.click()
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('.value-text')!.textContent).toBe('<img src=x>')
  })

  it('supports expanding the hierarchy and keyboard navigation without selecting implicitly', async () => {
    const { root, runtime } = setup()
    await tick()
    const world = root.querySelector<HTMLButtonElement>('[data-path="/World"]')!
    world.focus()
    world.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(world.getAttribute('aria-expanded')).toBe('false')
    world.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(world.getAttribute('aria-expanded')).toBe('true')
    world.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(root.activeElement).toBe(root.querySelector('[data-path="/World/Mesh"]'))
    expect(runtime.select).not.toHaveBeenCalledWith('/World/Mesh')
  })
})

describe('local asset selection and drops',()=>{
  const pick=(root:ShadowRoot,selector:string,files:File[])=>{
    const input=root.querySelector<HTMLInputElement>(selector)!
    Object.defineProperty(input,'files',{configurable:true,value:files})
    input.dispatchEvent(new Event('change',{bubbles:true}))
  }
  const drop=(viewer:UsdViewerElement,files:File[])=>{
    const event=new Event('drop',{bubbles:true,cancelable:true})
    Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],files,items:[]}})
    viewer.dispatchEvent(event);return event
  }
  it('opens dropped USDZ through the local mount without URL navigation',async()=>{
    const runtime=adapter();runtime.openFiles=vi.fn().mockResolvedValue(tree)
    const {viewer,root}=setup(runtime);await tick()
    const file=new File(['package'],'scene.usdz'),event=drop(viewer,[file]);await tick()
    expect(event.defaultPrevented).toBe(true)
    expect(runtime.openFiles).toHaveBeenCalledWith({rootPath:'scene.usdz',files:[{path:'scene.usdz',file}]},expect.any(AbortSignal))
    expect(runtime.open).toHaveBeenCalledTimes(1)
    expect(root.querySelector<HTMLElement>('.local-root-form')!.hidden).toBe(true)
  })
  it('requires an explicit root for multiple scenes and preserves folder-relative paths after reconnect',async()=>{
    const runtime=adapter();runtime.openFiles=vi.fn().mockResolvedValue(tree)
    const {viewer,root}=setup(runtime);await tick()
    const files=['root.usda','layers/child.usda','textures/a.png'].map(name=>{
      const file=new File([''],name.split('/').pop()!);Object.defineProperty(file,'webkitRelativePath',{value:'model/'+name});return file
    })
    pick(root,'.local-folder',files);await tick()
    expect(runtime.openFiles).not.toHaveBeenCalled()
    const select=root.querySelector<HTMLSelectElement>('.local-root')!
    expect([...select.options].map(x=>x.value)).toEqual(['','model/root.usda','model/layers/child.usda'])
    expect(root.querySelector<HTMLButtonElement>('.open-local-root')!.disabled).toBe(true)
    select.value='model/root.usda';select.dispatchEvent(new Event('change',{bubbles:true}))
    root.querySelector('.local-root-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick()
    expect(runtime.openFiles).toHaveBeenCalledWith({rootPath:'model/root.usda',files:files.map(file=>({path:file.webkitRelativePath,file}))},expect.any(AbortSignal))
    viewer.remove();document.body.append(viewer);await tick();expect(runtime.openFiles).toHaveBeenCalledTimes(2)
  })
  it('does not discard the last successful mount when a new mount fails',async()=>{
    const runtime=adapter();runtime.openFiles=vi.fn().mockResolvedValueOnce(tree).mockRejectedValueOnce(new Error('missing texture')).mockResolvedValue(tree)
    const {viewer,root}=setup(runtime);await tick()
    const good=new File([''],'good.usda');drop(viewer,[good]);await tick()
    drop(viewer,[new File([''],'bad.usda')]);await tick()
    expect(root.querySelector('.status')!.textContent).toContain('missing texture')
    expect(root.querySelector('[data-path="/World"]')).not.toBeNull()
    viewer.remove();document.body.append(viewer);await tick()
    expect(vi.mocked(runtime.openFiles).mock.calls[2]![0].rootPath).toBe('good.usda')
  })
  it('rejects duplicate file paths and clears a pending root choice when a URL replaces it',async()=>{
    const runtime=adapter();runtime.openFiles=vi.fn().mockResolvedValue(tree)
    const {viewer,root}=setup(runtime);await tick()
    pick(root,'.local-files',[new File([''],'same.usda'),new File([''],'same.usda')]);await tick()
    expect(root.querySelector('.status')!.textContent).toContain('Duplicate local asset path')
    expect(runtime.openFiles).not.toHaveBeenCalled()
    pick(root,'.local-files',[new File([''],'a.usda'),new File([''],'b.usda')]);await tick()
    expect(root.querySelector<HTMLElement>('.local-root-form')!.hidden).toBe(false)
    viewer.src='/replacement.usda';await tick()
    expect(root.querySelector<HTMLElement>('.local-root-form')!.hidden).toBe(true)
    expect(runtime.openFiles).not.toHaveBeenCalled()
  })
  it('ignores folder enumeration that finishes after a URL replaces it',async()=>{
    const runtime=adapter();runtime.openFiles=vi.fn().mockResolvedValue(tree)
    const {viewer}=setup(runtime);await tick()
    let deliver!:(file:File)=>void
    const entry={name:'late.usda',isFile:true,isDirectory:false,file:(callback:typeof deliver)=>{deliver=callback}}
    const event=new Event('drop',{bubbles:true,cancelable:true})
    Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],files:[],items:[{kind:'file',webkitGetAsEntry:()=>entry,getAsFile:()=>null}]}})
    viewer.dispatchEvent(event);viewer.src='/new.usda';deliver(new File([''],'late.usda'));await tick()
    expect(runtime.openFiles).not.toHaveBeenCalled()
    expect(runtime.open).toHaveBeenLastCalledWith('/new.usda',expect.any(AbortSignal))
  })
})

describe('deferred payload streaming (fake adapter, not a browser test)', () => {
  function streaming(paths: string[]) {
    const runtime = adapter(), loaded = new Set<string>(), gates: ReturnType<typeof deferred<void>>[] = []
    runtime.getDeferredPayloads = vi.fn(() => paths.filter(path => !loaded.has(path)))
    runtime.reportPayloadProgress = vi.fn()
    runtime.applyCompositionCommand = vi.fn(async command => {
      const gate = deferred<void>(); gates.push(gate); await gate.promise
      if (command.kind === 'loadAndUnload') for (const path of command.load) loaded.add(path)
      return { tree, selection: { path: null, properties: [] } }
    })
    return { runtime, loaded, gates }
  }
  const settle = async () => { for (let n = 0; n < 4; n++) { await tick(); await new Promise(resolve => setTimeout(resolve, 60)) } }
  it('loads deferred payloads in growing batches after the first frame, with no notice over the viewport', async () => {
    const paths = ['/A', '/B', '/C', '/D', '/E']
    const { runtime, loaded, gates } = streaming(paths)
    const { root } = setup(runtime); await settle()
    const overlay = root.querySelector<HTMLElement>('.overlay')!
    expect(overlay.hidden).toBe(true)
    expect(root.querySelector('.status')!.textContent).toContain('Loading payloads')
    for (let n = 0; n < 2; n++) { gates.at(-1)!.resolve(); await settle() }
    const batches = vi.mocked(runtime.applyCompositionCommand!).mock.calls.map(([c]) => c.kind === 'loadAndUnload' ? c.load : [])
    expect(batches).toEqual([['/A', '/B'], ['/C', '/D', '/E']])
    expect([...loaded]).toEqual(paths)
    expect(overlay.hidden).toBe(true)
    expect(runtime.reportPayloadProgress).toHaveBeenLastCalledWith({ phase: 'done' })
  })
  it('retries a batch the runtime refuses as busy (a follower seek in flight) instead of counting it failed', async () => {
    const paths = ['/A', '/B']
    const { runtime, loaded, gates } = streaming(paths)
    const apply = runtime.applyCompositionCommand!
    let refused = 0
    runtime.applyCompositionCommand = vi.fn(command => refused++ ? apply(command) : Promise.reject(new ViewerBusyError('Wait for the current scene update before editing composition.')))
    const { root } = setup(runtime); await settle()
    gates.at(-1)!.resolve(); await settle()
    expect(refused).toBe(2)
    expect([...loaded]).toEqual(paths)
    expect(runtime.reportPayloadProgress).not.toHaveBeenCalledWith({ failed: 2 })
    expect(root.querySelector('.status')?.textContent ?? '').not.toMatch(/failed/)
    expect(runtime.reportPayloadProgress).toHaveBeenLastCalledWith({ phase: 'done' })
  })
  it('shows payload progress in the status bar', async () => {
    const { runtime } = streaming(['/A'])
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    const { root, callbacks } = setup(runtime); await settle()
    callbacks().loadProgress!({ phase: 'payloads', layers: { requested: 3, done: 3, failed: 0 }, payloadFiles: { requested: 0, done: 0, failed: 0 }, payloads: { requested: 1, done: 0, failed: 0 }, bytes: 2048 })
    for (const frame of frames.splice(0)) frame(0)
    expect(root.querySelector('.status')!.textContent).toBe('Loading payloads: Layers: 3/3 · Payloads: 0/1 · 2 kB')
    vi.unstubAllGlobals(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
})
