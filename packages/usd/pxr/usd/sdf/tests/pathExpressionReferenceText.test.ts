// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pathExpression.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/pathExpressionReferenceText (FIXTURES.md).
// SdfPathExpression::GetText writes an expression reference as "%", its
// path, then "_" for the weaker reference or ":" and its name
// (pathExpression.cpp:507-510): a same-prim reference keeps the colon, `%:b`.
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { PathExpression } from 'typescript-usd/sdf'
import { SdfPath as Path } from 'typescript-usd/sdf/path'
import { Stage } from 'typescript-usd/usd'
import expectedFixture from './fixtures/pathExpressionReferenceText/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
const fixture = fileURLToPath(new URL('./fixtures/pathExpressionReferenceText/', import.meta.url))

describe('Path expression reference text', () => {
  for (const [stronger, weaker, text] of expected.composeOver as [string, string, string][]) {
    it(`ComposeOver('${stronger}', '${weaker}')`, () => {
      expect(new PathExpression(stronger).composeOver(new PathExpression(weaker)).getText()).toBe(text)
    })
  }

  for (const [path, name, text] of expected.makeAtom as [string, string, string][]) {
    it(`MakeAtom(<${path}>, '${name}')`, () => {
      const atom = { path: path ? Path.fromString(path) : Path.emptyPath, name }
      expect(PathExpression.makeAtom(atom).getText()).toBe(text)
    })
  }

  for (const [text, oldPrefix, newPrefix, result] of expected.replacePrefix as [string, string, string, string][]) {
    it(`ReplacePrefix('${text}', <${oldPrefix}>, <${newPrefix}>)`, () => {
      expect(new PathExpression(text).replacePrefix(Path.fromString(oldPrefix), Path.fromString(newPrefix))
        .getText()).toBe(result)
    })
  }

  it('Stage.flatten writes a same-prim collection reference with its colon', async () => {
    const stage = (await Stage.open(fixture + 'collections.usda'))!
    try {
      expect(stage.flatten(false).exportToString()).toBe(expected.flattened)
    } finally {
      stage.dispose()
    }
  })
})
