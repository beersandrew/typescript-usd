// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pathExpression.cpp,
//  pxr/usd/sdf/textParserHelpers.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 capture: fixtures/usdaPathExpressionDefaults (FIXTURES.md).
// _SetDefault (textParserHelpers.cpp:110-130) makes pathExpression defaults
// and pathExpression[] default elements absolute against the owning prim;
// SdfPathExpression parsing normalizes the text (pathExpression.cpp:73-83)
// and MakeAbsolute leaves the empty expression empty (:377-388).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/usdaPathExpressionDefaults/${name}`, import.meta.url), 'utf8')

describe('pathExpression defaults read from USDA', () => {
  it('are anchored to the owning prim as OpenUSD anchors them', () => {
    const layer = Layer.createInMemory('pathExpressions.usda', fixture('source.usda'))
    expect(layer.exportToString()).toBe(fixture('expected.usda'))
  })
})
