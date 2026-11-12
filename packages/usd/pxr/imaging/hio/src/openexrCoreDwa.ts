// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/compression.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_channeldata.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_classifier.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_compressor.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_dwa_decoder.h,
//  and 4 more cited below
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// OpenEXR: Copyright (c) DreamWorks Animation LLC and Contributors of the
//  OpenEXR Project. BSD 3-Clause License.
// OpenEXR: Copyright (c) Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// libdeflate: Copyright 2016 Eric Biggers. MIT License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore), the DWAA / DWAB
// decode path only:
//   internal_dwa.c:177-249                internal_exr_undo_dwaa / _dwab
//   internal_dwa_helpers.h:15-60          AcCompression, CompressorScheme,
//                                         DataSizesSingle
//   internal_dwa_channeldata.h:16-142     DctCoderChannelData, ChannelData,
//                                         CscChannelSet, CscPrefixMap_find
//   internal_dwa_classifier.h:12-192      Classifier, sDefaultChannelRules,
//                                         sLegacyChannelRules, Classifier_read,
//                                         Classifier_match,
//                                         Classifier_find_suffix
//   internal_dwa_decoder.h:14-767         LossyDctDecoder (the !IMF_HAVE_SSE2
//                                         paths, as compiled for arm64)
//   internal_dwa_compressor.h:12-190      DwaCompressor, DwaCompressor_construct
//                                         (decode branch)
//   internal_dwa_compressor.h:689-1306    validate_size, DwaCompressor_uncompress
//   internal_dwa_compressor.h:1308-1533   DwaCompressor_initializeBuffers
//   internal_dwa_compressor.h:1580-1807   DwaCompressor_readChannelRules,
//                                         DwaCompressor_classifyChannels,
//                                         DwaCompressor_setupChannelData
//   compression.c:47-87                   exr_compress_max_buffer_size (with
//                                         libdeflate zlib_compress.c:77-82 and
//                                         deflate_compress.c:3989-4048 bounds,
//                                         internal_huf.c:1822-1845 spare bytes)
// The SIMD-dispatched helpers and the to-linear table are in
// openexrCoreDwaSimd.ts.
//
// Port conventions: pointers are (typed array, element offset) pairs;
// uint64 header counters are BigInt where upstream's uint64 wraparound can
// matter; the data are little-endian ("XDR" in OpenEXR is little-endian, so
// priv_to_native16/64 are no-ops), and the Uint16Array views over buffers
// this module allocates assume a little-endian host, as every supported
// browser is. Buffers that upstream allocates only as zlib / Huffman
// targets are the arrays exr_uncompress_buffer returns; upstream's
// _decode->scratch_buffer_1 bookkeeping (internal_decode_alloc_buffer) has
// no counterpart. destroy (internal_dwa_compressor.h:194-223) is garbage
// collection.
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) DreamWorks Animation LLC and Contributors of the OpenEXR Project

import {
  EXR_ERR_BAD_CHUNK_LEADER,
  EXR_ERR_CORRUPT_CHUNK,
  EXR_ERR_INVALID_ARGUMENT,
  EXR_ERR_OUT_OF_MEMORY,
  EXR_PIXEL_FLOAT,
  EXR_PIXEL_HALF,
  EXR_PIXEL_LAST_TYPE,
  EXR_PIXEL_UINT,
  ExrError,
  half_to_float,
  half_to_float_int,
  float_to_half,
  type ExrCodingChannelInfo,
  type ExrDecodePipeline,
} from './openexrCoreCoding.ts'
import { internal_huf_decompress } from './openexrCorePiz.ts'
import { internal_rle_decompress } from './openexrCoreRle.ts'
import { exr_uncompress_buffer, internal_zip_reconstruct_bytes } from './openexrCoreZip.ts'
import {
  convertFloatToHalf64,
  csc709Inverse,
  csc709Inverse64,
  dctInverse8x8DcOnly,
  dctInverse8x8_0,
  dctInverse8x8_1,
  dctInverse8x8_2,
  dctInverse8x8_3,
  dctInverse8x8_4,
  dctInverse8x8_5,
  dctInverse8x8_6,
  dctInverse8x8_7,
  exrcore_dwaToLinearTable,
  exrcore_ensure_dwa_tables,
  fromHalfZigZag,
  interleaveByte2,
} from './openexrCoreDwaSimd.ts'

/**************************************/
// internal_dwa_helpers.h:15-60

/** internal_dwa_helpers.h:15-19 AcCompression */
const STATIC_HUFFMAN = 0
const DEFLATE = 1

/** internal_dwa_helpers.h:21-28 CompressorScheme */
const UNKNOWN = 0
const LOSSY_DCT = 1
const RLE = 2
const NUM_COMPRESSOR_SCHEMES = 3

//
// Per-chunk compressed data sizes, one value per chunk
//

/** internal_dwa_helpers.h:34-54 DataSizesSingle */
const VERSION = 0 // Version number:
//   0: classic
//   1: adds "end of block" to the AC RLE
const UNKNOWN_UNCOMPRESSED_SIZE = 1 // Size of leftover data, uncompressed.
const UNKNOWN_COMPRESSED_SIZE = 2 // Size of leftover data, zlib compressed.
const AC_COMPRESSED_SIZE = 3 // AC RLE + Huffman size
const DC_COMPRESSED_SIZE = 4 // DC + Deflate size
const RLE_COMPRESSED_SIZE = 5 // RLE + Deflate data size
const RLE_UNCOMPRESSED_SIZE = 6 // RLE'd data size
const RLE_RAW_SIZE = 7 // Un-RLE'd data size
const AC_UNCOMPRESSED_COUNT = 8 // AC RLE number of elements
const DC_UNCOMPRESSED_COUNT = 9 // DC number of elements
const AC_COMPRESSION = 10 // AC compression strategy
const NUM_SIZES_SINGLE = 11

const U64_MASK = (1n << 64n) - 1n
const U64_MAX = U64_MASK
const INT64_SIGN = 1n << 63n

/**************************************/
// compression.c:47-87 exr_compress_max_buffer_size and the bounds it uses

/** libdeflate deflate_compress.c:3989-4048 libdeflate_deflate_compress_bound
 *  (MIN_BLOCK_LENGTH 5000, OUTPUT_END_PADDING 8) plus zlib_compress.c:77-82
 *  (ZLIB_MIN_OVERHEAD 6). */
function libdeflate_zlib_compress_bound(in_nbytes: bigint): bigint {
  const max_blocks = in_nbytes === 0n ? 1n : (in_nbytes + 5000n - 1n) / 5000n
  return 6n + 5n * max_blocks + in_nbytes + 1n + 8n
}

/** internal_huf.c:1822-1831 internal_exr_huf_compress_spare_bytes:
 *  HUF_ENCSIZE (65537) * (8 + 8 + 8 + 4). */
const HUF_COMPRESS_SPARE_BYTES = 65537n * 28n
/** internal_huf.c:1834-1845 internal_exr_huf_decompress_spare_bytes:
 *  HUF_ENCSIZE * 8 + HUF_DECSIZE (16384) * sizeof (HufDec) (16) =
 *  786440, which exceeds sizeof (FastHufDecoder) (283600 on LP64). */
const HUF_DECOMPRESS_SPARE_BYTES = 65537n * 8n + 16384n * 16n

/** compression.c:47-87 exr_compress_max_buffer_size (size_t arithmetic). */
function exr_compress_max_buffer_size(in_bytes: bigint): bigint {
  let r = libdeflate_zlib_compress_bound(in_bytes)
  /*
   * lib deflate has a message about needing a 9 byte boundary
   * but is unclear if it actually adds that or not
   * (see the comment on libdeflate_deflate_compress)
   */
  if (r > (U64_MAX - 9n)) return U64_MAX
  r += 9n

  /*
   * old library had uiAdd( uiAdd( in, ceil(in * 0.01) ), 100 )
   */
  let extra = r * 130n
  if (extra > U64_MAX) return U64_MAX
  extra /= 128n

  if (extra > (U64_MAX - 100n)) return U64_MAX
  if (extra > r) r = extra

  /*
   * in case huf is larger than zlib
   */
  extra = (in_bytes + HUF_COMPRESS_SPARE_BYTES) & U64_MASK
  if (r < extra) r = extra

  extra = (in_bytes + HUF_DECOMPRESS_SPARE_BYTES) & U64_MASK
  if (r < extra) r = extra

  /* make sure there is some small 2 pages worth of buffer */
  if (8192n > r) r = 8192n

  return r
}

/**************************************/
// internal_dwa_channeldata.h

/** internal_dwa_channeldata.h:18-30 DctCoderChannelData. _rows are byte
 *  offsets into the output (unpacked) buffer. */
interface DctCoderChannelData {
  _dctData: Float32Array // [64]
  _halfZigData: Uint16Array // [64]
  _rows: number[]
  _type: number
}

/** internal_dwa_channeldata.h:32-37 DctCoderChannelData_construct */
function DctCoderChannelData_construct(t: number): DctCoderChannelData {
  return { _dctData: new Float32Array(64), _halfZigData: new Uint16Array(64), _rows: [], _type: t }
}

/** internal_dwa_channeldata.h:45-71 DctCoderChannelData_push_row (the
 *  growth policy is the JS array's). */
function DctCoderChannelData_push_row(d: DctCoderChannelData, r: number): void {
  d._rows.push(r)
}

/** internal_dwa_channeldata.h:75-98 ChannelData. planarUncBuffer is
 *  _planarUncBuffer[compression] (null when that buffer was not allocated)
 *  and the *End / planarUncRle* members are byte offsets into it. */
interface ChannelData {
  _dctData: DctCoderChannelData
  chan: ExrCodingChannelInfo

  //
  // Incoming and outgoing data is scanline interleaved, and it's much
  // easier to operate on contiguous data.  Assuming the planare unc
  // buffer is to hold RLE data, we need to rearrange to make bytes
  // adjacent.
  //
  planarUncBuffer: Uint8Array | null
  planarUncBufferStart: number
  planarUncBufferEnd: number

  planarUncRle: number[]
  planarUncRleEnd: number[]

  planarUncSize: number
  processed: number
  compression: number
  planarUncType: number
}

/** internal_dwa_channeldata.h:102-105 CscChannelSet */
interface CscChannelSet {
  idx: [number, number, number]
}

/** internal_dwa_channeldata.h:109-115 CscPrefixMapItem */
interface CscPrefixMapItem {
  name: Uint8Array | null
  prefix_len: number
  idx: [number, number, number]
}

/** strncmp (a, b, n) === 0 on NUL-free byte strings */
function bytesEqualN(a: Uint8Array, b: Uint8Array, n: number): boolean {
  for (let i = 0; i < n; ++i) {
    const ca = i < a.length ? a[i]! : 0
    const cb = i < b.length ? b[i]! : 0
    if (ca !== cb) return false
    if (ca === 0) return true
  }
  return true
}

/** internal_dwa_channeldata.h:117-142 CscPrefixMap_find: the index of the
 *  item (mapl + idx upstream). */
function CscPrefixMap_find(mapl: CscPrefixMapItem[], maxSize: number, cname: Uint8Array, prefixlen: number): number {
  let idx = 0
  for (; idx < maxSize; ++idx) {
    const item = mapl[idx]!
    if (item.name === null) {
      item.name = cname
      item.prefix_len = prefixlen
      item.idx[0] = -1
      item.idx[1] = -1
      item.idx[2] = -1
      break
    }

    if (prefixlen === item.prefix_len && bytesEqualN(cname, item.name, prefixlen)) {
      break
    }
  }

  return idx
}

/**************************************/
// internal_dwa_classifier.h

/** internal_dwa_classifier.h:12-20 Classifier (_suffix as bytes without
 *  the NUL; _stringStatic only matters to Classifier_destroy). */
interface Classifier {
  _suffix: Uint8Array
  _scheme: number
  _type: number
  _cscIdx: number
  _caseInsensitive: number
}

const DWA_CLASSIFIER_FALSE = 0
const DWA_CLASSIFIER_TRUE = 1

const _enc = new TextEncoder()
function rule(suffix: string, scheme: number, type: number, cscIdx: number, caseInsensitive: number): Classifier {
  return { _suffix: _enc.encode(suffix), _scheme: scheme, _type: type, _cscIdx: cscIdx, _caseInsensitive: caseInsensitive }
}

/** internal_dwa_classifier.h:27-42 sDefaultChannelRules (used by the
 *  encoder; a version 2 block carries its own rules, so the decoder never
 *  reads these). */
export const sDefaultChannelRules: readonly Classifier[] = [
  rule('R', LOSSY_DCT, EXR_PIXEL_HALF, 0, DWA_CLASSIFIER_FALSE),
  rule('R', LOSSY_DCT, EXR_PIXEL_FLOAT, 0, DWA_CLASSIFIER_FALSE),
  rule('G', LOSSY_DCT, EXR_PIXEL_HALF, 1, DWA_CLASSIFIER_FALSE),
  rule('G', LOSSY_DCT, EXR_PIXEL_FLOAT, 1, DWA_CLASSIFIER_FALSE),
  rule('B', LOSSY_DCT, EXR_PIXEL_HALF, 2, DWA_CLASSIFIER_FALSE),
  rule('B', LOSSY_DCT, EXR_PIXEL_FLOAT, 2, DWA_CLASSIFIER_FALSE),
  rule('Y', LOSSY_DCT, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_FALSE),
  rule('Y', LOSSY_DCT, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_FALSE),
  rule('BY', LOSSY_DCT, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_FALSE),
  rule('BY', LOSSY_DCT, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_FALSE),
  rule('RY', LOSSY_DCT, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_FALSE),
  rule('RY', LOSSY_DCT, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_FALSE),
  rule('A', RLE, EXR_PIXEL_UINT, -1, DWA_CLASSIFIER_FALSE),
  rule('A', RLE, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_FALSE),
  rule('A', RLE, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_FALSE),
]

/** internal_dwa_classifier.h:44-69 sLegacyChannelRules */
const sLegacyChannelRules: readonly Classifier[] = [
  rule('r', LOSSY_DCT, EXR_PIXEL_HALF, 0, DWA_CLASSIFIER_TRUE),
  rule('r', LOSSY_DCT, EXR_PIXEL_FLOAT, 0, DWA_CLASSIFIER_TRUE),
  rule('red', LOSSY_DCT, EXR_PIXEL_HALF, 0, DWA_CLASSIFIER_TRUE),
  rule('red', LOSSY_DCT, EXR_PIXEL_FLOAT, 0, DWA_CLASSIFIER_TRUE),
  rule('g', LOSSY_DCT, EXR_PIXEL_HALF, 1, DWA_CLASSIFIER_TRUE),
  rule('g', LOSSY_DCT, EXR_PIXEL_FLOAT, 1, DWA_CLASSIFIER_TRUE),
  rule('grn', LOSSY_DCT, EXR_PIXEL_HALF, 1, DWA_CLASSIFIER_TRUE),
  rule('grn', LOSSY_DCT, EXR_PIXEL_FLOAT, 1, DWA_CLASSIFIER_TRUE),
  rule('green', LOSSY_DCT, EXR_PIXEL_HALF, 1, DWA_CLASSIFIER_TRUE),
  rule('green', LOSSY_DCT, EXR_PIXEL_FLOAT, 1, DWA_CLASSIFIER_TRUE),
  rule('b', LOSSY_DCT, EXR_PIXEL_HALF, 2, DWA_CLASSIFIER_TRUE),
  rule('b', LOSSY_DCT, EXR_PIXEL_FLOAT, 2, DWA_CLASSIFIER_TRUE),
  rule('blu', LOSSY_DCT, EXR_PIXEL_HALF, 2, DWA_CLASSIFIER_TRUE),
  rule('blu', LOSSY_DCT, EXR_PIXEL_FLOAT, 2, DWA_CLASSIFIER_TRUE),
  rule('blue', LOSSY_DCT, EXR_PIXEL_HALF, 2, DWA_CLASSIFIER_TRUE),
  rule('blue', LOSSY_DCT, EXR_PIXEL_FLOAT, 2, DWA_CLASSIFIER_TRUE),
  rule('y', LOSSY_DCT, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_TRUE),
  rule('y', LOSSY_DCT, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_TRUE),
  rule('by', LOSSY_DCT, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_TRUE),
  rule('by', LOSSY_DCT, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_TRUE),
  rule('ry', LOSSY_DCT, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_TRUE),
  rule('ry', LOSSY_DCT, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_TRUE),
  rule('a', RLE, EXR_PIXEL_UINT, -1, DWA_CLASSIFIER_TRUE),
  rule('a', RLE, EXR_PIXEL_HALF, -1, DWA_CLASSIFIER_TRUE),
  rule('a', RLE, EXR_PIXEL_FLOAT, -1, DWA_CLASSIFIER_TRUE),
]

/** A byte cursor: upstream's (const uint8_t** ptr, size_t* size). */
interface ByteCursor {
  buf: Uint8Array
  ptr: number
  size: number
}

/** internal_dwa_classifier.h:80-142 Classifier_read: throws where upstream
 *  returns an error, after advancing the cursor as upstream does. */
function Classifier_read(cur: ByteCursor): Classifier {
  const curin = cur.ptr
  const buf = cur.buf
  let len = 0

  if (cur.size <= 3) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  let suffix: Uint8Array
  {
    // maximum length of string plus one byte for terminating NULL
    for (; len < 128 + 1; ++len) {
      if (len > (cur.size - 3)) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
      if (buf[curin + len] === 0) break
    }
    if (len === 128 + 1) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    suffix = buf.slice(curin, curin + len)
    // account for extra byte for nil terminator
    len += 1
  }

  if (cur.size < len + 2) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  const value = buf[curin + len]!
  const type = buf[curin + len + 1]!

  cur.ptr = curin + len + 2
  cur.size -= len + 2

  const out: Classifier = { _suffix: suffix, _scheme: 0, _type: 0, _cscIdx: 0, _caseInsensitive: 0 }
  out._cscIdx = (value >> 4) - 1
  if (out._cscIdx < -1 || out._cscIdx >= 3) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  out._scheme = (value >> 2) & 3
  if (out._scheme >= NUM_COMPRESSOR_SCHEMES) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  out._caseInsensitive = (value & 1 ? DWA_CLASSIFIER_TRUE : DWA_CLASSIFIER_FALSE)

  if (type >= EXR_PIXEL_LAST_TYPE) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  out._type = type
  return out
}

/** ASCII tolower, as strcasecmp in the C locale */
function tolower(c: number): number {
  return c >= 0x41 && c <= 0x5a ? c + 0x20 : c
}

/** internal_dwa_classifier.h:144-156 Classifier_match. suffix is the
 *  channel name's bytes from `suffixOff`. */
function Classifier_match(me: Classifier, name: Uint8Array, suffixOff: number, type: number): number {
  if (me._type !== type) return DWA_CLASSIFIER_FALSE
  const n = name.length - suffixOff
  if (n !== me._suffix.length) return DWA_CLASSIFIER_FALSE
  for (let i = 0; i < n; ++i) {
    let a = name[suffixOff + i]!, b = me._suffix[i]!
    // strcasecmp
    if (me._caseInsensitive) { a = tolower(a); b = tolower(b) }
    if (a !== b) return DWA_CLASSIFIER_FALSE
  }
  return DWA_CLASSIFIER_TRUE
}

/** internal_dwa_classifier.h:185-192 Classifier_find_suffix: the byte
 *  offset of the suffix in channel_name. */
function Classifier_find_suffix(channel_name: Uint8Array): number {
  const dot = channel_name.lastIndexOf(0x2e)
  if (dot >= 0) return dot + 1
  return 0
}

/**************************************/
// internal_dwa_decoder.h

//
// 'class' for the LOSSY_DCT decoder classes
//

/** internal_dwa_decoder.h:14-55 LossyDctDecoder. _packedAc / _packedAcEnd
 *  and _packedDc are element offsets into the packed AC / DC uint16
 *  buffers. */
interface LossyDctDecoder {
  //
  // Counts of how many items have been packed into the
  // AC and DC buffers
  //
  _packedAcCount: number
  _packedDcCount: number

  //
  // AC and DC buffers to pack
  //
  _packedAcBuf: Uint16Array
  _packedAc: number
  _packedAcEnd: number
  _packedDcBuf: Uint16Array
  _packedDc: number

  _remDcCount: number

  //
  // half -> half LUT to transform from nonlinear to linear
  //
  _toLinear: Uint16Array | null

  //
  // image dimensions
  //
  _width: number
  _height: number

  _channel_decode_data: (DctCoderChannelData | null)[]
  _channel_decode_data_count: number
}

/** The AC cursor of LossyDctDecoder_execute (currAcComp). */
interface AcCursor { pos: number }

//
// Un-RLE the packed AC components into
// a half buffer. The half block should
// be the full 8x8 block (in zig-zag order
// still), not the first AC component.
//
// currAcComp is advanced as bytes are decoded.
//
// This returns the index of the last non-zero
// value in the buffer - with the index into zig zag
// order data. If we return 0, we have DC only data.
//
//
// This is assuminging that halfZigBlock is zero'ed
// prior to calling
//
/** internal_dwa_decoder.h:110-167 LossyDctDecoder_unRleAc: returns
 *  lastNonZero. */
function LossyDctDecoder_unRleAc(d: LossyDctDecoder, currAcComp: AcCursor, packedAcEnd: number,
  halfZigBlock: Uint16Array): number {
  //
  // Un-RLE the RLE'd blocks. If we find an item whose
  // high byte is 0xff, then insert the number of 0's
  // as indicated by the low byte.
  //
  // Otherwise, just copy the number verbatim.
  //
  const ac = d._packedAcBuf
  let dctComp = 1
  let acComp = currAcComp.pos
  let lnz = 0
  let ac_count = 0

  //
  // Start with a zero'ed block, so we don't have to
  // write when we hit a run symbol
  //

  while (dctComp < 64) {
    if (acComp >= packedAcEnd) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    const val = ac[acComp]!
    if ((val & 0xff00) === 0xff00) {
      const count = val & 0xff

      // run, insert 0s - since block pre-zeroed, nothing to do
      // just increment dctComp but test for end of block...
      dctComp += (count === 0) ? 64 : count
    } else {
      //
      // Not a run, just copy over the value
      //
      lnz = dctComp
      halfZigBlock[dctComp] = val

      ++dctComp
    }

    ++ac_count
    ++acComp
  }

  d._packedAcCount += ac_count
  currAcComp.pos = acComp
  return lnz
}

/** internal_dwa_decoder.h:254-283 LossyDctDecoder_base_construct */
function LossyDctDecoder_base_construct(packedAcBuf: Uint16Array, packedAc: number, packedAcEnd: number,
  packedDcBuf: Uint16Array, packedDc: number, remDcCount: number, toLinear: Uint16Array | null,
  width: number, height: number): LossyDctDecoder {
  return {
    _packedAcCount: 0,
    _packedDcCount: 0,
    _packedAcBuf: packedAcBuf,
    _packedAc: packedAc,
    _packedAcEnd: packedAcEnd,
    _packedDcBuf: packedDcBuf,
    _packedDc: packedDc,
    _remDcCount: remDcCount,
    _toLinear: toLinear,
    _width: width,
    _height: height,

    //d->_isNativeXdr = GLOBAL_SYSTEM_LITTLE_ENDIAN;

    _channel_decode_data: [null, null, null],
    _channel_decode_data_count: 0,
  }
}

//
// Used to decode a single channel of LOSSY_DCT data.
//
/** internal_dwa_decoder.h:172-205 LossyDctDecoder_construct */
function LossyDctDecoder_construct(rowPtrs: DctCoderChannelData, packedAcBuf: Uint16Array, packedAc: number,
  packedAcEnd: number, packedDcBuf: Uint16Array, packedDc: number, remDcCount: number,
  toLinear: Uint16Array | null, width: number, height: number): LossyDctDecoder {
  //
  // toLinear is a half-float LUT to convert the encoded values
  // back to linear light. If you want to skip this step, pass
  // in NULL here.
  //
  const d = LossyDctDecoder_base_construct(packedAcBuf, packedAc, packedAcEnd, packedDcBuf, packedDc,
    remDcCount, toLinear, width, height)

  d._channel_decode_data[0] = rowPtrs
  d._channel_decode_data_count = 1

  return d
}

//
// Used to decode 3 channels of LOSSY_DCT data that
// are grouped together and color space converted.
//
//
// toLinear is a half-float LUT to convert the encoded values
// back to linear light. If you want to skip this step, pass
// in NULL here.
//
/** internal_dwa_decoder.h:218-250 LossyDctDecoderCsc_construct */
function LossyDctDecoderCsc_construct(rowPtrsR: DctCoderChannelData, rowPtrsG: DctCoderChannelData,
  rowPtrsB: DctCoderChannelData, packedAcBuf: Uint16Array, packedAc: number, packedAcEnd: number,
  packedDcBuf: Uint16Array, packedDc: number, remDcCount: number, toLinear: Uint16Array | null,
  width: number, height: number): LossyDctDecoder {
  const d = LossyDctDecoder_base_construct(packedAcBuf, packedAc, packedAcEnd, packedDcBuf, packedDc,
    remDcCount, toLinear, width, height)

  d._channel_decode_data[0] = rowPtrsR
  d._channel_decode_data[1] = rowPtrsG
  d._channel_decode_data[2] = rowPtrsB
  d._channel_decode_data_count = 3

  return d
}

/** internal_dwa_decoder.h:287-767 LossyDctDecoder_execute, writing the
 *  rows (byte offsets into the unpacked buffer) through `outView`. The !IMF_HAVE_SSE2 code
 *  paths are ported (arm64); the SSE2 paths store the same values. */
function LossyDctDecoder_execute(d: LossyDctDecoder, outView: DataView): void {
  const numComp = d._channel_decode_data_count
  const chanData: DctCoderChannelData[] = []
  let lastNonZero = 0
  const numBlocksX = Math.trunc((d._width + 7) / 8)
  const numBlocksY = Math.trunc((d._height + 7) / 8)
  const leftoverX = d._width - (numBlocksX - 1) * 8
  const leftoverY = d._height - (numBlocksY - 1) * 8

  const numFullBlocksX = Math.trunc(d._width / 8)

  const currAcComp: AcCursor = { pos: d._packedAc }
  const acCompEnd = d._packedAcEnd
  const currDcComp: number[] = [0, 0, 0]
  const rowBlock: number[] = [0, 0, 0]
  const dcBuf = d._packedDcBuf

  if (d._remDcCount < numComp * numBlocksX * numBlocksY) {
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }

  for (let chan = 0; chan < numComp; ++chan) {
    chanData[chan] = d._channel_decode_data[chan]!
  }

  //
  // Allocate a temp aligned buffer to hold a rows worth of full
  // 8x8 half-float blocks
  //
  const rowBlockHandle = new Uint16Array(numComp * numBlocksX * 64)

  rowBlock[0] = 0

  for (let comp = 1; comp < numComp; ++comp) rowBlock[comp] = rowBlock[comp - 1]! + numBlocksX * 64

  //
  // Pack DC components together by common plane, so we can get
  // a little more out of differencing them. We'll always have
  // one component per block, so we can computed offsets.
  //

  currDcComp[0] = d._packedDc
  for (let comp = 1; comp < numComp; ++comp) currDcComp[comp] = currDcComp[comp - 1]! + numBlocksX * numBlocksY

  for (let blocky = 0; blocky < numBlocksY; ++blocky) {
    let maxY = 8, maxX = 8
    if (blocky === numBlocksY - 1) maxY = leftoverY

    for (let blockx = 0; blockx < numBlocksX; ++blockx) {
      let blockIsConstant = DWA_CLASSIFIER_TRUE

      if (blockx === numBlocksX - 1) maxX = leftoverX

      //
      // If we can detect that the block is constant values
      // (all components only have DC values, and all AC is 0),
      // we can do everything only on 1 value, instead of all
      // 64.
      //
      // This won't really help for regular images, but it is
      // meant more for layers with large swaths of black
      //
      for (let comp = 0; comp < numComp; ++comp) {
        const halfZigData = chanData[comp]!._halfZigData
        const dctData = chanData[comp]!._dctData
        //
        // DC component is stored separately
        //

        halfZigData.fill(0)
        halfZigData[0] = dcBuf[currDcComp[comp]!++]!

        d._packedDcCount++

        //
        // UnRLE the AC. This will modify currAcComp
        //

        lastNonZero = LossyDctDecoder_unRleAc(d, currAcComp, acCompEnd, halfZigData)

        //
        // Convert from XDR to NATIVE
        //

        // priv_to_native16 (halfZigData, 64): a no-op on little-endian hosts

        if (lastNonZero === 0) {
          //
          // DC only case - AC components are all 0
          //
          dctData[0] = half_to_float(halfZigData[0]!)

          dctInverse8x8DcOnly(dctData)
        } else {
          //
          // We have some AC components that are non-zero.
          // Can't use the 'constant block' optimization
          //

          blockIsConstant = DWA_CLASSIFIER_FALSE

          //
          // Un-Zig zag
          //

          fromHalfZigZag(halfZigData, dctData)

          //
          // Zig-Zag indices in normal layout are as follows:
          //
          // 0   1   5   6   14  15  27  28
          // 2   4   7   13  16  26  29  42
          // 3   8   12  17  25  30  41  43
          // 9   11  18  24  31  40  44  53
          // 10  19  23  32  39  45  52  54
          // 20  22  33  38  46  51  55  60
          // 21  34  37  47  50  56  59  61
          // 35  36  48  49  57  58  62  63
          //
          // If lastNonZero is less than the first item on
          // each row, we know that the whole row is zero and
          // can be skipped in the row-oriented part of the
          // iDCT.
          //
          // The unrolled logic here is:
          //
          //    if lastNonZero < rowStartIdx[i],
          //    zeroedRows = rowsEmpty[i]
          //
          // where:
          //
          //    const int rowStartIdx[] = {2, 3, 9, 10, 20, 21, 35};
          //    const int rowsEmpty[]   = {7, 6, 5,  4,  3,  2,  1};
          //

          if (lastNonZero < 2) dctInverse8x8_7(dctData)
          else if (lastNonZero < 3) dctInverse8x8_6(dctData)
          else if (lastNonZero < 9) dctInverse8x8_5(dctData)
          else if (lastNonZero < 10) dctInverse8x8_4(dctData)
          else if (lastNonZero < 20) dctInverse8x8_3(dctData)
          else if (lastNonZero < 21) dctInverse8x8_2(dctData)
          else if (lastNonZero < 35) dctInverse8x8_1(dctData)
          else dctInverse8x8_0(dctData)
        }
      }

      //
      // Perform the CSC
      //

      if (numComp === 3) {
        if (!blockIsConstant) {
          csc709Inverse64(chanData[0]!._dctData, chanData[1]!._dctData, chanData[2]!._dctData)
        } else {
          csc709Inverse(chanData[0]!._dctData, chanData[1]!._dctData, chanData[2]!._dctData, 0)
        }
      }

      //
      // Float -> Half conversion.
      //
      // If the block has a constant value, just convert the first pixel.
      //

      for (let comp = 0; comp < numComp; ++comp) {
        if (!blockIsConstant) {
          convertFloatToHalf64(rowBlockHandle, rowBlock[comp]! + blockx * 64, chanData[comp]!._dctData)
        } else {
          const dst = rowBlock[comp]! + blockx * 64

          rowBlockHandle[dst] = float_to_half(chanData[comp]!._dctData[0]!)

          for (let i = 1; i < 64; ++i) {
            rowBlockHandle[dst + i] = rowBlockHandle[dst]!
          }
        } // blockIsConstant
      } // comp
    } // blockx

    //
    // At this point, we have half-float nonlinear value blocked
    // in rowBlock[][]. We need to unblock the data, transfer
    // back to linear, and write the results in the _rowPtrs[].
    //
    // There is a fast-path for aligned rows, which helps
    // things a little. Since this fast path is only valid
    // for full 8-element wide blocks, the partial x blocks
    // are broken into a separate loop below.
    //
    // At the moment, the fast path requires:
    //   * sse support
    //   * aligned row pointers
    //   * full 8-element wide blocks
    //

    for (let comp = 0; comp < numComp; ++comp) {
      const rows = chanData[comp]!._rows
      const toLinear = d._toLinear
      if (toLinear) {
        //
        // Basic scalar kinda slow path for handling the full X blocks
        //

        for (let y = 8 * blocky; y < 8 * blocky + maxY; ++y) {
          let dst = rows[y]!

          for (let blockx = 0; blockx < numFullBlocksX; ++blockx) {
            const src = rowBlock[comp]! + blockx * 64 + ((y & 0x7) * 8)

            for (let i = 0; i < 8; ++i) outView.setUint16(dst + 2 * i, toLinear[rowBlockHandle[src + i]!]!, true)

            dst += 16
          }
        }
      } else {
        // no-op conversion to linear
        for (let y = 8 * blocky; y < 8 * blocky + maxY; ++y) {
          let dst = rows[y]!

          for (let blockx = 0; blockx < numFullBlocksX; ++blockx) {
            const src = rowBlock[comp]! + blockx * 64 + ((y & 0x7) * 8)
            for (let i = 0; i < 8; ++i) outView.setUint16(dst + 2 * i, rowBlockHandle[src + i]!, true)
            dst += 16
          }
        }
      }

      //
      // If we have partial X blocks, deal with all those now
      // Since this should be minimal work, there currently
      // is only one path that should work for everyone.
      //

      if (numFullBlocksX !== numBlocksX) {
        for (let y = 8 * blocky; y < 8 * blocky + maxY; ++y) {
          let src = rowBlock[comp]! + numFullBlocksX * 64 + ((y & 0x7) * 8)

          let dst = rows[y]!

          dst += 2 * 8 * numFullBlocksX

          if (toLinear) {
            for (let x = 0; x < maxX; ++x) {
              outView.setUint16(dst, toLinear[rowBlockHandle[src++]!]!, true)
              dst += 2
            }
          } else {
            for (let x = 0; x < maxX; ++x) {
              outView.setUint16(dst, rowBlockHandle[src++]!, true)
              dst += 2
            }
          }
        }
      }
    } // comp
  } // blocky

  //
  // Walk over all the channels that are of type FLOAT.
  // Convert from HALF XDR back to FLOAT XDR.
  //

  for (let chan = 0; chan < numComp; ++chan) {
    if (chanData[chan]!._type !== EXR_PIXEL_FLOAT) continue

    /* process in place in reverse to avoid temporary buffer */
    for (let y = 0; y < d._height; ++y) {
      const rowBytes = chanData[chan]!._rows[y]!

      for (let x = d._width - 1; x >= 0; --x) {
        const h = outView.getUint16(rowBytes + x * 2, true)
        outView.setUint32(rowBytes + x * 4, half_to_float_int(h), true)
      }
    }
  }
}

/**************************************/
// internal_dwa_compressor.h

/** internal_dwa_compressor.h:12-45 DwaCompressor (decode members). The
 *  buffers that are only zlib / Huffman targets upstream (_rleBuffer, the
 *  AC buffer for DEFLATE) keep their sizes for the checks; the arrays are
 *  exr_uncompress_buffer's results. */
interface DwaCompressor {
  _decode: ExrDecodePipeline

  _acCompression: number

  _numScanLines: number
  _min: [number, number]
  _max: [number, number]

  _numChannels: number
  _numCscChannelSets: number
  _channelData: ChannelData[]
  _cscChannelSets: CscChannelSet[]

  _channelRules: readonly Classifier[]
  _channelRuleCount: number

  _packedAcBuffer: Uint16Array | null
  _packedAcBufferSize: bigint
  _packedDcBuffer: Uint8Array | null
  _packedDcBufferSize: bigint
  _rleBufferSize: bigint
  _planarUncBuffer: (Uint8Array | null)[]
  _planarUncBufferSize: bigint[]
}

/** internal_dwa_compressor.h:93-190 DwaCompressor_construct (the decode
 *  branch; initializeFuncs is the static dispatch in openexrCoreDwaSimd.ts). */
function DwaCompressor_construct(acCompression: number, decode: ExrDecodePipeline): DwaCompressor {
  exrcore_ensure_dwa_tables()

  const me: DwaCompressor = {
    _decode: decode,
    _acCompression: acCompression,
    _numScanLines: 0,
    _min: [0, 0],
    _max: [0, 0],
    _numChannels: 0,
    _numCscChannelSets: 0,
    _channelData: [],
    _cscChannelSets: [],
    _channelRules: [],
    _channelRuleCount: 0,
    _packedAcBuffer: null,
    _packedAcBufferSize: 0n,
    _packedDcBuffer: null,
    _packedDcBufferSize: 0n,
    _rleBufferSize: 0n,
    _planarUncBuffer: [null, null, null],
    _planarUncBufferSize: [0n, 0n, 0n],
  }

  me._numChannels = decode.channels.length
  for (let c = 0; c < decode.channels.length; ++c) {
    me._channelData.push({
      // memset 0: DctCoderChannelData with _type 0, set again per row below
      _dctData: DctCoderChannelData_construct(0),
      chan: decode.channels[c]!,
      planarUncBuffer: null,
      planarUncBufferStart: 0,
      planarUncBufferEnd: 0,
      planarUncRle: [0, 0, 0, 0],
      planarUncRleEnd: [0, 0, 0, 0],
      planarUncSize: 0,
      processed: 0,
      compression: UNKNOWN,
      planarUncType: 0,
    })
  }

  me._numScanLines = decode.chunk.height

  me._min[0] = decode.chunk.start_x
  me._min[1] = decode.chunk.start_y
  me._max[0] = me._min[0] + decode.chunk.width - 1
  me._max[1] = me._min[1] + decode.chunk.height - 1
  return me
}

/** internal_dwa_compressor.h:691-726 validate_size */
function validate_size(me: DwaCompressor, compression: number, compressedSize: bigint, uncompressedSize: bigint,
  extraSize: bigint): void {
  let requiredSize = 0n
  for (let c = 0; c < me._numChannels; ++c) {
    if (me._channelData[c]!.compression === compression) {
      const chanSize = BigInt(me._channelData[c]!.planarUncSize)

      /* guard against wraparound when accumulating attacker-influenced
       * per-channel sizes; a wrap would understate requiredSize and
       * defeat the validation below */
      if (chanSize > U64_MAX - requiredSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

      requiredSize += chanSize
    }
  }

  if (requiredSize > 0n) {
    if (uncompressedSize < requiredSize || compressedSize === 0n) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }
  } else if (uncompressedSize > 0n || compressedSize > 0n || extraSize > 0n) {
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }
}

/** exr_uncompress_buffer, with any failure reported as `code`. */
async function uncompressOr(code: number | null, input: Uint8Array, out_bytes_avail: number): Promise<Uint8Array> {
  try {
    return await exr_uncompress_buffer(input, out_bytes_avail)
  } catch (error) {
    if (code !== null && error instanceof ExrError) throw new ExrError(code)
    throw error
  }
}

/** internal_dwa_compressor.h:728-1306 DwaCompressor_uncompress */
async function DwaCompressor_uncompress(me: DwaCompressor, inBuf: Uint8Array, unpacked: Uint8Array): Promise<void> {
  const iSize = BigInt(inBuf.length)
  const uncompressed_size = BigInt(unpacked.length)
  let headerSize = BigInt(NUM_SIZES_SINGLE * 8)

  if (iSize < headerSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

  //
  // Flip the counters from XDR to NATIVE
  //

  unpacked.fill(0)

  const inView = new DataView(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength)
  const counters: bigint[] = []
  for (let i = 0; i < NUM_SIZES_SINGLE; ++i) counters.push(inView.getBigUint64(i * 8, true))

  //
  // Unwind all the counter info
  //
  const version = counters[VERSION]!
  const unknownUncompressedSize = counters[UNKNOWN_UNCOMPRESSED_SIZE]!
  const unknownCompressedSize = counters[UNKNOWN_COMPRESSED_SIZE]!
  const acCompressedSize = counters[AC_COMPRESSED_SIZE]!
  const dcCompressedSize = counters[DC_COMPRESSED_SIZE]!
  const rleCompressedSize = counters[RLE_COMPRESSED_SIZE]!
  const rleUncompressedSize = counters[RLE_UNCOMPRESSED_SIZE]!
  const rleRawSize = counters[RLE_RAW_SIZE]!

  let totalAcUncompressedCount = counters[AC_UNCOMPRESSED_COUNT]!
  let totalDcUncompressedCount = counters[DC_UNCOMPRESSED_COUNT]!

  const acCompression = counters[AC_COMPRESSION]!

  const compressedSize = (unknownCompressedSize + acCompressedSize + dcCompressedSize + rleCompressedSize) & U64_MASK

  const dataPtrEnd = inBuf.length
  let dataPtr = Number(headerSize)
  let dataLeft = iSize - headerSize

  /* Both the sum and individual sizes are checked in case of overflow. */
  if (iSize < ((headerSize + compressedSize) & U64_MASK) ||
    iSize < unknownCompressedSize || iSize < acCompressedSize ||
    iSize < dcCompressedSize || iSize < rleCompressedSize) {
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }

  /* check for overflow conditions in the unc sizes, corrupt file no
     need to check the rleUncompressedSize, the zipped rle data will
     be checked below */
  if (unknownUncompressedSize > uncompressed_size ||
    rleRawSize > uncompressed_size ||
    ((unknownUncompressedSize + rleRawSize) & U64_MASK) > uncompressed_size) {
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }

  if ((unknownUncompressedSize & INT64_SIGN) !== 0n ||
    (unknownCompressedSize & INT64_SIGN) !== 0n || (acCompressedSize & INT64_SIGN) !== 0n ||
    (dcCompressedSize & INT64_SIGN) !== 0n || (rleCompressedSize & INT64_SIGN) !== 0n ||
    (rleUncompressedSize & INT64_SIGN) !== 0n || (rleRawSize & INT64_SIGN) !== 0n ||
    (totalAcUncompressedCount & INT64_SIGN) !== 0n ||
    (totalDcUncompressedCount & INT64_SIGN) !== 0n) {
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }

  if (version < 2n) {
    me._channelRules = sLegacyChannelRules
    me._channelRuleCount = sLegacyChannelRules.length
  } else {
    const cur: ByteCursor = { buf: inBuf, ptr: dataPtr, size: Number(dataLeft) }
    const ruleSize = DwaCompressor_readChannelRules(me, cur)
    dataPtr = cur.ptr
    dataLeft = BigInt(cur.size)

    headerSize += BigInt(ruleSize)
  }

  DwaCompressor_initializeBuffers(me, unpacked.length)

  //
  // Allocate _outBuffer, if we haven't done so already
  //

  // the C++ classes used to have one buffer size for compress / uncompress
  // but here we want to do zero-ish copy...
  let outBufferEnd = 0 // me->_decode->unpacked_buffer
  const outView = new DataView(unpacked.buffer, unpacked.byteOffset, unpacked.byteLength)

  //
  // Find the start of the RLE packed AC components and
  // the DC components for each channel. This will be handy
  // if you want to decode the channels in parallel later on.
  //

  let packedAcBufferEnd = 0 // element offset into _packedAcBuffer

  let packedDcBufferEnd = 0 // element offset into the packed DC values

  //
  // UNKNOWN data is packed first, followed by the
  // Huffman-compressed AC, then the DC values,
  // and then the zlib compressed RLE data.
  //

  // Offsets into inBuf; all sizes are < 2^63 here, so the sums are exact.
  const compressedUnknownBuf = dataPtr

  const compressedAcBuf = compressedUnknownBuf + Number(unknownCompressedSize)
  const compressedDcBuf = compressedAcBuf + Number(acCompressedSize)
  const compressedRleBuf = compressedDcBuf + Number(dcCompressedSize)

  if (compressedUnknownBuf > dataPtrEnd || dataPtr > compressedAcBuf ||
    compressedAcBuf > dataPtrEnd || dataPtr > compressedDcBuf ||
    compressedDcBuf > dataPtrEnd || dataPtr > compressedRleBuf ||
    compressedRleBuf > dataPtrEnd ||
    (compressedRleBuf + Number(rleCompressedSize)) > dataPtrEnd) {
    throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }

  //
  // Sanity check that the version is something we expect. Right now,
  // we can decode version 0, 1, and 2. v1 adds 'end of block' symbols
  // to the AC RLE. v2 adds channel classification rules at the
  // start of the data block.
  //

  if (version > 2n) throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER)

  DwaCompressor_setupChannelData(me)

  validate_size(me, UNKNOWN, unknownCompressedSize, unknownUncompressedSize, 0n)

  validate_size(me, RLE, rleCompressedSize, rleRawSize, rleUncompressedSize)

  //
  // Uncompress the UNKNOWN data into _planarUncBuffer[UNKNOWN]
  //

  if (unknownCompressedSize > 0n) {
    if (unknownUncompressedSize > me._planarUncBufferSize[UNKNOWN]!) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    const unc = await uncompressOr(EXR_ERR_CORRUPT_CHUNK,
      inBuf.subarray(compressedUnknownBuf, compressedUnknownBuf + Number(unknownCompressedSize)),
      Number(unknownUncompressedSize))
    me._planarUncBuffer[UNKNOWN]!.set(unc)
  }

  //
  // Uncompress the AC data into _packedAcBuffer
  //

  if (acCompressedSize > 0n) {
    if (!me._packedAcBuffer ||
      ((totalAcUncompressedCount * 2n) & U64_MASK) > me._packedAcBufferSize) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    //
    // Don't trust the user to get it right, look in the file.
    //

    const compressedAc = inBuf.subarray(compressedAcBuf, compressedAcBuf + Number(acCompressedSize))
    switch (acCompression) {
      case BigInt(STATIC_HUFFMAN):
        internal_huf_decompress(compressedAc, me._packedAcBuffer.subarray(0, Number(totalAcUncompressedCount)))
        break

      case BigInt(DEFLATE): {
        const acBytes = Number(totalAcUncompressedCount * 2n)
        const unc = await exr_uncompress_buffer(compressedAc, acBytes)
        const destLen = unc.length

        if (acBytes !== destLen) {
          throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
        }
        new Uint8Array(me._packedAcBuffer.buffer, me._packedAcBuffer.byteOffset, acBytes).set(unc)
      }
        break

      default: throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }
  }

  //
  // Uncompress the DC data into _packedDcBuffer
  //

  if (dcCompressedSize > 0n) {
    const uncompBytes = (totalDcUncompressedCount * 2n) & U64_MASK
    if (uncompBytes > me._packedDcBufferSize) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    const scratch = await uncompressOr(EXR_ERR_CORRUPT_CHUNK,
      inBuf.subarray(compressedDcBuf, compressedDcBuf + Number(dcCompressedSize)), Number(uncompBytes))
    if (BigInt(scratch.length) !== uncompBytes) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    internal_zip_reconstruct_bytes(me._packedDcBuffer!, scratch, scratch.length)
  } else {
    // if the compressed size is 0, then the uncompressed size must also be zero
    if (totalDcUncompressedCount !== 0n) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
  }

  //
  // Uncompress the RLE data into _rleBuffer, then unRLE the results
  // into _planarUncBuffer[RLE]
  //

  if (rleRawSize > 0n) {
    if (rleUncompressedSize > me._rleBufferSize ||
      rleRawSize > me._planarUncBufferSize[RLE]!) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    const rleBuffer = await uncompressOr(EXR_ERR_CORRUPT_CHUNK,
      inBuf.subarray(compressedRleBuf, compressedRleBuf + Number(rleCompressedSize)), Number(rleUncompressedSize))
    const dstLen = rleBuffer.length

    if (BigInt(dstLen) !== rleUncompressedSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

    if (internal_rle_decompress(me._planarUncBuffer[RLE]!, Number(rleRawSize), rleBuffer,
      Number(rleUncompressedSize)) !== Number(rleRawSize)) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }
  }

  //
  // Determine the start of each row in the output buffer
  //
  for (let c = 0; c < me._numChannels; ++c) {
    me._channelData[c]!.processed = 0
  }

  for (let y = me._min[1]; y <= me._max[1]; ++y) {
    for (let c = 0; c < me._numChannels; ++c) {
      const cd = me._channelData[c]!
      const chan = cd.chan

      if ((y % chan.y_samples) !== 0) continue

      DctCoderChannelData_push_row(cd._dctData, outBufferEnd)

      cd._dctData._type = chan.data_type
      outBufferEnd += chan.width * chan.bytes_per_element
    }
  }

  // The packed AC / DC values as uint16 (little-endian host).
  const packedAc = me._packedAcBuffer ?? new Uint16Array(0)
  const packedDc = me._packedDcBuffer
    ? new Uint16Array(me._packedDcBuffer.buffer, me._packedDcBuffer.byteOffset, me._packedDcBuffer.length >> 1)
    : new Uint16Array(0)
  // packedAcBufferEnd + totalAcUncompressedCount: with no AC data upstream
  // forms this end pointer from an unchecked count; here it is clamped to
  // the buffer (a read past it is a corrupt chunk either way).
  const acEnd = (start: number, count: bigint): number =>
    Math.min(packedAc.length, start + Number(count < BigInt(packedAc.length) ? count : BigInt(packedAc.length)))

  //
  // Setup to decode each block of 3 channels that need to
  // be handled together
  //

  for (let csc = 0; csc < me._numCscChannelSets; ++csc) {
    const cset = me._cscChannelSets[csc]!

    const rChan = cset.idx[0]
    const gChan = cset.idx[1]
    const bChan = cset.idx[2]

    if (me._channelData[rChan]!.compression !== LOSSY_DCT ||
      me._channelData[gChan]!.compression !== LOSSY_DCT ||
      me._channelData[bChan]!.compression !== LOSSY_DCT) {
      throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    const decoder = LossyDctDecoderCsc_construct(
      me._channelData[rChan]!._dctData,
      me._channelData[gChan]!._dctData,
      me._channelData[bChan]!._dctData,
      packedAc,
      packedAcBufferEnd,
      acEnd(packedAcBufferEnd, totalAcUncompressedCount),
      packedDc,
      packedDcBufferEnd,
      Number(totalDcUncompressedCount),
      exrcore_dwaToLinearTable,
      me._channelData[rChan]!.chan.width,
      me._channelData[rChan]!.chan.height)

    LossyDctDecoder_execute(decoder, outView)

    packedAcBufferEnd += decoder._packedAcCount

    packedDcBufferEnd += decoder._packedDcCount

    totalAcUncompressedCount -= BigInt(decoder._packedAcCount)
    totalDcUncompressedCount -= BigInt(decoder._packedDcCount)

    me._channelData[rChan]!.processed = 1
    me._channelData[gChan]!.processed = 1
    me._channelData[bChan]!.processed = 1
  }

  //
  // Setup to handle the remaining channels by themselves
  //

  for (let c = 0; c < me._numChannels; ++c) {
    const cd = me._channelData[c]!
    const chan = cd.chan
    const dcddata = cd._dctData
    const pixelSize = chan.bytes_per_element

    if (cd.processed) continue

    if (chan.width === 0 || chan.height === 0) {
      cd.processed = 1
      continue
    }

    switch (cd.compression) {
      case LOSSY_DCT:

        //
        // Setup a single-channel lossy DCT decoder pointing
        // at the output buffer
        //

        {
          let linearLut: Uint16Array | null = null

          if (!chan.p_linear) linearLut = exrcore_dwaToLinearTable

          const decoder = LossyDctDecoder_construct(
            dcddata,
            packedAc,
            packedAcBufferEnd,
            acEnd(packedAcBufferEnd, totalAcUncompressedCount),
            packedDc,
            packedDcBufferEnd,
            Number(totalDcUncompressedCount),
            linearLut,
            chan.width,
            chan.height)

          LossyDctDecoder_execute(decoder, outView)

          packedAcBufferEnd += decoder._packedAcCount

          packedDcBufferEnd += decoder._packedDcCount

          totalAcUncompressedCount -= BigInt(decoder._packedAcCount)
          totalDcUncompressedCount -= BigInt(decoder._packedDcCount)
        }

        break

      case RLE:

        //
        // For the RLE case, the data has been un-RLE'd into
        // planarUncRleEnd[], but is still split out by bytes.
        // We need to rearrange the bytes back into the correct
        // order in the output buffer;
        //

        {
          let row = 0
          const src = cd.planarUncBuffer!

          for (let y = me._min[1]; y <= me._max[1]; ++y) {
            if ((y % chan.y_samples) !== 0) continue

            let dst = dcddata._rows[row]!

            if (pixelSize === 2) {
              interleaveByte2(unpacked, dst, src, cd.planarUncRleEnd[0]!, cd.planarUncRleEnd[1]!, chan.width)

              cd.planarUncRleEnd[0]! += chan.width
              cd.planarUncRleEnd[1]! += chan.width
            } else {
              for (let x = 0; x < chan.width; ++x) {
                for (let byte = 0; byte < pixelSize; ++byte) {
                  unpacked[dst++] = src[cd.planarUncRleEnd[byte]!++]!
                }
              }
            }

            row++
          }
        }

        break

      case UNKNOWN:

        //
        // In the UNKNOWN case, data is already in planarUncBufferEnd
        // and just needs to copied over to the output buffer
        //

        {
          let row = 0
          const dstScanlineSize = chan.width * pixelSize
          const src = cd.planarUncBuffer!

          for (let y = me._min[1]; y <= me._max[1]; ++y) {
            if ((y % chan.y_samples) !== 0) continue

            //
            // sanity check for buffer data lying within range
            //
            if (BigInt(cd.planarUncBufferEnd + dstScanlineSize) > me._planarUncBufferSize[UNKNOWN]!) {
              throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
            }

            unpacked.set(src.subarray(cd.planarUncBufferEnd, cd.planarUncBufferEnd + dstScanlineSize),
              dcddata._rows[row]!)

            cd.planarUncBufferEnd += dstScanlineSize
            row++
          }
        }

        break

      case NUM_COMPRESSOR_SCHEMES:
      default: throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
    }

    cd.processed = 1
  }
}

/** internal_dwa_compressor.h:1310-1533 DwaCompressor_initializeBuffers (the
 *  computed *bufferSize, maxOutBufferSize, is only used by the encoder and
 *  is not computed; neither is Classifier_size, internal_dwa_classifier.h:
 *  158-162, which only feeds it). Divergence: _planarUncBuffer[UNKNOWN] keeps upstream's
 *  size (exr_compress_max_buffer_size of the UNKNOWN bytes) for the range
 *  checks, but the array allocated is at most the chunk's unpacked size,
 *  which bounds everything stored in or read from it (uncompress checks
 *  unknownUncompressedSize <= unpacked size, and validate_size checks
 *  the channels' sum <= unknownUncompressedSize). */
function DwaCompressor_initializeBuffers(me: DwaCompressor, unpackedLength: number): void {
  //
  // _outBuffer needs to be big enough to hold all our
  // compressed data - which could vary depending on what sort
  // of channels we have.
  //

  let numLossyDctChans = 0n
  let rleBufferSize = 0n

  const fround = Math.fround
  const blocksY = BigInt(Math.ceil(fround(fround(me._numScanLines) / 8.0)))
  const blocksX = BigInt(Math.ceil(fround(fround(me._max[0] - me._min[0] + 1) / 8.0)))

  const maxLossyDctAcSize = (blocksY * blocksX * 63n * 2n) & U64_MASK

  const maxLossyDctDcSize = (blocksY * blocksX * 2n) & U64_MASK

  const pixelCount = (BigInt(me._numScanLines) * BigInt(me._max[0] - me._min[0] + 1)) & U64_MASK

  const planarUncBufferSize: bigint[] = [0n, 0n, 0n]

  DwaCompressor_classifyChannels(me)

  for (let c = 0; c < me._numChannels; ++c) {
    const curc = me._channelData[c]!.chan
    switch (me._channelData[c]!.compression) {
      case LOSSY_DCT:

        //
        // This is the size of the number of packed
        // components, plus the requirements for
        // maximum Huffman encoding size (for STATIC_HUFFMAN)
        // or for zlib compression (for DEFLATE)
        //

        numLossyDctChans++
        break

      case RLE:
        //
        // RLE, if gone horribly wrong, could double the size
        // of the source data.
        //
        rleBufferSize += 2n * pixelCount * BigInt(curc.bytes_per_element)

        planarUncBufferSize[RLE]! += 2n * pixelCount * BigInt(curc.bytes_per_element)
        break

      case UNKNOWN:
        planarUncBufferSize[UNKNOWN]! += pixelCount * BigInt(curc.bytes_per_element)
        break

      case NUM_COMPRESSOR_SCHEMES:
      default: throw new ExrError(EXR_ERR_INVALID_ARGUMENT)
    }
  }

  //
  // _packedAcBuffer holds the quantized DCT coefficients prior
  // to Huffman encoding
  //

  if (maxLossyDctAcSize * numLossyDctChans > me._packedAcBufferSize) {
    me._packedAcBufferSize = maxLossyDctAcSize * numLossyDctChans
    if (me._packedAcBufferSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
    try {
      me._packedAcBuffer = new Uint16Array(Number(me._packedAcBufferSize) >> 1)
    } catch {
      throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
    }
  }

  //
  // _packedDcBuffer holds one quantized DCT coef per 8x8 block
  //

  if (maxLossyDctDcSize * numLossyDctChans > me._packedDcBufferSize) {
    me._packedDcBufferSize = maxLossyDctDcSize * numLossyDctChans
    if (me._packedDcBufferSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
    try {
      me._packedDcBuffer = new Uint8Array(Number(me._packedDcBufferSize))
    } catch {
      throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
    }
  }

  if (rleBufferSize > me._rleBufferSize) {
    me._rleBufferSize = rleBufferSize
  }

  //
  // The planar uncompressed buffer will hold float data for LOSSY_DCT
  // compressed values, and whatever the native type is for other
  // channels. We're going to use this to hold data in a planar
  // format, as opposed to the native interleaved format we take
  // into compress() and give back from uncompress().
  //
  // This also makes it easier to compress the UNKNOWN and RLE data
  // all in one swoop (for each compression scheme).
  //

  //
  // UNKNOWN data is going to be zlib compressed, which needs
  // a little extra headroom
  //

  if (planarUncBufferSize[UNKNOWN]! > 0n) {
    planarUncBufferSize[UNKNOWN] = exr_compress_max_buffer_size(planarUncBufferSize[UNKNOWN]!)
  }

  const unpackedSize = BigInt(unpackedLength)
  for (let i = 0; i < NUM_COMPRESSOR_SCHEMES; ++i) {
    if (planarUncBufferSize[i]! > me._planarUncBufferSize[i]!) {
      me._planarUncBufferSize[i] = planarUncBufferSize[i]!

      let alloc = planarUncBufferSize[i]!
      if (i === UNKNOWN && alloc > unpackedSize) alloc = unpackedSize
      if (alloc > BigInt(Number.MAX_SAFE_INTEGER)) throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
      try {
        me._planarUncBuffer[i] = new Uint8Array(Number(alloc))
      } catch {
        throw new ExrError(EXR_ERR_OUT_OF_MEMORY)
      }
    }
  }
}

/** internal_dwa_compressor.h:1582-1648 DwaCompressor_readChannelRules:
 *  advances `cur` (inPtr / nAvail) past the rules and returns ruleSize
 *  (*outRuleSize). */
function DwaCompressor_readChannelRules(me: DwaCompressor, cur: ByteCursor): number {
  let readPtr = cur.ptr

  if (cur.size > 2) {
    let ruleSize = cur.buf[readPtr]! | (cur.buf[readPtr + 1]! << 8)
    let nRules = 0

    if (ruleSize < 2) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

    if (cur.size < ruleSize) throw new ExrError(EXR_ERR_CORRUPT_CHUNK)

    readPtr += 2
    const outRuleSize = ruleSize
    cur.ptr += ruleSize
    cur.size -= ruleSize

    ruleSize -= 2
    // annoying, don't know how many there are yet...
    const tmp: ByteCursor = { buf: cur.buf, ptr: readPtr, size: ruleSize }
    const rules: Classifier[] = []
    while (tmp.size > 0) {
      // Divergence: the rules are kept from this (single) pass; upstream
      // reads them twice (count, then fill) with identical results.
      rules.push(Classifier_read(tmp))
      ++nRules
    }

    // now (if we succeed) we can allocate and fill
    me._channelRuleCount = nRules
    me._channelRules = rules
    return outRuleSize
  }
  throw new ExrError(EXR_ERR_CORRUPT_CHUNK)
}

/** internal_dwa_compressor.h:1652-1745 DwaCompressor_classifyChannels */
function DwaCompressor_classifyChannels(me: DwaCompressor): void {
  //
  // prefixMap used to map channel name prefixes to
  // potential CSC-able sets of channels.
  //

  me._cscChannelSets = []

  //
  // Try and figure out which channels should be
  // compressed by which means.
  //
  const prefixMap: CscPrefixMapItem[] = []
  for (let c = 0; c < me._numChannels; ++c) prefixMap.push({ name: null, prefix_len: 0, idx: [0, 0, 0] })

  for (let c = 0; c < me._numChannels; ++c) {
    const curc = me._channelData[c]!.chan
    const name = _enc.encode(curc.channel_name)
    const suffix = Classifier_find_suffix(name)
    const mapi = prefixMap[CscPrefixMap_find(prefixMap, me._numChannels, name, suffix)]!

    for (let i = 0; i < me._channelRuleCount; ++i) {
      if (Classifier_match(me._channelRules[i]!, name, suffix, curc.data_type)) {
        me._channelData[c]!.compression = me._channelRules[i]!._scheme

        if (me._channelRules[i]!._cscIdx >= 0) mapi.idx[me._channelRules[i]!._cscIdx] = c
      }
    }
  }

  //
  // Finally, try and find RGB sets of channels which
  // can be CSC'ed to a Y'CbCr space prior to loss, for
  // better compression.
  //
  // Walk over our set of candidates, and see who has
  // all three channels defined (and has common sampling
  // patterns, etc).
  //

  for (let c = 0; c < me._numChannels; ++c) {
    const red = prefixMap[c]!.idx[0]
    const grn = prefixMap[c]!.idx[1]
    const blu = prefixMap[c]!.idx[2]

    if (prefixMap[c]!.name === null) break

    if ((red < 0) || (grn < 0) || (blu < 0)) continue

    const redc = me._channelData[red]!.chan
    const grnc = me._channelData[grn]!.chan
    const bluc = me._channelData[blu]!.chan

    if ((redc.x_samples !== grnc.x_samples) ||
      (redc.x_samples !== bluc.x_samples) ||
      (grnc.x_samples !== bluc.x_samples) ||
      (redc.y_samples !== grnc.y_samples) ||
      (redc.y_samples !== bluc.y_samples) ||
      (grnc.y_samples !== bluc.y_samples)) {
      continue
    }

    me._cscChannelSets.push({ idx: [red, grn, blu] })
    ++me._numCscChannelSets
  }
}

/** internal_dwa_compressor.h:1749-1807 DwaCompressor_setupChannelData */
function DwaCompressor_setupChannelData(me: DwaCompressor): void {
  const planarUncBuffer: number[] = [0, 0, 0]

  for (let c = 0; c < me._numChannels; ++c) {
    const cd = me._channelData[c]!
    const curc = cd.chan

    const uncSize = curc.width * curc.height * curc.bytes_per_element
    cd.planarUncSize = uncSize

    cd.planarUncBuffer = me._planarUncBuffer[cd.compression] ?? null
    cd.planarUncBufferStart = planarUncBuffer[cd.compression]!
    cd.planarUncBufferEnd = cd.planarUncBufferStart

    cd.planarUncRle[0] = cd.planarUncBufferStart
    cd.planarUncRleEnd[0] = cd.planarUncRle[0]!

    if (!cd.planarUncBuffer) {
      for (let byte = 1; byte < curc.bytes_per_element; ++byte) {
        cd.planarUncRle[byte] = 0
        cd.planarUncRleEnd[byte] = 0
      }
    } else {
      for (let byte = 1; byte < curc.bytes_per_element; ++byte) {
        cd.planarUncRle[byte] = cd.planarUncRle[byte - 1]! + curc.width * curc.height

        cd.planarUncRleEnd[byte] = cd.planarUncRle[byte]!
      }
    }

    cd.planarUncType = curc.data_type

    if (cd.compression === LOSSY_DCT) {
      cd.planarUncType = EXR_PIXEL_FLOAT
    } else { planarUncBuffer[cd.compression]! += uncSize }
  }
}

/**************************************/
// internal_dwa.c

/** internal_dwa.c:177-214 internal_exr_undo_dwaa */
export async function internal_exr_undo_dwaa(decode: ExrDecodePipeline, packed: Uint8Array,
  unpacked: Uint8Array): Promise<void> {
  try {
    /*
     * decompression doesn't pay attention to the acCompression flag
     * but if it ever needs to, match above discrepancy scanline vs tile
     */
    const dwaa = DwaCompressor_construct(STATIC_HUFFMAN, decode)
    await DwaCompressor_uncompress(dwaa, packed, unpacked)
  } finally {
    decode.bytes_decompressed = unpacked.length
  }
}

/** internal_dwa.c:216-249 internal_exr_undo_dwab */
export async function internal_exr_undo_dwab(decode: ExrDecodePipeline, packed: Uint8Array,
  unpacked: Uint8Array): Promise<void> {
  try {
    const dwab = DwaCompressor_construct(STATIC_HUFFMAN, decode)
    await DwaCompressor_uncompress(dwab, packed, unpacked)
  } finally {
    decode.bytes_decompressed = unpacked.length
  }
}
