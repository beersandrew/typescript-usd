// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/stringUtils.cpp,
//  pxr/base/tf/testenv/testTfStringUtils.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/base/tf/testenv/stringUtils.cpp (testTf registration
// TfStringUtils: TestPreds DictLessThan
// axioms) and testTfStringUtils.py (DictionaryStrcmp cases). The comparator is
// what the USDA writer uses to order a prim's properties, so these pin the
// case-insensitive / numeric-aware / underscore-first ordering exactly.

import { describe, it, expect } from 'vitest'
import {
  dictionaryLessThan,
  dictionaryStrcmp,
  stringSplit,
  isValidIdentifier,
  makeValidIdentifier,
  stringToLong,
  stringToULong,
  TF_LONG_MAX,
  TF_LONG_MIN,
  TF_ULONG_MAX,
  TfEscapeString,
  TfGetXmlEscapedString,
  TfMatchedStringTokenize,
  TfQuotedStringTokenize,
  TfStringCapitalize,
  TfStringCatPaths,
  TfStringContains,
  TfStringEndsWith,
  TfStringGetBeforeSuffix,
  TfStringGetCommonPrefix,
  TfStringGetSuffix,
  TfStringJoin,
  TfStringReplace,
  TfStringStartsWith,
  TfStringToLower,
  TfStringToLowerAscii,
  TfStringToUpper,
  TfStringTokenize,
  TfStringTokenizeToSet,
  TfStringTrim,
  TfStringTrimLeft,
  TfStringTrimRight,
} from '../../src/stringUtils.ts'

describe('TfStringUtils — dictionaryLessThan TestPreds axioms', () => {
  const less: [string, string][] = [
    ['ring', 'robot'],
    ['aardvark', 'Alex'],
    ['Alex', 'AMD'],
    ['1', '15'],
    ['1998', '1999'],
    ['Worker8', 'Worker11'],
    ['agent007', 'agent222'],
    ['agent007', 'agent0007'],
    ['agent7', 'agent07'],
    ['0', '00'],
    ['1', '01'],
    ['foo001bar001abc', 'foo001bar002abc'],
    ['foo001bar01abc', 'foo001bar001abc'],
    ['foo00001bar0002abc', 'foo001bar002xyz'],
    ['foo1bar02', 'foo01bar2'],
    ['agent007', 'agent8'],
    ['goto7', 'GOTO8'],
    ['!', '$'],
    ['aa', 'aaa'],
    ['0a', '00A'],
    ['000a', '0000a'],
    ['foo_bar', 'foobar'],
    ['_foobar', 'foobar'],
    ['__foobar', '_foobar'],
    ['Foo_Bar', 'FooBar'],
    ['_FooBar', 'FooBar'],
    ['__FooBar', '_FooBar'],
    ['abc012300', 'abc000012300'],
    ['0345678987654321234567', '03456789876543212345670'],
    ['0345678987654321234567', '0345678987654322234567'],
    ['XXX_0345678987654321234567', 'XXX_03456789876543212345670'],
    ['XXX_0345678987654321234567', 'XXX_0345678987654322234567'],
  ]

  it.each(less)('%s < %s', (a, b) => {
    expect(dictionaryLessThan(a, b)).toBe(true)
    expect(dictionaryLessThan(b, a)).toBe(false)
  })

  const notLess: [string, string][] = [
    ['robot', 'ring'],
    ['Alex', 'aardvark'],
    ['AMD', 'Alex'],
    ['15', '1'],
    ['1999', '1998'],
    ['Worker11', 'Worker8'],
    ['agent222', 'agent007'],
    ['2', '01'],
    ['foo001bar002abc', 'foo001bar001abc'],
    ['foo00001bar0002xyz', 'foo001bar002abc'],
    ['GOTO8', 'goto7'],
    ['$', '!'],
    ['aaa', 'aa'],
    ['00A', '0a'],
    ['0000a', '000a'],
    ['abc0000123000', 'abc0123000'],
    ['foobar', 'foo_bar'],
    ['foobar', '_foobar'],
    ['_foobar', '__foobar'],
    ['primvars:curveHierarchy__id', 'primvars:curveHierarchy:id'],
  ]

  it.each(notLess)('!(%s < %s)', (a, b) => {
    expect(dictionaryLessThan(a, b)).toBe(false)
  })

  it('equal strings are not less', () => {
    expect(dictionaryLessThan('foo', 'foo')).toBe(false)
    expect(dictionaryLessThan('agent07', 'agent07')).toBe(false)
  })
})

describe('dictionaryStrcmp — testTfStringUtils.py cases', () => {
  it('orders plain words', () => {
    expect(dictionaryStrcmp('apple', 'banana')).toBe(-1)
    expect(dictionaryStrcmp('banana', 'apple')).toBe(1)
    expect(dictionaryStrcmp('foo', 'foo')).toBe(0)
  })

  it('orders by non-ASCII byte sequence (U+393A < U+393B < U+393C)', () => {
    expect(dictionaryStrcmp('apple㤻', 'apple㤼')).toBe(-1)
    expect(dictionaryStrcmp('apple㤻', 'apple㤺')).toBe(1)
    expect(dictionaryStrcmp('apple㤻', 'apple㤻')).toBe(0)
  })

  it('a digit word-prefix sorts before a non-digit one', () => {
    // 'aü' > 'a0': '0' is a digit so its word prefix is less.
    expect(dictionaryStrcmp('aü', 'a0')).toBe(1)
  })
})

// Ported from testTfStringUtils.py::test_StringSplit. Golden outputs captured
// from the OpenUSD v26.08 source and reference build (Tf.StringSplit).
describe('stringSplit — testTfStringUtils.py test_StringSplit', () => {
  it('empty src or empty separator returns []', () => {
    expect(stringSplit('', '')).toEqual([])
    expect(stringSplit('abcd', '')).toEqual([])
    expect(stringSplit('', 'ccc')).toEqual([])
  })

  it('splits like the upstream C++ (keeps empty leading/middle fields)', () => {
    // Pixar build: Tf.StringSplit('abcd','a') == ['', 'bcd'] etc.
    expect(stringSplit('abcd', 'a')).toEqual(['', 'bcd'])
    expect(stringSplit('abcd', 'b')).toEqual(['a', 'cd'])
    expect(stringSplit('abcd', 'c')).toEqual(['ab', 'd'])
    expect(stringSplit('abcd', 'd')).toEqual(['abc', ''])
    expect(stringSplit('abcd', 'abcd')).toEqual(['', ''])
    expect(stringSplit('abcd', 'ab')).toEqual(['', 'cd'])
  })

  it('splits on a multi-char separator', () => {
    expect(stringSplit('a:+b:+c:+d', ':+')).toEqual(['a', 'b', 'c', 'd'])
    expect(stringSplit('a:+b:+c:d', ':+')).toEqual(['a', 'b', 'c:d'])
  })

  it('test_Unicode: splits unicode strings', () => {
    expect(stringSplit('123', '2')).toEqual(['1', '3'])
  })
})

// Ported from testTfStringUtils.py::test_Identifiers. Goldens captured from the
// Pixar build (Tf.IsValidIdentifier / Tf.MakeValidIdentifier).
describe('isValidIdentifier / makeValidIdentifier — test_Identifiers', () => {
  it('isValidIdentifier', () => {
    expect(isValidIdentifier('')).toBe(false)
    expect(isValidIdentifier('hello9')).toBe(true)
    expect(isValidIdentifier('9hello')).toBe(false)
    expect(isValidIdentifier('hello_world')).toBe(true)
    expect(isValidIdentifier('HELLO_WORLD')).toBe(true)
    expect(isValidIdentifier('hello_world_1234')).toBe(true)
    expect(isValidIdentifier('hello_#world#_1234')).toBe(false)
    expect(isValidIdentifier('h e l l o')).toBe(false)
  })

  it('makeValidIdentifier', () => {
    expect(makeValidIdentifier('')).toBe('_')
    expect(makeValidIdentifier('hello9')).toBe('hello9')
    expect(makeValidIdentifier('9hello')).toBe('_hello')
    expect(makeValidIdentifier('hello_#world#_1234')).toBe('hello__world__1234')
    expect(makeValidIdentifier('h e l l o')).toBe('h_e_l_l_o')
    expect(makeValidIdentifier('!@#$%')).toBe('_____')
  })
})

// Ported from testTfStringUtils.py::test_StringToLong. The exhaustive 1M-element
// loops are sampled (the upstream identity contract repr(v)->v is the same at
// every step); the extrema and over/underflow ValueError cases are exact.
// Goldens for the bounds captured from the OpenUSD v26.08 reference build
// (Tf._GetLongMax/_GetLongMin/_GetULongMax).
describe('stringToLong / stringToULong — test_StringToLong', () => {
  it('the 64-bit extrema match the Pixar build', () => {
    expect(TF_LONG_MAX).toBe(9223372036854775807n)
    expect(TF_LONG_MIN).toBe(-9223372036854775808n)
    expect(TF_ULONG_MAX).toBe(18446744073709551615n)
  })

  it('round-trips a sampled range of valid values (repr(v) -> v)', () => {
    for (let i = 0n; i < 1_000_000n; i += 9337n) {
      expect(stringToULong(i.toString())).toBe(i)
    }
    for (let i = -500_000n; i < 500_000n; i += 9337n) {
      expect(stringToLong(i.toString())).toBe(i)
    }
  })

  it('round-trips the extrema and one before', () => {
    for (const n of [TF_ULONG_MAX - 1n, TF_ULONG_MAX]) {
      expect(stringToULong(n.toString())).toBe(n)
    }
    for (const n of [TF_LONG_MIN, TF_LONG_MIN + 1n, TF_LONG_MAX - 1n, TF_LONG_MAX]) {
      expect(stringToLong(n.toString())).toBe(n)
    }
  })

  it('throws beyond the extrema (over/underflow)', () => {
    for (let i = 1n; i < 1000n; i += 137n) {
      expect(() => stringToULong((TF_ULONG_MAX + i).toString())).toThrow()
      expect(() => stringToLong((TF_LONG_MAX + i).toString())).toThrow()
      expect(() => stringToLong((TF_LONG_MIN - i).toString())).toThrow()
    }
  })
})

// Ported from OpenUSD v26.08 pxr/base/tf/testenv/stringUtils.cpp
// TestStrings and TestTokens.
describe('public Tf string utilities — TestStrings and TestTokens', () => {
  it('pins case, predicate, suffix, prefix, and replacement behavior', () => {
    expect(TfStringToLower('LOWer@123')).toBe('lower@123')
    expect(TfStringToUpper('UPPer@123')).toBe('UPPER@123')
    expect(TfStringCapitalize('aLREADY')).toBe('ALREADY')
    expect(TfStringToLower('ΠΙΞΑΡ')).toBe('ΠΙΞΑΡ')
    expect(TfStringToUpper('π')).toBe('π')
    expect(TfStringToLowerAscii('ΠΙΞΑΡ ≈ PIXAR')).toBe('ΠΙΞΑΡ ≈ pixar')
    expect(TfStringContains('abcdef', 'cde')).toBe(true)
    expect(TfStringStartsWith('abcdef', 'abc')).toBe(true)
    expect(TfStringEndsWith('abcdef', 'def')).toBe(true)
    expect(TfStringGetSuffix('A@B@C', '@')).toBe('C')
    expect(TfStringGetSuffix('nothing', ' ')).toBe('')
    expect(TfStringGetBeforeSuffix('A@B@C', '@')).toBe('A@B')
    expect(TfStringGetBeforeSuffix('nothing', ' ')).toBe('nothing')
    expect(TfStringGetCommonPrefix('abracadabra', 'abracababra')).toBe('abraca')
    expect(TfStringReplace('12121', '21', '31')).toBe('13131')
    expect(TfStringReplace('aaaa', 'aa', 'b')).toBe('bb')
  })

  it('pins whitespace defaults for join, tokenizers, and trims', () => {
    expect(TfStringJoin(['to', 'be', 'tokens'])).toBe('to be tokens')
    expect(TfStringJoin(new Set(['to', 'be', 'tokens']))).toBe('be to tokens')
    expect(TfStringTokenize(' to\tbe\ntokens ')).toEqual(['to', 'be', 'tokens'])
    expect([...TfStringTokenizeToSet(' to\tbe\nto ')]).toEqual(['be', 'to'])
    expect(TfQuotedStringTokenize(' "there are" "two tokens" ')).toEqual([
      'there are',
      'two tokens',
    ])
    expect(TfQuotedStringTokenize('"a \\"b\\" c" d')).toEqual([
      'a "b" c',
      'd',
    ])
    expect(TfQuotedStringTokenize('`backtick token`')).toEqual([
      'backtick token',
    ])
    expect(TfStringTrimLeft(' to be trimmed ')).toBe('to be trimmed ')
    expect(TfStringTrimRight(' to be trimmed ')).toBe(' to be trimmed')
    expect(TfStringTrim('_to be trimmed ', '_ ')).toBe('to be trimmed')
  })

  it('pins matched tokens, escape decoding, and XML escaping', () => {
    expect(TfMatchedStringTokenize(
      '{and} {more{nested{braces}}}',
      '{',
      '}',
    )).toEqual(['and', 'more{nested{braces}}'])
    expect(TfMatchedStringTokenize('{bad', '{', '}')).toEqual([])
    expect(TfMatchedStringTokenize('bad}', '{', '}')).toEqual([])
    expect(TfEscapeString('two\\nnew\\nlines')).toBe('two\nnew\nlines')
    expect(TfGetXmlEscapedString('<a x="1">&</a>')).toBe(
      '&lt;a x=&quot;1&quot;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('normalizes concatenated paths, including an empty prefix', () => {
    expect(TfStringCatPaths('foo/crud', '../bar')).toBe('foo/bar')
    expect(TfStringCatPaths('foo', '../../bar')).toBe('../bar')
    expect(TfStringCatPaths('/foo', '../bar')).toBe('/bar')
    expect(TfStringCatPaths('', 'bar')).toBe('/bar')
  })
})
