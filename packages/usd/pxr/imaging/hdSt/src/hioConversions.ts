// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/hioConversions.cpp,
//  pxr/imaging/hdSt/hioConversions.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/hioConversions.{h,cpp} (OpenUSD 26.11.1).

import { Format as HdFormat } from 'typescript-usd/hd'
import { HioFormat } from 'typescript-usd/hio'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** hioConversions.cpp:12-15 */
interface _FormatDesc {
  hdFormat: HdFormat
  hioFormat: HioFormat
}

/** hioConversions.cpp:17-55 */
const FORMAT_DESC: readonly _FormatDesc[] = [
  { hdFormat: HdFormat.HdFormatUNorm8, hioFormat: HioFormat.HioFormatUNorm8 },
  { hdFormat: HdFormat.HdFormatUNorm8Vec2, hioFormat: HioFormat.HioFormatUNorm8Vec2 },
  { hdFormat: HdFormat.HdFormatUNorm8Vec3, hioFormat: HioFormat.HioFormatUNorm8Vec3 },
  { hdFormat: HdFormat.HdFormatUNorm8Vec4, hioFormat: HioFormat.HioFormatUNorm8Vec4 },

  { hdFormat: HdFormat.HdFormatSNorm8, hioFormat: HioFormat.HioFormatSNorm8 },
  { hdFormat: HdFormat.HdFormatSNorm8Vec2, hioFormat: HioFormat.HioFormatSNorm8Vec2 },
  { hdFormat: HdFormat.HdFormatSNorm8Vec3, hioFormat: HioFormat.HioFormatSNorm8Vec3 },
  { hdFormat: HdFormat.HdFormatSNorm8Vec4, hioFormat: HioFormat.HioFormatSNorm8Vec4 },

  { hdFormat: HdFormat.HdFormatFloat16, hioFormat: HioFormat.HioFormatFloat16 },
  { hdFormat: HdFormat.HdFormatFloat16Vec2, hioFormat: HioFormat.HioFormatFloat16Vec2 },
  { hdFormat: HdFormat.HdFormatFloat16Vec3, hioFormat: HioFormat.HioFormatFloat16Vec3 },
  { hdFormat: HdFormat.HdFormatFloat16Vec4, hioFormat: HioFormat.HioFormatFloat16Vec4 },

  { hdFormat: HdFormat.HdFormatFloat32, hioFormat: HioFormat.HioFormatFloat32 },
  { hdFormat: HdFormat.HdFormatFloat32Vec2, hioFormat: HioFormat.HioFormatFloat32Vec2 },
  { hdFormat: HdFormat.HdFormatFloat32Vec3, hioFormat: HioFormat.HioFormatFloat32Vec3 },
  { hdFormat: HdFormat.HdFormatFloat32Vec4, hioFormat: HioFormat.HioFormatFloat32Vec4 },

  { hdFormat: HdFormat.HdFormatInt16, hioFormat: HioFormat.HioFormatInt16 },
  { hdFormat: HdFormat.HdFormatInt16Vec2, hioFormat: HioFormat.HioFormatInt16Vec2 },
  { hdFormat: HdFormat.HdFormatInt16Vec3, hioFormat: HioFormat.HioFormatInt16Vec3 },
  { hdFormat: HdFormat.HdFormatInt16Vec4, hioFormat: HioFormat.HioFormatInt16Vec4 },

  { hdFormat: HdFormat.HdFormatUInt16, hioFormat: HioFormat.HioFormatUInt16 },
  { hdFormat: HdFormat.HdFormatUInt16Vec2, hioFormat: HioFormat.HioFormatUInt16Vec2 },
  { hdFormat: HdFormat.HdFormatUInt16Vec3, hioFormat: HioFormat.HioFormatUInt16Vec3 },
  { hdFormat: HdFormat.HdFormatUInt16Vec4, hioFormat: HioFormat.HioFormatUInt16Vec4 },

  { hdFormat: HdFormat.HdFormatInt32, hioFormat: HioFormat.HioFormatInt32 },
  { hdFormat: HdFormat.HdFormatInt32Vec2, hioFormat: HioFormat.HioFormatInt32Vec2 },
  { hdFormat: HdFormat.HdFormatInt32Vec3, hioFormat: HioFormat.HioFormatInt32Vec3 },
  { hdFormat: HdFormat.HdFormatInt32Vec4, hioFormat: HioFormat.HioFormatInt32Vec4 },

  { hdFormat: HdFormat.HdFormatFloat32UInt8, hioFormat: HioFormat.HioFormatFloat32 },
]

/** hioConversions.h:21-31 */
export class HdStHioConversions {
  /** hioConversions.cpp:60-68 */
  static GetHioFormat(hdFormat: HdFormat): HioFormat {
    if ((hdFormat < 0) || (hdFormat >= HdFormat.HdFormatCount)) {
      TF_CODING_ERROR(`Unexpected HdFormat ${hdFormat}`)
      return HioFormat.HioFormatInvalid
    }
    return FORMAT_DESC[hdFormat]!.hioFormat
  }

  /** hioConversions.cpp:70-86 */
  static getHdFormat(hioFormat: HioFormat): HdFormat {
    if ((hioFormat < 0) || (hioFormat >= HioFormat.HioFormatCount)) {
      TF_CODING_ERROR(`Unexpected HioFormat ${hioFormat}`)
      return HdFormat.HdFormatInvalid
    }

    for (let i = 0; i < HdFormat.HdFormatCount; i++) {
      if (FORMAT_DESC[i]!.hioFormat === hioFormat) {
        return FORMAT_DESC[i]!.hdFormat
      }
    }

    TF_CODING_ERROR(`Unmapped HioFormat ${hioFormat}`)
    return HdFormat.HdFormatInvalid
  }
}
