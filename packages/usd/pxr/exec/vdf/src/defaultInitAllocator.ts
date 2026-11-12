// Ported from OpenUSD 26.11.1: pxr/exec/vdf/defaultInitAllocator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/defaultInitAllocator.h.
//
// Vdf_DefaultInitAllocator turns value initialization into default
// initialization for containers that are resized and then filled
// (defaultInitAllocator.h:18-30). The allocator mechanics (rebind, placement
// new into reused memory) have no TS counterpart; what remains observable is
// the element a default-initializing construct() yields, keyed by TfType
// (openexec-x1.md 4.1 "Value-type template parameters").
//
// Default initialization by type:
// - std::string and TfToken have default constructors: the empty string.
// - Arithmetic types are left indeterminate by C++ default initialization;
//   TS yields 0 (false for bool), a value such an element may hold, so that
//   arithmetic on a not-yet-written element stays a number.
// - The Gf vector, matrix and quaternion types default-initialize to
//   indeterminate values (`= default` constructors); TS yields `undefined`.
// - Any other type yields the value of the factory registered with
//   Vdf_DefaultInitAllocator.RegisterDefaultConstructor, the TS stand-in for
//   the type's default constructor, or `undefined` (indeterminate) if the
//   type registered none.

import type { Type as TfType } from 'typescript-usd/tf'

const _arithmetic = new Set([
  'char', 'uchar', 'short', 'ushort', 'int', 'uint', 'int64', 'uint64',
  'long', 'ulong', 'half', 'float', 'double',
])

const _defaultConstructors = new Map<TfType, () => unknown>()

/** The default-initializing allocator of elements of type T. */
export class Vdf_DefaultInitAllocator<T> {
  readonly #type: TfType
  readonly #factory: () => T

  constructor(type: TfType) {
    this.#type = type
    this.#factory = Vdf_DefaultInitAllocator.#factoryFor<T>(type)
  }

  /** The element type T. */
  getType(): TfType {
    return this.#type
  }

  /**
   * construct(U*) default initializes (defaultInitAllocator.h:43-50);
   * construct(U*, args) forwards to the constructor, which for a value is the
   * value itself (defaultInitAllocator.h:52-62).
   */
  construct(...args: [] | [T]): T {
    return args.length === 0 ? this.#factory() : args[0]
  }

  /**
   * Registers `factory` as the default constructor of `type`, which
   * construct() calls for each default-initialized element.
   */
  static registerDefaultConstructor(type: TfType, factory: () => unknown): void {
    _defaultConstructors.set(type, factory)
  }

  static #factoryFor<T>(type: TfType): () => T {
    const registered = _defaultConstructors.get(type)
    if (registered) {
      return registered as () => T
    }
    const name = type.getTypeName()
    if (name === 'bool') {
      return () => false as T
    }
    if (_arithmetic.has(name)) {
      return () => 0 as T
    }
    if (name === 'string' || name === 'token') {
      return () => '' as T
    }
    return () => undefined as T
  }
}

/** `new TYPE[n]`: an array of n default-initialized elements of `type`. */
export function Vdf_NewTypedArray<T>(type: TfType, n: number): T[] {
  const allocator = new Vdf_DefaultInitAllocator<T>(type)
  const array = new Array<T>(n)
  for (let i = 0; i < n; ++i) {
    array[i] = allocator.construct()
  }
  return array
}
