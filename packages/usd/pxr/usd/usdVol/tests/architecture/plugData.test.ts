// Portions ported from OpenUSD 26.11.1, including: pxr/base/plug/info.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The registered usdVol plugin data is the verbatim OpenUSD v26.11.1
// pxr/usd/usdVol/{plugInfo.json,generatedSchema.usda} kept in ../../plugin/.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatedSchemaUsda, plugInfo } from '../../src/plugin/plugData.ts'

const plugin = (name: string) => readFileSync(new URL(`../../plugin/${name}`, import.meta.url), 'utf8')

describe('usdVol plugin data', () => {
  it('registers the vendored generatedSchema.usda byte for byte', () => {
    expect(generatedSchemaUsda).toBe(plugin('generatedSchema.usda'))
  })
  it('registers the vendored plugInfo.json (plug/info.cpp strips # comment lines)', () => {
    const json = plugin('plugInfo.json').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
    expect(plugInfo).toEqual(JSON.parse(json))
  })
})
