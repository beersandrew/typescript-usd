// Ported from OpenUSD 26.11.1: pxr/usd/sdr/testenv/testSdrParseValue.cpp,
//  pxr/usd/sdr/testenv/testSdrShaderMetadata.cpp
// Copyright 2025, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports testSdrShaderMetadata.cpp and testSdrParseValue.cpp.
import { describe, expect, it } from 'vitest'
import { ShaderNodeMetadata as SdrShaderNodeMetadata, ShaderProperty as SdrShaderProperty, parseSdfValue } from '../../src/index.ts'

describe('testSdrShaderMetadata', () => {
  it('owns typed label, open-pages and domain items', () => {
    const metadata = new SdrShaderNodeMetadata()
    expect(metadata.getDomain()).toBe('rendering')
    metadata.setItem('label', '')
    expect(metadata.hasLabel()).toBe(true)
    metadata.clearLabel()
    expect(metadata.hasLabel()).toBe(false)
    metadata.setItem('openPages', ['foo', 'bar'])
    expect(metadata.getOpenPages()).toEqual(['foo', 'bar'])
    metadata.clearItem('domain')
    expect(metadata.hasDomain()).toBe(false)
  })
})

describe('testSdrParseValue', () => {
  it('parses scalar and fixed-size values and reports malformed values', () => {
    const scalar = new SdrShaderProperty('name', 'Int', 5, false)
    expect(parseSdfValue('3', scalar)).toEqual({ value: 3, error: '' })
    expect(parseSdfValue('huh 3,', scalar).error).not.toBe('')
    const tuple = new SdrShaderProperty('name', 'Int', [0, 0], false, 2)
    expect(parseSdfValue('3, 2', tuple)).toEqual({ value: [3, 2], error: '' })
    expect(parseSdfValue('(3, 2)', tuple).error).not.toBe('')
    expect(parseSdfValue('3', tuple).error).not.toBe('')
  })
  it('preserves strings, terminals and asset identifiers', () => {
    expect(parseSdfValue('\tsome "string" stuff', new SdrShaderProperty('s', 'String', '', false)).value).toBe('\tsome "string" stuff')
    expect(parseSdfValue('3, 2', new SdrShaderProperty('t', 'Terminal', '', false)).value).toBe('3, 2')
    const asset = new SdrShaderProperty('a', 'String', '', false, 0, { __SDR__isAssetIdentifier: '1' })
    expect(parseSdfValue('@/some/path@', asset).value).toBe('@/some/path@')
    expect(parseSdfValue('how/about/relative/paths', asset).value).toBe('how/about/relative/paths')
    expect(parseSdfValue('/@some/@path', asset).value).toBe('/@some/@path')
    expect(parseSdfValue('', asset).value).toBe('')
  })
})

describe('testSdrShownIfConversion', () => {
  it('converts recursive conditionalVis and preserves authored shownIf', () => {
    const simple = new SdrShaderProperty('input1', 'Float', 0, false, 0, { conditionalVisOp: 'greaterThanOrEqualTo', conditionalVisPath: '../../numOps', conditionalVisValue: '1' })
    const recursive = new SdrShaderProperty('input2', 'Float', 0, false, 0, { conditionalVisOp: 'and', conditionalVisLeft: 'conditionalVis1', conditionalVisRight: 'conditionalVis2', conditionalVis1Op: 'greaterThanOrEqualTo', conditionalVis1Path: '../../numOps', conditionalVis1Value: '2', conditionalVis2Op: 'lessThan', conditionalVis2Path: '../../input1', conditionalVis2Value: '10' })
    expect(simple.getShownIf()).toBe('numOps >= 1')
    expect(recursive.getShownIf()).toBe('numOps >= 2 && input1 < 10')
    expect(new SdrShaderProperty('input1', 'Float', 0, false, 0, { shownIf: '(numOps >= 1)' }).getShownIf()).toBe('(numOps >= 1)')
  })
})
