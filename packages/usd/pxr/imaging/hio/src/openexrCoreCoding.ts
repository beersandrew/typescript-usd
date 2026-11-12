// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/base.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_coding.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/internal_util.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/openexr_attr.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/openexr_chunkio.h,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/openexr_coding.h,
//  and 2 more cited below
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore): the shared
// definitions of the decoder ports (openexrCore*.ts).
//   openexr_errors.h:33-66 / base.c:27-114   result codes and messages
//   openexr_attr.h                           pixel, compression, storage, tile enums
//   openexr_coding.h                         exr_coding_channel_info_t
//   openexr_chunkio.h                        exr_chunk_info_t
//   openexr_decode.h                         exr_decode_pipeline_t (the parts read here)
//   internal_coding.h:112-236                half_to_float / float_to_half
//   internal_util.h:12-64                    compute_sampled_height / _width
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

/** openexr_errors.h:33-66 (exr_error_code_t). */
export const EXR_ERR_SUCCESS = 0
export const EXR_ERR_OUT_OF_MEMORY = 1
export const EXR_ERR_INVALID_ARGUMENT = 3
export const EXR_ERR_ARGUMENT_OUT_OF_RANGE = 4
export const EXR_ERR_FILE_BAD_HEADER = 6
export const EXR_ERR_READ_IO = 10
export const EXR_ERR_NAME_TOO_LONG = 12
export const EXR_ERR_MISSING_REQ_ATTR = 13
export const EXR_ERR_INVALID_ATTR = 14
export const EXR_ERR_NO_ATTR_BY_NAME = 15
export const EXR_ERR_ATTR_TYPE_MISMATCH = 16
export const EXR_ERR_ATTR_SIZE_MISMATCH = 17
export const EXR_ERR_SCAN_TILE_MIXEDAPI = 18
export const EXR_ERR_TILE_SCAN_MIXEDAPI = 19
export const EXR_ERR_BAD_CHUNK_LEADER = 22
export const EXR_ERR_CORRUPT_CHUNK = 23
export const EXR_ERR_INCOMPLETE_CHUNK_TABLE = 24
export const EXR_ERR_INCORRECT_CHUNK = 26
export const EXR_ERR_INVALID_SAMPLE_DATA = 31
export const EXR_ERR_FEATURE_NOT_IMPLEMENTED = 32
export const EXR_ERR_UNKNOWN = 33

// base.c:27-61
const _errorCodeNames = [
  'EXR_ERR_SUCCESS', 'EXR_ERR_OUT_OF_MEMORY', 'EXR_ERR_MISSING_CONTEXT_ARG',
  'EXR_ERR_INVALID_ARGUMENT', 'EXR_ERR_ARGUMENT_OUT_OF_RANGE', 'EXR_ERR_FILE_ACCESS',
  'EXR_ERR_FILE_BAD_HEADER', 'EXR_ERR_NOT_OPEN_READ', 'EXR_ERR_NOT_OPEN_WRITE',
  'EXR_ERR_HEADER_NOT_WRITTEN', 'EXR_ERR_READ_IO', 'EXR_ERR_WRITE_IO',
  'EXR_ERR_NAME_TOO_LONG', 'EXR_ERR_MISSING_REQ_ATTR', 'EXR_ERR_INVALID_ATTR',
  'EXR_ERR_NO_ATTR_BY_NAME', 'EXR_ERR_ATTR_TYPE_MISMATCH', 'EXR_ERR_ATTR_SIZE_MISMATCH',
  'EXR_ERR_SCAN_TILE_MIXEDAPI', 'EXR_ERR_TILE_SCAN_MIXEDAPI', 'EXR_ERR_MODIFY_SIZE_CHANGE',
  'EXR_ERR_ALREADY_WROTE_ATTRS', 'EXR_ERR_BAD_CHUNK_LEADER', 'EXR_ERR_CORRUPT_CHUNK',
  'EXR_ERR_INCOMPLETE_CHUNK_TABLE', 'EXR_ERR_INCORRECT_PART', 'EXR_ERR_INCORRECT_CHUNK',
  'EXR_ERR_USE_SCAN_DEEP_WRITE', 'EXR_ERR_USE_TILE_DEEP_WRITE', 'EXR_ERR_USE_SCAN_NONDEEP_WRITE',
  'EXR_ERR_USE_TILE_NONDEEP_WRITE', 'EXR_ERR_INVALID_SAMPLE_DATA',
  'EXR_ERR_FEATURE_NOT_IMPLEMENTED', 'EXR_ERR_UNKNOWN',
]

// base.c:67-101
const _defaultErrors = [
  'Success',
  'Unable to allocate memory',
  'Context argument to function is not valid',
  'Invalid argument to function',
  'Argument to function out of valid range',
  'Unable to open file (path does not exist or permission denied)',
  'File is not an OpenEXR file or has a bad header value',
  'File not opened for read',
  'File not opened for write',
  'File opened for write, but header not yet written',
  'Error reading from stream',
  'Error writing to stream',
  'Text too long for file flags',
  'Missing required attribute in part header',
  'Invalid attribute in part header',
  'No attribute by that name in part header',
  'Attribute type mismatch',
  'Attribute type vs. size mismatch',
  'Attempt to use a scanline accessor function for a tiled image',
  'Attempt to use a tiled accessor function for a scanline image',
  'Attempt to modify a value when in update mode with different size',
  'File in write mode, but header already written, can no longer edit attributes',
  'Unexpected or corrupt values in data block leader vs computed value',
  'Corrupt data block data, unable to decode',
  'Chunk offsets table not completely finished writing (incomplete file)',
  'Previous part not yet finished writing',
  'Invalid data block to write at this point',
  'Use deep scanline write with the sample count table arguments',
  'Use deep tile write with the sample count table arguments',
  'Use non-deep scanline write (sample count table invalid for this part type)',
  'Use non-deep tile write (sample count table invalid for this part type)',
  'Invalid sample data table value',
  'Feature not yet implemented, please use C++ library',
  'Unknown error code',
]

/** base.c:107-114 */
export function exr_get_default_error_message(code: number): string {
  const idx = code < 0 || code >= _defaultErrors.length ? _defaultErrors.length - 1 : code
  return _defaultErrors[idx]!
}

/** base.c:118-124 */
export function exr_get_error_code_as_string(code: number): string {
  const idx = code < 0 || code >= _errorCodeNames.length ? _errorCodeNames.length - 1 : code
  return _errorCodeNames[idx]!
}

/** An exr_result_t other than EXR_ERR_SUCCESS, with the message upstream's
 *  context error handler receives (ctxt->print_error / report_error), or
 *  the code's default message (ctxt->standard_error). The ports return by
 *  throwing it. */
export class ExrError extends Error {
  readonly code: number
  constructor(code: number, message?: string) {
    super(message ?? exr_get_default_error_message(code))
    this.code = code
  }
}

/** openexr_attr.h exr_pixel_type_t */
export const EXR_PIXEL_UINT = 0
export const EXR_PIXEL_HALF = 1
export const EXR_PIXEL_FLOAT = 2
export const EXR_PIXEL_LAST_TYPE = 3

/** openexr_attr.h exr_compression_t */
export const EXR_COMPRESSION_NONE = 0
export const EXR_COMPRESSION_RLE = 1
export const EXR_COMPRESSION_ZIPS = 2
export const EXR_COMPRESSION_ZIP = 3
export const EXR_COMPRESSION_PIZ = 4
export const EXR_COMPRESSION_PXR24 = 5
export const EXR_COMPRESSION_B44 = 6
export const EXR_COMPRESSION_B44A = 7
export const EXR_COMPRESSION_DWAA = 8
export const EXR_COMPRESSION_DWAB = 9
export const EXR_COMPRESSION_HTJ2K256 = 10
export const EXR_COMPRESSION_HTJ2K32 = 11
export const EXR_COMPRESSION_LAST_TYPE = 12

/** openexr_attr.h exr_lineorder_t */
export const EXR_LINEORDER_INCREASING_Y = 0
export const EXR_LINEORDER_DECREASING_Y = 1
export const EXR_LINEORDER_RANDOM_Y = 2
export const EXR_LINEORDER_LAST_TYPE = 3

/** openexr_attr.h exr_storage_t */
export const EXR_STORAGE_SCANLINE = 0
export const EXR_STORAGE_TILED = 1
export const EXR_STORAGE_DEEP_SCANLINE = 2
export const EXR_STORAGE_DEEP_TILED = 3
export const EXR_STORAGE_LAST_TYPE = 4
export const EXR_STORAGE_UNKNOWN = 5

/** openexr_attr.h exr_tile_level_mode_t / exr_tile_round_mode_t */
export const EXR_TILE_ONE_LEVEL = 0
export const EXR_TILE_MIPMAP_LEVELS = 1
export const EXR_TILE_RIPMAP_LEVELS = 2
export const EXR_TILE_LAST_TYPE = 3
export const EXR_TILE_ROUND_DOWN = 0
export const EXR_TILE_ROUND_UP = 1
export const EXR_TILE_ROUND_LAST_TYPE = 2

/** openexr_attr.h exr_attr_chlist_entry_t */
export interface ExrChannel {
  name: string
  pixel_type: number
  p_linear: number
  x_sampling: number
  y_sampling: number
}

/** openexr_chunkio.h exr_chunk_info_t (non-deep fields). For tiles,
 *  start_x / start_y are the tile indices (chunk.c:1196-1197). */
export interface ExrChunkInfo {
  idx: number
  start_x: number
  start_y: number
  height: number
  width: number
  level_x: number
  level_y: number
  type: number
  compression: number
  data_offset: number
  packed_size: number
  unpacked_size: number
}

/** openexr_coding.h exr_coding_channel_info_t. decode_to_ptr is a byte
 *  offset into the pipeline's output (`out`), or null for a channel that is
 *  not read. */
export interface ExrCodingChannelInfo {
  channel_name: string
  height: number
  width: number
  x_samples: number
  y_samples: number
  p_linear: number
  bytes_per_element: number
  data_type: number
  user_bytes_per_element: number
  user_data_type: number
  user_pixel_stride: number
  user_line_stride: number
  decode_to_ptr: number | null
}

/** The part of exr_decode_pipeline_t the decompressors read: the chunk and
 *  its channels. bytes_decompressed is written back as upstream's. */
export interface ExrDecodePipeline {
  channels: ExrCodingChannelInfo[]
  chunk: ExrChunkInfo
  bytes_decompressed: number
}

/** internal_decompress.h's internal_exr_undo_*: decompresses `packed` into
 *  all of `unpacked` (unpacked.length is the chunk's unpacked size) or
 *  throws an ExrError. Asynchronous because zlib is the browser's
 *  DecompressionStream. */
export type ExrUndoFunction = (decode: ExrDecodePipeline, packed: Uint8Array,
  unpacked: Uint8Array) => Promise<void>

/** internal_util.h:12-47 */
export function compute_sampled_height(height: number, y_sampling: number, start_y: number): number {
  let nlines: number
  if (y_sampling <= 1) return height
  if (height === 1) {
    nlines = (start_y % y_sampling) === 0 ? 1 : 0
  } else {
    let off: number
    // computed the number of times y % ysampling == 0, by computing
    // interval based on first and last time that occurs on the given range
    if (start_y < 0) {
      off = (-start_y) % y_sampling
    } else {
      off = start_y % y_sampling
      if (off !== 0) off = (y_sampling - off)
    }
    let tmph = height - off
    if (tmph === 0) return 0
    --tmph
    nlines = Math.trunc(tmph / y_sampling) + 1
  }
  return nlines
}

/** internal_util.h:49-62 */
export function compute_sampled_width(width: number, x_sampling: number, _start_x: number): number {
  if (x_sampling <= 1) return width
  return (width === 1) ? 1 : Math.trunc(width / x_sampling)
}

const _f32 = new Float32Array(1)
const _u32 = new Uint32Array(_f32.buffer)

/** internal_coding.h:112-160 (half_to_float, the bits of the float). */
export function half_to_float_int(hv: number): number {
  const hexpmant = ((hv << 17) >>> 4) >>> 0
  let v = ((hv >>> 15) << 31) >>> 0
  if (hexpmant >= 0x00800000) {
    v = (v | hexpmant) >>> 0
    if (hexpmant < 0x0f800000) v = (v + 0x38000000) >>> 0
    else v = (v | 0x7f800000) >>> 0
  } else if (hexpmant !== 0) {
    let lc = Math.clz32(hexpmant)
    lc -= 8
    v = (v | 0x38800000) >>> 0
    v = (v | (hexpmant << lc)) >>> 0
    v = (v - (lc << 23)) >>> 0
  }
  return v
}

/** internal_coding.h:112-160 */
export function half_to_float(hv: number): number {
  _u32[0] = half_to_float_int(hv)
  return _f32[0]!
}

/** internal_coding.h:176-224 (float_to_half of the float with bits `bits`). */
export function float_to_half_int(bits: number): number {
  let ui = (bits & ~0x80000000) >>> 0
  let ret = (bits >>> 16) & 0x8000
  if (ui >= 0x38800000) {
    if (ui >= 0x7f800000) {
      ret |= 0x7c00
      if (ui === 0x7f800000) return ret
      const m = (ui & 0x7fffff) >>> 13
      return (ret | m | (m === 0 ? 1 : 0)) & 0xffff
    }
    if (ui > 0x477fefff) return ret | 0x7c00
    ui -= 0x38000000
    ui = (ui + 0x00000fff + ((ui >>> 13) & 1)) >>> 13
    return (ret | ui) & 0xffff
  }
  // zero or flush to 0
  if (ui < 0x33000001) return ret
  // produce a denormalized half
  const e = ui >>> 23
  const shift = 0x7e - e
  const m = (0x800000 | (ui & 0x7fffff)) >>> 0
  const r = (m << (32 - shift)) >>> 0
  ret |= (m >>> shift)
  if (r > 0x80000000 || (r === 0x80000000 && (ret & 0x1) !== 0)) ++ret
  return ret & 0xffff
}

/** internal_coding.h:176-224 */
export function float_to_half(fv: number): number {
  _f32[0] = fv
  return float_to_half_int(_u32[0]!)
}
