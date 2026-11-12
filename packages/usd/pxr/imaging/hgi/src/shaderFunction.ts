// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/shaderFunction.cpp,
//  pxr/imaging/hgi/shaderFunction.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/shaderFunction.{h,cpp} (OpenUSD 26.11.1).

import { HgiHandle } from './handle.ts'
import type { HgiShaderFunctionDesc } from './shaderFunctionDesc.ts'

/** shaderFunction.h:30-77 */
export abstract class HgiShaderFunction {
  protected _descriptor: HgiShaderFunctionDesc

  /** shaderFunction.cpp:17-20 */
  protected constructor(desc: HgiShaderFunctionDesc) {
    this._descriptor = desc.clone()
  }

  /** shaderFunction.cpp:11-15 */
  getDescriptor(): HgiShaderFunctionDesc {
    return this._descriptor
  }

  /** shaderFunction.h:42 */
  abstract isValid(): boolean

  /** shaderFunction.h:46 */
  abstract getCompileErrors(): string

  /** shaderFunction.h:51 */
  abstract getByteSizeOfResource(): number

  /** shaderFunction.h:65. The backend object itself (uint64_t upstream). */
  abstract getRawResource(): unknown
}

/** shaderFunction.h:79-80 */
export type HgiShaderFunctionHandle = HgiHandle<HgiShaderFunction>
export type HgiShaderFunctionHandleVector = HgiShaderFunctionHandle[]
