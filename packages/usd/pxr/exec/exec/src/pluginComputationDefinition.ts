// Ported from OpenUSD 26.11.1: pxr/exec/exec/pluginComputationDefinition.cpp,
//  pxr/exec/exec/pluginComputationDefinition.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/pluginComputationDefinition.h and
// pluginComputationDefinition.cpp.

import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfTokens } from 'typescript-usd/vdf'
import { Exec_CallbackNode } from './callbackNode.ts'
import { Exec_ComputationDefinition } from './computationDefinition.ts'
import type {
  Exec_InputKeyVectorConstRefPtr, Exec_InputKeyVectorRefPtr,
} from './inputKey.ts'
import type { Exec_Program } from './program.ts'
import type { ExecCallbackFn, ExecDispatchesOntoSchemas } from './types.ts'

const _emptyDispatchesOntoSchemas: ExecDispatchesOntoSchemas = []

/**
 * A class that defines a plugin computation
 * (pluginComputationDefinition.h:27-81).
 *
 * A plugin computation definition includes the callback that implements the
 * evaluation logic and input keys that indicate how to source the input
 * values that are provided to the callback at evaluation time.
 */
export class Exec_PluginComputationDefinition extends Exec_ComputationDefinition {
  readonly #callback: ExecCallbackFn
  readonly #inputKeys: Exec_InputKeyVectorConstRefPtr
  readonly #dispatchesOntoSchemas: ExecDispatchesOntoSchemas | null

  /**
   * Creates a definition for a plugin computation
   * (pluginComputationDefinition.cpp:17-32).
   *
   * If `dispatchesOntoSchemas` is null, the computation is non-dispatched.
   * Otherwise, it is a dispatched computation that dispatches onto prim with
   * the given list of schemas, or to all prims, if the list is empty.
   */
  constructor(
    resultType: TfType,
    computationName: string,
    callback: ExecCallbackFn,
    inputKeys: Exec_InputKeyVectorRefPtr,
    dispatchesOntoSchemas: ExecDispatchesOntoSchemas | null = null,
  ) {
    super(resultType, computationName)
    this.#callback = callback
    this.#inputKeys = inputKeys
    this.#dispatchesOntoSchemas = dispatchesOntoSchemas
  }

  /** pluginComputationDefinition.cpp:36-40 */
  override isDispatched(): boolean {
    return this.#dispatchesOntoSchemas !== null
  }

  /**
   * Returns the list of schemas used to restrict the prims this computation
   * dispatches onto, if it is a dispatched computation
   * (pluginComputationDefinition.cpp:42-54).
   *
   * An error is emitted if the computation definition is for a
   * non-dispatched computation.
   */
  getDispatchesOntoSchemas(): ExecDispatchesOntoSchemas {
    if (this.#dispatchesOntoSchemas) {
      return this.#dispatchesOntoSchemas
    }

    TF_CODING_ERROR(
      'Attempt to access dispatched-on schemas for a non-dispatched ' +
      `computation '${this.getComputationName()}'`)
    return _emptyDispatchesOntoSchemas
  }

  /** pluginComputationDefinition.cpp:56-62 */
  override getInputKeys(
    _providerObject: EsfObjectInterface,
    _journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    return this.#inputKeys
  }

  /** pluginComputationDefinition.cpp:64-97 */
  override compileNode(
    providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    nodeJournal: EsfJournal | null,
    program: Exec_Program | null,
  ): VdfNode | null {
    if (!nodeJournal) {
      TF_CODING_ERROR('Null nodeJournal')
      return null
    }
    if (!program) {
      TF_CODING_ERROR('Null program')
      return null
    }

    const inputSpecs = new VdfInputSpecs()
    inputSpecs.reserve(this.#inputKeys.Get().length)
    for (const inputKey of this.#inputKeys.Get()) {
      inputSpecs.readConnector(inputKey.resultType, inputKey.inputName)
    }

    const outputSpecs = new VdfOutputSpecs()
    outputSpecs.connector(
      this.getResultType(
        providerObject, /* disambiguatingId */ '', nodeJournal),
      VdfTokens.out)

    return program.createNode(
      nodeJournal,
      Exec_CallbackNode,
      inputSpecs,
      outputSpecs,
      this.#callback)
  }
}
