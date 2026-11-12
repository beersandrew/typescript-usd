// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/materialInterfaceParameterSchema.cpp,
//  pxr/imaging/hd/materialInterfaceParameterSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialInterfaceParameterSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialInterfaceParameter entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialInterfaceParameterSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdMaterialInterfaceMappingVectorSchema } from './schemaTypeDefs.ts'

/** materialInterfaceParameterSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialInterfaceParameterSchemaTokens) */
export const HdMaterialInterfaceParameterSchemaTokens = TfMakeTokens({
  displayGroup: 'displayGroup',
  displayName: 'displayName',
  mappings: 'mappings',
})

/**
 * The MaterialInterfaceParameter schema describes a single interface
 * parameter (public UI parameter).
 *
 * An interface parameter defines a vector of mappings to material node
 * parameters. These mappings indicate which material node parameters should
 * be overridden when a value is set on the interface parameter.
 *
 * For example, the following data sources define a public UI "globalVal" that
 * maps to two different node parameters:
 *
 * ds at: material/<renderContext>/interface/parameters/globalVal/
 * mappings/[0]/nodePath = Color_Manipulate
 *
 * ds at: material/<renderContext>/interface/parameters/globalVal/
 * mappings/[0]/inputName = adjustVal
 *
 * ds at: material/<renderContext>/interface/parameters/globalVal/
 * mappings/[1]/nodePath = Color_RetargetLayer
 *
 * ds at: material/<renderContext>/interface/parameters/globalVal/
 * mappings/[1]/inputName = valRemapAmount
 *
 * The above means that the "globalVal" public UI name maps to the following
 * parameter data sources at:
 *
 * ds at: material/<renderContext>/nodes/Color_Manipulate/parameters/
 * adjustVal
 *
 * ds at: material/<renderContext>/nodes/Color_RetargetLayer/
 * parameters/valRemapAmount
 */
export class HdMaterialInterfaceParameterSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /**
   * Optional displayGroup. Intended for GUI organization.
   */
  getDisplayGroup(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialInterfaceParameterSchemaTokens.displayGroup)
  }

  /**
   * Optional displayName. Intended for GUI organization.
   */
  getDisplayName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialInterfaceParameterSchemaTokens.displayName)
  }

  /**
   * Maps this singular interface parameter to a vector of target node
   * parameters. Each mapping target is defined by the InterfaceMappings
   * schema.
   */
  getMappings(): HdMaterialInterfaceMappingVectorSchema {
    return new HdMaterialInterfaceMappingVectorSchema(this._getVectorDataSource(HdMaterialInterfaceParameterSchemaTokens.mappings))
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    displayGroup?: HdTokenDataSource | undefined,
    displayName?: HdTokenDataSource | undefined,
    mappings?: HdVectorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialInterfaceParameterSchemaTokens.displayGroup]: displayGroup,
      [HdMaterialInterfaceParameterSchemaTokens.displayName]: displayName,
      [HdMaterialInterfaceParameterSchemaTokens.mappings]: mappings,
    })
  }
}

export namespace HdMaterialInterfaceParameterSchema {
  /** HdMaterialInterfaceParameterSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _displayGroup: HdTokenDataSource | undefined
    private _displayName: HdTokenDataSource | undefined
    private _mappings: HdVectorDataSource | undefined
    setDisplayGroup(displayGroup: HdTokenDataSource | undefined): this {
      this._displayGroup = displayGroup
      return this
    }
    setDisplayName(displayName: HdTokenDataSource | undefined): this {
      this._displayName = displayName
      return this
    }
    setMappings(mappings: HdVectorDataSource | undefined): this {
      this._mappings = mappings
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialInterfaceParameterSchema.buildRetained(
        this._displayGroup,
        this._displayName,
        this._mappings,
      )
    }
  }
}
