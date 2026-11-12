// Ported from OpenUSD 26.11.1: pxr/usd/sdf/predicateExpression.cpp,
//  pxr/usd/sdf/predicateExpression.h, pxr/usd/sdf/predicateExpressionParser.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/predicateExpression.{h,cpp} and
// predicateExpressionParser.h (OpenUSD v26.05).
//
// SdfPredicateExpression is a standalone boolean predicate sub-language:
// predicate function calls (bare `foo`, colon `isa:mammal,bird`, paren
// `isClose(1.23, tolerance=0.01)`) joined by `and`, `or`, `not`, and an
// implied-and (whitespace).  This module ports the PARSER (string -> AST) and
// GetText() (AST -> canonical string), faithful to upstream.  It does NOT port
// SdfPredicateLibrary / SdfPredicateProgram (linking + evaluation against a real
// object library) -- that is a separate subsystem.

// ---------------------------------------------------------------------------
// AST types

/** A parsed predicate-function argument value (mirrors the VtValue the parser
 *  stores: int64, double, bool, or string). */
export type SdfPredicateArgValue =
  | { readonly type: 'int'; readonly value: number }
  | { readonly type: 'double'; readonly value: number }
  | { readonly type: 'bool'; readonly value: boolean }
  | { readonly type: 'string'; readonly value: string }

/** Represents a function argument name and value.  Positional arguments have
 *  empty names. */
export interface SdfPredicateFnArg {
  argName: string
  value: SdfPredicateArgValue
}

/** Function-call style. */
export enum SdfPredicateFnCallKind {
  BareCall = 0, // no-arg call like 'active'
  ColonCall = 1, // colon-separated pos args, like 'isa:Imageable'
  ParenCall = 2, // paren/comma & pos/kw args like 'foo(23, bar=baz)'
}

/** Represents a function call in an expression. */
export interface SdfPredicateFnCall {
  kind: SdfPredicateFnCallKind
  funcName: string
  args: SdfPredicateFnArg[]
}

/** Enumerant describing a subexpression operation. */
export enum SdfPredicateOp {
  Call = 0,
  Not = 1,
  ImpliedAnd = 2,
  And = 3,
  Or = 4,
}

// ---------------------------------------------------------------------------
// Quoted-string evaluation (port of Sdf_EvalQuotedString / TfEscapeString)

function evalEscapes(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i)
    if (c !== '\\') {
      out += c
      continue
    }
    const n = s.charAt(i + 1)
    switch (n) {
      case 'n': out += '\n'; i++; break
      case 't': out += '\t'; i++; break
      case 'r': out += '\r'; i++; break
      case 'b': out += '\b'; i++; break
      case 'f': out += '\f'; i++; break
      case 'a': out += '\x07'; i++; break
      case 'v': out += '\v'; i++; break
      case '\\': out += '\\'; i++; break
      case '"': out += '"'; i++; break
      case "'": out += "'"; i++; break
      case '?': out += '?'; i++; break
      case 'x': {
        // \xNN... hex escape (one or more hex digits, like TfEscapeString)
        let j = i + 2
        let hex = ''
        while (j < s.length && /[0-9a-fA-F]/.test(s.charAt(j))) { hex += s.charAt(j); j++ }
        if (hex.length) {
          out += String.fromCharCode(parseInt(hex, 16) & 0xff)
          i = j - 1
        } else {
          out += 'x'; i++
        }
        break
      }
      default:
        if (n >= '0' && n <= '7') {
          // octal escape, up to 3 digits
          let j = i + 1
          let oct = ''
          while (j < s.length && oct.length < 3 &&
                 s.charAt(j) >= '0' && s.charAt(j) <= '7') {
            oct += s.charAt(j); j++
          }
          out += String.fromCharCode(parseInt(oct, 8) & 0xff)
          i = j - 1
        } else if (n === '') {
          out += '\\'
        } else {
          // Unknown escape: keep backslash + char (defensive; grammar forbids).
          out += n; i++
        }
        break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Value -> string (port of Sdf_FileIOUtility::StringFromVtValue + Quote)

function isASCIIPrintable(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return c >= 0x20 && c < 0x7f
}

/** Port of Sdf_FileIOUtility::Quote(string). */
function quote(str: string): string {
  // Choose quotes, double quote preferred.
  let q = '"'
  if (str.includes('"') && !str.includes("'")) {
    q = "'"
  }

  // Open quote.  Choose single or triple quotes.
  let triple = false
  let result = ''
  if (str.includes('\n')) {
    triple = true
    result += q
    result += q
  }
  result += q

  for (const ch of str) {
    switch (ch) {
      case '\n':
        result += triple ? '\n' : '\\n'
        break
      case '\r':
        result += '\\r'
        break
      case '\t':
        result += '\\t'
        break
      case '\\':
        result += '\\\\'
        break
      default:
        if (ch === q) {
          result += '\\' + q
        } else if (ch.charCodeAt(0) > 0x7f) {
          // UTF-8 multibyte: pass through as-is.
          result += ch
        } else if (!isASCIIPrintable(ch)) {
          result += '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0')
        } else {
          result += ch
        }
        break
    }
  }

  result += triple ? q + q + q : q
  return result
}

/** Format a double the way USD's TfStringify(double) does (shortest decimal
 *  round-trip, integral doubles print without a fractional part). */
function stringFromDouble(n: number): string {
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  if (Number.isInteger(n)) return `${n}`
  return String(n).replace('e+', 'e')
}

function stringFromVtValue(v: SdfPredicateArgValue): string {
  switch (v.type) {
    case 'string': return quote(v.value)
    case 'bool': return v.value ? '1' : '0' // TfStringify(bool)
    case 'int': return `${v.value}`
    case 'double': return stringFromDouble(v.value)
  }
}

// ---------------------------------------------------------------------------
// SdfPredicateExpression

export class SdfPredicateExpression {
  // The expression is stored in function-call style, *in reverse* (see
  // upstream): "a and b" is { Call(b), Call(a), And }.
  private _ops: SdfPredicateOp[] = []
  // _calls are in forward order; the last Call in _ops is the first _call.
  private _calls: SdfPredicateFnCall[] = []
  private _parseError = ''

  constructor(expr?: string, context = '') {
    if (expr === undefined) return
    try {
      const parser = new _Parser(expr, context)
      const result = parser.parse()
      this._ops = result._ops
      this._calls = result._calls
    } catch (e) {
      if (e instanceof _ParseError) {
        this._parseError = e.message
      } else {
        throw e
      }
    }
  }

  /** Produce a new expression by prepending 'not' onto right. */
  static makeNot(right: SdfPredicateExpression): SdfPredicateExpression {
    const ret = new SdfPredicateExpression()
    ret._ops = right._ops.slice()
    ret._calls = right._calls.slice()
    ret._ops.push(SdfPredicateOp.Not)
    return ret
  }

  /** Combine left and right with op (ImpliedAnd, And, or Or). */
  static makeOp(
    op: SdfPredicateOp,
    left: SdfPredicateExpression,
    right: SdfPredicateExpression,
  ): SdfPredicateExpression {
    const ret = new SdfPredicateExpression()
    ret._ops = right._ops.slice()
    for (const o of left._ops) ret._ops.push(o)
    ret._ops.push(op)
    ret._calls = left._calls.slice()
    for (const c of right._calls) ret._calls.push(c)
    return ret
  }

  /** Produce an expression containing just the function call `call`. */
  static makeCall(call: SdfPredicateFnCall): SdfPredicateExpression {
    const ret = new SdfPredicateExpression()
    ret._ops.push(SdfPredicateOp.Call)
    ret._calls.push(call)
    return ret
  }

  /** Walk the syntax tree, calling `logic` with the current Op stack and
   *  `call` for function calls (port of WalkWithOpStack). */
  walkWithOpStack(
    logic: (stack: Array<[SdfPredicateOp, number]>) => void,
    call: (c: SdfPredicateFnCall) => void,
  ): void {
    if (this.isEmpty()) return

    // Operations are stored in reverse order; iterate from the back.
    let opIdx = this._ops.length - 1
    let callIdx = 0
    const stack: Array<[SdfPredicateOp, number]> = [[this._ops[opIdx]!, 0]]

    while (stack.length) {
      const top = stack[stack.length - 1]!
      const stackOp = top[0]
      let operandIndexEnd = 0

      if (stackOp === SdfPredicateOp.Call) {
        call(this._calls[callIdx++]!)
      } else {
        logic(stack)
        top[1] += 1
        operandIndexEnd = stackOp === SdfPredicateOp.Not ? 2 : 3
      }

      if (top[1] === operandIndexEnd) {
        stack.pop()
      } else {
        opIdx -= 1
        stack.push([this._ops[opIdx]!, 0])
      }
    }
  }

  /** Return a text representation that parses to the same expression. */
  getText(): string {
    let result = ''
    if (this.isEmpty()) return result

    const opName = (k: SdfPredicateOp): string => {
      switch (k) {
        case SdfPredicateOp.Not: return 'not '
        case SdfPredicateOp.ImpliedAnd: return ' '
        case SdfPredicateOp.And: return ' and '
        case SdfPredicateOp.Or: return ' or '
        default: return '<unknown>'
      }
    }

    const printLogic = (stack: Array<[SdfPredicateOp, number]>): void => {
      const op = stack[stack.length - 1]![0]
      const argIndex = stack[stack.length - 1]![1]

      let parenthesize = false
      if (stack.length >= 2) {
        const [parentOp, parentIndex] = stack[stack.length - 2]!
        parenthesize =
          parentOp < op || (parentOp === op && parentIndex === 2)
      }

      if (parenthesize && argIndex === 0) result += '('
      if (op === SdfPredicateOp.Not ? argIndex === 0 : argIndex === 1) {
        result += opName(op)
      }
      if (parenthesize &&
          (op === SdfPredicateOp.Not ? argIndex === 1 : argIndex === 2)) {
        result += ')'
      }
    }

    const printCall = (call: SdfPredicateFnCall): void => {
      result += call.funcName
      switch (call.kind) {
        case SdfPredicateFnCallKind.BareCall:
          break
        case SdfPredicateFnCallKind.ColonCall: {
          const argStrs = call.args.map(a => stringFromVtValue(a.value))
          if (argStrs.length) result += ':' + argStrs.join(',')
          break
        }
        case SdfPredicateFnCallKind.ParenCall: {
          const argStrs = call.args.map(a =>
            `${a.argName ? a.argName + '=' : ''}${stringFromVtValue(a.value)}`)
          result += '('
          if (argStrs.length) result += argStrs.join(', ')
          result += ')'
          break
        }
      }
    }

    this.walkWithOpStack(printLogic, printCall)
    return result
  }

  /** True if this is the empty expression (default-constructed or parse error). */
  isEmpty(): boolean {
    return this._ops.length === 0
  }

  /** Mirror of upstream operator bool(): true if the expression has operations. */
  get isValid(): boolean {
    return !this.isEmpty()
  }

  /** Parse errors as a string, if any were encountered. */
  getParseError(): string {
    return this._parseError
  }

  toString(): string {
    return this.getText()
  }
}

// ---------------------------------------------------------------------------
// Parser (recursive-descent port of the PEGTL grammar in
// predicateExpressionParser.h)

class _ParseError extends Error {}

const RESERVED = new Set(['not', 'and', 'or', 'inf', 'true', 'false'])

function isIdentFirst(c: string): boolean {
  return /[A-Za-z_]/.test(c)
}
function isIdentOther(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}
function isUnquotedChar(c: string): boolean {
  return isIdentOther(c) || '~!@#$%^&*-+=|\\.?/'.includes(c)
}
function isBlank(c: string): boolean {
  return c === ' ' || c === '\t'
}

// Builder _Stack (operator-precedence reduction), ported verbatim.
function higherPrec(left: SdfPredicateOp, right: SdfPredicateOp): boolean {
  return left < right || (left === right && left !== SdfPredicateOp.Not)
}

class _Stack {
  private opStack: SdfPredicateOp[] = []
  private exprStack: SdfPredicateExpression[] = []

  pushOp(op: SdfPredicateOp): void {
    while (this.opStack.length &&
           higherPrec(this.opStack[this.opStack.length - 1]!, op)) {
      this._reduce()
    }
    this.opStack.push(op)
  }

  pushExpr(e: SdfPredicateExpression): void {
    this.exprStack.push(e)
  }

  finish(): SdfPredicateExpression {
    while (this.opStack.length) this._reduce()
    return this.exprStack.pop() as SdfPredicateExpression
  }

  private _reduce(): void {
    const op = this.opStack.pop() as SdfPredicateOp
    const right = this.exprStack.pop() as SdfPredicateExpression
    if (op === SdfPredicateOp.Not) {
      this.exprStack.push(SdfPredicateExpression.makeNot(right))
    } else {
      const left = this.exprStack.pop() as SdfPredicateExpression
      this.exprStack.push(SdfPredicateExpression.makeOp(op, left, right))
    }
  }
}

class _Parser {
  private s: string
  private pos = 0

  constructor(input: string, _context: string) {
    this.s = input
  }

  parse(): SdfPredicateExpression {
    const expr = this.parseExpr()
    if (expr === null) this.fail()
    // Must be at end of input (eolf): no trailing characters.
    if (this.pos !== this.s.length) this.fail()
    return expr as SdfPredicateExpression
  }

  private fail(): never {
    throw new _ParseError(
      `parse error at ${this.pos + 1}: ${JSON.stringify(this.s.slice(this.pos))}`)
  }

  private peek(): string {
    return this.s.charAt(this.pos) ?? ''
  }

  private skipBlanks(): void {
    while (this.pos < this.s.length && isBlank(this.s.charAt(this.pos))) this.pos++
  }

  private skipBlanksAtLeastOne(): boolean {
    const start = this.pos
    this.skipBlanks()
    return this.pos > start
  }

  // keyword<...>: literal followed by a non-identifier boundary.
  private matchKeyword(kw: string): boolean {
    if (this.s.startsWith(kw, this.pos)) {
      const after = this.s.charAt(this.pos + kw.length)
      if (after === '' || !isIdentOther(after)) {
        this.pos += kw.length
        return true
      }
    }
    return false
  }

  // PredExpr : LookaheadList<PredFactor, PredOperator>
  private parseExpr(): SdfPredicateExpression | null {
    const first = this.parseFactor()
    if (first === null) return null
    const stack = new _Stack()
    stack.pushExpr(first)

    for (;;) {
      const opStart = this.pos
      const op = this.parseOperator()
      if (op === null) break
      const factor = this.parseFactor()
      if (factor === null) {
        // at<Sep, Rule> lookahead failed: un-consume the operator.
        this.pos = opStart
        break
      }
      stack.pushOp(op)
      stack.pushExpr(factor)
    }
    return stack.finish()
  }

  // PredOperator : sor<OptSpaced<AndKW>, OptSpaced<OrKW>, ImpliedAnd>
  private parseOperator(): SdfPredicateOp | null {
    const start = this.pos
    // OptSpaced<AndKW>
    this.skipBlanks()
    if (this.matchKeyword('and')) { this.skipBlanks(); return SdfPredicateOp.And }
    this.pos = start
    this.skipBlanks()
    if (this.matchKeyword('or')) { this.skipBlanks(); return SdfPredicateOp.Or }
    this.pos = start
    // ImpliedAnd : plus<blank>
    if (this.skipBlanksAtLeastOne()) return SdfPredicateOp.ImpliedAnd
    this.pos = start
    return null
  }

  // PredFactor : seq<opt<OptSpaced<list<NotKW, plus<blank>>>>, PredAtom>
  private parseFactor(): SdfPredicateExpression | null {
    const nots = this.parseNots()
    const atom = this.parseAtom()
    if (atom === null) {
      // The optional not-prefix consumed nothing observable we must restore,
      // because PredFactor as a whole fails -> the caller restores position.
      return null
    }
    let expr = atom
    for (let i = 0; i < nots; i++) {
      expr = SdfPredicateExpression.makeNot(expr)
    }
    return expr
  }

  // opt<OptSpaced<list<NotKW, plus<blank>>>>
  private parseNots(): number {
    const start = this.pos
    this.skipBlanks() // leading pad
    if (!this.matchKeyword('not')) {
      this.pos = start
      return 0
    }
    let count = 1
    for (;;) {
      const save = this.pos
      if (!this.skipBlanksAtLeastOne()) break
      if (!this.matchKeyword('not')) { this.pos = save; break }
      count++
    }
    this.skipBlanks() // trailing pad
    return count
  }

  // PredAtom : sor<PredColonCall, PredParenCall, PredBareCall, group>
  private parseAtom(): SdfPredicateExpression | null {
    const start = this.pos
    let r = this.parseColonCall()
    if (r !== null) return r
    this.pos = start
    r = this.parseParenCall()
    if (r !== null) return r
    this.pos = start
    r = this.parseBareCall()
    if (r !== null) return r
    this.pos = start
    return this.parseGroup()
  }

  // PredFuncName : minus<identifier, ReservedWord>
  private parseFuncName(): string | null {
    const start = this.pos
    if (this.pos >= this.s.length || !isIdentFirst(this.s.charAt(this.pos))) return null
    let name = this.s.charAt(this.pos)
    this.pos++
    while (this.pos < this.s.length && isIdentOther(this.s.charAt(this.pos))) {
      name += this.s.charAt(this.pos)
      this.pos++
    }
    if (RESERVED.has(name)) { this.pos = start; return null }
    return name
  }

  // PredColonCall : if_must<seq<PredFuncName, ':'>, PredColonArgs>
  private parseColonCall(): SdfPredicateExpression | null {
    const start = this.pos
    const name = this.parseFuncName()
    if (name === null) { this.pos = start; return null }
    if (this.peek() !== ':') { this.pos = start; return null }
    this.pos++ // consume ':'
    // must: PredColonArgs = list<PredArgVal, ','>
    const args: SdfPredicateFnArg[] = []
    args.push({ argName: '', value: this.parseArgVal() })
    while (this.peek() === ',') {
      this.pos++
      args.push({ argName: '', value: this.parseArgVal() })
    }
    return SdfPredicateExpression.makeCall(
      { kind: SdfPredicateFnCallKind.ColonCall, funcName: name, args })
  }

  // PredParenCall : seq<PredFuncName, OptSpaced<'('>, must<PredParenArgs, *blank, ')'>>
  private parseParenCall(): SdfPredicateExpression | null {
    const start = this.pos
    const name = this.parseFuncName()
    if (name === null) { this.pos = start; return null }
    this.skipBlanks()
    if (this.peek() !== '(') { this.pos = start; return null }
    this.pos++ // consume '('
    this.skipBlanks() // trailing pad of OptSpaced<'('>
    // must from here on.
    const args = this.parseParenArgs()
    this.skipBlanks()
    if (this.peek() !== ')') this.fail()
    this.pos++ // consume ')'
    return SdfPredicateExpression.makeCall(
      { kind: SdfPredicateFnCallKind.ParenCall, funcName: name, args })
  }

  // PredBareCall : PredFuncName
  private parseBareCall(): SdfPredicateExpression | null {
    const name = this.parseFuncName()
    if (name === null) return null
    return SdfPredicateExpression.makeCall(
      { kind: SdfPredicateFnCallKind.BareCall, funcName: name, args: [] })
  }

  // if_must<PredOpenGroup, OptSpaced<PredExpr>, PredCloseGroup>
  private parseGroup(): SdfPredicateExpression | null {
    if (this.peek() !== '(') return null
    this.pos++ // PredOpenGroup
    this.skipBlanks()
    const inner = this.parseExpr()
    if (inner === null) this.fail()
    this.skipBlanks()
    if (this.peek() !== ')') this.fail()
    this.pos++ // PredCloseGroup
    return inner
  }

  // PredParenArgs : if_then_else<list<PredParenPosArg, comma>,
  //                              opt<comma, list<PredKWArg, comma>>,
  //                              opt<list<PredKWArg, comma>>>
  private parseParenArgs(): SdfPredicateFnArg[] {
    const args: SdfPredicateFnArg[] = []
    const pos = this.tryPosArg()
    if (pos !== null) {
      args.push(pos)
      // list<PredParenPosArg, OptSpacedComma>
      for (;;) {
        const save = this.pos
        if (!this.tryOptSpacedComma()) break
        const p = this.tryPosArg()
        if (p === null) { this.pos = save; break }
        args.push(p)
      }
      // opt<OptSpacedComma, list<PredKWArg, OptSpacedComma>>
      const save = this.pos
      if (this.tryOptSpacedComma()) {
        const kw = this.tryKwArg()
        if (kw === null) {
          this.pos = save
        } else {
          args.push(kw)
          for (;;) {
            const s2 = this.pos
            if (!this.tryOptSpacedComma()) break
            const k = this.tryKwArg()
            if (k === null) { this.pos = s2; break }
            args.push(k)
          }
        }
      }
    } else {
      // opt<list<PredKWArg, OptSpacedComma>>
      const kw = this.tryKwArg()
      if (kw !== null) {
        args.push(kw)
        for (;;) {
          const save = this.pos
          if (!this.tryOptSpacedComma()) break
          const k = this.tryKwArg()
          if (k === null) { this.pos = save; break }
          args.push(k)
        }
      }
    }
    return args
  }

  private tryOptSpacedComma(): boolean {
    const start = this.pos
    this.skipBlanks()
    if (this.peek() !== ',') { this.pos = start; return false }
    this.pos++
    this.skipBlanks()
    return true
  }

  // PredKWArgPrefix : seq<PredKWArgName, OptSpaced<'='>>
  // Returns the kw name (and consumes through '=') or null (restoring pos).
  private tryKwArgPrefix(): string | null {
    const start = this.pos
    const name = this.parseKwArgName()
    if (name === null) { this.pos = start; return null }
    this.skipBlanks()
    if (this.peek() !== '=') { this.pos = start; return null }
    this.pos++
    this.skipBlanks()
    return name
  }

  // PredKWArgName : minus<identifier, ReservedWord>
  private parseKwArgName(): string | null {
    const start = this.pos
    if (this.pos >= this.s.length || !isIdentFirst(this.s.charAt(this.pos))) return null
    let name = this.s.charAt(this.pos)
    this.pos++
    while (this.pos < this.s.length && isIdentOther(this.s.charAt(this.pos))) {
      name += this.s.charAt(this.pos)
      this.pos++
    }
    if (RESERVED.has(name)) { this.pos = start; return null }
    return name
  }

  // PredKWArg : if_must<PredKWArgPrefix, PredArgVal>
  private tryKwArg(): SdfPredicateFnArg | null {
    const name = this.tryKwArgPrefix()
    if (name === null) return null
    return { argName: name, value: this.parseArgVal() }
  }

  // PredParenPosArg : seq<not_at<PredKWArgPrefix>, PredArgVal>
  private tryPosArg(): SdfPredicateFnArg | null {
    const start = this.pos
    // not_at<PredKWArgPrefix>
    const kw = this.tryKwArgPrefix()
    if (kw !== null) { this.pos = start; return null }
    this.pos = start
    return { argName: '', value: this.parseArgVal() }
  }

  // PredArgVal : sor<PredArgFloat, PredArgInt, PredArgBool, PredArgString>
  private parseArgVal(): SdfPredicateArgValue {
    const f = this.tryFloat()
    if (f !== null) return { type: 'double', value: f }
    const i = this.tryInt()
    if (i !== null) return { type: 'int', value: i }
    const b = this.tryBool()
    if (b !== null) return { type: 'bool', value: b }
    return { type: 'string', value: this.parseString() }
  }

  // PredArgFloat : opt'-' (inf | Digits (Frac (Exp?) | Exp))
  private tryFloat(): number | null {
    const start = this.pos
    let neg = false
    if (this.peek() === '-') { neg = true; this.pos++ }
    if (this.matchKeyword('inf')) {
      return neg ? -Infinity : Infinity
    }
    const digStart = this.pos
    while (this.pos < this.s.length && /[0-9]/.test(this.s.charAt(this.pos))) this.pos++
    if (this.pos === digStart) { this.pos = start; return null }
    let hasFracOrExp = false
    // Frac : '.' Digits
    if (this.peek() === '.') {
      const save = this.pos
      this.pos++
      const fStart = this.pos
      while (this.pos < this.s.length && /[0-9]/.test(this.s.charAt(this.pos))) this.pos++
      if (this.pos === fStart) { this.pos = save } // not a valid frac
      else hasFracOrExp = true
    }
    // Exp : [eE] [-+]? Digits   (required if no Frac matched)
    if (this.peek() === 'e' || this.peek() === 'E') {
      const save = this.pos
      this.pos++
      if (this.peek() === '-' || this.peek() === '+') this.pos++
      const eStart = this.pos
      while (this.pos < this.s.length && /[0-9]/.test(this.s.charAt(this.pos))) this.pos++
      if (this.pos === eStart) { this.pos = save } // not a valid exp
      else hasFracOrExp = true
    }
    if (!hasFracOrExp) { this.pos = start; return null }
    return parseFloat(this.s.slice(start, this.pos))
  }

  // PredArgInt : opt'-' Digits
  private tryInt(): number | null {
    const start = this.pos
    if (this.peek() === '-') this.pos++
    const dStart = this.pos
    while (this.pos < this.s.length && /[0-9]/.test(this.s.charAt(this.pos))) this.pos++
    if (this.pos === dStart) { this.pos = start; return null }
    return parseInt(this.s.slice(start, this.pos), 10)
  }

  // PredArgBool : true | false
  private tryBool(): boolean | null {
    if (this.matchKeyword('true')) return true
    if (this.matchKeyword('false')) return false
    return null
  }

  // PredArgString : sor<QuotedString, UnquotedString>
  private parseString(): string {
    const c = this.peek()
    if (c === '"' || c === "'") {
      const quoteCh = c
      const start = this.pos
      this.pos++ // opening quote
      // until<Quote, StringChar<Quote>>
      while (this.pos < this.s.length) {
        const ch = this.s.charAt(this.pos)
        if (ch === quoteCh) {
          this.pos++ // closing quote
          const raw = this.s.slice(start + 1, this.pos - 1)
          return evalEscapes(raw)
        }
        if (ch === '\\') {
          // Escaped<Quote> : Quote | one of b f n r t  (must)
          const n = this.s.charAt(this.pos + 1)
          if (n === quoteCh || 'bfnrt'.includes(n) || n === '\\') {
            this.pos += 2
            continue
          }
          this.fail() // invalid escape (if_must / must)
        }
        const code = ch.charCodeAt(0)
        if (code < 0x20) this.fail() // Unescaped requires >= 0x20
        this.pos++
      }
      // Unterminated quoted string.
      this.fail()
    }
    // UnquotedString : star<UnquotedStringChar>
    const start = this.pos
    while (this.pos < this.s.length && isUnquotedChar(this.s.charAt(this.pos))) this.pos++
    return evalEscapes(this.s.slice(start, this.pos))
  }
}
