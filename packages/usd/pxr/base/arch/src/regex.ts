// Ported from OpenUSD 26.11.1: pxr/base/arch/regex.cpp, pxr/base/arch/regex.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ArchRegex — port of OpenUSD v26.11.1 pxr/base/arch/regex.{h,cpp}.
//
// Upstream compiles the pattern with POSIX regcomp(REG_EXTENDED |
// REG_NEWLINE [| REG_ICASE]) (regex.cpp:104-122) and matches with regexec
// (regex.cpp:129-133), i.e. POSIX extended regular expressions searched
// anywhere in the query. JavaScript has no POSIX regex engine, so this port
// translates the extended grammar into an equivalent ECMAScript RegExp:
//   - bracket expressions, including [:class:] names, a leading ']' and a
//     literal '\' inside brackets;
//   - REG_NEWLINE: '.' and non-matching lists never match '\n', and '^' / '$'
//     match at line boundaries (the 'm' flag);
//   - '\c' outside brackets is the literal c, except the escapes the macOS
//     regcomp (TRE) also accepts: \w \W \s \S \d \D \b \B \< \> \t \n \r \f
//     \e and back-references \1-\9;
//   - intervals {n}, {n,}, {n,m}.
// Matching only reports whether a match exists, so the POSIX leftmost-longest
// rule versus ECMAScript's leftmost-first rule cannot change a result.
// Compile errors carry the regerror texts of the BSD/macOS libc.

const REG_EBRACK = 'brackets ([ ]) not balanced'
const REG_EPAREN = 'parentheses not balanced'
const REG_ECTYPE = 'invalid character class'
const REG_EESCAPE = 'trailing backslash (\\)'
const REG_BADBR = 'invalid repetition count(s)'
const REG_EBRACE = 'braces not balanced'
const REG_BADRPT = 'repetition-operator operand invalid'
const REG_ERANGE = 'invalid character range'

class Arch_RegexError extends Error {}

// POSIX character classes (regcomp(3) re_format(7)) as ECMAScript class
// contents, ASCII locale.
const characterClasses: Record<string, string> = {
  alnum: '0-9A-Za-z',
  alpha: 'A-Za-z',
  blank: ' \\t',
  cntrl: '\\x00-\\x1f\\x7f',
  digit: '0-9',
  graph: '\\x21-\\x7e',
  lower: 'a-z',
  print: '\\x20-\\x7e',
  punct: '!-\\/:-@\\[-`{-~',
  space: ' \\t\\n\\r\\f\\v',
  upper: 'A-Z',
  xdigit: '0-9A-Fa-f',
}

const escapeClassChar = (c: string): string =>
  /[\\\]\[^-]/.test(c) ? `\\${c}` : c
const escapeLiteral = (c: string): string =>
  /[\\^$.*+?()[\]{}|/-]/.test(c) ? `\\${c}` : c

// Translate one bracket expression starting at pattern[start] === '['.
// Returns the ECMAScript class and the index after the closing ']'.
function translateBracket(pattern: string, start: number): [string, number] {
  let i = start + 1
  let negate = false
  if (pattern[i] === '^') { negate = true; ++i }
  let body = ''
  let first = true
  // Each item is a single character (possibly the start of a range) or a
  // class; ranges need their endpoints as characters.
  let pendingChar: string | undefined
  const flushPending = (): void => {
    if (pendingChar !== undefined) { body += escapeClassChar(pendingChar); pendingChar = undefined }
  }
  const readElement = (): { kind: 'char', value: string } | { kind: 'class', value: string } => {
    if (pattern[i] === '[' && (pattern[i + 1] === ':' || pattern[i + 1] === '=' || pattern[i + 1] === '.')) {
      const delim = pattern[i + 1]!
      const end = pattern.indexOf(`${delim}]`, i + 2)
      if (end < 0) throw new Arch_RegexError(REG_EBRACK)
      const name = pattern.slice(i + 2, end)
      i = end + 2
      if (delim === ':') {
        const cls = characterClasses[name]
        if (cls === undefined) throw new Arch_RegexError(REG_ECTYPE)
        return { kind: 'class', value: cls }
      }
      // [=c=] equivalence class and [.c.] collating symbol: single
      // characters in the C locale.
      if ([...name].length !== 1) throw new Arch_RegexError(delim === '=' ? REG_ECTYPE : 'invalid collating element')
      return { kind: 'char', value: name }
    }
    const c = pattern[i]!
    ++i
    return { kind: 'char', value: c }
  }
  for (;;) {
    if (i >= pattern.length) throw new Arch_RegexError(REG_EBRACK)
    if (pattern[i] === ']' && !first) { ++i; break }
    first = false
    const element = readElement()
    if (element.kind === 'class') {
      flushPending()
      body += element.value
      continue
    }
    // A range a-b; '-' is literal first, last, or right after a range.
    if (pattern[i] === '-' && pattern[i + 1] !== undefined && pattern[i + 1] !== ']') {
      ++i
      const hi = readElement()
      if (hi.kind !== 'char') throw new Arch_RegexError(REG_ERANGE)
      if (hi.value.codePointAt(0)! < element.value.codePointAt(0)!) throw new Arch_RegexError(REG_ERANGE)
      flushPending()
      body += `${escapeClassChar(element.value)}-${escapeClassChar(hi.value)}`
      continue
    }
    flushPending()
    pendingChar = element.value
  }
  flushPending()
  // REG_NEWLINE: a non-matching list never matches a newline.
  return [negate ? `[^${body}\\n]` : `[${body}]`, i]
}

const tre: Record<string, string> = {
  w: '[0-9A-Za-z_]', W: '[^0-9A-Za-z_]', s: '[ \\t\\n\\r\\f\\v]', S: '[^ \\t\\n\\r\\f\\v]',
  d: '[0-9]', D: '[^0-9]', b: '\\b', B: '\\B', '<': '\\b(?=\\w)', '>': '\\b(?<=\\w)',
  t: '\\t', n: '\\n', r: '\\r', f: '\\f', e: '\\x1b',
}

/** @internal Translate a POSIX extended regular expression. */
export function Arch_TranslateExtendedRegex(pattern: string): string {
  let out = ''
  let depth = 0
  // Whether the previous item can take a repetition operator.
  let canRepeat = false
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]!
    switch (c) {
      case '\\': {
        const next = pattern[i + 1]
        if (next === undefined) throw new Arch_RegexError(REG_EESCAPE)
        if (next in tre) out += tre[next]
        else if (next >= '1' && next <= '9') out += `\\${next}`
        else out += escapeLiteral(next)
        canRepeat = next !== '<' && next !== '>' && next !== 'b' && next !== 'B'
        i += 2
        break
      }
      case '[': {
        const [cls, end] = translateBracket(pattern, i)
        out += cls
        i = end
        canRepeat = true
        break
      }
      case '.': out += '[^\\n]'; ++i; canRepeat = true; break
      case '(': out += '(?:'; ++depth; ++i; canRepeat = false; break
      case ')':
        if (depth === 0) throw new Arch_RegexError(REG_EPAREN)
        out += ')'; --depth; ++i; canRepeat = true
        break
      case '|': out += '|'; ++i; canRepeat = false; break
      case '^': case '$': out += c; ++i; canRepeat = false; break
      case '*': case '+': case '?':
        if (!canRepeat) throw new Arch_RegexError(REG_BADRPT)
        out += c; ++i
        break
      case '{': {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i))
        if (!m) {
          throw new Arch_RegexError(pattern.indexOf('}', i) < 0 ? REG_EBRACE : REG_BADBR)
        }
        if (!canRepeat) throw new Arch_RegexError(REG_BADRPT)
        if (m[3] !== undefined && m[3] !== '' && Number(m[3]) < Number(m[1])) {
          throw new Arch_RegexError(REG_BADBR)
        }
        out += m[0]; i += m[0].length
        break
      }
      default:
        out += escapeLiteral(c); ++i; canRepeat = true
        break
    }
  }
  if (depth !== 0) throw new Arch_RegexError(REG_EPAREN)
  return out
}

// _GlobToRegex (regex.cpp:31-38).
function globToRegex(pattern: string): string {
  return pattern.replaceAll('.', '\\.').replaceAll('*', '.*').replaceAll('?', '.')
}

export class ArchRegex {
  static readonly CASE_INSENSITIVE = 1
  static readonly GLOB = 2

  readonly #flags: number
  #error = ''
  #impl: RegExp | undefined

  // ArchRegex::ArchRegex (regex.cpp:137-155).
  constructor(pattern = '', flags = 0) {
    this.#flags = flags
    if (arguments.length === 0) return
    try {
      if (!pattern) {
        this.#error = 'empty pattern'
      } else {
        const source = Arch_TranslateExtendedRegex(
          flags & ArchRegex.GLOB ? globToRegex(pattern) : pattern)
        this.#impl = new RegExp(source, flags & ArchRegex.CASE_INSENSITIVE ? 'mi' : 'm')
      }
    } catch (error) {
      this.#impl = undefined
      this.#error = error instanceof Arch_RegexError ? error.message : ''
      if (!this.#error) this.#error = 'unknown reason'
    }
  }

  // regex.cpp:162-165
  isValid(): boolean { return this.#impl !== undefined }

  // regex.cpp:167-171
  getError(): string {
    return this.#impl ? '' : (this.#error || 'uncompiled pattern')
  }

  getFlags(): number { return this.#flags }

  // regex.cpp:179-183
  match(query: string): boolean {
    return this.#impl !== undefined && this.#impl.test(query)
  }
}
