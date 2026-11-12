// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorBufferData.cpp,
//  pxr/exec/vdf/executorBufferData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorBufferData.h and
// pxr/exec/vdf/executorBufferData.cpp.
//
// The atomic VdfVector pointer with two flag bits packed into its low bits
// (executorBufferData.h:131-184) becomes a VdfVector reference and a flags
// field. _Free() drops the reference to an owned vector; the garbage
// collector reclaims it (doc section 4, rule 8).

import { TF_DEV_AXIOM, type TfCompressedBits } from 'typescript-usd/tf'

import { VdfMask } from './mask.ts'
import type { VdfOutputSpec } from './outputSpec.ts'
import type { VdfSMBLData } from './smblData.ts'
import { VdfVector } from './vector.ts'

// executorBufferData.h:132: the vector is owned by this buffer.
const _IsOwnedFlag = 1 << 0

// executorBufferData.h:135: the cache is occupied, rather than merely allocated.
const _IsOccupiedFlag = 1 << 1

/**
 * VdfExecutorBufferData (executorBufferData.h:31-189): stores the executor
 * cache vector and the mask denoting the available data.
 */
export class VdfExecutorBufferData {
  // executorBufferData.h:184: the vector (the pointer part of _cacheAndFlags).
  private _cache: VdfVector | null = null

  // executorBufferData.h:184: the ownership and occupation flags.
  private _flags = 0

  // executorBufferData.h:187: mask of the entries computed in the cache.
  private _mask = new VdfMask()

  /**
   * The destructor (executorBufferData.cpp:11-14) frees an owned vector;
   * with garbage collection it has no observable effect and is not ported.
   */

  /** Reset (executorBufferData.cpp:16-22). */
  Reset(): void {
    this._free()
    this._cache = null
    this._flags = 0
    this._mask = new VdfMask()
  }

  /** Clone (executorBufferData.cpp:24-50). */
  Clone(dest: VdfExecutorBufferData): void {
    // Deallocate all the destination data
    dest._free()

    // If the source cache is set, clone its contents. Otherwise, reset the
    // cache pointer.
    let newCache: VdfVector | null = null
    if (this._cache) {
      newCache = new VdfVector(this._cache)
    }

    // Clone the occupied flag, but always take ownership of the newly
    // constructed vector.
    dest._cache = newCache
    dest._flags = this._flags | _IsOwnedFlag

    // Clone the cache mask.
    dest._mask = this._mask
  }

  /**
   * CreateExecutorCache (executorBufferData.h:193-227): creates a new
   * executor cache for this buffer, sized for `bits` when given.
   */
  createExecutorCache(spec: VdfOutputSpec, bits?: TfCompressedBits): VdfVector {
    if (bits !== undefined) {
      // executorBufferData.h:219-227
      const v = this.createExecutorCache(spec)
      spec.resizeCache(v, bits)
      return v
    }

    // If this buffer maintains ownership over a previously allocated vector,
    // make it occupy the executor cache.
    if (this._cache && (this._flags & _IsOwnedFlag)) {
      this._flags |= _IsOccupiedFlag
      return this._cache
    }

    // If the buffer does not have ownership of the cache, or has not
    // previously allocated a cache, allocate a new one. Take ownership of the
    // new buffer.
    const newCache = spec.allocateCache()
    this._cache = newCache
    this._flags = _IsOwnedFlag | _IsOccupiedFlag

    return newCache
  }

  /** SwapExecutorCache (executorBufferData.h:229-240). */
  swapExecutorCache(rhs: VdfExecutorBufferData): VdfVector | null {
    const cache = this._cache
    const flags = this._flags

    this._cache = rhs._cache
    this._flags = rhs._flags
    rhs._cache = cache
    rhs._flags = flags

    return this._cache
  }

  /** GetExecutorCache (executorBufferData.h:242-249). */
  getExecutorCache(): VdfVector | null {
    return (this._flags & _IsOccupiedFlag) ? this._cache : null
  }

  /** GetExecutorCacheMask (executorBufferData.h:251-255). */
  getExecutorCacheMask(): VdfMask {
    return this._mask
  }

  /** SetExecutorCacheMask (executorBufferData.h:281-285). */
  setExecutorCacheMask(mask: VdfMask): void {
    this._mask = mask
  }

  /**
   * ResetExecutorCache (executorBufferData.h:257-279): resets the executor
   * cache without releasing any memory, and sets the cache mask to `mask`
   * (an empty mask when omitted).
   */
  resetExecutorCache(mask: VdfMask = new VdfMask()): void {
    // Untoggle the occupation flag of the executor cache without modifying
    // the ownership flag.
    if (this._flags & _IsOccupiedFlag) {
      this._flags &= ~_IsOccupiedFlag
    }

    // Reset the executor cache mask to the mask provided.
    if (!this._mask.Equals(mask)) {
      this._mask = mask
    }
  }

  /** RetainExecutorCache (executorBufferData.cpp:52-77). */
  retainExecutorCache(spec: VdfOutputSpec, smblData: VdfSMBLData | null): void {
    // It is an error if there is already data retained for this cache, or if
    // the cache is not owned or occupied at this output.
    TF_DEV_AXIOM(
      smblData !== null &&
      smblData.getCacheMask().IsEmpty() &&
      this._flags === (_IsOwnedFlag | _IsOccupiedFlag),
      'smblData && smblData->GetCacheMask().IsEmpty() && ' +
      '_GetFlags(cacheAndFlags) == (_IsOwnedFlag | _IsOccupiedFlag)')

    // Retain the current cache and return a new cache for us to use.
    const newCache = smblData.retain(spec, this._cache, this._mask)

    // Store the new cache, but reset the occupation state.
    this._cache = newCache
    this._flags = _IsOwnedFlag

    // Reset the cache mask.
    this._mask = new VdfMask()
  }

  /** ReleaseExecutorCache (executorBufferData.cpp:79-96). */
  releaseExecutorCache(smblData: VdfSMBLData | null): VdfMask {
    // If there is no smbl data or if there is no cache retained, bail out.
    if (!smblData || !smblData.hasCache()) {
      return new VdfMask()
    }

    // Merge the retained data into the executor cache.
    const mergeMask = smblData.getCacheMask()
    this.getExecutorCache()!.merge(smblData.getCache()!, mergeMask)

    // Release the previously retained cache.
    smblData.release()

    return mergeMask
  }

  /** HasOwnership (executorBufferData.h:287-292). */
  hasOwnership(): boolean {
    return (this._flags & _IsOwnedFlag) !== 0
  }

  /**
   * YieldOwnership (executorBufferData.h:294-312). Without an argument, the
   * internal vector is no longer owned. With `v`, frees any owned vector and
   * stores `v` as an occupied, non-owned cache.
   */
  yieldOwnership(v?: VdfVector | null): void {
    if (v === undefined) {
      this._flags &= ~_IsOwnedFlag
      return
    }

    TF_DEV_AXIOM(v !== this.getExecutorCache() || !this.hasOwnership(),
      'v != GetExecutorCache() || !HasOwnership()')

    this._free()
    this._cache = v
    this._flags = _IsOccupiedFlag
  }

  /** TakeOwnership (executorBufferData.h:314-325). */
  takeOwnership(v: VdfVector | null): void {
    TF_DEV_AXIOM(v !== this.getExecutorCache() || !this.hasOwnership(),
      'v != GetExecutorCache() || !HasOwnership()')

    this._free()
    this._cache = v
    this._flags = _IsOccupiedFlag | _IsOwnedFlag
  }

  /** _Free (executorBufferData.cpp:98-106): frees an owned vector. */
  private _free(): void {
    if (this._flags & _IsOwnedFlag) {
      this._cache = null
    }
  }
}
