// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfUsdaFileFormatValueParsing.cpp,
//  pxr/usd/sdf/textParserUtils.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfUsdaFileFormatValueParsing.cpp
// (OpenUSD 26.11.1). Sdf_ParseValueFromString (textParserUtils.h) parses one
// typed value from a string; an empty VtValue (undefined here) reports a
// failure. CheckParsedValue compares with VtValue equality (:17-32): an int
// is a number, a GfVec3f a Vec3f and a VtArray<TfToken> a VtArray whose value
// type is token[].
import { describe, expect, it } from 'vitest'
import { Vec3f } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import { sdfParseValueFromString } from '../../src/textParserUtils.ts'
import { sdfValueTypeNameOfValue } from '../../src/parserHelpers.ts'

function checkInvalid(input: string, typeName: string) {
  expect(sdfParseValueFromString(input, typeName), `${typeName} from '${input}'`).toBeUndefined()
}

function expectTokenArray(value: unknown, expected: string[], input: string) {
  expect(value, input).toBeInstanceOf(VtArray)
  const array = value as VtArray<unknown>
  expect(sdfValueTypeNameOfValue(array)).toBe('token[]')
  expect(array.toArray()).toEqual(expected)
}

describe('testSdfUsdaFileFormatValueParsing', () => {
  // TestInts (:50-71).
  it('TestInts', () => {
    const exprValueMap: [string, number][] = [['0', 0], ['12345', 12345], ['-12345', -12345]]
    for (const [input, expected] of exprValueMap) {
      expect(sdfParseValueFromString(input, 'int'), input).toBe(expected)
    }
    for (const input of ['foo', ' 3', '!!']) checkInvalid(input, 'int')
  })

  // TestTuples (:73-93).
  it('TestTuples', () => {
    const exprValueMap: [string, Vec3f][] = [
      ['(0, 1, 2)', new Vec3f(0, 1, 2)],
      ['(4.5, 1.0, 8.0)', new Vec3f(4.5, 1.0, 8.0)],
    ]
    for (const [input, expected] of exprValueMap) {
      const value = sdfParseValueFromString(input, 'float3')
      expect(value, input).toBeInstanceOf(Vec3f)
      expect((value as Vec3f).equals(expected), input).toBe(true)
    }
    for (const input of [
      '(3.0, 2.0)', // Three values expected
      '[1.0, 2.0, 3.0]', // List syntax
      '(1.0, 2.0, 3.0, 4.0)', // Too many values
    ]) checkInvalid(input, 'float3')
  })

  // TestLists (:95-117).
  it('TestLists', () => {
    const exprValueMap: [string, string[]][] = [
      ['[]', []],
      ["['0']", ['0']],
      ["['foo', 'bar', 'baz']", ['foo', 'bar', 'baz']],
    ]
    for (const [input, expected] of exprValueMap) {
      expectTokenArray(sdfParseValueFromString(input, 'token[]'), expected, input)
    }
    for (const input of [
      '[3.0]', // Quotes expected
      "'foo'", // No square brackets
      "('1', '2', '3')", // Tuple syntax
    ]) checkInvalid(input, 'token[]')
  })
})
