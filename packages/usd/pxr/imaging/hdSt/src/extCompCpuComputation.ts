// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompCpuComputation.cpp,
//  pxr/imaging/hdSt/extCompCpuComputation.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompCpuComputation.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergence: CreateComputation's computationSources out-parameter is a
// caller-provided array.

import {
  ExtComputationContextInternal as HdExtComputationContextInternal,
  NullBufferSource as HdNullBufferSource, PrimTypeTokens as HdPrimTypeTokens,
  type BufferSource as HdBufferSource, type ExtComputation as HdExtComputation,
  type SceneDelegate as HdSceneDelegate,
} from 'typescript-usd/hd'
import { Value as VtValue } from 'typescript-usd/vt'
import { HdSt_ExtCompComputedInputSource } from './extCompComputedInputSource.ts'
import type { HdSt_ExtCompInputSource } from './extCompInputSource.ts'
import { HdSt_ExtCompSceneInputSource } from './extCompSceneInputSource.ts'

/** extCompCpuComputation.h:35-124. A Buffer Source that represents a CPU
 *  implementation of a ExtComputation.
 *
 *  The computation implements the basic: input->processing->output model
 *  where the inputs are other buffer sources and processing happens during
 *  resolve.
 *
 *  As a computation may have many outputs, the outputs from the CPU
 *  Computation can not be directly associated with a BAR. Instead other
 *  buffer source computations bind the output to sources that can be used in
 *  a BAR.
 *
 *  Outputs to a computation are in SOA form, so a computation may have many
 *  outputs, but each output has the same number of elements in it. */
export class HdStExtCompCpuComputation extends HdNullBufferSource {
  /** extCompCpuComputation.cpp:21-22 */
  static readonly INVALID_OUTPUT_INDEX = Number.MAX_SAFE_INTEGER

  private _outputValues: VtValue[] = []

  /** extCompCpuComputation.cpp:24-38. Constructs a new Cpu ExtComputation
   *  source. inputs provide a list of buffer sources that this computation
   *  requires. outputs is a list of outputs by names that the computation
   *  produces. Num elements specifies the number of elements in the
   *  output. sceneDelegate and id are used to callback to the scene
   *  delegate in order to invoke the computation. */
  constructor(
    private readonly _id: string,
    private readonly _inputs: HdSt_ExtCompInputSource[],
    private readonly _outputs: string[],
    private readonly _numElements: number,
    private readonly _sceneDelegate: HdSceneDelegate | null,
  ) {
    super()
  }

  /** extCompCpuComputation.cpp:42-115. Create a CPU computation
   *  implementing the given abstract computation. The scene delegate
   *  identifies which delegate to pass to the input and output nodes to
   *  obtain the data. */
  static createComputation(
    sceneDelegate: HdSceneDelegate,
    computation: HdExtComputation,
    computationSources: HdBufferSource[],
  ): HdStExtCompCpuComputation {
    const renderIndex = sceneDelegate.getRenderIndex()

    const id = computation.getId()

    const inputs: HdSt_ExtCompInputSource[] = []
    for (const inputName of computation.getSceneInputNames()) {
      const inputValue = sceneDelegate.getExtComputationInput(id, inputName)
      const inputSource = new HdSt_ExtCompSceneInputSource(inputName, inputValue)
      computationSources.push(inputSource)
      inputs.push(inputSource)
    }

    for (const compInput of computation.getComputationInputs()) {
      const sourceComp = renderIndex.getSprim(HdPrimTypeTokens.extComputation,
        compInput.sourceComputationId) as HdExtComputation | undefined

      if (sourceComp) {
        //
        // Computations with no outputs act as input aggregators, i.e.
        // the inputs are retrieved directly from the scene delegate
        // without creating a separate computation.
        //
        if (sourceComp.isInputAggregation()) {
          const inputValue =
            sceneDelegate.getExtComputationInput(
              compInput.sourceComputationId,
              compInput.name)
          const inputSource = new HdSt_ExtCompSceneInputSource(
            compInput.name, inputValue)
          computationSources.push(inputSource)
          inputs.push(inputSource)
          continue
        }

        const sourceComputation =
          HdStExtCompCpuComputation.createComputation(sceneDelegate,
            sourceComp,
            computationSources)

        const inputSource = new HdSt_ExtCompComputedInputSource(
          compInput.name,
          sourceComputation,
          compInput.sourceComputationOutputName)

        computationSources.push(inputSource)
        inputs.push(inputSource)
      }
    }

    const result = new HdStExtCompCpuComputation(id,
      inputs,
      computation.getOutputNames(),
      computation.getElementCount(),
      sceneDelegate)

    computationSources.push(result)

    return result
  }

  /** extCompCpuComputation.cpp:117-121. Returns the id for this
   *  computation as a token. */
  override getName(): string {
    return this._id
  }

  /** extCompCpuComputation.cpp:123-179. Ask the scene delegate to run the
   *  computation and captures the output signals. */
  override resolve(): boolean {
    const numInputs = this._inputs.length

    let inputError = false
    for (let inputNum = 0; inputNum < numInputs; ++inputNum) {
      if (this._inputs[inputNum]!.isValid()) {
        if (!this._inputs[inputNum]!.isResolved()) {
          return false
        }

        inputError ||= this._inputs[inputNum]!.hasResolveError()
      } else {
        inputError = true
      }
    }

    if (!this._tryLock()) return false

    if (inputError) {
      this._setResolveError()
      return true
    }

    const context = new HdExtComputationContextInternal()

    for (let inputNum = 0; inputNum < numInputs; ++inputNum) {
      const input = this._inputs[inputNum]!
      context.setInputValue(input.getName(), input.GetValue())
    }

    this._sceneDelegate!.invokeExtComputation(this._id, context)
    if (context.hasComputationError()) {
      this._setResolveError()
      return true
    }

    const numOutputs = this._outputs.length

    this._outputValues = new Array<VtValue>(numOutputs)
    for (let outputNum = 0; outputNum < numOutputs; ++outputNum) {
      const outputName = this._outputs[outputNum]!

      const value = context.getOutputValue(outputName)
      if (value === undefined) {
        this._setResolveError()
        return true
      }
      this._outputValues[outputNum] = value
    }

    this._setResolved()
    return true
  }

  /** extCompCpuComputation.cpp:181-185 */
  override getNumElements(): number {
    return this._numElements
  }

  /** extCompCpuComputation.cpp:187-198. Converts a output name token into
   *  an index. */
  getOutputIndex(outputName: string): number {
    const numOutputs = this._outputs.length
    for (let outputNum = 0; outputNum < numOutputs; ++outputNum) {
      if (outputName === this._outputs[outputNum]) {
        return outputNum
      }
    }

    return HdStExtCompCpuComputation.INVALID_OUTPUT_INDEX
  }

  /** extCompCpuComputation.cpp:200-204. Returns the value of the specified
   *  output (after the computations been Resolved). */
  getOutputByIndex(index: number): VtValue {
    return this._outputValues[index] ?? VtValue.getEmpty()
  }

  /** extCompCpuComputation.cpp:206-210. Returns if the computation is
   *  specified correctly. */
  protected override _checkValid(): boolean {
    return this._sceneDelegate !== null
  }
}

/** extCompCpuComputation.h:29-30 */
export type HdStExtCompCpuComputationSharedPtr = HdStExtCompCpuComputation
