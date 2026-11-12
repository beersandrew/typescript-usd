// Ported from OpenUSD 26.11.1: pxr/base/tf/stringUtils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The ASCII fast path of dictionaryLessThan (TfDictionaryLessThan's inline
// first-byte test, stringUtils.h:531-549, and a _LessImpl that reads code
// units) must order every pair of strings exactly as the previous
// implementation, which encoded both strings to UTF-8 on each comparison.
// That implementation is kept below verbatim as the reference; the upstream
// orderings themselves are pinned by upstream/stringUtils.test.ts.
import { describe, expect, it } from 'vitest'
import { dictionaryLessThan } from '../src/stringUtils.ts'

// ---- previous implementation (stringUtils.ts before the fast path) ----
const enc = new TextEncoder()

// A string's UTF-8 bytes: the string itself when it is all ASCII (its code
// units are then its bytes), otherwise its encoding. Most USD names are
// ASCII, so comparisons usually allocate nothing.
type Bytes = Uint8Array | string

function utf8Bytes(str: string): Bytes {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) >= 0x80) return enc.encode(str)
  }
  return str
}

// Read the UTF-8 byte at index, mirroring C++ reads past the end of a
// null-terminated std::string (c_str()[size()] == '\0').
function byteAt(b: Bytes, i: number): number {
  if (i >= b.length) return 0
  return typeof b === 'string' ? b.charCodeAt(i) : b[i]!
}

// '0'..'9'
function isDigit(ch: number): boolean {
  return ch >= 0x30 && ch <= 0x39
}

// ASCII letter, case-insensitive: ((ch & ~0x20) - 'A') < 26
function isAlpha(ch: number): boolean {
  const u = ch & ~0x20
  return u >= 0x41 && u <= 0x5a
}

// Like std::mismatch over bytes: advance both cursors in lockstep while the
// bytes match and `lcur` has not reached `curEnd`. Returns the diverged cursors.
function mismatch(
  L: Bytes,
  lcur: number,
  curEnd: number,
  R: Bytes,
  rcur: number,
): [number, number] {
  while (lcur < curEnd && byteAt(L, lcur) === byteAt(R, rcur)) {
    lcur++
    rcur++
  }
  return [lcur, rcur]
}

// Faithful port of TfDictionaryLessThan::_LessImpl. Operates on UTF-8 bytes so
// non-ASCII code points order by their byte sequence, as upstream does.
function previousDictionaryLessThan(lstr: string, rstr: string): boolean {
  const L = utf8Bytes(lstr)
  const R = utf8Bytes(rstr)
  const lsize = L.length
  const rsize = R.length
  const lend = lsize
  const rend = rsize

  let lcur = 0
  let rcur = 0
  let curEnd = Math.min(lsize, rsize)

  // Find the next differing byte.
  ;[lcur, rcur] = mismatch(L, lcur, curEnd, R, rcur)
  // Identical strings: not less.
  if (lcur === curEnd && lsize === rsize) return false

  let l: number
  let r: number

  while (true) {
    if (lcur === curEnd) break
    l = byteAt(L, lcur)
    r = byteAt(R, rcur)

    // If they are ASCII letters that differ disregarding case, decide now.
    const bothAscii = l < 0x80 && r < 0x80
    const differsIgnoringCase = (l & ~0x20) !== (r & ~0x20)
    const inLetterZone = l >= 0x40 && r >= 0x40
    if (bothAscii && differsIgnoringCase && inLetterZone) {
      // Adding 5 mod 32 makes '_' sort before all letters.
      return ((l + 5) & 31) < ((r + 5) & 31)
    } else if (isDigit(l) || isDigit(r)) {
      if (isDigit(l) && isDigit(r)) {
        // Both are digits. Backtrack to the start of each digit run, drop
        // leading zeros to align most-significant digits, then compare by
        // length-then-leading-digit.
        let lDigStart = lcur
        let rDigStart = rcur
        let lDigEnd = lcur
        let rDigEnd = rcur

        while (lDigStart !== 0 && isDigit(byteAt(L, lDigStart - 1))) lDigStart--
        while (rDigStart !== 0 && isDigit(byteAt(R, rDigStart - 1))) rDigStart--
        while (lDigEnd !== lend && isDigit(byteAt(L, lDigEnd))) lDigEnd++
        while (rDigEnd !== rend && isDigit(byteAt(R, rDigEnd))) rDigEnd++

        // Skip leading zeros.
        while (lDigStart !== lDigEnd && byteAt(L, lDigStart) === 0x30) lDigStart++
        while (rDigStart !== rDigEnd && byteAt(R, rDigStart) === 0x30) rDigStart++

        // Scan while the significant digits match.
        while (
          lDigStart !== lDigEnd &&
          rDigStart !== rDigEnd &&
          isDigit(byteAt(L, lDigStart)) &&
          byteAt(L, lDigStart) === byteAt(R, rDigStart)
        ) {
          lDigStart++
          rDigStart++
        }

        // If exactly one ran out of significant digits, the shorter value is less.
        if ((lDigStart === lDigEnd) !== (rDigStart === rDigEnd)) {
          return lDigStart === lDigEnd && rDigStart !== rDigEnd
        }
        if (lDigStart !== lDigEnd && rDigStart !== rDigEnd) {
          const lMSD = byteAt(L, lDigStart)
          const rMSD = byteAt(R, rDigStart)
          const digitsL = lDigEnd - lDigStart
          const digitsR = rDigEnd - rDigStart
          // Fewer significant digits wins; on a tie, the smaller leading digit.
          if (digitsL !== digitsR) return digitsL < digitsR
          return lMSD < rMSD
        }
        // Values equal; continue past the digit runs. Reset curEnd to account
        // for leading-zero count differences between the two cursors.
        lcur = lDigEnd
        rcur = rDigEnd
        curEnd = lcur + Math.min(lend - lcur, rend - rcur)
      } else {
        // Exactly one is a digit. If we're at the very start, compare directly;
        // otherwise the preceding char decides which side's digit wins.
        if (lcur === 0) return l < r
        const prevChar = byteAt(L, lcur - 1)
        return isDigit(prevChar) ? isDigit(r) : isDigit(l)
      }
    } else if (!isAlpha(l) || !isAlpha(r)) {
      // At least one isn't a letter — straight byte compare.
      return l < r
    } else {
      // Both letters, differ only by case — keep scanning.
      lcur++
      rcur++
    }
    ;[lcur, rcur] = mismatch(L, lcur, curEnd, R, rcur)
  }

  // At the end of one or both, with at most case / leading-zero differences.
  // If only one is at its end, the shorter is less.
  if (lcur !== lend || rcur !== rend) {
    return lcur === lend
  }

  // Both at the end — discriminate on the very first mismatch (a case or
  // leading-zero difference). A leading zero sorts after a significant digit.
  ;[lcur, rcur] = mismatch(L, 0, Math.min(lsize, rsize), R, 0)
  l = byteAt(L, lcur)
  r = byteAt(R, rcur)
  return r === 0x30 || (l !== 0x30 && l < r)
}

// ---- fuzz ----

// Deterministic generator (mulberry32).
function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const pieces = [
  'a', 'b', 'z', 'A', 'B', 'Z', '_', '0', '00', '1', '2', '9', '10', '007', ':', '.', ' ', '-', '@', '[', '`', '{', '~',
  'x', 'X', 'file', 'File', 'primvars:', 'xformOp:', 'é', 'É', 'ß', '中', '😀', '\u0080', 'ÿ', 'Ā', '\ud800', '\u0000',
]

function randomString(next: () => number): string {
  const n = Math.floor(next() * 6)
  let s = ''
  for (let i = 0; i < n; i++) s += pieces[Math.floor(next() * pieces.length)]
  return s
}

describe('dictionaryLessThan fast path', () => {
  it('orders random pairs exactly as the previous implementation', () => {
    const next = rng(20261104)
    let mismatches = 0
    for (let i = 0; i < 200000; i++) {
      const a = randomString(next)
      // Half the pairs share a random prefix, so comparisons run past the
      // first byte into digit runs and case differences.
      const b = next() < 0.5 ? a.slice(0, Math.floor(next() * (a.length + 1))) + randomString(next) : randomString(next)
      if (dictionaryLessThan(a, b) !== previousDictionaryLessThan(a, b)) mismatches++
      if (dictionaryLessThan(b, a) !== previousDictionaryLessThan(b, a)) mismatches++
    }
    expect(mismatches).toBe(0)
  })

  it('sorts name lists exactly as the previous implementation', () => {
    const next = rng(7)
    const names = Array.from({ length: 5000 }, () => randomString(next))
    const sortWith = (less: (a: string, b: string) => boolean) =>
      [...names].sort((a, b) => less(a, b) ? -1 : less(b, a) ? 1 : 0)
    expect(sortWith(dictionaryLessThan)).toEqual(sortWith(previousDictionaryLessThan))
  })
})
