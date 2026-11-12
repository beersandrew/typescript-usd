// Ported from OpenUSD 26.11.1: pxr/exec/vdf/poolChainIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/poolChainIndex.h.
//
// VdfPoolChainIndex is an opaque, ordered index of an output in the pool
// chain. Upstream packs ((poolChainIndex + 1) << 32) | outputIndex into a
// size_t (poolChainIndex.h:58-67); that exceeds 2**53, so the two fields are
// kept separately and compared lexicographically, which is the same order.

import type { VdfOutput } from './output.ts'

export class VdfPoolChainIndex {
  // (poolChainIndex + 1), with the invalid index -1 mapping to 0.
  private readonly _high: number
  private readonly _low: number

  /** VdfPoolChainIndex(poolChainIndex, outputIndex) (poolChainIndex.h:58). Only VdfPoolChainIndexer constructs these. */
  constructor(poolChainIndex: number, outputIndex: number) {
    this._high = poolChainIndex + 1
    this._low = outputIndex >>> 0
  }

  /** operator< (poolChainIndex.h:26). */
  lessThan(rhs: VdfPoolChainIndex): boolean {
    return this._high < rhs._high ||
      (this._high === rhs._high && this._low < rhs._low)
  }

  /** operator<= (poolChainIndex.h:31). */
  lessThanOrEqual(rhs: VdfPoolChainIndex): boolean {
    return !rhs.lessThan(this)
  }

  /** operator> (poolChainIndex.h:36). */
  greaterThan(rhs: VdfPoolChainIndex): boolean {
    return rhs.lessThan(this)
  }

  /** operator>= (poolChainIndex.h:41). */
  greaterThanOrEqual(rhs: VdfPoolChainIndex): boolean {
    return !this.lessThan(rhs)
  }

  /** operator== (poolChainIndex.h:46). */
  Equals(rhs: VdfPoolChainIndex): boolean {
    return this._high === rhs._high && this._low === rhs._low
  }

  /** operator!= (poolChainIndex.h:51). */
  notEquals(rhs: VdfPoolChainIndex): boolean {
    return !this.Equals(rhs)
  }

  /** The canonical key for JS Maps keyed by pool chain index. */
  getKey(): string {
    return `${this._high}:${this._low}`
  }
}

/**
 * Vdf_IsPoolOutput (poolChainIndex.h:77-81): an output with an associated
 * input that outputs vectorized data.
 */
export function Vdf_IsPoolOutput(output: VdfOutput): boolean {
  return output.getAssociatedInput() !== null && output.getNumDataEntries() > 1
}
