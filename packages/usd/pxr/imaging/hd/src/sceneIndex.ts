// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sceneIndex.cpp,
//  pxr/imaging/hd/sceneIndex.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/sceneIndex.h
// HdSceneIndexBase, HdSceneIndexObserver, HdSceneIndexPrimView,
// HdSceneIndexNameRegistry

import type { HdContainerDataSource } from './dataSource.ts'
import type { HdDataSourceLocatorSet } from './dataSourceLocator.ts'

// ---- Observer notification entry types ----

export interface HdSceneIndexObserver {
  primsAdded(sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void
  primsRemoved(sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void
  primsDirtied(sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void
  primsRenamed(sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void
}

/**
 * sceneIndexObserver.cpp:15-60: a utility for converting prims renamed
 * messages into equivalent removed and added notices; with an `observer`
 * (sceneIndexObserver.cpp:62-75), the converted notices are sent to it at the
 * observer level. (C++ overloads become one function.)
 */
function _ConvertPrimsRenamedToRemovedAndAdded(
  sender: HdSceneIndexBase, renamedEntries: readonly RenamedPrimEntry[],
  outputRemovedEntries: RemovedPrimEntry[], outputAddedEntries: AddedPrimEntry[]): void
function _ConvertPrimsRenamedToRemovedAndAdded(
  sender: HdSceneIndexBase, renamedEntries: readonly RenamedPrimEntry[],
  observer: HdSceneIndexObserver): void
function _ConvertPrimsRenamedToRemovedAndAdded(
  sender: HdSceneIndexBase, renamedEntries: readonly RenamedPrimEntry[],
  removedOrObserver: RemovedPrimEntry[] | HdSceneIndexObserver,
  outputAddedEntries?: AddedPrimEntry[]): void {
  if (!Array.isArray(removedOrObserver)) {
    const removed: RemovedPrimEntry[] = []
    const added: AddedPrimEntry[] = []
    _ConvertPrimsRenamedToRemovedAndAdded(sender, renamedEntries, removed, added)
    removedOrObserver.primsRemoved(sender, removed)
    removedOrObserver.primsAdded(sender, added)
    return
  }
  const outputRemovedEntries = removedOrObserver
  for (const renamedEntry of renamedEntries) {
    if (renamedEntry.oldPrimPath !== renamedEntry.newPrimPath) {
      // remove existing
      outputRemovedEntries.push({ primPath: renamedEntry.oldPrimPath })

      // add back based on traversal on input from new path
      const workQueue: string[] = [renamedEntry.newPrimPath]
      while (workQueue.length > 0) {
        const path = workQueue.pop()!
        const p = sender.getPrim(path)
        outputAddedEntries!.push({ primPath: path, primType: p.primType })
        const childPaths = sender.getChildPrimPaths(path)
        // insert backwards as we are pulling off the end.
        for (let i = childPaths.length - 1; i >= 0; --i) workQueue.push(childPaths[i]!)
      }
    }
  }
}

/** Static members of HdSceneIndexObserver (sceneIndexObserver.h:157-171). */
export const HdSceneIndexObserver = {
  ConvertPrimsRenamedToRemovedAndAdded: _ConvertPrimsRenamedToRemovedAndAdded,
}

export interface AddedPrimEntry {
  primPath: string
  primType: string
}

export interface RemovedPrimEntry {
  primPath: string
}

export interface DirtiedPrimEntry {
  primPath: string
  dirtyLocators: HdDataSourceLocatorSet
}

export interface RenamedPrimEntry {
  oldPrimPath: string
  newPrimPath: string
}

// ---- Prim descriptor ----

export interface HdSceneIndexPrim {
  primType: string
  dataSource: HdContainerDataSource | undefined
}

// ---- Abstract base ----

export abstract class HdSceneIndexBase {
  private _observers: Array<HdSceneIndexObserver | undefined> = []
  private _notifyDepth = 0
  private _shouldRemoveExpiredObservers = false
  private _displayName = ''

  abstract getPrim(primPath: string): HdSceneIndexPrim
  abstract getChildPrimPaths(primPath: string): string[]

  addObserver(observer: HdSceneIndexObserver): void {
    if (!this._observers.includes(observer)) this._observers.push(observer)
  }

  removeObserver(observer: HdSceneIndexObserver): void {
    const i = this._observers.indexOf(observer)
    if (i < 0) return
    // pxr/imaging/hd/sceneIndex.cpp:57-71: do not invalidate traversal while
    // a notice is in flight; null the slot and compact at outermost return.
    if (this._notifyDepth === 0) {
      this._observers.splice(i, 1)
    } else {
      this._observers[i] = undefined
      this._shouldRemoveExpiredObservers = true
    }
  }

  /** sceneIndex.cpp:244-252: the value set by setDisplayName, else the
   *  demangled type name.
   *  PLATFORM-DIVERGENCE(hd-scene-index-type-name): JavaScript has no
   *  typeid; the fallback is the class's constructor name, which a
   *  minifying bundler may shorten unless it keeps names. */
  getDisplayName(): string {
    if (this._displayName !== '') return this._displayName
    return this.constructor.name
  }
  setDisplayName(name: string): void { this._displayName = name }

  // Mirrors HdSceneIndexBase::_IsObserved — true when there is at least one
  // registered observer, allowing subclasses to skip notification bookkeeping
  // when nobody is listening.
  protected _isObserved(): boolean {
    return this._observers.some(observer => observer !== undefined)
  }

  protected _sendPrimsAdded(entries: AddedPrimEntry[]): void {
    this._notify(entries, (obs, batch) => obs.primsAdded(this, batch))
  }

  protected _sendPrimsRemoved(entries: RemovedPrimEntry[]): void {
    this._notify(entries, (obs, batch) => obs.primsRemoved(this, batch))
  }

  protected _sendPrimsDirtied(entries: DirtiedPrimEntry[]): void {
    this._notify(entries, (obs, batch) => obs.primsDirtied(this, batch))
  }

  protected _sendPrimsRenamed(entries: RenamedPrimEntry[]): void {
    this._notify(entries, (obs, batch) => obs.primsRenamed(this, batch))
  }

  private _notify<T>(entries: T[], fn: (observer: HdSceneIndexObserver, entries: T[]) => void): void {
    // pxr/imaging/hd/sceneIndex.cpp:89-172: empty batches are silent and an
    // observer added during dispatch does not join the current traversal.
    if (entries.length === 0) return
    ++this._notifyDepth
    const count = this._observers.length
    try {
      for (let i = 0; i < count; ++i) {
        const observer = this._observers[i]
        if (observer) fn(observer, entries)
      }
    } finally {
      --this._notifyDepth
      if (this._notifyDepth === 0 && this._shouldRemoveExpiredObservers) {
        this._observers = this._observers.filter(
          (observer): observer is HdSceneIndexObserver => observer !== undefined)
        this._shouldRemoveExpiredObservers = false
      }
    }
  }
}

// ---- Prim view ----

// Mirrors pxr/imaging/hd/sceneIndexPrimView.h — a range to iterate over all
// descendants of a given prim (including the prim itself) in a scene index in
// depth-first order. The descendants of the current prim can be skipped by
// calling SkipDescendants() on the iterator (between manual next() calls).
class _PrimViewIterator implements Iterator<string> {
  private _stack: { paths: string[]; index: number }[]
  private _skipDescendants = false
  private _started = false

  constructor(
    private _inputSceneIndex: HdSceneIndexBase,
    root: string,
  ) {
    this._stack = [{ paths: [root], index: 0 }]
  }

  private _current(): string | undefined {
    if (this._stack.length === 0) return undefined
    const frame = this._stack[this._stack.length - 1]!
    return frame.paths[frame.index]
  }

  private _advance(): void {
    if (this._skipDescendants) {
      this._skipDescendants = false
    } else {
      const children = this._inputSceneIndex.getChildPrimPaths(this._current()!)
      if (children.length > 0) {
        this._stack.push({ paths: children, index: 0 })
        return
      }
    }

    while (this._stack.length > 0) {
      const frame = this._stack[this._stack.length - 1]!
      frame.index++
      if (frame.index < frame.paths.length) break
      this._stack.pop()
    }
  }

  skipDescendants(): void {
    this._skipDescendants = true
  }

  next(): IteratorResult<string> {
    if (this._started) {
      this._advance()
    }
    this._started = true

    const cur = this._current()
    if (cur === undefined) return { done: true, value: undefined }
    return { done: false, value: cur }
  }
}

export class HdSceneIndexPrimView implements Iterable<string> {
  constructor(
    private _inputSceneIndex: HdSceneIndexBase,
    private _root = '/',
  ) {}

  [Symbol.iterator](): _PrimViewIterator {
    return new _PrimViewIterator(this._inputSceneIndex, this._root)
  }
}

// ---- Name registry ----

/**
 * sceneIndex.h:259-301, sceneIndex.cpp:286-326: a registry containing named
 * instances of Hydra indexes. Scene Indexes are not automatically registered
 * here, and must be manually added (generally by the application).
 *
 * PLATFORM-DIVERGENCE(hd-scene-index-name-registry-weak): upstream holds
 * HdSceneIndexBasePtr weak pointers that expire when the last reference is
 * released; JavaScript has no reference counts, so entries are WeakRefs that
 * expire when the scene index is garbage collected.
 */
export class HdSceneIndexNameRegistry {
  private static _instance: HdSceneIndexNameRegistry | undefined
  private readonly _namedInstances = new Map<string, WeakRef<HdSceneIndexBase>>()

  private constructor() {}

  /** Returns the singleton-instance of this registry. */
  static GetInstance(): HdSceneIndexNameRegistry {
    return HdSceneIndexNameRegistry._instance ??= new HdSceneIndexNameRegistry()
  }

  /** Registers an `instance` of a scene index with a given `name`. */
  registerNamedSceneIndex(name: string, instance: HdSceneIndexBase): void {
    this._namedInstances.set(name, new WeakRef(instance))
  }

  /** Returns the names of all registered scene indexes. Upstream iterates
   *  an unordered_map; this returns them in registration order. */
  getRegisteredNames(): string[] {
    const result: string[] = []
    for (const [name, instance] of this._namedInstances) {
      if (instance.deref()) {
        result.push(name)
      } else {
        this._namedInstances.delete(name)
      }
    }
    return result
  }

  /** Returns the scene index that was registered with the given `name`. */
  getNamedSceneIndex(name: string): HdSceneIndexBase | undefined {
    const entry = this._namedInstances.get(name)
    if (!entry) return undefined
    const instance = entry.deref()
    if (instance) return instance
    this._namedInstances.delete(name)
    return undefined
  }
}
