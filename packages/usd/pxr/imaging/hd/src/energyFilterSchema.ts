// Ported from OpenUSD 26.11.1: pxr/imaging/hd/energyFilterSchema.cpp,
//  pxr/imaging/hd/energyFilterSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/energyFilterSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// a local equivalent of an hdSchemaDefs.py entry (upstream has no EnergyFilter entry) with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream energyFilterSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** energyFilterSchema.h TF_DECLARE_PUBLIC_TOKENS(HdEnergyFilterSchemaTokens) */
export const HdEnergyFilterSchemaTokens = TfMakeTokens({
  energyFilter: 'energyFilter',
  resource: 'resource',
})

export class HdEnergyFilterSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** energyFilterSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdEnergyFilterSchema {
    const ds = fromParentContainer?.Get(HdEnergyFilterSchemaTokens.energyFilter)
    return new HdEnergyFilterSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getResource(): HdMaterialNodeSchema {
    return new HdMaterialNodeSchema(this._getContainerDataSource(HdEnergyFilterSchemaTokens.resource))
  }

  static getSchemaToken(): TfToken {
    return HdEnergyFilterSchemaTokens.energyFilter
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdEnergyFilterSchema._defaultLocator ??= new HdDataSourceLocator(HdEnergyFilterSchema.getSchemaToken())
  }

  private static _resourceLocator: HdDataSourceLocator | undefined
  static getResourceLocator(): HdDataSourceLocator {
    return HdEnergyFilterSchema._resourceLocator ??= HdEnergyFilterSchema.getDefaultLocator().append(HdEnergyFilterSchemaTokens.resource)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    resource?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdEnergyFilterSchemaTokens.resource]: resource,
    })
  }
}

export namespace HdEnergyFilterSchema {
  /** HdEnergyFilterSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _resource: HdContainerDataSource | undefined
    setResource(resource: HdContainerDataSource | undefined): this {
      this._resource = resource
      return this
    }
    build(): HdContainerDataSource {
      return HdEnergyFilterSchema.buildRetained(
        this._resource,
      )
    }
  }
}
