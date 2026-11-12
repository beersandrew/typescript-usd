// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialParam.cpp,
//  pxr/imaging/hdSt/materialParam.h
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/materialParam.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: ComputeHash is a cache key only (materialParam.cpp:45-62), so a
// stable hash of the same fields is used.

import { Token as TfToken, HashCombine as TfHashCombine } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { GetValueTupleType as HdGetValueTupleType, type TupleType as HdTupleType } from 'typescript-usd/hd'
import { HdStTextureType } from './enums.ts'

/** HdSt_MaterialParam::ParamType (materialParam.h:30-54) */
export enum HdSt_MaterialParamParamType {
  // This is a shader specified fallback value that is
  // not connected to either a primvar or texture.
  ParamTypeFallback,
  // This is a parameter that is connected to a texture.
  ParamTypeTexture,
  // Creates an accessor HdGet_name() that either reads a
  // primvar with a potentially different name (given in
  // samplerCoords) if it exists or uses the fallback value.
  // It corresponds to a primvar reader shading node.
  ParamTypePrimvarRedirect,
  // Creates an accessor HdGet_name(vec3) that either reads
  // from a field texture with a potentially different name (given
  // in samplerCoords) if it exists or uses the fallback value.
  // It corresponds to a field reader shading node.
  ParamTypeFieldRedirect,
  // Additional primvar needed by material. One that is not connected to
  // a input parameter (ParamTypePrimvar).
  ParamTypeAdditionalPrimvar,
  // This is a parameter that is connected to a transform2d node
  ParamTypeTransform2d,
}

/** materialParam.h:24-117. Represents a material parameter. */
export class HdSt_MaterialParam {
  static readonly ParamTypeFallback = HdSt_MaterialParamParamType.ParamTypeFallback
  static readonly ParamTypeTexture = HdSt_MaterialParamParamType.ParamTypeTexture
  static readonly ParamTypePrimvarRedirect = HdSt_MaterialParamParamType.ParamTypePrimvarRedirect
  static readonly ParamTypeFieldRedirect = HdSt_MaterialParamParamType.ParamTypeFieldRedirect
  static readonly ParamTypeAdditionalPrimvar = HdSt_MaterialParamParamType.ParamTypeAdditionalPrimvar
  static readonly ParamTypeTransform2d = HdSt_MaterialParamParamType.ParamTypeTransform2d

  paramType: HdSt_MaterialParamParamType
  name: TfToken
  fallbackValue: VtValue
  samplerCoords: TfToken[]
  textureType: HdStTextureType
  swizzle: string
  isPremultiplied: boolean
  // If paramType is ParamTypeTexture, this indicates both if the textures
  // should be bound as an array of textures and the size of the array. If
  // arrayOfTexturesSize is 0, then do not bind as an array of textures, but
  // rather a single texture (whereas arrayOfTexturesSize = 1 indicates an
  // array of textures of size 1).
  arrayOfTexturesSize: number

  /** materialParam.cpp:15-44 (both constructors). */
  constructor(
    paramType: HdSt_MaterialParamParamType = HdSt_MaterialParamParamType.ParamTypeFallback,
    name: TfToken = TfToken(),
    fallbackValue: VtValue = VtValue.getEmpty(),
    samplerCoords: TfToken[] = [],
    textureType: HdStTextureType = HdStTextureType.Uv,
    swizzle = '',
    isPremultiplied = false,
    arrayOfTexturesSize = 0,
  ) {
    this.paramType = paramType
    this.name = name
    this.fallbackValue = fallbackValue
    this.samplerCoords = samplerCoords
    this.textureType = textureType
    this.swizzle = swizzle
    this.isPremultiplied = isPremultiplied
    this.arrayOfTexturesSize = arrayOfTexturesSize
  }

  /** materialParam.cpp:46-62 */
  static computeHash(params: readonly HdSt_MaterialParam[]): bigint {
    let hash = 0n
    for (const param of params) {
      hash = TfHashCombine(
        hash,
        param.paramType,
        param.name,
        param.samplerCoords,
        param.textureType,
        param.swizzle,
        param.isPremultiplied,
        param.arrayOfTexturesSize,
      )
    }
    return hash
  }

  /** materialParam.cpp:64-68 */
  getTupleType(): HdTupleType {
    return HdGetValueTupleType(this.fallbackValue)
  }

  /** materialParam.h:76-78 */
  isTexture(): boolean {
    return this.paramType === HdSt_MaterialParamParamType.ParamTypeTexture
  }
  /** materialParam.h:79-81 */
  isPrimvarRedirect(): boolean {
    return this.paramType === HdSt_MaterialParamParamType.ParamTypePrimvarRedirect
  }
  /** materialParam.h:82-84 */
  isFieldRedirect(): boolean {
    return this.paramType === HdSt_MaterialParamParamType.ParamTypeFieldRedirect
  }
  /** materialParam.h:85-87 */
  isFallback(): boolean {
    return this.paramType === HdSt_MaterialParamParamType.ParamTypeFallback
  }
  /** materialParam.h:88-90 */
  isAdditionalPrimvar(): boolean {
    return this.paramType === HdSt_MaterialParamParamType.ParamTypeAdditionalPrimvar
  }
  /** materialParam.h:91-93 */
  isTransform2d(): boolean {
    return this.paramType === HdSt_MaterialParamParamType.ParamTypeTransform2d
  }
  /** materialParam.h:94-96 */
  isArrayOfTextures(): boolean {
    return this.isTexture() && this.arrayOfTexturesSize > 0
  }
}
export type HdSt_MaterialParamVector = HdSt_MaterialParam[]
