// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/hgiConversions.cpp,
//  pxr/imaging/hdSt/hgiConversions.h
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/hgiConversions.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences: out-parameters of GetHgiMinAndMipFilter are returned as an
// object.

import type { Token as TfToken } from 'typescript-usd/tf'
import {
  BorderColor as HdBorderColor,
  CompareFunction as HdCompareFunction,
  Format as HdFormat,
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  ShaderTokens as HdShaderTokens,
  StencilOp as HdStencilOp,
  Type as HdType,
  Wrap as HdWrap,
} from 'typescript-usd/hd'
import {
  HgiBorderColor,
  HgiCompareFunction,
  HgiFormat,
  HgiMipFilter,
  HgiSamplerAddressMode,
  HgiSamplerFilter,
  HgiShaderStageBits,
  HgiStencilOp,
  type HgiShaderStage,
} from 'typescript-usd/hgi'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** hgiConversions.cpp:24-71 (FORMAT_DESC), indexed by HdFormat. */
const FORMAT_DESC: readonly HgiFormat[] = [
  HgiFormat.HgiFormatUNorm8,     // HdFormatUNorm8
  HgiFormat.HgiFormatUNorm8Vec2, // HdFormatUNorm8Vec2
  HgiFormat.HgiFormatInvalid,    // HdFormatUNorm8Vec3: unsupported by HgiFormat
  HgiFormat.HgiFormatUNorm8Vec4, // HdFormatUNorm8Vec4

  HgiFormat.HgiFormatSNorm8,
  HgiFormat.HgiFormatSNorm8Vec2,
  HgiFormat.HgiFormatInvalid,    // HdFormatSNorm8Vec3: unsupported by HgiFormat
  HgiFormat.HgiFormatSNorm8Vec4,

  HgiFormat.HgiFormatFloat16,
  HgiFormat.HgiFormatFloat16Vec2,
  HgiFormat.HgiFormatFloat16Vec3,
  HgiFormat.HgiFormatFloat16Vec4,

  HgiFormat.HgiFormatFloat32,
  HgiFormat.HgiFormatFloat32Vec2,
  HgiFormat.HgiFormatFloat32Vec3,
  HgiFormat.HgiFormatFloat32Vec4,

  HgiFormat.HgiFormatInt16,
  HgiFormat.HgiFormatInt16Vec2,
  HgiFormat.HgiFormatInt16Vec3,
  HgiFormat.HgiFormatInt16Vec4,

  HgiFormat.HgiFormatUInt16,
  HgiFormat.HgiFormatUInt16Vec2,
  HgiFormat.HgiFormatUInt16Vec3,
  HgiFormat.HgiFormatUInt16Vec4,

  HgiFormat.HgiFormatInt32,
  HgiFormat.HgiFormatInt32Vec2,
  HgiFormat.HgiFormatInt32Vec3,
  HgiFormat.HgiFormatInt32Vec4,

  HgiFormat.HgiFormatFloat32UInt8,
]

/** hgiConversions.cpp:88-125 (VERTEX_FORMAT_FROM_TYPE_DESC), indexed by
 *  HdType. */
const VERTEX_FORMAT_FROM_TYPE_DESC: readonly HgiFormat[] = [
  HgiFormat.HgiFormatInvalid, // HdTypeBool: unsupported by HgiFormat
  HgiFormat.HgiFormatInvalid, // HdTypeUInt8
  HgiFormat.HgiFormatUInt16,  // HdTypeUInt16
  HgiFormat.HgiFormatInvalid, // HdTypeInt8
  HgiFormat.HgiFormatInt16,   // HdTypeInt16

  HgiFormat.HgiFormatInt32,
  HgiFormat.HgiFormatInt32Vec2,
  HgiFormat.HgiFormatInt32Vec3,
  HgiFormat.HgiFormatInt32Vec4,

  HgiFormat.HgiFormatInvalid, // HdTypeUInt32
  HgiFormat.HgiFormatInvalid, // HdTypeUInt32Vec2
  HgiFormat.HgiFormatInvalid, // HdTypeUInt32Vec3
  HgiFormat.HgiFormatInvalid, // HdTypeUInt32Vec4

  HgiFormat.HgiFormatFloat32,
  HgiFormat.HgiFormatFloat32Vec2,
  HgiFormat.HgiFormatFloat32Vec3,
  HgiFormat.HgiFormatFloat32Vec4,
  HgiFormat.HgiFormatInvalid, // HdTypeFloatMat3
  HgiFormat.HgiFormatInvalid, // HdTypeFloatMat4

  HgiFormat.HgiFormatInvalid, // HdTypeDouble
  HgiFormat.HgiFormatInvalid, // HdTypeDoubleVec2
  HgiFormat.HgiFormatInvalid, // HdTypeDoubleVec3
  HgiFormat.HgiFormatInvalid, // HdTypeDoubleVec4
  HgiFormat.HgiFormatInvalid, // HdTypeDoubleMat3
  HgiFormat.HgiFormatInvalid, // HdTypeDoubleMat4

  HgiFormat.HgiFormatFloat16,
  HgiFormat.HgiFormatFloat16Vec2,
  HgiFormat.HgiFormatFloat16Vec3,
  HgiFormat.HgiFormatFloat16Vec4,

  HgiFormat.HgiFormatPackedInt1010102, // HdTypeInt32_2_10_10_10_REV
]

/** hgiConversions.cpp:145-158 (WRAP_DESC), indexed by HdWrap. */
const WRAP_DESC: readonly HgiSamplerAddressMode[] = [
  HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge,       // HdWrapClamp
  HgiSamplerAddressMode.HgiSamplerAddressModeRepeat,            // HdWrapRepeat
  HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor, // HdWrapBlack
  HgiSamplerAddressMode.HgiSamplerAddressModeMirrorRepeat,      // HdWrapMirror
  HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor, // HdWrapNoOpinion
  HgiSamplerAddressMode.HgiSamplerAddressModeRepeat,            // HdWrapLegacyNoOpinionFallbackRepeat
]

/** hgiConversions.cpp:171-175 (MAG_DESC) */
const MAG_DESC: readonly HgiSamplerFilter[] = [
  HgiSamplerFilter.HgiSamplerFilterNearest,
  HgiSamplerFilter.HgiSamplerFilterLinear,
]

/** hgiConversions.cpp:193-207 (MIN_DESC) */
const MIN_DESC: readonly [HgiSamplerFilter, HgiMipFilter][] = [
  [HgiSamplerFilter.HgiSamplerFilterNearest, HgiMipFilter.HgiMipFilterNotMipmapped],
  [HgiSamplerFilter.HgiSamplerFilterLinear, HgiMipFilter.HgiMipFilterNotMipmapped],
  [HgiSamplerFilter.HgiSamplerFilterNearest, HgiMipFilter.HgiMipFilterNearest],
  [HgiSamplerFilter.HgiSamplerFilterLinear, HgiMipFilter.HgiMipFilterNearest],
  [HgiSamplerFilter.HgiSamplerFilterNearest, HgiMipFilter.HgiMipFilterLinear],
  [HgiSamplerFilter.HgiSamplerFilterLinear, HgiMipFilter.HgiMipFilterLinear],
]

/** hgiConversions.cpp:227-232 (BORDER_COLOR_DESC) */
const BORDER_COLOR_DESC: readonly HgiBorderColor[] = [
  HgiBorderColor.HgiBorderColorTransparentBlack,
  HgiBorderColor.HgiBorderColorOpaqueBlack,
  HgiBorderColor.HgiBorderColorOpaqueWhite,
]

/** hgiConversions.cpp:250-260 (_COMPARE_FUNCTION_DESC) */
const COMPARE_FUNCTION_DESC: readonly HgiCompareFunction[] = [
  HgiCompareFunction.HgiCompareFunctionNever,
  HgiCompareFunction.HgiCompareFunctionLess,
  HgiCompareFunction.HgiCompareFunctionEqual,
  HgiCompareFunction.HgiCompareFunctionLEqual,
  HgiCompareFunction.HgiCompareFunctionGreater,
  HgiCompareFunction.HgiCompareFunctionNotEqual,
  HgiCompareFunction.HgiCompareFunctionGEqual,
  HgiCompareFunction.HgiCompareFunctionAlways,
]

/** hgiConversions.cpp:276-286 (_STENCIL_OP_DESC) */
const STENCIL_OP_DESC: readonly HgiStencilOp[] = [
  HgiStencilOp.HgiStencilOpKeep,
  HgiStencilOp.HgiStencilOpZero,
  HgiStencilOp.HgiStencilOpReplace,
  HgiStencilOp.HgiStencilOpIncrementClamp,
  HgiStencilOp.HgiStencilOpIncrementWrap,
  HgiStencilOp.HgiStencilOpDecrementClamp,
  HgiStencilOp.HgiStencilOpDecrementWrap,
  HgiStencilOp.HgiStencilOpInvert,
]

/** hgiConversions.h:23-63 */
export class HdStHgiConversions {
  /** hgiConversions.cpp:299-313 */
  static getHgiFormat(hdFormat: HdFormat): HgiFormat {
    if (hdFormat < 0 || hdFormat >= HdFormat.HdFormatCount) {
      TF_CODING_ERROR(`Unexpected HdFormat ${hdFormat}`)
      return HgiFormat.HgiFormatInvalid
    }
    const hgiFormat = FORMAT_DESC[hdFormat]!
    if (hgiFormat === HgiFormat.HgiFormatInvalid) {
      TF_CODING_ERROR('Unsupported format')
    }
    return hgiFormat
  }

  /** hgiConversions.cpp:315-330 */
  static getHgiVertexFormat(hdType: HdType): HgiFormat {
    if (hdType < 0 || hdType >= HdType.HdTypeCount) {
      TF_CODING_ERROR(`Unexpected HdType ${hdType}`)
      return HgiFormat.HgiFormatInvalid
    }
    const hgiFormat = VERTEX_FORMAT_FROM_TYPE_DESC[hdType]!
    if (hgiFormat === HgiFormat.HgiFormatInvalid) {
      TF_CODING_ERROR('Unsupported type')
    }
    return hgiFormat
  }

  /** hgiConversions.cpp:332-342 */
  static getHgiSamplerAddressMode(hdWrap: HdWrap): HgiSamplerAddressMode {
    if (hdWrap < 0 || hdWrap > HdWrap.HdWrapLegacyNoOpinionFallbackRepeat) {
      TF_CODING_ERROR(`Unexpected HdWrap ${hdWrap}`)
      return HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor
    }
    return WRAP_DESC[hdWrap]!
  }

  /** hgiConversions.cpp:344-352 */
  static getHgiMagFilter(hdMagFilter: HdMagFilter): HgiSamplerFilter {
    if (hdMagFilter < 0 || hdMagFilter > HdMagFilter.HdMagFilterLinear) {
      TF_CODING_ERROR(`Unexpected HdMagFilter ${hdMagFilter}`)
      return HgiSamplerFilter.HgiSamplerFilterLinear
    }
    return MAG_DESC[hdMagFilter]!
  }

  /** hgiConversions.cpp:354-368. Upstream falls through to the table lookup
   *  after reporting an out-of-range filter (reading past the table); here
   *  the fallback values it assigns first are returned. */
  static getHgiMinAndMipFilter(hdMinFilter: HdMinFilter):
    { hgiSamplerFilter: HgiSamplerFilter; hgiMipFilter: HgiMipFilter } {
    if (hdMinFilter < 0 || hdMinFilter > HdMinFilter.HdMinFilterLinearMipmapLinear) {
      TF_CODING_ERROR(`Unexpected HdMinFilter ${hdMinFilter}`)
      return {
        hgiSamplerFilter: HgiSamplerFilter.HgiSamplerFilterLinear,
        hgiMipFilter: HgiMipFilter.HgiMipFilterNotMipmapped,
      }
    }
    const [hgiSamplerFilter, hgiMipFilter] = MIN_DESC[hdMinFilter]!
    return { hgiSamplerFilter, hgiMipFilter }
  }

  /** hgiConversions.cpp:370-379 */
  static getHgiBorderColor(hdBorderColor: HdBorderColor): HgiBorderColor {
    if (hdBorderColor < 0 || hdBorderColor > HdBorderColor.HdBorderColorOpaqueWhite) {
      TF_CODING_ERROR(`Unexpected HdBorderColor ${hdBorderColor}`)
      return HgiBorderColor.HgiBorderColorTransparentBlack
    }
    return BORDER_COLOR_DESC[hdBorderColor]!
  }

  /** hgiConversions.cpp:381-390 */
  static getHgiCompareFunction(hdCompareFunc: HdCompareFunction): HgiCompareFunction {
    if (hdCompareFunc < 0 || hdCompareFunc >= HdCompareFunction.HdCmpFuncLast) {
      TF_CODING_ERROR(`Unexpected HdCompareFunction ${hdCompareFunc}`)
      return HgiCompareFunction.HgiCompareFunctionAlways
    }
    return COMPARE_FUNCTION_DESC[hdCompareFunc]!
  }

  /** hgiConversions.cpp:392-401 */
  static getHgiStencilOp(hdStencilOp: HdStencilOp): HgiStencilOp {
    if (hdStencilOp < 0 || hdStencilOp >= HdStencilOp.HdStencilOpLast) {
      TF_CODING_ERROR(`Unexpected HdStencilOp ${hdStencilOp}`)
      return HgiStencilOp.HgiStencilOpKeep
    }
    return STENCIL_OP_DESC[hdStencilOp]!
  }

  /** hgiConversions.cpp:403-424 */
  static getHgiShaderStage(hdShaderStage: TfToken): HgiShaderStage {
    const stages = new Map<string, HgiShaderStage>([
      [HdShaderTokens.vertexShader, HgiShaderStageBits.HgiShaderStageVertex],
      [HdShaderTokens.tessControlShader, HgiShaderStageBits.HgiShaderStageTessellationControl],
      [HdShaderTokens.tessEvalShader, HgiShaderStageBits.HgiShaderStageTessellationEval],
      [HdShaderTokens.geometryShader, HgiShaderStageBits.HgiShaderStageGeometry],
      [HdShaderTokens.fragmentShader, HgiShaderStageBits.HgiShaderStageFragment],
      [HdShaderTokens.postTessControlShader, HgiShaderStageBits.HgiShaderStagePostTessellationControl],
      [HdShaderTokens.postTessVertexShader, HgiShaderStageBits.HgiShaderStagePostTessellationVertex],
      [HdShaderTokens.computeShader, HgiShaderStageBits.HgiShaderStageCompute],
    ])
    const stage = stages.get(hdShaderStage)
    if (stage === undefined) {
      TF_CODING_ERROR(`Unexpected Shader Stage Token ${hdShaderStage}`)
      return HgiShaderStageBits.HgiShaderStageAll
    }
    return stage
  }
}
