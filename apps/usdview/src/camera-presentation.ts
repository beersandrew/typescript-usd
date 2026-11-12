// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdviewq/viewSettingsDataModel.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/** OpenUSD 26.11.1 usdviewq/viewSettingsDataModel.py:124-125,184-188. */
export type RGBA=[number,number,number,number]
export type Rect=[number,number,number,number]
export interface CameraPresentationSettings {
 cameraOracles:boolean
 cameraMaskMode:'none'|'partial'|'full'
 cameraMaskOutline:boolean
 cameraMaskColor:RGBA
 cameraReticlesInside:boolean
 cameraReticlesOutside:boolean
 cameraReticlesColor:RGBA
}
export const defaultCameraPresentation=():CameraPresentationSettings=>({cameraOracles:false,cameraMaskMode:'none',cameraMaskOutline:false,cameraMaskColor:[.1,.1,.1,1],cameraReticlesInside:false,cameraReticlesOutside:false,cameraReticlesColor:[0,.7,1,1]})
export function mergeCameraPresentation(current:CameraPresentationSettings,patch:Partial<CameraPresentationSettings>):CameraPresentationSettings {
 const next={...current,...patch}
 if(!['none','partial','full'].includes(next.cameraMaskMode))throw new Error('Unknown camera mask mode')
 for(const key of ['cameraOracles','cameraMaskOutline','cameraReticlesInside','cameraReticlesOutside'] as const)if(typeof next[key]!=='boolean')throw new Error(`${key} must be boolean`)
 for(const key of ['cameraMaskColor','cameraReticlesColor'] as const){
  if(!Array.isArray(next[key])||next[key].length!==4||next[key].some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error(`${key} must be RGBA values between 0 and 1`)
  next[key]=[...next[key]]
 }
 return next
}
export const cameraFitsViewport=(s:CameraPresentationSettings)=>s.cameraMaskMode!=='none'||s.cameraMaskOutline||s.cameraReticlesInside||s.cameraReticlesOutside
/** stageView.py:45-70,1318-1347; physical GL viewport converted to logical QPainter rect. */
export function cameraViewport(width:number,height:number,aspect:number,dpr=1):Rect {
 const w=Math.min(width,height*aspect),h=Math.min(height,width/aspect)
 let x=Math.floor((width-w)/2),y=Math.floor((height-h)/2)
 let iw=Math.ceil((width+w)/2)-x,ih=Math.ceil((height+h)/2)-y
 if(iw-w>1){x++;iw-=2}if(ih-h>1){y++;ih-=2}
 return [x/dpr,(height-y-ih)/dpr,iw/dpr,ih/dpr]
}
/** stageView.py:191-236: reticles have alternating 7/15px ticks at sixths. */
export function cameraReticles([left,top,width,height]:Rect,inside:boolean,outside:boolean):Rect[]{
 const a=outside?[7,15]:[0,0],d=inside?[7,15]:[0,0],rects:Rect[]=[]
 for(let i=0;i<5;i++){
  const h=a[i&1]!+d[i&1]!,x=left-1+Math.floor((i+1)*width/6)
  rects.push([x,top-a[i&1]!,2.6,h],[x,top+height-d[i&1]!,2.6,h])
 }
 for(let i=0;i<5;i++){
  const w=a[i&1]!+d[i&1]!,y=top+height-1-Math.floor((i+1)*height/6)
  rects.push([left-a[i&1]!,y,w,2.6],[left+width-d[i&1]!,y,w,2.6])
 }
 return rects
}
/** stageView.py:133-172,238-259: rectangle difference, ordered left/right/top/bottom. */
export function cameraMask(width:number,height:number,[x,y,w,h]:Rect):Rect[]{
 const rects:Rect[]=[]
 if(x>0)rects.push([0,0,x,height])
 if(x+w<width)rects.push([x+w,0,width-x-w,height])
 if(y>0)rects.push([x,0,w,y])
 if(y+h<height)rects.push([x,y+h,w,height-y-h])
 return rects
}
/** stageView.py:1989-2015: a full mask crops picking to the camera viewport.
 * Native compares incoming top-origin y against its centered GL viewport. */
export function cameraImageContainsPoint(x:number,y:number,width:number,height:number,aspect:number|null,s:CameraPresentationSettings):boolean{
 let rect:Rect=[0,0,width,height]
 if(s.cameraMaskMode==='full'&&aspect!==null){rect=cameraViewport(width,height,aspect);rect[1]=height-rect[1]-rect[3]}
 return x>=rect[0]&&x<=rect[0]+rect[2]&&y>=rect[1]&&y<=rect[1]+rect[3]
}
