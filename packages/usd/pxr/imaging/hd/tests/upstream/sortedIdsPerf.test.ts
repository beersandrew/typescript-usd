// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdSortedIdsPerf.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of testHdSortedIdsPerf.cpp (pxr/imaging/hd/testenv).
//
// The C++ harness is a scaling/timing benchmark: it builds a large 4-level path
// set ("/A/A/A/A".."/Z/Z/Z/Z" over first-level "ABYZ"), shuffles it, and times
// populate / scattered remove+reinsert / subtree rename passes. We have no use
// for the timings, so this is ported as a CORRECTNESS-AT-SCALE smoke test: at a
// few thousand paths, exercise the same operation mixes (scattered and subtree
// remove-then-reinsert, plus a rename) and assert GetIds() stays correctly
// sorted with the right membership and count. No timing assertions; stays fast.

import { describe, it, expect } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { comparePaths } from '../../src/primGather.ts'
import { Hd_SortedIds } from '../../src/sortedIds.ts'

const FIRST_LEVEL = ['A', 'B', 'Y', 'Z']

// 4 * 26 * 26 = 2704 three-level paths "/A/A/A".."/Z/Z/Z".
const INIT_PATHS: string[] = (() => {
  const out: string[] = []
  for (const f of FIRST_LEVEL) {
    for (let s = 'A'.charCodeAt(0); s <= 'Z'.charCodeAt(0); ++s) {
      for (let t = 'A'.charCodeAt(0); t <= 'Z'.charCodeAt(0); ++t) {
        out.push(`/${f}/${String.fromCharCode(s)}/${String.fromCharCode(t)}`)
      }
    }
  }
  return out
})()

// Deterministic scramble (seeded mulberry32 Fisher-Yates), like the C++ shuffle
// but seed-independent for reproducibility.
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

function populated(): Hd_SortedIds {
  const ids = new Hd_SortedIds()
  for (const s of scramble(INIT_PATHS, 9223000)) {
    ids.insert(SdfPath.fromString(s))
  }
  ids.getIds()
  return ids
}

const SORTED = INIT_PATHS.slice().sort()

describe('Hd_SortedIds perf-scale correctness', () => {
  it('populate: a few thousand scrambled inserts come back sorted and complete', () => {
    const ids = populated()
    const out = ids.getIds()
    expect(out.length).toBe(INIT_PATHS.length)
    expect(isSorted(out)).toBe(true)
    expect(asStrings(out)).toEqual(SORTED)
  })

  it('scattered remove-then-reinsert restores the full sorted set', () => {
    const ids = populated()

    // Take ~10% scattered (deterministic) and round-trip them.
    const picks = scramble(INIT_PATHS, 42).slice(0, Math.floor(INIT_PATHS.length / 10))

    for (const s of picks) ids.remove(SdfPath.fromString(s))
    ids.getIds() // force sort
    const afterRemove = ids.getIds()
    expect(isSorted(afterRemove)).toBe(true)
    expect(afterRemove.length).toBe(INIT_PATHS.length - picks.length)

    for (const s of picks) ids.insert(SdfPath.fromString(s))
    const afterReinsert = ids.getIds()
    expect(isSorted(afterReinsert)).toBe(true)
    expect(asStrings(afterReinsert)).toEqual(SORTED)
  })

  it('subtree remove-then-reinsert restores the full sorted set', () => {
    const ids = populated()

    const subtree = INIT_PATHS.filter((s) => s.startsWith('/B/Y/'))
    expect(subtree.length).toBeGreaterThan(0)

    for (const s of subtree) ids.remove(SdfPath.fromString(s))
    ids.getIds()
    const afterRemove = ids.getIds()
    expect(isSorted(afterRemove)).toBe(true)
    expect(afterRemove.length).toBe(INIT_PATHS.length - subtree.length)
    expect(asStrings(afterRemove)).toEqual(SORTED.filter((s) => !s.startsWith('/B/Y/')))

    for (const s of subtree) ids.insert(SdfPath.fromString(s))
    const afterReinsert = ids.getIds()
    expect(isSorted(afterReinsert)).toBe(true)
    expect(asStrings(afterReinsert)).toEqual(SORTED)
  })

  it('subtree rename (remove old + insert new in one batch) stays sorted', () => {
    const ids = populated()

    // Rename the /Z/Z subtree to /A/_Z, the way the C++ SubtreeRenameTest does:
    // queue interleaved Remove(old)/Insert(new), then sync.
    const renames = INIT_PATHS
      .filter((s) => s.startsWith('/Z/Z/'))
      .map((s) => [s, s.replace('/Z/Z/', '/A/_Z/')] as const)
    expect(renames.length).toBeGreaterThan(0)

    for (const [oldP, newP] of renames) {
      ids.remove(SdfPath.fromString(oldP))
      ids.insert(SdfPath.fromString(newP))
    }
    const out = ids.getIds()
    expect(isSorted(out)).toBe(true)
    expect(out.length).toBe(INIT_PATHS.length)

    const expected = INIT_PATHS
      .map((s) => (s.startsWith('/Z/Z/') ? s.replace('/Z/Z/', '/A/_Z/') : s))
      .sort()
    expect(asStrings(out)).toEqual(expected)
  })
})
