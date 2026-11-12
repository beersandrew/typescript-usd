// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/shaders/colorCorrection.glslfx,
//  pxr/imaging/hgiMetal/graphicsCmds.mm, pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2018, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/** Present the native Y-up raster intermediate in a top-left canvas.
 * The source is Storm's resolved, linear color AOV; the destination is the
 * canvas's sRGB view, so the store applies the sRGB transfer function that
 * HdxColorCorrectionTask applies upstream (hdx/shaders/colorCorrection.glslfx:
 * 35-41) before HdxPresentTask. Texel loads keep one source pixel per output
 * pixel. Native orientation: hgiMetal/graphicsCmds.mm:404-416 SetViewport and
 * usdviewq/stageView.py:1718-1724 grabFrameBuffer's presentation/readback orientation (OpenUSD 26.11.1).
 */
export class ViewportPresentation {
 private pipeline:GPURenderPipeline
 constructor(private device:GPUDevice,format:GPUTextureFormat){
  const shader=device.createShaderModule({label:'usdview native raster presentation',code:`
   @group(0) @binding(0) var source:texture_2d<f32>;
   @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{
    let positions=array<vec2<f32>,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));
    return vec4(positions[i],0,1);
   }
   @fragment fn fs(@builtin(position) position:vec4<f32>)->@location(0) vec4<f32>{
    let pixel=vec2<i32>(position.xy);let size=textureDimensions(source);
    return textureLoad(source,vec2(pixel.x,i32(size.y)-1-pixel.y),0);
   }
  `})
  this.pipeline=device.createRenderPipeline({label:'usdview native raster presentation',layout:'auto',vertex:{module:shader,entryPoint:'vs'},fragment:{module:shader,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}})
 }
 draw(source:GPUTextureView,target:GPUTextureView):void{
  const bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:source}]})
  const encoder=this.device.createCommandEncoder({label:'usdview native raster presentation'})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'clear',storeOp:'store'}]})
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end()
  this.device.queue.submit([encoder.finish()])
 }
}
