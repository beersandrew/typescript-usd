// Ported from OpenUSD 26.11.1: pxr/exec/exec/nodeRecompilationInfo.cpp,
//  pxr/exec/exec/nodeRecompilationInfo.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/nodeRecompilationInfo.h and
// nodeRecompilationInfo.cpp.
//
// Exec_InputKeyVectorConstRefPtr (a TfDelegatedCountPtr) is the
// Exec_InputKeyVector object itself; ownership is GC.

import { TF_VERIFY } from 'typescript-usd/tf'

import { EsfObject } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { VdfInput } from 'typescript-usd/vdf'

import type { Exec_InputKey, Exec_InputKeyVector } from './inputKey.ts'

/**
 * Stores required information to recompile inputs of an arbitrary node
 * (nodeRecompilationInfo.h:22-70).
 */
export class Exec_NodeRecompilationInfo {
  // The node's provider.
  private readonly _provider: EsfObject
  private readonly _dispatchingSchemaId: EsfSchemaConfigKey
  private readonly _inputKeys: Exec_InputKeyVector

  constructor(
    provider: EsfObject,
    dispatchingSchemaId: EsfSchemaConfigKey,
    inputKeys: Exec_InputKeyVector,
  ) {
    // The provider is held by value (nodeRecompilationInfo.h:65).
    this._provider = new EsfObject(provider)
    this._dispatchingSchemaId = dispatchingSchemaId
    this._inputKeys = inputKeys
  }

  /**
   * Gets the provider of the node, which serves as the input resolution
   * origin.
   */
  getProvider(): EsfObject {
    return this._provider
  }

  /**
   * Gets the schema config key from the output key that was used to initially
   * compile the node.
   */
  getDispatchingSchemaKey(): EsfSchemaConfigKey {
    return this._dispatchingSchemaId
  }

  /**
   * Gets the input keys to re-resolve `input` on the node: each input key
   * with the same name and type as `input`. If there are no matching input
   * keys, the returned array is empty and an error is raised
   * (nodeRecompilationInfo.cpp:17-38).
   */
  getInputKeys(input: VdfInput): Exec_InputKey[] {
    const matchingInputKeys: Exec_InputKey[] = []
    const inputName = input.getName()
    const inputType = input.getSpec().getType()

    for (const inputKey of this._inputKeys.Get()) {
      if (inputKey.inputName === inputName &&
        inputKey.resultType === inputType) {
        matchingInputKeys.push(inputKey)
      }
    }

    TF_VERIFY(matchingInputKeys.length !== 0,
      '!matchingInputKeys.empty()',
      `Recompilation could not obtain input keys for '${input.getName()}' ` +
      `on node '${input.getNode().getDebugName()}'`)

    return matchingInputKeys
  }
}
