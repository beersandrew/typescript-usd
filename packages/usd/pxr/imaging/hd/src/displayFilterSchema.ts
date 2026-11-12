// Ported from OpenUSD 26.11.1: pxr/imaging/hd/displayFilterSchema.cpp,
//  pxr/imaging/hd/displayFilterSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/displayFilterSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the DisplayFilter entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream displayFilterSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** displayFilterSchema.h TF_DECLARE_PUBLIC_TOKENS(HdDisplayFilterSchemaTokens) */
export const HdDisplayFilterSchemaTokens = TfMakeTokens({
  displayFilter: 'displayFilter',
  resource: 'resource',
})

export class HdDisplayFilterSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** displayFilterSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdDisplayFilterSchema {
    const ds = fromParentContainer?.Get(HdDisplayFilterSchemaTokens.displayFilter)
    return new HdDisplayFilterSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getResource(): HdMaterialNodeSchema {
    return new HdMaterialNodeSchema(this._getContainerDataSource(HdDisplayFilterSchemaTokens.resource))
  }

  static getSchemaToken(): TfToken {
    return HdDisplayFilterSchemaTokens.displayFilter
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdDisplayFilterSchema._defaultLocator ??= new HdDataSourceLocator(HdDisplayFilterSchema.getSchemaToken())
  }

  private static _resourceLocator: HdDataSourceLocator | undefined
  static getResourceLocator(): HdDataSourceLocator {
    return HdDisplayFilterSchema._resourceLocator ??= HdDisplayFilterSchema.getDefaultLocator().append(HdDisplayFilterSchemaTokens.resource)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    resource?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdDisplayFilterSchemaTokens.resource]: resource,
    })
  }
}

export namespace HdDisplayFilterSchema {
  /** HdDisplayFilterSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _resource: HdContainerDataSource | undefined
    setResource(resource: HdContainerDataSource | undefined): this {
      this._resource = resource
      return this
    }
    build(): HdContainerDataSource {
      return HdDisplayFilterSchema.buildRetained(
        this._resource,
      )
    }
  }
}
