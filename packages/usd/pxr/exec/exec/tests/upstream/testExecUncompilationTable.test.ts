// Ported from OpenUSD 26.11.1:
//  pxr/exec/exec/testenv/testExecUncompilationTable.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/testenv/testExecUncompilationTable.cpp
//
// ASSERT_EQ and TF_AXIOM become expect(). The test-only rule-set comparison
// (testExecUncompilationTable.cpp:47-115) compares the sets of distinct rules
// in the two rule sets; here each rule maps to a key string that is equal for
// two rules iff upstream's operator== holds for them.

import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { WorkParallelForN, WorkSetMaximumConcurrencyLimit } from 'typescript-usd/work'

import { EsfEditReason } from 'typescript-usd/esf'
import { EsfJournal } from 'typescript-usd/esf'
import {
  Exec_UncompilationRule, Exec_UncompilationRuleSet,
} from '../../src/uncompilationRuleSet.ts'
import { Exec_UncompilationTable } from '../../src/uncompilationTable.ts'
import {
  Exec_InputUncompilationTarget, Exec_NodeUncompilationTarget,
} from '../../src/uncompilationTarget.ts'

const _tokens = {
  input1: 'input1',
}

// testExecUncompilationTable.cpp:47-72: node targets compare by node id;
// input targets are equal only if both are valid and their node ids and input
// names are equal. An invalid input target equals no other target.
let _invalidTargetCount = 0
function _RuleKey(rule: Exec_UncompilationRule): string {
  const target = rule.target
  // EsfEditReason::operator== compares the bitmask, which GetHash() returns.
  const reasons = rule.reasons.getHash()
  if (target instanceof Exec_NodeUncompilationTarget) {
    return `Node(${target.getNodeId()}) ${reasons}`
  }
  if (!target.isValid()) {
    return `InvalidInput#${++_invalidTargetCount} ${reasons}`
  }
  return `Input(${target.getNodeId()}, ${target.getInputName()}) ${reasons}`
}

function _RuleSetKeys(ruleSet: Exec_UncompilationRuleSet): Set<string> {
  return new Set([...ruleSet].map(_RuleKey))
}

// testExecUncompilationTable.cpp:96-110. `expectedKeys` lets a caller that
// compares many rule sets against one expected set build its keys once.
function _RuleSetsEqual(
  a: Exec_UncompilationRuleSet, b: Exec_UncompilationRuleSet,
  expectedKeys?: Set<string>): boolean {
  const setA = _RuleSetKeys(a)
  const setB = expectedKeys ?? _RuleSetKeys(b)
  if (setA.size !== setB.size) return false
  for (const key of setA) {
    if (!setB.has(key)) return false
  }
  return true
}

// ASSERT_EQ(ruleSet, expected) (testExecUncompilationTable.cpp:29-39).
function ASSERT_EQ_RuleSet(
  ruleSet: Exec_UncompilationRuleSet, expected: Exec_UncompilationRuleSet,
  expectedKeys?: Set<string>): void {
  if (!_RuleSetsEqual(ruleSet, expected, expectedKeys)) {
    expect.fail(`Expected '${expected.getDescription()}'; got '${ruleSet.getDescription()}'`)
  }
}

function _Rule(
  target: Exec_NodeUncompilationTarget | Exec_InputUncompilationTarget,
  reasons: EsfEditReason,
): Exec_UncompilationRule {
  return new Exec_UncompilationRule(target, reasons)
}

describe('testExecUncompilationTable', () => {
  WorkSetMaximumConcurrencyLimit()

  // Test that we add uncompilation rules for each journal entry. If separate
  // journals add rules for the same path, those rules get inserted into the
  // same rule set.
  it('TestUncompilationTableInsertAndFind', () => {
    const table = new Exec_UncompilationTable()
    {
      // Node 0 sensitive to resyncs on /A and /B.
      const journal = new EsfJournal()
      journal.add(SdfPath.fromString('/A'), EsfEditReason.ResyncedObject)
      journal.add(SdfPath.fromString('/B'), EsfEditReason.ResyncedObject)
      table.addRulesForNode(0, journal)
    }
    {
      // Node 1 sensitive to resyncs on /B and /C.
      const journal = new EsfJournal()
      journal.add(SdfPath.fromString('/B'), EsfEditReason.ResyncedObject)
      journal.add(SdfPath.fromString('/C'), EsfEditReason.ResyncedObject)
      table.addRulesForNode(1, journal)
    }
    {
      // Input "input1" on node 0 sensitive to /A ChangedPropertyList
      const journal = new EsfJournal()
      journal.add(SdfPath.fromString('/A'), EsfEditReason.ChangedPropertyList)
      table.addRulesForInput(0, _tokens.input1, journal)
    }

    // Verify the contents of the table.
    {
      // Check hook set for /A.
      const entryA = table.find(SdfPath.fromString('/A'))
      expect(entryA.path.equals(SdfPath.fromString('/A'))).toBe(true)
      expect(entryA.ruleSet).toBeTruthy()
      const expected = new Exec_UncompilationRuleSet([
        _Rule(new Exec_NodeUncompilationTarget(0), EsfEditReason.ResyncedObject),
        _Rule(new Exec_InputUncompilationTarget(0, _tokens.input1),
          EsfEditReason.ChangedPropertyList),
      ])
      ASSERT_EQ_RuleSet(entryA.ruleSet!, expected)
    }
    {
      // Check hook set for /B.
      const entryB = table.find(SdfPath.fromString('/B'))
      expect(entryB.path.equals(SdfPath.fromString('/B'))).toBe(true)
      expect(entryB.ruleSet).toBeTruthy()
      const expected = new Exec_UncompilationRuleSet([
        _Rule(new Exec_NodeUncompilationTarget(0), EsfEditReason.ResyncedObject),
        _Rule(new Exec_NodeUncompilationTarget(1), EsfEditReason.ResyncedObject),
      ])
      ASSERT_EQ_RuleSet(entryB.ruleSet!, expected)
    }
    {
      // Check hook set for /C.
      const entryC = table.find(SdfPath.fromString('/C'))
      expect(entryC.path.equals(SdfPath.fromString('/C'))).toBe(true)
      expect(entryC.ruleSet).toBeTruthy()
      const expected = new Exec_UncompilationRuleSet([
        _Rule(new Exec_NodeUncompilationTarget(1), EsfEditReason.ResyncedObject),
      ])
      ASSERT_EQ_RuleSet(entryC.ruleSet!, expected)
    }
    {
      // Check hook set for /D. (It should not exist)
      const entryD = table.find(SdfPath.fromString('/D'))
      expect(entryD.path.equals(SdfPath.fromString('/D'))).toBe(true)
      expect(entryD.ruleSet).toBeFalsy()
    }
  })

  // Test that Exec_UncompilationRuleSet::erase is correct.
  it('TestUncompilationRuleSetErase', () => {
    // Initialize a rule set.
    const ruleSet = new Exec_UncompilationRuleSet([
      _Rule(new Exec_NodeUncompilationTarget(0), EsfEditReason.ResyncedObject),
      _Rule(new Exec_NodeUncompilationTarget(1), EsfEditReason.ResyncedObject),
      _Rule(new Exec_NodeUncompilationTarget(2), EsfEditReason.ResyncedObject),
      _Rule(new Exec_InputUncompilationTarget(0, _tokens.input1),
        EsfEditReason.ChangedPropertyList),
      _Rule(new Exec_InputUncompilationTarget(1, _tokens.input1),
        EsfEditReason.ChangedPropertyList),
      _Rule(new Exec_InputUncompilationTarget(2, _tokens.input1),
        EsfEditReason.ChangedPropertyList),
    ])

    // Erase elements that have nodeId == 2. (This also ensures we test the
    // corner case of erasing the last element.)
    const _Visitor = (target: Exec_UncompilationRule['target']): boolean => {
      if (target instanceof Exec_NodeUncompilationTarget) {
        return target.getNodeId() === 2
      }
      return target.isValid() && target.getNodeId() === 2
    }

    let it_ = ruleSet.begin()
    while (it_.notEquals(ruleSet.end())) {
      if (_Visitor(it_.deref().target)) {
        it_ = ruleSet.erase(it_)
        continue
      }
      it_.increment()
    }

    // Verify resulting rule set
    const expected = new Exec_UncompilationRuleSet([
      _Rule(new Exec_NodeUncompilationTarget(0), EsfEditReason.ResyncedObject),
      _Rule(new Exec_NodeUncompilationTarget(1), EsfEditReason.ResyncedObject),
      _Rule(new Exec_InputUncompilationTarget(0, _tokens.input1),
        EsfEditReason.ChangedPropertyList),
      _Rule(new Exec_InputUncompilationTarget(1, _tokens.input1),
        EsfEditReason.ChangedPropertyList),
    ])
    ASSERT_EQ_RuleSet(ruleSet, expected)
  })

  // Test that UpdateForRecursiveResync removes the correct rule sets from the
  // uncompilation table, and that unrelated rule sets are not removed.
  it('TestUncompilationTableUpdateForRecursiveResync', () => {
    const parent = SdfPath.fromString('/Parent')
    const child1 = SdfPath.fromString('/Parent/Child1')
    const child1Attr = SdfPath.fromString('/Parent/Child1.attr')
    const child2 = SdfPath.fromString('/Parent/Child2')
    const other = SdfPath.fromString('/Other')
    const otherChild = SdfPath.fromString('/Other/Child')

    const table = new Exec_UncompilationTable()

    // Node `nodeId` sensitive to resync on `path`.
    const insertRules = (path: SdfPath, nodeId: number): void => {
      const journal = new EsfJournal()
      journal.add(path, EsfEditReason.ResyncedObject)
      table.addRulesForNode(nodeId, journal)
    }
    insertRules(parent, 0)
    insertRules(child1, 1)
    insertRules(child1Attr, 2)
    insertRules(child2, 3)
    insertRules(other, 4)
    insertRules(otherChild, 5)

    // Handle a recursive resync on /Parent.
    const removedEntries = table.updateForRecursiveResync(parent)

    // Expected to have removed entries for /Parent, and all descendants.
    const verifyRemovedEntry = (entryIndex: number, path: SdfPath, nodeId: number): void => {
      expect(removedEntries[entryIndex]!.path.pathString).toBe(path.pathString)
      const expected = new Exec_UncompilationRuleSet([
        _Rule(new Exec_NodeUncompilationTarget(nodeId), EsfEditReason.ResyncedObject),
      ])
      expect(removedEntries[entryIndex]!.ruleSet).not.toBeNull()
      ASSERT_EQ_RuleSet(removedEntries[entryIndex]!.ruleSet!, expected)
    }
    expect(removedEntries.length).toBe(4)
    verifyRemovedEntry(0, parent, 0)
    verifyRemovedEntry(1, child1, 1)
    verifyRemovedEntry(2, child1Attr, 2)
    verifyRemovedEntry(3, child2, 3)

    // Searching the table for any of the removed paths should return null
    // rule sets.
    expect(table.find(parent).ruleSet).toBeNull()
    expect(table.find(child1).ruleSet).toBeNull()
    expect(table.find(child1Attr).ruleSet).toBeNull()
    expect(table.find(child2).ruleSet).toBeNull()

    // Rule sets remain in the table for /Other and /Other/Child.
    let entry = table.find(other)
    const expectedRuleSetOther = new Exec_UncompilationRuleSet([
      _Rule(new Exec_NodeUncompilationTarget(4), EsfEditReason.ResyncedObject),
    ])
    expect(entry.asBool()).toBe(true)
    expect(entry.path.pathString).toBe(other.pathString)
    ASSERT_EQ_RuleSet(entry.ruleSet!, expectedRuleSetOther)

    entry = table.find(otherChild)
    const expectedRuleSetOtherChild = new Exec_UncompilationRuleSet([
      _Rule(new Exec_NodeUncompilationTarget(5), EsfEditReason.ResyncedObject),
    ])
    expect(entry.asBool()).toBe(true)
    expect(entry.path.pathString).toBe(otherChild.pathString)
    ASSERT_EQ_RuleSet(entry.ruleSet!, expectedRuleSetOtherChild)
  })

  // Tests that we can add rules to the uncompilation table concurrently from
  // many threads. With one thread, WorkParallelForN runs its serial branch.
  it('TestConcurrency', () => {
    const NUM_PATHS = 5_000
    const NUM_NODES = 10_000

    // Build up a large journal with NUM_PATHS entries, each for
    // ResyncedObject on a unique path.
    const journal = new EsfJournal()
    const uniquePath = (i: number): SdfPath => SdfPath.fromString(`/Prim_${i}`)
    for (let i = 0; i < NUM_PATHS; i++) {
      journal.add(uniquePath(i), EsfEditReason.ResyncedObject)
    }

    // Simulate the compilation of NUM_NODES VdfNodes. Each task i in
    // [0, NUM_NODES) bills the journal to a node with id = i.
    const table = new Exec_UncompilationTable()
    WorkParallelForN(NUM_NODES, (nodeIdBegin, nodeIdEnd) => {
      for (let nodeId = nodeIdBegin; nodeId < nodeIdEnd; ++nodeId) {
        table.addRulesForNode(nodeId, journal)
      }
    })

    // Verify the final state of the uncompilation table. We should have the
    // same rule set for each unique path.
    const expectedRuleSet = new Exec_UncompilationRuleSet()
    for (let i = 0; i < NUM_NODES; ++i) {
      expectedRuleSet.emplace_back(
        new Exec_NodeUncompilationTarget(i),
        EsfEditReason.ResyncedObject)
    }
    const expectedKeys = _RuleSetKeys(expectedRuleSet)
    WorkParallelForN(NUM_PATHS, (pathIdBegin, pathIdEnd) => {
      for (let pathId = pathIdBegin; pathId < pathIdEnd; ++pathId) {
        const path = uniquePath(pathId)
        const entry = table.find(path)
        expect(entry.asBool()).toBe(true)
        expect(entry.path.pathString).toBe(path.pathString)
        ASSERT_EQ_RuleSet(entry.ruleSet!, expectedRuleSet, expectedKeys)
      }
    })
  }, 600_000)
})
