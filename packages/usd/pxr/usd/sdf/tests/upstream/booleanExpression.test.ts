// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfBooleanExpression.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/testenv/testSdfBooleanExpression.cpp (OpenUSD v26.05).
//
// SdfBooleanExpression has NO Python binding upstream, so the goldens here are
// transcribed verbatim from the C++ testenv (the sanctioned unbound-C++ oracle
// pattern): the testValidExpression / testInvalidExpression / testRenaming /
// testAllOps / testVariableCoercion / testConstruction cases, with the exact
// expected values from the .cpp -- never hand-derived.

import { describe, expect, it } from 'vitest'
import {
  BooleanExpression as SdfBooleanExpression,
  BooleanExpressionBinaryOperator as BinOp,
  BooleanExpressionUnaryOperator as UnOp,
  BooleanExprValue as SdfBooleanExprValue,
} from 'typescript-usd/sdf'

type Vars = Record<string, SdfBooleanExprValue>

function callbackFor(vars: Vars) {
  return (name: string): SdfBooleanExprValue | undefined =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined
}

// Mirrors testExpression(): parse must succeed, the constructed expression must
// not be empty, and Evaluate must produce expectedValue.
function expectValid(str: string, vars: Vars, expected: boolean): void {
  expect(SdfBooleanExpression.validate(str)).toBe(true)
  const expr = new SdfBooleanExpression(str)
  expect(expr.isEmpty()).toBe(false)
  expect(expr.evaluate(callbackFor(vars))).toBe(expected)
}

// Mirrors testInvalidExpression(): parse must fail and the expression must be
// empty.
function expectInvalid(str: string, vars: Vars): void {
  expect(SdfBooleanExpression.validate(str)).toBe(false)
  const expr = new SdfBooleanExpression(str)
  expect(expr.isEmpty()).toBe(true)
  expect(expr.evaluate(callbackFor(vars))).toBe(false)
}

// Direct port of the main() variable dictionary.
const vars: Vars = {
  someInt: 3,
  anotherInt: 4,
  someDouble: 42.0,
  someString: 'test',
  someToken: 'testToken',
}

describe('SdfBooleanExpression / int variables', () => {
  it('evaluates the six comparison operators', () => {
    expectValid('someInt == 3', vars, true)
    expectValid('someInt == 2', vars, false)
    expectValid('someInt != 3', vars, false)
    expectValid('someInt != 2', vars, true)
    expectValid('someInt > 2', vars, true)
    expectValid('someInt >= 2', vars, true)
    expectValid('someInt < 2', vars, false)
    expectValid('someInt <= 2', vars, false)
  })
})

describe('SdfBooleanExpression / double variables', () => {
  it('evaluates the six comparison operators', () => {
    expectValid('someDouble == 42.0', vars, true)
    expectValid('someDouble == 41.0', vars, false)
    expectValid('someDouble != 42.0', vars, false)
    expectValid('someDouble != 41.0', vars, true)
    expectValid('someDouble > 42', vars, false)
    expectValid('someDouble >= 42', vars, true)
    expectValid('someDouble < 42', vars, false)
    expectValid('someDouble <= 42', vars, true)
  })
})

describe('SdfBooleanExpression / string variables', () => {
  it('evaluates equality against string literals', () => {
    expectValid("someString == 'test'", vars, true)
    expectValid("someString == 'foo'", vars, false)
    expectValid("someString != 'test'", vars, false)
    expectValid("someString != 'foo'", vars, true)
  })
})

describe('SdfBooleanExpression / token variables', () => {
  it('evaluates equality against string literals', () => {
    expectValid("someToken == 'testToken'", vars, true)
    expectValid("someToken == 'foo'", vars, false)
    expectValid("someToken != 'testToken'", vars, false)
    expectValid("someToken != 'foo'", vars, true)
  })
})

describe('SdfBooleanExpression / structural cases', () => {
  it('compares two variables', () => {
    expectValid('someInt <= anotherInt', vars, true)
  })

  it('honors parenthesis and complement', () => {
    expectValid('(someInt <= anotherInt)', vars, true)
    expectValid('!(someInt <= anotherInt)', vars, false)
  })

  it('evaluates boolean constants', () => {
    expectValid('true', vars, true)
    expectValid('false', vars, false)
  })

  it('evaluates boolean combinations', () => {
    expectValid('someInt == 3 && someDouble == 42.0', vars, true)
    expectValid('someInt == 3 || someDouble == 42.0', vars, true)
    expectValid(
      '(someInt == 3 || someDouble == 2.0) &&' +
        '(someInt == 2 || someDouble == 42.0)',
      vars,
      true,
    )
  })

  it('reports parse errors', () => {
    expectInvalid('someInt =< 3', vars)
  })
})

describe('SdfBooleanExpression / renaming', () => {
  // testRenaming(): prefix each variable name with "inputs:" via JoinIdentifier.
  function renamed(str: string): string {
    const transform = (name: string): string => `inputs:${name}`
    return new SdfBooleanExpression(str).renameVariables(transform).getText()
  }

  it('renames variables and re-serializes', () => {
    expect(renamed("foo == 3 && bar == 'baz'")).toBe(
      'inputs:foo == 3 && inputs:bar == "baz"')
    expect(renamed('!foo && bar')).toBe('!inputs:foo && inputs:bar')
  })
})

describe('SdfBooleanExpression / testAllOps', () => {
  // For each variable, applying the six comparison operators against the
  // variable's own value yields exactly three true and three false results,
  // because each operator has a mirror that produces the opposite value.
  const nonStringVars: Vars = {
    someInt: 3,
    anotherInt: 4,
    someDouble: 42.0,
    someBool: true,
  }
  const operators = ['==', '!=', '>', '<', '>=', '<=']

  for (const [variable, value] of Object.entries(nonStringVars)) {
    it(`yields 3 true / 3 false for ${variable}`, () => {
      let trueCount = 0
      let falseCount = 0
      const literal = typeof value === 'boolean' ? String(value) : `${value}`
      for (const op of operators) {
        const str = `${variable} ${op} ${literal}`
        const expr = new SdfBooleanExpression(str)
        expect(expr.isEmpty()).toBe(false)
        if (expr.evaluate(callbackFor(nonStringVars))) {
          trueCount++
        } else {
          falseCount++
        }
      }
      expect(trueCount).toBe(3)
      expect(falseCount).toBe(3)
    })
  }
})

describe('SdfBooleanExpression / testVariableCoercion', () => {
  const coercionVars: Vars = {
    foo: true,
    bar: false,
    int0: 0,
    int1: 1,
  }

  it('casts variables to booleans', () => {
    expectValid('foo', coercionVars, true)
    expectValid('bar', coercionVars, false)
    expectValid('int1', coercionVars, true)
    expectValid('int0', coercionVars, false)
  })

  it('complements the result of a cast', () => {
    expectValid('!foo', coercionVars, false)
    expectValid('!bar', coercionVars, true)
    expectValid('!int1', coercionVars, false)
    expectValid('!int0', coercionVars, true)
  })

  it('applies boolean ops to casted variables', () => {
    expectValid('!foo || bar', coercionVars, false)
    expectValid('foo && !bar', coercionVars, true)
  })
})

describe('SdfBooleanExpression / testConstruction', () => {
  it('builds expressions programmatically and serializes them', () => {
    // foo
    const variable = SdfBooleanExpression.makeVariable('foo')
    expect(variable.getText()).toBe('foo')

    // foo == "bar"
    const constant = SdfBooleanExpression.makeConstant('bar')
    const comparison = SdfBooleanExpression.makeBinaryOp(
      variable, BinOp.EqualTo, constant)
    expect(comparison.getText()).toBe('foo == "bar"')

    // foo == "bar" || foo == "bar"
    const or = SdfBooleanExpression.makeBinaryOp(comparison, BinOp.Or, comparison)
    expect(or.getText()).toBe('foo == "bar" || foo == "bar"')

    // (foo == "bar" || foo == "bar") && (foo == "bar" || foo == "bar")
    const and = SdfBooleanExpression.makeBinaryOp(or, BinOp.And, or)
    expect(and.getText()).toBe(
      '(foo == "bar" || foo == "bar") && (foo == "bar" || foo == "bar")')

    // !(foo == "bar")
    const not1 = SdfBooleanExpression.makeUnaryOp(comparison, UnOp.Not)
    expect(not1.getText()).toBe('!(foo == "bar")')

    // !(foo == "bar" || foo == "bar")
    const not2 = SdfBooleanExpression.makeUnaryOp(or, UnOp.Not)
    expect(not2.getText()).toBe('!(foo == "bar" || foo == "bar")')

    // foo == '"quotes\nand\tnewlines"'
    const constant2 = SdfBooleanExpression.makeConstant('"quotes\nand\tnewlines"')
    const escaped = SdfBooleanExpression.makeBinaryOp(
      variable, BinOp.EqualTo, constant2)
    expect(escaped.getText()).toBe(`foo == '"quotes\\nand\\tnewlines"'`)
  })

  it('exposes the nested operator-enum aliases', () => {
    expect(SdfBooleanExpression.BinaryOperator.EqualTo).toBe(BinOp.EqualTo)
    expect(SdfBooleanExpression.UnaryOperator.Not).toBe(UnOp.Not)
  })
})
