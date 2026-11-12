// Ported from OpenUSD 26.11.1: pxr/exec/vdf/typeDispatchTable.cpp,
//  pxr/exec/vdf/typeDispatchTable.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/typeDispatchTable.h and
// typeDispatchTable.cpp.
//
// VdfTypeDispatchTable<Fn> dispatches calls to template instantiations
// `Fn<T>::Call(args...)` based on a TfType determined at runtime
// (typeDispatchTable.h:56-150). In TS the class template Fn is one function
// whose leading parameter is the TfType standing in for T (openexec-x1.md
// 4.1): `Fn<T>::Call(args...)` is `fn(T, ...args)`. RegisterType<T>() is
// RegisterType(type); Call<R>(key, args...) is Call(key, ...args). The map is
// keyed by the TfType object; the reader/writer lock is dropped
// (single-threaded).

import { TF_FATAL_ERROR, TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'

/** Non-template-dependent part of the dispatch table (typeDispatchTable.h:22-54). */
export class Vdf_TypeDispatchTableBase {
  // The type dispatch map (typeDispatchTable.h:46-50).
  readonly _map = new Map<TfType, unknown>()

  /** Returns true if a function has been registered for type `t` (typeDispatchTable.cpp:23-28). */
  isTypeRegistered(t: TfType): boolean {
    return this._map.has(t)
  }

  /**
   * Register `f` as the implementation to dispatch to for type `t`
   * (typeDispatchTable.cpp:30-46). Registering a key twice keeps the first
   * function, as robin_map::insert does.
   */
  _registerType(t: TfType, f: unknown): boolean {
    if (TF_VERIFY(!t.isUnknown(), '!t.IsUnknown()', `Unknown TfType: ${t.getTypeName()}`)) {
      if (this._map.has(t)) {
        return false
      }
      this._map.set(t, f)
      return true
    }
    return false
  }

  /**
   * Find a registered function for type `t`. Issues a fatal error if no
   * function has been registered (typeDispatchTable.cpp:48-60).
   */
  _findOrFatalError(t: TfType): unknown {
    const f = this._map.get(t)
    if (f === undefined) {
      // Abort the program if not found.
      TF_FATAL_ERROR('Unsupported type: ' + t.getTypeName())
    }
    return f
  }
}

/**
 * Dispatches calls to `fn(T, ...args)` based on a TfType that is determined
 * at runtime (typeDispatchTable.h:56-150).
 */
export class VdfTypeDispatchTable<Args extends unknown[], R> extends Vdf_TypeDispatchTableBase {
  readonly #fn: (type: TfType, ...args: Args) => R

  /** `fn` is the class template Fn: `fn(T, ...args)` is `Fn<T>::Call(args...)`. */
  constructor(fn: (type: TfType, ...args: Args) => R) {
    super()
    this.#fn = fn
  }

  /**
   * Register an additional type with the type dispatch table. Returns true
   * if `type` has been added and false if it was registered already
   * (typeDispatchTable.h:128-139).
   */
  registerType(type: TfType): boolean {
    const fn = this.#fn
    return this._registerType(type, (...args: Args) => fn(type, ...args))
  }

  /**
   * Invoke the function registered for `key` type. Calling this with an
   * unregistered type is a fatal error (typeDispatchTable.h:141-149).
   */
  call(key: TfType, ...args: Args): R {
    return (this._findOrFatalError(key) as (...a: Args) => R)(...args)
  }
}
