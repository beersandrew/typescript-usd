// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompComputeShader.cpp,
//  pxr/imaging/hdSt/extCompComputeShader.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompComputeShader.{h,cpp} (OpenUSD
// 26.11.1).

import { ArchHash } from 'typescript-usd/arch'
import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import { ShaderTokens as HdShaderTokens, type ExtComputation as HdExtComputation } from 'typescript-usd/hd'
import type { HdStBindingRequest } from './binding.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import { HdStShaderCode, type HdStShaderCodeID } from './shaderCode.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

const _utf8 = new TextEncoder()

/** extCompComputeShader.h:28-76. An internal representation of a compute
 *  shader in Storm that allows the use of the code generation and resource
 *  binding system to generate a shader program. */
export class HdSt_ExtCompComputeShader extends HdStShaderCode {
  /** extCompComputeShader.cpp:22-26 */
  constructor(private readonly _extComp: HdExtComputation | null) {
    super()
  }

  /** extCompComputeShader.cpp:34-45 */
  override getSource(shaderStageKey: string): string {
    if (shaderStageKey === HdShaderTokens.computeShader) {
      if (TF_VERIFY(this._extComp)) {
        return this._extComp!.getGpuKernelSource()
      }
    }

    return ''
  }

  /** extCompComputeShader.cpp:47-56. Compute shaders currently serve GPU
   *  ExtComputations, wherein resource binding is managed explicitly. See
   *  HdStExtCompGpuComputationResource::Resolve() and
   *  HdStExtCompGpuComputation::Execute(..) */
  override bindResources(_program: number, _binder: HdSt_ResourceBinder): void {}

  /** extCompComputeShader.cpp:58-64. Resource binding is managed
   *  explicitly. See above comment. */
  override unbindResources(_program: number, _binder: HdSt_ResourceBinder): void {}

  /** extCompComputeShader.cpp:66-71. Resource binding is managed
   *  explicitly. See above comment. */
  override addBindings(_customBindings: HdStBindingRequest[]): void {}

  /** extCompComputeShader.cpp:73-85 */
  override computeHash(): HdStShaderCodeID {
    if (!TF_VERIFY(this._extComp)) {
      return 0n
    }

    const hash = 0n
    const kernel = _utf8.encode(this._extComp!.getGpuKernelSource())
    return TfHashCombine(hash, ArchHash(kernel, kernel.length))
  }

  /** extCompComputeShader.cpp:87-94 */
  getExtComputationId(): string {
    if (!TF_VERIFY(this._extComp)) {
      return ''
    }
    return this._extComp!.getId()
  }
}

/** extCompComputeShader.h:23-24 */
export type HdSt_ExtCompComputeShaderSharedPtr = HdSt_ExtCompComputeShader
