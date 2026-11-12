// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureUtils.cpp,
//  pxr/imaging/hdSt/textureUtils.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureUtils.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - GetAllMipImages is GetAllMipImagesAsync: HioImage::OpenForReading is
//   asynchronous here (hio/src/hioImage.ts).
// - HgiTextureReadback returns a promise of the bytes: Hgi submission is
//   asynchronous (hgi/src/hgi.ts); upstream waits until completed
//   (textureUtils.cpp:614). AlignedBuffer is a Uint8Array.
// - Conversion functions take the source and destination byte arrays with
//   byte offsets (upstream: pointers, possibly aliasing for in-place
//   conversion with aligned ends, textureUtils.cpp:549-558).

import {
  Vec3i as GfVec3i,
  _floatToHalfBits as floatToHalfBits,
  _halfBitsToFloat as halfBitsToFloat,
} from 'typescript-usd/gf'
import {
  HgiFormat,
  HgiGetDataSize,
  HgiGetMipInfos,
  HgiHandle,
  HgiSubmitWaitType,
  HgiTextureGpuToCpuOp,
  type Hgi,
  type HgiMipInfo,
  type HgiTexture,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import {
  HioFormat,
  HioGetDataSize,
  HioImage,
  HioImageMakeStorageSpec,
  type HioImageSourceColorSpace,
} from 'typescript-usd/hio'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'

/** textureUtils.h:33-40. Converts given number of texels. */
export type HdStTextureUtilsConversionFunction = (
  src: Uint8Array,
  numTexels: number,
  dst: Uint8Array,
) => void

/** Typed views of the bytes for the element type T of the templates. */
type _Elem = 'u8' | 's8' | 'u16' | 'i32' | 'f32' | 'half'

function _View(bytes: Uint8Array, elem: _Elem): ArrayLike<number> & { [i: number]: number } {
  const b = bytes.buffer, o = bytes.byteOffset, n = bytes.byteLength
  switch (elem) {
    case 'u8': return bytes
    case 's8': return new Int8Array(b, o, n)
    case 'u16': return new Uint16Array(b, o, n >> 1)
    case 'half': return new Uint16Array(b, o, n >> 1)
    case 'i32': return new Int32Array(b, o, n >> 2)
    case 'f32': return new Float32Array(b, o, n >> 2)
  }
}

/** textureUtils.cpp:24-28 _OpaqueAlpha<T> */
function _OpaqueAlpha(elem: _Elem): number {
  switch (elem) {
    case 'u8': return 255
    case 's8': return 127
    case 'u16': return 65535
    case 'i32': return 2147483647
    case 'f32': return 1
    case 'half': return floatToHalfBits(1)
  }
}

/** textureUtils.cpp:30-48 _ConvertRToRGBA<T> */
function _ConvertRToRGBA(elem: _Elem): HdStTextureUtilsConversionFunction {
  return (src, numTexels, dst) => {
    const s = _View(src, elem), d = _View(dst, elem), one = _OpaqueAlpha(elem)
    // Backwards so that an in-place conversion with aligned ends works.
    for (let i = numTexels - 1; i >= 0; i--) {
      const r = s[i]!
      d[4 * i + 0] = r
      d[4 * i + 1] = r
      d[4 * i + 2] = r
      d[4 * i + 3] = one
    }
  }
}

/** textureUtils.cpp:50-68 _ConvertRGToRGBA<T> */
function _ConvertRGToRGBA(elem: _Elem): HdStTextureUtilsConversionFunction {
  return (src, numTexels, dst) => {
    const s = _View(src, elem), d = _View(dst, elem)
    for (let i = numTexels - 1; i >= 0; i--) {
      const r = s[2 * i + 0]!, g = s[2 * i + 1]!
      d[4 * i + 0] = r
      d[4 * i + 1] = r
      d[4 * i + 2] = r
      d[4 * i + 3] = g
    }
  }
}

/** textureUtils.cpp:70-88 _ConvertRGBToRGBA<T> */
function _ConvertRGBToRGBA(elem: _Elem): HdStTextureUtilsConversionFunction {
  return (src, numTexels, dst) => {
    const s = _View(src, elem), d = _View(dst, elem), one = _OpaqueAlpha(elem)
    for (let i = numTexels - 1; i >= 0; i--) {
      const r = s[3 * i + 0]!, g = s[3 * i + 1]!, b = s[3 * i + 2]!
      d[4 * i + 0] = r
      d[4 * i + 1] = g
      d[4 * i + 2] = b
      d[4 * i + 3] = one
    }
  }
}

/** textureUtils.cpp:96-117 _ConvertColorSpace. Computed in float, as
 *  upstream (pow of a double argument rounded to float on return). */
function _SRGBToLinear(input: number): number {
  let out: number
  if (input <= 0.04045) {
    out = Math.fround(input / 12.92)
  } else {
    out = Math.fround(Math.pow((input + 0.055) / 1.055, 2.4))
  }
  return Math.min(Math.max(out, 0), 1)
}
function _LinearToSRGB(input: number): number {
  let out: number
  if (input <= 0.0031308) {
    out = Math.fround(12.92 * input)
  } else {
    out = Math.fround(1.055 * Math.pow(input, 1.0 / 2.4) - 0.055)
  }
  return Math.min(Math.max(out, 0), 1)
}

/** textureUtils.cpp:119-160 _PremultiplyAlpha<T, isSRGB> (integral T). */
function _PremultiplyAlpha(elem: _Elem, isSRGB: boolean): HdStTextureUtilsConversionFunction {
  return (src, numTexels, dst) => {
    const s = _View(src, elem), d = _View(dst, elem)
    // Perform all operations using floats.
    const max = Math.fround(_OpaqueAlpha(elem))
    const f = Math.fround
    for (let i = 0; i < numTexels; i++) {
      const alpha = f(f(s[4 * i + 3]!) / max)

      for (let j = 0; j < 3; j++) {
        let p = f(s[4 * i + j]!)

        if (isSRGB) {
          // Convert value from sRGB to linear.
          p = f(max * _SRGBToLinear(f(p / max)))
        }

        // Pre-multiply RGB values with alpha in linear space.
        p = f(p * alpha)

        if (isSRGB) {
          // Convert value from linear to sRGB.
          p = f(max * _LinearToSRGB(f(p / max)))
        }

        // Add 0.5 when converting float to integral type.
        d[4 * i + j] = Math.trunc(f(p + 0.5))
      }
      // Only necessary when not converting in place.
      d[4 * i + 3] = s[4 * i + 3]!
    }
  }
}

/** textureUtils.cpp:162-186 _PremultiplyAlphaFloat<T> */
function _PremultiplyAlphaFloat(elem: 'f32' | 'half'): HdStTextureUtilsConversionFunction {
  return (src, numTexels, dst) => {
    const s = _View(src, elem), d = _View(dst, elem)
    const get = elem === 'half' ? halfBitsToFloat : (v: number) => v
    const put = elem === 'half' ? floatToHalfBits : Math.fround
    for (let i = 0; i < numTexels; i++) {
      const alpha = get(s[4 * i + 3]!)

      // Pre-multiply RGB values with alpha.
      for (let j = 0; j < 3; j++) {
        d[4 * i + j] = put(get(s[4 * i + j]!) * alpha)
      }
      d[4 * i + 3] = s[4 * i + 3]!
    }
  }
}

/** textureUtils.cpp:188-385 */
function _GetHgiFormatAndConversion(
  hioFormat: HioFormat,
  premultiplyAlpha: boolean,
): [HgiFormat, HdStTextureUtilsConversionFunction | null] {
  const F = HioFormat
  const G = HgiFormat
  // Format dispatch, mostly we can just use the CPU buffer from
  // the texture data provided.
  switch (hioFormat) {
    // UNorm 8.
    case F.HioFormatUNorm8:
      return [G.HgiFormatUNorm8, null]
    case F.HioFormatUNorm8Vec2:
      return [G.HgiFormatUNorm8Vec4, _ConvertRGToRGBA('u8')]
    case F.HioFormatUNorm8Vec3:
      // RGB (24bit) is not supported on MTL, so we need to
      // always convert it.
      return [G.HgiFormatUNorm8Vec4, _ConvertRGBToRGBA('u8')]
    case F.HioFormatUNorm8Vec4:
      return [G.HgiFormatUNorm8Vec4,
        premultiplyAlpha ? _PremultiplyAlpha('u8', /* isSRGB = */ false) : null]
    // SNorm8
    case F.HioFormatSNorm8:
      return [G.HgiFormatSNorm8, null]
    case F.HioFormatSNorm8Vec2:
      return [G.HgiFormatSNorm8Vec4, _ConvertRGToRGBA('s8')]
    case F.HioFormatSNorm8Vec3:
      return [G.HgiFormatSNorm8Vec4, _ConvertRGBToRGBA('s8')]
    case F.HioFormatSNorm8Vec4:
      // Pre-multiplying only makes sense for RGBA colors and
      // the signed integers do not make sense for RGBA.
      //
      // However, for consistency, we do premultiply here so
      // that one can tell from the material network topology
      // only whether premultiplication is happening.
      return [G.HgiFormatSNorm8Vec4,
        premultiplyAlpha ? _PremultiplyAlpha('s8', /* isSRGB = */ false) : null]

    // Float16
    case F.HioFormatFloat16:
      return [G.HgiFormatFloat16, null]
    case F.HioFormatFloat16Vec2:
      return [G.HgiFormatFloat16Vec2, null]
    case F.HioFormatFloat16Vec3:
      // HgiFormatFloat16Vec3 exists but maps to MTLPixelFormatInvalid
      // on Metal because there is no corresponding pixel format in
      // Metal.
      return [G.HgiFormatFloat16Vec4, _ConvertRGBToRGBA('half')]
    case F.HioFormatFloat16Vec4:
      return [G.HgiFormatFloat16Vec4,
        premultiplyAlpha ? _PremultiplyAlphaFloat('half') : null]

    // Float32
    case F.HioFormatFloat32:
      return [G.HgiFormatFloat32, null]
    case F.HioFormatFloat32Vec2:
      return [G.HgiFormatFloat32Vec2, null]
    case F.HioFormatFloat32Vec3:
      // HgiFormatFloat32Vec3 exists but maps to MTLPixelFormatInvalid
      // on Metal because there is no corresponding pixel format in
      // Metal.
      return [G.HgiFormatFloat32Vec4, _ConvertRGBToRGBA('f32')]
    case F.HioFormatFloat32Vec4:
      return [G.HgiFormatFloat32Vec4,
        premultiplyAlpha ? _PremultiplyAlphaFloat('f32') : null]

    // Double64
    case F.HioFormatDouble64:
    case F.HioFormatDouble64Vec2:
    case F.HioFormatDouble64Vec3:
    case F.HioFormatDouble64Vec4:
      TF_WARN('Double texture formats not supported by Storm')
      return [G.HgiFormatInvalid, null]

    // UInt16
    case F.HioFormatUInt16:
      return [G.HgiFormatUInt16, null]
    case F.HioFormatUInt16Vec2:
      return [G.HgiFormatUInt16Vec4, _ConvertRGToRGBA('u16')]
    case F.HioFormatUInt16Vec3:
      // HgiFormatUInt16Vec3 exists but maps to MTLPixelFormatInvalid
      // on Metal because there is no corresponding pixel format in
      // Metal.
      return [G.HgiFormatUInt16Vec4, _ConvertRGBToRGBA('u16')]
    case F.HioFormatUInt16Vec4:
      return [G.HgiFormatUInt16Vec4,
        premultiplyAlpha ? _PremultiplyAlpha('u16', /* isSRGB = */ false) : null]

    // Int16
    case F.HioFormatInt16:
    case F.HioFormatInt16Vec2:
    case F.HioFormatInt16Vec3:
    case F.HioFormatInt16Vec4:
      TF_WARN('Signed 16-bit integer texture formats not supported by Storm')
      return [G.HgiFormatInvalid, null]

    // UInt32
    case F.HioFormatUInt32:
    case F.HioFormatUInt32Vec2:
    case F.HioFormatUInt32Vec3:
    case F.HioFormatUInt32Vec4:
      TF_WARN('Unsigned 32-bit integer texture formats not supported by Storm')
      return [G.HgiFormatInvalid, null]

    // Int32
    case F.HioFormatInt32:
      return [G.HgiFormatInt32, null]
    case F.HioFormatInt32Vec2:
      return [G.HgiFormatInt32Vec2, null]
    case F.HioFormatInt32Vec3:
      // HgiFormatInt32Vec3 exists but maps to MTLPixelFormatInvalid
      // on Metal because there is no corresponding pixel format in
      // Metal.
      return [G.HgiFormatInt32Vec4, _ConvertRGBToRGBA('i32')]
    case F.HioFormatInt32Vec4:
      return [G.HgiFormatInt32Vec4,
        premultiplyAlpha ? _PremultiplyAlpha('i32', /* isSRGB = */ false) : null]

    // UNorm8 SRGB
    case F.HioFormatUNorm8srgb:
      // 1-channel gamma-encoded is not supported, so we need to convert.
      return [G.HgiFormatUNorm8Vec4srgb, _ConvertRToRGBA('u8')]
    case F.HioFormatUNorm8Vec2srgb:
      // 2-channel gamma-encoded is not supported, so we need to convert.
      return [G.HgiFormatUNorm8Vec4srgb, _ConvertRGToRGBA('u8')]
    case F.HioFormatUNorm8Vec3srgb:
      // RGB (24bit) is not supported on MTL, so we need to convert it.
      return [G.HgiFormatUNorm8Vec4srgb, _ConvertRGBToRGBA('u8')]
    case F.HioFormatUNorm8Vec4srgb:
      return [G.HgiFormatUNorm8Vec4srgb,
        premultiplyAlpha ? _PremultiplyAlpha('u8', /* isSRGB = */ true) : null]

    // BPTC compressed
    case F.HioFormatBC6FloatVec3:
      return [G.HgiFormatBC6FloatVec3, null]
    case F.HioFormatBC6UFloatVec3:
      return [G.HgiFormatBC6UFloatVec3, null]
    case F.HioFormatBC7UNorm8Vec4:
      return [G.HgiFormatBC7UNorm8Vec4, null]
    case F.HioFormatBC7UNorm8Vec4srgb:
      // Pre-multiplying alpha would require decompressing and
      // recompressing, so not doing it here.
      return [G.HgiFormatBC7UNorm8Vec4srgb, null]

    // S3TC/DXT compressed
    case F.HioFormatBC1UNorm8Vec4:
      return [G.HgiFormatBC1UNorm8Vec4, null]
    case F.HioFormatBC3UNorm8Vec4:
      // Pre-multiplying alpha would require decompressing and
      // recompressing, so not doing it here.
      return [G.HgiFormatBC3UNorm8Vec4, null]

    case F.HioFormatInvalid:
      return [G.HgiFormatInvalid, null]
    case F.HioFormatCount:
      TF_CODING_ERROR('HioFormatCount passed to function')
      return [G.HgiFormatInvalid, null]
  }

  TF_CODING_ERROR('Invalid HioFormat enum value')
  return [G.HgiFormatInvalid, null]
}

/** textureUtils.cpp:592-620 GfVec3i dimensions of a HioImage. */
function _GetDimensions(image: HioImage): GfVec3i {
  return new GfVec3i(image.getWidth(), image.getHeight(), 1)
}

/** textureUtils.h:26-162 */
export class HdStTextureUtils {
  /** textureUtils.cpp:390-399. Get the Hgi format suitable for a given Hio
   *  format. Premultiply alpha indicates whether a conversion function
   *  multiplying RGB with alpha should be created. */
  static getHgiFormat(hioFormat: HioFormat, premultiplyAlpha: boolean): HgiFormat {
    return _GetHgiFormatAndConversion(hioFormat, premultiplyAlpha)[0]
  }

  /** textureUtils.cpp:401-410. Returns the conversion function to return a
   *  HioFormat to the corresponding HgiFormat given by GetHgiFormat.
   *  Returns null if no conversion necessary. */
  static getHioToHgiConversion(
    hioFormat: HioFormat,
    premultiplyAlpha: boolean,
  ): HdStTextureUtilsConversionFunction | null {
    return _GetHgiFormatAndConversion(hioFormat, premultiplyAlpha)[1]
  }

  /** textureUtils.cpp:412-447. Get all mip levels from a file. */
  static async GetAllMipImagesAsync(
    filePath: string,
    sourceColorSpace: HioImageSourceColorSpace,
  ): Promise<HioImage[]> {
    const maxMipReads = 32
    const result: HioImage[] = []

    let prevWidth = 0xffffffff
    let prevHeight = 0xffffffff

    // Ignoring image->GetNumMipLevels() since it can be unreliable.
    for (let mip = 0; mip < maxMipReads; ++mip) {
      const suppressErrors = true
      const subimage = 0
      const image = await HioImage.openForReadingAsync(
        filePath, subimage, mip, sourceColorSpace, suppressErrors)

      if (!image) {
        break
      }

      const currWidth = image.getWidth()
      const currHeight = image.getHeight()
      if (!(currWidth < prevWidth || currHeight < prevHeight)) {
        break
      }

      result.push(image)

      prevWidth = currWidth
      prevHeight = currHeight
    }

    return result
  }

  /** textureUtils.cpp:456-518. Compute dimensions so that all tiles fit
   *  into the given target memory. First by traversing the given images and
   *  then by computing a mip chain starting with the lowest resolution
   *  image. Optionally, can also give the index of the image in mips that
   *  was used to compute the dimensions. */
  static computeDimensionsFromTargetMemory(
    mips: readonly HioImage[],
    targetFormat: HgiFormat,
    tileCount: number,
    targetMemory: number,
    mipIndex?: { value: number },
  ): GfVec3i {
    // Return full resolution of image if no target memory given.
    if (targetMemory === 0) {
      if (mipIndex) {
        mipIndex.value = 0
      }
      return _GetDimensions(mips[0]!)
    }

    // Iterate through mips until one is found that fits into the target
    // memory.
    for (let i = 0; i < mips.length; i++) {
      const image = mips[i]!
      const dim = _GetDimensions(image)
      // The factor of 4/3 = 1 + 1/4 + 1/16 + ... accounts for all the
      // lower mipmaps.
      const totalMem = Math.floor(HgiGetDataSize(targetFormat, dim) * tileCount * 4 / 3)
      if (totalMem <= targetMemory) {
        if (mipIndex) {
          mipIndex.value = i
        }
        return dim
      }
    }

    if (mipIndex) {
      mipIndex.value = mips.length - 1
    }

    // If none of the mips fit, take the last one and compute
    // mip chain from it.
    const dim = _GetDimensions(mips[mips.length - 1]!)
    const mipInfos = HgiGetMipInfos(targetFormat, dim, tileCount)

    // Iterate through mip chain until one is found that fits into the
    // target memory.
    for (const mipInfo of mipInfos) {
      // The factor of 4/3 = 1 + 1/4 + 1/16 + ... accounts for all the
      // lower mipmaps.
      if (Math.floor(mipInfo.byteSizePerLayer * tileCount * 4 / 3) <= targetMemory) {
        return mipInfo.dimensions
      }
    }

    // Last resort, should be just (1,1,1).
    return mipInfos[mipInfos.length - 1]!.dimensions
  }

  /** textureUtils.cpp:522-569. Read given HioImage and convert it to
   *  corresponding Hgi format. Returns false if reading the HioImage
   *  failed. `bufferStart` holds the whole mip chain; mipInfo describes
   *  what mip level of the mip chain to fill and layer the layer number if
   *  the mip chain is for an array texture. */
  static readAndConvertImage(
    image: HioImage,
    flipped: boolean,
    premultiplyAlpha: boolean,
    mipInfo: HgiMipInfo,
    layer: number,
    bufferStart: Uint8Array,
  ): boolean {
    const conversionFunction =
      HdStTextureUtils.getHioToHgiConversion(image.GetFormat(), premultiplyAlpha)

    // Given the start of the buffer containing all mips
    // and layers, compute where the desired mip and layer
    // starts.
    const mipLayerStart = mipInfo.byteOffset + layer * mipInfo.byteSizePerLayer
    const mipLayer = bufferStart.subarray(mipLayerStart,
      mipLayerStart + mipInfo.byteSizePerLayer)

    const spec = HioImageMakeStorageSpec()
    spec.width = mipInfo.dimensions.data[0]!
    spec.height = mipInfo.dimensions.data[1]!
    spec.format = image.GetFormat()
    spec.flipped = flipped
    if (conversionFunction) {
      // This part is a bit tricky: the RGB to RGBA conversion
      // is in place. To make sure we do not write over data
      // that have not been read yet, we need to align the ends.
      const hioSize = HioGetDataSize(image.GetFormat(), mipInfo.dimensions)
      spec.data = mipLayer.subarray(mipInfo.byteSizePerLayer - hioSize)
    } else {
      spec.data = mipLayer
    }

    if (!image.Read(spec)) {
      return false
    }

    if (conversionFunction) {
      // The ends are aligned and the element conversions above run
      // backwards for expansions, so converting in place is safe; the
      // source is copied for the premultiply functions, which run forwards
      // over equally sized texels.
      conversionFunction(spec.data.slice(), spec.width * spec.height, mipLayer)
    }

    return true
  }

  /** textureUtils.cpp:571-617. Returns an unsigned byte buffer with data
   *  read back from `texture` (see the header). */
  static async hgiTextureReadback(
    hgi: Hgi,
    texture: HgiTextureHandle,
  ): Promise<Uint8Array> {
    const tex = texture.Get()
    if (!tex) {
      return new Uint8Array(0)
    }

    const textureDesc = tex.getDescriptor()
    const formatByteSize = HgiGetDataSize(textureDesc.format, new GfVec3i(1, 1, 1))
    const width = textureDesc.dimensions.data[0]!
    const height = textureDesc.dimensions.data[1]!
    const dataByteSize = width * height * formatByteSize

    if (dataByteSize === 0) {
      return new Uint8Array(0)
    }

    // For Metal the CPU buffer has to be rounded up to a multiple of the page
    // size.
    const alignment = hgi.getCapabilities()!.getPageSizeAlignment()
    const bitMask = alignment - 1
    const bufferSize = Math.floor((dataByteSize + bitMask) / alignment) * alignment
    const rawBuffer = new Uint8Array(bufferSize)

    const blitCmds = hgi.createBlitCmds()
    const copyOp = new HgiTextureGpuToCpuOp()
    copyOp.gpuSourceTexture = texture
    copyOp.sourceTexelOffset = new GfVec3i(0, 0, 0)
    copyOp.mipLevel = 0
    copyOp.cpuDestinationBuffer = rawBuffer
    copyOp.destinationByteOffset = 0
    copyOp.destinationBufferByteSize = bufferSize
    blitCmds.copyTextureGpuToCpu(copyOp)
    await hgi.submitCmds(blitCmds, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

    return rawBuffer
  }

  /** An empty HgiTextureHandle (a default-constructed handle). */
  static _emptyTextureHandle(): HgiTextureHandle {
    return new HgiHandle<HgiTexture>()
  }
}
