// Ported from OpenUSD 26.11.1: pxr/exec/exec/uncompilationTable.cpp,
//  pxr/exec/exec/uncompilationTable.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/uncompilationTable.h and
// uncompilationTable.cpp.
//
// The tbb::concurrent_map<SdfPath, shared_ptr<Exec_UncompilationRuleSet>> is
// ordered by SdfPath::operator<. Its JS counterpart is a Map keyed by the
// path string; UpdateForRecursiveResync, the only ordered traversal, sorts the
// matching entries with SdfPath.compare (SdfPath::operator<), which yields the
// same entries in the same order as upstream's lower_bound scan.

import { SdfPath } from 'typescript-usd/sdf/path'

import type { EsfJournal } from 'typescript-usd/esf'

import {
  Exec_InputUncompilationTarget, Exec_NodeUncompilationTarget,
} from './uncompilationTarget.ts'
import { Exec_UncompilationRuleSet } from './uncompilationRuleSet.ts'

interface _MapEntry {
  readonly path: SdfPath
  ruleSet: Exec_UncompilationRuleSet
}

/**
 * Maps scene objects to uncompilation rules (uncompilationTable.h:34-157).
 *
 * The table maps scene object paths to Exec_UncompilationRuleSets for that
 * path. The rule set then contains all Vdf objects to be uncompiled, and the
 * appropriate EsfEditReason for each.
 */
export class Exec_UncompilationTable {
  // Keyed by SdfPath.pathString.
  private readonly _ruleSets = new Map<string, _MapEntry>()

  /**
   * Inserts uncompilation rules for a VdfNode: the node with id `nodeId`
   * should be uncompiled for any scene change that matches an entry in the
   * `journal` (uncompilationTable.cpp:13-25).
   */
  addRulesForNode(nodeId: number, journal: EsfJournal): void {
    const target = new Exec_NodeUncompilationTarget(nodeId)

    for (const [path, editReasons] of journal) {
      this._findOrInsert(path).emplace_back(target, editReasons)
    }
  }

  /**
   * Inserts uncompilation rules for a VdfInput (uncompilationTable.cpp:27-45).
   */
  addRulesForInput(nodeId: number, inputName: string, journal: EsfJournal): void {
    // All rules created for this input *must* be copy-constructed from the
    // same Exec_InputUncompilationTarget. This ensures all the rules share a
    // common identity. The first of these rules to match a scene change will
    // invalidate the shared identity, which in turn will disable the
    // remaining rules constructed from this target.
    const target = new Exec_InputUncompilationTarget(nodeId, inputName)

    for (const [path, editReasons] of journal) {
      this._findOrInsert(path).emplace_back(target.Clone(), editReasons)
    }
  }

  /**
   * Locates the rule set for the given `path`. If not found, the returned
   * entry's rule set is null (uncompilationTable.cpp:47-57).
   */
  find(path: SdfPath): Exec_UncompilationTable.Entry {
    const found = this._ruleSets.get(path.pathString)
    if (found) {
      return new Exec_UncompilationTable.Entry(path, found.ruleSet)
    }
    return new Exec_UncompilationTable.Entry(path, null)
  }

  /**
   * Locates and removes all rule sets prefixed with the given `path`. Each
   * matching entry (path and rule set) is moved into the result
   * (uncompilationTable.cpp:59-72).
   */
  updateForRecursiveResync(path: SdfPath): Exec_UncompilationTable.Entry[] {
    const matching: _MapEntry[] = []
    for (const entry of this._ruleSets.values()) {
      if (entry.path.hasPrefix(path)) {
        matching.push(entry)
      }
    }
    matching.sort((a, b) => SdfPath.compare(a.path, b.path))

    const result: Exec_UncompilationTable.Entry[] = []
    for (const entry of matching) {
      result.push(new Exec_UncompilationTable.Entry(entry.path, entry.ruleSet))
      this._ruleSets.delete(entry.path.pathString)
    }
    return result
  }

  // Locates an existing rule set for `path`, or inserts a new empty rule set
  // if no such rule set exists (uncompilationTable.cpp:74-86).
  private _findOrInsert(path: SdfPath): Exec_UncompilationRuleSet {
    const found = this._ruleSets.get(path.pathString)
    if (found) {
      return found.ruleSet
    }
    const newRuleSet = new Exec_UncompilationRuleSet()
    this._ruleSets.set(path.pathString, { path, ruleSet: newRuleSet })
    return newRuleSet
  }
}

export namespace Exec_UncompilationTable {
  /**
   * Describes the result of a lookup into the uncompilation table
   * (uncompilationTable.h:89-121).
   */
  export class Entry {
    /** The rule set corresponds to the scene object at this path. */
    path: SdfPath

    /**
     * The rule set; ownership is shared by this object and the table that
     * created it.
     */
    ruleSet: Exec_UncompilationRuleSet | null

    constructor(path: SdfPath = SdfPath.emptyPath,
      ruleSet: Exec_UncompilationRuleSet | null = null) {
      this.path = path
      this.ruleSet = ruleSet
    }

    /** The entry evaluates true iff it contains a non-null rule set. */
    asBool(): boolean {
      return this.ruleSet !== null
    }
  }
}
