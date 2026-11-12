// Ported from OpenUSD 26.11.1: pxr/base/tf/fastCompression.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/**
 * Regression tests for two faithfulness bugs in the crate reader:
 *
 *  1. Chunked-LZ4 chunk-size width — TfFastCompression
 *     (pxr/base/tf/fastCompression.cpp) writes each chunk's compressed size as
 *     an int32_t (4 bytes), then the LZ4 block. The reader previously advanced
 *     8 bytes over that field (treating it as uint64), desyncing multi-chunk
 *     buffers. See fastCompression.cpp DecompressFromBuffer:
 *       int32_t chunkSize = 0;
 *       std::memcpy(&chunkSize, compressed, sizeof(chunkSize));  // 4 bytes
 *       compressed += sizeof(chunkSize);
 *
 *  2. Inline-packed quaternion component order — crate stores GfQuat
 *     imaginary-first on disk (ix,iy,iz,w); USDA/internal order is w-first.
 *     The non-inline path reordered; the inline (int8-packed) path did not.
 */

import { describe, expect, it } from 'vitest'
import { Quatd, Quatf, Quath } from 'typescript-usd/gf'
import { lz4Decompress } from 'typescript-usd/tf'
import { lz4Compress } from 'typescript-usd/tf'
import { _internalForTests } from '../src/crateFile.ts'

const { BufReader, parseMathematical } = _internalForTests

// VT type enum values (parser.ts VT) — kept local to avoid exporting the enum.
const VT_Quatf = 17
const VT_Quatd = 16
const VT_Quath = 18

describe('lz4Decompress — chunked chunk-size width (bug 1)', () => {
  // Build a multi-chunk buffer by hand: [numChunks=2][int32 size][block]...
  // Each block is a store-only single-chunk LZ4 buffer produced by lz4Compress;
  // we strip its leading numChunks=0 byte so it is a bare LZ4 block, then prefix
  // it with the 4-byte (int32) compressed size, matching fastCompression.cpp.
  function chunk(data: Uint8Array): { size: number; block: Uint8Array } {
    const single = lz4Compress(data) // [0, token, exts..., data...]
    const block = single.subarray(1) // drop the numChunks=0 byte
    return { size: block.length, block }
  }

  it('reads a 2-chunk buffer with 4-byte (int32) size prefixes', () => {
    const partA = new Uint8Array([1, 2, 3, 4, 5])
    const partB = new Uint8Array([6, 7, 8])
    const a = chunk(partA)
    const b = chunk(partB)

    const total = 1 + 4 + a.block.length + 4 + b.block.length
    const buf = new Uint8Array(total)
    let p = 0
    buf[p++] = 2 // numChunks (single byte, per fastCompression.cpp)
    // chunk A: int32 size little-endian, then block
    buf[p++] = a.size & 0xff
    buf[p++] = (a.size >> 8) & 0xff
    buf[p++] = (a.size >> 16) & 0xff
    buf[p++] = (a.size >> 24) & 0xff
    buf.set(a.block, p)
    p += a.block.length
    // chunk B
    buf[p++] = b.size & 0xff
    buf[p++] = (b.size >> 8) & 0xff
    buf[p++] = (b.size >> 16) & 0xff
    buf[p++] = (b.size >> 24) & 0xff
    buf.set(b.block, p)
    p += b.block.length

    const out = lz4Decompress(buf, partA.length + partB.length)
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('still reads a single-chunk (numChunks=0) buffer', () => {
    const data = new Uint8Array([10, 20, 30, 40])
    const compressed = lz4Compress(data) // numChunks=0 single block
    const out = lz4Decompress(compressed, data.length)
    expect(Array.from(out)).toEqual([10, 20, 30, 40])
  })
})

describe('parseMathematical — inline quat component order (bug 2)', () => {
  // An inline-packed quat stores int8 components imaginary-first (ix,iy,iz,w)
  // in payloadLo's 4 bytes (little-endian). Reader must return w-first.
  function inlineQuatRep(ix: number, iy: number, iz: number, w: number) {
    const payloadLo =
      ((ix & 0xff) | ((iy & 0xff) << 8) | ((iz & 0xff) << 16) | ((w & 0xff) << 24)) >>> 0
    return {
      typeId: VT_Quatf,
      isArray: false,
      isInlined: true,
      isCompressed: false,
      isArrayEdit: false,
      payloadLo,
      payloadOffset: payloadLo,
    }
  }

  it('reads an inline quatf stored imaginary-first', () => {
    const r = new BufReader(new Uint8Array(0))
    // disk order ix=1, iy=2, iz=3, w=4  →  real 4, imaginary (1, 2, 3)
    const rep = inlineQuatRep(1, 2, 3, 4)
    expect(parseMathematical(r, rep, VT_Quatf)).toEqual(new Quatf(4, 1, 2, 3))
  })

  it('matches the non-inline path for the identity quat (w=1)', () => {
    const r = new BufReader(new Uint8Array(0))
    // identity quat: ix=iy=iz=0, w=1  →  [1,0,0,0]
    const rep = inlineQuatRep(0, 0, 0, 1)
    expect(parseMathematical(r, rep, VT_Quatf)).toEqual(new Quatf(1, 0, 0, 0))
  })

  it('reorders inline quatd and quath the same way', () => {
    const r = new BufReader(new Uint8Array(0))
    const repD = { ...inlineQuatRep(5, 6, 7, 8), typeId: VT_Quatd }
    expect(parseMathematical(r, repD, VT_Quatd)).toEqual(new Quatd(8, 5, 6, 7))

    // quath inline still uses 1 byte per component (int8), per crateValueInliners.
    const repH = { ...inlineQuatRep(1, 0, 0, 9), typeId: VT_Quath }
    expect(parseMathematical(r, repH, VT_Quath)).toEqual(new Quath(9, 1, 0, 0))
  })
})
