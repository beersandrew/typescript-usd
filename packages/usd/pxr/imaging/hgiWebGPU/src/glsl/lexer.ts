// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp, pxr/imaging/hio/glslfx.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GLSL lexer for the GLSL-to-WGSL translator used by HgiWebGPU's shader
// generator.
//
// This translator has no upstream counterpart. Upstream OpenUSD 26.11.1 hands
// the code generator's GLSL to a compiler that accepts it directly: hgiVulkan
// compiles it with shaderc (pxr/imaging/hgiVulkan/shaderGenerator.cpp:562-619)
// and hgiMetal compiles it as MSL behind a macro and template prelude
// (pxr/imaging/hgiMetal/shaderGenerator.mm:305-633). WebGPU accepts only WGSL,
// so HgiWebGPU translates; the design is in packages/usd/docs/imaging-i1.md,
// section 3.
//
// The lexer produces preprocessing tokens. Comments are dropped, except that a
// `// line N "file"` comment (written by HioGlslfx, pxr/imaging/hio/
// glslfx.cpp:472) re-bases the source location of the lines that follow, so
// diagnostics point back at the glslfx file and line.

export type TokenKind = 'id' | 'num' | 'punct' | 'eof'

export interface SourceLoc {
  file: string
  line: number
  col: number
}

export interface Token {
  kind: TokenKind
  text: string
  loc: SourceLoc
  /** First token on its (logical) line: directives start here. */
  bol: boolean
  /** Whitespace precedes the token (needed to tell `#define F(` from `#define F (`). */
  space: boolean
  /** Macro names that may not be expanded again inside this token (preprocessor hide set). */
  hide?: ReadonlySet<string>
}

const PUNCTUATORS = [
  '<<=', '>>=', '...',
  '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '^^',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '##', '::',
  '(', ')', '[', ']', '{', '}', '.', ',', ';', ':', '?', '+', '-', '*', '/',
  '%', '<', '>', '=', '!', '~', '&', '|', '^', '#', '\\', '@', '"', "'",
]

/** PUNCTUATORS by first character, longest first (the order tokenize tries
 *  them in): the candidates for one character without scanning the list. */
const PUNCTUATORS_BY_FIRST = new Map<string, string[]>()
for (const p of PUNCTUATORS) {
  const list = PUNCTUATORS_BY_FIRST.get(p[0]!) ?? []
  list.push(p)
  PUNCTUATORS_BY_FIRST.set(p[0]!, list)
}

function isIdStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
}
function isIdChar(c: string): boolean {
  return isIdStart(c) || (c >= '0' && c <= '9')
}
function isIdCode(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || (c >= 48 && c <= 57)
}
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}

const LINE_MARKER = /^\/\/\s*line\s+(\d+)\s+"([^"]*)"/

export class LexError extends Error {
  readonly loc: SourceLoc
  constructor(message: string, loc: SourceLoc) {
    super(message)
    this.loc = loc
  }
}

/**
 * Tokenize GLSL source. Backslash-newline is spliced, comments are removed
 * and `// line N "file"` markers re-base locations.
 */
export function tokenize(source: string, fileName = '<input>'): Token[] {
  const out: Token[] = []
  let file = fileName
  // physical line -> logical location base
  let lineBase = 1 // logical line of physical line `physLineAtBase`
  let physLineAtBase = 1
  let phys = 1
  let lineStart = 0
  let bol = true
  let space = false
  const n = source.length
  let i = 0
  const loc = (at: number): SourceLoc => ({ file, line: lineBase + (phys - physLineAtBase), col: at - lineStart + 1 })
  const newline = (): void => {
    phys++
    lineStart = i
    bol = true
    space = false
  }
  while (i < n) {
    const c = source[i] as string
    if (c === '\\' && (source[i + 1] === '\n' || (source[i + 1] === '\r' && source[i + 2] === '\n'))) {
      i += source[i + 1] === '\r' ? 3 : 2
      phys++
      lineStart = i
      space = true
      continue
    }
    if (c === '\n') {
      i++
      newline()
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++
      space = true
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      let j = i
      while (j < n && source[j] !== '\n') {
        // A backslash at the end of a // comment continues it in C; GLSL
        // inherits that, but no Storm source relies on it. Keep it simple.
        j++
      }
      const text = source.slice(i, j)
      const m = bol ? LINE_MARKER.exec(text) : null
      i = j
      if (m) {
        // N is the line of the glslfx section header; the text starts on the
        // next line (pxr/imaging/hio/glslfx.cpp:466-475).
        if (i < n) {
          i++
          newline()
        }
        file = m[2] as string
        lineBase = Number(m[1]) + 1
        physLineAtBase = phys
      } else {
        space = true
      }
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const start = loc(i)
      let j = i + 2
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) {
        if (source[j] === '\n') {
          phys++
          lineStart = j + 1
        }
        j++
      }
      if (j >= n) throw new LexError('unterminated block comment', start)
      i = j + 2
      space = true
      continue
    }
    const start = i
    const tokLoc = loc(i)
    if (isIdStart(c)) {
      while (i < n && isIdCode(source.charCodeAt(i))) i++
      out.push({ kind: 'id', text: source.slice(start, i), loc: tokLoc, bol, space })
    } else if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      i = scanNumber(source, i)
      out.push({ kind: 'num', text: source.slice(start, i), loc: tokLoc, bol, space })
    } else {
      let p: string | undefined
      for (const cand of PUNCTUATORS_BY_FIRST.get(c) ?? []) {
        if (cand.length === 1 || source.startsWith(cand, i)) {
          p = cand
          break
        }
      }
      if (p === undefined) throw new LexError(`unexpected character '${c}'`, tokLoc)
      i += p.length
      out.push({ kind: 'punct', text: p, loc: tokLoc, bol, space })
    }
    bol = false
    space = false
  }
  out.push({ kind: 'eof', text: '', loc: loc(i), bol: true, space: false })
  return out
}

function scanNumber(s: string, i: number): number {
  const n = s.length
  if (s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X')) {
    i += 2
    while (i < n && /[0-9a-fA-F]/.test(s[i] as string)) i++
    if (s[i] === 'u' || s[i] === 'U') i++
    return i
  }
  while (i < n && isDigit(s[i] as string)) i++
  let isFloat = false
  if (s[i] === '.') {
    isFloat = true
    i++
    while (i < n && isDigit(s[i] as string)) i++
  }
  if (s[i] === 'e' || s[i] === 'E') {
    const save = i
    i++
    if (s[i] === '+' || s[i] === '-') i++
    if (isDigit(s[i] ?? '')) {
      isFloat = true
      while (i < n && isDigit(s[i] as string)) i++
    } else {
      i = save
    }
  }
  if (s.startsWith('lf', i) || s.startsWith('LF', i)) return i + 2
  if (s[i] === 'f' || s[i] === 'F') return i + 1
  if (!isFloat && (s[i] === 'u' || s[i] === 'U')) return i + 1
  return i
}

export function formatLoc(loc: SourceLoc): string {
  return `${loc.file}:${loc.line}:${loc.col}`
}
