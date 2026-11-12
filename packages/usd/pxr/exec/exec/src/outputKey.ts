// Ported from OpenUSD 26.11.1: pxr/exec/exec/outputKey.cpp,
//  pxr/exec/exec/outputKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/outputKey.h and outputKey.cpp.

import { Hash as TfHash } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { EsfObject } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { Exec_ComputationDefinition } from './computationDefinition.ts'

/**
 * Lightweight identity that represents an Exec_OutputKey
 * (outputKey.h:85-133, Exec_OutputKey::Identity).
 *
 * Instances of this class contain all the information necessary to represent
 * an Exec_OutputKey, while being lightweight, comparable, and hashable.
 *
 * Identities are not automatically maintained across scene edits.
 */
export class Exec_OutputKey_Identity {
  readonly #providerPath: SdfPath
  readonly #computationDefinition: Exec_ComputationDefinition
  readonly #disambiguatingId: string

  constructor(key: Exec_OutputKey) {
    this.#providerPath = key.getProviderObject().Get().getPath(null)
    this.#computationDefinition = key.getComputationDefinition()
    this.#disambiguatingId = key.getDisambiguatingId()
  }

  /** outputKey.h:96-101 */
  Equals(rhs: Exec_OutputKey_Identity): boolean {
    return this.#providerPath.equals(rhs.#providerPath) &&
      this.#computationDefinition === rhs.#computationDefinition &&
      this.#disambiguatingId === rhs.#disambiguatingId
  }

  notEquals(rhs: Exec_OutputKey_Identity): boolean {
    return !this.Equals(rhs)
  }

  /**
   * The canonical key string of this identity, for JS Maps that stand in for
   * upstream's hash maps keyed by Identity (port convention 5). Two
   * identities have equal keys exactly when they are Equal: the definition
   * pointer is represented by its process-unique serial number.
   */
  _getCanonicalKey(): string {
    return `${this.#providerPath.pathString}\u0000` +
      `${this.#computationDefinition._getSerialNumber()}\u0000${this.#disambiguatingId}`
  }

  /** TfHashAppend (outputKey.h:107-113). */
  getHash(): number {
    return Number(BigInt.asUintN(32, TfHash(this._getCanonicalKey())))
  }

  /**
   * Return a human-readable description of this value key for diagnostic
   * purposes (outputKey.cpp:12-24).
   */
  getDebugName(): string {
    let debugName = this.#providerPath.pathString
    debugName += ' ['
    debugName += this.#computationDefinition.getComputationName()
    if (this.#disambiguatingId !== '') {
      debugName += " disambiguatingId='" + this.#disambiguatingId + "'"
    }
    debugName += ']'
    return debugName
  }
}

/**
 * Specifies an output to compile (outputKey.h:24-80).
 *
 * Compilation uses output keys to identify outputs to compile along with
 * parameters needed for their compilation.
 */
export class Exec_OutputKey {
  /** Identity class (outputKey.h:70-71). */
  static readonly Identity = Exec_OutputKey_Identity

  readonly #providerObject: EsfObject
  readonly #dispatchingSchemaKey: EsfSchemaConfigKey
  readonly #computationDefinition: Exec_ComputationDefinition
  readonly #disambiguatingId: string

  constructor(
    providerObject: EsfObject,
    dispatchingSchemaKey: EsfSchemaConfigKey,
    computationDefinition: Exec_ComputationDefinition,
    disambiguatingId = '',
  ) {
    this.#providerObject = providerObject
    this.#dispatchingSchemaKey = dispatchingSchemaKey
    this.#computationDefinition = computationDefinition
    this.#disambiguatingId = disambiguatingId
  }

  /** Returns the object that provides the computation. */
  getProviderObject(): EsfObject {
    return this.#providerObject
  }

  /**
   * Returns the schema config key that should be used for computation lookup
   * for any input keys that request dispatched inputs, when compiling the
   * node that provides the output described by this key (outputKey.h:43-53).
   *
   * The returned config key is either the key for the output key's provider
   * or the key for the provider at the start of a recursive dispatched
   * computation chain.
   */
  getDispatchingSchemaKey(): EsfSchemaConfigKey {
    return this.#dispatchingSchemaKey
  }

  /** Returns the definition of the computation to compile. */
  getComputationDefinition(): Exec_ComputationDefinition {
    return this.#computationDefinition
  }

  /**
   * Returns a token that can be used to distinguish different computations
   * that share the same computationName.
   */
  getDisambiguatingId(): string {
    return this.#disambiguatingId
  }

  /** Constructs and returns an identity for this output key (outputKey.h:135-139). */
  makeIdentity(): Exec_OutputKey_Identity {
    return new Exec_OutputKey_Identity(this)
  }
}

export declare namespace Exec_OutputKey {
  type Identity = Exec_OutputKey_Identity
}

/**
 * A vector of output keys (outputKey.h:141-148).
 *
 * This is chosen for efficient storage of output keys generated from
 * Exec_CompilationTask%s, where often just a single output key is generated
 * per input.
 */
export type Exec_OutputKeyVector = Exec_OutputKey[]
