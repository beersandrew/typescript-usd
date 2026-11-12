// Ported from OpenUSD 26.11.1: pxr/imaging/hd/subdivisionTagsSchema.cpp,
//  pxr/imaging/hd/subdivisionTagsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/subdivisionTagsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the SubdivisionTags entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream subdivisionTagsSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdFloatArrayDataSource, HdIntArrayDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { HdMeshSchema } from './meshSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** subdivisionTagsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdSubdivisionTagsSchemaTokens) */
export const HdSubdivisionTagsSchemaTokens = TfMakeTokens({
  subdivisionTags: 'subdivisionTags',
  faceVaryingLinearInterpolation: 'faceVaryingLinearInterpolation',
  interpolateBoundary: 'interpolateBoundary',
  triangleSubdivisionRule: 'triangleSubdivisionRule',
  cornerIndices: 'cornerIndices',
  cornerSharpnesses: 'cornerSharpnesses',
  creaseIndices: 'creaseIndices',
  creaseLengths: 'creaseLengths',
  creaseSharpnesses: 'creaseSharpnesses',
})

export class HdSubdivisionTagsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** subdivisionTagsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdSubdivisionTagsSchema {
    const ds = fromParentContainer?.Get(HdSubdivisionTagsSchemaTokens.subdivisionTags)
    return new HdSubdivisionTagsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getFaceVaryingLinearInterpolation(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdSubdivisionTagsSchemaTokens.faceVaryingLinearInterpolation)
  }

  getInterpolateBoundary(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdSubdivisionTagsSchemaTokens.interpolateBoundary)
  }

  getTriangleSubdivisionRule(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdSubdivisionTagsSchemaTokens.triangleSubdivisionRule)
  }

  getCornerIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdSubdivisionTagsSchemaTokens.cornerIndices)
  }

  getCornerSharpnesses(): HdFloatArrayDataSource | undefined {
    return this._getTypedDataSource<HdFloatArrayDataSource>(HdSubdivisionTagsSchemaTokens.cornerSharpnesses)
  }

  getCreaseIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdSubdivisionTagsSchemaTokens.creaseIndices)
  }

  getCreaseLengths(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdSubdivisionTagsSchemaTokens.creaseLengths)
  }

  getCreaseSharpnesses(): HdFloatArrayDataSource | undefined {
    return this._getTypedDataSource<HdFloatArrayDataSource>(HdSubdivisionTagsSchemaTokens.creaseSharpnesses)
  }

  static getSchemaToken(): TfToken {
    return HdSubdivisionTagsSchemaTokens.subdivisionTags
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdSubdivisionTagsSchema._defaultLocator ??= HdMeshSchema.getDefaultLocator().append(HdSubdivisionTagsSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    faceVaryingLinearInterpolation?: HdTokenDataSource | undefined,
    interpolateBoundary?: HdTokenDataSource | undefined,
    triangleSubdivisionRule?: HdTokenDataSource | undefined,
    cornerIndices?: HdIntArrayDataSource | undefined,
    cornerSharpnesses?: HdFloatArrayDataSource | undefined,
    creaseIndices?: HdIntArrayDataSource | undefined,
    creaseLengths?: HdIntArrayDataSource | undefined,
    creaseSharpnesses?: HdFloatArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdSubdivisionTagsSchemaTokens.faceVaryingLinearInterpolation]: faceVaryingLinearInterpolation,
      [HdSubdivisionTagsSchemaTokens.interpolateBoundary]: interpolateBoundary,
      [HdSubdivisionTagsSchemaTokens.triangleSubdivisionRule]: triangleSubdivisionRule,
      [HdSubdivisionTagsSchemaTokens.cornerIndices]: cornerIndices,
      [HdSubdivisionTagsSchemaTokens.cornerSharpnesses]: cornerSharpnesses,
      [HdSubdivisionTagsSchemaTokens.creaseIndices]: creaseIndices,
      [HdSubdivisionTagsSchemaTokens.creaseLengths]: creaseLengths,
      [HdSubdivisionTagsSchemaTokens.creaseSharpnesses]: creaseSharpnesses,
    })
  }
}

export namespace HdSubdivisionTagsSchema {
  /** HdSubdivisionTagsSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _faceVaryingLinearInterpolation: HdTokenDataSource | undefined
    private _interpolateBoundary: HdTokenDataSource | undefined
    private _triangleSubdivisionRule: HdTokenDataSource | undefined
    private _cornerIndices: HdIntArrayDataSource | undefined
    private _cornerSharpnesses: HdFloatArrayDataSource | undefined
    private _creaseIndices: HdIntArrayDataSource | undefined
    private _creaseLengths: HdIntArrayDataSource | undefined
    private _creaseSharpnesses: HdFloatArrayDataSource | undefined
    setFaceVaryingLinearInterpolation(faceVaryingLinearInterpolation: HdTokenDataSource | undefined): this {
      this._faceVaryingLinearInterpolation = faceVaryingLinearInterpolation
      return this
    }
    setInterpolateBoundary(interpolateBoundary: HdTokenDataSource | undefined): this {
      this._interpolateBoundary = interpolateBoundary
      return this
    }
    setTriangleSubdivisionRule(triangleSubdivisionRule: HdTokenDataSource | undefined): this {
      this._triangleSubdivisionRule = triangleSubdivisionRule
      return this
    }
    setCornerIndices(cornerIndices: HdIntArrayDataSource | undefined): this {
      this._cornerIndices = cornerIndices
      return this
    }
    setCornerSharpnesses(cornerSharpnesses: HdFloatArrayDataSource | undefined): this {
      this._cornerSharpnesses = cornerSharpnesses
      return this
    }
    setCreaseIndices(creaseIndices: HdIntArrayDataSource | undefined): this {
      this._creaseIndices = creaseIndices
      return this
    }
    setCreaseLengths(creaseLengths: HdIntArrayDataSource | undefined): this {
      this._creaseLengths = creaseLengths
      return this
    }
    setCreaseSharpnesses(creaseSharpnesses: HdFloatArrayDataSource | undefined): this {
      this._creaseSharpnesses = creaseSharpnesses
      return this
    }
    build(): HdContainerDataSource {
      return HdSubdivisionTagsSchema.buildRetained(
        this._faceVaryingLinearInterpolation,
        this._interpolateBoundary,
        this._triangleSubdivisionRule,
        this._cornerIndices,
        this._cornerSharpnesses,
        this._creaseIndices,
        this._creaseLengths,
        this._creaseSharpnesses,
      )
    }
  }
}
