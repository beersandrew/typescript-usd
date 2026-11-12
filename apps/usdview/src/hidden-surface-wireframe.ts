// Ported from OpenUSD 26.11.1: pxr/imaging/hgiInterop/opengl.cpp,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Hidden Surface Wireframe's framebuffer step (OpenUSD 26.11.1
// usdviewq/stageView.py:1485-1510), for stage-view-engine.ts. usdview draws
// DRAW_GEOM_ONLY with glPolygonOffset(1, 1), clears the framebuffer's color
// (keeping its depth) and draws DRAW_WIREFRAME; HgiInterop composites each
// pass's AOVs into the framebuffer depth tested
// (hgiInterop/opengl.cpp CompositeToInterop: GL_DEPTH_TEST, GL_LEQUAL), so
// wireframe behind the surfaces of the first pass is hidden.
//
// Here the first pass's multisampled depth AOV is kept (keepDepth), and after
// the second pass every sample of the color AOV whose depth is behind the kept
// depth becomes the clear color (composite), then the color resolves. The
// polygon offset is a depth tolerance (polygonOffset) instead of a depth bias
// on the first pass, which the engine's render params do not carry.

/** glPolygonOffset(1, 1): about one depth unit of a 24-bit buffer. */
const polygonOffset = 1 / (1 << 22)

const hasStencil = (format: GPUTextureFormat) => format.includes('stencil')

export class HiddenSurfaceWireframe {
  private _depth: GPUTexture | undefined
  private _pipeline: GPURenderPipeline | undefined
  private _pipelineKey = ''
  private readonly _uniforms: GPUBuffer

  constructor(private readonly _device: GPUDevice) {
    this._uniforms = _device.createBuffer({ label: 'usdview hidden surface wireframe', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  }

  /** The first pass's depth: kept while the second pass clears it. */
  keepDepth(depth: GPUTexture): void {
    const d = this._depth
    if (!d || d.width !== depth.width || d.height !== depth.height || d.format !== depth.format || d.sampleCount !== depth.sampleCount) {
      d?.destroy()
      this._depth = this._device.createTexture({ label: 'usdview hidden surface depth', size: [depth.width, depth.height], format: depth.format,
        sampleCount: depth.sampleCount, usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT })
    }
    const encoder = this._device.createCommandEncoder({ label: 'usdview hidden surface depth' })
    encoder.copyTextureToTexture({ texture: depth }, { texture: this._depth! }, [depth.width, depth.height])
    this._device.queue.submit([encoder.finish()])
  }

  private _Pipeline(color: GPUTexture, depth: GPUTexture): GPURenderPipeline {
    const key = `${color.format}/${depth.format}/${color.sampleCount}`
    if (this._pipeline && this._pipelineKey === key) return this._pipeline
    const module = this._device.createShaderModule({ label: 'usdview hidden surface wireframe', code: `
      struct Params { clearColor: vec4<f32>, offset: f32 }
      @group(0) @binding(0) var wireDepth: texture_depth_multisampled_2d;
      @group(0) @binding(1) var<uniform> params: Params;
      @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
        let p = array<vec2<f32>, 3>(vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
        return vec4(p[i], 0, 1);
      }
      struct Out { @location(0) color: vec4<f32>, @builtin(frag_depth) depth: f32 }
      // Per sample: the second pass's depth, against the kept depth
      // (depthCompare greater): samples behind the surfaces become the clear color.
      @fragment fn fs(@builtin(position) position: vec4<f32>, @builtin(sample_index) s: u32) -> Out {
        let d = textureLoad(wireDepth, vec2<i32>(position.xy), i32(s));
        return Out(params.clearColor, max(d - params.offset, 0.0));
      }
    ` })
    this._pipeline = this._device.createRenderPipeline({
      label: 'usdview hidden surface wireframe', layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: color.format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: depth.format, depthWriteEnabled: false, depthCompare: 'greater' },
      multisample: { count: color.sampleCount },
    })
    this._pipelineKey = key
    return this._pipeline
  }

  /** After the second pass: hide its samples behind the kept depth, then
   *  resolve the color AOV. */
  composite(colorMSAA: GPUTexture, wireDepthMSAA: GPUTexture, resolved: GPUTexture, clearColor: { data: ArrayLike<number> } | ArrayLike<number>): void {
    const kept = this._depth
    if (!kept) return
    const pipeline = this._Pipeline(colorMSAA, kept)
    const c = 'data' in clearColor ? clearColor.data : clearColor
    this._device.queue.writeBuffer(this._uniforms, 0, new Float32Array([c[0]!, c[1]!, c[2]!, c[3]!, polygonOffset, 0, 0, 0]))
    const bindGroup = this._device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: wireDepthMSAA.createView({ aspect: 'depth-only' }) },
      { binding: 1, resource: { buffer: this._uniforms } },
    ] })
    const encoder = this._device.createCommandEncoder({ label: 'usdview hidden surface wireframe' })
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorMSAA.createView(), resolveTarget: resolved.createView(), loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: kept.createView(), depthReadOnly: true, ...(hasStencil(kept.format) ? { stencilReadOnly: true } : {}) },
    })
    pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end()
    this._device.queue.submit([encoder.finish()])
  }

  destroy(): void {
    this._depth?.destroy()
    this._uniforms.destroy()
  }
}
