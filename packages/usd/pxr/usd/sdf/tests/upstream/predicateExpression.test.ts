// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfPredicateExpression.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/testenv/testSdfPredicateExpression.cpp (OpenUSD v26.05).
//
// SdfPredicateExpression is a standalone boolean predicate sub-language: a
// parser (string -> AST) plus an evaluator (SdfPredicateProgram) that links an
// expression against an SdfPredicateLibrary and runs it over objects.
//
// This suite is a PARTIAL port: it covers the PARSER and GetText() round-trip
// (the bulk of the upstream TestSimple GetText cases, plus TestParseErrors).
// The evaluation half -- SdfLinkPredicateExpression / SdfPredicateProgram /
// SdfPredicateLibrary -- is a separate subsystem not ported here, so the
// `test(...)` evaluation axioms in TestSimple and all of TestLinkErrors are out
// of scope (they exercise linking + running, not parsing).
//
// All expected strings below were captured from the Pixar build
// (usd-2605, Python 3.9.21) via `Sdf.PredicateExpression(<s>).GetText()`.

import { describe, expect, it } from 'vitest'
import { PredicateExpression as SdfPredicateExpression } from 'typescript-usd/sdf'

function text(s: string): string {
  return new SdfPredicateExpression(s).getText()
}

describe('testSdfPredicateExpression_Cpp / TestSimple GetText', () => {
  // Direct port of the GetText() block at the top of TestSimple().
  it('preserves precedence and parentheses', () => {
    expect(text('a and b or c')).toBe('a and b or c')
    expect(text('a or b and c')).toBe('a or b and c')
    expect(text('(a or b) and c')).toBe('(a or b) and c')
    expect(text('a and (b or c)')).toBe('a and (b or c)')
    // Redundant parens are dropped when precedence already implies them.
    expect(text('(a and b) or c')).toBe('a and b or c')
    expect(text('a or (b and c)')).toBe('a or b and c')
  })

  it('round-trips the class-documentation examples', () => {
    expect(text('foo')).toBe('foo')
    expect(text('foo bar')).toBe('foo bar')
    expect(text('foo not bar')).toBe('foo not bar')
    expect(text('color:red (shiny or matte)')).toBe('color:"red" (shiny or matte)')
    expect(text('animal or mineral or vegetable')).toBe('animal or mineral or vegetable')
    expect(text('(mammal or bird) and (tame or small)'))
      .toBe('(mammal or bird) and (tame or small)')
    expect(text('isClose(100, tolerance=3.0) or negative'))
      .toBe('isClose(100, tolerance=3) or negative')
  })

  it('round-trips repeated nots', () => {
    expect(text('not allVowels')).toBe('not allVowels')
    expect(text('not not allVowels')).toBe('not not allVowels')
    expect(text('not not not allVowels')).toBe('not not not allVowels')
  })

  it('normalizes whitespace (tabs / runs / surrounding parens)', () => {
    expect(text('foo\tbar')).toBe('foo bar')
    expect(text('foo  bar')).toBe('foo bar')
    expect(text('a and  b')).toBe('a and b')
    expect(text('not  foo')).toBe('not foo')
    expect(text('( foo )')).toBe('foo')
    expect(text('(foo)')).toBe('foo')
  })
})

describe('testSdfPredicateExpression_Cpp / call syntaxes and argument values', () => {
  it('serializes bare, colon and paren calls', () => {
    expect(text('active')).toBe('active')
    expect(text('isa:mammal,bird')).toBe('isa:"mammal","bird"')
    expect(text('matches("foo.*bar")')).toBe('matches("foo.*bar")')
    expect(text('matches:foo.bar')).toBe('matches:"foo.bar"')
  })

  it('serializes positional, keyword and mixed paren args', () => {
    expect(text('arbArgs:2,extra,arguments')).toBe('arbArgs:2,"extra","arguments"')
    expect(text('arbArgs(2, extra=123, named="foobar", arguments=456)'))
      .toBe('arbArgs(2, extra=123, named="foobar", arguments=456)')
    expect(text('isClose(1.23, tolerance=0.01)')).toBe('isClose(1.23, tolerance=0.01)')
    expect(text('f(a=1, b=2.0)')).toBe('f(a=1, b=2)')
  })

  it('serializes numeric argument values (int/double/inf/negatives)', () => {
    expect(text('f(-5)')).toBe('f(-5)')
    expect(text('f(-2.5)')).toBe('f(-2.5)')
    expect(text('f(inf)')).toBe('f(inf)')
    expect(text('f(-inf)')).toBe('f(-inf)')
    expect(text('f(1.0e3)')).toBe('f(1000)')
    expect(text('f(1.5e-3)')).toBe('f(0.0015)')
    expect(text('f(0.001)')).toBe('f(0.001)')
  })

  it('serializes booleans as 1/0 (TfStringify(bool))', () => {
    expect(text('f(true, false)')).toBe('f(1, 0)')
    expect(text('f:true')).toBe('f:1')
    expect(text('f(x=true)')).toBe('f(x=1)')
  })

  it('chooses quoting that avoids escaping (single/double/triple)', () => {
    // A string containing a double-quote but no single-quote uses single quotes.
    expect(text('contains:\'"\'')).toBe('contains:\'"\'')
    expect(text('f("quote\\"in")')).toBe('f(\'quote"in\')')
    // Apostrophe-only: keep double quotes.
    expect(text("f(\"apos'in\")")).toBe('f("apos\'in")')
    // Newlines (from escape evaluation) trigger triple quotes, raw newline kept.
    expect(text('contains:\\n')).toBe('contains:"""\n"""')
    expect(text('contains("\\n")')).toBe('contains("""\n""")')
    // Single-quoted input -> double-quoted output.
    expect(text("f('single')")).toBe('f("single")')
  })

  it('treats empty argument slots as empty-string positional args', () => {
    expect(text('foo()')).toBe('foo("")')
    expect(text('foo( )')).toBe('foo("")')
    expect(text('foo:')).toBe('foo:""')
    expect(text('foo:1,')).toBe('foo:1,""')
    expect(text('f(,)')).toBe('f("", "")')
  })

  it('allows whitespace around paren-call args and the = sign', () => {
    expect(text('f( a = 1 )')).toBe('f(a=1)')
  })
})

describe('testSdfPredicateExpression_Cpp / accepts valid syntax used by link tests', () => {
  // These come from TestLinkErrors: they all PARSE successfully (the error is
  // raised later, at link/eval time, which this partial port does not cover).
  it('parses syntactically valid expressions regardless of arity', () => {
    const cases: Array<[string, string]> = [
      ['noArgs:1', 'noArgs:1'],
      ['noArgs:1,2,3', 'noArgs:1,2,3'],
      ['noArgs(1,2,3)', 'noArgs(1, 2, 3)'],
      ['onePosArg:a,b', 'onePosArg:"a","b"'],
      ['oneKwArg(wrongName=1)', 'oneKwArg(wrongName=1)'],
      ['oneKwArg(1, kw1=1)', 'oneKwArg(1, kw1=1)'],
      ['twoKwArgs(wrongName1=1,wrongName2=2)', 'twoKwArgs(wrongName1=1, wrongName2=2)'],
      ['twoKwOneDefault(hello)', 'twoKwOneDefault("hello")'],
      ['onePosOneKw(kw1=1, kw2=2)', 'onePosOneKw(kw1=1, kw2=2)'],
    ]
    for (const [src, expected] of cases) {
      const e = new SdfPredicateExpression(src)
      expect(e.isEmpty(), `should parse: ${src}`).toBe(false)
      expect(e.getText()).toBe(expected)
    }
  })
})

describe('testSdfPredicateExpression_Cpp / TestParseErrors', () => {
  // Direct port of TestParseErrors(): every one of these must fail to parse,
  // producing the empty expression with a non-empty parse error.
  const badStrings = [
    'and',
    'and and',
    'x and',
    '',
    'or',
    'or or',
    'or b',
    'not',
    'not not',
    'a not',
    '(',
    ')',
    '((foo)',
    'bar)',
    '(baz))',
    'badCallArgs(pos1, kw=foo,pos2)',
    'badCallArgs(',
  ]

  for (const s of badStrings) {
    it(`rejects ${JSON.stringify(s)}`, () => {
      const e = new SdfPredicateExpression(s)
      expect(e.isEmpty()).toBe(true)
      expect(e.isValid).toBe(false)
      expect(e.getParseError().length).toBeGreaterThan(0)
    })
  }

  it('also rejects leading/trailing whitespace and stray spacing', () => {
    // Surrounding whitespace is not tolerated (eolf must follow PredExpr).
    for (const s of ['foo ', ' foo', '  foo  ', 'f:1 , 2', 'f : 1']) {
      const e = new SdfPredicateExpression(s)
      expect(e.isEmpty(), `should reject: ${JSON.stringify(s)}`).toBe(true)
    }
  })
})
