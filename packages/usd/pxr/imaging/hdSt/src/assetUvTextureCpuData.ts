// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/assetUvTextureCpuData.cpp,
//  pxr/imaging/hdSt/assetUvTextureCpuData.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/assetUvTextureCpuData.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: the constructor is given the opened mip images. Upstream it
// opens them itself (assetUvTextureCpuData.cpp:47-49,
// HdStTextureUtils::GetAllMipImages); here opening is asynchronous, so
// HdStAssetUvTextureObject::_Load opens them first (textureObject.ts).

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { Wrap as HdWrap } from 'typescript-usd/hd'
import {
  HgiComponentMapping,
  HgiComponentSwizzle,
  HgiFormat,
  HgiGetComponentCount,
  HgiGetMipInfos,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
} from 'typescript-usd/hgi'
import {
  HioAddressDimension,
  HioAddressMode,
  HioImageOriginLocation,
  HioImageSourceColorSpace,
  type HioImage,
} from 'typescript-usd/hio'
import type { HdStTextureCpuData } from './textureCpuData.ts'
import { HdStTextureUtils } from './textureUtils.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** assetUvTextureCpuData.cpp:14-28. For texture debug string. */
function _ToString(s: HioImageSourceColorSpace): string {
  switch (s) {
    case HioImageSourceColorSpace.Raw:
      return 'Raw'
    case HioImageSourceColorSpace.SRGB:
      return 'SRGB'
    case HioImageSourceColorSpace.Auto:
      return 'Auto'
  }
  return 'Invalid'
}

/** assetUvTextureCpuData.cpp:30-35 */
function _GetDimensions(image: HioImage): GfVec3i {
  return new GfVec3i(image.getWidth(), image.getHeight(), 1)
}

/** assetUvTextureCpuData.cpp:171-191 */
function _GetWrapMode(image: HioImage, d: HioAddressDimension): HdWrap {
  const mode = image.getSamplerMetadata(d)
  if (mode !== null) {
    switch (mode) {
      case HioAddressMode.HioAddressModeClampToEdge:
        return HdWrap.HdWrapClamp
      case HioAddressMode.HioAddressModeMirrorClampToEdge:
        TF_WARN('Hydra does not support mirror clamp to edge wrap mode')
        return HdWrap.HdWrapRepeat
      case HioAddressMode.HioAddressModeRepeat:
        return HdWrap.HdWrapRepeat
      case HioAddressMode.HioAddressModeMirrorRepeat:
        return HdWrap.HdWrapMirror
      case HioAddressMode.HioAddressModeClampToBorderColor:
        return HdWrap.HdWrapBlack
    }
  }
  return HdWrap.HdWrapNoOpinion
}

/** assetUvTextureCpuData.h:24-71. An implementation of HdStTextureCpuData
 *  that can be initialized from an asset. */
export class HdStAssetUvTextureCpuData implements HdStTextureCpuData {
  // Texture descriptor, including initialData pointer.
  private readonly _textureDesc = new HgiTextureDesc()
  // Whether mipmaps need to be generated.
  private _generateMipmaps = false
  // To be communicated to the texture object.
  private _wrapInfo: [HdWrap, HdWrap] = [HdWrap.HdWrapNoOpinion, HdWrap.HdWrapNoOpinion]
  // The mip chain read from the file.
  private _rawBuffer: Uint8Array | null = null

  /** assetUvTextureCpuData.cpp:37-163 (see the header for `mips`). */
  constructor(
    filePath: string,
    mips: readonly HioImage[],
    targetMemory: number,
    premultiplyAlpha: boolean,
    originLocation: HioImageOriginLocation,
    sourceColorSpace: HioImageSourceColorSpace,
  ) {
    // Open all mips for the image (done by the caller, see the header).
    if (mips.length === 0) {
      return
    }

    // Extract wrap info and the CPU data format from first mip image.
    this._setWrapInfo(mips[0]!)
    const hioFormat = mips[0]!.GetFormat()

    this._textureDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
    this._textureDesc.type = HgiTextureType.HgiTextureType2D

    // Determine the corresponding GPU format (e.g., float/byte,
    // RED/RGBA) and give function to convert data if necessary.
    this._textureDesc.format = HdStTextureUtils.getHgiFormat(hioFormat, premultiplyAlpha)

    if (this._textureDesc.format === HgiFormat.HgiFormatInvalid) {
      TF_WARN('Unsupported texture format for UV texture')
      return
    }

    // The index of the mip image in mips that we start with.
    const firstMipRef = { value: 0 }

    // Use target memory to determine the first mip to use the
    // dimensions of the GPU texture (which can be even smaller than
    // that of the mip image).
    this._textureDesc.dimensions =
      HdStTextureUtils.computeDimensionsFromTargetMemory(
        mips,
        this._textureDesc.format,
        /* tileCount = */ 1,
        targetMemory,
        firstMipRef)
    const firstMip = firstMipRef.value

    // Compute the GPU mip sizes.
    const mipInfos = HgiGetMipInfos(
      this._textureDesc.format,
      this._textureDesc.dimensions,
      /* layerCount = */ 1)

    // We always use the data of the first mip. Determine, how many
    // of the following mips from the image we can use.
    // The requirement is that the authored mip image has the correct
    // dimension to be suitable as mip for the GPU.
    let numUsableMips = 1
    while (firstMip + numUsableMips < mips.length &&
      _GetDimensions(mips[firstMip + numUsableMips]!).equals(
        mipInfos[numUsableMips]!.dimensions)) {
      numUsableMips++
    }

    if (numUsableMips > 1) {
      // We have authored mips we can use, so use them.
      this._textureDesc.mipLevels = numUsableMips
    } else {
      // No authored mips, generate the mipmaps from the image.
      this._generateMipmaps = true
      this._textureDesc.mipLevels = mipInfos.length
    }

    // Compute how much memory we need to allocate to upload the
    // desirable mips.
    const lastMipInfo = mipInfos[numUsableMips - 1]!
    const memSize = lastMipInfo.byteOffset + lastMipInfo.byteSizePerLayer
    this._rawBuffer = new Uint8Array(memSize)

    // Read the actual mips from each image and store them in a big buffer
    // of contiguous memory.
    for (let i = 0; i < numUsableMips; ++i) {
      if (!HdStTextureUtils.readAndConvertImage(
        mips[firstMip + i]!,
        /* flipped = */ originLocation === HioImageOriginLocation.OriginLowerLeft,
        premultiplyAlpha,
        mipInfos[i]!,
        /* layer = */ 0,
        this._rawBuffer)) {
        TF_WARN(`Unable to read Texture '${filePath}'.`)
        return
      }
    }

    // Handle grayscale textures by expanding value to green and blue.
    if (HgiGetComponentCount(this._textureDesc.format) === 1) {
      this._textureDesc.componentMapping = new HgiComponentMapping(
        HgiComponentSwizzle.HgiComponentSwizzleR,
        HgiComponentSwizzle.HgiComponentSwizzleR,
        HgiComponentSwizzle.HgiComponentSwizzleR,
        HgiComponentSwizzle.HgiComponentSwizzleOne)
    }

    this._textureDesc.debugName =
      filePath +
      ' - flipVertically=' +
      String(Number(originLocation === HioImageOriginLocation.OriginUpperLeft)) +
      ' - premultiplyAlpha=' +
      String(Number(premultiplyAlpha)) +
      ' - sourceColorSpace=' +
      _ToString(sourceColorSpace)

    // We successfully made it to the end of the function. Indicate that
    // the texture descriptor is valid by setting the data and its size.
    this._textureDesc.initialData = this._rawBuffer
    this._textureDesc.pixelsByteSize = memSize
  }

  /** assetUvTextureCpuData.cpp:193-199 */
  private _setWrapInfo(image: HioImage): void {
    this._wrapInfo = [
      _GetWrapMode(image, HioAddressDimension.HioAddressDimensionU),
      _GetWrapMode(image, HioAddressDimension.HioAddressDimensionV),
    ]
  }

  /** assetUvTextureCpuData.cpp:201-205 */
  getTextureDesc(): HgiTextureDesc {
    return this._textureDesc
  }

  /** assetUvTextureCpuData.cpp:207-211 */
  getGenerateMipmaps(): boolean {
    return this._generateMipmaps
  }

  /** assetUvTextureCpuData.cpp:213-217 */
  isValid(): boolean {
    return this._textureDesc.initialData !== null
  }

  /** assetUvTextureCpuData.h:49-53. The wrap info extracted from the
   *  image. */
  getWrapInfo(): readonly [HdWrap, HdWrap] {
    return this._wrapInfo
  }
}
