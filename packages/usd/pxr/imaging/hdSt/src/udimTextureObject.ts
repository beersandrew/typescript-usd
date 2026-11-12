// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/udimTextureObject.cpp,
//  pxr/imaging/hdSt/udimTextureObject.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/udimTextureObject.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: _Load is asynchronous (resolving tile paths and opening
// images; see textureObject.ts); the tiles load one after the other rather
// than with WorkParallelForN.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { Token as TfToken } from 'typescript-usd/tf'
import {
  HgiFormat,
  HgiGetMipInfos,
  HgiIsCompressed,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import type { HioImage } from 'typescript-usd/hio'
import { HdStTextureType } from './enums.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStTextureObject } from './textureObject.ts'
import type { HdSt_TextureObjectRegistry } from './textureObjectRegistry.ts'
import { HdStTextureUtils } from './textureUtils.ts'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** udimTextureObject.cpp:25-28. Returns true if the file given by
 *  `imageFilePath` represents a udim file. */
export function HdStIsSupportedUdimTexture(imageFilePath: string): boolean {
  return imageFilePath.includes('<UDIM>')
}

/** udimTextureObject.cpp:35-37 */
const UDIM_PATTERN = '<UDIM>'
const UDIM_START_TILE = 1001
const UDIM_END_TILE = 1100

/** udimTextureObject.cpp:39-50. Split a udim file path such as
 *  /someDir/myFile.<UDIM>.exr into a prefix (/someDir/myFile.) and suffix
 *  (.exr). */
function _SplitUdimPattern(path: string): [string, string] {
  const pos = path.indexOf(UDIM_PATTERN)
  if (pos !== -1) {
    return [path.slice(0, pos), path.slice(pos + UDIM_PATTERN.length)]
  }
  return ['', '']
}

/** udimTextureObject.cpp:52-102. Find all udim tiles for a given udim file
 *  path /someDir/myFile.<UDIM>.exr as pairs, e.g.,
 *  (0, /someDir/myFile.1001.exr), ... */
async function _FindUdimTiles(filePath: string): Promise<Array<[number, TfToken]>> {
  const result: Array<[number, TfToken]> = []

  // Get prefix and suffix from udim pattern.
  const splitPath = _SplitUdimPattern(filePath)
  if (splitPath[0] === '' && splitPath[1] === '') {
    TF_WARN(`Expected udim pattern but got '${filePath}'.`)
    return result
  }

  const resolver = ArGetResolver()

  for (let i = UDIM_START_TILE; i <= UDIM_END_TILE; i++) {
    // Add integer between prefix and suffix and see whether
    // the tile exists by consulting the resolver.
    const resolvedPath = String(
      await resolver.resolve(splitPath[0] + String(i) + splitPath[1]))
    if (resolvedPath !== '') {
      // Record pair in result.
      result.push([i - UDIM_START_TILE, TfToken(resolvedPath)])
    }
  }

  return result
}

/** udimTextureObject.cpp:132-145 */
function _GetSmallestImageLargerThan(images: readonly HioImage[], dimensions: GfVec3i): HioImage {
  for (let i = images.length - 1; i >= 0; i--) {
    const image = images[i]!
    if (dimensions.data[0]! <= image.getWidth() &&
        dimensions.data[1]! <= image.getHeight()) {
      return image
    }
  }
  return images[0]!
}

/** udimTextureObject.h:33-95. A UDIM texture. */
export class HdStUdimTextureObject extends HdStTextureObject {
  private _textureData: Uint8Array = new Uint8Array(0)
  private _layoutData: Float32Array = new Float32Array(0)
  private _textureDataSize = 0
  private _layoutDataSize = 0
  private _tileCount = 0
  private _dimensions = new GfVec3i(0, 0, 0)
  private _mipCount = 0
  private _hgiFormat: HgiFormat = HgiFormat.HgiFormatInvalid
  private _texelTexture: HgiTextureHandle = HdStTextureUtils._emptyTextureHandle()
  private _layoutTexture: HgiTextureHandle = HdStTextureUtils._emptyTextureHandle()

  /** udimTextureObject.cpp:106-116 */
  constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    super(textureId, textureObjectRegistry)
  }

  /** udimTextureObject.cpp:118-121 (destructor). */
  override _destroy(): void {
    this._destroyTextures()
  }

  /** udimTextureObject.cpp:123-130 */
  private _destroyTextures(): void {
    const hgi = this._getHgi()
    if (hgi) {
      if (this._texelTexture.isSet()) {
        hgi.destroyTexture(this._texelTexture)
      }
      if (this._layoutTexture.isSet()) {
        hgi.destroyTexture(this._layoutTexture)
      }
    }
  }

  /** udimTextureObject.h:47-52. Get the handle to the actual GPU resource.
   *  Only valid after commit phase. */
  getTexelTexture(): HgiTextureHandle { return this._texelTexture }

  /** udimTextureObject.h:54-59. Get the handle to the GPU layout
   *  resource. Only valid after commit phase. */
  getLayoutTexture(): HgiTextureHandle { return this._layoutTexture }

  /** udimTextureObject.cpp:147-229 */
  async _load(): Promise<void> {
    const tiles = await _FindUdimTiles(this.GetTextureIdentifier().getFilePath())
    if (tiles.length === 0) {
      return
    }

    const subId = this.GetTextureIdentifier().getSubtextureIdentifier()
    const sourceColorSpace = this._getSourceColorSpace(subId)

    const firstImageMips = await HdStTextureUtils.GetAllMipImagesAsync(
      tiles[0]![1], sourceColorSpace)
    if (firstImageMips.length === 0) {
      return
    }

    // Determine Hio and corresponding Hgi format from first tile.
    const hioFormat = firstImageMips[0]!.GetFormat()
    const premultiplyAlpha = this._getPremultiplyAlpha(subId)
    this._hgiFormat = HdStTextureUtils.getHgiFormat(hioFormat, premultiplyAlpha)

    if (this._hgiFormat === HgiFormat.HgiFormatInvalid || HgiIsCompressed(this._hgiFormat)) {
      TF_WARN('Unsupported texture format for UDIM')
      return
    }

    this._tileCount = tiles.length
    this._dimensions = HdStTextureUtils.computeDimensionsFromTargetMemory(
      firstImageMips, this._hgiFormat, this._tileCount, this.getTargetMemory())

    // Texture array queries will use a float as the array specifier.
    this._layoutDataSize = tiles[tiles.length - 1]![0] + 1
    this._layoutData = new Float32Array(this._layoutDataSize)

    // Use Hgi to compute the mip sizes from the dimensions
    const mipInfos = HgiGetMipInfos(this._hgiFormat, this._dimensions, this._tileCount)
    this._mipCount = mipInfos.length

    const lastMipInfo = mipInfos[mipInfos.length - 1]!

    // Allocate memory for the mipData, ready for upload to GPU
    this._textureDataSize = lastMipInfo.byteOffset +
      this._tileCount * lastMipInfo.byteSizePerLayer
    this._textureData = new Uint8Array(this._textureDataSize)

    for (let tileId = 0; tileId < tiles.length; ++tileId) {
      const tile = tiles[tileId]!
      this._layoutData[tile[0]] = tileId + 1
      const images = await HdStTextureUtils.GetAllMipImagesAsync(tile[1], sourceColorSpace)
      if (images.length === 0) {
        continue
      }
      for (const mipInfo of mipInfos) {
        const image = _GetSmallestImageLargerThan(images, mipInfo.dimensions)
        HdStTextureUtils.readAndConvertImage(
          image,
          /* flipped = */ true,
          premultiplyAlpha,
          mipInfo,
          tileId,
          this._textureData)
      }
    }
  }

  /** udimTextureObject.cpp:231-307 */
  _commit(): void {
    const hgi = this._getHgi()
    if (!TF_VERIFY(hgi)) {
      return
    }

    this._destroyTextures()

    if (this._hgiFormat === HgiFormat.HgiFormatInvalid) {
      // Create 1x1x1 black fallback texture.
      const texDesc = new HgiTextureDesc()
      texDesc.debugName = 'UdimTextureFallback'
      texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      texDesc.format = HgiFormat.HgiFormatUNorm8Vec4
      texDesc.type = HgiTextureType.HgiTextureType2DArray
      texDesc.dimensions = new GfVec3i(1, 1, 1)
      texDesc.layerCount = 1
      texDesc.mipLevels = 1
      texDesc.pixelsByteSize = 4
      texDesc.initialData = new Uint8Array([0, 0, 0, 255])
      this._texelTexture = hgi!.createTexture(texDesc)

      const layoutTexDesc = new HgiTextureDesc()
      layoutTexDesc.debugName = 'UdimLayoutTextureFallback'
      layoutTexDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      layoutTexDesc.type = HgiTextureType.HgiTextureType1D
      layoutTexDesc.dimensions = new GfVec3i(1, 1, 1)
      layoutTexDesc.format = HgiFormat.HgiFormatFloat32
      layoutTexDesc.layerCount = 1
      layoutTexDesc.mipLevels = 1
      layoutTexDesc.pixelsByteSize = 4
      layoutTexDesc.initialData = new Float32Array([1])
      this._layoutTexture = hgi!.createTexture(layoutTexDesc)
      return
    }

    // Texel GPU texture creation
    {
      const texDesc = new HgiTextureDesc()
      texDesc.debugName = this._getDebugName(this.GetTextureIdentifier())
      texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      texDesc.type = HgiTextureType.HgiTextureType2DArray
      texDesc.dimensions = this._dimensions
      texDesc.layerCount = this._tileCount
      texDesc.format = this._hgiFormat
      texDesc.mipLevels = this._mipCount
      texDesc.initialData = this._textureData
      texDesc.pixelsByteSize = this._textureDataSize
      this._texelTexture = hgi!.createTexture(texDesc)
    }

    // Layout GPU texture creation
    {
      const texDesc = new HgiTextureDesc()
      texDesc.debugName = this._getDebugName(this.GetTextureIdentifier())
      texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      texDesc.type = HgiTextureType.HgiTextureType1D
      texDesc.dimensions = new GfVec3i(this._layoutDataSize, 1, 1)
      texDesc.format = HgiFormat.HgiFormatFloat32
      texDesc.initialData = this._layoutData
      texDesc.pixelsByteSize = this._layoutDataSize * 4
      this._layoutTexture = hgi!.createTexture(texDesc)
    }

    // Free CPU memory after transfer to GPU
    this._textureData = new Uint8Array(0)
    this._layoutData = new Float32Array(0)
  }

  /** udimTextureObject.cpp:309-313 */
  isValid(): boolean {
    return this._hgiFormat !== HgiFormat.HgiFormatInvalid
  }

  /** udimTextureObject.cpp:315-319 */
  getTextureType(): HdStTextureType {
    return HdStTextureType.Udim
  }

  /** udimTextureObject.cpp:321-328 */
  getCommittedSize(): number {
    if (this._hgiFormat === HgiFormat.HgiFormatInvalid) {
      return 4 + 4
    }
    return this._textureDataSize + this._layoutDataSize * 4
  }
}
