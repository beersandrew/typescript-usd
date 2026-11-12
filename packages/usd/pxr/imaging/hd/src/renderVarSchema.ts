// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderVarSchema.cpp,
//  pxr/imaging/hd/renderVarSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderVarSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the RenderVar entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream renderVarSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** renderVarSchema.h TF_DECLARE_PUBLIC_TOKENS(HdRenderVarSchemaTokens) */
export const HdRenderVarSchemaTokens = TfMakeTokens({
  renderVar: 'renderVar',
  path: 'path',
  dataType: 'dataType',
  sourceName: 'sourceName',
  sourceType: 'sourceType',
  namespacedSettings: 'namespacedSettings',
})

export class HdRenderVarSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** renderVarSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdRenderVarSchema {
    const ds = fromParentContainer?.Get(HdRenderVarSchemaTokens.renderVar)
    return new HdRenderVarSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdRenderVarSchemaTokens.path)
  }

  getDataType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderVarSchemaTokens.dataType)
  }

  getSourceName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderVarSchemaTokens.sourceName)
  }

  getSourceType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderVarSchemaTokens.sourceType)
  }

  getNamespacedSettings(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(HdRenderVarSchemaTokens.namespacedSettings)
  }

  static getSchemaToken(): TfToken {
    return HdRenderVarSchemaTokens.renderVar
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdRenderVarSchema._defaultLocator ??= new HdDataSourceLocator(HdRenderVarSchema.getSchemaToken())
  }

  private static _namespacedSettingsLocator: HdDataSourceLocator | undefined
  static getNamespacedSettingsLocator(): HdDataSourceLocator {
    return HdRenderVarSchema._namespacedSettingsLocator ??= HdRenderVarSchema.getDefaultLocator().append(HdRenderVarSchemaTokens.namespacedSettings)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    path?: HdPathDataSource | undefined,
    dataType?: HdTokenDataSource | undefined,
    sourceName?: HdTokenDataSource | undefined,
    sourceType?: HdTokenDataSource | undefined,
    namespacedSettings?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdRenderVarSchemaTokens.path]: path,
      [HdRenderVarSchemaTokens.dataType]: dataType,
      [HdRenderVarSchemaTokens.sourceName]: sourceName,
      [HdRenderVarSchemaTokens.sourceType]: sourceType,
      [HdRenderVarSchemaTokens.namespacedSettings]: namespacedSettings,
    })
  }
}

export namespace HdRenderVarSchema {
  /** HdRenderVarSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _path: HdPathDataSource | undefined
    private _dataType: HdTokenDataSource | undefined
    private _sourceName: HdTokenDataSource | undefined
    private _sourceType: HdTokenDataSource | undefined
    private _namespacedSettings: HdContainerDataSource | undefined
    setPath(path: HdPathDataSource | undefined): this {
      this._path = path
      return this
    }
    setDataType(dataType: HdTokenDataSource | undefined): this {
      this._dataType = dataType
      return this
    }
    setSourceName(sourceName: HdTokenDataSource | undefined): this {
      this._sourceName = sourceName
      return this
    }
    setSourceType(sourceType: HdTokenDataSource | undefined): this {
      this._sourceType = sourceType
      return this
    }
    setNamespacedSettings(namespacedSettings: HdContainerDataSource | undefined): this {
      this._namespacedSettings = namespacedSettings
      return this
    }
    build(): HdContainerDataSource {
      return HdRenderVarSchema.buildRetained(
        this._path,
        this._dataType,
        this._sourceName,
        this._sourceType,
        this._namespacedSettings,
      )
    }
  }
}
