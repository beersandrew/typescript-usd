// Ported from OpenUSD 26.11.1: pxr/exec/vdf/smblData.cpp,
//  pxr/exec/vdf/smblData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/smblData.h and
// pxr/exec/vdf/smblData.cpp.
//
// VdfMask is an immutable value type here (doc section 4, rule 5), so the
// mask out-parameters of ExtendLockedCacheMask and RemoveUncachedMask become
// return values: the new locked cache mask.

import { VdfMask } from './mask.ts'
import type { VdfOutputSpec } from './outputSpec.ts'
import type { VdfVector } from './vector.ts'

/**
 * _MaskOpMemoizer (smblData.h:158-190): memoizes the result of a mask
 * operation for the last pair of operands. Masks are flyweighted, so the
 * operands are cheap to store and compare.
 */
class _MaskOpMemoizer<R> {
  private _opA = new VdfMask()
  private _opB = new VdfMask()
  private _result: R
  private readonly _op: (lhs: VdfMask, rhs: VdfMask) => R

  constructor(op: (lhs: VdfMask, rhs: VdfMask) => R) {
    this._op = op
    // Initialize the default result to avoid correctness problems.
    this._result = op(this._opA, this._opB)
  }

  Apply(opA: VdfMask, opB: VdfMask): R {
    // Cache miss?
    if (!this._opA.Equals(opA) || !this._opB.Equals(opB)) {
      this._opA = opA
      this._opB = opB
      this._result = this._op(opA, opB)
    }

    // Cache hit!
    return this._result
  }
}

// smblData.h:193-197: memoized mask subtraction.
const _MaskSubtract = (lhs: VdfMask, rhs: VdfMask): VdfMask => lhs.subtract(rhs)

// smblData.h:200-206: `VdfMask res(lhs); res.SetOrAppend(rhs);`. SetOrAppend
// (mask.h:385-392) assigns rhs to a zero-size mask and ors it otherwise.
const _MaskSetOrAppend = (lhs: VdfMask, rhs: VdfMask): VdfMask =>
  lhs.IsEmpty() ? rhs : lhs.or(rhs)

// smblData.h:209-213: memoized Contains.
const _MaskContains = (lhs: VdfMask, rhs: VdfMask): boolean => lhs.contains(rhs)

/**
 * VdfSMBLData (smblData.h:30-236): per-output data specific to sparse mung
 * buffer locking.
 */
export class VdfSMBLData {
  // smblData.h:216-230: the memoized mask computations.
  private readonly _cachedInvalidate = new _MaskOpMemoizer(_MaskSubtract)
  private readonly _cachedExtend = new _MaskOpMemoizer(_MaskSetOrAppend)
  private readonly _cachedAffective = new _MaskOpMemoizer(_MaskContains)
  private readonly _cachedRequiredMask = new _MaskOpMemoizer(_MaskSubtract)
  private readonly _cachedRequiredLockedCache = new _MaskOpMemoizer(_MaskSubtract)

  // smblData.h:233-234: the locally retained cache and cache mask.
  private _cache: VdfVector | null = null
  private _cacheMask = new VdfMask()

  /**
   * InvalidateCacheMask (smblData.h:239-247): returns cacheMask with the
   * bits in invalidationMask removed (memoized).
   */
  invalidateCacheMask(cacheMask: VdfMask, invalidationMask: VdfMask): VdfMask {
    return cacheMask.IsEmpty()
      ? cacheMask
      : this._cachedInvalidate.Apply(cacheMask, invalidationMask)
  }

  /**
   * ExtendLockedCacheMask (smblData.h:65-69): returns lockedCacheMask
   * extended by the bits in cacheMask (memoized). The C++ mutates
   * `*lockedCacheMask`.
   */
  extendLockedCacheMask(lockedCacheMask: VdfMask, cacheMask: VdfMask): VdfMask {
    return this._cachedExtend.Apply(lockedCacheMask, cacheMask)
  }

  /**
   * RemoveUncachedMask (smblData.h:249-265): returns lockedCacheMask without
   * the bits of keepMask that cacheMask does not provide. The C++ mutates
   * `*lockedCacheMask`.
   */
  removeUncachedMask(lockedCacheMask: VdfMask, cacheMask: VdfMask, keepMask: VdfMask): VdfMask {
    // Determine which bits in the keep mask are not available in the local
    // executor cache.
    const uncached = cacheMask.IsEmpty()
      ? keepMask
      : this._cachedRequiredMask.Apply(keepMask, cacheMask)

    // Remove the uncached bits, if any.
    return this._cachedRequiredLockedCache.Apply(lockedCacheMask, uncached)
  }

  /** ComputeAffectiveness (smblData.h:87-91), memoized. */
  computeAffectiveness(lockedCacheMask: VdfMask, affectsMask: VdfMask): boolean {
    return !this._cachedAffective.Apply(lockedCacheMask, affectsMask)
  }

  /**
   * Retain (smblData.h:267-288): locally retains `cache` with `cacheMask`,
   * and returns a free cache for the client to use.
   */
  retain(spec: VdfOutputSpec, cache: VdfVector | null, cacheMask: VdfMask): VdfVector {
    // The local cache is always a free cache. If a local cache has not
    // been allocated, yet, allocate one here.
    if (!this._cache) {
      this._cache = spec.allocateCache()
    }

    // Store a pointer to the current cache, which is a always a free cache.
    const freeCache = this._cache

    // Swap the current cache with the passed in cache, to retain it.
    this._cache = cache
    this._cacheMask = cacheMask

    return freeCache
  }

  /**
   * Release (smblData.h:117-121): demotes the retained cache to a free cache
   * for future use.
   */
  release(): void {
    if (!this._cacheMask.IsEmpty()) {
      this._cacheMask = new VdfMask()
    }
  }

  /** Clear (smblData.cpp:16-22). */
  clear(): void {
    this._cache = null
    this._cacheMask = new VdfMask()
  }

  /** GetCache (smblData.h:130-132). */
  getCache(): VdfVector | null {
    return this._cache
  }

  /** GetCacheMask (smblData.h:136-138). */
  getCacheMask(): VdfMask {
    return this._cacheMask
  }

  /** HasCache (smblData.h:143-145). */
  hasCache(): boolean {
    return this._cache !== null && !this._cacheMask.IsEmpty()
  }
}
