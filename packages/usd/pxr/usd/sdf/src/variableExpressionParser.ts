// Ported from OpenUSD 26.11.1: pxr/usd/sdf/variableExpressionParser.cpp,
//  pxr/usd/sdf/variableExpressionParser.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sdf_ParseVariableExpression — port of OpenUSD v26.11.1
// pxr/usd/sdf/variableExpressionParser.{h,cpp}.
//
// Upstream defines the grammar with PEGTL (pxr/base/pegtl) and builds nodes
// from parser actions. This port keeps that structure rule for rule on a small
// combinator layer that reproduces the PEGTL semantics the grammar depends on
// (the "PEGTL layer" section below), rather than a hand-written recursive
// descent parser, because the observable results depend on PEGTL details:
//   - an action runs as soon as its rule matches, even if an enclosing rule
//     later fails and backtracks (so node creators can be pushed by a branch
//     that is abandoned);
//   - must<> / if_must<> raise the Errors<Rule> message of the first rule that
//     fails, at the input position where it failed, and rules matched under
//     must<> are not rewound (rewind_mode::dontcare), which decides the
//     reported "at character" position;
//   - a rule derived from another rule (ListElement : ScalarExpression,
//     VariableName<C> : identifier) is a distinct rule for actions and errors.
// Rule names, actions and error messages follow variableExpressionParser.cpp
// one for one and are cited by line.

import * as Impl from './variableExpressionImpl.ts'
import * as ASTNodes from './variableExpressionAST.ts'

// ===========================================================================
// PEGTL layer (pxr/base/pegtl/pegtl: match.hpp, internal/{seq,sor,star,opt,
// plus,must,if_must,not_at,list,pad,one,string,identifier}.hpp, ascii.hpp).
// ===========================================================================

type RewindMode = 'active' | 'required' | 'dontcare'

class ParseInput {
  pos = 0
  constructor(readonly s: string) {}
}

class ParseError extends Error {
  constructor(message: string, readonly position: number) { super(message) }
}

interface Rule {
  match(input: ParseInput, applyActions: boolean, mode: RewindMode, state: ParserContext): boolean
}

type ActionFn = (text: string, begin: number, state: ParserContext) => void

// A rule type of the grammar (a struct in variableExpressionParser.cpp): the
// unit PEGTL's Control (match.hpp:89-158) attaches actions and errors to.
class NamedRule implements Rule {
  inner: Rule | undefined
  action: ActionFn | undefined
  errorMsg: string | undefined
  constructor(readonly name: string, inner?: Rule) { this.inner = inner }

  match(input: ParseInput, applyActions: boolean, mode: RewindMode, state: ParserContext): boolean {
    const hasApply = applyActions && this.action !== undefined
    if (!hasApply) return this.inner!.match(input, applyActions, mode, state)
    // A rule with an action is matched under a required marker so the action
    // input can be formed, and rewound if it fails (match.hpp:131-155).
    const begin = input.pos
    const result = this.inner!.match(input, applyActions, 'active', state)
    if (result) this.action!(input.s.slice(begin, input.pos), begin, state)
    else input.pos = begin
    return result
  }
}

const rule = (name: string, inner?: Rule): NamedRule => new NamedRule(name, inner)

// internal/seq.hpp
function seq(...rules: Rule[]): Rule {
  if (rules.length === 1) return rules[0]!
  return {
    match(input, a, mode, state) {
      const saved = input.pos
      const next: RewindMode = mode === 'required' ? 'active' : mode
      for (const r of rules) {
        if (!r.match(input, a, next, state)) {
          if (mode === 'required') input.pos = saved
          return false
        }
      }
      return true
    },
  }
}

// internal/sor.hpp: every alternative but the last is matched rewinding.
function sor(...rules: Rule[]): Rule {
  return {
    match(input, a, mode, state) {
      return rules.some((r, i) => r.match(input, a, i === rules.length - 1 ? mode : 'required', state))
    },
  }
}

// internal/star.hpp
function star(...rules: Rule[]): Rule {
  const r = seq(...rules)
  return {
    match(input, a, _mode, state) {
      while (r.match(input, a, 'required', state)) { /* repeat */ }
      return true
    },
  }
}

// internal/opt.hpp
function opt(...rules: Rule[]): Rule {
  const r = seq(...rules)
  return {
    match(input, a, _mode, state) {
      r.match(input, a, 'required', state)
      return true
    },
  }
}

// internal/plus.hpp
function plus(...rules: Rule[]): Rule {
  const r = seq(...rules)
  return {
    match(input, a, mode, state) {
      if (!r.match(input, a, mode, state)) return false
      while (r.match(input, a, 'required', state)) { /* repeat */ }
      return true
    },
  }
}

// internal/not_at.hpp: matched without actions, always rewound.
function notAt(...rules: Rule[]): Rule {
  const r = seq(...rules)
  return {
    match(input, _a, _mode, state) {
      const saved = input.pos
      const result = r.match(input, false, 'active', state)
      input.pos = saved
      return !result
    },
  }
}

// internal/must.hpp: must<R> raises Errors<R> where R failed.
function mustOne(r: NamedRule): Rule {
  return {
    match(input, a, _mode, state) {
      if (!r.match(input, a, 'dontcare', state)) {
        throw new ParseError(r.errorMsg ?? '', input.pos)
      }
      return true
    },
  }
}
const must = (...rules: NamedRule[]): Rule => seq(...rules.map(mustOne))

// internal/if_must.hpp
function ifMust(cond: Rule, ...rules: NamedRule[]): Rule {
  const rest = must(...rules)
  return {
    match(input, a, mode, state) {
      if (!cond.match(input, a, mode, state)) return false
      rest.match(input, a, mode, state)
      return true
    },
  }
}

// internal/one.hpp, internal/string.hpp, internal/any.hpp, ranges
function oneOf(chars: string): Rule {
  return {
    match(input) {
      if (input.pos < input.s.length && chars.includes(input.s[input.pos]!)) {
        ++input.pos
        return true
      }
      return false
    },
  }
}
function str(literal: string): Rule {
  return {
    match(input) {
      if (!input.s.startsWith(literal, input.pos)) return false
      input.pos += literal.length
      return true
    },
  }
}
function ranges(test: RegExp): Rule {
  return {
    match(input) {
      if (input.pos < input.s.length && test.test(input.s[input.pos]!)) {
        ++input.pos
        return true
      }
      return false
    },
  }
}
const anyChar: Rule = {
  match(input) {
    if (input.pos >= input.s.length) return false
    ++input.pos
    return true
  },
}
// internal/identifier.hpp
const identifierFirst = ranges(/[a-zA-Z_]/)
const identifierOther = ranges(/[a-zA-Z0-9_]/)
const identifier = seq(identifierFirst, star(identifierOther))
const asciiDigit = ranges(/[0-9]/)
// ascii.hpp keyword<Cs...>: seq<string<Cs...>, not_at<identifier_other>>
const keyword = (word: string): Rule => seq(str(word), notAt(identifierOther))
// internal/pad.hpp, rules.hpp list<Rule, Sep, Pad>
const pad = (r: Rule, p: Rule): Rule => seq(star(p), r, star(p))
const list = (r: Rule, sep: Rule, p: Rule): Rule => seq(r, star(pad(sep, p), r))

// ===========================================================================
// Node creators (variableExpressionParser.cpp:49-415)
// ===========================================================================

interface ErrMsg { value: string }

abstract class NodeCreator {
  abstract createNode(errMsg: ErrMsg): Impl.Node | null
  abstract createASTNode(errMsg: ErrMsg): ASTNodes.Node | null
}

// variableExpressionParser.cpp:65-78
function createNodes(creators: NodeCreator[], errMsg: ErrMsg): (Impl.Node | null)[] {
  return creators.map(c => c.createNode(errMsg))
}

// variableExpressionParser.cpp:80-92
function createASTNodeList(creators: NodeCreator[], errMsg: ErrMsg): ASTNodes.NodeList {
  return ASTNodes._NodeCreator.makeNodeList(creators.map(c => c.createASTNode(errMsg)!))
}

interface StringPart {
  content: string
  isVariable: boolean
  fallback: NodeCreator | null
}

// variableExpressionParser.cpp:94-164
class StringNodeCreator extends NodeCreator {
  parts: StringPart[] = []

  createNode(errMsg: ErrMsg): Impl.Node | null {
    const stringNodeParts: Impl.StringNodePart[] = []
    for (const part of this.parts) {
      let fallbackNode: Impl.Node | null = null
      if (part.fallback) {
        fallbackNode = part.fallback.createNode(errMsg)
        if (errMsg.value) return null
      }
      stringNodeParts.push({ content: part.content, isVariable: part.isVariable, fallback: fallbackNode })
    }
    return new Impl.StringNode(stringNodeParts)
  }

  createASTNode(errMsg: ErrMsg): ASTNodes.Node | null {
    let s = ''
    for (const part of this.parts) {
      if (part.isVariable) {
        s += '${' + part.content
        if (part.fallback) {
          const fallbackAST = part.fallback.createASTNode(errMsg)
          if (errMsg.value) return null
          const fallbackExpr = fallbackAST!.getExpression().getString()
          // GetString() above returns the fallback expression wrapped in
          // enclosing backticks.
          if (fallbackExpr.length >= 2) s += ':' + fallbackExpr.slice(1, -1)
        }
        s += '}'
      } else {
        s += part.content
      }
    }
    return ASTNodes._NodeCreator.makeLiteralNode(s)
  }
}

// variableExpressionParser.cpp:166-196
class VariableNodeCreator extends NodeCreator {
  var_ = ''
  fallbackValue: NodeCreator | null = null

  createNode(errMsg: ErrMsg): Impl.Node | null {
    let fallbackNode: Impl.Node | null = null
    if (this.fallbackValue) {
      fallbackNode = this.fallbackValue.createNode(errMsg)
      // Fail if there was a problem creating the fallback node
      if (errMsg.value) return null
    }
    return new Impl.VariableNode(this.var_, fallbackNode)
  }

  createASTNode(errMsg: ErrMsg): ASTNodes.Node | null {
    return ASTNodes._NodeCreator.makeVariableNode(
      this.var_, this.fallbackValue ? this.fallbackValue.createASTNode(errMsg) : null)
  }
}

// ConstantNodeCreator<int64_t> / <bool> (variableExpressionParser.cpp:198-218).
class IntegerNodeCreator extends NodeCreator {
  value = 0n
  createNode(): Impl.Node { return new Impl.ConstantNode(this.value) }
  createASTNode(): ASTNodes.Node { return ASTNodes._NodeCreator.makeLiteralNode(this.value) }
}
class BoolNodeCreator extends NodeCreator {
  value = false
  createNode(): Impl.Node { return new Impl.ConstantNode(this.value) }
  createASTNode(): ASTNodes.Node { return ASTNodes._NodeCreator.makeLiteralNode(this.value) }
}

// variableExpressionParser.cpp:220-234
class NoneNodeCreator extends NodeCreator {
  createNode(): Impl.Node { return new Impl.NoneNode() }
  createASTNode(): ASTNodes.Node { return ASTNodes._NodeCreator.makeLiteralNode(null) }
}

// variableExpressionParser.cpp:236-264
class ListNodeCreator extends NodeCreator {
  elements: NodeCreator[] = []

  createNode(errMsg: ErrMsg): Impl.Node | null {
    const elemNodes = createNodes(this.elements, errMsg)
    if (errMsg.value) return null
    return new Impl.ListNode(elemNodes as Impl.Node[])
  }

  createASTNode(errMsg: ErrMsg): ASTNodes.Node | null {
    const astNodes = createASTNodeList(this.elements, errMsg)
    if (errMsg.value) return null
    return ASTNodes._NodeCreator.makeListNode(astNodes)
  }
}

// variableExpressionParser.cpp:290-415
class FunctionNodeCreator extends NodeCreator {
  functionArgs: NodeCreator[] = []
  constructor(public functionName: string) { super() }

  createNode(errMsg: ErrMsg): Impl.Node | null {
    // Search the list of available function nodes for one whose name matches
    // the name we received from the parser, then try to construct an instance
    // of that node with the arguments we parsed (:324-362).
    let matchedFunctionName = false
    for (const nodeType of Impl.Sdf_AvailableFunctions) {
      if (this.functionName !== nodeType.functionName) continue
      matchedFunctionName = true
      const node = this.#createNodeHelper(nodeType, errMsg)
      // Return if we successfully created the node or tried to do so but got
      // an error. Otherwise, we may have gotten a node with the right name
      // but the wrong number of arguments, so keep looking.
      if (node || errMsg.value) return node
    }
    errMsg.value = matchedFunctionName
      ? `Function '${this.functionName}' does not take ${this.functionArgs.length} arguments.`
      : `Unknown function ${this.functionName}`
    return null
  }

  createASTNode(errMsg: ErrMsg): ASTNodes.Node | null {
    const astNodes = createASTNodeList(this.functionArgs, errMsg)
    if (errMsg.value) return null
    return ASTNodes._NodeCreator.makeFunctionNode(this.functionName, astNodes)
  }

  // variableExpressionParser.cpp:364-414
  #createNodeHelper(nodeType: Impl.FunctionNodeType, errMsg: ErrMsg): Impl.Node | null {
    if (nodeType.isVariadic) {
      if (this.functionArgs.length < nodeType.numArgs) {
        errMsg.value = `Function '${this.functionName}' requires at least ${nodeType.numArgs} arguments.`
        return null
      }
    } else if (this.functionArgs.length !== nodeType.numArgs) {
      return null
    }
    const argNodes = createNodes(this.functionArgs, errMsg)
    if (errMsg.value) return null
    return nodeType.create(argNodes as Impl.Node[])
  }
}

// ===========================================================================
// Parser state (variableExpressionParser.cpp:417-511)
// ===========================================================================

type CreatorClass<T extends NodeCreator> = abstract new (...args: never[]) => T

class ParserContext {
  readonly #nodeStack: NodeCreator[] = []

  pushNodeCreator<T extends NodeCreator>(creator: T): T {
    this.#nodeStack.push(creator)
    return creator
  }

  popNodeCreator(): NodeCreator | null {
    return this.#nodeStack.pop() ?? null
  }

  // Return the node creator on the top of the stack if it is an instance of
  // `type`, otherwise null.
  getExistingNodeCreator<T extends NodeCreator>(type: CreatorClass<T>): T | null {
    const top = this.#nodeStack[this.#nodeStack.length - 1]
    return top instanceof type ? top as T : null
  }

  // Return the node creator on the top of the stack if it is an instance of
  // `type`, otherwise push a new one and return it.
  getNodeCreator<T extends NodeCreator>(type: CreatorClass<T>, make: () => T): T {
    return this.getExistingNodeCreator(type) ?? this.pushNodeCreator(make())
  }

  createExpressionNode(errMsg: ErrMsg): Impl.Node | null {
    const creator = this.#nodeStack.pop()
    if (!creator) { errMsg.value = 'Unknown error'; return null }
    return creator.createNode(errMsg)
  }

  createASTNode(errMsg: ErrMsg): ASTNodes.Node | null {
    const creator = this.#nodeStack.pop()
    if (!creator) { errMsg.value = 'Unknown error'; return null }
    return creator.createASTNode(errMsg)
  }
}

// ===========================================================================
// Grammar (variableExpressionParser.cpp:531-895)
// ===========================================================================

// :534-539
const Integer = rule('Integer', seq(opt(oneOf('-')), plus(asciiDigit)))

// :547-566
const BooleanTrue = rule('BooleanTrue', sor(keyword('True'), keyword('true')))
const BooleanFalse = rule('BooleanFalse', sor(keyword('False'), keyword('false')))
const BooleanRule = rule('Boolean', sor(BooleanTrue, BooleanFalse))

// :576-587
const VariableStart = rule('VariableStart', str('${'))
const VariableEnd = rule('VariableEnd', str('}'))

// Quoted strings (:589-713). QuotedStringStart/End<Q> are shared by the
// quoted string and fallback quoted string rules of the same quote.
interface QuotedRules {
  Start: NamedRule
  End: NamedRule
  Chars: NamedRule
  Body: NamedRule
  String: NamedRule
  FallbackBody: NamedRule
  FallbackString: NamedRule
}

// :620-629 (completed below, after the quoted string rules exist)
const VariableFallbackSeparator = rule('VariableFallbackSeparator', oneOf(':'))
const VariableFallbackValue = rule('VariableFallbackValue')
const VariableFallback = rule('VariableFallback', ifMust(VariableFallbackSeparator, VariableFallbackValue))
const OptionalVariableFallback = rule('OptionalVariableFallback', opt(VariableFallback))

// VariableImpl<C> (:632-642)
function variableImpl(name: string): { Rule: NamedRule, Name: NamedRule } {
  const Name = rule(`VariableName<${name}>`, identifier)
  return { Rule: rule(name, ifMust(VariableStart, Name, OptionalVariableFallback, VariableEnd)), Name }
}
// :645-654
const Variable = variableImpl('Variable')
const QuotedStringVariable = variableImpl('QuotedStringVariable')

// :719-721
const QuotedStringDisallowedVariable = rule('QuotedStringDisallowedVariable', VariableStart)

function quotedRules(q: string): QuotedRules {
  // :657-660
  const EscapedChar = rule(`QuotedStringEscapedChar<${q}>`, oneOf('`$\\' + q))
  // :663-680
  const Chars = rule(`QuotedStringChars<${q}>`, plus(sor(
    seq(oneOf('\\'), EscapedChar),
    seq(notAt(sor(VariableStart, oneOf(q))), anyChar),
  )))
  const Start = rule(`QuotedStringStart<${q}>`, str(q))
  const End = rule(`QuotedStringEnd<${q}>`, str(q))
  // :692-713
  const Body = rule(`QuotedStringBody<${q}>`, star(sor(QuotedStringVariable.Rule, Chars)))
  const String = rule(`QuotedString<${q}>`, ifMust(Start, Body, End))
  // :723-744
  const FallbackBody = rule(`FallbackQuotedStringBody<${q}>`, star(sor(QuotedStringDisallowedVariable, Chars)))
  const FallbackString = rule(`FallbackQuotedString<${q}>`, ifMust(Start, FallbackBody, End))
  return { Start, End, Chars, Body, String, FallbackBody, FallbackString }
}
const SingleQuoted = quotedRules("'")
const DoubleQuoted = quotedRules('"')

// :748-753
const NoneRule = rule('None', sor(keyword('None'), keyword('none')))

// :758-797
const ExpressionBody = rule('ExpressionBody')
const FunctionName = rule('FunctionName', identifier)
const FunctionArgumentStart = rule('FunctionArgumentStart', pad(oneOf('('), oneOf(' ')))
const FunctionArgumentEnd = rule('FunctionArgumentEnd', pad(oneOf(')'), oneOf(' ')))
const FunctionArgument = rule('FunctionArgumentWrapper<ExpressionBody>', ExpressionBody)
const FunctionArguments = rule('FunctionArguments', sor(
  list(FunctionArgument, oneOf(','), oneOf(' ')),
  star(oneOf(' ')),
))
const FunctionRule = rule('Function', ifMust(seq(FunctionName, FunctionArgumentStart), FunctionArguments, FunctionArgumentEnd))

// :801-811
const ScalarExpression = rule('ScalarExpression', sor(
  Variable.Rule, DoubleQuoted.String, SingleQuoted.String, Integer, BooleanRule, NoneRule, FunctionRule,
))

// :815-839
const ListStart = rule('ListStart', oneOf('['))
const ListEnd = rule('ListEnd', oneOf(']'))
const ListElement = rule('ListElement', ScalarExpression)
const ListElements = rule('ListElements', sor(list(ListElement, oneOf(','), oneOf(' ')), star(oneOf(' '))))
const ListExpression = rule('ListExpression', ifMust(ListStart, ListElements, ListEnd))

// :845-870
const FallbackListElementValue = rule('FallbackListElementValue', sor(
  DoubleQuoted.FallbackString, SingleQuoted.FallbackString, Integer, BooleanRule,
))
const FallbackListElement = rule('FallbackListElement', FallbackListElementValue)
const FallbackListElements = rule('FallbackListElements', sor(
  list(FallbackListElement, oneOf(','), oneOf(' ')), star(oneOf(' ')),
))
const FallbackListExpression = rule('FallbackListExpression', ifMust(ListStart, FallbackListElements, ListEnd))

// :606-614
VariableFallbackValue.inner = sor(
  Integer, BooleanRule, SingleQuoted.FallbackString, DoubleQuoted.FallbackString, FallbackListExpression,
)

// :874-895
const ExpressionStart = rule('ExpressionStart', str('`'))
const ExpressionEnd = rule('ExpressionEnd', str('`'))
ExpressionBody.inner = sor(ScalarExpression, ListExpression)
const Expression = rule('Expression', must(ExpressionStart, ExpressionBody, ExpressionEnd))

// ===========================================================================
// Actions (variableExpressionParser.cpp:897-1144)
// ===========================================================================

// _ThrowParseError (:515-529): the position of an action input is its start.
const throwParseError = (begin: number, msg: string): never => { throw new ParseError(msg, begin) }

// :905-914
for (const q of [SingleQuoted, DoubleQuoted]) {
  q.Chars.action = (text, _begin, context) => {
    context.getNodeCreator(StringNodeCreator, () => new StringNodeCreator())
      .parts.push({ content: text, isVariable: false, fallback: null })
  }
  // :955-968: make sure a StringNodeCreator exists even for an empty string.
  q.Start.action = (_text, _begin, context) => {
    context.getNodeCreator(StringNodeCreator, () => new StringNodeCreator())
  }
}

// :916-925: variable + fallback parsing within a string.
QuotedStringVariable.Name.action = (text, _begin, context) => {
  context.pushNodeCreator(new VariableNodeCreator()).var_ = text
}

// :927-953
QuotedStringVariable.Rule.action = (_text, begin, context) => {
  const creator = context.popNodeCreator()
  if (!(creator instanceof VariableNodeCreator)) {
    throwParseError(begin, 'Internal error: variable creator not at top of stack')
  }
  const variableCreator = creator as VariableNodeCreator
  const stringCreator = context.getExistingNodeCreator(StringNodeCreator)
  if (!stringCreator) {
    throwParseError(begin, 'Internal error: string creator not at expected stack location')
  }
  stringCreator!.parts.push({
    content: variableCreator.var_, isVariable: true, fallback: variableCreator.fallbackValue,
  })
}

// :970-979
QuotedStringDisallowedVariable.action = (_text, begin) => {
  throwParseError(begin, 'Variable references are not allowed in fallback string values')
}

// :981-989
Variable.Name.action = (text, _begin, context) => {
  context.getNodeCreator(VariableNodeCreator, () => new VariableNodeCreator()).var_ = text
}

// TfStringToInt64 with its outOfRange flag (tf/stringUtils.cpp).
const INT64_MIN = -(2n ** 63n), INT64_MAX = 2n ** 63n - 1n

// :991-1007
Integer.action = (text, begin, context) => {
  const value = BigInt(text)
  if (value < INT64_MIN || value > INT64_MAX) {
    throwParseError(begin, `Integer ${text} out of range.`)
  }
  context.getNodeCreator(IntegerNodeCreator, () => new IntegerNodeCreator()).value = value
}

// :1009-1027
BooleanTrue.action = (_text, _begin, context) => {
  context.getNodeCreator(BoolNodeCreator, () => new BoolNodeCreator()).value = true
}
BooleanFalse.action = (_text, _begin, context) => {
  context.getNodeCreator(BoolNodeCreator, () => new BoolNodeCreator()).value = false
}

// :1029-1050
VariableFallbackValue.action = (_text, begin, context) => {
  const valueCreator = context.popNodeCreator()
  if (!valueCreator) throwParseError(begin, 'Internal error: value creator not at top of stack')
  const variableCreator = context.getExistingNodeCreator(VariableNodeCreator)
  if (!variableCreator) {
    throwParseError(begin, 'Internal error: variable creator not at expected stack location')
  }
  variableCreator!.fallbackValue = valueCreator
}

// :1053-1061
NoneRule.action = (_text, _begin, context) => {
  context.getNodeCreator(NoneNodeCreator, () => new NoneNodeCreator())
}

// :1063-1071
ListStart.action = (_text, _begin, context) => {
  context.pushNodeCreator(new ListNodeCreator())
}

// _AppendListElement (:1073-1091)
function appendListElement(begin: number, context: ParserContext): void {
  const elemCreator = context.popNodeCreator()
  if (!elemCreator) throwParseError(begin, 'Internal error: could not pop node creator stack')
  const listCreator = context.getExistingNodeCreator(ListNodeCreator)
  if (!listCreator) throwParseError(begin, 'Internal error: list creator not at top of stack')
  listCreator!.elements.push(elemCreator!)
}
// :1093-1111
ListElement.action = (_text, begin, context) => appendListElement(begin, context)
FallbackListElement.action = (_text, begin, context) => appendListElement(begin, context)

// :1113-1121
FunctionName.action = (text, _begin, context) => {
  context.pushNodeCreator(new FunctionNodeCreator(text))
}

// :1123-1144
FunctionArgument.action = (_text, begin, context) => {
  const elemCreator = context.popNodeCreator()
  if (!elemCreator) throwParseError(begin, 'Internal error: could not pop node creator stack')
  const fnCreator = context.getExistingNodeCreator(FunctionNodeCreator)
  if (!fnCreator) throwParseError(begin, 'Internal error: function creator not at top of stack')
  fnCreator!.functionArgs.push(elemCreator!)
}

// ===========================================================================
// Error messages (variableExpressionParser.cpp:1146-1192)
// ===========================================================================

const matchError = (r: NamedRule, msg: string): void => { r.errorMsg = msg }
// Should never hit these errors because of how the rules are defined.
matchError(ListElements, '')
matchError(FallbackListElements, '')
matchError(FunctionArguments, '')
matchError(OptionalVariableFallback, '')

matchError(ListEnd, "Missing ending ']'")
matchError(FunctionArgumentEnd, "Missing ending ')'")
matchError(ExpressionStart, "Expressions must begin with '`'")
matchError(ExpressionBody, 'Unexpected expression')
matchError(ExpressionEnd, "Missing ending '`'")

matchError(Variable.Name, 'Variables must be a C identifier')
matchError(VariableFallbackSeparator, "Expected ':' before fallback value")
matchError(VariableFallbackValue, "Expected a fallback value after ':'")

matchError(QuotedStringVariable.Name, 'Variables must be a C identifier')
matchError(VariableEnd, "Missing ending '}'")

matchError(DoubleQuoted.Body, 'Invalid string contents')
matchError(DoubleQuoted.End, `Missing ending '"'`)

matchError(SingleQuoted.Body, 'Invalid string contents')
matchError(SingleQuoted.End, `Missing ending "'"`)

matchError(DoubleQuoted.FallbackBody, 'Invalid string contents')
matchError(SingleQuoted.FallbackBody, 'Invalid string contents')

// ===========================================================================
// Entry points (variableExpressionParser.cpp:1194-1279)
// ===========================================================================

interface ParseResult {
  context: ParserContext | null
  errMsg: string[]
}

const utf8 = new TextEncoder()

// PEGTL's position column is the 1-based byte offset in the current line.
function column(expr: string, position: number): number {
  const lineStart = expr.lastIndexOf('\n', position - 1) + 1
  return utf8.encode(expr.slice(lineStart, position)).length + 1
}

// :1202-1235
function parseVariableExpressionImpl(expr: string): ParseResult {
  const context = new ParserContext()
  const input = new ParseInput(expr)
  try {
    const parseSuccess = Expression.match(input, true, 'required', context)
    if (!parseSuccess) return { context: null, errMsg: ['Unable to parse expression'] }
  } catch (e) {
    if (!(e instanceof ParseError)) throw e
    // XXX: "at character" is probably incorrect if the expression contains
    // Unicode strings? (as upstream: a byte column)
    return { context: null, errMsg: [`${e.message} at character ${column(expr, e.position) - 1}`] }
  }
  return { context, errMsg: [] }
}

/** Sdf_VariableExpressionParserResult (variableExpressionParser.h). */
export interface Sdf_VariableExpressionParserResult {
  expression: Impl.Node | null
  errors: string[]
}

/** Sdf_VariableExpressionASTParserResult (variableExpressionParser.h). */
export interface Sdf_VariableExpressionASTParserResult {
  astRoot: ASTNodes.Node | null
  errors: string[]
}

// :1237-1254
export function Sdf_ParseVariableExpression(expr: string): Sdf_VariableExpressionParserResult {
  const result = parseVariableExpressionImpl(expr)
  if (!result.context) return { expression: null, errors: result.errMsg }
  const errMsg: ErrMsg = { value: '' }
  const exprNode = result.context.createExpressionNode(errMsg)
  if (!exprNode) return { expression: null, errors: [errMsg.value] }
  return { expression: exprNode, errors: [] }
}

// :1256-1273
export function Sdf_ParseVariableExpressionAST(expr: string): Sdf_VariableExpressionASTParserResult {
  const result = parseVariableExpressionImpl(expr)
  if (!result.context) return { astRoot: null, errors: result.errMsg }
  const errMsg: ErrMsg = { value: '' }
  const astNode = result.context.createASTNode(errMsg)
  if (!astNode) return { astRoot: null, errors: [errMsg.value] }
  return { astRoot: astNode, errors: [] }
}

// :1275-1279
export function Sdf_IsVariableExpression(s: string): boolean {
  return s.length > 2 && s[0] === '`' && s[s.length - 1] === '`'
}
