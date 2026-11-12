// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/hgiConversions.cpp,
//  pxr/imaging/hdx/hgiConversions.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/hgiConversions.{h,cpp} (OpenUSD 26.11.1).

import { Format as HdFormat } from 'typescript-usd/hd'
import { HgiFormat } from 'typescript-usd/hgi'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** hgiConversions.cpp:12-15 */
interface _FormatDesc {
  hdFormat: HdFormat
  hgiFormat: HgiFormat
}

/** hgiConversions.cpp:17-57 */
const FORMAT_DESC: readonly _FormatDesc[] = [
  { hdFormat: HdFormat.HdFormatUNorm8, hgiFormat: HgiFormat.HgiFormatUNorm8 },
  { hdFormat: HdFormat.HdFormatUNorm8Vec2, hgiFormat: HgiFormat.HgiFormatUNorm8Vec2 },
  { hdFormat: HdFormat.HdFormatUNorm8Vec3, hgiFormat: HgiFormat.HgiFormatInvalid }, // Unsupported by HgiFormat
  { hdFormat: HdFormat.HdFormatUNorm8Vec4, hgiFormat: HgiFormat.HgiFormatUNorm8Vec4 },

  { hdFormat: HdFormat.HdFormatSNorm8, hgiFormat: HgiFormat.HgiFormatSNorm8 },
  { hdFormat: HdFormat.HdFormatSNorm8Vec2, hgiFormat: HgiFormat.HgiFormatSNorm8Vec2 },
  { hdFormat: HdFormat.HdFormatSNorm8Vec3, hgiFormat: HgiFormat.HgiFormatInvalid }, // Unsupported by HgiFormat
  { hdFormat: HdFormat.HdFormatSNorm8Vec4, hgiFormat: HgiFormat.HgiFormatSNorm8Vec4 },

  { hdFormat: HdFormat.HdFormatFloat16, hgiFormat: HgiFormat.HgiFormatFloat16 },
  { hdFormat: HdFormat.HdFormatFloat16Vec2, hgiFormat: HgiFormat.HgiFormatFloat16Vec2 },
  { hdFormat: HdFormat.HdFormatFloat16Vec3, hgiFormat: HgiFormat.HgiFormatFloat16Vec3 },
  { hdFormat: HdFormat.HdFormatFloat16Vec4, hgiFormat: HgiFormat.HgiFormatFloat16Vec4 },

  { hdFormat: HdFormat.HdFormatFloat32, hgiFormat: HgiFormat.HgiFormatFloat32 },
  { hdFormat: HdFormat.HdFormatFloat32Vec2, hgiFormat: HgiFormat.HgiFormatFloat32Vec2 },
  { hdFormat: HdFormat.HdFormatFloat32Vec3, hgiFormat: HgiFormat.HgiFormatFloat32Vec3 },
  { hdFormat: HdFormat.HdFormatFloat32Vec4, hgiFormat: HgiFormat.HgiFormatFloat32Vec4 },

  { hdFormat: HdFormat.HdFormatInt16, hgiFormat: HgiFormat.HgiFormatInt16 },
  { hdFormat: HdFormat.HdFormatInt16Vec2, hgiFormat: HgiFormat.HgiFormatInt16Vec2 },
  { hdFormat: HdFormat.HdFormatInt16Vec3, hgiFormat: HgiFormat.HgiFormatInt16Vec3 },
  { hdFormat: HdFormat.HdFormatInt16Vec4, hgiFormat: HgiFormat.HgiFormatInt16Vec4 },

  { hdFormat: HdFormat.HdFormatUInt16, hgiFormat: HgiFormat.HgiFormatUInt16 },
  { hdFormat: HdFormat.HdFormatUInt16Vec2, hgiFormat: HgiFormat.HgiFormatUInt16Vec2 },
  { hdFormat: HdFormat.HdFormatUInt16Vec3, hgiFormat: HgiFormat.HgiFormatUInt16Vec3 },
  { hdFormat: HdFormat.HdFormatUInt16Vec4, hgiFormat: HgiFormat.HgiFormatUInt16Vec4 },

  { hdFormat: HdFormat.HdFormatInt32, hgiFormat: HgiFormat.HgiFormatInt32 },
  { hdFormat: HdFormat.HdFormatInt32Vec2, hgiFormat: HgiFormat.HgiFormatInt32Vec2 },
  { hdFormat: HdFormat.HdFormatInt32Vec3, hgiFormat: HgiFormat.HgiFormatInt32Vec3 },
  { hdFormat: HdFormat.HdFormatInt32Vec4, hgiFormat: HgiFormat.HgiFormatInt32Vec4 },

  { hdFormat: HdFormat.HdFormatFloat32UInt8, hgiFormat: HgiFormat.HgiFormatFloat32UInt8 },
]

// hgiConversions.cpp:59-71 (the compile-time table validation).
if (FORMAT_DESC.length !== HdFormat.HdFormatCount ||
  FORMAT_DESC.some((d, i) => d.hdFormat !== i)) {
  throw new Error('_FormatDesc array out of sync with HdFormat/HgiFormat enum')
}

/** hgiConversions.h:16-30. Converts from Hd types to Hgi types. */
export class HdxHgiConversions {
  /** hgiConversions.cpp:73-83 */
  static getHgiFormat(hdFormat: HdFormat): HgiFormat {
    if (hdFormat < 0 || hdFormat >= HdFormat.HdFormatCount) {
      TF_CODING_ERROR(`Unexpected HdFormat ${hdFormat}`)
      return HgiFormat.HgiFormatInvalid
    }

    return FORMAT_DESC[hdFormat]!.hgiFormat
  }

  /** hgiConversions.cpp:85-100 */
  static getHdFormat(hgiFormat: HgiFormat): HdFormat {
    if (hgiFormat < 0 || hgiFormat >= HgiFormat.HgiFormatCount) {
      TF_CODING_ERROR(`Unexpected HgiFormat ${hgiFormat}`)
      return HdFormat.HdFormatInvalid
    }

    for (let i = 0; i < HdFormat.HdFormatCount; i++) {
      if (FORMAT_DESC[i]!.hgiFormat === hgiFormat) {
        return i as HdFormat
      }
    }

    TF_CODING_ERROR(`Unmapped HgiFormat ${hgiFormat}`)
    return HdFormat.HdFormatInvalid
  }
}
