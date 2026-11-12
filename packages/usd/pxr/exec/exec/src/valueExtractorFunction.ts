// Ported from OpenUSD 26.11.1: pxr/exec/exec/valueExtractorFunction.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/valueExtractorFunction.h.

import type { TfCompressedBits } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import type { VdfVector } from 'typescript-usd/vdf'

/**
 * Signature of function used to extract values held by execution in VdfVector
 * into VtValue (valueExtractorFunction.h:19-27). The mask bits are
 * VdfMask::Bits, a TfCompressedBits.
 *
 * This is an implementation detail used by ExecTypeRegistry and
 * Exec_ValueExtractor as an interface to type-specific extraction code.
 */
export type Exec_ValueExtractorFunction =
  (v: VdfVector, mask: TfCompressedBits) => VtValue
