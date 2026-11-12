// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_rle.c
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_rle.c:128-230):
// internal_rle_decompress, unpredict_and_reorder and internal_exr_undo_rle.
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

import { EXR_ERR_CORRUPT_CHUNK, ExrError, type ExrDecodePipeline } from './openexrCoreCoding.ts'

/** internal_rle.c:128-168: the decoded byte count, 0 on bad data. */
export function internal_rle_decompress(out: Uint8Array, outsz: number, src: Uint8Array, packsz: number): number {
  let unpackbytes = 0, outbytes = 0, inp = 0, dst = 0
  while (unpackbytes < packsz) {
    const b = (src[inp]! << 24) >> 24
    if (b < 0) {
      const count = -b
      inp++
      ++unpackbytes
      if (unpackbytes + count > packsz) return 0
      if (outbytes + count > outsz) return 0
      out.set(src.subarray(inp, inp + count), dst)
      inp += count
      dst += count
      unpackbytes += count
      outbytes += count
    } else {
      let count = b
      inp++
      if (unpackbytes + 2 > packsz) return 0
      unpackbytes += 2
      ++count
      if (outbytes + count > outsz) return 0
      out.fill(src[inp]!, dst, dst + count)
      dst += count
      outbytes += count
      ++inp
    }
  }
  return outbytes
}

/** internal_rle.c:170-193 */
function unpredict_and_reorder(out: Uint8Array, scratch: Uint8Array, packedbytes: number): void {
  for (let t1 = 1; t1 < packedbytes; ++t1) scratch[t1] = (scratch[t1 - 1]! + scratch[t1]! - 128) & 0xff
  let t1 = 0, t2 = (packedbytes + 1) >> 1
  for (let s = 0; s < packedbytes;) {
    out[s++] = scratch[t1++]!
    if (s < packedbytes) out[s++] = scratch[t2++]!
  }
}

/** internal_rle.c:195-230 */
export async function internal_exr_undo_rle(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  if (packed.length === 0) {
    decode.bytes_decompressed = 0
    return
  }
  const outsz = unpacked.length
  const scratch = new Uint8Array(outsz)
  const unpackb = internal_rle_decompress(scratch, outsz, packed, packed.length)
  if (unpackb !== outsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  unpredict_and_reorder(unpacked, scratch, unpackb)
  decode.bytes_decompressed = unpackb
}
