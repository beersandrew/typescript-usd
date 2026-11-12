// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executionTypeRegistry.cpp,
//  pxr/exec/vdf/executionTypeRegistry.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executionTypeRegistry.h and
// executionTypeRegistry.cpp.
//
// Manages low-level value type functionality used within execution. All
// types used as values in execution must be registered with Define
// (executionTypeRegistry.h:25-163). The value type T is a leading TfType
// argument (openexec-x1.md 4.1): `Define<T>(fallback)` is
// `Define(type, fallback)`, `Define<T, B>(fallback)` is
// `Define(type, base, fallback)`, `GetFallback<T>()` is `GetFallback(type)`,
// `CheckForRegistration<T>(msg)` is `CheckForRegistration(type, msg)`.
// The TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry) key is the string
// 'VdfExecutionTypeRegistry'. Locks are dropped (single-threaded).

import {
  TF_FATAL_ERROR, TF_VERIFY, TfRegistryManager, TfSingleton, Type as TfType,
} from 'typescript-usd/tf'
import { VdfOutputSpec } from './outputSpec.ts'
import { VdfIsEqualityComparable, Vdf_Equals } from './traits.ts'
import { VdfTypeDispatchTable } from './typeDispatchTable.ts'
import { VdfTypedVector } from './typedVector.ts'
import type { VdfVector } from './vector.ts'

/** The registry key of TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry). */
export const VdfExecutionTypeRegistryKey = 'VdfExecutionTypeRegistry'

/**
 * A very simple type-erased container used to hold fallback values
 * (executionTypeRegistry.h:166-201).
 */
class _Value {
  readonly #value: unknown

  constructor(fallback: unknown) {
    this.#value = fallback
  }

  /** Returns the held value; there is no checked Get (executionTypeRegistry.h:177-184). */
  UncheckedGet<T>(): T {
    return this.#value as T
  }

  /**
   * Compares values for types that define equality comparison; returns true
   * if not equality comparable (executionTypeRegistry.h:186-196).
   */
  Equals(rhs: unknown): boolean {
    if (VdfIsEqualityComparable(rhs)) {
      return Vdf_Equals(this.#value, rhs)
    }
    return true
  }
}

const _constructKey = Symbol('VdfExecutionTypeRegistry')
const _singleton = new TfSingleton<VdfExecutionTypeRegistry>(() => new VdfExecutionTypeRegistry(_constructKey))

/** VdfExecutionTypeRegistry (executionTypeRegistry.h:25-163). */
export class VdfExecutionTypeRegistry {
  // Map of (scalar) value types to their type-erased fallback values
  // (executionTypeRegistry.h:155-158).
  readonly _fallbackMap = new Map<TfType, _Value>()

  // Typed implementation of CreateEmptyVector (executionTypeRegistry.h:132-138).
  readonly _createEmptyVectorTable = new VdfTypeDispatchTable<[], VdfVector>(
    (type) => new VdfTypedVector(type))

  // Typed implementation of FillVector (executionTypeRegistry.h:140-146,
  // 263-279).
  readonly _fillVectorDispatchTable = new VdfTypeDispatchTable<[_Value, number, VdfVector], boolean>(
    (type, fallback, numElements, vector) => {
      const fallbackValue = fallback.UncheckedGet<unknown>()
      vector.resize(type, numElements)
      const accessor = vector.getReadWriteAccessor<unknown>(type)
      for (let i = 0; i < numElements; ++i) {
        accessor.Set(i, fallbackValue)
      }
      return true
    })

  // executionTypeRegistry.cpp:23-29
  constructor(key: symbol) {
    if (key !== _constructKey) {
      throw new Error('VdfExecutionTypeRegistry is a singleton; use GetInstance()')
    }
    _singleton.setInstanceConstructed(this)
    TfRegistryManager.GetInstance().subscribeTo(VdfExecutionTypeRegistryKey)
  }

  /** Returns the VdfExecutionTypeRegistry singleton instance (executionTypeRegistry.cpp:17-21). */
  static GetInstance(): VdfExecutionTypeRegistry {
    return _singleton.GetInstance()
  }

  /**
   * Registers `type` with execution's runtime type dispatch system, with
   * `fallback` as its fallback value (executionTypeRegistry.h:47-58,
   * 203-221). With `base`, `type` is defined with TfType as derived from it
   * if it is not defined yet (executionTypeRegistry.h:60-64, 223-241).
   */
  static define<T>(type: TfType, fallback: T): TfType
  static define<T>(type: TfType, base: TfType, fallback: T): TfType
  static define<T>(type: TfType, ...rest: [T] | [TfType, T]): TfType {
    const base = rest.length === 2 ? rest[0] : undefined
    const fallback = rest.length === 2 ? rest[1] : rest[0]

    // Define type with Tf if needed. Upstream defines an unknown C++ type
    // with TfType here; an unknown TfType names no type in TS, so it reaches
    // _InsertRegistration's fatal error.
    let scalarType = type
    if (!scalarType.isUnknown() &&
        !TF_VERIFY(scalarType.isDefined(), 'scalarType.GetTypeid() != typeid(void)',
          `Type '${scalarType.getTypeName()}' was declared but not defined`)) {
      scalarType = TfType.define(scalarType.getTypeName(), base ? [base] : undefined)
    }
    VdfExecutionTypeRegistry.GetInstance()._define(fallback, scalarType)
    return scalarType
  }

  /**
   * Returns the registered fallback value for `type`. It is a fatal error to
   * query types that are not registered (executionTypeRegistry.h:66-72,
   * 252-260).
   */
  getFallback<T>(type: TfType): T {
    return this._getFallback(type).UncheckedGet<T>()
  }

  /**
   * Checks if `type` is defined as an execution value type, issuing a fatal
   * error if not; returns it (executionTypeRegistry.h:74-98,
   * executionTypeRegistry.cpp:33-58). `type` unknown stands for a C++ type
   * that was never registered with TfType.
   */
  static checkForRegistration(type: TfType, additionalErrorMsg: string | null = null): TfType {
    // Because Define may also define types with TfType, ensure that
    // registration function subscription happens before the lookup.
    const self = VdfExecutionTypeRegistry.GetInstance()
    if (type.isUnknown()) {
      TF_FATAL_ERROR(`Type '${type.getTypeName()}' not registered with TfType. ` +
        `${additionalErrorMsg ?? ''}`)
    }
    if (!self._fallbackMap.has(type)) {
      TF_FATAL_ERROR(`No fallback value registered for "${type.getTypeName()}". ` +
        `${additionalErrorMsg ?? ''}`)
    }
    return type
  }

  /**
   * Create an empty VdfVector holding empty data of the given TfType. Note
   * this creates an empty vector, not a fallback-valued vector
   * (executionTypeRegistry.cpp:60-64).
   */
  static createEmptyVector(type: TfType): VdfVector {
    return VdfExecutionTypeRegistry.GetInstance()._createEmptyVectorTable.call(type)
  }

  /**
   * Fills `vector` with the fallback value registered for the given type
   * (executionTypeRegistry.cpp:66-74).
   */
  static fillVector(type: TfType, numElements: number, vector: VdfVector): void {
    const self = VdfExecutionTypeRegistry.GetInstance()
    const fallback = self._getFallback(type)
    self._fillVectorDispatchTable.call(type, fallback, numElements, vector)
  }

  // executionTypeRegistry.h:243-250
  _define(fallback: unknown, scalarType: TfType): void {
    // Use the presence of an entry in the fallback map to avoid redundant
    // registration with other maps in cases where multiple plugins register
    // the same type, which is allowed.
    const [registeredFallback, inserted] = this._insertRegistration(scalarType, new _Value(fallback))
    if (!inserted) {
      TF_VERIFY(
        registeredFallback.Equals(fallback),
        'registeredFallback.Equals(fallback)',
        `Type ${scalarType.getTypeName()} registered more than once with different fallback ` +
        'values.')
      return
    }

    VdfOutputSpec._registerType(scalarType)
    this._createEmptyVectorTable.registerType(scalarType)
    this._fillVectorDispatchTable.registerType(scalarType)
  }

  // executionTypeRegistry.cpp:76-89
  _insertRegistration(type: TfType, fallback: _Value): [_Value, boolean] {
    if (type.isUnknown()) {
      TF_FATAL_ERROR('Attempted to register fallback value with unknown type')
    }
    const existing = this._fallbackMap.get(type)
    if (existing) {
      return [existing, false]
    }
    this._fallbackMap.set(type, fallback)
    return [fallback, true]
  }

  // executionTypeRegistry.cpp:91-103
  _getFallback(type: TfType): _Value {
    const value = this._fallbackMap.get(type)
    if (!value) {
      TF_FATAL_ERROR(`No fallback value registered for "${type.getTypeName()}"`)
    }
    return value
  }
}
