// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorDataManagerInterface.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorDataManagerInterface.h.
//
// Upstream uses static polymorphism (CRTP): the protected `_X` helpers call
// `_Self()->X(...)` on the derived class. In TS the derived API is declared
// abstract here and the helpers call it through `this`.
//
// Two derived methods share a name with a method of VdfExecutorDataManager,
// which C++ resolves by overloading (and `using Base::...`):
// - Touch(handle) and VdfExecutorDataManager::Touch(const VdfOutput &);
// - GetInvalidationTimestamp(handle) and the no-argument
//   VdfExecutorDataManager::GetInvalidationTimestamp().
// In TS each is one method whose parameter takes either form. Derived
// classes implement the handle form and pass the other form to `super`.

import type { VdfExecutorBufferData } from './executorBufferData.ts'
import type { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfNetwork } from './network.ts'
import type { VdfOutput } from './output.ts'
import type { VdfSMBLData } from './smblData.ts'

/**
 * Vdf_ExecutorDataManagerInterface (executorDataManagerInterface.h:32-190):
 * the interface contract for executor data manager implementations.
 */
export abstract class Vdf_ExecutorDataManagerInterface<DataHandle> {
  /// The derived class API (the `_Self()->X` targets).

  /** Resize to accommodate all the outputs in the network. */
  abstract resize(network: VdfNetwork): void

  /** Returns true if the data handle is valid. */
  abstract isValidDataHandle(handle: DataHandle): boolean

  /** Returns an existing or new data handle; always valid. */
  abstract getOrCreateDataHandle(outputId: number): DataHandle

  /** Returns an existing data handle, or an invalid one. */
  abstract getDataHandle(outputId: number): DataHandle

  /** Returns the buffer data associated with the handle. */
  abstract getBufferData(handle: DataHandle): VdfExecutorBufferData

  /** Returns the invalidation data associated with the handle. */
  abstract getInvalidationData(handle: DataHandle): VdfExecutorInvalidationData

  /**
   * Returns the invalidation timestamp associated with the handle. Called
   * without a handle, VdfExecutorDataManager's current timestamp.
   */
  abstract getInvalidationTimestamp(handle?: DataHandle): number

  /** Sets the invalidation timestamp for the handle. */
  abstract setInvalidationTimestamp(handle: DataHandle, ts: number): void

  /** Returns the existing SMBL data for the handle, or null. */
  abstract getSMBLData(handle: DataHandle): VdfSMBLData | null

  /** Returns the existing or new SMBL data for the handle. */
  abstract getOrCreateSMBLData(handle: DataHandle): VdfSMBLData

  /** Returns true if the data at the handle has been touched by evaluation. */
  abstract isTouched(handle: DataHandle): boolean

  /**
   * Marks the data at the handle as touched. Called with a VdfOutput,
   * VdfExecutorDataManager::Touch(const VdfOutput &).
   */
  abstract touch(handleOrOutput: DataHandle | VdfOutput): void

  /** Marks the data as not touched; returns true if it had been touched. */
  abstract untouch(handle: DataHandle): boolean

  /** Clears the buffer data for a specific output. */
  abstract clearDataForOutput(outputId: number): void

  /// The protected helpers (executorDataManagerInterface.h:48-175).

  /** executorDataManagerInterface.h:48-50. */
  protected _resize(network: VdfNetwork): void {
    this.resize(network)
  }

  /** executorDataManagerInterface.h:58-60. */
  protected _isValidDataHandle(handle: DataHandle): boolean {
    return this.isValidDataHandle(handle)
  }

  /** executorDataManagerInterface.h:67-69. */
  protected _getOrCreateDataHandle(outputId: number): DataHandle {
    return this.getOrCreateDataHandle(outputId)
  }

  /** executorDataManagerInterface.h:75-77. */
  protected _getDataHandle(outputId: number): DataHandle {
    return this.getDataHandle(outputId)
  }

  /** executorDataManagerInterface.h:84-86. */
  protected _getBufferData(handle: DataHandle): VdfExecutorBufferData {
    return this.getBufferData(handle)
  }

  /** executorDataManagerInterface.h:94-97. */
  protected _getInvalidationData(handle: DataHandle): VdfExecutorInvalidationData {
    return this.getInvalidationData(handle)
  }

  /** executorDataManagerInterface.h:105-108. */
  protected _getInvalidationTimestamp(handle: DataHandle): number {
    return this.getInvalidationTimestamp(handle)
  }

  /** executorDataManagerInterface.h:115-119. */
  protected _setInvalidationTimestamp(handle: DataHandle, ts: number): void {
    this.setInvalidationTimestamp(handle, ts)
  }

  /** executorDataManagerInterface.h:128-130. */
  protected _getSMBLData(handle: DataHandle): VdfSMBLData | null {
    return this.getSMBLData(handle)
  }

  /** executorDataManagerInterface.h:137-139. */
  protected _getOrCreateSMBLData(handle: DataHandle): VdfSMBLData {
    return this.getOrCreateSMBLData(handle)
  }

  /** executorDataManagerInterface.h:147-149. */
  protected _isTouched(handle: DataHandle): boolean {
    return this.isTouched(handle)
  }

  /** executorDataManagerInterface.h:157-159. */
  protected _touch(handle: DataHandle): void {
    this.touch(handle)
  }

  /** executorDataManagerInterface.h:167-169. */
  protected _untouch(handle: DataHandle): boolean {
    return this.untouch(handle)
  }

  /**
   * executorDataManagerInterface.h:173-175. Upstream passes the VdfOutput to
   * the derived ClearDataForOutput, whose implementations all take a VdfId;
   * the helper is never instantiated upstream. Here it passes the output id.
   */
  protected _clearDataForOutput(output: VdfOutput): void {
    this.clearDataForOutput(output.getId())
  }
}
