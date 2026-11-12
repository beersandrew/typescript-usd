// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdr/testenv/testSdrFilesystemDiscovery.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of testSdrFilesystemDiscovery.py registered discovery observables.
import { describe, expect, it } from 'vitest'
import { splitShaderIdentifier } from '../../src/index.ts'
import { discoverShaderNodes } from '../../src/discoveryPlugin.ts'

describe('testSdrFilesystemDiscovery', () => {
  it('splits upstream identifier forms', () => {
    expect(splitShaderIdentifier('Primvar')).toMatchObject({ function: 'Primvar', name: 'Primvar', version: { major: 0, minor: 0 } })
    expect(splitShaderIdentifier('Primvar_float2')).toMatchObject({ function: 'Primvar', name: 'Primvar_float2', version: { major: 0, minor: 0 } })
    expect(splitShaderIdentifier('Primvar_float2_3')).toMatchObject({ function: 'Primvar', name: 'Primvar_float2', version: { major: 3, minor: 0 } })
    expect(splitShaderIdentifier('Primvar_float_3_4')).toMatchObject({ function: 'Primvar', name: 'Primvar_float', version: { major: 3, minor: 4 } })
    expect(splitShaderIdentifier('Primvar_float2_3_nonNumber')).toBeNull()
  })
  it('walks nested files, filters extensions and deduplicates identifiers by type', () => {
    const results = discoverShaderNodes([import.meta.dirname + '/fixtures/discovery'], ['oso', 'args'])
    expect(results.map(result => `${result.identifier}.${result.discoveryType}`).sort()).toEqual(['Nested_2.args', 'Primvar_float_3_4.oso', 'Same.args', 'Same.oso'])
    expect(results.find(result => result.identifier === 'Primvar_float_3_4')?.version).toMatchObject({ major: 3, minor: 4, isDefault: true })
  })
})
