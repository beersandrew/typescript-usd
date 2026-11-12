// Ported from OpenUSD 26.11.1: pxr/exec/vdf/inputAndOutputSpecs.cpp,
//  pxr/exec/vdf/inputAndOutputSpecs.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/inputAndOutputSpecs.h and
// inputAndOutputSpecs.cpp.
//
// A hashable holder of a node's input specs and output specs.

import { HashCombine as TfHashCombine } from 'typescript-usd/tf'

import { VdfInputSpecs, VdfOutputSpecs } from './connectorSpecs.ts'

export class VdfInputAndOutputSpecs {
  private _inputSpecs: VdfInputSpecs
  private _outputSpecs: VdfOutputSpecs

  /** VdfInputAndOutputSpecs(inputSpecs, outputSpecs) (inputAndOutputSpecs.cpp:13): copies both. */
  constructor(inputSpecs: VdfInputSpecs, outputSpecs: VdfOutputSpecs) {
    this._inputSpecs = new VdfInputSpecs(inputSpecs)
    this._outputSpecs = new VdfOutputSpecs(outputSpecs)
  }

  /** Move assignment (inputAndOutputSpecs.cpp:25). */
  moveAssign(rhs: VdfInputAndOutputSpecs): this {
    this._inputSpecs.moveAssign(rhs._inputSpecs)
    this._outputSpecs.moveAssign(rhs._outputSpecs)
    return this
  }

  /** GetInputSpecs (inputAndOutputSpecs.h:44). */
  getInputSpecs(): VdfInputSpecs {
    return this._inputSpecs
  }

  /** GetOutputSpecs (inputAndOutputSpecs.h:48). */
  getOutputSpecs(): VdfOutputSpecs {
    return this._outputSpecs
  }

  /** AppendInputSpecs (inputAndOutputSpecs.h:52). */
  appendInputSpecs(inputSpecs: VdfInputSpecs): void {
    this._inputSpecs.append(inputSpecs)
  }

  /** AppendOutputSpecs (inputAndOutputSpecs.h:58). */
  appendOutputSpecs(outputSpecs: VdfOutputSpecs): void {
    this._outputSpecs.append(outputSpecs)
  }

  /** operator== (inputAndOutputSpecs.cpp:33). */
  Equals(rhs: VdfInputAndOutputSpecs): boolean {
    if (this === rhs) return true
    return this._inputSpecs.Equals(rhs._inputSpecs) &&
      this._outputSpecs.Equals(rhs._outputSpecs)
  }

  /** operator!= (inputAndOutputSpecs.h:69). */
  notEquals(rhs: VdfInputAndOutputSpecs): boolean {
    return !this.Equals(rhs)
  }

  /**
   * GetHash (inputAndOutputSpecs.cpp:44-90): hashes the sizes and up to three
   * specs at the front and back of the input and output specs.
   */
  getHash(): number {
    const num = 3
    const combine = (h: number, v: number): number =>
      Number(BigInt.asUintN(53, TfHashCombine(h, v)))

    const inputSpecs = this.getInputSpecs()
    const sizeInputs = inputSpecs.getSize()
    let hash = combine(0, sizeInputs)

    const numInputsFront = Math.min(sizeInputs, num)
    for (let i = 0; i < numInputsFront; ++i) {
      hash = combine(hash, inputSpecs.getInputSpec(i)!.getHash())
    }
    if (sizeInputs > num) {
      const numInputsBack = Math.min(sizeInputs - num, num)
      for (let i = sizeInputs - numInputsBack; i < sizeInputs; ++i) {
        hash = combine(hash, inputSpecs.getInputSpec(i)!.getHash())
      }
    }

    const outputSpecs = this.getOutputSpecs()
    const sizeOutputs = outputSpecs.getSize()
    hash = combine(hash, sizeOutputs)

    const numOutputsFront = Math.min(sizeOutputs, num)
    for (let i = 0; i < numOutputsFront; ++i) {
      hash = combine(hash, outputSpecs.getOutputSpec(i)!.getHash())
    }
    if (sizeOutputs > num) {
      const numOutputsBack = Math.min(sizeOutputs - num, num)
      for (let i = sizeOutputs - numOutputsBack; i < sizeOutputs; ++i) {
        hash = combine(hash, outputSpecs.getOutputSpec(i)!.getHash())
      }
    }

    return hash
  }
}
