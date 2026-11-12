// Ported from OpenUSD 26.11.1: pxr/exec/exec/request.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/request.h.

import type { EfTimeInterval } from 'typescript-usd/ef'

/**
 * Index into the array of exec value keys used to construct an exec request
 * (request.h:18-19). pxr_tsl::robin_set<int> is a JS Set of numbers.
 */
export type ExecRequestIndexSet = Set<number>

/**
 * Invalidation callback used by exec requests to notify clients of invalid
 * computed values (request.h:21-31). The index set contains the indices of
 * value keys with invalid computed values, along with a time interval that
 * specifies the time range over which these computed values are invalid.
 */
export type ExecRequestComputedValueInvalidationCallback =
  (invalidIndices: ReadonlySet<number>, invalidInterval: EfTimeInterval) => void

/**
 * Invalidation callback used by exec requests to notify clients of invalid
 * computed values as a consequence of time changing (request.h:33-41). The
 * index set contains the indices of value keys which are time dependent, and
 * for which input values to the execution system are changing between the
 * old time and new time.
 */
export type ExecRequestTimeChangeInvalidationCallback =
  (invalidIndices: ReadonlySet<number>) => void
