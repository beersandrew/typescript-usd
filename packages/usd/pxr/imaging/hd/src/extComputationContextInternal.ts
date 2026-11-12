// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/extComputationContextInternal.cpp,
//  pxr/imaging/hd/extComputationContextInternal.h,
//  pxr/imaging/hd/extComputationContext.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputationContextInternal.{h,cpp} (OpenUSD
// 26.11.1), the HdExtComputationContext (hd/extComputationContext.h)
// implementation HdStExtCompCpuComputation passes to the scene delegate's
// InvokeExtComputation.
//
// Divergence: the HdExtComputationContext of this port
// (extComputationUtils.ts) is the number-valued context of the
// HdExtComputationUtils sampling slice. This class holds VtValues as upstream
// does and has the same method names, so callbacks written against either
// accept it; HdSceneDelegate::InvokeExtComputation accepts both.
// GetOptionalInputValuePtr is GetOptionalInputValue (undefined for a missing
// input), as in extComputationUtils.ts.

import { Value as VtValue } from 'typescript-usd/vt'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'
import type { HdExtComputationContext } from './extComputationUtils.ts'

/** The contexts HdSceneDelegate::InvokeExtComputation and
 *  HdExtComputationCpuCallback::Compute accept in this port (see the header):
 *  upstream's parameter is the abstract HdExtComputationContext. */
export type HdExtComputationContextArg =
  HdExtComputationContext | HdExtComputationContextInternal

/** extComputationContextInternal.h:19-80 */
export class HdExtComputationContextInternal {
  private readonly _inputs = new Map<string, VtValue>()
  private readonly _outputs = new Map<string, VtValue>()
  private _compuationError = false

  /** extComputationContextInternal.cpp:61-74. Obtains the value of an named
   *  input to the computation. Issues a coding error and returns an empty
   *  value if the input is missing. */
  getInputValue(name: string): VtValue {
    const value = this._inputs.get(name)
    if (value === undefined) {
      TF_CODING_ERROR(`Asking for invalid input ${name}`)
      return VtValue.getEmpty()
    }
    return value
  }

  /** extComputationContextInternal.cpp:76-86 */
  getOptionalInputValue(name: string): VtValue | undefined {
    return this._inputs.get(name)
  }

  /** extComputationContextInternal.cpp:88-93 */
  setOutputValue(name: string, output: VtValue): void {
    // std::map::emplace: an existing output is not replaced.
    if (!this._outputs.has(name)) {
      this._outputs.set(name, output)
    }
  }

  /** extComputationContextInternal.cpp:24-29. Adds the named input to the
   *  execution environment. If the input already exists, the value is not
   *  replaced. */
  setInputValue(name: string, input: VtValue): void {
    if (!this._inputs.has(name)) {
      this._inputs.set(name, input)
    }
  }

  /** extComputationContextInternal.cpp:31-45. Fetches the named output from
   *  the execution environment; undefined (with a warning) if the output is
   *  not present. */
  getOutputValue(name: string): VtValue | undefined {
    const value = this._outputs.get(name)
    if (value === undefined) {
      TF_WARN(`output not specified: ${name}`)
    }
    return value
  }

  /** extComputationContextInternal.cpp:47-51 */
  hasComputationError(): boolean {
    return this._compuationError
  }

  /** extComputationContextInternal.cpp:54-58 */
  raiseComputationError(): void {
    this._compuationError = true
  }
}
