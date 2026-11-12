// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/parallelExecutorDataManagerInterface.h,
//  pxr/exec/vdf/simpleExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1
// pxr/exec/vdf/parallelExecutorDataManagerInterface.h.
//
// Ported because VdfSimpleExecutor (simpleExecutor.h:33-37) stores its data
// in a VdfParallelDataManagerVector; the parallel *engine* is not ported
// (openexec-parallel). Single-threaded, the data manager's thread-safety
// guarantees hold trivially.
//
// As in executorDataManagerInterface.ts, the CRTP `_Self()->X` targets are
// abstract methods, and the methods that share a name with a method of
// VdfParallelExecutorDataManager take either form:
// - Touch(outputId) and VdfParallelExecutorDataManager::Touch(const VdfOutput &);
// - GetInvalidationTimestamp(handle) and the no-argument base method.

import type { VdfExecutorBufferData } from './executorBufferData.ts'
import type { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNetwork } from './network.ts'
import type { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

/**
 * Vdf_ParallelExecutorDataManagerInterface
 * (parallelExecutorDataManagerInterface.h:29-248): the interface contract
 * for parallel executor data manager implementations.
 */
export abstract class Vdf_ParallelExecutorDataManagerInterface<DataHandle> {
  /// The derived class API (the `_Self()->X` targets).

  abstract resize(network: VdfNetwork): void
  abstract isValidDataHandle(handle: DataHandle): boolean
  abstract getOrCreateDataHandle(outputId: number): DataHandle
  abstract getDataHandle(outputId: number): DataHandle
  abstract getPrivateBufferData(handle: DataHandle): VdfExecutorBufferData
  abstract getScratchBufferData(handle: DataHandle): VdfExecutorBufferData
  abstract getPublicBufferData(handle: DataHandle): VdfExecutorBufferData
  abstract publishPrivateBufferData(handle: DataHandle): void
  abstract publishScratchBufferData(handle: DataHandle): void
  abstract getTransferredBufferData(handle: DataHandle): VdfExecutorBufferData | null
  abstract transferBufferData(handle: DataHandle, value: VdfVector, mask: VdfMask): boolean
  abstract resetTransferredBufferData(handle: DataHandle): void
  abstract getInvalidationData(handle: DataHandle): VdfExecutorInvalidationData
  /** Without a handle: the data manager's current invalidation timestamp. */
  abstract getInvalidationTimestamp(handle?: DataHandle): number
  abstract setInvalidationTimestamp(handle: DataHandle, ts: number): void
  abstract isTouched(outputId: number): boolean
  /** With a VdfOutput: VdfParallelExecutorDataManager::Touch(const VdfOutput &). */
  abstract touch(outputIdOrOutput: number | VdfOutput): void
  abstract untouch(outputId: number): boolean
  abstract clearDataForOutput(outputId: number): void

  /// The protected helpers (parallelExecutorDataManagerInterface.h:45-233).

  protected _resize(network: VdfNetwork): void {
    this.resize(network)
  }

  protected _isValidDataHandle(handle: DataHandle): boolean {
    return this.isValidDataHandle(handle)
  }

  protected _getOrCreateDataHandle(outputId: number): DataHandle {
    return this.getOrCreateDataHandle(outputId)
  }

  protected _getDataHandle(outputId: number): DataHandle {
    return this.getDataHandle(outputId)
  }

  protected _getPrivateBufferData(handle: DataHandle): VdfExecutorBufferData {
    return this.getPrivateBufferData(handle)
  }

  protected _getScratchBufferData(handle: DataHandle): VdfExecutorBufferData {
    return this.getScratchBufferData(handle)
  }

  protected _getPublicBufferData(handle: DataHandle): VdfExecutorBufferData {
    return this.getPublicBufferData(handle)
  }

  protected _publishPrivateBufferData(handle: DataHandle): void {
    this.publishPrivateBufferData(handle)
  }

  protected _publishScratchBufferData(handle: DataHandle): void {
    this.publishScratchBufferData(handle)
  }

  protected _getTransferredBufferData(handle: DataHandle): VdfExecutorBufferData | null {
    return this.getTransferredBufferData(handle)
  }

  protected _transferBufferData(handle: DataHandle, value: VdfVector, mask: VdfMask): boolean {
    return this.transferBufferData(handle, value, mask)
  }

  protected _resetTransferredBufferData(handle: DataHandle): void {
    this.resetTransferredBufferData(handle)
  }

  protected _getInvalidationData(handle: DataHandle): VdfExecutorInvalidationData {
    return this.getInvalidationData(handle)
  }

  protected _getInvalidationTimestamp(handle: DataHandle): number {
    return this.getInvalidationTimestamp(handle)
  }

  protected _setInvalidationTimestamp(handle: DataHandle, ts: number): void {
    this.setInvalidationTimestamp(handle, ts)
  }

  protected _isTouched(outputId: number): boolean {
    return this.isTouched(outputId)
  }

  protected _touch(outputId: number): void {
    this.touch(outputId)
  }

  protected _untouch(outputId: number): boolean {
    return this.untouch(outputId)
  }

  /**
   * parallelExecutorDataManagerInterface.h:231-233. Upstream passes the
   * VdfOutput to the derived ClearDataForOutput(VdfId); the helper is never
   * instantiated upstream. Here it passes the output id.
   */
  protected _clearDataForOutput(output: VdfOutput): void {
    this.clearDataForOutput(output.getId())
  }
}
