// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dataManagerBasedSubExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dataManagerBasedSubExecutor.h.
//
// See the header of dataManagerBasedExecutor.ts for the TS shape of the
// DataManagerType template argument.

import type { VdfConnection } from './connection.ts'
import {
  VdfDataManagerBasedExecutor,
  type VdfDataManagerConcept,
  type VdfDataManagerType,
} from './dataManagerBasedExecutor.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

/**
 * VdfDataManagerBasedSubExecutor (dataManagerBasedSubExecutor.h:30-99):
 * base class for executors that use a data manager, and support reading
 * caches from a parent executor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class VdfDataManagerBasedSubExecutor<DM extends VdfDataManagerConcept<any>>
  extends VdfDataManagerBasedExecutor<DM> {
  /** dataManagerBasedSubExecutor.h:41-48: optionally with a parent executor. */
  protected constructor(
    dataManagerType: VdfDataManagerType<DM>,
    parentExecutor: VdfExecutorInterface | null = null) {
    super(dataManagerType, parentExecutor)
  }

  /** _GetInputValue (dataManagerBasedSubExecutor.h:58-69). */
  override _getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null {
    // Lookup the output value in the local data manager, first!
    const data = this._dataManager.getInputValue(connection, mask)
    if (data) {
      return data
    }

    // If available, also check the parent executor for the output value.
    return this._getParentExecutorValue(connection.getSourceOutput(), mask)
  }

  /** _GetOutputValueForReading (dataManagerBasedSubExecutor.h:73-85). */
  override _getOutputValueForReading(output: VdfOutput, mask: VdfMask): VdfVector | null {
    // Lookup the output value in the local data manager, first!
    const data = this._dataManager.getOutputValueForReading(
      this._dataManager.getDataHandle(output.getId()), mask)
    if (data) {
      return data
    }

    // If available, also check the parent executor for the output value.
    return this._getParentExecutorValue(output, mask)
  }

  /** _GetParentExecutorValue (dataManagerBasedSubExecutor.h:90-97). */
  private _getParentExecutorValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    const parentExecutor = this.getParentExecutor()
    return parentExecutor
      ? parentExecutor.getOutputValue(output, mask)
      : null
  }
}
