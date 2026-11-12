// Ported from OpenUSD 26.11.1: pxr/exec/exec/valueKey.cpp,
//  pxr/exec/exec/valueKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/valueKey.h and valueKey.cpp.

import type { EsfObject } from 'typescript-usd/esf'
import type { EsfJournal } from 'typescript-usd/esf'

/**
 * Specifies a computed value (valueKey.h:20-55).
 *
 * Clients identify computations to evaluate using a scene description
 * object that provides computations and the name of the computation.
 */
export class ExecValueKey {
  readonly #provider: EsfObject
  readonly #computationName: string

  constructor(provider: EsfObject, computationName: string) {
    this.#provider = provider
    this.#computationName = computationName
  }

  /** Returns the provider object of the requested value. */
  getProvider(): EsfObject {
    return this.#provider
  }

  /** Returns the name of the requested computation. */
  getComputationName(): string {
    return this.#computationName
  }

  /**
   * Return a human-readable description of this value key for diagnostic
   * purposes (valueKey.cpp:12-21).
   */
  getDebugName(): string {
    // Diagnostics should not be entangled with uncompilation dependencies.
    const journal: EsfJournal | null = null
    let debugName = this.#provider.Get().getPath(journal).pathString
    debugName += ' ['
    debugName += this.#computationName
    debugName += ']'
    return debugName
  }
}
