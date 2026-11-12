// Ported from OpenUSD 26.11.1: pxr/base/tf/tf.cpp, pxr/base/tf/tf.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TypeScript representations of public container spellings used by other USD
// modules. OpenUSD v26.08 pxr/base/tf/{smallVector,denseHashMap,hashmap,
// hashset,delegatedCountPtr,refBase}.h.

export type TfSmallVector<T> = T[]
export type TfDenseHashMap<K, V> = Map<K, V>
export type TfHashMap<K, V> = Map<K, V>
export type TfHashMultiMap<K, V> = Map<K, V[]>
export type TfHashSet<T> = Set<T>
export type TfHashMultiSet<T> = Map<T, number>

export class TfRefBase {
  #count = 0
  addRef(): void { this.#count++ }
  removeRef(): void { if (this.#count > 0) this.#count-- }
  getCurrentCount(): number { return this.#count }
  isUnique(): boolean { return this.#count === 1 }
}

export class TfRefPtr<T extends object> {
  constructor(private value?: T) {}
  Get(): T | undefined { return this.value }
  Reset(value?: T): void { this.value = value }
  isNull(): boolean { return this.value === undefined }
}

export class TfWeakPtr<T extends object> {
  readonly #ref?: WeakRef<T>
  constructor(value?: T) { if (value) this.#ref = new WeakRef(value) }
  Get(): T | undefined { return this.#ref?.deref() }
  isExpired(): boolean { return this.Get() === undefined }
}

export class TfDelegatedCountPtr<T extends object> extends TfRefPtr<T> {}
