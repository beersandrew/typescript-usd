// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorInvalidationData.cpp,
//  pxr/exec/vdf/executorInvalidationData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorInvalidationData.h and
// pxr/exec/vdf/executorInvalidationData.cpp.

import { VdfMask } from './mask.ts'

/** The possible invalidation states (executorInvalidationData.h:27-31). */
enum _MaskState {
  AllZeros, // All valid
  AllOnes, // All invalid
  Sparse, // Mask denotes validity
}

/** VdfExecutorInvalidationData (executorInvalidationData.h:24-101). */
export class VdfExecutorInvalidationData {
  /**
   * The value invalidation timestamps shall initially assume
   * (executorInvalidationData.h:37).
   */
  static readonly InitialInvalidationTimestamp = 0

  // executorInvalidationData.h:94: the log of invalidated elements.
  private _mask = new VdfMask()

  // executorInvalidationData.h:99: the invalidation mask state.
  private _maskState = _MaskState.AllOnes

  /** Reset (executorInvalidationData.cpp:17-21). */
  Reset(): void {
    this._maskState = _MaskState.AllOnes
  }

  /** Clone (executorInvalidationData.cpp:23-29). */
  Clone(dest: VdfExecutorInvalidationData): void {
    dest._mask = this._mask
    dest._maskState = this._maskState
  }

  /** IsInvalid (executorInvalidationData.h:136-163). */
  isInvalid(invalidationMask: VdfMask, wasTouched: boolean): boolean {
    // If the buffer was touched, the corresponding output is not invalid.
    if (wasTouched) {
      return false
    }

    // If everything is invalid, or if the passed invalidation mask is empty,
    // the corresponding output is invalid.
    if (this._maskState === _MaskState.AllOnes || invalidationMask.isAllZeros()) {
      return true
    }

    // If the bits set in the passed mask are all already set in the mask
    // we are holding, the corresponding output is invalid.
    else if (this._maskState === _MaskState.Sparse &&
        this._mask.getSize() === invalidationMask.getSize() &&
        this._mask.contains(invalidationMask)) {
      return true
    }

    return false
  }

  /** Invalidate (executorInvalidationData.h:165-195). */
  invalidate(invalidationMask: VdfMask, wasTouched: boolean): boolean {
    // If the buffer was touched, make sure to reset the invalidation mask.
    if (wasTouched) {
      this._maskState = _MaskState.AllZeros
    }

    // If everything is invalid or if the passed invalidation mask is empty,
    // there's no invalidation to do.
    if (this._maskState === _MaskState.AllOnes || invalidationMask.isAllZeros()) {
      return false
    }

    // If the bits set in the passed mask are all already set in the mask
    // we were holding, there's no invalidation to do.
    else if (this._maskState === _MaskState.Sparse &&
        this._mask.getSize() === invalidationMask.getSize() &&
        this._mask.contains(invalidationMask)) {
      return false
    }

    // Update the invalidation state and invalidation mask.
    this._applyInvalidationMask(invalidationMask)

    return true
  }

  /** _ApplyInvalidationMask (executorInvalidationData.h:105-134). */
  private _applyInvalidationMask(invalidationMask: VdfMask): void {
    // If the invalidation mask is an all-ones mask, simply set the
    // corresponding invalidation mask state.
    if (invalidationMask.isAllOnes()) {
      this._maskState = _MaskState.AllOnes
      return
    }

    // Set the passed in invalidation mask, if the current mask is all zeros,
    // or the mask sizes mismatch.
    if (this._maskState === _MaskState.AllZeros ||
        this._mask.getSize() !== invalidationMask.getSize()) {
      this._mask = invalidationMask
      this._maskState = _MaskState.Sparse
    }

    // Append the current invalidation mask, and set the invalidation mask
    // state based on whether the new mask is all ones or sparse.
    else {
      this._mask = this._mask.or(invalidationMask)
      this._maskState = this._mask.isAllOnes()
        ? _MaskState.AllOnes
        : _MaskState.Sparse
    }
  }
}
