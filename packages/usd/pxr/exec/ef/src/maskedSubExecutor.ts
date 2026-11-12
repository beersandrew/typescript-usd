// Ported from OpenUSD 26.11.1: pxr/exec/ef/maskedSubExecutor.cpp,
//  pxr/exec/ef/maskedSubExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/maskedSubExecutor.h and
// pxr/exec/ef/maskedSubExecutor.cpp.
//
// Single-threaded (openexec-x1.md section 5): the concurrent_unordered_map of
// invalid outputs is a Map keyed by output id.

import { TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'

import { VdfDatalessExecutor } from 'typescript-usd/vdf'
import type { VdfExecutorErrorLogger } from 'typescript-usd/vdf'
import { VdfExecutorFactory } from 'typescript-usd/vdf'
import type { VdfExecutorFactoryBase } from 'typescript-usd/vdf'
import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import type { VdfMask } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import type { VdfRequest } from 'typescript-usd/vdf'
import type { VdfSchedule } from 'typescript-usd/vdf'
import type { VdfId } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'

/**
 * EfMaskedSubExecutor (maskedSubExecutor.h:41-156): a dataless sub-executor
 * that masks the parent executor. It tracks invalidation locally: for an
 * output invalid on this executor, GetOutputValue() returns null instead of
 * looking up the parent executor's data. This tracks invalidation without
 * affecting the parent executor's invalidation state.
 */
export class EfMaskedSubExecutor extends VdfDatalessExecutor {
  // The factory shared amongst executors of this type
  // (maskedSubExecutor.h:43-51, maskedSubExecutor.cpp:13).
  //
  // FAITHFULNESS-DEBT(openexec-speculation): maskedSubExecutor.h:47-50 binds
  // VdfSpeculationExecutor<VdfSpeculationExecutorEngine,
  // VdfDataManagerVector<Background>> -> port speculationExecutor.h and pass
  // its constructor as the factory's speculation function. Until then
  // ManufactureSpeculationExecutor posts a coding error and throws.
  private static readonly _factory: VdfExecutorFactory<EfMaskedSubExecutor> =
    new VdfExecutorFactory(
      (parentExecutor: VdfExecutorInterface | null) =>
        new EfMaskedSubExecutor(parentExecutor))

  // The invalid outputs. After creating this executor, all outputs are
  // considered valid; outputs that become invalid are added here
  // (maskedSubExecutor.h:150-155).
  private _invalidOutputs = new Map<VdfId, VdfMask>()

  /**
   * Constructor (maskedSubExecutor.cpp:15-26). A parent executor is
   * required, since calls to GetOutputValue() are dispatched to it.
   */
  constructor(parentExecutor: VdfExecutorInterface | null) {
    super()

    if (TF_VERIFY(parentExecutor, 'parentExecutor')) {
      this.setParentExecutor(parentExecutor)

      // Inherit the interruption flag from the parent executor.
      this.setInterruptionFlag(parentExecutor!.getInterruptionFlag())
    }
  }

  /** Factory construction (maskedSubExecutor.h:70-72). */
  getFactory(): VdfExecutorFactoryBase {
    return EfMaskedSubExecutor._factory
  }

  /**
   * Duplicates the output data associated with `sourceOutput` and copies it
   * to `destOutput` (maskedSubExecutor.cpp:32-42).
   */
  override duplicateOutputData(sourceOutput: VdfOutput, destOutput: VdfOutput): void {
    const it = this._invalidOutputs.get(sourceOutput.getId())
    if (it !== undefined) {
      // std::unordered_map::insert does not replace an existing entry.
      if (!this._invalidOutputs.has(destOutput.getId())) {
        this._invalidOutputs.set(destOutput.getId(), it)
      }
    }
  }

  /**
   * Always false (maskedSubExecutor.h:90-92): invalidation then always finds
   * data living on this executor, and pushes invalidation through the entire
   * network regardless of the parent executor's state.
   */
  override IsEmpty(): boolean {
    return false
  }

  /**
   * Returns true if the invalidation timestamps mismatch between `source`
   * and `dest`, as looked up on the parent executor
   * (maskedSubExecutor.h:101-108).
   */
  override hasInvalidationTimestampMismatch(source: VdfOutput, dest: VdfOutput): boolean {
    const parentExecutor = this.getParentExecutor()
    return !!parentExecutor &&
      parentExecutor.hasInvalidationTimestampMismatch(source, dest)
  }

  /**
   * Invalidation: an invalid output is not read from the parent executor
   * (maskedSubExecutor.cpp:77-115).
   */
  override _invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean {
    // No invalidation to do, if the invalidation mask is empty!
    if (invalidationMask.isAllZeros()) {
      return false
    }

    // If this output has already been invalidated before...
    const outputId = output.getId()
    const invalidMask = this._invalidOutputs.get(outputId)
    if (invalidMask !== undefined) {
      // Make sure that the invalid mask is still of the correct size, if
      // not, simply invalidate everything.
      if (invalidMask.getSize() !== invalidationMask.getSize()) {
        this._invalidOutputs.set(outputId, invalidationMask)
        return true
      }

      // If the entries in the invalidation mask have already been
      // invalidated on this output, there is no need to propagate further.
      if (invalidMask.contains(invalidationMask)) {
        return false
      }

      // Add the newly invalid entries to the existing invalid mask.
      this._invalidOutputs.set(outputId, invalidMask.or(invalidationMask))
      return true
    }

    // This output has never been invalidated, so add a new entry for it.
    this._invalidOutputs.set(outputId, invalidationMask)
    return true
  }

  /**
   * This executor stores no data caches; the locally stored invalidation
   * state is cleared instead (maskedSubExecutor.cpp:117-123). Upstream
   * destroys the old map asynchronously (WorkSwapDestroyAsync).
   */
  protected override _clearData(): void {
    this._invalidOutputs = new Map()
  }

  /**
   * Running this executor is not supported: it is dataless
   * (maskedSubExecutor.cpp:44-55).
   */
  protected override _run(
    _schedule: VdfSchedule,
    _computeRequest: VdfRequest,
    _errorLogger: VdfExecutorErrorLogger | null,
  ): void {
    TF_CODING_ERROR('Attempt to call Run() on an EfMaskedSubExecutor.')
  }

  /**
   * Returns the parent executor's value if the output has not been
   * invalidated on this executor; otherwise null (maskedSubExecutor.h:160-175).
   */
  override _getOutputValueForReading(output: VdfOutput, mask: VdfMask): VdfVector | null {
    const parentExecutor = this.getParentExecutor()
    const it = this._invalidOutputs.get(output.getId())
    if (parentExecutor && (it === undefined || !it.overlaps(mask))) {
      return parentExecutor.getOutputValue(output, mask)
    }
    return null
  }

  /**
   * Returns true if the output is already invalid for `invalidationMask`
   * (maskedSubExecutor.cpp:57-75).
   */
  override _isOutputInvalid(outputId: VdfId, invalidationMask: VdfMask): boolean {
    if (invalidationMask.isAllZeros()) {
      return true
    }

    const invalidMask = this._invalidOutputs.get(outputId)
    if (invalidMask !== undefined) {
      return invalidMask.getSize() === invalidationMask.getSize() &&
        invalidMask.contains(invalidationMask)
    }

    return false
  }
}
