// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rendererCreateArgsSchema.cpp,
//  pxr/imaging/hd/rendererCreateArgsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py, pxr/imaging/hd/rendererCreateArgs.h
// Copyright 2023, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/rendererCreateArgsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the RendererCreateArgs entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.
//
// pxr/imaging/hd/rendererCreateArgs.h only declares the deprecated alias
// HdRendererCreateArgs = HdRendererCreateArgsSchema; it is not ported.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdBoolDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdSampledDataSourceContainerSchema } from './schemaTypeDefs.ts'

/** rendererCreateArgsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdRendererCreateArgsSchemaTokens) */
export const HdRendererCreateArgsSchemaTokens = TfMakeTokens({
  rendererCreateArgs: 'rendererCreateArgs',
  gpuEnabled: 'gpuEnabled',
  drivers: 'drivers',
  hgi: 'hgi',
})

/**
 * Arguments to HdRendererPlugin::IsSupported and CreateRenderer.
 */
export class HdRendererCreateArgsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** rendererCreateArgsSchema.cpp:98-108 GetFromParent */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdRendererCreateArgsSchema {
    const ds = fromParentContainer?.Get(HdRendererCreateArgsSchemaTokens.rendererCreateArgs)
    return new HdRendererCreateArgsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** rendererCreateArgsSchema.cpp:35-40. Is a GPU available. */
  getGpuEnabled(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRendererCreateArgsSchemaTokens.gpuEnabled)
  }

  /** rendererCreateArgsSchema.cpp:42-47. Drivers such as Hgi that renderer can use. */
  getDrivers(): HdSampledDataSourceContainerSchema {
    return new HdSampledDataSourceContainerSchema(
      this._getContainerDataSource(HdRendererCreateArgsSchemaTokens.drivers))
  }

  /** rendererCreateArgsSchema.cpp:110-115 */
  static getSchemaToken(): TfToken {
    return HdRendererCreateArgsSchemaTokens.rendererCreateArgs
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** rendererCreateArgsSchema.cpp:117-123 */
  static getDefaultLocator(): HdDataSourceLocator {
    return HdRendererCreateArgsSchema._defaultLocator ??= new HdDataSourceLocator(HdRendererCreateArgsSchema.getSchemaToken())
  }

  private static _gpuEnabledLocator: HdDataSourceLocator | undefined
  /** rendererCreateArgsSchema.cpp:125-133 */
  static getGpuEnabledLocator(): HdDataSourceLocator {
    return HdRendererCreateArgsSchema._gpuEnabledLocator ??= HdRendererCreateArgsSchema.getDefaultLocator().append(HdRendererCreateArgsSchemaTokens.gpuEnabled)
  }

  private static _driversLocator: HdDataSourceLocator | undefined
  /** rendererCreateArgsSchema.cpp:135-143 */
  static getDriversLocator(): HdDataSourceLocator {
    return HdRendererCreateArgsSchema._driversLocator ??= HdRendererCreateArgsSchema.getDefaultLocator().append(HdRendererCreateArgsSchemaTokens.drivers)
  }

  /** @deprecated Use Builder instead. (rendererCreateArgsSchema.cpp:49-71) */
  static buildRetained(
    gpuEnabled?: HdBoolDataSource | undefined,
    drivers?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdRendererCreateArgsSchemaTokens.gpuEnabled]: gpuEnabled,
      [HdRendererCreateArgsSchemaTokens.drivers]: drivers,
    })
  }
}

export namespace HdRendererCreateArgsSchema {
  /** HdRendererCreateArgsSchema::Builder (rendererCreateArgsSchema.cpp:73-96) */
  export class Builder {
    private _gpuEnabled: HdBoolDataSource | undefined
    private _drivers: HdContainerDataSource | undefined
    setGpuEnabled(gpuEnabled: HdBoolDataSource | undefined): this {
      this._gpuEnabled = gpuEnabled
      return this
    }
    setDrivers(drivers: HdContainerDataSource | undefined): this {
      this._drivers = drivers
      return this
    }
    build(): HdContainerDataSource {
      return HdRendererCreateArgsSchema.buildRetained(
        this._gpuEnabled,
        this._drivers,
      )
    }
  }
}
