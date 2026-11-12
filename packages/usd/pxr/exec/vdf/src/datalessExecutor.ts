// Ported from OpenUSD 26.11.1: pxr/exec/vdf/datalessExecutor.cpp,
//  pxr/exec/vdf/datalessExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/datalessExecutor.h and
// pxr/exec/vdf/datalessExecutor.cpp.

import { TF_CODING_ERROR } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

/**
 * VdfDatalessExecutor (datalessExecutor.h:32-127): an abstract base class
 * for executors which do not store any data at all.
 */
export abstract class VdfDatalessExecutor extends VdfExecutorInterface {
  /**
   * Protected default constructor (datalessExecutor.cpp:11-14). Upstream
   * subclasses that have a parent executor set it with SetParentExecutor.
   */
  protected constructor() {
    super()
  }

  /** SetOutputValue (datalessExecutor.cpp:21-29): not supported. */
  setOutputValue(_output: VdfOutput, _value: VdfVector, _mask: VdfMask): void {
    TF_CODING_ERROR('Attempt to call SetOutputValue() on a dataless executor.')
  }

  /** TakeOutputValue (datalessExecutor.cpp:31-40): not supported. */
  takeOutputValue(_output: VdfOutput, _value: VdfVector, _mask: VdfMask): boolean {
    TF_CODING_ERROR('Attempt to call TakeOutputValue() on a dataless executor.')
    return false
  }

  /** IsEmpty (datalessExecutor.h:66-68): always empty. */
  IsEmpty(): boolean {
    return true
  }

  /** _GetInputValue (datalessExecutor.h:79-83). */
  _getInputValue(_connection: VdfConnection, _mask: VdfMask): VdfVector | null {
    return null
  }

  /** _GetOutputValueForReading (datalessExecutor.h:87-91). */
  _getOutputValueForReading(_output: VdfOutput, _mask: VdfMask): VdfVector | null {
    return null
  }

  /** _GetOutputValueForWriting (datalessExecutor.h:95-98). */
  _getOutputValueForWriting(_output: VdfOutput): VdfVector | null {
    return null
  }

  /** _UpdateInvalidationTimestamp (datalessExecutor.h:106): no effect. */
  protected _updateInvalidationTimestamp(): void {}

  /** _SetReferenceOutputValue (datalessExecutor.cpp:42-50): not supported. */
  _setReferenceOutputValue(_destOutput: VdfOutput, _sourceOutput: VdfOutput, _sourceMask: VdfMask): void {
    TF_CODING_ERROR('Attempt to call _SetReferenceOutputValue() on a dataless executor.')
  }

  /** _TouchOutput (datalessExecutor.h:125): no effect. */
  _touchOutput(_output: VdfOutput): void {}
}
