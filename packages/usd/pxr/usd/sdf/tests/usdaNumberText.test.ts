// Ported from OpenUSD 26.11.1: pxr/base/tf/stringUtils.cpp,
//  pxr/usd/sdf/fileIO_Common.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 capture: fixtures/usdaNumberText (FIXTURES.md).
// The text writer formats numbers with TfStringify (fileIO_Common.cpp:588,
// 1009-1016,1150): the shortest round-trip digits through Tf's
// double-conversion settings (tf/stringUtils.cpp:917-1015), single precision
// for float values (also inside dictionaries), ostream %g for halfs.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/usdaNumberText/${name}`, import.meta.url), 'utf8')

describe('USDA number text', () => {
  it('writes floats, doubles, halfs, dictionary values, offsets and times as OpenUSD does', () => {
    const layer = Layer.createInMemory('numbers.usda', fixture('source.usda'))
    expect(layer.exportToString()).toBe(fixture('expected.usda'))
  })
})
