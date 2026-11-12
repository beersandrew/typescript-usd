// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/materialInterfaceMappingSchema.cpp,
//  pxr/imaging/hd/materialInterfaceMappingSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialInterfaceMappingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialInterfaceMapping entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialInterfaceMappingSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** materialInterfaceMappingSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialInterfaceMappingSchemaTokens) */
export const HdMaterialInterfaceMappingSchemaTokens = TfMakeTokens({
  nodePath: 'nodePath',
  inputName: 'inputName',
})

/**
 * The MaterialInterfaceMapping schema identifies a material node parameter
 * using its two members 'nodePath' and 'inputName'.
 *
 * For example, if we are looking at some material network at
 * material/<renderContext>/... and we have a mapping target defined by the
 * following data sources:
 *
 * ds at: material/<renderContext>/.../nodePath = Color_Manipulate
 *
 * ds at: material/<renderContext>/.../inputName = adjustVal
 *
 * The above defines a mapping target to the material node parameter under
 * that material network, eg:
 *
 * ds at: material/<renderContext>/nodes/Color_Manipulate/parameters/
 * adjustVal
 */
export class HdMaterialInterfaceMappingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  getNodePath(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialInterfaceMappingSchemaTokens.nodePath)
  }

  getInputName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialInterfaceMappingSchemaTokens.inputName)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    nodePath?: HdTokenDataSource | undefined,
    inputName?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialInterfaceMappingSchemaTokens.nodePath]: nodePath,
      [HdMaterialInterfaceMappingSchemaTokens.inputName]: inputName,
    })
  }
}

export namespace HdMaterialInterfaceMappingSchema {
  /** HdMaterialInterfaceMappingSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _nodePath: HdTokenDataSource | undefined
    private _inputName: HdTokenDataSource | undefined
    setNodePath(nodePath: HdTokenDataSource | undefined): this {
      this._nodePath = nodePath
      return this
    }
    setInputName(inputName: HdTokenDataSource | undefined): this {
      this._inputName = inputName
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialInterfaceMappingSchema.buildRetained(
        this._nodePath,
        this._inputName,
      )
    }
  }
}
