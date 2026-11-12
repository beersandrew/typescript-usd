// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialInterfaceSchema.cpp,
//  pxr/imaging/hd/materialInterfaceSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialInterfaceSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialInterface entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialInterfaceSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenArrayDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdMaterialInterfaceParameterContainerSchema } from './schemaTypeDefs.ts'

/** materialInterfaceSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialInterfaceSchemaTokens) */
export const HdMaterialInterfaceSchemaTokens = TfMakeTokens({
  parameters: 'parameters',
  parameterOrder: 'parameterOrder',
})

/**
 * The MaterialInterface schema describes a material's interface parameters,
 * also known as public UI parameters.
 */
export class HdMaterialInterfaceSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /**
   * A container for all the material's interface parameters.
   */
  getParameters(): HdMaterialInterfaceParameterContainerSchema {
    return new HdMaterialInterfaceParameterContainerSchema(this._getContainerDataSource(HdMaterialInterfaceSchemaTokens.parameters))
  }

  /**
   * Provides the intended order of the interface parameters for UI purposes.
   * Any member of 'parameters' that is not found in this list can come after
   * all listed members.
   *
   * The order of display groups is implicitly encoded. As this list is
   * traversed, display groups are ordered by first encounter.
   */
  getParameterOrder(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(HdMaterialInterfaceSchemaTokens.parameterOrder)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    parameters?: HdContainerDataSource | undefined,
    parameterOrder?: HdTokenArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialInterfaceSchemaTokens.parameters]: parameters,
      [HdMaterialInterfaceSchemaTokens.parameterOrder]: parameterOrder,
    })
  }
}

export namespace HdMaterialInterfaceSchema {
  /** HdMaterialInterfaceSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _parameters: HdContainerDataSource | undefined
    private _parameterOrder: HdTokenArrayDataSource | undefined
    setParameters(parameters: HdContainerDataSource | undefined): this {
      this._parameters = parameters
      return this
    }
    setParameterOrder(parameterOrder: HdTokenArrayDataSource | undefined): this {
      this._parameterOrder = parameterOrder
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialInterfaceSchema.buildRetained(
        this._parameters,
        this._parameterOrder,
      )
    }
  }
}
