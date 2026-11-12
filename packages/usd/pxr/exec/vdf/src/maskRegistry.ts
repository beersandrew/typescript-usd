// Ported from OpenUSD 26.11.1: pxr/exec/vdf/maskRegistry.cpp,
//  pxr/exec/vdf/maskRegistry.h, pxr/exec/vdf/mask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/maskRegistry.h and maskRegistry.cpp.
//
// Vdf_MaskRegistry is the flyweighting table that interns VdfMask bits, so
// that two masks with equal bits share one VdfMask::_BitsImpl and compare by
// identity (mask.h:262-264).
//
// Ownership (openexec-x1.md section 4, convention 8): upstream's _BitsImpl is
// reference counted by TfDelegatedCountPtr, and the last VdfMask to drop a
// reference erases the entry (mask.h:690-712). Here the registry holds a
// WeakRef to each mortal entry and a FinalizationRegistry erases it once no
// VdfMask references it, which is the same lifetime. Immortal entries (masks
// of size <= 8, maskRegistry.h:247) are held strongly, as upstream never
// erases them. The reader/writer lock and the resurrection count exist only
// for concurrent find/erase races (maskRegistry.h:170-182, 264-272) and are
// dropped (single-threaded). The bucket array with its manual rehash
// (maskRegistry.h:232-260, maskRegistry.cpp:47-79) is a JS Map from hash to
// bucket chain; the entry count it reports is the same.

import { TfCompressedBits } from 'typescript-usd/tf'

let _nextBitsImplId = 1

/**
 * VdfMask::_BitsImpl (mask.h:610-652): a refcounted hash table node holding
 * an immutable VdfMask::Bits. Flyweighting requires that the bits are never
 * mutated.
 */
export class VdfMask_BitsImpl {
  readonly #hash: bigint
  readonly #bits: TfCompressedBits
  readonly _isImmortal: boolean
  /** Stands in for the node's address: identity hash and arbitrary order. */
  readonly _id: number

  // maskRegistry.h:241-249
  constructor(hash: bigint, bits: TfCompressedBits) {
    this.#hash = hash
    this.#bits = bits
    this._isImmortal = bits.getSize() <= 8
    this._id = _nextBitsImplId++
  }

  /** Provide const access to the bits (mask.h:624-626). */
  Get(): TfCompressedBits { return this.#bits }

  /** Return the pre-computed hash value for the bits (maskRegistry.h:251-256). */
  getHash(): bigint { return this.#hash }
}

type _Entry = { readonly ref: WeakRef<VdfMask_BitsImpl> | VdfMask_BitsImpl }

const _deref = (entry: _Entry): VdfMask_BitsImpl | undefined =>
  entry.ref instanceof VdfMask_BitsImpl ? entry.ref : entry.ref.deref()

/**
 * A flyweighting table customized for VdfMask (maskRegistry.h:24-131).
 * Supports only find+insertion and deletion of values.
 */
export class Vdf_MaskRegistry {
  /**
   * Discard this number of least significant bits when computing the bucket
   * index (maskRegistry.h:43-46). Upstream stripes entries across
   * 1 << DiscardBucketBits registries to avoid lock contention (mask.cpp:18-
   * 30); with one thread a single registry is used.
   */
  static readonly DiscardBucketBits = 6

  // Hash -> bucket chain; newest entries first (maskRegistry.h:236-243).
  readonly #buckets = new Map<bigint, _Entry[]>()
  #nodeCount = 0
  readonly #finalizer = new FinalizationRegistry<{ hash: bigint, entry: _Entry }>(
    ({ hash, entry }) => this.#unlink(entry, hash))

  /**
   * If `bits` is found, return the existing entry. Otherwise, adopt `bits`
   * into a new entry (maskRegistry.h:136-158). `bits` may not be used after
   * passing it to this function.
   */
  findOrEmplace(bits: TfCompressedBits, hash: bigint): VdfMask_BitsImpl {
    return this.#find(bits, hash) ?? this.#emplace(bits, hash)
  }

  /**
   * If `bits` is found, return the existing entry. Otherwise, copy `bits`
   * into a new entry (maskRegistry.h:160-182).
   */
  findOrInsert(bits: TfCompressedBits, hash: bigint): VdfMask_BitsImpl {
    return this.#find(bits, hash) ??
      this.#emplace(new TfCompressedBits(bits), hash)
  }

  /**
   * Delete the entry pointed to by `target` (maskRegistry.h:258-275). Mortal
   * entries are erased by the finalizer when the last VdfMask releases them.
   */
  erase(target: VdfMask_BitsImpl, hash: bigint): void {
    const bucket = this.#buckets.get(hash)
    const entry = bucket?.find((e) => _deref(e) === target)
    if (entry) {
      this.#unlink(entry, hash)
    }
  }

  /** Return the current number of entries in the registry. For test use only. */
  getSize(): number {
    return this.#nodeCount
  }

  // maskRegistry.h:184-218
  #find(bits: TfCompressedBits, hash: bigint): VdfMask_BitsImpl | undefined {
    const bucket = this.#buckets.get(hash)
    if (!bucket) {
      return undefined
    }
    for (const entry of bucket) {
      const n = _deref(entry)
      if (n && n.Get().Equals(bits)) {
        return n
      }
    }
    return undefined
  }

  // maskRegistry.h:220-245
  #emplace(bits: TfCompressedBits, hash: bigint): VdfMask_BitsImpl {
    const newNode = new VdfMask_BitsImpl(hash, bits)
    const entry: _Entry = newNode._isImmortal
      ? { ref: newNode }
      : { ref: new WeakRef(newNode) }
    let bucket = this.#buckets.get(hash)
    if (!bucket) {
      bucket = []
      this.#buckets.set(hash, bucket)
    }
    // New entries are inserted as the first element in the bucket
    // (maskRegistry.h:236-240).
    bucket.unshift(entry)
    ++this.#nodeCount
    if (!newNode._isImmortal) {
      this.#finalizer.register(newNode, { hash, entry })
    }
    return newNode
  }

  // maskRegistry.h:277-305
  #unlink(entry: _Entry, hash: bigint): void {
    const bucket = this.#buckets.get(hash)
    if (!bucket) {
      return
    }
    const index = bucket.indexOf(entry)
    if (index < 0) {
      return
    }
    bucket.splice(index, 1)
    if (bucket.length === 0) {
      this.#buckets.delete(hash)
    }
    --this.#nodeCount
  }
}

const _maskRegistry = new Vdf_MaskRegistry()

/** The registry for masks whose bits hash to `maskHash` (mask.cpp:21-26). */
export function Vdf_GetMaskRegistry(_maskHash: bigint): Vdf_MaskRegistry {
  return _maskRegistry
}

/** Vdf_MaskRegistry_GetSize (mask.cpp:28-38), for use in tests. */
export function Vdf_MaskRegistry_GetSize(): number {
  return _maskRegistry.getSize()
}
