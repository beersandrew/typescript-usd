// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_b44.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_b44_table.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_b44_table_init.c
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// OpenEXR: Copyright (c) DreamWorks Animation LLC and Contributors of the
//  OpenEXR Project. BSD 3-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore):
//   internal_b44.c:14-32        convertToLinear (decode reads exrcore_logTable)
//   internal_b44.c:234-334      unpack14 / unpack3
//   internal_b44.c:519-656      uncompress_b44_impl
//   internal_b44.c:658-684      compute_scratch_buffer_size
//   internal_b44.c:686-744      internal_exr_undo_b44 / internal_exr_undo_b44a
//   internal_b44_table.c:1-15   exrcore_logTable storage
//   internal_b44_table_init.c:29-57 b44_convertToLinear / init_b44_tables /
//                               exrcore_ensure_b44_tables (the log table only)
// The decode path reads only exrcore_logTable (convertToLinear); the encode
// path (shiftAndRound, pack, compress_b44_impl, convertFromLinear and
// exrcore_expTable) is not ported.
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

import {
  EXR_ERR_OUT_OF_MEMORY,
  EXR_PIXEL_HALF,
  ExrError,
  float_to_half,
  half_to_float,
  type ExrDecodePipeline,
} from './openexrCoreCoding.ts'

/** internal_b44_table.c:14-15 */
let exrcore_logTable: Uint16Array | null = null

/** internal_b44_table_init.c:29-40 b44_convertToLinear.
 *  Divergence: logf is Math.fround(Math.log(f)), the correctly rounded
 *  float log; a platform logf that is not correctly rounded could differ
 *  by an ulp before float_to_half. 8 * the float is exact in float. */
function b44_convertToLinear(x: number): number {
  if ((x & 0x7c00) === 0x7c00) // infinity/nan?
    return 0
  if (x > 0x8000) // negative? (excluding -0.0 which is accepted)
    return 0

  let f = half_to_float(x)
  f = Math.fround(8 * Math.fround(Math.log(f)))
  return float_to_half(f)
}

/** internal_b44_table_init.c:43-57 init_b44_tables / exrcore_ensure_b44_tables
 *  (call_once becomes a lazy module-level table; exrcore_expTable, used only
 *  when encoding, is not built). */
function exrcore_ensure_b44_tables(): Uint16Array {
  if (exrcore_logTable === null) {
    const t = new Uint16Array(65536)
    for (let i = 0; i < 65536; i++) t[i] = b44_convertToLinear(i)
    exrcore_logTable = t
  }
  return exrcore_logTable
}

/** internal_b44.c:27-32 */
function convertToLinear(s: Uint16Array, logTable: Uint16Array): void {
  for (let i = 0; i < 16; ++i) s[i] = logTable[s[i]!]!
}

/** internal_b44.c:236-320. `b` is read from offset `o`. The Uint16Array
 *  store truncates as upstream's (uint16_t) casts do. */
function unpack14(b: Uint8Array, o: number, s: Uint16Array): void {
  s[0] = (b[o + 0]! << 8) | b[o + 1]!

  const shift = b[o + 2]! >> 2
  const bias = (0x20 << shift) & 0xffff

  s[4] = s[0]! + ((((b[o + 2]! << 4) | (b[o + 3]! >> 4)) & 0x3f) << shift) - bias
  s[8] = s[4]! + ((((b[o + 3]! << 2) | (b[o + 4]! >> 6)) & 0x3f) << shift) - bias
  s[12] = s[8]! + ((b[o + 4]! & 0x3f) << shift) - bias

  s[1] = s[0]! + ((b[o + 5]! >> 2) << shift) - bias
  s[5] = s[4]! + ((((b[o + 5]! << 4) | (b[o + 6]! >> 4)) & 0x3f) << shift) - bias
  s[9] = s[8]! + ((((b[o + 6]! << 2) | (b[o + 7]! >> 6)) & 0x3f) << shift) - bias
  s[13] = s[12]! + ((b[o + 7]! & 0x3f) << shift) - bias

  s[2] = s[1]! + ((b[o + 8]! >> 2) << shift) - bias
  s[6] = s[5]! + ((((b[o + 8]! << 4) | (b[o + 9]! >> 4)) & 0x3f) << shift) - bias
  s[10] = s[9]! + ((((b[o + 9]! << 2) | (b[o + 10]! >> 6)) & 0x3f) << shift) - bias
  s[14] = s[13]! + ((b[o + 10]! & 0x3f) << shift) - bias

  s[3] = s[2]! + ((b[o + 11]! >> 2) << shift) - bias
  s[7] = s[6]! + ((((b[o + 11]! << 4) | (b[o + 12]! >> 4)) & 0x3f) << shift) - bias
  s[11] = s[10]! + ((((b[o + 12]! << 2) | (b[o + 13]! >> 6)) & 0x3f) << shift) - bias
  s[15] = s[14]! + ((b[o + 13]! & 0x3f) << shift) - bias

  for (let i = 0; i < 16; ++i) {
    if (s[i]! & 0x8000)
      s[i] = s[i]! & 0x7fff
    else
      s[i] = ~s[i]!
  }
}

/** internal_b44.c:322-334 */
function unpack3(b: Uint8Array, o: number, s: Uint16Array): void {
  s[0] = (b[o + 0]! << 8) | b[o + 1]!

  if (s[0]! & 0x8000)
    s[0] = s[0]! & 0x7fff
  else
    s[0] = ~s[0]!

  for (let i = 1; i < 16; ++i) s[i] = s[0]!
}

/** internal_b44.c:521-656 uncompress_b44_impl. Pointers are byte offsets;
 *  priv_from_native16 is the little-endian stores of setUint16. */
function uncompress_b44_impl(decode: ExrDecodePipeline, compressed_data: Uint8Array,
  uncompressed_data: Uint8Array, scratch_buffer_1: Uint8Array, logTable: Uint16Array): void {
  const comp_buf_size = compressed_data.length
  const uncomp_buf_size = uncompressed_data.length
  const sv = new DataView(scratch_buffer_1.buffer, scratch_buffer_1.byteOffset, scratch_buffer_1.byteLength)
  let inp = 0
  let out = 0
  let scratch = 0
  let tmp: number
  let row0: number, row1: number, row2: number, row3: number
  let n: number, nBytes: number, bpl = 0, bIn = 0
  let nx: number, ny: number
  const s = new Uint16Array(16)

  for (let c = 0; c < decode.channels.length; ++c) {
    const curc = decode.channels[c]!
    nx = curc.width
    ny = curc.height
    nBytes = ny * nx * curc.bytes_per_element

    if (nBytes === 0) continue

    if (curc.data_type !== EXR_PIXEL_HALF) {
      if (bIn + nBytes > comp_buf_size) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
      scratch_buffer_1.set(compressed_data.subarray(inp, inp + nBytes), scratch)
      inp += nBytes
      bIn += nBytes
      scratch += nBytes
      continue
    }

    for (let y = 0; y < ny; y += 4) {
      /* row offset in elements: use uint64_t so y*nx cannot overflow int */
      const row_off = y * nx
      row0 = scratch + row_off * 2
      row1 = row0 + nx * 2
      row2 = row1 + nx * 2
      row3 = row2 + nx * 2
      for (let x = 0; x < nx; x += 4) {
        if (bIn + 3 > comp_buf_size) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)

        /* check if 3-byte encoded flat field */
        if (compressed_data[inp + 2]! >= (13 << 2)) {
          unpack3(compressed_data, inp, s)
          inp += 3
          bIn += 3
        } else {
          if (bIn + 14 > comp_buf_size) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
          unpack14(compressed_data, inp, s)
          inp += 14
          bIn += 14
        }

        if (curc.p_linear) convertToLinear(s, logTable)

        // n counts uint16 elements here (upstream: bytes)
        n = (x + 3 < nx) ? 4 : (nx - x)
        for (let i = 0; i < n; ++i) {
          sv.setUint16(row0 + i * 2, s[i]!, true)
          if (y + 1 < ny) sv.setUint16(row1 + i * 2, s[4 + i]!, true)
          if (y + 2 < ny) sv.setUint16(row2 + i * 2, s[8 + i]!, true)
          if (y + 3 < ny) sv.setUint16(row3 + i * 2, s[12 + i]!, true)
        }
        row0 += 8
        row1 += 8
        row2 += 8
        row3 += 8
      }
    }
    scratch += nBytes
  }

  /* now put it back so each scanline has channel data */
  bIn = 0
  for (let y = 0; y < decode.chunk.height; ++y) {
    const cury = y + decode.chunk.start_y

    scratch = 0
    for (let c = 0; c < decode.channels.length; ++c) {
      const curc = decode.channels[c]!

      nx = curc.width
      ny = curc.height
      bpl = nx * curc.bytes_per_element
      nBytes = ny * bpl

      if (nBytes === 0) continue

      tmp = scratch
      if (curc.y_samples > 1) {
        if ((cury % curc.y_samples) !== 0) {
          scratch += nBytes
          continue
        }
        tmp += Math.trunc(y / curc.y_samples) * bpl
      } else
        tmp += y * bpl

      if (bIn + bpl > uncomp_buf_size) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)

      uncompressed_data.set(scratch_buffer_1.subarray(tmp, tmp + bpl), out)

      bIn += bpl
      out += bpl
      scratch += nBytes
    }
  }

  decode.bytes_decompressed = uncomp_buf_size
}

/** internal_b44.c:660-684 */
function compute_scratch_buffer_size(decode: ExrDecodePipeline, uncompressed_size: number): number {
  let ret = uncompressed_size
  let comp = 0

  for (let c = 0; c < decode.channels.length; ++c) {
    const curc = decode.channels[c]!

    let nx = curc.width
    let ny = curc.height

    if (nx % 4) nx += 4 - nx % 4
    if (ny % 4) ny += 4 - ny % 4

    comp += ny * nx * curc.bytes_per_element
  }
  if (comp > ret) ret = comp
  return ret
}

/** internal_b44.c:688-715 (and, identically, 717-744 for B44A). The
 *  size_t overflow check cannot trigger for a JS allocation and is
 *  omitted; a fresh scratch buffer stands in for
 *  internal_decode_alloc_buffer. */
function undo_b44_common(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): void {
  const scratch_sz = compute_scratch_buffer_size(decode, unpacked.length)
  const scratch = new Uint8Array(scratch_sz)

  const logTable = exrcore_ensure_b44_tables()

  uncompress_b44_impl(decode, packed, unpacked, scratch, logTable)
}

/** internal_b44.c:688-715 */
export async function internal_exr_undo_b44(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  undo_b44_common(decode, packed, unpacked)
}

/** internal_b44.c:717-744 */
export async function internal_exr_undo_b44a(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  undo_b44_common(decode, packed, unpacked)
}
