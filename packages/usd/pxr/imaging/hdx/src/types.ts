// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/types.cpp,
//  pxr/imaging/hdx/types.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/types.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences: operator== is Equals(); operator<< is not ported.

import type { Token as TfToken } from 'typescript-usd/tf'
import { Dictionary as VtDictionary } from 'typescript-usd/vt'
import { HgiFormat } from 'typescript-usd/hgi'
import { HioFormat } from 'typescript-usd/hio'

/** types.h:21-28. Struct used to send shader inputs from Presto and send
 *  them to Hydra. */
export class HdxShaderInputs {
  parameters = new VtDictionary()
  textures = new VtDictionary()
  textureFallbackValues = new VtDictionary()
  attributes: TfToken[] = []
  metaData = new VtDictionary()

  /** types.cpp:16-24 (operator==; metaData is not compared upstream). */
  Equals(rhs: HdxShaderInputs): boolean {
    const lhs = this
    return _DictEquals(lhs.parameters, rhs.parameters) &&
      _DictEquals(lhs.textures, rhs.textures) &&
      _DictEquals(lhs.textureFallbackValues, rhs.textureFallbackValues) &&
      lhs.attributes.length === rhs.attributes.length &&
      lhs.attributes.every((a, i) => a === rhs.attributes[i])
  }
}

function _DictEquals(a: VtDictionary, b: VtDictionary): boolean {
  return a.equals(b)
}

/** types.cpp:46-97 */
const FORMAT_DESC: readonly HioFormat[] = [
  HioFormat.HioFormatUNorm8, // UNorm8
  HioFormat.HioFormatUNorm8Vec2, // UNorm8Vec2
  // HioFormatUNormVec3,     // Unsupported by HgiFormat
  HioFormat.HioFormatUNorm8Vec4, // UNorm8Vec4

  HioFormat.HioFormatSNorm8, // SNorm8
  HioFormat.HioFormatSNorm8Vec2, // SNorm8Vec2
  // HioFormatSNorm8Vec3,    // Unsupported by HgiFormat
  HioFormat.HioFormatSNorm8Vec4, // SNorm8Vec4

  HioFormat.HioFormatFloat16, // Float16
  HioFormat.HioFormatFloat16Vec2, // Float16Vec2
  HioFormat.HioFormatFloat16Vec3, // Float16Vec3
  HioFormat.HioFormatFloat16Vec4, // Float16Vec4

  HioFormat.HioFormatFloat32, // Float32
  HioFormat.HioFormatFloat32Vec2, // Float32Vec2
  HioFormat.HioFormatFloat32Vec3, // Float32Vec3
  HioFormat.HioFormatFloat32Vec4, // Float32Vec4

  HioFormat.HioFormatInt16, // Int16
  HioFormat.HioFormatInt16Vec2, // Int16Vec2
  HioFormat.HioFormatInt16Vec3, // Int16Vec3
  HioFormat.HioFormatInt16Vec4, // Int16Vec4

  HioFormat.HioFormatUInt16, // UInt16
  HioFormat.HioFormatUInt16Vec2, // UInt16Vec2
  HioFormat.HioFormatUInt16Vec3, // UInt16Vec3
  HioFormat.HioFormatUInt16Vec4, // UInt16Vec4

  HioFormat.HioFormatInt32, // Int32
  HioFormat.HioFormatInt32Vec2, // Int32Vec2
  HioFormat.HioFormatInt32Vec3, // Int32Vec3
  HioFormat.HioFormatInt32Vec4, // Int32Vec4

  // HioFormatUNorm8Vec3srgb,     // Unsupported by HgiFormat
  HioFormat.HioFormatUNorm8Vec4srgb, // UNorm8Vec4sRGB,

  HioFormat.HioFormatBC6FloatVec3, // BC6FloatVec3
  HioFormat.HioFormatBC6UFloatVec3, // BC6UFloatVec3
  HioFormat.HioFormatBC7UNorm8Vec4, // BC7UNorm8Vec4
  HioFormat.HioFormatBC7UNorm8Vec4srgb, // BC7UNorm8Vec4srgb
  HioFormat.HioFormatBC1UNorm8Vec4, // BC1UNorm8Vec4
  HioFormat.HioFormatBC3UNorm8Vec4, // BC3UNorm8Vec4

  HioFormat.HioFormatFloat32, // HdFormatFloat32UInt8

  HioFormat.HioFormatInt32, // PackedInt1010102
]

// types.cpp:99-113 (the compile-time table validation).
if (FORMAT_DESC.length !== HgiFormat.HgiFormatCount ||
  HgiFormat.HgiFormatUNorm8 !== 0 ||
  HgiFormat.HgiFormatFloat16Vec4 !== 9 ||
  HgiFormat.HgiFormatFloat32Vec4 !== 13 ||
  HgiFormat.HgiFormatUInt16Vec4 !== 21 ||
  HgiFormat.HgiFormatInt32Vec4 !== 25 ||
  HgiFormat.HgiFormatUNorm8Vec4srgb !== 26 ||
  HgiFormat.HgiFormatBC3UNorm8Vec4 !== 32) {
  throw new Error('_FormatDesc array out of sync with HgiFormat enum')
}

/** types.cpp:115-118. Returns the HioFormat for the given HgiFormat. */
export function HdxGetHioFormat(hgiFormat: HgiFormat): HioFormat {
  return FORMAT_DESC[hgiFormat]!
}
