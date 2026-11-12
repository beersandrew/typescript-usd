import { describe, expect, it, vi } from 'vitest'
import { FollowSeeker, followHudText, followPlaybackText, followSceneURL, parseFollowMessage, startFollow, type FollowTarget } from '../src/follow'

// Mock follower tests (no browser, no relay): the sync protocol message format
// documented at the top of src/follow.ts.
const msg=(m:Record<string,unknown>)=>JSON.stringify({v:1,file:'/h/scenes/a/scene.usda',camera:'/SceneA/Cameras/main_cam',frame:1,playing:false,...m})

class FakeSocket extends EventTarget {
  close=vi.fn()
  send(text:string){this.dispatchEvent(new MessageEvent('message',{data:text}))}
}
function setup(src='http://127.0.0.1:8765/scenes/a/scene.usda'){
  const sockets:FakeSocket[]=[]
  const viewer=Object.assign(new EventTarget(),{src,following:false,activeCameraPath:null as string|null,
    followTime:vi.fn(),followComplexity:vi.fn(),followCamera:vi.fn((path:string)=>{viewer.activeCameraPath=path})})
  const follow=startFollow('ws://127.0.0.1:8765',viewer as FollowTarget,{baseURI:'http://127.0.0.1:8765/viewer/',retryMs:5,
    socket:()=>{const s=new FakeSocket();sockets.push(s);return s}})
  return {viewer,sockets,follow}
}

describe('follow protocol',()=>{
  it('parses version 1 messages and rejects others',()=>{
    expect(parseFollowMessage(msg({frame:109.5,playing:true}))).toEqual({v:1,file:'/h/scenes/a/scene.usda',camera:'/SceneA/Cameras/main_cam',frame:109.5,playing:true})
    expect(parseFollowMessage(msg({camera:null}))?.camera).toBeNull()
    expect(parseFollowMessage(msg({v:2}))).toBeNull()
    expect(parseFollowMessage(msg({frame:'1'}))).toBeNull()
    expect(parseFollowMessage('nope')).toBeNull()
  })
  it('resolves a new leader file relative to the first one',()=>{
    const origin='http://127.0.0.1:8765/scenes/a/scene.usda'
    expect(followSceneURL('/h/scenes/a/scene.usda','/h/scenes/a/scene.usda',origin)).toBe(origin)
    expect(followSceneURL('/h/b.usda','/h/scenes/a/scene.usda',origin)).toBe('http://127.0.0.1:8765/b.usda')
    expect(followSceneURL('/h/views/01 a/view.usda','/h/scenes/a/scene.usda',origin)).toBe('http://127.0.0.1:8765/views/01%20a/view.usda')
  })
})

describe('follower',()=>{
  it('follows frame, play state and camera without reopening the same file',()=>{
    const {viewer,sockets}=setup()
    expect(viewer.following).toBe(true)   // its own Play is disabled
    sockets[0]!.send(msg({frame:42,playing:true}))
    expect(viewer.src).toBe('http://127.0.0.1:8765/scenes/a/scene.usda')
    expect(viewer.followCamera).toHaveBeenCalledWith('/SceneA/Cameras/main_cam')
    expect(viewer.followTime).toHaveBeenLastCalledWith(42,true)
    sockets[0]!.send(msg({frame:43,playing:true}))
    expect(viewer.followCamera).toHaveBeenCalledTimes(1)
    expect(viewer.followTime).toHaveBeenLastCalledWith(43,true)
    sockets[0]!.send(msg({frame:43,playing:false,camera:null}))
    expect(viewer.followTime).toHaveBeenLastCalledWith(43,false)
  })
  it('reopens on a file change and applies the frame once the scene loads',async()=>{
    const {viewer,sockets}=setup()
    sockets[0]!.send(msg({frame:5}))
    sockets[0]!.send(msg({file:'/h/b.usda',camera:'/SceneB/Cameras/main_cam',frame:7}))
    expect(viewer.src).toBe('http://127.0.0.1:8765/b.usda')
    expect(viewer.followTime).toHaveBeenLastCalledWith(5,false)
    viewer.dispatchEvent(new Event('scene-loaded'))
    await new Promise(r=>setTimeout(r,1))
    expect(viewer.followCamera).toHaveBeenLastCalledWith('/SceneB/Cameras/main_cam')
    expect(viewer.followTime).toHaveBeenLastCalledWith(7,false)
  })
  it('an unpaired file is tried as a file: URL (the normal load error)',()=>{
    const {viewer,sockets}=setup('./assets/cube.usda')
    sockets[0]!.send(msg({}))
    expect(viewer.src).toBe('file:///h/scenes/a/scene.usda')
  })
  it('stops when the relay goes away and reconnects',async()=>{
    const {viewer,sockets,follow}=setup()
    sockets[0]!.send(msg({frame:9,playing:true}))
    sockets[0]!.dispatchEvent(new Event('close'))
    expect(viewer.followTime).toHaveBeenLastCalledWith(9,false)
    await new Promise(r=>setTimeout(r,20))
    expect(sockets.length).toBe(2)
    follow.close()
    expect(sockets[1]!.close).toHaveBeenCalled()
    expect(viewer.following).toBe(false)
  })
})

// A fake timeline whose seek takes `latency` ms (fake timers), driven through startFollow
// by a fake socket, as usd-viewer.ts's followTime/followComplexity drive FollowSeeker.
function timedFollower(latency:number){
  const log:string[]=[];let current=0,complexity='low'
  const seek=vi.fn((time:number)=>new Promise<number>(resolve=>{log.push(`seek ${time}`);setTimeout(()=>{current=time;resolve(current)},latency)}))
  const seeker=new FollowSeeker({seek,now:()=>Date.now(),
    complexity:async id=>{log.push(`complexity ${id}`);await new Promise(r=>setTimeout(r,latency));complexity=id}})
  const viewer=Object.assign(new EventTarget(),{src:'http://127.0.0.1:8765/scenes/a/scene.usda',following:false,activeCameraPath:null as string|null,
    followTime:(time:number,playing:boolean)=>void seeker.request(time,playing),
    followComplexity:vi.fn((id:'low'|'medium'|'high'|'veryhigh')=>{if(id!==complexity)void seeker.setComplexity(id)}),followCamera:vi.fn()})
  let socket!:FakeSocket
  startFollow('ws://127.0.0.1:8765',viewer as FollowTarget,{baseURI:'http://127.0.0.1:8765/viewer/',socket:()=>socket=new FakeSocket()})
  return {seek,seeker,viewer,log,send:(m:Record<string,unknown>)=>socket.send(msg({camera:null,...m})),get complexity(){return complexity}}
}

describe('follower seek coalescing',()=>{
  it('24 frames during one 200 ms seek: two seeks, ending on the newest',async()=>{
    vi.useFakeTimers()
    try{
      const f=timedFollower(200)
      for(let frame=1;frame<=24;frame++){f.send({frame,playing:true});await vi.advanceTimersByTimeAsync(8)}
      await vi.advanceTimersByTimeAsync(1000)
      expect(f.seek.mock.calls.map(c=>c[0])).toEqual([1,24])
      expect(f.seeker.status).toMatchObject({leader:24,shown:24,renderMs:200})
    }finally{vi.useRealTimers()}
  })
  it('stays bounded while the leader plays 24 frames/s against 200 ms seeks, and lands on the paused frame',async()=>{
    vi.useFakeTimers()
    try{
      const f=timedFollower(200);let worst=0
      for(let frame=1;frame<=96;frame++){            // four seconds of playback
        f.send({frame,playing:true});await vi.advanceTimersByTimeAsync(1000/24)
        const {leader,shown}=f.seeker.status;if(shown!==undefined)worst=Math.max(worst,leader!-shown)
      }
      expect(worst).toBeLessThanOrEqual(10)          // about one seek (200 ms = 4.8 frames) plus the waiting one
      expect(f.seek.mock.calls.length).toBeLessThanOrEqual(21)
      expect(f.seeker.status.framesPerSecond).toBeCloseTo(5,0)
      f.send({frame:96.5,playing:false})             // the leader pauses between frames
      await vi.advanceTimersByTimeAsync(1000)
      expect(f.seek.mock.calls.at(-1)![0]).toBe(96.5)
      expect(f.seeker.status).toMatchObject({leader:96.5,shown:96.5,playing:false,framesPerSecond:undefined})
    }finally{vi.useRealTimers()}
  })
  it("applies the leader's complexity between seeks, and leaves it when absent",async()=>{
    vi.useFakeTimers()
    try{
      const f=timedFollower(50)
      f.send({frame:1,playing:true})
      f.send({frame:2,playing:true,complexity:'high'})
      f.send({frame:3,playing:true,complexity:'high'})
      await vi.advanceTimersByTimeAsync(500)
      expect(f.complexity).toBe('high')
      expect(f.log).toEqual(['seek 1','complexity high','seek 3'])
      f.send({frame:4,playing:false})
      await vi.advanceTimersByTimeAsync(500)
      expect(f.viewer.followComplexity).toHaveBeenCalledTimes(2)
      expect(f.complexity).toBe('high')
    }finally{vi.useRealTimers()}
  })
  it('parses complexity only as a usdAppUtils id',()=>{
    expect(parseFollowMessage(msg({complexity:'veryhigh'}))?.complexity).toBe('veryhigh')
    expect(parseFollowMessage(msg({complexity:'ultra'}))?.complexity).toBeUndefined()
    expect(parseFollowMessage(msg({}))).not.toHaveProperty('complexity')
  })
  it('HUD text: leader, shown, behind and render time; the Playback field shows the frames-shown rate',()=>{
    expect(followHudText({leader:102,shown:98,renderMs:41.234,framesPerSecond:12.5,playing:true})).toBe('leader 102.0 · shown 98.0 · behind 4.0 frames · render 41.23 ms')
    expect(followHudText({leader:3,shown:undefined,renderMs:undefined,framesPerSecond:undefined,playing:true})).toBe('leader 3.0 · shown — · behind — frames · render — ms')
    expect(followPlaybackText({leader:102,shown:98,renderMs:41,framesPerSecond:12.5,playing:true})).toBe('80.00 ms (12.50 FPS)')
    expect(followPlaybackText({leader:102,shown:98,renderMs:41,framesPerSecond:undefined,playing:true})).toBe('...')
    expect(followPlaybackText({leader:102,shown:102,renderMs:41,framesPerSecond:12.5,playing:false})).toBe('N/A')
  })
})
