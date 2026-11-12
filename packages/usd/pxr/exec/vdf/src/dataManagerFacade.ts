// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dataManagerFacade.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dataManagerFacade.h.

import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

/**
 * VdfDataManagerFacade (dataManagerFacade.h:23-42): gives clients access to
 * values cached on an executor, without exposing the executor API.
 */
export class VdfDataManagerFacade {
  private readonly _executor: VdfExecutorInterface

  /** dataManagerFacade.h:26-28. */
  constructor(executor: VdfExecutorInterface) {
    this._executor = executor
  }

  /**
   * GetOutputValue (dataManagerFacade.h:34-38): the value cached at `output`
   * for `mask`, or null on cache misses.
   */
  getOutputValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    return this._executor.getOutputValue(output, mask)
  }
}
