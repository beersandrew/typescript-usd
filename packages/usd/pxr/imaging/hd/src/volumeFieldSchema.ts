// Ported from OpenUSD 26.11.1: pxr/imaging/hd/volumeFieldSchema.cpp,
//  pxr/imaging/hd/volumeFieldSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/volumeFieldSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the VolumeField entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream volumeFieldSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdAssetPathDataSource, HdIntDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** volumeFieldSchema.h TF_DECLARE_PUBLIC_TOKENS(HdVolumeFieldSchemaTokens) */
export const HdVolumeFieldSchemaTokens = TfMakeTokens({
  volumeField: 'volumeField',
  filePath: 'filePath',
  fieldName: 'fieldName',
  fieldIndex: 'fieldIndex',
  fieldDataType: 'fieldDataType',
  vectorDataRoleHint: 'vectorDataRoleHint',
})

export class HdVolumeFieldSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** volumeFieldSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdVolumeFieldSchema {
    const ds = fromParentContainer?.Get(HdVolumeFieldSchemaTokens.volumeField)
    return new HdVolumeFieldSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getFilePath(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(HdVolumeFieldSchemaTokens.filePath)
  }

  getFieldName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdVolumeFieldSchemaTokens.fieldName)
  }

  getFieldIndex(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdVolumeFieldSchemaTokens.fieldIndex)
  }

  getFieldDataType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdVolumeFieldSchemaTokens.fieldDataType)
  }

  getVectorDataRoleHint(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdVolumeFieldSchemaTokens.vectorDataRoleHint)
  }

  static getSchemaToken(): TfToken {
    return HdVolumeFieldSchemaTokens.volumeField
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdVolumeFieldSchema._defaultLocator ??= new HdDataSourceLocator(HdVolumeFieldSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    filePath?: HdAssetPathDataSource | undefined,
    fieldName?: HdTokenDataSource | undefined,
    fieldIndex?: HdIntDataSource | undefined,
    fieldDataType?: HdTokenDataSource | undefined,
    vectorDataRoleHint?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdVolumeFieldSchemaTokens.filePath]: filePath,
      [HdVolumeFieldSchemaTokens.fieldName]: fieldName,
      [HdVolumeFieldSchemaTokens.fieldIndex]: fieldIndex,
      [HdVolumeFieldSchemaTokens.fieldDataType]: fieldDataType,
      [HdVolumeFieldSchemaTokens.vectorDataRoleHint]: vectorDataRoleHint,
    })
  }
}

export namespace HdVolumeFieldSchema {
  /** HdVolumeFieldSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _filePath: HdAssetPathDataSource | undefined
    private _fieldName: HdTokenDataSource | undefined
    private _fieldIndex: HdIntDataSource | undefined
    private _fieldDataType: HdTokenDataSource | undefined
    private _vectorDataRoleHint: HdTokenDataSource | undefined
    setFilePath(filePath: HdAssetPathDataSource | undefined): this {
      this._filePath = filePath
      return this
    }
    setFieldName(fieldName: HdTokenDataSource | undefined): this {
      this._fieldName = fieldName
      return this
    }
    setFieldIndex(fieldIndex: HdIntDataSource | undefined): this {
      this._fieldIndex = fieldIndex
      return this
    }
    setFieldDataType(fieldDataType: HdTokenDataSource | undefined): this {
      this._fieldDataType = fieldDataType
      return this
    }
    setVectorDataRoleHint(vectorDataRoleHint: HdTokenDataSource | undefined): this {
      this._vectorDataRoleHint = vectorDataRoleHint
      return this
    }
    build(): HdContainerDataSource {
      return HdVolumeFieldSchema.buildRetained(
        this._filePath,
        this._fieldName,
        this._fieldIndex,
        this._fieldDataType,
        this._vectorDataRoleHint,
      )
    }
  }
}
