// Ported from OpenUSD 26.11.1: pxr/exec/exec/computationDefinition.cpp,
//  pxr/exec/exec/computationDefinition.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/computationDefinition.h and
// computationDefinition.cpp.

import type { Type as TfType } from 'typescript-usd/tf'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import type { VdfNode } from 'typescript-usd/vdf'
import type { Exec_InputKeyVectorConstRefPtr } from './inputKey.ts'
import type { Exec_Program } from './program.ts'

let _nextSerialNumber = 0

/**
 * A base class that defines an exec computation
 * (computationDefinition.h:25-96).
 *
 * For a given computation provider object, a computation definition can
 * provide the result type, generate input keys, and compile a VdfNode.
 */
export abstract class Exec_ComputationDefinition {
  readonly #resultType: TfType
  readonly #computationName: string
  // Stands in for the definition's address where upstream keys identities by
  // the definition pointer (Exec_OutputKey::Identity, outputKey.h:107-113).
  readonly #serialNumber = _nextSerialNumber++

  /** Creates a definition for a computation (computationDefinition.cpp:13-20). */
  protected constructor(resultType: TfType, computationName: string) {
    this.#resultType = resultType
    this.#computationName = computationName
  }

  /** Returns the name of the computation. */
  getComputationName(): string {
    return this.#computationName
  }

  /**
   * Returns the type of values that are produced by this computation
   * (computationDefinition.cpp:24-31).
   */
  getResultType(
    _providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    _journal: EsfJournal | null,
  ): TfType {
    return this.#resultType
  }

  /**
   * Returns the type of values returned to external clients of execution
   * that request this computation (computationDefinition.cpp:33-42).
   */
  getExtractionType(_providerObject: EsfObjectInterface): TfType {
    // TODO: Currently, a computation cannot specify an extraction type that
    // differs from its result type.  Extend the definition language to allow
    // authors to specify whether the extracted value should be a scalar or
    // array.
    return this.#resultType
  }

  /**
   * Returns `true` if this computation is a dispatched computation
   * (computationDefinition.cpp:44-48).
   */
  isDispatched(): boolean {
    return false
  }

  /**
   * Returns the keys that indicate how to source the input values required
   * to evaluate the computation when the provider is `providerObject`.
   *
   * Keys are returned by a shared reference; if the definition has no inputs,
   * this returns an empty vector, never null. Any scene access needed to
   * determine the input keys is recorded in `journal`.
   */
  abstract getInputKeys(
    providerObject: EsfObjectInterface,
    journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr

  /**
   * Compiles the node that implements the computation when the provider is
   * `providerObject`, adding it to the network owned by `program`.
   *
   * The information in `nodeJournal` will be used to determine when the
   * node must be uncompiled.
   */
  abstract compileNode(
    providerObject: EsfObjectInterface,
    disambiguatingId: string,
    nodeJournal: EsfJournal | null,
    program: Exec_Program | null,
  ): VdfNode | null

  /** @internal The serial number that stands in for this definition's address. */
  _getSerialNumber(): number {
    return this.#serialNumber
  }
}
