// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/atomicOfstreamWrapper.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/atomicOfstreamWrapper.cpp; not a 1:1 program port.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TfAtomicOfstreamWrapper } from '../../src/index.ts'

describe('TfAtomicOfstreamWrapper', () => {
  it('commits over new and existing files and cancels temporaries', async () => {
    const directory = mkdtempSync('/tmp/typescript-usd-tf-')
    try {
      const target = `${directory}/target.txt`
      const fresh = new TfAtomicOfstreamWrapper(target)
      expect(await fresh.Open()).toBe(true)
      fresh.getStream().write('New Content\n')
      expect(await fresh.commit()).toBe(true)
      expect(readFileSync(target, 'utf8')).toBe('New Content\n')
      writeFileSync(target, 'Existing Content\n')
      const replace = new TfAtomicOfstreamWrapper(target)
      expect(await replace.Open()).toBe(true)
      replace.getStream().write('Replacement\n')
      expect(await replace.commit()).toBe(true)
      expect(readFileSync(target, 'utf8')).toBe('Replacement\n')
      const cancel = new TfAtomicOfstreamWrapper(`${directory}/cancel.txt`)
      expect(await cancel.Open()).toBe(true)
      expect(await cancel.cancel()).toBe(true)
      expect(readdirSync(directory)).toEqual(['target.txt'])
    } finally { rmSync(directory, { recursive: true }) }
  })
  it('rejects empty and unopened operations', async () => {
    const wrapper = new TfAtomicOfstreamWrapper('')
    expect(await wrapper.Open()).toBe(false)
    expect(await wrapper.commit()).toBe(false)
    expect(await wrapper.cancel()).toBe(false)
  })
})
