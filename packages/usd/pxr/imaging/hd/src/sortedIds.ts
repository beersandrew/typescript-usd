// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sortedIds.cpp,
//  pxr/imaging/hd/sortedIds.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/sortedIds.{h,cpp} — Hd_SortedIds.
//
// Manages a container of Hydra ids (SdfPaths) in sorted order, with deferred
// (lazy) sorting. Behaves like a multiset: duplicate elements are allowed and
// Remove() removes up to one occurrence.
//
// Inserts and removes are batched into an _edits buffer and merged into the
// sorted _ids list lazily, the first time GetIds() (or a mode switch) forces a
// _Sort(). A small state machine (_NoMode / _InsertMode / _RemoveMode /
// _UpdateMode) lets a run of same-kind edits accumulate cheaply; mixing inserts
// and removes enters _UpdateMode, where an _UpdateImpl keeps the queued inserts
// and removes disjoint (so they can be applied removes-then-inserts without
// changing observable order) and rejects any edit that would violate that,
// forcing a flush-and-retry.
//
// Ordering is SdfPath's total order, via the same `comparePaths` comparator
// HdRenderIndex sorts its rprim ids with (ancestors before descendants,
// siblings lexicographically).

import { SdfPath } from 'typescript-usd/sdf/path'
import { comparePaths } from './primGather.ts'

const enum _EditMode {
  _NoMode,
  _InsertMode,
  _RemoveMode,
  _UpdateMode,
}

// std::lower_bound — first index i in [0,n) with ids[i] >= value.
function lowerBound(ids: SdfPath[], value: SdfPath): number {
  let lo = 0
  let hi = ids.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (comparePaths(ids[mid]!, value) < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

// std::upper_bound — first index i in [0,n) with ids[i] > value.
function upperBound(ids: SdfPath[], value: SdfPath): number {
  let lo = 0
  let hi = ids.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (comparePaths(ids[mid]!, value) <= 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

// A membership filter to decide whether the inserts/removes lists might share an
// element during mixed update batches. Upstream uses a probabilistic bloom
// filter as a fast pre-check before a linear search; we back it with an exact
// Set (a bloom filter with no false positives), so MightContain is precise. The
// capacity bound is kept to mirror the periodic flush behavior.
class _PathFilter {
  private static readonly _Capacity = 1024
  private _members = new Set<string>()
  private _size = 0

  insert(p: SdfPath): void {
    this._members.add(p.pathString)
    ++this._size
  }

  mightContain(p: SdfPath): boolean {
    return this._members.has(p.pathString)
  }

  isFull(): boolean {
    return this._size >= _PathFilter._Capacity
  }
}

// Keeps queued inserts (held in Hd_SortedIds._edits) and queued removes disjoint
// during a mixed-edit batch. Insert()/Remove() return false to reject an edit
// that conflicts (the other list already holds it) or that overflows capacity;
// the caller then _Sort()s and retries from a clean state.
class _UpdateImpl {
  private _removes: SdfPath[] = []
  private _insertsFilter = new _PathFilter()
  private _removesFilter = new _PathFilter()

  insert(inserts: SdfPath[], id: SdfPath): boolean {
    if (this._insertsFilter.isFull() ||
        (this._removesFilter.mightContain(id) && this._find(this._removes, id))) {
      return false
    }
    inserts.push(id)
    this._insertsFilter.insert(id)
    return true
  }

  remove(inserts: SdfPath[], id: SdfPath): boolean {
    if (this._removesFilter.isFull() ||
        (this._insertsFilter.mightContain(id) && this._find(inserts, id))) {
      return false
    }
    this._removes.push(id)
    this._removesFilter.insert(id)
    return true
  }

  takeRemoves(): SdfPath[] {
    const removes = this._removes
    this._removes = []
    return removes
  }

  private _find(ids: SdfPath[], id: SdfPath): boolean {
    return ids.some((p) => comparePaths(p, id) === 0)
  }
}

export class Hd_SortedIds {
  private _ids: SdfPath[] = []
  private _edits: SdfPath[] = []
  private _mode: _EditMode = _EditMode._NoMode
  private _updater: _UpdateImpl | null = null

  /// Sorts the ids if needed and returns the sorted list of ids.
  getIds(): SdfPath[] {
    this._sort()
    return this._ids
  }

  /// Add an id to the collection. If the id is already present, a duplicate is
  /// added.
  insert(id: SdfPath): void {
    if (this._mode === _EditMode._NoMode) {
      this._mode = _EditMode._InsertMode
    }
    if (this._mode === _EditMode._InsertMode) {
      this._edits.push(id)
      return
    }
    if (this._mode !== _EditMode._UpdateMode) {
      this._sort()
      this._mode = _EditMode._UpdateMode
      this._updater = new _UpdateImpl()
    }
    if (!this._updater!.insert(this._edits, id)) {
      // If the updater can't take this insert, we _Sort() and retry.
      this._sort()
      this.insert(id)
    }
  }

  /// Remove up to one occurrence of id from the collection. If the id is not
  /// present, do nothing.
  remove(id: SdfPath): void {
    if (this._mode === _EditMode._NoMode) {
      this._mode = _EditMode._RemoveMode
    }
    if (this._mode === _EditMode._RemoveMode) {
      this._edits.push(id)
      return
    }
    if (this._mode !== _EditMode._UpdateMode) {
      this._sort()
      this._mode = _EditMode._UpdateMode
      this._updater = new _UpdateImpl()
    }
    if (!this._updater!.remove(this._edits, id)) {
      // If the updater can't take this remove, we _Sort() and retry.
      this._sort()
      this.remove(id)
    }
  }

  /// Remove a range of ids from the collection, defined by inclusive position
  /// indices in the sorted list. Only valid while the list is sorted.
  removeRange(start: number, end: number): void {
    const numIds = this._ids.length
    const numToRemove = end - start + 1

    if (this._edits.length !== 0) {
      throw new Error('RemoveRange can only be called while list sorted')
    }

    if (numToRemove === numIds) {
      this.clear()
      return
    }

    this._ids.splice(start, numToRemove)
  }

  /// Removes all ids from the collection.
  clear(): void {
    this._ids = []
    this._edits = []
    this._mode = _EditMode._NoMode
    this._updater = null
  }

  private _sort(): void {
    // Nothing queued and not a pending update — clear the mode and return.
    if (this._mode !== _EditMode._UpdateMode && this._edits.length === 0) {
      this._mode = _EditMode._NoMode
      return
    }

    // Handle Update()s by splitting the queued removals and insertions into a
    // _RemoveMode batch followed by an _InsertMode batch. This is correct wrt
    // ordering because the _updater kept the two sets disjoint.
    if (this._mode === _EditMode._UpdateMode) {
      const inserts = this._edits

      this._edits = this._updater!.takeRemoves()
      this._mode = _EditMode._RemoveMode
      this._sort()

      this._edits = inserts
      this._mode = _EditMode._InsertMode
      this._sort()

      this._updater = null
      return
    }

    // Either _InsertMode or _RemoveMode. Sort the queued edits.
    this._edits.sort(comparePaths)

    const removing = this._mode === _EditMode._RemoveMode

    // Adding new ids when _ids is currently empty: swap.
    if (!removing && this._ids.length === 0) {
      this._ids = this._edits
      this._edits = []
      this._mode = _EditMode._NoMode
      return
    }

    if (removing) {
      this._applyRemoves()
    } else {
      this._applyInserts()
    }

    this._edits = []
    this._mode = _EditMode._NoMode
  }

  // Remove one occurrence of each (sorted) edit from the sorted _ids list. This
  // is a one-to-one set difference over the affected range — equivalent to
  // upstream's set-difference / binary-search-erase paths, which both delete a
  // single matching id per edit entry.
  private _applyRemoves(): void {
    const edits = this._edits
    const removeBegin = lowerBound(this._ids, edits[0]!)
    const removeEnd = upperBound(this._ids, edits[edits.length - 1]!)

    const kept: SdfPath[] = []
    let e = 0
    let i = removeBegin
    while (i < removeEnd && e < edits.length) {
      const c = comparePaths(this._ids[i]!, edits[e]!)
      if (c < 0) {
        kept.push(this._ids[i]!)
        ++i
      } else if (c > 0) {
        ++e
      } else {
        // Match: drop this id, consume the edit.
        ++i
        ++e
      }
    }
    while (i < removeEnd) {
      kept.push(this._ids[i]!)
      ++i
    }

    this._ids.splice(removeBegin, removeEnd - removeBegin, ...kept)
  }

  // Merge the (sorted) edits into the sorted _ids list, preserving duplicates
  // (stable merge, edits placed after equal existing ids).
  private _applyInserts(): void {
    const edits = this._edits
    const addBegin = lowerBound(this._ids, edits[0]!)
    const addEnd = upperBound(this._ids, edits[edits.length - 1]!)

    const merged: SdfPath[] = []
    let i = addBegin
    let e = 0
    while (i < addEnd && e < edits.length) {
      // <= keeps existing ids ahead of equal inserts (std::merge semantics).
      if (comparePaths(this._ids[i]!, edits[e]!) <= 0) {
        merged.push(this._ids[i]!)
        ++i
      } else {
        merged.push(edits[e]!)
        ++e
      }
    }
    while (i < addEnd) merged.push(this._ids[i++]!)
    while (e < edits.length) merged.push(edits[e++]!)

    this._ids.splice(addBegin, addEnd - addBegin, ...merged)
  }
}
