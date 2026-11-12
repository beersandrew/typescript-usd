// Ported from OpenUSD 26.11.1: pxr/exec/exec/builtinComputationRegistry.cpp,
//  pxr/exec/exec/builtinComputationRegistry.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/builtinComputationRegistry.h and
// builtinComputationRegistry.cpp.
//
// This file defines the Exec_BuiltinComputationRegistry which is a singleton
// class that associates each built-in computation with an
// Exec_BuiltinComputationTraits that describes the behavior of the built-in
// computation.

import { TF_VERIFY, TfSingleton, TfStringStartsWith } from 'typescript-usd/tf'

/**
 * Describes how a built-in computation is allowed to be used
 * (builtinComputationRegistry.h:27-80).
 */
export class Exec_BuiltinComputationTraits {
  /** True if users can register a computation by this name. */
  isUserDefinable = false

  /**
   * True if computations can explicitly request this built-in computation as
   * a computation input.
   */
  isInputConsumable = true

  /**
   * True if this built-in computation has a concrete
   * Exec_ComputationDefinition instance in the Exec_DefinitionRegistry.
   */
  hasDefinition = true

  // Builder interface (builtinComputationRegistry.h:46-77). Upstream's
  // rvalue-qualified setters move *this; these set and return this.

  setIsUserDefinable(isUserDefinable_: boolean): Exec_BuiltinComputationTraits {
    this.isUserDefinable = isUserDefinable_
    return this
  }

  setIsInputConsumable(isInputConsumable_: boolean): Exec_BuiltinComputationTraits {
    this.isInputConsumable = isInputConsumable_
    return this
  }

  setHasDefinition(hasDefinition_: boolean): Exec_BuiltinComputationTraits {
    this.hasDefinition = hasDefinition_
    return this
  }
}

// builtinComputationRegistry.cpp:17
const _builtinComputationPrefix = '__'

const _singleton = new TfSingleton<Exec_BuiltinComputationRegistry>(
  () => new Exec_BuiltinComputationRegistry(_constructionToken))
const _constructionToken = Symbol('Exec_BuiltinComputationRegistry')

/**
 * A registry that contains the name of every built-in computation known to
 * exec, and associates each with an Exec_BuiltinComputationTraits
 * (builtinComputationRegistry.h:82-137).
 */
export class Exec_BuiltinComputationRegistry {
  readonly #traits = new Map<string, Exec_BuiltinComputationTraits>()
  #numComputationsWithDefinitions = 0

  /** Only TfSingleton can create instances. */
  constructor(token: symbol) {
    if (token !== _constructionToken) {
      throw new TypeError('Exec_BuiltinComputationRegistry is a singleton; use GetInstance()')
    }
  }

  /** Gets the singleton instance of the registry (builtinComputationRegistry.cpp:23-27). */
  static GetInstance(): Exec_BuiltinComputationRegistry {
    return _singleton.GetInstance()
  }

  /**
   * Obtains a mutable reference to the singleton in order to register
   * built-in computations (builtinComputationRegistry.cpp:29-33).
   * Upstream this is private, friended by the token classes.
   */
  static _getInstanceForRegistration(): Exec_BuiltinComputationRegistry {
    return _singleton.GetInstance()
  }

  /**
   * Returns true if `computationName` is reserved for built-in computations
   * (builtinComputationRegistry.cpp:35-41).
   *
   * Note this may return true even if the computation name has not been
   * registered.
   */
  static isReservedName(computationName: string): boolean {
    return TfStringStartsWith(computationName, _builtinComputationPrefix)
  }

  /** Returns the string that prefixes all built-in computation names. */
  static getReservedNamePrefix(): string {
    return _builtinComputationPrefix
  }

  /**
   * Returns the number of registered built-in computations that have
   * concrete Exec_ComputationDefinition objects in the definition registry.
   */
  getNumComputationsWithDefinitions(): number {
    return this.#numComputationsWithDefinitions
  }

  /**
   * Gets the traits associated with the built-in computation named
   * `computationName`, or null if there is no such built-in computation
   * (builtinComputationRegistry.cpp:49-55).
   */
  getTraits(computationName: string): Exec_BuiltinComputationTraits | null {
    return this.#traits.get(computationName) ?? null
  }

  /**
   * Registers a new built-in computation named `computationName` (without
   * the built-in computation prefix), and with the provided
   * `computationTraits` (builtinComputationRegistry.cpp:57-78). Upstream
   * this is private, friended by the token classes.
   */
  _registerBuiltinComputation(
    computationName: string,
    computationTraits: Exec_BuiltinComputationTraits = new Exec_BuiltinComputationTraits(),
  ): string {
    const computationNameToken = _builtinComputationPrefix + computationName
    const emplaced = !this.#traits.has(computationNameToken)
    if (emplaced) this.#traits.set(computationNameToken, computationTraits)
    if (!TF_VERIFY(emplaced, 'emplaced')) {
      return ''
    }

    if (computationTraits.hasDefinition) {
      this.#numComputationsWithDefinitions++
    }

    return computationNameToken
  }
}
