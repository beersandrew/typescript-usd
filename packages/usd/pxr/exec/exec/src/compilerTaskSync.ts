// Ported from OpenUSD 26.11.1: pxr/exec/exec/compilerTaskSync.cpp,
//  pxr/exec/exec/compilerTaskSync.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compilerTaskSync.h and
// compilerTaskSync.cpp.
//
// The class template Exec_CompilerTaskSync<KeyType> is a generic class. Its
// tbb::concurrent_unordered_map<KeyType, _Waitlist, TfHash> is an
// Exec_KeyedMap: pointer keys (const VdfInput *, const VdfNode *) are object
// keys of a JS Map, and Exec_OutputKey::Identity keys are hashed by their
// GetHash() and compared with Equals() (docs/openexec-x1.md section 4.1,
// Operators). Each upstream alias is a subclass that picks the map.

import { TF_VERIFY } from 'typescript-usd/tf'
import type { WorkDispatcher } from 'typescript-usd/work'

import type { VdfInput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

import type { Exec_CompilationTask } from './compilationTask.ts'
import { Exec_CompilerTaskSyncBase } from './compilerTaskSyncBase.ts'
import type { Exec_OutputKey } from './outputKey.ts'

/**
 * The map operations Exec_CompilerTaskSync needs from
 * tbb::concurrent_unordered_map: find-or-emplace and iteration.
 */
export interface Exec_KeyedMap<K, V> extends Iterable<[K, V]> {
  find(key: K): V | undefined
  /** emplace(key, make()): returns the new or existing mapped value. */
  findOrEmplace(key: K, make: () => V): V
  erase(key: K): boolean
  readonly size: number
}

/** An Exec_KeyedMap for pointer keys (a JS Map keyed by object identity). */
export class Exec_PointerKeyedMap<K extends object, V> implements Exec_KeyedMap<K, V> {
  private readonly _map = new Map<K, V>()

  find(key: K): V | undefined {
    return this._map.get(key)
  }

  findOrEmplace(key: K, make: () => V): V {
    let value = this._map.get(key)
    if (value === undefined) {
      value = make()
      this._map.set(key, value)
    }
    return value
  }

  erase(key: K): boolean {
    return this._map.delete(key)
  }

  get size(): number {
    return this._map.size
  }

  [Symbol.iterator](): Iterator<[K, V]> {
    return this._map[Symbol.iterator]()
  }
}

/** A value key hashed with TfHash (GetHash) and compared with operator==. */
export interface Exec_HashableKey<K> {
  getHash(): number
  Equals(rhs: K): boolean
}

/**
 * An Exec_KeyedMap for value keys: buckets keyed by GetHash(), searched with
 * Equals(), as unordered_map<K, V, TfHash> does. Iteration is in insertion
 * order of the buckets.
 */
export class Exec_HashKeyedMap<K extends Exec_HashableKey<K>, V>
implements Exec_KeyedMap<K, V> {
  private readonly _buckets = new Map<number, Array<[K, V]>>()
  private _size = 0

  find(key: K): V | undefined {
    const bucket = this._buckets.get(key.getHash())
    if (!bucket) return undefined
    for (const entry of bucket) {
      if (entry[0].Equals(key)) return entry[1]
    }
    return undefined
  }

  findOrEmplace(key: K, make: () => V): V {
    const hash = key.getHash()
    let bucket = this._buckets.get(hash)
    if (!bucket) {
      bucket = []
      this._buckets.set(hash, bucket)
    }
    for (const entry of bucket) {
      if (entry[0].Equals(key)) return entry[1]
    }
    const value = make()
    bucket.push([key, value])
    ++this._size
    return value
  }

  /** Inserts (key, value) if key is absent; returns true if inserted. */
  emplace(key: K, value: V): boolean {
    let inserted = false
    this.findOrEmplace(key, () => {
      inserted = true
      return value
    })
    return inserted
  }

  erase(key: K): boolean {
    const hash = key.getHash()
    const bucket = this._buckets.get(hash)
    if (!bucket) return false
    const index = bucket.findIndex(entry => entry[0].Equals(key))
    if (index < 0) return false
    bucket.splice(index, 1)
    if (bucket.length === 0) this._buckets.delete(hash)
    --this._size
    return true
  }

  get size(): number {
    return this._size
  }

  *[Symbol.iterator](): Iterator<[K, V]> {
    for (const bucket of this._buckets.values()) {
      yield* bucket
    }
  }
}

/**
 * Instances of this class are used to synchronize compilation task graphs
 * (compilerTaskSync.h:24-86).
 *
 * Tasks can claim dependent tasks, where each dependent task is identified by
 * KeyType. The lifetime of instances of this class is expected to be limited
 * to one round of compilation.
 */
export class Exec_CompilerTaskSync<KeyType> extends Exec_CompilerTaskSyncBase {
  // A unique waitlist is maintained for each key.
  private readonly _waitlists: Exec_KeyedMap<KeyType, Exec_CompilerTaskSyncBase._Waitlist>

  /**
   * compilerTaskSync.cpp:16-20. `waitlists` is the map that stands in for
   * tbb::concurrent_unordered_map<KeyType, _Waitlist, TfHash>.
   */
  constructor(
    dispatcher: WorkDispatcher,
    waitlists: Exec_KeyedMap<KeyType, Exec_CompilerTaskSyncBase._Waitlist>,
  ) {
    super(dispatcher)
    this._waitlists = waitlists
  }

  /**
   * Attempts to claim the task identified by `key`, and returns whether the
   * attempt was successful (compilerTaskSync.cpp:25-40).
   */
  claim(key: KeyType, task: Exec_CompilationTask): Exec_CompilerTaskSyncBase.ClaimResult {
    // Add the key to the map. If another task got to claiming it first, it's
    // expected and safe for the key to already have a waitlist.
    const waitlist = this._waitlists.findOrEmplace(
      key, () => new Exec_CompilerTaskSyncBase._Waitlist())
    return this._claim(waitlist, task)
  }

  /**
   * Establishes that `task` depends on the task identified by `key`
   * (compilerTaskSync.cpp:42-57).
   */
  waitOn(key: KeyType, task: Exec_CompilationTask): Exec_CompilerTaskSyncBase.WaitResult {
    const waitlist = this._waitlists.findOrEmplace(
      key, () => new Exec_CompilerTaskSyncBase._Waitlist())
    return this._waitOn(waitlist, task)
  }

  /**
   * Marks the task associated with `key` as done (compilerTaskSync.cpp:59-75).
   * Any key value can be marked done, but the same key cannot be marked done
   * more than once.
   */
  markDone(key: KeyType): void {
    // Get the waitlist for the key. If previously claimed or waited on, the
    // waitlist will exist. If not, we create a new waitlist in case a future
    // caller attempts to wait on this key.
    const waitlist = this._waitlists.findOrEmplace(
      key, () => new Exec_CompilerTaskSyncBase._Waitlist())

    // We expect the waitlist to not already be marked done.
    const wasNotDone = this._markDone(waitlist)
    TF_VERIFY(wasNotDone, 'wasNotDone')
  }

  /** Marks every known key as done (compilerTaskSync.cpp:77-91). */
  markAllDone(): void {
    // Only called when all tasks are blocked in a cycle, meaning no task
    // should attempt to Claim or WaitOn any key after this method is called.
    for (const [, waitlist] of this._waitlists) {
      this._markDone(waitlist)
    }
  }
}

/**
 * Synchronizes Exec_OutputProvidingCompilationTasks; tasks are identified by
 * the identity of the output key being compiled (compilerTaskSync.h:88-93).
 */
export class Exec_OutputProvidingTaskSync
  extends Exec_CompilerTaskSync<Exec_OutputKey.Identity> {
  constructor(dispatcher: WorkDispatcher) {
    super(dispatcher, new Exec_HashKeyedMap())
  }
}

/**
 * Synchronizes Exec_InputRecompilationTasks; tasks are identified by the
 * VdfInput to be recompiled (compilerTaskSync.h:95-99).
 */
export class Exec_InputRecompilationTaskSync extends Exec_CompilerTaskSync<VdfInput> {
  constructor(dispatcher: WorkDispatcher) {
    super(dispatcher, new Exec_PointerKeyedMap())
  }
}

/**
 * Synchronizes Exec_CycleDetectingTasks; tasks are identified by the VdfNode
 * for which the task will traverse (compilerTaskSync.h:101-105).
 */
export class Exec_CycleDetectingTaskSync extends Exec_CompilerTaskSync<VdfNode> {
  constructor(dispatcher: WorkDispatcher) {
    super(dispatcher, new Exec_PointerKeyedMap())
  }
}
