// Ported from OpenUSD 26.11.1: pxr/usd/sdf/integerCoding.cpp,
//  pxr/usd/sdf/integerCoding.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sdf_IntegerCompression — compressed integer arrays (AOUSD spec 16.3.7.2).
// Mirrors pxr/usd/sdf/integerCoding.cpp (Sdf_IntegerCompression /
// Sdf_IntegerCompression64): common-value prefix + 2-bit codepoints +
// delta-encoded values, LZ4-wrapped via TfFastCompression (typescript-usd/tf).

import { lz4Compress, lz4CompressBound } from 'typescript-usd/tf'

const CODE_COMMON = 0
const CODE_QUARTER = 1
const CODE_HALF = 2
const CODE_FULL = 3

export function decodeIntArray(data: Uint8Array, count: number, intSize: 4 | 8 = 4): number[] {
  if (count === 0) return []

  let pos = 0

  function readSigned(size: number): number {
    let v = 0
    for (let i = 0; i < size; i++) v |= (data[pos + i]! << (i * 8))
    pos += size
    if (size === 4) return v | 0  // JS bitwise already gives signed int32; `1 << 32` wraps in JS
    // sign-extend for sub-32-bit sizes
    const bits = size * 8
    if (v & (1 << (bits - 1))) v |= ~((1 << bits) - 1)
    return v
  }

  // Common value is a signed integer of intSize bytes
  const commonValue = readSigned(intSize)

  const numCodeBytes = Math.floor((count * 2 + 7) / 8)
  const codesStart = pos
  pos += numCodeBytes // skip past codes to values

  const quarterSize = intSize >> 2
  const halfSize = intSize >> 1

  const elements: number[] = new Array(count)
  let prev = 0
  let codeByteIdx = codesStart
  let codeBit = 0

  for (let i = 0; i < count; i++) {
    if (codeBit >= 8) {
      codeByteIdx++
      codeBit = 0
    }
    const code = (data[codeByteIdx]! >> codeBit) & 3
    codeBit += 2

    let delta: number
    if (code === CODE_COMMON) {
      delta = commonValue
    } else if (code === CODE_QUARTER) {
      delta = readSigned(quarterSize || 1)
    } else if (code === CODE_HALF) {
      delta = readSigned(halfSize || 1)
    } else {
      delta = readSigned(intSize)
    }

    prev += delta
    elements[i] = prev
  }

  return elements
}

// Same but returns BigInt for 64-bit arrays
export function decodeIntArray64(data: Uint8Array, count: number): bigint[] {
  if (count === 0) return []

  let pos = 0

  function readSigned64(): bigint {
    let v = 0n
    for (let i = 0; i < 8; i++) v |= BigInt(data[pos + i]!) << BigInt(i * 8)
    pos += 8
    // sign-extend to int64
    if (v & (1n << 63n)) v |= ~((1n << 64n) - 1n)
    return v
  }

  function readSignedN(size: number): bigint {
    let v = 0n
    for (let i = 0; i < size; i++) v |= BigInt(data[pos + i]!) << BigInt(i * 8)
    pos += size
    if (size > 0) {
      const bits = BigInt(size * 8)
      if (v & (1n << (bits - 1n))) v |= ~((1n << bits) - 1n)
    }
    return v
  }

  const commonValue = readSigned64()
  const numCodeBytes = Math.floor((count * 2 + 7) / 8)
  const codesStart = pos
  pos += numCodeBytes

  const elements: bigint[] = new Array(count)
  let prev = 0n
  let codeByteIdx = codesStart
  let codeBit = 0

  for (let i = 0; i < count; i++) {
    if (codeBit >= 8) {
      codeByteIdx++
      codeBit = 0
    }
    const code = (data[codeByteIdx]! >> codeBit) & 3
    codeBit += 2

    let delta: bigint
    if (code === CODE_COMMON) {
      delta = commonValue
    } else if (code === CODE_QUARTER) {
      delta = readSignedN(2) // quarter of 8 = 2
    } else if (code === CODE_HALF) {
      delta = readSignedN(4) // half of 8 = 4
    } else {
      delta = readSigned64()
    }

    prev += delta
    elements[i] = prev
  }

  return elements
}

// Returns the raw encoded bytes (before LZ4 compression):
//   intSize bytes: common value (signed LE)
//   ceil(count*2/8) bytes: 2-bit code per element (4 codes/byte)
//   variable bytes: delta values for non-COMMON elements
export function encodeRaw(values: number[]): Uint8Array {
  const count = values.length
  if (count === 0) return new Uint8Array(0)

  const intSize = 4
  const quarterSize = 1  // intSize >> 2
  const halfSize = 2     // intSize >> 1

  // Compute deltas (element[i] - element[i-1], prev starts at 0)
  const deltas = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    deltas[i] = (values[i]! - (i > 0 ? values[i - 1]! : 0)) | 0
  }

  // Find most-frequent delta as common value. On a tie, take the LARGEST tied
  // value — matches OpenUSD integerCoding.cpp _EncodeIntegers (~line 290):
  // "Take the largest common value in case of a tie -- this gives the biggest
  // potential savings in the encoded stream." The C++ updates incrementally as
  // it scans, so we replicate that exact >/== precedence per element.
  let commonValue = 0; let best = 0
  const counts = new Map<number, number>()
  for (const d of deltas) {
    const c = (counts.get(d) ?? 0) + 1
    counts.set(d, c)
    if (c > best) { commonValue = d; best = c }
    else if (c === best && d > commonValue) { commonValue = d }
  }

  // Classify each delta; build code bytes and delta value bytes
  const numCodeBytes = Math.ceil(count * 2 / 8)
  const codes = new Uint8Array(numCodeBytes)
  const dBytes: number[] = []

  function pushLE(v: number, size: number) {
    for (let b = 0; b < size; b++) dBytes.push((v >> (b * 8)) & 0xff)
  }

  for (let i = 0; i < count; i++) {
    const d = deltas[i]!
    let code: number
    if (d === commonValue) {
      code = 0  // CODE_COMMON — no extra bytes
    } else if (d >= -128 && d <= 127) {
      code = 1; pushLE(d, quarterSize)   // CODE_QUARTER — 1 byte
    } else if (d >= -32768 && d <= 32767) {
      code = 2; pushLE(d, halfSize)     // CODE_HALF — 2 bytes
    } else {
      code = 3; pushLE(d, intSize)      // CODE_FULL — 4 bytes
    }
    codes[(i * 2) >> 3]! |= code << ((i * 2) & 7)
  }

  // Layout: common value (4 bytes LE) + code bytes + delta bytes
  const out = new Uint8Array(intSize + numCodeBytes + dBytes.length)
  const view = new DataView(out.buffer)
  view.setInt32(0, commonValue, true)
  out.set(codes, intSize)
  out.set(new Uint8Array(dBytes), intSize + numCodeBytes)
  return out
}

// Returns LZ4-compressed integer array in the format readIntArray() expects:
//   [u64 compressedSize][compressed data]
// Caller should write compressedSize then data; this function returns just the data.
export function encodeIntArrayCompressed(values: number[]): Uint8Array {
  return lz4Compress(encodeRaw(values))
}

// The 64-bit form (Sdf_IntegerCompression64): an 8-byte common value, then
// 2-bit codes, then deltas of 2, 4 or 8 bytes. Deltas wrap modulo 2^64, as
// the unsigned arithmetic does upstream.
export function encodeRaw64(values: readonly bigint[]): Uint8Array {
  const count = values.length
  if (count === 0) return new Uint8Array(0)
  const deltas = new Array<bigint>(count)
  for (let i = 0; i < count; i++) {
    deltas[i] = BigInt.asIntN(64, values[i]! - (i > 0 ? values[i - 1]! : 0n))
  }
  // Most frequent delta, the largest on a tie (integerCoding.cpp _EncodeIntegers).
  let commonValue = 0n; let best = 0
  const counts = new Map<bigint, number>()
  for (const d of deltas) {
    const c = (counts.get(d) ?? 0) + 1
    counts.set(d, c)
    if (c > best) { commonValue = d; best = c }
    else if (c === best && d > commonValue) { commonValue = d }
  }
  const numCodeBytes = Math.ceil(count * 2 / 8)
  const codes = new Uint8Array(numCodeBytes)
  const dBytes: number[] = []
  const pushLE = (v: bigint, size: number) => {
    const bits = BigInt.asUintN(size * 8, v)
    for (let b = 0; b < size; b++) dBytes.push(Number((bits >> BigInt(b * 8)) & 0xffn))
  }
  for (let i = 0; i < count; i++) {
    const d = deltas[i]!
    let code: number
    if (d === commonValue) code = 0
    else if (d >= -32768n && d <= 32767n) { code = 1; pushLE(d, 2) }
    else if (d >= -2147483648n && d <= 2147483647n) { code = 2; pushLE(d, 4) }
    else { code = 3; pushLE(d, 8) }
    codes[(i * 2) >> 3]! |= code << ((i * 2) & 7)
  }
  const out = new Uint8Array(8 + numCodeBytes + dBytes.length)
  new DataView(out.buffer).setBigInt64(0, commonValue, true)
  out.set(codes, 8)
  out.set(new Uint8Array(dBytes), 8 + numCodeBytes)
  return out
}

export function encodeIntArray64Compressed(values: readonly bigint[]): Uint8Array {
  return lz4Compress(encodeRaw64(values))
}

// Upstream crateFile.cpp: arrays with size >= MinCompressedArraySize are
// stored with FLAG_COMPRESSED. Smaller arrays are written uncompressed.
export const MIN_COMPRESSED_ARRAY_SIZE = 16

// Max compressed output buffer size for a compressed-integer-array of `count`
// ints (Sdf_IntegerCompression::GetCompressedBufferSize; the +1 covers the
// TfFastCompression numChunks prefix byte).
export function intArrayCompressedBufSize(count: number, intSize = 4): number {
  if (count === 0) return 0
  const numCodeBytes = Math.floor((count * 2 + 7) / 8)
  const encodedSize = intSize + numCodeBytes + count * intSize
  return lz4CompressBound(encodedSize) + 1
}
