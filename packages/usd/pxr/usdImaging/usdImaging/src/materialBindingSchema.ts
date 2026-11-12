// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/materialBindingSchema.cpp,
//  pxr/usdImaging/usdImaging/materialBindingSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/materialBindingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialBinding entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialBindingSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type VectorDataSource as HdVectorDataSource, VectorOfSchemasSchema as HdVectorOfSchemasSchema } from 'typescript-usd/hd'
import { UsdImagingCollectionMaterialBindingSchema } from './collectionMaterialBindingSchema.ts'
import { UsdImagingDirectMaterialBindingSchema } from './directMaterialBindingSchema.ts'

// --(BEGIN CUSTOM CODE: Declares)--
/** materialBindingSchema.h:31-32 `using UsdImagingCollectionMaterialBindingVectorSchema =
 *  HdVectorOfSchemasSchema<class UsdImagingCollectionMaterialBindingSchema>;` */
export class UsdImagingCollectionMaterialBindingVectorSchema
  extends HdVectorOfSchemasSchema<UsdImagingCollectionMaterialBindingSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, UsdImagingCollectionMaterialBindingSchema) }
}
// --(END CUSTOM CODE: Declares)--

/** materialBindingSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingMaterialBindingSchemaTokens) */
export const UsdImagingMaterialBindingSchemaTokens = TfMakeTokens({
  usdMaterialBinding: 'usdMaterialBinding',
  directMaterialBinding: 'directMaterialBinding',
  collectionMaterialBindings: 'collectionMaterialBindings',
})

/**
 * The UsdImagingMaterialBindingSchema specifies a container for a prim's
 * material bindings for a particular purpose. Note that only one direct
 * binding but any number of collection-based bindings may be declared for a
 * given purpose. See UsdImagingMaterialBindingsSchema which specifies the
 * purposes and their associated bindings.
 */
export class UsdImagingMaterialBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** materialBindingSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingMaterialBindingSchema {
    const ds = fromParentContainer?.Get(UsdImagingMaterialBindingSchemaTokens.usdMaterialBinding)
    return new UsdImagingMaterialBindingSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getDirectMaterialBinding(): UsdImagingDirectMaterialBindingSchema {
    return new UsdImagingDirectMaterialBindingSchema(this._getContainerDataSource(UsdImagingMaterialBindingSchemaTokens.directMaterialBinding))
  }

  getCollectionMaterialBindings(): UsdImagingCollectionMaterialBindingVectorSchema {
    return new UsdImagingCollectionMaterialBindingVectorSchema(this._getVectorDataSource(UsdImagingMaterialBindingSchemaTokens.collectionMaterialBindings))
  }

  static getSchemaToken(): TfToken {
    return UsdImagingMaterialBindingSchemaTokens.usdMaterialBinding
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingMaterialBindingSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingMaterialBindingSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    directMaterialBinding?: HdContainerDataSource | undefined,
    collectionMaterialBindings?: HdVectorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingMaterialBindingSchemaTokens.directMaterialBinding]: directMaterialBinding,
      [UsdImagingMaterialBindingSchemaTokens.collectionMaterialBindings]: collectionMaterialBindings,
    })
  }
}

export namespace UsdImagingMaterialBindingSchema {
  /** UsdImagingMaterialBindingSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _directMaterialBinding: HdContainerDataSource | undefined
    private _collectionMaterialBindings: HdVectorDataSource | undefined
    setDirectMaterialBinding(directMaterialBinding: HdContainerDataSource | undefined): this {
      this._directMaterialBinding = directMaterialBinding
      return this
    }
    setCollectionMaterialBindings(collectionMaterialBindings: HdVectorDataSource | undefined): this {
      this._collectionMaterialBindings = collectionMaterialBindings
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingMaterialBindingSchema.buildRetained(
        this._directMaterialBinding,
        this._collectionMaterialBindings,
      )
    }
  }
}
