// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorDataManager.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorDataManager.h.
//
// VdfExecutorDataManager<DerivedClass> uses static polymorphism; the data
// handle type comes from Vdf_ExecutorDataManagerTraits<DerivedClass>. In TS
// it is the abstract class VdfExecutorDataManager<DataHandle>, extended by
// VdfDataManagerVector and VdfDataManagerHashTable. See
// executorDataManagerInterface.ts for how Touch and GetInvalidationTimestamp
// combine the base and derived overloads.

import { TF_CODING_ERROR, TF_DEV_AXIOM } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfExecutorBufferData } from './executorBufferData.ts'
import { Vdf_ExecutorDataManagerInterface } from './executorDataManagerInterface.ts'
import { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfMask } from './mask.ts'
import { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput } from './poolChainIndex.ts'
import type { VdfVector } from './vector.ts'

/**
 * VdfExecutorDataManager (executorDataManager.h:46-231): manages the
 * executor specific data associated with each output in the network.
 */
export abstract class VdfExecutorDataManager<DataHandle>
  extends Vdf_ExecutorDataManagerInterface<DataHandle> {
  // executorDataManager.h:230: the current invalidation timestamp. It starts
  // ahead of the initial timestamp of the executor data, so that never
  // invalidated data can be identified (executorDataManager.h:215-218).
  private _invalidationTimestamp =
    VdfExecutorInvalidationData.InitialInvalidationTimestamp + 1

  /// \name Cache Management

  /** GetInputValue (executorDataManager.h:235-254). */
  getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null {
    // For associated inputs, we need to grab the input value from the
    // associated output. This is because read/write buffers have been
    // prepared before the node callback is invoked. Values for read outputs
    // originate from the source output on the input connection.
    const input = connection.getTargetInput()
    const ao = input.getAssociatedOutput()
    const readOutput = ao && input.getNumConnections() === 1
      ? ao
      : connection.getSourceOutput()
    return this.getOutputValueForReading(
      this._getDataHandle(readOutput.getId()), mask)
  }

  /** GetOutputValueForReading (executorDataManager.h:256-285). */
  getOutputValueForReading(handle: DataHandle, mask: VdfMask): VdfVector | null {
    // We have the output value if
    //  o The output data exists
    //  o The cache is not empty
    //  o One of the following is true:
    //     o The request mask has no bits set because we ask for an
    //       attribute with shape of length zero (e.g., points attribute
    //       with zero points in it).
    //    or
    //     o The output is not dirty and
    //     o The computed mask covers what is requested.
    const hasValue =
      this._isValidDataHandle(handle) &&
      this._getBufferData(handle).getExecutorCache() !== null &&
      (mask.isAllZeros() ||
        (this._getBufferData(handle).getExecutorCacheMask().isAnySet() &&
         this._getBufferData(handle).getExecutorCacheMask().contains(mask)))

    return hasValue
      ? this._getBufferData(handle).getExecutorCache()
      : null
  }

  /** GetOrCreateOutputValueForWriting (executorDataManager.h:287-306). */
  getOrCreateOutputValueForWriting(output: VdfOutput, handle: DataHandle): VdfVector | null {
    // If the specified handle is not valid, return a null pointer.
    if (!this._isValidDataHandle(handle)) {
      return null
    }

    // Return the output value, if available.
    const bufferData = this._getBufferData(handle)
    const value = bufferData.getExecutorCache()
    if (value) {
      return value
    }

    // Create a new output value, if there isn't one already available.
    return this.createOutputCache(output, bufferData)
  }

  /** SetOutputValue (executorDataManager.h:308-350). */
  setOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): void {
    // Make sure the data manager is appropriately sized.
    this._resize(output.getNode().getNetwork())

    // Retrieve the vector at the output
    const handle = this._getOrCreateDataHandle(output.getId())
    const bufferData = this._getBufferData(handle)

    // If there is no output value available, create a new one
    let outputValue = bufferData.getExecutorCache()
    if (!outputValue) {
      outputValue = this.createOutputCache(output, bufferData)
    }

    // Mark the output as having been touched by evaluation, in order for it
    // to be considered by invalidation.
    this._touch(handle)

    // Merge with existing data or replace?
    const cacheMask = bufferData.getExecutorCacheMask()
    const mergeData =
      !outputValue.IsEmpty() &&
      !cacheMask.IsEmpty() &&
      !cacheMask.Equals(mask)

    // Set the new output value, by either merging into the existing vector,
    // or simply replacing it all together
    if (mergeData) {
      outputValue.merge(value, mask)
    } else {
      outputValue.copy(value, mask)
    }

    // Set the new executor cache mask
    this.setComputedOutputMask(bufferData, mergeData ? cacheMask.or(mask) : mask)
  }

  /** TakeOutputValue (executorDataManager.h:352-381). */
  takeOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): boolean {
    // Make sure the data manager is appropriately sized.
    this._resize(output.getNode().getNetwork())

    // Retrieve the vector at the output
    const handle = this._getOrCreateDataHandle(output.getId())
    const bufferData = this._getBufferData(handle)

    // Return if there is already a cache associated with the output.
    if (bufferData.getExecutorCache()) {
      return false
    }

    // Otherwise, transfer ownership of the value into the buffer.
    bufferData.takeOwnership(value)
    bufferData.setExecutorCacheMask(mask)

    // Mark the output as having been touched by evaluation.
    this._touch(handle)

    return true
  }

  /** SetReferenceOutputValue (executorDataManager.h:383-396). */
  setReferenceOutputValue(sourceValue: VdfVector | null, destOutputId: number): void {
    const handle = this._getDataHandle(destOutputId)
    TF_DEV_AXIOM(this._isValidDataHandle(handle), 'Base::_IsValidDataHandle(handle)')

    const bufferData = this._getBufferData(handle)
    bufferData.yieldOwnership(sourceValue)
  }

  /** CreateOutputCache (executorDataManager.h:398-411). */
  createOutputCache(output: VdfOutput, bufferData: VdfExecutorBufferData): VdfVector {
    // If the executor is providing its own cache-reuse mechanism, then we
    // assert that the cache is NULL before we get here.
    TF_DEV_AXIOM(!bufferData.getExecutorCache(), '!bufferData->GetExecutorCache()')

    return bufferData.createExecutorCache(output.getSpec())
  }

  /** DuplicateOutputData (executorDataManager.h:413-456). */
  duplicateOutputData(sourceOutput: VdfOutput, destOutput: VdfOutput): void {
    // If the source output data exists, clone it to the destination output.
    const sourceHandle = this._getDataHandle(sourceOutput.getId())
    if (!this._isValidDataHandle(sourceHandle)) {
      return
    }

    // Make sure the data manager is appropriately sized for us to copy the
    // source value to the destination output.
    this._resize(destOutput.getNode().getNetwork())

    // Get the destination data handle.
    const destHandle = this._getOrCreateDataHandle(destOutput.getId())

    // Clone the buffer data.
    this._getBufferData(sourceHandle).Clone(this._getBufferData(destHandle))

    // Clone the invalidation data.
    this._getInvalidationData(sourceHandle).Clone(this._getInvalidationData(destHandle))

    // Copy the invalidation timestamp.
    this._setInvalidationTimestamp(destHandle, this._getInvalidationTimestamp(sourceHandle))

    // Untouch the destination data, unless the source data has been touched.
    this._untouch(destHandle)
    if (this._untouch(sourceHandle)) {
      this._touch(sourceHandle)
      this._touch(destHandle)
    }

    // Clear the SMBL data, if any.
    const smblData = this._getSMBLData(destHandle)
    if (smblData) {
      smblData.clear()
    }
  }

  /** SetComputedOutputMask (executorDataManager.h:136-140). */
  setComputedOutputMask(bufferData: VdfExecutorBufferData, mask: VdfMask): void {
    bufferData.setExecutorCacheMask(mask)
  }

  /// \name Invalidation

  /** IsOutputInvalid (executorDataManager.h:458-479). */
  isOutputInvalid(outputId: number, invalidationMask: VdfMask): boolean {
    // If there is no data handle for the given output, it cannot possibly
    // have been computed, therefore it is still invalid.
    const handle = this._getDataHandle(outputId)
    if (!this._isValidDataHandle(handle)) {
      return true
    }

    // If the output has been touched by evaluation, it is valid. If not,
    // check if the given mask is marked as invalid in the invalidation data.
    const wasTouched = this._isTouched(handle)
    return !wasTouched &&
      this._getInvalidationData(handle).isInvalid(invalidationMask, wasTouched)
  }

  /** InvalidateOutput (executorDataManager.h:481-547). */
  invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean {
    const handle = this._getDataHandle(output.getId())

    // Thou shalt not invalidate what has not been evaluated!
    if (!this._isValidDataHandle(handle)) {
      return false
    }

    // Invalidate the output via the VdfExecutorInvalidationData. Make sure to
    // also untouch the output, if it has previously been touched.
    const didInvalidate = this._getInvalidationData(handle).invalidate(
      invalidationMask, this._untouch(handle))

    if (didInvalidate) {
      // Update the invalidation timestamp, by applying the timestamp from
      // the data manager to the timestamp stored at the output.
      this._setInvalidationTimestamp(handle, this.getInvalidationTimestamp())

      // Retrieve the buffer data stored at the output.
      const bufferData = this._getBufferData(handle)

      // If this is an output in the pool, let's apply sparse invalidation.
      if (Vdf_IsPoolOutput(output)) {
        // Sparsely invalidate the executor cache mask, using the bits in the
        // invalidation mask (memoized).
        const newCacheMask = this._getOrCreateSMBLData(handle).invalidateCacheMask(
          bufferData.getExecutorCacheMask(), invalidationMask)

        // If the new cache mask is now all-zeros, remove the cache entirely,
        // otherwise simply set the new cache mask.
        if (newCacheMask.isAllZeros()) {
          bufferData.resetExecutorCache()
        } else {
          bufferData.setExecutorCacheMask(newCacheMask)
        }
      }

      // Otherwise, we simply remove the cache entirely.
      else {
        bufferData.resetExecutorCache()
      }

      return true
    }

    // Nothing to invalidate.
    return false
  }

  /**
   * Touch (executorDataManager.h:549-554) with a VdfOutput: marks the data
   * at the output as touched by evaluation. Derived classes implement the
   * handle form (see executorDataManagerInterface.ts).
   */
  touch(handleOrOutput: DataHandle | VdfOutput): void {
    if (handleOrOutput instanceof VdfOutput) {
      this._touch(this._getOrCreateDataHandle(handleOrOutput.getId()))
      return
    }
    _MissingDerivedMethod('Touch(const DataHandle)')
  }

  /** UpdateInvalidationTimestamp (executorDataManager.h:170-172). */
  updateInvalidationTimestamp(timestamp: number): void {
    this._invalidationTimestamp = timestamp
  }

  /**
   * GetInvalidationTimestamp (executorDataManager.h:176-178) without a
   * handle: the current invalidation timestamp. Derived classes implement
   * the handle form (see executorDataManagerInterface.ts).
   */
  getInvalidationTimestamp(handle?: DataHandle): number {
    if (handle === undefined) {
      return this._invalidationTimestamp
    }
    return _MissingDerivedMethod('GetInvalidationTimestamp(const DataHandle)')
  }

  /** HasInvalidationTimestampMismatch (executorDataManager.h:607-632). */
  hasInvalidationTimestampMismatch(sourceHandle: DataHandle, destHandle: DataHandle): boolean {
    // The source output should be mung buffer locked if, in the latest
    // round of invalidation, the destination output has been invalidated,
    // whereas the source output remained untouched.
    return this._isValidDataHandle(sourceHandle) &&
      this._isValidDataHandle(destHandle) &&
      this._getInvalidationTimestamp(destHandle) === this._invalidationTimestamp &&
      this._getInvalidationTimestamp(sourceHandle) !== this._invalidationTimestamp
  }

  /// \name Buffer Passing

  /** PassBuffer (executorDataManager.h:556-605). */
  passBuffer(
    fromOutput: VdfOutput,
    fromBuffer: VdfExecutorBufferData,
    _toOutput: VdfOutput,
    toBuffer: VdfExecutorBufferData,
    keepMask: VdfMask): VdfVector | null {
    // If we don't have a cache here, there is nothing to pass.
    if (!fromBuffer.getExecutorCache()) {
      return null
    }

    // Swap the from- and toBuffers.
    const result = toBuffer.swapExecutorCache(fromBuffer)

    if (keepMask.IsEmpty()) {
      // If we don't need to keep anything, then it's a straight pass
      // through. Simply make sure that there is no cache stored at the
      // fromBuffer.
      fromBuffer.resetExecutorCache()
    } else {
      // Create a cache in the fromOutput. This is where we store the kept
      // value.
      const keptValue = this.createOutputCache(fromOutput, fromBuffer)

      // Copy the subset that we want fromOutput to keep. It is okay to keep
      // an empty buffer.
      if (keepMask.isAnySet()) {
        keptValue.copy(result!, keepMask)
      }

      // What's set in the keepMask is what remains cached at fromBuffer.
      fromBuffer.setExecutorCacheMask(keepMask)
    }

    // Return the value now stored at toOutput.
    return result
  }
}

// A derived class must implement the handle form of an overloaded method
// (static polymorphism requires it upstream).
function _MissingDerivedMethod(method: string): never {
  const message = `VdfExecutorDataManager: the derived data manager does not ` +
    `implement ${method} (pxr/exec/vdf/executorDataManagerInterface.h)`
  TF_CODING_ERROR(message)
  throw new Error(message)
}
