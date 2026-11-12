// Ported from OpenUSD 26.11.1: pxr/exec/vdf/parallelExecutorDataManager.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/parallelExecutorDataManager.h.
//
// Ported for VdfSimpleExecutor, which stores its data in a
// VdfParallelDataManagerVector (see parallelExecutorDataManagerInterface.ts).
// Single-threaded, so the thread-safety notes of upstream hold trivially.

import { TF_CODING_ERROR, TF_DEV_AXIOM, type TfCompressedBits } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfExecutorBufferData } from './executorBufferData.ts'
import { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfMask } from './mask.ts'
import { VdfOutput } from './output.ts'
import { Vdf_ParallelExecutorDataManagerInterface } from './parallelExecutorDataManagerInterface.ts'
import { Vdf_IsPoolOutput } from './poolChainIndex.ts'
import type { VdfVector } from './vector.ts'

/**
 * VdfParallelExecutorDataManager (parallelExecutorDataManager.h:41-222):
 * manages executor data, keeping private, scratch and public buffers per
 * output.
 */
export abstract class VdfParallelExecutorDataManager<DataHandle>
  extends Vdf_ParallelExecutorDataManagerInterface<DataHandle> {
  // parallelExecutorDataManager.h:221: the current invalidation timestamp,
  // initialized ahead of the initial timestamp (lines 199-202).
  private _invalidationTimestamp =
    VdfExecutorInvalidationData.InitialInvalidationTimestamp + 1

  /** GetInputValue (parallelExecutorDataManager.h:226-257). */
  getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null {
    // For associated inputs, we need to grab the input value from the
    // associated output, because read/write buffers have been prepared
    // before the node callback is invoked. Values for read outputs originate
    // from the source output on the input connection.
    const input = connection.getTargetInput()
    const ao = input.getAssociatedOutput()

    if (!ao || input.getNumConnections() !== 1) {
      return this.getOutputValueForReading(
        this._getDataHandle(connection.getSourceOutput().getId()), mask)
    }

    // Read/write output values are always passed via the private buffers.
    const dataHandle = this._getDataHandle(ao.getId())
    return this._isValidDataHandle(dataHandle)
      ? this._getOutputValueForReading(
        this._getPrivateBufferData(dataHandle), mask)
      : null
  }

  /** GetOutputValueForReading (parallelExecutorDataManager.h:259-287). */
  getOutputValueForReading(dataHandle: DataHandle, mask: VdfMask): VdfVector | null {
    // Output values are always read from public buffers.
    if (!this._isValidDataHandle(dataHandle)) {
      return null
    }

    // Attempt to read from the public buffer, first.
    const publicData = this._getPublicBufferData(dataHandle)
    const value = this._getOutputValueForReading(publicData, mask)
    if (value) {
      return value
    }

    // Then, fall back to reading from the transferred data, if available.
    const transferData = this._getTransferredBufferData(dataHandle)
    return transferData
      ? this._getOutputValueForReading(transferData, mask)
      : null
  }

  /** GetOrCreateOutputValueForWriting (parallelExecutorDataManager.h:289-311). */
  getOrCreateOutputValueForWriting(output: VdfOutput, handle: DataHandle): VdfVector | null {
    // If the handle is not valid, we can't return a value for writing.
    if (!this._isValidDataHandle(handle)) {
      return null
    }

    // Output values are always written to private buffers, which are
    // published once the node has completed evaluation.
    const bufferData = this._getPrivateBufferData(handle)
    const value = bufferData.getExecutorCache()
    if (value) {
      return value
    }

    // Create a new output value, if there isn't one already available.
    return VdfParallelExecutorDataManager.createOutputCache(output, bufferData)
  }

  /** SetOutputValue (parallelExecutorDataManager.h:313-361). */
  setOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): void {
    // Make sure the data manager is appropriately sized.
    this._resize(output.getNode().getNetwork())

    // Mark the output as having been touched by evaluation.
    const outputId = output.getId()
    this._touch(outputId)

    // Retrieve the data at the output
    const handle = this._getOrCreateDataHandle(outputId)
    const privateBuffer = this._getPrivateBufferData(handle)
    const publicBuffer = this._getPublicBufferData(handle)

    // Merge with existing data or replace?
    const publicMask = publicBuffer.getExecutorCacheMask()
    const publicValue = publicBuffer.getExecutorCache()
    const mergeData =
      publicValue !== null &&
      !publicMask.IsEmpty() &&
      !publicMask.Equals(mask)

    // Set the new output value, merging in the previously available public
    // data, if any.
    if (mergeData) {
      const privateMask = publicMask.or(mask)
      const outputValue = privateBuffer.createExecutorCache(
        output.getSpec(), privateMask.getBits())
      outputValue.merge(publicValue, publicMask.subtract(mask))
      outputValue.merge(value, mask)
      privateBuffer.setExecutorCacheMask(privateMask)
    } else {
      const outputValue = privateBuffer.createExecutorCache(output.getSpec())
      outputValue.copy(value, mask)
      privateBuffer.setExecutorCacheMask(mask)
    }

    // We just set the private buffer data, now let's publish it.
    this._publishPrivateBufferData(handle)
  }

  /** TakeOutputValue (parallelExecutorDataManager.h:363-383). */
  takeOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): boolean {
    // Make sure the data manager is appropriately sized.
    this._resize(output.getNode().getNetwork())

    // Mark the output as having been touched by evaluation.
    const outputId = output.getId()
    this._touch(outputId)

    // Retrieve the data at the output
    const handle = this._getOrCreateDataHandle(outputId)

    // Attempt to transfer the value.
    return this._transferBufferData(handle, value, mask)
  }

  /** SetReferenceOutputValue (parallelExecutorDataManager.h:385-398). */
  setReferenceOutputValue(sourceValue: VdfVector | null, destOutputId: number): void {
    const handle = this._getDataHandle(destOutputId)
    TF_DEV_AXIOM(this._isValidDataHandle(handle), 'Base::_IsValidDataHandle(handle)')

    const bufferData = this._getPrivateBufferData(handle)
    bufferData.yieldOwnership(sourceValue)
  }

  /**
   * CreateOutputCache (parallelExecutorDataManager.h:400-433): creates a new
   * cache for an output, sized for `bits` when given.
   */
  static createOutputCache(
    output: VdfOutput, bufferData: VdfExecutorBufferData, bits?: TfCompressedBits): VdfVector {
    // If the executor is providing its own cache-reuse mechanism, then we
    // assert that the cache is NULL before we get here.
    TF_DEV_AXIOM(!bufferData.getExecutorCache(), '!bufferData->GetExecutorCache()')

    return bits === undefined
      ? bufferData.createExecutorCache(output.getSpec())
      : bufferData.createExecutorCache(output.getSpec(), bits)
  }

  /** DuplicateOutputData (parallelExecutorDataManager.h:435-476). */
  duplicateOutputData(sourceOutput: VdfOutput, destOutput: VdfOutput): void {
    // Make sure the data manager is appropriately sized.
    this._resize(destOutput.getNode().getNetwork())

    // Untouch the destination data, unless the source data has been touched.
    // This needs to happen even if we don't get a sourceHandle below.
    const destOutputId = destOutput.getId()
    const sourceOutputId = sourceOutput.getId()
    this._untouch(destOutputId)
    if (this._untouch(sourceOutputId)) {
      this._touch(sourceOutputId)
      this._touch(destOutputId)
    }

    // If the source output data exists, clone it to the destination.
    const sourceHandle = this._getDataHandle(sourceOutputId)
    if (!this._isValidDataHandle(sourceHandle)) {
      return
    }

    // Get the destination data handle.
    const destHandle = this._getOrCreateDataHandle(destOutputId)

    // Clone the buffer data.
    this._getPublicBufferData(sourceHandle).Clone(this._getPublicBufferData(destHandle))

    // Clone the invalidation data.
    this._getInvalidationData(sourceHandle).Clone(this._getInvalidationData(destHandle))

    // Copy the invalidation timestamp.
    this._setInvalidationTimestamp(destHandle, this._getInvalidationTimestamp(sourceHandle))
  }

  /** IsOutputInvalid (parallelExecutorDataManager.h:478-501). */
  isOutputInvalid(outputId: number, invalidationMask: VdfMask): boolean {
    // If the output has been touched by evaluation, it is valid.
    const wasTouched = this._isTouched(outputId)
    if (wasTouched) {
      return false
    }

    // If there is no data handle for the output, the output has never been
    // evaluated and therefore is still invalid.
    const handle = this._getDataHandle(outputId)
    if (!this._isValidDataHandle(handle)) {
      return true
    }

    return this._getInvalidationData(handle).isInvalid(invalidationMask, wasTouched)
  }

  /** InvalidateOutput (parallelExecutorDataManager.h:503-584). */
  invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean {
    // Untouch the output. If it has been touched, we need to create a data
    // handle for it.
    const outputId = output.getId()
    const wasTouched = this._untouch(outputId)

    // Retrieve the data handle for the output.
    const handle = wasTouched
      ? this._getOrCreateDataHandle(outputId)
      : this._getDataHandle(outputId)

    // Thou shalt not invalidate what has not been evaluated (unless it has
    // been touched, of course)!
    if (!this._isValidDataHandle(handle)) {
      return false
    }

    // Invalidate the output via the VdfExecutorInvalidationData.
    const didInvalidate = this._getInvalidationData(handle).invalidate(
      invalidationMask, wasTouched)

    if (didInvalidate) {
      // Update the invalidation timestamp.
      this._setInvalidationTimestamp(handle, this.getInvalidationTimestamp())

      // Retrieve the buffer data stored at the output.
      const bufferData = this._getPublicBufferData(handle)

      // We only need to invalidate the executor cache if the buffer has one.
      if (!bufferData.getExecutorCacheMask().IsEmpty()) {
        // If this is an output in the pool, let's apply sparse invalidation.
        if (Vdf_IsPoolOutput(output)) {
          // XXX: Memoize!
          const newCacheMask =
            bufferData.getExecutorCacheMask().subtract(invalidationMask)

          // If the new cache mask is now all-zeros, remove the cache
          // entirely, otherwise simply set the new cache mask.
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
      }

      // Also clear any transferred data.
      this._resetTransferredBufferData(handle)

      return true
    }

    // Nothing to invalidate.
    return false
  }

  /**
   * Touch (parallelExecutorDataManager.h:586-592) with a VdfOutput. Derived
   * classes implement the output id form.
   */
  touch(outputIdOrOutput: number | VdfOutput): void {
    if (outputIdOrOutput instanceof VdfOutput) {
      this._touch(outputIdOrOutput.getId())
      return
    }
    _MissingDerivedMethod('Touch(const VdfId)')
  }

  /** UpdateInvalidationTimestamp (parallelExecutorDataManager.h:176-179). */
  updateInvalidationTimestamp(timestamp: number): void {
    this._invalidationTimestamp = timestamp
  }

  /**
   * GetInvalidationTimestamp (parallelExecutorDataManager.h:183-185) without
   * a handle. Derived classes implement the handle form.
   */
  getInvalidationTimestamp(handle?: DataHandle): number {
    if (handle === undefined) {
      return this._invalidationTimestamp
    }
    return _MissingDerivedMethod('GetInvalidationTimestamp(const DataHandle)')
  }

  /** HasInvalidationTimestampMismatch (parallelExecutorDataManager.h:594-619). */
  hasInvalidationTimestampMismatch(sourceHandle: DataHandle, destHandle: DataHandle): boolean {
    return this._isValidDataHandle(sourceHandle) &&
      this._isValidDataHandle(destHandle) &&
      this._getInvalidationTimestamp(sourceHandle) !== this._invalidationTimestamp &&
      this._getInvalidationTimestamp(destHandle) === this._invalidationTimestamp
  }

  /** _GetOutputValueForReading (parallelExecutorDataManager.h:621-646). */
  private _getOutputValueForReading(
    bufferData: VdfExecutorBufferData, mask: VdfMask): VdfVector | null {
    const value = bufferData.getExecutorCache()
    const hasValue =
      value !== null &&
      (mask.isAllZeros() ||
        (bufferData.getExecutorCacheMask().isAnySet() &&
         bufferData.getExecutorCacheMask().contains(mask)))

    return hasValue ? value : null
  }
}

// A derived class must implement the id/handle form of an overloaded method.
function _MissingDerivedMethod(method: string): never {
  const message = `VdfParallelExecutorDataManager: the derived data manager does ` +
    `not implement ${method} (pxr/exec/vdf/parallelExecutorDataManagerInterface.h)`
  TF_CODING_ERROR(message)
  throw new Error(message)
}
