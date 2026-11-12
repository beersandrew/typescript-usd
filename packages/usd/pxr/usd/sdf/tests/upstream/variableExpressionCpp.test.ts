// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfVariableExpression.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfVariableExpression.cpp
// (registered as testSdfVariableExpression_Cpp): the expression builder API.
//
// _TestExpression compares Evaluate(exprVars).value with a VtValue. Here
// values are the JS values SdfVariableExpression.evaluate returns: an int64
// is a number, VtInt64Array / VtBoolArray / VtStringArray are arrays and
// VtValue(SdfVariableExpression::EmptyList()) is the EmptyList instance.
// VtValue(1) (an int) in a dictionary is an integer number.

import { describe, expect, it } from 'vitest'
import {
  SdfVariableExpression, SdfVariableExpressionEmptyList, type SdfExpressionVariables,
  type SdfVariableExpressionBuilder, type SdfVariableExpressionFunctionBuilder,
  type SdfVariableExpressionListBuilder,
} from '../../src/variableExpression.ts'

const VE = SdfVariableExpression
type AnyBuilder = SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder |
  SdfVariableExpressionListBuilder

// testSdfVariableExpression.cpp:17-26
function _TestExpression(
  expr: SdfVariableExpression | AnyBuilder, exprVars: SdfExpressionVariables, expectedResult: unknown,
): void {
  const e = expr instanceof SdfVariableExpression ? expr : new SdfVariableExpression(expr)
  expect(e.isValid(), e.getString()).toBe(true)
  expect(e.evaluate(exprVars).value, e.getString()).toEqual(expectedResult)
}

describe('testSdfVariableExpression_Cpp', () => {
  // :28-32
  it('_TestMakeNone', () => {
    _TestExpression(VE.makeNone(), {}, null)
  })

  // :34-65
  it('_TestMakeVariable', () => {
    _TestExpression(VE.makeVariable('FOO'), { FOO: 1 }, 1)

    // Literal fallback values
    _TestExpression(VE.makeVariable('FOO', VE.makeLiteral(1n)), {}, 1)
    _TestExpression(VE.makeVariable('FOO', VE.makeLiteral(true)), {}, true)
    _TestExpression(VE.makeVariable('FOO', VE.makeLiteral('usd')), {}, 'usd')

    // List fallback values
    _TestExpression(VE.makeVariable('FOO',
      new SdfVariableExpression(VE.makeListOfLiterals([1n, 2n, 3n]))), {}, [1, 2, 3])
    _TestExpression(VE.makeVariable('FOO',
      new SdfVariableExpression(VE.makeListOfLiterals(['a', 'b', 'c']))), {}, ['a', 'b', 'c'])
  })

  // :67-85
  it('_TestMakeLiteral', () => {
    const _test = (value: bigint | boolean | string) =>
      _TestExpression(VE.makeLiteral(value), {}, typeof value === 'bigint' ? Number(value) : value)
    _test(123n)
    _test(true)
    _test(false)
    _test('a string')
    _test("'single quotes'")
    _test("\\'escaped single quotes\\'")
    _test('"double quotes"')
    _test('\\"escaped double quotes\\"')
    _test('mixed \'single quotes\' and "double quotes"')
    _test('contains\nnewlines')
  })

  // :87-103
  it('_TestMakeFunction', () => {
    _TestExpression(VE.makeFunction('contains',
      VE.makeListOfLiterals([1n, 2n, 3n]), VE.makeVariable('foo')), { foo: 2 }, true)
    _TestExpression(VE.makeFunction('matches_regex',
      VE.makeLiteral('shot_1'), VE.makeVariable('foo')), { foo: 'shot_?' }, true)
  })

  // :105-129
  it('_TestMakeList', () => {
    _TestExpression(VE.makeList(), {}, new SdfVariableExpressionEmptyList())

    _TestExpression(VE.makeList(
      VE.makeLiteral(1n), VE.makeVariable('foo'),
      VE.makeFunction('if', VE.makeLiteral(true), VE.makeLiteral(3n))), { foo: 2 }, [1, 2, 3])

    const builder = VE.makeList()
    builder.addElement(VE.makeLiteral(1n))
    builder.addElement(VE.makeVariable('foo'))
    builder.addElement(VE.makeFunction('if', VE.makeLiteral(true), VE.makeLiteral(3n)))
    _TestExpression(builder, { foo: 2 }, [1, 2, 3])
  })

  // :131-150
  it('_TestMakeListOfLiterals', () => {
    const _test = (sourceValues: (bigint | boolean | string)[], expectedValue: unknown) => {
      _TestExpression(VE.makeListOfLiterals(sourceValues), {}, expectedValue)
      const builder = VE.makeList()
      builder.addLiteralValues(sourceValues)
      _TestExpression(builder, {}, expectedValue)
    }
    _test([], new SdfVariableExpressionEmptyList())
    _test([1n, 2n, 3n], [1, 2, 3])
    _test([true, false], [true, false])
    _test(['a', 'b'], ['a', 'b'])
  })
})
