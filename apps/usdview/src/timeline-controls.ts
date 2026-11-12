// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { ViewerRuntime, ViewerTimeState } from './contracts'
import { frameFieldText, pyFloat } from './python-format'

// usdviewq/appController.py _resetFrameRange/_advanceFrame: one step per
// playback frame, default step = timeCodesPerSecond / framesPerSecond.
export function nextPlaybackTime(current: number, start: number, end: number, step: number, reverse = false): number {
  const next = current + (reverse ? -step : step)
  return next > end + 1e-9 ? start : next < start - 1e-9 ? end : Math.min(end,Math.max(start,next))
}
function setText(element:Element,text:string){if(element.textContent!==text)element.textContent=text}
function setValue(input:HTMLInputElement,value:string){if(input.value!==value)input.value=value}
function setAttribute(element:Element,name:string,value:string){if(element.getAttribute(name)!==value)element.setAttribute(name,value)}
export class TimelineControls {
  #state: ViewerTimeState | null = null
  #start = 0; #end = 0; #step = 1
  #blocked = true; #playing = false; #epoch = 0
  #queued: number | undefined
  #requested: number | undefined
  #draining: Promise<void> | undefined
  #dragging = false; #preview = 0
  #playbackIndex = 0; #playbackStarted = 0; #playbackTiming = 'N/A'
  #timer: ReturnType<typeof setTimeout> | undefined
  #following = false
  #wake: (()=>void) | undefined
  #elements = new Map<string,Element|null>()
  #inputs: HTMLInputElement[] | undefined
  #handleLeft = ''
  constructor(private root: ShadowRoot, private runtime: ()=>ViewerRuntime|undefined, private error:(error:unknown)=>void,
    /** appController.py:2123-2124: playback starting or stopping re-checks the validation window's Run button. */
    private playingChanged:()=>void=()=>{}) {}
  // The timeline's elements are part of the viewer's fixed shadow template, after the
  // prim tree in document order: a querySelector per refresh would walk every tree row
  // (tens of thousands on large stages) on each playback frame, so they are looked up once.
  #find<T extends Element>(selector:string):T|null {
    let element=this.#elements.get(selector)
    if(element===undefined||(element&&!this.root.contains(element)))this.#elements.set(selector,element=this.root.querySelector(selector))
    return element as T|null
  }
  #get<T extends HTMLElement>(selector:string):T { return this.#find<T>(selector)! }
  bind(signal:AbortSignal) {
    const options={signal}
    signal.addEventListener('abort',()=>{this.stop();this.#queued=undefined;this.#epoch++},{once:true})
    this.#get('.playback-current button').addEventListener('click',()=>{if(this.#playing)this.stop();else void this.play()},options)
    this.#get<HTMLInputElement>('[aria-label="Current frame"]').addEventListener('change',event=>{
      const raw=(event.target as HTMLInputElement).value.trim()
      this.stop();void this.seek(raw ? Number(raw) : NaN)
    },options)
    for(const [label,field] of [['Playback start frame','start'],['Playback end frame','end'],['Frame step','step']] as const) {
      this.#get<HTMLInputElement>(`[aria-label="${label}"]`).addEventListener('change',event=>{
        const raw=(event.target as HTMLInputElement).value.trim()
        this.stop()
        const value=raw ? Number(raw) : NaN
        if(!Number.isFinite(value)||(field==='step'&&value<=0)||(field==='start'&&value>this.#end)||(field==='end'&&value<this.#start)) {
          this.error(new Error('Use a finite range with start ≤ end and a positive frame step.'));this.refresh();return
        }
        if(field==='start')this.#start=value;else if(field==='end')this.#end=value;else this.#step=value
        this.refresh()
      },options)
    }
    const slider=this.#get('.frame-slider')
    const position=(event:PointerEvent)=>{
      const rect=slider.getBoundingClientRect()
      const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)))
      const value=Math.min(this.#end,this.#start+Math.round((this.#end-this.#start)*ratio/this.#step)*this.#step)
      this.#preview=value;this.#render(value)
      if(this.#get<HTMLInputElement>('.scrub-settings input[type="checkbox"]').checked)void this.seek(value)
    }
    slider.addEventListener('pointerdown',event=>{
      if(this.#blocked||!this.#state||event.button!==0)return
      this.stop();this.#dragging=true;slider.setPointerCapture(event.pointerId);position(event);event.preventDefault()
    },options)
    slider.addEventListener('pointermove',event=>{if(this.#dragging)position(event)},options)
    slider.addEventListener('pointerup',event=>{
      if(!this.#dragging)return
      this.#dragging=false;if(slider.hasPointerCapture(event.pointerId))slider.releasePointerCapture(event.pointerId)
      void this.seek(this.#preview)
    },options)
    slider.addEventListener('pointercancel',()=>{this.#dragging=false;this.refresh()},options)
    slider.addEventListener('keydown',event=>{
      if(this.#blocked||!this.#state)return
      let target:number
      if(event.key==='Home')target=this.#start
      else if(event.key==='End')target=this.#end
      else if(event.key==='ArrowRight'||event.key==='ArrowLeft')target=nextPlaybackTime(this.#state.current,this.#start,this.#end,this.#step,event.key==='ArrowLeft')
      else return
      event.preventDefault();this.stop();void this.seek(target)
    },options)
    this.refresh()
  }
  get playing() { return this.#playing }
  /** ?follow= (follow.ts): a sync leader owns the clock, so this timeline's Play and
   * frame stepping are disabled; the leader's frames arrive through seek(). */
  get following() { return this.#following }
  set following(value:boolean) { this.#following=value; if(value)this.stop(); else this.refresh() }
  /** ?follow= (follow.ts): the follower's own rate of frames shown, in the Playback field. */
  set followTiming(text:string) { this.#playbackTiming=text; const hud=this.#find('.playback-timing');if(hud)setText(hud,`   Playback: ${text}`) }
  async settled() { await this.#draining }
  getRange() { return {start:this.#start,end:this.#end} }
  reset(preserveStep = false) {
    this.stop();this.#queued=undefined
    this.#state=this.runtime()?.getTimeState?.()??null
    if(this.#state){this.#start=this.#state.start;this.#end=this.#state.end;if(!preserveStep)this.#step=this.#state.timeCodesPerSecond/this.#state.framesPerSecond}
    this.refresh()
  }
  busy(value:boolean) {this.#blocked=value;if(value){this.stop();this.#queued=undefined}this.refresh()}
  refresh(state?:ViewerTimeState) {
    this.#state=state??this.runtime()?.getTimeState?.()??null
    this.#render(this.#dragging?this.#preview:this.#state?.current??0)
  }
  #render(current:number) {
    // appController.py:3862,2210-2217: each frame sets the slider and frame field. Unchanged
    // values are not rewritten, so a playback frame only invalidates what it changes.
    const enabled=!!this.#state&&!!this.runtime()?.setTime&&!this.#blocked
    this.#find('.timeline')?.toggleAttribute('data-disabled',!enabled)
    if(!this.#inputs||!this.#inputs.every(input=>this.root.contains(input)))this.#inputs=[...this.root.querySelectorAll<HTMLInputElement>('.timeline input')]
    for(const input of this.#inputs)if(input.disabled!==!enabled)input.disabled=!enabled
    const play=this.#get<HTMLButtonElement>('.playback-current button')
    const playDisabled=!enabled||this.#end<=this.#start||this.#following
    if(play.disabled!==playDisabled)play.disabled=playDisabled
    setText(play,this.#playing?'Stop':'Play')
    const title=this.#following?'Following the sync leader: play in the leading usdview':'Play or stop the authored time range'
    if(play.title!==title)play.title=title
    // appController.py:1344,1363-1364,1396-1397,2210-2217: Python str() of float times; the
    // range fields stay empty without time samples; the frame field is round(frame, 2).
    const samples=this.#state?.hasTimeSamples!==false
    setValue(this.#get<HTMLInputElement>('[aria-label="Playback start frame"]'),this.#state&&samples?pyFloat(this.#start):'')
    setValue(this.#get<HTMLInputElement>('[aria-label="Playback end frame"]'),this.#state&&samples?pyFloat(this.#end):'')
    setValue(this.#get<HTMLInputElement>('[aria-label="Frame step"]'),pyFloat(this.#step))
    setValue(this.#get<HTMLInputElement>('[aria-label="Current frame"]'),frameFieldText(current))
    setText(this.#get('.stage-start'),pyFloat(this.#state?.stageStart??this.#state?.start??0))
    setText(this.#get('.stage-end'),pyFloat(this.#state?.stageEnd??this.#state?.end??0))
    const slider=this.#get('.frame-slider')
    setAttribute(slider,'aria-disabled',String(!enabled));setAttribute(slider,'aria-valuemin',String(this.#start));setAttribute(slider,'aria-valuemax',String(this.#end));setAttribute(slider,'aria-valuenow',String(current))
    const tabIndex=enabled?0:-1;if(slider.tabIndex!==tabIndex)slider.tabIndex=tabIndex
    const ratio=this.#end>this.#start?Math.max(0,Math.min(1,(current-this.#start)/(this.#end-this.#start))):0
    const handle=this.#get('.frame-handle'),left=`calc(${ratio*100}% - ${ratio*24}px)`
    if(this.#handleLeft!==left||handle.style.left===''){this.#handleLeft=left;handle.style.left=left}
    const hud=this.#find('.playback-timing');if(hud)setText(hud,`   Playback: ${this.#playbackTiming}`)
  }
  /** appController.py:2141-2153 _advanceFrame/_retreatFrame: one step with wrap-around,
   * without stopping playback. Steps accumulate while earlier frames are still drawing. */
  stepFrame(reverse:boolean):boolean {
    if(this.#blocked||this.#following||!this.#state||!this.runtime()?.setTime||this.#end<=this.#start)return false
    void this.seek(nextPlaybackTime(this.#requested??this.#state.current,this.#start,this.#end,this.#step,reverse))
    return true
  }
  async seek(time:number):Promise<void> {
    if(this.#blocked||!this.runtime()?.setTime)return
    if(!Number.isFinite(time)){this.error(new Error('Time must be a finite number.'));this.refresh();return}
    this.#queued=time;this.#requested=time
    if(this.#draining)return this.#draining
    const runtime=this.runtime()!
    const run=async()=>{
      while(this.#queued!==undefined&&!this.#blocked&&this.runtime()===runtime){
        const value=this.#queued;this.#queued=undefined
        try {const state=await runtime.setTime!(value);if(this.runtime()===runtime)this.refresh(state)}
        catch(error){this.#queued=undefined;this.stop();this.error(error);this.refresh();break}
      }
    }
    this.#draining=run()
    try{await this.#draining}finally{this.#draining=undefined;this.#requested=undefined}
  }
  stop(){const was=this.#playing;this.runtime()?.setPlaybackActive?.(false);this.#playing=false;if(was)this.playingChanged();this.#playbackTiming='N/A';this.#epoch++;clearTimeout(this.#timer);this.#wake?.();this.#wake=undefined;this.#render(this.#state?.current??0)}
  async play() {
    if(this.#blocked||this.#following||!this.#state||this.#end<=this.#start)return
    this.#playing=true;this.#playbackIndex=0;this.#playbackTiming='...';this.runtime()?.setPlaybackActive?.(true);this.playingChanged();const epoch=++this.#epoch;this.#render(this.#state.current)
    while(this.#playing&&epoch===this.#epoch){
      const started=performance.now()
      // appController.py:2126-2140: measure four actual frame intervals in
      // each five-frame group, including render work and rate limiting.
      if(this.#playbackIndex===0)this.#playbackStarted=started
      if(this.#playbackIndex===4){
        const ms=(started-this.#playbackStarted)/4
        this.#playbackTiming=`${ms.toFixed(2)} ms (${ms===0?'inf':(1000/ms).toFixed(2)} FPS)`
      }
      this.#playbackIndex=(this.#playbackIndex+1)%5
      await this.seek(nextPlaybackTime(this.#state!.current,this.#start,this.#end,this.#step))
      if(!this.#playing||epoch!==this.#epoch)break
      await new Promise<void>(resolve=>{this.#wake=resolve;this.#timer=setTimeout(resolve,Math.max(0,1000/this.#state!.framesPerSecond-(performance.now()-started)))})
      this.#wake=undefined
    }
  }
}
