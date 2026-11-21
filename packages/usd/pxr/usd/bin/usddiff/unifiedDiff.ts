// Ported from OpenUSD 26.11.1: pxr/usd/bin/usddiff/usddiff.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The unified diff usddiff prints when no external diff tool is chosen
// (_launchDiffTool, usddiff.py:229-250): Python's difflib.unified_diff over
// the two files' lines, with no context lines (n=0). The hunks it prints
// depend on how difflib's SequenceMatcher pairs the lines, so its matching
// is reproduced here step for step: the longest matching block first,
// recursing on each side, with the "popular line" heuristic (autojunk) for
// a comparison side of 200 lines or more.

type Opcode = ['replace' | 'delete' | 'insert' | 'equal', number, number, number, number]

class SequenceMatcher {
  private readonly b2j = new Map<string, number[]>()

  constructor(private readonly a: readonly string[], private readonly b: readonly string[]) {
    // Index b's lines; with no junk function and autojunk, drop the lines
    // that occur more than 1% of the time (plus one) once b has 200 lines.
    b.forEach((elt, i) => {
      const indices = this.b2j.get(elt)
      if (indices) indices.push(i)
      else this.b2j.set(elt, [i])
    })
    const n = b.length
    if (n >= 200) {
      const ntest = Math.floor(n / 100) + 1
      for (const [elt, idxs] of [...this.b2j]) {
        if (idxs.length > ntest) this.b2j.delete(elt)
      }
    }
  }

  // The longest matching block in a[alo:ahi] and b[blo:bhi], the earliest
  // in a, then in b, on ties; extended over equal lines on either side.
  private findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
    const { a, b } = this
    let besti = alo
    let bestj = blo
    let bestsize = 0
    let j2len = new Map<number, number>()
    for (let i = alo; i < ahi; ++i) {
      const newj2len = new Map<number, number>()
      for (const j of this.b2j.get(a[i]!) ?? []) {
        if (j < blo) continue
        if (j >= bhi) break
        const k = (j2len.get(j - 1) ?? 0) + 1
        newj2len.set(j, k)
        if (k > bestsize) {
          besti = i - k + 1
          bestj = j - k + 1
          bestsize = k
        }
      }
      j2len = newj2len
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      --besti
      --bestj
      ++bestsize
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      ++bestsize
    }
    return [besti, bestj, bestsize]
  }

  private getMatchingBlocks(): [number, number, number][] {
    const la = this.a.length
    const lb = this.b.length
    const queue: [number, number, number, number][] = [[0, la, 0, lb]]
    const matchingBlocks: [number, number, number][] = []
    while (queue.length > 0) {
      const [alo, ahi, blo, bhi] = queue.pop()!
      const x = this.findLongestMatch(alo, ahi, blo, bhi)
      const [i, j, k] = x
      if (k) {
        matchingBlocks.push(x)
        if (alo < i && blo < j) queue.push([alo, i, blo, j])
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
      }
    }
    matchingBlocks.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])

    // Collapse adjacent blocks.
    let i1 = 0
    let j1 = 0
    let k1 = 0
    const nonAdjacent: [number, number, number][] = []
    for (const [i2, j2, k2] of matchingBlocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2
      } else {
        if (k1) nonAdjacent.push([i1, j1, k1])
        i1 = i2
        j1 = j2
        k1 = k2
      }
    }
    if (k1) nonAdjacent.push([i1, j1, k1])
    nonAdjacent.push([la, lb, 0])
    return nonAdjacent
  }

  private getOpcodes(): Opcode[] {
    let i = 0
    let j = 0
    const answer: Opcode[] = []
    for (const [ai, bj, size] of this.getMatchingBlocks()) {
      let tag: Opcode[0] | '' = ''
      if (i < ai && j < bj) tag = 'replace'
      else if (i < ai) tag = 'delete'
      else if (j < bj) tag = 'insert'
      if (tag) answer.push([tag, i, ai, j, bj])
      i = ai + size
      j = bj + size
      if (size) answer.push(['equal', ai, i, bj, j])
    }
    return answer
  }

  // The opcodes in groups with up to n lines of context.
  *getGroupedOpcodes(n: number): Generator<Opcode[]> {
    let codes = this.getOpcodes()
    if (codes.length === 0) codes = [['equal', 0, 1, 0, 1]]
    if (codes[0]![0] === 'equal') {
      const [tag, i1, i2, j1, j2] = codes[0]!
      codes[0] = [tag, Math.max(i1, i2 - n), i2, Math.max(j1, j2 - n), j2]
    }
    if (codes.at(-1)![0] === 'equal') {
      const [tag, i1, i2, j1, j2] = codes.at(-1)!
      codes[codes.length - 1] = [tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)]
    }
    const nn = n + n
    let group: Opcode[] = []
    for (const code of codes) {
      let [tag, i1, i2, j1, j2] = code
      if (tag === 'equal' && i2 - i1 > nn) {
        group.push([tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)])
        yield group
        group = []
        i1 = Math.max(i1, i2 - n)
        j1 = Math.max(j1, j2 - n)
      }
      group.push([tag, i1, i2, j1, j2])
    }
    if (group.length > 0 && !(group.length === 1 && group[0]![0] === 'equal')) yield group
  }
}

// _format_range_unified: 'start,length', or 'start' for one line.
function formatRangeUnified(start: number, stop: number): string {
  let beginning = start + 1
  const length = stop - start
  if (length === 1) return `${beginning}`
  if (!length) beginning -= 1
  return `${beginning},${length}`
}

/** The lines of a file as Python's readlines gives them: each with its line
 *  ending, the last one without when the text does not end in a newline. */
export function readLines(text: string): string[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g)
  return lines ?? []
}

/** difflib.unified_diff(a, b, fromfile, tofile, n): the diff's lines, each
 *  with its line ending. */
export function* unifiedDiff(
  a: readonly string[], b: readonly string[], fromfile: string, tofile: string, n = 3,
): Generator<string> {
  let started = false
  for (const group of new SequenceMatcher(a, b).getGroupedOpcodes(n)) {
    if (!started) {
      started = true
      yield `--- ${fromfile}\n`
      yield `+++ ${tofile}\n`
    }
    const first = group[0]!
    const last = group.at(-1)!
    yield `@@ -${formatRangeUnified(first[1], last[2])} +${formatRangeUnified(first[3], last[4])} @@\n`
    for (const [tag, i1, i2, j1, j2] of group) {
      if (tag === 'equal') {
        for (const line of a.slice(i1, i2)) yield ` ${line}`
        continue
      }
      if (tag === 'replace' || tag === 'delete') for (const line of a.slice(i1, i2)) yield `-${line}`
      if (tag === 'replace' || tag === 'insert') for (const line of b.slice(j1, j2)) yield `+${line}`
    }
  }
}
