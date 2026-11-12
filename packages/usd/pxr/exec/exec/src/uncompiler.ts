// Ported from OpenUSD 26.11.1: pxr/exec/exec/uncompiler.cpp,
//  pxr/exec/exec/uncompiler.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/uncompiler.h and uncompiler.cpp.
//
// The std::visit visitors _IsValidTargetVisitor and _UncompileTargetVisitor
// (uncompiler.cpp:23-90) are private methods that dispatch on the target's
// class.

import type { SdfPath } from 'typescript-usd/sdf/path'

import { EsfEditReason } from 'typescript-usd/esf'

import type { Exec_Program } from './program.ts'
import type { Exec_Runtime } from './runtime.ts'
import type { Exec_UncompilationRuleSet } from './uncompilationRuleSet.ts'
import {
  Exec_NodeUncompilationTarget, type Exec_UncompilationTarget,
} from './uncompilationTarget.ts'

/** Performs uncompilation in response to scene changes (uncompiler.h:23-72). */
export class Exec_Uncompiler {
  private readonly _program: Exec_Program
  private readonly _runtime: Exec_Runtime
  private _didUncompile = false

  constructor(program: Exec_Program, runtime: Exec_Runtime) {
    this._program = program
    this._runtime = runtime
  }

  /**
   * Deletes portions of the compiled network when the given `editReasons`
   * have occurred for the scene object at `path` (uncompiler.cpp:92-133).
   * For recursive resyncs, this includes rules for all paths descending from
   * `path`.
   */
  uncompileForSceneChange(path: SdfPath, editReasons: EsfEditReason): void {
    if (editReasons.Equals(EsfEditReason.None)) {
      return
    }

    if (editReasons.and(EsfEditReason.ResyncedObject).asBool()) {
      // Resyncs are recursive, so we need to process resyncs for the changed
      // path, and for all descendant paths. This simultaneously removes the
      // matching rule sets from the uncompilation table.
      const tableEntries = this._program.extractUncompilationRuleSetsForResync(path)

      for (const tableEntry of tableEntries) {
        this._processUncompilationRuleSet(
          tableEntry.path,
          editReasons,
          tableEntry.ruleSet!)
      }
      return
    }

    // For non-resync changes, we only process a single rule set for the
    // changed path.
    const tableEntry = this._program.getUncompilationRuleSetForPath(path)

    // If there are no rules for this path, then there's nothing to do.
    if (!tableEntry.ruleSet) {
      return
    }

    this._processUncompilationRuleSet(
      tableEntry.path,
      editReasons,
      tableEntry.ruleSet)
  }

  /** Returns `true` if uncompilation resulted in changes to the network. */
  didUncompile(): boolean {
    return this._didUncompile
  }

  // Process a single `ruleSet` for `path` that has been changed by the given
  // `editReasons` (uncompiler.cpp:135-182). Once processed, rules are erased
  // from the `ruleSet`. Rules that refer to network objects that no longer
  // exist are also removed. Rules that do not match `editReasons` are
  // skipped.
  private _processUncompilationRuleSet(
    _path: SdfPath,
    editReasons: EsfEditReason,
    ruleSet: Exec_UncompilationRuleSet,
  ): void {
    let ruleSetIter = ruleSet.begin()
    while (ruleSetIter.notEquals(ruleSet.end())) {
      const rule = ruleSetIter.deref()

      // If the target of the rule is no longer valid, then we "garbage
      // collect" that rule from the rule set. This can happen if
      // uncompilation rules for another path uncompiled the same object in
      // the network.
      const isValidTarget = this._isValidTarget(rule.target)
      if (!isValidTarget) {
        if (editReasons.and(EsfEditReason.ResyncedObject).asBool()) {
          // If the change is a recursive resync, don't bother erasing the
          // individual rule, because the entire rule set is already going to
          // be destroyed.
          ruleSetIter.increment()
        } else {
          ruleSetIter = ruleSet.erase(ruleSetIter)
        }
        continue
      }

      // Skip this rule if its edit reasons are not applicable to this change.
      if (!rule.reasons.and(editReasons).asBool()) {
        ruleSetIter.increment()
        continue
      }

      // Uncompile the objects targeted by the rule.
      this._uncompileTarget(rule.target)
      this._didUncompile = true

      // The rule has triggered and is no longer valid.
      ruleSetIter = ruleSet.erase(ruleSetIter)
    }
  }

  // _IsValidTargetVisitor (uncompiler.cpp:23-56).
  private _isValidTarget(target: Exec_UncompilationTarget): boolean {
    // Exec_NodeUncompilationTarget is valid if its node id refers to an
    // existing node.
    if (target instanceof Exec_NodeUncompilationTarget) {
      return this._program.getNodeById(target.getNodeId()) !== null
    }

    // Exec_InputUncompilationTarget is valid if it has not been invalidated
    // by an earlier scene change, and it refers to a node that still exists
    // in the network.
    if (!target.isValid()) {
      return false
    }

    if (!this._program.getNodeById(target.getNodeId()!)) {
      // The node no longer exists. By invalidating the target here, other
      // rules for the same target don't need to re-check the existence of
      // the node.
      target.invalidate()
      return false
    }

    return true
  }

  // _UncompileTargetVisitor (uncompiler.cpp:58-90).
  private _uncompileTarget(target: Exec_UncompilationTarget): void {
    // Exec_NodeUncompilationTargets need to clear all runtime data associated
    // with the node before disconnecting and deleting the node.
    if (target instanceof Exec_NodeUncompilationTarget) {
      const node = this._program.getNodeById(target.getNodeId())!

      this._runtime.deleteData(node)
      this._program.disconnectAndDeleteNode(node)
      return
    }

    // Exec_InputUncompilationTarget needs to disconnect connections from the
    // targeted input.
    const node = this._program.getNodeById(target.getNodeId()!)!
    const input = node.getInput(target.getInputName()!)!

    this._program.disconnectInput(input)

    // Once the input has been uncompiled, we invalidate existing rules that
    // refer to the same input, so that they don't trigger on future scene
    // changes. When the input is recompiled, exec will create a new set of
    // rules for the input, which are not invalidated by this call.
    target.invalidate()
  }
}
