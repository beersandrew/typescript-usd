// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/types.cpp,
//  pxr/imaging/hgi/types.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/types.{h,cpp} (OpenUSD 26.11.1).

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** types.h:28-114. HgiFormatUNorm8Vec3, HgiFormatSNorm8Vec3 and the
 *  8-bit sRGB formats other than Vec4 are absent upstream as well. */
export enum HgiFormat {
  HgiFormatInvalid = -1,

  // UNorm8 - a 1-byte value representing a float between 0 and 1.
  // float value = (unorm / 255.0f);
  HgiFormatUNorm8 = 0,
  HgiFormatUNorm8Vec2,
  /* HgiFormatUNorm8Vec3 */ // Unsupported Metal (MTLPixelFormat)
  HgiFormatUNorm8Vec4,

  // SNorm8 - a 1-byte value representing a float between -1 and 1.
  // float value = max(snorm / 127.0f, -1.0f);
  HgiFormatSNorm8,
  HgiFormatSNorm8Vec2,
  /* HgiFormatSNorm8Vec3 */ // Unsupported Metal (MTLPixelFormat)
  HgiFormatSNorm8Vec4,

  // Float16 - a 2-byte IEEE half-precision float.
  HgiFormatFloat16,
  HgiFormatFloat16Vec2,
  HgiFormatFloat16Vec3,
  HgiFormatFloat16Vec4,

  // Float32 - a 4-byte IEEE float.
  HgiFormatFloat32,
  HgiFormatFloat32Vec2,
  HgiFormatFloat32Vec3,
  HgiFormatFloat32Vec4,

  // Int16 - a 2-byte signed integer
  HgiFormatInt16,
  HgiFormatInt16Vec2,
  HgiFormatInt16Vec3,
  HgiFormatInt16Vec4,

  // UInt16 - a 2-byte unsigned integer
  HgiFormatUInt16,
  HgiFormatUInt16Vec2,
  HgiFormatUInt16Vec3,
  HgiFormatUInt16Vec4,

  // Int32 - a 4-byte signed integer
  HgiFormatInt32,
  HgiFormatInt32Vec2,
  HgiFormatInt32Vec3,
  HgiFormatInt32Vec4,

  // UNorm8 SRGB - a 1-byte value representing a float between 0 and 1.
  // Gamma compression/decompression happens during read/write.
  // Alpha component is linear.
  HgiFormatUNorm8Vec4srgb,

  // BPTC compressed. 3-component, 4x4 blocks, signed floating-point
  HgiFormatBC6FloatVec3,

  // BPTC compressed. 3-component, 4x4 blocks, unsigned floating-point
  HgiFormatBC6UFloatVec3,

  // BPTC compressed. 4-component, 4x4 blocks, unsigned byte.
  // Representing a float between 0 and 1.
  HgiFormatBC7UNorm8Vec4,

  // BPTC compressed. 4-component, 4x4 blocks, unsigned byte, sRGB.
  // Representing a float between 0 and 1.
  HgiFormatBC7UNorm8Vec4srgb,

  // S3TC/DXT compressed. 4-component, 4x4 blocks, unsigned byte
  // Representing a float between 0 and 1.
  HgiFormatBC1UNorm8Vec4,

  // S3TC/DXT compressed. 4-component, 4x4 blocks, unsigned byte
  // Representing a float between 0 and 1.
  HgiFormatBC3UNorm8Vec4,

  // Depth stencil format (Float32 can be used for just depth)
  HgiFormatFloat32UInt8,

  // Packed 32-bit value with four normalized signed two's complement
  // integer values arranged as 10 bits, 10 bits, 10 bits, and 2 bits.
  HgiFormatPackedInt1010102,

  HgiFormatCount,
}

const F = HgiFormat

// types.cpp:17-103 registers every HgiFormat with TF_ADD_ENUM_NAME. The
// TypeScript enum carries its own reverse mapping (HgiFormat[value] is the
// upstream name); this repo's TfEnum registry keys entries by bare value, so
// registering HgiFormat there would collide with other enums and is omitted.

/** types.h:119-127 */
export interface HgiMipInfo {
  /** Offset in bytes from start of texture data to start of mipmap. */
  byteOffset: number
  /** Dimensions of mipmap. */
  dimensions: GfVec3i
  /** size of (one layer if array of) mipmap. */
  byteSizePerLayer: number
}

/** types.cpp:105-157 */
export function HgiGetComponentCount(f: HgiFormat): number {
  switch (f) {
    case F.HgiFormatUNorm8:
    case F.HgiFormatSNorm8:
    case F.HgiFormatFloat16:
    case F.HgiFormatFloat32:
    case F.HgiFormatInt16:
    case F.HgiFormatUInt16:
    case F.HgiFormatInt32:
    case F.HgiFormatFloat32UInt8: // treat as a single component
      return 1
    case F.HgiFormatUNorm8Vec2:
    case F.HgiFormatSNorm8Vec2:
    case F.HgiFormatFloat16Vec2:
    case F.HgiFormatFloat32Vec2:
    case F.HgiFormatInt16Vec2:
    case F.HgiFormatUInt16Vec2:
    case F.HgiFormatInt32Vec2:
      return 2
    case F.HgiFormatFloat16Vec3:
    case F.HgiFormatFloat32Vec3:
    case F.HgiFormatInt16Vec3:
    case F.HgiFormatUInt16Vec3:
    case F.HgiFormatInt32Vec3:
    case F.HgiFormatBC6FloatVec3:
    case F.HgiFormatBC6UFloatVec3:
      return 3
    case F.HgiFormatUNorm8Vec4:
    case F.HgiFormatSNorm8Vec4:
    case F.HgiFormatFloat16Vec4:
    case F.HgiFormatFloat32Vec4:
    case F.HgiFormatInt16Vec4:
    case F.HgiFormatUInt16Vec4:
    case F.HgiFormatInt32Vec4:
    case F.HgiFormatBC7UNorm8Vec4:
    case F.HgiFormatBC7UNorm8Vec4srgb:
    case F.HgiFormatUNorm8Vec4srgb:
    case F.HgiFormatBC1UNorm8Vec4:
    case F.HgiFormatBC3UNorm8Vec4:
    case F.HgiFormatPackedInt1010102:
      return 4
    case F.HgiFormatCount:
    case F.HgiFormatInvalid:
      TF_CODING_ERROR('Invalid Format')
      return 0
  }
  TF_CODING_ERROR('Missing Format')
  return 0
}

/** Output parameters of HgiGetDataSizeOfFormat (`size_t *blockWidth`,
 *  `size_t *blockHeight`); pass an object to receive them. */
export interface HgiBlockSize {
  blockWidth: number
  blockHeight: number
}

/** types.cpp:159-237 */
export function HgiGetDataSizeOfFormat(
  f: HgiFormat,
  blockSize?: HgiBlockSize,
): number {
  if (blockSize) {
    blockSize.blockWidth = 1
    blockSize.blockHeight = 1
  }

  switch (f) {
    case F.HgiFormatUNorm8:
    case F.HgiFormatSNorm8:
      return 1
    case F.HgiFormatUNorm8Vec2:
    case F.HgiFormatSNorm8Vec2:
      return 2
    case F.HgiFormatUNorm8Vec4:
    case F.HgiFormatSNorm8Vec4:
    case F.HgiFormatUNorm8Vec4srgb:
      return 4
    case F.HgiFormatFloat16:
    case F.HgiFormatInt16:
    case F.HgiFormatUInt16:
      return 2
    case F.HgiFormatFloat16Vec2:
    case F.HgiFormatInt16Vec2:
    case F.HgiFormatUInt16Vec2:
      return 4
    case F.HgiFormatFloat16Vec3:
    case F.HgiFormatInt16Vec3:
    case F.HgiFormatUInt16Vec3:
      return 6
    case F.HgiFormatFloat16Vec4:
    case F.HgiFormatInt16Vec4:
    case F.HgiFormatUInt16Vec4:
      return 8
    case F.HgiFormatFloat32:
    case F.HgiFormatInt32:
      return 4
    case F.HgiFormatPackedInt1010102:
      return 4
    case F.HgiFormatFloat32Vec2:
    case F.HgiFormatInt32Vec2:
    case F.HgiFormatFloat32UInt8: // XXX: implementation dependent
      return 8
    case F.HgiFormatFloat32Vec3:
    case F.HgiFormatInt32Vec3:
      return 12
    case F.HgiFormatFloat32Vec4:
    case F.HgiFormatInt32Vec4:
      return 16
    case F.HgiFormatBC6FloatVec3:
    case F.HgiFormatBC6UFloatVec3:
    case F.HgiFormatBC7UNorm8Vec4:
    case F.HgiFormatBC7UNorm8Vec4srgb:
    case F.HgiFormatBC1UNorm8Vec4:
    case F.HgiFormatBC3UNorm8Vec4:
      if (blockSize) {
        blockSize.blockWidth = 4
        blockSize.blockHeight = 4
      }
      return 16
    case F.HgiFormatCount:
    case F.HgiFormatInvalid:
      TF_CODING_ERROR('Invalid Format')
      return 0
  }
  TF_CODING_ERROR('Missing Format')
  return 0
}

/** types.cpp:239-253 */
export function HgiIsCompressed(f: HgiFormat): boolean {
  switch (f) {
    case F.HgiFormatBC6FloatVec3:
    case F.HgiFormatBC6UFloatVec3:
    case F.HgiFormatBC7UNorm8Vec4:
    case F.HgiFormatBC7UNorm8Vec4srgb:
    case F.HgiFormatBC1UNorm8Vec4:
    case F.HgiFormatBC3UNorm8Vec4:
      return true
    default:
      return false
  }
}

/** types.cpp:255-268. Integer division as upstream's size_t arithmetic. */
export function HgiGetDataSize(format: HgiFormat, dimensions: GfVec3i): number {
  const block: HgiBlockSize = { blockWidth: 1, blockHeight: 1 }
  const bpt = HgiGetDataSizeOfFormat(format, block)
  const d = dimensions.data
  return Math.floor((d[0]! + block.blockWidth - 1) / block.blockWidth) *
    Math.floor((d[1]! + block.blockHeight - 1) / block.blockHeight) *
    Math.max(1, d[2]!) *
    bpt
}

/** types.cpp:270-328 */
export function HgiGetComponentBaseFormat(f: HgiFormat): HgiFormat {
  switch (f) {
    case F.HgiFormatUNorm8:
    case F.HgiFormatUNorm8Vec2:
    case F.HgiFormatUNorm8Vec4:
    case F.HgiFormatUNorm8Vec4srgb:
    case F.HgiFormatBC7UNorm8Vec4:
    case F.HgiFormatBC7UNorm8Vec4srgb:
    case F.HgiFormatBC1UNorm8Vec4:
    case F.HgiFormatBC3UNorm8Vec4:
      return F.HgiFormatUNorm8
    case F.HgiFormatSNorm8:
    case F.HgiFormatSNorm8Vec2:
    case F.HgiFormatSNorm8Vec4:
      return F.HgiFormatSNorm8
    case F.HgiFormatFloat16:
    case F.HgiFormatFloat16Vec2:
    case F.HgiFormatFloat16Vec3:
    case F.HgiFormatFloat16Vec4:
      return F.HgiFormatFloat16
    case F.HgiFormatInt16:
    case F.HgiFormatInt16Vec2:
    case F.HgiFormatInt16Vec3:
    case F.HgiFormatInt16Vec4:
      return F.HgiFormatInt16
    case F.HgiFormatUInt16:
    case F.HgiFormatUInt16Vec2:
    case F.HgiFormatUInt16Vec3:
    case F.HgiFormatUInt16Vec4:
      return F.HgiFormatUInt16
    case F.HgiFormatFloat32:
    case F.HgiFormatFloat32Vec2:
    case F.HgiFormatFloat32Vec3:
    case F.HgiFormatFloat32Vec4:
      return F.HgiFormatFloat32
    case F.HgiFormatInt32:
    case F.HgiFormatInt32Vec2:
    case F.HgiFormatInt32Vec3:
    case F.HgiFormatInt32Vec4:
      return F.HgiFormatInt32
    case F.HgiFormatFloat32UInt8:
      return F.HgiFormatFloat32UInt8
    case F.HgiFormatBC6FloatVec3:
      return F.HgiFormatBC6FloatVec3
    case F.HgiFormatBC6UFloatVec3:
      return F.HgiFormatBC6UFloatVec3
    case F.HgiFormatPackedInt1010102:
      return F.HgiFormatPackedInt1010102
    case F.HgiFormatCount:
    case F.HgiFormatInvalid:
      TF_CODING_ERROR('Invalid Format')
      return F.HgiFormatInvalid
  }
  TF_CODING_ERROR('Missing Format')
  return F.HgiFormatInvalid
}

/** types.cpp:330-355 */
export function HgiIsFloatFormat(f: HgiFormat): boolean {
  switch (HgiGetComponentBaseFormat(f)) {
    case F.HgiFormatUNorm8:
    case F.HgiFormatSNorm8:
    case F.HgiFormatFloat16:
    case F.HgiFormatFloat32:
    case F.HgiFormatFloat32UInt8: // Unclear
    case F.HgiFormatBC6FloatVec3:
    case F.HgiFormatBC6UFloatVec3:
    case F.HgiFormatPackedInt1010102:
      return true
    case F.HgiFormatInt16:
    case F.HgiFormatUInt16:
    case F.HgiFormatInt32:
      return false
    case F.HgiFormatInvalid:
      TF_CODING_ERROR('Invalid Format')
      return false
    default:
      TF_CODING_ERROR('Missing Format')
      return false
  }
}

/** types.cpp:357-371 */
function _ComputeNumMipLevels(dimensions: GfVec3i): number {
  const d = dimensions.data
  const dim = Math.max(d[0]!, d[1]!, d[2]!)

  for (let i = 1; i < 8 * 4 - 1; i++) {
    const powerTwo = 1 << i
    if (powerTwo > dim) {
      return i
    }
  }

  // Can never be reached, but compiler doesn't know that.
  return 1
}

/** types.cpp:373-409. `dataByteSize` defaults to
 *  std::numeric_limits<size_t>::max() (types.h:189). */
export function HgiGetMipInfos(
  format: HgiFormat,
  dimensions: GfVec3i,
  layerCount: number,
  dataByteSize = Number.MAX_SAFE_INTEGER,
): HgiMipInfo[] {
  const is2DArray = layerCount > 1
  if (is2DArray && dimensions.data[2] !== 1) {
    TF_CODING_ERROR('An array of 3D textures is invalid')
  }

  const numMips = _ComputeNumMipLevels(dimensions)

  const result: HgiMipInfo[] = []

  let byteOffset = 0
  let size = new GfVec3i(dimensions)

  for (let mipLevel = 0; mipLevel < numMips; mipLevel++) {
    const byteSize = HgiGetDataSize(format, size)

    result.push({ byteOffset, dimensions: new GfVec3i(size), byteSizePerLayer: byteSize })

    byteOffset += byteSize * layerCount
    if (byteOffset >= dataByteSize) {
      break
    }

    const s = size.data
    size = new GfVec3i(
      Math.max(Math.trunc(s[0]! / 2), 1),
      Math.max(Math.trunc(s[1]! / 2), 1),
      Math.max(Math.trunc(s[2]! / 2), 1))
  }

  return result
}
