// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/codeGen.cpp,
//  pxr/imaging/hdSt/renderPassShader.cpp,
//  pxr/imaging/hdSt/shaders/basisCurves.glslfx,
//  pxr/imaging/hdSt/shaders/coordUtils.glslfx,
//  pxr/imaging/hdSt/shaders/mesh.glslfx,
//  pxr/imaging/hdx/oitVolumeRenderTask.cpp, and 1 more cited below
// Copyright 2016, 2019, 2021, 2026 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sampling a depth texture as the float texture a shader declares.
//
// hgiMetal binds a Depth32Float texture to a texture2d<float> argument and
// hgiVulkan binds the depth aspect of a depth image to a sampler2D, so
// Storm reads a depth AOV through the float texture accessors of an
// ordinary texture binding: the depthReadback AOV input of
// HdStRenderPassShader (renderPassShader.cpp:271-332), read by
// SampleZBuffer (coordUtils.glslfx:173-185) and by the translucent mesh and
// curve fragments (mesh.glslfx:1509-1517, basisCurves.glslfx:1308-1315),
// and the depth input of HdxVisualizeAovTask (visualizeAovTask.cpp:200).
// Storm declares these textures Float32Vec4 (hdSt/codeGen.cpp:
// 1710-1720), so HgiWebGPU lays them out as 'float' texture bindings
// ('unfilterable-float' without float32-filterable), with a filtering
// sampler. WebGPU binds a depth format only as 'depth' (texture_depth_*) or
// 'unfilterable-float', so such a binding cannot take the depth texture
// itself.
//
// HgiWebGPUTexture.GetShaderReadView gives a depth texture a single-channel
// float texture of the same size; HgiWebGPUResourceBindings binds it in
// place of the depth texture under a non-'depth' layout, and the cmds that
// bind it record this copy of the depth into it before their pass (once per
// cmds), so the shader reads the depth as it is when the cmds are
// submitted. Like hgiVulkan's transition of the depth image to the shader
// read layout before such a pass (HgiTexture::SubmitLayoutChange,
// hdx/oitVolumeRenderTask.cpp:151-165), it is the backend's work; it does
// not wait for that call, which HdxOitRenderTask's translucent pass does not
// make. Bindings that declare a depth (shadow) texture keep
// binding the depth texture itself.

const _pipelines = new WeakMap<GPUDevice, GPUComputePipeline>()

const _shader = /* wgsl */ `
@group(0) @binding(0) var hgiDepth: texture_depth_2d;
@group(0) @binding(1) var hgiDepthFloat: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let size = textureDimensions(hgiDepth, 0);
  if (id.x >= size.x || id.y >= size.y) {
    return;
  }
  let d = textureLoad(hgiDepth, vec2<i32>(id.xy), 0);
  textureStore(hgiDepthFloat, vec2<i32>(id.xy), vec4<f32>(d, 0.0, 0.0, 1.0));
}
`

function _Pipeline(device: GPUDevice): GPUComputePipeline {
  let pipeline = _pipelines.get(device)
  if (!pipeline) {
    const module = device.createShaderModule({ label: 'HgiWebGPU depth sampling', code: _shader })
    pipeline = device.createComputePipeline({
      label: 'HgiWebGPU depth sampling',
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    })
    _pipelines.set(device, pipeline)
  }
  return pipeline
}

/** The format of the float texture a depth texture is sampled through. */
export const HgiWebGPUDepthSamplingFormat: GPUTextureFormat = 'r32float'

/** Records the copy of the depth of `source` (single-sampled, level 0,
 *  layer 0) into `target` (HgiWebGPUDepthSamplingFormat, same size) on
 *  `encoder`, outside any pass. */
export function HgiWebGPU_EncodeDepthSampling(device: GPUDevice, encoder: GPUCommandEncoder,
  source: GPUTexture, target: GPUTexture): void {
  const pipeline = _Pipeline(device)
  const bindGroup = device.createBindGroup({
    label: 'HgiWebGPU depth sampling',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: source.createView({
        dimension: '2d', aspect: 'depth-only', baseMipLevel: 0, mipLevelCount: 1,
        baseArrayLayer: 0, arrayLayerCount: 1 }) },
      { binding: 1, resource: target.createView() },
    ],
  })
  const pass = encoder.beginComputePass({ label: 'HgiWebGPU depth sampling' })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(Math.ceil(target.width / 8), Math.ceil(target.height / 8), 1)
  pass.end()
}
