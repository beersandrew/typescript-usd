// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/channel_list.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/chunk.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/coding.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/compression.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/decoding.c,
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore/parse_header.c,
//  and 3 more cited below
// OpenEXR: Copyright Contributors to the OpenEXR Project. BSD 3-Clause
//  License.
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from the OpenEXRCore 3.2 vendored in OpenUSD 26.11.1
// (pxr/imaging/plugin/hioOpenEXR/OpenEXR/OpenEXRCore), the read side the
// Hio OpenEXR plugin's nanoexr (openexrNanoexr.ts) calls:
//   parse_header.c:2296-2611, 2633-2901  header parse, tile levels, chunk counts
//     (pull_attr / check_req_attr / check_populate_*, :354-2100)
//   validation.c:19-724                   internal_exr_validate_read_part
//   channel_list.c:72-200                 exr_attr_chlist_add_with_length
//   chunk.c:27-1515                       chunk tables, scanline / tile chunk info
//   compression.c:234-560                 lines per chunk, exr_uncompress_chunk
//   coding.c:11-110                       channel info fill / update
//   decoding.c:21-608                     exr_decoding_* pipeline
//   unpack.c:1232-1292                    generic_unpack
// Divergences:
// - The file is the asset's bytes in memory (upstream reads through
//   exr_AssetRead_Func, OpenEXRImage.cpp:166-182); file_size is its length.
// - Deep parts are not decoded: nanoexr hands its interleaved buffers to
//   deep parts' pointer-table unpackers (unpack.c:1304-1688) as if they
//   were image rows; exr_decoding_choose_default_routines here fails with
//   EXR_ERR_FEATURE_NOT_IMPLEMENTED and a message naming the part type.
// - unpack_and_convert is generic_unpack (unpack.c:1232-1292) for every
//   channel layout: the specialized routines internal_exr_match_decode
//   picks (unpack.c:215-1012) are faster forms of the same copies. Only the
//   same-type copies are ported, as nanoexr never asks for a type change
//   (user_data_type stays the file's, coding.c:56-58).
// - Header attributes other than the required ones keep their raw bytes
//   (ExrAttribute.data); the Hio plugin converts the types it reads
//   (openexrHioImage.ts).
// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the OpenEXR Project. See NOTICE for license.

import {
  compute_sampled_height,
  compute_sampled_width,
  EXR_COMPRESSION_B44,
  EXR_COMPRESSION_B44A,
  EXR_COMPRESSION_DWAA,
  EXR_COMPRESSION_DWAB,
  EXR_COMPRESSION_HTJ2K256,
  EXR_COMPRESSION_HTJ2K32,
  EXR_COMPRESSION_LAST_TYPE,
  EXR_COMPRESSION_NONE,
  EXR_COMPRESSION_PIZ,
  EXR_COMPRESSION_PXR24,
  EXR_COMPRESSION_RLE,
  EXR_COMPRESSION_ZIP,
  EXR_COMPRESSION_ZIPS,
  EXR_ERR_ARGUMENT_OUT_OF_RANGE,
  EXR_ERR_ATTR_SIZE_MISMATCH,
  EXR_ERR_ATTR_TYPE_MISMATCH,
  EXR_ERR_BAD_CHUNK_LEADER,
  EXR_ERR_FEATURE_NOT_IMPLEMENTED,
  EXR_ERR_FILE_BAD_HEADER,
  EXR_ERR_INCOMPLETE_CHUNK_TABLE,
  EXR_ERR_INVALID_ARGUMENT,
  EXR_ERR_INVALID_ATTR,
  EXR_ERR_MISSING_REQ_ATTR,
  EXR_ERR_NAME_TOO_LONG,
  EXR_ERR_READ_IO,
  EXR_ERR_SCAN_TILE_MIXEDAPI,
  EXR_ERR_SUCCESS,
  EXR_ERR_TILE_SCAN_MIXEDAPI,
  EXR_ERR_UNKNOWN,
  EXR_LINEORDER_DECREASING_Y,
  EXR_LINEORDER_INCREASING_Y,
  EXR_LINEORDER_LAST_TYPE,
  EXR_PIXEL_FLOAT,
  EXR_PIXEL_HALF,
  EXR_PIXEL_LAST_TYPE,
  EXR_PIXEL_UINT,
  EXR_STORAGE_DEEP_SCANLINE,
  EXR_STORAGE_DEEP_TILED,
  EXR_STORAGE_LAST_TYPE,
  EXR_STORAGE_SCANLINE,
  EXR_STORAGE_TILED,
  EXR_STORAGE_UNKNOWN,
  EXR_TILE_LAST_TYPE,
  EXR_TILE_MIPMAP_LEVELS,
  EXR_TILE_ONE_LEVEL,
  EXR_TILE_RIPMAP_LEVELS,
  EXR_TILE_ROUND_DOWN,
  EXR_TILE_ROUND_LAST_TYPE,
  EXR_TILE_ROUND_UP,
  ExrError,
  type ExrChannel,
  type ExrChunkInfo,
  type ExrCodingChannelInfo,
  type ExrDecodePipeline,
  type ExrUndoFunction,
} from './openexrCoreCoding.ts'
import { internal_exr_undo_rle } from './openexrCoreRle.ts'
import { internal_exr_undo_zip } from './openexrCoreZip.ts'
import { internal_exr_undo_piz } from './openexrCorePiz.ts'
import { internal_exr_undo_pxr24 } from './openexrCorePxr24.ts'
import { internal_exr_undo_b44, internal_exr_undo_b44a } from './openexrCoreB44.ts'
import { internal_exr_undo_dwaa, internal_exr_undo_dwab } from './openexrCoreDwa.ts'

/** A header attribute: its type name and value bytes (little-endian, as
 *  stored; a default added by validation is synthesized). */
export interface ExrAttribute {
  name: string
  type: string
  data: Uint8Array
}

export interface ExrBox2i { min: { x: number, y: number }, max: { x: number, y: number } }

export interface ExrTileDesc { x_size: number, y_size: number, level_mode: number, round_mode: number }

/** internal_structs.h _priv_exr_part_t (the fields the read side uses). */
export interface ExrPart {
  part_index: number
  /** In file order; the attribute list (internal_attr.h). */
  attributes: Map<string, ExrAttribute>
  channels: ExrChannel[] | null
  compression: boolean
  comp_type: number
  dataWindow: boolean
  data_window: ExrBox2i
  displayWindow: boolean
  display_window: ExrBox2i
  lineOrder: boolean
  lineorder: number
  pixelAspectRatio: number | null
  screenWindowCenter: boolean
  screenWindowWidth: number | null
  tiles: ExrTileDesc | null
  name: string | null
  type: string | null
  version: number | null
  chunkCount: boolean
  storage_mode: number
  chunk_count: number
  lines_per_chunk: number
  unpacked_size_per_chunk: number
  chan_has_line_sampling: boolean
  num_tile_levels_x: number
  num_tile_levels_y: number
  tile_level_tile_count_x: number[] | null
  tile_level_tile_count_y: number[] | null
  tile_level_tile_size_x: number[] | null
  tile_level_tile_size_y: number[] | null
  chunk_table_offset: number
  chunk_table: number[] | null | 'invalid'
}

/** internal_structs.h _priv_exr_context_t (read mode). */
export interface ExrContext {
  bytes: Uint8Array
  view: DataView
  file_size: number
  is_singlepart_tiled: boolean
  has_nonimage_data: boolean
  is_multipart: boolean
  parts: ExrPart[]
}

// internal_constants.h: EXR_LONGNAME_MAXLEN (non-strict headers,
// parse_header.c:2758-2763).
const EXR_LONGNAME_MAXLEN = 255
// openexr_version.h / openexr_base.h version flags.
const EXR_FILE_VERSION_MASK = 0x000000ff
const EXR_TILED_FLAG = 0x00000200
const EXR_LONG_NAMES_FLAG = 0x00000400
const EXR_NON_IMAGE_FLAG = 0x00000800
const EXR_MULTI_PART_FLAG = 0x00001000
const EXR_VALID_FLAGS = EXR_TILED_FLAG | EXR_LONG_NAMES_FLAG | EXR_NON_IMAGE_FLAG | EXR_MULTI_PART_FLAG

function _box(minx: number, miny: number, maxx: number, maxy: number): ExrBox2i {
  return { min: { x: minx, y: miny }, max: { x: maxx, y: maxy } }
}

function _newPart(index: number): ExrPart {
  return {
    part_index: index, attributes: new Map(), channels: null,
    compression: false, comp_type: EXR_COMPRESSION_NONE,
    dataWindow: false, data_window: _box(0, 0, -1, -1),
    displayWindow: false, display_window: _box(0, 0, -1, -1),
    lineOrder: false, lineorder: EXR_LINEORDER_INCREASING_Y,
    pixelAspectRatio: null, screenWindowCenter: false, screenWindowWidth: null,
    tiles: null, name: null, type: null, version: null, chunkCount: false,
    storage_mode: EXR_STORAGE_LAST_TYPE, chunk_count: -1, lines_per_chunk: 0,
    unpacked_size_per_chunk: 0, chan_has_line_sampling: false,
    num_tile_levels_x: 0, num_tile_levels_y: 0,
    tile_level_tile_count_x: null, tile_level_tile_count_y: null,
    tile_level_tile_size_x: null, tile_level_tile_size_y: null,
    chunk_table_offset: 0, chunk_table: null,
  }
}

/** The sequential header reader (parse_header.c:59-183's scratch reader,
 *  reading the bytes in memory). */
class _Scratch {
  pos: number
  constructor(readonly ctxt: ExrContext, pos: number) { this.pos = pos }
  byte(): number {
    if (this.pos >= this.ctxt.file_size) throw new ExrError(EXR_ERR_READ_IO, 'Unable to read header bytes')
    return this.ctxt.bytes[this.pos++]!
  }
  i32(): number {
    if (this.pos + 4 > this.ctxt.file_size) throw new ExrError(EXR_ERR_READ_IO, 'Unable to read header bytes')
    const v = this.ctxt.view.getInt32(this.pos, true)
    this.pos += 4
    return v
  }
  take(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.ctxt.file_size) throw new ExrError(EXR_ERR_READ_IO, 'Unable to read header bytes')
    const out = this.ctxt.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }
  skip(n: number): void {
    this.pos = Math.min(this.ctxt.file_size, this.pos + Math.max(0, n))
  }
}

const _decoder = new TextDecoder()

/** parse_header.c read_text: a nul-terminated string of at most `maxlen`
 *  characters, the first of which (if any) was already read. */
function _readText(scr: _Scratch, initial: string, what: string): string {
  const bytes: number[] = []
  for (;;) {
    const b = scr.byte()
    if (b === 0) break
    bytes.push(b)
    if (bytes.length + initial.length > EXR_LONGNAME_MAXLEN) {
      throw new ExrError(EXR_ERR_NAME_TOO_LONG, `Invalid ${what} encountered: start '${initial}'`)
    }
  }
  return initial + _decoder.decode(new Uint8Array(bytes))
}

/** parse_header.c:354-423 extract_attr_chlist with channel_list.c:72-200's
 *  checks and sorted insertion. */
function _extractChlist(data: Uint8Array, aname: string): ExrChannel[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const list: ExrChannel[] = []
  let pos = 0
  let attrsz = data.length
  if (attrsz < 1) throw new ExrError(EXR_ERR_ATTR_SIZE_MISMATCH, `Invalid size ${attrsz} for attribute '${aname}'`)
  while (attrsz > 0) {
    const start = pos
    while (pos < data.length && data[pos] !== 0) pos++
    if (pos >= data.length) throw new ExrError(EXR_ERR_ATTR_SIZE_MISMATCH, `Out of data parsing '${aname}'`)
    const chlen = pos - start
    if (chlen > EXR_LONGNAME_MAXLEN) throw new ExrError(EXR_ERR_NAME_TOO_LONG, `Invalid channel name in '${aname}'`)
    const chname = _decoder.decode(data.subarray(start, pos))
    pos++
    attrsz -= chlen + 1
    if (chlen === 0) break
    if (attrsz < 16) {
      throw new ExrError(EXR_ERR_ATTR_SIZE_MISMATCH, `Out of data parsing '${aname}', last channel '${chname}'`)
    }
    let ptype = view.getInt32(pos, true)
    const plinear = data[pos + 4]!
    const xsamp = view.getInt32(pos + 8, true)
    const ysamp = view.getInt32(pos + 12, true)
    pos += 16
    attrsz -= 16
    if (ptype < 0 || ptype > EXR_PIXEL_LAST_TYPE) ptype = EXR_PIXEL_LAST_TYPE
    // channel_list.c:105-140
    if (ptype !== EXR_PIXEL_UINT && ptype !== EXR_PIXEL_HALF && ptype !== EXR_PIXEL_FLOAT) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid pixel type specified (${ptype}) adding channel '${chname}' to list`)
    }
    if (plinear !== 0 && plinear !== 1) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid perceptual linear flag value (${plinear}) adding channel '${chname}' to list`)
    }
    if (xsamp <= 0 || ysamp <= 0) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid pixel sampling (x ${xsamp} y ${ysamp}) adding channel '${chname}' to list`)
    }
    // channel_list.c:141-160: strcmp order, no duplicates.
    let insertpos = 0
    for (let c = 0; c < list.length; ++c) {
      const ord = _strcmp(chname, list[c]!.name)
      if (ord < 0) { insertpos = c; break }
      if (ord === 0) throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Attempt to add duplicate channel '${chname}' to channel list`)
      insertpos = c + 1
    }
    list.splice(insertpos, 0, { name: chname, pixel_type: ptype, p_linear: plinear, x_sampling: xsamp, y_sampling: ysamp })
  }
  return list
}

function _strcmp(a: string, b: string): number {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  const n = Math.min(ea.length, eb.length)
  for (let i = 0; i < n; i++) if (ea[i] !== eb[i]) return ea[i]! - eb[i]!
  return ea.length - eb.length
}

function _readBox(data: Uint8Array): ExrBox2i {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return _box(v.getInt32(0, true), v.getInt32(4, true), v.getInt32(8, true), v.getInt32(12, true))
}

function _f32bytes(value: number, count = 1): Uint8Array {
  const out = new Uint8Array(4 * count)
  const v = new DataView(out.buffer)
  for (let i = 0; i < count; i++) v.setFloat32(4 * i, value, true)
  return out
}

/** parse_header.c:1970-2039 check_req_attr and the check_populate_*
 *  functions (:938-1968). Returns false for an attribute that is not
 *  required (EXR_ERR_UNKNOWN upstream). A failure throws; in a non-strict
 *  header the caller drops the attribute (parse_header.c:2822-2826). */
function _checkReqAttr(ctxt: ExrContext, part: ExrPart, name: string, type: string, data: Uint8Array): boolean {
  const mismatch = (): never => {
    throw new ExrError(EXR_ERR_ATTR_TYPE_MISMATCH, `Required attribute '${name}': Invalid type '${type}'`)
  }
  const size = (n: number): void => {
    if (data.length !== n) {
      throw new ExrError(EXR_ERR_ATTR_SIZE_MISMATCH, `Required attribute '${name}': Invalid size ${data.length} (exp ${n})`)
    }
  }
  const u8 = (max: number): number => {
    size(1)
    if (data[0]! >= max) throw new ExrError(EXR_ERR_INVALID_ATTR, `Attribute '${name}' (type '${type}'): Invalid value ${data[0]} (max allowed ${max})`)
    return data[0]!
  }
  const record = (): true => {
    part.attributes.set(name, { name, type, data })
    return true
  }
  // Duplicates of the required attributes overwrite (non-strict,
  // e.g. parse_header.c:1048-1061); 'type' duplicates fail (:1739-1745).
  switch (name) {
    case 'channels': {
      if (type !== 'chlist') mismatch()
      part.channels = _extractChlist(data, name)
      return record()
    }
    case 'compression':
      if (type !== 'compression') mismatch()
      part.comp_type = u8(EXR_COMPRESSION_LAST_TYPE)
      part.compression = true
      return record()
    case 'chunkCount': {
      if (type !== 'int') mismatch()
      size(4)
      const v = new DataView(data.buffer, data.byteOffset, 4).getInt32(0, true)
      if (v < 0) throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid chunkCount ${v}`)
      part.chunk_count = v
      part.chunkCount = true
      return record()
    }
    case 'dataWindow':
      if (type !== 'box2i') mismatch()
      size(16)
      part.data_window = _readBox(data)
      part.dataWindow = true
      return record()
    case 'displayWindow':
      if (type !== 'box2i') mismatch()
      size(16)
      part.display_window = _readBox(data)
      part.displayWindow = true
      return record()
    case 'lineOrder':
      if (type !== 'lineOrder') mismatch()
      part.lineorder = u8(EXR_LINEORDER_LAST_TYPE)
      part.lineOrder = true
      return record()
    case 'name':
      if (type !== 'string') mismatch()
      if (part.name !== null) throw new ExrError(EXR_ERR_INVALID_ATTR, "Duplicate copy of required attribute 'name' encountered")
      part.name = _decoder.decode(data)
      return record()
    case 'pixelAspectRatio':
      if (type !== 'float') mismatch()
      size(4)
      part.pixelAspectRatio = new DataView(data.buffer, data.byteOffset, 4).getFloat32(0, true)
      return record()
    case 'screenWindowCenter':
      if (type !== 'v2f') mismatch()
      size(8)
      part.screenWindowCenter = true
      return record()
    case 'screenWindowWidth':
      if (type !== 'float') mismatch()
      size(4)
      part.screenWindowWidth = new DataView(data.buffer, data.byteOffset, 4).getFloat32(0, true)
      return record()
    case 'tiles': {
      // parse_header.c:1552-1646
      if (type !== 'tiledesc') mismatch()
      size(9)
      const v = new DataView(data.buffer, data.byteOffset, 9)
      const lev = data[8]! & 0xf, rnd = (data[8]! >> 4) & 0xf
      if (lev >= EXR_TILE_LAST_TYPE) throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid level mode (${lev}) in tile description header`)
      if (rnd >= EXR_TILE_ROUND_LAST_TYPE) throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid rounding mode (${rnd}) in tile description header`)
      part.tiles = { x_size: v.getUint32(0, true), y_size: v.getUint32(4, true), level_mode: lev, round_mode: rnd }
      return record()
    }
    case 'type': {
      // parse_header.c:1725-1829
      if (part.type !== null) throw new ExrError(EXR_ERR_INVALID_ATTR, "Duplicate copy of required attribute 'type' encountered")
      if (type !== 'string') mismatch()
      const str = _decoder.decode(data)
      part.type = str
      record()
      const typed = ctxt.has_nonimage_data || ctxt.is_multipart
      if (str === 'scanlineimage') { if (typed) part.storage_mode = EXR_STORAGE_SCANLINE }
      else if (str === 'tiledimage') { if (typed) part.storage_mode = EXR_STORAGE_TILED }
      else if (str === 'deepscanline') { if (typed) part.storage_mode = EXR_STORAGE_DEEP_SCANLINE }
      else if (str === 'deeptile') { if (typed) part.storage_mode = EXR_STORAGE_DEEP_TILED }
      else if (part.storage_mode === EXR_STORAGE_LAST_TYPE) part.storage_mode = EXR_STORAGE_UNKNOWN
      return true
    }
    case 'version': {
      if (type !== 'int') mismatch()
      size(4)
      const v = new DataView(data.buffer, data.byteOffset, 4).getInt32(0, true)
      if (v !== 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid version ${v}: expect 1`)
      part.version = v
      return record()
    }
    default:
      return false
  }
}

/** parse_header.c:2044-2294 pull_attr: one attribute, `first` its name's
 *  first byte. */
function _pullAttr(ctxt: ExrContext, part: ExrPart, first: number, scr: _Scratch): void {
  const name = _readText(scr, String.fromCharCode(first), 'attribute name')
  const type = _readText(scr, '', 'attribute type')
  if (type.length === 0) {
    throw new ExrError(EXR_ERR_FILE_BAD_HEADER, `Invalid empty string encountered parsing attribute type for attribute '${name}'`)
  }
  const attrsz = scr.i32()
  if (attrsz < 0 || scr.pos + attrsz > ctxt.file_size) {
    // check_bad_attrsz / scratch_attr_too_big: the header cannot be read on.
    throw new _FatalHeader(new ExrError(EXR_ERR_ATTR_SIZE_MISMATCH,
      `Attribute '${name}', type '${type}': Invalid size ${attrsz}`))
  }
  const data = scr.take(attrsz)
  if (_checkReqAttr(ctxt, part, name, type, data)) return
  // A non-required attribute (exr_attr_list_add): the first copy is kept.
  if (part.attributes.has(name)) {
    throw new ExrError(EXR_ERR_INVALID_ATTR, `Duplicate attribute '${name}'`)
  }
  part.attributes.set(name, { name, type, data })
}

class _FatalHeader extends Error {
  constructor(readonly error: ExrError) { super(error.message) }
}

/** validation.c:19-293 validate_req_attr with adddefault (non-strict
 *  headers, :700). */
function _validateReqAttr(ctxt: ExrContext, part: ExrPart): void {
  if (!part.compression) {
    part.compression = true
    part.comp_type = EXR_COMPRESSION_ZIP
    part.attributes.set('compression', { name: 'compression', type: 'compression', data: new Uint8Array([EXR_COMPRESSION_ZIP]) })
  }
  if (!part.dataWindow) {
    part.dataWindow = true
    part.data_window = _box(0, 0, 63, 63)
    part.attributes.set('dataWindow', { name: 'dataWindow', type: 'box2i', data: new Uint8Array(new Int32Array([0, 0, 63, 63]).buffer) })
  }
  if (!part.displayWindow) {
    part.displayWindow = true
    part.display_window = _box(0, 0, 63, 63)
    part.attributes.set('displayWindow', { name: 'displayWindow', type: 'box2i', data: new Uint8Array(new Int32Array([0, 0, 63, 63]).buffer) })
  }
  if (!part.lineOrder) {
    part.lineOrder = true
    part.lineorder = EXR_LINEORDER_INCREASING_Y
    part.attributes.set('lineOrder', { name: 'lineOrder', type: 'lineOrder', data: new Uint8Array([EXR_LINEORDER_INCREASING_Y]) })
  }
  if (part.pixelAspectRatio === null) {
    part.pixelAspectRatio = 1
    part.attributes.set('pixelAspectRatio', { name: 'pixelAspectRatio', type: 'float', data: _f32bytes(1) })
  }
  if (!part.screenWindowCenter) {
    part.screenWindowCenter = true
    part.attributes.set('screenWindowCenter', { name: 'screenWindowCenter', type: 'v2f', data: _f32bytes(0, 2) })
  }
  if (part.screenWindowWidth === null) {
    part.screenWindowWidth = 1
    part.attributes.set('screenWindowWidth', { name: 'screenWindowWidth', type: 'float', data: _f32bytes(1) })
  }
  if (ctxt.is_multipart || ctxt.has_nonimage_data) {
    if (ctxt.is_multipart && part.name === null) {
      throw new ExrError(EXR_ERR_MISSING_REQ_ATTR, "'name' attribute for multipart file not found")
    }
    if (part.type === null) {
      throw new ExrError(EXR_ERR_MISSING_REQ_ATTR, "'type' attribute for v2+ file not found")
    }
    if (ctxt.has_nonimage_data && part.version === null) {
      part.version = 1
      part.attributes.set('version', { name: 'version', type: 'int', data: new Uint8Array(new Int32Array([1]).buffer) })
    }
  }
}

/** validation.c:295-386 validate_image_dimensions (no maximum image size:
 *  exr_set_default_maximum_image_size is never called, base.c:128-140). */
function _validateImageDimensions(part: ExrPart): void {
  const kLargeVal = Math.trunc(0x7fffffff / 2)
  const dw = part.data_window, dspw = part.display_window
  const par = part.pixelAspectRatio!, sww = part.screenWindowWidth!
  if (dspw.min.x > dspw.max.x || dspw.min.y > dspw.max.y ||
    dspw.min.x <= -kLargeVal || dspw.min.y <= -kLargeVal ||
    dspw.max.x >= kLargeVal || dspw.max.y >= kLargeVal) {
    throw new ExrError(EXR_ERR_INVALID_ATTR,
      `Invalid display window (${dspw.min.x}, ${dspw.min.y} - ${dspw.max.x}, ${dspw.max.y})`)
  }
  if (dw.min.x > dw.max.x || dw.min.y > dw.max.y || dw.min.x <= -kLargeVal ||
    dw.min.y <= -kLargeVal || dw.max.x >= kLargeVal || dw.max.y >= kLargeVal) {
    throw new ExrError(EXR_ERR_INVALID_ATTR,
      `Invalid data window (${dw.min.x}, ${dw.min.y} - ${dw.max.x}, ${dw.max.y})`)
  }
  // isnormal(par) || par < 1e-6f || par > 1e+6f
  const isNormal = Number.isFinite(par) && Math.abs(par) >= 1.1754943508222875e-38
  if (!isNormal || par < Math.fround(1e-6) || par > Math.fround(1e6)) {
    throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid pixel aspect ratio ${par}`)
  }
  if (sww < 0) throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid screen window width ${sww}`)
}

/** validation.c:388-479 validate_channels */
function _validateChannels(part: ExrPart): void {
  if (!part.channels) throw new ExrError(EXR_ERR_MISSING_REQ_ATTR, "'channels' attribute not found")
  const channels = part.channels
  if (channels.length <= 0) throw new ExrError(EXR_ERR_FILE_BAD_HEADER, 'At least one channel required')
  const dw = part.data_window
  const w = dw.max.x - dw.min.x + 1, h = dw.max.y - dw.min.y + 1
  for (const c of channels) {
    const xsamp = c.x_sampling, ysamp = c.y_sampling
    if (xsamp < 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': x subsampling factor is invalid (${xsamp})`)
    if (ysamp < 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': y subsampling factor is invalid (${ysamp})`)
    if (dw.min.x % xsamp) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': minimum x coordinate (${dw.min.x}) of the data window is not a multiple of the x subsampling factor (${xsamp})`)
    if (dw.min.y % ysamp) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': minimum y coordinate (${dw.min.y}) of the data window is not a multiple of the y subsampling factor (${ysamp})`)
    if (w % xsamp) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': row width (${w}) of the data window is not a multiple of the x subsampling factor (${xsamp})`)
    if (h % ysamp) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': column height (${h}) of the data window is not a multiple of the y subsampling factor (${ysamp})`)
  }
}

/** validation.c:481-563 validate_part_type (non-strict: the type string
 *  follows the file flags). */
function _validatePartType(ctxt: ExrContext, part: ExrPart): void {
  if (part.type !== null) {
    if (ctxt.is_singlepart_tiled) {
      if (ctxt.is_multipart || ctxt.parts.length > 1) {
        throw new ExrError(EXR_ERR_INVALID_ATTR, 'Multipart files cannot have the tiled bit set')
      }
      if (part.storage_mode !== EXR_STORAGE_TILED) part.storage_mode = EXR_STORAGE_TILED
    }
  }
  if (part.storage_mode === EXR_STORAGE_LAST_TYPE) {
    throw new ExrError(EXR_ERR_INVALID_ATTR, 'Unable to determine data storage type for part')
  }
}

/** validation.c:565-655 validate_tile_data (no maximum tile size). */
function _validateTileData(part: ExrPart): void {
  if (part.storage_mode !== EXR_STORAGE_TILED && part.storage_mode !== EXR_STORAGE_DEEP_TILED) return
  const desc = part.tiles
  if (!desc) throw new ExrError(EXR_ERR_MISSING_REQ_ATTR, "'tiles' attribute for tiled file not found")
  const max = Math.trunc(0x7fffffff / 4)
  if (desc.x_size === 0 || desc.y_size === 0 || desc.x_size > max || desc.y_size > max) {
    throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid tile description size (${desc.x_size} x ${desc.y_size})`)
  }
  for (const c of part.channels!) {
    if (c.x_sampling !== 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': x subsampling factor is not 1 (${c.x_sampling}) for a tiled image`)
    if (c.y_sampling !== 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': y subsampling factor is not 1 (${c.y_sampling}) for a tiled image`)
  }
}

/** validation.c:657-695 validate_deep_data */
function _validateDeepData(part: ExrPart): void {
  if (part.storage_mode !== EXR_STORAGE_DEEP_SCANLINE && part.storage_mode !== EXR_STORAGE_DEEP_TILED) return
  if (part.comp_type !== EXR_COMPRESSION_NONE && part.comp_type !== EXR_COMPRESSION_RLE &&
    part.comp_type !== EXR_COMPRESSION_ZIPS) {
    throw new ExrError(EXR_ERR_INVALID_ATTR, 'Invalid compression for deep data')
  }
  for (const c of part.channels!) {
    if (c.x_sampling !== 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': x subsampling factor is not 1 (${c.x_sampling}) for a deep image`)
    if (c.y_sampling !== 1) throw new ExrError(EXR_ERR_INVALID_ATTR, `channel '${c.name}': y subsampling factor is not 1 (${c.y_sampling}) for a deep image`)
  }
}

/** validation.c:697-722 internal_exr_validate_read_part */
function _validateReadPart(ctxt: ExrContext, part: ExrPart): void {
  _validateReqAttr(ctxt, part)
  _validateImageDimensions(part)
  _validateChannels(part)
  _validatePartType(ctxt, part)
  _validateTileData(part)
  _validateDeepData(part)
}

/** parse_header.c:2298-2323 */
function floor_log2(x: number): number {
  let y = 0
  while (x > 1) { y += 1; x = Math.floor(x / 2) }
  return y
}

function ceil_log2(x: number): number {
  let y = 0, r = 0
  while (x > 1) { if (x % 2) r = 1; y += 1; x = Math.floor(x / 2) }
  return y + r
}

/** parse_header.c:2327-2341 */
function calc_level_size(mind: number, maxd: number, level: number, rounding: number): number {
  const dsize = maxd - mind + 1
  const b = 2 ** level
  let retsize = Math.floor(dsize / b)
  if (rounding === EXR_TILE_ROUND_UP && retsize * b < dsize) retsize += 1
  if (retsize < 1) retsize = 1
  return retsize
}

/** parse_header.c:2346-2479 internal_exr_compute_tile_information */
function internal_exr_compute_tile_information(part: ExrPart): void {
  if (part.storage_mode === EXR_STORAGE_SCANLINE || part.storage_mode === EXR_STORAGE_DEEP_SCANLINE ||
    part.storage_mode === EXR_STORAGE_UNKNOWN) return
  if (!part.tiles) throw new ExrError(EXR_ERR_MISSING_REQ_ATTR)
  if (part.tile_level_tile_count_x) return
  const dw = part.data_window, tiledesc = part.tiles
  const w = dw.max.x - dw.min.x + 1, h = dw.max.y - dw.min.y + 1
  if (tiledesc.x_size === 0 || tiledesc.y_size === 0) throw new ExrError(EXR_ERR_INVALID_ATTR)
  let numX: number, numY: number
  switch (tiledesc.level_mode) {
    case EXR_TILE_ONE_LEVEL: numX = numY = 1; break
    case EXR_TILE_MIPMAP_LEVELS:
      numX = tiledesc.round_mode === EXR_TILE_ROUND_DOWN ? floor_log2(w > h ? w : h) + 1 : ceil_log2(w > h ? w : h) + 1
      numY = numX
      break
    case EXR_TILE_RIPMAP_LEVELS:
      if (tiledesc.round_mode === EXR_TILE_ROUND_DOWN) { numX = floor_log2(w) + 1; numY = floor_log2(h) + 1 }
      else { numX = ceil_log2(w) + 1; numY = ceil_log2(h) + 1 }
      break
    default: throw new ExrError(EXR_ERR_INVALID_ATTR)
  }
  part.num_tile_levels_x = numX
  part.num_tile_levels_y = numY
  const levcntX: number[] = [], levszX: number[] = [], levcntY: number[] = [], levszY: number[] = []
  for (let l = 0; l < numX; ++l) {
    const sx = calc_level_size(dw.min.x, dw.max.x, l, tiledesc.round_mode)
    if (sx < 0 || sx > 0x7fffffff) {
      throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid data window x dims (${dw.min.x}, ${dw.max.x}) resulting in invalid tile level size (${sx}) for level ${l}`)
    }
    levcntX[l] = Math.floor((sx + tiledesc.x_size - 1) / tiledesc.x_size)
    levszX[l] = sx
  }
  for (let l = 0; l < numY; ++l) {
    const sy = calc_level_size(dw.min.y, dw.max.y, l, tiledesc.round_mode)
    if (sy < 0 || sy > 0x7fffffff) {
      throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid data window y dims (${dw.min.y}, ${dw.max.y}) resulting in invalid tile level size (${sy}) for level ${l}`)
    }
    levcntY[l] = Math.floor((sy + tiledesc.y_size - 1) / tiledesc.y_size)
    levszY[l] = sy
  }
  part.tile_level_tile_count_x = levcntX
  part.tile_level_tile_count_y = levcntY
  part.tile_level_tile_size_x = levszX
  part.tile_level_tile_size_y = levszY
}

/** compression.c:234-257 */
export function exr_compression_lines_per_chunk(comptype: number): number {
  switch (comptype) {
    case EXR_COMPRESSION_NONE:
    case EXR_COMPRESSION_RLE:
    case EXR_COMPRESSION_ZIPS: return 1
    case EXR_COMPRESSION_ZIP:
    case EXR_COMPRESSION_PXR24: return 16
    case EXR_COMPRESSION_PIZ:
    case EXR_COMPRESSION_B44:
    case EXR_COMPRESSION_B44A:
    case EXR_COMPRESSION_HTJ2K32:
    case EXR_COMPRESSION_DWAA: return 32
    case EXR_COMPRESSION_DWAB: return 256
    case EXR_COMPRESSION_HTJ2K256: return 256
    default: return -1
  }
}

const _bpe = (pixel_type: number): number => pixel_type === EXR_PIXEL_HALF ? 2 : 4

/** parse_header.c:2481-2581 internal_exr_compute_chunk_offset_size */
function internal_exr_compute_chunk_offset_size(part: ExrPart): number {
  const dw = part.data_window
  const channels = part.channels!
  let unpackedsize = 0
  let hasLineSample = false
  if (part.storage_mode === EXR_STORAGE_UNKNOWN) return part.chunk_count > 0 ? part.chunk_count : 0
  const w = dw.max.x - dw.min.x + 1
  let retval: number
  if (part.storage_mode !== EXR_STORAGE_SCANLINE && part.storage_mode !== EXR_STORAGE_DEEP_SCANLINE && part.tiles) {
    const tiledesc = part.tiles
    let tilecount = 0
    switch (tiledesc.level_mode) {
      case EXR_TILE_ONE_LEVEL:
      case EXR_TILE_MIPMAP_LEVELS:
        for (let l = 0; l < part.num_tile_levels_x; ++l) {
          tilecount += part.tile_level_tile_count_x![l]! * part.tile_level_tile_count_y![l]!
        }
        if (tilecount > 0x7fffffff) return -1
        retval = tilecount
        break
      case EXR_TILE_RIPMAP_LEVELS:
        for (let lx = 0; lx < part.num_tile_levels_x; ++lx) {
          for (let ly = 0; ly < part.num_tile_levels_y; ++ly) {
            tilecount += part.tile_level_tile_count_x![lx]! * part.tile_level_tile_count_y![ly]!
            if (tilecount > 0x7fffffff) return -1
          }
        }
        retval = tilecount
        break
      default: return -1
    }
    for (const c of channels) {
      // tiles do not allow x/y sub sampling
      unpackedsize += _bpe(c.pixel_type) * tiledesc.x_size * tiledesc.y_size
    }
    part.unpacked_size_per_chunk = unpackedsize
    part.chan_has_line_sampling = hasLineSample
  } else {
    const linePerChunk = exr_compression_lines_per_chunk(part.comp_type)
    part.lines_per_chunk = linePerChunk
    if (linePerChunk < 0) return -1
    for (const c of channels) {
      unpackedsize += _bpe(c.pixel_type) *
        compute_sampled_width(w, c.x_sampling, dw.min.x) *
        compute_sampled_height(linePerChunk, c.y_sampling, dw.min.y)
      if (c.y_sampling > 1) hasLineSample = true
    }
    part.unpacked_size_per_chunk = unpackedsize
    part.chan_has_line_sampling = hasLineSample
    const h = dw.max.y - dw.min.y + 1
    retval = Math.floor((h + linePerChunk - 1) / linePerChunk)
  }
  return retval
}

/** parse_header.c:2585-2631 update_chunk_offsets */
function update_chunk_offsets(ctxt: ExrContext, fileoff: number): void {
  ctxt.parts[0]!.chunk_table_offset = fileoff
  let prevpart = ctxt.parts[0]!
  for (const curpart of ctxt.parts) {
    internal_exr_compute_tile_information(curpart)
    const ccount = internal_exr_compute_chunk_offset_size(curpart)
    if (ccount < 0) {
      throw new ExrError(EXR_ERR_INVALID_ATTR, `Invalid chunk count (${ccount}) for part '${curpart.name ?? '<first>'}'`)
    }
    // A chunkCount attribute that disagrees is reported and replaced
    // (parse_header.c:2617-2633).
    curpart.chunk_count = ccount
    if (prevpart !== curpart) {
      curpart.chunk_table_offset = prevpart.chunk_table_offset + 8 * prevpart.chunk_count
    }
    prevpart = curpart
  }
}

/** parse_header.c:2635-2700 read_magic_and_flags and :2730-2901
 *  internal_exr_parse_header, through exr_start_read (context.c). */
export function exr_start_read(bytes: Uint8Array): ExrContext {
  const ctxt: ExrContext = {
    bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    file_size: bytes.length, is_singlepart_tiled: false, has_nonimage_data: false,
    is_multipart: false, parts: [_newPart(0)],
  }
  if (bytes.length < 8) throw new ExrError(EXR_ERR_READ_IO, 'Unable to read magic and version flags')
  const magic = ctxt.view.getUint32(0, true), flagsAll = ctxt.view.getUint32(4, true)
  if (magic !== 20000630) {
    throw new ExrError(EXR_ERR_FILE_BAD_HEADER, `File is not an OpenEXR file: magic 0x${magic.toString(16).padStart(8, '0').toUpperCase()} (${magic | 0}) flags 0x${flagsAll.toString(16).padStart(8, '0').toUpperCase()}`)
  }
  const version = flagsAll & EXR_FILE_VERSION_MASK
  if (version !== 2) {
    throw new ExrError(EXR_ERR_FILE_BAD_HEADER, `File is of an unsupported version: ${version}`)
  }
  const flags = (flagsAll & ~EXR_FILE_VERSION_MASK) >>> 0
  if ((flags & ~EXR_VALID_FLAGS) !== 0) {
    throw new ExrError(EXR_ERR_FILE_BAD_HEADER, 'File has an unsupported flags')
  }
  ctxt.is_singlepart_tiled = (flags & EXR_TILED_FLAG) !== 0
  ctxt.has_nonimage_data = (flags & EXR_NON_IMAGE_FLAG) !== 0
  ctxt.is_multipart = (flags & EXR_MULTI_PART_FLAG) !== 0
  if (ctxt.is_singlepart_tiled && (ctxt.has_nonimage_data || ctxt.is_multipart)) {
    throw new ExrError(EXR_ERR_FILE_BAD_HEADER,
      `Invalid combination of version flags: single part flag found, but also marked as deep (${+ctxt.has_nonimage_data}) or multipart (${+ctxt.is_multipart})`)
  }
  let curpart = ctxt.parts[0]!
  if (!ctxt.has_nonimage_data && !ctxt.is_multipart) {
    curpart.storage_mode = ctxt.is_singlepart_tiled ? EXR_STORAGE_TILED : EXR_STORAGE_SCANLINE
  }
  const scr = new _Scratch(ctxt, 8)
  for (;;) {
    let next_byte: number
    try {
      next_byte = scr.byte()
    } catch {
      throw new ExrError(EXR_ERR_FILE_BAD_HEADER, 'Unable to extract header byte')
    }
    if (next_byte === 0) {
      _validateReadPart(ctxt, curpart)
      if (!ctxt.is_multipart) break
      try {
        next_byte = scr.byte()
      } catch {
        throw new ExrError(EXR_ERR_FILE_BAD_HEADER, 'Unable to go to next part definition')
      }
      // got a second terminator, finished with the headers
      if (next_byte === 0) break
      curpart = _newPart(ctxt.parts.length)
      ctxt.parts.push(curpart)
    }
    try {
      _pullAttr(ctxt, curpart, next_byte, scr)
    } catch (error) {
      // Non-strict headers drop a bad attribute and read on
      // (parse_header.c:2822-2826), unless the reader cannot continue.
      if (error instanceof _FatalHeader) throw error.error
      if (!(error instanceof ExrError)) throw error
      if (error.code === EXR_ERR_READ_IO || error.code === EXR_ERR_NAME_TOO_LONG ||
        error.code === EXR_ERR_FILE_BAD_HEADER) throw error
    }
  }
  // internal_exr_validate_shared_attrs (validation.c:725-838) for the parts
  // after the first: only the first part is read by the Hio plugin, and the
  // check fails the whole file; the shared attributes compared are the
  // display window, pixel aspect ratio, screen window centre / width.
  const p0 = ctxt.parts[0]!
  for (let p = 1; p < ctxt.parts.length; ++p) {
    const curp = ctxt.parts[p]!
    const mismatch: string[] = []
    const dw0 = p0.display_window, dw1 = curp.display_window
    if (dw0.min.x !== dw1.min.x || dw0.min.y !== dw1.min.y || dw0.max.x !== dw1.max.x || dw0.max.y !== dw1.max.y) mismatch.push('displayWindow')
    if (p0.pixelAspectRatio !== curp.pixelAspectRatio) mismatch.push('pixelAspectRatio')
    const swc0 = p0.attributes.get('screenWindowCenter')!.data, swc1 = curp.attributes.get('screenWindowCenter')!.data
    if (swc0.some((b, i) => b !== swc1[i])) mismatch.push('screenWindowCenter')
    if (p0.screenWindowWidth !== curp.screenWindowWidth) mismatch.push('screenWindowWidth')
    if (mismatch.length) {
      throw new ExrError(EXR_ERR_INVALID_ATTR,
        `Part ${p} (${curp.name ?? '<missing name>'}) has non-conforming shared attributes: ${mismatch.join(' ')}`)
    }
  }
  update_chunk_offsets(ctxt, scr.pos)
  return ctxt
}

export function exr_get_count(ctxt: ExrContext): number {
  return ctxt.parts.length
}

function _part(ctxt: ExrContext, part_index: number): ExrPart {
  const part = ctxt.parts[part_index]
  if (!part) throw new ExrError(EXR_ERR_ARGUMENT_OUT_OF_RANGE, `Part index (${part_index}) out of range`)
  return part
}

/** part.c exr_get_tile_levels */
export function exr_get_tile_levels(ctxt: ExrContext, part_index: number): { levelsx: number, levelsy: number } {
  const part = _part(ctxt, part_index)
  if (part.storage_mode === EXR_STORAGE_TILED || part.storage_mode === EXR_STORAGE_DEEP_TILED) {
    if (!part.tiles || part.num_tile_levels_x <= 0 || part.num_tile_levels_y <= 0 || !part.tile_level_tile_count_x) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Tile data missing or corrupt')
    }
    return { levelsx: part.num_tile_levels_x, levelsy: part.num_tile_levels_y }
  }
  throw new ExrError(EXR_ERR_TILE_SCAN_MIXEDAPI)
}

/** part.c exr_get_level_sizes */
export function exr_get_level_sizes(ctxt: ExrContext, part_index: number, levelx: number, levely: number): { levw: number, levh: number } {
  const part = _part(ctxt, part_index)
  if (part.storage_mode === EXR_STORAGE_TILED || part.storage_mode === EXR_STORAGE_DEEP_TILED) {
    if (!part.tiles || part.num_tile_levels_x <= 0 || part.num_tile_levels_y <= 0 || !part.tile_level_tile_count_x) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Tile data missing or corrupt')
    }
    if (levelx < 0 || levely < 0 || levelx >= part.num_tile_levels_x || levely >= part.num_tile_levels_y) {
      throw new ExrError(EXR_ERR_ARGUMENT_OUT_OF_RANGE)
    }
    return { levw: part.tile_level_tile_size_x![levelx]!, levh: part.tile_level_tile_size_y![levely]! }
  }
  throw new ExrError(EXR_ERR_TILE_SCAN_MIXEDAPI)
}

/** chunk.c:27-205 validate_and_compute_tile_chunk_off */
function validate_and_compute_tile_chunk_off(part: ExrPart, tilex: number, tiley: number, levelx: number, levely: number): number {
  if (!part.tiles || part.num_tile_levels_x <= 0 || part.num_tile_levels_y <= 0 ||
    !part.tile_level_tile_count_x || !part.tile_level_tile_count_y) {
    throw new ExrError(EXR_ERR_MISSING_REQ_ATTR, 'Tile descriptor data missing or corrupt')
  }
  if (tilex < 0 || tiley < 0 || levelx < 0 || levely < 0) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid tile indices provided (${tilex}, ${tiley}, level ${levelx}, ${levely})`)
  }
  let chunkoff = 0
  let numx: number, numy: number
  switch (part.tiles.level_mode) {
    case EXR_TILE_ONE_LEVEL:
    case EXR_TILE_MIPMAP_LEVELS:
      if (levelx !== levely) {
        throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Request for tile (${tilex}, ${tiley}) level (${levelx}, ${levely}), but single level and mipmap tiles must have same level x and y`)
      }
      if (levelx >= part.num_tile_levels_x) {
        throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Request for tile (${tilex}, ${tiley}) level ${levelx}, but level past available levels (${part.num_tile_levels_x})`)
      }
      numx = part.tile_level_tile_count_x[levelx]!
      numy = part.tile_level_tile_count_y[levelx]!
      if (tilex >= numx || tiley >= numy) {
        throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Request for tile (${tilex}, ${tiley}) level ${levelx}, but level only has ${numx} x ${numy} tiles`)
      }
      for (let l = 0; l < levelx; ++l) chunkoff += part.tile_level_tile_count_x[l]! * part.tile_level_tile_count_y[l]!
      chunkoff += tiley * numx + tilex
      break
    case EXR_TILE_RIPMAP_LEVELS:
      if (levelx >= part.num_tile_levels_x || levely >= part.num_tile_levels_y) {
        throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Request for tile (${tilex}, ${tiley}) level ${levelx}, ${levely}, but level past available levels`)
      }
      numx = part.tile_level_tile_count_x[levelx]!
      numy = part.tile_level_tile_count_y[levely]!
      if (tilex >= numx || tiley >= numy) {
        throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Request for tile (${tilex}, ${tiley}) at rip level ${levelx}, ${levely} level only has ${numx} x ${numy} tiles`)
      }
      for (let ly = 0; ly < levely; ++ly) {
        for (let lx = 0; lx < part.num_tile_levels_x; ++lx) {
          chunkoff += part.tile_level_tile_count_x[lx]! * part.tile_level_tile_count_y[ly]!
        }
      }
      for (let lx = 0; lx < levelx; ++lx) chunkoff += part.tile_level_tile_count_x[lx]! * numy
      chunkoff += tiley * numx + tilex
      break
    default:
      throw new ExrError(EXR_ERR_UNKNOWN, 'Invalid tile description')
  }
  if (chunkoff >= part.chunk_count) {
    throw new ExrError(EXR_ERR_UNKNOWN, `Invalid tile chunk offset ${chunkoff} (${part.chunk_count} avail)`)
  }
  return chunkoff
}

interface _ChunkLeader { partnum: number, scanline_y: number, tile_x: number, tile_y: number, level_x: number, level_y: number, packed_size: number }

/** chunk.c:212-342 extract_chunk_leader (non-deep parts; deep parts never
 *  reach the chunk table here, see the header). */
function extract_chunk_leader(ctxt: ExrContext, part: ExrPart, partnum: number, offset: number): { leader: _ChunkLeader, next: number } {
  const maxval = ctxt.file_size > 0 ? ctxt.file_size : 0x7fffffff
  const scan = part.storage_mode === EXR_STORAGE_SCANLINE || part.storage_mode === EXR_STORAGE_DEEP_SCANLINE
  const ntoread = scan ? (ctxt.is_multipart ? 2 : 1) + 1 : (ctxt.is_multipart ? 6 : 5)
  if (offset + 4 * ntoread > ctxt.file_size) throw new ExrError(EXR_ERR_READ_IO, 'Unable to read chunk leader')
  const data = Array.from({ length: ntoread }, (_, i) => ctxt.view.getInt32(offset + 4 * i, true))
  let rdcnt = 0
  const leader: _ChunkLeader = { partnum: 0, scanline_y: 0, tile_x: 0, tile_y: 0, level_x: 0, level_y: 0, packed_size: 0 }
  if (ctxt.is_multipart) {
    if (data[rdcnt] !== partnum) {
      throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Invalid part number reconstructing chunk table: expect ${partnum}, found ${data[rdcnt]}`)
    }
    leader.partnum = partnum
    ++rdcnt
  }
  if (scan) {
    leader.scanline_y = data[rdcnt]!
  } else {
    leader.tile_x = data[rdcnt++]!
    leader.tile_y = data[rdcnt++]!
    leader.level_x = data[rdcnt++]!
    leader.level_y = data[rdcnt]!
  }
  ++rdcnt
  if (data[rdcnt]! < 0 || data[rdcnt]! > maxval) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Invalid chunk size reconstructing chunk table: found out of range ${data[rdcnt]}`)
  }
  leader.packed_size = data[rdcnt]!
  return { leader, next: offset + 4 * ntoread + leader.packed_size }
}

/** chunk.c:360-416 read_and_validate_chunk_leader */
function read_and_validate_chunk_leader(ctxt: ExrContext, part: ExrPart, partnum: number, offset: number, index: number): { index: number, next: number } {
  const { leader, next } = extract_chunk_leader(ctxt, part, partnum, offset)
  if (part.storage_mode === EXR_STORAGE_SCANLINE || part.storage_mode === EXR_STORAGE_DEEP_SCANLINE) {
    const chunk = Math.trunc((leader.scanline_y - part.data_window.min.y) / part.lines_per_chunk)
    // scanlines can be more strict about the ordering
    if (index !== chunk || chunk < 0 || chunk >= part.chunk_count) {
      throw Object.assign(new ExrError(EXR_ERR_BAD_CHUNK_LEADER,
        `Invalid chunk index: ${chunk} reading scanline ${leader.scanline_y} (datawindow min ${part.data_window.min.y}) with lines per chunk ${part.lines_per_chunk}`),
      { index: chunk, next })
    }
    return { index: chunk, next }
  }
  // because of random order, just go with it if the coordinates look sane
  try {
    return { index: validate_and_compute_tile_chunk_off(part, leader.tile_x, leader.tile_y, leader.level_x, leader.level_y), next }
  } catch (error) {
    throw Object.assign(error as ExrError, { index: 0, next })
  }
}

/** chunk.c:418-510 reconstruct_chunk_table */
function reconstruct_chunk_table(ctxt: ExrContext, part: ExrPart, chunktable: number[]): void {
  let firstfail: ExrError | null = null
  const lastpart = ctxt.parts[ctxt.parts.length - 1]!
  let offset_start = lastpart.chunk_table_offset + 8 * lastpart.chunk_count
  const partnum = ctxt.parts.indexOf(part)
  const max_offset = ctxt.file_size > 0 ? ctxt.file_size : Number.MAX_SAFE_INTEGER
  // for multi-part, need to start at the first part and extract everything,
  // then work our way back up to this one, then grab the end of the
  // previous part
  if (partnum > 0) {
    const curpart = ctxt.parts[partnum - 1]!
    const curctable = extract_chunk_table(ctxt, curpart).ctable
    let chunk_start = offset_start
    for (const c of curctable) if (c > chunk_start && c < max_offset) chunk_start = c
    offset_start = extract_chunk_leader(ctxt, curpart, partnum - 1, chunk_start).next
  }
  const curctable = new Array<number>(part.chunk_count).fill(0)
  for (let ci = 0; ci < part.chunk_count; ++ci) {
    if (chunktable[ci]! >= offset_start && chunktable[ci]! < max_offset) offset_start = chunktable[ci]!
    let chunk_start = offset_start
    let computed_ci = ci
    if (part.lineorder === EXR_LINEORDER_DECREASING_Y) computed_ci = part.chunk_count - (ci + 1)
    let found_ci = computed_ci
    try {
      const r = read_and_validate_chunk_leader(ctxt, part, partnum, chunk_start, found_ci)
      found_ci = r.index
      offset_start = r.next
    } catch (error) {
      if (!(error instanceof ExrError)) throw error
      const partial = error as ExrError & { index?: number, next?: number }
      if (partial.index !== undefined) found_ci = partial.index
      if (partial.next !== undefined) offset_start = partial.next
      chunk_start = 0
      firstfail ??= error
    }
    if (found_ci >= 0 && found_ci < part.chunk_count && curctable[found_ci] === 0) curctable[found_ci] = chunk_start
  }
  if (!firstfail) {
    for (let ci = 0; ci < part.chunk_count; ++ci) chunktable[ci] = curctable[ci]!
  } else {
    for (let ci = 0; ci < part.chunk_count; ++ci) if (curctable[ci] !== 0) chunktable[ci] = curctable[ci]!
  }
  if (firstfail) throw firstfail
}

/** chunk.c:526-636 extract_chunk_table (non-strict: a table that cannot be
 *  reconstructed is kept as read, :589-606). */
function extract_chunk_table(ctxt: ExrContext, part: ExrPart): { ctable: number[], chunkmin: number } {
  const chunkoff = part.chunk_table_offset
  const chunkbytes = 8 * part.chunk_count
  const chunkmin = chunkoff + chunkbytes
  if (part.chunk_table === 'invalid') throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER)
  if (part.chunk_table === null) {
    if (part.chunk_count <= 0) throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Invalid file with no chunks')
    if (part.chunk_count > 1024 * 1024 || (ctxt.file_size > 0 && chunkbytes + chunkoff > ctxt.file_size)) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `chunk table size (${chunkbytes}) too big for file size (${ctxt.file_size})`)
    }
    const ctable: number[] = []
    let complete = true
    const maxoff = ctxt.file_size > 0 ? ctxt.file_size : Number.MAX_SAFE_INTEGER
    for (let ci = 0; ci < part.chunk_count; ++ci) {
      const v = ctxt.view.getBigUint64(chunkoff + 8 * ci, true)
      const cchunk = v > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(v)
      if (cchunk < chunkmin || cchunk >= maxoff) complete = false
      ctable.push(cchunk)
    }
    if (!complete) {
      try {
        reconstruct_chunk_table(ctxt, part, ctable)
      } catch (error) {
        if (!(error instanceof ExrError)) throw error
      }
    }
    part.chunk_table = ctable
  }
  return { ctable: part.chunk_table, chunkmin }
}

/** chunk.c:676-702 compute_chunk_unpack_size */
function compute_chunk_unpack_size(x: number, y: number, width: number, height: number, lpc: number, part: ExrPart): number {
  if (part.chan_has_line_sampling || height !== lpc) {
    let unpacksize = 0
    for (const c of part.channels!) {
      unpacksize += _bpe(c.pixel_type) * compute_sampled_width(width, c.x_sampling, x) *
        compute_sampled_height(height, c.y_sampling, y)
    }
    return unpacksize
  }
  return part.unpacked_size_per_chunk
}

/** chunk.c:853-1137 exr_read_scanline_chunk_info (non-deep parts). */
export function exr_read_scanline_chunk_info(ctxt: ExrContext, part_index: number, y: number): ExrChunkInfo {
  const part = _part(ctxt, part_index)
  if (part.storage_mode !== EXR_STORAGE_SCANLINE && part.storage_mode !== EXR_STORAGE_DEEP_SCANLINE) {
    throw new ExrError(EXR_ERR_SCAN_TILE_MIXEDAPI)
  }
  _notDeep(part)
  const dw = part.data_window
  if (y < dw.min.y || y > dw.max.y) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid request for scanline ${y} outside range of data window (${dw.min.y} - ${dw.max.y})`)
  }
  const lpc = part.lines_per_chunk
  let cidx = y - dw.min.y
  if (lpc > 1) cidx = Math.trunc(cidx / lpc)
  // do we need to invert this when reading decreasing y? it appears not
  const miny = dw.min.y + cidx * lpc
  if (cidx < 0 || cidx >= part.chunk_count) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid request for scanline ${y} in chunk ${cidx} outside chunk count ${part.chunk_count}`)
  }
  const cinfo: ExrChunkInfo = {
    idx: cidx, type: part.storage_mode, compression: part.comp_type,
    start_x: dw.min.x, start_y: miny, width: dw.max.x - dw.min.x + 1, height: lpc,
    level_x: 0, level_y: 0, data_offset: 0, packed_size: 0, unpacked_size: 0,
  }
  if (miny < dw.min.y) {
    cinfo.start_y = dw.min.y
    cinfo.height -= dw.min.y - miny
  } else if (miny + lpc > dw.max.y) {
    cinfo.height = dw.max.y - miny + 1
  }
  // need to read from the file to get the packed chunk size
  const { ctable, chunkmin } = extract_chunk_table(ctxt, part)
  const fsize = ctxt.file_size
  let dataoff = ctable[cidx]!
  // known behavior for partial files
  if (dataoff === 0) throw new ExrError(EXR_ERR_INCOMPLETE_CHUNK_TABLE)
  if (dataoff < chunkmin || (fsize > 0 && dataoff > fsize)) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Corrupt chunk offset table: scanline ${y}, chunk index ${cidx} recorded at file offset ${dataoff}`)
  }
  // multi part files have the part for validation
  const rdcnt = (ctxt.is_multipart ? 2 : 1) + 1
  if (dataoff + 4 * rdcnt > fsize) throw new ExrError(EXR_ERR_READ_IO)
  const data = Array.from({ length: rdcnt }, (_, i) => ctxt.view.getInt32(dataoff + 4 * i, true))
  dataoff += 4 * rdcnt
  let r = 0
  if (ctxt.is_multipart) {
    if (data[r] !== part_index) {
      throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Preparing read scanline ${y} (chunk ${cidx}), found corrupt leader: part says ${data[r]}, expected ${part_index}`)
    }
    ++r
  }
  if (miny !== data[r]) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Preparing to read scanline ${y} (chunk ${cidx}), found corrupt leader: scanline says ${data[r]}, expected ${miny}`)
  }
  const unpacksize = compute_chunk_unpack_size(dw.min.x, miny, cinfo.width, cinfo.height, lpc, part)
  ++r
  if (data[r]! < 0 || data[r]! > part.unpacked_size_per_chunk) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Preparing to read scanline ${y} (chunk ${cidx}), found corrupt leader: packed data size says ${data[r]}, must be between 0 and ${part.unpacked_size_per_chunk}`)
  }
  cinfo.data_offset = dataoff
  cinfo.packed_size = data[r]!
  cinfo.unpacked_size = unpacksize
  if (fsize > 0 && cinfo.data_offset + cinfo.packed_size > fsize) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Preparing to read scanline ${y} (chunk ${cidx}), found corrupt leader: packed size ${cinfo.packed_size}, file offset ${cinfo.data_offset}, size ${fsize}`)
  }
  _checkPackedSize(part, cinfo)
  return cinfo
}

/** chunk.c:1139-1514 exr_read_tile_chunk_info (non-deep parts). */
export function exr_read_tile_chunk_info(ctxt: ExrContext, part_index: number, tilex: number, tiley: number, levelx: number, levely: number): ExrChunkInfo {
  const part = _part(ctxt, part_index)
  if (part.storage_mode !== EXR_STORAGE_TILED && part.storage_mode !== EXR_STORAGE_DEEP_TILED) {
    throw new ExrError(EXR_ERR_TILE_SCAN_MIXEDAPI)
  }
  _notDeep(part)
  const cidx = validate_and_compute_tile_chunk_off(part, tilex, tiley, levelx, levely)
  const tiledesc = part.tiles!
  let tilew = tiledesc.x_size
  let dend = part.tile_level_tile_size_x![levelx]!
  let tend = tilew * (tilex + 1)
  if (tend > dend) {
    tend -= dend
    if (tend < tilew) tilew = tilew - tend
  }
  let tileh = tiledesc.y_size
  dend = part.tile_level_tile_size_y![levely]!
  tend = tileh * (tiley + 1)
  if (tend > dend) {
    tend -= dend
    if (tend < tileh) tileh = tileh - tend
  }
  if (levelx > 255 || levely > 255) {
    throw new ExrError(EXR_ERR_ATTR_SIZE_MISMATCH, `Unable to represent tile level ${levelx}, ${levely} in chunk structure`)
  }
  const cinfo: ExrChunkInfo = {
    idx: cidx, type: part.storage_mode, compression: part.comp_type,
    start_x: tilex, start_y: tiley, height: tileh, width: tilew,
    level_x: levelx, level_y: levely, data_offset: 0, packed_size: 0, unpacked_size: 0,
  }
  let unpacksize = 0
  for (const c of part.channels!) unpacksize += tilew * tileh * _bpe(c.pixel_type)
  const { ctable, chunkmin } = extract_chunk_table(ctxt, part)
  const ntoread = ctxt.is_multipart ? 6 : 5
  const fsize = ctxt.file_size
  let dataoff = ctable[cidx]!
  if (dataoff === 0) throw new ExrError(EXR_ERR_INCOMPLETE_CHUNK_TABLE)
  if (dataoff < chunkmin || (fsize > 0 && dataoff > fsize)) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Corrupt chunk offset table: tile (${tilex}, ${tiley}), level (${levelx}, ${levely}), chunk index ${cidx} recorded at file offset ${dataoff}`)
  }
  if (dataoff + 4 * ntoread > fsize) throw new ExrError(EXR_ERR_READ_IO)
  const data = Array.from({ length: ntoread }, (_, i) => ctxt.view.getInt32(dataoff + 4 * i, true))
  dataoff += 4 * ntoread
  let t = 0
  if (ctxt.is_multipart) {
    if (data[0] !== part_index) {
      throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Preparing to read tile chunk (${tilex}, ${tiley}), level (${levelx}, ${levely}) (chunk ${cidx}), found corrupt leader: part says ${data[0]}, expected ${part_index}`)
    }
    t = 1
  }
  const tdata = data.slice(t)
  if (tdata[0] !== tilex || tdata[1] !== tiley || tdata[2] !== levelx || tdata[3] !== levely) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Preparing to read tile chunk (${tilex}, ${tiley}), level (${levelx}, ${levely}) (chunk ${cidx}), found corrupt leader: found tile (${tdata[0]}, ${tdata[1]}), level (${tdata[2]}, ${tdata[3]})`)
  }
  if (tdata[4]! < 0 || tdata[4]! > unpacksize || (tdata[4] === 0 && unpacksize !== 0)) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Corrupt tile (${tilex}, ${tiley}), level (${levelx}, ${levely}) (chunk ${cidx}): invalid packed size ${tdata[4]} vs unpacked size ${unpacksize}`)
  } else if (fsize > 0 && dataoff + tdata[4]! > fsize) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Corrupt tile (${tilex}, ${tiley}), level (${levelx}, ${levely}) (chunk ${cidx}): access past end of file: packed size (${tdata[4]}) at offset ${dataoff} vs size of file ${fsize}`)
  }
  cinfo.packed_size = tdata[4]!
  cinfo.unpacked_size = unpacksize
  cinfo.data_offset = dataoff
  _checkPackedSize(part, cinfo)
  return cinfo
}

function _notDeep(part: ExrPart): void {
  if (part.storage_mode === EXR_STORAGE_DEEP_SCANLINE || part.storage_mode === EXR_STORAGE_DEEP_TILED) {
    // See the header: deep parts are not decoded here.
    throw new ExrError(EXR_ERR_FEATURE_NOT_IMPLEMENTED,
      `deep ${part.storage_mode === EXR_STORAGE_DEEP_SCANLINE ? 'scanline' : 'tiled'} parts are not decoded by this port`)
  }
}

function _checkPackedSize(part: ExrPart, cinfo: ExrChunkInfo): void {
  if (cinfo.packed_size === 0 && cinfo.unpacked_size > 0) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Invalid packed size of 0')
  }
  if (part.comp_type === EXR_COMPRESSION_NONE && cinfo.packed_size !== cinfo.unpacked_size) {
    throw new ExrError(EXR_ERR_BAD_CHUNK_LEADER, `Mismatch between unpacked and packed size with uncompressed data: packed is ${cinfo.packed_size}; unpacked is ${cinfo.unpacked_size}`)
  }
}

/** coding.c:11-63 internal_coding_fill_channel_info */
function internal_coding_fill_channel_info(cinfo: ExrChunkInfo, part: ExrPart): ExrCodingChannelInfo[] {
  return part.channels!.map(curc => {
    const bpe = _bpe(curc.pixel_type)
    return {
      channel_name: curc.name,
      height: compute_sampled_height(cinfo.height, curc.y_sampling, cinfo.start_y),
      width: compute_sampled_width(cinfo.width, curc.x_sampling, cinfo.start_x),
      x_samples: curc.x_sampling,
      y_samples: curc.y_sampling,
      p_linear: curc.p_linear,
      bytes_per_element: bpe,
      data_type: curc.pixel_type,
      // initialize these so they don't trip us up during decoding when the
      // user also chooses to skip a channel
      user_bytes_per_element: bpe,
      user_data_type: curc.pixel_type,
      // but leave the rest as zero for the user to fill in
      user_pixel_stride: 0,
      user_line_stride: 0,
      decode_to_ptr: null,
    }
  })
}

/** exr_decode_pipeline_t: the chunk, its channels, the output the
 *  channels' decode_to_ptr offsets address, and the chosen routines. */
export interface ExrDecoder extends ExrDecodePipeline {
  part_index: number
  out: Uint8Array | null
  read_fn: ((ctxt: ExrContext, decode: ExrDecoder) => void) | null
  decompress: boolean
  packed_buffer: Uint8Array | null
  unpacked_buffer: Uint8Array | null
  user_line_begin_skip: number
  user_line_end_ignore: number
}

/** decoding.c:281-342 exr_decoding_initialize */
export function exr_decoding_initialize(ctxt: ExrContext, part_index: number, cinfo: ExrChunkInfo): ExrDecoder {
  const part = _part(ctxt, part_index)
  if (!part.channels || part.channels.length <= 0) throw new ExrError(EXR_ERR_INVALID_ATTR)
  return {
    channels: internal_coding_fill_channel_info(cinfo, part),
    chunk: { ...cinfo },
    bytes_decompressed: 0,
    part_index,
    out: null,
    read_fn: null,
    decompress: false,
    packed_buffer: null,
    unpacked_buffer: null,
    user_line_begin_skip: 0,
    user_line_end_ignore: 0,
  }
}

/** decoding.c:344-480 exr_decoding_choose_default_routines (non-deep). */
export function exr_decoding_choose_default_routines(ctxt: ExrContext, part_index: number, decode: ExrDecoder): void {
  const part = _part(ctxt, part_index)
  if (decode.part_index !== part_index) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Cross-wired request for default routines from different context / part')
  }
  _notDeep(part)
  let chanstofill = 0, chanstounpack = 0, hastypechange = 0
  for (let c = 0; c < decode.channels.length; ++c) {
    const decc = decode.channels[c]!
    if (decc.height === 0 || decc.decode_to_ptr === null) continue
    if (decc.user_bytes_per_element !== 2 && decc.user_bytes_per_element !== 4) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid / unsupported output bytes per element (${decc.user_bytes_per_element}) for channel ${c} (${decc.channel_name})`)
    }
    if (decc.user_data_type !== EXR_PIXEL_HALF && decc.user_data_type !== EXR_PIXEL_FLOAT &&
      decc.user_data_type !== EXR_PIXEL_UINT) {
      throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Invalid / unsupported output data type (${decc.user_data_type}) for channel ${c} (${decc.channel_name})`)
    }
    ++chanstofill
    if (decc.user_pixel_stride !== decc.bytes_per_element) ++chanstounpack
    if (decc.user_data_type !== decc.data_type) ++hastypechange
  }
  // special case, uncompressed and reading planar data straight in to all
  // the channels
  if (part.comp_type === EXR_COMPRESSION_NONE && chanstounpack === 0 && hastypechange === 0 &&
    chanstofill > 0 && chanstofill === decode.channels.length) {
    decode.read_fn = read_uncompressed_direct
    decode.decompress = false
    return
  }
  if (hastypechange > 0) {
    // See the header: nanoexr never changes types.
    throw new ExrError(EXR_ERR_FEATURE_NOT_IMPLEMENTED, 'pixel type conversion during unpack is not ported')
  }
  decode.read_fn = default_read_chunk
  decode.decompress = part.comp_type !== EXR_COMPRESSION_NONE
}

/** decoding.c:484-512 exr_decoding_update */
export function exr_decoding_update(ctxt: ExrContext, part_index: number, cinfo: ExrChunkInfo, decode: ExrDecoder): void {
  const part = _part(ctxt, part_index)
  if (decode.part_index !== part_index) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Invalid request for decoding update from different context / part')
  }
  // coding.c:67-110 internal_coding_update_channel_info
  const chans = part.channels!
  if (decode.channels.length !== chans.length) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Mismatch in channel counts: stored ${decode.channels.length}, incoming ${chans.length}`)
  }
  chans.forEach((curc, c) => {
    const ccic = decode.channels[c]!
    ccic.channel_name = curc.name
    ccic.height = compute_sampled_height(cinfo.height, curc.y_sampling, cinfo.start_y)
    ccic.width = compute_sampled_width(cinfo.width, curc.x_sampling, cinfo.start_x)
    ccic.x_samples = curc.x_sampling
    ccic.y_samples = curc.y_sampling
    ccic.p_linear = curc.p_linear
    ccic.bytes_per_element = _bpe(curc.pixel_type)
    ccic.data_type = curc.pixel_type
  })
  decode.chunk = { ...cinfo }
}

/** decoding.c:88-140 read_uncompressed_direct: the stored little-endian
 *  samples of each line are copied straight to the channel's output. */
function read_uncompressed_direct(ctxt: ExrContext, decode: ExrDecoder): void {
  let dataoffset = decode.chunk.data_offset
  const height = decode.chunk.height, start_y = decode.chunk.start_y
  const out = decode.out!
  for (let y = 0; y < height; ++y) {
    for (const decc of decode.channels) {
      let cdata = decc.decode_to_ptr!
      const toread = decc.width * decc.bytes_per_element
      if (decc.height === 0) continue
      if (decc.y_samples > 1) {
        if (((start_y + y) % decc.y_samples) !== 0) continue
        cdata += Math.trunc(y / decc.y_samples) * decc.user_line_stride
      } else {
        cdata += y * decc.user_line_stride
      }
      // actual read into the output pointer
      if (dataoffset + toread > ctxt.file_size) throw new ExrError(EXR_ERR_READ_IO)
      out.set(ctxt.bytes.subarray(dataoffset, dataoffset + toread), cdata)
      dataoffset += toread
    }
  }
}

/** decoding.c:142-201 default_read_chunk with chunk.c:1516-1587
 *  exr_read_chunk (an uncompressed chunk may be read short, zero-filled). */
function default_read_chunk(ctxt: ExrContext, decode: ExrDecoder): void {
  const part = _part(ctxt, decode.part_index)
  const cinfo = decode.chunk
  if (cinfo.idx < 0 || cinfo.idx >= part.chunk_count) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `invalid chunk index (${cinfo.idx}) vs part chunk count ${part.chunk_count}`)
  }
  if (cinfo.data_offset > ctxt.file_size) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `chunk block info data offset (${cinfo.data_offset}) past end of file (${ctxt.file_size})`)
  }
  const toread = cinfo.packed_size
  const packed = new Uint8Array(toread)
  const available = Math.max(0, Math.min(toread, ctxt.file_size - cinfo.data_offset))
  if (available < toread && part.comp_type !== EXR_COMPRESSION_NONE) throw new ExrError(EXR_ERR_READ_IO)
  packed.set(ctxt.bytes.subarray(cinfo.data_offset, cinfo.data_offset + available))
  decode.packed_buffer = packed
}

/** compression.c:403-480 decompress_data's dispatch. */
const _undo: Record<number, ExrUndoFunction | undefined> = {
  [EXR_COMPRESSION_RLE]: internal_exr_undo_rle,
  [EXR_COMPRESSION_ZIP]: internal_exr_undo_zip,
  [EXR_COMPRESSION_ZIPS]: internal_exr_undo_zip,
  [EXR_COMPRESSION_PIZ]: internal_exr_undo_piz,
  [EXR_COMPRESSION_PXR24]: internal_exr_undo_pxr24,
  [EXR_COMPRESSION_B44]: internal_exr_undo_b44,
  [EXR_COMPRESSION_B44A]: internal_exr_undo_b44a,
  [EXR_COMPRESSION_DWAA]: internal_exr_undo_dwaa,
  [EXR_COMPRESSION_DWAB]: internal_exr_undo_dwab,
}

/** compression.c:403-480 decompress_data */
async function decompress_data(ctype: number, decode: ExrDecoder, packed: Uint8Array, unpacked: Uint8Array): Promise<void> {
  if (packed.length === 0) return
  if (packed.length === unpacked.length) {
    unpacked.set(packed)
    return
  }
  if (ctype === EXR_COMPRESSION_NONE) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'no compression set but still trying to decompress')
  }
  if (ctype === EXR_COMPRESSION_HTJ2K256 || ctype === EXR_COMPRESSION_HTJ2K32) {
    // internal_ht.c:17-31: stubbed out in the vendored OpenEXRCore.
    throw new ExrError(EXR_ERR_FEATURE_NOT_IMPLEMENTED)
  }
  const undo = _undo[ctype]
  if (!undo) throw new ExrError(EXR_ERR_INVALID_ARGUMENT, `Compression technique 0x${ctype.toString(16).padStart(2, '0').toUpperCase()} invalid`)
  await undo(decode, packed, unpacked)
}

/** compression.c:482-560 exr_uncompress_chunk (non-deep). */
async function exr_uncompress_chunk(ctxt: ExrContext, decode: ExrDecoder): Promise<void> {
  decode.bytes_decompressed = 0
  const part = _part(ctxt, decode.part_index)
  if (decode.chunk.packed_size > 0 && decode.chunk.unpacked_size > 0) {
    try {
      await decompress_data(part.comp_type, decode, decode.packed_buffer!, decode.unpacked_buffer!)
    } catch (error) {
      if (!(error instanceof ExrError)) throw error
      throw new ExrError(error.code, `Unable to decompress w ${part.comp_type} image data ${decode.chunk.packed_size} -> ${decode.chunk.unpacked_size}, got ${decode.bytes_decompressed}: ${error.message}`)
    }
  }
}

/** unpack.c:1232-1292 generic_unpack (same-type copies; see the header). */
function generic_unpack(decode: ExrDecoder): void {
  const srcbuffer = decode.unpacked_buffer!
  const out = decode.out!
  let src = 0
  const uls = decode.user_line_begin_skip
  const h = decode.chunk.height - decode.user_line_end_ignore
  // user data starts at user line begin skip but because of y_samples > 1
  // case, need to embed the run the loop and skip, incrementing srcbuffer
  // only when there'd be a line...
  for (let y = 0; y < h; ++y) {
    const cury = y + decode.chunk.start_y
    for (const decc of decode.channels) {
      let cdata = decc.decode_to_ptr
      const w = decc.width, bpc = decc.bytes_per_element, ubpc = decc.user_pixel_stride
      if (decc.y_samples > 1) {
        if ((cury % decc.y_samples) !== 0) continue
        if (y < uls || cdata === null) {
          src += w * bpc
          continue
        }
        const fb_y = uls + decode.chunk.start_y
        cdata += (Math.trunc(cury / decc.y_samples) - Math.trunc(fb_y / decc.y_samples)) * decc.user_line_stride
      } else {
        if (y < uls || cdata === null) {
          src += w * bpc
          continue
        }
        cdata += (y - uls) * decc.user_line_stride
      }
      // UNPACK_SAMPLES: the file's little-endian samples to native (also
      // little-endian here), one per user pixel stride.
      if (src + w * bpc > srcbuffer.length) throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'unpacked buffer too small')
      for (let x = 0; x < w; ++x) {
        const s = src + x * bpc, d = cdata + x * ubpc
        for (let b = 0; b < bpc; ++b) out[d + b] = srcbuffer[s + b]!
      }
      src += w * bpc
    }
  }
}

/** decoding.c:514-608 exr_decoding_run (non-deep). */
export async function exr_decoding_run(ctxt: ExrContext, part_index: number, decode: ExrDecoder): Promise<void> {
  if (decode.part_index !== part_index) {
    throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Invalid request for decoding update from different context / part')
  }
  if (!decode.read_fn) throw new ExrError(EXR_ERR_INVALID_ARGUMENT, 'Decode pipeline has no read_fn declared')
  decode.read_fn(ctxt, decode)
  if (decode.read_fn === read_uncompressed_direct) return
  // update_pack_unpack_ptrs (decoding.c:21-86)
  decode.unpacked_buffer = decode.chunk.packed_size === decode.chunk.unpacked_size
    ? decode.packed_buffer
    : new Uint8Array(decode.chunk.unpacked_size)
  if (decode.decompress) await exr_uncompress_chunk(ctxt, decode)
  if (decode.chunk.unpacked_size > 0) generic_unpack(decode)
}

export { EXR_ERR_SUCCESS }
