// Ported from OpenUSD 26.11.1: pxr/exec/exec/valueExtractor.cpp,
//  pxr/exec/exec/valueExtractor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/valueExtractor.h and
// valueExtractor.cpp.

import { TF_CODING_ERROR, type TfCompressedBits } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import type { VdfMask } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'
import type { Exec_ValueExtractorFunction } from './valueExtractorFunction.ts'

/**
 * Converts a VdfVector to a VtValue (valueExtractor.h:21-58).
 *
 * Value extraction is the process of returning computed values stored in
 * VdfVector to clients that consume VtValue.
 *
 * `operator()` is Call(v, mask).
 */
export class Exec_ValueExtractor {
  readonly #func: Exec_ValueExtractorFunction

  /** Constructs an invalid extractor, or one that invokes `func`. */
  constructor(func?: Exec_ValueExtractorFunction) {
    this.#func = func ?? Exec_ValueExtractor._extractInvalid
  }

  /**
   * Returns a VtValue holding the elements of `v` corresponding to the set
   * bits of `mask` (valueExtractor.h:36-40).
   */
  call(v: VdfVector, mask: VdfMask): VtValue {
    return this.#func(v, mask.getBits())
  }

  /** Returns true if this extractor can extract values (valueExtractor.h:43-45). */
  asBool(): boolean {
    return this.#func !== Exec_ValueExtractor._extractInvalid
  }

  /** Posts an error and returns an empty VtValue (valueExtractor.cpp:13-19). */
  static _extractInvalid(this: void, _v: VdfVector, _mask: TfCompressedBits): VtValue {
    TF_CODING_ERROR('Attempted to extract with invalid extractor')
    return VtValue.getEmpty()
  }
}
