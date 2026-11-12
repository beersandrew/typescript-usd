// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instanceProxySchema.cpp,
//  pxr/imaging/hd/instanceProxySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instanceProxySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the InstanceProxy entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.
// A schema for marking a prim as an instance proxy (hdSchemaDefs.py:945-970).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import type { HdVectorDataSource } from './dataSource.ts'
import { HdInstanceVectorSchema } from './schemaTypeDefs.ts'

/** instanceProxySchema.h TF_DECLARE_PUBLIC_TOKENS(HdInstanceProxySchemaTokens) */
export const HdInstanceProxySchemaTokens = TfMakeTokens({
  instanceProxy: 'instanceProxy',
  pathToPrimInPrototype: 'pathToPrimInPrototype',
  instancingContext: 'instancingContext',
})

export class HdInstanceProxySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** instanceProxySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdInstanceProxySchema {
    const ds = fromParentContainer?.Get(HdInstanceProxySchemaTokens.instanceProxy)
    return new HdInstanceProxySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** The path to the prim in the propagated prototype
   *  hierarchy that this instance proxy prim corresponds to.
   *  This is modeled after the UsdPrim::GetPrimInPrototype() API. */
  getPathToPrimInPrototype(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdInstanceProxySchemaTokens.pathToPrimInPrototype)
  }

  /** Starting from the outer most, lists the instancer,
   *  prototype index and instance index for each level of instancing
   *  leading to this instance proxy prim. */
  getInstancingContext(): HdInstanceVectorSchema {
    return new HdInstanceVectorSchema(this._getVectorDataSource(HdInstanceProxySchemaTokens.instancingContext))
  }

  static getSchemaToken(): TfToken {
    return HdInstanceProxySchemaTokens.instanceProxy
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdInstanceProxySchema._defaultLocator ??= new HdDataSourceLocator(HdInstanceProxySchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    pathToPrimInPrototype?: HdPathDataSource | undefined,
    instancingContext?: HdVectorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdInstanceProxySchemaTokens.pathToPrimInPrototype]: pathToPrimInPrototype,
      [HdInstanceProxySchemaTokens.instancingContext]: instancingContext,
    })
  }
}

export namespace HdInstanceProxySchema {
  /** HdInstanceProxySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _pathToPrimInPrototype: HdPathDataSource | undefined
    private _instancingContext: HdVectorDataSource | undefined
    setPathToPrimInPrototype(pathToPrimInPrototype: HdPathDataSource | undefined): this {
      this._pathToPrimInPrototype = pathToPrimInPrototype
      return this
    }
    setInstancingContext(instancingContext: HdVectorDataSource | undefined): this {
      this._instancingContext = instancingContext
      return this
    }
    build(): HdContainerDataSource {
      return HdInstanceProxySchema.buildRetained(
        this._pathToPrimInPrototype,
        this._instancingContext,
      )
    }
  }
}
