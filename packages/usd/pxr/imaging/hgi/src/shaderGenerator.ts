// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/shaderGenerator.cpp,
//  pxr/imaging/hgi/shaderGenerator.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/shaderGenerator.{h,cpp} (OpenUSD 26.11.1).

import type { HgiShaderStage } from './enums.ts'
import type { HgiShaderFunctionDesc } from './shaderFunctionDesc.ts'
import { HgiStringStream } from './stringStream.ts'

/** shaderGenerator.h:30-70. Base class for shader function generation.
 *  Given a descriptor, converts glslfx domain language to concrete shader
 *  languages. Can be extended with new types of code sections and
 *  specialized for different APIs. */
export abstract class HgiShaderGenerator {
  protected readonly _descriptor: HgiShaderFunctionDesc

  // This is used if the descriptor does not specify a string
  // to be used as the destination for generated output.
  private _localGeneratedShaderCode = ''

  /** shaderGenerator.cpp:16-19 */
  protected constructor(descriptor: HgiShaderFunctionDesc) {
    this._descriptor = descriptor
  }

  /** shaderGenerator.cpp:23-37: execute shader generation. */
  Execute(): void {
    const ss = new HgiStringStream()

    // Use the protected version which can be overridden
    this._execute(ss)

    // Capture the result as specified by the descriptor or locally.
    if (this._descriptor.generatedShaderCodeOut) {
      this._descriptor.generatedShaderCodeOut.value = ss.str()
    } else {
      this._localGeneratedShaderCode = ss.str()
    }
  }

  /** shaderGenerator.cpp:61-70: return generated shader source. */
  getGeneratedShaderCode(): string {
    // Return the result as specified by the descriptor or locally.
    if (this._descriptor.generatedShaderCodeOut) {
      return this._descriptor.generatedShaderCodeOut.value
    } else {
      return this._localGeneratedShaderCode
    }
  }

  /** shaderGenerator.h:49 */
  protected abstract _execute(ss: HgiStringStream): void

  /** shaderGenerator.cpp:39-45 */
  protected _getShaderCodeDeclarations(): string {
    return this._descriptor.shaderCodeDeclarations ?? ''
  }

  /** shaderGenerator.cpp:47-53 */
  protected _getShaderCode(): string {
    return this._descriptor.shaderCode ?? ''
  }

  /** shaderGenerator.cpp:55-59 */
  protected _getShaderStage(): HgiShaderStage {
    return this._descriptor.shaderStage
  }
}
