// Ported from OpenUSD 26.11.1: pxr/base/tf/pxrLZ4/lz4.cpp
// LZ4: Copyright (C) 2011-present, Yann Collet. BSD 2-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// LZ4 block format — compressor and decompressor. Mirrors the vendored LZ4
// library at pxr/base/tf/pxrLZ4/lz4.cpp (LZ4_compress_default /
// LZ4_decompress_safe), producing the block format spec'd in AOUSD 16.3.7.
//
// An LZ4 stream is NOT unique: the exact bytes depend on the match-finder, so
// output is byte-for-byte different from the C library — but it is a VALID LZ4
// stream (real matches, real ratio) that decompresses to the exact input.
//
// Block format:
//   sequence := [token][lit-len exts][literals][offset LE16][match-len exts]
//   token high nibble = min(litLen,15), low nibble = min(matchLen-4,15)
//   length >= 15 spills into extension bytes of 255 until a byte < 255.
// Parsing restrictions honored by the encoder:
//   MINMATCH=4, LASTLITERALS=5, MFLIMIT=12 (last match ends >= 12 bytes from
//   end-of-block; final literal run is a literal-only sequence with no match).

const MINMATCH = 4
const LASTLITERALS = 5
const MFLIMIT = 12 // = LASTLITERALS + 1 + (MINMATCH - 1) + 4 conceptually; the LZ4 constant
const ML_MASK = 0x0f
const RUN_MASK = 0x0f
export const LZ4_MAX_INPUT_SIZE = 0x7e000000

// Hash table sizing mirrors LZ4_MEMORY_USAGE=14 (lz4.h): 1<<14 entries, hashing
// the 4 bytes at a position into a 12-bit slot (LZ4_HASHLOG = 14-2).
const HASH_LOG = 12
const HASH_TABLE_SIZE = 1 << HASH_LOG
// Skip strength for incompressible data (LZ4's acceleration heuristic).
const SKIP_TRIGGER = 6

// Worst-case compressed size for n input bytes (LZ4_compressBound).
export function lz4CompressBound(n: number): number {
  return n + Math.floor(n / 255) + 16
}

function hash4(v: number): number {
  // 4 bytes -> HASH_LOG-bit hash. (v * 2654435761) >>> (32 - HASH_LOG),
  // using the standard LZ4 multiplier; >>> 0 keeps it an unsigned 32-bit mul.
  return (Math.imul(v, 2654435761) >>> (32 - HASH_LOG)) & (HASH_TABLE_SIZE - 1)
}

function read32(data: Uint8Array, i: number): number {
  // little-endian, matches how LZ4 reads 4 bytes for hashing/matching
  return (data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24)) >>> 0
}

// Compress one LZ4 block (no framing). Returns the block bytes.
export function compressBlock(data: Uint8Array): Uint8Array {
  const n = data.length
  // Worst-case bound (LZ4_compressBound): n + n/255 + 16.
  const out = new Uint8Array(n + Math.floor(n / 255) + 16)
  let op = 0

  // If too short to ever form a match within the parsing restrictions, emit a
  // single literal-only sequence covering the whole input.
  if (n < MFLIMIT) {
    return emitFinalLiterals(data, 0, n, out, op)
  }

  const hashTable = new Int32Array(HASH_TABLE_SIZE).fill(-1)
  const mflimit = n - MFLIMIT // positions > mflimit cannot start a match
  const matchlimit = n - LASTLITERALS // a match may not read/extend past here

  let anchor = 0 // start of the current pending literal run
  let ip = 0

  // Prime the table with the first position, then advance.
  hashTable[hash4(read32(data, ip))] = ip
  ip++

  let searchMatchNb = 1 << SKIP_TRIGGER

  while (ip <= mflimit) {
    // ---- find a match ----
    let match = -1
    let step = 1
    let searchTries = searchMatchNb >> SKIP_TRIGGER
    for (;;) {
      if (ip > mflimit) break
      const h = hash4(read32(data, ip))
      const candidate = hashTable[h]!
      hashTable[h] = ip
      if (
        candidate >= 0 &&
        candidate < ip &&
        // matches within 64KB window (offset fits in uint16)
        ip - candidate <= 0xffff &&
        read32(data, candidate) === read32(data, ip)
      ) {
        match = candidate
        break
      }
      // no match: advance with acceleration on incompressible stretches
      ip += step
      step = ++searchTries >> SKIP_TRIGGER
    }
    if (match < 0) break

    // ip now points at a confirmed 4-byte match against `match`.
    // ---- back up: extend the match backwards into pending literals ----
    while (ip > anchor && match > 0 && data[ip - 1] === data[match - 1]) {
      ip--
      match--
    }

    // ---- emit literals [anchor, ip) ----
    const litLen = ip - anchor
    const tokenPos = op++
    if (litLen >= RUN_MASK) {
      out[tokenPos] = RUN_MASK << 4
      let rem = litLen - RUN_MASK
      while (rem >= 255) { out[op++] = 255; rem -= 255 }
      out[op++] = rem
    } else {
      out[tokenPos] = litLen << 4
    }
    for (let i = 0; i < litLen; i++) out[op++] = data[anchor + i]!

    // ---- emit offset (LE16) ----
    const offset = ip - match
    out[op++] = offset & 0xff
    out[op++] = (offset >> 8) & 0xff

    // ---- count match length beyond MINMATCH ----
    let mip = ip + MINMATCH
    let mref = match + MINMATCH
    while (mip < matchlimit && data[mip] === data[mref]) { mip++; mref++ }
    const matchLen = mip - ip // total bytes matched (>= MINMATCH)
    const mlCode = matchLen - MINMATCH
    if (mlCode >= ML_MASK) {
      out[tokenPos] |= ML_MASK
      let rem = mlCode - ML_MASK
      while (rem >= 255) { out[op++] = 255; rem -= 255 }
      out[op++] = rem
    } else {
      out[tokenPos] |= mlCode
    }

    // advance past the match
    ip = mip
    anchor = ip
    if (ip > mflimit) break

    // seed the table at a couple of positions inside what we just emitted so
    // future matches can reference here; mirror LZ4's "fill in a few hashes".
    hashTable[hash4(read32(data, ip - 2))] = ip - 2
    // (ip itself gets hashed at the top of the next search iteration)
    searchMatchNb = 1 << SKIP_TRIGGER
  }

  // ---- final literals [anchor, n): literal-only sequence, no match ----
  return emitFinalLiterals(data, anchor, n, out, op)
}

// Emit the trailing literal run as a final literal-only sequence and return the
// finished block (sliced to length).
function emitFinalLiterals(
  data: Uint8Array, anchor: number, n: number, out: Uint8Array, op: number,
): Uint8Array {
  const litLen = n - anchor
  if (litLen >= RUN_MASK) {
    out[op++] = RUN_MASK << 4
    let rem = litLen - RUN_MASK
    while (rem >= 255) { out[op++] = 255; rem -= 255 }
    out[op++] = rem
  } else {
    out[op++] = litLen << 4
  }
  for (let i = 0; i < litLen; i++) out[op++] = data[anchor + i]!
  return out.subarray(0, op)
}

// Decompress one LZ4 block (no framing) into at most maxOutput bytes.
export function decompressBlock(src: Uint8Array, maxOutput: number): Uint8Array {
  const dst = new Uint8Array(maxOutput)
  let si = 0
  let di = 0

  while (si < src.length) {
    const token = src[si++]!
    let litLen = (token >> 4) & 0xf

    if (litLen === 15) {
      let extra: number
      do {
        extra = src[si++]!
        litLen += extra
      } while (extra === 255)
    }

    // Copy literals
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

    // Copy match (may overlap — must copy byte by byte)
    let matchSrc = di - offset
    for (let i = 0; i < matchLen; i++) {
      dst[di++] = dst[matchSrc++]!
    }
  }

  return dst.subarray(0, di)
}
