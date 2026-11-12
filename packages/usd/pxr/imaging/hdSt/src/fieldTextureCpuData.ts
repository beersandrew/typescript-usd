// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/fieldTextureCpuData.cpp,
//  pxr/imaging/hdSt/fieldTextureCpuData.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/fieldTextureCpuData.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: the texture data has been read before construction
// (HioFieldTextureData::Read is asynchronous here, hio/fieldTextureData.ts);
// upstream HdStFieldTextureObject::_Load reads it just before as well.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  HgiComponentMapping,
  HgiComponentSwizzle,
  HgiFormat,
  HgiGetComponentCount,
  HgiGetDataSizeOfFormat,
  HgiGetMipInfos,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
} from 'typescript-usd/hgi'
import type { FieldTextureData as HioFieldTextureData } from 'typescript-usd/hio'
import type { HdStTextureCpuData } from './textureCpuData.ts'
import { HdStTextureUtils } from './textureUtils.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** fieldTextureCpuData.cpp:19-27 */
function _IsValid(textureData: HioFieldTextureData): boolean {
  return (
    textureData.resizedWidth() > 0 &&
    textureData.resizedHeight() > 0 &&
    textureData.resizedDepth() > 0 &&
    textureData.hasRawBuffer())
}

/** fieldTextureCpuData.h:24-68. An implementation of HdStTextureCpuData
 *  that can be initialized from HioFieldTextureData. */
export class HdSt_FieldTextureCpuData implements HdStTextureCpuData {
  // The result, including a pointer to the potentially
  // converted texture data in _textureDesc.initialData.
  private readonly _textureDesc = new HgiTextureDesc()

  // To avoid a copy, hold on to original data if we
  // can use them.
  private _textureData: HioFieldTextureData | null = null

  // Buffer if we had to convert the data.
  private _convertedData: Uint8Array | null = null

  // Whether mipmaps are to be generated (never for fields).
  private readonly _generateMipmaps = false

  /** fieldTextureCpuData.cpp:31-129. It is assumed that Read(...) has
   *  already been called on textureData. */
  constructor(
    textureData: HioFieldTextureData | null,
    debugName: string,
    premultiplyAlpha = true,
  ) {
    this._textureDesc.debugName = debugName

    // Bail if we don't have texture data.
    if (!textureData) {
      return
    }

    // Sanity checks
    if (!_IsValid(textureData)) {
      return
    }

    // If there is no file at the given path, we should have bailed
    // by now and left _textureDesc.initalData null indicating to
    // our clients that the texture is invalid.

    this._textureDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
    this._textureDesc.type = HgiTextureType.HgiTextureType3D

    // Determine the format (e.g., float/byte, RED/RGBA) and give
    // function to convert data if necessary.
    // Possible conversions are:
    // - Unsigned byte RGB to RGBA (since the former is not support
    //   by modern graphics APIs)
    // - Pre-multiply alpha.

    const hioFormat = textureData.GetFormat()

    this._textureDesc.format = HdStTextureUtils.getHgiFormat(
      hioFormat,
      premultiplyAlpha)
    if (this._textureDesc.format === HgiFormat.HgiFormatInvalid) {
      TF_WARN('Unsupported texture format for field')
      return
    }

    const conversionFunction =
      HdStTextureUtils.getHioToHgiConversion(
        hioFormat,
        premultiplyAlpha)

    // Handle grayscale textures by expanding value to green and blue.
    if (HgiGetComponentCount(this._textureDesc.format) === 1) {
      this._textureDesc.componentMapping = new HgiComponentMapping(
        HgiComponentSwizzle.HgiComponentSwizzleR,
        HgiComponentSwizzle.HgiComponentSwizzleR,
        HgiComponentSwizzle.HgiComponentSwizzleR,
        HgiComponentSwizzle.HgiComponentSwizzleOne)
    }

    this._textureDesc.dimensions = new GfVec3i(
      textureData.resizedWidth(),
      textureData.resizedHeight(),
      textureData.resizedDepth())

    const mipInfos = HgiGetMipInfos(
      this._textureDesc.format,
      this._textureDesc.dimensions,
      this._textureDesc.layerCount)

    // How many mipmaps to use from the file.
    const numGivenMipmaps = 1

    const mipInfo = mipInfos[numGivenMipmaps - 1]!

    // Size of initial data.
    this._textureDesc.pixelsByteSize = mipInfo.byteOffset + mipInfo.byteSizePerLayer

    const rawBuffer = textureData.getRawBuffer()!
    if (conversionFunction) {
      const numPixels =
        this._textureDesc.pixelsByteSize /
        HgiGetDataSizeOfFormat(this._textureDesc.format)

      // Convert the texture data
      const convertedData = new Uint8Array(this._textureDesc.pixelsByteSize)
      conversionFunction(
        rawBuffer, numPixels,
        convertedData)
      this._convertedData = convertedData

      // Point to converted data
      this._textureDesc.initialData = this._convertedData
    } else {
      // Ensure that texture data are not deleted
      this._textureData = textureData
      // Point to raw buffer inside texture data
      this._textureDesc.initialData = rawBuffer
    }
  }

  /** fieldTextureCpuData.cpp:133-138 */
  getTextureDesc(): HgiTextureDesc {
    return this._textureDesc
  }

  /** fieldTextureCpuData.cpp:140-144 */
  getGenerateMipmaps(): boolean {
    return this._generateMipmaps
  }

  /** fieldTextureCpuData.cpp:146-150 */
  isValid(): boolean {
    return this._textureDesc.initialData !== null
  }

  /** The held texture data (keeps the raw buffer alive, as upstream). */
  _getTextureData(): HioFieldTextureData | null { return this._textureData }
}
