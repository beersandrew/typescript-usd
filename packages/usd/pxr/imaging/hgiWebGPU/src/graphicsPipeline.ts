// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/graphicsPipeline.h,
//  pxr/imaging/hgiMetal/graphicsPipeline.mm,
//  pxr/imaging/hgiVulkan/graphicsPipeline.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUGraphicsPipeline. Modelled on
// pxr/imaging/hgiMetal/graphicsPipeline.{h,mm} (_CreateVertexDescriptor,
// _CreateRenderPipelineState, _CreateDepthStencilState; WebGPU folds all three
// into one GPURenderPipeline) and hgiVulkan/graphicsPipeline.cpp for the
// pipeline layout made from the shader program's binding info.

import {
  HgiFormat,
  HgiGetComponentBaseFormat,
  HgiGetComponentCount,
  HgiGraphicsPipeline,
  HgiPolygonMode,
  HgiPrimitiveType,
  HgiSampleCount,
  HgiShaderKeywordTokens,
  HgiTessellationState,
  HgiTextureUsageBits,
  HgiVertexBufferStepFunction,
  type HgiGraphicsPipelineDesc,
  type HgiStencilState,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUMakeBindGroupLayouts,
  type HgiWebGPUBindGroupLayouts,
} from './bindGroupLayouts.ts'
import { HgiWebGPUConversions } from './conversions.ts'
import { TF_CODING_ERROR, TF_WARN } from './diagnostic.ts'
import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import type { HgiWebGPUShaderProgram } from './shaderProgram.ts'
import {
  HgiWebGPUConstantPatchCorners,
  HgiWebGPUMetalTessellationWinding,
  HgiWebGPUTessellatorPartitioningForSpacing,
  type HgiWebGPUTessellationConfig,
} from './tessellation.ts'
import { HgiWebGPUTessellatorOutputPrimitiveForMetalWinding } from './tessellator.ts'

/** _CreateStencilDescriptor (hgiMetal/graphicsPipeline.mm:333-351) */
function _CreateStencilDescriptor(stencilState: HgiStencilState): GPUStencilFaceState {
  return {
    compare: HgiWebGPUConversions.getCompareFunction(stencilState.compareFn),
    failOp: HgiWebGPUConversions.getStencilOp(stencilState.stencilFailOp),
    depthFailOp: HgiWebGPUConversions.getStencilOp(stencilState.depthFailOp),
    passOp: HgiWebGPUConversions.getStencilOp(stencilState.depthStencilPassOp),
  }
}

/** One vertex attribute an emulated post-tessellation vertex function
 *  pulls: where HgiWebGPUGraphicsCmds finds it (the pipeline's
 *  HgiVertexBufferDesc and HgiVertexAttributeDesc for its location). */
export interface HgiWebGPUPulledAttributeLayout {
  location: number
  /** HgiVertexBufferDesc::bindingIndex: the BindVertexBuffers slot. */
  bindingIndex: number
  /** HgiVertexAttributeDesc::offset, in bytes. */
  offset: number
  /** HgiVertexBufferDesc::vertexStride, in bytes. */
  stride: number
  stepFunction: HgiVertexBufferStepFunction
  /** HgiFormatPackedInt1010102: one word, unpacked as Metal's
   *  MTLVertexFormatInt1010102Normalized (hgiMetal/conversions.mm). */
  packedInt1010102?: boolean
}

/** A patch-list pipeline drawn with the emulated post-tessellation vertex
 *  function (HgiWebGPUPostTessVertexShaderSection). */
/** Debug switch: draws with vertex pulling read their attributes from one
 *  packed buffer (webgpu-storage-buffer-limit) even when the device's
 *  binding limits allow one binding per attribute, so the path Chrome takes
 *  can be tested where it is not needed. No upstream counterpart. */
export const HGIWEBGPU_FORCE_PACKED_ATTRIBUTES = new TfEnvSetting<boolean>(
  'HGIWEBGPU_FORCE_PACKED_ATTRIBUTES', false,
  'HgiWebGPU: pull the attributes of emulated patch and vertex-pulling draws from one packed buffer')

export interface HgiWebGPUPatchEmulation {
  /** A patch, or one vertex or point of a vertex-pulling vertex function. */
  primitive: import('./shaderSection.ts').HgiWebGPUPulledPrimitive
  /** Vertices drawn per patch (3 per triangle patch, 6 per quad patch, 1
   *  per vertex, 6 per point). */
  verticesPerPatch: number
  /** HgiTessellationState::primitiveIndexSize: control points per patch. */
  controlPoints: number
  /** Length of HgiWebGPUPatchDraw's attributes array. */
  attributeSlots: number
  attributes: HgiWebGPUPulledAttributeLayout[]
  /** Patches with per-patch factors (HgiTessellationState::TessVertex):
   *  drawn from the tessellator's output (HgiWebGPUTessellation). */
  tessellated: boolean
  /** The tessellation of the pipeline's patches ('triangle', 'quad' and
   *  'control'). */
  tessellation: HgiWebGPUTessellationConfig | null
  /** Constant factors: the (u, v) of each vertex of a patch, the
   *  triangles of its control points (HgiWebGPUConstantPatchCorners). */
  corners: number[]
  /** 'control': the bind index of the factor buffer it writes. */
  tessFactorsBindIndex: number | null
  /** HgiPolygonModeLine: the emulated triangles are drawn as their edges
   *  (see _CreateRenderPipelineState). */
  lines: boolean
  /** PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit): the functions read
   *  the control point indices and the attributes from one buffer that
   *  HgiWebGPUGraphicsCmds packs (HgiWebGPUPulledAttributePacker). */
  packed: boolean
}

export class HgiWebGPUGraphicsPipeline extends HgiGraphicsPipeline {
  private _renderPipelineState: GPURenderPipeline | null = null
  private _bindGroupLayouts: HgiWebGPUBindGroupLayouts = { layouts: [], entries: [] }
  private _pipelineLayout: GPUPipelineLayout | null = null
  private _patchEmulation: HgiWebGPUPatchEmulation | null = null
  /** HgiTessellationState::TessControl: the post-tessellation control
   *  function as a compute pipeline (HgiWebGPUShaderGenerator). */
  private _computePipelineState: GPUComputePipeline | null = null
  /** rasterizationState.rasterizerEnabled false outside the
   *  post-tessellation control stage: a draw that produces no fragments
   *  (see _CreateRenderPipelineState). */
  private _rasterizationDisabled = false
  private _exceedsDeviceLimits = false
  /** A pipeline created ahead (hgiwebgpu-pipeline-ahead, the constructor)
   *  compiles in the background; until it is done, this is its descriptor,
   *  and its first use creates it at once. */
  private _pendingDescriptor: GPURenderPipelineDescriptor | null = null
  private _device: GPUDevice

  /** hgiMetal/graphicsPipeline.mm:23-35.
   *  PLATFORM-DIVERGENCE(hgiwebgpu-pipeline-ahead): upstream creates the
   *  pipeline state here, synchronously, and so does this constructor
   *  unless `ahead`. Then the
   *  GPURenderPipeline is created with createRenderPipelineAsync: WebKit
   *  compiles a render pipeline's Metal shaders when it is created, and
   *  the first frame that draws with a pipeline from createRenderPipeline
   *  waits for that compile (up to seconds for the Storm programs a new
   *  room brings, the first time; performance-viewer.md, November 11); the
   *  asynchronous call compiles it in the background. A pipeline created ahead of its first draw (Storm's
   *  compile-ahead, hdSt/src/commandBuffer.ts) is ready by then; if not, its
   *  first use (getRenderPipelineState) creates it synchronously, as
   *  without `ahead`. */
  constructor(device: GPUDevice, desc: HgiGraphicsPipelineDesc, features: { unclippedDepth: boolean }, ahead = false) {
    super(desc)
    this._device = device
    this._createRenderPipelineState(device, features, ahead)
  }

  /** _CreateVertexDescriptor (hgiMetal/graphicsPipeline.mm:54-157). The
   *  buffer slot is HgiVertexBufferDesc::bindingIndex, as Metal's buffer
   *  index. */
  private _createVertexDescriptor(): Array<GPUVertexBufferLayout | null> {
    const buffers: Array<GPUVertexBufferLayout | null> = []
    for (const vbo of this._descriptor.vertexBuffers) {
      const attributes: GPUVertexAttribute[] = []
      for (const va of vbo.vertexAttributes) {
        const format = HgiWebGPUConversions.getVertexFormat(va.format)
        if (!format) {
          TF_CODING_ERROR(`HgiWebGPU: ${HgiFormat[va.format]} has no WebGPU vertex format`)
          continue
        }
        attributes.push({ format, offset: va.offset, shaderLocation: va.shaderBindLocation })
      }
      const constant = vbo.vertexStepFunction ===
        HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionConstant
      while (buffers.length < vbo.bindingIndex) buffers.push(null)
      buffers[vbo.bindingIndex] = {
        // A constant attribute reads the same element for every vertex
        // (MTLVertexStepFunctionConstant): zero stride.
        arrayStride: constant ? 0 : vbo.vertexStride,
        stepMode: HgiWebGPUConversions.getVertexStepMode(vbo.vertexStepFunction),
        attributes,
      }
    }
    return buffers
  }

  /** _CreateRenderPipelineState (hgiMetal/graphicsPipeline.mm:159-331) with
   *  _CreateDepthStencilState (:353-395). */
  private _createRenderPipelineState(device: GPUDevice, features: { unclippedDepth: boolean }, ahead = false): void {
    const desc = this._descriptor
    const program = desc.shaderProgram.Get() as HgiWebGPUShaderProgram | null
    // hgiMetal/graphicsPipeline.mm:178-206: a patch list draws with the
    // post-tessellation vertex function as the vertex function.
    const usePatchPath = desc.primitiveType === HgiPrimitiveType.HgiPrimitiveTypePatchList
    const tessControl = usePatchPath &&
      desc.tessellationState.tessFactorMode === HgiTessellationState.TessFactorMode.TessControl
    let vertexFunction = (usePatchPath
      ? (tessControl ? program?.getPostTessControlFunction() : program?.getPostTessVertexFunction())
      : program?.getVertexFunction()) ?? null
    let fragFunction = program?.getFragmentFunction() ?? null
    // A vertex function drawn with vertex pulling (points wider than a
    // pixel, gl_BaseVertex / hd_BaseInstance; see
    // HgiWebGPUPostTessVertexShaderSection) takes the same emulated draw.
    const pulled = !usePatchPath ? vertexFunction?.getPostTessVertexInfo()?.primitive ?? null : null
    const usePTVSPath = usePatchPath || pulled !== null
    if (usePTVSPath && !this._initPatchEmulation(vertexFunction)) {
      return
    }
    // HgiPolygonModeLine: Metal's setTriangleFillMode:MTLTriangleFillModeLines
    // (hgiMetal/graphicsPipeline.mm:474-475), which Storm asks for to draw
    // the wire reprs (hdSt/meshShaderKey.cpp:183-186,
    // renderPassState.cpp:1227-1234). WebGPU has no fill mode: patch draws at
    // constant factors (every unrefined and uniformly refined mesh under
    // HgiWebGPUCapabilities) are drawn as the line list of their triangles'
    // edges by variants of the vertex and fragment functions
    // (HgiWebGPUPostTessVertexShaderSection). Other draws fill, with a
    // warning.
    const ras = desc.rasterizationState
    const pe = this._patchEmulation
    let lines = false
    if (ras.polygonMode === HgiPolygonMode.HgiPolygonModeLine && pe &&
        (pe.primitive === 'triangle' || pe.primitive === 'quad') && !pe.tessellated) {
      const lineVertex = vertexFunction?.getPolygonModeLineVariant() ?? null
      const lineFrag = fragFunction ? fragFunction.getPolygonModeLineVariant() : null
      const info = lineVertex?.getPostTessVertexInfo()
      if (!lineVertex?.isValid() || !info || (fragFunction && !lineFrag?.isValid())) {
        TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}': the HgiPolygonModeLine variants did not ` +
          `compile: ${lineVertex?.getCompileErrors() ?? ''} ${lineFrag?.getCompileErrors() ?? ''}`)
        return
      }
      vertexFunction = lineVertex
      fragFunction = lineFrag
      pe.verticesPerPatch = info.verticesPerPatch
      pe.lines = true
      lines = true
    }
    if (pe?.tessellated) {
      // Per-patch factors: the variant that reads the tessellator's points
      // (a function drawn at constant factors does not bind them).
      vertexFunction = vertexFunction?.getVariant({ tessellatedPatches: true }) ?? null
    }
    if (!vertexFunction?.getShaderId()) {
      TF_CODING_ERROR(`HgiWebGPU: pipeline '${desc.debugName}' has no valid vertex function`)
      return
    }
    // hgiMetal/graphicsPipeline.mm:304-315: alpha to coverage with alpha to
    // one, which WebGPU lacks, is drawn by a variant of the fragment
    // function that applies both (alphaToOne.ts); WebGPU's own alpha to
    // coverage then stays off.
    const ms = desc.multiSampleState
    const alphaToOne = ms.alphaToCoverageEnable && ms.alphaToOneEnable &&
      ms.sampleCount > HgiSampleCount.HgiSampleCount1 && !!fragFunction && ras.rasterizerEnabled
    if (alphaToOne) {
      const variant = program!.getFragmentFunction()!.getAlphaToOneVariant(lines)
      if (!variant?.isValid()) {
        TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}': the alpha-to-one variant did not ` +
          `compile: ${variant?.getCompileErrors() ?? ''}`)
        return
      }
      fragFunction = variant
    }

    // hgiVulkan/graphicsPipeline.cpp: the pipeline layout from the binding
    // info of the program's functions. PLATFORM-DIVERGENCE(webgpu-binding-visibility):
    // only of the functions this pipeline runs (hgiVulkan merges every
    // function of the program, descriptorSetLayouts.cpp:65-123). Storm's
    // programs for post-tessellation vertex draws also hold a vertex
    // function that such a draw never runs (hgiMetal/graphicsPipeline.mm:
    // 178-206 makes the post-tessellation function the vertex function),
    // whose bindings would count against WebGPU's per-stage limits; and a
    // variant (HgiPolygonModeLine, alpha to one) may use bindings its base
    // function does not.
    const layoutsOf = () => HgiWebGPUMakeBindGroupLayouts(device,
      (tessControl ? [vertexFunction] : [vertexFunction, fragFunction]).map(fn => fn?.getBindGroupLayoutInfo() ?? []),
      desc.debugName)
    this._bindGroupLayouts = layoutsOf()
    if (pe && (this._bindGroupLayouts.exceeded || TfGetEnvSetting(HGIWEBGPU_FORCE_PACKED_ATTRIBUTES))) {
      // PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit): over the
      // device's binding limits (Chrome on macOS has 10 storage buffers per
      // stage; Storm's draws with many primitive and instance primvars
      // reach 15 with one binding per pulled attribute), the variant that
      // pulls the control point indices and every attribute from one
      // buffer, packed per draw from the bound index and vertex buffers by
      // GPU copies (HgiWebGPUPulledAttributePacker). Metal pulls the
      // attributes through its vertex buffer table instead
      // (hgiMetal/graphicsPipeline.mm:54-157), which has no such limit.
      const packed = vertexFunction.getVariant({
        polygonModeLine: lines, tessellatedPatches: pe.tessellated, packedAttributes: true })
      if (packed?.getShaderId()) {
        vertexFunction = packed
        pe.packed = true
        this._bindGroupLayouts = layoutsOf()
      }
    }
    if (fragFunction && vertexFunction !== program?.getVertexFunction() &&
        vertexFunction !== program?.getPostTessVertexFunction()) {
      // A variant takes the fragment inputs' interpolation as the
      // program's functions do (HgiWebGPUShaderProgram).
      vertexFunction.matchInterstageOutputs(fragFunction)
    }
    const exceeded = this._bindGroupLayouts.exceeded
    if (exceeded) {
      // PLATFORM-DIVERGENCE(webgpu-binding-limits): the pipeline is not
      // created and its draws are recorded as nothing, so that the other
      // draws of the pass still run: WebGPU would make the pipeline, and
      // with it the whole command buffer, invalid.
      TF_CODING_ERROR(`HgiWebGPU: pipeline '${desc.debugName}' exceeds the device's binding limits: ` +
        `${exceeded.join(', ')}; its draws are skipped`)
      this._exceedsDeviceLimits = true
      return
    }
    this._pipelineLayout = device.createPipelineLayout({
      label: desc.debugName,
      bindGroupLayouts: this._bindGroupLayouts.layouts,
    })

    if (tessControl) {
      // hgiMetal/graphicsPipeline.mm:187-193: the post-tessellation control
      // function as the vertex function of a rasterizer-disabled draw; here
      // a compute pipeline with the program's layout, dispatched by
      // HgiWebGPUGraphicsCmds in place of the draw.
      try {
        this._computePipelineState = device.createComputePipeline({
          label: desc.debugName,
          layout: this._pipelineLayout,
          compute: { module: vertexFunction.getShaderId()!, entryPoint: vertexFunction.getEntryPoint() },
        })
      } catch (error) {
        TF_WARN(`Failed to created pipeline state, error ${String(error)}`)
      }
      return
    }

    if (!ras.rasterizerEnabled) {
      // hgiMetal/graphicsPipeline.mm:239-246 sets rasterizationEnabled NO
      // and no fragment function, hgiVulkan/graphicsPipeline.cpp:191
      // rasterizerDiscardEnable: the draws produce no fragments, so the
      // color, depth and multisample state (alpha to coverage included,
      // :304-309; Vulkan ignores pMultisampleState under rasterizer discard)
      // have no effect, and only vertex-stage side effects remain. A WebGPU
      // vertex stage writes no memory, and a render pipeline without a
      // fragment state is not compatible with a pass that has color
      // attachments, so such a pipeline has no GPURenderPipeline and
      // HgiWebGPUGraphicsCmds records its draws as nothing. Storm draws one
      // when a pipeline draw batch keeps its tessFactors buffer after its
      // draw items stop being patches (hdSt/pipelineDrawBatch.cpp:849-856
      // only assigns it for patches; ExecuteDraw :1379-1385 then runs the
      // PTCS pipeline of :1314-1359 with the non-patch program).
      this._rasterizationDisabled = true
      return
    }

    // The emulated tessellation emits triangles: Metal treats line patches
    // as triangles too (hgiMetal/graphicsPipeline.mm:208-221).
    const topology = lines ? 'line-list' : usePatchPath || pulled === 'point' ? 'triangle-list'
      : HgiWebGPUConversions.getPrimitiveTopology(desc.primitiveType)
    if (!topology) {
      TF_CODING_ERROR(`HgiWebGPU: primitive type ${HgiPrimitiveType[desc.primitiveType]} ` +
        'is not supported by WebGPU')
      return
    }
    if (ras.polygonMode !== HgiPolygonMode.HgiPolygonModeFill && !lines) {
      // Not emulated for these draws (see above).
      TF_WARN(`HgiWebGPU: polygon mode ${HgiPolygonMode[ras.polygonMode]} is not ` +
        `supported; '${desc.debugName}' fills`)
    }
    if (ras.depthClampEnabled && !features.unclippedDepth) {
      TF_WARN(`HgiWebGPU: depth clamp needs the depth-clip-control feature ('${desc.debugName}')`)
    }

    // Color attachments (hgiMetal/graphicsPipeline.mm:248-288)
    const targets: GPUColorTargetState[] = []
    // A Metal render pipeline leaves a color attachment the fragment
    // function has no output for unchanged; WebGPU requires such a target's
    // writeMask to be 0 (GPUFragmentState validation), so it is. Storm's
    // OIT volume pass draws with the default color masks
    // (oitVolumeRenderTask.cpp:147-149) and a fragment function that only
    // writes the OIT buffers.
    const colorOutputs = new Set(fragFunction?.getColorOutputLocations() ?? [])
    for (const [attachmentIndex, hgiColorAttachment] of desc.colorAttachmentDescs.entries()) {
      const format = HgiWebGPUConversions.getPixelFormat(
        hgiColorAttachment.format, hgiColorAttachment.usage)
      if (!format) {
        TF_CODING_ERROR(`HgiWebGPU: color attachment ${HgiFormat[hgiColorAttachment.format]} ` +
          'has no WebGPU format')
        return
      }
      const target: GPUColorTargetState = {
        format,
        writeMask: colorOutputs.has(attachmentIndex)
          ? HgiWebGPUConversions.getColorWriteMask(hgiColorAttachment.colorMask) : 0,
      }
      if (hgiColorAttachment.blendEnabled) {
        target.blend = {
          color: {
            srcFactor: HgiWebGPUConversions.getBlendFactor(hgiColorAttachment.srcColorBlendFactor),
            dstFactor: HgiWebGPUConversions.getBlendFactor(hgiColorAttachment.dstColorBlendFactor),
            operation: HgiWebGPUConversions.getBlendEquation(hgiColorAttachment.colorBlendOp),
          },
          alpha: {
            srcFactor: HgiWebGPUConversions.getBlendFactor(hgiColorAttachment.srcAlphaBlendFactor),
            dstFactor: HgiWebGPUConversions.getBlendFactor(hgiColorAttachment.dstAlphaBlendFactor),
            operation: HgiWebGPUConversions.getBlendEquation(hgiColorAttachment.alphaBlendOp),
          },
        }
      }
      targets.push(target)
    }

    // Depth (hgiMetal/graphicsPipeline.mm:290-301, 353-395)
    const hgiDepthAttachment = desc.depthAttachmentDesc
    const depthPixelFormat = HgiWebGPUConversions.getPixelFormat(
      hgiDepthAttachment.format, hgiDepthAttachment.usage | HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget)
    let depthStencil: GPUDepthStencilState | undefined
    if (hgiDepthAttachment.format !== HgiFormat.HgiFormatInvalid && depthPixelFormat) {
      const ds = desc.depthState
      depthStencil = {
        format: depthPixelFormat,
        // Even if there is no depth attachment, some drivers may still
        // perform the depth test. So we pick Always over Never.
        depthCompare: ds.depthTestEnabled
          ? HgiWebGPUConversions.getCompareFunction(ds.depthCompareFn) : 'always',
        depthWriteEnabled: ds.depthTestEnabled && ds.depthWriteEnabled,
      }
      if (ds.depthBiasEnabled) {
        depthStencil.depthBias = Math.trunc(ds.depthBiasConstantFactor)
        depthStencil.depthBiasSlopeScale = ds.depthBiasSlopeFactor
      }
      if (ds.stencilTestEnabled && HgiWebGPUConversions.hasStencil(depthPixelFormat)) {
        // Front and back are swapped as in hgiMetal/graphicsPipeline.mm:
        // 381-386, because the winding is inverted
        // (HgiWebGPUConversions::GetWinding).
        depthStencil.stencilBack = _CreateStencilDescriptor(ds.stencilFront)
        depthStencil.stencilFront = _CreateStencilDescriptor(ds.stencilBack)
        depthStencil.stencilReadMask = ds.stencilFront.readMask
        depthStencil.stencilWriteMask = ds.stencilFront.writeMask
      }
    }

    const sampleCount = desc.multiSampleState.sampleCount
    const fragmentEnabled = !!fragFunction?.getShaderId()
    const descriptor: GPURenderPipelineDescriptor = {
        label: desc.debugName,
        layout: this._pipelineLayout,
        vertex: {
          module: vertexFunction.getShaderId()!,
          entryPoint: vertexFunction.getEntryPoint(),
          // The emulated post-tessellation vertex function pulls its
          // attributes from storage buffers.
          buffers: usePTVSPath ? [] : this._createVertexDescriptor(),
        },
        // hgiMetal/graphicsPipeline.mm:239-246 (rasterization is enabled
        // here, see above).
        ...(fragmentEnabled ? {
          fragment: {
            module: fragFunction!.getShaderId()!,
            entryPoint: fragFunction!.getEntryPoint(),
            targets,
          },
        } : {}),
        primitive: {
          topology,
          ...(topology === 'line-strip' ? { stripIndexFormat: 'uint32' as const } : {}),
          cullMode: HgiWebGPUConversions.getCullMode(ras.cullMode),
          frontFace: HgiWebGPUConversions.getWinding(ras.winding),
          ...(ras.depthClampEnabled && features.unclippedDepth ? { unclippedDepth: true } : {}),
        },
        ...(depthStencil ? { depthStencil } : {}),
        multisample: {
          count: sampleCount > HgiSampleCount.HgiSampleCount1 ? sampleCount : 1,
          // hgiMetal/graphicsPipeline.mm:304-309. With alpha to one the
          // fragment function applies it (above).
          // PLATFORM-DIVERGENCE(hgiwebgpu-alpha-to-coverage-mask): WebGPU rejects alpha to
          // coverage with a sample_mask output (GPUFragmentState
          // validation), which Metal allows; such a pipeline without alpha
          // to one keeps its sample mask and draws without alpha to
          // coverage.
          // Without a fragment function there is no alpha for the coverage
          // (WebGPU requires a fragment state for it).
          alphaToCoverageEnabled: !alphaToOne && desc.multiSampleState.alphaToCoverageEnable &&
            sampleCount > HgiSampleCount.HgiSampleCount1 && fragmentEnabled &&
            !fragFunction!.getDescriptor().stageOutputs.some(p => p.role === HgiShaderKeywordTokens.hdSampleMask),
        },
      }
    if (ahead && typeof device.createRenderPipelineAsync === 'function') {
      // hgiwebgpu-pipeline-ahead (see the constructor).
      this._pendingDescriptor = descriptor
      device.createRenderPipelineAsync(descriptor).then(pipeline => {
        if (this._pendingDescriptor !== descriptor) return
        this._pendingDescriptor = null
        this._renderPipelineState = pipeline
      }, () => {
        // Its first use creates it synchronously and reports the failure.
      })
      return
    }
    this._createRenderPipelineNow(device, descriptor)
  }

  private _createRenderPipelineNow(device: GPUDevice, descriptor: GPURenderPipelineDescriptor): void {
    try {
      this._renderPipelineState = device.createRenderPipeline(descriptor)
    } catch (error) {
      // hgiMetal/graphicsPipeline.mm:326-330
      TF_WARN(`Failed to created pipeline state, error ${String(error)}`)
    }
  }

  /** hgiwebgpu-pipeline-ahead: whether a pipeline created ahead is still
   *  compiling (for tests and tools). */
  _isCompilingAhead(): boolean {
    return this._pendingDescriptor !== null
  }

  /** The tessellation state of hgiMetal/graphicsPipeline.mm:178-235 and
   *  _CreateVertexDescriptor's per-patch-control-point layouts (:54-104),
   *  as the emulated draw needs them. */
  private _initPatchEmulation(fn: import('./shaderFunction.ts').HgiWebGPUShaderFunction | null): boolean {
    const desc = this._descriptor
    const info = fn?.getPostTessVertexInfo() ?? null
    if (!info) {
      // hgiMetal/graphicsPipeline.mm:118-121
      TF_CODING_ERROR(`HgiWebGPU: patch pipeline '${desc.debugName}' has no post tess vertex function`)
      return false
    }
    const tess = desc.tessellationState
    const pulled = info.primitive === 'vertex' || info.primitive === 'point'
    let tessellated = false
    if (!pulled) switch (tess.tessFactorMode) {
      case HgiTessellationState.TessFactorMode.Constant:
        break
      case HgiTessellationState.TessFactorMode.TessVertex:
        // Per-patch factors from the post-tessellation control stage
        // (hgiMetal/graphicsPipeline.mm:195-204), tessellated by
        // HgiWebGPUTessellation.
        tessellated = true
        break
      case HgiTessellationState.TessFactorMode.TessControl:
        break
      default:
        TF_CODING_ERROR(`HgiWebGPU: tess factor mode ${tess.tessFactorMode} of '${desc.debugName}' is unknown`)
        return false
    }
    if (!pulled && tess.patchType === HgiTessellationState.PatchType.Isoline) {
      // Storm never asks for isolines (hdSt/renderPassState.cpp:1094-1116);
      // hgiMetal draws them as triangles with line fill
      // (graphicsPipeline.mm:208-221), which WebGPU cannot rasterize.
      TF_CODING_ERROR(`HgiWebGPU: isoline patches of '${desc.debugName}' are not supported`)
      return false
    }
    let tessellation: HgiWebGPUTessellationConfig | null = null
    let corners: number[] = []
    if (!pulled) {
      const domain = tess.patchType === HgiTessellationState.PatchType.Triangle ? 'tri' : 'quad'
      const outputPrimitive = HgiWebGPUTessellatorOutputPrimitiveForMetalWinding(
        HgiWebGPUMetalTessellationWinding(desc.rasterizationState.winding))
      // _SetTessellationStateFromShaderFunctions (graphicsPipeline.mm:
      // 109-160): the partition mode of the post-tessellation vertex
      // function, which the control pipeline's program also holds.
      const program = desc.shaderProgram.Get() as HgiWebGPUShaderProgram | null
      const ptvs = program?.getPostTessVertexFunction()
      tessellation = {
        domain,
        partitioning: HgiWebGPUTessellatorPartitioningForSpacing(
          ptvs?.getDescriptor().tessellationDescriptor.spacing ?? 0),
        outputPrimitive,
      }
      corners = HgiWebGPUConstantPatchCorners(domain)
    }

    const attributes: HgiWebGPUPulledAttributeLayout[] = []
    for (const a of info.attributes) {
      let found = false
      for (const vbo of desc.vertexBuffers) {
        const va = vbo.vertexAttributes.find(x => x.shaderBindLocation === a.location)
        if (!va) continue
        found = true
        // The generated fetch reads 32-bit words of the shader type.
        const base = HgiGetComponentBaseFormat(va.format)
        const scalar = base === HgiFormat.HgiFormatFloat32 ? 'f32' : base === HgiFormat.HgiFormatInt32 ? 'i32' : null
        const m = /^(?:vec([234])<(f32|i32|u32)>|(f32|i32|u32))$/.exec(a.wgslType)
        const count = m?.[1] ? Number(m[1]) : 1
        const shaderScalar = m?.[2] ?? m?.[3]
        // HgiFormatPackedInt1010102 (Storm's packed normals) is pulled as one
        // word and unpacked to vec3/vec4<f32>, as Metal's
        // MTLVertexFormatInt1010102Normalized vertex format reads it.
        const packed = va.format === HgiFormat.HgiFormatPackedInt1010102 &&
          (a.wgslType === 'vec3<f32>' || a.wgslType === 'vec4<f32>')
        if (!packed && (!scalar || HgiGetComponentCount(va.format) !== count ||
            (shaderScalar === 'f32') !== (scalar === 'f32'))) {
          TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' location ${a.location}: format ` +
            `${HgiFormat[va.format]} cannot be pulled as ${a.wgslType}`)
          return false
        }
        if (va.offset % 4 !== 0 || vbo.vertexStride % 4 !== 0) {
          TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' location ${a.location} is not 4-byte aligned`)
          return false
        }
        attributes.push({
          location: a.location,
          bindingIndex: vbo.bindingIndex,
          offset: va.offset,
          stride: vbo.vertexStride,
          stepFunction: vbo.vertexStepFunction,
          ...(packed ? { packedInt1010102: true } : {}),
        })
        break
      }
      if (!found) {
        TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' has no vertex attribute for location ${a.location}`)
        return false
      }
    }
    this._patchEmulation = {
      primitive: info.primitive,
      verticesPerPatch: info.verticesPerPatch,
      controlPoints: pulled ? 1 : tess.primitiveIndexSize,
      attributeSlots: info.attributeSlots,
      attributes,
      tessellated,
      tessellation,
      corners,
      tessFactorsBindIndex: info.tessFactorsBindIndex,
      lines: false,
      packed: false,
    }
    return true
  }

  /** The emulated patch draw's parameters, or null when the pipeline does
   *  not draw patches. */
  getPatchEmulation(): HgiWebGPUPatchEmulation | null {
    return this._patchEmulation
  }

  /** hgiMetal/graphicsPipeline.mm:37-52 */
  _destroy(): void {
    this._pendingDescriptor = null
    this._renderPipelineState = null
    this._computePipelineState = null
    this._rasterizationDisabled = false
    this._exceedsDeviceLimits = false
    this._pipelineLayout = null
    this._patchEmulation = null
    this._bindGroupLayouts = { layouts: [], entries: [] }
  }

  /** The pipeline draws with rasterization disabled (rasterizerEnabled
   *  false, not the post-tessellation control stage): its draws have no
   *  effect in WebGPU and are not recorded. */
  isRasterizationDisabled(): boolean {
    return this._rasterizationDisabled
  }

  /** The pipeline's bindings exceed the device's binding limits
   *  (HgiWebGPUBindingLimitsExceeded): it was not created, and its draws
   *  are not recorded. */
  exceedsDeviceLimits(): boolean {
    return this._exceedsDeviceLimits
  }

  getRenderPipelineState(): GPURenderPipeline | null {
    // hgiwebgpu-pipeline-ahead: still compiling in the background, so
    // created now, as without it.
    const pending = this._pendingDescriptor
    if (pending) {
      this._pendingDescriptor = null
      this._createRenderPipelineNow(this._device, pending)
    }
    return this._renderPipelineState
  }

  /** The post-tessellation control stage's compute pipeline
   *  (HgiTessellationState::TessControl), or null. */
  getComputePipelineState(): GPUComputePipeline | null {
    return this._computePipelineState
  }

  getBindGroupLayouts(): HgiWebGPUBindGroupLayouts {
    return this._bindGroupLayouts
  }
}
