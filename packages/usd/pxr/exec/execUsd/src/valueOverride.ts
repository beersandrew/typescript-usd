// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/valueOverride.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/valueOverride.h.

import type { Value as VtValue } from 'typescript-usd/vt'

import type { ExecUsdValueKey } from './valueKey.ts'

/**
 * Specifies a computed value that should be temporarily overridden with a
 * different value (valueOverride.h:20-34).
 *
 * \see ExecUsdSystem::ComputeWithOverrides
 */
export interface ExecUsdValueOverride {
  /** Which computed value should be overridden. */
  valueKey: ExecUsdValueKey

  /** When exec computes the above value key, it should produce this value. */
  overrideValue: VtValue
}

/** valueOverride.h:36 */
export type ExecUsdValueOverrideVector = ExecUsdValueOverride[]
