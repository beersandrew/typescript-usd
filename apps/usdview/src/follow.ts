// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdAppUtils/complexityArgs.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ?follow=ws://127.0.0.1:8765: follow a sync relay's leader.
// No upstream counterpart: native usdview has no follow mode. A sync relay plays one
// file in upstream usdview and other viewers side by side; upstream usdview (with a
// sync plugin) leads and broadcasts
//   {"v":1, "file": <absolute path>, "camera": <prim path>, "frame": <float>, "playing": <bool>}
// A follower runs no clock of its own: each message sets the frame and play state,
// and a changed camera or file switches camera or reopens. A null camera leaves the
// camera as it is. The leader names files by absolute path; this page loads over
// HTTP, so a new file resolves relative to the first one, against the scene URL
// this page opened with (?scene=). Without that pairing the path is tried as a
// file: URL, which fails with the viewer's normal error.
// The optional "complexity" (usdAppUtils/complexityArgs.py ids: low, medium, high,
// veryhigh) sets Display > Complexity, as the camera and frame are applied; absent, the
// follower keeps its own. A leader sends one message per frame while playing; a frame
// change (seek and draw) can take longer than that, so FollowSeeker keeps at most one
// seek in flight and only the newest requested frame, never a backlog.
// Ported from the archived typescript-usdview (branch sync-follow, 532797f and 47fe741).
import { complexities } from './display-settings'
import { frameFieldText } from './python-format'

export type FollowComplexity = keyof typeof complexities
export interface FollowMessage {v:1;file:string|null;camera:string|null;frame:number;playing:boolean;complexity?:FollowComplexity}

export function parseFollowMessage(text:string):FollowMessage|null{
  let m:unknown
  try{m=JSON.parse(text)}catch{return null}
  if(!m||typeof m!=='object')return null
  const {v,file,camera,frame,playing,complexity}=m as Record<string,unknown>
  if(v!==1||typeof frame!=='number'||!Number.isFinite(frame)||typeof playing!=='boolean')return null
  const message:FollowMessage={v:1,file:typeof file==='string'&&file?file:null,camera:typeof camera==='string'&&camera?camera:null,frame,playing}
  if(typeof complexity==='string'&&Object.hasOwn(complexities,complexity))message.complexity=complexity as FollowComplexity
  return message
}

/** What the follower shows against the leader: the leader's newest frame, the frame
 * shown, the last frame change's duration (seek plus draw) and the rate of frames
 * shown while the leader plays. */
export interface FollowStatus {leader:number|undefined;shown:number|undefined;renderMs:number|undefined;framesPerSecond:number|undefined;playing:boolean}

/** At most one seek in flight: a frame requested meanwhile replaces any frame still
 * waiting, and the newest is sought when the current seek settles. A requested
 * complexity is applied between seeks (a display change cannot run during one). */
export class FollowSeeker {
  #pending:number|undefined; #complexity:FollowComplexity|undefined; #running:Promise<void>|undefined
  #leader:number|undefined; #shown:number|undefined; #renderMs:number|undefined; #playing=false
  #shownAt:number[]=[]
  constructor(private ops:{seek(time:number):Promise<number|undefined|void>,complexity?(id:FollowComplexity):Promise<void>,now?():number,changed?(status:FollowStatus):void}) {}
  get status():FollowStatus {
    const t=this.#shownAt,fps=t.length>1&&t.at(-1)!>t[0]!?(t.length-1)*1000/(t.at(-1)!-t[0]!):undefined
    return {leader:this.#leader,shown:this.#shown,renderMs:this.#renderMs,framesPerSecond:fps,playing:this.#playing}
  }
  /** Resolves once nothing is in flight or waiting. */
  settled():Promise<void> {return this.#running??Promise.resolve()}
  request(frame:number,playing:boolean):Promise<void> {
    this.#leader=frame;this.#playing=playing;this.#pending=frame
    if(!playing)this.#shownAt=[]
    this.ops.changed?.(this.status)
    return this.#run()
  }
  setComplexity(id:FollowComplexity):Promise<void> {this.#complexity=id;return this.#run()}
  reset() {this.#pending=this.#complexity=this.#leader=this.#shown=this.#renderMs=undefined;this.#shownAt=[];this.#playing=false}
  #run():Promise<void> {
    if(this.#running)return this.#running
    if(this.#pending===undefined&&this.#complexity===undefined)return Promise.resolve()
    const now=this.ops.now??(()=>performance.now())
    const run=async()=>{
      while(this.#pending!==undefined||this.#complexity!==undefined){
        if(this.#complexity!==undefined){
          const id=this.#complexity;this.#complexity=undefined
          try{await this.ops.complexity?.(id)}catch{/* the viewer reports it */}
          continue
        }
        const frame=this.#pending!;this.#pending=undefined
        const started=now()
        let shown:number|undefined|void
        try{shown=await this.ops.seek(frame)}catch{/* the viewer reports it */}
        const previous=this.#shown
        this.#shown=typeof shown==='number'?shown:previous
        if(this.#shown!==previous){
          this.#renderMs=now()-started
          if(this.#playing){this.#shownAt.push(now());if(this.#shownAt.length>5)this.#shownAt.shift()}
        }
        this.ops.changed?.(this.status)
      }
    }
    const running=this.#running=run().finally(()=>{if(this.#running===running)this.#running=undefined})
    return running
  }
}

/** The HUD's follow line: `leader <frame> · shown <frame> · behind <n> frames · render <ms> ms`. */
export function followHudText(s:FollowStatus):string {
  const shown=s.shown===undefined?'—':frameFieldText(s.shown)
  const behind=s.leader===undefined||s.shown===undefined?'—':frameFieldText(s.leader-s.shown)
  const ms=s.renderMs===undefined?'—':s.renderMs.toFixed(2)
  return `leader ${s.leader===undefined?'—':frameFieldText(s.leader)} · shown ${shown} · behind ${behind} frames · render ${ms} ms`
}
/** The HUD's Playback field while following: the follower's own rate of frames shown,
 * in timeline-controls.ts's Playback format (appController.py:2126-2140). */
export function followPlaybackText(s:FollowStatus):string {
  if(!s.playing)return 'N/A'
  if(s.framesPerSecond===undefined)return '...'
  return `${(1000/s.framesPerSecond).toFixed(2)} ms (${s.framesPerSecond.toFixed(2)} FPS)`
}

/** The URL for leader file `file`, given that leader file `originFile` is shown
 * from `originURL`: the relative path between the files, resolved against it. */
export function followSceneURL(file:string,originFile:string,originURL:string):string{
  const from=originFile.split('/').slice(0,-1).filter(Boolean),to=file.split('/').filter(Boolean)
  let i=0
  while(i<from.length&&i<to.length-1&&from[i]===to[i])i++
  const rel=[...from.slice(i).map(()=>'..'),...to.slice(i)].map(encodeURIComponent).join('/')
  return new URL(rel,originURL).href
}

/** What the follower drives: the `<usd-viewer>` element. */
export interface FollowTarget extends EventTarget {
  src:string
  readonly activeCameraPath:string|null
  following:boolean
  followTime(time:number,playing:boolean):void
  followCamera(path:string):void
  followComplexity(id:FollowComplexity):void
}

type Socket=Pick<WebSocket,'close'|'addEventListener'>

export function startFollow(url:string,viewer:FollowTarget,options:{baseURI?:string,socket?:(url:string)=>Socket,retryMs?:number}={}):{close():void}{
  const base=options.baseURI??document.baseURI,socket=options.socket??(u=>new WebSocket(u)),retryMs=options.retryMs??1000
  let origin:{file:string,url:string}|undefined,shown:string|undefined,last:FollowMessage|undefined
  let ws:Socket|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false
  const basename=(p:string)=>p.split('/').filter(Boolean).at(-1)??''
  const apply=(m:FollowMessage)=>{
    last=m
    if(m.file&&m.file!==shown){
      const current=new URL(viewer.src||'.',base).href
      if(!origin&&basename(new URL(current).pathname)===basename(m.file))origin={file:m.file,url:current}
      shown=m.file
      const target=origin?followSceneURL(m.file,origin.file,origin.url):new URL('file://'+m.file).href
      if(target!==current){viewer.src=target;return}   // the frame and camera follow on scene-loaded
    }
    if(m.camera&&m.camera!==viewer.activeCameraPath)viewer.followCamera(m.camera)
    if(m.complexity)viewer.followComplexity(m.complexity)
    viewer.followTime(m.frame,m.playing)
  }
  const onLoaded=()=>{if(last)setTimeout(()=>{if(last&&!closed)apply(last)},0)}
  viewer.addEventListener('scene-loaded',onLoaded)
  viewer.following=true
  const connect=()=>{
    if(closed)return
    const s=ws=socket(url)
    s.addEventListener('message',event=>{
      const data=(event as MessageEvent).data
      const m=typeof data==='string'?parseFollowMessage(data):null
      if(m)apply(m)
    })
    s.addEventListener('close',()=>{
      if(ws!==s)return
      // The leader went away: stop with it, then wait for the relay to return.
      if(last?.playing){last={...last,playing:false};viewer.followTime(last.frame,false)}
      if(!closed)timer=setTimeout(connect,retryMs)
    })
  }
  connect()
  return {close(){closed=true;clearTimeout(timer);viewer.following=false;viewer.removeEventListener('scene-loaded',onLoaded);ws?.close()}}
}
