// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdSortedIds.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of testHdSortedIds.cpp (pxr/imaging/hd/testenv).
//
// The C++ test shuffles its path set with a clock-seeded RNG and dumps the
// post-sort result to golden .txt files; since it always SORTS before dumping,
// the observable output is deterministic regardless of seed. We port the
// observable contract instead of the file dumps: after any Insert/Remove
// sequence, GetIds() returns every current id in SdfPath order, multiset
// semantics (duplicates kept, Remove() drops one occurrence).
//
// The path set and ordering are the same the C++ builds: first-level chars
// "ABYZ", second-level 'A'..'Z' ("/A/A".."/Z/Z"), sorted by SdfPath's total
// order (which for these single-char prim paths is element-wise name order).

import { describe, it, expect } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { comparePaths } from '../../src/primGather.ts'
import { Hd_SortedIds } from '../../src/sortedIds.ts'

const FIRST_LEVEL = ['A', 'B', 'Y', 'Z']

// The full populate set, in canonical sorted order (first level A,B,Y,Z; second
// level A..Z). This is exactly what GetIds() must return after a populate.
const SORTED_POPULATE: string[] = (() => {
  const out: string[] = []
  for (const f of FIRST_LEVEL) {
    for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); ++c) {
      out.push(`/${f}/${String.fromCharCode(c)}`)
    }
  }
  return out
})()

// Deterministic scramble of a fixed input, so the test never depends on a seed
// yet exercises the unsorted insert path. Seeded Fisher-Yates (mulberry32).
function scramble<T>(items: T[], seed: number): T[] {
  const out = items.slice()
  let a = seed >>> 0
  const rand = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; --i) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function asStrings(paths: SdfPath[]): string[] {
  return paths.map((p) => p.pathString)
}

function isSorted(paths: SdfPath[]): boolean {
  for (let i = 1; i < paths.length; ++i) {
    if (comparePaths(paths[i - 1]!, paths[i]!) > 0) return false
  }
  return true
}

function populate(): Hd_SortedIds {
  const sortedIds = new Hd_SortedIds()
  for (const s of scramble(SORTED_POPULATE, 0x1234)) {
    sortedIds.insert(SdfPath.fromString(s))
  }
  sortedIds.getIds() // make sure list gets sorted
  return sortedIds
}

describe('Hd_SortedIds', () => {
  it('PopulateTest: scrambled inserts come back fully sorted', () => {
    const sortedIds = populate()
    expect(asStrings(sortedIds.getIds())).toEqual(SORTED_POPULATE)
  })

  it('SingleInsertTest: one insert after an initial sort lands in order', () => {
    const sortedIds = populate()
    sortedIds.getIds() // trigger initial sort

    sortedIds.insert(SdfPath.fromString('/I/J'))

    const expected = SORTED_POPULATE.slice()
    // /I sorts between /B and /Y.
    const at = expected.findIndex((s) => s > '/I')
    expected.splice(at, 0, '/I/J')
    expect(asStrings(sortedIds.getIds())).toEqual(expected)
  })

  it('MultiInsertTest: a batch of scrambled inserts merges in sorted', () => {
    const sortedIds = populate()
    sortedIds.getIds()

    const inserts: string[] = []
    for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); ++c) {
      inserts.push(`/I/${String.fromCharCode(c)}`)
    }
    for (const s of scramble(inserts, 7)) {
      sortedIds.insert(SdfPath.fromString(s))
    }

    const expected = [...SORTED_POPULATE, ...inserts].sort()
    expect(asStrings(sortedIds.getIds())).toEqual(expected)
  })

  it('RemoveTest: removing a subset keeps the list sorted with correct membership', () => {
    const sortedIds = populate()

    // Remove 10 specific ids (a fixed slice of the scrambled order).
    const removed = scramble(SORTED_POPULATE, 0x1234).slice(10, 20)
    for (const s of removed) {
      sortedIds.remove(SdfPath.fromString(s))
    }

    const ids = sortedIds.getIds()
    expect(isSorted(ids)).toBe(true)
    expect(ids.length).toBe(SORTED_POPULATE.length - 10)
    const present = new Set(asStrings(ids))
    for (const s of removed) expect(present.has(s)).toBe(false)
  })

  it('RemoveOnlyElementTest: remove the single element', () => {
    const sortedIds = new Hd_SortedIds()
    sortedIds.insert(SdfPath.fromString('/A/A'))
    sortedIds.getIds()
    sortedIds.remove(SdfPath.fromString('/A/A'))
    expect(asStrings(sortedIds.getIds())).toEqual([])
  })

  it('RemoveRangeTest: delete the /B subtree by index range', () => {
    const sortedIds = populate()
    const ids = sortedIds.getIds()

    const start = ids.findIndex((p) => comparePaths(p, SdfPath.fromString('/B')) >= 0)
    let end = ids.findIndex((p) => comparePaths(p, SdfPath.fromString('/C')) >= 0)
    end -= 1 // ranges are inclusive [start, end]

    sortedIds.removeRange(start, end)

    const expected = SORTED_POPULATE.filter((s) => !s.startsWith('/B/'))
    expect(asStrings(sortedIds.getIds())).toEqual(expected)
  })

  it('RemoveBatchTest: remove the /Y subtree one id at a time', () => {
    const sortedIds = populate()
    for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); ++c) {
      sortedIds.remove(SdfPath.fromString(`/Y/${String.fromCharCode(c)}`))
    }
    const expected = SORTED_POPULATE.filter((s) => !s.startsWith('/Y/'))
    expect(asStrings(sortedIds.getIds())).toEqual(expected)
  })

  it('RemoveAfterInsertNoSync: mixed remove/insert/remove without a sync between', () => {
    const sortedIds = populate()

    sortedIds.remove(SdfPath.fromString('/Z/A'))
    sortedIds.insert(SdfPath.fromString('/I/I'))
    sortedIds.remove(SdfPath.fromString('/I/I'))

    const expected = SORTED_POPULATE.filter((s) => s !== '/Z/A')
    expect(asStrings(sortedIds.getIds())).toEqual(expected)
  })

  it('RemoveLastItemTest: remove every id back to empty', () => {
    const sortedIds = populate()
    const paths = sortedIds.getIds().slice()
    for (let i = paths.length; i > 0; --i) {
      sortedIds.remove(paths[i - 1]!)
    }
    expect(asStrings(sortedIds.getIds())).toEqual([])
  })

  it('InsertRemoveDupesTest: multiset semantics, including no GetIds() between edits', () => {
    const P = (s: string) => SdfPath.fromString(s)
    const sortedIds = new Hd_SortedIds()

    sortedIds.insert(P('/B'))
    sortedIds.insert(P('/A'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/B'])

    sortedIds.insert(P('/B'))
    sortedIds.insert(P('/A'))
    sortedIds.insert(P('/B'))
    sortedIds.insert(P('/A'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/A', '/A', '/B', '/B', '/B'])

    sortedIds.remove(P('/B'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/A', '/A', '/B', '/B'])

    sortedIds.remove(P('/A'))
    sortedIds.remove(P('/B'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/A', '/B'])

    sortedIds.remove(P('/A'))
    sortedIds.remove(P('/B'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A'])

    sortedIds.remove(P('/A'))
    expect(asStrings(sortedIds.getIds())).toEqual([])

    // Insert and remove without calling GetIds() between.
    sortedIds.insert(P('/B'))
    sortedIds.insert(P('/B'))
    sortedIds.remove(P('/B'))
    sortedIds.insert(P('/A'))
    sortedIds.insert(P('/B'))
    sortedIds.insert(P('/A'))
    sortedIds.insert(P('/A'))
    sortedIds.remove(P('/B'))
    sortedIds.remove(P('/A'))
    sortedIds.remove(P('/A'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/B'])

    sortedIds.insert(P('/C'))
    sortedIds.remove(P('/B'))
    sortedIds.remove(P('/B'))
    sortedIds.insert(P('/C'))
    sortedIds.insert(P('/A'))
    sortedIds.insert(P('/B'))
    sortedIds.remove(P('/C'))
    sortedIds.insert(P('/C'))
    sortedIds.remove(P('/C'))
    sortedIds.remove(P('/A'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/B', '/C'])

    sortedIds.insert(P('/D'))
    sortedIds.remove(P('/D'))
    sortedIds.remove(P('/B'))
    expect(asStrings(sortedIds.getIds())).toEqual(['/A', '/C'])
  })
})
