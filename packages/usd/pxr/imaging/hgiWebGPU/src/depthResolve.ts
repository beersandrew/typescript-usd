// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/graphicsCmdsDesc.h,
//  pxr/imaging/hgiMetal/graphicsCmds.mm
// Copyright 2019, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The multisampled depth resolve of a graphics cmds' depthResolveTexture
// (hgi/graphicsCmdsDesc.h depthResolveTexture). hgiMetal resolves it with
// the render pass descriptor's depth resolve texture
// (hgiMetal/graphicsCmds.mm:178-193), with Metal's default
// MTLMultisampleDepthResolveFilterSample0: the resolved depth is sample 0 of
// each pixel. A WebGPU render pass can only resolve color attachments, so
// HgiWebGPUGraphicsCmds records this resolve after its pass: a full-screen
// triangle that loads sample 0 of the multisampled depth texture and writes
// it as the fragment depth of the single-sampled resolve texture (depth
// compare always). Stencil is not resolved, as hgiMetal sets no stencil
// resolve texture.

const _pipelines = new WeakMap<GPUDevice, Map<GPUTextureFormat, GPURenderPipeline>>()

const _shader = /* wgsl */ `
@group(0) @binding(0) var hgiDepthMS: texture_depth_multisampled_2d;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) p: vec4<f32>) -> @builtin(frag_depth) f32 {
  return textureLoad(hgiDepthMS, vec2<i32>(p.xy), 0);
}
`

function _Pipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
  let byFormat = _pipelines.get(device)
  if (!byFormat) _pipelines.set(device, byFormat = new Map())
  let pipeline = byFormat.get(format)
  if (!pipeline) {
    const module = device.createShaderModule({ label: 'HgiWebGPU depth resolve', code: _shader })
    pipeline = device.createRenderPipeline({
      label: 'HgiWebGPU depth resolve',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format, depthWriteEnabled: true, depthCompare: 'always' },
    })
    byFormat.set(format, pipeline)
  }
  return pipeline
}

/** Records the resolve of `source` (multisampled) into `target` on
 *  `encoder`, after the render pass that wrote `source` has ended. */
export function HgiWebGPU_EncodeDepthResolve(device: GPUDevice, encoder: GPUCommandEncoder,
  source: GPUTexture, target: GPUTexture): void {
  const pipeline = _Pipeline(device, target.format)
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: source.createView({ aspect: 'depth-only' }) }],
  })
  const hasStencil = target.format.includes('stencil')
  const pass = encoder.beginRenderPass({
    label: 'HgiWebGPU depth resolve',
    colorAttachments: [],
    depthStencilAttachment: {
      view: target.createView(),
      depthLoadOp: 'load',
      depthStoreOp: 'store',
      ...(hasStencil ? { stencilLoadOp: 'load' as const, stencilStoreOp: 'store' as const } : {}),
    },
  })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.draw(3)
  pass.end()
}
