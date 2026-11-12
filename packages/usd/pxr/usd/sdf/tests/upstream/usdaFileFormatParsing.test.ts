// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfUsdaFileFormatParsing.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfUsdaFileFormatParsing.cpp
// (registered as testSdfUsdaFileFormatParsing): the whole-layer groups.
//
// Upstream parses each expression against one PEGTL grammar rule
// (DoParse<must<Rule, eof>>). The TS parser is recursive descent with no
// rule-level entry points, so the capture of fixtures/usdaFileFormatParsing
// (FIXTURES.md) embeds each expression in a layer where that rule occurs and
// records whether the pinned native SdfLayer::ImportFromString parses that
// layer.
// TestLayer and TestSplines expressions are whole layers already, so their
// native result must also agree with upstream's valid/invalid lists. The
// rule-level groups (digits, identifiers, strings, asset/path refs, tuple,
// list and dictionary values, attribute/relationship metadata and specs)
// have no faithful whole-layer embedding and are not ported.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

interface Case {
  function: string
  vector: string
  index: number
  rule: string
  upstreamValid: boolean
  layer: string
  nativeParses: boolean
}

const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/usdaFileFormatParsing/expected.json', import.meta.url), 'utf8'))
const cases = fixture.payload.cases as Case[]

function tsParses(text: string): boolean {
  const layer = Layer.createAnonymous('.usda')
  try {
    return layer.importFromString(text)
  } catch {
    return false
  }
}

describe('testSdfUsdaFileFormatParsing', () => {
  it('whole-layer expressions agree with upstream valid/invalid lists natively', () => {
    for (const c of cases.filter(c => c.rule === 'LayerSpec')) {
      expect(c.nativeParses, `${c.function} ${c.vector}[${c.index}]`).toBe(c.upstreamValid)
    }
  })

  it.each(cases.map(c => [`${c.function} ${c.vector}[${c.index}] (${c.rule})`, c] as const))(
    '%s', (_name, c) => {
      expect(tsParses(c.layer)).toBe(c.nativeParses)
    })
})
