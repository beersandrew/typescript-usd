// Ported from OpenUSD 26.11.1: pxr/base/tf/stringUtils.cpp,
//  pxr/usd/sdf/fileIO_Common.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 capture: fixtures/weightMetadataText (FIXTURES.md).
// UsdSkel registers `weight` as float attribute metadata
// (usdSkel/plugInfo.json), so the text writer streams its value with
// TfStringify(float) (fileIO_Common.cpp:1150, tf/stringUtils.cpp:933-960).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import 'typescript-usd/usdSkel'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/weightMetadataText/${name}`, import.meta.url), 'utf8')

describe('UsdSkel weight metadata text', () => {
  it('writes the float as OpenUSD does', () => {
    const layer = Layer.createInMemory('weights.usda', fixture('source.usda'))
    expect(layer.exportToString()).toBe(fixture('expected.usda'))
  })
})
