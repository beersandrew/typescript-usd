// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/registryManager.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/registryManager.cpp; not a 1:1 program port.
import { describe, expect, it } from 'vitest'
import { TfRegistryManager, TfSingleton } from '../../src/index.ts'

describe('TfRegistryManager', () => {
  it('runs registrations on first subscription and manages singleton lifetime', () => {
    const values = new Map<string, number>()
    TfRegistryManager.add('registry-test', () => values.set('one', 1))
    TfRegistryManager.add('registry-test', () => values.set('two', 2))
    TfRegistryManager.GetInstance().subscribeTo('registry-test')
    expect([...values]).toEqual([['one', 1], ['two', 2]])
    const singleton = new TfSingleton(() => ({ value: 3 }))
    expect(singleton.GetInstance().value).toBe(3)
    expect(singleton.currentlyExists()).toBe(true)
    singleton.deleteInstance()
    expect(singleton.currentlyExists()).toBe(false)
  })
})
