// Ported from OpenUSD 26.11.1: pxr/base/tf/type.cpp, pxr/base/tf/type.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfType — faithful port of OpenUSD pxr/base/tf/type.{h,cpp}.
//
// A run-time type-identity + inheritance registry. Upstream a TfType is keyed by
// C++ typeid; TS has no RTTI, so the identity here is the registered TYPE NAME,
// and TfType instances are interned (one object per name) so `===` is type
// identity. The observable model is faithful: a single root type all types
// descend from, an unknown type, multiple-inheritance bases, and the IsA /
// ancestor / derived queries the type system is built on.
//
// dropped — typeid-based Find<T>()/FindByTypeid and pointer up/down-casting
// (CastToAncestor/CastFromAncestor),
// plus the Python bindings and TfTypeWasDeclaredNotice. Types are identified by
// name (Define/FindByName) instead of typeid. Grade: idiomatic — the registry,
// inheritance graph, and queries match; only the C++-pointer/RTTI surface is
// absent. Manufacturing keeps upstream's SetFactory/GetFactory contract with
// any object as the factory (FactoryBase is a C++ vtable anchor).

import { TfDiagnosticMgr, TfDiagnosticType, TfError } from './diagnostic.ts'

/** TfType::FactoryBase (type.h:55-60): any object a type manufactures with. */
export type TfTypeFactoryBase = object

export class TfType {
  static #registry = new Map<string, TfType>()
  static #root = new TfType('TfRoot')
  static #unknown = new TfType('')

  readonly #typeName: string
  #defined = false
  #bases: TfType[] = []
  #derived: TfType[] = []
  // Alias name -> derived type, scoped to THIS type (the base). Drives
  // FindDerivedByName / GetAliases. Mirrors TfType's per-base alias table.
  #aliases = new Map<string, TfType>()
  #factory: TfTypeFactoryBase | undefined

  private constructor(typeName: string) {
    this.#typeName = typeName
  }

  // ---- The two singletons ---------------------------------------------------

  /** The unknown type. `TfType()` in C++; IsUnknown() is true. */
  static getUnknownType(): TfType {
    return TfType.#unknown
  }

  /** The root type — the universal ancestor of every declared type. */
  static getRoot(): TfType {
    return TfType.#root
  }

  // ---- Lookup ---------------------------------------------------------------

  /** Find a type by its registered name, or the unknown type if none. */
  static findByName(name: string): TfType {
    return TfType.#root.#aliases.get(name) ??
      TfType.#registry.get(name) ??
      TfType.#unknown
  }

  /**
   * Find a type derived from this one by name or alias (scoped to this type),
   * or the unknown type. Mirrors TfType::FindDerivedByName.
   */
  findDerivedByName(name: string): TfType {
    const aliased = this.#aliases.get(name)
    if (aliased) return aliased
    const byName = TfType.#registry.get(name)
    return byName && byName.isA(this) ? byName : TfType.#unknown
  }

  // ---- Declaration / definition ---------------------------------------------

  /**
   * Declare a type by name (get-or-create), optionally (re)setting its bases.
   * A declared-but-not-defined type still participates in the graph.
   * Mirrors TfType::Declare.
   */
  static declare(name: string, bases?: readonly TfType[]): TfType {
    let t = TfType.#registry.get(name)
    if (!t) {
      t = new TfType(name)
      TfType.#registry.set(name, t)
      t._setBases([]) // defaults to rooting under GetRoot()
    }
    if (bases !== undefined) t._setBases(bases)
    return t
  }

  /**
   * Define a (concrete) type with the given base types. Mirrors
   * TfType::Define<T, Bases<...>>(). With no bases the type roots under
   * GetRoot().
   */
  static define(name: string, bases?: readonly TfType[]): TfType {
    const t = TfType.declare(name, bases ?? [])
    t.#defined = true
    return t
  }

  /**
   * Register `name` for this derived type under `base`.
   * Mirrors `derived.AddAlias(base, name)` in type.h:497-506.
   */
  addAlias(base: TfType, name: string): void {
    const existingType = TfType.#registry.get(name)
    if (existingType?.isA(base)) {
      throw new Error(`type alias '${name}' collides beneath ${base.getTypeName()}`)
    }
    const existingAlias = base.#aliases.get(name)
    if (existingAlias && existingAlias !== this) {
      throw new Error(`type alias '${name}' is already registered`)
    }
    base.#aliases.set(name, this)
  }

  /** The alias names registered for `derived` under this type. */
  getAliases(derived: TfType): string[] {
    const out: string[] = []
    for (const [name, t] of this.#aliases) if (t === derived) out.push(name)
    return out
  }

  // ---- Instantiation / manufacturing ---------------------------------------

  /** Sets the factory for this type; it cannot be changed once set.
   *  Mirrors TfType::SetFactory (type.cpp:1078-1096). */
  setFactory(factory: TfTypeFactoryBase): void {
    if (this.isUnknown() || this.isRoot()) {
      postCodingError(`Cannot set factory of ${this.#typeName}\n`)
      return
    }
    if (this.#factory) {
      postCodingError(`Cannot change the factory of ${this.#typeName}\n`)
      return
    }
    this.#factory = factory
  }

  /** The factory for this type, or undefined. Mirrors TfType::GetFactory<T>
   *  (type.h:620-627; _GetFactory, type.cpp:1098-1110); the caller narrows
   *  the factory's type, as upstream's dynamic_cast. */
  getFactory<T extends TfTypeFactoryBase = TfTypeFactoryBase>(): T | undefined {
    if (this.isUnknown() || this.isRoot()) {
      postCodingError(`Cannot manufacture type ${this.#typeName}`)
      return undefined
    }
    return this.#factory as T | undefined
  }

  // ---- Identity / predicates ------------------------------------------------

  getTypeName(): string {
    return this.#typeName
  }

  isUnknown(): boolean {
    return this === TfType.#unknown
  }

  isRoot(): boolean {
    return this === TfType.#root
  }

  /** Whether this type has been Define()d (vs merely Declare()d). */
  isDefined(): boolean {
    return this.#defined
  }

  /**
   * True iff this type is `queryType` or descends from it. The unknown type
   * IsA nothing and nothing IsA it. Every non-unknown type IsA the root and
   * IsA itself. Mirrors TfType::IsA.
   */
  isA(queryType: TfType): boolean {
    if (this.isUnknown() || queryType.isUnknown()) return false
    // Early outs and an allocation-free walk, as in TfType::_IsAImplNoLock
    // (pxr/base/tf/type.cpp:753-790).
    if (this === queryType || queryType === TfType.#root) return true
    if (queryType.#derived.length === 0) return false
    return TfType.#isADescendant(this, queryType)
  }

  static #isADescendant(type: TfType, queryType: TfType): boolean {
    for (const base of type.#bases) {
      if (base === queryType || TfType.#isADescendant(base, queryType)) return true
    }
    return false
  }

  // ---- Graph queries --------------------------------------------------------

  /**
   * Direct base types. Root/unknown have none; an otherwise-baseless declared
   * type reports the root as its base. Mirrors TfType::GetBaseTypes.
   */
  getBaseTypes(): TfType[] {
    return [...this.#bases]
  }

  /** Types that directly derive from this one. */
  getDirectlyDerivedTypes(): TfType[] {
    return [...this.#derived]
  }

  /**
   * Build the list of all ancestor types inherited by this type, INCLUDING
   * this type itself as the first element, in "C3" resolution order (the MRO
   * algorithm new-style Python classes use). C3 is more than a depth-first
   * walk: it yields a monotonic linearization that stays consistent under
   * multiple inheritance — for a diamond it orders an intermediate base
   * before the shared ancestor it derives from, which a plain DFS does not.
   * Mirrors TfType::GetAllAncestorTypes (type.h/type.cpp). The unknown type
   * has no ancestors (C++ raises a coding error and returns; we return []).
   */
  getAllAncestorTypes(): TfType[] {
    const result: TfType[] = []
    if (this.isUnknown()) return result
    this._appendAncestors(result)
    return result
  }

  /** All types that transitively derive from this one (excluding self). */
  getAllDerivedTypes(): TfType[] {
    const out = new Set<TfType>()
    const stack = [...this.#derived]
    while (stack.length) {
      const t = stack.pop()!
      if (out.has(t)) continue
      out.add(t)
      stack.push(...t.#derived)
    }
    return [...out]
  }

  // ---- internals ------------------------------------------------------------

  /**
   * Append this type's C3 linearization (self first, then ancestors) to
   * `result`. Mirrors the recursive body of TfType::GetAllAncestorTypes.
   */
  private _appendAncestors(result: TfType[]): void {
    const baseTypes = this.#bases
    // Simple case: single (or no) inheritance — just chain into the base.
    if (baseTypes.length <= 1) {
      result.push(this)
      if (baseTypes.length === 1) baseTypes[0]!._appendAncestors(result)
      return
    }
    // Multiple inheritance: resolve final order with the C3 algorithm. The
    // input sequences are: [this], the direct bases in order, then each
    // base's own linearization.
    const seqs: TfType[][] = [[this], [...baseTypes]]
    for (const b of baseTypes) {
      const baseSeq: TfType[] = []
      b._appendAncestors(baseSeq)
      seqs.push(baseSeq)
    }
    // type.cpp's _MergeAncestors posts a coding error when no C3 candidate
    // exists. JS has no Tf diagnostic transport, so surface that observable
    // failure as an exception rather than silently returning a partial MRO.
    if (!TfType._mergeAncestors(seqs, result)) {
      throw new Error(`inconsistent inheritance hierarchy for ${this.#typeName}`)
    }
  }

  /**
   * Merge the input sequences into `result` by C3 linearization. Returns true
   * on success, false if the hierarchy is inconsistent (no admissible
   * candidate remains while inputs are non-empty). Faithful port of the
   * file-static _MergeAncestors helper in type.cpp.
   */
  private static _mergeAncestors(seqs: TfType[][], result: TfType[]): boolean {
    for (;;) {
      // Find a candidate: the head of some non-empty sequence (tried in
      // order) that does NOT occur in the tail of any sequence.
      let cand: TfType | undefined
      let anyLeft = false
      for (const candSeq of seqs) {
        if (candSeq.length === 0) continue
        anyLeft = true
        const head = candSeq[0]!
        let inTail = false
        for (const checkSeq of seqs) {
          if (checkSeq.length <= 1) continue
          if (checkSeq.indexOf(head, 1) !== -1) {
            inTail = true
            break
          }
        }
        if (!inTail) {
          cand = head
          break
        }
      }

      if (cand === undefined) {
        // No candidate: success iff we consumed every input sequence.
        return !anyLeft
      }

      result.push(cand)
      // Drop the candidate from the head of every sequence it leads.
      for (const seq of seqs) {
        if (seq.length && seq[0] === cand) seq.shift()
      }
    }
  }

  private _setBases(bases: readonly TfType[]): void {
    // Unlink from current bases' derived lists.
    for (const b of this.#bases) {
      const i = b.#derived.indexOf(this)
      if (i >= 0) b.#derived.splice(i, 1)
    }
    // Root/unknown never re-base.
    if (this === TfType.#root || this === TfType.#unknown) {
      this.#bases = []
      return
    }
    const effective = bases.length ? [...bases] : [TfType.#root]
    this.#bases = effective
    for (const b of effective) {
      if (!b.#derived.includes(this)) b.#derived.push(this)
    }
  }
}

function postCodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}
