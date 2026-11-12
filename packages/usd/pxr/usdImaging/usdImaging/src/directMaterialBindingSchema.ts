// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/directMaterialBindingSchema.cpp,
//  pxr/usdImaging/usdImaging/directMaterialBindingSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/directMaterialBindingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the DirectMaterialBinding entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type PathDataSource as HdPathDataSource, type TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'

/** directMaterialBindingSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingDirectMaterialBindingSchemaTokens) */
export const UsdImagingDirectMaterialBindingSchemaTokens = TfMakeTokens({
  directMaterialBinding: 'directMaterialBinding',
  materialPath: 'materialPath',
  bindingStrength: 'bindingStrength',
})

export class UsdImagingDirectMaterialBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** directMaterialBindingSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingDirectMaterialBindingSchema {
    const ds = fromParentContainer?.Get(UsdImagingDirectMaterialBindingSchemaTokens.directMaterialBinding)
    return new UsdImagingDirectMaterialBindingSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getMaterialPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingDirectMaterialBindingSchemaTokens.materialPath)
  }

  getBindingStrength(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingDirectMaterialBindingSchemaTokens.bindingStrength)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingDirectMaterialBindingSchemaTokens.directMaterialBinding
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingDirectMaterialBindingSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingDirectMaterialBindingSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    materialPath?: HdPathDataSource | undefined,
    bindingStrength?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingDirectMaterialBindingSchemaTokens.materialPath]: materialPath,
      [UsdImagingDirectMaterialBindingSchemaTokens.bindingStrength]: bindingStrength,
    })
  }
}

export namespace UsdImagingDirectMaterialBindingSchema {
  /** UsdImagingDirectMaterialBindingSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _materialPath: HdPathDataSource | undefined
    private _bindingStrength: HdTokenDataSource | undefined
    setMaterialPath(materialPath: HdPathDataSource | undefined): this {
      this._materialPath = materialPath
      return this
    }
    setBindingStrength(bindingStrength: HdTokenDataSource | undefined): this {
      this._bindingStrength = bindingStrength
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingDirectMaterialBindingSchema.buildRetained(
        this._materialPath,
        this._bindingStrength,
      )
    }
  }
}
