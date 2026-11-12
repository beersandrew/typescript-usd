// Ported from OpenUSD 26.11.1: pxr/base/tf/fastCompression.cpp,
//  pxr/base/tf/fastCompression.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfFastCompression — buffer compression via LZ4. Mirrors
// pxr/base/tf/fastCompression.cpp (CompressToBuffer / DecompressFromBuffer);
// the block algorithm itself lives in ./pxrLZ4/lz4.ts, as upstream.
//
// Framing: each compressed buffer is prefixed with a single byte numChunks
// (read via `int nChunks = *compressed++`).
//   numChunks == 0: single block, the rest is one LZ4 block.
//   numChunks  > 0: each chunk is prefixed with an int32_t (4-byte, LE)
//     compressed size, then the LZ4 block. Each chunk holds at most
//     LZ4_MAX_INPUT_SIZE uncompressed bytes; a buffer is chunked only when its
//     uncompressed size exceeds LZ4_MAX_INPUT_SIZE.

import { LZ4_MAX_INPUT_SIZE, compressBlock, decompressBlock } from './pxrLZ4/lz4.ts'

export { lz4CompressBound } from './pxrLZ4/lz4.ts'

// TfFastCompression::CompressToBuffer.
export function lz4Compress(data: Uint8Array): Uint8Array {
  return compressWithThreshold(data, LZ4_MAX_INPUT_SIZE)
}

// Core implementation parameterized by the per-chunk uncompressed-size threshold.
// In production the threshold is LZ4_MAX_INPUT_SIZE (~2 GB); `_compressWithThreshold`
// re-exports this with a small threshold purely so the chunked framing path
// (numChunks > 0 + per-chunk int32 size) is unit-testable without allocating
// gigabytes. The framing exactly mirrors fastCompression.cpp::CompressToBuffer.
function compressWithThreshold(data: Uint8Array, threshold: number): Uint8Array {
  const n = data.length
  // Empty → numChunks=0 + empty block (decompressor handles it).
  if (n === 0) return new Uint8Array([0, 0])

  if (n <= threshold) {
    const block = compressBlock(data)
    const out = new Uint8Array(1 + block.length)
    out[0] = 0 // numChunks = 0 → single block
    out.set(block, 1)
    return out
  }

  // Chunked: each chunk holds <= threshold uncompressed bytes, prefixed by its
  // int32 (LE) compressed size. Matches fastCompression.cpp's writeChunk.
  const nWholeChunks = Math.floor(n / threshold)
  const partChunkSz = n % threshold
  const numChunks = nWholeChunks + (partChunkSz ? 1 : 0)

  const parts: Uint8Array[] = []
  let total = 1 // numChunks byte
  let off = 0
  const pushChunk = (size: number): void => {
    const block = compressBlock(data.subarray(off, off + size))
    const hdr = new Uint8Array(4)
    hdr[0] = block.length & 0xff
    hdr[1] = (block.length >> 8) & 0xff
    hdr[2] = (block.length >> 16) & 0xff
    hdr[3] = (block.length >>> 24) & 0xff
    parts.push(hdr, block)
    total += 4 + block.length
    off += size
  }
  for (let c = 0; c < nWholeChunks; c++) pushChunk(threshold)
  if (partChunkSz) pushChunk(partChunkSz)

  const out = new Uint8Array(total)
  out[0] = numChunks
  let p = 1
  for (const part of parts) { out.set(part, p); p += part.length }
  return out
}

// Test-only seam: exercise the chunked framing path with a small threshold.
// Not part of the package barrel; consumers use lz4Compress().
export function _compressWithThreshold(data: Uint8Array, threshold: number): Uint8Array {
  return compressWithThreshold(data, threshold)
}

// TfFastCompression::DecompressFromBuffer.
export function lz4Decompress(buf: Uint8Array, uncompressedSize: number): Uint8Array {
  // The reference Python impl reads numChunks as 1 byte (despite spec saying uint64).
  const numChunks = buf[0]!

  if (numChunks === 0) {
    return decompressBlock(buf.subarray(1), uncompressedSize)
  }

  // Chunked (rare in practice) — each chunk's compressed size is an int32_t
  // (4 bytes), matching fastCompression.cpp's `sizeof(int32_t)` prefix.
  let pos = 1
  const out = new Uint8Array(uncompressedSize)
  let di = 0
  for (let c = 0; c < numChunks; c++) {
    const chunkSize =
      buf[pos]! | (buf[pos + 1]! << 8) | (buf[pos + 2]! << 16) | (buf[pos + 3]! * 0x1000000)
    pos += 4  // int32_t chunk size
    const chunk = decompressBlock(buf.subarray(pos, pos + chunkSize), uncompressedSize - di)
    out.set(chunk, di)
    di += chunk.length
    pos += chunkSize
  }
  return out.subarray(0, di)
}

// Public class surface from OpenUSD v26.08 pxr/base/tf/fastCompression.h:20-51.
// Typed arrays carry the buffer pointer and size together in JavaScript.
export class TfFastCompression {
  static getMaxInputSize(): number { return 200 * 1024 ** 3 }

  static getCompressedBufferSize(inputSize: number): number {
    if (!Number.isSafeInteger(inputSize) || inputSize < 0 ||
        inputSize > this.getMaxInputSize()) return 0
    return inputSize + Math.floor(inputSize / 255) + 17
  }

  static compressToBuffer(input: Uint8Array): Uint8Array {
    return lz4Compress(input)
  }

  static decompressFromBuffer(
    compressed: Uint8Array,
    maxOutputSize: number,
  ): Uint8Array {
    return lz4Decompress(compressed, maxOutputSize)
  }
}
