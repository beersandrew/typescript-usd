// Ported from OpenUSD 26.11.1: pxr/base/gf/timeCode.cpp,
//  pxr/usd/sdf/parserValueContext.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 capture: fixtures/usdaRecordedValues (FIXTURES.md).
// Unregistered metadata keep the parser's recorded string, which is built
// atom by atom with TfStringify (parserValueContext.cpp:16-28,129-140,
// 167-192,237-265): `[10.0,20.0]` records `[10, 20]`. Timecodes stream
// through GfTimeCode's operator<< (gf/timeCode.cpp:20-24), the double's
// default ostream form: `1.23457`, `1e+20`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/usdaRecordedValues/${name}`, import.meta.url), 'utf8')

describe('USDA recorded unregistered values and timecodes', () => {
  it('writes them as OpenUSD does', () => {
    const layer = Layer.createInMemory('recorded.usda', fixture('source.usda'))
    expect(layer.exportToString()).toBe(fixture('expected.usda'))
  })
})
