// Ported from OpenUSD 26.11.1: pxr/base/vt/dictionary.cpp,
//  pxr/base/vt/dictionary.h, pxr/base/vt/array.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtDictionary and path/composition helpers — port of
// pxr/base/vt/dictionary.{h,cpp}. A Map preserves the upstream string-keyed
// container semantics; dictionary.cpp:106-119 copies every held VtValue, and
// a VtValue copy shares its held object until either side mutates it
// (value.ts).
//
// Copies are copy-on-write over the map: a copy shares its source's map (and
// a share count, as VtArray shares its storage, vt/array.h) until either side
// is accessed through a non-const operation, which copies the map with a
// VtValue copy of each entry, as the eager copy (dictionary.cpp:106-119)
// would have. TypeScript has no const overloads, so get(), find() and
// iteration, which hand out the entries' VtValues, count as non-const
// access; has(), size and the comparisons do not. A frozen dictionary
// (Object.freeze) is read-only: its mutating methods throw.

import { VtValue, _copyVtValue } from './value.ts'
import { Hash as TfHash } from 'typescript-usd/tf'
import { Vt_NotArray, Vt_ObjectEqual, Vt_SetTypeInfo } from './typeInfo.ts'

export class VtDictionary implements Iterable<[string, VtValue]> {
  #values: Map<string, VtValue>
  #shared: { count: number }

  constructor(entries?: Iterable<readonly [string, VtValue]> | VtDictionary) {
    if (entries instanceof VtDictionary) {
      this.#values = entries.#values
      this.#shared = entries.#shared
      this.#shared.count++
      return
    }
    this.#values = new Map()
    this.#shared = { count: 1 }
    if (entries) {
      for (const [key, value] of entries) {
        this.#values.set(key, _copyVtValue(value))
      }
    }
  }

  // Copy a shared map before handing out or changing its entries.
  #detach(): void {
    if (this.#shared.count === 1) return
    this.#shared.count--
    this.#shared = { count: 1 }
    const values = new Map<string, VtValue>()
    for (const [key, value] of this.#values) values.set(key, _copyVtValue(value))
    this.#values = values
  }
  #access(): Map<string, VtValue> {
    if (!Object.isFrozen(this)) this.#detach()
    return this.#values
  }
  #write(): Map<string, VtValue> {
    if (Object.isFrozen(this)) throw new TypeError('VtDictionary is read-only; copy it to edit')
    this.#detach()
    return this.#values
  }

  get size(): number { return this.#values.size }
  empty(): boolean { return this.#values.size === 0 }
  has(key: string): boolean { return this.#values.has(key) }
  get(key: string): VtValue | undefined { return this.#access().get(key) }
  set(key: string, value: VtValue): this {
    this.#write().set(key, _copyVtValue(value))
    return this
  }
  delete(key: string): boolean { return this.#write().delete(key) }
  clear(): void { this.#write().clear() }
  begin(): IterableIterator<[string, VtValue]> { return this[Symbol.iterator]() }
  end(): IterableIterator<[string, VtValue]> {
    return [][Symbol.iterator]() as IterableIterator<[string, VtValue]>
  }
  count(key: string): number { return this.has(key) ? 1 : 0 }
  /**
   * hash_value(VtDictionary) (dictionary.h:303-309): 0 when empty, otherwise
   * TfHash of the key-ordered map, each VtValue appending its GetHash().
   */
  hash_value(): bigint {
    return this.empty() ? 0n : TfHash(this.#access())
  }
  find(key: string): [string, VtValue] | undefined {
    const value = this.get(key)
    return value === undefined ? undefined : [key, value]
  }
  erase(key: string): boolean { return this.delete(key) }
  insert(entry: readonly [string, VtValue]): [string, boolean] {
    const [key, value] = entry
    if (this.has(key)) return [key, false]
    this.set(key, value)
    return [key, true]
  }
  try_emplace(key: string, value: VtValue): [string, boolean] {
    return this.insert([key, value])
  }
  insert_or_assign(key: string, value: VtValue): [string, boolean] {
    const inserted = !this.has(key)
    this.set(key, value)
    return [key, inserted]
  }
  swap(other: VtDictionary): void {
    if (Object.isFrozen(this) || Object.isFrozen(other)) {
      throw new TypeError('VtDictionary is read-only; copy it to edit')
    }
    const values = this.#values, shared = this.#shared
    this.#values = other.#values
    this.#shared = other.#shared
    other.#values = values
    other.#shared = shared
  }

  GetValueAtPath(path: string): VtValue | undefined {
    return VtGetValueAtPath(this, path)
  }
  SetValueAtPath(path: string, value: VtValue): void {
    VtSetValueAtPath(this, path, value)
  }
  EraseValueAtPath(path: string): boolean {
    return VtEraseValueAtPath(this, path)
  }
  [Symbol.iterator](): IterableIterator<[string, VtValue]> {
    return [...this.#access()].sort(([lhs], [rhs]) => lhs < rhs ? -1 : lhs > rhs ? 1 : 0)
      [Symbol.iterator]()
  }

  equals(other: VtDictionary): boolean {
    if (this.size !== other.size) return false
    for (const [key, value] of this) {
      const rhs = other.get(key)
      if (!rhs || !value.equals(rhs)) return false
    }
    return true
  }
}

const pathParts = (path: string): string[] =>
  path.split(':').filter(part => part.length > 0)

export function VtGetValueAtPath(
  dictionary: VtDictionary,
  path: string,
): VtValue | undefined {
  const parts = pathParts(path)
  let current = dictionary
  for (let index = 0; index < parts.length; index++) {
    const value = current.get(parts[index]!)
    if (!value) return undefined
    if (index === parts.length - 1) return value
    const nested = value.Get<unknown>()
    if (!(nested instanceof VtDictionary)) return undefined
    current = nested
  }
  return undefined
}

export function VtSetValueAtPath(
  dictionary: VtDictionary,
  path: string,
  value: VtValue,
): void {
  const parts = pathParts(path)
  if (parts.length === 0) return
  let current = dictionary
  for (const part of parts.slice(0, -1)) {
    const existing = current.get(part)
    const held = existing?.Get<unknown>()
    if (held instanceof VtDictionary) {
      current = held
    } else {
      const nested = new VtDictionary()
      current.set(part, VtValue.createDictionary(nested))
      current = current.get(part)!.Get<VtDictionary>()
    }
  }
  current.set(parts.at(-1)!, value)
}

export function VtEraseValueAtPath(dictionary: VtDictionary, path: string): boolean {
  const parts = pathParts(path)
  if (parts.length === 0) return false

  const erase = (current: VtDictionary, index: number): boolean => {
    const part = parts[index]!
    if (index === parts.length - 1) return current.delete(part)
    const nested = current.get(part)?.Get<unknown>()
    if (!(nested instanceof VtDictionary)) return false
    const erased = erase(nested, index + 1)
    if (nested.empty()) current.delete(part)
    return erased
  }
  return erase(dictionary, 0)
}

/** Strong opinions in `strong` replace weak values, non-recursively. */
export function VtDictionaryOver(
  strong: VtDictionary,
  weak: VtDictionary,
): VtDictionary {
  const result = new VtDictionary(weak)
  for (const [key, value] of strong) result.set(key, value)
  return result
}

/** Strong opinions replace scalars and recursively compose nested dictionaries. */
export function VtDictionaryOverRecursive(
  strong: VtDictionary,
  weak: VtDictionary,
): VtDictionary {
  const result = new VtDictionary(weak)
  for (const [key, strongValue] of strong) {
    const weakValue = result.get(key)
    const strongNested = strongValue.Get<unknown>()
    const weakNested = weakValue?.Get<unknown>()
    result.set(key,
      strongNested instanceof VtDictionary && weakNested instanceof VtDictionary
        ? VtValue.createDictionary(VtDictionaryOverRecursive(strongNested, weakNested))
        : strongValue)
  }
  return result
}

// OpenUSD v26.08 pxr/base/vt/dictionary.h:426-566.
export const VtGetEmptyDictionary = (): VtDictionary => new VtDictionary()
export const VtDictionaryGet = (
  dictionary: VtDictionary, key: string,
): VtValue | undefined => dictionary.get(key)
export const VtDictionaryIsHolding = (
  dictionary: VtDictionary,
  key: string,
  type: import('typescript-usd/tf').Type,
): boolean => dictionary.get(key)?.IsHolding(type) ?? false

/** OpenUSD v26.11.1 pxr/base/vt/dictionary.h:684-688 dictionary hash functor. */
Vt_SetTypeInfo(VtDictionary.prototype, {
  kind: 'dictionary',
  copy: value => new VtDictionary(value as VtDictionary),
  equal: Vt_ObjectEqual,
  ...Vt_NotArray,
})

export class VtDictionaryHash {
  call(dictionary: VtDictionary): bigint {
    return dictionary.hash_value()
  }
}

/** OpenUSD v26.08 pxr/base/vt/dictionary.h:531-545 default-value syntax. */
export class Vt_DefaultHolder<T> {
  constructor(readonly val: T) {}
}
export class Vt_DefaultGenerator {
  hold<T>(value: T): Vt_DefaultHolder<T> { return new Vt_DefaultHolder(value) }
}
export const VtDefault = new Vt_DefaultGenerator()
