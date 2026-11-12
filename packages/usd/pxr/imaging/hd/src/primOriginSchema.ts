// Ported from OpenUSD 26.11.1: pxr/imaging/hd/primOriginSchema.cpp,
//  pxr/imaging/hd/primOriginSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/primOriginSchema.{h,cpp} (OpenUSD 26.11.1), in
// the style of the codegenTemplates/schemaClass.{h,cpp} output for the
// PrimOrigin entry of pxr/imaging/hd/hdSchemaDefs.py (1546-1558). Custom code
// sections (OriginPath, GetOriginPath) are ported by hand.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdSampledDataSource, type HdTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdSchema } from './schema.ts'

/** primOriginSchema.h TF_DECLARE_PUBLIC_TOKENS(HdPrimOriginSchemaTokens) */
export const HdPrimOriginSchemaTokens = TfMakeTokens({
  primOrigin: 'primOrigin',
  scenePath: 'scenePath',
})

export class HdPrimOriginSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** primOriginSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdPrimOriginSchema {
    const ds = fromParentContainer?.Get(HdPrimOriginSchemaTokens.primOrigin)
    return new HdPrimOriginSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** Extracts SdfPath from container that was added via
   *  OriginPathDataSource. primOriginSchema.cpp:24-38 */
  getOriginPath(name: string): string {
    if (!this._container) {
      return ''
    }
    const ds = this._container.Get(name)
    if (!(ds instanceof HdSampledDataSource)) {
      return ''
    }
    const value = ds.GetValue(0.0)
    if (!(value instanceof HdPrimOriginSchema.OriginPath)) {
      return ''
    }
    return value.getPath()
  }

  // --(END CUSTOM CODE: Schema Methods)--

  static getSchemaToken(): TfToken {
    return HdPrimOriginSchemaTokens.primOrigin
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdPrimOriginSchema._defaultLocator ??= new HdDataSourceLocator(HdPrimOriginSchema.getSchemaToken())
  }

  private static _scenePathLocator: HdDataSourceLocator | undefined
  /** Additional prim-level relative data source locator to locate
   *  scenePath. */
  static getScenePathLocator(): HdDataSourceLocator {
    return HdPrimOriginSchema._scenePathLocator ??= new HdDataSourceLocator(
      HdPrimOriginSchemaTokens.primOrigin, HdPrimOriginSchemaTokens.scenePath)
  }
}

export namespace HdPrimOriginSchema {
  /** Wraps an SdfPath so that it is not affected by the
   *  prefixing scene index. primOriginSchema.h:59-79, .cpp:40-44 */
  export class OriginPath {
    constructor(private readonly _path: string) {}

    getPath(): string { return this._path }

    /** operator== */
    equals(other: OriginPath): boolean {
      return this._path === other._path
    }

    /** operator<< (primOriginSchema.cpp:40-44) */
    toString(): string {
      return `HdPrimOriginSchema::OriginPath(${this._path})`
    }
  }

  export type OriginPathDataSource = HdTypedSampledDataSource<OriginPath>
}
