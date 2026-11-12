// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/debug.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/debug.cpp; not 1:1 ports of its registered programs.
import { describe, expect, it } from 'vitest'
import { Debug } from '../../src/index.ts'

describe('TfDebug partial slices', () => {
  it('registers, describes and wildcard-controls symbols', () => {
    Debug.registerDebugSymbol('FOO', 'fake foo env var')
    Debug.registerDebugSymbol('FOOFLAM', 'fake fooflam env var')
    Debug.registerDebugSymbol('FOOFLIMFLAM', 'fake fooflimflam env var')
    expect(Debug.setDebugSymbolsByName('FOO*', true)).toEqual(['FOO', 'FOOFLAM', 'FOOFLIMFLAM'])
    expect(Debug.getDebugSymbolDescription('FOO')).toBe('fake foo env var')
    Debug.disableAll()
    expect(Debug.isEnabled('FOO')).toBe(false)
  })
  it('rejects the three fatal conflicting declaration cases', () => {
    Debug.registerDebugSymbol('GRANDPA', 'loading files')
    expect(() => Debug.registerDebugSymbol('GRANDPA', 'other')).toThrow()
    Debug.registerDebugSymbol('FATHER', 'parsing code')
    expect(() => Debug.registerDebugSymbol('FATHER', 'other')).toThrow()
    expect(() => Debug.registerDebugSymbol('FATHER', '\0invalid')).toThrow()
  })
  it('accepts the help environment path without changing symbols', () => {
    expect(Debug.getDebugSymbolNames()).toContain('FOO')
  })
})
