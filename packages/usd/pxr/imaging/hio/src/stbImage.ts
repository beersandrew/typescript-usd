// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp,
//  pxr/imaging/hio/stb/stb_image_resize2.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/stbImage.cpp (OpenUSD 26.11.1): Hio_StbImage,
// the HioImage for bmp, jpg, jpeg, png, tga and hdr (hio/plugInfo.json).
//
// Divergences (each also noted at its site):
// - Opening asynchronously decodes the pixels (hioImage.ts header); Read()
//   works from the decoded pixels instead of re-reading the asset. The
//   synchronous open reads the header only (_OpenHeader) and decodes no
//   pixels.
// - The header open tests the content against stb's formats
//   (stbi__info_test_from_memory) instead of stbi_info_from_memory's header
//   parse; the dimensions, component count and gamma come with the pixels.
// - Opening another subimage or mip returns false without reading the
//   asset (upstream reads it and its header, then returns false; see
//   _OpenForReadingAsync).
// - Decoding: stbi_load_from_memory (stbImageDecode.ts), the port of the
//   vendored stb_image's PNG, JPEG, BMP and TGA decoders, chosen from the
//   content as stb does; Radiance .hdr through hdrImage.ts (stb_image's HDR
//   path, three float channels kept).
// - The decoding (stbImagePixels.ts) runs on a pool of workers
//   (stbImageDecodePool.ts), as upstream's texture loads run on worker
//   threads.
// - Resizing uses stbImageResize.ts, the port of the vendored
//   stb_image_resize2.h calls.
// - Writing is not ported (hioImage.ts header).

import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import { _ArOpenAssetSync, _ArWasReadAhead } from 'typescript-usd/ar/_internal'
import { RaiseWarning } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import {
  HioImage,
  HioImageSourceColorSpace,
  Hio_RegisterImageType,
  type HioImageStorageSpec,
} from './hioImage.ts'
import { stbi__info_test_from_memory } from './stbImageDecode.ts'
import { Hio_StbDecodeOnWorkers, type Hio_StbDecoded } from './stbImageDecodePool.ts'
import {
  stbir_resize_float_linear,
  stbir_resize_uint8_linear,
  stbir_resize_uint8_srgb,
} from './stbImageResize.ts'
import {
  HioFormat,
  HioGetDataSizeOfType,
  HioGetFormat,
  HioType,
  type HioAddressDimension,
  type HioAddressMode,
} from './types.ts'

// PLATFORM-DIVERGENCE(hio-image-read-ahead): upstream reads and decodes an
// image when Storm's texture commit opens it, synchronously and on worker
// threads (hdSt/textureObjectRegistry.cpp:236-244), so a frame that brings in
// new textures draws with them. In the browser that read is a fetch and a
// decode the frame cannot wait for, and Storm draws nothing until it lands
// (hdSt/src/renderPass.ts). A client that knows which images a coming frame
// will open (a payload load schedule's next carriers) reads and decodes them
// ahead with _HioReadImageAhead; the open of such an image then takes the
// bytes and pixels read ahead instead of reading them again. What is opened,
// and when, is unchanged; only the read moves earlier. The client releases
// the images with _HioReleaseImageAhead.
interface _ReadAhead { buffer: Uint8Array, decoded: Hio_StbDecoded | null }
const _readAhead = new Map<string, Promise<_ReadAhead | null>>()

/** Reads and decodes the image at a resolved path ahead of its open (see
 *  hio-image-read-ahead above), once per path until released. Resolves when
 *  done; never rejects (a failed read is left to the open, which reports
 *  it as it would have). */
export function _HioReadImageAhead(resolvedPath: string): Promise<void> {
  let reading = _readAhead.get(resolvedPath)
  if (!reading) {
    const extension = resolvedPath.slice(resolvedPath.lastIndexOf('.') + 1).toLowerCase()
    reading = (async (): Promise<_ReadAhead | null> => {
      const asset = await ArGetResolver().openAsset(new ArResolvedPath(resolvedPath))
      if (!asset) return null
      const buffer = await asset.getBuffer()
      if (!stbi__info_test_from_memory(buffer)) return { buffer, decoded: null }
      return { buffer, decoded: await Hio_StbDecodeOnWorkers(buffer, extension) }
    })().catch(() => null)
    _readAhead.set(resolvedPath, reading)
  }
  return reading.then(() => undefined)
}

/** Drops an image read ahead (see hio-image-read-ahead above). */
export function _HioReleaseImageAhead(resolvedPath: string): void {
  _readAhead.delete(resolvedPath)
}

/** The resolved paths read ahead and not released (for tests). */
export function _HioImagesReadAhead(): string[] {
  return [..._readAhead.keys()]
}

/** stbImage.cpp:57-125 */
export class Hio_StbImage extends HioImage {
  private _filename = ''
  private _width = 0
  private _height = 0
  private _gamma = 0
  private _outputType: HioType = HioType.HioTypeUnsignedByte
  private _nchannels = 0
  private _format: HioFormat = HioFormat.HioFormatInvalid
  private _sourceColorSpace: HioImageSourceColorSpace = HioImageSourceColorSpace.Auto
  private _decoded: Hio_StbDecoded | null = null

  /** stbImage.cpp:269-273 */
  getFilename(): string { return this._filename }
  /** stbImage.cpp:275-280 */
  getWidth(): number { return this._width }
  /** stbImage.cpp:282-287 */
  getHeight(): number { return this._height }
  /** stbImage.cpp:289-294 */
  GetFormat(): HioFormat { return this._format }

  /** stbImage.cpp:296-301 */
  getBytesPerPixel(): number {
    return HioGetDataSizeOfType(this._outputType) * this._nchannels
  }

  /** stbImage.cpp:303-331 */
  isColorSpaceSRGB(): boolean {
    if (this._sourceColorSpace === HioImageSourceColorSpace.SRGB) {
      return true
    }
    if (this._sourceColorSpace === HioImageSourceColorSpace.Raw) {
      return false
    }

    const gamma_epsilon = 0.1

    // If we found gamma in the texture, use it to decide if we are sRGB
    const isSRGB = Math.abs(this._gamma - Math.fround(0.45455)) < gamma_epsilon
    if (isSRGB) {
      return true
    }

    const isLinear = Math.abs(this._gamma - 1) < gamma_epsilon
    if (isLinear) {
      return false
    }

    if (this._gamma > 0) {
      RaiseWarning(`Unsupported gamma encoding in: ${this._filename}`)
    }

    // Texture had no (recognized) gamma hint, make a reasonable guess
    return (this._nchannels === 3 || this._nchannels === 4) &&
      this._outputType === HioType.HioTypeUnsignedByte
  }

  /** stbImage.cpp:334-340 */
  getMetadata(_key: string): VtValue | null {
    return null
  }

  /** stbImage.cpp:342-348 */
  getSamplerMetadata(_dim: HioAddressDimension): HioAddressMode | null {
    return null
  }

  /** stbImage.cpp:350-355 */
  getNumMipLevels(): number {
    return 1
  }

  /** stbImage.cpp:141-149 _GetFilenameExtension: ArGetResolver().GetExtension
   *  (which takes the innermost path of a package-relative path), lowercased. */
  private _getFilenameExtension(): string {
    return ArGetResolver().getExtension(this._filename).toLowerCase()
  }

  /** stbImage.cpp:357-390, synchronous (hioImage.ts header): the asset
   *  Ar read ahead, header only; no pixels are decoded, so Read() fails. */
  protected _openForReading(filename: string, subimage: number,
    mip: number, sourceColorSpace: HioImageSourceColorSpace,
    suppressErrors: boolean): boolean {
    this._beginOpen(filename, sourceColorSpace)
    if (subimage !== 0 || mip !== 0) {
      return false
    }
    // stbImage.cpp:373-379, the asset read ahead (_ArOpenAssetSync).
    const resolvedPath = new ArResolvedPath(this._filename)
    const asset = _ArOpenAssetSync(resolvedPath)
    if (!asset) {
      if (!_ArWasReadAhead(resolvedPath)) {
        // Nothing read the asset ahead, so this open cannot tell whether
        // upstream's would succeed: reported, not taken for a missing file.
        RaiseWarning(`Cannot open image ${this._filename} synchronously: ` +
          'the asset was not read ahead (ar/src/prefetchedAssets.ts)')
      } else {
        this._assetNotOpened(suppressErrors)
      }
      return false
    }
    return this._openHeader(asset.getBuffer(), suppressErrors)
  }

  /** stbImage.cpp:357-390 */
  protected async _OpenForReadingAsync(filename: string, subimage: number,
    mip: number, sourceColorSpace: HioImageSourceColorSpace,
    suppressErrors: boolean): Promise<boolean> {
    this._beginOpen(filename, sourceColorSpace)

    // stbImage.cpp:384-387: `open` is stbi_info(...) && subimage == 0 &&
    // mip == 0, so another subimage or mip never opens, whatever the asset
    // holds. Upstream still reads the asset and its header; here that read
    // is a second fetch and the header comes with a full decode (see the
    // header), so neither is done for a result that cannot change
    // (HdStTextureUtils::GetAllMipImages asks for mip 1 of every file,
    // textureUtils.cpp:430-436).
    if (subimage !== 0 || mip !== 0) {
      return false
    }

    // stbImage.cpp:373-379: ArGetResolver().OpenAsset(ArResolvedPath(_filename)),
    // the filename being a resolved path (no resolve step).
    // An image read ahead (hio-image-read-ahead above) opens from the bytes
    // and pixels read then.
    const ahead = await _readAhead.get(this._filename)
    if (ahead) {
      if (!this._openHeader(ahead.buffer, suppressErrors) || !ahead.decoded) return false
      this._setDecoded(ahead.buffer, ahead.decoded)
      return true
    }

    let buffer: Uint8Array
    try {
      const asset = await ArGetResolver().openAsset(new ArResolvedPath(this._filename))
      if (!asset) {
        this._assetNotOpened(suppressErrors)
        return false
      }
      buffer = await asset.getBuffer()
    } catch {
      this._assetNotOpened(suppressErrors)
      return false
    }
    if (!this._openHeader(buffer, suppressErrors)) {
      return false
    }

    // The pixels (see the header), which give the dimensions.
    const fileExtension = this._getFilenameExtension()
    let decoded: Hio_StbDecoded | null
    try {
      decoded = await Hio_StbDecodeOnWorkers(buffer, fileExtension)
    } catch {
      decoded = null
    }
    if (!decoded) {
      return false
    }
    this._setDecoded(buffer, decoded)
    return true
  }

  /** The end of the asynchronous open: the decoded pixels and what they
   *  give. */
  private _setDecoded(buffer: Uint8Array, decoded: Hio_StbDecoded): void {
    this._decoded = decoded
    this._width = decoded.width
    this._height = decoded.height
    this._nchannels = decoded.channels
    this._gamma = _PngGamma(buffer)

    this._format = HioGetFormat(this._nchannels, this._outputType, this.isColorSpaceSRGB())
  }

  /** stbImage.cpp:362-371, the start of both opens. */
  private _beginOpen(filename: string, sourceColorSpace: HioImageSourceColorSpace): void {
    this._filename = filename
    this._sourceColorSpace = sourceColorSpace

    const fileExtension = this._getFilenameExtension()
    if (fileExtension === 'hdr') {
      this._outputType = HioType.HioTypeFloat
    } else {
      this._outputType = HioType.HioTypeUnsignedByte
    }
  }

  /** stbImage.cpp:383-386, the header of both opens: whether stb reads the
   *  content (see the header). */
  private _openHeader(buffer: Uint8Array, _suppressErrors: boolean): boolean {
    return stbi__info_test_from_memory(buffer)
  }

  /** stbImage.cpp:375-381: an asset that cannot be opened fails the open
   *  without a message. */
  private _assetNotOpened(_suppressErrors: boolean): void {}

  /** stbImage.cpp:393-398 */
  Read(storage: HioImageStorageSpec): boolean {
    return this.ReadCropped(0, 0, 0, 0, storage)
  }

  /** stbImage.cpp:400-543 */
  ReadCropped(cropTop: number, cropBottom: number, cropLeft: number,
    cropRight: number, storage: HioImageStorageSpec): boolean {
    // check if the image is already in the desired format
    if (storage.format !== this._format) {
      RaiseWarning('Image format mismatch')
      return false
    }

    // An image opened synchronously has no pixels (see the header).
    if (!this._decoded || !storage.data) {
      RaiseWarning('unable to get_pixels')
      return false
    }

    const bpp = this.getBytesPerPixel()
    const decoded = this._decoded
    // stbi_load_from_memory sets _width, _height and _nchannels to the
    // image's on every read (stbImage.cpp:442-458), undoing an earlier
    // resizing read's update of _width and _height (:533-534); a read here
    // starts from the decoded pixels, so it restores them from those.
    this._width = decoded.width
    this._height = decoded.height
    this._nchannels = decoded.channels
    let imageData = decoded.data
    if (storage.flipped) {
      // stbi__vertical_flip
      imageData = _VerticalFlip(imageData, this._width, this._height, bpp)
    }

    //// Crop Needed
    if (cropTop || cropBottom || cropLeft || cropRight) {
      //check if resizing is still necessary after cropping
      const resizeNeeded =
        (this._width - cropRight - cropLeft !== storage.width) ||
        (this._height - cropTop - cropBottom !== storage.height)

      // copy (and potentially resize)
      // cropped region of imageData into storage.data
      if (!this._cropAndResize(imageData, cropTop, cropBottom, cropLeft,
        cropRight, resizeNeeded, storage)) {
        RaiseWarning('Unable to crop and resize')
        return false
      }
    } else {
      const inputStrideInBytes = this._width * bpp
      const resizeNeeded =
        this._width !== storage.width || this._height !== storage.height

      if (resizeNeeded) {
        if (!this._resize(imageData, this._width, this._height,
          inputStrideInBytes, storage)) {
          return false
        }
        this._width = storage.width
        this._height = storage.height
      } else {
        const imageSize = bpp * this._width * this._height
        //no resizing needed, just copy image data to storage
        storage.data.set(imageData.subarray(0, imageSize))
      }
    }

    return true
  }

  /** The stbir_resize_* dispatch of stbImage.cpp:227-254 and :501-530. */
  private _resize(src: Uint8Array, w: number, h: number, stride: number,
    storage: HioImageStorageSpec): boolean {
    const bpp = this.getBytesPerPixel()
    const dst = storage.data!
    // XXX STB only has a sRGB resize for 8bit
    if (this.isColorSpaceSRGB() && this._outputType === HioType.HioTypeUnsignedByte) {
      return stbir_resize_uint8_srgb(src, w, h, stride,
        dst, storage.width, storage.height, storage.width * bpp,
        this._nchannels) !== null
    }
    if (this._outputType === HioType.HioTypeFloat) {
      const srcF = new Float32Array(src.buffer, src.byteOffset, src.byteLength / 4)
      const dstF = new Float32Array(dst.buffer, dst.byteOffset,
        storage.width * storage.height * this._nchannels)
      return stbir_resize_float_linear(srcF, w, h, stride,
        dstF, storage.width, storage.height, storage.width * bpp,
        this._nchannels) !== null
    }
    if (this._outputType === HioType.HioTypeUnsignedByte) {
      return stbir_resize_uint8_linear(src, w, h, stride,
        dst, storage.width, storage.height, storage.width * bpp,
        this._nchannels) !== null
    }
    RaiseWarning(`Hio_StbImage: cannot resize ${this._filename}`)
    return false
  }

  /** stbImage.cpp:127-136 */
  private _isValidCrop(cropTop: number, cropBottom: number, cropLeft: number,
    cropRight: number): boolean {
    const cropImageWidth = this._width - (cropLeft + cropRight)
    const cropImageHeight = this._height - (cropTop + cropBottom)

    return cropTop >= 0 && cropBottom >= 0 && cropLeft >= 0 &&
      cropRight >= 0 && cropImageWidth > 0 && cropImageHeight > 0
  }

  /** stbImage.cpp:173-262 */
  private _cropAndResize(sourceData: Uint8Array, cropTop: number,
    cropBottom: number, cropLeft: number, cropRight: number,
    resizeNeeded: boolean, storage: HioImageStorageSpec): boolean {
    if (!this._isValidCrop(cropTop, cropBottom, cropLeft, cropRight)) {
      RaiseWarning('Invalid crop parameters')
      return false
    }
    const bpp = this.getBytesPerPixel()

    const cropWidth = this._width - cropRight - cropLeft
    const cropHeight = this._height - cropTop - cropBottom
    const croppedStrideLength = cropWidth * bpp

    const strideLength = this._width * bpp

    // set destination
    // if resizing is needed, then copy into temporary memory
    // otherwise, copy straight into storage.data
    const croppedData = resizeNeeded
      ? new Uint8Array(croppedStrideLength * cropHeight)
      : storage.data!

    for (let i = 0; i < cropHeight; i++) {
      const src = (cropTop + i) * strideLength + cropLeft * bpp
      croppedData.set(sourceData.subarray(src, src + croppedStrideLength),
        i * croppedStrideLength)
    }

    if (resizeNeeded) {
      if (!this._resize(croppedData, cropWidth, cropHeight,
        croppedStrideLength, storage)) {
        return false
      }
    }
    this._width = storage.width
    this._height = storage.height
    return true
  }
}

/** stbi__vertical_flip (stb_image.h) on a copy. */
function _VerticalFlip(data: Uint8Array, w: number, h: number, bpp: number): Uint8Array {
  const stride = w * bpp
  const out = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    out.set(data.subarray(y * stride, (y + 1) * stride), (h - 1 - y) * stride)
  }
  return out
}

/** The gamma stbi_info_from_memory reports in Hio's copy of stb_image (the
 *  PNG gAMA chunk; 0 when absent). */
function _PngGamma(bytes: Uint8Array): number {
  if (bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) {
    return 0
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset)
    const next = offset + length + 12
    if (next > bytes.length) break
    const tag = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (tag === 'gAMA' && length === 4) return view.getUint32(offset + 8) / 100000
    if (tag === 'IDAT') break
    offset = next
  }
  return 0
}

// stbImage.cpp:121-126 (and hio/plugInfo.json's imageTypes).
Hio_RegisterImageType(['bmp', 'jpg', 'jpeg', 'png', 'tga', 'hdr'], () => new Hio_StbImage())
