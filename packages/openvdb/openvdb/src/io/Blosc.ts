// Portions ported from c-blosc 1.21, including: blosc/blosc.c,
//  internal-complibs/lz4-1.9.3/lz4.c
// Copyright (C) 2009-2018 Francesc Alted. Copyright (C) 2019-present Blosc
//  Development team. BSD 3-Clause License.
// LZ4: Copyright (C) 2011-present, Yann Collet. BSD 2-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Blosc 1.x chunk decompressor — the subset OpenVDB files use: LZ4
// compressor, byte shuffle, typesize 4 (io/Compression.cc bloscCompress
// hard-codes those; nanovdb's IO.h likewise). The chunk format follows
// c-blosc v1.21 README_CHUNK_FORMAT.rst / blosc.c.
//
// The LZ4 decoder below handles the raw LZ4 block format only (no crate
// framing).

const BLOSC_MEMCPYED = 0x2
const BLOSC_DONT_SPLIT = 0x10
const BLOSC_MAX_OVERHEAD = 16
const MAX_SPLITS = 16
const MIN_BUFFERSIZE = 128

const COMPRESSOR_BLOSCLZ = 0
const COMPRESSOR_LZ4 = 1

/** Decompress one raw LZ4 block (not LZ4 frame) into dst at dstOff..dstOff+outLen. */
function lz4DecompressBlock(src: Uint8Array, dst: Uint8Array, dstOff: number, outLen: number): void {
  let si = 0
  let di = dstOff
  const end = dstOff + outLen
  while (si < src.length && di < end) {
    const token = src[si++]!
    let litLen = (token >> 4) & 0xf
    if (litLen === 15) {
      let extra: number
      do {
        extra = src[si++]!
        litLen += extra
      } while (extra === 255)
    }
    dst.set(src.subarray(si, si + litLen), di)
    si += litLen
    di += litLen
    if (si >= src.length) break
    const offset = src[si]! | (src[si + 1]! << 8)
    si += 2
    let matchLen = (token & 0xf) + 4
    if (matchLen - 4 === 15) {
      let extra: number
      do {
        extra = src[si++]!
        matchLen += extra
      } while (extra === 255)
    }
    let matchSrc = di - offset
    for (let i = 0; i < matchLen; i++) dst[di++] = dst[matchSrc++]!
  }
  if (di !== end) throw new Error(`LZ4 block decoded ${di - dstOff} bytes, expected ${outLen}`)
}

/** Byte unshuffle: src holds typesize planes of blocksize/typesize bytes each. */
function unshuffle(typesize: number, blocksize: number, src: Uint8Array, dst: Uint8Array, dstOff: number): void {
  const n = Math.floor(blocksize / typesize)
  const trailing = blocksize - n * typesize
  for (let j = 0; j < typesize; ++j) {
    const plane = j * n
    for (let i = 0; i < n; ++i) {
      dst[dstOff + i * typesize + j] = src[plane + i]!
    }
  }
  // blosc shuffles only the multiple-of-typesize prefix; leftover bytes are verbatim
  for (let i = 0; i < trailing; ++i) {
    dst[dstOff + n * typesize + i] = src[n * typesize + i]!
  }
}

/** Decompress a Blosc 1.x chunk; returns exactly `expectedBytes` bytes. */
export function bloscDecompress(chunk: Uint8Array, expectedBytes: number): Uint8Array {
  if (chunk.length < BLOSC_MAX_OVERHEAD) throw new Error('Blosc chunk shorter than its header')
  const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  const flags = chunk[2]!
  const typesize = chunk[3]!
  const nbytes = dv.getUint32(4, true)
  const blocksize = dv.getUint32(8, true)
  if (nbytes !== expectedBytes) {
    throw new Error(`Blosc chunk holds ${nbytes} bytes, expected ${expectedBytes}`)
  }
  const dst = new Uint8Array(nbytes)

  if (flags & BLOSC_MEMCPYED) {
    dst.set(chunk.subarray(BLOSC_MAX_OVERHEAD, BLOSC_MAX_OVERHEAD + nbytes))
    return dst
  }

  const compressor = (flags >> 5) & 0x7
  if (compressor !== COMPRESSOR_LZ4 && compressor !== COMPRESSOR_BLOSCLZ) {
    throw new Error(`Blosc compressor code ${compressor} not supported (OpenVDB writes LZ4)`)
  }
  if (compressor === COMPRESSOR_BLOSCLZ) {
    // OpenVDB never writes blosclz; refuse rather than misdecode
    throw new Error('Blosc blosclz codec not supported (OpenVDB writes LZ4)')
  }
  const doShuffle = (flags & 0x1) !== 0 && typesize > 1
  const dontSplit = (flags & BLOSC_DONT_SPLIT) !== 0

  const nblocks = Math.ceil(nbytes / blocksize)
  const leftover = nbytes % blocksize
  // int32 block-start offsets relative to the chunk start
  const bstarts: number[] = []
  for (let i = 0; i < nblocks; ++i) bstarts.push(dv.getInt32(BLOSC_MAX_OVERHEAD + 4 * i, true))

  const tmp = new Uint8Array(blocksize)
  for (let b = 0; b < nblocks; ++b) {
    const isLeftover = b === nblocks - 1 && leftover > 0
    const bsize = isLeftover ? leftover : blocksize
    const nsplits =
      !dontSplit && typesize <= MAX_SPLITS && Math.floor(blocksize / typesize) >= MIN_BUFFERSIZE && !isLeftover
        ? typesize
        : 1
    const neblock = Math.floor(bsize / nsplits)
    let src = bstarts[b]!
    for (let s = 0; s < nsplits; ++s) {
      const cbytes = dv.getInt32(src, true)
      src += 4
      if (cbytes === neblock) {
        tmp.set(chunk.subarray(src, src + neblock), s * neblock)
      } else {
        lz4DecompressBlock(chunk.subarray(src, src + cbytes), tmp, s * neblock, neblock)
      }
      src += cbytes
    }
    if (doShuffle && nsplits === typesize) {
      unshuffle(typesize, bsize, tmp, dst, b * blocksize)
    } else if (doShuffle) {
      // unsplit but shuffled block (e.g. leftover): planes span the block
      unshuffle(typesize, bsize, tmp, dst, b * blocksize)
    } else {
      dst.set(tmp.subarray(0, bsize), b * blocksize)
    }
  }
  return dst
}
