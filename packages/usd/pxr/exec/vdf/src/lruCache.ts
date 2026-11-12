// Ported from OpenUSD 26.11.1: pxr/exec/vdf/lruCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/lruCache.h.
//
// A simple cache with a fixed capacity and a least-recently-used eviction
// policy (lruCache.h:16-75). Mapping (openexec-x1.md 4.1): the Hash functor
// is a `hash` function, key equality is `equals` (default ===); the
// `Value **value` out-parameter becomes the second element of the returned
// tuple. Values are default constructed with `makeValue`, the TS stand-in
// for Value's default constructor.

interface _Entry<Key, Value> {
  hash: number
  key: Key
  value: Value
}

/** VdfLRUCache (lruCache.h:16-75). */
export class VdfLRUCache<Key, Value> {
  // The sorted list of cache entries; the most recently used entry is
  // always at the head of the list (lruCache.h:66-69).
  readonly _list: _Entry<Key, Value>[] = []
  // The fixed cache capacity (lruCache.h:71-72).
  readonly _capacity: number
  readonly #hash: (key: Key) => number
  readonly #equals: (a: Key, b: Key) => boolean
  readonly #makeValue: () => Value

  /** Constructs a new cache with a fixed `capacity` (lruCache.h:28-31). */
  constructor(
    capacity: number,
    hash: (key: Key) => number,
    makeValue: () => Value,
    equals: (a: Key, b: Key) => boolean = (a, b) => a === b) {
    this._capacity = capacity
    this.#hash = hash
    this.#makeValue = makeValue
    this.#equals = equals
  }

  /**
   * Performs a lookup into the cache (lruCache.h:33-45, 79-121). Returns
   * [found, value]: if no entry for `key` exists, a new entry is constructed
   * while below capacity, or the least recently used entry is repurposed
   * (and the client is responsible for resetting its value).
   */
  lookup(key: Key): [boolean, Value] {
    // Hash the key. We will use this hash as an early out for equality.
    const hash = this.#hash(key)

    // Iterate over all the recently used entries.
    for (let i = 0; i < this._list.length; ++i) {
      const it = this._list[i]!
      if (it.hash === hash && this.#equals(it.key, key)) {
        // Move the entry to the head of the list.
        if (i !== 0) {
          this._list.splice(i, 1)
          this._list.unshift(it)
        }
        return [true, it.value]
      }
    }

    if (this._list.length < this._capacity) {
      // Below capacity: insert a new entry.
      this._list.unshift({ hash, key, value: this.#makeValue() })
    } else {
      // At capacity: reuse the last entry by first moving it to the front.
      const last = this._list.pop()!
      last.hash = hash
      last.key = key
      this._list.unshift(last)
    }
    return [false, this._list[0]!.value]
  }

  /** Removes all entries from the cache (lruCache.h:47-50, 123-128). */
  clear(): void {
    this._list.length = 0
  }
}
