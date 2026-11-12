// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineControls } from '../src/timeline-controls'
import type { ViewerRuntime, ViewerTimeState } from '../src/contracts'
function setup(framesPerSecond=24) {
 const root=document.createElement('div').attachShadow({mode:'open'})
 root.innerHTML=`<div class="timeline"><span class="stage-start"></span><span class="stage-end"></span>
 <input aria-label="Playback start frame"><input aria-label="Playback end frame"><input aria-label="Frame step"><input aria-label="Current frame">
 <div class="frame-slider"><span class="frame-handle"></span></div><div class="scrub-settings"><input type="checkbox" checked></div><div class="playback-current"><button>Play</button></div></div><span class="playback-timing"></span>`
 let state:ViewerTimeState={start:10,end:14,current:10,framesPerSecond,timeCodesPerSecond:48}
 const runtime={setPlaybackActive:vi.fn(),getTimeState:()=>state,setTime:vi.fn(async(time:number)=>state={...state,current:time})} as unknown as ViewerRuntime
 const error=vi.fn(),controls=new TimelineControls(root,()=>runtime,error),abort=new AbortController()
 controls.bind(abort.signal);controls.reset();controls.busy(false)
 return {root,runtime,controls,abort,error}
}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
afterEach(()=>vi.useRealTimers())
describe('timeline interaction',()=>{
 it('uses authored bounds and native timeCodesPerSecond / FPS step, then wraps playback',async()=>{
  vi.useFakeTimers();const {root,runtime,controls}=setup()
  expect(root.querySelector<HTMLInputElement>('[aria-label="Frame step"]')!.value).toBe('2.0')
  expect(root.querySelector('.stage-start')!.textContent).toBe('10.0')
  const playing=controls.play();await tick()
  expect(runtime.setPlaybackActive).toHaveBeenLastCalledWith(true)
  expect(runtime.setTime).toHaveBeenLastCalledWith(12)
  await vi.advanceTimersByTimeAsync(42)
  expect(runtime.setTime).toHaveBeenLastCalledWith(14)
  await vi.advanceTimersByTimeAsync(42)
  expect(runtime.setTime).toHaveBeenLastCalledWith(10)
  controls.stop();await playing
  expect(runtime.setPlaybackActive).toHaveBeenLastCalledWith(false)
  const count=vi.mocked(runtime.setTime!).mock.calls.length
  await vi.advanceTimersByTimeAsync(1000)
  expect(runtime.setTime).toHaveBeenCalledTimes(count)
 })
 it('commits typed frame and range edits before rerendering controls',async()=>{
  const {root,runtime}=setup()
  const frame=root.querySelector<HTMLInputElement>('[aria-label="Current frame"]')!
  frame.value='14';frame.dispatchEvent(new Event('change'));await tick()
  expect(runtime.setTime).toHaveBeenLastCalledWith(14)
  const end=root.querySelector<HTMLInputElement>('[aria-label="Playback end frame"]')!
  end.value='20';end.dispatchEvent(new Event('change'))
  expect(end.value).toBe('20.0')
 })
 it('coalesces rapid scrubs while a frame is rendering',async()=>{
  const {runtime,controls}=setup();let resolve!:(s:ViewerTimeState)=>void
  vi.mocked(runtime.setTime!).mockImplementationOnce(()=>new Promise(r=>resolve=r))
  const first=controls.seek(11);void controls.seek(12);void controls.seek(14)
  expect(runtime.setTime).toHaveBeenCalledTimes(1)
  resolve({...runtime.getTimeState!()!,current:11});await first
  expect(vi.mocked(runtime.setTime!).mock.calls.map(call=>call[0])).toEqual([11,14])
 })
 it('stops after failure and reports the retained current frame',async()=>{
  const {runtime,controls,error,root}=setup()
  vi.mocked(runtime.setTime!).mockRejectedValueOnce(new Error('unsupported animated topology'))
  await controls.play()
  expect(error).toHaveBeenCalledWith(expect.objectContaining({message:'unsupported animated topology'}))
  expect(root.querySelector<HTMLInputElement>('[aria-label="Current frame"]')!.value).toBe('10.0')
  expect(root.querySelector('button')!.textContent).toBe('Play')
  expect(runtime.setPlaybackActive).toHaveBeenLastCalledWith(false)
 })
 it('blocks seeking during scene operations and disconnect removes keyboard handlers',async()=>{
  const {root,runtime,controls,abort}=setup(),slider=root.querySelector('.frame-slider')!
  controls.busy(true);await controls.seek(12)
  expect(runtime.setTime).not.toHaveBeenCalled()
  controls.busy(false);abort.abort()
  slider.dispatchEvent(new KeyboardEvent('keydown',{key:'End'}));await tick()
  expect(runtime.setTime).not.toHaveBeenCalled()
 })
})

// Expected strings are captured by pinned native AppController._advanceFrameForPlayback
// and HUD.updateGroup, not derived from the viewer's formatting implementation.
import nativeHud from './fixtures/usdviewHud/expected.json'
it.each(nativeHud.playback)('samples actual playback cadence ($text) independently of authored FPS',async ({intervalMs,text})=>{
 vi.useFakeTimers();const {root,runtime,controls}=setup(25)
 let current=10
 vi.mocked(runtime.setTime!).mockImplementation(async time=>{
  if(intervalMs===251)await new Promise(resolve=>setTimeout(resolve,250))
  current=time;return {...runtime.getTimeState!()!,current}
 })
 const playing=controls.play();await tick()
 expect(root.querySelector('.playback-timing')!.textContent).toBe('   Playback: ...')
 await vi.advanceTimersByTimeAsync(intervalMs===251?1300:175)
 expect(root.querySelector('.playback-timing')!.textContent).toBe(`   Playback: ${text}`)
 controls.stop();await vi.advanceTimersByTimeAsync(300);await playing
 expect(root.querySelector('.playback-timing')!.textContent).toBe(nativeHud.lines[1])
 const again=controls.play();await tick()
 expect(root.querySelector('.playback-timing')!.textContent).toBe('   Playback: ...')
 controls.stop();await vi.advanceTimersByTimeAsync(300);await again
})
describe('following a sync leader (follow.ts)',()=>{
 it('disables Play and frame stepping, and stops its own playback',async()=>{
  vi.useFakeTimers();const {root,runtime,controls}=setup()
  const playing=controls.play();await tick()
  expect(controls.playing).toBe(true)
  controls.following=true;await playing
  expect(controls.playing).toBe(false)
  expect(runtime.setPlaybackActive).toHaveBeenLastCalledWith(false)
  expect(root.querySelector<HTMLButtonElement>('.playback-current button')!.disabled).toBe(true)
  await controls.play();expect(controls.playing).toBe(false)
  expect(controls.stepFrame(false)).toBe(false)
  await controls.seek(14);expect(runtime.setTime).toHaveBeenLastCalledWith(14)   // the leader's frames still apply
  controls.following=false
  expect(root.querySelector<HTMLButtonElement>('.playback-current button')!.disabled).toBe(false)
 })
})
