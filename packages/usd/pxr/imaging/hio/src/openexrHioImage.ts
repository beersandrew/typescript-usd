// Ported from OpenUSD 26.11.1: pxr/imaging/plugin/hioOpenEXR/OpenEXRImage.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/plugin/hioOpenEXR/OpenEXRImage.cpp (OpenUSD
// 26.11.1): Hio_OpenEXRImage, the HioImage for exr (hioOpenEXR/plugInfo.json),
// reading through nanoexr (openexrNanoexr.ts) and the vendored OpenEXRCore
// (openexrCore*.ts).
//
// Divergences:
// - Opening asynchronously decodes the pixels of the opened mip at open, on
//   the image decode workers (hioImage.ts header; stbImageDecodePool.ts):
//   nanoexr_read_exr is asynchronous here (zlib). ReadCropped
//   (OpenEXRImage.cpp:262-468) then runs on those pixels: upstream decodes
//   in ReadCropped with numChannelsToRead = the storage format's component
//   count; the decode here reads the image format's (GetFormat()), what
//   Storm's texture loads pass, and a ReadCropped whose storage has another
//   component count fails with a warning. A decode failure is reported by
//   ReadCropped with upstream's warning.
// - The synchronous open (OpenForReading) reads the header only, as
//   upstream's _OpenForReading does; ReadCropped of such an image fails
//   with a warning (no pixels).
// - Writing (Write, _OpenForWriting, _AttributeWriteCallback,
//   OpenEXRImage.cpp:851-1030) is not ported (hioImage.ts header).
// - Attribute types the upstream metadata table stores but that are not
//   converted here (box2i/box2f, m33f/m33d, rational, string vector, v2/v3
//   vectors) are recorded as such and GetMetadata throws for them rather
//   than reporting them absent.
// - A FLOAT_VECTOR attribute falls through to the INT case upstream
//   (OpenEXRImage.cpp:692-700) and is stored as an int read from the
//   attribute's pointer union, a process-dependent value. GetMetadata throws
//   an error carrying nativeTypeName 'int' for it rather than fabricating
//   that number.

import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import { _ArOpenAssetSync, _ArWasReadAhead } from 'typescript-usd/ar/_internal'
import { Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f } from 'typescript-usd/gf'
import { RaiseWarning, Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  HioImage,
  HioImageSourceColorSpace,
  Hio_RegisterImageType,
  type HioImageStorageSpec,
} from './hioImage.ts'
import {
  EXR_PIXEL_FLOAT,
  EXR_PIXEL_HALF,
  EXR_PIXEL_UINT,
  exr_get_default_error_message,
  exr_get_error_code_as_string,
  float_to_half,
  half_to_float,
} from './openexrCoreCoding.ts'
import type { ExrPart } from './openexrCore.ts'
import {
  nanoexr_Gaussian_resample,
  nanoexr_get_default_aux_message,
  nanoexr_read_header,
  nanoexr_set_defaults,
  nanoexr_WrapModeClampToBorderColor,
  nanoexr_WrapModeClampToEdge,
  nanoexr_WrapModeMirrorClampToEdge,
  nanoexr_WrapModeMirrorRepeat,
  nanoexr_WrapModeRepeat,
  type nanoexr_Reader_t,
} from './openexrNanoexr.ts'
import { Hio_OpenEXRDecodeOnWorkers, type Hio_OpenEXRDecoded } from './stbImageDecodePool.ts'
import {
  HioAddressMode,
  HioFormat,
  HioGetComponentCount,
  HioGetDataSizeOfTypeFromFormat,
  HioGetHioType,
  HioType,
  type HioAddressDimension,
} from './types.ts'

/** A metadata entry: the value upstream's _metadata holds, or an attribute
 *  type not converted here (see the header). */
type _Metadatum = VtValue | { readonly unconverted: string }

const _GfMatrix4fType = TfType.declare('GfMatrix4f')

// OpenEXRImage.cpp:553-566. Note that the alternative names and casing are
// for historical compatibility. The OpenEXR standard attribute names are
// worldToNDC and worldToCamera.
function isWorldToNDC(name: string): boolean {
  return name === 'NP' || name === 'worldtoscreen' ||
    name === 'worldToScreen' || name === 'worldToNDC'
}

function isWorldToCamera(name: string): boolean {
  return name === 'Nl' || name === 'worldtocamera' || name === 'worldToCamera'
}

/** OpenEXRImage.cpp:46-108 */
export class Hio_OpenEXRImage extends HioImage {
  private _filename = ''
  private _exrReader: nanoexr_Reader_t = nanoexr_set_defaults('')
  private _sourceColorSpace: HioImageSourceColorSpace = HioImageSourceColorSpace.Raw
  private _subimage = 0
  private _mip = 0
  private _metadata = new Map<string, _Metadatum>()
  /** The pixels of the opened mip (see the header); null until decoded. */
  private _decoded: Hio_OpenEXRDecoded | null = null

  /** OpenEXRImage.cpp:60-104 */
  Read(storage: HioImageStorageSpec): boolean {
    return this.ReadCropped(0, 0, 0, 0, storage)
  }

  // OpenEXR images are always linear (OpenEXRImage.cpp:72-76).
  isColorSpaceSRGB(): boolean { return false }
  getWidth(): number { return this._exrReader.width }
  getHeight(): number { return this._exrReader.height }
  getFilename(): string { return this._filename }

  /** OpenEXRImage.cpp:117-155 */
  GetFormat(): HioFormat {
    const F = HioFormat
    const n = this._exrReader.channelCount
    switch (this._exrReader.pixelType) {
      case EXR_PIXEL_UINT:
        return [F.HioFormatInt32, F.HioFormatInt32Vec2, F.HioFormatInt32Vec3, F.HioFormatInt32Vec4][n - 1] ?? F.HioFormatInvalid
      case EXR_PIXEL_HALF:
        return [F.HioFormatFloat16, F.HioFormatFloat16Vec2, F.HioFormatFloat16Vec3, F.HioFormatFloat16Vec4][n - 1] ?? F.HioFormatInvalid
      case EXR_PIXEL_FLOAT:
        return [F.HioFormatFloat32, F.HioFormatFloat32Vec2, F.HioFormatFloat32Vec3, F.HioFormatFloat32Vec4][n - 1] ?? F.HioFormatInvalid
      default:
        return F.HioFormatInvalid
    }
  }

  /** OpenEXRImage.cpp:157-161 */
  getBytesPerPixel(): number {
    return this._exrReader.channelCount * HioGetDataSizeOfTypeFromFormat(this.GetFormat())
  }

  /** OpenEXRImage.cpp:163-166 */
  getNumMipLevels(): number {
    return this._exrReader.numMipLevels
  }

  /** OpenEXRImage.cpp:262-468 (see the header for the decode). */
  ReadCropped(cropTop: number, cropBottom: number, cropLeft: number,
    cropRight: number, storage: HioImageStorageSpec): boolean {
    const filename = this._exrReader.filename
    // not opened for read prior to calling ReadCropped.
    if (!this._filename) {
      return false
    }
    if (cropTop < 0 || cropBottom < 0 || cropLeft < 0 || cropRight < 0) {
      return false
    }

    // test zero and negative limits
    if (this._exrReader.width <= 0 || this._exrReader.height <= 0 ||
      this._exrReader.channelCount <= 0) {
      RaiseWarning(`All EXR dimensions must be greater than zero (${this._exrReader.width}, ` +
        `${this._exrReader.height} / ${this._exrReader.channelCount}): ${filename}`)
      return false
    }

    const fileWidth = this._exrReader.width
    const fileHeight = this._exrReader.height
    const fileChannelCount = this._exrReader.channelCount
    // OpenEXR files should not exceed this dimension in width or height,
    // 32 bit EXR readers and writers are common.
    const maxPixelExtent = 2 ** 32
    if (fileWidth >= maxPixelExtent || fileHeight >= maxPixelExtent) {
      RaiseWarning(`EXR dimensions are greater than 32 bit limits (${fileWidth}, ${fileHeight}): ${filename}`)
      return false
    }

    const filePixelType = this._exrReader.pixelType
    let inputIsHalf = filePixelType === EXR_PIXEL_HALF
    let inputIsFloat = filePixelType === EXR_PIXEL_FLOAT
    const inputIsUInt = filePixelType === EXR_PIXEL_UINT

    const outWidth = storage.width
    const outHeight = storage.height
    const outChannelCount = HioGetComponentCount(storage.format)

    const outputIsFloat = HioGetHioType(storage.format) === HioType.HioTypeFloat
    const outputIsHalf = HioGetHioType(storage.format) === HioType.HioTypeHalfFloat
    const outputIsUInt = HioGetHioType(storage.format) === HioType.HioTypeUnsignedInt

    // no conversion to anything except these formats
    if (!(outputIsHalf || outputIsFloat || outputIsUInt)) {
      RaiseWarning(`EXR images can only be converted to half, float or uint: ${filename}`)
      return false
    }
    // no conversion to uint from non uint
    if (outputIsUInt && !inputIsUInt) {
      RaiseWarning(`EXR cannot convert to uint from a float format: ${filename}`)
      return false
    }
    // no coversion of non float to float
    if (outputIsFloat && !(inputIsFloat || inputIsHalf)) {
      RaiseWarning(`EXR cannot to float from uint: ${filename}`)
      return false
    }

    const outputBytesPerPixel = HioGetDataSizeOfTypeFromFormat(storage.format) * outChannelCount
    const out = storage.data
    if (!out) {
      RaiseWarning(`EXR could not read (${filename}) because the storage has no data`)
      return false
    }

    if (fileWidth <= cropLeft + cropRight || fileHeight <= cropTop + cropBottom) {
      // if the image is completely cropped, just clear the output buffer.
      out.fill(0, 0, outWidth * outHeight * outputBytesPerPixel)
      return true
    }

    const readWidth = fileWidth - cropLeft - cropRight
    const readHeight = fileHeight - cropTop - cropBottom
    const resizing = (readWidth !== outWidth) || (readHeight !== outHeight)
    if (outputIsUInt && resizing) {
      RaiseWarning(`Cannot resize uint image target to read ${filename}`)
      return false
    }

    const flip = storage.flipped

    // nanoexr_read_exr (decoded at open; see the header)
    const img = this._decoded
    if (!img || img.exrErrorCode !== 0 || !img.data) {
      // The core's own message (img.message) is what openexr-c.c prints to
      // stderr ("nanoexr error: ..."), not a Tf diagnostic; only
      // upstream's warning is raised.
      // A read of nothing (code 0, no data: a pixel type or part nanoexr
      // does not read) copies uninitialized memory upstream; it fails here.
      const reason = img ? exr_get_default_error_message(img.exrErrorCode)
        : 'no pixels were decoded (the image was opened synchronously)'
      RaiseWarning(`EXR could not read (${filename}) because ${reason}`)
      return false
    }
    if (img.channelCount !== outChannelCount) {
      RaiseWarning(`EXR could not read (${filename}) because the pixels were decoded with ` +
        `${img.channelCount} channels, not the storage's ${outChannelCount} (see openexrHioImage.ts)`)
      return false
    }
    const bpc = img.pixelType === EXR_PIXEL_HALF ? 2 : 4
    // the decoded pixels, cropped and flipped in a copy (upstream does it in
    // place in its read buffer)
    let pixels: Uint8Array = new Uint8Array(img.data)
    pixels = _CropImage(pixels, fileWidth, fileHeight, img.channelCount * bpc,
      cropTop, cropBottom, cropLeft, cropRight)
    if (flip) {
      _FlipImage(pixels, readWidth, readHeight, img.channelCount * bpc)
    }

    if (outputIsUInt) {
      // no conversion to float; copy the data to the output buffer.
      out.set(pixels.subarray(0, outWidth * outHeight * outputBytesPerPixel))
      return true
    }

    const outCount = outWidth * outHeight * outChannelCount
    if (!resizing) {
      const outSize = outWidth * outHeight * outputBytesPerPixel
      if ((inputIsHalf && outputIsHalf) || (inputIsFloat && outputIsFloat)) {
        out.set(pixels.subarray(0, outSize))
      } else if (outputIsFloat) {
        const src = new Uint16Array(pixels.buffer, 0, outCount)
        const dst = new Float32Array(out.buffer, out.byteOffset, outCount)
        for (let i = 0; i < outCount; ++i) dst[i] = half_to_float(src[i]!)
      } else {
        const src = new Float32Array(pixels.buffer, 0, outCount)
        const dst = new Uint16Array(out.buffer, out.byteOffset, outCount)
        for (let i = 0; i < outCount; ++i) dst[i] = float_to_half(src[i]!)
      }
      return true
    }

    // resize the image, so promote to float if necessary
    let floatInput: Float32Array
    if (inputIsHalf) {
      const src = new Uint16Array(pixels.buffer, 0, readWidth * readHeight * fileChannelCount)
      floatInput = new Float32Array(src.length)
      for (let i = 0; i < src.length; ++i) floatInput[i] = half_to_float(src[i]!)
      inputIsFloat = true
      inputIsHalf = false
    } else {
      floatInput = new Float32Array(pixels.buffer, 0, readWidth * readHeight * fileChannelCount)
    }
    void inputIsFloat
    void inputIsHalf
    const resized = new Float32Array(outWidth * outHeight * outChannelCount)
    nanoexr_Gaussian_resample(floatInput, readWidth, readHeight, fileChannelCount,
      resized, outWidth, outHeight)
    if (outputIsFloat) {
      new Float32Array(out.buffer, out.byteOffset, resized.length).set(resized)
      return true
    }
    const dst = new Uint16Array(out.buffer, out.byteOffset, resized.length)
    for (let i = 0; i < resized.length; ++i) dst[i] = float_to_half(resized[i]!)
    return true
  }

  /** OpenEXRImage.cpp:568-613 */
  getMetadata(key: string): VtValue | null {
    const convertM4dIfNecessary = (v: _Metadatum): VtValue => {
      const value = _Converted(v)
      if (value.canCastToTypeid(VtValueTypes.GfMatrix4d)) {
        return value.castToTypeid(VtValueTypes.GfMatrix4d)
      }
      return value
    }

    const isW2N = isWorldToNDC(key)
    const isW2C = isWorldToCamera(key)
    if (isW2N || isW2C) {
      const candidate = this._metadata.get(key)
      if (candidate) {
        return convertM4dIfNecessary(candidate)
      }
    }

    // try translating common alternatives to a standard attribute
    if (isW2N) {
      const candidate = this._metadata.get('worldToNDC')
      if (candidate) {
        return convertM4dIfNecessary(candidate)
      }
    }
    if (isW2C) {
      const candidate = this._metadata.get('worldToCamera')
      if (candidate) {
        return convertM4dIfNecessary(candidate)
      }
    }

    // any other key is returned as it's found
    const candidate = this._metadata.get(key)
    if (candidate) {
      return _Converted(candidate)
    }

    return null
  }

  /** OpenEXRImage.cpp:615-635 */
  getSamplerMetadata(_dim: HioAddressDimension): HioAddressMode | null {
    switch (this._exrReader.wrapMode) {
      case nanoexr_WrapModeClampToEdge: return HioAddressMode.HioAddressModeClampToEdge
      case nanoexr_WrapModeMirrorClampToEdge: return HioAddressMode.HioAddressModeClampToEdge
      case nanoexr_WrapModeRepeat: return HioAddressMode.HioAddressModeRepeat
      case nanoexr_WrapModeMirrorRepeat: return HioAddressMode.HioAddressModeMirrorRepeat
      case nanoexr_WrapModeClampToBorderColor: return HioAddressMode.HioAddressModeClampToBorderColor
    }
    return HioAddressMode.HioAddressModeClampToEdge
  }

  /** OpenEXRImage.cpp:638-809 _AttributeReadCallback */
  private _attributeReadCallback(part: ExrPart): void {
    if (this._metadata.size) {
      return
    }
    const metadata = new Map<string, _Metadatum>()
    for (const { name, type, data } of part.attributes.values()) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const size = data.length
      // OpenEXRImage.cpp:654-801: the exhaustive switch over attribute types.
      switch (type) {
        case 'chlist':
        case 'chromaticities':
        case 'compression':
        case 'envmap':
        case 'keycode':
        case 'lineOrder':
        case 'preview':
        case 'tiledesc':
        case 'timecode':
        case 'bytes':
        case 'deepImageState':
          // Handled elsewhere or not metadata for Hio's purposes.
          continue
        case 'double':
          if (size === 8) {
            metadata.set(name, VtValue.create(view.getFloat64(0, true), VtValueTypes.double))
            continue
          }
          break
        case 'float':
          if (size === 4) {
            metadata.set(name, VtValue.create(view.getFloat32(0, true), VtValueTypes.float))
            continue
          }
          break
        case 'floatvector':
          // Falls through to the INT case upstream (see the header).
          metadata.set(name, { unconverted: type })
          continue
        case 'int':
          if (size === 4) {
            metadata.set(name, VtValue.create(view.getInt32(0, true), VtValueTypes.int))
            continue
          }
          break
        case 'm44f':
          if (size === 64) {
            const m = Array.from({ length: 16 }, (_, i) => view.getFloat32(i * 4, true))
            metadata.set(name, VtValue.create(new GfMatrix4f(...m), _GfMatrix4fType))
            continue
          }
          break
        case 'm44d':
          if (size === 128) {
            const m = Array.from({ length: 16 }, (_, i) => view.getFloat64(i * 8, true))
            metadata.set(name, VtValue.create(new GfMatrix4d(...m), VtValueTypes.GfMatrix4d))
            continue
          }
          break
        case 'string':
          metadata.set(name, VtValue.create(new TextDecoder().decode(data), VtValueTypes.string))
          continue
        default:
          break
      }
      // Unknown attribute types (EXR_ATTR_UNKNOWN) are skipped upstream;
      // the known ones not converted here are recorded (see the header).
      if (_upstreamStoredTypes.has(type)) {
        metadata.set(name, { unconverted: type })
      }
    }
    // OpenEXRImage.cpp:805-808
    if (metadata.size === 0) {
      metadata.set('placeholder', VtValue.create(true, VtValueTypes.bool))
    }
    this._metadata = metadata
  }

  /** OpenEXRImage.cpp:811-850, after the asset is open. */
  private _openHeader(buffer: Uint8Array, filename: string, subimage: number, mip: number,
    sourceColorSpace: HioImageSourceColorSpace, suppressErrors: boolean): boolean {
    this._filename = filename
    this._subimage = subimage
    this._mip = mip
    this._sourceColorSpace = sourceColorSpace
    this._exrReader = nanoexr_set_defaults(this._filename)
    const rv = nanoexr_read_header(this._exrReader, buffer,
      part => this._attributeReadCallback(part), this._subimage)
    if (rv.exrErrorCode !== 0) {
      if (!suppressErrors) {
        RaiseWarning(`Cannot open image "${filename}" for reading,  operation: ` +
          `${nanoexr_get_default_aux_message(rv.nanoexrAuxCode)}. result: ` +
          `${exr_get_error_code_as_string(rv.exrErrorCode)}`)
      }
      this._filename = ''
      return false
    }
    if (this._exrReader.numMipLevels <= mip) {
      if (!suppressErrors) {
        RaiseWarning(`Image "${filename}" has only ${this._exrReader.numMipLevels} mips, but ${mip} were requested`)
      }
      this._filename = ''
      return false
    }
    this._exrReader.width >>= mip
    this._exrReader.height >>= mip
    return true
  }

  private _assetNotOpened(filename: string, suppressErrors: boolean): void {
    // OpenEXRImage.cpp:816-822
    if (!suppressErrors) {
      RaiseWarning(`Asset resolver cannot find ${filename}`)
    }
  }

  /** OpenEXRImage.cpp:811-850, synchronous (hioImage.ts header): the asset
   *  Ar read ahead, header only. */
  protected _openForReading(filename: string, subimage: number, mip: number,
    sourceColorSpace: HioImageSourceColorSpace, suppressErrors: boolean): boolean {
    const resolvedPath = new ArResolvedPath(filename)
    const asset = _ArOpenAssetSync(resolvedPath)
    if (!asset) {
      if (!_ArWasReadAhead(resolvedPath)) {
        RaiseWarning(`Cannot open image ${filename} synchronously: ` +
          'the asset was not read ahead (ar/src/prefetchedAssets.ts)')
      } else {
        this._assetNotOpened(filename, suppressErrors)
      }
      return false
    }
    return this._openHeader(asset.getBuffer(), filename, subimage, mip, sourceColorSpace, suppressErrors)
  }

  /** OpenEXRImage.cpp:811-850, then the pixels' decode (see the header). */
  protected async _OpenForReadingAsync(filename: string, subimage: number, mip: number,
    sourceColorSpace: HioImageSourceColorSpace, suppressErrors: boolean): Promise<boolean> {
    let buffer: Uint8Array
    try {
      const asset = await ArGetResolver().openAsset(new ArResolvedPath(filename))
      if (!asset) {
        this._assetNotOpened(filename, suppressErrors)
        return false
      }
      buffer = await asset.getBuffer()
    } catch {
      this._assetNotOpened(filename, suppressErrors)
      return false
    }
    if (!this._openHeader(buffer, filename, subimage, mip, sourceColorSpace, suppressErrors)) {
      return false
    }
    // The channels ReadCropped of the image's format reads (upstream's
    // outChannelCount = HioGetComponentCount(storage.format)).
    const channels = this._exrReader.channelCount
    if (channels >= 1 && channels <= 4 && this._exrReader.width > 0 && this._exrReader.height > 0) {
      this._decoded = await Hio_OpenEXRDecodeOnWorkers(buffer, channels, this._subimage, this._mip)
    }
    return true
  }
}

/** OpenEXRImage.cpp:205-218 ImageProcessor::CropImage (into a copy). */
function _CropImage(buffer: Uint8Array, width: number, height: number, pixelBytes: number,
  cropTop: number, cropBottom: number, cropLeft: number, cropRight: number): Uint8Array {
  const newWidth = width - cropLeft - cropRight
  const newHeight = height - cropTop - cropBottom
  if (newWidth <= 0 || newHeight <= 0 || (newWidth === width && newHeight === height)) {
    return buffer
  }
  const out = new Uint8Array(buffer.length)
  for (let y = 0; y < newHeight; ++y) {
    const src = ((y + cropTop) * width + cropLeft) * pixelBytes
    out.set(buffer.subarray(src, src + newWidth * pixelBytes), y * newWidth * pixelBytes)
  }
  return out
}

/** OpenEXRImage.cpp:190-201 ImageProcessor::FlipImage (in place). */
function _FlipImage(buffer: Uint8Array, width: number, height: number, pixelBytes: number): void {
  const row = width * pixelBytes
  const tmp = new Uint8Array(row)
  for (let y = 0; y < Math.floor(height / 2); ++y) {
    const a = y * row, b = (height - y - 1) * row
    tmp.set(buffer.subarray(a, a + row))
    buffer.copyWithin(a, b, b + row)
    buffer.set(tmp, b)
  }
}

/** The attribute types OpenEXRImage.cpp:654-801 stores in _metadata. */
const _upstreamStoredTypes = new Set([
  'box2i', 'box2f', 'double', 'float', 'floatvector', 'int', 'm33f', 'm33d',
  'm44f', 'm44d', 'rational', 'string', 'stringvector', 'v2i', 'v2f', 'v2d',
  'v3i', 'v3f', 'v3d',
])

function _Converted(v: _Metadatum): VtValue {
  if (v instanceof VtValue) {
    return v
  }
  if (v.unconverted === 'floatvector') {
    const error = new Error('OpenEXR floatvector metadata has an undefined native integer result; ' +
      'numeric metadata parity is unavailable')
    Object.assign(error, { nativeTypeName: 'int' })
    throw error
  }
  throw new Error(`Hio metadata type ${v.unconverted} is not supported`)
}

// OpenEXRImage.cpp:110-115 (and hioOpenEXR/plugInfo.json's imageTypes).
Hio_RegisterImageType(['exr'], () => new Hio_OpenEXRImage())
