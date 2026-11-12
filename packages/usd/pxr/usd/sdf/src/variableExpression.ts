// Ported from OpenUSD 26.11.1: pxr/usd/sdf/variableExpression.cpp,
//  pxr/usd/sdf/variableExpression.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfVariableExpression — port of OpenUSD v26.11.1
// pxr/usd/sdf/variableExpression.{h,cpp}: parses and evaluates the variable
// expression language, strings surrounded by backticks such as
// `` `"a_${NAME}_string"` `` that may refer to expression variables.
//
// The grammar is in variableExpressionParser.ts, the evaluation nodes in
// variableExpressionImpl.ts and the syntax tree in variableExpressionAST.ts.
//
// Values. Evaluation results are VtValues upstream; here they are plain JS
// values: string, boolean, an int64 as a `number` when it is a safe integer
// and a `bigint` otherwise, a JS array for VtArray<string|bool|int64>, the
// SdfVariableExpression.EmptyList instance for the empty list, and `null` for
// an empty VtValue (None, or no value because of errors). Variables may be a
// VtDictionary or a record of JS values (see Sdf_ExpressionValueFromVariable
// in variableExpressionImpl.ts for the forms accepted).

import type { Dictionary as VtDictionary } from 'typescript-usd/vt'
import {
  EvalContext, GetValueType, Sdf_ExpressionList, Sdf_ExpressionValueCppTypeName,
  Sdf_ExpressionValueFromVariable, SdfVariableExpressionEmptyList, ValueType,
  type Node as Sdf_VariableExpressionNode, type Sdf_ExpressionValue,
} from './variableExpressionImpl.ts'
import { Sdf_IsVariableExpression, Sdf_ParseVariableExpression } from './variableExpressionParser.ts'

export { SdfVariableExpressionEmptyList } from './variableExpressionImpl.ts'

export type SdfExpressionScalarValue = string | boolean | number | bigint

/** The value of an evaluated expression (see the header comment). */
export type SdfExpressionValue =
  | SdfExpressionScalarValue
  | null
  | SdfExpressionScalarValue[]
  | SdfVariableExpressionEmptyList

/** Expression variables as a record; a VtDictionary is also accepted. */
export type SdfExpressionVariables = { readonly [name: string]: unknown }

/** SdfVariableExpression::Result (variableExpression.h:169-176). */
export interface SdfVariableExpressionResult {
  value: SdfExpressionValue
  errors: string[]
  usedVariables: string[]
}

/** Result types for evaluateTyped (EvaluateTyped<ResultType>). */
export type SdfVariableExpressionResultType =
  | 'string' | 'bool' | 'int64' | 'string[]' | 'bool[]' | 'int64[]'

const toPublicScalar = (v: string | boolean | bigint): SdfExpressionScalarValue =>
  typeof v === 'bigint' && v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(v)
    : v

function toPublicValue(v: Sdf_ExpressionValue): SdfExpressionValue {
  if (v === undefined) return null
  if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'bigint') return toPublicScalar(v)
  if (v instanceof Sdf_ExpressionList) return v.elements.map(toPublicScalar)
  if (v instanceof SdfVariableExpressionEmptyList) return v
  // Evaluation never produces values of unsupported types.
  return null
}

const resultTypeOf = (type: SdfVariableExpressionResultType): Sdf_ExpressionValue => {
  switch (type) {
    case 'string': return ''
    case 'bool': return false
    case 'int64': return 0n
    default: return new Sdf_ExpressionList(type.slice(0, -2) as 'string' | 'bool' | 'int64', [])
  }
}
const sameType = (v: Sdf_ExpressionValue, type: SdfVariableExpressionResultType): boolean =>
  v instanceof Sdf_ExpressionList
    ? type === `${v.elementType}[]`
    : (typeof v === 'string' && type === 'string') || (typeof v === 'boolean' && type === 'bool') ||
      (typeof v === 'bigint' && type === 'int64')

/** Class responsible for parsing and evaluating variable expressions. */
export class SdfVariableExpression {
  /** SdfVariableExpression::EmptyList: the value of an empty list. */
  static readonly EmptyList = SdfVariableExpressionEmptyList

  readonly #errors: string[]
  readonly #expression: Sdf_VariableExpressionNode | null
  readonly #expressionStr: string

  /**
   * Parse `expr` (variableExpression.cpp:24-39). With no argument, an empty,
   * invalid expression (variableExpression.cpp:18-22). A builder is converted
   * as its `operator SdfVariableExpression` does (variableExpression.cpp:103-145).
   */
  constructor(expr?: string | SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder |
    SdfVariableExpressionListBuilder) {
    if (expr === undefined) {
      this.#expressionStr = ''
      this.#expression = null
      this.#errors = ['No expression specified']
      return
    }
    this.#expressionStr = typeof expr === 'string' ? expr : expr._expressionString()
    const parseResult = Sdf_ParseVariableExpression(this.#expressionStr)
    this.#expression = parseResult.expression
    this.#errors = parseResult.errors
  }

  /** True if `s` is a variable expression; does not check its syntax. */
  static isExpression(s: string): boolean {
    return Sdf_IsVariableExpression(s)
  }

  /**
   * True if `value` is a supported variable type (variableExpression.cpp:49-58):
   * string, bool, int, int64, None and arrays of string, bool, int or int64.
   */
  static isValidVariableType(value: unknown): boolean {
    return GetValueType(Sdf_ExpressionValueFromVariable(value)) !== ValueType.Unknown
  }

  /** operator bool: true if this expression parsed successfully. */
  isValid(): boolean { return this.#expression !== null }

  getString(): string { return this.#expressionStr }
  toString(): string { return this.#expressionStr }

  getErrors(): string[] { return this.#errors }

  /** variableExpression.cpp:77-92 */
  evaluate(variables: SdfExpressionVariables | VtDictionary = {}): SdfVariableExpressionResult {
    const r = this._evaluate(variables)
    return { value: toPublicValue(r.value), errors: r.errors, usedVariables: r.usedVariables }
  }

  /**
   * EvaluateTyped<ResultType> (variableExpression.h:201-214): an empty list
   * becomes an empty array of the requested type, and any other value not of
   * the requested type becomes an error.
   */
  evaluateTyped(
    variables: SdfExpressionVariables | VtDictionary, resultType: SdfVariableExpressionResultType,
  ): SdfVariableExpressionResult {
    const r = this._evaluate(variables)
    if (resultType.endsWith('[]') && r.value instanceof SdfVariableExpressionEmptyList) {
      r.value = resultTypeOf(resultType)
    } else if (r.value !== undefined && !sameType(r.value, resultType)) {
      r.errors.push(SdfVariableExpression._formatUnexpectedTypeError(r.value, resultTypeOf(resultType)))
      r.value = undefined
    }
    return { value: toPublicValue(r.value), errors: r.errors, usedVariables: r.usedVariables }
  }

  /** @internal Evaluate to the internal held value. */
  _evaluate(variables: SdfExpressionVariables | VtDictionary): {
    value: Sdf_ExpressionValue, errors: string[], usedVariables: string[]
  } {
    if (!this.#expression) {
      return { value: undefined, errors: [...this.#errors], usedVariables: [] }
    }
    const ctx = new EvalContext(variables)
    const result = this.#expression.evaluate(ctx)
    return {
      value: result.value,
      errors: result.errors,
      usedVariables: [...ctx.getRequestedVariables()],
    }
  }

  // variableExpression.cpp:94-101
  static _formatUnexpectedTypeError(got: Sdf_ExpressionValue, expected: Sdf_ExpressionValue): string {
    return `Expression evaluated to '${Sdf_ExpressionValueCppTypeName(got)}' but expected ` +
      `'${Sdf_ExpressionValueCppTypeName(expected)}'`
  }

  // ---- Expression builders (variableExpression.h:227-376) ------------------

  /** A function call expression with the given arguments. */
  static makeFunction(fnName: string, ...fnArgs: SdfVariableExpressionArgument[]): SdfVariableExpressionFunctionBuilder {
    const b = new SdfVariableExpressionFunctionBuilder(fnName)
    for (const arg of fnArgs) b.addArgument(arg)
    return b
  }

  /** A list expression with the given elements. */
  static makeList(...elems: SdfVariableExpressionArgument[]): SdfVariableExpressionListBuilder {
    const b = new SdfVariableExpressionListBuilder()
    for (const elem of elems) b.addElement(elem)
    return b
  }

  /** A list expression of literal values (all of one type). */
  static makeListOfLiterals(values: readonly (bigint | number | boolean | string)[]): SdfVariableExpressionListBuilder {
    return new SdfVariableExpressionListBuilder().addLiteralValues(values)
  }

  /**
   * A literal: an int64 (a bigint or an integer number), a bool or a string
   * (variableExpression.cpp:172-196).
   */
  static makeLiteral(value: bigint | number | boolean | string): SdfVariableExpressionBuilder {
    if (typeof value === 'boolean') return new SdfVariableExpressionBuilder(value ? 'True' : 'False')
    if (typeof value === 'string') {
      // Variable expression syntax does not allow triple quotes.
      return new SdfVariableExpressionBuilder(sdfFileIOUtilityQuote(value))
    }
    if (typeof value === 'number' && !Number.isInteger(value)) {
      throw new TypeError(`No literal for non-integer number ${value}`)
    }
    return new SdfVariableExpressionBuilder(BigInt(value).toString())
  }

  /** The None literal (variableExpression.cpp:198-202). */
  static makeNone(): SdfVariableExpressionBuilder {
    return new SdfVariableExpressionBuilder('None')
  }

  /** A variable reference with an optional fallback (variableExpression.cpp:204-229). */
  static makeVariable(
    name: string,
    fallbackValue?: SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder |
      SdfVariableExpressionListBuilder | SdfVariableExpression,
  ): SdfVariableExpressionBuilder {
    if (fallbackValue === undefined) return new SdfVariableExpressionBuilder('${' + name + '}')
    if (fallbackValue instanceof SdfVariableExpression) {
      // Expression strings returned by SdfVariableExpression are bracketed
      // by "`" characters.
      const e = fallbackValue.getString()
      const fallbackExpr = SdfVariableExpression.isExpression(e) ? e.slice(1, -1) : e
      return new SdfVariableExpressionBuilder('${' + name + ':' + fallbackExpr + '}')
    }
    const b = fallbackValue instanceof SdfVariableExpressionBuilder ? fallbackValue : fallbackValue.toBuilder()
    return new SdfVariableExpressionBuilder('${' + name + ':' + b._expr + '}')
  }

  // _AppendExpression / _AppendBuilder (variableExpression.cpp:147-170).
  /** @internal */
  static _append(expr: string, arg: SdfVariableExpressionArgument, first: boolean): string {
    if (arg instanceof SdfVariableExpression) {
      const e = arg.getString()
      if (!SdfVariableExpression.isExpression(e)) return expr
      // Expression strings returned by SdfVariableExpression are bracketed by
      // "`" characters, so we need to strip them off before appending them.
      return expr + (first ? '' : ', ') + e.slice(1, -1)
    }
    const b = arg instanceof SdfVariableExpressionBuilder ? arg : arg.toBuilder()
    return expr + (first ? '' : ', ') + b._expr
  }
}

/** An argument or element accepted by the builders. */
export type SdfVariableExpressionArgument =
  | SdfVariableExpression
  | SdfVariableExpressionBuilder
  | SdfVariableExpressionFunctionBuilder
  | SdfVariableExpressionListBuilder

/** SdfVariableExpression::Builder (variableExpression.h:227-243). */
export class SdfVariableExpressionBuilder {
  /** @internal */
  constructor(readonly _expr: string) {}
  /** @internal operator SdfVariableExpression (variableExpression.cpp:103-107) */
  _expressionString(): string { return '`' + this._expr + '`' }
  toExpression(): SdfVariableExpression { return new SdfVariableExpression(this) }
}

/** SdfVariableExpression::FunctionBuilder (variableExpression.h:245-271). */
export class SdfVariableExpressionFunctionBuilder {
  #expr: string
  /** @internal */
  constructor(name: string) { this.#expr = name + '(' }

  addArgument(arg: SdfVariableExpressionArgument): this {
    this.#expr = SdfVariableExpression._append(this.#expr, arg, this.#expr.endsWith('('))
    return this
  }

  /** @internal operator SdfVariableExpression (variableExpression.cpp:109-113) */
  _expressionString(): string { return '`' + this.#expr + ')`' }
  /** operator Builder (variableExpression.cpp:115-126) */
  toBuilder(): SdfVariableExpressionBuilder { return new SdfVariableExpressionBuilder(this.#expr + ')') }
  toExpression(): SdfVariableExpression { return new SdfVariableExpression(this) }
}

/** SdfVariableExpression::ListBuilder (variableExpression.h:273-305). */
export class SdfVariableExpressionListBuilder {
  #expr = '['

  addElement(elem: SdfVariableExpressionArgument): this {
    this.#expr = SdfVariableExpression._append(this.#expr, elem, this.#expr.endsWith('['))
    return this
  }

  /**
   * Append literal values (variableExpression.h:430-440). Upstream takes a
   * std::vector<T> of one type; mixed or unsupported values raise TypeError as
   * the Python wrapper does.
   */
  addLiteralValues(values: readonly (bigint | number | boolean | string)[]): this {
    const kind = (v: unknown): string =>
      typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v)) ? 'int' : typeof v
    const kinds = new Set(values.map(kind))
    if (kinds.size > 1 || [...kinds].some(k => k !== 'int' && k !== 'boolean' && k !== 'string')) {
      throw new TypeError('List literal values must all be int, bool or string')
    }
    for (const v of values) this.addElement(SdfVariableExpression.makeLiteral(v))
    return this
  }

  /** @internal operator SdfVariableExpression (variableExpression.cpp:128-132) */
  _expressionString(): string { return '`' + this.#expr + ']`' }
  /** operator Builder (variableExpression.cpp:134-145) */
  toBuilder(): SdfVariableExpressionBuilder { return new SdfVariableExpressionBuilder(this.#expr + ']') }
  toExpression(): SdfVariableExpression { return new SdfVariableExpression(this) }
}

// Sdf_FileIOUtility::Quote(value, /* allowTripleQuotes = */ false)
// (fileIO_Common.cpp:1069-1112).
function sdfFileIOUtilityQuote(str: string): string {
  let quote = '"'
  if (str.includes('"') && !str.includes("'")) quote = "'"
  let result = quote
  for (const ch of str) {
    // fileIO_Common.cpp iterates c_str() up to the first NUL byte.
    if (ch === '\0') break
    if (ch === '\n') result += '\\n'
    else if (ch === '\r') result += '\\r'
    else if (ch === '\t') result += '\\t'
    else if (ch === '\\') result += '\\\\'
    else if (ch === quote) result += '\\' + quote
    else {
      const cp = ch.codePointAt(0)!
      if (cp >= 32 && cp <= 126) result += ch
      else if (cp < 32 || cp === 127) result += `\\x${cp.toString(16).padStart(2, '0')}`
      else if (cp >= 0xdc80 && cp <= 0xdcff) result += `\\x${(cp - 0xdc00).toString(16)}`
      else result += ch
    }
  }
  return result + quote
}

// ---- Convenience entry points used across the library ---------------------

/** SdfVariableExpression::IsExpression. */
export function sdfIsVariableExpression(s: string): boolean {
  return Sdf_IsVariableExpression(s)
}

/** SdfVariableExpression::IsValidVariableType. */
export function sdfIsValidVariableType(v: unknown): boolean {
  return SdfVariableExpression.isValidVariableType(v)
}

/** SdfVariableExpression(expr).Evaluate(variables). */
export function sdfEvaluateVariableExpression(
  expr: string, variables: SdfExpressionVariables | VtDictionary,
): SdfVariableExpressionResult {
  return new SdfVariableExpression(expr).evaluate(variables)
}
