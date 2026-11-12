// Ported from OpenUSD 26.11.1: pxr/exec/vdf/connection.cpp,
//  pxr/exec/vdf/connection.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/connection.h and connection.cpp.
//
// A VdfConnection connects a source VdfOutput to a target VdfInput, carrying
// a mask. Connections are owned by their target input.

import { TF_DEV_AXIOM } from 'typescript-usd/tf'

import type { VdfInput } from './input.ts'
import type { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'

export class VdfConnection {
  private readonly _output: VdfOutput
  private readonly _mask: VdfMask
  private readonly _input: VdfInput

  /** VdfConnection(output, mask, input) (connection.h:33). */
  constructor(output: VdfOutput, mask: VdfMask, input: VdfInput) {
    this._output = output
    this._mask = mask
    this._input = input
  }

  /** GetSourceNode (connection.h:39-48). */
  getSourceNode(): VdfNode {
    TF_DEV_AXIOM(this._output, '_output')
    return this._output.getNode()
  }

  /** GetTargetNode (connection.h:51-60). */
  getTargetNode(): VdfNode {
    TF_DEV_AXIOM(this._input, '_input')
    return this._input.getNode()
  }

  /** GetSourceOutput (connection.h:63-72). */
  getSourceOutput(): VdfOutput {
    TF_DEV_AXIOM(this._output, '_output')
    return this._output
  }

  /** GetNonConstSourceOutput (connection.h:76). */
  getNonConstSourceOutput(): VdfOutput {
    TF_DEV_AXIOM(this._output, '_output')
    return this._output
  }

  /** GetSourceMaskedOutput (connection.h:82). */
  getSourceMaskedOutput(): VdfMaskedOutput {
    return new VdfMaskedOutput(this.getNonConstSourceOutput(), this.GetMask())
  }

  /** GetTargetInput (connection.h:87-96). */
  getTargetInput(): VdfInput {
    TF_DEV_AXIOM(this._input, '_input')
    return this._input
  }

  /** GetMask (connection.h:99). */
  GetMask(): VdfMask {
    return this._mask
  }

  /** GetDebugName (connection.cpp:11-21). */
  getDebugName(): string {
    return this.getSourceOutput().getDebugName() + ' -> ' +
      this.getTargetInput().getDebugName()
  }
}
