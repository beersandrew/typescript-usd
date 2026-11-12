// Ported from OpenUSD 26.11.1: pxr/exec/exec/callbackNode.cpp,
//  pxr/exec/exec/callbackNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/callbackNode.h and callbackNode.cpp.

import { Error as TfError } from 'typescript-usd/tf'
import type { VdfContext } from 'typescript-usd/vdf'
import type { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { ExecCallbackFn } from './types.ts'

/** Execution node that invokes a provided callback (callbackNode.h:23-42). */
export class Exec_CallbackNode extends VdfNode {
  readonly #callback: ExecCallbackFn

  constructor(
    network: VdfNetwork,
    inputSpecs: VdfInputSpecs,
    outputSpecs: VdfOutputSpecs,
    callback: ExecCallbackFn,
  ) {
    super(network, inputSpecs, outputSpecs)
    this.#callback = callback
  }

  /** callbackNode.cpp:14-28 */
  override compute(context: VdfContext): void {
    try {
      this.#callback(context)
    } catch (e) {
      // TF_FATAL_ERROR aborts upstream rather than throwing an exception the
      // catch clauses could see; here it throws, so it passes through.
      if (e instanceof TfError && e.isFatal()) throw e
      if (e instanceof Error) {
        context.CodingError(
          `Exception thrown during callback node execution: '${e.message}'`)
      } else {
        context.CodingError('Exception thrown during callback node execution.')
      }
    }
  }
}
