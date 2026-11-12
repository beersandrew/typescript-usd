// Ported from OpenUSD 26.11.1: pxr/exec/vdf/parallelDataManagerVector.cpp,
//  pxr/exec/vdf/parallelDataManagerVector.h, pxr/exec/vdf/simpleExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/parallelDataManagerVector.h and
// pxr/exec/vdf/parallelDataManagerVector.cpp.
//
// Ported for VdfSimpleExecutor (simpleExecutor.h:33-37); the parallel
// executor engine that also uses it is not ported (openexec-parallel). The
// C++ destructor (parallelDataManagerVector.cpp:21-24) returns the data
// vector to the shared allocator; it is kept as Destroy().

import { Vdf_DataManagerAllocator } from './dataManagerAllocator.ts'
import type { VdfExecutorBufferData } from './executorBufferData.ts'
import type { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'
import { VdfParallelExecutorDataManager } from './parallelExecutorDataManager.ts'
import { Vdf_ParallelExecutorDataVector } from './parallelExecutorDataVector.ts'
import type { VdfVector } from './vector.ts'

// parallelDataManagerVector.cpp:16-19: the executor data vector allocator
// shared across instances of this class.
let _allocator: Vdf_DataManagerAllocator<Vdf_ParallelExecutorDataVector> | null = null
function _GetAllocator(): Vdf_DataManagerAllocator<Vdf_ParallelExecutorDataVector> {
  return _allocator ??= new Vdf_DataManagerAllocator(() => new Vdf_ParallelExecutorDataVector())
}

/**
 * VdfParallelDataManagerVector (parallelDataManagerVector.h:51-298): a data
 * manager for executors that stores data in a vector indexed by output ids.
 * Its data handle is an index (Vdf_ParallelExecutorDataVector::DataHandle).
 */
export class VdfParallelDataManagerVector extends VdfParallelExecutorDataManager<number> {
  // parallelDataManagerVector.h:296: the executor data vector.
  private _data: Vdf_ParallelExecutorDataVector | null = null

  /** The destructor (parallelDataManagerVector.cpp:21-24). */
  destroy(): void {
    _GetAllocator().deallocateLater(this._data)
    this._data = null
  }

  /** Resize (parallelDataManagerVector.cpp:26-38). */
  resize(network: VdfNetwork): void {
    // Allocate a new Vdf_ParallelExecutorDataVector if necessary.
    if (!this._data) {
      this._data = _GetAllocator().allocate(network)
    }

    // Otherwise, make sure to resize our current instance.
    else {
      this._data.resize(network)
    }
  }

  /** IsValidDataHandle (parallelDataManagerVector.h:92-94). */
  isValidDataHandle(handle: number): boolean {
    return handle !== Vdf_ParallelExecutorDataVector.InvalidHandle
  }

  /** GetOrCreateDataHandle (parallelDataManagerVector.h:105-107). */
  getOrCreateDataHandle(outputId: number): number {
    return this._data!.getOrCreateDataHandle(outputId)
  }

  /** GetDataHandle (parallelDataManagerVector.h:113-117). */
  getDataHandle(outputId: number): number {
    return this._data
      ? this._data.getDataHandle(outputId)
      : Vdf_ParallelExecutorDataVector.InvalidHandle
  }

  /** GetPrivateBufferData (parallelDataManagerVector.h:124-126). */
  getPrivateBufferData(handle: number): VdfExecutorBufferData {
    return this._data!.getPrivateBufferData(handle)
  }

  /** GetScratchBufferData (parallelDataManagerVector.h:133-135). */
  getScratchBufferData(handle: number): VdfExecutorBufferData {
    return this._data!.getScratchBufferData(handle)
  }

  /** GetPublicBufferData (parallelDataManagerVector.h:142-144). */
  getPublicBufferData(handle: number): VdfExecutorBufferData {
    return this._data!.getPublicBufferData(handle)
  }

  /** PublishPrivateBufferData (parallelDataManagerVector.h:154-156). */
  publishPrivateBufferData(handle: number): void {
    this._data!.publishPrivateBufferData(handle)
  }

  /** PublishScratchBufferData (parallelDataManagerVector.h:166-168). */
  publishScratchBufferData(handle: number): void {
    this._data!.publishScratchBufferData(handle)
  }

  /** GetTransferredBufferData (parallelDataManagerVector.h:177-180). */
  getTransferredBufferData(handle: number): VdfExecutorBufferData | null {
    return this._data!.getTransferredBufferData(handle)
  }

  /** TransferBufferData (parallelDataManagerVector.h:194-199). */
  transferBufferData(handle: number, value: VdfVector, mask: VdfMask): boolean {
    return this._data!.transferBufferData(handle, value, mask)
  }

  /** ResetTransferredBufferData (parallelDataManagerVector.h:208-210). */
  resetTransferredBufferData(handle: number): void {
    this._data!.resetTransferredBufferData(handle)
  }

  /** GetInvalidationData (parallelDataManagerVector.h:218-221). */
  getInvalidationData(handle: number): VdfExecutorInvalidationData {
    return this._data!.getInvalidationData(handle)
  }

  /**
   * GetInvalidationTimestamp (parallelDataManagerVector.h:225-236). Without
   * a handle, the base class's current timestamp.
   */
  override getInvalidationTimestamp(handle?: number): number {
    if (handle === undefined) {
      return super.getInvalidationTimestamp()
    }
    return this._data!.getInvalidationTimestamp(handle)
  }

  /** SetInvalidationTimestamp (parallelDataManagerVector.h:243-247). */
  setInvalidationTimestamp(handle: number, timestamp: number): void {
    this._data!.setInvalidationTimestamp(handle, timestamp)
  }

  /** IsTouched (parallelDataManagerVector.h:252-254). */
  isTouched(outputId: number): boolean {
    return this._data!.isTouched(outputId)
  }

  /**
   * Touch (parallelDataManagerVector.h:259-261). With a VdfOutput, the base
   * class's Touch(const VdfOutput &).
   */
  override touch(outputIdOrOutput: number | VdfOutput): void {
    if (outputIdOrOutput instanceof VdfOutput) {
      super.touch(outputIdOrOutput)
      return
    }
    this._data!.touch(outputIdOrOutput)
  }

  /** Untouch (parallelDataManagerVector.h:266-268). */
  untouch(outputId: number): boolean {
    return this._data!.untouch(outputId)
  }

  /** ClearDataForOutput (parallelDataManagerVector.cpp:40-50). */
  clearDataForOutput(outputId: number): void {
    if (this._data) {
      const dataHandle = this._data.getDataHandle(outputId)
      if (this.isValidDataHandle(dataHandle)) {
        this._data.Reset(dataHandle, outputId)
      }
    }
  }

  /** Clear (parallelDataManagerVector.cpp:52-62). */
  clear(): void {
    if (!this._data) {
      return
    }

    this._data.clear()
  }

  /** IsEmpty (parallelDataManagerVector.h:288-290). */
  IsEmpty(): boolean {
    return !this._data || this._data.getNumData() === 0
  }
}
