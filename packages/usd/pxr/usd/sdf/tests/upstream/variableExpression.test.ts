// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfVariableExpression.cpp,
//  pxr/usd/sdf/testenv/testSdfVariableExpression.py
// Copyright 2023, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfVariableExpression.py
// (registered as testSdfVariableExpression). Every test method is ported.
//
// API mapping: Sdf.VariableExpression(e) is new SdfVariableExpression(e);
// bool(expr) is expr.isValid(); str(expr) is expr.getString(); the Make*
// functions return builders, converted with new SdfVariableExpression(b) as
// the Python wrapper does. Python's dict values map to JS as: str -> string,
// bool -> boolean, int -> number (an int), Vt.Int64 / Python ints beyond 2**53
// -> bigint (int64), float -> a non-integer number (double), Vt.*Array ->
// VtArray of that element type. Evaluated int64 values come back as numbers
// (bigints outside the safe-integer range), lists as arrays; py() maps the
// EmptyList value to [] as the Python wrapper does. Python-only checks of
// keyword-argument rejection have no TS counterpart and are noted inline.

import { describe, expect, it } from 'vitest'
import { Array as VtArray, ValueTypes as VtValueTypes, Value as VtValue } from 'typescript-usd/vt'
import { Layer } from '../../src/layer.ts'
import {
  SdfVariableExpression, SdfVariableExpressionEmptyList, type SdfExpressionVariables,
  type SdfVariableExpressionBuilder, type SdfVariableExpressionFunctionBuilder,
  type SdfVariableExpressionListBuilder,
} from '../../src/variableExpression.ts'

type Vars = SdfExpressionVariables
const VE = SdfVariableExpression
const py = (v: unknown): unknown => v instanceof SdfVariableExpressionEmptyList ? [] : v

const intArray = (v: number[]) => new VtArray(v, VtValueTypes.int)
const int64Array = (v: bigint[]) => new VtArray(v, VtValueTypes.int64)
const stringArray = (v: string[]) => new VtArray(v, VtValueTypes.string)
const boolArray = (v: boolean[]) => new VtArray(v, VtValueTypes.bool)
const doubleArray = (v: number[]) => new VtArray(v, VtValueTypes.double)

function assertEvaluates(e: string, exprVars: Vars, expected: unknown, expectedUsedVars?: string[]): void {
  const expr = new VE(e)
  expect(expr.isValid(), e).toBe(true)
  const result = expr.evaluate(exprVars)
  expect(result.errors, e).toEqual([])
  expect(py(result.value), e).toEqual(expected)
  if (expectedUsedVars && expectedUsedVars.length > 0) {
    expect(new Set(result.usedVariables), e).toEqual(new Set(expectedUsedVars))
  }
}

function assertEvaluationErrors(e: string, exprVars: Vars, expectedErrors: string[]): void {
  const expr = new VE(e)
  expect(expr.isValid(), e).toBe(true)
  const result = expr.evaluate(exprVars)
  expect(result.value, e).toBeNull()
  expect(result.errors.length, e).toBeGreaterThan(0)
  expect(new Set(result.errors), e).toEqual(new Set(expectedErrors))
}

function assertValid(e: string): void {
  const expr = new VE(e)
  expect(expr.isValid(), e).toBe(true)
  expect(expr.getErrors(), e).toEqual([])
}

function assertInvalid(e: string): void {
  const expr = new VE(e)
  expect(expr.isValid(), e).toBe(false)
  expect(expr.getErrors().length, e).toBeGreaterThan(0)
}

type AnyBuilder = SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder |
  SdfVariableExpressionListBuilder
function assertValidExpression(b: AnyBuilder, expectedValue: unknown, expressionVars?: Vars): void {
  const expr = new VE(b)
  assertValid(expr.getString())
  expect(py(expr.evaluate(expressionVars ?? {}).value)).toEqual(expectedValue)
}

describe('testSdfVariableExpression', () => {
  // testSdfVariableExpression.py:61-74
  it('test_AuthoringExpressionVariables', () => {
    const layer = Layer.createAnonymous()
    expect(layer.hasExpressionVariables()).toBe(false)
    expect(layer.getExpressionVariables()).toEqual({})

    const expressionVars = { str: 'Y', num: 0, b: false }
    layer.setExpressionVariables(expressionVars)
    expect(layer.hasExpressionVariables()).toBe(true)
    expect(layer.getExpressionVariables()).toEqual(expressionVars)

    layer.clearExpressionVariables()
    expect(layer.hasExpressionVariables()).toBe(false)
    expect(layer.getExpressionVariables()).toEqual({})
  })

  // :76-80
  it('test_Default', () => {
    const e = new VE()
    expect(e.isValid()).toBe(false)
    expect(e.getString()).toBe('')
    expect(e.getErrors()).toEqual(['No expression specified'])
  })

  // :82-85
  it('test_IsExpression', () => {
    expect(VE.isExpression('`foo`')).toBe(true)
    expect(VE.isExpression('foo')).toBe(false)
  })

  // :87-107
  it('test_IsValidVariableType', () => {
    const isValidVariableType = VE.isValidVariableType
    expect(isValidVariableType('string')).toBe(true)
    expect(isValidVariableType(true)).toBe(true)
    expect(isValidVariableType(null)).toBe(true)

    // Explicitly verify that both int and int64 are considered valid variable
    // types, even though the result of evaluation will always be an int64.
    expect(isValidVariableType(VtValue.create(123, VtValueTypes.int))).toBe(true)
    expect(isValidVariableType(2n ** 63n - 1n)).toBe(true)

    expect(isValidVariableType(stringArray(['a', 'b']))).toBe(true)
    expect(isValidVariableType(boolArray([true, false]))).toBe(true)
    expect(isValidVariableType(intArray([123, 456]))).toBe(true)
    expect(isValidVariableType(int64Array([123n, 456n]))).toBe(true)

    expect(isValidVariableType(1.23)).toBe(false)
    expect(isValidVariableType(doubleArray([1.23, 4.56]))).toBe(false)
  })

  // :109-161
  it('test_VarExpressions', () => {
    assertEvaluates('`${FOO}`', { FOO: 'string' }, 'string', ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: 42 }, 42, ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: true }, true, ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: null }, null, ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: stringArray(['foo', 'bar']) }, ['foo', 'bar'], ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: intArray([1, 2, 3]) }, [1, 2, 3], ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: int64Array([1n, 2n, 3n]) }, [1, 2, 3], ['FOO'])
    assertEvaluates('`${FOO}`', { FOO: boolArray([true, false]) }, [true, false], ['FOO'])

    // If no value is found for the specified var, we should get an error.
    assertEvaluationErrors('`${FOO}`', {}, ["No value for variable 'FOO'"])

    // Test invalid expressions
    assertInvalid('`${FO-O}`')
    assertInvalid('`${FOO`')
  })

  // :163-189
  it('test_VarExpressionWithFallbacks', () => {
    assertEvaluates('`${FOO:1234}`', {}, 1234, ['FOO'])
    assertEvaluates("`${FOO:'usd'}`", {}, 'usd', ['FOO'])
    assertEvaluates('`${FOO:true}`', {}, true, ['FOO'])
    // A "${" in a fallback string can be escaped to produce a literal; it is
    // not treated as a variable reference.
    assertEvaluates("`${FOO:'\\${VAR}_value'}`", {}, '${VAR}_value', ['FOO'])
  })

  // :191-213
  it('test_VarExpressionWithListFallbacks', () => {
    assertEvaluates('`${FOO:[1, 2, 3]}`', {}, [1, 2, 3], ['FOO'])
    assertEvaluates("`${FOO:['a', 'b']}`", {}, ['a', 'b'], ['FOO'])
    assertEvaluates('`${FOO:[]}`', {}, [], ['FOO'])
    assertEvaluates('`${FOO:[1, 2, 3]}`', { FOO: int64Array([4n, 5n]) }, [4, 5], ['FOO'])
  })

  // :215-235
  it('test_VarExpressionWithInvalidFallbacks', () => {
    // Fallback values only support literals, or lists of literals
    assertInvalid('`${FOO:if(true, 10, 20)}`')
    assertInvalid('`${FOO:if(${B}, 1, 0)}`')
    assertInvalid("`\"${FOO:if(true, '/shots', '/prod')}\"`")
    assertInvalid('`${FOO:${BAR}}`')
    assertInvalid('`${FOO:None}`')
    assertInvalid('`${FOO:[${BAR}, 2, 3]}`')
    assertInvalid('`${FOO:[if(true, 1, 2), 3]}`')
    assertInvalid("`${FOO:['a', None]}`")

    // Inline variable references are not allowed within a fallback string,
    assertInvalid("`${FOO:'${BAR}_x'}`")
    assertInvalid("`\"${FOO:'${BAR}_x'}\"`")
    assertInvalid("`${FOO:['a_${BAR}', 'b']}`")

    const errors = new VE("`${FOO:'${BAR}_x'}`").getErrors()
    expect(errors.some(e =>
      e.includes('Variable references are not allowed in fallback string values')), String(errors)).toBe(true)
  })

  // :237-264
  it('test_VarExpressionWithFallbacksInString', () => {
    assertEvaluates("`\"${FOO:'/shots'}/shot.usda\"`", {}, '/shots/shot.usda', ['FOO'])
    assertEvaluates("`\"${FOO:'/shots'}/shot.usda\"`", { FOO: '/prod' }, '/prod/shot.usda', ['FOO'])
    assertInvalid("`\"${FOO:'${BAR}_x'}\"`")
    assertEvaluates("`\"${FOO:'\\${BAR}_x'}\"`", {}, '${BAR}_x', ['FOO'])
    assertEvaluationErrors('`"${B:42}"`', {},
      ["String value required for substituting variable 'B', got int."])
    // A list fallback in a string context cannot be substituted
    assertEvaluationErrors('`"${B:[1, 2]}"`', {},
      ["String value required for substituting variable 'B', got list."])
  })

  // :266-343
  it('test_StringExpressions', () => {
    // Test both single- and double-quoted strings.
    assertEvaluates("`''`", {}, '', [])
    assertEvaluates('`""`', {}, '', [])
    assertEvaluates('`"basic_string"`', {}, 'basic_string', [])
    assertEvaluates("`'basic_string'`", {}, 'basic_string', [])
    assertEvaluates('`"quoted_\\"double\\"_\'single\'_test"`', {}, 'quoted_"double"_\'single\'_test', [])
    assertEvaluates("`'quoted_\"double\"_\\'single\\'_test'`", {}, 'quoted_"double"_\'single\'_test', [])
    assertEvaluates('`"string_${A}_${B}"`', { A: 'substitution', B: 'works' },
      'string_substitution_works', ['A', 'B'])
    assertEvaluates("`'string_${A}_${B}'`", { A: 'substitution', B: 'works' },
      'string_substitution_works', ['A', 'B'])
    assertEvaluates("`'string_${A}_${B}'`", {}, 'string_${A}_${B}', [])

    // 'None' is considered an empty string for substitution purposes.
    assertEvaluates("`'none_sub_${A}'`", { A: null }, 'none_sub_', ['A'])

    // Substitutions using other non-string types are disallowed.
    assertEvaluationErrors("`'bad_sub_${A}'`", { A: 0 },
      ["String value required for substituting variable 'A', got int."])
    assertEvaluationErrors("`'bad_sub_${A}'`", { A: true },
      ["String value required for substituting variable 'A', got bool."])

    // No substitutions occur here since the '$' is escaped.
    assertEvaluates('`"nosubs_\\${A}_\\${B}"`', { A: 'substitution', B: 'works' }, 'nosubs_${A}_${B}', [])
    assertEvaluates("`'nosubs_\\${A}_\\${B}'`", { A: 'substitution', B: 'works' }, 'nosubs_${A}_${B}', [])

    // Test invalid expressions
    assertInvalid('`"unescaped_"quotes"_are_bad"`')
    assertInvalid("`'unescaped_'quotes'_are_bad'`")
    assertInvalid('`"bad_var_${FOO"`')
    assertInvalid('`"bad_var_${FO-O}"`')
    assertInvalid("`'`")
    assertInvalid('`"`')
  })

  // :345-366
  it('test_IntegerExpressions', () => {
    assertEvaluates('`0`', {}, 0)
    assertEvaluates('`-1`', {}, -1)
    assertEvaluates('`1`', {}, 1)

    // Integer values within an int64's range are allowed; outside it they are
    // invalid.
    assertEvaluates(`\`${2n ** 63n - 1n}\``, {}, 2n ** 63n - 1n)
    assertInvalid(`\`${2n ** 63n}\``)
    assertEvaluates(`\`${-(2n ** 63n)}\``, {}, -(2n ** 63n))
    assertInvalid(`\`${-(2n ** 63n) - 1n}\``)

    assertInvalid('`42abc`')

    // Both int and int64 values in the expression variables dictionary are
    // accepted during evaluation.
    assertEvaluates('`${FOO}`', { FOO: VtValue.create(0, VtValueTypes.int) }, 0)
    assertEvaluates('`${FOO}`', { FOO: 2n ** 63n - 1n }, 2n ** 63n - 1n)
  })

  // :368-381
  it('test_BooleanExpressions', () => {
    assertEvaluates('`True`', {}, true)
    assertEvaluates('`true`', {}, true)
    assertEvaluates('`False`', {}, false)
    assertEvaluates('`false`', {}, false)
    for (const e of ['`Truee`', '`truee`', '`TRUE`', '`Falsee`', '`falsee`', '`FALSE`']) assertInvalid(e)
  })

  // :383-389
  it('test_NoneExpressions', () => {
    assertEvaluates('`None`', {}, null)
    assertEvaluates('`none`', {}, null)
    assertInvalid('`Nonee`')
    assertInvalid('`nonee`')
  })

  // :391-469
  it('test_Lists', () => {
    assertEvaluates('`[]`', {}, [])

    // Test list of integers.
    assertEvaluates('`[1]`', {}, [1])
    assertEvaluates('`[1, 2]`', {}, [1, 2])
    assertEvaluates('`[1, 2, 3]`', {}, [1, 2, 3])
    assertEvaluates('`[${FOO}, 2, 3]`', { FOO: 1 }, [1, 2, 3])
    assertEvaluates('`[1, ${FOO}, 3]`', { FOO: 2 }, [1, 2, 3])
    assertEvaluates('`[1, 2, ${FOO}]`', { FOO: 3 }, [1, 2, 3])

    // Test list of strings.
    assertEvaluates("`['a']`", {}, ['a'])
    assertEvaluates("`['a', 'b']`", {}, ['a', 'b'])
    assertEvaluates("`['a', 'b', 'c']`", {}, ['a', 'b', 'c'])
    assertEvaluates("`['${FOO}a', 'b', 'c']`", { FOO: 'a' }, ['aa', 'b', 'c'])
    assertEvaluates("`['a', '${FOO}b', 'c']`", { FOO: 'b' }, ['a', 'bb', 'c'])
    assertEvaluates("`['a', 'b', '${FOO}c']`", { FOO: 'c' }, ['a', 'b', 'cc'])

    // Test list of variable substitutions.
    assertEvaluates('`[${FOO}]`', { FOO: 'a' }, ['a'])
    assertEvaluates('`[${FOO}, ${BAR}]`', { FOO: 'a', BAR: 'b' }, ['a', 'b'])
    assertEvaluates('`[${FOO}, ${BAR}, ${BAZ}]`', { FOO: 'a', BAR: 'b', BAZ: 'c' }, ['a', 'b', 'c'])

    // Lists cannot contain None values.
    assertEvaluationErrors('`[None]`', {}, ['Unexpected value of type None in list at element 0'])
    assertEvaluationErrors('`[None, 2, 3]`', {}, ['Unexpected value of type None in list at element 0'])
    assertEvaluationErrors('`[1, ${FOO}, 3]`', { FOO: null },
      ['Unexpected value of type None in list at element 1'])

    // Lists cannot contain other lists.
    assertInvalid('`[[1, 2]]`')
    assertEvaluationErrors('`[${L}]`', { L: '`[]`' }, ['Unexpected value of type list in list at element 0'])
    assertEvaluationErrors('`[${L}]`', { L: intArray([1, 2]) },
      ['Unexpected value of type list in list at element 0'])

    // Lists must contain elements of the same type.
    assertEvaluationErrors("`[1, 'foo', False, ${L}]`", { L: '`[]`' }, [
      'Unexpected value of type string in list at element 1',
      'Unexpected value of type bool in list at element 2',
      'Unexpected value of type list in list at element 3',
    ])

    assertInvalid('`[`')
    assertInvalid('`[foo]`')
  })

  // :471-523
  it('test_If', () => {
    assertInvalid('`if()`')
    assertInvalid('`if(True)`')

    assertEvaluates("`if(True, 'true', 'false')`", {}, 'true')
    assertEvaluates("`if(False, 'true', 'false')`", {}, 'false')
    assertEvaluates("`if(True, 'true')`", {}, 'true')
    assertEvaluates("`if(False, 'true')`", {}, null)
    assertEvaluates('`if(${B}, 1, 0)`', { B: true }, 1)
    assertEvaluates('`if(${B}, 1, 0)`', { B: false }, 0)
    assertEvaluates('`if(${B}, ${X}, ${Y})`', { B: true, X: 1, Y: 0 }, 1)
    assertEvaluates('`if(${B}, ${X}, ${Y})`', { B: false, X: 1, Y: 0 }, 0)
    const nested = '`if(${B}, if(${X}, 1, 2), if(${Y}, 3, 4))`'
    assertEvaluates(nested, { B: true, X: true, Y: true }, 1)
    assertEvaluates(nested, { B: true, X: false, Y: true }, 2)
    assertEvaluates(nested, { B: false, X: true, Y: true }, 3)
    assertEvaluates(nested, { B: false, X: true, Y: false }, 4)

    assertEvaluationErrors("`if('non_bool', 1, 0)`", {}, ['if: Condition must be a boolean value'])
    assertEvaluationErrors('`if(${B}, 1, 0)`', { B: 'non_bool' }, ['if: Condition must be a boolean value'])

    // if and else values must be of the same type, or None.
    assertEvaluates('`if(False, 1, None)`', {}, null)
    assertEvaluates('`if(False, None, 1)`', {}, 1)
    assertEvaluationErrors("`if(False, 1, 'foo')`", {},
      ['if: if-value and else-value must evaluate to the same type or None.'])
    assertEvaluationErrors("`if(False, 'foo', 1)`", {},
      ['if: if-value and else-value must evaluate to the same type or None.'])

    // Evaluation errors from subexpressions should be reported to clients.
    assertEvaluationErrors("`if(eq(1, '1'), 1, 0)`", {}, ['eq: Cannot compare values of type int and string'])
  })

  // :525-598. Operands are given as Python literals (their str()) with the
  // value the upstream comparator lambda receives.
  it('test_Comparisons', () => {
    type Operand = [string, number | string | boolean | null]
    const lit = (v: number | string | boolean | null): Operand =>
      [v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? `'${v}'` : String(v),
        typeof v === 'string' ? `'${v}'` : v]
    const _Test = (fnName: string, comparator: (x: any, y: any) => boolean) => {
      const makeExpression = (...operands: string[]) => `\`${fnName}(${operands.join(',')})\``

      // All comparison functions take 2 arguments.
      assertInvalid(makeExpression())
      assertInvalid(makeExpression('1'))
      assertInvalid(makeExpression('1', '2', '3'))

      const testCases: [Operand, Operand][] = [
        [lit(0), lit(1)], [lit(1), lit(1)], [lit(1), lit(2)],
        [lit('a'), lit('a')], [lit('a'), lit('b')], [lit('b'), lit('c')],
        [lit(true), lit(true)], [lit(true), lit(false)], [lit(false), lit(true)],
      ]
      if (fnName === 'eq' || fnName === 'neq') testCases.push([lit(null), lit(null)])
      for (const [x, y] of testCases) {
        assertEvaluates(makeExpression(x[0], y[0]), {}, comparator(x[1], y[1]))
      }

      const errorCases: [string, string, string][] = [
        ['0', "'a'", `${fnName}: Cannot compare values of type int and string`],
        ['0', 'False', `${fnName}: Cannot compare values of type int and bool`],
        ['0', 'None', `${fnName}: Cannot compare values of type int and None`],
        ["'a'", 'False', `${fnName}: Cannot compare values of type string and bool`],
        ["'a'", 'None', `${fnName}: Cannot compare values of type string and None`],
        ['False', 'None', `${fnName}: Cannot compare values of type bool and None`],
      ]
      if (fnName !== 'eq' && fnName !== 'neq') {
        errorCases.push(['None', 'None', `${fnName}: Comparison operation not supported for None`])
      }
      for (const [x, y, err] of errorCases) {
        assertEvaluationErrors(`\`${fnName}(${x},${y})\``, {}, [err])
      }
    }
    _Test('eq', (x, y) => x === y)
    _Test('neq', (x, y) => x !== y)
    _Test('lt', (x, y) => x < y)
    _Test('leq', (x, y) => x <= y)
    _Test('gt', (x, y) => x > y)
    _Test('geq', (x, y) => x >= y)
  })

  // :600-655
  it('test_AndOr', () => {
    const _Test = (fnName: string, comparator: (l: boolean[]) => boolean) => {
      const str = (v: unknown) => v === true ? 'True' : v === false ? 'False' : String(v)
      const makeExpression = (...operands: unknown[]) => `\`${fnName}(${operands.map(str).join(',')})\``

      // "and" / "or" both require at least 2 arguments.
      assertInvalid(makeExpression())
      assertInvalid(makeExpression(true))

      const testCases = [[true, true], [true, false], [false, false], [true, true, true], [true, true, false]]
      for (const testCase of testCases) {
        assertEvaluates(makeExpression(...testCase), {}, comparator(testCase))
      }

      const expr = makeExpression(1, "'foo'", 'None')
      assertEvaluationErrors(expr, {}, [
        `${fnName}: Invalid type int for argument 0`,
        `${fnName}: Invalid type string for argument 1`,
        `${fnName}: Invalid type None for argument 2`,
      ])
      // Evaluating the above expression returns no value since none of the
      // operands were valid.
      expect(new VE(expr).evaluate({}).value).toBeNull()

      // Verify that short-circuiting works.
      if (fnName === 'and') {
        assertEvaluates(makeExpression(false, '1'), {}, false)
        assertEvaluates(makeExpression(true, false, '1'), {}, false)
      } else {
        assertEvaluates(makeExpression(true, '1'), {}, true)
        assertEvaluates(makeExpression(false, true, '1'), {}, true)
      }
    }
    _Test('and', l => l.every(Boolean))
    _Test('or', l => l.some(Boolean))
  })

  // :657-669
  it('test_Not', () => {
    assertInvalid('`not()`')
    assertInvalid('`not(True, False)`')
    assertEvaluates('`not(True)`', {}, false)
    assertEvaluates('`not(False)`', {}, true)
    assertEvaluationErrors('`not(1)`', {}, ['not: Invalid type int for argument'])
    assertEvaluationErrors("`not('foo')`", {}, ['not: Invalid type string for argument'])
    assertEvaluationErrors('`not(None)`', {}, ['not: Invalid type None for argument'])
  })

  // :671-736. The Python source strings are not raw: '\{', '\}' and '\.'
  // keep their backslashes.
  it('test_MatchesRegex', () => {
    const digits = "`matches_regex(${S}, 'shot_[[:digit:]]\\{2\\}\\.usd')`"
    assertEvaluates(digits, { S: 'shot_10.usd' }, true)
    assertEvaluates(digits, { S: 'Shot_10.usd' }, false)
    assertEvaluates("`matches_regex(${S}, 'shot_[AB]\\.usd[ac]')`", { S: 'shot_A.usdc' }, true)
    assertEvaluates("`matches_regex(${S}, 'shot_[AB]\\.usd[ac]')`", { S: 'shot_B.usda' }, true)
    assertEvaluates("`matches_regex(${S}, 'shot_[AB]\\.usd')`", { S: 'shot_C.usd' }, false)
    assertEvaluates("`matches_regex(${S}, 'shot_[A-Z]\\.usd')`", { S: 'shot_B.usd' }, true)
    assertEvaluates("`matches_regex(${S}, 'shot_[A-Z]\\.usd')`", { S: 'shot_b.usd' }, false)

    assertEvaluates("`matches_regex(${S}, 'shot_[1-9]+\\.usd?')`", { S: 'shot_17.usda' }, true)
    assertEvaluates("`matches_regex(${S}, 'shot_[1-9]+\\.usd?')`", { S: 'shot_09.usda' }, false)

    // Simulating startswith / endswith
    assertEvaluates("`matches_regex(${S}, '^shot.*')`", { S: 'shot_101_final.usd' }, true)
    assertEvaluates("`matches_regex(${S}, '.*final.usd$')`", { S: 'shot_101_final.usd' }, true)

    // Test list matching patterns
    assertEvaluates("`matches_regex([${A}, ${B}], 'layer.*')`", { A: 'shot1.usd', B: 'layer1.usd' }, true)
    assertEvaluates("`matches_regex([${A}, ${B}], 'layer.*')`", { A: 'shot1.usd', B: 'shot2.usd' }, false)

    // Test error states
    assertEvaluationErrors("`matches_regex(1, 'a')`", {},
      ['matches_regex: Value to search must be string[] or string'])
    assertEvaluationErrors("`matches_regex('shot1', 7)`", {},
      ['matches_regex: Pattern to match must be a string'])
    assertEvaluationErrors("`matches_regex(['shot1', 'shot2'], 7)`", {},
      ['matches_regex: Pattern to match must be a string'])
  })

  // :738-801
  it('test_Contains', () => {
    // Test searching in lists.
    assertEvaluates('`contains([], 1)`', {}, false)
    assertEvaluates('`contains(${L}, 1)`', { L: intArray([]) }, false)
    assertEvaluates('`contains(${L}, 1)`', { L: '`[]`' }, false)
    assertEvaluates('`contains([1, 2, 3], 1)`', {}, true)
    assertEvaluates('`contains([1, 2, 3], 0)`', {}, false)
    assertEvaluates('`contains(${L}, 1)`', { L: intArray([1, 2, 3]) }, true)
    assertEvaluates('`contains(${L}, 0)`', { L: intArray([1, 2, 3]) }, false)
    assertEvaluates('`contains([1, 2, 3], ${A})`', { A: 2 }, true)
    assertEvaluates('`contains([1, 2, 3], ${A})`', { A: 4 }, false)
    assertEvaluates("`contains([${A}, ${B}], 'a')`", { A: 'a', B: 'b' }, true)
    assertEvaluates("`contains([${A}, ${B}], 'c')`", { A: 'a', B: 'b' }, false)
    assertEvaluationErrors("`contains([1, 2, 3], 'a')`", {}, ['contains: Invalid search value'])
    assertEvaluationErrors('`contains([1, 2, 3], None)`', {}, ['contains: Invalid search value'])

    // Test searching in strings.
    assertEvaluates("`contains('', 'a')`", {}, false)
    assertEvaluates("`contains('abc', 'a')`", {}, true)
    assertEvaluates("`contains('abc', 'z')`", {}, false)
    assertEvaluates("`contains('abc', ${A})`", { A: 'a' }, true)
    assertEvaluates("`contains('abc', ${Z})`", { Z: 'z' }, false)
    assertEvaluates("`contains('${A}${B}', 'a')`", { A: 'a', B: 'b' }, true)
    assertEvaluates("`contains('${A}${B}', 'z')`", { A: 'a', B: 'b' }, false)
    assertEvaluationErrors("`contains('abcd', 1)`", {}, ['contains: Invalid search value'])
    assertEvaluationErrors("`contains('abcd', None)`", {}, ['contains: Invalid search value'])

    // Other errors
    assertInvalid("`contains('abcd')`")
    assertEvaluationErrors('`contains(1, 1)`', {}, ['contains: Value to search must be a list or string'])
    assertEvaluationErrors('`contains(None, 1)`', {}, ['contains: Value to search must be a list or string'])
  })

  // :803-848
  it('test_At', () => {
    assertEvaluates('`at([1, 2, 3], 0)`', {}, 1)
    assertEvaluates('`at([1, 2, 3], 1)`', {}, 2)
    assertEvaluates('`at([1, 2, 3], 2)`', {}, 3)
    assertEvaluates('`at([1, 2, 3], -1)`', {}, 3)
    assertEvaluates('`at([1, 2, 3], -2)`', {}, 2)
    assertEvaluates('`at([1, 2, 3], -3)`', {}, 1)
    assertEvaluationErrors('`at([1, 2, 3], 3)`', {}, ['at: Index out of range'])
    assertEvaluationErrors('`at([1, 2, 3], -4)`', {}, ['at: Index out of range'])
    assertEvaluationErrors('`at([], 0)`', {}, ['at: Index out of range'])
    assertEvaluationErrors("`at([1, 2, 3], 'foo')`", {}, ['at: Index must be an integer'])
    assertEvaluationErrors('`at([1, 2, 3], True)`', {}, ['at: Index must be an integer'])
    assertEvaluationErrors('`at([1, 2, 3], None)`', {}, ['at: Index must be an integer'])

    assertEvaluates("`at('abc', 0)`", {}, 'a')
    assertEvaluates("`at('abc', 1)`", {}, 'b')
    assertEvaluates("`at('abc', 2)`", {}, 'c')
    assertEvaluates("`at('abc', -1)`", {}, 'c')
    assertEvaluates("`at('abc', -2)`", {}, 'b')
    assertEvaluates("`at('abc', -3)`", {}, 'a')
    assertEvaluationErrors("`at('abc', 3)`", {}, ['at: Index out of range'])
    assertEvaluationErrors("`at('abc', -4)`", {}, ['at: Index out of range'])
    assertEvaluationErrors("`at('', 0)`", {}, ['at: Index out of range'])
    assertEvaluationErrors("`at('abc', 'foo')`", {}, ['at: Index must be an integer'])
    assertEvaluationErrors("`at('abc', True)`", {}, ['at: Index must be an integer'])
    assertEvaluationErrors("`at('abc', None)`", {}, ['at: Index must be an integer'])
  })

  // :850-864
  it('test_Len', () => {
    assertInvalid('`len()`')
    assertEvaluates('`len([])`', {}, 0)
    assertEvaluates('`len([1, 2, 3])`', {}, 3)
    assertEvaluates("`len('')`", {}, 0)
    assertEvaluates("`len('abc')`", {}, 3)
    assertEvaluationErrors('`len(1)`', {}, ['len: Unsupported type'])
    assertEvaluationErrors('`len(False)`', {}, ['len: Unsupported type'])
    assertEvaluationErrors('`len(None)`', {}, ['len: Unsupported type'])
  })

  // :866-880
  it('test_Defined', () => {
    assertInvalid('`defined()`')
    assertEvaluates("`defined('X')`", {}, false)
    assertEvaluates("`defined('X')`", { X: 0 }, true)
    assertEvaluates("`defined('X','Y')`", { X: 0 }, false)
    assertEvaluates("`defined('X','Y')`", { X: 0, Y: 1 }, true)
    assertEvaluationErrors('`defined(1)`', {}, ['defined: Invalid type int for argument 0'])
    assertEvaluationErrors('`defined(None)`', {}, ['defined: Invalid type None for argument 0'])
  })

  // :882-904
  it('test_NestedExpressions', () => {
    assertEvaluates('`${FOO}`', { FOO: '`${BAR}`', BAR: 'ok' }, 'ok')
    assertEvaluates('`${FOO}`', {
      FOO: "`'subexpression_${BAR}'`", BAR: "`'${BAZ}'`", BAZ: "`'works_ok'`",
    }, 'subexpression_works_ok')
    assertEvaluates("`'${A}_${B}'`", {
      A: "`'subexpression_${FOO}'`", FOO: "`'${BAR}'`", BAR: "`'works_ok'`", B: '`${A}`',
    }, 'subexpression_works_ok_subexpression_works_ok')
  })

  // :906-915
  it('test_CircularSubstitutions', () => {
    assertEvaluationErrors('`${FOO}`', { FOO: '`${BAR}`', BAR: '`${BAZ}`', BAZ: '`${FOO}`' },
      ["Encountered circular variable substitutions: ['FOO', 'BAR', 'BAZ', 'FOO']"])
  })

  // :917-923
  it('test_ErrorInNestedExpression', () => {
    assertEvaluationErrors('`${FOO}`', { FOO: "`'${BAR}'`", BAR: '`${BAZ`' },
      ["Missing ending '}' at character 6 (in variable 'BAR')"])
  })

  // :925-936
  it('test_UnsupportedVariableType', () => {
    assertEvaluationErrors('`${FOO}`', { FOO: 1.234 }, ["Variable 'FOO' has unsupported type double"])
    assertEvaluationErrors("`'test_${FOO}'`", { FOO: 1.234 }, ["Variable 'FOO' has unsupported type double"])
  })

  // :938-940
  it('test_MakeNone', () => {
    assertValidExpression(VE.makeNone(), null)
  })

  // :942-945
  it('test_MakeVariable', () => {
    assertValidExpression(VE.makeVariable('FOO'), 123, { FOO: 123 })
  })

  // :947-964
  it('test_MakeLiteral', () => {
    const _test = (value: number | boolean | string) => assertValidExpression(VE.makeLiteral(value), value)
    _test(123)
    _test(true)
    _test(false)
    _test('a string')
    _test("'single quotes'")
    _test("\\'escaped single quotes\\'")
    _test('"double quotes"')
    _test('\\"escaped double quotes\\"')
    _test('mixed \'single quotes\' and "double quotes"')
    _test('contains\nnewlines')

    expect(() => VE.makeLiteral(1.23)).toThrow(TypeError)
  })

  // :966-983
  it('test_MakeFunction', () => {
    assertValidExpression(VE.makeFunction('contains',
      VE.makeListOfLiterals([1, 2, 3]), VE.makeVariable('foo')), true, { foo: 1 })

    // Calling MakeFunction with an unknown function will create an invalid
    // expression, but the underlying expression string can still be inspected.
    const expr = new VE(VE.makeFunction('blah'))
    expect(expr.isValid()).toBe(false)
    expect(expr.getString()).toBe('`blah()`')
    // (MakeFunction(name=...) keyword-argument rejection is Python-only.)
  })

  // :985-1002
  it('test_MakeList', () => {
    assertValidExpression(VE.makeList(
      VE.makeLiteral(1), VE.makeVariable('foo'),
      VE.makeFunction('if', VE.makeLiteral(true), VE.makeLiteral(3))), [1, 2, 3], { foo: 2 })
    assertValidExpression(VE.makeList(), [])
    // (MakeList(elems=...) keyword-argument rejection is Python-only.)
  })

  // :1004-1024
  it('test_MakeListOfLiterals', () => {
    const _test = (l: (number | boolean | string)[]) => assertValidExpression(VE.makeListOfLiterals(l), l)
    _test([])
    _test([1, 2, 3])
    _test([false, true])
    _test(['a', 'b'])

    // Lists must be homogeneous and contain only bool, int, or str.
    expect(() => VE.makeListOfLiterals([1, 'a', true])).toThrow(TypeError)
    expect(() => VE.makeListOfLiterals([1.23])).toThrow(TypeError)
    // (MakeListOfLiterals(elems=...) keyword-argument rejection is Python-only.)
  })
})
