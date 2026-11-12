// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pathTable.cpp,
//  pxr/usd/sdf/pathTable.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfPathTable<T> — a prefix-keyed associative container over absolute SdfPaths.
// Port of OpenUSD v26.08 pxr/usd/sdf/pathTable.h:
//   - inserting a path implicitly inserts all of its ancestors (each created with
//     the table's default value, like C++ `mapped_type()`);
//   - erasing a path implicitly erases its entire descendant subtree;
//   - the subtree rooted at p (FindSubtreeRange) is exactly p plus every path
//     prefixed by p, visited depth-first.
//
// Like upstream, entries form an intrusive tree (parent, first child, next
// sibling), so subtree queries and erasure cost the size of the subtree. Lookup
// is by path string; upstream hashes the interned path node.
//
// The default value supplied to implicitly-created ancestors defaults to the
// empty string (the common path->string/data table). Construct with an explicit
// default for other mapped types: `new SdfPathTable<number>(0)`.
import { SdfPath } from './path.ts'

class Entry<T> {
  parent: Entry<T> | null = null
  firstChild: Entry<T> | null = null
  nextSibling: Entry<T> | null = null
  prevSibling: Entry<T> | null = null
  constructor(readonly path: SdfPath, public value: T) {}
}

export interface SdfPathTableInsertResult<T> {
  inserted: boolean
  key: SdfPath
  value: T
}

export class SdfPathTable<T> {
  private _map = new Map<string, Entry<T>>()
  // Entries with no parent in the table (the absolute root, or the root of a
  // relative path chain).
  private _roots: Entry<T> | null = null

  constructor(private _defaultValue: T = '' as unknown as T) {}

  get size(): number { return this._map.size }

  empty(): boolean { return this._map.size === 0 }

  private _link(entry: Entry<T>, parent: Entry<T> | null): void {
    entry.parent = parent
    const head = parent ? parent.firstChild : this._roots
    entry.nextSibling = head
    entry.prevSibling = null
    if (head) head.prevSibling = entry
    if (parent) parent.firstChild = entry
    else this._roots = entry
  }

  private _unlink(entry: Entry<T>): void {
    if (entry.prevSibling) entry.prevSibling.nextSibling = entry.nextSibling
    else if (entry.parent) entry.parent.firstChild = entry.nextSibling
    else this._roots = entry.nextSibling
    if (entry.nextSibling) entry.nextSibling.prevSibling = entry.prevSibling
    entry.parent = entry.nextSibling = entry.prevSibling = null
  }

  // _InsertInTable: find or create the entry for `path`, creating ancestors.
  private _findOrCreate(path: SdfPath, value: () => T): { entry: Entry<T>; inserted: boolean } {
    const existing = this._map.get(path.pathString)
    if (existing) return { entry: existing, inserted: false }
    const entry = new Entry(path, value())
    this._map.set(path.pathString, entry)
    let parent: Entry<T> | null = null
    if (!path.isAbsoluteRootPath() && path.pathElementCount > 0) {
      const parentPath = path.getParentPath()
      if (!parentPath.isEmpty()) {
        parent = this._findOrCreate(parentPath, () => this._defaultValue).entry
      }
    }
    this._link(entry, parent)
    return { entry, inserted: true }
  }

  // insert(): implicitly inserts ancestors, and does NOT overwrite an existing
  // key (returns the existing value with inserted=false).
  insert(key: SdfPath, value: T): SdfPathTableInsertResult<T> {
    const { entry, inserted } = this._findOrCreate(key, () => value)
    return { inserted, key, value: entry.value }
  }

  // operator[] = : insert-or-overwrite (also implicitly inserts ancestors).
  set(key: SdfPath, value: T): void {
    this._findOrCreate(key, () => value).entry.value = value
  }

  // operator[]: the value at key, inserting the default value when absent.
  getOrInsert(key: SdfPath, create: () => T): T {
    return this._findOrCreate(key, create).entry.value
  }

  get(key: SdfPath): T | undefined { return this._map.get(key.pathString)?.value }

  has(key: SdfPath): boolean { return this._map.has(key.pathString) }

  // find(): the entry at key (its value), or undefined when absent.
  find(key: SdfPath): { readonly value: T } | undefined { return this._map.get(key.pathString) }

  count(key: SdfPath): number { return this._map.has(key.pathString) ? 1 : 0 }

  // erase(): removes the key and every descendant (the whole subtree). Returns
  // false if the key was not present.
  erase(key: SdfPath): boolean {
    const entry = this._map.get(key.pathString)
    if (!entry) return false
    this._unlink(entry)
    const stack: Entry<T>[] = [entry]
    while (stack.length > 0) {
      const e = stack.pop()!
      this._map.delete(e.path.pathString)
      for (let c = e.firstChild; c; c = c.nextSibling) stack.push(c)
    }
    return true
  }

  // Depth-first preorder over the subtree rooted at `entry`.
  private *_subtree(entry: Entry<T>): IterableIterator<Entry<T>> {
    const stack: Entry<T>[] = [entry]
    while (stack.length > 0) {
      const e = stack.pop()!
      yield e
      const children: Entry<T>[] = []
      for (let c = e.firstChild; c; c = c.nextSibling) children.push(c)
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
    }
  }

  // FindSubtreeRange: the key plus all paths prefixed by it. [] if key absent.
  findSubtreeRange(key: SdfPath): Array<[SdfPath, T]> {
    const entry = this._map.get(key.pathString)
    if (!entry) return []
    const out: Array<[SdfPath, T]> = []
    for (const e of this._subtree(entry)) out.push([e.path, e.value])
    return out
  }

  /** Visit the subtree rooted at key without materializing it. */
  forEachInSubtree(key: SdfPath, fn: (path: SdfPath, value: T) => void): void {
    const entry = this._map.get(key.pathString)
    if (!entry) return
    for (const e of this._subtree(entry)) fn(e.path, e.value)
  }

  // iterator.HasChild(): the node at `key` has at least one child in the table.
  hasChild(key: SdfPath): boolean {
    return this._map.get(key.pathString)?.firstChild != null
  }

  *entries(): IterableIterator<[SdfPath, T]> {
    for (let r = this._roots; r; r = r.nextSibling) {
      for (const e of this._subtree(r)) yield [e.path, e.value]
    }
  }

  [Symbol.iterator](): IterableIterator<[SdfPath, T]> { return this.entries() }

  clone(): SdfPathTable<T> {
    const t = new SdfPathTable<T>(this._defaultValue)
    for (const [path, value] of this.entries()) t.set(path, value)
    return t
  }

  swap(other: SdfPathTable<T>): void {
    const map = this._map
    const roots = this._roots
    this._map = other._map
    this._roots = other._roots
    other._map = map
    other._roots = roots
  }

  clear(): void {
    this._map.clear()
    this._roots = null
  }

  // No threads in JS — clearInParallel/parallelForEach are the serial analogs of
  // the upstream WorkParallelForEach forms; the observable result is identical.
  clearInParallel(): void { this.clear() }

  // const form: fn returns void. non-const form: fn may RETURN a new value to
  // update the mapped object (mirrors the C++ `mapped_type&` mutation).
  parallelForEach(fn: (key: SdfPath, value: T) => T | void): void {
    for (const e of this._map.values()) {
      const next = fn(e.path, e.value)
      if (next !== undefined) e.value = next
    }
  }
}
