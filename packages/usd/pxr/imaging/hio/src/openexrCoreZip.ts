// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/compression.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_zip.c
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore):
//   compression.c:145-217  exr_uncompress_buffer (libdeflate's zlib decoder)
//   internal_zip.c:144-256 reconstruct / interleave (the portable forms; the
//                          SSE / NEON forms compute the same bytes)
//   internal_zip.c:290-361 undo_zip_impl / internal_exr_undo_zip (ZIP, ZIPS)
// Divergence: zlib is the browser's DecompressionStream('deflate') (RFC
// 1950 zlib streams, as libdeflate_zlib_decompress_ex reads), not the
// vendored libdeflate.
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

import {
  EXR_ERR_CORRUPT_CHUNK,
  EXR_ERR_INVALID_ARGUMENT,
  EXR_ERR_OUT_OF_MEMORY,
  ExrError,
  type ExrDecodePipeline,
} from './openexrCoreCoding.ts'

/** compression.c:145-217 exr_uncompress_buffer: inflates the zlib stream
 *  `input` into at most `out_bytes_avail` bytes and returns them. An
 *  output that does not fit is EXR_ERR_OUT_OF_MEMORY
 *  (LIBDEFLATE_INSUFFICIENT_SPACE); a stream that is invalid or does not
 *  consume all of `input` is EXR_ERR_CORRUPT_CHUNK. */
export async function exr_uncompress_buffer(input: Uint8Array, out_bytes_avail: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'zlib decompression (DecompressionStream) is unavailable')
  }
  const reader = new Blob([input as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate')).getReader()
  const out = new Uint8Array(out_bytes_avail)
  let count = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (count + value.length > out_bytes_avail) {
        await reader.cancel()
        throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
      }
      out.set(value, count)
      count += value.length
    }
  } catch (error) {
    if (error instanceof ExrError) throw error
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }
  return out.subarray(0, count)
}

/** internal_zip.c:144-157 reconstruct */
function reconstruct(buf: Uint8Array, sz: number): void {
  for (let t = 1; t < sz; ++t) buf[t] = (buf[t - 1]! + buf[t]! - 128) & 0xff
}

/** internal_zip.c:219-245 interleave */
function interleave(out: Uint8Array, source: Uint8Array, outSize: number): void {
  let t1 = 0, t2 = (outSize + 1) >> 1
  for (let s = 0; s < outSize;) {
    out[s++] = source[t1++]!
    if (s < outSize) out[s++] = source[t2++]!
  }
}

/** internal_zip.c:248-253 */
export function internal_zip_reconstruct_bytes(out: Uint8Array, source: Uint8Array, count: number): void {
  reconstruct(source, count)
  interleave(out, source, count)
}

/** internal_zip.c:290-361 internal_exr_undo_zip (with undo_zip_impl) */
export async function internal_exr_undo_zip(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  const uncompressed_size = unpacked.length
  if (packed.length === uncompressed_size) {
    decode.bytes_decompressed = packed.length
    unpacked.set(packed)
    return
  }
  const scratchbufsz = Math.max(uncompressed_size, packed.length)
  const scratch = await exr_uncompress_buffer(packed, scratchbufsz)
  decode.bytes_decompressed = scratch.length
  if (scratch.length !== uncompressed_size) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  internal_zip_reconstruct_bytes(unpacked, scratch, scratch.length)
}
