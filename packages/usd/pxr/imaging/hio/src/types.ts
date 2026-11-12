// Ported from OpenUSD 26.11.1: pxr/imaging/hio/types.cpp,
//  pxr/imaging/hio/types.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/types.{h,cpp} (OpenUSD 26.11.1).

import type { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  TfDiagnosticMgr,
  TfDiagnosticType,
  Error as TfError,
} from 'typescript-usd/tf'

/** TF_CODING_ERROR (diagnostic.h:311-315): post a coding error and continue. */
function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(
    new TfError(message, TfDiagnosticType.CodingError))
}

/** types.h:20-114. HioFormat describes the memory format of image buffers
 *  used in Hio. */
export enum HioFormat {
  HioFormatInvalid = -1,

  // UNorm8 - a 1-byte value representing a float between 0 and 1.
  // float value = (unorm / 255.0f);
  HioFormatUNorm8 = 0,
  HioFormatUNorm8Vec2,
  HioFormatUNorm8Vec3,
  HioFormatUNorm8Vec4,

  // SNorm8 - a 1-byte value representing a float between -1 and 1.
  // float value = max(snorm / 127.0f, -1.0f);
  HioFormatSNorm8,
  HioFormatSNorm8Vec2,
  HioFormatSNorm8Vec3,
  HioFormatSNorm8Vec4,

  // Float16 - a 2-byte IEEE half-precision float.
  HioFormatFloat16,
  HioFormatFloat16Vec2,
  HioFormatFloat16Vec3,
  HioFormatFloat16Vec4,

  // Float32 - a 4-byte IEEE float.
  HioFormatFloat32,
  HioFormatFloat32Vec2,
  HioFormatFloat32Vec3,
  HioFormatFloat32Vec4,

  // Double64 - a 8-byte IEEE double.
  HioFormatDouble64,
  HioFormatDouble64Vec2,
  HioFormatDouble64Vec3,
  HioFormatDouble64Vec4,

  // UInt16 - a 2-byte unsigned short integer.
  HioFormatUInt16,
  HioFormatUInt16Vec2,
  HioFormatUInt16Vec3,
  HioFormatUInt16Vec4,

  // Int16 - a 2-byte signed short integer.
  HioFormatInt16,
  HioFormatInt16Vec2,
  HioFormatInt16Vec3,
  HioFormatInt16Vec4,

  // UInt32 - a 4-byte unsigned integer.
  HioFormatUInt32,
  HioFormatUInt32Vec2,
  HioFormatUInt32Vec3,
  HioFormatUInt32Vec4,

  // Int32 - a 4-byte signed integer.
  HioFormatInt32,
  HioFormatInt32Vec2,
  HioFormatInt32Vec3,
  HioFormatInt32Vec4,

  // UNorm8 SRGB - a 1-byte value representing a float between 0 and 1.
  HioFormatUNorm8srgb,
  HioFormatUNorm8Vec2srgb,
  HioFormatUNorm8Vec3srgb,
  HioFormatUNorm8Vec4srgb,

  // BPTC compressed. 3-component, 4x4 blocks, signed floating-point
  HioFormatBC6FloatVec3,

  // BPTC compressed. 3-component, 4x4 blocks, unsigned floating-point
  HioFormatBC6UFloatVec3,

  // BPTC compressed. 4-component, 4x4 blocks, unsigned byte.
  // Representing a float between 0 and 1.
  HioFormatBC7UNorm8Vec4,

  // BPTC compressed. 4-component, 4x4 blocks, unsigned byte, sRGB.
  // Representing a float between 0 and 1.
  HioFormatBC7UNorm8Vec4srgb,

  // S3TC/DXT compressed. 4-component, 4x4 blocks, unsigned byte
  // Representing a float between 0 and 1.
  HioFormatBC1UNorm8Vec4,

  // S3TC/DXT compressed. 4-component, 4x4 blocks, unsigned byte
  // Representing a float between 0 and 1.
  HioFormatBC3UNorm8Vec4,

  HioFormatCount,
}

/** types.h:116-125. Available texture sampling dimensions. */
export enum HioAddressDimension {
  HioAddressDimensionU,
  HioAddressDimensionV,
  HioAddressDimensionW,
}

/** types.h:127-138. Various modes used during sampling of a texture. */
export enum HioAddressMode {
  HioAddressModeClampToEdge = 0,
  HioAddressModeMirrorClampToEdge,
  HioAddressModeRepeat,
  HioAddressModeMirrorRepeat,
  HioAddressModeClampToBorderColor,
}

/** types.h:140-158. Various color channel representation formats (documented
 *  upstream as "HioColorChannelType"; the enum itself is HioType). */
export enum HioType {
  HioTypeUnsignedByte,
  HioTypeUnsignedByteSRGB,
  HioTypeSignedByte,
  HioTypeUnsignedShort,
  HioTypeSignedShort,
  HioTypeUnsignedInt,
  HioTypeInt,
  HioTypeHalfFloat,
  HioTypeFloat,
  HioTypeDouble,

  HioTypeCount,
}

const F = HioFormat
const T = HioType

/** types.cpp:20-30 (_CompileTimeValidateHioFormatSwitch static_assert),
 *  checked at module load. */
if (!(F.HioFormatCount === 46 &&
      F.HioFormatUNorm8 === 0 &&
      F.HioFormatFloat32 === 12 &&
      F.HioFormatUInt32 === 28 &&
      F.HioFormatBC6FloatVec3 === 40 &&
      F.HioFormatBC1UNorm8Vec4 === 44)) {
  throw new Error('switch in HioTypes out of sync with HioFormat enum')
}

/** types.cpp:32-53. Indexed by HioType, then by channel count - 1. Upstream
 *  lists rows in this order irrespective of the HioType enum order; kept
 *  verbatim. */
const _hioFormats: readonly (readonly HioFormat[])[] = [
  [F.HioFormatUNorm8, F.HioFormatUNorm8Vec2,
    F.HioFormatUNorm8Vec3, F.HioFormatUNorm8Vec4],
  [F.HioFormatUNorm8srgb, F.HioFormatUNorm8Vec2srgb,
    F.HioFormatUNorm8Vec3srgb, F.HioFormatUNorm8Vec4srgb],
  [F.HioFormatSNorm8, F.HioFormatSNorm8Vec2,
    F.HioFormatSNorm8Vec3, F.HioFormatSNorm8Vec4],
  [F.HioFormatUInt16, F.HioFormatUInt16Vec2,
    F.HioFormatUInt16Vec3, F.HioFormatUInt16Vec4],
  [F.HioFormatInt16, F.HioFormatInt16Vec2,
    F.HioFormatInt16Vec3, F.HioFormatInt16Vec4],
  [F.HioFormatUInt32, F.HioFormatUInt32Vec2,
    F.HioFormatUInt32Vec3, F.HioFormatUInt32Vec4],
  [F.HioFormatInt32, F.HioFormatInt32Vec2,
    F.HioFormatInt32Vec3, F.HioFormatInt32Vec4],
  [F.HioFormatFloat16, F.HioFormatFloat16Vec2,
    F.HioFormatFloat16Vec3, F.HioFormatFloat16Vec4],
  [F.HioFormatFloat32, F.HioFormatFloat32Vec2,
    F.HioFormatFloat32Vec3, F.HioFormatFloat32Vec4],
  [F.HioFormatDouble64, F.HioFormatDouble64Vec2,
    F.HioFormatDouble64Vec3, F.HioFormatDouble64Vec4],
]

// types.cpp:55-58 static_assert.
if (_hioFormats.length !== T.HioTypeCount) {
  throw new Error('_hioFormats array in HioUtils out of sync with ' +
    'HioColorChannelType enum')
}

/** types.h:160-164, types.cpp:60-80. Returns the HioFormat of containing
 *  nChannels of HioType type. */
export function HioGetFormat(
  nchannels: number,
  type: HioType,
  isSRGB: boolean,
): HioFormat {
  // uint32_t / enum compare: negative values are out of range too.
  if (type >= T.HioTypeCount || type < 0) {
    TF_CODING_ERROR('Invalid type')
    return F.HioFormatInvalid
  }

  if (nchannels === 0 || nchannels > 4 || nchannels < 0) {
    TF_CODING_ERROR('Invalid channel count')
    return F.HioFormatInvalid
  }

  if (isSRGB && type === T.HioTypeUnsignedByte) {
    type = T.HioTypeUnsignedByteSRGB
  }

  return _hioFormats[type]![nchannels - 1]!
}

/** types.h:166-168, types.cpp:82-160. Return the HioType corresponding to the
 *  given HioFormat. */
export function HioGetHioType(format: HioFormat): HioType {
  switch (format) {
    case F.HioFormatUNorm8:
    case F.HioFormatUNorm8Vec2:
    case F.HioFormatUNorm8Vec3:
    case F.HioFormatUNorm8Vec4:

    case F.HioFormatUNorm8srgb:
    case F.HioFormatUNorm8Vec2srgb:
    case F.HioFormatUNorm8Vec3srgb:
    case F.HioFormatUNorm8Vec4srgb:

    case F.HioFormatBC7UNorm8Vec4:
    case F.HioFormatBC7UNorm8Vec4srgb:
    case F.HioFormatBC1UNorm8Vec4:
    case F.HioFormatBC3UNorm8Vec4:
      return T.HioTypeUnsignedByte

    case F.HioFormatSNorm8:
    case F.HioFormatSNorm8Vec2:
    case F.HioFormatSNorm8Vec3:
    case F.HioFormatSNorm8Vec4:
      return T.HioTypeSignedByte

    case F.HioFormatFloat16:
    case F.HioFormatFloat16Vec2:
    case F.HioFormatFloat16Vec3:
    case F.HioFormatFloat16Vec4:
      return T.HioTypeHalfFloat

    case F.HioFormatFloat32:
    case F.HioFormatFloat32Vec2:
    case F.HioFormatFloat32Vec3:
    case F.HioFormatFloat32Vec4:

    case F.HioFormatBC6FloatVec3:
    case F.HioFormatBC6UFloatVec3:
      return T.HioTypeFloat

    case F.HioFormatDouble64:
    case F.HioFormatDouble64Vec2:
    case F.HioFormatDouble64Vec3:
    case F.HioFormatDouble64Vec4:
      return T.HioTypeDouble

    case F.HioFormatUInt16:
    case F.HioFormatUInt16Vec2:
    case F.HioFormatUInt16Vec3:
    case F.HioFormatUInt16Vec4:
      return T.HioTypeUnsignedShort

    case F.HioFormatInt16:
    case F.HioFormatInt16Vec2:
    case F.HioFormatInt16Vec3:
    case F.HioFormatInt16Vec4:
      return T.HioTypeSignedShort

    case F.HioFormatUInt32:
    case F.HioFormatUInt32Vec2:
    case F.HioFormatUInt32Vec3:
    case F.HioFormatUInt32Vec4:
      return T.HioTypeUnsignedInt

    case F.HioFormatInt32:
    case F.HioFormatInt32Vec2:
    case F.HioFormatInt32Vec3:
    case F.HioFormatInt32Vec4:
      return T.HioTypeInt

    case F.HioFormatInvalid:
    case F.HioFormatCount:
      TF_CODING_ERROR('Unsupported HioFormat')
      return T.HioTypeUnsignedByte
  }
  TF_CODING_ERROR('Missing Format')
  return T.HioTypeUnsignedByte
}

/** types.h:170-172, types.cpp:162-223. Return the count of components
 *  (channels) in the given HioFormat. */
export function HioGetComponentCount(format: HioFormat): number {
  switch (format) {
    case F.HioFormatUNorm8:
    case F.HioFormatSNorm8:
    case F.HioFormatFloat16:
    case F.HioFormatFloat32:
    case F.HioFormatDouble64:
    case F.HioFormatUInt16:
    case F.HioFormatInt16:
    case F.HioFormatUInt32:
    case F.HioFormatInt32:
    case F.HioFormatUNorm8srgb:
      return 1
    case F.HioFormatUNorm8Vec2:
    case F.HioFormatSNorm8Vec2:
    case F.HioFormatFloat16Vec2:
    case F.HioFormatFloat32Vec2:
    case F.HioFormatDouble64Vec2:
    case F.HioFormatUInt16Vec2:
    case F.HioFormatInt16Vec2:
    case F.HioFormatUInt32Vec2:
    case F.HioFormatInt32Vec2:
    case F.HioFormatUNorm8Vec2srgb:
      return 2
    case F.HioFormatUNorm8Vec3:
    case F.HioFormatSNorm8Vec3:
    case F.HioFormatFloat16Vec3:
    case F.HioFormatFloat32Vec3:
    case F.HioFormatDouble64Vec3:
    case F.HioFormatUInt16Vec3:
    case F.HioFormatInt16Vec3:
    case F.HioFormatUInt32Vec3:
    case F.HioFormatInt32Vec3:
    case F.HioFormatUNorm8Vec3srgb:
    case F.HioFormatBC6FloatVec3:
    case F.HioFormatBC6UFloatVec3:
      return 3
    case F.HioFormatUNorm8Vec4:
    case F.HioFormatSNorm8Vec4:
    case F.HioFormatFloat16Vec4:
    case F.HioFormatFloat32Vec4:
    case F.HioFormatDouble64Vec4:
    case F.HioFormatUInt16Vec4:
    case F.HioFormatInt16Vec4:
    case F.HioFormatUInt32Vec4:
    case F.HioFormatInt32Vec4:
    case F.HioFormatUNorm8Vec4srgb:
    case F.HioFormatBC7UNorm8Vec4:
    case F.HioFormatBC7UNorm8Vec4srgb:
    case F.HioFormatBC1UNorm8Vec4:
    case F.HioFormatBC3UNorm8Vec4:
      return 4
    case F.HioFormatInvalid:
    case F.HioFormatCount:
      TF_CODING_ERROR('Unsupported format')
      return 1
  }
  TF_CODING_ERROR('Missing Format')
  return 1
}

/** types.h:178-180, types.cpp:225-248. Return the size in bytes for a
 *  component (channel) in the given HioType.
 *
 *  Upstream overloads HioGetDataSizeOfType on HioFormat and HioType; both are
 *  plain numbers at runtime here, so this name takes the HioType overload and
 *  the HioFormat overload is HioGetDataSizeOfTypeFromFormat. */
export function HioGetDataSizeOfType(type: HioType): number {
  switch (type) {
    case T.HioTypeCount:
      return 0
    case T.HioTypeUnsignedByte:
    case T.HioTypeSignedByte:
    case T.HioTypeUnsignedByteSRGB:
      return 1
    case T.HioTypeUnsignedShort:
    case T.HioTypeSignedShort:
    case T.HioTypeHalfFloat:
      return 2
    case T.HioTypeUnsignedInt:
    case T.HioTypeInt:
    case T.HioTypeFloat:
      return 4
    case T.HioTypeDouble:
      return 8
  }
  TF_CODING_ERROR('Missing Format')
  return 1
}

/** types.h:174-176, types.cpp:250-254. HioGetDataSizeOfType(HioFormat)
 *  overload: size in bytes for a component (channel) in the given format. */
export function HioGetDataSizeOfTypeFromFormat(format: HioFormat): number {
  return HioGetDataSizeOfType(HioGetHioType(format))
}

/** Output parameters of HioGetDataSizeOfFormat (`size_t *blockWidth`,
 *  `size_t *blockHeight`); pass an object to receive them. */
export interface HioBlockSize {
  blockWidth: number
  blockHeight: number
}

/** types.h:182-186, types.cpp:256-349. Returns the size of bytes per pixel
 *  for the given HioFormat. */
export function HioGetDataSizeOfFormat(
  format: HioFormat,
  blockSize?: HioBlockSize,
): number {
  if (blockSize) {
    blockSize.blockWidth = 1
    blockSize.blockHeight = 1
  }

  switch (format) {
    case F.HioFormatUNorm8:
    case F.HioFormatSNorm8:
    case F.HioFormatUNorm8srgb:
      return 1
    case F.HioFormatUNorm8Vec2:
    case F.HioFormatSNorm8Vec2:
    case F.HioFormatUNorm8Vec2srgb:
      return 2
    case F.HioFormatUNorm8Vec3:
    case F.HioFormatSNorm8Vec3:
    case F.HioFormatUNorm8Vec3srgb:
      return 3
    case F.HioFormatUNorm8Vec4:
    case F.HioFormatSNorm8Vec4:
    case F.HioFormatUNorm8Vec4srgb:
      return 4

    case F.HioFormatFloat16:
    case F.HioFormatUInt16:
    case F.HioFormatInt16:
      return 2
    case F.HioFormatFloat16Vec2:
    case F.HioFormatUInt16Vec2:
    case F.HioFormatInt16Vec2:
      return 4
    case F.HioFormatFloat16Vec3:
    case F.HioFormatUInt16Vec3:
    case F.HioFormatInt16Vec3:
      return 6
    case F.HioFormatFloat16Vec4:
    case F.HioFormatUInt16Vec4:
    case F.HioFormatInt16Vec4:
      return 8

    case F.HioFormatFloat32:
    case F.HioFormatUInt32:
    case F.HioFormatInt32:
      return 4
    case F.HioFormatFloat32Vec2:
    case F.HioFormatUInt32Vec2:
    case F.HioFormatInt32Vec2:
      return 8
    case F.HioFormatFloat32Vec3:
    case F.HioFormatUInt32Vec3:
    case F.HioFormatInt32Vec3:
      return 12
    case F.HioFormatFloat32Vec4:
    case F.HioFormatUInt32Vec4:
    case F.HioFormatInt32Vec4:
      return 16

    case F.HioFormatDouble64:
      return 8
    case F.HioFormatDouble64Vec2:
      return 16
    case F.HioFormatDouble64Vec3:
      return 24
    case F.HioFormatDouble64Vec4:
      return 32

    case F.HioFormatBC6FloatVec3:
    case F.HioFormatBC6UFloatVec3:
    case F.HioFormatBC7UNorm8Vec4:
    case F.HioFormatBC7UNorm8Vec4srgb:
    case F.HioFormatBC1UNorm8Vec4:
    case F.HioFormatBC3UNorm8Vec4:
      if (blockSize) {
        blockSize.blockWidth = 4
        blockSize.blockHeight = 4
      }
      return 16
    case F.HioFormatInvalid:
    case F.HioFormatCount:
      TF_CODING_ERROR('Unsupported format')
      return 0
  }
  TF_CODING_ERROR('Missing Format')
  return 0
}

/** types.h:188-190, types.cpp:351-365. Return if the given format is
 *  compressed. */
export function HioIsCompressed(format: HioFormat): boolean {
  switch (format) {
    case F.HioFormatBC6FloatVec3:
    case F.HioFormatBC6UFloatVec3:
    case F.HioFormatBC7UNorm8Vec4:
    case F.HioFormatBC7UNorm8Vec4srgb:
    case F.HioFormatBC1UNorm8Vec4:
    case F.HioFormatBC3UNorm8Vec4:
      return true
    default:
      return false
  }
}

/** types.h:192-195, types.cpp:367-377. Calculate the byte size of texture.
 *  If compressed, takes block size into account. Integer division as
 *  upstream's size_t arithmetic. */
export function HioGetDataSize(
  hioFormat: HioFormat,
  dimensions: GfVec3i,
): number {
  const block: HioBlockSize = { blockWidth: 1, blockHeight: 1 }
  const bytesPerPixel = HioGetDataSizeOfFormat(hioFormat, block)
  const d = dimensions.data

  const numPixels =
    Math.floor((d[0]! + block.blockWidth - 1) / block.blockWidth) *
    Math.floor((d[1]! + block.blockHeight - 1) / block.blockHeight)
  return numPixels * bytesPerPixel * Math.max(1, d[2]!)
}
