// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfParsing.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Expected literals are unmodified native testSdfParsing baselines, including
// all byte escapes, real UTF-8, both quote forms and backslash-newline.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeUsdQuotedString } from '../../src/quotedString.ts'
import { quoteString } from '../../src/usdaFileFormat.ts'

function literals(text: string): Map<string, { raw: string; literal: string }> {
  const values = new Map<string, { raw: string; literal: string }>()
  const declarations = /custom string (\w+) = /g
  for (const match of text.matchAll(declarations)) {
    const start = match.index! + match[0].length
    const quote = text[start]!
    const delimiter = text.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote
    const content = start + delimiter.length
    let end = content
    while (end < text.length) {
      if (text[end] === '\\') end += 2
      else if (text.startsWith(delimiter, end)) break
      else ++end
    }
    values.set(match[1]!, { raw: text.slice(content, end), literal: text.slice(start, end + delimiter.length) })
  }
  return values
}
const fixture = new URL('./fixtures/testSdfParsing.testenv/', import.meta.url)
const authored = literals(fs.readFileSync(new URL('46_weirdStringContent.usda', fixture), 'utf8'))
const native = literals(fs.readFileSync(new URL('baseline/46_weirdStringContent.usda', fixture), 'utf8'))
describe('native Sdf_EvalQuotedString and Quote', () => {
  it.each([...authored])('%s matches its native serialized literal', (name, { raw }) => {
    expect(quoteString(decodeUsdQuotedString(raw))).toBe(native.get(name)!.literal)
  })
})

const byteCases = JSON.parse(fs.readFileSync(new URL('../fixtures/quotedStrings/expected.json', import.meta.url), 'utf8')).payload as {
  cases: { name: string; raw: string; accepted: boolean; literal: string }[]
}
describe('native quoted byte escape edges', () => {
  it.each(byteCases.cases)('$name matches the native quoted literal', ({ raw, accepted, literal }) => {
    expect(accepted).toBe(true)
    expect(quoteString(decodeUsdQuotedString(raw))).toBe(literal)
  })
})
