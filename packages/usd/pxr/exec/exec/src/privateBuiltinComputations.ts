// Ported from OpenUSD 26.11.1: pxr/exec/exec/privateBuiltinComputations.cpp,
//  pxr/exec/exec/privateBuiltinComputations.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/privateBuiltinComputations.h and
// privateBuiltinComputations.cpp.

import {
  Exec_BuiltinComputationRegistry,
  Exec_BuiltinComputationTraits,
} from './builtinComputationRegistry.ts'

/**
 * Tokens representing built-in computations that are used internally by the
 * execution system (privateBuiltinComputations.h:20-72).
 */
export class Exec_PrivateBuiltinComputationTokens {
  /** Computes a constant value. The computation provider must be the stage. */
  readonly computeConstant: string

  /**
   * Computes a given metadatum on the computation provider. The provider can
   * be any type of scene object *except* the pseudo-root.
   */
  readonly computeMetadata: string

  /**
   * Clients register an attribute computation by this name when they define
   * an attribute expression. Inputs are not allowed to pull on this
   * computation directly; they pull on `computeValue`.
   */
  readonly computeExpression: string

  /**
   * Computes the value received across a single connection that is owned by
   * the provider attribute and targets another valid attribute of the same
   * type.
   */
  readonly computeConnectedValue: string

  /** privateBuiltinComputations.cpp:17-35 */
  constructor(
    registry: Exec_BuiltinComputationRegistry =
    Exec_BuiltinComputationRegistry._getInstanceForRegistration(),
  ) {
    this.computeConstant = registry._registerBuiltinComputation('computeConstant')
    this.computeMetadata = registry._registerBuiltinComputation('computeMetadata')
    this.computeExpression = registry._registerBuiltinComputation(
      'computeExpression',
      new Exec_BuiltinComputationTraits()
        .setHasDefinition(false)
        .setIsUserDefinable(true)
        .setIsInputConsumable(false))
    this.computeConnectedValue = registry._registerBuiltinComputation(
      'computeConnectedValue')
  }
}

/**
 * Used to access private builtin computation tokens
 * (privateBuiltinComputations.h:74-77).
 */
export const Exec_PrivateBuiltinComputations: Exec_PrivateBuiltinComputationTokens =
  new Exec_PrivateBuiltinComputationTokens()
