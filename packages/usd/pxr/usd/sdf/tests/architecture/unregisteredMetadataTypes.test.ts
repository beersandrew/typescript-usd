// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textParserHelpers.cpp,
//  pxr/usd/sdf/types.h
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 stores unknown authored fields as SdfUnregisteredValue while
// retaining their parser token text (pxr/usd/sdf/types.h:486-527 and
// textParserHelpers.cpp:164-168,209-258).
import { describe, expect, it } from 'vitest'
import { dataFromParserScene } from '../../src/crateDataTypes.ts'
import fixture from '../fixtures/metadataPlugInfo/expected.json' with { type: 'json' }
import { parseUsda } from '../../src/textFileFormatParser.ts'

const native = fixture.payload.unregistered.fields

describe('USDA unregistered metadata type retention', () => {
  it('carries native unregistered bool text through the SdfData boundary', () => {
    const scene = parseUsda(`#usda 1.0
def "P" {
  double x (avar = true)
}
`)
    const parsed = scene['/P.x']!.fields.avar!
    expect(parsed.value).toBe(native.avar.raw)
    expect(parsed.valueTypeName).toBe('unregistered')

    const data = dataFromParserScene(scene)
    expect(data.get('/P.x', 'avar')).toBe(native.avar.raw)
    expect(data.getValueTypeName('/P.x', 'avar')).toBe('unregistered')
  })

  it('does not infer a type from a later JavaScript value mutation', () => {
    const scene = parseUsda(`#usda 1.0
def "P" {
  double x (note = "true")
}
`)
    const data = dataFromParserScene(scene)
    expect(data.get('/P.x', 'note')).toBe(native.note.raw)
    expect(data.getValueTypeName('/P.x', 'note')).toBe('unregistered')
    data.set('/P.x', 'note', true)
    expect(data.getValueTypeName('/P.x', 'note')).toBeUndefined()
  })
})
