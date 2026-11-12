// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceHash.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceHash.cpp. The
// compile-time static_asserts (testTraceHash.cpp:13-15) have no TypeScript
// counterpart; the runtime assertions (:17-23) are ported directly.

import { describe, expect, it } from 'vitest'
import { TraceStringHash } from '../../src/index.ts'

describe('testTraceHash', () => {
  it('matches the runtime hash values', () => {
    // testTraceHash.cpp:20-21
    expect(TraceStringHash.Hash('Test')).toBe(0x7c885313)
    expect(TraceStringHash.Hash('')).toBe(5381)
  })
})
