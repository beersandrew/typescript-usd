// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/stageView.py,
//  pxr/imaging/hdx/taskControllerSceneIndex.cpp,
//  pxr/imaging/hdx/boundingBoxTask.cpp
// Copyright 2016, 2022, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/** A depth attachment that keeps the scene's stencil as well as its depth. */
export function stencilOps(format: GPUTextureFormat): Partial<GPURenderPassDepthStencilAttachment> {
  return format.includes('stencil') ? {stencilLoadOp:'load',stencilStoreOp:'store'} : {}
}

/** The viewer's overlays (axes, bounding boxes, camera guides) over Storm's
 * finished image. usdview draws them after UsdImagingGLEngine::Render into its
 * own 4x multisampled framebuffer (stageView.py:526-530), over the image the
 * engine presented there, depth tested and blended (stageView.py:1392-1402,
 * 1528-1535). Storm's translucent and volume render tasks and
 * HdxOitResolveTask run with useAovMultiSample false: "we resolve the AOVs
 * before starting to render any OIT geometry and only use the resolved AOVs
 * from then on" (hdx/taskControllerSceneIndex.cpp:284-305,330-339), so
 * translucent surfaces (material tag translucent) and volumes are in the
 * resolved color and not in the multisampled one; resolving the multisampled
 * color again would erase them. The overlays are therefore drawn into
 * a multisampled layer of their own, cleared to transparent and tested against
 * Storm's multisampled depth, resolved, and blended (premultiplied, coverage
 * as alpha) over the resolved color AOV; the multisampled color AOV is never
 * resolved again over it.
 */
export class ViewportOverlayLayer {
 private pipeline:GPURenderPipeline
 private msaa:GPUTexture|undefined
 private resolved:GPUTexture|undefined
 constructor(private device:GPUDevice,private format:GPUTextureFormat,private sampleCount:number,targetFormat:GPUTextureFormat){
  const shader=device.createShaderModule({label:'usdview overlay composite',code:`
   @group(0) @binding(0) var overlay:texture_2d<f32>;
   @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{
    let positions=array<vec2<f32>,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));
    return vec4(positions[i],0,1);
   }
   @fragment fn fs(@builtin(position) position:vec4<f32>)->@location(0) vec4<f32>{
    return textureLoad(overlay,vec2<i32>(position.xy),0);
   }
  `})
  this.pipeline=device.createRenderPipeline({label:'usdview overlay composite',layout:'auto',vertex:{module:shader,entryPoint:'vs'},
   fragment:{module:shader,entryPoint:'fs',targets:[{format:targetFormat,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}})
 }
 /** The multisampled layer for this frame's overlays, cleared to transparent. */
 begin(width:number,height:number):GPUTextureView{
  if(!this.msaa||this.msaa.width!==width||this.msaa.height!==height){
   this.msaa?.destroy();this.resolved?.destroy()
   this.msaa=this.device.createTexture({label:'usdview overlays (multisampled)',size:[width,height],format:this.format,sampleCount:this.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT})
   this.resolved=this.device.createTexture({label:'usdview overlays',size:[width,height],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING})
  }
  const view=this.msaa.createView(),encoder=this.device.createCommandEncoder({label:'usdview overlays clear'})
  encoder.beginRenderPass({colorAttachments:[{view,clearValue:[0,0,0,0],loadOp:'clear',storeOp:'store'}]}).end()
  this.device.queue.submit([encoder.finish()])
  return view
 }
 /** Resolve the layer and blend it over `target` (the resolved color AOV). */
 composite(target:GPUTextureView):void{
  if(!this.msaa||!this.resolved)return
  const encoder=this.device.createCommandEncoder({label:'usdview overlays composite'})
  encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.resolved.createView(),loadOp:'load',storeOp:'discard'}]}).end()
  const bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.resolved.createView()}]})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'load',storeOp:'store'}]})
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end()
  this.device.queue.submit([encoder.finish()])
 }
 destroy():void{this.msaa?.destroy();this.resolved?.destroy();this.msaa=this.resolved=undefined}
}

/** Consumer counterpart of usdviewq/stageView.py DrawAxis (v26.11.1).
 * Native _dist defaults to 50 and DrawAxis scales unit positive axes by _dist/20.
 * Clip Y is inverted to share the native Y-up intermediate before presentation.
 * Geometry shares the scene depth, but must not change picking or scene bounds.
 */
export class ViewportAxes {
  private pipeline: GPURenderPipeline
  private uniform: GPUBuffer
  private bindGroup: GPUBindGroup
  constructor(private device: GPUDevice, format: GPUTextureFormat, sampleCount = 1, private depthFormat: GPUTextureFormat = 'depth24plus') {
    const shader = device.createShaderModule({code: `
      @group(0) @binding(0) var<uniform> vp: mat4x4<f32>;
      struct Vertex { @builtin(position) position: vec4<f32>, @location(0) color: vec3<f32> }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Vertex {
        let positions = array<vec3<f32>,6>(vec3(0,0,0),vec3(2.5,0,0),vec3(0,0,0),vec3(0,2.5,0),vec3(0,0,0),vec3(0,0,2.5));
        let colors = array<vec3<f32>,3>(vec3(1,0,0),vec3(0,1,0),vec3(0,0,1));
        var out: Vertex; out.position = vec4(positions[i],1) * vp; out.position.y = -out.position.y; out.color = colors[i/2]; return out;
      }
      @fragment fn fs(in: Vertex) -> @location(0) vec4<f32> { return vec4(in.color,1); }
    `})
    this.pipeline = device.createRenderPipeline({label:'usdview world axes',layout:'auto',
      vertex:{module:shader,entryPoint:'vs'},fragment:{module:shader,entryPoint:'fs',targets:[{format}]},
      multisample:{count:sampleCount},primitive:{topology:'line-list'},depthStencil:{format:depthFormat,depthWriteEnabled:false,depthCompare:'less-equal'}})
    this.uniform = device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
    this.bindGroup = device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]})
  }
  draw(color: GPUTextureView, depth: GPUTextureView, matrix: Float32Array<ArrayBuffer>): void {
    this.device.queue.writeBuffer(this.uniform,0,matrix)
    const encoder=this.device.createCommandEncoder({label:'usdview axes overlay'})
    const pass=encoder.beginRenderPass({colorAttachments:[{view:color,loadOp:'load',storeOp:'store'}],
      depthStencilAttachment:{view:depth,depthLoadOp:'load',depthStoreOp:'store',...stencilOps(this.depthFormat)}})
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.draw(6);pass.end()
    this.device.queue.submit([encoder.finish()])
  }
  destroy(): void { this.uniform.destroy() }
}

/** Depth-tested dashed selection boxes, following hdx/boundingBoxTask.cpp and
 * hdx/shaders/boundingBox.glslfx (OpenUSD v26.11.1). No scene geometry is added.
 */
export class ViewportBoundingBoxes {
 private pipeline:GPURenderPipeline
 private uniform:GPUBuffer
 private vertices:GPUBuffer
 private bindGroup:GPUBindGroup
 constructor(private device:GPUDevice, format:GPUTextureFormat, sampleCount = 1, private depthFormat:GPUTextureFormat = 'depth24plus') {
  const shader=device.createShaderModule({code:`
   struct Settings { vp:mat4x4<f32>, color:vec4<f32>, viewport:vec2<f32>, dash:f32, padding:f32 }
   @group(0) @binding(0) var<uniform> settings:Settings;
   struct Vertex { @builtin(position) position:vec4<f32>, @location(0) @interpolate(flat) start:vec2<f32> }
   @vertex fn vs(@location(0) position:vec3<f32>, @location(1) start:vec3<f32>) -> Vertex {
    var out:Vertex; out.position=vec4(position,1)*settings.vp; out.position.y=-out.position.y;
    let clip=vec4(start,1)*settings.vp;
    out.start=(clip.xy/clip.w+vec2(1))*settings.viewport/2;
    return out;
   }
   @fragment fn fs(in:Vertex) -> @location(0) vec4<f32> {
    let distance=length(in.start-in.position.xy);
    if (distance % (2*settings.dash) > settings.dash) { discard; }
    return settings.color;
   }
  `})
  this.pipeline=device.createRenderPipeline({label:'usdview selection bounds',layout:'auto',vertex:{module:shader,entryPoint:'vs',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'}]}]},fragment:{module:shader,entryPoint:'fs',targets:[{format}]},multisample:{count:sampleCount},primitive:{topology:'line-list'},depthStencil:{format:depthFormat,depthWriteEnabled:false,depthCompare:'less-equal'}})
  this.uniform=device.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
  this.vertices=device.createBuffer({size:48*24,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})
  this.bindGroup=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]})
 }
 draw(color:GPUTextureView,depth:GPUTextureView,matrix:Float32Array<ArrayBuffer>,vertices:Float32Array<ArrayBuffer>,width:number,height:number,background:readonly number[]) {
  if (!vertices.length) return
  const uniforms=new Float32Array(24);uniforms.set(matrix)
  uniforms.set(background.slice(0,3).map(c=>Math.max(0,Math.min(1,c>.5?c-.6:c+.6))),16)
  uniforms[19]=1;uniforms[20]=width;uniforms[21]=height;uniforms[22]=3
  this.device.queue.writeBuffer(this.uniform,0,uniforms);this.device.queue.writeBuffer(this.vertices,0,vertices)
  const encoder=this.device.createCommandEncoder({label:'usdview bounding boxes'})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:color,loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:depth,depthLoadOp:'load',depthStoreOp:'store',...stencilOps(this.depthFormat)}})
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertices);pass.draw(vertices.length/6);pass.end()
  this.device.queue.submit([encoder.finish()])
 }
 destroy(){this.uniform.destroy();this.vertices.destroy()}
}
