// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/codeGen.cpp,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GLSL preprocessor for the GLSL-to-WGSL translator (no upstream counterpart;
// see lexer.ts and packages/usd/docs/imaging-i1.md section 3.2 step 1).
//
// A C-preprocessor subset, enough for Storm's glslfx sections and the code
// generator's output (pxr/imaging/hdSt/codeGen.cpp:2154-2340) plus the
// backend prelude macros (REF, FORWARD_DECL, ATOMIC_*; modelled on
// pxr/imaging/hgiVulkan/shaderGenerator.cpp:238-256):
// object-like and function-like #define (including variadic `...`), #undef,
// #if/#ifdef/#ifndef/#elif/#else/#endif with `defined` and integer
// expressions, `##` pasting, and #error. #version, #extension and #pragma are
// accepted and dropped. Expansion uses hide sets, so a macro is not expanded
// inside its own expansion.

import { type SourceLoc, type Token, tokenize } from './lexer.ts'

export interface Diagnostic {
  severity: 'error' | 'warning' | 'note'
  message: string
  loc?: SourceLoc
}

export interface MacroDef {
  name: string
  params: string[] | null // null: object-like
  variadic: boolean
  body: Token[]
  loc?: SourceLoc
}

export interface PreprocessResult {
  tokens: Token[]
  defines: Map<string, MacroDef>
  diagnostics: Diagnostic[]
}

export class PreprocessError extends Error {
  readonly loc: SourceLoc | undefined
  constructor(message: string, loc?: SourceLoc) {
    super(message)
    this.loc = loc
  }
}

/** Parse `NAME`, `NAME=value` or a full `#define` body string into a macro definition. */
export function defineFromString(name: string, value = '1'): MacroDef {
  const body = tokenize(value, '<define>')
  body.pop() // eof
  return { name, params: null, variadic: false, body }
}

interface CondFrame {
  active: boolean // tokens in the current branch are emitted
  taken: boolean // some branch of this #if has been active
  parentActive: boolean
  sawElse: boolean
  loc: SourceLoc
}

export interface PreprocessOptions {
  /** Initial macro definitions (name -> replacement text). */
  defines?: Map<string, string> | Record<string, string>
  /** Initial macro definitions as parsed objects (applied after `defines`). */
  macros?: Iterable<MacroDef>
}

export function preprocess(source: string | Token[], options: PreprocessOptions = {}, fileName = '<input>'): PreprocessResult {
  const input = typeof source === 'string' ? tokenize(source, fileName) : source
  const pp = new Preprocessor(options)
  return pp.run(input)
}

class Preprocessor {
  readonly macros = new Map<string, MacroDef>()
  readonly diagnostics: Diagnostic[] = []
  private readonly out: Token[] = []
  private pending: Token[] = []

  constructor(options: PreprocessOptions) {
    const defs = options.defines
    if (defs) {
      const entries = defs instanceof Map ? [...defs.entries()] : Object.entries(defs)
      for (const [k, v] of entries) this.macros.set(k, defineFromString(k, v))
    }
    for (const m of options.macros ?? []) this.macros.set(m.name, m)
  }

  run(tokens: Token[]): PreprocessResult {
    const conds: CondFrame[] = []
    const active = (): boolean => (conds.length === 0 ? true : (conds[conds.length - 1] as CondFrame).active)
    let i = 0
    const eof = tokens[tokens.length - 1] as Token
    while (i < tokens.length) {
      const t = tokens[i] as Token
      if (t.kind === 'eof') break
      // gather one logical line
      let j = i + 1
      while (j < tokens.length && !(tokens[j] as Token).bol && (tokens[j] as Token).kind !== 'eof') j++
      const line = tokens.slice(i, j)
      i = j
      if (t.kind === 'punct' && t.text === '#') {
        this.flush()
        this.directive(line, conds, active())
        continue
      }
      if (active()) for (const tok of line) this.pending.push(tok)
    }
    this.flush()
    if (conds.length) {
      const f = conds[conds.length - 1] as CondFrame
      this.diag('error', 'unterminated #if', f.loc)
    }
    this.out.push(eof)
    return { tokens: this.out, defines: this.macros, diagnostics: this.diagnostics }
  }

  private diag(severity: Diagnostic['severity'], message: string, loc?: SourceLoc): void {
    this.diagnostics.push(loc ? { severity, message, loc } : { severity, message })
  }

  private flush(): void {
    if (!this.pending.length) return
    const expanded = this.expand(this.pending, false)
    for (const t of expanded) this.out.push(t)
    this.pending = []
  }

  private directive(line: Token[], conds: CondFrame[], isActive: boolean): void {
    const hash = line[0] as Token
    const nameTok = line[1]
    if (!nameTok) return // null directive
    const name = nameTok.text
    const rest = line.slice(2)
    const top = conds[conds.length - 1]
    switch (name) {
      case 'if':
      case 'ifdef':
      case 'ifndef': {
        let value = false
        if (isActive) {
          if (name === 'if') value = this.evalCondition(rest, nameTok.loc)
          else {
            const id = rest[0]
            if (!id || id.kind !== 'id') this.diag('error', `#${name} without a macro name`, nameTok.loc)
            const def = id ? this.macros.has(id.text) : false
            value = name === 'ifdef' ? def : !def
          }
        }
        conds.push({ active: isActive && value, taken: isActive && value, parentActive: isActive, sawElse: false, loc: hash.loc })
        return
      }
      case 'elif': {
        if (!top) return this.diag('error', '#elif without #if', hash.loc)
        if (top.sawElse) this.diag('error', '#elif after #else', hash.loc)
        if (!top.parentActive || top.taken) {
          top.active = false
        } else {
          const v = this.evalCondition(rest, nameTok.loc)
          top.active = v
          top.taken = v
        }
        return
      }
      case 'else': {
        if (!top) return this.diag('error', '#else without #if', hash.loc)
        if (top.sawElse) this.diag('error', 'duplicate #else', hash.loc)
        top.sawElse = true
        top.active = top.parentActive && !top.taken
        top.taken = true
        return
      }
      case 'endif': {
        if (!top) return this.diag('error', '#endif without #if', hash.loc)
        conds.pop()
        return
      }
    }
    if (!isActive) return
    switch (name) {
      case 'define':
        this.define(rest, nameTok.loc)
        return
      case 'undef': {
        const id = rest[0]
        if (id) this.macros.delete(id.text)
        return
      }
      case 'error':
        this.diag('error', `#error ${rest.map(t => t.text).join(' ')}`, hash.loc)
        return
      case 'warning':
        this.diag('warning', `#warning ${rest.map(t => t.text).join(' ')}`, hash.loc)
        return
      case 'pragma':
      case 'version':
      case 'extension':
      case 'line':
        return
      case 'include':
        this.diag('error', '#include is not supported', hash.loc)
        return
      default:
        this.diag('error', `unknown directive #${name}`, hash.loc)
    }
  }

  private define(rest: Token[], loc: SourceLoc): void {
    const nameTok = rest[0]
    if (!nameTok || nameTok.kind !== 'id') {
      this.diag('error', '#define without a macro name', loc)
      return
    }
    let params: string[] | null = null
    let variadic = false
    let k = 1
    const next = rest[1]
    if (next && next.text === '(' && !next.space) {
      params = []
      k = 2
      for (;;) {
        const p = rest[k]
        if (!p) {
          this.diag('error', 'unterminated macro parameter list', nameTok.loc)
          return
        }
        k++
        if (p.text === ')') break
        if (p.text === ',') continue
        if (p.text === '...') {
          variadic = true
          continue
        }
        if (p.kind !== 'id') {
          this.diag('error', `bad macro parameter '${p.text}'`, p.loc)
          return
        }
        params.push(p.text)
      }
    }
    const body = rest.slice(k)
    this.macros.set(nameTok.text, { name: nameTok.text, params, variadic, body, loc: nameTok.loc })
  }

  // ---------------------------------------------------------------- expansion

  /** Fully macro-expand a token list. */
  expand(tokens: Token[], inIf: boolean): Token[] {
    const result: Token[] = []
    // input as a stack (reversed) so rescanning is a push
    const stack: Token[] = tokens.slice().reverse()
    while (stack.length) {
      const t = stack.pop() as Token
      if (t.kind !== 'id') {
        result.push(t)
        continue
      }
      if (inIf && t.text === 'defined') {
        // keep `defined X` / `defined(X)` intact for the evaluator
        result.push(t)
        const a = stack.pop()
        if (!a) continue
        result.push(a)
        if (a.text === '(') {
          const b = stack.pop()
          const c = stack.pop()
          if (b) result.push(b)
          if (c) result.push(c)
        }
        continue
      }
      const m = this.macros.get(t.text)
      if (!m || (t.hide && t.hide.has(t.text))) {
        result.push(t)
        continue
      }
      const hide = new Set(t.hide ?? [])
      hide.add(m.name)
      if (m.params === null) {
        const repl = this.substitute(m, [], t, hide)
        for (let r = repl.length - 1; r >= 0; r--) stack.push(repl[r] as Token)
        continue
      }
      // function-like: needs '('
      const peek = stack[stack.length - 1]
      if (!peek || peek.text !== '(') {
        result.push(t)
        continue
      }
      stack.pop()
      const args: Token[][] = [[]]
      let depth = 0
      let closed = false
      while (stack.length) {
        const a = stack.pop() as Token
        if (a.kind === 'eof') break
        if (a.text === '(') depth++
        else if (a.text === ')') {
          if (depth === 0) {
            closed = true
            break
          }
          depth--
        } else if (a.text === ',' && depth === 0) {
          // variadic: fold the extra arguments into the last one
          if (!(m.variadic && args.length > m.params.length)) {
            args.push([])
            continue
          }
        }
        ;(args[args.length - 1] as Token[]).push(a)
      }
      if (!closed) {
        this.diag('error', `unterminated invocation of macro ${m.name}`, t.loc)
        break
      }
      if (args.length === 1 && (args[0] as Token[]).length === 0 && m.params.length === 0 && !m.variadic) args.length = 0
      const want = m.params.length
      if (m.variadic ? args.length < want : args.length !== want) {
        if (!(want === 1 && args.length === 0)) {
          this.diag('error', `macro ${m.name} expects ${want} argument(s), got ${args.length}`, t.loc)
        }
      }
      const repl = this.substitute(m, args, t, hide)
      for (let r = repl.length - 1; r >= 0; r--) stack.push(repl[r] as Token)
    }
    return result
  }

  private substitute(m: MacroDef, args: Token[][], at: Token, hide: Set<string>): Token[] {
    const params = m.params ?? []
    const argFor = (name: string): Token[] | undefined => {
      if (name === '__VA_ARGS__' && m.variadic) {
        const extra = args.slice(params.length)
        const joined: Token[] = []
        extra.forEach((a, idx) => {
          if (idx) joined.push({ ...at, kind: 'punct', text: ',', space: false })
          joined.push(...a)
        })
        return joined
      }
      const idx = params.indexOf(name)
      return idx < 0 ? undefined : (args[idx] ?? [])
    }
    const body = m.body
    const out: Token[] = []
    const expandedCache = new Map<string, Token[]>()
    for (let b = 0; b < body.length; b++) {
      const tok = body[b] as Token
      const nextTok = body[b + 1]
      const prevIsPaste = out.length > 0 && body[b - 1]?.text === '##'
      if (tok.text === '##') continue
      if (tok.text === '#' && nextTok && nextTok.kind === 'id' && argFor(nextTok.text)) {
        this.diag('error', `stringizing (#) is not supported (macro ${m.name})`, at.loc)
        b++
        continue
      }
      if (tok.kind === 'id') {
        const raw = argFor(tok.text)
        if (raw) {
          const pasteNext = nextTok?.text === '##'
          let toks: Token[]
          if (prevIsPaste || pasteNext) toks = raw
          else {
            let cached = expandedCache.get(tok.text)
            if (!cached) {
              cached = this.expand(raw, false)
              expandedCache.set(tok.text, cached)
            }
            toks = cached
          }
          if (prevIsPaste && toks.length) {
            this.paste(out, toks[0] as Token, at)
            toks = toks.slice(1)
          }
          for (const x of toks) out.push(relocate(x, at, hide, x.space))
          continue
        }
      }
      if (prevIsPaste) {
        this.paste(out, tok, at)
        continue
      }
      out.push(relocate(tok, at, hide, tok.space))
    }
    if (out.length) out[0] = { ...(out[0] as Token), space: true }
    return out
  }

  private paste(out: Token[], right: Token, at: Token): void {
    const left = out.pop()
    const text = (left?.text ?? '') + right.text
    const re = tokenize(text, at.loc.file)
    re.pop()
    if (re.length !== 1) this.diag('error', `pasting "${left?.text}" and "${right.text}" does not give a valid token`, at.loc)
    for (const r of re) out.push({ ...r, loc: at.loc, bol: false, space: left?.space ?? false })
  }

  // ------------------------------------------------------------- #if values

  private evalCondition(tokens: Token[], loc: SourceLoc): boolean {
    const expanded = this.expand(tokens, true)
    // resolve `defined`
    const vals: Token[] = []
    for (let k = 0; k < expanded.length; k++) {
      const t = expanded[k] as Token
      if (t.kind === 'id' && t.text === 'defined') {
        let nameTok = expanded[k + 1]
        if (nameTok?.text === '(') {
          nameTok = expanded[k + 2]
          k += 3
        } else {
          k += 1
        }
        const v = nameTok && this.macros.has(nameTok.text) ? '1' : '0'
        vals.push({ ...t, kind: 'num', text: v })
        continue
      }
      if (t.kind === 'id') {
        // C: remaining identifiers evaluate to 0 (true/false are GLSL keywords, not macros)
        vals.push({ ...t, kind: 'num', text: t.text === 'true' ? '1' : '0' })
        continue
      }
      vals.push(t)
    }
    try {
      const ev = new IfExprEvaluator(vals)
      const v = ev.parse()
      return v !== 0n
    } catch (e) {
      this.diag('error', `bad #if expression: ${(e as Error).message}`, loc)
      return false
    }
  }
}

function relocate(t: Token, at: Token, hide: Set<string>, space: boolean): Token {
  const merged = t.hide && t.hide.size ? new Set([...hide, ...t.hide]) : hide
  return { kind: t.kind, text: t.text, loc: at.loc, bol: false, space, hide: merged }
}

/** Integer constant-expression evaluator for #if (C semantics, 64-bit). */
class IfExprEvaluator {
  private i = 0
  private readonly toks: Token[]
  constructor(toks: Token[]) {
    this.toks = toks
  }
  parse(): bigint {
    const v = this.ternary()
    if (this.i < this.toks.length) throw new Error(`unexpected '${(this.toks[this.i] as Token).text}'`)
    return v
  }
  private peek(): string | undefined {
    return this.toks[this.i]?.text
  }
  private eat(s: string): boolean {
    if (this.peek() === s) {
      this.i++
      return true
    }
    return false
  }
  private ternary(): bigint {
    const c = this.binary(0)
    if (this.eat('?')) {
      const a = this.ternary()
      if (!this.eat(':')) throw new Error("expected ':'")
      const b = this.ternary()
      return c !== 0n ? a : b
    }
    return c
  }
  private static readonly LEVELS: string[][] = [
    ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%'],
  ]
  private binary(level: number): bigint {
    if (level >= IfExprEvaluator.LEVELS.length) return this.unary()
    let lhs = this.binary(level + 1)
    const ops = IfExprEvaluator.LEVELS[level] as string[]
    for (;;) {
      const op = this.peek()
      if (op === undefined || !ops.includes(op)) return lhs
      this.i++
      const rhs = this.binary(level + 1)
      lhs = applyBinary(op, lhs, rhs)
    }
  }
  private unary(): bigint {
    const t = this.toks[this.i]
    if (!t) throw new Error('unexpected end of expression')
    if (t.text === '(') {
      this.i++
      const v = this.ternary()
      if (!this.eat(')')) throw new Error("expected ')'")
      return v
    }
    if (t.text === '!') {
      this.i++
      return this.unary() === 0n ? 1n : 0n
    }
    if (t.text === '-') {
      this.i++
      return -this.unary()
    }
    if (t.text === '+') {
      this.i++
      return this.unary()
    }
    if (t.text === '~') {
      this.i++
      return ~this.unary()
    }
    if (t.kind === 'num') {
      this.i++
      return parseIntLiteral(t.text)
    }
    throw new Error(`unexpected '${t.text}'`)
  }
}

function applyBinary(op: string, a: bigint, b: bigint): bigint {
  const B = (x: boolean): bigint => (x ? 1n : 0n)
  switch (op) {
    case '||': return B(a !== 0n || b !== 0n)
    case '&&': return B(a !== 0n && b !== 0n)
    case '|': return a | b
    case '^': return a ^ b
    case '&': return a & b
    case '==': return B(a === b)
    case '!=': return B(a !== b)
    case '<': return B(a < b)
    case '>': return B(a > b)
    case '<=': return B(a <= b)
    case '>=': return B(a >= b)
    case '<<': return a << b
    case '>>': return a >> b
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': if (b === 0n) throw new Error('division by zero'); return a / b
    case '%': if (b === 0n) throw new Error('division by zero'); return a % b
  }
  throw new Error(`bad operator ${op}`)
}

export function parseIntLiteral(text: string): bigint {
  const s = text.replace(/[uU]$/, '')
  if (/^0[xX]/.test(s)) return BigInt(s)
  if (/^0[0-7]+$/.test(s)) return BigInt('0o' + s.slice(1))
  if (/^\d+$/.test(s)) return BigInt(s)
  throw new Error(`not an integer: ${text}`)
}
