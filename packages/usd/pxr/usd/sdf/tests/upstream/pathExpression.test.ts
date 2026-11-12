// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPathExpression.cpp,
//  pxr/usd/sdf/testenv/testSdfPathExpression.py,
//  pxr/usd/sdf/testenv/testSdfPathExpressionArray.py
// Copyright 2023, 2024, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfPathExpression.py,
// testSdfPathExpression.cpp and testSdfPathExpressionArray.py at v26.05.
// Registered programs: testSdfPathExpression, testSdfPathExpression_Cpp,
// testSdfPathExpressionArray.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PathExpression as SdfPathExpression, PathPattern as SdfPathPattern, PredicateFunctionResult as SdfPredicateFunctionResult,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'

const noPredicates = () => SdfPredicateFunctionResult.makeVarying(false)
const match = (expression: string, path: string) =>
  new SdfPathExpression(expression).match(SdfPath.fromString(path), noPredicates).value
const matchBasic = (text: string, pathText: string) => {
  const expression = new SdfPathExpression(text)
  const path = SdfPath.fromString(pathText)
  return expression.match(path, (index, prefix) =>
    expression.evalPredicate(index, call => {
      const value = call.funcName === 'isPrimPath' ? prefix.isPrimPath()
        : call.funcName === 'isPropertyPath' ? prefix.isPropertyPath()
          : call.funcName === 'capital' ? /^[A-Z]/.test(prefix.name) : false
      return SdfPredicateFunctionResult.makeVarying(value)
    }))
}

describe('testSdfPathExpression / set algebra', () => {
  it('matches union, implied union, intersection, difference and complement', () => {
    expect(match('/a + /b', '/a')).toBe(true)
    expect(match('/a /b', '/b')).toBe(true)
    expect(match('// & ~/a//', '/b/c')).toBe(true)
    expect(match('// & ~/a//', '/a/c')).toBe(false)
    expect(match('// - /a//', '/a/c')).toBe(false)
  })

  it('reports reference and absolute properties pinned by the native oracle', () => {
    const weaker = new SdfPathExpression('%_')
    expect(weaker.containsExpressionReferences()).toBe(true)
    expect(weaker.containsWeakerExpressionReference()).toBe(true)
    expect(weaker.isAbsolute()).toBe(true)
    expect(new SdfPathExpression('.//Foo').isAbsolute()).toBe(false)
  })

  it('anchors, replaces prefixes and composes the weaker expression', () => {
    expect(new SdfPathExpression('child .//desc')
      .makeAbsolute(SdfPath.fromString('/Root')).getText())
      .toBe('/Root/child /Root//desc')
    expect(new SdfPathExpression('/Root/a + /Other')
      .replacePrefix(SdfPath.fromString('/Root'), SdfPath.fromString('/New')).getText())
      .toContain('/New/a')
    expect(new SdfPathExpression('/strong + %_')
      .composeOver(new SdfPathExpression('/weak')).getText())
      .toContain('/weak')
  })

  it('resolves relative parent paths and named expression references', () => {
    const absolute = new SdfPathExpression('foo ../bar baz//qux')
      .makeAbsolute(SdfPath.fromString('/World/test'))
    expect(absolute.getText()).toBe(
      '/World/test/foo /World/bar /World/test/baz//qux')
    expect(absolute.isComplete()).toBe(true)

    const resolved = new SdfPathExpression('/a %_ %:foo - %:bar')
      .resolveReferences(reference => reference.name === '_' ? new SdfPathExpression('/weaker')
        : reference.name === 'foo' ? new SdfPathExpression('/foo//')
          : reference.name === 'bar' ? new SdfPathExpression('/foo/bar//')
            : SdfPathExpression.Nothing())
    expect(resolved.containsExpressionReferences()).toBe(false)
    expect(resolved.isComplete()).toBe(true)
    expect(resolved.match(SdfPath.fromString('/foo/child'), noPredicates).value).toBe(true)
    expect(resolved.match(SdfPath.fromString('/foo/bar/baz'), noPredicates).value).toBe(false)
  })

  it('propagates predicate-result constancy exactly', () => {
    const cFalse = SdfPredicateFunctionResult.makeConstant(false)
    const cTrue = SdfPredicateFunctionResult.makeConstant(true)
    const vFalse = SdfPredicateFunctionResult.makeVarying(false)
    const vTrue = SdfPredicateFunctionResult.makeVarying(true)
    expect(SdfPredicateFunctionResult.and(cFalse, vTrue)).toEqual(cFalse)
    expect(SdfPredicateFunctionResult.and(cTrue, vFalse)).toEqual(vFalse)
    expect(SdfPredicateFunctionResult.or(cTrue, vFalse)).toEqual(cTrue)
    expect(SdfPredicateFunctionResult.or(cFalse, vTrue)).toEqual(vTrue)
  })
})

describe('testSdfPathExpression_Cpp / patterns', () => {
  it('matches glob, stretch and property patterns', () => {
    expect(match('/World//Mesh*', '/World/Group/Mesh01')).toBe(true)
    expect(match('/World/*.size', '/World/Cube.size')).toBe(true)
    expect(match('/World/?', '/World/A')).toBe(true)
  })

  it('evaluates predicates on ordinary and stretch components', () => {
    expect(matchBasic('/foo*//bar{isPrimPath}', '/foo/x/bar').value).toBe(true)
    expect(matchBasic('/foo*//bar{isPrimPath}', '/foo/x/bar.attr').value).toBe(false)
    expect(matchBasic('/foo*//bar//{isPrimPath}', '/foo/bar').value).toBe(true)
    expect(matchBasic('/a//{isPropertyPath} - /a/b.c', '/a/b.ns:c').value).toBe(true)
    expect(matchBasic('/a//{isPropertyPath} - /a/b.c', '/a/b.c').value).toBe(false)
  })

  it('reports constant failures when a literal prefix cannot recover', () => {
    const expression = new SdfPathExpression('/prefix/path//')
    expect(expression.match(SdfPath.fromString('/prefix'), noPredicates))
      .toEqual(SdfPredicateFunctionResult.makeVarying(false))
    expect(expression.match(SdfPath.fromString('/prefix/path'), noPredicates))
      .toEqual(SdfPredicateFunctionResult.makeConstant(true))
    expect(expression.match(SdfPath.fromString('/prefix/wrong'), noPredicates))
      .toEqual(SdfPredicateFunctionResult.makeConstant(false))
  })

  it('Everything, EveryDescendant, Nothing and MakeOp obey the native identity matrix', () => {
    expect(SdfPathExpression.everything().getText()).toBe('//')
    expect(SdfPathExpression.everyDescendant().getText()).toBe('.//')
    expect(SdfPathExpression.Nothing().isEmpty()).toBe(true)

    // Captured from the v26.05 Python oracle. These are the canonicalizations
    // in pathExpression.cpp:151-180, including Difference's A & ~B rewrite.
    const N = SdfPathExpression.Nothing()
    const E = SdfPathExpression.everything()
    const text = (
      op: 'impliedUnion' | 'union' | 'intersection' | 'difference',
      left: SdfPathExpression,
      right: SdfPathExpression,
    ) => SdfPathExpression.makeOp(op, left, right).getText()

    for (const op of ['impliedUnion', 'union'] as const) {
      expect([
        text(op, N, N), text(op, N, E), text(op, E, N), text(op, E, E),
      ]).toEqual(['', '//', '//', '//'])
    }
    expect([
      text('intersection', N, N), text('intersection', N, E),
      text('intersection', E, N), text('intersection', E, E),
    ]).toEqual(['', '', '', '//'])
    expect([
      text('difference', N, N), text('difference', N, E),
      text('difference', E, N), text('difference', E, E),
    ]).toEqual(['', '', '//', ''])

    expect(SdfPathExpression.makeComplement(N).getText()).toBe('//')
    expect(SdfPathExpression.makeComplement(E).getText()).toBe('')
    expect(SdfPathExpression.makeComplement(
      SdfPathExpression.makeComplement(new SdfPathExpression('/a')),
    ).getText()).toBe('/a')
  })
})

describe('SdfPathExpressionEval match constancy', () => {
  // Native results from Sdf._MakeBasicMatchEval, captured by
  // ./fixtures/pathExpressionConstancy (FIXTURES.md).
  const fixture = JSON.parse(readFileSync(
    new URL('./fixtures/pathExpressionConstancy/expected.json', import.meta.url), 'utf8',
  )).payload as { paths: string[]; results: Record<string, string[]> }
  for (const [expression, expected] of Object.entries(fixture.results)) {
    it(`matches ${expression} with native value and constancy`, () => {
      const actual = fixture.paths.map(path => {
        const result = matchBasic(expression, path)
        return (result.value ? 'T' : 'F') + (result.constant ? 'c' : 'v')
      })
      expect(actual).toEqual(expected)
    })
  }
})

describe('SdfPathExpression glob bracket classes', () => {
  // Native parse and match results from
  // ./fixtures/pathExpressionBrackets (FIXTURES.md), covering the bracket
  // class cases of testSdfPathExpression.cpp:230-255 and :1116. A class
  // holds identifier characters and '!', '-', '?', '*'
  // (pathPatternParser.h:43-52); a leading '!' negates and 'a-p' is a
  // range (globPattern.cpp:230-271).
  const fixture = JSON.parse(readFileSync(
    new URL('./fixtures/pathExpressionBrackets/expected.json', import.meta.url), 'utf8',
  )).payload as {
    paths: string[]
    results: Record<string, { text?: string; matches?: string[]; errors?: string[] }>
  }
  for (const [text, native] of Object.entries(fixture.results)) {
    if (native.errors) {
      it(`rejects ${text}`, () => {
        const expression = new SdfPathExpression(text)
        expect(expression.isEmpty()).toBe(true)
        const error = expression.getParseError()
        expect(error).not.toBe('')
        if (native.errors![0]!.includes("expected ']' to close bracket class")) {
          expect(error).toBe("expected ']' to close bracket class")
        }
      })
      continue
    }
    it(`parses and matches ${text}`, () => {
      expect(new SdfPathExpression(text).getText()).toBe(native.text)
      const actual = fixture.paths.map(path => {
        const result = matchBasic(text, path)
        return (result.value ? 'T' : 'F') + (result.constant ? 'c' : 'v')
      })
      expect(actual).toEqual(native.matches)
    })
  }
})

describe('testSdfPathExpressionArray', () => {
  it('retains independent expression identity in arrays', () => {
    const expressions = ['/a', '/b + /c', '%_'].map(text => new SdfPathExpression(text))
    expect(expressions.map(expression => expression.getText())).toEqual(['/a', '/b + /c', '%_'])
  })
})

describe('testSdfPathExpression / PathPattern', () => {
  it('builds and removes stretch, child and property components', () => {
    const pattern = new SdfPathPattern()
    expect(pattern.isEmpty()).toBe(true)
    expect(pattern.hasTrailingStretch()).toBe(false)
    expect(pattern.getPrefix().isEmpty()).toBe(true)
    pattern.appendChild('')
    expect(pattern.getText()).toBe('.//')
    expect(pattern.hasTrailingStretch()).toBe(true)
    expect(pattern.getPrefix().pathString).toBe('.')

    pattern.setPrefix(SdfPath.absoluteRootPath)
    expect(pattern.getText()).toBe('//')
    expect(pattern.hasLeadingStretch()).toBe(true)
    pattern.removeTrailingStretch()
    expect(pattern.getText()).toBe('/')

    pattern.appendChild('foo').appendChild('bar').appendChild('baz')
    expect(pattern.getPrefix().pathString).toBe('/foo/bar/baz')
    pattern.appendStretchIfPossible().appendProperty('prop')
    expect(pattern.getText()).toBe('/foo/bar/baz//*.prop')
    expect(pattern.isProperty()).toBe(true)
    expect(pattern.canAppendChild('child')).toBe(false)
    pattern.removeTrailingComponent()
    expect(pattern.getText()).toBe('/foo/bar/baz//*')
    pattern.removeTrailingComponent()
    expect(pattern.getText()).toBe('/foo/bar/baz//')
    pattern.removeTrailingComponent()
    expect(pattern.getText()).toBe('/foo/bar/baz')
  })
})
