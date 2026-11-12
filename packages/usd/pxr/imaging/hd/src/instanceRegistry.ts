// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instanceRegistry.cpp,
//  pxr/imaging/hd/instanceRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instanceRegistry.{h,cpp} (OpenUSD 26.11.1).
//
// HdInstance / HdInstanceRegistry: sharing and deduplication of data by a
// computed key. A registered entry holds a value; GarbageCollect removes the
// entries no one else references.
//
// Divergences:
// - Single-threaded: no registry mutex/lock is held by an HdInstance.
// - Keys are any JS map key (`number | bigint | string`); upstream's are
//   uint64 hashes.
// - PLATFORM-DIVERGENCE(hd-instance-use-count): _IsUnique tests
//   `shared_ptr::use_count() == 1`, which JS cannot observe. Values with an
//   explicit reference count (`_retain()`, `release()`, `_useCount()`: the
//   HdBufferArrayRange scheme, hd/src/bufferArrayRange.ts, and the Storm
//   topologies and vertex adjacency builders that follow it) count the
//   registry as one holder: an entry's holder retains its value (the
//   ValueHolder's shared_ptr copy, instanceRegistry.h:91-94) and releases it
//   when the entry is replaced, erased by GarbageCollect or invalidated, and
//   _IsUnique is `_useCount() === 1`. Other values (texture objects, shader
//   code) count only the holders besides the registry and are unique when
//   their `_expired` flag is set; values with neither are never collected.
// - The GarbageCollect callback receives the value itself (upstream passes
//   value.get()).

export type HdInstanceKeyType = number | bigint | string

/** instanceRegistry.h:41-49 ValueHolder */
export class HdInstanceValueHolder<VALUE> {
  value: VALUE
  recycleCounter = 0
  constructor(value: VALUE) {
    this.value = value
  }
  resetRecycleCounter(): void {
    this.recycleCounter = 0
  }
}

type _Dictionary<VALUE> = Map<HdInstanceKeyType, HdInstanceValueHolder<VALUE>>

interface _Counted { _retain(): unknown, release(): void, _useCount(): number }
function _Counted(value: unknown): _Counted | null {
  return value !== null && typeof value === 'object' &&
    typeof (value as Partial<_Counted>)._useCount === 'function' ? value as _Counted : null
}
function _Retain(value: unknown): void { _Counted(value)?._retain() }
function _Release(value: unknown): void { _Counted(value)?.release() }

function _IsSet(value: unknown): boolean {
  // `bool(shared_ptr)`
  return value !== null && value !== undefined
}

/** instanceRegistry.h:31-112 */
export class HdInstance<VALUE> {
  private readonly _key: HdInstanceKeyType
  private _value: VALUE | null
  private readonly _container: _Dictionary<VALUE | null> | null
  private readonly _isFirstInstance: boolean

  /** instanceRegistry.h:61-82 */
  constructor(key: HdInstanceKeyType, value: VALUE | null = null,
    container: _Dictionary<VALUE | null> | null = null) {
    this._key = key
    this._value = value
    this._container = container
    this._isFirstInstance = !_IsSet(this._value)
  }

  /** instanceRegistry.h:85 */
  getKey(): HdInstanceKeyType { return this._key }

  /** instanceRegistry.h:88 */
  GetValue(): VALUE | null { return this._value }

  /** instanceRegistry.h:91-94 */
  setValue(value: VALUE): void {
    if (this._container) {
      // The ValueHolder copies the shared_ptr; the holder it replaces drops
      // its copy (PLATFORM-DIVERGENCE(hd-instance-use-count)).
      const old = this._container.get(this._key)?.value
      _Retain(value)
      this._container.set(this._key, new HdInstanceValueHolder<VALUE | null>(value))
      _Release(old)
    }
    this._value = value
  }

  /** instanceRegistry.h:97-99 */
  isFirstInstance(): boolean {
    return this._isFirstInstance
  }
}

/** instanceRegistry.h:118-169 */
export class HdInstanceRegistry<VALUE> {
  private readonly _dictionary: _Dictionary<VALUE | null> = new Map()

  /** instanceRegistry.h:173-193 */
  GetInstance(key: HdInstanceKeyType): HdInstance<VALUE> {
    let holder = this._dictionary.get(key)
    if (!holder) {
      // not found. create new one
      holder = new HdInstanceValueHolder<VALUE | null>(null)
      this._dictionary.set(key, holder)
    }
    holder.resetRecycleCounter()
    return new HdInstance<VALUE>(key, holder.value, this._dictionary)
  }

  /** instanceRegistry.h:195-216. `found` is the out parameter. */
  findInstance(key: HdInstanceKeyType, found: { value: boolean } = { value: false }): HdInstance<VALUE> {
    const holder = this._dictionary.get(key)
    if (!holder) {
      found.value = false
      return new HdInstance<VALUE>(key, null, null)
    }
    found.value = true
    holder.resetRecycleCounter()
    return new HdInstance<VALUE>(key, holder.value, this._dictionary)
  }

  /** instanceRegistry.h:218-256. With a callback, it is called on each
   *  entry removed. Returns the number of entries in use. */
  garbageCollect(recycleCount?: number): number
  garbageCollect(callback: (value: VALUE) => void, recycleCount?: number): number
  garbageCollect(a?: number | ((value: VALUE) => void), b?: number): number {
    const callback = typeof a === 'function' ? a : (_v: VALUE) => {}
    const recycleCount = typeof a === 'function' ? (b ?? 0) : (a ?? 0)

    // Skip garbage collection entirely when then the recycleCount is < 0
    if (recycleCount < 0) {
      return this._dictionary.size
    }

    let inUseCount = 0
    for (const [key, holder] of [...this._dictionary]) {
      // erase instance which isn't referred from anyone
      const isUnique = HdInstanceRegistry._isUnique(holder.value)
      if (isUnique && (++holder.recycleCounter > recycleCount)) {
        callback(holder.value as VALUE)
        this._dictionary.delete(key)
        _Release(holder.value)
      } else {
        ++inUseCount
      }
    }
    return inUseCount
  }

  /** instanceRegistry.h:153-154 begin/end, for resource auditing. */
  [Symbol.iterator](): IterableIterator<[HdInstanceKeyType, HdInstanceValueHolder<VALUE | null>]> {
    return this._dictionary[Symbol.iterator]()
  }

  /** instanceRegistry.h:156 */
  size(): number { return this._dictionary.size }

  /** instanceRegistry.h:258-265 */
  invalidate(): void {
    const holders = [...this._dictionary.values()]
    this._dictionary.clear()
    for (const holder of holders) _Release(holder.value)
  }

  /** instanceRegistry.h:161-164. PLATFORM-DIVERGENCE(hd-instance-use-count). */
  private static _isUnique(value: unknown): boolean {
    const counted = _Counted(value)
    if (counted) return counted._useCount() === 1
    return value !== null && typeof value === 'object' &&
      (value as { _expired?: unknown })._expired === true
  }
}
