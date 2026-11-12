// Ported from OpenUSD 26.11.1: pxr/imaging/hd/geomSubsetSchema.cpp,
//  pxr/imaging/hd/geomSubsetSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/geomSubsetSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the GeomSubset entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream geomSubsetSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdIntArrayDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** geomSubsetSchema.h TF_DECLARE_PUBLIC_TOKENS(HdGeomSubsetSchemaTokens) */
export const HdGeomSubsetSchemaTokens = TfMakeTokens({
  geomSubset: 'geomSubset',
  type: 'type',
  indices: 'indices',
  typeFaceSet: 'typeFaceSet',
  typePointSet: 'typePointSet',
  typeCurveSet: 'typeCurveSet',
})

export class HdGeomSubsetSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** geomSubsetSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdGeomSubsetSchema {
    const ds = fromParentContainer?.Get(HdGeomSubsetSchemaTokens.geomSubset)
    return new HdGeomSubsetSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdGeomSubsetSchemaTokens.type)
  }

  getIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdGeomSubsetSchemaTokens.indices)
  }

  static getSchemaToken(): TfToken {
    return HdGeomSubsetSchemaTokens.geomSubset
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdGeomSubsetSchema._defaultLocator ??= new HdDataSourceLocator(HdGeomSubsetSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    type?: HdTokenDataSource | undefined,
    indices?: HdIntArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdGeomSubsetSchemaTokens.type]: type,
      [HdGeomSubsetSchemaTokens.indices]: indices,
    })
  }

  private static _typeDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as type value; the values
   * typeFaceSet, typePointSet, typeCurveSet are stored statically and reused. */
  static buildTypeDataSource(type: string): HdTokenDataSource {
    const known: readonly string[] = [HdGeomSubsetSchemaTokens.typeFaceSet, HdGeomSubsetSchemaTokens.typePointSet, HdGeomSubsetSchemaTokens.typeCurveSet]
    if (known.includes(type)) {
      const cache = HdGeomSubsetSchema._typeDataSources ??= new Map()
      let ds = cache.get(type)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(type)
        cache.set(type, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(type)
  }
}

export namespace HdGeomSubsetSchema {
  /** HdGeomSubsetSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _type: HdTokenDataSource | undefined
    private _indices: HdIntArrayDataSource | undefined
    setType(type: HdTokenDataSource | undefined): this {
      this._type = type
      return this
    }
    setIndices(indices: HdIntArrayDataSource | undefined): this {
      this._indices = indices
      return this
    }
    build(): HdContainerDataSource {
      return HdGeomSubsetSchema.buildRetained(
        this._type,
        this._indices,
      )
    }
  }
}
