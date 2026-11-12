// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderProgram.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUShaderProgram. Modelled on pxr/imaging/hgiMetal/shaderProgram.mm:
// a program is the set of its stage functions.

import {
  HgiShaderProgram,
  HgiShaderStageBits,
  type HgiShaderFunctionHandleVector,
  type HgiShaderProgramDesc,
} from 'typescript-usd/hgi'
import type { HgiWebGPUShaderFunction } from './shaderFunction.ts'

export class HgiWebGPUShaderProgram extends HgiShaderProgram {
  private _vertexFunction: HgiWebGPUShaderFunction | null = null
  private _fragmentFunction: HgiWebGPUShaderFunction | null = null
  private _computeFunction: HgiWebGPUShaderFunction | null = null
  private _postTessVertexFunction: HgiWebGPUShaderFunction | null = null
  private _postTessControlFunction: HgiWebGPUShaderFunction | null = null
  private readonly _errors = ''

  /** hgiMetal/shaderProgram.mm:13-43 */
  constructor(desc: HgiShaderProgramDesc) {
    super(desc)
    for (const func of desc.shaderFunctions) {
      const fn = func.Get() as HgiWebGPUShaderFunction
      switch (fn.getDescriptor().shaderStage) {
        case HgiShaderStageBits.HgiShaderStageVertex:
          this._vertexFunction = fn
          break
        case HgiShaderStageBits.HgiShaderStageFragment:
          this._fragmentFunction = fn
          break
        case HgiShaderStageBits.HgiShaderStageCompute:
          this._computeFunction = fn
          break
        case HgiShaderStageBits.HgiShaderStagePostTessellationVertex:
          this._postTessVertexFunction = fn
          break
        case HgiShaderStageBits.HgiShaderStagePostTessellationControl:
          this._postTessControlFunction = fn
          break
      }
    }
    // WebGPU adaptation: the vertex-side outputs take the fragment inputs'
    // interpolation (HgiWebGPUShaderFunction.MatchInterstageOutputs).
    if (this._fragmentFunction) {
      this._vertexFunction?.matchInterstageOutputs(this._fragmentFunction)
      this._postTessVertexFunction?.matchInterstageOutputs(this._fragmentFunction)
    }
  }

  /** hgiMetal/shaderProgram.mm:47-51 */
  getShaderFunctions(): HgiShaderFunctionHandleVector {
    return this._descriptor.shaderFunctions
  }

  /** hgiMetal/shaderProgram.mm:53-57 */
  isValid(): boolean {
    return true
  }

  /** hgiMetal/shaderProgram.mm:59-63 */
  getCompileErrors(): string {
    return this._errors
  }

  /** hgiMetal/shaderProgram.mm:65-73 */
  getByteSizeOfResource(): number {
    let byteSize = 0
    for (const fn of this._descriptor.shaderFunctions) {
      byteSize += fn.Get()?.getByteSizeOfResource() ?? 0
    }
    return byteSize
  }

  /** hgiMetal/shaderProgram.mm:75-79 */
  getRawResource(): unknown {
    return 0
  }

  getVertexFunction(): HgiWebGPUShaderFunction | null { return this._vertexFunction }
  getFragmentFunction(): HgiWebGPUShaderFunction | null { return this._fragmentFunction }
  getComputeFunction(): HgiWebGPUShaderFunction | null { return this._computeFunction }
  /** hgiMetal/shaderProgram.h GetPostTessVertexFunction */
  getPostTessVertexFunction(): HgiWebGPUShaderFunction | null { return this._postTessVertexFunction }
  /** hgiMetal/shaderProgram.h GetPostTessControlFunction */
  getPostTessControlFunction(): HgiWebGPUShaderFunction | null { return this._postTessControlFunction }
}
