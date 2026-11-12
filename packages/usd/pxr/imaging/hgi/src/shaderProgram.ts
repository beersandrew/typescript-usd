// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/shaderProgram.cpp,
//  pxr/imaging/hgi/shaderProgram.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/shaderProgram.{h,cpp} (OpenUSD 26.11.1).

import { HgiHandle, HgiHandleVectorEquals } from './handle.ts'
import type { HgiShaderFunctionHandleVector } from './shaderFunction.ts'

/** shaderProgram.h:34-41 */
export class HgiShaderProgramDesc {
  debugName = ''
  shaderFunctions: HgiShaderFunctionHandleVector = []

  /** operator== (shaderProgram.cpp:29-35) */
  equals(rhs: HgiShaderProgramDesc): boolean {
    return this.debugName === rhs.debugName &&
      HgiHandleVectorEquals(this.shaderFunctions, rhs.shaderFunctions)
  }
}

/** shaderProgram.h:63-114 */
export abstract class HgiShaderProgram {
  protected _descriptor: HgiShaderProgramDesc

  /** shaderProgram.cpp:11-14 */
  protected constructor(desc: HgiShaderProgramDesc) {
    this._descriptor = new HgiShaderProgramDesc()
    this._descriptor.debugName = desc.debugName
    this._descriptor.shaderFunctions = [...desc.shaderFunctions]
  }

  /** shaderProgram.cpp:18-22 */
  getDescriptor(): HgiShaderProgramDesc {
    return this._descriptor
  }

  /** shaderProgram.h:75 */
  abstract isValid(): boolean

  /** shaderProgram.h:79 */
  abstract getCompileErrors(): string

  /** shaderProgram.h:83 */
  abstract getShaderFunctions(): HgiShaderFunctionHandleVector

  /** shaderProgram.h:90 */
  abstract getByteSizeOfResource(): number

  /** shaderProgram.h:102. The backend object itself (uint64_t upstream). */
  abstract getRawResource(): unknown
}

/** shaderProgram.h:116-117 */
export type HgiShaderProgramHandle = HgiHandle<HgiShaderProgram>
export type HgiShaderProgramHandleVector = HgiShaderProgramHandle[]
