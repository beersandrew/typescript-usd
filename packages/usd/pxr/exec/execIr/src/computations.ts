// Ported from OpenUSD 26.11.1: pxr/exec/execIr/computations.cpp,
//  pxr/exec/execIr/computations.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/computations.h and
// computations.cpp.
//
// TfStaticData<ExecIrComputationsType> ExecIrComputations is a frozen
// instance; TfToken is `string`.

/**
 * Defines computation names provided by all ExecIr schemas
 * (computations.h:21-60).
 *
 * These computations may be used in authoring workflows for invertible rigs.
 *
 * The computations defined here will be moved into ExecBuiltinComputations
 * when OpenExec supports native inversion.
 */
export class ExecIrComputationsType {
  /**
   * Computes the desired value of an invertible input attribute registered
   * by ExecIrControllerBuilder::InvertibleInputAttribute
   * (computations.h:33-50).
   *
   * computeDesiredValue is the opposite of computeValue: it produces a value
   * which must be authored in order to achieve desired downstream computed
   * values. It is designed to be used with
   * ExecUsdSystem::ComputeWithOverrides, with the desired downstream computed
   * values specified as overrides for explicitDesiredValue.
   */
  readonly computeDesiredValue: string

  /**
   * Produces a desired value for an attribute (computations.h:52-59).
   *
   * explicitDesiredValue is defined for all attributes in ExecIr. It has no
   * dependencies on other computations and always computes an empty value,
   * unless explicitly overridden during an invocation of
   * ExecUsdSystem::ComputeWithOverrides.
   */
  readonly explicitDesiredValue: string

  /** computations.cpp:11-14 */
  constructor() {
    this.computeDesiredValue = 'computeDesiredValue'
    this.explicitDesiredValue = 'explicitDesiredValue'
  }
}

/** computations.h:62-63, computations.cpp:16 */
export const ExecIrComputations: ExecIrComputationsType =
  Object.freeze(new ExecIrComputationsType())
