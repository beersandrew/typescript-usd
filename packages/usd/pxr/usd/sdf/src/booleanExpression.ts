// Ported from OpenUSD 26.11.1: pxr/usd/sdf/booleanExpression.cpp,
//  pxr/usd/sdf/booleanExpression.h, pxr/usd/sdf/booleanExpressionEval.cpp,
//  pxr/usd/sdf/booleanExpressionParsing.cpp,
//  pxr/usd/sdf/testenv/testSdfBooleanExpression.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/booleanExpression.{h,cpp}, booleanExpressionParsing.cpp,
// and booleanExpressionEval.cpp (OpenUSD v26.05).
//
// SdfBooleanExpression represents an expression that evaluates to a boolean
// value: variables, constants (number/string/bool), the six comparison
// operators (==, !=, <, <=, >, >=) and the boolean operators && and || joined
// with the unary ! operator.  This module ports the PARSER (string -> AST),
// GetText() (AST -> canonical string), the evaluator (Evaluate, with the
// PromoteToCommonType bool/int -> double promotion), variable renaming, and
// programmatic construction (MakeVariable/MakeConstant/MakeBinaryOp/
// MakeUnaryOp), faithful to upstream.
//
// SdfBooleanExpression has NO Python binding upstream; the test goldens are
// derived from the C++ testenv (testSdfBooleanExpression.cpp), which is the
// sanctioned unbound-C++ oracle.

// ---------------------------------------------------------------------------
// Public enums (mirrors SdfBooleanExpression::BinaryOperator / UnaryOperator)

/** Operators for combining two subexpressions. \see makeBinaryOp */
export enum SdfBooleanExpressionBinaryOperator {
  EqualTo = 0, // ==
  NotEqualTo = 1, // !=
  LessThan = 2, // <
  LessThanOrEqualTo = 3, // <=
  GreaterThan = 4, // >
  GreaterThanOrEqualTo = 5, // >=
  And = 6, // &&
  Or = 7, // ||
}

/** Operators applied to a single subexpression. \see makeUnaryOp */
export enum SdfBooleanExpressionUnaryOperator {
  Not = 0, // !
}

/** The value type that a constant may hold or a variable may resolve to (the
 *  analog of the VtValue passed through Evaluate; numbers cover int/double and
 *  strings cover TfToken, matching upstream's PromoteToCommonType). */
export type SdfBooleanExprValue = number | string | boolean

/** Provides the current value for a given variable.  Returning `undefined`
 *  mirrors an empty VtValue (variable not found). */
export type SdfBooleanExprVariableCallback =
  (name: string) => SdfBooleanExprValue | undefined

/** Transformation applied to a variable name by renameVariables(). */
export type SdfBooleanExprNameTransform = (name: string) => string

// ---------------------------------------------------------------------------
// AST nodes (port of the _Node hierarchy)

type _Node =
  | { readonly kind: 'const'; readonly value: SdfBooleanExprValue }
  | { readonly kind: 'var'; readonly name: string }
  | {
      readonly kind: 'binary'
      readonly op: SdfBooleanExpressionBinaryOperator
      readonly lhs: _Node
      readonly rhs: _Node
    }
  | {
      readonly kind: 'unary'
      readonly op: SdfBooleanExpressionUnaryOperator
      readonly inner: _Node
    }

// The precedence for each node type, used to determine where parenthesis are
// needed when formatting an expression (port of _NodePrecedence).  Lower binds
// looser is NOT the meaning here -- this enum is ordered so that a parent emits
// parens around a child whose precedence value is greater.
enum _NodePrecedence {
  Literal = 0,
  Not = 1,
  Comparison = 2,
  And = 3,
  Or = 4,
}

function _nodePrecedence(node: _Node): _NodePrecedence {
  switch (node.kind) {
    case 'const':
    case 'var':
      return _NodePrecedence.Literal
    case 'unary':
      return _NodePrecedence.Not
    case 'binary':
      switch (node.op) {
        case SdfBooleanExpressionBinaryOperator.And:
          return _NodePrecedence.And
        case SdfBooleanExpressionBinaryOperator.Or:
          return _NodePrecedence.Or
        default:
          return _NodePrecedence.Comparison
      }
  }
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
      default:
        if (n === '') {
          out += '\\'
        } else {
          // Unknown escape: keep the escaped char (grammar restricts escapes).
          out += n; i++
        }
        break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Value -> string (port of Sdf_FileIOUtility::Quote with allowTripleQuotes=false
// and the _ConstantNode::WriteToStream boolalpha path)

function isASCIIPrintable(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return c >= 0x20 && c < 0x7f
}

/** Port of Sdf_FileIOUtility::Quote(string, /*allowTripleQuotes=* /false). */
function quote(str: string): string {
  // Choose quotes, double quote preferred; switch to single if the string
  // contains a double quote but no single quote.
  let q = '"'
  if (str.includes('"') && !str.includes("'")) {
    q = "'"
  }

  let result = q
  for (const ch of str) {
    switch (ch) {
      case '\n': result += '\\n'; break // never triple-quoted here
      case '\r': result += '\\r'; break
      case '\t': result += '\\t'; break
      case '\\': result += '\\\\'; break
      default:
        if (ch === q) {
          result += '\\' + q
        } else if (ch.charCodeAt(0) > 0x7f) {
          result += ch // UTF-8 multibyte passthrough
        } else if (!isASCIIPrintable(ch)) {
          result += '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0')
        } else {
          result += ch
        }
        break
    }
  }
  return result + q
}

/** Format a number the way USD's ostream<<double does (shortest decimal
 *  round-trip; integral doubles print without a fractional part). */
function stringFromDouble(n: number): string {
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  if (Number.isInteger(n)) return `${n}`
  return String(n).replace('e+', 'e')
}

const _BINARY_OP_TEXT: Record<SdfBooleanExpressionBinaryOperator, string> = {
  [SdfBooleanExpressionBinaryOperator.EqualTo]: '==',
  [SdfBooleanExpressionBinaryOperator.NotEqualTo]: '!=',
  [SdfBooleanExpressionBinaryOperator.LessThan]: '<',
  [SdfBooleanExpressionBinaryOperator.LessThanOrEqualTo]: '<=',
  [SdfBooleanExpressionBinaryOperator.GreaterThan]: '>',
  [SdfBooleanExpressionBinaryOperator.GreaterThanOrEqualTo]: '>=',
  [SdfBooleanExpressionBinaryOperator.And]: '&&',
  [SdfBooleanExpressionBinaryOperator.Or]: '||',
}

// Port of _Node::WriteToStream + the _ParensHelper logic.
function _writeNode(node: _Node): string {
  switch (node.kind) {
    case 'var':
      return node.name
    case 'const': {
      const v = node.value
      if (typeof v === 'string') return quote(v)
      if (typeof v === 'boolean') return v ? 'true' : 'false' // boolalpha
      return stringFromDouble(v)
    }
    case 'unary':
      return '!' + _parens(node, node.inner)
    case 'binary':
      return (
        _parens(node, node.lhs) +
        ' ' + _BINARY_OP_TEXT[node.op] + ' ' +
        _parens(node, node.rhs)
      )
  }
}

function _parens(parent: _Node, child: _Node): string {
  const needsParens = _nodePrecedence(parent) < _nodePrecedence(child)
  const text = _writeNode(child)
  return needsParens ? '(' + text + ')' : text
}

function _collectVariableNames(node: _Node, names: Set<string>): void {
  switch (node.kind) {
    case 'var':
      names.add(node.name)
      break
    case 'const':
      break
    case 'unary':
      _collectVariableNames(node.inner, names)
      break
    case 'binary':
      _collectVariableNames(node.lhs, names)
      _collectVariableNames(node.rhs, names)
      break
  }
}

// ---------------------------------------------------------------------------
// Evaluation (port of booleanExpressionEval.cpp)

type _Promoted =
  | { readonly t: 'double'; readonly v: number }
  | { readonly t: 'string'; readonly v: string }
  | { readonly t: 'empty' }

// PromoteToCommonType: bool/int/double -> double bucket (bool/int convert to
// double implicitly), string/token -> string, everything else -> empty.
function _promote(value: SdfBooleanExprValue | undefined): _Promoted {
  if (typeof value === 'boolean') return { t: 'double', v: value ? 1 : 0 }
  if (typeof value === 'number') return { t: 'double', v: value }
  if (typeof value === 'string') return { t: 'string', v: value }
  return { t: 'empty' }
}

function _applyComparisonOp(
  left: SdfBooleanExprValue | undefined,
  right: SdfBooleanExprValue | undefined,
  op: SdfBooleanExpressionBinaryOperator,
): boolean {
  const lhs = _promote(left)
  const rhs = _promote(right)

  // == and != are performed directly on the promoted (VtValue-like) values.
  if (op === SdfBooleanExpressionBinaryOperator.EqualTo) {
    if (lhs.t !== rhs.t) return false
    if (lhs.t === 'empty') return true // empty == empty
    return lhs.v === (rhs as typeof lhs).v
  }
  if (op === SdfBooleanExpressionBinaryOperator.NotEqualTo) {
    if (lhs.t !== rhs.t) return true
    if (lhs.t === 'empty') return false
    return lhs.v !== (rhs as typeof lhs).v
  }

  // The remaining comparison operators require both operands to be doubles;
  // upstream emits a TF_WARN and returns false otherwise.
  if (lhs.t !== 'double' || rhs.t !== 'double') {
    return false
  }
  switch (op) {
    case SdfBooleanExpressionBinaryOperator.GreaterThan: return lhs.v > rhs.v
    case SdfBooleanExpressionBinaryOperator.LessThan: return lhs.v < rhs.v
    case SdfBooleanExpressionBinaryOperator.GreaterThanOrEqualTo: return lhs.v >= rhs.v
    case SdfBooleanExpressionBinaryOperator.LessThanOrEqualTo: return lhs.v <= rhs.v
    default: return false // unreachable
  }
}

// VtValue.Cast<bool>().GetWithDefault<bool>(): nonzero number, nonempty string,
// the bool itself; empty (undefined) -> false.
function _toBool(value: SdfBooleanExprValue | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return false
}

function _evalExpression(
  node: _Node,
  callback: SdfBooleanExprVariableCallback,
): SdfBooleanExprValue | undefined {
  switch (node.kind) {
    case 'const':
      return node.value
    case 'var':
      return callback(node.name)
    case 'unary':
      // Only unary-not for now.
      return !_evalBoolean(node.inner, callback)
    case 'binary': {
      const op = node.op
      const isBoolean =
        op === SdfBooleanExpressionBinaryOperator.And ||
        op === SdfBooleanExpressionBinaryOperator.Or
      if (isBoolean) {
        const left = _evalBoolean(node.lhs, callback)
        if (!left && op === SdfBooleanExpressionBinaryOperator.And) {
          return false // short-circuit for &&
        }
        if (left && op === SdfBooleanExpressionBinaryOperator.Or) {
          return true // short-circuit for ||
        }
        return _evalBoolean(node.rhs, callback)
      }
      const left = _evalExpression(node.lhs, callback)
      const right = _evalExpression(node.rhs, callback)
      return _applyComparisonOp(left, right, op)
    }
  }
}

function _evalBoolean(
  node: _Node,
  callback: SdfBooleanExprVariableCallback,
): boolean {
  return _toBool(_evalExpression(node, callback))
}

// ---------------------------------------------------------------------------
// SdfBooleanExpression

export class SdfBooleanExpression {
  // Convenience aliases so callers can write SdfBooleanExpression.BinaryOperator
  // .EqualTo etc., mirroring the nested C++ enums.
  static readonly BinaryOperator = SdfBooleanExpressionBinaryOperator
  static readonly UnaryOperator = SdfBooleanExpressionUnaryOperator

  private _rootNode: _Node | undefined
  private readonly _text: string
  private readonly _parseError: string

  /** Constructs an empty expression, or parses a string representation.  If a
   *  parse error occurs the result is an empty expression (see getParseError). */
  constructor(text?: string) {
    if (text === undefined) {
      this._rootNode = undefined
      this._text = ''
      this._parseError = ''
      return
    }
    const result = _parse(text)
    this._rootNode = result.node
    // Upstream stores the authored text regardless of parse success.
    this._text = text
    this._parseError = result.error ?? ''
  }

  private static _wrap(node: _Node | undefined): SdfBooleanExpression {
    // Mirrors the private SdfBooleanExpression(_NodeRefPtr) constructor.
    const expr = new SdfBooleanExpression()
    expr._rootNode = node
    return expr
  }

  /** An expression is empty if it was default constructed or failed to parse. */
  isEmpty(): boolean {
    return this._rootNode === undefined
  }

  /** A string representation parseable by the constructor.  If the expression
   *  was constructed from a string, the existing formatting is preserved. */
  getText(): string {
    if (this._text.length > 0) {
      return this._text
    }
    if (this._rootNode === undefined) {
      return ''
    }
    return _writeNode(this._rootNode)
  }

  /** Parsing errors as a string, if this expression failed to parse. */
  getParseError(): string {
    return this._parseError
  }

  /** The collection of variable names referenced by the expression. */
  getVariableNames(): Set<string> {
    const names = new Set<string>()
    if (this._rootNode !== undefined) {
      _collectVariableNames(this._rootNode, names)
    }
    return names
  }

  /** Constructs an expression representing a variable. */
  static makeVariable(variableName: string): SdfBooleanExpression {
    return SdfBooleanExpression._wrap({ kind: 'var', name: variableName })
  }

  /** Constructs an expression wrapping a constant value. */
  static makeConstant(value: SdfBooleanExprValue): SdfBooleanExpression {
    return SdfBooleanExpression._wrap({ kind: 'const', value })
  }

  /** Constructs an expression applying a binary operator to two
   *  subexpressions. */
  static makeBinaryOp(
    lhs: SdfBooleanExpression,
    op: SdfBooleanExpressionBinaryOperator,
    rhs: SdfBooleanExpression,
  ): SdfBooleanExpression {
    if (lhs._rootNode === undefined || rhs._rootNode === undefined) {
      return new SdfBooleanExpression()
    }
    return SdfBooleanExpression._wrap({
      kind: 'binary', op, lhs: lhs._rootNode, rhs: rhs._rootNode,
    })
  }

  /** Constructs an expression applying a unary operator to a subexpression. */
  static makeUnaryOp(
    expression: SdfBooleanExpression,
    op: SdfBooleanExpressionUnaryOperator,
  ): SdfBooleanExpression {
    if (expression._rootNode === undefined) {
      return new SdfBooleanExpression()
    }
    return SdfBooleanExpression._wrap({
      kind: 'unary', op, inner: expression._rootNode,
    })
  }

  /** Evaluates the expression, invoking `variableCallback` to determine the
   *  current value of any variables. */
  evaluate(variableCallback: SdfBooleanExprVariableCallback): boolean {
    if (this._rootNode === undefined) {
      return false
    }
    return _evalBoolean(this._rootNode, variableCallback)
  }

  /** Applies `transform` to each variable name and returns the resulting
   *  expression. */
  renameVariables(transform: SdfBooleanExprNameTransform): SdfBooleanExpression {
    if (this._rootNode === undefined) {
      return new SdfBooleanExpression()
    }
    return SdfBooleanExpression._wrap(_renameNode(this._rootNode, transform))
  }

  /** Determines if the provided string can be parsed as an expression. */
  static validate(expression: string): boolean {
    return _parse(expression).node !== undefined
  }

  toString(): string {
    return this.getText()
  }
}

function _renameNode(node: _Node, transform: SdfBooleanExprNameTransform): _Node {
  switch (node.kind) {
    case 'const':
      return node
    case 'var':
      return { kind: 'var', name: transform(node.name) }
    case 'unary':
      return { kind: 'unary', op: node.op, inner: _renameNode(node.inner, transform) }
    case 'binary':
      return {
        kind: 'binary',
        op: node.op,
        lhs: _renameNode(node.lhs, transform),
        rhs: _renameNode(node.rhs, transform),
      }
  }
}

// ---------------------------------------------------------------------------
// Parser (recursive-descent port of booleanExpressionParsing.cpp:
// ExpressionBuilder + the PEGTL grammar)

class _ParseError extends Error {}

// An operator on the builder's reduction stack.
type _StackOp =
  | { readonly unary: SdfBooleanExpressionUnaryOperator }
  | { readonly binary: SdfBooleanExpressionBinaryOperator }

function _opPrecedence(op: _StackOp): number {
  if ('unary' in op) return 0 // only one unary op
  switch (op.binary) {
    case SdfBooleanExpressionBinaryOperator.LessThan:
    case SdfBooleanExpressionBinaryOperator.LessThanOrEqualTo:
    case SdfBooleanExpressionBinaryOperator.GreaterThan:
    case SdfBooleanExpressionBinaryOperator.GreaterThanOrEqualTo:
      return 1
    case SdfBooleanExpressionBinaryOperator.EqualTo:
    case SdfBooleanExpressionBinaryOperator.NotEqualTo:
      return 2
    case SdfBooleanExpressionBinaryOperator.And:
      return 3
    case SdfBooleanExpressionBinaryOperator.Or:
      return 4
    default:
      return 0
  }
}

// Port of ExpressionBuilder::_Stack (operator-precedence reduction).
class _OpStack {
  private exprs: _Node[] = []
  private ops: _StackOp[] = []

  pushExpr(node: _Node): void {
    this.exprs.push(node)
  }

  pushOperator(op: _StackOp): void {
    const top = (): _StackOp | undefined => this.ops[this.ops.length - 1]
    let t = top()
    while (t !== undefined && _opPrecedence(t) < _opPrecedence(op)) {
      this._reduce()
      t = top()
    }
    this.ops.push(op)
  }

  finish(): _Node {
    while (this.ops.length > 0) {
      this._reduce()
    }
    const result = this.exprs.pop()
    if (result === undefined) {
      throw new _ParseError('empty expression')
    }
    return result
  }

  private _reduce(): void {
    const op = this.ops.pop()
    const rhs = this.exprs.pop()
    if (op === undefined || rhs === undefined) {
      throw new _ParseError('malformed expression')
    }
    if ('unary' in op) {
      this.exprs.push({ kind: 'unary', op: op.unary, inner: rhs })
    } else {
      const lhs = this.exprs.pop()
      if (lhs === undefined) {
        throw new _ParseError('malformed expression')
      }
      this.exprs.push({ kind: 'binary', op: op.binary, lhs, rhs })
    }
  }
}

// Port of ExpressionBuilder (a stack of group-scoped _OpStacks).
class _Builder {
  private stacks: _OpStack[] = [new _OpStack()]

  private top(): _OpStack {
    const t = this.stacks[this.stacks.length - 1]
    if (t === undefined) throw new _ParseError('malformed expression')
    return t
  }

  openGroup(): void {
    this.stacks.push(new _OpStack())
  }

  closeGroup(): void {
    const inner = this.top().finish()
    this.stacks.pop()
    this.top().pushExpr(inner)
  }

  pushBinaryOp(op: SdfBooleanExpressionBinaryOperator): void {
    this.top().pushOperator({ binary: op })
  }

  pushUnaryOp(op: SdfBooleanExpressionUnaryOperator): void {
    this.top().pushOperator({ unary: op })
  }

  pushVariable(name: string): void {
    this.top().pushExpr({ kind: 'var', name })
  }

  pushConstant(value: SdfBooleanExprValue): void {
    this.top().pushExpr({ kind: 'const', value })
  }

  finish(): _Node {
    return this.top().finish()
  }
}

function _isIdentFirst(c: string): boolean {
  return /[A-Za-z_]/.test(c)
}
function _isIdentOther(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}
function _isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

class _Parser {
  private readonly s: string
  private pos = 0
  private readonly builder = new _Builder()

  constructor(text: string) {
    this.s = text
  }

  parse(): _Node {
    // GrammarGoal: must<pad<Expression, Space>, eof>
    this.skipSpaces()
    this.parseExpression()
    this.skipSpaces()
    if (this.pos !== this.s.length) {
      this.fail()
    }
    return this.builder.finish()
  }

  private fail(): never {
    throw new _ParseError(
      `parse error at ${this.pos + 1}: ${JSON.stringify(this.s.slice(this.pos))}`)
  }

  private peek(): string {
    return this.s.charAt(this.pos)
  }

  private skipSpaces(): void {
    while (this.pos < this.s.length && _isSpace(this.s.charAt(this.pos))) {
      this.pos++
    }
  }

  // Expression : list<PrefixedAtom, pad<InfixOperator, Space>>
  private parseExpression(): void {
    this.parsePrefixedAtom()
    for (;;) {
      const save = this.pos
      this.skipSpaces()
      const op = this.tryInfixOperator()
      if (op === null) {
        this.pos = save
        break
      }
      // The operator action fires before the right operand is parsed.
      this.builder.pushBinaryOp(op)
      this.skipSpaces()
      this.parsePrefixedAtom() // must succeed
    }
  }

  // PrefixedAtom : if_then_else<PrefixOperator, PrefixedAtom, Atom>
  private parsePrefixedAtom(): void {
    if (this.peek() === '!') {
      this.pos++ // consume '!'
      this.builder.pushUnaryOp(SdfBooleanExpressionUnaryOperator.Not)
      this.parsePrefixedAtom()
      return
    }
    this.parseAtom()
  }

  // Atom : sor<Constant, Variable, ParenExpression>
  private parseAtom(): void {
    if (this.tryConstant()) return
    if (this.tryVariable()) return
    if (this.peek() === '(') {
      this.pos++ // LeftParen
      this.builder.openGroup()
      this.skipSpaces()
      this.parseExpression()
      this.skipSpaces()
      if (this.peek() !== ')') this.fail()
      this.pos++ // RightParen
      this.builder.closeGroup()
      return
    }
    this.fail()
  }

  // Constant : sor<Number, String, BooleanLiteral>
  private tryConstant(): boolean {
    if (this.tryNumber()) return true
    if (this.tryString()) return true
    if (this.tryBoolean()) return true
    return false
  }

  private tryNumber(): boolean {
    const m = /^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?/.exec(this.s.slice(this.pos))
    if (m === null) return false
    const raw = m[0]
    this.pos += raw.length
    this.builder.pushConstant(parseFloat(raw))
    return true
  }

  private tryString(): boolean {
    const c = this.peek()
    if (c !== '"' && c !== "'") return false
    const quoteCh = c
    const start = this.pos
    this.pos++ // opening quote
    while (this.pos < this.s.length) {
      const ch = this.s.charAt(this.pos)
      if (ch === quoteCh) {
        const inner = this.s.slice(start + 1, this.pos)
        this.pos++ // closing quote
        this.builder.pushConstant(evalEscapes(inner))
        return true
      }
      if (ch === '\\') {
        this.pos += 2 // skip the escaped character
        continue
      }
      if (ch === '\n' || ch === '\r') {
        // Single-line strings only.
        this.fail()
      }
      this.pos++
    }
    // Unterminated string.
    this.fail()
  }

  // BooleanLiteral : sor<keyword<"true">, keyword<"false">>
  private tryBoolean(): boolean {
    for (const [kw, value] of [['true', true], ['false', false]] as const) {
      if (this.s.startsWith(kw, this.pos)) {
        const after = this.s.charAt(this.pos + kw.length)
        if (after === '' || !_isIdentOther(after)) {
          this.pos += kw.length
          this.builder.pushConstant(value)
          return true
        }
      }
    }
    return false
  }

  // Variable : NamespacedIdentifier
  private tryVariable(): boolean {
    const c = this.peek()
    if (!_isIdentFirst(c)) return false
    let name = c
    this.pos++
    while (this.pos < this.s.length) {
      const ch = this.s.charAt(this.pos)
      if (_isIdentOther(ch)) {
        name += ch
        this.pos++
      } else if (ch === ':' && _isIdentFirst(this.s.charAt(this.pos + 1))) {
        // Namespace separator, followed by another identifier segment.
        name += ch
        this.pos++
      } else {
        break
      }
    }
    this.builder.pushVariable(name)
    return true
  }

  // InfixOperator : sor<==, !=, <=, <, >=, >, &&, ||>
  private tryInfixOperator(): SdfBooleanExpressionBinaryOperator | null {
    const two = this.s.slice(this.pos, this.pos + 2)
    switch (two) {
      case '==': this.pos += 2; return SdfBooleanExpressionBinaryOperator.EqualTo
      case '!=': this.pos += 2; return SdfBooleanExpressionBinaryOperator.NotEqualTo
      case '<=': this.pos += 2; return SdfBooleanExpressionBinaryOperator.LessThanOrEqualTo
      case '>=': this.pos += 2; return SdfBooleanExpressionBinaryOperator.GreaterThanOrEqualTo
      case '&&': this.pos += 2; return SdfBooleanExpressionBinaryOperator.And
      case '||': this.pos += 2; return SdfBooleanExpressionBinaryOperator.Or
      default: break
    }
    const one = this.peek()
    if (one === '<') { this.pos++; return SdfBooleanExpressionBinaryOperator.LessThan }
    if (one === '>') { this.pos++; return SdfBooleanExpressionBinaryOperator.GreaterThan }
    return null
  }
}

function _parse(text: string): { node?: _Node; error?: string } {
  try {
    return { node: new _Parser(text).parse() }
  } catch (e) {
    if (e instanceof _ParseError) {
      return { error: e.message }
    }
    throw e
  }
}
