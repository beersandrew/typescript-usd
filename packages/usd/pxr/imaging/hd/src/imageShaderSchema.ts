// Ported from OpenUSD 26.11.1: pxr/imaging/hd/imageShaderSchema.cpp,
//  pxr/imaging/hd/imageShaderSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/imageShaderSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the ImageShader entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream imageShaderSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdIntDataSource, HdStringDataSource } from './dataSourceTypeDefs.ts'
import { HdMaterialNetworkSchema } from './materialNetworkSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdSampledDataSourceContainerSchema } from './schemaTypeDefs.ts'

/** imageShaderSchema.h TF_DECLARE_PUBLIC_TOKENS(HdImageShaderSchemaTokens) */
export const HdImageShaderSchemaTokens = TfMakeTokens({
  imageShader: 'imageShader',
  enabled: 'enabled',
  priority: 'priority',
  filePath: 'filePath',
  constants: 'constants',
  materialNetwork: 'materialNetwork',
})

export class HdImageShaderSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** imageShaderSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdImageShaderSchema {
    const ds = fromParentContainer?.Get(HdImageShaderSchemaTokens.imageShader)
    return new HdImageShaderSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getEnabled(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdImageShaderSchemaTokens.enabled)
  }

  getPriority(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdImageShaderSchemaTokens.priority)
  }

  getFilePath(): HdStringDataSource | undefined {
    return this._getTypedDataSource<HdStringDataSource>(HdImageShaderSchemaTokens.filePath)
  }

  getConstants(): HdSampledDataSourceContainerSchema {
    return new HdSampledDataSourceContainerSchema(this._getContainerDataSource(HdImageShaderSchemaTokens.constants))
  }

  getMaterialNetwork(): HdMaterialNetworkSchema {
    return new HdMaterialNetworkSchema(this._getContainerDataSource(HdImageShaderSchemaTokens.materialNetwork))
  }

  static getSchemaToken(): TfToken {
    return HdImageShaderSchemaTokens.imageShader
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdImageShaderSchema._defaultLocator ??= new HdDataSourceLocator(HdImageShaderSchema.getSchemaToken())
  }

  private static _enabledLocator: HdDataSourceLocator | undefined
  static getEnabledLocator(): HdDataSourceLocator {
    return HdImageShaderSchema._enabledLocator ??= HdImageShaderSchema.getDefaultLocator().append(HdImageShaderSchemaTokens.enabled)
  }

  private static _priorityLocator: HdDataSourceLocator | undefined
  static getPriorityLocator(): HdDataSourceLocator {
    return HdImageShaderSchema._priorityLocator ??= HdImageShaderSchema.getDefaultLocator().append(HdImageShaderSchemaTokens.priority)
  }

  private static _filePathLocator: HdDataSourceLocator | undefined
  static getFilePathLocator(): HdDataSourceLocator {
    return HdImageShaderSchema._filePathLocator ??= HdImageShaderSchema.getDefaultLocator().append(HdImageShaderSchemaTokens.filePath)
  }

  private static _constantsLocator: HdDataSourceLocator | undefined
  static getConstantsLocator(): HdDataSourceLocator {
    return HdImageShaderSchema._constantsLocator ??= HdImageShaderSchema.getDefaultLocator().append(HdImageShaderSchemaTokens.constants)
  }

  private static _materialNetworkLocator: HdDataSourceLocator | undefined
  static getMaterialNetworkLocator(): HdDataSourceLocator {
    return HdImageShaderSchema._materialNetworkLocator ??= HdImageShaderSchema.getDefaultLocator().append(HdImageShaderSchemaTokens.materialNetwork)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    enabled?: HdBoolDataSource | undefined,
    priority?: HdIntDataSource | undefined,
    filePath?: HdStringDataSource | undefined,
    constants?: HdContainerDataSource | undefined,
    materialNetwork?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdImageShaderSchemaTokens.enabled]: enabled,
      [HdImageShaderSchemaTokens.priority]: priority,
      [HdImageShaderSchemaTokens.filePath]: filePath,
      [HdImageShaderSchemaTokens.constants]: constants,
      [HdImageShaderSchemaTokens.materialNetwork]: materialNetwork,
    })
  }
}

export namespace HdImageShaderSchema {
  /** HdImageShaderSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _enabled: HdBoolDataSource | undefined
    private _priority: HdIntDataSource | undefined
    private _filePath: HdStringDataSource | undefined
    private _constants: HdContainerDataSource | undefined
    private _materialNetwork: HdContainerDataSource | undefined
    setEnabled(enabled: HdBoolDataSource | undefined): this {
      this._enabled = enabled
      return this
    }
    setPriority(priority: HdIntDataSource | undefined): this {
      this._priority = priority
      return this
    }
    setFilePath(filePath: HdStringDataSource | undefined): this {
      this._filePath = filePath
      return this
    }
    setConstants(constants: HdContainerDataSource | undefined): this {
      this._constants = constants
      return this
    }
    setMaterialNetwork(materialNetwork: HdContainerDataSource | undefined): this {
      this._materialNetwork = materialNetwork
      return this
    }
    build(): HdContainerDataSource {
      return HdImageShaderSchema.buildRetained(
        this._enabled,
        this._priority,
        this._filePath,
        this._constants,
        this._materialNetwork,
      )
    }
  }
}
