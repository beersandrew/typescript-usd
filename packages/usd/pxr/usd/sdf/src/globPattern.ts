// Ported from OpenUSD 26.11.1: pxr/usd/sdf/globPattern.cpp,
//  pxr/usd/sdf/globPattern.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sdf_GlobPattern: pxr/usd/sdf/globPattern.{h,cpp} (OpenUSD 26.11.1).
//
// A compiled glob pattern matcher for short strings such as path component
// names. Supports `*`, `?`, `[abc]`, `[a-z]`, `[!a-z]` / `[^a-z]` and
// backslash escapes. Compile splits the pattern into segments separated by
// runs of `*` (globPattern.cpp:326-420); Match anchors the first segment at
// the start, the last at the end, and finds each middle segment at its
// leftmost position in between (globPattern.cpp:681-861).
//
// Upstream serializes the segments into a bytecode buffer over UTF-8 bytes,
// splitting literal runs into chunks of at most 251 bytes. Here the segments
// stay as element lists over code points of a JavaScript string; every
// element consumes exactly one code point except a literal, which consumes
// its own code points, so the segment lengths and the matching are the same.

type _Element =
  | { op: 'any' }
  | { op: 'class'; negated: boolean; ranges: [number, number][] }
  | { op: 'literal'; codePoints: number[] }

type _Segment = _Element[]

function _segmentCodePointCount(segment: _Segment): number {
  let count = 0
  for (const el of segment) count += el.op === 'literal' ? el.codePoints.length : 1
  return count
}

// _ParseClass (globPattern.cpp:230-271): a class starting after its '['.
// Returns the index past the closing ']', or -1 when the class is unclosed.
function _parseClass(cps: number[], start: number, out: { el?: _Element }): number {
  let p = start
  const end = cps.length
  let negated = false
  if (p < end && (cps[p] === 0x21 /* ! */ || cps[p] === 0x5e /* ^ */)) {
    negated = true
    ++p
  }
  const ranges: [number, number][] = []
  // ']' as first char after optional negation is a literal ']'.
  let first = true
  while (p < end) {
    if (cps[p] === 0x5d /* ] */ && !first) break
    first = false
    const codePoint = cps[p++]!
    // Check for range: codePoint-codePoint
    if (p + 1 < end && cps[p] === 0x2d /* - */ && cps[p + 1] !== 0x5d) {
      ++p
      ranges.push([codePoint, cps[p++]!])
    } else {
      ranges.push([codePoint, codePoint])
    }
  }
  if (p >= end) return -1 // unclosed '['
  out.el = { op: 'class', negated, ranges }
  return p + 1
}

export class Sdf_GlobPattern {
  private _segments: _Segment[] = []
  private _compiled = false

  // Sdf_GlobPattern::Compile (globPattern.cpp:326-604). Returns an invalid
  // pattern on a parse error (a trailing backslash or an unclosed class).
  static compile(pattern: string): Sdf_GlobPattern {
    const result = new Sdf_GlobPattern()
    const cps = Array.from(pattern, ch => ch.codePointAt(0)!)
    const end = cps.length
    const segments: _Segment[] = [[]]
    let litBuf: number[] = []
    const flushLiteral = () => {
      if (litBuf.length) segments[segments.length - 1]!.push({ op: 'literal', codePoints: litBuf })
      litBuf = []
    }
    let p = 0
    while (p < end) {
      const ch = cps[p]!
      if (ch === 0x2a /* * */) {
        // Flush literal, close current segment, start new one; consecutive
        // '*'s collapse.
        flushLiteral()
        while (p < end && cps[p] === 0x2a) ++p
        segments.push([])
        continue
      }
      if (ch === 0x3f /* ? */) {
        flushLiteral()
        segments[segments.length - 1]!.push({ op: 'any' })
        ++p
        continue
      }
      if (ch === 0x5b /* [ */) {
        flushLiteral()
        const out: { el?: _Element } = {}
        const after = _parseClass(cps, p + 1, out)
        if (after < 0) return result // parse error, result stays invalid
        segments[segments.length - 1]!.push(out.el!)
        p = after
        continue
      }
      if (ch === 0x5c /* \ */) {
        ++p
        if (p >= end) return result // trailing backslash, parse error
        litBuf.push(cps[p++]!) // Escaped char is literal.
        continue
      }
      litBuf.push(ch)
      ++p
    }
    flushLiteral()
    result._segments = segments
    result._compiled = true
    return result
  }

  // True if the pattern compiled successfully.
  isValid(): boolean { return this._compiled }

  // Sdf_GlobPattern::Match (globPattern.cpp:681-861). An invalid pattern
  // never matches.
  match(str: string): boolean {
    if (!this._compiled) return false
    const cps = Array.from(str, ch => ch.codePointAt(0)!)
    const segments = this._segments
    if (segments.length === 1) {
      // No '*': exact match.
      return _matchAnchored(segments[0]!, cps, 0) === cps.length
    }
    const prefix = segments[0]!
    const suffix = segments[segments.length - 1]!
    let pos = _matchAnchored(prefix, cps, 0)
    if (pos < 0) return false
    const suffixStart = cps.length - _segmentCodePointCount(suffix)
    if (suffixStart < pos) return false
    for (let i = 1; i < segments.length - 1; ++i) {
      const middle = segments[i]!
      if (!middle.length) continue
      const last = suffixStart - _segmentCodePointCount(middle)
      let found = -1
      for (let at = pos; at <= last; ++at) {
        found = _matchAnchored(middle, cps, at)
        if (found >= 0) break
      }
      if (found < 0) return false
      pos = found
    }
    return _matchAnchored(suffix, cps, suffixStart) === cps.length
  }
}

// _MatchAnchored (globPattern.cpp:612-656): the code point index past the
// segment matched at `at`, or -1.
function _matchAnchored(segment: _Segment, cps: number[], at: number): number {
  let s = at
  for (const el of segment) {
    if (el.op === 'any') {
      if (s >= cps.length) return -1
      ++s
    } else if (el.op === 'class') {
      if (s >= cps.length) return -1
      const codePoint = cps[s]!
      const inClass = el.ranges.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
      if (inClass === el.negated) return -1
      ++s
    } else {
      if (s + el.codePoints.length > cps.length) return -1
      for (let i = 0; i < el.codePoints.length; ++i) {
        if (cps[s + i] !== el.codePoints[i]) return -1
      }
      s += el.codePoints.length
    }
  }
  return s
}
