// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/fastCompression.cpp,
//  pxr/base/tf/pxrLZ4/lz4.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// LZ4: Copyright (C) 2011-present, Yann Collet. BSD 2-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Round-trip + ratio tests for the real LZ4 BLOCK compressor
// (src/pxrLZ4/lz4.ts) through the TfFastCompression framing
// (src/fastCompression.ts).
//
// The compressor mirrors the format produced by OpenUSD's vendored LZ4
// (pxr/base/tf/pxrLZ4/lz4.cpp via TfFastCompression::CompressToBuffer). An LZ4
// stream is not unique — the bytes depend on the match-finder — so we assert the
// faithful bar: VALID LZ4 (real back-references) that decompresses to the exact
// input via our own faithful decoder, plus a real compression ratio on
// repetitive data (proving back-references, not the old store-only stub).

import { describe, expect, it } from 'vitest'
import { lz4Compress, lz4Decompress, _compressWithThreshold } from '../../src/fastCompression.ts'

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function roundTrip(data: Uint8Array): Uint8Array {
  return lz4Decompress(lz4Compress(data), data.length)
}

describe('lz4-compress — round-trip (real block format)', () => {
  const cases: Array<[string, Uint8Array]> = [
    ['empty', new Uint8Array(0)],
    ['single byte', new Uint8Array([42])],
    ['below MINMATCH (3 bytes)', new Uint8Array([1, 2, 3])],
    ['below MFLIMIT (11 bytes)', new Uint8Array(11).map((_, i) => i)],
    ['exactly MFLIMIT (12 bytes)', new Uint8Array(12).map((_, i) => i)],
    ['all-same (highly repetitive)', new Uint8Array(4096).fill(0x41)],
    ['short period pattern', new Uint8Array(4096).map((_, i) => i % 7)],
    ['overlapping RLE pattern (ABAB...)', new Uint8Array(2048).map((_, i) => (i % 2 ? 66 : 65))],
    ['repeated text', new TextEncoder().encode('the quick brown fox. '.repeat(400))],
  ]

  for (const [name, data] of cases) {
    it(`round-trips ${name}`, () => {
      expect(bytesEqual(roundTrip(data), data)).toBe(true)
    })
  }

  it('round-trips pseudo-random (incompressible) data', () => {
    // Deterministic LCG so the test is stable.
    const a = new Uint8Array(8192)
    let s = 0x12345678
    for (let i = 0; i < a.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      a[i] = (s >>> 24) & 0xff
    }
    expect(bytesEqual(roundTrip(a), a)).toBe(true)
  })

  it('round-trips a mix of repeated and unique regions', () => {
    const parts: number[] = []
    for (let i = 0; i < 1000; i++) parts.push(i % 3) // repetitive
    for (let i = 0; i < 1000; i++) parts.push((i * 7 + 13) & 0xff) // varied
    for (let i = 0; i < 1000; i++) parts.push(0xaa) // constant
    const data = new Uint8Array(parts)
    expect(bytesEqual(roundTrip(data), data)).toBe(true)
  })
})

describe('lz4-compress — produces real back-references (ratio)', () => {
  it('compresses a repetitive buffer far below store-only size', () => {
    const data = new Uint8Array(10000).fill(0x41)
    const comp = lz4Compress(data)
    // Store-only would be ~ data.length + small overhead. Real LZ4 must be a
    // tiny fraction of that.
    expect(comp.length).toBeLessThan(data.length / 50)
    expect(bytesEqual(lz4Decompress(comp, data.length), data)).toBe(true)
  })

  it('compresses repeated text materially', () => {
    const data = new TextEncoder().encode('USD scene description bytes. '.repeat(500))
    const comp = lz4Compress(data)
    expect(comp.length).toBeLessThan(data.length / 5)
    expect(bytesEqual(lz4Decompress(comp, data.length), data)).toBe(true)
  })

  it('leaves the first byte as numChunks=0 for single-block input', () => {
    const data = new Uint8Array(64).fill(7)
    const comp = lz4Compress(data)
    expect(comp[0]).toBe(0)
  })
})

describe('lz4-compress — chunked framing (numChunks > 0)', () => {
  // The production threshold is LZ4_MAX_INPUT_SIZE (~2 GB); _compressWithThreshold
  // drives the same chunking with a tiny threshold so the per-chunk int32-size
  // framing + the decoder's chunked branch are exercised without huge buffers.
  function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }

  it('emits numChunks > 0 and round-trips when input exceeds the threshold', () => {
    const threshold = 1000
    const data = new Uint8Array(3500).map((_, i) => (i * 31 + 7) & 0xff)
    const comp = _compressWithThreshold(data, threshold)
    // ceil(3500 / 1000) = 4 chunks (3 whole + 1 partial)
    expect(comp[0]).toBe(4)
    expect(bytesEqual(lz4Decompress(comp, data.length), data)).toBe(true)
  })

  it('round-trips an exact multiple of the threshold (no partial chunk)', () => {
    const threshold = 500
    const data = new Uint8Array(1500).fill(0x5a)
    const comp = _compressWithThreshold(data, threshold)
    expect(comp[0]).toBe(3)
    expect(bytesEqual(lz4Decompress(comp, data.length), data)).toBe(true)
  })
})
