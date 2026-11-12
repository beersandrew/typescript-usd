// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfListOp.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfListOp.py.

import { describe, expect, it } from 'vitest'
import { Hash as TfHash } from 'typescript-usd/tf'
import { ListOp } from '../../src/index.ts'

// Sdf.IntListOp is SdfListOp<int>.
type IntListOp = ListOp<number>

function _ExplicitItems(l: readonly number[]): IntListOp {
  return ListOp.createExplicit(l)
}
function _AddedItems(l: readonly number[]): IntListOp {
  const r = new ListOp<number>()
  r.setAddedItems(l)
  return r
}
function _PrependedItems(l: readonly number[]): IntListOp {
  return ListOp.create(l)
}
function _AppendedItems(l: readonly number[]): IntListOp {
  return ListOp.create([], l)
}
function _DeletedItems(l: readonly number[]): IntListOp {
  return ListOp.create([], [], l)
}
function _OrderedItems(l: readonly number[]): IntListOp {
  const r = new ListOp<number>()
  r.setOrderedItems(l)
  return r
}

// SdfListOp::ApplyOperations(const SdfListOp& inner) (listOp.h): the
// composed list op, or std::nullopt (Python None) when it cannot compose.
type ComposingListOp = { applyOperations(inner: IntListOp): IntListOp | undefined }
function applyOp(a: IntListOp, inner: IntListOp): IntListOp | undefined {
  return (a as unknown as ComposingListOp).applyOperations(inner)
}

describe('testSdfListOp', () => {
  it('test_Basics', () => {
    // Test basic behaviors across all ListOp types. Each Python ListOp type
    // (dir(Sdf) names ending in "ListOp") is an instantiation of SdfListOp.
    const listOpTypes = [
      'Int64ListOp', 'IntListOp', 'PathListOp', 'PayloadListOp', 'ReferenceListOp', 'StringListOp',
      'TokenListOp', 'UInt64ListOp', 'UIntListOp', 'UnregisteredValueListOp',
    ]

    for (const t of listOpTypes) {
      const listOp = ListOp.create<unknown>()
      expect(listOp.isExplicit(), t).toBe(false)

      const explicitListOp = ListOp.createExplicit<unknown>()
      expect(explicitListOp.isExplicit(), t).toBe(true)

      expect(listOp.equals(explicitListOp), t).toBe(false)
      expect(String(listOp), t).not.toBe(String(explicitListOp))
    }
  })

  it('test_BasicSemantics', () => {
    // Default empty listop does nothing.
    expect(new ListOp<number>()
      .applyOperations([]))
      .toEqual([])

    // Explicit items replace whatever was there previously.
    expect(_ExplicitItems([1, 2, 3])
      .applyOperations([]))
      .toEqual([1, 2, 3])
    expect(_ExplicitItems([1, 2, 3])
      .applyOperations([0, 3]))
      .toEqual([1, 2, 3])
    expect(_ExplicitItems([1, 2, 1, 3])
      .applyOperations([]))
      .toEqual([1, 2, 3])

    // Ensure duplicates are removed when using setter methods.
    expect(_ExplicitItems([1])
      .getExplicitItems())
      .toEqual([1])
    expect(_ExplicitItems([1, 1])
      .getExplicitItems())
      .toEqual([1])
    expect(_ExplicitItems([1, 2, 3])
      .getExplicitItems())
      .toEqual([1, 2, 3])
    expect(_ExplicitItems([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11])
      .getExplicitItems())
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(_ExplicitItems([1, 2, 1, 3])
      .getExplicitItems())
      .toEqual([1, 2, 3])
    expect(_DeletedItems([1, 2, 1, 3])
      .getDeletedItems())
      .toEqual([1, 2, 3])
    expect(_AppendedItems([1, 2, 1, 3])
      .getAppendedItems())
      .toEqual([2, 1, 3])
    expect(_PrependedItems([1, 2, 1, 3])
      .getPrependedItems())
      .toEqual([1, 2, 3])

    // (deprecated)"Add" leaves existing values in place and appends any new values.
    expect(_AddedItems([1, 2, 3])
      .applyOperations([]))
      .toEqual([1, 2, 3])
    expect(_AddedItems([1, 2, 3])
      .applyOperations([3, 2, 1]))
      .toEqual([3, 2, 1])
    expect(_AddedItems([1, 2, 3])
      .applyOperations([0, 3]))
      .toEqual([0, 3, 1, 2])

    // "Delete" removes values and leaves the rest in place, in order.
    expect(_DeletedItems([1, 2, 3])
      .applyOperations([]))
      .toEqual([])
    expect(_DeletedItems([1, 2, 3])
      .applyOperations([0, 3, 5]))
      .toEqual([0, 5])
    expect(_DeletedItems([1, 2, 3])
      .applyOperations([1024, 1]))
      .toEqual([1024])

    // "Append" adds the given items to the end of the list, moving
    // them if they existed previously.
    expect(_AppendedItems([1, 2, 3])
      .applyOperations([]))
      .toEqual([1, 2, 3])
    expect(_AppendedItems([1, 2, 3])
      .applyOperations([2]))
      .toEqual([1, 2, 3])
    expect(_AppendedItems([1, 2, 3])
      .applyOperations([3, 4]))
      .toEqual([4, 1, 2, 3])
    expect(_AppendedItems([1, 2, 1, 3])
      .applyOperations([]))
      .toEqual([2, 1, 3])

    // "Prepend" is similar, but for the front of the list.
    expect(_PrependedItems([1, 2, 3])
      .applyOperations([]))
      .toEqual([1, 2, 3])
    expect(_PrependedItems([1, 2, 3])
      .applyOperations([2]))
      .toEqual([1, 2, 3])
    expect(_PrependedItems([1, 2, 3])
      .applyOperations([0, 1]))
      .toEqual([1, 2, 3, 0])
    expect(_PrependedItems([1, 2, 1, 3])
      .applyOperations([]))
      .toEqual([1, 2, 3])

    // (deprecated) "Order" is the most subtle.
    expect(_OrderedItems([1, 2, 3])
      .applyOperations([]))
      .toEqual([])
    expect(_OrderedItems([1, 2, 3])
      .applyOperations([2]))
      .toEqual([2])
    expect(_OrderedItems([1, 2, 3])
      .applyOperations([2, 1]))
      .toEqual([1, 2])
    expect(_OrderedItems([1, 2, 3])
      .applyOperations([2, 4, 1]))
      .toEqual([1, 2, 4])
    // Values that were not mentioned in the "ordered items" list
    // will end up in a position that depends on their position relative
    // to the nearest surrounding items that are in the ordered items list.
    expect(_OrderedItems([1, 2, 3])
      .applyOperations([0, 2, 4, 1, 5, 3]))
      .toEqual([0, 1, 5, 2, 4, 3])
  })

  // The exhaustive check runs ~1.7M compositions; allow it more than the
  // default per-test timeout.
  it('test_Compose', () => {
    // Confirm that listops using add or reorder are not composable.
    expect(applyOp(_OrderedItems([1, 2, 3]), _ExplicitItems([1, 2])))
      .toBeUndefined()
    expect(applyOp(_AddedItems([1, 2, 3]), _ExplicitItems([1, 2])))
      .toBeUndefined()
    // Explicit ops are composable over anything.
    expect(applyOp(_ExplicitItems([1, 2, 3]), _OrderedItems([1]))?.equals(
      _ExplicitItems([1, 2, 3]))).toBe(true)
    expect(applyOp(_ExplicitItems([1, 2, 3]), _AddedItems([1]))?.equals(
      _ExplicitItems([1, 2, 3]))).toBe(true)

    //
    // Exhaustive check of A(B(x)) == C(x), where C = A(B).
    //
    // itertools.combinations(s, r)
    function combinations<T>(s: readonly T[], r: number): T[][] {
      if (r === 0) return [[]]
      const out: T[][] = []
      for (let i = 0; i <= s.length - r; i++) {
        for (const rest of combinations(s.slice(i + 1), r - 1)) out.push([s[i]!, ...rest])
      }
      return out
    }
    // itertools.permutations(s)
    function permutations<T>(s: readonly T[]): T[][] {
      if (s.length === 0) return [[]]
      const out: T[][] = []
      for (let i = 0; i < s.length; i++) {
        for (const rest of permutations([...s.slice(0, i), ...s.slice(i + 1)])) out.push([s[i]!, ...rest])
      }
      return out
    }
    // itertools.combinations_with_replacement(s, r)
    function combinationsWithReplacement<T>(s: readonly T[], r: number): T[][] {
      if (r === 0) return [[]]
      const out: T[][] = []
      for (let i = 0; i < s.length; i++) {
        for (const rest of combinationsWithReplacement(s.slice(i), r - 1)) out.push([s[i]!, ...rest])
      }
      return out
    }
    function powerset<T>(s: readonly T[]): T[][] {
      const out: T[][] = []
      for (let r = 0; r <= s.length; r++) out.push(...combinations(s, r))
      return out
    }
    function generate_lists(num = 3): number[][] {
      const lists: number[][] = []
      for (const subset of powerset([...Array(num).keys()])) {
        for (const perm of permutations(subset)) lists.push(perm)
      }
      return lists
    }
    function generate_composable_listops(num = 3): IntListOp[] {
      const lists = generate_lists(num)
      const ops: IntListOp[] = []
      for (const explicit of lists) ops.push(_ExplicitItems(explicit))
      for (const [a, b, c] of combinationsWithReplacement(lists, 3)) {
        const op = new ListOp<number>()
        op.setAppendedItems(a!)
        op.setPrependedItems(b!)
        op.setDeletedItems(c!)
        ops.push(op)
      }
      return ops
    }
    const ops = generate_composable_listops(3)
    const lists = generate_lists(2)
    for (const [a, b] of combinationsWithReplacement(ops, 2)) {
      const c = applyOp(a!, b!)!
      for (const l of lists) {
        expect(a!.applyOperations(b!.applyOperations(l))).toEqual(c.applyOperations(l))
      }
    }
  }, 120_000)

  it('test_HasItem', () => {
    const a = [1, 2, 3]

    let listOp = _ExplicitItems(a)
    for (const v of a) expect(listOp.hasItem(v)).toBe(true)
    expect(listOp.hasItem(4)).toBe(false)

    listOp = _AddedItems(a)
    for (const v of a) expect(listOp.hasItem(v)).toBe(true)
    expect(listOp.hasItem(4)).toBe(false)

    listOp = _PrependedItems(a)
    for (const v of a) expect(listOp.hasItem(v)).toBe(true)
    expect(listOp.hasItem(4)).toBe(false)

    listOp = _AppendedItems(a)
    for (const v of a) expect(listOp.hasItem(v)).toBe(true)
    expect(listOp.hasItem(4)).toBe(false)

    listOp = _OrderedItems(a)
    for (const v of a) expect(listOp.hasItem(v)).toBe(true)
    expect(listOp.hasItem(4)).toBe(false)

    listOp = _DeletedItems(a)
    for (const v of a) expect(listOp.hasItem(v)).toBe(true)
    expect(listOp.hasItem(4)).toBe(false)
  })

  it('test_Hash', () => {
    const listOp = ListOp.create<number>([0, 8, 9], [1, 2, 3], [-1, -2])
    expect(TfHash(listOp)).toBe(TfHash(listOp))
    expect(TfHash(listOp)).toBe(TfHash(
      ListOp.create<number>(
        listOp.getPrependedItems(),
        listOp.getAppendedItems(),
        listOp.getDeletedItems(),
      ),
    ))
  })

  // Sanity test for binding, ApplyOperation logic exhaustively tested above
  it('test_GetAppliedItems', () => {
    const e = [1, 2, 3]
    let listOp = _ExplicitItems(e)
    let items = listOp.getAppliedItems()
    expect(items).toEqual(e)

    const p = [4, 5, 6]
    const a = [7, 8, 9]
    listOp = ListOp.create<number>(p, a)
    items = listOp.getAppliedItems()
    expect(items).toEqual([...p, ...a])
  })
})
