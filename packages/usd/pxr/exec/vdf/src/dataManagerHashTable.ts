// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dataManagerHashTable.cpp,
//  pxr/exec/vdf/dataManagerHashTable.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dataManagerHashTable.h and
// pxr/exec/vdf/dataManagerHashTable.cpp.
//
// The std::unordered_map<VdfId, OutputData> is a Map keyed by output id. The
// data handle (a pointer to the mapped value upstream) is the OutputData
// object, or null for an invalid handle.

import { VdfExecutorBufferData } from './executorBufferData.ts'
import { VdfExecutorDataManager } from './executorDataManager.ts'
import { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'
import { VdfSMBLData } from './smblData.ts'

/**
 * Vdf_ExecutorDataManagerTraits<VdfDataManagerHashTable>::OutputData
 * (dataManagerHashTable.h:44-56): the output data stored at each entry.
 */
export class VdfDataManagerHashTable_OutputData {
  readonly bufferData = new VdfExecutorBufferData()
  readonly invalidationData = new VdfExecutorInvalidationData()
  invalidationTimestamp = VdfExecutorInvalidationData.InitialInvalidationTimestamp
  smblData: VdfSMBLData | null = null
  touched = false
}

/**
 * Vdf_ExecutorDataManagerTraits<VdfDataManagerHashTable>::DataHandle
 * (dataManagerHashTable.h:61): a pointer to the value stored in the table.
 */
export type VdfDataManagerHashTable_DataHandle = VdfDataManagerHashTable_OutputData | null

/**
 * VdfDataManagerHashTable (dataManagerHashTable.h:72-267): a data manager
 * for executors that stores data in a hash table.
 */
export class VdfDataManagerHashTable
  extends VdfExecutorDataManager<VdfDataManagerHashTable_DataHandle> {
  // dataManagerHashTable.h:265: map from outputs to their executor data.
  private _outputData = new Map<number, VdfDataManagerHashTable_OutputData>()

  /** Resize (dataManagerHashTable.cpp:11-15): nothing to do. */
  resize(_network: VdfNetwork): void {}

  /** IsValidDataHandle (dataManagerHashTable.h:112-114). */
  isValidDataHandle(handle: VdfDataManagerHashTable_DataHandle): boolean {
    return handle !== null
  }

  /** GetOrCreateDataHandle (dataManagerHashTable.h:121-131). */
  getOrCreateDataHandle(outputId: number): VdfDataManagerHashTable_OutputData {
    let data = this._outputData.get(outputId)
    if (!data) {
      data = new VdfDataManagerHashTable_OutputData()
      this._outputData.set(outputId, data)
    }
    return data
  }

  /** GetDataHandle (dataManagerHashTable.h:137-139). */
  getDataHandle(outputId: number): VdfDataManagerHashTable_DataHandle {
    return this._outputData.get(outputId) ?? null
  }

  /** GetBufferData (dataManagerHashTable.h:146-148). */
  getBufferData(handle: VdfDataManagerHashTable_DataHandle): VdfExecutorBufferData {
    return handle!.bufferData
  }

  /** GetInvalidationData (dataManagerHashTable.h:156-159). */
  getInvalidationData(handle: VdfDataManagerHashTable_DataHandle): VdfExecutorInvalidationData {
    return handle!.invalidationData
  }

  /**
   * GetInvalidationTimestamp (dataManagerHashTable.h:163-174). Without a
   * handle, the base class's current timestamp.
   */
  override getInvalidationTimestamp(handle?: VdfDataManagerHashTable_DataHandle): number {
    if (handle === undefined) {
      return super.getInvalidationTimestamp()
    }
    return handle!.invalidationTimestamp
  }

  /** SetInvalidationTimestamp (dataManagerHashTable.h:181-185). */
  setInvalidationTimestamp(handle: VdfDataManagerHashTable_DataHandle, timestamp: number): void {
    handle!.invalidationTimestamp = timestamp
  }

  /** GetSMBLData (dataManagerHashTable.h:194-196). */
  getSMBLData(handle: VdfDataManagerHashTable_DataHandle): VdfSMBLData | null {
    return handle!.smblData
  }

  /** GetOrCreateSMBLData (dataManagerHashTable.h:204-209). */
  getOrCreateSMBLData(handle: VdfDataManagerHashTable_DataHandle): VdfSMBLData {
    if (!handle!.smblData) {
      handle!.smblData = new VdfSMBLData()
    }
    return handle!.smblData
  }

  /** IsTouched (dataManagerHashTable.h:217-219). */
  isTouched(handle: VdfDataManagerHashTable_DataHandle): boolean {
    return handle!.touched
  }

  /**
   * Touch (dataManagerHashTable.h:227-229). With a VdfOutput, the base
   * class's Touch(const VdfOutput &).
   */
  override touch(handleOrOutput: VdfDataManagerHashTable_DataHandle | VdfOutput): void {
    if (handleOrOutput instanceof VdfOutput) {
      super.touch(handleOrOutput)
      return
    }
    handleOrOutput!.touched = true
  }

  /** Untouch (dataManagerHashTable.h:237-241). */
  untouch(handle: VdfDataManagerHashTable_DataHandle): boolean {
    const wasTouched = handle!.touched
    handle!.touched = false
    return wasTouched
  }

  /** ClearDataForOutput (dataManagerHashTable.h:245-247). */
  clearDataForOutput(outputId: number): void {
    this._outputData.delete(outputId)
  }

  /** Clear (dataManagerHashTable.h:251-253). */
  clear(): void {
    this._outputData = new Map()
  }

  /** IsEmpty (dataManagerHashTable.h:257-259). */
  IsEmpty(): boolean {
    return this._outputData.size === 0
  }
}
