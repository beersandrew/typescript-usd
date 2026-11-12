// Ported from OpenUSD 26.11.1: pxr/exec/exec/builtinObjectComputations.cpp,
//  pxr/exec/exec/builtinObjectComputations.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/builtinObjectComputations.h and
// builtinObjectComputations.cpp.
//
// This file defines builtin computations that are provided by objects (prims
// or attributes).

import { TF_CODING_ERROR, TF_VERIFY, Type as TfType } from 'typescript-usd/tf'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { VdfInputVector } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { ExecBuiltinComputations } from './builtinComputations.ts'
import { Exec_ComputationDefinition } from './computationDefinition.ts'
import { Exec_InputKeyVector, type Exec_InputKeyVectorConstRefPtr } from './inputKey.ts'
import { Exec_MetadataInputNode } from './metadataInputNode.ts'
import { Exec_PrivateBuiltinComputations } from './privateBuiltinComputations.ts'
import type { Exec_Program } from './program.ts'
import { SdfPathType } from './typeRegistry.ts'

// VdfInputVector<SdfPath>. Exec_Program.CreateNode constructs node classes
// whose constructor takes the network first (program.ts), and
// VdfInputVector's takes the value type first (vdf/src/inputVector.ts);
// this class only reorders the arguments.
class _SdfPathInputVector extends VdfInputVector<SdfPath> {
  constructor(network: VdfNetwork, numElements: number) {
    super(SdfPathType, network, numElements)
  }
}

//
// computeMetadata
//

/**
 * A computation that yields the value of a specified metadata field
 * (builtinObjectComputations.h:19-45).
 */
export class Exec_ComputeMetadataComputationDefinition extends Exec_ComputationDefinition {
  /** builtinObjectComputations.cpp:24-30 */
  constructor() {
    super(
      TfType.getUnknownType(),
      Exec_PrivateBuiltinComputations.computeMetadata)
  }

  /** builtinObjectComputations.cpp:35-42 */
  override getResultType(
    providerObject: EsfObjectInterface,
    disambiguatingId: string,
    _journal: EsfJournal | null,
  ): TfType {
    return providerObject.getMetadataValueType(disambiguatingId)
  }

  /** builtinObjectComputations.cpp:44-50 */
  override getExtractionType(_providerObject: EsfObjectInterface): TfType {
    TF_VERIFY(false, 'false', 'Extracting metdata values directly is not supported.')
    return TfType.getUnknownType()
  }

  /** builtinObjectComputations.cpp:52-58 */
  override getInputKeys(
    _providerObject: EsfObjectInterface,
    _journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    return Exec_InputKeyVector.getEmptyVector()
  }

  /** builtinObjectComputations.cpp:60-86 */
  override compileNode(
    providerObject: EsfObjectInterface,
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

    if (!providerObject.isValidMetadataKey(disambiguatingId)) {
      TF_CODING_ERROR(
        'Skipping compilation of input node for invalid metadata key ' +
        `'${disambiguatingId}'`)
      return null
    }

    return program.createNode(
      nodeJournal,
      Exec_MetadataInputNode,
      providerObject.asObject(),
      disambiguatingId,
      this.getResultType(providerObject, disambiguatingId, nodeJournal))
  }
}

//
// computePath
//

/**
 * A computation that yields the provider's scene path
 * (builtinObjectComputations.h:47-67).
 */
export class Exec_ComputePathComputationDefinition extends Exec_ComputationDefinition {
  /** builtinObjectComputations.cpp:92-98 */
  constructor() {
    super(
      SdfPathType,
      ExecBuiltinComputations.computePath)
  }

  /** builtinObjectComputations.cpp:103-109 */
  override getInputKeys(
    _providerObject: EsfObjectInterface,
    _journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    return Exec_InputKeyVector.getEmptyVector()
  }

  /** builtinObjectComputations.cpp:111-140 */
  override compileNode(
    providerObject: EsfObjectInterface,
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

    // We provide a path value by creating a VdfInputVector because each unique
    // value corresponds to a different object, so there's no need for the kind
    // of sharing we do for Exec_ConstantValueNode.

    // Get the path before creating the node, so that we update the journal.
    const path = providerObject.getPath(nodeJournal)

    // Create the input vector and set the data.
    const node = program.createNode(
      nodeJournal, _SdfPathInputVector, /* size */ 1)
    node.setValue(0, path)
    return node
  }
}
