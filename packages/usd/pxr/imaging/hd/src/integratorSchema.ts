// Ported from OpenUSD 26.11.1: pxr/imaging/hd/integratorSchema.cpp,
//  pxr/imaging/hd/integratorSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/integratorSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Integrator entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream integratorSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** integratorSchema.h TF_DECLARE_PUBLIC_TOKENS(HdIntegratorSchemaTokens) */
export const HdIntegratorSchemaTokens = TfMakeTokens({
  integrator: 'integrator',
  resource: 'resource',
})

export class HdIntegratorSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** integratorSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdIntegratorSchema {
    const ds = fromParentContainer?.Get(HdIntegratorSchemaTokens.integrator)
    return new HdIntegratorSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getResource(): HdMaterialNodeSchema {
    return new HdMaterialNodeSchema(this._getContainerDataSource(HdIntegratorSchemaTokens.resource))
  }

  static getSchemaToken(): TfToken {
    return HdIntegratorSchemaTokens.integrator
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdIntegratorSchema._defaultLocator ??= new HdDataSourceLocator(HdIntegratorSchema.getSchemaToken())
  }

  private static _resourceLocator: HdDataSourceLocator | undefined
  static getResourceLocator(): HdDataSourceLocator {
    return HdIntegratorSchema._resourceLocator ??= HdIntegratorSchema.getDefaultLocator().append(HdIntegratorSchemaTokens.resource)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    resource?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdIntegratorSchemaTokens.resource]: resource,
    })
  }
}

export namespace HdIntegratorSchema {
  /** HdIntegratorSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _resource: HdContainerDataSource | undefined
    setResource(resource: HdContainerDataSource | undefined): this {
      this._resource = resource
      return this
    }
    build(): HdContainerDataSource {
      return HdIntegratorSchema.buildRetained(
        this._resource,
      )
    }
  }
}
