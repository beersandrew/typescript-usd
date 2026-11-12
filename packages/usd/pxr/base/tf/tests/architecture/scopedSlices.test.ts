// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/scoped.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial explicit-lifetime slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/scoped.cpp; not 1:1 registered-program ports.
import { describe, expect, it } from 'vitest'
import { TfScoped, TfScopedAutoVar } from '../../src/index.ts'

describe('TfScoped', () => {
  it('runs cleanup at the explicit lifetime boundary', () => {
    const state = { value: true }
    const scope = new TfScoped(() => { state.value = false })
    expect(state.value).toBe(true)
    scope.dispose()
    expect(state.value).toBe(false)
  })
  it('restores scoped variables', () => {
    const state = { value: 5 }
    const scope = new TfScopedAutoVar(state, 8)
    expect(state.value).toBe(8)
    scope.dispose()
    expect(state.value).toBe(5)
  })
})
