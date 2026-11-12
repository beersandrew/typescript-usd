// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {GfConvertDisplayToLinear,Vec4f} from 'typescript-usd/gf'
import {stencilOps} from './viewport-overlays'
import {cameraMask,cameraReticles,cameraViewport,type CameraPresentationSettings,type Rect,type RGBA} from './camera-presentation'
export interface ColoredRect {rect:Rect;color:RGBA}
/** stageView.py:1550-1573: mask opacity, black frame, reticles and display colors. */
export function cameraOverlayRects(width:number,height:number,aspect:number|null,s:CameraPresentationSettings,dpr=1):ColoredRect[]{
 const locked=aspect!==null
 const rect=cameraViewport(width,height,aspect??width/height,dpr),logicalWidth=width/dpr,logicalHeight=height/dpr,result:ColoredRect[]=[]
 const color=(c:RGBA,alpha:number)=>Array.from(GfConvertDisplayToLinear(new Vec4f(c[0],c[1],c[2],alpha)).data) as RGBA
 if(s.cameraMaskMode!=='none')for(const mask of cameraMask(logicalWidth,logicalHeight,rect))result.push({rect:mask,color:color(s.cameraMaskColor,s.cameraMaskMode==='full'?1:s.cameraMaskColor[3]*.45)})
 if(s.cameraMaskOutline){const [x,y,w,h]=rect;for(const edge of [[x-.5,y-.5,w+1,1],[x-.5,y+h-.5,w+1,1],[x-.5,y-.5,1,h+1],[x+w-.5,y-.5,1,h+1]] as Rect[])result.push({rect:edge,color:[0,0,0,1]})}
 if(locked&&(s.cameraReticlesInside||s.cameraReticlesOutside))for(const tick of cameraReticles(rect,s.cameraReticlesInside,s.cameraReticlesOutside))result.push({rect:tick,color:color(s.cameraReticlesColor,s.cameraReticlesColor[3]*.85)})
 return result.map(item=>({rect:item.rect.map(v=>v*dpr) as Rect,color:item.color}))
}
/** Camera frusta share scene depth; mask/reticle rectangles overlay the image.
 * QPainter composites its converted QColor in display space: the 2D pass draws
 * on the presented (display-encoded, top-left) canvas through its unorm view.
 * The frusta use the native Y-up intermediate, which presentation flips once.
 * Upstream stageView.py:934-992,1550-1573. Included in canvas image captures. */
export class ViewportCameraOverlays {
 private lines:GPURenderPipeline
 private rectangles:GPURenderPipeline
 private uniform:GPUBuffer
 private bindGroup:GPUBindGroup
 private vertices:GPUBuffer
 private capacity=0
 constructor(private device:GPUDevice,format:GPUTextureFormat,sampleCount=1,private depthFormat:GPUTextureFormat='depth24plus',screenFormat:GPUTextureFormat=format.replace('-srgb','') as GPUTextureFormat){
  const shader=device.createShaderModule({code:`
   struct Settings { matrix:mat4x4<f32>, size:vec2<f32>, padding:vec2<f32> }
   @group(0) @binding(0) var<uniform> settings:Settings;
   struct Out { @builtin(position) position:vec4<f32>, @location(0) color:vec4<f32> }
   @vertex fn world(@location(0) p:vec3<f32>,@location(1) c:vec4<f32>)->Out{var o:Out;o.position=vec4(p,1)*settings.matrix;o.position.y=-o.position.y;o.color=c;return o;}
   @vertex fn screen(@location(0) p:vec3<f32>,@location(1) c:vec4<f32>)->Out{var o:Out;o.position=vec4(p.x/settings.size.x*2-1,settings.padding.x*(p.y/settings.size.y*2-1),0,1);o.color=c;return o;}
   @fragment fn fs(i:Out)->@location(0) vec4<f32>{return i.color;}
  `})
  const buffers:GPUVertexBufferLayout[]=[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x4'}]}]
  const blend:GPUBlendState={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}
  const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}}]}),pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]})
  this.lines=device.createRenderPipeline({label:'usdview camera oracles',layout:pipelineLayout,vertex:{module:shader,entryPoint:'world',buffers},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend}]},primitive:{topology:'line-list'},multisample:{count:sampleCount},depthStencil:{format:depthFormat,depthWriteEnabled:false,depthCompare:'less-equal'}})
  this.rectangles=device.createRenderPipeline({label:'usdview camera masking and reticles',layout:pipelineLayout,vertex:{module:shader,entryPoint:'screen',buffers},fragment:{module:shader,entryPoint:'fs',targets:[{format:screenFormat,blend}]},primitive:{topology:'triangle-list'}})
  this.uniform=device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.bindGroup=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:this.uniform}}]})
  this.vertices=device.createBuffer({size:4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})
 }
 /** Frusta into the scene's multisampled color and depth. */
 drawGuides(color:GPUTextureView,depth:GPUTextureView,matrix:Float32Array<ArrayBuffer>,width:number,height:number,guides:Float32Array<ArrayBuffer>){this.draw(color,depth,matrix,width,height,guides,[],undefined)}
 /** Mask and reticle rectangles onto the presented top-left canvas (unorm view). */
 drawRects(screen:GPUTextureView,matrix:Float32Array<ArrayBuffer>,width:number,height:number,rects:ColoredRect[]){this.draw(undefined,undefined,matrix,width,height,new Float32Array(0),rects,screen)}
 private draw(color:GPUTextureView|undefined,depth:GPUTextureView|undefined,matrix:Float32Array<ArrayBuffer>,width:number,height:number,guides:Float32Array<ArrayBuffer>,rects:ColoredRect[],screenColor:GPUTextureView|undefined){
  const values:number[]=[]
  for(let i=0;i<guides.length;i+=3)values.push(guides[i]!,guides[i+1]!,guides[i+2]!,0.82745,0.39608,0.1647,1)
  const lineCount=values.length/7
  for(const {rect:[x,y,w,h],color:c} of rects)for(const [px,py] of [[x,y],[x+w,y],[x,y+h],[x,y+h],[x+w,y],[x+w,y+h]])values.push(px!,py!,0,...c)
  if(!values.length)return
  const data=new Float32Array(values)
  if(data.byteLength>this.capacity){this.vertices.destroy();this.capacity=data.byteLength;this.vertices=this.device.createBuffer({size:this.capacity,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})}
  // The canvas is top-left: rectangle rows are measured from the top.
  const uniforms=new Float32Array(20);uniforms.set(matrix);uniforms[16]=width;uniforms[17]=height;uniforms[18]=-1
  this.device.queue.writeBuffer(this.uniform,0,uniforms);this.device.queue.writeBuffer(this.vertices,0,data)
  const encoder=this.device.createCommandEncoder({label:'usdview camera presentation'})
  if(lineCount&&color&&depth){const pass=encoder.beginRenderPass({colorAttachments:[{view:color,loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:depth,depthLoadOp:'load',depthStoreOp:'store',...stencilOps(this.depthFormat)}});pass.setPipeline(this.lines);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertices);pass.draw(lineCount);pass.end()}
  if(rects.length&&screenColor){const pass=encoder.beginRenderPass({colorAttachments:[{view:screenColor,loadOp:'load',storeOp:'store'}]});pass.setPipeline(this.rectangles);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertices);pass.draw(values.length/7-lineCount,1,lineCount);pass.end()}
  this.device.queue.submit([encoder.finish()])
 }
 destroy(){this.uniform.destroy();this.vertices.destroy()}
}
