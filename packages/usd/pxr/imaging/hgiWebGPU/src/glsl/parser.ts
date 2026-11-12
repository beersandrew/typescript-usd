// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/codeGen.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Recursive-descent parser for the GLSL subset in Storm's glslfx sections and
// code-generator output (no upstream counterpart; see lexer.ts and
// packages/usd/docs/imaging-i1.md section 3.2 step 2).
//
// Beyond GLSL 4.50 it accepts the two C++ forms that Storm's code generator
// writes when the device reports Metal-style tessellation, which HgiWebGPU
// does (pxr/imaging/hdSt/codeGen.cpp:2528-2540): a single-parameter function
// template (`template <typename T> T InterpolatePrimvar(T ...)`) and default
// argument values (`vec2 uv = vec2()`).

import type {
  BlockStmt, Declarator, Expr, FunctionDecl, ParamDecl, Stmt, StructDecl, SwitchCase, TopLevel,
  TranslationUnit, TypeSpec,
} from './ast.ts'
import { formatLoc, type SourceLoc, type Token } from './lexer.ts'
import { isBasicTypeName } from './types.ts'

export class ParseError extends Error {
  readonly loc: SourceLoc
  constructor(message: string, loc: SourceLoc) {
    super(`${formatLoc(loc)}: ${message}`)
    this.loc = loc
  }
}

const QUALIFIERS = new Set([
  'const', 'in', 'out', 'inout', 'uniform', 'buffer', 'shared', 'flat', 'smooth', 'noperspective',
  'centroid', 'sample', 'patch', 'highp', 'mediump', 'lowp', 'precise', 'invariant', 'readonly',
  'writeonly', 'coherent', 'volatile', 'restrict', 'attribute', 'varying', 'static', 'thread',
  'device', 'constant', 'threadgroup',
])

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|='])

const BINARY_LEVELS: string[][] = [
  ['||'], ['^^'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%'],
]

export function parse(tokens: Token[], knownTypes: Iterable<string> = []): TranslationUnit {
  return new Parser(tokens, knownTypes).translationUnit()
}

class Parser {
  private i = 0
  private readonly toks: Token[]
  private readonly structNames: Set<string>
  private templateParams: string[] = []

  constructor(tokens: Token[], knownTypes: Iterable<string>) {
    this.toks = tokens
    this.structNames = new Set(knownTypes)
  }

  // ------------------------------------------------------------- utilities

  private get t(): Token {
    return this.toks[this.i] as Token
  }
  private at(k: number): Token {
    return (this.toks[this.i + k] ?? this.toks[this.toks.length - 1]) as Token
  }
  private is(text: string): boolean {
    const t = this.t
    return t.text === text && t.kind !== 'eof'
  }
  private eat(text: string): boolean {
    if (this.is(text)) {
      this.i++
      return true
    }
    return false
  }
  private expect(text: string): Token {
    if (!this.is(text)) throw new ParseError(`expected '${text}', found '${this.t.text || 'end of input'}'`, this.t.loc)
    return this.toks[this.i++] as Token
  }
  private ident(): Token {
    const t = this.t
    if (t.kind !== 'id') throw new ParseError(`expected identifier, found '${t.text || 'end of input'}'`, t.loc)
    this.i++
    return t
  }
  private isTypeName(name: string): boolean {
    return isBasicTypeName(name) || this.structNames.has(name) || this.templateParams.includes(name)
  }

  // ---------------------------------------------------------- top level

  translationUnit(): TranslationUnit {
    const decls: TopLevel[] = []
    while (this.t.kind !== 'eof') {
      if (this.eat(';')) continue
      for (const d of this.externalDecl()) decls.push(d)
    }
    return { decls }
  }

  private skipLayout(): void {
    if (this.is('layout') && this.at(1).text === '(') {
      this.i++
      this.skipBalanced('(', ')')
    }
  }

  private skipBalanced(open: string, close: string): void {
    this.expect(open)
    let depth = 1
    while (depth > 0) {
      if (this.t.kind === 'eof') throw new ParseError(`unbalanced '${open}'`, this.t.loc)
      if (this.t.text === open) depth++
      else if (this.t.text === close) depth--
      this.i++
    }
  }

  private qualifiers(): string[] {
    const q: string[] = []
    for (;;) {
      this.skipLayout()
      if (this.t.kind === 'id' && QUALIFIERS.has(this.t.text)) {
        q.push(this.t.text)
        this.i++
        continue
      }
      return q
    }
  }

  private externalDecl(): TopLevel[] {
    const loc = this.t.loc
    if (this.is('precision')) {
      while (!this.eat(';')) this.i++
      return []
    }
    let templateParams: string[] = []
    if (this.is('template')) {
      this.i++
      this.expect('<')
      for (;;) {
        if (!(this.eat('typename') || this.eat('class'))) throw new ParseError('expected typename', this.t.loc)
        templateParams.push(this.ident().text)
        if (this.eat('>')) break
        this.expect(',')
      }
    }
    const quals = this.qualifiers()
    // interface block: qualifier BlockName { ... } instance;
    if (quals.length && this.t.kind === 'id' && !this.isTypeName(this.t.text) && this.at(1).text === '{') {
      const blockName = this.ident().text
      const fields = this.structBody()
      let instance: string | null = null
      let arraySizes: (Expr | null)[] = []
      if (this.t.kind === 'id') {
        instance = this.ident().text
        arraySizes = this.arraySuffix()
      }
      this.expect(';')
      return [{ kind: 'block', qualifiers: quals, blockName, fields, instance, arraySizes, loc }]
    }
    const saved = this.templateParams
    this.templateParams = templateParams
    try {
      const type = this.typeSpec()
      const out: TopLevel[] = []
      if (type.struct) out.push(type.struct)
      if (this.eat(';')) {
        if (!type.struct && !quals.length) throw new ParseError('declaration declares nothing', loc)
        return out
      }
      const nameTok = this.ident()
      if (this.is('(')) {
        out.push(this.functionRest(type, nameTok, templateParams, loc))
        return out
      }
      templateParams = []
      const declarators = this.declaratorsRest(nameTok)
      this.expect(';')
      out.push({ kind: 'global', qualifiers: quals, type: type.struct ? { ...type, name: type.struct.name } : type, declarators, loc })
      return out
    } finally {
      this.templateParams = saved
    }
  }

  private functionRest(returnType: TypeSpec, nameTok: Token, templateParams: string[], loc: SourceLoc): FunctionDecl {
    this.expect('(')
    const params: ParamDecl[] = []
    if (this.is('void') && this.at(1).text === ')') this.i++
    if (!this.is(')')) {
      for (;;) {
        params.push(this.param())
        if (this.eat(')')) break
        this.expect(',')
      }
    } else {
      this.expect(')')
    }
    let body: BlockStmt | null = null
    if (this.is('{')) body = this.block()
    else this.expect(';')
    return { kind: 'function', returnType, name: nameTok.text, params, body, templateParams, loc }
  }

  private param(): ParamDecl {
    const loc = this.t.loc
    const quals = this.qualifiers()
    let qualifier: ParamDecl['qualifier'] = 'in'
    if (quals.includes('inout') || (quals.includes('in') && quals.includes('out'))) qualifier = 'inout'
    else if (quals.includes('out')) qualifier = 'out'
    const type = this.typeSpec()
    let name = ''
    let arraySizes: (Expr | null)[] = []
    if (this.t.kind === 'id') {
      name = this.ident().text
      arraySizes = this.arraySuffix()
    }
    let defaultValue: Expr | null = null
    if (this.eat('=')) defaultValue = this.assignment()
    return { type, name, arraySizes, qualifier, isConst: quals.includes('const'), defaultValue, loc }
  }

  private structBody(): StructDecl['fields'] {
    this.expect('{')
    const fields: StructDecl['fields'] = []
    while (!this.eat('}')) {
      this.qualifiers()
      const type = this.typeSpec()
      for (;;) {
        const loc = this.t.loc
        const name = this.ident().text
        const arraySizes = this.arraySuffix()
        fields.push({ type, name, arraySizes, loc })
        if (this.eat(';')) break
        this.expect(',')
      }
    }
    return fields
  }

  private typeSpec(): TypeSpec {
    const loc = this.t.loc
    if (this.is('struct')) {
      this.i++
      let name = ''
      if (this.t.kind === 'id') name = this.ident().text
      if (!name) name = `_anon_struct_${loc.line}_${loc.col}`
      this.structNames.add(name)
      const fields = this.structBody()
      const decl: StructDecl = { kind: 'struct', name, fields, loc }
      return { name, arraySizes: this.arraySuffix(), struct: decl, loc }
    }
    const t = this.t
    if (t.kind !== 'id' || !this.isTypeName(t.text)) {
      throw new ParseError(`expected a type, found '${t.text || 'end of input'}'`, t.loc)
    }
    this.i++
    return { name: t.text, arraySizes: this.arraySuffix(), loc }
  }

  private arraySuffix(): (Expr | null)[] {
    const sizes: (Expr | null)[] = []
    while (this.is('[')) {
      this.i++
      if (this.eat(']')) {
        sizes.push(null)
        continue
      }
      sizes.push(this.expression())
      this.expect(']')
    }
    return sizes
  }

  private declaratorsRest(first: Token): Declarator[] {
    const out: Declarator[] = []
    let nameTok = first
    for (;;) {
      const arraySizes = this.arraySuffix()
      let init: Expr | null = null
      if (this.eat('=')) init = this.initializer()
      out.push({ name: nameTok.text, arraySizes, init, loc: nameTok.loc })
      if (!this.eat(',')) return out
      nameTok = this.ident()
    }
  }

  private initializer(): Expr {
    if (this.is('{')) {
      const loc = this.t.loc
      this.i++
      const items: Expr[] = []
      while (!this.eat('}')) {
        items.push(this.initializer())
        if (!this.is('}')) this.expect(',')
      }
      return { kind: 'initlist', items, loc }
    }
    return this.assignment()
  }

  // ------------------------------------------------------------ statements

  private block(): BlockStmt {
    const loc = this.expect('{').loc
    const stmts: Stmt[] = []
    while (!this.eat('}')) {
      if (this.t.kind === 'eof') throw new ParseError("expected '}'", this.t.loc)
      stmts.push(this.statement())
    }
    return { kind: 'block', stmts, loc }
  }

  private isDeclStart(): boolean {
    let k = 0
    for (;;) {
      const t = this.at(k)
      if (t.text === 'layout' && this.at(k + 1).text === '(') return true
      if (t.kind === 'id' && QUALIFIERS.has(t.text)) {
        k++
        continue
      }
      break
    }
    if (k > 0) return true
    const t = this.at(0)
    if (t.text === 'struct') return true
    if (t.kind !== 'id' || !this.isTypeName(t.text)) return false
    const n = this.at(1)
    if (n.kind === 'id') return true
    if (n.text === '[') {
      // `T[N] name` is a declaration, `T[N](...)` a constructor
      let depth = 0
      let j = 1
      for (;; j++) {
        const x = this.at(j)
        if (x.kind === 'eof') return false
        if (x.text === '[') depth++
        else if (x.text === ']') {
          depth--
          if (depth === 0 && this.at(j + 1).text !== '[') break
        }
      }
      return this.at(j + 1).kind === 'id'
    }
    return false
  }

  private statement(): Stmt {
    const t = this.t
    const loc = t.loc
    if (t.text === '{') return this.block()
    if (t.text === ';') {
      this.i++
      return { kind: 'empty', loc }
    }
    if (t.kind === 'id') {
      switch (t.text) {
        case 'if': {
          this.i++
          this.expect('(')
          const cond = this.expression()
          this.expect(')')
          const then = this.statement()
          const els = this.eat('else') ? this.statement() : null
          return { kind: 'if', cond, then, else: els, loc }
        }
        case 'for': {
          this.i++
          this.expect('(')
          let init: Stmt | null = null
          if (!this.eat(';')) {
            init = this.isDeclStart() ? this.declStatement() : { kind: 'expr', expr: this.expression(), loc: this.t.loc }
            if (init.kind === 'expr') this.expect(';')
          }
          const cond = this.is(';') ? null : this.expression()
          this.expect(';')
          const update = this.is(')') ? null : this.expression()
          this.expect(')')
          const body = this.statement()
          return { kind: 'for', init, cond, update, body, loc }
        }
        case 'while': {
          this.i++
          this.expect('(')
          const cond = this.expression()
          this.expect(')')
          return { kind: 'while', cond, body: this.statement(), loc }
        }
        case 'do': {
          this.i++
          const body = this.statement()
          this.expect('while')
          this.expect('(')
          const cond = this.expression()
          this.expect(')')
          this.expect(';')
          return { kind: 'dowhile', body, cond, loc }
        }
        case 'switch':
          return this.switchStatement()
        case 'break':
        case 'continue':
        case 'discard':
          this.i++
          this.expect(';')
          return { kind: t.text, loc }
        case 'return': {
          this.i++
          const value = this.is(';') ? null : this.expression()
          this.expect(';')
          return { kind: 'return', value, loc }
        }
      }
    }
    if (this.isDeclStart()) return this.declStatement()
    const expr = this.expression()
    this.expect(';')
    return { kind: 'expr', expr, loc }
  }

  private declStatement(): Stmt {
    const loc = this.t.loc
    const quals = this.qualifiers()
    const type = this.typeSpec()
    if (this.eat(';')) {
      if (type.struct) return { kind: 'localstruct', decl: type.struct, loc }
      throw new ParseError('declaration declares nothing', loc)
    }
    const declarators = this.declaratorsRest(this.ident())
    this.expect(';')
    if (type.struct) {
      // struct definition with variables in a function body
      return {
        kind: 'block',
        stmts: [{ kind: 'localstruct', decl: type.struct, loc }, { kind: 'decl', qualifiers: quals, type: { ...type, name: type.struct.name }, declarators, loc }],
        loc,
      }
    }
    return { kind: 'decl', qualifiers: quals, type, declarators, loc }
  }

  private switchStatement(): Stmt {
    const loc = this.expect('switch').loc
    this.expect('(')
    const expr = this.expression()
    this.expect(')')
    this.expect('{')
    const cases: SwitchCase[] = []
    let current: SwitchCase | null = null
    while (!this.eat('}')) {
      if (this.is('case') || this.is('default')) {
        const cl = this.t.loc
        let label: Expr | 'default'
        if (this.eat('default')) label = 'default'
        else {
          this.i++
          label = this.conditional()
        }
        this.expect(':')
        if (current && current.body.length === 0) current.labels.push(label)
        else {
          current = { labels: [label], body: [], loc: cl }
          cases.push(current)
        }
        continue
      }
      if (!current) throw new ParseError('statement before the first case label', this.t.loc)
      current.body.push(this.statement())
    }
    return { kind: 'switch', expr, cases, loc }
  }

  // ----------------------------------------------------------- expressions

  expression(): Expr {
    const first = this.assignment()
    if (!this.is(',')) return first
    const exprs = [first]
    while (this.eat(',')) exprs.push(this.assignment())
    return { kind: 'comma', exprs, loc: first.loc }
  }

  private assignment(): Expr {
    const lhs = this.conditional()
    const op = this.t.text
    if (this.t.kind === 'punct' && ASSIGN_OPS.has(op)) {
      this.i++
      const value = this.assignment()
      return { kind: 'assign', op, target: lhs, value, loc: lhs.loc }
    }
    return lhs
  }

  private conditional(): Expr {
    const cond = this.binary(0)
    if (this.eat('?')) {
      const a = this.expression()
      this.expect(':')
      const b = this.assignment()
      return { kind: 'ternary', cond, a, b, loc: cond.loc }
    }
    return cond
  }

  private binary(level: number): Expr {
    if (level >= BINARY_LEVELS.length) return this.unary()
    let lhs = this.binary(level + 1)
    const ops = BINARY_LEVELS[level] as string[]
    while (this.t.kind === 'punct' && ops.includes(this.t.text)) {
      const op = this.t.text
      this.i++
      const rhs = this.binary(level + 1)
      lhs = { kind: 'binary', op, left: lhs, right: rhs, loc: lhs.loc }
    }
    return lhs
  }

  private unary(): Expr {
    const t = this.t
    if (t.kind === 'punct' && ['+', '-', '!', '~', '++', '--'].includes(t.text)) {
      this.i++
      const operand = this.unary()
      return { kind: 'unary', op: t.text, operand, loc: t.loc }
    }
    return this.postfix()
  }

  private postfix(): Expr {
    let e = this.primary()
    for (;;) {
      const t = this.t
      if (t.text === '[') {
        this.i++
        const index = this.expression()
        this.expect(']')
        e = { kind: 'index', base: e, index, loc: e.loc }
      } else if (t.text === '.') {
        this.i++
        const name = this.ident().text
        if (this.is('(')) {
          const args = this.callArgs()
          e = { kind: 'method', base: e, name, args, loc: e.loc }
        } else {
          e = { kind: 'member', base: e, name, loc: e.loc }
        }
      } else if (t.text === '++' || t.text === '--') {
        this.i++
        e = { kind: 'postfix', op: t.text, operand: e, loc: e.loc }
      } else {
        return e
      }
    }
  }

  private callArgs(): Expr[] {
    this.expect('(')
    const args: Expr[] = []
    if (this.is('void') && this.at(1).text === ')') this.i++
    if (this.eat(')')) return args
    for (;;) {
      args.push(this.assignment())
      if (this.eat(')')) return args
      this.expect(',')
    }
  }

  private primary(): Expr {
    const t = this.t
    const loc = t.loc
    if (t.text === '(') {
      this.i++
      const e = this.expression()
      this.expect(')')
      return e
    }
    if (t.kind === 'num') {
      this.i++
      return { kind: 'literal', text: t.text, litType: literalType(t.text), loc }
    }
    if (t.kind === 'id') {
      if (t.text === 'true' || t.text === 'false') {
        this.i++
        return { kind: 'literal', text: t.text, litType: 'bool', loc }
      }
      this.i++
      // constructor with array dimensions: float[3](...)
      if (this.isTypeName(t.text) && this.is('[')) {
        const dims = this.arraySuffix()
        const args = this.callArgs()
        return { kind: 'call', callee: t.text, ctorArray: dims, args, loc }
      }
      if (this.is('(')) {
        const args = this.callArgs()
        return { kind: 'call', callee: t.text, args, loc }
      }
      return { kind: 'ident', name: t.text, loc }
    }
    throw new ParseError(`unexpected '${t.text || 'end of input'}'`, loc)
  }
}

export function literalType(text: string): 'int' | 'uint' | 'float' {
  if (/^0[xX]/.test(text)) return /[uU]$/.test(text) ? 'uint' : 'int'
  if (/[.eE]/.test(text) || /[fF]$/.test(text)) return 'float'
  if (/[uU]$/.test(text)) return 'uint'
  return 'int'
}
