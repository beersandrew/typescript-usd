// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfParsing.py,
//  pxr/usd/sdf/textFileFormatParser.h
// Copyright 2017, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// List-op statements in USDA prim bodies and metadata, against native
// captures in ./fixtures/textListOps (FIXTURES.md). A list-op keyword before
// a property starts a relationship target list op or an attribute
// connection list op; any other 'reorder' is a child or property order
// statement (textFileFormatParser.h:1492-1521). The variantSets name list
// needs at least one string (textFileFormatParser.h:736-746, 1374-1385).
// A "bad" case must fail to read with an error, as testSdfParsing.py's
// _bad_ files must (:255-264).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

interface Case { text: string; exported?: string; errors?: string[] }

const cases = (JSON.parse(readFileSync(
  new URL('./fixtures/textListOps/expected.json', import.meta.url), 'utf8',
)).payload as Record<string, Case>)

function runCase(name: string, c: Case) {
  if (c.errors) {
    expect(() => Layer.createInMemory(`${name}.usda`, c.text)).toThrow(Error)
  } else {
    expect(Layer.createInMemory(`${name}.usda`, c.text).exportToString()).toBe(c.exported)
  }
}

describe('USDA list-op statements', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(name, () => runCase(name, c))
  }
})
