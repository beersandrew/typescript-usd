// Ported from OpenVDB 13.0.1: openvdb/openvdb/io/Compression.h,
//  openvdb/openvdb/io/Compression.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of openvdb/io/Compression.h + .cc (read side): the per-buffer codec
// framing (zip/blosc with int64 size prefixes, negative = uncompressed) and
// the active-mask value compression with its 7 reconstruction modes.
//
// DIVERGENCE from upstream: zip inflation uses the platform's
// DecompressionStream('deflate'), which makes every read path that can
// encounter zipped buffers async.

import { halfToFloat } from '../math/Half.ts'
import { bloscDecompress } from './Blosc.ts'
import type { Stream } from './Stream.ts'

export const COMPRESS_NONE = 0
export const COMPRESS_ZIP = 0x1
export const COMPRESS_ACTIVE_MASK = 0x2
export const COMPRESS_BLOSC = 0x4

// per-node indicator byte for inactive-value reconstruction
export const NO_MASK_OR_INACTIVE_VALS = 0
export const NO_MASK_AND_MINUS_BG = 1
export const NO_MASK_AND_ONE_INACTIVE_VAL = 2
export const MASK_AND_NO_INACTIVE_VALS = 3
export const MASK_AND_ONE_INACTIVE_VAL = 4
export const MASK_AND_TWO_INACTIVE_VALS = 5
export const NO_MASK_AND_ALL_VALS = 6

export function compressionToString(flags: number): string {
  if (flags === COMPRESS_NONE) return 'none'
  const out: string[] = []
  if (flags & COMPRESS_ZIP) out.push('zip')
  if (flags & COMPRESS_ACTIVE_MASK) out.push('active values')
  if (flags & COMPRESS_BLOSC) out.push('blosc')
  return out.join(' + ')
}

async function inflate(compressed: Uint8Array, expectedBytes: number): Promise<Uint8Array> {
  const stream = new Blob([compressed as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))
  const out = new Uint8Array(await new Response(stream).arrayBuffer())
  if (out.byteLength !== expectedBytes) {
    throw new Error(`zlib inflate produced ${out.byteLength} bytes, expected ${expectedBytes}`)
  }
  return out
}

/**
 * Upstream io::readData / unzipFromStream / bloscFromStream: reads
 * `numBytes` of payload, honoring the codec's int64 size framing
 * (negative size = stored uncompressed).
 */
export async function readData(s: Stream, numBytes: number, compression: number): Promise<Uint8Array> {
  if (compression & COMPRESS_BLOSC) {
    const numCompressedBytes = s.int64()
    if (numCompressedBytes <= 0) {
      if (-numCompressedBytes !== numBytes) {
        throw new Error(`expected a ${numBytes}-byte chunk, got ${-numCompressedBytes}`)
      }
      return s.raw(numBytes)
    }
    return bloscDecompress(s.raw(numCompressedBytes), numBytes)
  }
  if (compression & COMPRESS_ZIP) {
    const numZippedBytes = s.int64()
    if (numZippedBytes <= 0) {
      if (-numZippedBytes !== numBytes) {
        throw new Error(`expected a ${numBytes}-byte chunk, got ${-numZippedBytes}`)
      }
      return s.raw(numBytes)
    }
    return inflate(s.raw(numZippedBytes), numBytes)
  }
  return s.raw(numBytes)
}

/** Count set bits in a bit mask stored as uint32 words. */
export function maskCountOn(mask: Uint32Array): number {
  let sum = 0
  for (let i = 0; i < mask.length; ++i) {
    let w = mask[i]!
    w = w - ((w >>> 1) & 0x55555555)
    w = (w & 0x33333333) + ((w >>> 2) & 0x33333333)
    sum += (((w + (w >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
  }
  return sum
}

export function maskIsOn(mask: Uint32Array, n: number): boolean {
  return (mask[n >>> 5]! & (1 << (n & 31))) !== 0
}

/** Read a NodeMask of `bits` bits (upstream NodeMask::load: raw 64-bit words). */
export function readMask(s: Stream, bits: number): Uint32Array {
  const bytes = s.raw(bits >>> 3)
  // copy: the stream's view may be misaligned for Uint32Array
  const out = new Uint32Array(bits >>> 5)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < out.length; ++i) out[i] = dv.getUint32(i << 2, true)
  return out
}

function decodePayload(bytes: Uint8Array, count: number, comps: number, fromHalf: boolean): Float32Array {
  const out = new Float32Array(count * comps)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (fromHalf) {
    for (let i = 0; i < out.length; ++i) out[i] = halfToFloat(dv.getUint16(i << 1, true))
  } else {
    for (let i = 0; i < out.length; ++i) out[i] = dv.getFloat32(i << 2, true)
  }
  return out
}

/**
 * Port of io::readCompressedValues: reads `destCount` values (each `comps`
 * float components) into a flat Float32Array, reconstructing inactive
 * values per the node's metadata byte when active-mask compression is on.
 */
export async function readCompressedValues(
  s: Stream,
  destCount: number,
  comps: number,
  valueMask: Uint32Array,
  background: ArrayLike<number>,
  compression: number,
  fromHalf: boolean,
): Promise<Float32Array> {
  const maskCompressed = (compression & COMPRESS_ACTIVE_MASK) !== 0

  // per-node metadata byte (always present in file versions >= 222)
  const metadata = s.int8()

  const inactiveVal1 = new Float32Array(comps)
  const inactiveVal0 = new Float32Array(comps)
  for (let c = 0; c < comps; ++c) {
    inactiveVal1[c] = Math.fround(background[c]!)
    inactiveVal0[c] = metadata === NO_MASK_OR_INACTIVE_VALS ? Math.fround(background[c]!) : -Math.fround(background[c]!)
  }

  if (
    metadata === NO_MASK_AND_ONE_INACTIVE_VAL ||
    metadata === MASK_AND_ONE_INACTIVE_VAL ||
    metadata === MASK_AND_TWO_INACTIVE_VALS
  ) {
    for (let c = 0; c < comps; ++c) inactiveVal0[c] = s.float32()
    if (metadata === MASK_AND_TWO_INACTIVE_VALS) {
      for (let c = 0; c < comps; ++c) inactiveVal1[c] = s.float32()
    }
  }

  let selectionMask: Uint32Array | null = null
  if (
    metadata === MASK_AND_NO_INACTIVE_VALS ||
    metadata === MASK_AND_ONE_INACTIVE_VAL ||
    metadata === MASK_AND_TWO_INACTIVE_VALS
  ) {
    selectionMask = readMask(s, destCount)
  }

  const tempCount = maskCompressed && metadata !== NO_MASK_AND_ALL_VALS ? maskCountOn(valueMask) : destCount

  // upstream HalfReader/HalfWriter early-return for count < 1 WITHOUT
  // touching the stream — no codec size prefix exists for empty half
  // buffers (non-half empty buffers still carry their zip/blosc framing)
  const valBytes = comps * (fromHalf ? 2 : 4)
  const payload =
    fromHalf && tempCount < 1 ? new Uint8Array(0) : await readData(s, tempCount * valBytes, compression)
  const temp = decodePayload(payload, tempCount, comps, fromHalf)

  if (!maskCompressed || tempCount === destCount) {
    return temp
  }

  // scatter active values; reconstruct inactive ones
  const dest = new Float32Array(destCount * comps)
  for (let destIdx = 0, tempIdx = 0; destIdx < destCount; ++destIdx) {
    if (maskIsOn(valueMask, destIdx)) {
      for (let c = 0; c < comps; ++c) dest[destIdx * comps + c] = temp[tempIdx * comps + c]!
      ++tempIdx
    } else {
      const src = selectionMask !== null && maskIsOn(selectionMask, destIdx) ? inactiveVal1 : inactiveVal0
      for (let c = 0; c < comps; ++c) dest[destIdx * comps + c] = src[c]!
    }
  }
  return dest
}
