// Ported from OpenUSD 26.11.1: pxr/exec/exec/builtinComputations.cpp,
//  pxr/exec/exec/builtinComputations.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/builtinComputations.h and
// builtinComputations.cpp.

import {
  Exec_BuiltinComputationRegistry,
  Exec_BuiltinComputationTraits,
} from './builtinComputationRegistry.ts'

/**
 * Tokens representing the built-in computations available on various
 * provider types (builtinComputations.h:22-166).
 *
 * These tokens can all be used in input registrations to request input
 * values for plugin computations. They can also be passed to compute APIs to
 * request computed values. They are publicly accessible through
 * `ExecBuiltinComputations`.
 */
export class Exec_BuiltinComputationTokens {
  /**
   * Computes the current time on the stage; an EfTime value. The computation
   * provider must be the stage.
   */
  readonly computeTime: string

  /**
   * Computes the provider attribute's value: an attribute expression if
   * registered; else the computed value of the attribute targeted by the
   * provider's single valid connection of the same type; else the resolved
   * value of the provider. The computation provider must be an attribute.
   */
  readonly computeValue: string

  /**
   * Computes the provider attribute's resolved value as authored in scene
   * description.
   */
  readonly computeResolvedValue: string

  /** Computes the provider's scene path, as an SdfPath. */
  readonly computePath: string

  /** builtinComputations.cpp:16-34 */
  constructor(
    registry: Exec_BuiltinComputationRegistry =
    Exec_BuiltinComputationRegistry._getInstanceForRegistration(),
  ) {
    this.computeTime = registry._registerBuiltinComputation('computeTime')
    this.computeValue = registry._registerBuiltinComputation(
      'computeValue',
      new Exec_BuiltinComputationTraits()
        .setHasDefinition(false))
    this.computeResolvedValue =
      registry._registerBuiltinComputation('computeResolvedValue')
    this.computePath =
      registry._registerBuiltinComputation('computePath')
  }
}

/**
 * Used to publicly access builtin computation tokens
 * (builtinComputations.h:168-170). TfStaticData constructs on first access;
 * this module constructs it when loaded.
 */
export const ExecBuiltinComputations: Exec_BuiltinComputationTokens =
  new Exec_BuiltinComputationTokens()
