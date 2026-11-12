// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/sdf/integerCoding.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Writer byte-fidelity tests for the two divergence rows closed against
// OpenUSD v26.05:
//   1. integerCoding.cpp _EncodeIntegers (~line 290): largest-on-tie common value.
//   2. crateFile.cpp _WritePossiblyCompressedArray: int/float/double arrays with
//      size >= MinCompressedArraySize(16) are written FLAG_COMPRESSED.
//
// These tests act as the strengthened oracle: after the writer compresses an
// array, the bytes must decode via the READER to the identical values, and the
// emitted ValueRep must actually carry FLAG_COMPRESSED.

import { describe, expect, it } from 'vitest'
import { Array as VtArray } from 'typescript-usd/vt'
import { Layer } from 'typescript-usd/sdf'
import { serializeUsdc } from '../src/crateFile.ts'
import { parseCrate } from '../src/crateFile.ts'
import { encodeRaw, encodeIntArrayCompressed } from 'typescript-usd/sdf/integerCoding'
import { decodeIntArray } from 'typescript-usd/sdf/integerCoding'
import { lz4Decompress } from 'typescript-usd/tf'

type TestScene = Record<string, Record<string, { value: unknown }>>

const FLAG_ARRAY = 0x80
const FLAG_COMPRESSED = 0x20

function roundTrip(build: (l: Layer) => void): { scene: TestScene; bytes: Uint8Array } {
  const layer = Layer.createAnonymous()
  build(layer)
  const bytes = serializeUsdc(layer)
  return { scene: parseCrate(bytes) as unknown as TestScene, bytes }
}

function defAttr(layer: Layer, prim: string, name: string, typeName: string, value: unknown): void {
  layer.definePrimSpec(prim, 'Mesh')
  layer.setField(`${prim}.${name}`, 'typeName', typeName)
  layer.setAttrDefault(prim, name, value)
}

// Read the flags byte of the ValueRep stored in the FIELDS section for the
// 'default' field of the given attribute path. Re-parses just enough to walk
// the field table; relies on the public parser to confirm flags via the
// isCompressed view it exposes per field.
function defaultIsCompressed(bytes: Uint8Array, attrPath: string): boolean {
  const scene = parseCrate(bytes) as unknown as Record<
    string, Record<string, { isCompressed?: boolean }>
  >
  return scene[attrPath]?.['default']?.isCompressed === true
}

// ---- Tie-break (largest on tie) ----

describe('integer coding — common-value tie-break (largest on tie)', () => {
  it('picks the LARGEST tied delta as the common value', () => {
    // Deltas of [10, 17, 24] are constant 7 (and the leading 10). Build an input
    // whose deltas tie between two values, the larger of which must win.
    // values: 0, 5, 10, 13, 16  -> deltas: 0(start), 5, 5, 3, 3  (5 and 3 tie at 2 each)
    const values = [0, 5, 10, 13, 16]
    const raw = encodeRaw(values)
    // common value is the first 4 bytes, signed LE
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const common = dv.getInt32(0, true)
    expect(common).toBe(5) // 5 > 3, largest tied value wins
    // and the integer-coded bytes still decode losslessly
    expect(decodeIntArray(raw, values.length)).toEqual(values)
  })

  it('round-trips through LZ4 to the same values regardless of tie choice', () => {
    const values = [0, 5, 10, 13, 16, 19, 22, 25, 26, 27]
    const comp = encodeIntArrayCompressed(values)
    // readIntArray-style decode: comp is [u64 size][data]; here comp is just data
    const decoded = decodeIntArray(lz4DecompressRaw(comp, values), values.length)
    expect(decoded).toEqual(values)
  })
})

// Helper: encodeIntArrayCompressed LZ4-wraps the integer-coded bytes; to decode
// we LZ4-decompress to the worst-case integer-coding buffer size, then decode.
function lz4DecompressRaw(comp: Uint8Array, values: number[]): Uint8Array {
  // mirror the buffer-size logic in parser.readIntArray for 4-byte ints
  const count = values.length
  const numCodeBytes = Math.floor((count * 2 + 7) / 8)
  const maxValueBytes = count * 4
  const uncompressedSize = 4 + numCodeBytes + maxValueBytes
  return lz4Decompress(comp, uncompressedSize)
}

// ---- Compressed value arrays (>= 16 elements) ----

describe('writer — compressed value arrays (crateFile.cpp _WritePossiblyCompressedArray)', () => {
  it('compresses int[] of length >= 16 and round-trips', () => {
    const indices = Array.from({ length: 32 }, (_, i) => i % 8)
    const { scene, bytes } = roundTrip(l =>
      defAttr(l, '/Cube', 'faceVertexIndices', 'int[]', indices))
    expect(scene['/Cube.faceVertexIndices']?.['default']?.value).toEqual(indices)
    expect(defaultIsCompressed(bytes, '/Cube.faceVertexIndices')).toBe(true)
  })

  it('leaves int[] of length < 16 uncompressed', () => {
    const indices = [0, 1, 2, 3, 4, 5]
    const { scene, bytes } = roundTrip(l =>
      defAttr(l, '/Cube', 'faceVertexIndices', 'int[]', indices))
    expect(scene['/Cube.faceVertexIndices']?.['default']?.value).toEqual(indices)
    expect(defaultIsCompressed(bytes, '/Cube.faceVertexIndices')).toBe(false)
  })

  it("compresses an all-integral float[] via the 'i' code and round-trips", () => {
    const vals = Array.from({ length: 20 }, (_, i) => i * 2) // 0,2,4,... all integral
    const { scene, bytes } = roundTrip(l =>
      defAttr(l, '/Cube', 'widths', 'float[]', vals))
    expect(scene['/Cube.widths']?.['default']?.value).toEqual(vals)
    expect(defaultIsCompressed(bytes, '/Cube.widths')).toBe(true)
  })

  it("compresses a small-cardinality float[] via the 't' lookup-table code", () => {
    // Non-integral, few distinct values -> lookup table path.
    const palette = [0.25, 0.5, 0.75]
    const vals = Array.from({ length: 40 }, (_, i) => palette[i % 3]!)
    const { scene, bytes } = roundTrip(l =>
      defAttr(l, '/Cube', 'widths', 'float[]', vals))
    const got = (scene['/Cube.widths']?.['default']?.value as VtArray<number>).toArray()
    expect(got.map(v => Math.round(v * 100) / 100)).toEqual(
      vals.map(v => Math.round(v * 100) / 100))
    expect(defaultIsCompressed(bytes, '/Cube.widths')).toBe(true)
  })

  it('leaves an incompressible float[] uncompressed (no lut, not integral)', () => {
    // Many distinct non-integral values -> falls through to uncompressed.
    const vals = Array.from({ length: 20 }, (_, i) => i + 0.123 + i * 0.000001)
    const { scene, bytes } = roundTrip(l =>
      defAttr(l, '/Cube', 'widths', 'float[]', vals))
    const got = (scene['/Cube.widths']?.['default']?.value as VtArray<number>).toArray()
    // float32 precision: compare approximately
    for (let i = 0; i < vals.length; i++) {
      expect(got[i]!).toBeCloseTo(vals[i]!, 4)
    }
    expect(defaultIsCompressed(bytes, '/Cube.widths')).toBe(false)
  })

  it('compresses an all-integral double[] and round-trips exactly', () => {
    const vals = Array.from({ length: 24 }, (_, i) => i - 5) // negatives + zero
    const { scene, bytes } = roundTrip(l =>
      defAttr(l, '/Cube', 'someDoubles', 'double[]', vals))
    expect(scene['/Cube.someDoubles']?.['default']?.value).toEqual(vals)
    expect(defaultIsCompressed(bytes, '/Cube.someDoubles')).toBe(true)
  })
})
