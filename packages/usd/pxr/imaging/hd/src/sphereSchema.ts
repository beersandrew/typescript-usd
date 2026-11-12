// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sphereSchema.cpp,
//  pxr/imaging/hd/sphereSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/sphereSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Sphere entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream sphereSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** sphereSchema.h TF_DECLARE_PUBLIC_TOKENS(HdSphereSchemaTokens) */
export const HdSphereSchemaTokens = TfMakeTokens({
  sphere: 'sphere',
  radius: 'radius',
})

export class HdSphereSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** sphereSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdSphereSchema {
    const ds = fromParentContainer?.Get(HdSphereSchemaTokens.sphere)
    return new HdSphereSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getRadius(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdSphereSchemaTokens.radius)
  }

  static getSchemaToken(): TfToken {
    return HdSphereSchemaTokens.sphere
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdSphereSchema._defaultLocator ??= new HdDataSourceLocator(HdSphereSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    radius?: HdDoubleDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdSphereSchemaTokens.radius]: radius,
    })
  }
}

export namespace HdSphereSchema {
  /** HdSphereSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _radius: HdDoubleDataSource | undefined
    setRadius(radius: HdDoubleDataSource | undefined): this {
      this._radius = radius
      return this
    }
    build(): HdContainerDataSource {
      return HdSphereSchema.buildRetained(
        this._radius,
      )
    }
  }
}
