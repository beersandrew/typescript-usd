// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest'
import { ExportControls,exportMenu } from '../src/export-controls'
import type { ViewerRuntime } from '../src/contracts'
import type { StageExport } from '../src/stage-export'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
const result: StageExport={kind:'session',fileName:'scene_session.usda',text:'#usda 1.0',warnings:['Requires the original scene.']}
function setup(exporter: ViewerRuntime['exportStage']) {
 const root=document.createElement('div').attachShadow({mode:'open'});root.innerHTML=exportMenu
 const controls=new ExportControls(root,()=>({exportStage:exporter}) as ViewerRuntime),events=new AbortController()
 controls.bind(events.signal);controls.busy(false)
 return {root,controls,events}
}
it.each(['session','overrides','flattened'] as const)('downloads %s bytes and keeps a dependency explanation visible',async(kind)=>{
 vi.useFakeTimers();const create=vi.fn((_blob:Blob)=> 'blob:export'),revoke=vi.fn();Object.defineProperty(URL,'createObjectURL',{value:create,configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:revoke,configurable:true})
 let download='';vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){download=this.download})
 const exported={...result,kind,fileName:`scene_${kind}.usda`},exporter=vi.fn().mockResolvedValue(exported),{root}=setup(exporter)
 root.querySelector<HTMLButtonElement>(`.save-${kind}`)!.click();await Promise.resolve();await Promise.resolve()
 expect(exporter).toHaveBeenCalledWith(kind,undefined);expect(download).toBe(exported.fileName)
 expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob)
 expect(root.querySelector('.export-status')!.textContent).toContain('Requires the original scene.')
 expect(root.querySelector('a')).toBeNull();expect(revoke).not.toHaveBeenCalled();vi.runAllTimers();expect(revoke).toHaveBeenCalledWith('blob:export')
})
it('blocks duplicate exports and cancels stale downloads after scene changes',async()=>{
 const create=vi.fn();Object.defineProperty(URL,'createObjectURL',{value:create,configurable:true})
 let resolve!:(value:StageExport)=>void;const exporter=vi.fn(()=>new Promise<StageExport>(r=>resolve=r)),{root,controls}=setup(exporter)
 root.querySelector<HTMLButtonElement>('.save-session')!.click();root.querySelector<HTMLButtonElement>('.save-flattened')!.click()
 expect(exporter).toHaveBeenCalledTimes(1);controls.busy(true);resolve(result);await Promise.resolve();await Promise.resolve()
 expect(create).not.toHaveBeenCalled();expect(root.querySelector<HTMLButtonElement>('.save-session')!.disabled).toBe(true)
})
it('reports export errors without starting a download',async()=>{
 const create=vi.fn();Object.defineProperty(URL,'createObjectURL',{value:create,configurable:true})
 const {root}=setup(vi.fn().mockRejectedValue(new Error('Pause playback before exporting.')))
 root.querySelector<HTMLButtonElement>('.save-flattened')!.click();await Promise.resolve();await Promise.resolve()
 expect(root.querySelector('.export-status')!.textContent).toContain('Pause playback');expect(create).not.toHaveBeenCalled()
})
