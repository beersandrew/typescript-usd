// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_huf.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_piz.c
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore), decode side only:
//   internal_huf.c:18-28      constants
//   internal_huf.c:50-71      HufDec, hufLength, hufCode
//   internal_huf.c:111-124    getBits
//   internal_huf.c:146-192    hufCanonicalCodeTable
//   internal_huf.c:535-591    hufUnpackEncTable
//   internal_huf.c:601-731    hufClearDecTable / hufBuildDecTable / hufFreeDecTable
//   internal_huf.c:863-1013   getChar / getCode / hufDecode   (the original decoder)
//   internal_huf.c:1032-1038  readUInt
//   internal_huf.c:1043-1819  FastHufDecoder: buildTables, refill, read_bits,
//                             initialize, decode_enabled, decode (the fast decoder)
//   internal_huf.c:1913-1994  internal_huf_decompress
//   internal_piz.c:18-19      USHORT_RANGE / BITMAP_SIZE
//   internal_piz.c:80-116     reverseLutFromBitmap / applyLut
//   internal_piz.c:139-229    wdec14_4 / wdec14 / wdec16
//   internal_piz.c:341-461    wav_2D_decode
//   internal_piz.c:625-786    internal_exr_undo_piz
// Divergences (noted at each site):
//   - uint64_t arithmetic is carried as (hi, lo) uint32 pairs in the fast
//     decoder and as BigInt in the original decoder's bit accumulator; the
//     results are the same modulo 2^64 values upstream computes.
//   - fasthuf_decode_enabled() answers 1, as on the native reference build
//     (macOS, Apple clang), so the fast decoder is selected exactly when
//     upstream selects it there (nBits > 128).
//   - Scratch / spare buffers are allocated per call rather than held by the
//     decode pipeline, so the spare-size check has no counterpart.
//   - priv_from_native16 is written out as explicit little-endian stores.
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

import {
  EXR_ERR_CORRUPT_CHUNK,
  EXR_ERR_INVALID_ARGUMENT,
  EXR_ERR_OUT_OF_MEMORY,
  EXR_ERR_SUCCESS,
  ExrError,
  type ExrDecodePipeline,
} from './openexrCoreCoding.ts'

/**************************************/
// internal_huf.c:18-28

const HUF_ENCBITS = 16
const HUF_DECBITS = 14

const HUF_ENCSIZE = (1 << HUF_ENCBITS) + 1
const HUF_DECSIZE = 1 << HUF_DECBITS
const HUF_DECMASK = HUF_DECSIZE - 1

const SHORT_ZEROCODE_RUN = 59
const LONG_ZEROCODE_RUN = 63
const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN
// const LONGEST_LONG_RUN = 255 + SHORTEST_LONG_RUN

const M64 = 0xffffffffffffffffn

/** A result other than EXR_ERR_SUCCESS, carried out of the helpers. */
class HufResult {
  constructor(readonly code: number, readonly message?: string) {}
}

function fail(code: number, message?: string): never {
  throw new HufResult(code, message)
}

/** internal_huf.c:50-55 HufDec, as a structure of arrays over HUF_DECSIZE
 *  entries; p holds the long-code symbol lists (null when none). */
interface HufDecTable {
  len: Int32Array
  lit: Uint32Array
  p: (number[] | null)[]
}

/**************************************/

// internal_huf.c:64 hufLength. The encoding table entries hold
// code << 6 | length; canonical codes are numerically small (they are bounded
// by the per-length symbol counts), so they are exact in a double.
function hufLength(code: number): number {
  return code % 64
}

// internal_huf.c:71 hufCode
function hufCode(code: number): number {
  return Math.floor(code / 64)
}

/** Reads bytes for getBits / fasthuf_read_bits. */
interface BitReader {
  c: number   // bit accumulator; only its low lc bits are ever read
  lc: number
  pos: number // index into the input
}

/** internal_huf.c:111-124 getBits. Divergence: the accumulator keeps only its
 *  low 24 bits (it never holds more than 15 live bits), where upstream's
 *  uint64_t keeps shifting older bits off the top. */
function getBits(nBits: number, r: BitReader, inp: Uint8Array): number {
  while (r.lc < nBits) {
    r.c = ((r.c << 8) | (inp[r.pos++] ?? 0)) & 0xffffff
    r.lc += 8
  }
  r.lc -= nBits
  return (r.c >>> r.lc) & ((1 << nBits) - 1)
}

//
// ENCODING TABLE BUILDING & (UN)PACKING
//

//
// Build a "canonical" Huffman code table:
//	- for each (uncompressed) symbol, hcode contains the length
//	  of the corresponding code (in the compressed data)
//	- canonical codes are computed and stored in hcode
//	- the rules for constructing canonical codes are as follows:
//	  * shorter codes (if filled with zeroes to the right)
//	    have a numerically higher value than longer codes
//	  * for codes with the same length, numerical values
//	    increase with numerical symbol values
//	- because the canonical code table can be constructed from
//	  symbol lengths alone, the code table can be transmitted
//	  without sending the actual code values
//	- see http://www.compressconsult.com/huffman/
//

/** internal_huf.c:146-192 hufCanonicalCodeTable */
function hufCanonicalCodeTable(hcode: Float64Array): void {
  const n = new Float64Array(59)
  let c: number

  //
  // For each i from 0 through 58, count the
  // number of different codes of length i, and
  // store the count in n[i].
  //

  for (let i = 0; i < HUF_ENCSIZE; ++i) n[hcode[i]!]! += 1

  //
  // For each i from 58 through 1, compute the
  // numerically lowest code with length i, and
  // store that code in n[i].
  //

  c = 0

  for (let i = 58; i > 0; --i) {
    const nc = Math.floor((c + n[i]!) / 2)
    n[i] = c
    c = nc
  }

  //
  // hcode[i] contains the length, l, of the
  // code for symbol i.  Assign the next available
  // code of length l to the symbol and store both
  // l and the code in hcode[i].
  //

  for (let i = 0; i < HUF_ENCSIZE; ++i) {
    const l = hcode[i]!
    if (l > 0) hcode[i] = l + (n[l]!++) * 64
  }
}

//
// Unpack an encoding table packed by hufPackEncTable():
//

/** internal_huf.c:535-591 hufUnpackEncTable. `start` / the returned pos
 *  index `inp`; nLeft is updated in `state`. */
function hufUnpackEncTable(
  inp: Uint8Array,
  state: { pos: number, nLeft: number }, // io: ptr to packed table, bytes left
  im: number,                            // i : min hcode index
  iM: number,                            // i : max hcode index
  hcode: Float64Array,                   // o : encoding table [HUF_ENCSIZE]
): number {
  const start = state.pos
  const r: BitReader = { c: 0, lc: 0, pos: start }
  const ni = state.nLeft
  let nr: number
  let l: number, zerun: number

  hcode.fill(0)
  for (; im <= iM; im++) {
    nr = r.pos - start
    if (r.lc < 6 && nr >= ni) return EXR_ERR_OUT_OF_MEMORY

    l = hcode[im] = getBits(6, r, inp) // code length

    if (l === LONG_ZEROCODE_RUN) {
      nr = r.pos - start
      if (r.lc < 8 && nr >= ni) return EXR_ERR_OUT_OF_MEMORY

      zerun = getBits(8, r, inp) + SHORTEST_LONG_RUN

      if (im + zerun > iM + 1) return EXR_ERR_CORRUPT_CHUNK

      while (zerun--) hcode[im++] = 0

      im--
    } else if (l >= SHORT_ZEROCODE_RUN) {
      zerun = l - SHORT_ZEROCODE_RUN + 2

      if (im + zerun > iM + 1) return EXR_ERR_CORRUPT_CHUNK

      while (zerun--) hcode[im++] = 0

      im--
    }
  }

  nr = r.pos - start
  state.nLeft -= nr
  state.pos = r.pos

  hufCanonicalCodeTable(hcode)
  return EXR_ERR_SUCCESS
}

//
// DECODING TABLE BUILDING
//

//
// Clear a newly allocated decoding table so that it contains only zeroes.
//

/** internal_huf.c:601-605 hufClearDecTable */
function hufClearDecTable(): HufDecTable {
  return {
    len: new Int32Array(HUF_DECSIZE),
    lit: new Uint32Array(HUF_DECSIZE),
    p: new Array<number[] | null>(HUF_DECSIZE).fill(null),
  }
}

// x >> s for the small (< 2^32) canonical codes, where s may reach 63:
// JavaScript shift counts are taken modulo 32.
function shr(x: number, s: number): number {
  return s >= 32 ? 0 : Math.floor(x / 2 ** s)
}

//
// Build a decoding hash table based on the encoding table hcode:
//	- short codes (<= HUF_DECBITS) are resolved with a single table access;
//	- long code entry allocations are not optimized, because long codes are
//	  unfrequent;
//	- decoding tables are used by hufDecode();
//

/** internal_huf.c:615-713 hufBuildDecTable */
function hufBuildDecTable(hcode: Float64Array, im: number, iM: number, hdecod: HufDecTable): number {
  //
  // Init hashtable & loop on all codes.
  // Assumes that hufClearDecTable(hdecod) has already been called.
  //

  for (; im <= iM; im++) {
    const c = hufCode(hcode[im]!)
    const l = hufLength(hcode[im]!)

    if (shr(c, l)) {
      //
      // Error: c is supposed to be an l-bit code,
      // but c contains a value that is greater
      // than the largest l-bit number.
      //

      return EXR_ERR_CORRUPT_CHUNK
    }

    if (l > HUF_DECBITS) {
      //
      // Long code: add a secondary entry
      //

      const pl = shr(c, l - HUF_DECBITS)

      if (hdecod.len[pl]) {
        //
        // Error: a short code has already
        // been stored in table entry *pl.
        //

        return EXR_ERR_CORRUPT_CHUNK
      }

      hdecod.lit[pl]!++

      // (upstream reallocates pl->p one entry longer and copies)
      let p = hdecod.p[pl]
      if (!p) hdecod.p[pl] = p = []
      p[hdecod.lit[pl]! - 1] = im
    } else if (l) {
      //
      // Short code: init all primary entries
      //

      let pl = c * (1 << (HUF_DECBITS - l))

      for (let i = 1 << (HUF_DECBITS - l); i > 0; i--, pl++) {
        if (hdecod.len[pl] || hdecod.p[pl]) {
          //
          // Error: a short code or a long code has
          // already been stored in table entry *pl.
          //

          return EXR_ERR_CORRUPT_CHUNK
        }

        hdecod.len[pl] = l
        hdecod.lit[pl] = im
      }
    }
  }
  return EXR_ERR_SUCCESS
}

// internal_huf.c:719-731 hufFreeDecTable: nothing to free (garbage collected).

//
// DECODING
//

/** The original decoder's state: getChar / getCode are macros upstream
 *  (internal_huf.c:863-896). Divergence: the uint64_t accumulator c is a
 *  BigInt masked to 64 bits; this decoder only runs on inputs of at most
 *  128 bits when the fast decoder is enabled. */
interface HufDecodeState {
  c: bigint
  lc: number
  in: number
  out: number
}

// internal_huf.c:863-865 getChar
function getChar(s: HufDecodeState, inp: Uint8Array): void {
  s.c = ((s.c << 8n) | BigInt(inp[s.in++]!)) & M64
  s.lc += 8
}

// internal_huf.c:867-896 getCode
function getCode(po: number, rlc: number, s: HufDecodeState, inp: Uint8Array, ie: number,
  out: Uint16Array, ob: number, oe: number): void {
  if (po === rlc) {
    if (s.lc < 8) {
      if (s.in >= ie) fail(EXR_ERR_OUT_OF_MEMORY)
      getChar(s, inp)
    }

    s.lc -= 8

    let cs = Number((s.c >> BigInt(s.lc)) & 0xffn)

    if (s.out + cs > oe) fail(EXR_ERR_CORRUPT_CHUNK)
    else if (s.out - 1 < ob) fail(EXR_ERR_OUT_OF_MEMORY)

    const sv = out[s.out - 1]!

    while (cs-- > 0) out[s.out++] = sv
  } else if (s.out < oe) {
    out[s.out++] = po
  } else {
    fail(EXR_ERR_CORRUPT_CHUNK)
  }
}

//
// Decode (uncompress) ni bits based on encoding & decoding tables:
//

/** internal_huf.c:902-1013 hufDecode */
function hufDecode(
  hcode: Float64Array,   // i : encoding table
  hdecod: HufDecTable,   // i : decoding table
  inp: Uint8Array,       // i : compressed input buffer
  inStart: number,
  ni: number,            // i : input size (in bits)
  rlc: number,           // i : run-length code
  no: number,            // i : expected output size (count of uint16 items)
  out: Uint16Array,
): number {
  const s: HufDecodeState = { c: 0n, lc: 0, in: inStart, out: 0 }
  const outb = 0
  const oe = no
  const ie = inStart + Math.floor((ni + 7) / 8) // input byte size

  //
  // Loop on input bytes
  //

  while (s.in < ie) {
    getChar(s, inp)

    //
    // Access decoding table
    //

    while (s.lc >= HUF_DECBITS) {
      const pl = Number((s.c >> BigInt(s.lc - HUF_DECBITS)) & BigInt(HUF_DECMASK))

      if (hdecod.len[pl]) {
        //
        // Get short code
        //

        if (hdecod.len[pl]! > s.lc) return EXR_ERR_CORRUPT_CHUNK

        s.lc -= hdecod.len[pl]!
        getCode(hdecod.lit[pl]!, rlc, s, inp, ie, out, outb, oe)
      } else {
        let j: number
        const decbuf = hdecod.p[pl]
        if (!decbuf) return EXR_ERR_CORRUPT_CHUNK // wrong code

        //
        // Search long code
        //

        for (j = 0; j < hdecod.lit[pl]!; j++) {
          const l = hufLength(hcode[decbuf[j]!]!)

          while (s.lc < l && s.in < ie) { // get more bits
            getChar(s, inp)
          }

          if (s.lc >= l) {
            if (BigInt(hufCode(hcode[decbuf[j]!]!)) ===
              ((s.c >> BigInt(s.lc - l)) & ((1n << BigInt(l)) - 1n))) {
              //
              // Found : get long code
              //

              s.lc -= l
              getCode(decbuf[j]!, rlc, s, inp, ie, out, outb, oe)
              break
            }
          }
        }

        if (j === hdecod.lit[pl]) return EXR_ERR_CORRUPT_CHUNK
      }
    }
  }

  //
  // Get remaining (short) codes
  //

  const i = (8 - ni) & 7
  s.c >>= BigInt(i)
  s.lc -= i

  while (s.lc > 0) {
    const pl = Number((s.c << BigInt(HUF_DECBITS - s.lc)) & BigInt(HUF_DECMASK))

    if (hdecod.len[pl]) {
      if (hdecod.len[pl]! > s.lc) return EXR_ERR_CORRUPT_CHUNK
      s.lc -= hdecod.len[pl]!
      getCode(hdecod.lit[pl]!, rlc, s, inp, ie, out, outb, oe)
    } else {
      return EXR_ERR_CORRUPT_CHUNK
    }
  }

  if (s.out !== oe) return EXR_ERR_OUT_OF_MEMORY
  return EXR_ERR_SUCCESS
}

/** internal_huf.c:1032-1038 readUInt */
function readUInt(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0
}

/**************************************/

// Longest compressed code length that ImfHuf supports (58 bits)
const MAX_CODE_LEN = 58

// Number of bits in our acceleration table. Should match all
// codes up to TABLE_LOOKUP_BITS in length.

// old c++ code was only 12 bits, not 14 as you might expect from the encode
// but only having a memory page for the lookup does seem marginally faster
const TABLE_LOOKUP_BITS = 12
// const INDEX_BIT_SHIFT = 64 - TABLE_LOOKUP_BITS  (buffer >> 52 is hi >>> 20)

/** internal_huf.c:1084-1130 FastHufDecoder. Divergence: each uint64_t table
 *  is held as hi / lo uint32 halves (and _ljOffset as BigInt, with an exact
 *  double form for code lengths <= 32). */
interface FastHufDecoder {
  // RLE symbol written by the encoder.
  // This could be 65536, so beware
  // when you use shorts to hold things.
  _rleSymbol: number

  // Number of symbols in the codebook.
  _numSymbols: number

  _minCodeLength: number // Minimum code length, in bits.
  _maxCodeLength: number // Maximum code length, in bits.

  // Maps Ids to symbols. Ids are a symbol ordering sorted first in
  // terms of code length, and by code within the same length. Ids
  // run from 0 to mNumSymbols-1.
  _idToSymbol: Uint32Array

  // the 'left justified base' table. Takes base[i] (i = code length)
  // and 'left justifies' it into an uint64_t
  // Also includes a sentinel terminator
  _ljBaseHi: Uint32Array
  _ljBaseLo: Uint32Array

  // There are some other terms that can be folded into constants when
  // taking the 'left justified' decode path. This holds those constants,
  // indexed by code length
  _ljOffset: bigint[]
  _ljOffsetSmall: Float64Array

  //
  // We can accelerate the 'left justified' processing by running the
  // top TABLE_LOOKUP_BITS through a LUT, to find the symbol and code
  // length. These are those acceleration tables.
  //
  // Even though our eventual 'symbols' are ushort's, the encoder adds
  // a symbol to indicate RLE. So with a dense code book, we could
  // have 2^16+1 codes, hence 'symbol' could  be bigger than 16 bits.
  //
  _tableSymbol: Int32Array
  _tableCodeLen: Uint8Array
  _tableMinHi: number
  _tableMinLo: number
}

/** _ljOffset[codeLen] + (value >> (64 - codeLen)) modulo 2^64 (value is
 *  hi:lo), returned when it is below _numSymbols, else -1. */
function fastHufId(fhd: FastHufDecoder, codeLen: number, hi: number, lo: number): number {
  if (codeLen <= 32) {
    // exact: |_ljOffsetSmall| < 2^33, and a negative sum is a huge uint64_t
    const id = fhd._ljOffsetSmall[codeLen]! + (codeLen === 0 ? 0 : hi >>> (32 - codeLen))
    return id >= 0 && id < fhd._numSymbols ? id : -1
  }
  const v = ((BigInt(hi) << 32n) | BigInt(lo)) >> BigInt(64 - codeLen)
  const id = (fhd._ljOffset[codeLen]! + v) & M64
  return id < BigInt(fhd._numSymbols) ? Number(id) : -1
}

/** internal_huf.c:1132-1231 FastHufDecoder_buildTables */
function FastHufDecoder_buildTables(fhd: FastHufDecoder, base: bigint[], offset: bigint[]): void {
  let minIdx = TABLE_LOOKUP_BITS
  const ljBase: bigint[] = new Array<bigint>(MAX_CODE_LEN + 2)

  //
  // Build the 'left justified' base table, by shifting base left..
  //

  for (let i = 0; i <= MAX_CODE_LEN; ++i) {
    if (base[i] !== M64) {
      ljBase[i] = (base[i]! << BigInt(64 - i)) & M64
    } else {
      //
      // Unused code length - insert dummy values
      //

      ljBase[i] = M64
    }
  }
  ljBase[MAX_CODE_LEN + 1] = 0n /* sentinel for brute force lookup */
  for (let i = 0; i <= MAX_CODE_LEN + 1; ++i) {
    fhd._ljBaseHi[i] = Number(ljBase[i]! >> 32n)
    fhd._ljBaseLo[i] = Number(ljBase[i]! & 0xffffffffn)
  }

  //
  // Combine some terms into a big fat constant, which for
  // lack of a better term we'll call the 'left justified'
  // offset table (because it serves the same function
  // as 'offset', when using the left justified base table.
  //

  fhd._ljOffset[0] = (offset[0]! - ljBase[0]!) & M64
  fhd._ljOffsetSmall[0] = Number(offset[0]!) - Number(ljBase[0]!) // unused (no codes of length 0)
  for (let i = 1; i <= MAX_CODE_LEN; ++i) {
    const sub = ljBase[i]! >> BigInt(64 - i)
    fhd._ljOffset[i] = (offset[i]! - sub) & M64
    if (i <= 32) fhd._ljOffsetSmall[i] = Number(offset[i]!) - Number(sub)
  }

  //
  // Build the acceleration tables for the lookups of
  // short codes ( <= TABLE_LOOKUP_BITS long)
  //

  for (let i = 0; i < 1 << TABLE_LOOKUP_BITS; ++i) {
    // value = i << INDEX_BIT_SHIFT
    const valueHi = (i << (32 - TABLE_LOOKUP_BITS)) >>> 0

    fhd._tableSymbol[i] = 0xffff
    fhd._tableCodeLen[i] = 0

    for (let codeLen = fhd._minCodeLength; codeLen <= fhd._maxCodeLength; ++codeLen) {
      // _ljBase[codeLen] <= value (value's low half is 0)
      const bh = fhd._ljBaseHi[codeLen]!
      if (bh < valueHi || (bh === valueHi && fhd._ljBaseLo[codeLen] === 0)) {
        fhd._tableCodeLen[i] = codeLen
        const id = fastHufId(fhd, codeLen, valueHi, 0)
        if (id >= 0) {
          fhd._tableSymbol[i] = fhd._idToSymbol[id]!
        } else {
          fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (Overrun)')
        }
        break
      }
    }
  }

  //
  // Store the smallest value in the table that points to real data.
  // This should be the entry for the largest length that has
  // valid data (in our case, non-dummy _ljBase)
  //

  while (minIdx > 0 && ljBase[minIdx] === M64) minIdx--

  if (minIdx < 0) {
    //
    // Error, no codes with lengths 0-TABLE_LOOKUP_BITS used.
    // Set the min value such that the table is never tested.
    //

    fhd._tableMinHi = 0xffffffff
    fhd._tableMinLo = 0xffffffff
  } else {
    fhd._tableMinHi = fhd._ljBaseHi[minIdx]!
    fhd._tableMinLo = fhd._ljBaseLo[minIdx]!
  }
}

/** The fast decoder's bit stream state (internal_huf.c:1610-1614). The
 *  uint64_t buffer and bufferBack are hi / lo uint32 halves. */
interface FastHufStream {
  bufHi: number
  bufLo: number
  backHi: number
  backLo: number
  bufferBackNumBits: number
  currByte: number
  currBitsLeft: number
}

// READ64: big-endian 64-bit load (internal_huf.c:1059-1082)
function read64Hi(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0
}

/** internal_huf.c:1233-1311 FastHufDecoder_refill */
function FastHufDecoder_refill(
  st: FastHufStream,
  numBits: number, // number of bits to refill
  src: Uint8Array,
): void {
  let needBits: number

  do {
    // shifting right by 64 on a uint64_t is a bad time...
    if (numBits > 0) {
      needBits = 64 - numBits
      // *buffer |= (*bufferBack) >> numBits
      if (numBits < 32) {
        st.bufHi = (st.bufHi | (st.backHi >>> numBits)) >>> 0
        st.bufLo = (st.bufLo | ((st.backLo >>> numBits) | (numBits === 0 ? 0 : st.backHi << (32 - numBits)))) >>> 0
      } else {
        st.bufLo = (st.bufLo | (st.backHi >>> (numBits - 32))) >>> 0
      }
      if (st.bufferBackNumBits >= needBits) {
        // *bufferBack <<= needBits
        if (needBits < 32) {
          st.backHi = ((st.backHi << needBits) | (st.backLo >>> (32 - needBits))) >>> 0
          st.backLo = (st.backLo << needBits) >>> 0
        } else {
          st.backHi = (st.backLo << (needBits - 32)) >>> 0
          st.backLo = 0
        }
        st.bufferBackNumBits -= needBits
        break
      }
      numBits += st.bufferBackNumBits
      st.bufferBackNumBits = 0
    } else {
      st.bufHi = st.backHi
      st.bufLo = st.backLo
      numBits = st.bufferBackNumBits
      st.bufferBackNumBits = 0
    }

    if (st.bufferBackNumBits <= 0) {
      if (st.currBitsLeft >= 64) {
        st.backHi = read64Hi(src, st.currByte)
        st.backLo = read64Hi(src, st.currByte + 4)
        st.bufferBackNumBits = 64
        st.currByte += 8
        st.currBitsLeft -= 8 * 8
      } else {
        let shift = 56

        st.backHi = 0
        st.backLo = 0
        st.bufferBackNumBits = 64

        while (st.currBitsLeft >= 8) {
          // *bufferBack |= ((uint64_t) (**currByte)) << shift
          if (shift >= 32) st.backHi = (st.backHi | (src[st.currByte]! << (shift - 32))) >>> 0
          else st.backLo = (st.backLo | (src[st.currByte]! << shift)) >>> 0

          st.currByte++
          shift -= 8
          st.currBitsLeft -= 8
        }

        if (st.currBitsLeft > 0) {
          if (shift >= 32) st.backHi = (st.backHi | (src[st.currByte]! << (shift - 32))) >>> 0
          else st.backLo = (st.backLo | (src[st.currByte]! << shift)) >>> 0

          st.currByte++
          shift -= 8
          st.currBitsLeft = 0
        }
      }
    }
  } while (numBits < 64)
}

/** internal_huf.c:1313-1325 fasthuf_read_bits (the accumulator is kept to its
 *  low 24 bits, as in getBits above). */
const fasthuf_read_bits = getBits

/** internal_huf.c:1327-1551 fasthuf_initialize; returns the index after the
 *  code table. */
function fasthuf_initialize(
  fhd: FastHufDecoder,
  table: Uint8Array,
  tableStart: number,
  numBytes: number,
  minSymbol: number,
  maxSymbol: number,
  rleSymbol: number,
): number {
  //
  // The 'base' table is the minimum code at each code length. base[i]
  // is the smallest code (numerically) of length i.
  //

  const base: bigint[] = new Array<bigint>(MAX_CODE_LEN + 1)

  //
  // The 'offset' table is the position (in sorted order) of the first id
  // of a given code length. Array is indexed by code length, like base.
  //

  const offset: bigint[] = new Array<bigint>(MAX_CODE_LEN + 1)

  //
  // Count of how many codes at each length there are. Array is
  // indexed by code length, like base and offset.
  //

  const codeCount = new Float64Array(MAX_CODE_LEN + 1)

  let r: BitReader = { c: 0, lc: 0, pos: tableStart }

  let codeLen: number
  const topByte = tableStart + numBytes

  const mapping = new Float64Array(MAX_CODE_LEN + 1)

  fhd._rleSymbol = rleSymbol
  fhd._numSymbols = 0
  fhd._minCodeLength = 255
  fhd._maxCodeLength = 0

  for (let i = 0; i <= MAX_CODE_LEN; ++i) {
    codeCount[i] = 0
    base[i] = M64
    offset[i] = 0n
  }

  //
  // Count the number of codes, the min/max code lengths, the number of
  // codes with each length, and record symbols with non-zero code
  // length as we find them.
  //

  for (let symbol = minSymbol; symbol <= maxSymbol; symbol++) {
    if (r.pos >= topByte) {
      fail(EXR_ERR_CORRUPT_CHUNK, 'Error decoding Huffman table (Truncated table data).')
    }

    //
    // Next code length - either:
    //       0-58  (literal code length)
    //       59-62 (various lengths runs of 0)
    //       63    (run of n 0's, with n is the next 8 bits)
    //

    codeLen = fasthuf_read_bits(6, r, table)

    if (codeLen < SHORT_ZEROCODE_RUN) {
      if (codeLen === 0) continue

      if (codeLen < fhd._minCodeLength) fhd._minCodeLength = codeLen

      if (codeLen > fhd._maxCodeLength) fhd._maxCodeLength = codeLen

      codeCount[codeLen]!++
    } else if (codeLen === LONG_ZEROCODE_RUN) {
      if (r.pos >= topByte) {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Error decoding Huffman table (Truncated table data).')
      }

      symbol += fasthuf_read_bits(8, r, table) + SHORTEST_LONG_RUN - 1
    } else {
      symbol += codeLen - SHORT_ZEROCODE_RUN + 1
    }

    if (symbol > maxSymbol) {
      fail(EXR_ERR_CORRUPT_CHUNK, 'Error decoding Huffman table (Run beyond end of table).')
    }
  }

  // (upstream sums i < MAX_CODE_LEN: codes of length 58 are not counted)
  for (let i = 0; i < MAX_CODE_LEN; ++i) fhd._numSymbols += codeCount[i]!

  if (fhd._numSymbols > fhd._idToSymbol.length) {
    fail(EXR_ERR_CORRUPT_CHUNK, 'Error decoding Huffman table (Too many symbols).')
  }

  //
  // Compute base - once we have the code length counts, there
  //                is a closed form solution for this
  //

  {
    const countTmp = new Float64Array(MAX_CODE_LEN + 1) /* temp space (upstream: offset) */

    for (let l = fhd._minCodeLength; l <= fhd._maxCodeLength; ++l) {
      countTmp[l] = codeCount[l]! * (2 * 2 ** (fhd._maxCodeLength - l))
    }

    for (let l = fhd._minCodeLength; l <= fhd._maxCodeLength; ++l) {
      let tmp = 0

      for (let k = l + 1; k <= fhd._maxCodeLength; ++k) tmp += countTmp[k]!

      tmp /= 2 * 2 ** (fhd._maxCodeLength - l)

      base[l] = BigInt(Math.ceil(tmp))
    }
  }

  //
  // Compute offset - these are the positions of the first
  //                  id (not symbol) that has length [i]
  //

  offset[fhd._maxCodeLength] = 0n

  for (let i = fhd._maxCodeLength - 1; i >= fhd._minCodeLength; i--) {
    offset[i] = offset[i + 1]! + BigInt(codeCount[i + 1]!)
  }

  //
  // Allocate and fill the symbol-to-id mapping. Smaller Ids should be
  // mapped to less-frequent symbols (which have longer codes). Use
  // the offset table to tell us where the id's for a given code
  // length start off.
  //

  for (let i = 0; i < MAX_CODE_LEN + 1; ++i) mapping[i] = Infinity // (uint64_t) -1
  for (let i = fhd._minCodeLength; i <= fhd._maxCodeLength; ++i) mapping[i] = Number(offset[i]!)

  r = { c: 0, lc: 0, pos: tableStart }

  //
  // Although we could have created an uncompressed list of symbols in our
  // decoding loop above, it's faster to decode the compressed data again
  //
  for (let symbol = minSymbol; symbol <= maxSymbol; symbol++) {
    codeLen = fasthuf_read_bits(6, r, table)

    if (codeLen < SHORT_ZEROCODE_RUN) {
      if (codeLen === 0) continue

      if (mapping[codeLen]! >= fhd._numSymbols) {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (Invalid symbol in header)')
      }
      fhd._idToSymbol[mapping[codeLen]!] = symbol
      mapping[codeLen]!++
    } else if (codeLen === LONG_ZEROCODE_RUN) {
      symbol += fasthuf_read_bits(8, r, table) + SHORTEST_LONG_RUN - 1
    } else {
      symbol += codeLen - SHORT_ZEROCODE_RUN + 1
    }
  }

  FastHufDecoder_buildTables(fhd, base, offset)
  return r.pos
}

/** internal_huf.c:1553-1595 fasthuf_decode_enabled. Upstream answers 1 for
 *  clang on Apple platforms and for x86 GCC / ICC / MSVC; the reference
 *  native build is macOS clang, so the fast decoder is enabled here. */
function fasthuf_decode_enabled(): boolean {
  return true
}

/** internal_huf.c:1597-1819 fasthuf_decode */
function fasthuf_decode(
  fhd: FastHufDecoder,
  src: Uint8Array,
  srcStart: number,
  numSrcBits: number,
  dst: Uint16Array,
  numDstElems: number,
): void {
  //
  // Current position (byte/bit) in the src data stream
  // (after the first buffer fill)
  //
  let bufferNumBits: number
  let dstIdx: number

  const st: FastHufStream = {
    //
    // 64-bit buffer holding the current bits in the stream
    //
    bufHi: read64Hi(src, srcStart),
    bufLo: read64Hi(src, srcStart + 4),
    //
    // 64-bit buffer holding the next bits in the stream
    //
    backHi: read64Hi(src, srcStart + 8),
    backLo: read64Hi(src, srcStart + 12),
    bufferBackNumBits: 64,
    currByte: srcStart + 2 * 8,
    currBitsLeft: numSrcBits - 8 * 2 * 8,
  }
  bufferNumBits = 64
  dstIdx = 0

  const tMinHi = fhd._tableMinHi, tMinLo = fhd._tableMinLo
  const rleSym = fhd._rleSymbol
  const ljBaseHi = fhd._ljBaseHi, ljBaseLo = fhd._ljBaseLo

  while (dstIdx < numDstElems) {
    let symbol: number, codeLen: number

    //
    // Test if we can be table accelerated. If so, directly
    // lookup the output symbol. Otherwise, we need to fall
    // back to searching for the code.
    //
    // If we're doing table lookups, we don't really need
    // a re-filled buffer, so long as we have TABLE_LOOKUP_BITS
    // left. But for a search, we do need a refilled table.
    //

    if (tMinHi < st.bufHi || (tMinHi === st.bufHi && tMinLo <= st.bufLo)) {
      const tableIdx = st.bufHi >>> (32 - TABLE_LOOKUP_BITS)
      codeLen = fhd._tableCodeLen[tableIdx]!
      symbol = fhd._tableSymbol[tableIdx]!
    } else {
      if (bufferNumBits < 64) {
        FastHufDecoder_refill(st, bufferNumBits, src)
        bufferNumBits = 64
      }

      //
      // Brute force search:
      // Find the smallest length where _ljBase[length] <= buffer
      //

      codeLen = TABLE_LOOKUP_BITS + 1

      /* sentinel zero can never be greater than buffer */
      /* && codeLen <= _maxCodeLength */
      while (ljBaseHi[codeLen]! > st.bufHi || (ljBaseHi[codeLen] === st.bufHi && ljBaseLo[codeLen]! > st.bufLo)) {
        codeLen++
      }

      if (codeLen > fhd._maxCodeLength) {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (Decoded an invalid symbol)')
      }

      const id = fastHufId(fhd, codeLen, st.bufHi, st.bufLo)
      if (id >= 0) {
        symbol = fhd._idToSymbol[id]!
      } else {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (Decoded an invalid symbol)')
      }
    }

    //
    // Shift over bit stream, and update the bit count in the buffer
    //

    // buffer = buffer << codeLen
    if (codeLen < 32) {
      if (codeLen > 0) {
        st.bufHi = ((st.bufHi << codeLen) | (st.bufLo >>> (32 - codeLen))) >>> 0
        st.bufLo = (st.bufLo << codeLen) >>> 0
      }
    } else {
      st.bufHi = (st.bufLo << (codeLen - 32)) >>> 0
      st.bufLo = 0
    }
    bufferNumBits -= codeLen

    //
    // If we received a RLE symbol (_rleSymbol), then we need
    // to read ahead 8 bits to know how many times to repeat
    // the previous symbol. Need to ensure we at least have
    // 8 bits of data in the buffer
    //

    if (symbol === rleSym) {
      if (bufferNumBits < 8) {
        FastHufDecoder_refill(st, bufferNumBits, src)
        bufferNumBits = 64
      }

      const rleCount = st.bufHi >>> 24

      if (dstIdx < 1) {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (RLE code with no previous symbol)')
      }

      if (dstIdx + rleCount > numDstElems) {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (Symbol run beyond expected output buffer length)')
      }

      if (rleCount === 0 || rleCount >= 0x7fffffff) {
        fail(EXR_ERR_CORRUPT_CHUNK, 'Huffman decode error (Invalid RLE length)')
      }

      const prev = dst[dstIdx - 1]!
      for (let i = 0; i < rleCount; ++i) dst[dstIdx + i] = prev

      dstIdx += rleCount

      // buffer = buffer << 8
      st.bufHi = ((st.bufHi << 8) | (st.bufLo >>> 24)) >>> 0
      st.bufLo = (st.bufLo << 8) >>> 0
      bufferNumBits -= 8
    } else {
      dst[dstIdx] = symbol
      dstIdx++
    }

    //
    // refill bit stream buffer if we're below the number of
    // bits needed for a table lookup
    //

    if (bufferNumBits < TABLE_LOOKUP_BITS) {
      FastHufDecoder_refill(st, bufferNumBits, src)
      bufferNumBits = 64
    }
  }

  if (st.currBitsLeft !== 0) {
    fail(EXR_ERR_CORRUPT_CHUNK,
      `Huffman decode error (${st.currBitsLeft} bits of compressed data remains after filling expected output buffer)`)
  }
}

/**************************************/

/** internal_huf.c:1913-1994 internal_huf_decompress.
 *
 *  Decodes the OpenEXR Huffman stream `compressed` (nCompressed =
 *  compressed.length: the 20-byte header im, iM, tableLength, nBits, future,
 *  then the packed code table and nBits of code) into all of `out` (nRaw =
 *  out.length uint16 values). Throws ExrError where upstream returns an
 *  error code. As upstream, an input shorter than the header decodes to
 *  nothing (and is EXR_ERR_INVALID_ARGUMENT unless nRaw is 0). The fast
 *  decoder is used when nBits > 128, the original decoder otherwise, as
 *  upstream selects on the reference platform. Used by PIZ and DWA. */
export function internal_huf_decompress(compressed: Uint8Array, out: Uint16Array /* nRaw values */): void {
  const nCompressed = compressed.length
  const nRaw = out.length
  const hufInfoBlockSize = 5 * 4
  let rv: number

  try {
    //
    // need at least 20 bytes for header
    //
    if (nCompressed < 20) {
      if (nRaw !== 0) fail(EXR_ERR_INVALID_ARGUMENT)
      return
    }

    // (sparebytes != internal_exr_huf_decompress_spare_bytes (): no spare buffer here)

    const im = readUInt(compressed, 0)
    const iM = readUInt(compressed, 4)
    // uint32_t tableLength = readUInt (compressed + 8);
    const nBits = readUInt(compressed, 12)
    // uint32_t future = readUInt (compressed + 16);

    if (im >= HUF_ENCSIZE || iM >= HUF_ENCSIZE) fail(EXR_ERR_CORRUPT_CHUNK)

    let ptr = hufInfoBlockSize

    const nBytes = Math.floor((nBits + 7) / 8)

    // must be nBytes remaining in buffer
    if (hufInfoBlockSize + nBytes > nCompressed) fail(EXR_ERR_OUT_OF_MEMORY)

    //
    // Fast decoder needs at least 2x64-bits of compressed data, and
    // needs to be run-able on this platform. Otherwise, fall back
    // to the original decoder
    //
    if (fasthuf_decode_enabled() && nBits > 128) {
      const fhd: FastHufDecoder = {
        _rleSymbol: 0,
        _numSymbols: 0,
        _minCodeLength: 0,
        _maxCodeLength: 0,
        _idToSymbol: new Uint32Array(65536 + 1),
        _ljBaseHi: new Uint32Array(MAX_CODE_LEN + 1 + 1),
        _ljBaseLo: new Uint32Array(MAX_CODE_LEN + 1 + 1),
        _ljOffset: new Array<bigint>(MAX_CODE_LEN + 1).fill(0n),
        _ljOffsetSmall: new Float64Array(MAX_CODE_LEN + 1),
        _tableSymbol: new Int32Array(1 << TABLE_LOOKUP_BITS),
        _tableCodeLen: new Uint8Array(1 << TABLE_LOOKUP_BITS),
        _tableMinHi: 0,
        _tableMinLo: 0,
      }

      ptr = fasthuf_initialize(fhd, compressed, ptr, nCompressed - hufInfoBlockSize, im, iM, iM)
      if (ptr + nBytes > nCompressed) fail(EXR_ERR_OUT_OF_MEMORY)
      fasthuf_decode(fhd, compressed, ptr, nBits, out, nRaw)
      rv = EXR_ERR_SUCCESS
    } else {
      const freq = new Float64Array(HUF_ENCSIZE)
      const state = { pos: ptr, nLeft: nCompressed - 20 }

      const hdec = hufClearDecTable()
      // (upstream ignores this result)
      hufUnpackEncTable(compressed, state, im, iM, freq)
      ptr = state.pos

      if (nBits > 8 * state.nLeft) fail(EXR_ERR_CORRUPT_CHUNK)

      rv = hufBuildDecTable(freq, im, iM, hdec)
      if (rv === EXR_ERR_SUCCESS) rv = hufDecode(freq, hdec, compressed, ptr, nBits, iM, nRaw, out)

      // hufFreeDecTable (pctxt, hdec);
    }
  } catch (e) {
    if (e instanceof HufResult) throw new ExrError(e.code, e.message)
    throw e
  }
  if (rv !== EXR_ERR_SUCCESS) throw new ExrError(rv)
}

/**************************************/
// internal_piz.c:18-19

const USHORT_RANGE = 1 << 16
const BITMAP_SIZE = USHORT_RANGE >> 3

/** internal_piz.c:80-97 reverseLutFromBitmap */
function reverseLutFromBitmap(bitmap: Uint8Array, lut: Uint16Array): number {
  let k = 0

  for (let i = 0; i < USHORT_RANGE; ++i) {
    if ((i === 0) || (bitmap[i >> 3]! & (1 << (i & 7)))) lut[k++] = i
  }

  const n = k - 1

  while (k < USHORT_RANGE) lut[k++] = 0

  return n & 0xffff
}

/** internal_piz.c:99-116 applyLut */
function applyLut(lut: Uint16Array, data: Uint16Array, nData: number): void {
  /* (upstream partially unrolls by 8; same result) */
  for (let i = 0; i < nData; ++i) data[i] = lut[data[i]!]!
}

/**************************************/
//
// Wavelet basis functions without modulo arithmetic; they produce
// the best compression ratios when the wavelet-transformed data are
// Huffman-encoded, but the wavelet transform works only for 14-bit
// data (untransformed data values must be less than (1 << 14)).
//

// (int16_t) x
function s16(x: number): number {
  return (x << 16) >> 16
}

/** internal_piz.c:139-175 wdec14_4 (on indices px, p01, p10, p11 of buf) */
function wdec14_4(buf: Uint16Array, px: number, p01: number, p10: number, p11: number): void {
  /* pre swap
   * px, p01, p10, p11
   * px -> a
   * p10 -> b
   * p01 -> c
   * p11 -> d
   * */
  let ai = s16(buf[px]!)
  let bi = s16(buf[p10]!)
  let ci = s16(buf[p01]!)
  let di = s16(buf[p11]!)

  const i00 = ai + (bi & 1) + (bi >> 1)
  const i10 = i00 - bi
  const i01 = ci + (di & 1) + (di >> 1)
  const i11 = i01 - di

  ai = i00 + (i01 & 1) + (i01 >> 1)
  bi = ai - i01
  ci = i10 + (i11 & 1) + (i11 >> 1)
  di = ci - i11

  /* different output order */
  /* px, p01, p10, p11 */
  buf[px] = ai
  buf[p01] = bi
  buf[p10] = ci
  buf[p11] = di
}

/** internal_piz.c:177-192 wdec14: returns a | b << 16. */
function wdec14(l: number, h: number): number {
  const hi = s16(h)
  const li = s16(l)
  const ai = li + (hi & 1) + (hi >> 1)

  const as = ai & 0xffff
  const bs = (ai - hi) & 0xffff

  return (as | (bs << 16)) >>> 0
}

//
// Wavelet basis functions with modulo arithmetic; they work with full
// 16-bit data, but Huffman-encoding the wavelet-transformed data doesn't
// compress the data quite as well.
//

const NBITS = 16
const A_OFFSET = 1 << (NBITS - 1)
const MOD_MASK = (1 << NBITS) - 1

/** internal_piz.c:220-229 wdec16: returns a | b << 16. */
function wdec16(l: number, h: number): number {
  const m = l
  const d = h
  const bb = (m - (d >> 1)) & MOD_MASK
  const aa = (d + bb - A_OFFSET) & MOD_MASK
  return (aa | (bb << 16)) >>> 0
}

/**************************************/

/** internal_piz.c:341-461 wav_2D_decode; `inp` is an index into buf. */
function wav_2D_decode(
  buf: Uint16Array,
  inp: number, // io: values are transformed in place
  nx: number,  // i : x size
  ox: number,  // i : x offset
  ny: number,  // i : y size
  oy: number,  // i : y offset
  mx: number,  // i : maximum in[x][y] value
): void {
  const w14 = mx < (1 << 14)
  const n = (nx > ny) ? ny : nx
  let p = 1
  let p2: number

  //
  // Search max level
  //

  while (p <= n) p <<= 1

  p >>= 1
  p2 = p
  p >>= 1

  //
  // Hierarchical loop on smaller dimension n
  //

  while (p >= 1) {
    let py = inp
    const ey = inp + oy * (ny - p2)
    const oy1 = oy * p
    const oy2 = oy * p2
    const ox1 = ox * p
    const ox2 = ox * p2
    let r: number, i00: number, i01: number, i10: number, i11: number

    //
    // Y loop
    //

    for (; py <= ey; py += oy2) {
      let px = py
      const ex = py + ox * (nx - p2)

      //
      // X loop
      //

      for (; px <= ex; px += ox2) {
        const p01 = px + ox1
        const p10 = px + oy1
        const p11 = p10 + ox1

        //
        // 2D wavelet decoding
        //

        if (w14) {
          wdec14_4(buf, px, p01, p10, p11)
        } else {
          r = wdec16(buf[px]!, buf[p10]!); i00 = r & 0xffff; i10 = r >>> 16
          r = wdec16(buf[p01]!, buf[p11]!); i01 = r & 0xffff; i11 = r >>> 16
          r = wdec16(i00, i01); buf[px] = r; buf[p01] = r >>> 16
          r = wdec16(i10, i11); buf[p10] = r; buf[p11] = r >>> 16
        }
      }

      //
      // Decode (1D) odd column (still in Y loop)
      //

      if (nx & p) {
        const p10 = px + oy1

        if (w14) r = wdec14(buf[px]!, buf[p10]!)
        else r = wdec16(buf[px]!, buf[p10]!)
        buf[p10] = r >>> 16
        buf[px] = r
      }
    }

    //
    // Decode (1D) odd line (must loop in X)
    //

    if (ny & p) {
      let px = py
      const ex = py + ox * (nx - p2)

      for (; px <= ex; px += ox2) {
        const p01 = px + ox1

        if (w14) r = wdec14(buf[px]!, buf[p01]!)
        else r = wdec16(buf[px]!, buf[p01]!)
        buf[p01] = r >>> 16
        buf[px] = r
      }
    }

    //
    // Next level
    //

    p2 = p
    p >>= 1
  }
}

/**************************************/

/** internal_piz.c:625-786 internal_exr_undo_piz */
export async function internal_exr_undo_piz(decode: ExrDecodePipeline, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  const packsz = packed.length
  const outsz = unpacked.length
  const out = unpacked
  let outp = 0
  let nOut = 0
  let nx: number, ny: number, wcount: number
  let nBytes: number

  // (scratch_buffer_1: outsz bytes of uint16 values; scratch_buffer_2: lut
  // and bitmap. The Huffman spare is internal to internal_huf_decompress.)
  const wavbuf = new Uint16Array(Math.ceil(outsz / 2))
  const lut = new Uint16Array(USHORT_RANGE)
  const bitmap = new Uint8Array(BITMAP_SIZE)

  //
  // Read range compression data
  //

  nBytes = 0
  if (2 * 2 > packsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  const minNonZero = packed[nBytes]! | (packed[nBytes + 1]! << 8)
  nBytes += 2
  const maxNonZero = packed[nBytes]! | (packed[nBytes + 1]! << 8)
  nBytes += 2

  if (maxNonZero >= BITMAP_SIZE) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  if (minNonZero <= maxNonZero) {
    const bytesToRead = maxNonZero - minNonZero + 1
    if (nBytes + bytesToRead > packsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

    bitmap.set(packed.subarray(nBytes, nBytes + bytesToRead), minNonZero)
    nBytes += bytesToRead
  }

  const maxValue = reverseLutFromBitmap(bitmap, lut)

  //
  // Huffman decoding
  //
  if (nBytes + 4 > packsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  const hufbytes = readUInt(packed, nBytes)
  nBytes += 4

  if (nBytes + hufbytes > packsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  internal_huf_decompress(packed.subarray(nBytes, nBytes + hufbytes), wavbuf.subarray(0, Math.floor(outsz / 2)))

  //
  // Wavelet decoding
  //

  let wav = 0
  for (let c = 0; c < decode.channels.length; ++c) {
    const curc = decode.channels[c]!

    nx = curc.width
    ny = curc.height
    wcount = Math.trunc(curc.bytes_per_element / 2)
    if (wcount > 0 && nx > Math.trunc(0x7fffffff / wcount)) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    for (let j = 0; j < wcount; ++j) {
      wav_2D_decode(wavbuf, wav + j, nx, wcount, ny, wcount * nx, maxValue)
    }
    wav += nx * ny * wcount
  }

  //
  // Expand the pixel data to their original range
  //

  applyLut(lut, wavbuf, Math.floor(outsz / 2))

  //
  // Rearrange the pixel data into the format expected by the caller.
  //

  for (let y = 0; y < decode.chunk.height; ++y) {
    const cury = y + decode.chunk.start_y

    let scratch = 0 // uint16 index into wavbuf
    for (let c = 0; c < decode.channels.length; ++c) {
      const curc = decode.channels[c]!

      nx = curc.width
      ny = curc.height
      nBytes = curc.width * curc.bytes_per_element

      if (nBytes === 0) continue

      let tmp = scratch
      scratch += (ny * nBytes) / 2

      if (curc.y_samples > 1) {
        if ((cury % curc.y_samples) !== 0) continue
        tmp += (Math.trunc(y / curc.y_samples) * nBytes) / 2
      } else {
        tmp += (y * nBytes) / 2
      }

      // memcpy (out, tmp, nBytes); priv_from_native16 (out, nx * (bpe / 2))
      if (outp + nBytes > outsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK) // (upstream: buffer overrun)
      const nv = nx * (curc.bytes_per_element / 2)
      for (let i = 0; i < nv; ++i) {
        const v = wavbuf[tmp + i]!
        out[outp + 2 * i] = v & 0xff
        out[outp + 2 * i + 1] = v >>> 8
      }
      outp += nBytes
      nOut += nBytes
    }
  }

  decode.bytes_decompressed = nOut
  if (nOut !== outsz) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
}
