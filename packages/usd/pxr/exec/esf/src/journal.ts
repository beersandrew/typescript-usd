// Ported from OpenUSD 26.11.1: pxr/exec/esf/journal.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/journal.h.
//
// Stores a collection of edit reasons associated with scene objects
// (journal.h:21-37). Exec compilation uses an EsfJournal to log all scene
// queries performed while compiling a node or forming connections in the exec
// network. An instance of EsfJournal is passed to public methods of scene
// adapter interfaces (e.g. EsfPrimInterface.GetParent), and those methods add
// entries to the journal.
//
// The TfDenseHashMap<SdfPath, EsfEditReason, TfHash> (journal.h:39) is a JS
// Map keyed by the path string (SdfPath.pathString), whose entries hold the
// SdfPath and its EsfEditReason. Iteration yields the map's value_type,
// [SdfPath, EsfEditReason] pairs, in insertion order; upstream's dense hash
// map order is unspecified.

import { TF_VERIFY } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { EsfEditReason } from './editReason.ts'

/** EsfJournal::value_type (journal.h:83). */
export type EsfJournalValueType = readonly [SdfPath, EsfEditReason]

export class EsfJournal implements Iterable<EsfJournalValueType> {
  // journal.h:115: keyed by SdfPath.pathString.
  private readonly _hashMap = new Map<string, [SdfPath, EsfEditReason]>()

  /**
   * Adds or updates a new entry in the journal (journal.h:41-55).
   *
   * If a journal entry already exists for \p path, then its edit reasons are
   * extended by \p editReason. Returns this journal, so multiple Add calls can
   * be chained together.
   */
  add(path: SdfPath, editReason: EsfEditReason): this {
    if (TF_VERIFY(path.isAbsolutePath(), 'path.IsAbsolutePath()') &&
        TF_VERIFY(!path.isEmpty(), '!path.IsEmpty()')) {
      this._orEntry(path, editReason)
    }
    return this
  }

  /**
   * Merges the entries from the \p other EsfJournal into this one
   * (journal.h:57-67). Entries for the same path hold the union of both
   * reasons.
   */
  merge(other: EsfJournal): void {
    for (const [path, reason] of other) {
      this._orEntry(path, reason)
    }
  }

  // _hashMap[path] |= editReason. A new entry starts from a default
  // (None) reason, so the stored reason is never one of the frozen
  // predefined values.
  private _orEntry(path: SdfPath, editReason: EsfEditReason): void {
    const key = path.pathString
    const entry = this._hashMap.get(key)
    if (entry) {
      entry[1] = entry[1].or(editReason)
    } else {
      this._hashMap.set(key, [path, new EsfEditReason().orAssign(editReason)])
    }
  }

  /** operator== (journal.h:69-71). */
  Equals(other: EsfJournal): boolean {
    if (this._hashMap.size !== other._hashMap.size) {
      return false
    }
    for (const [key, [, reason]] of this._hashMap) {
      const otherEntry = other._hashMap.get(key)
      if (!otherEntry || otherEntry[1].notEquals(reason)) {
        return false
      }
    }
    return true
  }

  /** operator!= (journal.h:73-75). */
  notEquals(other: EsfJournal): boolean {
    return !this.Equals(other)
  }

  /** The iteration API (journal.h:77-111): begin()/end() as a JS iterable. */
  *[Symbol.iterator](): Iterator<EsfJournalValueType> {
    for (const entry of this._hashMap.values()) {
      yield [entry[0], entry[1]]
    }
  }
}
