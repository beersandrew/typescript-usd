// Ported from OpenUSD 26.11.1: pxr/exec/exec/inputKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/inputKey.h.
//
// Exec_InputKeyVector is shared by reference-counted pointers upstream
// (TfDelegatedCountPtr); here it is shared by reference, and the
// Exec_InputKeyVectorRefPtr / ConstRefPtr aliases name the shared object.

import type { Type as TfType } from 'typescript-usd/tf'
import type { ExecProviderResolution } from './providerResolution.ts'

/**
 * Data used to specify a computation input (inputKey.h:24-59).
 *
 * Exec compilation uses input keys to compile the input connections for that
 * provide input values to computations. The input key is expressed relative
 * to the scene object that owns the computation that reads from the input.
 *
 * Upstream copies input keys by value; Exec_InputKeyCopy copies one.
 */
export interface Exec_InputKey {
  /** The name used to uniquely address the input value. */
  inputName: string
  /** The requested computation name. */
  computationName: string
  /**
   * A token that can be used to distinguish different computations that
   * share the same computationName.
   */
  disambiguatingId: string
  /** The requested computation result type. */
  resultType: TfType
  /**
   * Describes how we find the provider, starting from the object that owns
   * the computation to which this key provides an input.
   */
  providerResolution: ExecProviderResolution
  /**
   * Indicates whether or not the input will fall back to looking for a
   * dispatched computation if a local computation can't be found.
   */
  fallsBackToDispatched: boolean
  /** Indicates whether or not the input is optional. */
  optional: boolean
}

/** Copies an Exec_InputKey, as upstream's implicit copy constructor does. */
export function Exec_InputKeyCopy(key: Exec_InputKey): Exec_InputKey {
  return {
    ...key,
    providerResolution: { ...key.providerResolution },
  }
}

/** A shared mutable vector of input keys (inputKey.h:61-63). */
export type Exec_InputKeyVectorRefPtr = Exec_InputKeyVector
/** A shared immutable vector of input keys (inputKey.h:65-67). */
export type Exec_InputKeyVectorConstRefPtr = Exec_InputKeyVector

let _emptyVector: Exec_InputKeyVector | undefined

/**
 * A vector of input keys (inputKey.h:69-146).
 *
 * This is chosen for efficient storage of input keys in
 * Exec_ComputationDefinition%s.
 */
export class Exec_InputKeyVector {
  readonly #inputKeys: Exec_InputKey[]

  private constructor(keys: Exec_InputKey[]) {
    this.#inputKeys = keys
  }

  /** Returns a pointer to a new Exec_InputKeyVector (inputKey.h:81-85). */
  static makeConstShared(keys: readonly Exec_InputKey[]): Exec_InputKeyVectorConstRefPtr {
    return new Exec_InputKeyVector([...keys])
  }

  /** Returns a pointer to a new empty Exec_InputKeyVector (inputKey.h:87-90). */
  static makeShared(): Exec_InputKeyVectorRefPtr {
    return new Exec_InputKeyVector([])
  }

  /**
   * Returns a pointer to a common immutable empty vector
   * (inputKey.h:92-102).
   *
   * Computation definitions can return this pointer instead of allocating
   * their own empty vectors.
   */
  static getEmptyVector(): Exec_InputKeyVectorConstRefPtr {
    return _emptyVector ??= new Exec_InputKeyVector([])
  }

  /** Gets the wrapped vector of input keys (inputKey.h:104-112). */
  Get(): Exec_InputKey[] {
    return this.#inputKeys
  }
}
