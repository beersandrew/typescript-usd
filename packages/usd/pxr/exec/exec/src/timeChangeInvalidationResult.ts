// Ported from OpenUSD 26.11.1: pxr/exec/exec/timeChangeInvalidationResult.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/timeChangeInvalidationResult.h.

import type { EfTime } from 'typescript-usd/ef'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

/**
 * Communicates the results of a time change causing invalidation
 * (timeChangeInvalidationResult.h:21-40).
 */
export interface Exec_TimeChangeInvalidationResult {
  /**
   * The time-dependent outputs to traverse and invalidate as a consequence of
   * the time changing from oldTime to newTime.
   */
  invalidationRequest: VdfMaskedOutput[]

  /**
   * The leaf nodes which are invalid as a result of the time change: the
   * time-dependent leaf nodes filtered by the leaf nodes reachable from the
   * inputs where there is *actually* a value difference between oldTime and
   * newTime.
   */
  readonly invalidLeafNodes: readonly VdfNode[]

  /** The old time, which was effective prior to the time change. */
  oldTime: EfTime

  /** The new time, which has now become effective with this time change. */
  newTime: EfTime
}
