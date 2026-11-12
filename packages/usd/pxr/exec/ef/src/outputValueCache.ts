// Ported from OpenUSD 26.11.1: pxr/exec/ef/outputValueCache.cpp,
//  pxr/exec/ef/outputValueCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/outputValueCache.h and
// pxr/exec/ef/outputValueCache.cpp.
//
// Single-threaded (openexec-x1.md section 5): the spin_rw_mutex is dropped,
// and ExclusiveAccess and SharedAccess are plain accessors.

import { TfBits } from 'typescript-usd/tf'

import { VdfMask } from 'typescript-usd/vdf'
import type { VdfMaskedOutputVector } from 'typescript-usd/vdf'
import { VdfOutput } from 'typescript-usd/vdf'
import type { VdfRequest } from 'typescript-usd/vdf'
import { VdfVector } from 'typescript-usd/vdf'

/**
 * The entry stored for each output in the cache (outputValueCache.h:218-265,
 * outputValueCache.cpp:226-341).
 */
class _Entry {
  // The data value stored at this output.
  private _value: VdfVector | null = null

  // The mask of data available at this output.
  private _mask: VdfMask = new VdfMask()

  /** Returns the number of bytes stored at this output (outputValueCache.cpp:236-240). */
  getNumBytes(): number {
    return this._value ? this._value.estimateElementMemory() * this._mask.getSize() : 0
  }

  /** Returns the mask of elements stored at this output. */
  GetMask(): VdfMask {
    return this._mask
  }

  /**
   * GetValue() (outputValueCache.h:236-238) and GetValue(mask)
   * (outputValueCache.cpp:242-246): the value stored at the output, if it
   * exists and, with `mask`, contains all elements in `mask`.
   */
  GetValue(mask?: VdfMask): VdfVector | null {
    if (mask === undefined) {
      return this._value
    }
    return this._value && this._mask.contains(mask) ? this._value : null
  }

  /**
   * Sets the value at this output, not overwriting existing data. Returns
   * the number of bytes allocated (outputValueCache.cpp:248-283).
   */
  setValue(value: VdfVector, mask: VdfMask): number {
    // If this entry already holds the exact same data, bail out right away.
    if (this._value && mask.Equals(this._mask)) {
      return 0
    }

    // This is an entirely new entry.
    if (!this._value) {
      // Create a new vector large enough for all the data that could
      // possibly be stored at this output, then populate it with the
      // elements from value.
      this._value = new VdfVector(value, mask.getSize())
      this._value.merge(value, mask.getBits())

      this._mask = mask

      // Return the number of bytes stored for this entry.
      return this._value.estimateElementMemory() * mask.getSize()
    }

    // Existing entry.
    const uncachedBits = mask.getBits().subtract(this._mask.getBits())
    if (uncachedBits.isAnySet()) {
      // Merge in the uncached data.
      this._value.merge(value, uncachedBits)
      uncachedBits.orAssign(this._mask.getBits())
      this._mask = new VdfMask(uncachedBits)
    }

    // We did not allocate any additional memory.
    return 0
  }

  /**
   * Invalidate() (outputValueCache.cpp:285-299) invalidates all the data at
   * this output; Invalidate(mask) (outputValueCache.cpp:301-341) the data in
   * `mask`. Returns the number of bytes invalidated.
   */
  invalidate(mask?: VdfMask): number {
    if (mask === undefined) {
      if (!this._value) {
        return 0
      }

      const bytesInvalidated =
        this._value.estimateElementMemory() * this._mask.getSize()

      this._value = null

      return bytesInvalidated
    }

    // If the invalidation mask is all-zeros, bail out.
    if (mask.isAllZeros()) {
      return 0
    }

    // If the invalidation mask is exactly equal to the stored mask, remove
    // all data. The entry will be removed from the output map.
    if (mask.Equals(this._mask) || mask.isAllOnes()) {
      return this.invalidate()
    }

    // Compute the new mask with the invalid entries removed.
    const newBits = this._mask.getBits().subtract(mask.getBits())
    const elementsInvalid = this._mask.getNumSet() - newBits.getNumSet()

    // If nothing has been invalidated, bail out.
    if (elementsInvalid === 0) {
      return 0
    }

    // For performance reasons, invalidation simply removes the invalid bits
    // from the stored mask, instead of freeing any memory (unless the new
    // mask is now all zeros).
    if (newBits.areAllUnset()) {
      return this.invalidate()
    }

    // Otherwise, just update the current mask.
    else {
      this._mask = new VdfMask(newBits)
    }

    // We did not free any memory.
    return 0
  }
}

/**
 * Ef_OutputValueCache::ExclusiveAccess (outputValueCache.h:54-139): exclusive
 * read/write access to the cache.
 */
export class Ef_OutputValueCache_ExclusiveAccess {
  private readonly _cache: Ef_OutputValueCache

  /** Constructor (outputValueCache.h:64-67). */
  constructor(cache: Ef_OutputValueCache) {
    this._cache = cache
  }

  /** Returns true if the cache is empty at this time (outputValueCache.h:71-73). */
  IsEmpty(): boolean {
    return this._cache._isEmpty()
  }

  /** Returns true if any outputs in `request` are not cached (outputValueCache.h:78-80). */
  isUncached(request: VdfRequest): boolean {
    return this._cache._isUncached(request)
  }

  /** Returns a request of the outputs not cached (outputValueCache.h:85-88). */
  getUncached(request: VdfRequest): VdfRequest {
    return this._cache._getUncached(request)
  }

  /** Returns the cached value for an output and mask, if any (outputValueCache.h:93-97). */
  GetValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    return this._cache._getValue(output, mask)
  }

  /**
   * Sets the cached values for an output and mask, merging only uncached
   * data. Returns the number of additionally allocated bytes
   * (outputValueCache.h:106-111).
   */
  setValue(output: VdfOutput, value: VdfVector, mask: VdfMask): number {
    return this._cache._setValue(output, value, mask)
  }

  /**
   * Invalidate(output) removes all data stored at the output
   * (outputValueCache.h:116-118); Invalidate(outputs) removes the data in
   * the masked outputs (outputValueCache.h:124-126). Returns the number of
   * bytes invalidated.
   */
  invalidate(arg: VdfOutput | VdfMaskedOutputVector): number {
    return this._cache._invalidate(arg)
  }

  /** Clears the cache; returns the bytes removed (outputValueCache.h:131-133). */
  clear(): number {
    return this._cache._Clear()
  }
}

/**
 * Ef_OutputValueCache::SharedAccess (outputValueCache.h:144-172): shared
 * read access to the cache.
 */
export class Ef_OutputValueCache_SharedAccess {
  private readonly _cache: Ef_OutputValueCache

  /** Constructor (outputValueCache.h:154-157). */
  constructor(cache: Ef_OutputValueCache) {
    this._cache = cache
  }

  /** Returns the cached value for an output and mask, if any (outputValueCache.h:162-166). */
  GetValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    return this._cache._getValue(output, mask)
  }
}

/**
 * Ef_OutputValueCache (outputValueCache.h:38-285): an output-to-value storage
 * for caching.
 */
export class Ef_OutputValueCache {
  /** Ef_OutputValueCache::ExclusiveAccess (outputValueCache.h:54-139). */
  static readonly ExclusiveAccess = Ef_OutputValueCache_ExclusiveAccess

  /** Ef_OutputValueCache::SharedAccess (outputValueCache.h:144-172). */
  static readonly SharedAccess = Ef_OutputValueCache_SharedAccess

  // The one-one mask (outputValueCache.h:267-269).
  private readonly _oneOneMask: VdfMask

  // The output cache map (outputValueCache.h:271-277).
  private readonly _outputs = new Map<VdfOutput, _Entry>()

  // An acceleration structure with outputs contained in this cache
  // (outputValueCache.h:279-280).
  private readonly _outputSet = new TfBits()

  /** Constructor (outputValueCache.cpp:19-23). */
  constructor() {
    this._oneOneMask = VdfMask.allOnes(1)
  }

  // outputValueCache.cpp:30-35.
  private _containsOutput(output: VdfOutput): boolean {
    const outputIdx = VdfOutput.getIndexFromId(output.getId())
    return this._outputSet.getSize() > outputIdx && this._outputSet.isSet(outputIdx)
  }

  // outputValueCache.cpp:37-49.
  private _addOutput(output: VdfOutput): void {
    // Make sure the bitset is sized sufficiently large to hold the output
    // index, and initialize any new entries with 0.
    const outputIdx = VdfOutput.getIndexFromId(output.getId())
    if (this._outputSet.getSize() <= outputIdx) {
      this._outputSet.resizeKeepContent(
        output.getNode().getNetwork().getOutputCapacity())
    }

    this._outputSet.Set(outputIdx)
  }

  // outputValueCache.cpp:51-56.
  private _removeOutput(output: VdfOutput): void {
    const outputIdx = VdfOutput.getIndexFromId(output.getId())
    this._outputSet.clear(outputIdx)
  }

  /** @internal outputValueCache.cpp:58-76. */
  _getValue(output: VdfOutput, mask: VdfMask): VdfVector | null {
    // Bail out if the output's node is not even referenced.
    if (!this._containsOutput(output)) {
      return null
    }

    const it = this._outputs.get(output)
    if (it !== undefined) {
      return mask.Equals(this._oneOneMask)
        ? it.GetValue()
        : it.GetValue(mask)
    }

    return null
  }

  /** @internal outputValueCache.cpp:78-94. */
  _setValue(output: VdfOutput, value: VdfVector, mask: VdfMask): number {
    // If this is a new output to be inserted into the map, add a reference
    // to the output.
    let entry = this._outputs.get(output)
    if (entry === undefined) {
      entry = new _Entry()
      this._outputs.set(output, entry)
      this._addOutput(output)
    }

    // Merge in the value.
    return entry.setValue(value, mask)
  }

  /**
   * @internal _Invalidate(output) (outputValueCache.cpp:96-119) and
   * _Invalidate(outputs) (outputValueCache.cpp:121-149).
   */
  _invalidate(arg: VdfOutput | VdfMaskedOutputVector): number {
    if (arg instanceof VdfOutput) {
      const output = arg

      // Bail out if the output's node is not even referenced.
      if (!this._containsOutput(output)) {
        return 0
      }

      const it = this._outputs.get(output)
      if (it !== undefined) {
        // Invalidate the entry.
        const bytesInvalidated = it.invalidate()

        // Remove the output entry.
        this._outputs.delete(output)
        this._removeOutput(output)

        // Return the number of bytes invalidated.
        return bytesInvalidated
      }

      // Nothing invalidated.
      return 0
    }

    let bytesInvalidated = 0

    for (const maskedOutput of arg) {
      const output = maskedOutput.GetOutput()!

      // Bail out if the output's node is not even referenced.
      if (!this._containsOutput(output)) {
        continue
      }

      const it = this._outputs.get(output)
      if (it !== undefined) {
        // Invalidate the entry.
        bytesInvalidated += it.invalidate(maskedOutput.GetMask())

        // Remove the entry, if it has expired.
        if (!it.GetValue()) {
          this._outputs.delete(output)
          this._removeOutput(output)
        }
      }
    }

    // Return the number of bytes invalidated.
    return bytesInvalidated
  }

  /** @internal outputValueCache.cpp:151-168. */
  _Clear(): number {
    // Compute the number of bytes cleared.
    let bytesInvalidated = 0
    for (const entry of this._outputs.values()) {
      bytesInvalidated += entry.getNumBytes()
    }

    // Remove all entries from the map.
    this._outputs.clear()
    this._outputSet.clearAll()

    // Return the number of bytes freed.
    return bytesInvalidated
  }

  /** @internal outputValueCache.cpp:170-174. */
  _isEmpty(): boolean {
    return this._outputs.size === 0
  }

  /** @internal outputValueCache.cpp:176-201. */
  _isUncached(request: VdfRequest): boolean {
    // If the request is empty there aren't any uncached values.
    if (request.IsEmpty()) {
      return false
    }

    // If the cache is empty, everything in the request is uncached.
    if (this._isEmpty()) {
      return true
    }

    // Find the first output that is not cached.
    for (const it of request) {
      if (!this._getValue(it.GetOutput()!, it.GetMask())) {
        return true
      }
    }

    // Everything is cached.
    return false
  }

  /** @internal outputValueCache.cpp:203-224. */
  _getUncached(request: VdfRequest): VdfRequest {
    // If the cache is empty, everything is uncached.
    if (this._isEmpty()) {
      return request
    }

    // Find all uncached outputs, and return them with the result request.
    const subRequest = request.Clone()
    const end = request.end()
    for (const it = request.begin(); !it.Equals(end); it.increment()) {
      const mo = it.deref()
      if (this._getValue(mo.GetOutput()!, mo.GetMask())) {
        subRequest.remove(it)
      }
    }

    return subRequest
  }
}

export declare namespace Ef_OutputValueCache {
  type ExclusiveAccess = Ef_OutputValueCache_ExclusiveAccess
  type SharedAccess = Ef_OutputValueCache_SharedAccess
}
