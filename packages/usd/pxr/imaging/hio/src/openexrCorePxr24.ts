// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/compression.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_huf.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_pxr24.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/deflate/lib/deflate_compress.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/deflate/lib/zlib_compress.c
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// libdeflate: Copyright 2016 Eric Biggers. MIT License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore):
//   internal_pxr24.c:258-427   undo_pxr24_impl / internal_exr_undo_pxr24
//   compression.c:48-85        exr_compress_max_buffer_size (the scratch size
//                              internal_exr_undo_pxr24 allocates, which bounds
//                              the inflated size), with the constants it reads:
//     deflate/lib/zlib_compress.c:76-82        libdeflate_zlib_compress_bound
//     deflate/lib/deflate_compress.c:3989-4048 libdeflate_deflate_compress_bound
//     internal_huf.c:1823-1845                 internal_exr_huf_*_spare_bytes
// The encode path (float_to_float24, apply_pxr24_impl) is not ported.
// Divergence: zlib is exr_uncompress_buffer of openexrCoreZip.ts (the
// browser's DecompressionStream), not the vendored libdeflate.
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

import {
  EXR_ERR_CORRUPT_CHUNK,
  EXR_ERR_INVALID_ARGUMENT,
  EXR_ERR_OUT_OF_MEMORY,
  EXR_PIXEL_FLOAT,
  EXR_PIXEL_HALF,
  EXR_PIXEL_UINT,
  ExrError,
  type ExrDecodePipeline,
} from './openexrCoreCoding.ts'
import { exr_uncompress_buffer } from './openexrCoreZip.ts'

// deflate/lib/deflate_compress.c:66, 721; deflate/lib/zlib_constants.h:8-10
const MIN_BLOCK_LENGTH = 5000
const OUTPUT_END_PADDING = 8
const ZLIB_MIN_OVERHEAD = 2 + 4

// internal_huf.c:18-22, 50-55, 1043-1130
const HUF_ENCSIZE = (1 << 16) + 1
const HUF_DECSIZE = 1 << 14

/** internal_huf.c:1823-1832. Divergence: sizeof (uint64_t*) is taken as 8
 *  (a 64-bit host). */
function internal_exr_huf_compress_spare_bytes(): number {
  let ret = 0
  ret += HUF_ENCSIZE * 8 // freq
  ret += HUF_ENCSIZE * 8 // scode
  ret += HUF_ENCSIZE * 8 // fheap
  ret += HUF_ENCSIZE * 4 // hlink
  return ret
}

/** internal_huf.c:1834-1845. Divergence: sizeof (HufDec) is taken as 16 and
 *  sizeof (FastHufDecoder) as its 64-bit layout (internal_huf.c:1084-1130,
 *  MAX_CODE_LEN 58, TABLE_LOOKUP_BITS 12). */
function internal_exr_huf_decompress_spare_bytes(): number {
  let ret = 0
  ret += HUF_ENCSIZE * 8 // freq
  ret += HUF_DECSIZE * 16 // hdec
  //    ret += HUF_ENCSIZE * sizeof (uint64_t*); // fheap
  //    ret += HUF_ENCSIZE * sizeof (uint64_t);  // scode
  // _rleSymbol, _numSymbols, min/max/_pad, _idToSymbol, (pad to 8),
  // _ljBase, _ljOffset, _tableSymbol, _tableCodeLen, (pad to 8), _tableMin
  let fhd = 4 + 4 + 4 + 4 * (65536 + 1)
  fhd = Math.ceil(fhd / 8) * 8 + 8 * (58 + 2) + 8 * (58 + 1) + 4 * 4096 + 4096
  fhd = Math.ceil(fhd / 8) * 8 + 8
  if (fhd > ret) ret = fhd
  return ret
}

/** deflate_compress.c:3989-4048 with zlib_compress.c:76-82 */
function libdeflate_zlib_compress_bound(in_nbytes: number): number {
  let bound = 0
  const max_blocks = Math.max(Math.floor((in_nbytes + MIN_BLOCK_LENGTH - 1) / MIN_BLOCK_LENGTH), 1)
  bound += 5 * max_blocks
  bound += in_nbytes
  bound += 1 + OUTPUT_END_PADDING
  return ZLIB_MIN_OVERHEAD + bound
}

/** compression.c:48-85. The SIZE_MAX saturation checks cannot trigger for
 *  sizes a Uint8Array can hold and are omitted. */
function exr_compress_max_buffer_size(in_bytes: number): number {
  let r = libdeflate_zlib_compress_bound(in_bytes)
  /*
   * lib deflate has a message about needing a 9 byte boundary
   * but is unclear if it actually adds that or not
   * (see the comment on libdeflate_deflate_compress)
   */
  r += 9

  /*
   * old library had uiAdd( uiAdd( in, ceil(in * 0.01) ), 100 )
   */
  let extra = Math.floor((r * 130) / 128)
  if (extra > r) r = extra

  /*
   * in case huf is larger than zlib
   */
  extra = in_bytes + internal_exr_huf_compress_spare_bytes()
  if (r < extra) r = extra

  extra = in_bytes + internal_exr_huf_decompress_spare_bytes()
  if (r < extra) r = extra

  /* make sure there is some small 2 pages worth of buffer */
  if (8192 > r) r = 8192

  return r
}

/** internal_pxr24.c:260-401 undo_pxr24_impl */
async function undo_pxr24_impl(decode: ExrDecodePipeline, compressed_data: Uint8Array,
  uncompressed_data: Uint8Array, scratch_size: number): Promise<void> {
  const uncompressed_size = uncompressed_data.length
  const dv = new DataView(uncompressed_data.buffer, uncompressed_data.byteOffset, uncompressed_data.byteLength)
  let out = 0
  let nOut = 0
  let nDec = 0
  let lastIn = 0

  if (scratch_size < uncompressed_size) throw new ExrError(EXR_ERR_INVALID_ARGUMENT)

  // exr_uncompress_buffer throws where upstream returns rstat
  const scratch_data = await exr_uncompress_buffer(compressed_data, scratch_size)
  const outSize = scratch_data.length

  for (let y = 0; y < decode.chunk.height; ++y) {
    const cury = y + decode.chunk.start_y

    for (let c = 0; c < decode.channels.length; ++c) {
      const curc = decode.channels[c]!
      const w = curc.width
      const nBytes = w * curc.bytes_per_element

      if (curc.height === 0 ||
        (curc.y_samples > 1 && (cury % curc.y_samples) !== 0))
        continue

      if (nOut + nBytes > uncompressed_size) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)

      switch (curc.data_type) {
        case EXR_PIXEL_UINT: {
          let pixel = 0
          let dout = out
          let p0 = lastIn
          lastIn += w
          let p1 = lastIn
          lastIn += w
          let p2 = lastIn
          lastIn += w
          let p3 = lastIn
          lastIn += w

          if (nDec + nBytes > outSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

          for (let x = 0; x < w; ++x) {
            const diff = ((scratch_data[p0++]! << 24) | (scratch_data[p1++]! << 16) |
              (scratch_data[p2++]! << 8) | scratch_data[p3++]!) >>> 0
            pixel = (pixel + diff) >>> 0
            dv.setUint32(dout, pixel, true)
            dout += 4
          }
          nDec += nBytes
          break
        }
        case EXR_PIXEL_HALF: {
          let pixel = 0
          let dout = out
          let p0 = lastIn
          lastIn += w
          let p1 = lastIn
          lastIn += w

          if (nDec + nBytes > outSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

          for (let x = 0; x < w; ++x) {
            const diff = (scratch_data[p0++]! << 8) | scratch_data[p1++]!
            pixel = (pixel + diff) >>> 0
            dv.setUint16(dout, pixel & 0xffff, true)
            dout += 2
          }
          nDec += nBytes
          break
        }
        case EXR_PIXEL_FLOAT: {
          let pixel = 0
          let dout = out
          let p0 = lastIn
          lastIn += w
          let p1 = lastIn
          lastIn += w
          let p2 = lastIn
          lastIn += w

          if (nDec + w * 3 > outSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

          for (let x = 0; x < w; ++x) {
            const diff = ((scratch_data[p0++]! << 24) | (scratch_data[p1++]! << 16) |
              (scratch_data[p2++]! << 8)) >>> 0
            pixel = (pixel + diff) >>> 0
            dv.setUint32(dout, pixel, true)
            dout += 4
          }
          nDec += w * 3
          break
        }
        default: throw new ExrError(EXR_ERR_INVALID_ARGUMENT)
      }
      out += nBytes
      nOut += nBytes
    }
  }
  decode.bytes_decompressed = nOut
}

/** internal_pxr24.c:403-427 internal_exr_undo_pxr24. The scratch buffer
 *  (internal_decode_alloc_buffer) is the Uint8Array exr_uncompress_buffer
 *  returns; its capacity is upstream's allocation size. */
export async function internal_exr_undo_pxr24(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  await undo_pxr24_impl(decode, packed, unpacked, exr_compress_max_buffer_size(unpacked.length))
}
