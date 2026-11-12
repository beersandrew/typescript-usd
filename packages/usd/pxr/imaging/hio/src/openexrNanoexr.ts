// Ported from OpenUSD 26.11.1:
//  pxr/imaging/plugin/hioOpenEXR/OpenEXR/openexr-c.c
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/plugin/hioOpenEXR/OpenEXR/openexr-c.c (OpenUSD
// 26.11.1), nanoexr: the reader the Hio OpenEXR plugin (openexrHioImage.ts)
// reads through, over the OpenEXRCore port (openexrCore.ts).
//   :22-41     nanoexr_get_default_aux_message
//   :103-239   nanoexr_Gaussian_resample
//   :247-357   nanoexr_set_defaults / nanoexr_read_header
//   :633-1255  nanoexr_read_exr with its tiled and scanline readers
// Divergences:
// - The file is the asset's bytes (upstream reads through the asset read
//   callback); the reads are asynchronous (zlib, openexrCoreZip.ts).
// - Errors return as an ExrError (the exr_result_t and the context's
//   message); upstream prints the message to stderr (err_cb,
//   tiled_exr_err_cb) and returns the code.
// - erf is computed here (see _erf): JavaScript has no libm erf.
// Copyright 2023 Pixar
// Licensed under the terms set forth in the LICENSE.txt file available at
// https://openusd.org/license.

import {
  EXR_ERR_FILE_BAD_HEADER,
  EXR_ERR_INCORRECT_CHUNK,
  EXR_ERR_SUCCESS,
  EXR_PIXEL_FLOAT,
  EXR_PIXEL_HALF,
  EXR_PIXEL_LAST_TYPE,
  EXR_PIXEL_UINT,
  EXR_STORAGE_SCANLINE,
  EXR_STORAGE_TILED,
  ExrError,
  float_to_half,
} from './openexrCoreCoding.ts'
import {
  exr_decoding_choose_default_routines,
  exr_decoding_initialize,
  exr_decoding_run,
  exr_decoding_update,
  exr_get_count,
  exr_get_level_sizes,
  exr_get_tile_levels,
  exr_read_scanline_chunk_info,
  exr_read_tile_chunk_info,
  exr_start_read,
  type ExrContext,
  type ExrDecoder,
  type ExrPart,
} from './openexrCore.ts'

/** openexr-c.h nanoexr_WrapMode */
export const nanoexr_WrapModeClampToEdge = 0
export const nanoexr_WrapModeMirrorClampToEdge = 1
export const nanoexr_WrapModeRepeat = 2
export const nanoexr_WrapModeMirrorRepeat = 3
export const nanoexr_WrapModeClampToBorderColor = 4

/** openexr-c.h nanoexr_AuxCode_t */
export const NANOEXR_READ_HEADER = 0
export const NANOEXR_START_READ = 1
export const NANOEXR_GET_DATA_WINDOW = 2
export const NANOEXR_GET_STORAGE = 3
export const NANOEXR_GET_TILE_LEVELS = 4
export const NANOEXR_GET_CHANNELS = 5

// openexr-c.c:22-35
const nanoexrAuxNames = [
  'nanoexr_read_header', 'nanoexr_start_read', 'nanoexr_get_data_window',
  'nanoexr_get_storage', 'nanoexr_get_tile_levels', 'nanoexr_get_channels',
  'nanoexr_start_write', 'nanoexr_add_channel', 'nanoexr_add_part',
  'nanoexr_set_compression', 'nanoexr_add_attr', 'nanoexr_encode',
]

/** openexr-c.c:37-42 */
export function nanoexr_get_default_aux_message(code: number): string {
  if (code < 0 || code >= nanoexrAuxNames.length) return 'Invalid nanoexr_AuxCode_t'
  return nanoexrAuxNames[code]!
}

/** openexr-c.h nanoexr_Reader_t */
export interface nanoexr_Reader_t {
  filename: string
  width: number
  height: number
  channelCount: number
  pixelType: number
  partIndex: number
  numMipLevels: number
  isScanline: boolean
  wrapMode: number
}

/** openexr-c.c:247-263 */
export function nanoexr_set_defaults(filename: string): nanoexr_Reader_t {
  return {
    filename, width: 0, height: 0, channelCount: 0, pixelType: EXR_PIXEL_LAST_TYPE,
    partIndex: 0, numMipLevels: 0, isScanline: false, wrapMode: nanoexr_WrapModeClampToEdge,
  }
}

/** openexr-c.h nanoexr_ErrorCode_t; `error` carries the core's message. */
export interface nanoexr_ErrorCode_t { nanoexrAuxCode: number, exrErrorCode: number, error?: ExrError }

function _code(aux: number, error: unknown): nanoexr_ErrorCode_t {
  if (error instanceof ExrError) return { nanoexrAuxCode: aux, exrErrorCode: error.code, error }
  throw error
}

/** openexr-c.c:272-357 nanoexr_read_header. `attrRead` receives the part
 *  (_AttributeReadCallback reads its attributes). */
export function nanoexr_read_header(reader: nanoexr_Reader_t, bytes: Uint8Array,
  attrRead: ((part: ExrPart) => void) | null, partIndex: number): nanoexr_ErrorCode_t {
  let exr: ExrContext
  try {
    exr = exr_start_read(bytes)
  } catch (error) {
    return _code(NANOEXR_START_READ, error)
  }
  const part = exr.parts[partIndex]
  if (!part) return { nanoexrAuxCode: NANOEXR_GET_DATA_WINDOW, exrErrorCode: 4 /* EXR_ERR_ARGUMENT_OUT_OF_RANGE */ }
  const datawin = part.data_window
  reader.partIndex = partIndex
  reader.width = datawin.max.x - datawin.min.x + 1
  reader.height = datawin.max.y - datawin.min.y + 1
  reader.isScanline = part.storage_mode === EXR_STORAGE_SCANLINE
  let numMipLevelsX = 1, numMipLevelsY = 1
  if (!reader.isScanline) {
    try {
      const levels = exr_get_tile_levels(exr, partIndex)
      numMipLevelsX = levels.levelsx
      numMipLevelsY = levels.levelsy
    } catch (error) {
      return _code(NANOEXR_GET_TILE_LEVELS, error)
    }
  }
  if (numMipLevelsX !== numMipLevelsY) {
    // current only supporting mip levels uniformly in both directions
    numMipLevelsX = 1
    numMipLevelsY = 1
  }
  reader.numMipLevels = numMipLevelsX
  const chlist = part.channels!
  reader.channelCount = chlist.length
  reader.pixelType = chlist[0]!.pixel_type
  const attr = part.attributes.get('wrapmodes')
  if (attr && attr.type === 'string') {
    // strncmp on the attribute's string
    const str = new TextDecoder().decode(attr.data)
    if (str.startsWith('black')) reader.wrapMode = nanoexr_WrapModeClampToBorderColor
    else if (str.startsWith('clamp')) reader.wrapMode = nanoexr_WrapModeClampToEdge
    else if (str.startsWith('periodic')) reader.wrapMode = nanoexr_WrapModeRepeat
    else if (str.startsWith('mirror')) reader.wrapMode = nanoexr_WrapModeMirrorRepeat
  }
  if (attrRead) attrRead(part)
  return { nanoexrAuxCode: NANOEXR_READ_HEADER, exrErrorCode: EXR_ERR_SUCCESS }
}

/** openexr-c.c:633-646 */
export function nanoexr_getPixelTypeSize(t: number): number {
  switch (t) {
    case EXR_PIXEL_HALF: return 2
    case EXR_PIXEL_UINT: return 4
    case EXR_PIXEL_FLOAT: return 4
    default: return 0
  }
}

/** openexr-c.c:648-679 strIsComponent */
function strIsComponent(layerName: string | null, str: string, component: string): boolean {
  // if the layername is specified, it must match the beginning of the
  // string. if layername was specified, move the string pointer past it
  if (layerName) {
    if (!str.startsWith(layerName)) return false
    str = str.slice(layerName.length)
  }
  // search backwards in str for a dot. If found, move the string pointer
  // past it
  const dot = str.lastIndexOf('.')
  if (dot >= 0) str = str.slice(dot + 1)
  // if one character is left, then do a case insensitive comparison with
  // the first character of the component.
  const lower = (s: string): string => s.replace(/[A-Z]/g, c => c.toLowerCase())
  if (str.length === 1) return lower(str) === lower(component[0]!)
  // The final check is to return true if a case insensitive comparison of
  // the string with the component is true.
  return lower(str) === lower(component)
}

/** openexr-c.h nanoexr_ImageData_t */
export interface nanoexr_ImageData_t {
  data: Uint8Array
  channelCount: number
  width: number
  height: number
  dataSize: number
  pixelType: number
  dataWindowMinY: number
  dataWindowMaxY: number
}

/** openexr-c.c:703-748 _nanoexr_rgba_decoding_initialize */
function _nanoexr_rgba_decoding_initialize(exr: ExrContext, img: nanoexr_ImageData_t, layerName: string | null,
  partIndex: number, cinfo: Parameters<typeof exr_decoding_initialize>[2], rgba: number[]): ExrDecoder {
  const decoder = exr_decoding_initialize(exr, partIndex, cinfo)
  const bytesPerChannel = nanoexr_getPixelTypeSize(img.pixelType)
  for (let i = 0; i < img.channelCount; ++i) rgba[i] = -1
  for (let c = 0; c < decoder.channels.length; ++c) {
    let channelIndex = -1
    const name = decoder.channels[c]!.channel_name
    decoder.channels[c]!.decode_to_ptr = null
    if (strIsComponent(layerName, name, 'red') || (rgba[0] === -1 && strIsComponent(layerName, name, 'y'))) {
      rgba[0] = c
      channelIndex = 0
    } else if (strIsComponent(layerName, name, 'green')) {
      rgba[1] = c
      channelIndex = 1
    } else if (strIsComponent(layerName, name, 'blue')) {
      rgba[2] = c
      channelIndex = 2
    } else if (strIsComponent(layerName, name, 'alpha')) {
      rgba[3] = c
      channelIndex = 3
    }
    if (channelIndex === -1 || channelIndex >= img.channelCount) continue
    // calculate start of pixel data for the target channel
    decoder.channels[c]!.decode_to_ptr = channelIndex * bytesPerChannel
  }
  return decoder
}

/** openexr-c.c:750-838 nanoexr_read_tiled_exr */
async function nanoexr_read_tiled_exr(exr: ExrContext, img: nanoexr_ImageData_t, layerName: string | null,
  partIndex: number, mipLevel: number, rgbaIndex: number[]): Promise<void> {
  let decoder: ExrDecoder | null = null
  const bytesPerChannel = nanoexr_getPixelTypeSize(img.pixelType)
  const part = exr.parts[partIndex]!
  const tilew = part.tiles!.x_size, tileh = part.tiles!.y_size
  exr_get_tile_levels(exr, partIndex)
  const { levw: levelWidth, levh: levelHeight } = exr_get_level_sizes(exr, partIndex, mipLevel, mipLevel)
  if (!levelWidth || !levelHeight) return
  const xTiles = Math.trunc((levelWidth + tilew - 1) / tilew)
  const yTiles = Math.trunc((levelHeight + tileh - 1) / tileh)
  const pixelStride = img.channelCount * bytesPerChannel
  const imageYStride = img.width * pixelStride
  for (let tileY = 0; tileY < yTiles; ++tileY) {
    for (let tileX = 0; tileX < xTiles; ++tileX) {
      const cinfo = exr_read_tile_chunk_info(exr, partIndex, tileX, tileY, mipLevel, mipLevel)
      if (decoder === null) {
        decoder = _nanoexr_rgba_decoding_initialize(exr, img, layerName, partIndex, cinfo, rgbaIndex)
        exr_decoding_choose_default_routines(exr, partIndex, decoder)
      } else {
        // Reuse existing pipeline
        exr_decoding_update(exr, partIndex, cinfo, decoder)
      }
      const x = tileX * tilew
      const y = tileY * tileh
      const curtilestart = y * imageYStride + x * pixelStride
      for (let c = 0; c < decoder.channels.length; ++c) {
        const ch = decoder.channels[c]!
        ch.user_pixel_stride = pixelStride
        ch.user_line_stride = imageYStride
        ch.user_bytes_per_element = bytesPerChannel
        ch.decode_to_ptr = null
        for (let i = 0; i < 4; ++i) {
          if (rgbaIndex[i] === c) {
            ch.decode_to_ptr = curtilestart + i * bytesPerChannel
            break
          }
        }
      }
      // Upstream writes through raw pointers; a tile that would write
      // outside img->data (a level wider than width >> mip, possible with
      // round-up levels) is an overflow there and an error here.
      _checkBounds(decoder, img)
      decoder.out = img.data
      await exr_decoding_run(exr, partIndex, decoder)
    }
  }
}

/** openexr-c.c:840-919 nanoexr_read_scanline_exr */
async function nanoexr_read_scanline_exr(exr: ExrContext, img: nanoexr_ImageData_t, layerName: string | null,
  partIndex: number, rgbaIndex: number[]): Promise<void> {
  let decoder: ExrDecoder | null = null
  const scanLinesPerChunk = exr.parts[partIndex]!.lines_per_chunk
  let bytesPerChannel = nanoexr_getPixelTypeSize(img.pixelType)
  let pixelbytes = bytesPerChannel * img.channelCount
  for (let chunky = img.dataWindowMinY; chunky < img.dataWindowMaxY; chunky += scanLinesPerChunk) {
    const cinfo = exr_read_scanline_chunk_info(exr, partIndex, chunky)
    if (decoder === null) {
      decoder = _nanoexr_rgba_decoding_initialize(exr, img, layerName, partIndex, cinfo, rgbaIndex)
      if (decoder.channels.length === 0) throw new ExrError(EXR_ERR_INCORRECT_CHUNK)
      bytesPerChannel = decoder.channels[0]!.bytes_per_element
      pixelbytes = bytesPerChannel * img.channelCount
      for (const ch of decoder.channels) {
        ch.user_pixel_stride = img.channelCount * bytesPerChannel
        ch.user_line_stride = ch.user_pixel_stride * img.width
        ch.user_bytes_per_element = bytesPerChannel
      }
      exr_decoding_choose_default_routines(exr, partIndex, decoder)
    } else {
      // Reuse existing pipeline
      exr_decoding_update(exr, partIndex, cinfo, decoder)
    }
    // Note that width has already been sanity checked as greater than zero
    const start = (chunky - img.dataWindowMinY) * img.width * pixelbytes
    for (let c = 0; c < decoder.channels.length; ++c) {
      const ch = decoder.channels[c]!
      ch.decode_to_ptr = null
      for (let i = 0; i < 4; ++i) {
        if (rgbaIndex[i] === c) {
          ch.decode_to_ptr = start + i * bytesPerChannel
          break
        }
      }
    }
    _checkBounds(decoder, img)
    decoder.out = img.data
    await exr_decoding_run(exr, partIndex, decoder)
  }
}

/** The last byte each channel of the chunk writes must lie in img.data (see
 *  nanoexr_read_tiled_exr). */
function _checkBounds(decoder: ExrDecoder, img: nanoexr_ImageData_t): void {
  for (const ch of decoder.channels) {
    if (ch.decode_to_ptr === null || ch.height === 0 || ch.width === 0) continue
    const lines = ch.y_samples > 1 ? Math.ceil(ch.height) : ch.height
    const last = ch.decode_to_ptr + (lines - 1) * ch.user_line_stride + (ch.width - 1) * ch.user_pixel_stride +
      ch.user_bytes_per_element
    if (ch.decode_to_ptr < 0 || last > img.data.length) {
      throw new ExrError(EXR_ERR_INCORRECT_CHUNK, `chunk of channel '${ch.channel_name}' writes outside the image (${last} > ${img.data.length})`)
    }
  }
}

// openexr-c.c:921-1026: fill and copy one channel of the interleaved image.
function fill_channel(img: nanoexr_ImageData_t, channel: number, bytes: Uint8Array): void {
  const bpe = bytes.length, stride = img.channelCount * bpe
  for (let p = channel * bpe; p < img.dataSize; p += stride) img.data.set(bytes, p)
}

function copy_channel(img: nanoexr_ImageData_t, dst_channel: number, src_channel: number, bpe: number): void {
  const stride = img.channelCount * bpe
  for (let p = 0; p < img.dataSize; p += stride) {
    img.data.copyWithin(p + dst_channel * bpe, p + src_channel * bpe, p + src_channel * bpe + bpe)
  }
}

function _value(pixelType: number, value: number): Uint8Array {
  if (pixelType === EXR_PIXEL_HALF) return new Uint8Array(new Uint16Array([float_to_half(value)]).buffer)
  if (pixelType === EXR_PIXEL_FLOAT) return new Uint8Array(new Float32Array([value]).buffer)
  return new Uint8Array(new Uint32Array([value]).buffer)
}

/** openexr-c.c:1028-1255 nanoexr_read_exr: the image of part `partIndex`
 *  at `mipLevel`, `numChannelsToRead` channels interleaved, the file's
 *  pixel type. Throws an ExrError where upstream returns its code. */
export async function nanoexr_read_exr(bytes: Uint8Array, layerName: string | null, numChannelsToRead: number,
  partIndex: number, mipLevel: number): Promise<nanoexr_ImageData_t | null> {
  if (numChannelsToRead === 0) return null // successfully read nothing
  const exr = exr_start_read(bytes)
  const storage = exr.parts[partIndex]?.storage_mode
  const num_sub_images = exr_get_count(exr)
  if (partIndex >= num_sub_images || storage === undefined) {
    // nanoexr error: part index out of range (returns rv, EXR_ERR_SUCCESS)
    return null
  }
  const part = exr.parts[partIndex]!
  const datawin = part.data_window
  let width = datawin.max.x - datawin.min.x + 1
  let height = datawin.max.y - datawin.min.y + 1
  if (width <= 0 || width > 2 ** 31 || height <= 0 || height > 2 ** 31) {
    throw new ExrError(EXR_ERR_FILE_BAD_HEADER)
  }
  const chlist = part.channels!
  const pixelType = chlist[0]!.pixel_type
  const bytesPerChannel = nanoexr_getPixelTypeSize(pixelType)
  // unsupported pixel type: returns rv (EXR_ERR_SUCCESS) without an image
  if (bytesPerChannel === 0) return null
  width >>= mipLevel
  height >>= mipLevel
  const dataSize = width * height * numChannelsToRead * bytesPerChannel
  const img: nanoexr_ImageData_t = {
    channelCount: numChannelsToRead,
    width,
    height,
    dataSize,
    pixelType,
    dataWindowMinY: datawin.min.y >> mipLevel,
    dataWindowMaxY: (datawin.max.y + 1) >> mipLevel,
    // malloc'd upstream: channels nanoexr never writes are uninitialized
    // there and zero here.
    data: new Uint8Array(dataSize),
  }
  const rgbaIndex = [-1, -1, -1, -1]
  if (storage === EXR_STORAGE_TILED) {
    await nanoexr_read_tiled_exr(exr, img, layerName, partIndex, mipLevel, rgbaIndex)
  } else {
    // note - scanline images do not support mip levels
    await nanoexr_read_scanline_exr(exr, img, layerName, partIndex, rgbaIndex)
  }
  // if the image has more channels than actually read, and any of the
  // channels is missing, fill them in by propagating the channel to the left
  // if possible. If not, fill with zero or one. Alpha is always filled with
  // one.
  let readChannelCount = 0
  for (let i = 0; i < 4; ++i) if (rgbaIndex[i]! >= 0) readChannelCount++
  if (img.channelCount > readChannelCount) {
    const bpe = bytesPerChannel
    if (img.channelCount === 4 && rgbaIndex[3] === -1) {
      // fill the alpha channel with 1.0; uint data is data, not rgba: zero
      fill_channel(img, 3, _value(pixelType, pixelType === EXR_PIXEL_UINT ? 0 : 1))
    }
    if (img.channelCount > 2 && rgbaIndex[2] === -1) {
      // if G exists, propagate it, else if R exists, propagate it, else fill
      // with zero
      const srcChannel = rgbaIndex[1]! >= 0 ? 1 : (rgbaIndex[0]! >= 0 ? 0 : -1)
      if (srcChannel >= 0) copy_channel(img, 2, srcChannel, bpe)
      else fill_channel(img, 2, _value(pixelType, 0))
    }
    if (img.channelCount > 1 && rgbaIndex[1] === -1) {
      // if R exists, propagate it, else fill with zero
      if (rgbaIndex[0]! >= 0) copy_channel(img, 1, 0, bpe)
      else fill_channel(img, 1, _value(pixelType, 0))
    }
    if (rgbaIndex[0] === -1) fill_channel(img, 0, _value(pixelType, 0))
  }
  return img
}

/** erf(x) for the float argument openexr-c.c:103-108 passes (C's double
 *  erf, its result stored to float): the series
 *  2/sqrt(pi) exp(-x^2) sum 2^n x^(2n+1) / (1 3 ... (2n+1)), whose terms
 *  are all positive, to double precision; 1 beyond |x| = 6 (erfc(6) is
 *  below half a double ulp of 1). Divergence: libm's erf is not ported, so a
 *  result could differ from it in the last float bit at a rounding tie. */
function _erf(x: number): number {
  const ax = Math.abs(x)
  if (ax >= 6) return Math.sign(x)
  let term = ax, sum = ax
  const x2 = ax * ax
  for (let n = 1; n < 200 && term > sum * 1e-17; n++) {
    term *= 2 * x2 / (2 * n + 1)
    sum += term
  }
  const r = 2 / Math.sqrt(Math.PI) * Math.exp(-x2) * sum
  return x < 0 ? -r : r
}

const f = Math.fround

/** openexr-c.c:103-108 */
function integrate_gaussian(x: number, sigma: number): number {
  const s = f(Math.sqrt(0.5))
  const p1 = f(_erf(f(f(f(x - 0.5) / sigma) * s)))
  const p2 = f(_erf(f(f(f(x + 0.5) / sigma) * s)))
  return f(f(p2 - p1) * 0.5)
}

function _filter(sigma: number): Float32Array | null {
  const support = f(0.995)
  const radius = Math.ceil(f(Math.sqrt(f(f(f(-2.0 * sigma) * sigma) * f(Math.log(f(1.0 - support)))))))
  const filterSize = Math.trunc(radius)
  if (!filterSize) return null
  const filter = new Float32Array((filterSize + 1) * 2)
  let sum = 0
  for (let i = 0; i <= filterSize; i++) {
    const idx = i + filterSize
    filter[idx] = integrate_gaussian(i, sigma)
    if (i > 0) sum = f(sum + f(2 * filter[idx]!))
    else sum = filter[idx]!
  }
  for (let i = 0; i <= filterSize; ++i) filter[i + filterSize] = f(filter[i + filterSize]! / sum)
  for (let i = 0; i < filterSize; ++i) filter[filterSize - i - 1] = filter[i + filterSize + 1]!
  return filter
}

/** openexr-c.c:110-239 nanoexr_Gaussian_resample: float pixels of `src`
 *  (width x height x channels) resized to dstWidth x dstHeight into `dst`.
 *  Float arithmetic is rounded to float at each step, as C evaluates it
 *  (FLT_EVAL_METHOD 0), with the filter sums fused (_fma) as the native
 *  arm64 build contracts them. */
export function nanoexr_Gaussian_resample(src: Float32Array, srcWidth: number, srcHeight: number,
  channelCount: number, dst: Float32Array, dstWidth: number, dstHeight: number): boolean {
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    dst.set(src.subarray(0, channelCount * srcWidth * srcHeight))
    return true
  }
  // Two pass image resize using a Gaussian filter; chose sigma to suppress
  // high frequencies that can't be represented in the downsampled image
  const ratio_w = f(dstWidth / srcWidth)
  const ratio_h = f(dstHeight / srcHeight)
  const sigma_w = f(0.5 * ratio_w)
  const sigma_h = f(0.5 * ratio_h)
  const filter_w = _filter(sigma_w)
  if (!filter_w) return false
  const filterSize_w = filter_w.length / 2 - 1
  const filter_h = _filter(sigma_h)
  if (!filter_h) return false
  const filterSize_h = filter_h.length / 2 - 1
  const fullFilterSize_w = filterSize_w * 2 + 1
  const fullFilterSize_h = filterSize_h * 2 + 1
  // first pass: resize horizontally
  const srcFloatsPerLine = channelCount * srcWidth
  const dstFloatsPerLine = channelCount * dstWidth
  const firstPass = new Float32Array(dstWidth * channelCount * srcHeight)
  for (let y = 0; y < srcHeight; ++y) {
    for (let x = 0; x < dstWidth; ++x) {
      const base = Math.trunc(f(f(f(x + 0.5) / ratio_w) - 0.5))
      for (let c = 0; c < channelCount; ++c) {
        let sum = 0
        for (let i = 0; i < fullFilterSize_w; ++i) {
          const srcX = base + i - filterSize_w
          if (srcX < 0 || srcX >= srcWidth) continue
          sum = _fma(src[y * srcFloatsPerLine + srcX * channelCount + c]!, filter_w[i]!, sum)
        }
        firstPass[y * dstFloatsPerLine + x * channelCount + c] = sum
      }
    }
  }
  // second pass: resize vertically
  for (let y = 0; y < dstHeight; ++y) {
    const base = Math.trunc(f(f(f(y + 0.5) / ratio_h) - 0.5))
    for (let x = 0; x < dstWidth; ++x) {
      for (let c = 0; c < channelCount; ++c) {
        let sum = 0
        for (let i = 0; i < fullFilterSize_h; ++i) {
          const srcY = base + i - filterSize_h
          if (srcY < 0 || srcY >= srcHeight) continue
          sum = _fma(firstPass[channelCount * srcY * dstWidth + x * channelCount + c]!, filter_h[i]!, sum)
        }
        dst[channelCount * y * dstWidth + x * channelCount + c] = sum
      }
    }
  }
  return true
}

/** fmaf(a, b, c): the native build's `sum += a * b` (clang's default
 *  -ffp-contract=on fuses it on arm64). a * b of two floats is exact in a
 *  double; the double sum is then rounded to float (a second rounding that
 *  could differ from fmaf at a double-rounding tie). */
function _fma(a: number, b: number, c: number): number {
  return f(a * b + c)
}
