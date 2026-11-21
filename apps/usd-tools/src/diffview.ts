// usddiff's output read back and laid out side by side: shared by the
// usddiff page and the usdfixbrokenpixarschemas page (which shows what it
// fixed as usddiff sees it).
import { el } from './dom'

export interface Hunk { a: number, b: number, removed: string[], added: string[] }

/** usddiff's output read back: unified hunks ("@@ -a,n +b,m @@" and their
 *  lines; usddiff writes them without context), and any other lines as
 *  notes (file names when it compares folders or packages). */
export function readDiff(stdout: string): { hunks: Hunk[], notes: string[] } {
  const hunks: Hunk[] = []
  const notes: string[] = []
  const lines = stdout.split('\n')
  if (lines.at(-1) === '') lines.pop()
  for (let i = 0; i < lines.length; i++) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]!)
    if (!m) { notes.push(lines[i]!); continue }
    const an = m[2] === undefined ? 1 : Number(m[2]), bn = m[4] === undefined ? 1 : Number(m[4])
    const hunk: Hunk = { a: Number(m[1]), b: Number(m[3]), removed: [], added: [] }
    // Read by the counts the header gives, so a line whose text starts with
    // "-" or "@@" is still read as the line it is.
    let r = an, ad = bn
    while ((r > 0 || ad > 0) && i + 1 < lines.length) {
      const line = lines[i + 1]!
      if (line.startsWith('-') && r > 0) { hunk.removed.push(line.slice(1)); r-- }
      else if (line.startsWith('+') && ad > 0) { hunk.added.push(line.slice(1)); ad-- }
      else if (line.startsWith(' ')) { r--; ad-- }
      else break
      i++
    }
    hunks.push(hunk)
  }
  return { hunks, notes }
}

/** The text with its middle (what differs from `other`) marked. */
function marked(text: string, other: string | undefined, cls: string): (Node | string)[] {
  if (other === undefined) return [text]
  let start = 0
  while (start < text.length && start < other.length && text[start] === other[start]) start++
  let end = 0
  while (end < text.length - start && end < other.length - start && text[text.length - 1 - end] === other[other.length - 1 - end]) end++
  const middle = text.slice(start, text.length - end)
  if (!middle) return [text]
  return [text.slice(0, start), el('mark', { className: cls }, middle), text.slice(text.length - end)]
}

/** One hunk as rows: before on the left, after on the right. */
export function renderHunk(hunk: Hunk): HTMLElement {
  const rows = Math.max(hunk.removed.length, hunk.added.length)
  const table = el('div', { className: 'hunk' })
  const where = hunk.removed.length && hunk.added.length ? `line ${hunk.a} → ${hunk.b}`
    : hunk.removed.length ? `line ${hunk.a} removed` : `line ${hunk.b} added`
  table.append(el('div', { className: 'hunk-where' }, where))
  for (let i = 0; i < rows; i++) {
    const a = hunk.removed[i], b = hunk.added[i]
    table.append(el('div', { className: 'diff-row' },
      el('span', { className: `ln${a === undefined ? ' blank' : ''}` }, a === undefined ? '' : String(hunk.a + i)),
      el('code', { className: `side del${a === undefined ? ' blank' : ''}` }, ...(a === undefined ? [] : marked(a, b, 'del-mark'))),
      el('span', { className: `ln${b === undefined ? ' blank' : ''}` }, b === undefined ? '' : String(hunk.b + i)),
      el('code', { className: `side add${b === undefined ? ' blank' : ''}` }, ...(b === undefined ? [] : marked(b, a, 'add-mark')))))
  }
  return table
}

