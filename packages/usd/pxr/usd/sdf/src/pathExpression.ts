// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pathExpression.cpp,
//  pxr/usd/sdf/pathExpression.h, pxr/usd/sdf/pathExpressionEval.cpp,
//  pxr/usd/sdf/pathExpressionEval.h, pxr/usd/sdf/pathPattern.cpp,
//  pxr/usd/sdf/pathPattern.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/pathExpression.{h,cpp}, pathPattern.{h,cpp} and
// pathExpressionEval.{h,cpp} (OpenUSD v26.05).
//
// SdfPathExpression is a set-algebra of SdfPathPattern atoms (joined by `+`
// union, `&` intersection, `-` difference, `~` complement and implied union).
//
// A path pattern is a sequence of components separated by `/` (direct child) or
// `//` (a "stretch": arbitrary levels of hierarchy). Each component may carry a
// glob (`*`, `?`) and/or a brace-enclosed predicate sub-expression `{...}` (see
// SdfPredicateExpression). The matcher reproduces the OBSERVABLE results of
// upstream's Sdf_PathExpressionEvalBase::_PatternImplBase::_Match, including the
// SdfPredicateFunctionResult constancy that drives HdCollectionExpressionEvaluator
// ::PopulateMatches (success => constant iff the pattern ends in a stretch `//`).
//
import { SdfPath } from './path.ts'
import { Sdf_GlobPattern } from './globPattern.ts'
import { _markReachable } from 'typescript-usd/trace/_internal'
import { SdfPredicateExpression, SdfPredicateOp } from './predicateExpression.ts'

// ---------------------------------------------------------------------------
// SdfPredicateFunctionResult (port of the class in sdf/predicateLibrary.h)
//
// A pair of a boolean value and a Constancy token indicating whether the value
// is constant over the queried object's descendants, or might vary.

export class SdfPredicateFunctionResult {
  constructor(
    readonly value: boolean,
    readonly constant: boolean,
  ) {}

  static makeConstant(value: boolean): SdfPredicateFunctionResult {
    return new SdfPredicateFunctionResult(value, true)
  }

  static makeVarying(value: boolean): SdfPredicateFunctionResult {
    return new SdfPredicateFunctionResult(value, false)
  }

  GetValue(): boolean {
    return this.value
  }

  isConstant(): boolean {
    return this.constant
  }

  not(): SdfPredicateFunctionResult {
    return new SdfPredicateFunctionResult(!this.value, this.constant)
  }

  /** SetAndPropagateConstancy (predicateLibrary.h:174-181), returning the
   *  updated result: take other's value; become varying if other varies. */
  setAndPropagateConstancy(other: SdfPredicateFunctionResult): SdfPredicateFunctionResult {
    return new SdfPredicateFunctionResult(other.value, this.constant && other.constant)
  }

  // Logical-and with constancy propagation (mirrors SdfPredicateFunctionResult::And).
  static and(
    lhs: SdfPredicateFunctionResult,
    rhs: SdfPredicateFunctionResult,
  ): SdfPredicateFunctionResult {
    const lv = lhs.value, rv = rhs.value
    const lc = lhs.constant, rc = rhs.constant
    return (lc && rc) || (!lv && lc) || (!rv && rc)
      ? SdfPredicateFunctionResult.makeConstant(lv && rv)
      : SdfPredicateFunctionResult.makeVarying(lv && rv)
  }

  // Logical-or with constancy propagation (mirrors SdfPredicateFunctionResult::Or).
  static or(
    lhs: SdfPredicateFunctionResult,
    rhs: SdfPredicateFunctionResult,
  ): SdfPredicateFunctionResult {
    const lv = lhs.value, rv = rhs.value
    const lc = lhs.constant, rc = rhs.constant
    return (lc && rc) || (lv && lc) || (rv && rc)
      ? SdfPredicateFunctionResult.makeConstant(lv || rv)
      : SdfPredicateFunctionResult.makeVarying(lv || rv)
  }
}

// ---------------------------------------------------------------------------
// Predicate sub-expression AST (the `{...}` content).
//
// Mirrors the SdfPredicateExpression grammar used by path-pattern predicates:
// function calls (`name`, `name:arg`, `name:arg1,arg2`) joined by `and`/`or` and
// optionally prefixed with `not`. Arguments are typed (string/int/double/bool)
// the same way upstream's PredArgVal grammar types them.

export type SdfPathExprArgValue =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'int'; readonly value: number }
  | { readonly type: 'double'; readonly value: number }
  | { readonly type: 'bool'; readonly value: boolean }

export interface SdfPathExprFnArg {
  readonly argName: string
  readonly value: SdfPathExprArgValue
}

export interface SdfPathExprFnCall {
  readonly funcName: string
  readonly args: SdfPathExprFnArg[]
}

type PredNode =
  | { readonly op: 'call'; readonly call: SdfPathExprFnCall }
  | { readonly op: 'not'; readonly operand: PredNode }
  | { readonly op: 'and' | 'or'; readonly left: PredNode; readonly right: PredNode }

// Invoked once per leaf predicate call, against the prim domain object.
export type SdfPathExprCallInvoker = (
  call: SdfPathExprFnCall,
) => SdfPredicateFunctionResult

function evalPredNode(
  node: PredNode,
  invoke: SdfPathExprCallInvoker,
): SdfPredicateFunctionResult {
  switch (node.op) {
    case 'call':
      return invoke(node.call)
    case 'not':
      return evalPredNode(node.operand, invoke).not()
    case 'and':
      return SdfPredicateFunctionResult.and(
        evalPredNode(node.left, invoke),
        evalPredNode(node.right, invoke),
      )
    case 'or':
      return SdfPredicateFunctionResult.or(
        evalPredNode(node.left, invoke),
        evalPredNode(node.right, invoke),
      )
  }
}

// ---------------------------------------------------------------------------
// Predicate sub-expression parser (recursive descent over the `{...}` content).

const PRED_RESERVED = new Set(['and', 'or', 'not', 'true', 'false'])

function isIdentFirst(c: string): boolean {
  return /[A-Za-z_]/.test(c)
}
function isIdentOther(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}
// Characters allowed in an unquoted predicate argument (mirrors upstream's
// UnquotedStringChar, minus ':' and ',' which terminate arguments).
function isUnquotedArgChar(c: string): boolean {
  return isIdentOther(c) || '~!@#$%^&*-+=|\\.?/'.includes(c)
}

class PredParser {
  private pos = 0
  constructor(private readonly s: string) {}

  parse(): PredNode | null {
    this.skipBlanks()
    if (this.pos >= this.s.length) return null
    const node = this.parseOr()
    this.skipBlanks()
    if (node === null || this.pos !== this.s.length) return null
    return node
  }

  private skipBlanks(): void {
    while (this.pos < this.s.length && (this.s[this.pos] === ' ' || this.s[this.pos] === '\t')) {
      this.pos++
    }
  }

  private matchKeyword(kw: string): boolean {
    if (this.s.startsWith(kw, this.pos)) {
      const after = this.s[this.pos + kw.length] ?? ''
      if (after === '' || !isIdentOther(after)) {
        this.pos += kw.length
        return true
      }
    }
    return false
  }

  // or := and ('or' and)*
  private parseOr(): PredNode | null {
    let left = this.parseAnd()
    if (left === null) return null
    for (;;) {
      const save = this.pos
      this.skipBlanks()
      if (!this.matchKeyword('or')) { this.pos = save; break }
      this.skipBlanks()
      const right = this.parseAnd()
      if (right === null) { this.pos = save; break }
      left = { op: 'or', left, right }
    }
    return left
  }

  // and := factor ('and' factor)*  (also an implied-and on whitespace)
  private parseAnd(): PredNode | null {
    let left = this.parseFactor()
    if (left === null) return null
    for (;;) {
      const save = this.pos
      this.skipBlanks()
      if (this.matchKeyword('and')) {
        this.skipBlanks()
        const right = this.parseFactor()
        if (right === null) { this.pos = save; break }
        left = { op: 'and', left, right }
        continue
      }
      // Implied-and: another factor follows after whitespace.
      if (this.pos > save) {
        const right = this.parseFactor()
        if (right !== null) {
          left = { op: 'and', left, right }
          continue
        }
      }
      this.pos = save
      break
    }
    return left
  }

  // factor := 'not'* call
  private parseFactor(): PredNode | null {
    let nots = 0
    for (;;) {
      const save = this.pos
      this.skipBlanks()
      if (!this.matchKeyword('not')) { this.pos = save; break }
      nots++
    }
    const call = this.parseCall()
    if (call === null) return null
    let node: PredNode = call
    for (let i = 0; i < nots; i++) node = { op: 'not', operand: node }
    return node
  }

  // call := funcName (':' arg (',' arg)*)?
  private parseCall(): PredNode | null {
    this.skipBlanks()
    const name = this.parseFuncName()
    if (name === null) return null
    const args: SdfPathExprFnArg[] = []
    if (this.s[this.pos] === ':') {
      this.pos++ // consume ':'
      args.push({ argName: '', value: this.parseArgVal() })
      while (this.s[this.pos] === ',') {
        this.pos++
        args.push({ argName: '', value: this.parseArgVal() })
      }
    }
    return { op: 'call', call: { funcName: name, args } }
  }

  private parseFuncName(): string | null {
    const start = this.pos
    if (this.pos >= this.s.length || !isIdentFirst(this.s[this.pos]!)) return null
    let name = this.s[this.pos]!
    this.pos++
    while (this.pos < this.s.length && isIdentOther(this.s[this.pos]!)) {
      name += this.s[this.pos]!
      this.pos++
    }
    if (PRED_RESERVED.has(name)) { this.pos = start; return null }
    return name
  }

  // arg := quotedString | unquotedToken  (typed bool/int/double/string).
  private parseArgVal(): SdfPathExprArgValue {
    const c = this.s[this.pos] ?? ''
    if (c === '"' || c === "'") {
      return { type: 'string', value: this.parseQuoted(c) }
    }
    const start = this.pos
    while (this.pos < this.s.length && isUnquotedArgChar(this.s[this.pos]!)) this.pos++
    const raw = this.s.slice(start, this.pos)
    if (raw === 'true') return { type: 'bool', value: true }
    if (raw === 'false') return { type: 'bool', value: false }
    if (/^-?[0-9]+$/.test(raw)) return { type: 'int', value: parseInt(raw, 10) }
    if (/^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(raw) && /[.eE]/.test(raw)) {
      return { type: 'double', value: parseFloat(raw) }
    }
    return { type: 'string', value: raw }
  }

  private parseQuoted(q: string): string {
    this.pos++ // opening quote
    let out = ''
    while (this.pos < this.s.length) {
      const ch = this.s[this.pos]!
      if (ch === q) { this.pos++; return out }
      if (ch === '\\') {
        const n = this.s[this.pos + 1] ?? ''
        out += n
        this.pos += 2
        continue
      }
      out += ch
      this.pos++
    }
    return out // unterminated; return what we have
  }
}

// The predicate sub-expression of a pattern component is an
// SdfPredicateExpression (pathPattern.cpp / pathExpressionParser.h parse it
// with the predicate expression grammar, predicateExpressionParser.h), which
// includes paren calls with keyword arguments like `isa(Mesh, strict=true)`.
// It is parsed with that grammar first; the simpler PredParser above is the
// fallback for text that grammar rejects.
function parsePredProgram(text: string): PredNode | null {
  const expr = new SdfPredicateExpression(text)
  if (expr.isEmpty() || expr.getParseError()) {
    return new PredParser(text).parse()
  }
  // Rebuild the tree from SdfPredicateExpression::WalkWithOpStack.
  interface Frame { op: SdfPredicateOp; children: PredNode[] }
  const frames: Frame[] = []
  let root: PredNode | null = null
  const add = (node: PredNode): void => {
    if (frames.length === 0) root = node
    else frames[frames.length - 1]!.children.push(node)
  }
  expr.walkWithOpStack((stack) => {
    const [op, argIndex] = stack[stack.length - 1]!
    if (argIndex === 0) {
      frames.push({ op, children: [] })
      return
    }
    const complete = op === SdfPredicateOp.Not ? argIndex === 1 : argIndex === 2
    if (!complete) return
    const frame = frames.pop()!
    if (frame.op === SdfPredicateOp.Not) {
      add({ op: 'not', operand: frame.children[0]! })
    } else {
      add({
        op: frame.op === SdfPredicateOp.Or ? 'or' : 'and',
        left: frame.children[0]!, right: frame.children[1]!,
      })
    }
  }, (call) => {
    add({ op: 'call', call: { funcName: call.funcName, args: call.args } })
  })
  return root
}

/** SdfPredicateExpression::Walk (predicateExpression.h) over a parsed
 *  predicate program: `logic(op, argIndex)` is called before (0), between
 *  (1) and after (2) the operands of each logical operation ('not' gets 0
 *  and 1), `call` for each function call. */
function walkPredNode(
  node: PredNode,
  logic: (op: 'not' | 'and' | 'or', argIndex: number) => void,
  call: (call: SdfPathExprFnCall) => void,
): void {
  switch (node.op) {
    case 'call':
      call(node.call)
      return
    case 'not':
      logic('not', 0)
      walkPredNode(node.operand, logic, call)
      logic('not', 1)
      return
    default:
      logic(node.op, 0)
      walkPredNode(node.left, logic, call)
      logic(node.op, 1)
      walkPredNode(node.right, logic, call)
      logic(node.op, 2)
  }
}

// ---------------------------------------------------------------------------
// Pattern components.

interface _Component {
  // A "stretch" element (`//`) matches arbitrary levels of hierarchy.
  stretch: boolean
  // Match text for a non-stretch component; "" means "match any name".
  text: string
  // Compiled glob, if `text` contains wildcards (pathExpressionEval.cpp:241-251).
  glob: Sdf_GlobPattern | undefined
  // Index into _predPrograms, or -1.
  predicateIndex: number
}

// BracketClass (pathPatternParser.h:43-46): '[' commits to one or more
// identifier characters or '!', '-', '?', '*' and a closing ']' (:138).
// Returns the parse error for the first malformed class, or ''.
function bracketClassError(text: string): string {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '[') continue
    let j = i + 1
    while (j < text.length && /[A-Za-z0-9_!\-?*]/.test(text[j]!)) j++
    // Upstream names no expectation for an empty class.
    if (j === i + 1) return 'Invalid path expression'
    if (text[j] !== ']') return "expected ']' to close bracket class"
    i = j
  }
  return ''
}

// ---------------------------------------------------------------------------
// SdfPathPattern (pathPattern.h/pathPattern.cpp).

export class SdfPathPattern {
  private _text: string

  constructor(path?: SdfPath | string) {
    this._text = path instanceof SdfPath ? path.pathString : path ?? ''
  }

  static everything(): SdfPathPattern { return new SdfPathPattern('//') }
  static everyDescendant(): SdfPathPattern { return new SdfPathPattern('.//') }

  isEmpty(): boolean { return this._text === '' }
  getText(): string { return this._text }
  toString(): string { return this._text }
  hasTrailingStretch(): boolean { return this._text.endsWith('//') }
  hasLeadingStretch(): boolean { return this._text.startsWith('//') }
  isProperty(): boolean {
    const lastSlash = this._text.lastIndexOf('/')
    return this._text.slice(lastSlash + 1).includes('.')
  }

  getPrefix(): SdfPath {
    if (!this._text) return SdfPath.emptyPath
    if (this._text.startsWith('//')) return SdfPath.absoluteRootPath
    if (this._text.startsWith('.//')) return SdfPath.reflexiveRelativePath
    // A literal property name is part of the prefix (pathPattern.cpp:239-270);
    // the prefix ends at the first wildcard or stretch component.
    const special = this._text.search(/[/]{2}|[*?{[]/)
    let prefix = special < 0 ? this._text : this._text.slice(0, special)
    if (this.isProperty() && special >= 0) {
      const dot = prefix.lastIndexOf('.')
      if (dot > prefix.lastIndexOf('/')) prefix = prefix.slice(0, dot)
    }
    prefix = prefix.replace(/\/$/, '')
    return SdfPath.fromString(prefix || (this._text.startsWith('/') ? '/' : '.'))
  }

  setPrefix(prefix: SdfPath): SdfPathPattern {
    const oldPrefix = this.getPrefix().pathString
    const suffix = this._text.slice(oldPrefix === '.' ? 1 : oldPrefix.length)
    this._text = prefix.isAbsoluteRootPath() && suffix.startsWith('//')
      ? suffix : `${prefix.pathString}${suffix}`
    return this
  }

  canAppendChild(_name: string): boolean { return !this.isProperty() }
  appendChild(name: string): SdfPathPattern {
    if (!this.canAppendChild(name)) return this
    if (!name) return this.appendStretchIfPossible()
    if (!this._text) this._text = name
    else if (this._text.endsWith('//') || this._text.endsWith('/')) this._text += name
    else if (this._text === '.') this._text = name
    else this._text += `/${name}`
    return this
  }

  canAppendProperty(_name: string): boolean { return !this.isProperty() }
  appendProperty(name: string): SdfPathPattern {
    if (!this.canAppendProperty(name) || !name) return this
    if (this.hasTrailingStretch()) this._text += '*'
    this._text += `.${name}`
    return this
  }

  appendStretchIfPossible(): SdfPathPattern {
    if (this.isProperty() || this.hasTrailingStretch()) return this
    if (!this._text) this._text = './/'
    else if (this._text === '/') this._text = '//'
    else this._text += '//'
    return this
  }

  removeTrailingStretch(): SdfPathPattern {
    if (this.hasTrailingStretch()) {
      this._text = this._text.slice(0, -2)
      if (this._text === '.') this._text = ''
      if (this._text === '') this._text = '/'
    }
    return this
  }

  removeTrailingComponent(): SdfPathPattern {
    if (this.isProperty()) {
      this._text = this._text.slice(0, this._text.lastIndexOf('.'))
    } else if (this._text.endsWith('//*')) {
      this._text = this._text.slice(0, -1)
    } else if (this.hasTrailingStretch()) {
      this._text = this._text.slice(0, -2)
    }
    return this
  }
}

// ---------------------------------------------------------------------------
// SdfPathExpression.

// GetText's printExprRef (pathExpression.cpp:507-510): "%", the path (empty
// for a reference in the same prim), then "_" for the weaker reference or
// ":" and the name, so `%:b` keeps its colon.
function expressionReferenceText(ref: { path: SdfPath; name: string }): string {
  return `%${ref.path.isEmpty() ? '' : ref.path.pathString}${ref.name === '_' ? '_' : `:${ref.name}`}`
}

export class SdfPathExpression {
  private _components: _Component[] = []
  private _predPrograms: PredNode[] = []
  private _empty = true
  private _text = ''
  private _logic: 'union' | 'intersection' | 'difference' | 'complement' | undefined
  private _impliedUnion = false
  private _left: SdfPathExpression | undefined
  private _right: SdfPathExpression | undefined
  private _reference: { path: SdfPath; name: string } | undefined
  private _parseError = ''

  constructor(text?: string) {
    _markReachable('sdf-pathExpression')
    if (text === undefined || text === '') return
    this._text = text.trim()
    this._parse(this._text)
  }

  static everything(): SdfPathExpression { return new SdfPathExpression('//') }
  static everyDescendant(): SdfPathExpression { return new SdfPathExpression('.//') }
  static Nothing(): SdfPathExpression { return new SdfPathExpression() }
  static weakerRef(): SdfPathExpression { return new SdfPathExpression('%_') }
  static makeAtom(atom: SdfPathPattern | SdfPath | { path: SdfPath; name: string }): SdfPathExpression {
    if (atom instanceof SdfPathPattern) return new SdfPathExpression(atom.getText())
    if (atom instanceof SdfPath) return new SdfPathExpression(atom.pathString)
    return new SdfPathExpression(expressionReferenceText(atom))
  }
  static makeComplement(right: SdfPathExpression): SdfPathExpression {
    // pxr/usd/sdf/pathExpression.cpp:121-140: the two set identities are
    // canonicalized before complement nodes are built, then a double
    // complement cancels.
    if (right.isEmpty()) return SdfPathExpression.everything()
    if (right._isEverything()) return SdfPathExpression.Nothing()
    if (right._logic === 'complement') {
      return new SdfPathExpression(right._right?.getText())
    }
    return new SdfPathExpression(`~(${right.getText()})`)
  }
  static makeOp(
    op: 'impliedUnion' | 'union' | 'intersection' | 'difference',
    left: SdfPathExpression,
    right: SdfPathExpression,
  ): SdfPathExpression {
    // pxr/usd/sdf/pathExpression.cpp:151-180. Difference is normalized only
    // when an identity operand is present; the remaining cases then share the
    // Nothing/Everything simplification matrix with the commutative ops.
    if (op === 'difference' &&
        (left.isEmpty() || right.isEmpty() ||
         left._isEverything() || right._isEverything())) {
      return SdfPathExpression.makeOp(
        'intersection', left, SdfPathExpression.makeComplement(right))
    }
    if (left.isEmpty()) {
      return op === 'intersection' ? SdfPathExpression.Nothing() : right
    }
    if (right.isEmpty()) {
      return op === 'intersection' ? SdfPathExpression.Nothing() : left
    }
    if (left._isEverything()) {
      return op === 'intersection' ? right : SdfPathExpression.everything()
    }
    if (right._isEverything()) {
      return op === 'intersection' ? left : SdfPathExpression.everything()
    }
    const symbol = op === 'intersection' ? '&' : op === 'difference' ? '-' :
      op === 'union' ? '+' : ''
    return new SdfPathExpression(
      symbol ? `(${left.getText()}) ${symbol} (${right.getText()})`
        : `(${left.getText()}) (${right.getText()})`)
  }

  /** True for the default-constructed (or unparseable) expression. */
  isEmpty(): boolean {
    return this._empty
  }

  private _isEverything(): boolean {
    return this._text === '//' && this._logic === undefined &&
      this._reference === undefined && !this._empty
  }

  // GetText (pathExpression.cpp:456-518): operators are parenthesized only
  // where precedence requires (a stronger parent op, or the same op as the
  // right-hand operand).
  getText(): string {
    if (this._empty) return this._text
    if (!this._logic) return _canonicalPredicateText(this._text)
    return this._formatText(undefined, 0)
  }
  get text(): string { return this.getText() }

  private _formatText(parentRank: number | undefined, parentIndex: number): string {
    if (!this._logic) return _canonicalPredicateText(this._text)
    const ranks = { complement: 0, impliedUnion: 1, union: 2, intersection: 3, difference: 4 } as const
    const op = this._logic === 'complement' ? 'complement' : this._impliedUnion ? 'impliedUnion' : this._logic
    const rank = ranks[op]
    const parenthesize = parentRank !== undefined &&
      (parentRank < rank || (parentRank === rank && parentIndex === 2))
    let text: string
    if (op === 'complement') {
      text = `~${this._right!._formatText(rank, 1)}`
    } else {
      const opName = op === 'impliedUnion' ? ' ' : op === 'union' ? ' + ' :
        op === 'intersection' ? ' & ' : ' - '
      text = `${this._left!._formatText(rank, 1)}${opName}${this._right!._formatText(rank, 2)}`
    }
    return parenthesize ? `(${text})` : text
  }
  toString(): string { return this.getText() }
  getParseError(): string {
    if (!this._empty || !this._text) return ''
    return this._parseError || this._left?._parseError || this._right?._parseError ||
      'Invalid path expression'
  }
  isAbsolute(): boolean {
    // IsAbsolute (pathExpression.cpp:362-375): true when no contained prefix
    // is relative, so the empty expression is absolute.
    if (this._empty) return true
    if (this._reference) return true
    if (this._logic === 'complement') return this._right?.isAbsolute() ?? true
    if (this._logic) return (this._left?.isAbsolute() ?? true) &&
      (this._right?.isAbsolute() ?? true)
    return this._text.startsWith('/')
  }
  containsExpressionReferences(): boolean {
    return this._reference !== undefined ||
      (this._left?.containsExpressionReferences() ?? false) ||
      (this._right?.containsExpressionReferences() ?? false)
  }
  containsWeakerExpressionReference(): boolean {
    return this._reference?.name === '_' ||
      (this._left?.containsWeakerExpressionReference() ?? false) ||
      (this._right?.containsWeakerExpressionReference() ?? false)
  }
  isComplete(): boolean {
    return !this.containsExpressionReferences() && this.isAbsolute()
  }

  makeAbsolute(anchor: SdfPath): SdfPathExpression {
    // MakeAbsolute (pathExpression.cpp:378-388) rewrites only the contained
    // reference paths and pattern prefixes; the empty expression has none.
    if (this._empty) return new SdfPathExpression()
    return this.mapAtoms(atom => {
      if (atom.startsWith('/') || atom.startsWith('%')) return atom
      if (atom.startsWith('.//')) return `${anchor.pathString}${atom.slice(1)}`
      if (atom === '.') return anchor.pathString
      return makePatternAbsolute(atom, anchor)
    })
  }

  // ReplacePrefix (pathExpression.cpp:287-358): replaces the prefix of each
  // expression reference path and path pattern prefix; one that becomes
  // empty is replaced by Nothing.
  replacePrefix(oldPrefix: SdfPath, newPrefix: SdfPath): SdfPathExpression {
    if (this.isEmpty()) return SdfPathExpression.Nothing()
    if (this._reference) {
      const ref = this._reference
      if (!ref.path.hasPrefix(oldPrefix)) return new SdfPathExpression(this._text)
      const newRefPath = ref.path.replacePrefix(oldPrefix, newPrefix)
      if (newRefPath.isEmpty() && !ref.path.isEmpty()) return SdfPathExpression.Nothing()
      return SdfPathExpression.makeAtom({ path: newRefPath, name: ref.name })
    }
    if (this._logic === 'complement') {
      return SdfPathExpression.makeComplement(this._right!.replacePrefix(oldPrefix, newPrefix))
    }
    if (this._logic) {
      return SdfPathExpression.makeOp(this._impliedUnion ? 'impliedUnion' : this._logic,
        this._left!.replacePrefix(oldPrefix, newPrefix), this._right!.replacePrefix(oldPrefix, newPrefix))
    }
    const pattern = new SdfPathPattern(this._text)
    if (!pattern.getPrefix().hasPrefix(oldPrefix)) return new SdfPathExpression(this._text)
    const newPatternPrefix = pattern.getPrefix().replacePrefix(oldPrefix, newPrefix)
    if (newPatternPrefix.isEmpty() && !pattern.getPrefix().isEmpty()) return SdfPathExpression.Nothing()
    return new SdfPathExpression(pattern.setPrefix(newPatternPrefix).getText())
  }

  // Walk (pathExpression.h): calls logic(op, argIndex) around each operator's
  // arguments, and mapRef / mapPattern for each atom.
  walk(
    logic: (op: 'complement' | 'impliedUnion' | 'union' | 'intersection' | 'difference', argIndex: number) => void,
    mapRef: (ref: { path: SdfPath; name: string }) => void,
    mapPattern: (pattern: SdfPathPattern) => void,
  ): void {
    if (this.isEmpty()) return
    if (this._reference) { mapRef(this._reference); return }
    if (this._logic === 'complement') {
      logic('complement', 0)
      this._right!.walk(logic, mapRef, mapPattern)
      logic('complement', 1)
      return
    }
    if (this._logic) {
      const op = this._impliedUnion ? 'impliedUnion' : this._logic
      logic(op, 0)
      this._left!.walk(logic, mapRef, mapPattern)
      logic(op, 1)
      this._right!.walk(logic, mapRef, mapPattern)
      logic(op, 2)
      return
    }
    mapPattern(new SdfPathPattern(this._text))
  }

  // ResolveReferences (pathExpression.cpp:399-442): rebuilds the expression
  // with MakeComplement / MakeOp over a stack while walking it, so each
  // resolved reference stays one operand (its grouping is kept).
  resolveReferences(
    resolve: (reference: { path: SdfPath; name: string }) => SdfPathExpression,
  ): SdfPathExpression {
    if (this.isEmpty()) return new SdfPathExpression()
    const stack: SdfPathExpression[] = []
    this.walk((op, argIndex) => {
      if (op === 'complement') {
        if (argIndex === 1) stack[stack.length - 1] = SdfPathExpression.makeComplement(stack.at(-1)!)
      } else if (argIndex === 2) {
        const arg2 = stack.pop()!
        stack[stack.length - 1] = SdfPathExpression.makeOp(op, stack.at(-1)!, arg2)
      }
    }, ref => { stack.push(resolve(ref)) },
    pattern => { stack.push(SdfPathExpression.makeAtom(pattern)) })
    return stack[0]!
  }

  // ComposeOver (pathExpression.cpp:444-454).
  composeOver(weaker: SdfPathExpression): SdfPathExpression {
    if (this.isEmpty()) return new SdfPathExpression()
    return this.resolveReferences(reference =>
      reference.name === '_' ? weaker : SdfPathExpression.makeAtom(reference))
  }

  private mapAtoms(transform: (atom: string) => string): SdfPathExpression {
    if (this._reference) return new SdfPathExpression(this._text)
    if (this._logic === 'complement') {
      return new SdfPathExpression(`~(${this._right!.mapAtoms(transform).getText()})`)
    }
    if (this._logic) {
      const symbol = this._logic === 'union' ? '+' :
        this._logic === 'intersection' ? '&' : '-'
      const separator = this._impliedUnion ? ' ' : ` ${symbol} `
      return new SdfPathExpression(
        `${this._left!.mapAtoms(transform).getText()}${separator}` +
        `${this._right!.mapAtoms(transform).getText()}`)
    }
    return new SdfPathExpression(transform(this._text))
  }

  private _addPredicate(braceContent: string): number {
    const program = parsePredProgram(braceContent)
    if (program === null) return -1
    this._predPrograms.push(program)
    return this._predPrograms.length - 1
  }

  // Parse a `/`-and-`//`-separated component sequence with optional `{pred}`.
  private _parse(text: string): void {
    const unwrapped = stripOuterParens(text)
    if (unwrapped !== text) {
      this._text = unwrapped
      this._parse(unwrapped)
      return
    }
    const binary = splitPathExpression(text)
    if (binary) {
      this._logic = binary.op
      this._impliedUnion = binary.implied
      this._left = new SdfPathExpression(binary.left)
      this._right = new SdfPathExpression(binary.right)
      const rightOffset = this._left._predPrograms.length
      this._right._offsetPredicateIndices(rightOffset)
      this._predPrograms = [
        ...this._left._predPrograms,
        ...this._right._predPrograms,
      ]
      this._empty = this._left.isEmpty() || this._right.isEmpty()
      return
    }
    if (text.startsWith('~')) {
      this._logic = 'complement'
      this._right = new SdfPathExpression(text.slice(1).trim())
      this._predPrograms = [...this._right._predPrograms]
      this._empty = this._right.isEmpty()
      return
    }
    if (text.startsWith('%')) {
      const match = /^%(?:(.*):)?([A-Za-z_][A-Za-z0-9_:]*)$/.exec(text)
      if (!match) return
      this._reference = {
        path: match[1] ? SdfPath.fromString(match[1]) : SdfPath.emptyPath,
        name: match[2]!,
      }
      this._empty = false
      return
    }
    const comps: _Component[] = []
    let i = 0
    const len = text.length

    // A leading '//' becomes a stretch element.
    const readComponent = (): boolean => {
      // Read literal/glob text up to the next '/' or '{'.
      let textStart = i
      while (i < len && text[i] !== '/' && text[i] !== '{') i++
      const compText = text.slice(textStart, i)
      const bracketError = bracketClassError(compText)
      if (bracketError) {
        this._parseError = bracketError
        return false
      }
      let predicateIndex = -1
      if (text[i] === '{') {
        // Find matching '}' honoring quotes.
        const close = findBraceClose(text, i)
        if (close < 0) return false
        predicateIndex = this._addPredicate(text.slice(i + 1, close))
        if (predicateIndex < 0) return false
        i = close + 1
      }
      comps.push({
        stretch: false,
        text: compText,
        glob: /[*?[]/.test(compText) ? Sdf_GlobPattern.compile(compText) : undefined,
        predicateIndex,
      })
      return true
    }

    while (i < len) {
      if (text[i] === '/') {
        if (text[i + 1] === '/') {
          const stretch: _Component = {
            stretch: true, text: '', glob: undefined, predicateIndex: -1,
          }
          comps.push(stretch)
          i += 2
          if (text[i] === '{') {
            const close = findBraceClose(text, i)
            if (close < 0) return
            stretch.predicateIndex = this._addPredicate(text.slice(i + 1, close))
            if (stretch.predicateIndex < 0) return
            i = close + 1
          }
          continue
        }
        i++ // single separator
        if (!readComponent()) return
      } else {
        // A component directly following a stretch, or the very first element.
        if (!readComponent()) return
      }
    }

    if (comps.length === 0) return
    this._components = comps
    this._empty = false
  }

  private _offsetPredicateIndices(offset: number): void {
    if (offset === 0) return
    for (const component of this._components) {
      if (component.predicateIndex !== -1) component.predicateIndex += offset
    }
    this._left?._offsetPredicateIndices(offset)
    this._right?._offsetPredicateIndices(offset)
  }

  // Sdf_PathExpressionEvalBase's _stretchEnd (pathExpressionEval.cpp:217-224).
  // An upstream stretch component never carries a predicate
  // (pathPattern.cpp:170-175): `//{pred}` is a stretch followed by an empty
  // name with the predicate. Here that pair is one stretch component with a
  // predicate index, so it does not end the pattern in a bare stretch.
  private get _stretchEnd(): boolean {
    const last = this._components[this._components.length - 1]
    return last !== undefined && last.stretch && last.predicateIndex === -1
  }

  // Here a stretch carrying a predicate stands for upstream's stretch
  // followed by an empty name with that predicate, so it too can match
  // properties. A property pattern names its property after a '.'.
  private get _matchesPrimsOnly(): boolean {
    const last = this._components[this._components.length - 1]
    return last !== undefined && !last.stretch && last.text !== '' && !last.text.includes('.')
  }

  // Match `path` against this pattern, consulting predicate components through
  // `runNthPredicate(index, prefixPath)`. Mirrors the observable result of
  // Sdf_PathExpressionEvalBase::_PatternImplBase::_Match (value + constancy).
  match(
    path: SdfPath,
    runNthPredicate: (index: number, prefixPath: SdfPath) => SdfPredicateFunctionResult,
  ): SdfPredicateFunctionResult {
    if (this._empty) return SdfPredicateFunctionResult.makeConstant(false)
    if (this._reference) return SdfPredicateFunctionResult.makeVarying(false)
    if (this._logic === 'complement') {
      return this._right!.match(path, runNthPredicate).not()
    }
    if (this._logic) {
      const left = this._left!.match(path, runNthPredicate)
      const right = this._right!.match(path, runNthPredicate)
      if (this._logic === 'intersection') {
        return SdfPredicateFunctionResult.and(left, right)
      }
      if (this._logic === 'difference') {
        return SdfPredicateFunctionResult.and(left, right.not())
      }
      return SdfPredicateFunctionResult.or(left, right)
    }

    // _PatternImplBase::_Init (pathExpressionEval.cpp:268-289): a pattern
    // that is not a property and does not end in a stretch or an empty name
    // can match only prims, so a property path is a constant false
    // (pathExpressionEval.cpp:463-466).
    if (path.isPrimPropertyPath() && this._matchesPrimsOnly) {
      return SdfPredicateFunctionResult.makeConstant(false)
    }

    const names = pathToComponentNames(path)
    const matched = this._matchFrom(0, 0, names, runNthPredicate)
    if (matched) {
      // A successful match that ends in a trailing stretch is constant over
      // descendants (they all match too); otherwise the value may vary.
      return this._stretchEnd
        ? SdfPredicateFunctionResult.makeConstant(true)
        : SdfPredicateFunctionResult.makeVarying(true)
    }
    return this._descendantCanMatch(names)
      ? SdfPredicateFunctionResult.makeVarying(false)
      : SdfPredicateFunctionResult.makeConstant(false)
  }

  // Recursive backtracking matcher. `ci` indexes _components; `pi` indexes the
  // path component names. Returns true if the whole remaining pattern consumes
  // the whole remaining path.
  private _matchFrom(
    ci: number,
    pi: number,
    names: string[],
    runNthPredicate: (index: number, prefixPath: SdfPath) => SdfPredicateFunctionResult,
  ): boolean {
    if (ci === this._components.length) {
      return pi === names.length
    }
    const comp = this._components[ci]!
    if (comp.stretch) {
      // Match zero or more path components.
      for (let k = pi; k <= names.length; k++) {
        if (comp.predicateIndex !== -1) {
          const prefixPath = componentsToPath(names, k)
          if (!runNthPredicate(comp.predicateIndex, prefixPath).value) continue
        }
        if (this._matchFrom(ci + 1, k, names, runNthPredicate)) return true
      }
      return false
    }
    if (pi >= names.length) return false
    const name = names[pi]!
    if (comp.glob) {
      if (!comp.glob.match(name)) return false
    } else if (comp.text !== '' && comp.text !== name) {
      return false
    }
    if (comp.predicateIndex !== -1) {
      const prefixPath = componentsToPath(names, pi + 1)
      if (!runNthPredicate(comp.predicateIndex, prefixPath).value) return false
    }
    return this._matchFrom(ci + 1, pi + 1, names, runNthPredicate)
  }

  private _descendantCanMatch(names: string[]): boolean {
    let pi = 0
    for (const component of this._components) {
      if (component.stretch) return true
      if (pi >= names.length) return true
      if (component.glob || component.predicateIndex !== -1) return true
      if (component.text !== '' && component.text !== names[pi]) return false
      pi++
    }
    return false
  }

  /** The number of predicate programs (the predicateIndex range of the
   *  pattern components). */
  _getNumPredicates(): number {
    return this._predPrograms.length
  }

  /** Walk the predicate program at `index` as SdfPredicateExpression::Walk
   *  does (for SdfLinkPredicateExpression). */
  _walkPredicate(
    index: number,
    logic: (op: 'not' | 'and' | 'or', argIndex: number) => void,
    call: (call: SdfPathExprFnCall) => void,
  ): void {
    const program = this._predPrograms[index]
    if (program !== undefined) walkPredNode(program, logic, call)
  }

  // Evaluate the predicate program at `index` against a domain object, using
  // `invoke` to run each leaf predicate call.
  evalPredicate(
    index: number,
    invoke: SdfPathExprCallInvoker,
  ): SdfPredicateFunctionResult {
    const program = this._predPrograms[index]
    if (program === undefined) return SdfPredicateFunctionResult.makeVarying(false)
    return evalPredNode(program, invoke)
  }
}

/** @internal Composable-value adapter registered by pathExpression.cpp. */
export class _SdfPathExpressionValue {
  private readonly _expression: SdfPathExpression
  constructor(readonly text: string) {
    this._expression = new SdfPathExpression(text)
  }
  composeOver(weaker: _SdfPathExpressionValue): _SdfPathExpressionValue {
    return new _SdfPathExpressionValue(
      this._expression.composeOver(new SdfPathExpression(weaker.text)).getText())
  }
  makeAbsolute(anchor: SdfPath): _SdfPathExpressionValue {
    return new _SdfPathExpressionValue(this._expression.makeAbsolute(anchor).getText())
  }
  /** The value transformed through a whole-expression mapping. */
  map(transform: (expression: SdfPathExpression) => SdfPathExpression): _SdfPathExpressionValue {
    return new _SdfPathExpressionValue(transform(this._expression).getText())
  }
}

function stripOuterParens(text: string): string {
  if (!text.startsWith('(') || !text.endsWith(')')) return text
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    if (depth === 0 && i !== text.length - 1) return text
  }
  return depth === 0 ? text.slice(1, -1).trim() : text
}

function splitPathExpression(text: string): {
  left: string
  right: string
  op: 'union' | 'intersection' | 'difference'
  implied: boolean
} | undefined {
  const scan = (operators: string): {
    index: number
    op: 'union' | 'intersection' | 'difference'
    whitespace: boolean
  } | undefined => {
    let paren = 0, brace = 0, bracket = 0
    let quote = ''
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i]!
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = ''
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; continue }
      if (ch === ')') { paren++; continue }
      if (ch === '(') { paren--; continue }
      if (ch === '}') { brace++; continue }
      if (ch === '{') { brace--; continue }
      // A bracket class's '-' is a range, not the difference operator.
      if (ch === ']') { bracket++; continue }
      if (ch === '[') { if (bracket > 0) bracket--; continue }
      if (paren || brace || bracket) continue
      if (!/\s/.test(ch) && operators.includes(ch)) {
        return {
          index: i,
          op: ch === '&' ? 'intersection' : ch === '-' ? 'difference' : 'union',
          whitespace: false,
        }
      }
      if (operators.includes(' ') && /\s/.test(ch)) {
        let start = i
        while (start > 0 && /\s/.test(text[start - 1]!)) start--
        const lhs = text.slice(0, start).trim()
        const rhs = text.slice(i + 1).trim()
        if (lhs && rhs && !/[+&\-~]$/.test(lhs) && !/^[+&\-]/.test(rhs)) {
          return { index: start, op: 'union', whitespace: true }
        }
        i = start
      }
    }
    return undefined
  }
  const split = scan('+- ') ?? scan('&')
  if (!split) return undefined
  const rightStart = split.whitespace
    ? text.slice(split.index).search(/\S/) + split.index
    : split.index + 1
  const left = text.slice(0, split.index).trim()
  const right = text.slice(rightStart).trim()
  return left && right ? {
    left, right, op: split.op, implied: split.whitespace,
  } : undefined
}

// ---------------------------------------------------------------------------
// Helpers.

// SdfPathPattern::GetText (pathPattern.cpp:301-337) writes each component
// predicate as '{' + SdfPredicateExpression::GetText() + '}', the canonical
// predicate text (e.g. `{isa:"Sphere"}` for `{isa:Sphere}`).
function _canonicalPredicateText(text: string): string {
  if (!text.includes('{')) return text
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c !== '{') { out += c; i++; continue }
    const close = findBraceClose(text, i)
    if (close < 0) return text
    const content = text.slice(i + 1, close)
    const pred = new SdfPredicateExpression(content)
    out += '{' + (pred.isEmpty() || pred.getParseError() ? content : pred.getText()) + '}'
    i = close + 1
  }
  return out
}

function findBraceClose(text: string, openIdx: number): number {
  let i = openIdx + 1
  let quote = ''
  while (i < text.length) {
    const ch = text[i]!
    if (quote) {
      if (ch === '\\') { i += 2; continue }
      if (ch === quote) quote = ''
      i++
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue }
    if (ch === '}') return i
    i++
  }
  return -1
}

function pathToComponentNames(path: SdfPath): string[] {
  if (path.isAbsoluteRootPath() || path.isEmpty()) return []
  return path.pathString.split('/').filter((s) => s.length > 0)
}

function componentsToPath(names: string[], count: number): SdfPath {
  return SdfPath.fromString('/' + names.slice(0, count).join('/'))
}

function makePatternAbsolute(pattern: string, anchor: SdfPath): string {
  const stretch = pattern.indexOf('//')
  const head = stretch < 0 ? pattern : pattern.slice(0, stretch)
  const tail = stretch < 0 ? '' : pattern.slice(stretch)
  const anchorParts = anchor.pathString.split('/').filter(Boolean)
  const relativeParts = head.replace(/^\.\//, '').split('/')
  for (const part of relativeParts) {
    if (!part || part === '.') continue
    if (part === '..') anchorParts.pop()
    else anchorParts.push(part)
  }
  return `/${anchorParts.join('/')}${tail}`
}
