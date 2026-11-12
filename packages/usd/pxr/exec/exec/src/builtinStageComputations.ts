// Ported from OpenUSD 26.11.1: pxr/exec/exec/builtinStageComputations.cpp,
//  pxr/exec/exec/builtinStageComputations.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/builtinStageComputations.h and
// builtinStageComputations.cpp.
//
// This file defines builtin computations that are provided by the stage, i.e.,
// by the pseudo-root prim.

import { TF_VERIFY, Type as TfType } from 'typescript-usd/tf'
import { EfTimeType } from 'typescript-usd/ef'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import type { VdfNode } from 'typescript-usd/vdf'
import { ExecBuiltinComputations } from './builtinComputations.ts'
import { Exec_ComputationDefinition } from './computationDefinition.ts'
import { Exec_ConstantValueNode } from './constantValueNode.ts'
import { Exec_DefinitionRegistry } from './definitionRegistry.ts'
import { Exec_InputKeyVector, type Exec_InputKeyVectorConstRefPtr } from './inputKey.ts'
import { Exec_PrivateBuiltinComputations } from './privateBuiltinComputations.ts'
import type { Exec_Program } from './program.ts'

//
// computeConstant
//

/** A computation that yields a constant value (builtinStageComputations.h:19-45). */
export class Exec_ComputeConstantComputationDefinition extends Exec_ComputationDefinition {
  /** builtinStageComputations.cpp:27-33 */
  constructor() {
    super(
      TfType.getUnknownType(),
      Exec_PrivateBuiltinComputations.computeConstant)
  }

  /** builtinStageComputations.cpp:38-46 */
  override getResultType(
    _providerObject: EsfObjectInterface,
    disambiguatingId: string,
    _journal: EsfJournal | null,
  ): TfType {
    return Exec_DefinitionRegistry.GetInstance().getConstantValue(
      disambiguatingId).getType()
  }

  /** builtinStageComputations.cpp:48-54 */
  override getExtractionType(_providerObject: EsfObjectInterface): TfType {
    TF_VERIFY(false, 'false', 'Extracting constant values directly is not supported.')
    return TfType.getUnknownType()
  }

  /** builtinStageComputations.cpp:56-62 */
  override getInputKeys(
    _providerObject: EsfObjectInterface,
    _journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    return Exec_InputKeyVector.getEmptyVector()
  }

  /** builtinStageComputations.cpp:64-82 */
  override compileNode(
    _providerObject: EsfObjectInterface,
    disambiguatingId: string,
    nodeJournal: EsfJournal | null,
    program: Exec_Program | null,
  ): VdfNode | null {
    if (!TF_VERIFY(nodeJournal, 'nodeJournal', 'Null nodeJournal') || !nodeJournal) {
      return null
    }
    if (!TF_VERIFY(program, 'program', 'Null program') || !program) {
      return null
    }

    const value =
      Exec_DefinitionRegistry.GetInstance().getConstantValue(
        disambiguatingId)
    return program.createNode(nodeJournal, Exec_ConstantValueNode, value)
  }
}

//
// computeTime
//

/** A computation that yields the current evaluation time (builtinStageComputations.h:47-65). */
export class Exec_TimeComputationDefinition extends Exec_ComputationDefinition {
  /** builtinStageComputations.cpp:88-93 */
  constructor() {
    super(
      EfTimeType,
      ExecBuiltinComputations.computeTime)
  }

  /** builtinStageComputations.cpp:97-103 */
  override getInputKeys(
    _providerObject: EsfObjectInterface,
    _journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    return Exec_InputKeyVector.getEmptyVector()
  }

  /** builtinStageComputations.cpp:105-119 */
  override compileNode(
    _providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    nodeJournal: EsfJournal | null,
    program: Exec_Program | null,
  ): VdfNode | null {
    if (!TF_VERIFY(nodeJournal, 'nodeJournal', 'Null nodeJournal') || !nodeJournal) {
      return null
    }
    if (!TF_VERIFY(program, 'program', 'Null program') || !program) {
      return null
    }

    return program.getTimeInputNode()
  }
}
