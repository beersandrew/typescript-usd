// Ported from OpenUSD 26.11.1: pxr/usd/sdf/variableExpressionImpl.cpp,
//  pxr/usd/sdf/variableExpressionImpl.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sdf_VariableExpressionImpl — port of OpenUSD v26.11.1
// pxr/usd/sdf/variableExpressionImpl.{h,cpp}: the evaluation nodes of a parsed
// variable expression and the context they evaluate in.
//
// Upstream values are VtValues holding std::string, bool, int64_t,
// VtArray<std::string|bool|int64_t>, SdfVariableExpression::EmptyList or
// nothing. JavaScript erases the int / int64 / double distinction of a
// `number`, so evaluation uses its own stand-in for those held values
// (Sdf_ExpressionValue below): int64 is a `bigint`, the three list types are
// Sdf_ExpressionList tagged with their element type, None is `undefined`, and a
// value of a type the language does not support is an Sdf_UnsupportedValue
// that keeps the C++ type name upstream reports. Conversion from the values
// callers put in an expression-variables dictionary is
// Sdf_ExpressionValueFromVariable; conversion back to plain JS values is in
// variableExpression.ts.

import { TfEscapeString } from 'typescript-usd/tf'
import { Array as VtArray, Dictionary as VtDictionary, Value as VtValue } from 'typescript-usd/vt'
import {
  PatternMatcher as TfPatternMatcher, TfDiagnosticMgr, Error as TfError, TfDiagnosticType,
} from 'typescript-usd/tf'
import { Sdf_IsVariableExpression, Sdf_ParseVariableExpression } from './variableExpressionParser.ts'
import { _sdfGetDictionaryValueTypes } from './schema.ts'

// ---- Held values ----------------------------------------------------------

/** SdfVariableExpression::EmptyList (variableExpression.h:166-167). */
export class SdfVariableExpressionEmptyList {
  equals(other: unknown): boolean { return other instanceof SdfVariableExpressionEmptyList }
}
const emptyList = new SdfVariableExpressionEmptyList()

export type Sdf_ExpressionScalar = string | boolean | bigint
export type Sdf_ExpressionElementType = 'string' | 'bool' | 'int64'

/** VtArray<std::string>, VtArray<bool> or VtArray<int64_t>. */
export class Sdf_ExpressionList {
  constructor(
    readonly elementType: Sdf_ExpressionElementType,
    readonly elements: Sdf_ExpressionScalar[],
  ) {}
}

/** A held value of a type expressions do not support, by its C++ type name. */
export class Sdf_UnsupportedValue {
  constructor(readonly typeName: string, readonly value: unknown) {}
}

export type Sdf_ExpressionValue =
  | undefined
  | Sdf_ExpressionScalar
  | Sdf_ExpressionList
  | SdfVariableExpressionEmptyList
  | Sdf_UnsupportedValue

/** VtValue::GetType() identity for comparing held types. */
export function Sdf_ExpressionValueTypeKey(v: Sdf_ExpressionValue): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return 'string'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'bigint') return 'int64'
  if (v instanceof Sdf_ExpressionList) return `VtArray<${v.elementType}>`
  if (v instanceof SdfVariableExpressionEmptyList) return 'EmptyList'
  return `unsupported:${v.typeName}`
}

/**
 * VtValue::GetTypeName() for a held value: the demangled C++ type name as the
 * 26.11.1 macOS build reports it (int64_t is `long long` there).
 */
export function Sdf_ExpressionValueCppTypeName(v: Sdf_ExpressionValue): string {
  if (v === undefined) return 'void'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'bigint') return 'long long'
  if (v instanceof Sdf_ExpressionList) {
    return `VtArray<${v.elementType === 'int64' ? 'long long' : v.elementType}>`
  }
  if (v instanceof SdfVariableExpressionEmptyList) return 'SdfVariableExpression::EmptyList'
  return v.typeName
}

// ---- ValueType (variableExpressionImpl.h:28-53, .cpp:29-133) ---------------

export enum ValueType {
  Unknown,
  Boolean,
  Integer,
  String,
  List,
  None,
}

// _TypeVisitor (variableExpressionImpl.cpp:46-86).
export function GetValueType(v: Sdf_ExpressionValue): ValueType {
  if (v === undefined) return ValueType.None
  if (typeof v === 'string') return ValueType.String
  if (typeof v === 'boolean') return ValueType.Boolean
  if (typeof v === 'bigint') return ValueType.Integer
  if (v instanceof Sdf_ExpressionList || v instanceof SdfVariableExpressionEmptyList) {
    return ValueType.List
  }
  return ValueType.Unknown
}

// variableExpressionImpl.cpp:94-113
export function GetValueTypeName(v: Sdf_ExpressionValue): string {
  switch (GetValueType(v)) {
    case ValueType.String: return 'string'
    case ValueType.Boolean: return 'bool'
    case ValueType.Integer: return 'int'
    case ValueType.List: return 'list'
    case ValueType.None: return 'None'
    case ValueType.Unknown: break
  }
  return Sdf_ExpressionValueCppTypeName(v)
}

// C++ type names of the scene-description value types, for values of types
// expressions do not support (VtValue::GetTypeName).
const cppScalarNames: Record<string, string> = {
  token: 'TfToken', asset: 'SdfAssetPath', half: 'pxr_half::half', uint: 'unsigned int',
  uint64: 'unsigned long long', uchar: 'unsigned char', int64: 'long long',
  timecode: 'SdfTimeCode', opaque: 'SdfOpaqueValue', pathExpression: 'SdfPathExpression',
  dictionary: 'VtDictionary', string: 'string', VtDictionary: 'VtDictionary',
}
const cppName = (usdTypeName: string): string => {
  if (usdTypeName.endsWith('[]')) return `VtArray<${cppName(usdTypeName.slice(0, -2))}>`
  return cppScalarNames[usdTypeName] ?? usdTypeName
}

function listFromElements(
  elementType: string, elements: readonly unknown[], typeName: string,
): Sdf_ExpressionValue {
  switch (elementType) {
    case 'string':
      return new Sdf_ExpressionList('string', elements.map(String))
    case 'bool':
      return new Sdf_ExpressionList('bool', elements.map(Boolean))
    // CoerceIfUnsupportedValueType: VtArray<int> -> VtArray<int64_t>
    // (variableExpressionImpl.cpp:126-130).
    case 'int':
    case 'int64':
      return new Sdf_ExpressionList('int64', elements.map(e => BigInt(e as number | bigint)))
    default:
      return new Sdf_UnsupportedValue(typeName, elements)
  }
}

/**
 * The held value of an expression-variables dictionary entry, with
 * CoerceIfUnsupportedValueType (variableExpressionImpl.cpp:115-133) applied:
 * int and VtArray<int> become int64 values. `declaredType` is the entry's
 * scene-description type name when known (a layer dictionary records it), so
 * that e.g. a `double` holding 1 is not mistaken for an int.
 *
 * Accepted JS forms: null/undefined (None), string, boolean, bigint (int64),
 * number (int unless declared otherwise; a non-integer is a double), VtValue,
 * VtArray, SdfVariableExpression.EmptyList, and JS arrays of one of string,
 * boolean or integer (an empty JS array is the empty list).
 */
export function Sdf_ExpressionValueFromVariable(
  value: unknown, declaredType?: string,
): Sdf_ExpressionValue {
  if (value instanceof VtValue) {
    if (value.IsEmpty()) return undefined
    return Sdf_ExpressionValueFromVariable(value.Get(), value.getTypeName())
  }
  if (value === null || value === undefined) return undefined
  if (value instanceof SdfVariableExpressionEmptyList) return emptyList
  if (value instanceof Sdf_ExpressionList || value instanceof Sdf_UnsupportedValue) return value
  if (value instanceof VtArray) {
    const elementType = value.getElementType().getTypeName()
    const usdElement = declaredType?.endsWith('[]') ? declaredType.slice(0, -2) : elementType
    return listFromElements(usdElement, value.toArray(), `VtArray<${cppName(usdElement)}>`)
  }
  if (declaredType !== undefined && declaredType !== '') {
    if (declaredType.endsWith('[]') && Array.isArray(value)) {
      const element = declaredType.slice(0, -2)
      return listFromElements(element, value, cppName(declaredType))
    }
    switch (declaredType) {
      case 'string':
        if (typeof value === 'string') return value
        break
      case 'bool':
        if (typeof value === 'boolean') return value
        break
      case 'int':
      case 'int64':
      case 'long long':
        if (typeof value === 'number' || typeof value === 'bigint') return BigInt(value)
        break
      default:
        return new Sdf_UnsupportedValue(cppName(declaredType), value)
    }
  }
  switch (typeof value) {
    case 'string': return value
    case 'boolean': return value
    case 'bigint': return value
    case 'number':
      return Number.isInteger(value) ? BigInt(value) : new Sdf_UnsupportedValue('double', value)
    default: break
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return emptyList
    if (value.every(e => typeof e === 'string')) return new Sdf_ExpressionList('string', [...value])
    if (value.every(e => typeof e === 'boolean')) return new Sdf_ExpressionList('bool', [...value])
    if (value.every(e => typeof e === 'bigint' || (typeof e === 'number' && Number.isInteger(e)))) {
      return new Sdf_ExpressionList('int64', value.map(e => BigInt(e as number | bigint)))
    }
    return new Sdf_UnsupportedValue('vector<VtValue>', value)
  }
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name
  return new Sdf_UnsupportedValue(ctor || typeof value, value)
}

// ---- EvalResult (variableExpressionImpl.h:55-72) ---------------------------

export interface EvalResult {
  value: Sdf_ExpressionValue
  errors: string[]
}
export const EvalResult = {
  Value: (value: Sdf_ExpressionValue): EvalResult => ({ value, errors: [] }),
  noValue: (): EvalResult => ({ value: undefined, errors: [] }),
  Error: (errors: string[]): EvalResult => ({ value: undefined, errors }),
}

// _CollectErrors / _CombineErrors (variableExpressionImpl.cpp:139-172).
function collectErrors(errors: string[], ...results: EvalResult[]): boolean {
  let any = false
  for (const r of results) {
    if (r.errors.length === 0) continue
    errors.push(...r.errors)
    any = true
  }
  return any
}
function combineErrors(...results: EvalResult[]): string[] {
  const errors: string[] = []
  collectErrors(errors, ...results)
  return errors
}

// ---- EvalContext (variableExpressionImpl.h:74-102, .cpp:176-264) -----------

/** The variables an expression evaluates against: a VtDictionary or a record. */
export type Sdf_ExpressionVariables = VtDictionary | { readonly [name: string]: unknown }

export class EvalContext {
  readonly #variables: Sdf_ExpressionVariables
  readonly #requestedVariables = new Set<string>()
  readonly #variableStack: string[] = []

  constructor(variables: Sdf_ExpressionVariables) {
    this.#variables = variables
  }

  #lookup(name: string): { value: unknown, declaredType?: string | undefined } | undefined {
    const vars = this.#variables
    if (vars instanceof VtDictionary) {
      const v = vars.get(name)
      return v === undefined ? undefined : { value: v }
    }
    if (!Object.hasOwn(vars, name)) return undefined
    return { value: vars[name], declaredType: _sdfGetDictionaryValueTypes(vars)?.get(name) }
  }

  // variableExpressionImpl.cpp:181-185
  hasVariable(name: string): boolean {
    return this.#lookup(name) !== undefined
  }

  // variableExpressionImpl.cpp:187-264
  getVariable(name: string): [EvalResult, boolean] {
    // Check if we have circular variable substitutions.
    if (this.#variableStack.includes(name)) {
      const formattedVars = this.#variableStack.map(s => `'${s}'`)
      return [EvalResult.Error([
        `Encountered circular variable substitutions: [${formattedVars.join(', ')}, '${name}']`,
      ]), true]
    }

    this.#requestedVariables.add(name)

    const entry = this.#lookup(name)
    if (!entry) return [EvalResult.noValue(), false]

    // Coerce the variable to a supported type if necessary.
    const value = Sdf_ExpressionValueFromVariable(entry.value, entry.declaredType)

    // If the variable isn't a supported type, return an error.
    if (GetValueType(value) === ValueType.Unknown) {
      return [EvalResult.Error([
        `Variable '${name}' has unsupported type ${GetValueTypeName(value)}`,
      ]), true]
    }

    // If the value of the variable is itself an expression,
    // parse and evaluate it and return the result.
    if (typeof value === 'string' && Sdf_IsVariableExpression(value)) {
      const subExpr = Sdf_ParseVariableExpression(value)
      if (subExpr.expression) {
        this.#variableStack.push(name)
        try {
          return [subExpr.expression.evaluate(this), true]
        } finally {
          this.#variableStack.pop()
        }
      } else if (subExpr.errors.length > 0) {
        return [EvalResult.Error(subExpr.errors.map(err => `${err} (in variable '${name}')`)), true]
      } else {
        return [EvalResult.noValue(), true]
      }
    }

    return [EvalResult.Value(value), true]
  }

  getRequestedVariables(): Set<string> { return this.#requestedVariables }
}

// ---- Nodes ----------------------------------------------------------------

export abstract class Node {
  abstract evaluate(ctx: EvalContext): EvalResult
}

export interface StringNodePart {
  content: string
  isVariable: boolean
  fallback: Node | null
}

// variableExpressionImpl.cpp:272-345
export class StringNode extends Node {
  readonly #parts: StringNodePart[]

  constructor(parts: StringNodePart[]) {
    super()
    // Handle escape sequences in the expression here so we don't have to
    // do it every time we evaluate this node.
    this.#parts = parts.map(part =>
      part.isVariable ? part : { ...part, content: TfEscapeString(part.content) })
  }

  evaluate(ctx: EvalContext): EvalResult {
    let result = ''
    for (const part of this.#parts) {
      if (!part.isVariable) {
        result += part.content
        continue
      }
      const variable = part.content
      let [varResult, varHasValue] = ctx.getVariable(variable)

      if (!varHasValue && part.fallback) {
        varResult = part.fallback.evaluate(ctx)
      }

      if (!varHasValue && !part.fallback) {
        // No value for variable. Leave the substitution string in place in
        // case downstream clients want to handle it.
        result += '${' + part.content + '}'
      } else if (varResult.value !== undefined) {
        if (typeof varResult.value === 'string') {
          result += varResult.value
        } else {
          return EvalResult.Error([
            `String value required for substituting variable '${variable}', ` +
            `got ${GetValueTypeName(varResult.value)}.`,
          ])
        }
      } else if (varResult.errors.length > 0) {
        return EvalResult.Error(varResult.errors)
      }
      // else: empty value with no errors, treated as the empty string.
    }
    return EvalResult.Value(result)
  }
}

// variableExpressionImpl.cpp:349-371
export class VariableNode extends Node {
  constructor(readonly var_: string, readonly fallback: Node | null) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const [result, hasValue] = ctx.getVariable(this.var_)
    if (!hasValue) {
      if (this.fallback) return this.fallback.evaluate(ctx)
      return EvalResult.Error([`No value for variable '${this.var_}'`])
    }
    return result
  }
}

// ConstantNode<int64_t> / ConstantNode<bool> (variableExpressionImpl.cpp:375-389).
export class ConstantNode extends Node {
  constructor(readonly value: bigint | boolean) { super() }
  evaluate(): EvalResult { return EvalResult.Value(this.value) }
}

// variableExpressionImpl.cpp:393-399
export class NoneNode extends Node {
  evaluate(): EvalResult { return EvalResult.noValue() }
}

const scalarElementType = (v: Sdf_ExpressionValue): Sdf_ExpressionElementType | undefined =>
  typeof v === 'string' ? 'string' : typeof v === 'boolean' ? 'bool' : typeof v === 'bigint' ? 'int64' : undefined

// ListNode and _ListVisitor (variableExpressionImpl.cpp:403-470).
export class ListNode extends Node {
  constructor(readonly elements: Node[]) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    let list: Sdf_ExpressionList | undefined
    const errors: string[] = []
    for (let i = 0; i < this.elements.length; ++i) {
      const r = this.elements[i]!.evaluate(ctx)
      if (collectErrors(errors, r)) continue
      const elementType = scalarElementType(r.value)
      if (elementType !== undefined && (!list || list.elementType === elementType)) {
        list ??= new Sdf_ExpressionList(elementType, [])
        list.elements.push(r.value as Sdf_ExpressionScalar)
      } else {
        errors.push(`Unexpected value of type ${GetValueTypeName(r.value)} in list at element ${i}`)
      }
    }
    if (errors.length > 0) return EvalResult.Error(errors)
    // The expression evaluated to an empty list, but we can't put an empty
    // VtArray into the result because we don't know what type that VtArray
    // ought to be holding. So instead, we return a special object that
    // represents the empty list.
    if (!list) return EvalResult.Value(emptyList)
    return EvalResult.Value(list)
  }
}

// _FormatFunctionError (variableExpressionImpl.cpp:474-480).
const formatFunctionError = (fnName: string, err: string): string => `${fnName}: ${err}`

/** Function arity, mirroring FunctionWithNArgsNode / FunctionWithAtLeastNArgsNode. */
export interface FunctionNodeType {
  readonly functionName: string
  readonly isVariadic: boolean
  readonly numArgs: number
  create(args: Node[]): Node
}

// IfNode::_Evaluate (variableExpressionImpl.cpp:490-533).
function evaluateIf(
  ctx: EvalContext, condition: Node, ifValue: Node, elseValue: Node | null,
): EvalResult {
  const result = condition.evaluate(ctx)
  if (result.errors.length > 0) return EvalResult.Error(result.errors)
  if (typeof result.value !== 'boolean') {
    return EvalResult.Error([formatFunctionError('if', 'Condition must be a boolean value')])
  }

  // Verify that ifValue and elseValue either evaluate to the same type or one
  // or the other evaluates to None. Both branches are evaluated.
  const ifValueResult = ifValue.evaluate(ctx)
  const elseValueResult = elseValue ? elseValue.evaluate(ctx) : EvalResult.noValue()

  if (elseValue) {
    const valuesHaveDifferentTypes =
      Sdf_ExpressionValueTypeKey(ifValueResult.value) !== Sdf_ExpressionValueTypeKey(elseValueResult.value)
    const neitherValueIsNone =
      ifValueResult.value !== undefined && elseValueResult.value !== undefined
    if (valuesHaveDifferentTypes && neitherValueIsNone) {
      return EvalResult.Error([formatFunctionError('if',
        'if-value and else-value must evaluate to the same type or None.')])
    }
  }
  return result.value ? ifValueResult : elseValueResult
}

// variableExpressionImpl.cpp:535-547
export class If2Node extends Node {
  static readonly functionName = 'if'
  constructor(readonly condition: Node, readonly ifValue: Node) { super() }
  evaluate(ctx: EvalContext): EvalResult {
    return evaluateIf(ctx, this.condition, this.ifValue, null)
  }
}

// variableExpressionImpl.cpp:549-563
export class If3Node extends Node {
  static readonly functionName = 'if'
  constructor(readonly condition: Node, readonly ifValue: Node, readonly elseValue: Node) { super() }
  evaluate(ctx: EvalContext): EvalResult {
    return evaluateIf(ctx, this.condition, this.ifValue, this.elseValue)
  }
}

// std::less<std::string> orders by byte, i.e. by UTF-8 code point.
function compareStrings(x: string, y: string): number {
  const a = [...x], b = [...y]
  for (let i = 0; i < Math.min(a.length, b.length); ++i) {
    const d = a[i]!.codePointAt(0)! - b[i]!.codePointAt(0)!
    if (d !== 0) return d
  }
  return a.length - b.length
}

type Comparator = 'eq' | 'neq' | 'lt' | 'leq' | 'gt' | 'geq'

function compareScalars(fn: Comparator, x: Sdf_ExpressionScalar, y: Sdf_ExpressionScalar): boolean {
  const c = typeof x === 'string'
    ? compareStrings(x, y as string)
    : typeof x === 'boolean'
      ? Number(x) - Number(y as boolean)
      : (x < (y as bigint) ? -1 : x > (y as bigint) ? 1 : 0)
  switch (fn) {
    case 'eq': return c === 0
    case 'neq': return c !== 0
    case 'lt': return c < 0
    case 'leq': return c <= 0
    case 'gt': return c > 0
    case 'geq': return c >= 0
  }
}

// ComparisonNode and _ComparisonVisitor (variableExpressionImpl.cpp:567-675).
export class ComparisonNode extends Node {
  constructor(readonly functionName: Comparator, readonly x: Node, readonly y: Node) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const x = this.x.evaluate(ctx)
    const y = this.y.evaluate(ctx)
    const errors = combineErrors(x, y)
    if (errors.length > 0) return EvalResult.Error(errors)

    if (Sdf_ExpressionValueTypeKey(x.value) !== Sdf_ExpressionValueTypeKey(y.value)) {
      return EvalResult.Error([formatFunctionError(this.functionName,
        `Cannot compare values of type ${GetValueTypeName(x.value)} and ${GetValueTypeName(y.value)}`)])
    }

    const xv = x.value
    if (typeof xv === 'string' || typeof xv === 'boolean' || typeof xv === 'bigint') {
      return EvalResult.Value(compareScalars(this.functionName, xv, y.value as Sdf_ExpressionScalar))
    }
    // VtVisitValue dispatches None, and held types it does not know such as
    // EmptyList, to the VtValue overload (variableExpressionImpl.cpp:604-609),
    // which compares them as None: only eq and neq are supported.
    if (xv === undefined || xv instanceof SdfVariableExpressionEmptyList) {
      if (xv !== undefined) {
        TfDiagnosticMgr.GetInstance().postError(new TfError(
          "Failed verification: ' x.IsEmpty() && _y.IsEmpty() '", TfDiagnosticType.CodingError))
      }
      if (this.functionName === 'eq') return EvalResult.Value(true)
      if (this.functionName === 'neq') return EvalResult.Value(false)
      return EvalResult.Error([formatFunctionError(this.functionName,
        'Comparison operation not supported for None')])
    }
    return EvalResult.Error([formatFunctionError(this.functionName, 'Unsupported type for comparison')])
  }
}

// LogicalNode (variableExpressionImpl.cpp:679-744).
export class LogicalNode extends Node {
  constructor(readonly functionName: 'and' | 'or', readonly conditions: Node[]) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    let result: boolean | undefined
    const errors: string[] = []
    for (let i = 0; i < this.conditions.length; ++i) {
      const condition = this.conditions[i]!.evaluate(ctx)
      if (collectErrors(errors, condition)) continue
      if (typeof condition.value !== 'boolean') {
        errors.push(formatFunctionError(this.functionName,
          `Invalid type ${GetValueTypeName(condition.value)} for argument ${i}`))
        continue
      }
      const value = condition.value
      // _ShortCircuit (variableExpressionImpl.cpp:689-697)
      if (this.functionName === 'and' ? !value : value) {
        result = value
        break
      }
      result = result === undefined
        ? value
        : this.functionName === 'and' ? result && value : result || value
    }
    return errors.length === 0 ? EvalResult.Value(result) : EvalResult.Error(errors)
  }
}

// LogicalNotNode (variableExpressionImpl.cpp:748-775).
export class LogicalNotNode extends Node {
  static readonly functionName = 'not'
  constructor(readonly condition: Node) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const condition = this.condition.evaluate(ctx)
    if (condition.errors.length > 0) return EvalResult.Error(condition.errors)
    if (typeof condition.value !== 'boolean') {
      return EvalResult.Error([formatFunctionError('not',
        `Invalid type ${GetValueTypeName(condition.value)} for argument`)])
    }
    return EvalResult.Value(!condition.value)
  }
}

// ContainsNode and _ContainsVisitor (variableExpressionImpl.cpp:779-858).
export class ContainsNode extends Node {
  static readonly functionName = 'contains'
  constructor(readonly searchIn: Node, readonly searchFor: Node) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const searchIn = this.searchIn.evaluate(ctx)
    const searchFor = this.searchFor.evaluate(ctx)
    const errors = combineErrors(searchIn, searchFor)
    if (errors.length > 0) return EvalResult.Error(errors)

    const error = (err: string): EvalResult => EvalResult.Error([formatFunctionError('contains', err)])
    const v = searchIn.value, item = searchFor.value
    if (v instanceof SdfVariableExpressionEmptyList) return EvalResult.Value(false)
    if (typeof v === 'string') {
      if (typeof item !== 'string') return error('Invalid search value')
      return EvalResult.Value(v.includes(item))
    }
    if (v instanceof Sdf_ExpressionList) {
      if (scalarElementType(item) !== v.elementType) return error('Invalid search value')
      return EvalResult.Value(v.elements.includes(item as Sdf_ExpressionScalar))
    }
    return error('Value to search must be a list or string')
  }
}

// MatchesRegexNode and _MatchesRegexVisitor (variableExpressionImpl.cpp:862-961).
export class MatchesRegexNode extends Node {
  static readonly functionName = 'matches_regex'
  constructor(readonly searchIn: Node, readonly pattern: Node) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const searchIn = this.searchIn.evaluate(ctx)
    const pattern = this.pattern.evaluate(ctx)
    const errors = combineErrors(searchIn, pattern)
    if (errors.length > 0) return EvalResult.Error(errors)

    const error = (err: string): EvalResult => EvalResult.Error([formatFunctionError('matches_regex', err)])
    const v = searchIn.value
    if (v instanceof SdfVariableExpressionEmptyList) return EvalResult.Value(false)
    const strings = typeof v === 'string'
      ? [v]
      : v instanceof Sdf_ExpressionList && v.elementType === 'string' ? v.elements as string[] : undefined
    if (!strings) return error('Value to search must be string[] or string')
    if (typeof pattern.value !== 'string') return error('Pattern to match must be a string')

    const patternMatcher = new TfPatternMatcher(pattern.value, /* caseSensitive */ true)
    if (!patternMatcher.isValid()) {
      return error('Invalid match pattern: ' + patternMatcher.getInvalidReason())
    }
    return EvalResult.Value(strings.some(s => patternMatcher.match(s)))
  }
}

const utf8 = new TextEncoder()
// std::string indexes bytes. A byte that is not a whole character is kept as
// a surrogateescape code unit, as the text parser keeps undecodable bytes.
function byteAt(s: string, index: number): string {
  const b = utf8.encode(s)[index]!
  return b < 0x80 ? String.fromCharCode(b) : String.fromCharCode(0xdc00 + b)
}

// AtNode and _AtVisitor (variableExpressionImpl.cpp:965-1069).
export class AtNode extends Node {
  static readonly functionName = 'at'
  constructor(readonly source: Node, readonly index: Node) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const source = this.source.evaluate(ctx)
    const index = this.index.evaluate(ctx)
    const errors = combineErrors(source, index)
    if (errors.length > 0) return EvalResult.Error(errors)

    const error = (err: string): EvalResult => EvalResult.Error([formatFunctionError('at', err)])
    if (typeof index.value !== 'bigint') return error('Index must be an integer')

    // _NormalizeIndex, lifted from TfPyNormalizeIndex (:1034-1046).
    const normalize = (size: number): number | undefined => {
      let normalized = index.value as bigint
      if (normalized < 0n) normalized += BigInt(size)
      return normalized < 0n || normalized >= BigInt(size) ? undefined : Number(normalized)
    }
    const v = source.value
    if (typeof v === 'string') {
      const idx = normalize(utf8.encode(v).length)
      return idx === undefined ? error('Index out of range') : EvalResult.Value(byteAt(v, idx))
    }
    if (v instanceof Sdf_ExpressionList) {
      const idx = normalize(v.elements.length)
      return idx === undefined ? error('Index out of range') : EvalResult.Value(v.elements[idx])
    }
    if (v instanceof SdfVariableExpressionEmptyList) return error('Index out of range')
    return error('Only supported for lists or strings')
  }
}

// LenNode and _LenVisitor (variableExpressionImpl.cpp:1073-1141).
export class LenNode extends Node {
  static readonly functionName = 'len'
  constructor(readonly source: Node) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    const source = this.source.evaluate(ctx)
    if (source.errors.length > 0) return EvalResult.Error(source.errors)
    const v = source.value
    if (v instanceof SdfVariableExpressionEmptyList) return EvalResult.Value(0n)
    // std::string::size() counts bytes.
    if (typeof v === 'string') return EvalResult.Value(BigInt(utf8.encode(v).length))
    if (v instanceof Sdf_ExpressionList) return EvalResult.Value(BigInt(v.elements.length))
    return EvalResult.Error([formatFunctionError('len', 'Unsupported type')])
  }
}

// DefinedNode (variableExpressionImpl.cpp:1145-1184).
export class DefinedNode extends Node {
  static readonly functionName = 'defined'
  constructor(readonly nodes: Node[]) { super() }

  evaluate(ctx: EvalContext): EvalResult {
    let result: boolean | undefined
    const errors: string[] = []
    for (let i = 0; i < this.nodes.length; ++i) {
      const varName = this.nodes[i]!.evaluate(ctx)
      if (collectErrors(errors, varName)) continue
      if (typeof varName.value !== 'string') {
        errors.push(formatFunctionError('defined',
          `Invalid type ${GetValueTypeName(varName.value)} for argument ${i}`))
        continue
      }
      const isDefined = ctx.hasVariable(varName.value)
      result = (result ?? true) && isDefined
    }
    return errors.length === 0 ? EvalResult.Value(result) : EvalResult.Error(errors)
  }
}

// The function nodes the parser recognizes, in the order of
// AvailableFunctions (variableExpressionParser.cpp:268-288).
const fixed = (functionName: string, numArgs: number, create: (args: Node[]) => Node): FunctionNodeType =>
  ({ functionName, isVariadic: false, numArgs, create })
const variadic = (functionName: string, minNumArgs: number, create: (args: Node[]) => Node): FunctionNodeType =>
  ({ functionName, isVariadic: true, numArgs: minNumArgs, create })

export const Sdf_AvailableFunctions: readonly FunctionNodeType[] = [
  fixed('if', 2, ([c, v]) => new If2Node(c!, v!)),
  fixed('if', 3, ([c, v, e]) => new If3Node(c!, v!, e!)),
  fixed('eq', 2, ([x, y]) => new ComparisonNode('eq', x!, y!)),
  fixed('neq', 2, ([x, y]) => new ComparisonNode('neq', x!, y!)),
  fixed('lt', 2, ([x, y]) => new ComparisonNode('lt', x!, y!)),
  fixed('leq', 2, ([x, y]) => new ComparisonNode('leq', x!, y!)),
  fixed('gt', 2, ([x, y]) => new ComparisonNode('gt', x!, y!)),
  fixed('geq', 2, ([x, y]) => new ComparisonNode('geq', x!, y!)),
  variadic('and', 2, args => new LogicalNode('and', args)),
  variadic('or', 2, args => new LogicalNode('or', args)),
  fixed('not', 1, ([c]) => new LogicalNotNode(c!)),
  fixed('contains', 2, ([i, f]) => new ContainsNode(i!, f!)),
  fixed('matches_regex', 2, ([i, p]) => new MatchesRegexNode(i!, p!)),
  fixed('at', 2, ([s, i]) => new AtNode(s!, i!)),
  fixed('len', 1, ([s]) => new LenNode(s!)),
  variadic('defined', 1, args => new DefinedNode(args)),
]
