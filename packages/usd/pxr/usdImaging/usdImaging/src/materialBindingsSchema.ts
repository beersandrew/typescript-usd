// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/materialBindingsSchema.cpp,
//  pxr/usdImaging/usdImaging/materialBindingsSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/materialBindingsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialBindings entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialBindingsSchema.{h,cpp}. The entry
// has no members, so there is no BuildRetained or Builder.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, type VectorDataSource as HdVectorDataSource, VectorOfSchemasSchema as HdVectorOfSchemasSchema } from 'typescript-usd/hd'
import { UsdImagingMaterialBindingSchema } from './materialBindingSchema.ts'

// --(BEGIN CUSTOM CODE: Declares)--
/** materialBindingsSchema.h:31-32 `using UsdImagingMaterialBindingVectorSchema =
 *  HdVectorOfSchemasSchema<class UsdImagingMaterialBindingSchema>;` */
export class UsdImagingMaterialBindingVectorSchema
  extends HdVectorOfSchemasSchema<UsdImagingMaterialBindingSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, UsdImagingMaterialBindingSchema) }
}
// --(END CUSTOM CODE: Declares)--

/** materialBindingsSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingMaterialBindingsSchemaTokens) */
export const UsdImagingMaterialBindingsSchemaTokens = TfMakeTokens({
  usdMaterialBindings: 'usdMaterialBindings',
  allPurpose: '',
})

/**
 * The UsdImagingMaterialBindingsSchema specifies a container for all the
 * material bindings declared on a prim. The material binding purpose serves
 * as the key, with the value being a vector of
 * UsdImagingMaterialBindingSchema. While one entry (element) would suffice
 * for a prim's material bindings opinion, we use a vector for aggregating
 * ancestor material bindings to model the inheritance semantics of
 * UsdShadeMaterialBindingAPI.
 */
export class UsdImagingMaterialBindingsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** materialBindingsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingMaterialBindingsSchema {
    const ds = fromParentContainer?.Get(UsdImagingMaterialBindingsSchemaTokens.usdMaterialBindings)
    return new UsdImagingMaterialBindingsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** materialBindingsSchema.cpp:33-41. Returns the purposes for which
   *  bindings may be available. This API is preferable to
   *  schema.GetContainer()->GetNames(). */
  getPurposes(): TfToken[] {
    const h = this.getContainer()
    if (h) {
      return h.getNames() as TfToken[]
    }
    return []
  }

  /** materialBindingsSchema.cpp:43-58. Returns the bindings for the given
   *  purpose; without an argument, the bindings for 'allPurpose'. */
  getMaterialBindings(purpose: string = UsdImagingMaterialBindingsSchemaTokens.allPurpose): UsdImagingMaterialBindingVectorSchema {
    return new UsdImagingMaterialBindingVectorSchema(this._getVectorDataSource(purpose))
  }

  // --(END CUSTOM CODE: Schema Methods)--

  static getSchemaToken(): TfToken {
    return UsdImagingMaterialBindingsSchemaTokens.usdMaterialBindings
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingMaterialBindingsSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingMaterialBindingsSchema.getSchemaToken())
  }
}
