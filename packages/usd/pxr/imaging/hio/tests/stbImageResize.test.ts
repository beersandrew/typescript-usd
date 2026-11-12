// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Expected pixels captured from the stb_image_resize2 copy OpenUSD 26.11.1's
// Hio_StbImage compiles (pxr/imaging/hio/stbImage.cpp:227-254,501-530); see
// fixtures/stbImageResize.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  STBIR_RGBA,
  stbir_resize_float_linear,
  stbir_resize_uint8_linear,
  stbir_resize_uint8_srgb,
} from '../src/stbImageResize.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

interface Blob { offset: number, length: number, sha256: string }
interface Case {
  name: string
  fn: 'uint8_srgb' | 'uint8_linear' | 'float_linear'
  source: string
  channels: number
  inW: number
  inH: number
  outW: number
  outH: number
  input: Blob
  output: Blob
}

const root = new URL('./fixtures/stbImageResize/', import.meta.url)
const fixture = readOracleFixture(new URL('expected.json', root)) as { cases: Case[] }
const pixels = inflateSync(readFileSync(new URL('pixels.zlib', root)))
const bytes = (blob: Blob): Uint8Array => new Uint8Array(pixels.buffer.slice(
  pixels.byteOffset + blob.offset, pixels.byteOffset + blob.offset + blob.length))

function resize(c: Case, input: Uint8Array): Uint8Array | null {
  if (c.fn === 'float_linear') {
    const bpp = c.channels * 4
    const out = stbir_resize_float_linear(new Float32Array(input.buffer, input.byteOffset, input.length / 4),
      c.inW, c.inH, c.inW * bpp, null, c.outW, c.outH, c.outW * bpp, c.channels)
    return out && new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
  }
  const fn = c.fn === 'uint8_srgb' ? stbir_resize_uint8_srgb : stbir_resize_uint8_linear
  return fn(input, c.inW, c.inH, c.inW * c.channels, null, c.outW, c.outH, c.outW * c.channels, c.channels)
}

// Mismatch count and largest difference (in 8-bit steps, or as floats).
function difference(c: Case, actual: Uint8Array, expected: Uint8Array): { mismatches: number, maxDiff: number } {
  let mismatches = 0, maxDiff = 0
  if (c.fn === 'float_linear') {
    const a = new Float32Array(actual.buffer, actual.byteOffset, actual.length / 4)
    const e = new Float32Array(expected.buffer, expected.byteOffset, expected.length / 4)
    const ab = new Uint32Array(a.buffer, a.byteOffset, a.length)
    const eb = new Uint32Array(e.buffer, e.byteOffset, e.length)
    for (let i = 0; i < e.length; i++) {
      if (ab[i] !== eb[i]) {
        mismatches++
        maxDiff = Math.max(maxDiff, Math.abs(a[i]! - e[i]!))
      }
    }
  } else {
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) {
        mismatches++
        maxDiff = Math.max(maxDiff, Math.abs(actual[i]! - expected[i]!))
      }
    }
  }
  return { mismatches, maxDiff }
}

describe('stb_image_resize2 easy API matches the native Hio build', () => {
  for (const c of fixture.cases) {
    it(`${c.name} (${c.inW}x${c.inH} -> ${c.outW}x${c.outH}, ${c.channels} channels)`, () => {
      const expected = bytes(c.output)
      const actual = resize(c, bytes(c.input))
      expect(actual).not.toBeNull()
      expect(actual!.length).toBe(expected.length)
      expect(difference(c, actual!, expected)).toEqual({ mismatches: 0, maxDiff: 0 })
    })
  }
})

describe('stb_image_resize2 easy API arguments', () => {
  const c = fixture.cases.find((row) => row.name === 'rgba16x12-uint8_srgb-5x7')!
  const input = bytes(c.input)

  it('writes into a caller buffer with explicit strides and returns it', () => {
    const stride = c.outW * 4 + 3
    const output = new Uint8Array(stride * c.outH)
    const result = stbir_resize_uint8_srgb(input, c.inW, c.inH, 0, output, c.outW, c.outH, stride, STBIR_RGBA)
    expect(result).toBe(output)
    const expected = bytes(c.output)
    for (let y = 0; y < c.outH; y++) {
      expect(Array.from(output.subarray(y * stride, y * stride + c.outW * 4)))
        .toEqual(Array.from(expected.subarray(y * c.outW * 4, (y + 1) * c.outW * 4)))
    }
  })

  it('fails like stbir for an output stride below the packed pitch or an empty output', () => {
    expect(stbir_resize_uint8_srgb(input, c.inW, c.inH, 0, new Uint8Array(1024), c.outW, c.outH, c.outW * 4 - 1,
      STBIR_RGBA)).toBeNull()
    expect(stbir_resize_uint8_srgb(input, c.inW, c.inH, 0, null, 0, c.outH, 0, STBIR_RGBA)).toBeNull()
  })
})
