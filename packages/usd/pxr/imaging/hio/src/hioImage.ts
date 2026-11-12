// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/assetUvTextureCpuData.cpp,
//  pxr/imaging/hdSt/textureUtils.cpp, pxr/imaging/hio/image.cpp,
//  pxr/imaging/hio/image.h, pxr/imaging/hio/imageRegistry.cpp,
//  pxr/imaging/hio/stbImage.cpp, and 1 more cited below
// Copyright 2016, 2018, 2020, 2022 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/image.{h,cpp} (OpenUSD 26.11.1): the HioImage
// class Storm's texture system reads image files through
// (hdSt/textureUtils.cpp, hdSt/assetUvTextureCpuData.cpp).
//
// Divergences:
// - Opening has two entry points, as browser I/O is asynchronous:
//   OpenForReadingAsync reads the asset through the asynchronous browser
//   resolver and decodes the pixels at open, so that Read() (upstream reads
//   the file again, stbImage.cpp:427-460) stays synchronous; this is how
//   Storm's texture system opens images. OpenForReading is upstream's
//   synchronous call for clients in the middle of Hydra's synchronous scene
//   processing (the cards draw mode reading a texture's worldtoscreen
//   metadata, usdImaging/drawModeStandin.cpp:1170): it reads the asset Ar
//   read ahead (ar/src/prefetchedAssets.ts, _ArOpenAssetSync), opens the
//   header only (what upstream's _OpenForReading reads too), and decodes no
//   pixels, so Read() of such an image fails with a warning. Both entry
//   points run the same header open of each image type.
// - The image registry (imageRegistry.cpp, plugInfo.json "imageTypes") is
//   the extension table below; the image types register their factories
//   when their modules load (index.ts loads them all), as plugins do.
// - Writing (OpenForWriting/Write) is not ported here; the image tests write
//   PNGs in their drivers.

import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import type { HioAddressDimension, HioAddressMode, HioFormat } from './types.ts'

/** image.h:40-46. Specifies whether to treat the image origin as the
 *  upper-left corner or the lower left. */
export enum HioImageOriginLocation {
  OriginUpperLeft,
  OriginLowerLeft,
}

/** image.h:48-57. Specifies the source color space in which the texture is
 *  encoded, with "Auto" indicating the texture reader should determine color
 *  space based on hints from the image (e.g. file type, number of channels,
 *  image metadata). */
export enum HioImageSourceColorSpace {
  Raw,
  SRGB,
  Auto,
}

/** image.h:59-76. Describes the memory layout and storage of a texture
 *  image. `data` is the destination bytes (upstream: void *). */
export interface HioImageStorageSpec {
  width: number
  height: number
  depth: number
  format: HioFormat
  flipped: boolean
  data: Uint8Array | null
}

export function HioImageMakeStorageSpec(): HioImageStorageSpec {
  return { width: 0, height: 0, depth: 0, format: -1 as HioFormat, flipped: false, data: null }
}

/** image.h:31-170. A base class for reading and writing texture image
 *  data. */
export abstract class HioImage {
  /** image.cpp:23-28 */
  static isSupportedImageFile(filename: string): boolean {
    return _imageTypes.has(_GetExtension(filename))
  }

  /** image.cpp:30-44, synchronous: the header of an asset Ar read ahead
   *  (see the header). Null when the asset was not read ahead or cannot be
   *  opened, as upstream's null for an asset that cannot be opened. */
  static openForReading(
    filename: string,
    subimage = 0,
    mip = 0,
    sourceColorSpace: HioImageSourceColorSpace = HioImageSourceColorSpace.Auto,
    suppressErrors = false,
  ): HioImage | null {
    const image = _ConstructImage(filename)
    if (!image || !image._openForReading(filename, subimage, mip,
      sourceColorSpace, suppressErrors)) {
      return null
    }
    return image
  }

  /** image.cpp:30-44 (OpenForReading; see the header). */
  static async openForReadingAsync(
    filename: string,
    subimage = 0,
    mip = 0,
    sourceColorSpace: HioImageSourceColorSpace = HioImageSourceColorSpace.Auto,
    suppressErrors = false,
  ): Promise<HioImage | null> {
    await _LoadImageTypes()
    const image = _ConstructImage(filename)
    if (!image || !(await image._OpenForReadingAsync(filename, subimage, mip,
      sourceColorSpace, suppressErrors))) {
      return null
    }
    return image
  }

  /** image.h:108. Reads the image file into `storage`. */
  abstract Read(storage: HioImageStorageSpec): boolean

  /** image.h:111-115. Reads the cropped sub-image into `storage`. */
  abstract ReadCropped(cropTop: number, cropBottom: number, cropLeft: number,
    cropRight: number, storage: HioImageStorageSpec): boolean

  /** image.h:133. Returns the image filename. */
  abstract getFilename(): string
  /** image.h:136. Returns the image width. */
  abstract getWidth(): number
  /** image.h:139. Returns the image height. */
  abstract getHeight(): number
  /** image.h:142. Returns the destination HioFormat. */
  abstract GetFormat(): HioFormat
  /** image.h:145. Returns the number of bytes per pixel. */
  abstract getBytesPerPixel(): number
  /** image.h:148. Returns the number of mips available. */
  abstract getNumMipLevels(): number
  /** image.h:151. Returns whether the image is in the sRGB color space. */
  abstract isColorSpaceSRGB(): boolean
  /** image.h:155-158. Returns the metadata value for `key`, or null
   *  (upstream's false). */
  abstract getMetadata(key: string): VtValue | null
  /** image.h:160-161. Returns the sampler metadata, or null. */
  abstract getSamplerMetadata(dim: HioAddressDimension): HioAddressMode | null

  /** image.h:166-170, synchronous (OpenForReading; see the header). */
  protected abstract _openForReading(filename: string, subimage: number,
    mip: number, sourceColorSpace: HioImageSourceColorSpace,
    suppressErrors: boolean): boolean
  /** image.h:166-170 (OpenForReadingAsync; see the header). */
  protected abstract _OpenForReadingAsync(filename: string, subimage: number,
    mip: number, sourceColorSpace: HioImageSourceColorSpace,
    suppressErrors: boolean): Promise<boolean>
}
export type HioImageSharedPtr = HioImage

/** Image types by extension (hio/plugInfo.json "imageTypes" for
 *  Hio_StbImage; hioOpenEXR/plugInfo.json for exr). */
const _imageTypes = new Set(['bmp', 'jpg', 'jpeg', 'png', 'tga', 'hdr', 'exr'])

/** The image factories by extension: HioImageFactory<T> of each image type
 *  (image.h:178-194), registered by its module (stbImage.ts,
 *  openexrHioImage.ts). */
const _factories = new Map<string, () => HioImage>()

/** Registers the factory of an image type for `extensions` (the
 *  TF_REGISTRY_FUNCTION of each image type, e.g. stbImage.cpp:46-55). */
export function Hio_RegisterImageType(extensions: readonly string[],
  factory: () => HioImage): void {
  for (const extension of extensions) {
    _factories.set(extension, factory)
  }
}

/** PlugPlugin::Load of the image types (imageRegistry.cpp:73-79): loads
 *  their modules. */
async function _LoadImageTypes(): Promise<void> {
  await Promise.all([import('./stbImage.ts'), import('./openexrHioImage.ts')])
}

function _GetExtension(filename: string): string {
  // imageRegistry.cpp:57-58: TfStringToLowerAscii(ArGetResolver().GetExtension(filename))
  // (the innermost extension of a package-relative path).
  return ArGetResolver().getExtension(filename).replace(/[A-Z]/g, (c) => c.toLowerCase())
}

/** HioImageRegistry::_ConstructImage (imageRegistry.cpp:50-90). */
function _ConstructImage(filename: string): HioImage | null {
  const ext = _GetExtension(filename)
  if (!_imageTypes.has(ext)) {
    return null
  }
  const factory = _factories.get(ext)
  if (!factory) {
    // imageRegistry.cpp:73-79: the image type's module has not loaded (the
    // synchronous OpenForReading needs index.ts's imports of them).
    TfDiagnosticMgr.GetInstance().postError(new TfError(
      `[PluginLoad] PlugPlugin could not be loaded for image type '${ext}'`,
      TfDiagnosticType.CodingError))
    return null
  }
  return factory()
}
