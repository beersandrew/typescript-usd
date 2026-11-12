// Ported from OpenUSD 26.11.1: pxr/exec/ef/vectorKey.cpp,
//  pxr/exec/ef/vectorKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/vectorKey.h and
// pxr/exec/ef/vectorKey.cpp.
//
// Upstream stores Ef_VectorKey::StoredType (a shared_ptr) as the key of a
// TfHashMap that hashes with CreateHash() and compares with IsEqual(). A JS
// Map cannot hash by value, so maps keyed by vector keys are keyed by the
// canonical string GetKey() (openexec-x1.md 4.1 "Pointers"), and keep the
// Ef_VectorKey beside the mapped value. Two keys have equal GetKey() exactly
// when IsEqual() is true.

import { Hash as TfHash, TF_CODING_ERROR, Type as TfType } from 'typescript-usd/tf'

import { VdfVector } from 'typescript-usd/vdf'
import { EfTime, EfTimeType } from './time.ts'

/**
 * Canonical element key functions for the value types T that an
 * Ef_TypedVectorKey<T> may wrap. Upstream requires T to provide operator==
 * and TfHash (vectorKey.h:143-184); here T must have a canonical key, so that
 * equal elements have equal keys. Builtin number, string, boolean and bigint
 * values have one; other types register theirs with
 * Ef_VectorKeyRegisterElementKey.
 */
const _elementKeyFunctions = new Map<TfType, (value: unknown) => string>()

/** Registers the canonical element key function for values of `type`. */
export function Ef_VectorKeyRegisterElementKey<T>(
  type: TfType,
  keyFunction: (value: T) => string,
): void {
  _elementKeyFunctions.set(type, keyFunction as (value: unknown) => string)
}

// EfTime is the key type of the page caches that exec builds
// (EfPageCacheStorage::New<EfTime>).
Ef_VectorKeyRegisterElementKey<EfTime>(EfTimeType, (time) => time.getKey())

function _ElementKey(type: TfType, value: unknown): string {
  const keyFunction = _elementKeyFunctions.get(type)
  if (keyFunction) {
    return keyFunction(value)
  }
  switch (typeof value) {
    case 'number':
      // operator== on numbers: -0 equals 0.
      return value === 0 ? 'n0' : `n${value}`
    case 'string':
      return `s${value}`
    case 'boolean':
      return value ? 'b1' : 'b0'
    case 'bigint':
      return `i${value}`
    default:
      break
  }
  TF_CODING_ERROR(
    `Ef_TypedVectorKey<${type.getTypeName()}>: no canonical key for this ` +
    'element type (vectorKey.h:143-184 require operator== and TfHash)')
  throw new Error(`Ef_TypedVectorKey: no canonical key for ${type.getTypeName()}`)
}

/**
 * Ef_VectorKey (vectorKey.h:35-113): wraps a VdfVector, adding equality
 * comparison and hashing. This is an abstract base class.
 */
export abstract class Ef_VectorKey {
  // The wrapped VdfVector.
  protected readonly _value: VdfVector

  // Constructor (vectorKey.h:106-108). The vector is copied.
  protected constructor(value: VdfVector) {
    this._value = new VdfVector(value)
  }

  /** Returns the wrapped VdfVector (vectorKey.h:55-57). */
  GetValue(): VdfVector {
    return this._value
  }

  /** Generates a hash from the VdfVector (vectorKey.h:63). */
  abstract createHash(): number

  /** Equality compares this Ef_VectorKey with another one (vectorKey.h:69). */
  abstract isEqual(rhs: Ef_VectorKey): boolean

  /**
   * The canonical key: equal for two vector keys exactly when IsEqual() is
   * true. Maps keyed by Ef_VectorKey (Ef_VectorKey::Map) use it.
   */
  abstract getKey(): string

  /** operator== (vectorKey.h:73-75). */
  Equals(rhs: Ef_VectorKey): boolean {
    return this.isEqual(rhs)
  }

  /** operator!= (vectorKey.h:77-79). */
  notEquals(rhs: Ef_VectorKey): boolean {
    return !this.Equals(rhs)
  }
}

export declare namespace Ef_VectorKey {
  /** The type which must be used to store Ef_VectorKeys (vectorKey.h:41). */
  type StoredType = Ef_VectorKey
}

/**
 * Ef_VectorKey::Map<T>::Type (vectorKey.h:98-102): a map from vector key to
 * T. Keyed by Ef_VectorKey.GetKey(); each entry keeps its key.
 */
export type Ef_VectorKeyMap<T> = Map<string, { key: Ef_VectorKey.StoredType, value: T }>

/**
 * Ef_TypedVectorKey<T> (vectorKey.h:124-186): implements hashing and equality
 * for wrapped VdfVectors holding values of type T. The template argument T is
 * the runtime `type` (openexec-x1.md 4.1 "Value-type template parameters").
 */
export class Ef_TypedVectorKey<T> extends Ef_VectorKey {
  private readonly _type: TfType
  private _key: string | undefined

  /** Constructor (vectorKey.h:131-133). */
  constructor(type: TfType, value: VdfVector) {
    super(value)
    this._type = type
  }

  /**
   * CreateHash (vectorKey.h:143-150). Upstream combines the number of values
   * with TfHash of each value; here the hash is derived from the canonical
   * key, which identifies the same values.
   */
  createHash(): number {
    return Number(TfHash(this.getKey()) & 0xffffffffn)
  }

  /**
   * IsEqual (vectorKey.h:158-184). Keys holding different types T are
   * unequal by design, as are vectors of different sizes.
   */
  isEqual(rhs: Ef_VectorKey): boolean {
    if (rhs instanceof Ef_TypedVectorKey && rhs._type === this._type) {
      // Get the accessor to this vector, and to the right-hand-side vector.
      const a = this._value.getReadAccessor<T>(this._type)
      const rhsA = rhs._value.getReadAccessor<T>(this._type)

      // Compare each stored element. If two vectors do not hold the same
      // number of elements, they are considered not equal.
      if (a.getNumValues() === rhsA.getNumValues()) {
        for (let i = 0; i < a.getNumValues(); ++i) {
          if (_ElementKey(this._type, a.Get(i)) !==
              _ElementKey(this._type, rhsA.Get(i))) {
            return false
          }
        }
        return true
      }
    }

    // The two Ef_VectorKeys do not hold the same type T or their sizes do
    // not match, so we consider them unequal.
    return false
  }

  /** The canonical key: the type name, the size and each element's key. */
  getKey(): string {
    if (this._key === undefined) {
      const a = this._value.getReadAccessor<T>(this._type)
      const parts: string[] = [this._type.getTypeName(), String(a.getNumValues())]
      for (let i = 0; i < a.getNumValues(); ++i) {
        parts.push(_ElementKey(this._type, a.Get(i)))
      }
      // The wrapped vector is a private copy that never changes, so the key
      // can be computed once.
      this._key = parts.map((p) => `${p.length}:${p}`).join('')
    }
    return this._key
  }
}
