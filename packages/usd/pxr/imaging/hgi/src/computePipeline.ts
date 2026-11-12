// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/computePipeline.cpp,
//  pxr/imaging/hgi/computePipeline.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/computePipeline.{h,cpp} (OpenUSD 26.11.1).

import { HgiHandle } from './handle.ts'
import type { HgiShaderProgramHandle } from './shaderProgram.ts'

/** computePipeline.h:34-39 (constructor: computePipeline.cpp:10-13) */
export class HgiComputeShaderConstantsDesc {
  byteSize = 0

  /** operator== (computePipeline.cpp:16-21) */
  equals(rhs: HgiComputeShaderConstantsDesc): boolean {
    return this.byteSize === rhs.byteSize
  }
}

/** computePipeline.h:62-70 (constructor: computePipeline.cpp:30-33) */
export class HgiComputePipelineDesc {
  debugName = ''
  shaderProgram: HgiShaderProgramHandle = new HgiHandle()
  shaderConstantsDesc = new HgiComputeShaderConstantsDesc()

  /** operator== (computePipeline.cpp:35-42) */
  equals(rhs: HgiComputePipelineDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.shaderProgram.equals(rhs.shaderProgram) &&
      this.shaderConstantsDesc.equals(rhs.shaderConstantsDesc)
  }
}

/** computePipeline.h:92-112 */
export abstract class HgiComputePipeline {
  protected _descriptor: HgiComputePipelineDesc

  /** computePipeline.cpp:51-54 */
  protected constructor(desc: HgiComputePipelineDesc) {
    this._descriptor = desc
  }

  /** computePipeline.cpp:58-62 */
  getDescriptor(): HgiComputePipelineDesc {
    return this._descriptor
  }
}

/** computePipeline.h:114-115 */
export type HgiComputePipelineHandle = HgiHandle<HgiComputePipeline>
export type HgiComputePipelineHandleVector = HgiComputePipelineHandle[]
