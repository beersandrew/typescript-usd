// @vitest-environment jsdom
import { expect,it,vi } from 'vitest'
import { CompositionControls,compositionMenu,compositionDialog } from '../src/composition-controls'
import type { ViewerRuntime } from '../src/contracts'
it('restores displayed state after a rejected edit and blocks concurrent review commands',async()=>{
  const root=document.createElement('div').attachShadow({mode:'open'});root.innerHTML=compositionMenu+compositionDialog
  let reject!:(error:Error)=>void
  const apply=vi.fn(()=>new Promise<never>((_,r)=>reject=r)), changed=vi.fn()
  const runtime={getCompositionState:()=>({path:'/World',imageable:true,visibility:'inherited',loadable:true,loaded:true,variants:[{name:'shape',choices:['cube','sphere'],selection:'cube'}],layers:[]}),applyCompositionCommand:apply} as unknown as ViewerRuntime
  const controls=new CompositionControls(root,()=>runtime,()=>'/World',changed)
  controls.bind(new AbortController().signal);controls.busy(false)
  const select=root.querySelector('select')!;select.value='sphere';select.dispatchEvent(new Event('change'))
  expect(apply).toHaveBeenCalledWith({kind:'variant',path:'/World',set:'shape',selection:'sphere'})
  root.querySelector<HTMLButtonElement>('[data-review=hide]')!.click();expect(apply).toHaveBeenCalledTimes(1)
  reject(new Error('Candidate failed'));await vi.waitFor(()=>expect(root.querySelector('.composition-error')!.textContent).toContain('Candidate failed'))
  expect(root.querySelector('select')!.value).toBe('cube');expect(changed).not.toHaveBeenCalled()
})
