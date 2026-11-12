// Ported from OpenUSD 26.11.1: pxr/exec/vdf/maskMemoizer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/maskMemoizer.h.
//
// Memoizes the results of mask append (union) operations
// (maskMemoizer.h:16-62). The MapType template parameter selects the C++
// associative container; TS uses a Map keyed by the pair of mask hashes, the
// canonical key of a mask pair (openexec-x1.md 4.1 "Value semantics"). The
// key holds the operand masks, which keeps their interned bits, and so their
// hashes, alive for the lifetime of the memoizer.

import { VdfMask } from './mask.ts'

/** VdfMaskMemoizer (maskMemoizer.h:16-62). */
export class VdfMaskMemoizer {
  // The cache for append operations (maskMemoizer.h:57-60).
  readonly _appended = new Map<string, { lhs: VdfMask, rhs: VdfMask, result: VdfMask }>()

  /**
   * Append `lhs` and `rhs` and return the result. Returns a cached result,
   * if available (maskMemoizer.h:30-41).
   */
  append(lhs: VdfMask, rhs: VdfMask): VdfMask {
    const key = `${lhs.getHash()}:${rhs.getHash()}`
    const it = this._appended.get(key)
    if (it) {
      return it.result
    }
    const entry = { lhs: new VdfMask(lhs), rhs: new VdfMask(rhs), result: lhs.or(rhs) }
    this._appended.set(key, entry)
    return entry.result
  }
}
