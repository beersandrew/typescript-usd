// Ported from OpenUSD 26.11.1: pxr/exec/exec/valueOverride.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/valueOverride.h.

import type { Value as VtValue } from 'typescript-usd/vt'

import type { ExecValueKey } from './valueKey.ts'

/**
 * Specifies a computed value that should be temporarily overridden with a
 * different value (valueOverride.h:22-34).
 *
 * \see ExecSystem::_ComputeWithOverrides
 */
export interface ExecValueOverride {
  /** Which computed value should be overridden. */
  valueKey: ExecValueKey

  /** When exec computes the above value key, it should produce this value. */
  overrideValue: VtValue
}

/** valueOverride.h:36 */
export type ExecValueOverrideVector = ExecValueOverride[]
