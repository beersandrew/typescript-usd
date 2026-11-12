// Ported from OpenUSD 26.11.1: pxr/usd/sdr/testenv/testSdrVersion.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdr/testenv/testSdrVersion.py.
import { describe, expect, it } from 'vitest'
import { Version as SdrVersion } from '../../src/index.ts'

describe('testSdrVersion', () => {
  it('preserves validity, defaults, ordering, strings and suffixes', () => {
    const invalid = new SdrVersion()
    expect(invalid.isValid()).toBe(false)
    expect(invalid.getAsDefault()).toMatchObject({ major: 0, minor: 0, isDefault: true })
    expect(invalid.toString()).toBe('<invalid version>')
    const one = new SdrVersion(1)
    const defaultOne = new SdrVersion(1, 0).getAsDefault()
    const oneOne = new SdrVersion(1, 1)
    const two = new SdrVersion('2.0')
    expect([one.toString(), defaultOne.toString(), oneOne.toString(), two.toString()]).toEqual(['1', '1', '1.1', '2'])
    expect([one.getStringSuffix(), defaultOne.getStringSuffix(), oneOne.getStringSuffix(), two.getStringSuffix()]).toEqual(['_1', '', '_1.1', '_2'])
    expect(one.equals(defaultOne)).toBe(true)
    expect(one.compare(oneOne)).toBeLessThan(0)
    expect(oneOne.compare(two)).toBeLessThan(0)
  })
})
