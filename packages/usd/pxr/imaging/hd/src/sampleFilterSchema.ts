// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sampleFilterSchema.cpp,
//  pxr/imaging/hd/sampleFilterSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/sampleFilterSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the SampleFilter entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream sampleFilterSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** sampleFilterSchema.h TF_DECLARE_PUBLIC_TOKENS(HdSampleFilterSchemaTokens) */
export const HdSampleFilterSchemaTokens = TfMakeTokens({
  sampleFilter: 'sampleFilter',
  resource: 'resource',
})

export class HdSampleFilterSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** sampleFilterSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdSampleFilterSchema {
    const ds = fromParentContainer?.Get(HdSampleFilterSchemaTokens.sampleFilter)
    return new HdSampleFilterSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getResource(): HdMaterialNodeSchema {
    return new HdMaterialNodeSchema(this._getContainerDataSource(HdSampleFilterSchemaTokens.resource))
  }

  static getSchemaToken(): TfToken {
    return HdSampleFilterSchemaTokens.sampleFilter
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdSampleFilterSchema._defaultLocator ??= new HdDataSourceLocator(HdSampleFilterSchema.getSchemaToken())
  }

  private static _resourceLocator: HdDataSourceLocator | undefined
  static getResourceLocator(): HdDataSourceLocator {
    return HdSampleFilterSchema._resourceLocator ??= HdSampleFilterSchema.getDefaultLocator().append(HdSampleFilterSchemaTokens.resource)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    resource?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdSampleFilterSchemaTokens.resource]: resource,
    })
  }
}

export namespace HdSampleFilterSchema {
  /** HdSampleFilterSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _resource: HdContainerDataSource | undefined
    setResource(resource: HdContainerDataSource | undefined): this {
      this._resource = resource
      return this
    }
    build(): HdContainerDataSource {
      return HdSampleFilterSchema.buildRetained(
        this._resource,
      )
    }
  }
}
