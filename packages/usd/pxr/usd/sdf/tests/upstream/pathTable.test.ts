// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pathTable.h,
//  pxr/usd/sdf/testenv/testSdfPathTable.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfPathTable.cpp (DoUnitTest).
//
// SdfPathTable<T> is a prefix-keyed (trie) container over absolute SdfPaths:
//   - inserting a path implicitly inserts all of its ancestors;
//   - erasing a path implicitly erases all of its descendants;
//   - iteration is a preordering (parent immediately precedes its subtree),
//     so the subtree rooted at p is a contiguous range (FindSubtreeRange).
//
// typescript-usd has SdfPath (with full parent/prefix algebra) but NO SdfPathTable
// container. This file is the faithful behavioral port; it drives the
// container API the orchestrator must add (see report). Every size() / count()
// golden was confirmed against the Pixar usd-2605 build via pxr.Sdf path
// prefix algebra (GetPrefixes/HasPrefix) — SdfPathTable itself has no Python
// binding, so the structural goldens come from the ancestor-closure of the
// same insert sequence.
//
// API exercised (idiomatic TS mirror of pathTable.h):
//   new SdfPathTable<T>()
//   .size (getter)              <- size()
//   .empty()                    <- empty()
//   .insert(key, value)         -> { inserted, key, value }   (pair<iter,bool>)
//   .get(key)                   -> T | undefined              (find()->second)
//   .set(key, value)            <- operator[] = (assign)
//   .has(key) / .count(key)     <- find()!=end() / count()
//   .erase(key)                 -> boolean
//   .findSubtreeRange(key)      -> Array<[SdfPath, T]>        (FindSubtreeRange)
//   .entries() / [Symbol.iterator]() -> Iterable<[SdfPath,T]> (preorder)
//   .hasChild(key)              <- iterator.HasChild()
//   .clone()                    <- copy ctor / copy assign
//   .swap(other)                <- swap()  (also models move)
//   .clear() / .clearInParallel()
//   .parallelForEach(fn)        <- ParallelForEach; fn may RETURN a new value
//                                  to update the mapped object (non-const form)

import { describe, expect, it } from 'vitest'
import { PathTable as SdfPathTable } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'

const P = (s: string): SdfPath => SdfPath.fromString(s)

// Count occurrences of a key within a subtree range (mirrors test's Count()).
function countInRange(range: Array<[SdfPath, string]>, p: SdfPath): number {
  return range.filter(([k]) => k.equals(p)).length
}

describe('SdfPathTable', () => {
  it('begins empty', () => {
    const table = new SdfPathTable<string>()
    expect(table.empty()).toBe(true)
    expect(table.size).toBe(0)
    expect([...table.entries()]).toEqual([])
  })

  it('copy, erase-subtree, swap, move, clear (table2/3/4 block)', () => {
    const table = new SdfPathTable<string>()

    // Copy construct an empty table.
    const table2 = table.clone()
    expect(table2.empty()).toBe(true)
    expect(table2.size).toBe(0)

    // Inserting a path implicitly inserts all ancestors.
    expect(table2.insert(P('/a/b/c/d'), '').inserted).toBe(true)
    expect(table2.insert(P('/a/b/x/y'), '').inserted).toBe(true)
    // closure: /, /a, /a/b, /a/b/c, /a/b/c/d, /a/b/x, /a/b/x/y  (golden: 7)
    expect(table2.size).toBe(7)

    // Copy via assignment.
    let table3 = table2.clone()
    expect(table3.size).toBe(7)

    // Erase a subtree — removes /a/b and all descendants, leaving {/, /a}.
    table3.erase(P('/a/b'))
    expect(table3.size).toBe(2)
    expect(table2.size).toBe(7)

    // Swap.
    table3.swap(table2)
    expect(table2.size).toBe(2)
    expect(table3.size).toBe(7)

    // Move (modeled via swap into/out of fresh tables).
    const table4 = new SdfPathTable<string>()
    table4.swap(table3) // move-construct table4 from table3
    expect(table2.size).toBe(2)
    expect(table3.empty()).toBe(true)
    expect(table4.size).toBe(7)
    table3 = new SdfPathTable<string>()
    table3.swap(table4) // move-assign table4 into table3
    expect(table3.size).toBe(7)

    // Clear.
    table2.clear()
    table3.clear()
    expect(table2.empty() && table3.empty()).toBe(true)
  })

  it('runs the main unit test (insert/find/range/erase/parallel)', () => {
    const table = new SdfPathTable<string>()

    // Insertion implicitly inserts ancestors: /, /foo, /foo/bar -> size 3.
    let result = table.insert(P('/foo/bar'), '/foo/bar')
    expect(result.inserted).toBe(true)
    expect(result.key.equals(P('/foo/bar'))).toBe(true)
    expect(result.value).toBe('/foo/bar')
    expect(table.size).toBe(3)
    expect(table.empty()).toBe(false)

    result = table.insert(P('/baz'), '/baz')
    expect(result.inserted).toBe(true)
    expect(result.value).toBe('/baz')
    expect(table.size).toBe(4)

    // Insert /foo/node (parent /foo already present) -> size 5.
    result = table.insert(P('/foo/node'), '/foo/node')
    expect(result.inserted).toBe(true)
    expect(result.key.equals(P('/foo/node'))).toBe(true)
    expect(result.value).toBe('/foo/node')
    expect(table.size).toBe(5)

    // Duplicate insert fails and does not overwrite; size unchanged.
    const dup = table.insert(P('/foo/node'), 'dupe')
    expect(dup.inserted).toBe(false)
    expect(dup.key.equals(P('/foo/node'))).toBe(true)
    expect(dup.value).toBe('/foo/node') // existing value, not 'dupe'
    expect(table.size).toBe(5)

    // Erase that node -> size 4.
    table.erase(P('/foo/node'))
    expect(table.size).toBe(4)

    // Implicit ancestor insertion (4 new: /foo/anim, .../chars,
    // .../MeridaGroup, .../Merida) -> size 8.
    result = table.insert(P('/foo/anim/chars/MeridaGroup/Merida'), 'Merida')
    expect(result.inserted).toBe(true)
    expect(result.key.equals(P('/foo/anim/chars/MeridaGroup/Merida'))).toBe(true)
    expect(result.value).toBe('Merida')
    expect(table.size).toBe(8)

    result = table.insert(P('/foo/sets/Castle'), 'Castle') // +2 -> 10
    expect(result.inserted).toBe(true)
    expect(result.value).toBe('Castle')
    expect(table.size).toBe(10)

    result = table.insert(P('/foo/anim/chars/AngusGroup/Angus'), 'Angus') // +2 -> 12
    expect(result.inserted).toBe(true)
    expect(table.size).toBe(12)

    // operator[] assignment.
    table.set(P('/foo/anim/chars/MeridaGroup/MeridaBow'), 'MeridaBow')
    expect(table.count(P('/foo/anim/chars/MeridaGroup/MeridaBow'))).toBe(1)
    expect(table.size).toBe(13)

    table.set(P('/foo/anim/chars/MeridaGroup/MeridaSword'), 'MeridaSword')
    expect(table.count(P('/foo/anim/chars/MeridaGroup/MeridaSword'))).toBe(1)
    expect(table.size).toBe(14)

    // find / get.
    expect(table.has(P('/foo/sets/Castle'))).toBe(true)
    expect(table.get(P('/foo/sets/Castle'))).toBe('Castle')
    // Implicitly-created ancestor has an empty value.
    expect(table.has(P('/foo'))).toBe(true)
    expect(table.get(P('/foo'))).toBe('')

    // FindSubtreeRange.
    // No such path -> empty range.
    expect(table.findSubtreeRange(P('/no/such/path/in/table'))).toEqual([])

    // Root -> the whole table.
    expect(table.findSubtreeRange(P('/')).length).toBe(table.size)

    // /foo/anim/chars -> exactly its 7-node subtree.
    const range = table.findSubtreeRange(P('/foo/anim/chars'))
    expect(range.length).toBe(7)
    for (const p of [
      '/foo/anim/chars',
      '/foo/anim/chars/MeridaGroup',
      '/foo/anim/chars/MeridaGroup/Merida',
      '/foo/anim/chars/AngusGroup',
      '/foo/anim/chars/AngusGroup/Angus',
      '/foo/anim/chars/MeridaGroup/MeridaBow',
      '/foo/anim/chars/MeridaGroup/MeridaSword',
    ]) {
      expect(countInRange(range, P(p))).toBe(1)
    }
    // Every key in the range is prefixed by (or equal to) the query path.
    for (const [k] of range) {
      expect(k.hasPrefix(P('/foo/anim/chars'))).toBe(true)
    }

    // Build a plain map from the table's iteration; sizes agree, every key present.
    const pathMap = new Map<string, string>([...table.entries()].map(([k, v]) => [k.pathString, v]))
    expect(pathMap.size).toBe(table.size)
    for (const key of pathMap.keys()) {
      expect(table.count(P(key))).toBe(1)
    }

    // erase: subtree removal returns true, missing path returns false.
    expect(table.erase(P('/foo/anim'))).toBe(true)
    expect(table.erase(P('/foo/sets'))).toBe(true)
    expect(table.erase(P('/NotPresentInTable'))).toBe(false)

    table.erase(P('/baz'))
    table.erase(P('/'))
    expect(table.empty()).toBe(true)
    expect(table.size).toBe(0)
  })

  it('builds a large table, clears in parallel, and parallel-iterates', () => {
    const build = (table: SdfPathTable<string>) => {
      for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
        const ch = String.fromCharCode(c)
        for (let d = '0'.charCodeAt(0); d <= '9'.charCodeAt(0); d++) {
          const n = String.fromCharCode(d)
          const seg = ch + n
          table.insert(P(`/${seg}/${seg}/${seg}/${seg}`), ch)
        }
      }
    }

    const table = new SdfPathTable<string>()
    build(table)
    // 1 root + 26 letters * 10 digits * 4 depth distinct nodes = 1041.
    expect(table.size).toBe(1 + 26 * 10 * 4)

    table.clearInParallel()
    expect(table.empty()).toBe(true)
    expect(table.size).toBe(0)

    build(table)

    // const parallel for-each: count entries whose value is "z".
    let zCount = 0
    table.parallelForEach((_p, v) => { if (v === 'z') zCount++ })
    expect(zCount).toBe(10)

    // non-const parallel for-each: update mapped value by returning it.
    table.parallelForEach((p, _v) => { if (p.name === 'a2') return 'found' })
    expect(table.get(P('/a2/a2/a2/a2'))).toBe('found')
    expect(table.get(P('/a3/a3/a3/a3'))).toBe('a')

    // iterator.HasChild()
    expect(table.hasChild(P('/a2/a2/a2'))).toBe(true)
    expect(table.hasChild(P('/a2/a2/a2/a2'))).toBe(false)
  })
})
