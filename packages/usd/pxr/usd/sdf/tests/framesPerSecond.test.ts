// Ported from OpenUSD 26.11.1: pxr/usd/sdf/schema.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native OpenUSD 26.11.1 capture; sdf/schema.cpp:345-353,776-777.
import { describe, it, expect } from 'vitest'
import { Layer, Schema } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/framesPerSecond/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

describe('native framesPerSecond field validation', () => {
  for (const row of expected.parsing) it(`parses ${row.literal} with the native outcome`, () => {
    if (!row.accepted) {
      expect(() => Layer.createInMemory('fps.usda', row.text)).toThrow('framesPerSecond')
    } else {
      const layer = Layer.createInMemory('fps.usda', row.text)
      expect(layer.getField('/', 'framesPerSecond')).toBe(row.value === 'inf' ? Infinity : row.value)
    }
  })
  for (const row of expected.setters) it(`preserves native direct authoring of ${row.value}`, () => {
    const layer = Layer.createInMemory('set-fps.usda', '#usda 1.0\n')
    layer.setField('/', 'framesPerSecond', row.value)
    expect(layer.getField('/', 'framesPerSecond')).toBe(row.stored)
  })
  it('preserves the layer when importing invalid FPS fails', () => {
    const layer = Layer.createInMemory('existing-fps.usda', '#usda 1.0\n( framesPerSecond = 30 )\ndef Xform "Before" {}\n')
    expect(() => layer.importFromString(expected.parsing[0]!.text)).toThrow('framesPerSecond')
    expect(layer.getField('/', 'framesPerSecond')).toBe(expected.failedImport.framesPerSecond)
    expect(layer.getField('/', 'primChildren')).toEqual(expected.failedImport.primNames)
  })
  it('exposes the registered field validator without changing other fields', () => {
    const schema = Schema.getInstance()
    expect(schema.getFieldDefinition('framesPerSecond')!.isValidValue(0).getWhyNot()).toBe('Value must be greater than 0')
    expect(schema.getFieldDefinition('framesPerSecond')!.isValidValue('24').getWhyNot()).toBe('Expected value of type double')
    expect(schema.getFieldDefinition('framesPerSecond')!.isValidValue(Infinity).isAllowed()).toBe(true)
    expect(schema.getFieldDefinition('timeCodesPerSecond')!.isValidValue(0).isAllowed()).toBe(true)
  })
})
