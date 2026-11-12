// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/graphicsPipeline.cpp,
//  pxr/imaging/hgi/graphicsPipeline.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/graphicsPipeline.{h,cpp} (OpenUSD 26.11.1).

import { Vec2f as GfVec2f } from 'typescript-usd/gf'
import {
  HgiAttachmentDesc,
  HgiAttachmentDescVectorEquals,
  type HgiAttachmentDescVector,
} from './attachmentDesc.ts'
import {
  HgiCompareFunction,
  HgiCullMode,
  HgiPolygonMode,
  HgiPrimitiveType,
  HgiSampleCount,
  HgiShaderStageBits,
  HgiStencilOp,
  HgiVertexBufferStepFunction,
  HgiWinding,
  type HgiShaderStage,
} from './enums.ts'
import { HgiHandle } from './handle.ts'
import type { HgiShaderProgramHandle } from './shaderProgram.ts'
import { HgiFormat } from './types.ts'

/** graphicsPipeline.h:40-48 (constructor: graphicsPipeline.cpp:10-17) */
export class HgiVertexAttributeDesc {
  format: HgiFormat = HgiFormat.HgiFormatFloat32Vec4
  offset = 0
  shaderBindLocation = 0

  /** operator== (graphicsPipeline.cpp:19-26) */
  equals(rhs: HgiVertexAttributeDesc): boolean {
    return this.format === rhs.format &&
      this.offset === rhs.offset &&
      this.shaderBindLocation === rhs.shaderBindLocation
  }
}
export type HgiVertexAttributeDescVector = HgiVertexAttributeDesc[]

/** graphicsPipeline.h:77-86 (constructor: graphicsPipeline.cpp:35-40) */
export class HgiVertexBufferDesc {
  bindingIndex = 0
  vertexAttributes: HgiVertexAttributeDesc[] = []
  vertexStepFunction: HgiVertexBufferStepFunction =
    HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerVertex
  vertexStride = 0

  /** operator== (graphicsPipeline.cpp:42-50) */
  equals(rhs: HgiVertexBufferDesc): boolean {
    return this.bindingIndex === rhs.bindingIndex &&
      this.vertexAttributes.length === rhs.vertexAttributes.length &&
      this.vertexAttributes.every((a, i) => a.equals(rhs.vertexAttributes[i]!)) &&
      this.vertexStepFunction === rhs.vertexStepFunction &&
      this.vertexStride === rhs.vertexStride
  }
}
export type HgiVertexBufferDescVector = HgiVertexBufferDesc[]

/** graphicsPipeline.h:118-127 (constructor: graphicsPipeline.cpp:59-65) */
export class HgiMultiSampleState {
  multiSampleEnable = true
  alphaToCoverageEnable = false
  alphaToOneEnable = false
  sampleCount: HgiSampleCount = HgiSampleCount.HgiSampleCount1

  /** operator== (graphicsPipeline.cpp:67-75) */
  equals(rhs: HgiMultiSampleState): boolean {
    return this.multiSampleEnable === rhs.multiSampleEnable &&
      this.alphaToCoverageEnable === rhs.alphaToCoverageEnable &&
      this.alphaToOneEnable === rhs.alphaToOneEnable &&
      this.sampleCount === rhs.sampleCount
  }
}

/** graphicsPipeline.h:167-181 (constructor: graphicsPipeline.cpp:84-95) */
export class HgiRasterizationState {
  polygonMode: HgiPolygonMode = HgiPolygonMode.HgiPolygonModeFill
  lineWidth = 1.0
  cullMode: HgiCullMode = HgiCullMode.HgiCullModeBack
  winding: HgiWinding = HgiWinding.HgiWindingCounterClockwise
  rasterizerEnabled = true
  depthClampEnabled = false
  depthRange: GfVec2f = new GfVec2f(0, 1)
  conservativeRaster = false
  numClipDistances = 0

  /** operator== (graphicsPipeline.cpp:97-110) */
  equals(rhs: HgiRasterizationState): boolean {
    return this.polygonMode === rhs.polygonMode &&
      this.lineWidth === rhs.lineWidth &&
      this.cullMode === rhs.cullMode &&
      this.winding === rhs.winding &&
      this.rasterizerEnabled === rhs.rasterizerEnabled &&
      this.depthClampEnabled === rhs.depthClampEnabled &&
      this.depthRange.equals(rhs.depthRange) &&
      this.conservativeRaster === rhs.conservativeRaster &&
      this.numClipDistances === rhs.numClipDistances
  }
}

/** graphicsPipeline.h:216-228 (constructor: graphicsPipeline.cpp:154-163) */
export class HgiStencilState {
  compareFn: HgiCompareFunction = HgiCompareFunction.HgiCompareFunctionAlways
  referenceValue = 0
  stencilFailOp: HgiStencilOp = HgiStencilOp.HgiStencilOpKeep
  depthFailOp: HgiStencilOp = HgiStencilOp.HgiStencilOpKeep
  depthStencilPassOp: HgiStencilOp = HgiStencilOp.HgiStencilOpKeep
  readMask = 0xffffffff
  writeMask = 0xffffffff

  /** operator== (graphicsPipeline.cpp:165-176) */
  equals(rhs: HgiStencilState): boolean {
    return this.compareFn === rhs.compareFn &&
      this.referenceValue === rhs.referenceValue &&
      this.stencilFailOp === rhs.stencilFailOp &&
      this.depthFailOp === rhs.depthFailOp &&
      this.depthStencilPassOp === rhs.depthStencilPassOp &&
      this.readMask === rhs.readMask &&
      this.writeMask === rhs.writeMask
  }
}

/** graphicsPipeline.h:269-285 (constructor: graphicsPipeline.cpp:119-130) */
export class HgiDepthStencilState {
  depthTestEnabled = true
  depthWriteEnabled = true
  depthCompareFn: HgiCompareFunction = HgiCompareFunction.HgiCompareFunctionLess

  depthBiasEnabled = false
  depthBiasConstantFactor = 0.0
  depthBiasSlopeFactor = 0.0

  stencilTestEnabled = false
  stencilFront = new HgiStencilState()
  stencilBack = new HgiStencilState()

  /** operator== (graphicsPipeline.cpp:132-145) */
  equals(rhs: HgiDepthStencilState): boolean {
    return this.depthTestEnabled === rhs.depthTestEnabled &&
      this.depthWriteEnabled === rhs.depthWriteEnabled &&
      this.depthCompareFn === rhs.depthCompareFn &&
      this.depthBiasEnabled === rhs.depthBiasEnabled &&
      this.depthBiasConstantFactor === rhs.depthBiasConstantFactor &&
      this.depthBiasSlopeFactor === rhs.depthBiasSlopeFactor &&
      this.stencilTestEnabled === rhs.stencilTestEnabled &&
      this.stencilFront.equals(rhs.stencilFront) &&
      this.stencilBack.equals(rhs.stencilBack)
  }
}

/** graphicsPipeline.h:308-314 (constructor: graphicsPipeline.cpp:185-189) */
export class HgiGraphicsShaderConstantsDesc {
  byteSize = 0
  stageUsage: HgiShaderStage = HgiShaderStageBits.HgiShaderStageFragment

  /** operator== (graphicsPipeline.cpp:191-197) */
  equals(rhs: HgiGraphicsShaderConstantsDesc): boolean {
    return this.byteSize === rhs.byteSize &&
      this.stageUsage === rhs.stageUsage
  }
}

/** graphicsPipeline.h:326-333 (constructor: graphicsPipeline.cpp:206-210) */
export class HgiTessellationLevel {
  innerTessLevel: [number, number] = [0, 0]
  outerTessLevel: [number, number, number, number] = [0, 0, 0, 0]
}

/** graphicsPipeline.h:350-354 */
export enum HgiTessellationStatePatchType { Triangle, Quad, Isoline }
/** graphicsPipeline.h:356-360 */
export enum HgiTessellationStateTessFactorMode { Constant, TessControl, TessVertex }

/** graphicsPipeline.h:348-369 (constructor: graphicsPipeline.cpp:212-217) */
export class HgiTessellationState {
  static readonly PatchType = HgiTessellationStatePatchType
  static readonly TessFactorMode = HgiTessellationStateTessFactorMode

  patchType = HgiTessellationStatePatchType.Triangle
  primitiveIndexSize = 0
  tessFactorMode = HgiTessellationStateTessFactorMode.Constant
  tessellationLevel = new HgiTessellationLevel()
}

/** graphicsPipeline.h:402-419 (constructor: graphicsPipeline.cpp:219-223) */
export class HgiGraphicsPipelineDesc {
  debugName = ''
  primitiveType: HgiPrimitiveType = HgiPrimitiveType.HgiPrimitiveTypeTriangleList
  shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  depthState = new HgiDepthStencilState()
  multiSampleState = new HgiMultiSampleState()
  rasterizationState = new HgiRasterizationState()
  vertexBuffers: HgiVertexBufferDescVector = []
  colorAttachmentDescs: HgiAttachmentDescVector = []
  depthAttachmentDesc = new HgiAttachmentDesc()
  resolveAttachments = false
  shaderConstantsDesc = new HgiGraphicsShaderConstantsDesc()
  tessellationState = new HgiTessellationState()

  /** operator== (graphicsPipeline.cpp:231-246); tessellationState is not
   *  compared upstream. */
  equals(rhs: HgiGraphicsPipelineDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.primitiveType === rhs.primitiveType &&
      this.shaderProgram.equals(rhs.shaderProgram) &&
      this.depthState.equals(rhs.depthState) &&
      this.multiSampleState.equals(rhs.multiSampleState) &&
      this.rasterizationState.equals(rhs.rasterizationState) &&
      this.vertexBuffers.length === rhs.vertexBuffers.length &&
      this.vertexBuffers.every((v, i) => v.equals(rhs.vertexBuffers[i]!)) &&
      HgiAttachmentDescVectorEquals(this.colorAttachmentDescs, rhs.colorAttachmentDescs) &&
      this.depthAttachmentDesc.equals(rhs.depthAttachmentDesc) &&
      this.resolveAttachments === rhs.resolveAttachments &&
      this.shaderConstantsDesc.equals(rhs.shaderConstantsDesc)
  }
}

/** graphicsPipeline.h:442-462 */
export abstract class HgiGraphicsPipeline {
  protected _descriptor: HgiGraphicsPipelineDesc

  /** graphicsPipeline.cpp:255-258 */
  protected constructor(desc: HgiGraphicsPipelineDesc) {
    this._descriptor = desc
  }

  /** graphicsPipeline.cpp:225-229 */
  getDescriptor(): HgiGraphicsPipelineDesc {
    return this._descriptor
  }
}

/** graphicsPipeline.h:464-465 */
export type HgiGraphicsPipelineHandle = HgiHandle<HgiGraphicsPipeline>
export type HgiGraphicsPipelineHandleVector = HgiGraphicsPipelineHandle[]
